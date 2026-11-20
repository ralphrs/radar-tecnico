// ArchLandscape, abas extras (pedido de 19/11, 23h02, e adendos das 23h09 e 23h10): Languages e Other Tools são a mesma
// máquina do Landscape com `aba` ("linguagens", "outras") no doc da tecnologia e na categoria (tabela Landscape.ABAS).
// Regra pura (Landscape.abaDe), hashes e o voltar (Arch), lista leve separando as abas, Admin gravando a aba e recusando
// categoria de outra aba, o cron de coleta mantendo a aba, Other Tools sem notícias (coleta e detalhe), filtros e
// contagens por aba e o limite contando todas. D1 em SQLite do Node, fetch falso.
import test from "node:test";
import assert from "node:assert/strict";
import { semearLandscape, rodadaLandscape, rotaLandscape, rotaAdminLandscape, escolherCategoria, CATEGORIAS_INICIAIS, SQL_LEVE } from "../src/landscape.js";
import { d1Falso, espelhoFalso } from "./d1-falso.mjs";
import { REPOS, commits, releases, linguagens, link, buscaIssues, buscaHn, itemHn, readme, resposta } from "./fixtures-landscape.mjs";
import "../public/landscape.js";
import "../public/arch.js";

const L = globalThis.Landscape;
const A = globalThis.Arch;
const AGORA = Date.parse("2026-11-19T23:10:00Z");
const ADMIN = { email: "admin@teste.dev", admin: true, secoes: null };
const CONVIDADO = { email: "convidado@teste.dev", admin: false, secoes: ["tech"] };
const req = (metodo, corpo) => new Request("https://x/api", { method: metodo, headers: { "content-type": "application/json" }, body: corpo == null ? undefined : JSON.stringify(corpo) });
const corpoDe = async (r) => ({ status: r.status, j: await r.json() });
const docDe = (env, id) => { const r = env.DB.db.prepare("SELECT data FROM docs WHERE collection = 'landscape' AND id = ?").get(id); return r ? JSON.parse(r.data) : null; };
const catsDe = (env) => JSON.parse(env.DB.db.prepare("SELECT data FROM docs WHERE collection = 'meta' AND id = 'landscape-categorias'").get().data).categorias;
const FINANCAS = { id: "financas", nome: "Finanças e investimentos", aba: "outras", subcategorias: [{ id: "bolsa", nome: "Acompanhamento de bolsa" }] };
const BACKEND = { id: "back-end", nome: "Back-end", aba: "linguagens", subcategorias: [{ id: "linguagens", nome: "Linguagens" }, { id: "frameworks", nome: "Frameworks" }] };

// Banco com a semente (7 de Tools) e a categoria de Other Tools gravada pela rota de categorias, como a tela faz
async function montar() {
  const env = { DB: d1Falso(), GITHUB_TOKEN: "t" };
  const dep = espelhoFalso();
  await semearLandscape(env, AGORA);
  const r = await rotaAdminLandscape(req("PUT", { categorias: [...CATEGORIAS_INICIAIS, FINANCAS, BACKEND] }), env, ADMIN, "categorias", "", dep);
  assert.equal(r.status, 200, await r.clone().text());
  return { env, dep };
}

// ---------- regra pura ----------
test("abaDe: id da tabela de abas; sem o campo ou com valor fora dela, Tools", () => {
  assert.equal(L.abaDe({ aba: "outras" }), "outras");
  assert.equal(L.abaDe({ aba: "linguagens" }), "linguagens");
  for (const d of [{}, { aba: "tools" }, { aba: "Outras" }, { aba: "other" }, { aba: "languages" }, { aba: "" }, { aba: null }, { aba: 1 }, null, undefined, "outras", []])
    assert.equal(L.abaDe(d), "tools", JSON.stringify(d));
  assert.equal(L.nomeAba("outras"), "Other Tools"); assert.equal(L.nomeAba("linguagens"), "Languages"); assert.equal(L.nomeAba("tools"), "Tools"); assert.equal(L.nomeAba("x"), "Tools");
  // a tabela: id, rótulo e hash de cada aba, na ordem da página (Cloud entra depois de Tools)
  assert.deepEqual(L.ABAS.map((a) => [a.id, a.rotulo, a.hash]), [["tools", "Tools", "tools"], ["linguagens", "Languages", "languages"], ["outras", "Other Tools", "other"]]);
  assert.equal(L.abaPorId("linguagens").titulo, "Linguagens e frameworks");
  assert.equal(L.abaPorId("linguagens").subtitulo, "linguagens e frameworks por tipo de uso");
  assert.equal(L.abaPorId("outras").vazio, "Nenhuma ferramenta aqui ainda.");
  assert.equal(L.abaPorHash("languages").id, "linguagens"); assert.equal(L.abaPorHash("x").id, "tools");
  // notícias: só Other Tools fica sem
  assert.deepEqual(L.ABAS.map((a) => a.noticias), [true, true, false]);
  assert.equal(L.temNoticias({ aba: "outras" }), false); assert.equal(L.temNoticias({ aba: "linguagens" }), true); assert.equal(L.temNoticias({}), true);
  assert.deepEqual(L.campoAba("tools"), {}); assert.deepEqual(L.campoAba("linguagens"), { aba: "linguagens" }); assert.deepEqual(L.campoAba("lixo"), {});
  // validarAba (corpo do Admin): undefined não mexe, vazio é Tools, "outras" grava, o resto é erro
  assert.deepEqual(L.validarAba(undefined), { mexe: false });
  assert.deepEqual(L.validarAba(""), { mexe: true, aba: "tools" });
  assert.deepEqual(L.validarAba(null), { mexe: true, aba: "tools" });
  assert.deepEqual(L.validarAba("outras"), { mexe: true, aba: "outras" });
  assert.deepEqual(L.validarAba("linguagens"), { mexe: true, aba: "linguagens" });
  assert.deepEqual(L.validarAba("tools"), { mexe: true, aba: "tools" });
  for (const v of ["other", "languages", "Outras", 1, true, ["outras"]]) assert.ok(L.validarAba(v).erro, JSON.stringify(v));
  // categoria da aba
  assert.ok(L.categoriaDaAba({ id: "a", nome: "A" }, "tools").ok);
  assert.ok(L.categoriaDaAba(FINANCAS, "outras").ok);
  assert.match(L.categoriaDaAba(FINANCAS, "tools").erro, /Finanças e investimentos é da aba Other Tools.*aba Tools/);
  assert.match(L.categoriaDaAba({ id: "dados", nome: "Dados e coleta" }, "outras").erro, /aba Tools.*aba Other Tools/);
  assert.ok(L.categoriaDaAba(null, "tools").erro);
  // validarCategorias guarda só aba: "outras"
  const v = L.validarCategorias({ categorias: [{ nome: "Um", aba: "outras", subcategorias: [] }, { nome: "Dois", aba: "tools", subcategorias: [] }, { nome: "Três", aba: "lixo", subcategorias: [] }, { nome: "Quatro", aba: "linguagens", subcategorias: [] }] });
  assert.deepEqual(v.categorias.map((c) => c.aba), ["outras", undefined, undefined, "linguagens"]);
  assert.deepEqual(L.daAba(v.categorias, "linguagens").map((c) => c.id), ["quatro"]);
  assert.deepEqual(L.daAba(v.categorias, "outras").map((c) => c.id), ["um"]);
  assert.deepEqual(L.daAba(v.categorias, "tools").map((c) => c.id), ["dois", "tres"]);
});

test("escolherCategoria: só categoria da aba; a nova nasce na aba pedida", () => {
  const cats = [...CATEGORIAS_INICIAIS, FINANCAS];
  assert.equal(escolherCategoria(cats, { categoria: "financas", subcategoria: "bolsa" }, "outras").cid, "financas");
  assert.match(escolherCategoria(cats, { categoria: "financas", subcategoria: "bolsa" }, "tools").erro, /aba Other Tools/);
  assert.match(escolherCategoria(cats, { categoria: "dados", subcategoria: "web-scraping" }, "outras").erro, /aba Tools/);
  assert.equal(escolherCategoria(cats, { categoria: "dados", subcategoria: "web-scraping" }).cid, "dados", "sem aba: Tools, como antes");
  const nova = escolherCategoria(cats, { novaCategoria: "Produtividade", novaSubcategoria: "Notas" }, "outras");
  assert.equal(nova.mudou, true);
  assert.equal(nova.categorias.find((c) => c.id === "produtividade").aba, "outras");
  assert.match(escolherCategoria(cats, { categoria: "financas", subcategoria: "bolsa" }, "linguagens").erro, /aba Other Tools\. Escolha uma categoria da aba Languages/);
  assert.equal(escolherCategoria([...cats, BACKEND], { categoria: "back-end", subcategoria: "frameworks" }, "linguagens").sid, "frameworks");
  assert.equal(escolherCategoria(cats, { novaCategoria: "Mobile", novaSubcategoria: "Linguagens" }, "linguagens").categorias.find((c) => c.id === "mobile").aba, "linguagens");
  const novaTools = escolherCategoria(cats, { novaCategoria: "Segurança", novaSubcategoria: "Segredos" }, "tools");
  assert.equal(novaTools.categorias.find((c) => c.id === "seguranca").aba, undefined, "de Tools: sem o campo");
  // nome que já existe noutra aba não vira categoria nova: é recusado
  assert.match(escolherCategoria(cats, { novaCategoria: "Finanças", novaSubcategoria: "X" }, "tools").erro, /aba Other Tools/);
});

// ---------- endereço e voltar ----------
test("hash: #arch/other e #arch/languages abrem as abas extras (grade, detalhe, comparar) e voltam a ser escritos igual", () => {
  const lg = A.lerHash("#arch/languages/golang--go");
  assert.deepEqual([lg.aba, lg.tela, lg.id, lg.antigo], ["languages", "detalhe", "golang--go", false]);
  const g = A.lerHash("#arch/other");
  assert.equal(g.aba, "other"); assert.equal(g.tela, "grade"); assert.equal(g.antigo, false);
  const d = A.lerHash("#arch/other/neosaas--openstock");
  assert.deepEqual([d.aba, d.tela, d.id], ["other", "detalhe", "neosaas--openstock"]);
  const c = A.lerHash("#arch/other/comparar/a--b,c--d/profunda");
  assert.deepEqual([c.aba, c.tela, c.ids, c.profunda], ["other", "comparar", ["a--b", "c--d"], true]);
  for (const h of ["#arch/other", "#arch/other/neosaas--openstock", "#arch/other/comparar/a--b,c--d", "#arch/other/comparar/a--b,c--d/profunda", "#arch/other/profundas", "#arch/tools", "#arch/cloud", "#arch/languages", "#arch/languages/golang--go", "#arch/languages/comparar/golang--go,rust-lang--rust"])
    assert.equal(A.escreverHash(A.lerHash(h)), h, h);
  // Cloud continua com os filtros; Other Tools não leva filtro de Cloud no endereço
  assert.equal(A.escreverHash({ aba: "other", tela: "grade", filtros: { ...A.FILTROS_VAZIOS(), q: "x" } }), "#arch/other");
  // aba que não existe: Tools, marcado como antigo (a página troca o endereço)
  const x = A.lerHash("#arch/outras");
  assert.equal(x.aba, "tools"); assert.equal(x.antigo, true);
  // a lista das abas de comparação profunda não ganhou "other" (Other Tools pede com "tools")
  assert.deepEqual(A.ABAS, ["tools", "cloud"]);
  assert.deepEqual(A.abasHash(), ["tools", "cloud", "languages", "other"], "a ordem das abas na página");
  assert.deepEqual(A.abasHash().map(A.rotuloAba), ["Tools", "Cloud", "Languages", "Other Tools"]);
  assert.equal(A.abaDossie("languages"), "tools"); assert.equal(A.abaDoc("languages"), "linguagens"); assert.equal(A.abaHashDe({ aba: "linguagens" }), "languages");
  assert.equal(A.ehAbaTec("languages"), true); assert.equal(A.ehAbaTec("cloud"), false); assert.equal(A.ehAbaTec("stacks"), false);
  assert.equal(A.abaDossie("other"), "tools"); assert.equal(A.abaDossie("tools"), "tools"); assert.equal(A.abaDossie("cloud"), "cloud");
  assert.equal(A.abaDoc("other"), "outras"); assert.equal(A.abaDoc("tools"), "tools"); assert.equal(A.abaDoc("cloud"), "tools");
  assert.equal(A.abaHashDe({ aba: "outras" }), "other"); assert.equal(A.abaHashDe({}), "tools");
});

test("voltar do detalhe, da comparação e das profundas leva à grade da aba do endereço", () => {
  const de = (h) => A.voltarPara(A.lerHash(h));
  assert.deepEqual([de("#arch/other/neosaas--openstock").hash, de("#arch/other/neosaas--openstock").rotulo], ["#arch/other", "← Other Tools"]);
  assert.equal(de("#arch/other/comparar/a--b,c--d/profunda").hash, "#arch/other");
  assert.equal(de("#arch/other/profundas").hash, "#arch/other");
  assert.deepEqual([de("#arch/languages/golang--go").hash, de("#arch/languages/golang--go").rotulo], ["#arch/languages", "← Languages"]);
  assert.equal(de("#arch/languages/comparar/a--b,c--d").hash, "#arch/languages");
  assert.deepEqual([de("#arch/tools/signoz--signoz").hash, de("#arch/tools/signoz--signoz").rotulo], ["#arch/tools", "← Tools"]);
  assert.equal(de("#arch/tools/comparar/a--b,c--d").hash, "#arch/tools");
  // Cloud volta com os filtros que estavam no endereço
  const c = de("#arch/cloud/comparar/aws--amazon-s3,cloudflare--r2");
  assert.equal(c.rotulo, "← Cloud");
  assert.equal(A.voltarPara(A.lerHash("#arch/cloud?p=aws&q=s3")).hash, "#arch/cloud?p=aws&q=s3");
  // o estado devolvido é o da grade, pronto para irArch
  assert.deepEqual([de("#arch/other/x--y").estado.aba, de("#arch/other/x--y").estado.tela], ["other", "grade"]);
  assert.equal(A.voltarPara(null).hash, "#arch/tools");
  // a comparação rápida de Other Tools é a de Tools (repositório, licença, estrelas), não a de Cloud
  const comp = A.montarComparacao([{ id: "a--b", nome: "A", repo: "a/b", subcategoria: "bolsa", gh: { licenca: "MIT" } }, { id: "c--d", nome: "C", repo: "c/d", subcategoria: "bolsa", gh: { licenca: "AGPL-3.0" } }], { aba: "other" });
  assert.equal(comp.aba, "tools");
  assert.ok(comp.linhas.some((l) => l.k === "licenca"));
  assert.ok(!comp.linhas.some((l) => l.k === "provedor"));
  assert.equal(A.montarComparacao([], { aba: "languages" }).aba, "tools");
  assert.equal(A.montarComparacao([], {}).aba, "cloud", "sem aba, como antes");
});

// ---------- lista leve e Admin ----------
test("lista leve: aba em cada tecnologia e em cada categoria; as abas se separam", async () => {
  const { env, dep } = await montar();
  const r = await corpoDe(await rotaAdminLandscape(req("POST", { urls: "https://github.com/neosaas/openstock", nome: "OpenStock", aba: "outras", categoria: "financas", subcategoria: "bolsa", modelo: "aberto", uso: ["self-hosted"] }), env, ADMIN, "", "", dep));
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.equal(r.j.adicionadas[0].aba, "outras");
  assert.equal(docDe(env, "neosaas--openstock").aba, "outras");
  assert.equal(docDe(env, "openobserve--openobserve").aba, undefined, "Tools: sem o campo no doc");
  assert.match(SQL_LEVE, /'aba', json_extract\(data, '\$\.aba'\)/);
  const g = await corpoDe(await rotaLandscape(req("GET"), env, CONVIDADO, "", dep));
  assert.equal(g.status, 200);
  assert.ok(g.j.tecnologias.every((t) => t.aba === "tools" || t.aba === "outras"));
  assert.deepEqual(L.daAba(g.j.tecnologias, "outras").map((t) => t.id), ["neosaas--openstock"]);
  assert.equal(L.daAba(g.j.tecnologias, "tools").length, 7);
  assert.deepEqual(g.j.categorias.map((c) => [c.id, c.aba]), [["observabilidade", "tools"], ["ci-cd", "tools"], ["dados", "tools"], ["ia-agentes", "tools"], ["financas", "outras"], ["back-end", "linguagens"]]);
  // detalhe: a aba e as parecidas só da mesma aba
  const d = await corpoDe(await rotaLandscape(req("GET"), env, CONVIDADO, "neosaas--openstock", dep));
  assert.equal(d.j.tec.aba, "outras");
  assert.deepEqual(d.j.parecidas, []);
  const t = await corpoDe(await rotaLandscape(req("GET"), env, CONVIDADO, "signoz--signoz", dep));
  assert.equal(t.j.tec.aba, "tools");
  assert.ok(t.j.parecidas.every((p) => p.aba === "tools"));
});

test("Admin: grava a aba pelo json_patch e recusa categoria de outra aba (400 com a frase)", async () => {
  const { env, dep } = await montar();
  const post = (b) => rotaAdminLandscape(req("POST", b), env, ADMIN, "", "", dep);
  const put = (id, b) => rotaAdminLandscape(req("PUT", b), env, ADMIN, "", id, dep);
  // POST: Other Tools em categoria de Tools, Tools em categoria de Other Tools, aba desconhecida
  let r = await corpoDe(await post({ urls: "https://github.com/neosaas/openstock", aba: "outras", categoria: "dados", subcategoria: "web-scraping" }));
  assert.equal(r.status, 400); assert.match(r.j.erro, /Dados e coleta é da aba Tools\. Escolha uma categoria da aba Other Tools/);
  r = await corpoDe(await post({ urls: "https://github.com/neosaas/openstock", categoria: "financas", subcategoria: "bolsa" }));
  assert.equal(r.status, 400); assert.match(r.j.erro, /aba Other Tools/);
  r = await corpoDe(await post({ urls: "https://github.com/neosaas/openstock", aba: "other", categoria: "financas", subcategoria: "bolsa" }));
  assert.equal(r.status, 400); assert.match(r.j.erro, /Aba desconhecida/);
  assert.equal(docDe(env, "neosaas--openstock"), null, "nada entrou");
  // categoria nova pelo Adicionar: nasce na aba escolhida
  r = await corpoDe(await post({ urls: "https://github.com/neosaas/openstock", nome: "OpenStock", aba: "outras", novaCategoria: "Produtividade", novaSubcategoria: "Notas" }));
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.equal(catsDe(env).find((c) => c.id === "produtividade").aba, "outras");
  assert.equal(r.j.categorias.find((c) => c.id === "produtividade").aba, "outras");
  // PUT: trocar de aba sem escolher categoria da aba nova
  r = await corpoDe(await put("neosaas--openstock", { aba: "" }));
  assert.equal(r.status, 400); assert.match(r.j.erro, /Para passar para a aba Tools, escolha uma categoria dessa aba/);
  r = await corpoDe(await put("neosaas--openstock", { aba: "", categoria: "financas", subcategoria: "bolsa" }));
  assert.equal(r.status, 400); assert.match(r.j.erro, /aba Other Tools/);
  // categoria de outra aba sem trocar a aba
  r = await corpoDe(await put("neosaas--openstock", { categoria: "dados", subcategoria: "web-scraping" }));
  assert.equal(r.status, 400); assert.match(r.j.erro, /Dados e coleta é da aba Tools/);
  r = await corpoDe(await put("signoz--signoz", { categoria: "financas", subcategoria: "bolsa" }));
  assert.equal(r.status, 400); assert.match(r.j.erro, /aba Other Tools/);
  assert.equal((await put("signoz--signoz", { aba: "x" })).status, 400);
  assert.equal(docDe(env, "signoz--signoz").categoria, "observabilidade", "nada mudou");
  // dentro da mesma aba, mover funciona como antes
  r = await corpoDe(await put("neosaas--openstock", { categoria: "financas", subcategoria: "bolsa" }));
  assert.equal(r.status, 200);
  assert.equal(docDe(env, "neosaas--openstock").aba, "outras");
  // trocar de aba com a categoria certa: grava e a resposta diz a aba
  r = await corpoDe(await put("neosaas--openstock", { aba: "", categoria: "dados", subcategoria: "web-scraping" }));
  assert.equal(r.status, 200, JSON.stringify(r.j)); assert.equal(r.j.aba, "tools");
  assert.equal("aba" in docDe(env, "neosaas--openstock"), false, "Tools: a chave sai do doc (null no json_patch)");
  r = await corpoDe(await put("signoz--signoz", { aba: "outras", categoria: "financas", subcategoria: "bolsa", nome: "SigNoz" }));
  assert.equal(r.status, 200); assert.equal(r.j.aba, "outras");
  const s = docDe(env, "signoz--signoz");
  assert.deepEqual([s.aba, s.categoria, s.subcategoria, s.nome, s.repo], ["outras", "financas", "bolsa", "SigNoz", "SigNoz/signoz"], "o resto do doc fica");
  // mandar a mesma aba de novo não pede categoria
  assert.equal((await put("signoz--signoz", { aba: "outras", nome: "SigNoz" })).status, 200);
});

test("categorias: trocar a aba de uma categoria com tecnologia da outra aba dentro dá 409", async () => {
  const { env, dep } = await montar();
  await rotaAdminLandscape(req("POST", { urls: "https://github.com/neosaas/openstock", aba: "outras", categoria: "financas", subcategoria: "bolsa" }), env, ADMIN, "", "", dep);
  const cats = (await corpoDe(await rotaLandscape(req("GET"), env, ADMIN, "", dep))).j.categorias;
  const semAba = cats.map((c) => (c.id === "financas" ? { ...c, aba: "tools" } : c));
  let r = await corpoDe(await rotaAdminLandscape(req("PUT", { categorias: semAba }), env, ADMIN, "categorias", "", dep));
  assert.equal(r.status, 409); assert.match(r.j.erro, /Finanças e investimentos tem tecnologia da aba Other Tools/);
  const dadosOutras = cats.map((c) => (c.id === "dados" ? { ...c, aba: "outras" } : c));
  r = await corpoDe(await rotaAdminLandscape(req("PUT", { categorias: dadosOutras }), env, ADMIN, "categorias", "", dep));
  assert.equal(r.status, 409);
  // as categorias voltam com a aba que a tela mandou (a de Tools, devolvida como "tools", não é gravada)
  r = await corpoDe(await rotaAdminLandscape(req("PUT", { categorias: [...cats, { nome: "Casa", aba: "outras", subcategorias: [{ nome: "Ferramentas" }] }] }), env, ADMIN, "categorias", "", dep));
  assert.equal(r.status, 200);
  assert.deepEqual(r.j.categorias.map((c) => c.aba), ["tools", "tools", "tools", "tools", "outras", "linguagens", "outras"]);
  assert.deepEqual(catsDe(env).map((c) => c.aba || null), [null, null, null, null, "outras", "linguagens", "outras"]);
});

test("o limite de tecnologias conta as duas abas juntas", async () => {
  const { env, dep } = await montar();
  const ins = env.DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES ('landscape', ?, ?, '')");
  for (let i = 0; i < L.MAX_TECNOLOGIAS - 7; i++) ins.run("enchimento--r" + i, JSON.stringify({ repo: "enchimento/r" + i, nome: "r" + i, categoria: "financas", subcategoria: "bolsa", aba: "outras" }));
  const r = await corpoDe(await rotaAdminLandscape(req("POST", { urls: "https://github.com/grafana/loki", categoria: "observabilidade", subcategoria: "plataformas" }), env, ADMIN, "", "", dep));
  assert.equal(r.status, 400); assert.match(r.j.erro, /até 300 tecnologias/);
});

// ---------- cron ----------
function fetchFalso() {
  return async (url) => {
    const u = String(url);
    const lim = { "x-ratelimit-remaining": "4800", "x-ratelimit-limit": "5000", "x-ratelimit-reset": String(Math.floor(AGORA / 1000) + 1800), "x-ratelimit-resource": "core" };
    const m = /api\.github\.com\/repos\/([^/]+)\/([^/?]+)(\/[a-z]+)?/.exec(u);
    if (u.includes("/search/issues")) return resposta(buscaIssues(AGORA), { headers: { ...lim, "x-ratelimit-resource": "search" } });
    if (m) {
      const id = (m[1] + "--" + m[2]).toLowerCase(), parte = m[3] || "";
      const base = REPOS[id] || { ...REPOS["openobserve--openobserve"], full_name: m[1] + "/" + m[2], html_url: "https://github.com/" + m[1] + "/" + m[2] };
      if (!parte) return resposta(base, { headers: lim });
      if (parte === "/commits") return resposta(commits("2026-11-18T10:00:00Z"), { headers: lim });
      if (parte === "/releases") return resposta(releases(), { headers: lim });
      if (parte === "/readme") return new Response(readme("openobserve--openobserve"), { status: 200, headers: { "content-type": "text/plain", ...lim } });
      if (parte === "/languages") return resposta(linguagens(), { headers: lim });
      if (parte === "/contributors" || parte === "/pulls") return resposta([{}], { headers: { ...lim, link: link(u, 12) } });
    }
    if (u.includes("hn.algolia.com/api/v1/search")) return resposta(buscaHn([]));
    if (u.includes("hn.algolia.com/api/v1/items/")) return resposta(itemHn(1));
    return resposta("sem rede", { status: 503 });
  };
}
test("cron de coleta: nunca apaga nem muda a aba", async () => {
  const { env, dep } = await montar();
  await rotaAdminLandscape(req("POST", { urls: "https://github.com/neosaas/openstock", nome: "OpenStock", aba: "outras", categoria: "financas", subcategoria: "bolsa" }), env, ADMIN, "", "", dep);
  const antes = globalThis.fetch;
  globalThis.fetch = fetchFalso();
  try { for (let i = 0; i < 30; i++) await rodadaLandscape(env, { agora: AGORA + i * 60_000 }); }
  finally { globalThis.fetch = antes; }
  const d = docDe(env, "neosaas--openstock");
  assert.ok(d.gh && d.gh.estrelas != null, "a coleta rodou");
  assert.ok(d.releases && d.leve && !d.leve.coletando);
  assert.equal(d.aba, "outras", "a aba ficou");
  assert.deepEqual([d.categoria, d.subcategoria, d.nome], ["financas", "bolsa", "OpenStock"]);
  assert.equal("aba" in docDe(env, "signoz--signoz"), false, "e não apareceu nas de Tools");
  const g = await corpoDe(await rotaLandscape(req("GET"), env, CONVIDADO, "", dep));
  assert.equal(g.j.tecnologias.find((t) => t.id === "neosaas--openstock").aba, "outras");
});

// ---------- filtros e contagens por aba ----------
test("filtros, contagens e o widget olham só a aba", () => {
  const AG = Date.parse("2026-11-19T12:00:00Z");
  const lista = [
    { id: "a--tools1", nome: "Tools Um", repo: "a/tools1", categoria: "dados", aba: "tools", modelo: "aberto", uso: ["self-hosted"], leve: { linguagem: "Go", licenca: "MIT", release: { tag: "v1", data: "2026-11-18T00:00:00Z" } } },
    { id: "a--tools2", nome: "Tools Dois", repo: "a/tools2", categoria: "dados", modelo: "pago", uso: ["nuvem"], leve: { linguagem: "Go", licenca: "MIT" } },
    { id: "n--openstock", nome: "OpenStock", repo: "n/openstock", categoria: "financas", aba: "outras", modelo: "aberto", uso: ["self-hosted", "local"], leve: { linguagem: "TypeScript", licenca: "AGPL-3.0", release: { tag: "v2", data: "2026-11-17T00:00:00Z" } } },
    { id: "n--stock2", nome: "Stock Dois", repo: "n/stock2", categoria: "financas", aba: "outras", modelo: "freemium", uso: ["nuvem"], leve: { linguagem: "Python", licenca: "MIT" } },
  ];
  const outras = L.daAba(lista, "outras"), tools = L.daAba(lista, "tools");
  assert.deepEqual(outras.map((t) => t.id), ["n--openstock", "n--stock2"]);
  assert.deepEqual(tools.map((t) => t.id), ["a--tools1", "a--tools2"]);
  // busca e filtros dentro da aba
  assert.deepEqual(L.filtrar(outras, { busca: "stock" }).map((t) => t.id), ["n--openstock", "n--stock2"]);
  assert.deepEqual(L.filtrar(tools, { busca: "stock" }), [], "a busca de Tools não acha Other Tools");
  assert.deepEqual(L.filtrar(outras, { categoria: "financas", usos: ["self-hosted"] }).map((t) => t.id), ["n--openstock"]);
  assert.deepEqual(L.filtrar(outras, { modelos: ["freemium"] }).map((t) => t.id), ["n--stock2"]);
  assert.deepEqual(L.filtrar(outras, { categoria: "dados" }), []);
  // contagens dos chips
  assert.deepEqual(L.contarModelos(outras).map((m) => [m.id, m.n]), [["aberto", 1], ["freemium", 1]]);
  assert.deepEqual(L.contarModelos(tools).map((m) => [m.id, m.n]), [["aberto", 1], ["pago", 1]]);
  assert.deepEqual(L.contarUsos(outras).map((u) => [u.id, u.n]), [["nuvem", 1], ["self-hosted", 1], ["local", 1]]);
  assert.deepEqual(L.contarUsos(tools).map((u) => [u.id, u.n]), [["nuvem", 1], ["self-hosted", 1]]);
  // o widget do Início (tech-landscape) lê só as de Tools: a release do OpenStock não aparece
  assert.deepEqual(L.novidades(L.daAba(lista, "tools"), AG).map((x) => x.id), ["a--tools1"]);
  // comparar: só concorrentes da mesma subcategoria, dentro do catálogo da aba
  const cat = [{ id: "n--openstock", subcategoria: "bolsa" }, { id: "n--stock2", subcategoria: "bolsa" }];
  assert.equal(A.podeComparar(["n--openstock", "n--stock2"], cat).pode, true);
  assert.equal(A.podeComparar(["n--openstock", "a--tools1"], cat).pode, false, "a de Tools não está no catálogo de Other Tools");
});

// ---------- Languages: o mesmo que Other Tools, com notícias ----------
test("Languages: grava, separa na lista leve e recusa categoria de outra aba", async () => {
  const { env, dep } = await montar();
  const post = (b) => rotaAdminLandscape(req("POST", b), env, ADMIN, "", "", dep);
  let r = await corpoDe(await post({ urls: "https://github.com/golang/go", nome: "Go", aba: "linguagens", categoria: "back-end", subcategoria: "linguagens" }));
  assert.equal(r.status, 200, JSON.stringify(r.j)); assert.equal(r.j.adicionadas[0].aba, "linguagens");
  r = await corpoDe(await post({ urls: "https://github.com/gin-gonic/gin", aba: "linguagens", categoria: "financas", subcategoria: "bolsa" }));
  assert.equal(r.status, 400); assert.match(r.j.erro, /Finanças e investimentos é da aba Other Tools\. Escolha uma categoria da aba Languages/);
  r = await corpoDe(await post({ urls: "https://github.com/gin-gonic/gin", aba: "outras", categoria: "back-end", subcategoria: "frameworks" }));
  assert.equal(r.status, 400); assert.match(r.j.erro, /Back-end é da aba Languages/);
  await post({ urls: "https://github.com/neosaas/openstock", aba: "outras", categoria: "financas", subcategoria: "bolsa" });
  const g = (await corpoDe(await rotaLandscape(req("GET"), env, CONVIDADO, "", dep))).j;
  assert.deepEqual(L.daAba(g.tecnologias, "linguagens").map((t) => t.id), ["golang--go"]);
  assert.deepEqual(L.daAba(g.tecnologias, "outras").map((t) => t.id), ["neosaas--openstock"]);
  assert.equal(L.daAba(g.tecnologias, "tools").length, 7);
  // trocar Languages -> Other Tools pede a categoria da aba nova
  assert.equal((await rotaAdminLandscape(req("PUT", { aba: "outras" }), env, ADMIN, "", "golang--go", dep)).status, 400);
  const ok = await corpoDe(await rotaAdminLandscape(req("PUT", { aba: "outras", categoria: "financas", subcategoria: "bolsa" }), env, ADMIN, "", "golang--go", dep));
  assert.equal(ok.status, 200); assert.equal(ok.j.aba, "outras"); assert.equal(docDe(env, "golang--go").aba, "outras");
});

// ---------- Other Tools sem notícias (adendo das 23h10) ----------
// fetch que conta os pedidos por host
function fetchContado() {
  const base = fetchFalso();
  const pedidos = [];
  const f = async (u, o) => { pedidos.push(String(u)); return base(u, o); };
  f.pedidos = pedidos;
  return f;
}
const rodar = async (env, f, n, t0 = AGORA) => { const antes = globalThis.fetch; globalThis.fetch = f; try { for (let i = 0; i < n; i++) await rodadaLandscape(env, { agora: t0 + i * 60_000 }); } finally { globalThis.fetch = antes; } };
const soDe = (f, repo) => f.pedidos.filter((u) => u.toLowerCase().includes(encodeURIComponent(repo).toLowerCase()) || u.toLowerCase().includes(repo.toLowerCase()));

test("coleta de Other Tools: só GitHub, sem Hacker News, comentários nem blog; Tools e Languages seguem com tudo", async () => {
  const env = { DB: d1Falso(), GITHUB_TOKEN: "t" };
  const dep = espelhoFalso();
  // banco só com as três (sem a semente), cada uma com feed, para o blog também contar
  env.DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES ('meta', 'landscape-categorias', ?, '')").run(JSON.stringify({ categorias: [...CATEGORIAS_INICIAIS, FINANCAS, BACKEND] }));
  env.DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES ('_sistema', 'landscape-semente', '{}', '')").run();
  const ins = (id, repo, extra) => env.DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES ('landscape', ?, ?, '')").run(id, JSON.stringify({ repo, nome: repo.split("/")[1], site: "", feed: "https://blog.exemplo.dev/" + id + ".xml", ...extra }));
  ins("neosaas--openstock", "neosaas/openstock", { aba: "outras", categoria: "financas", subcategoria: "bolsa" });
  ins("golang--go", "golang/go", { aba: "linguagens", categoria: "back-end", subcategoria: "linguagens" });
  ins("openobserve--openobserve", "openobserve/openobserve", { categoria: "observabilidade", subcategoria: "plataformas" });
  const f = fetchContado();
  await rodar(env, f, 20);
  const outras = soDe(f, "neosaas/openstock"), go = soDe(f, "golang/go"), oo = soDe(f, "openobserve/openobserve");
  const hn = (l) => l.filter((u) => u.includes("hn.algolia.com")).length;
  assert.equal(hn(outras), 0, "Other Tools: nenhuma busca no Hacker News");
  assert.equal(f.pedidos.filter((u) => u.includes("blog.exemplo.dev/neosaas")).length, 0, "nem o feed do blog");
  assert.equal(outras.filter((u) => u.includes("api.github.com")).length, 8, "as oito partes do GitHub, uma vez cada");
  assert.ok(hn(go) >= 1 && hn(oo) >= 1, "Languages e Tools buscam no HN");
  assert.equal(f.pedidos.filter((u) => u.includes("blog.exemplo.dev/golang")).length, 1);
  assert.equal(f.pedidos.filter((u) => u.includes("blog.exemplo.dev/openobserve")).length, 1);
  const d = docDe(env, "neosaas--openstock");
  assert.ok(d.gh && d.gh.estrelas != null);
  assert.equal(d.hn, undefined); assert.equal(d.blog, undefined); assert.equal(d.aba, "outras");
  assert.ok(docDe(env, "golang--go").hn, "Languages com o HN coletado");
  // mais rodadas, horas depois: Other Tools continua sem notícia
  const f2 = fetchContado();
  await rodar(env, f2, 10, AGORA + 7 * 3600_000);
  assert.equal(hn(soDe(f2, "neosaas/openstock")), 0);
  // mudou para Tools: as partes de notícia vencem e a coleta delas volta sozinha
  const r = await rotaAdminLandscape(req("PUT", { aba: "", categoria: "dados", subcategoria: "web-scraping" }), env, ADMIN, "", "neosaas--openstock", dep);
  assert.equal(r.status, 200);
  const f3 = fetchContado();
  await rodar(env, f3, 10, AGORA + 8 * 3600_000);
  assert.ok(hn(soDe(f3, "neosaas/openstock")) >= 1, "voltou a buscar no HN");
  assert.ok(docDe(env, "neosaas--openstock").hn);
});

test("detalhe e lista leve de Other Tools: sem notícias, fóruns nem Hacker News; Tools e Languages inalterados", async () => {
  const { env, dep } = await montar();
  // uma tecnologia que veio de Tools com HN já coletado, e uma notícia e um post que citam as duas
  const hnVelho = { historias: [{ id: "1", titulo: "Show HN: OpenStock", url: "https://github.com/neosaas/openstock", pontos: 300, comentarios: 10, autor: "a", data: new Date(AGORA - 864e5).toISOString() }], comentarios: [] };
  const ins = (id, repo, extra) => env.DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES ('landscape', ?, ?, '')").run(id, JSON.stringify({ repo, nome: repo.split("/")[1], site: "", feed: "", hn: hnVelho, blog: [{ titulo: "post", url: "https://x.dev/p", publicado: null }],
    leve: { coletando: false, estrelas: 10, hn: { id: "1", titulo: "Show HN", pontos: 300, data: hnVelho.historias[0].data } }, ...extra }));
  ins("neosaas--openstock", "neosaas/openstock", { aba: "outras", categoria: "financas", subcategoria: "bolsa" });
  ins("golang--golang", "golang/golang", { aba: "linguagens", categoria: "back-end", subcategoria: "linguagens" });
  const item = (c, id, titulo, url, extra = {}) => env.DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES (?, ?, ?, ?)").run(c, id, JSON.stringify({ titulo, url, resumo: "", fonte: "Fonte", publicado: new Date(AGORA - 864e5).toISOString(), coletado: new Date(AGORA - 864e5).toISOString(), ...extra }), new Date(AGORA - 864e5).toISOString());
  item("items", "n1", "OpenStock e golang/golang na mesma semana", "https://github.com/neosaas/openstock");
  item("items", "n2", "Novidades em golang/golang", "https://github.com/golang/golang");
  item("foruns-tech", "r1", "Alguém usa o OpenStock? golang/golang também", "https://github.com/neosaas/openstock", { sub: "investing" });
  const d = (await corpoDe(await rotaLandscape(req("GET"), env, CONVIDADO, "neosaas--openstock", dep))).j;
  assert.equal(d.semNoticias, true);
  assert.deepEqual([d.noticias, d.reddit], [[], []]);
  assert.equal(d.tec.hn, undefined); assert.equal(d.tec.blog, undefined);
  const lg = (await corpoDe(await rotaLandscape(req("GET"), env, CONVIDADO, "golang--golang", dep))).j;
  assert.equal(lg.semNoticias, undefined);
  assert.ok(lg.tec.hn && lg.tec.blog, "Languages: o detalhe leva HN e blog");
  assert.ok(lg.noticias.length >= 1, "e as notícias do Lookout que citam");
  const g = (await corpoDe(await rotaLandscape(req("GET"), env, CONVIDADO, "", dep))).j;
  assert.equal(g.tecnologias.find((t) => t.id === "neosaas--openstock").leve.hn, undefined, "cartão sem indicador de notícia");
  assert.ok(g.tecnologias.find((t) => t.id === "golang--golang").leve.hn);
});

// ---------- destaques da subcategoria (adendo de 19/11, 23h18) ----------
test("destaquesDaSub: os 3 com mais estrelas, só com 4 itens ou mais; empate pelo nome; sem estrelas não entra", () => {
  const t = (id, nome, estrelas, extra = {}) => ({ id, nome, leve: estrelas == null ? { coletando: true } : { estrelas }, ...extra });
  // 4 ou mais: os 3 primeiros em estrelas, na ordem
  const seis = [t("a", "A", 10), t("b", "B", 500), t("c", "C", 30), t("d", "D", 204000), t("e", "E", 7), t("f", "F", 900)];
  assert.deepEqual(L.destaquesDaSub(seis), ["d", "f", "b"]);
  assert.deepEqual(L.destaquesDaSub(seis.slice(0, 4)), ["d", "b", "c"]);
  // 3 ou menos: ninguém cresce
  assert.deepEqual(L.destaquesDaSub(seis.slice(0, 3)), []);
  assert.deepEqual(L.destaquesDaSub([]), []); assert.deepEqual(L.destaquesDaSub(null), []);
  // empate: pelo nome (sem acento e sem caixa)
  assert.deepEqual(L.destaquesDaSub([t("z", "Zeta", 100), t("x", "álpha", 100), t("y", "Beta", 100), t("w", "Omega", 1)]), ["x", "y", "z"]);
  // sem estrelas coletadas não entra (mas conta para os 4)
  assert.deepEqual(L.destaquesDaSub([t("a", "A", null), t("b", "B", null), t("c", "C", 5), t("d", "D", 3)]), ["c", "d"]);
  assert.deepEqual(L.destaquesDaSub([t("a", "A", null), t("b", "B", null), t("c", "C", null), t("d", "D", null)]), []);
  assert.deepEqual(L.destaquesDaSub([t("a", "A", 5, { leve: { estrelas: null } }), t("b", "B", 4), t("c", "C", 3), t("d", "D", 2)]), ["b", "c", "d"]);
  // com filtro: vale só com 4 ou mais visíveis; a posição é a da subcategoria inteira
  const v = L.destaquesVisiveis(seis, seis.filter((x) => x.id !== "f"));
  assert.deepEqual(v.destaques, [{ id: "d", posicao: 1 }, { id: "b", posicao: 3 }], "o 2º sumiu no filtro; o 3º continua 3º");
  assert.deepEqual(v.resto, ["a", "c", "e"], "o resto na ordem da tela");
  const tres = L.destaquesVisiveis(seis, seis.slice(0, 3));
  assert.deepEqual(tres.destaques, []); assert.deepEqual(tres.resto, ["a", "b", "c"]);
  assert.deepEqual(L.destaquesVisiveis(seis.slice(0, 3), seis.slice(0, 3)).destaques, []);
});
