// Radar de Saúde (pedido de 20/11): permissão da seção, semente, produtos (rotas e validação), citaProduto, filtros
// puros, coleta com filtro por produto, contrato da curadoria (situacaoBrasil), limpeza por idade e a seção nas
// instruções, pedidos, tradução, espelho, widgets e rotinas.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { d1Falso, espelhoFalso } from "./d1-falso.mjs";
import "../public/saude.js";
import { COL, SEMENTE, SEMENTE_VERSAO, SQL_PRODUTOS_ATIVOS, SQL_SITUACAO, patchSituacao, semearSaude, rotaSaude, rotaAdminSaude, produtosAtivos, listaProdutos } from "../src/saude.js";
import { SECOES as SECOES_CUR, validarPedido } from "../src/curadoria.js";
import { relatorio, SECOES_CUR as ROT_CUR, sqlContagens } from "../src/rotinas.js";
import { catalogoDe } from "../src/painel.js";
import { FEEDS, FEEDS_SAUDE, SAUDE_PARA_SONDAR, SECOES_COM_FORUM } from "../src/feeds.js";
import { COLECOES_ITENS as TRAD_ITENS, COLECOES_DESTAQUES as TRAD_DEST, sqlFila, MAX_COMPOSTO } from "../src/traducao.js";
import { vencido, PRAZOS } from "../src/coleta.js";

register("data:text/javascript," + encodeURIComponent(
  'export async function resolve(s, c, n) { if (s === "cloudflare:workers") return { url: "data:text/javascript,export class DurableObject {}", shortCircuit: true }; return n(s, c); }'));
const { default: worker } = await import("../src/index.js");
const { SECOES, ABERTAS, FECHADAS, calcularSecoes, paraConvidado, secaoDe } = await import("../src/grupos.js");
const { COLECOES_ESPELHO } = await import("../src/espelho.js");

const S = globalThis.Saude;
const DIA = 86_400_000;
const AGORA = Date.parse("2026-11-20T15:00:00Z");
const ADMIN = { email: "admin@x.com", admin: true, secoes: null };
const req = (metodo, corpo) => new Request("https://x/api", { method: metodo, headers: { "content-type": "application/json" }, body: corpo == null || metodo === "GET" ? undefined : JSON.stringify(corpo) });
const resp = async (p) => { const r = await p; return { status: r.status, j: await r.json() }; };
const docDe = (env, id) => { const r = env.DB.db.prepare("SELECT data FROM docs WHERE collection = ? AND id = ?").get(COL, id); return r ? JSON.parse(r.data) : null; };
async function semeado() { const env = { DB: d1Falso() }; await semearSaude(env, AGORA); return { env, dep: espelhoFalso() }; }

// ---------- permissão ----------
test("seção fechada: convidado sem grupo não recebe a Saúde; grupo que a marca libera; o resto da máquina já conhece a seção", () => {
  assert.ok(SECOES.includes("saude"));
  assert.ok(FECHADAS.includes("saude") && FECHADAS.includes("oficina"));
  assert.ok(!ABERTAS.includes("saude"));
  assert.ok(!paraConvidado(null).includes("saude"), "sem grupo nenhum: só as abertas");
  assert.deepEqual(calcularSecoes([{ id: "s", secoes: '["tech","saude"]', padrao: 0 }], ["s"]), ["tech", "saude"]);
  assert.equal(secaoDe("items-saude"), "saude");
  assert.equal(secaoDe("destaques-saude"), "saude");
  assert.equal(secaoDe("meta", "status-saude"), "saude");
  assert.equal(secaoDe("saude-produtos"), undefined, "os produtos só saem pela rota própria");
  assert.deepEqual(SECOES_CUR, SECOES, "curadoria e grupos com as mesmas seções");
  assert.ok(!validarPedido({ secao: "saude", texto: "Procure notícias da Anvisa sobre importação." }).erro);
  assert.ok(ROT_CUR.some(([s, , n]) => s === "saude" && n === "Saúde: curadoria"));
  // widget: só quem tem a seção
  assert.ok(catalogoDe(null).some((w) => w.id === "destaques-saude" && w.titulo === "Saúde: destaques do dia"));
  assert.ok(!catalogoDe(ABERTAS).some((w) => w.secao === "saude"));
  assert.ok(catalogoDe(["saude"]).some((w) => w.id === "destaques-saude"));
  for (const c of ["items-saude", "destaques-saude", COL]) assert.ok(COLECOES_ESPELHO.includes(c), c);
  assert.ok(TRAD_ITENS.includes("items-saude") && TRAD_DEST.includes("destaques-saude"), "tradução");
  for (const q of sqlFila(AGORA).consultas) assert.ok(q.sql.split(" UNION ALL ").length <= MAX_COMPOSTO);
  assert.ok(!SECOES_COM_FORUM.includes("saude"), "na Saúde o Reddit vai para a curadoria, não para Nos fóruns");
});

test("Worker: convidado sem a seção não vê menu nem rota (403); rotas de Admin dão 404 aos outros; grupo libera a leitura", async () => {
  const { env } = await semeado();
  env.DB.db.prepare("INSERT INTO usuarios (email, nome) VALUES ('c@x.com', 'C'), ('g@x.com', 'G')").run();
  env.DB.db.prepare("CREATE TABLE IF NOT EXISTS grupos (id TEXT PRIMARY KEY, nome TEXT NOT NULL, secoes TEXT NOT NULL DEFAULT '[]', padrao INTEGER NOT NULL DEFAULT 0, criado TEXT)").run();
  env.DB.db.prepare("CREATE TABLE IF NOT EXISTS usuario_grupo (email TEXT NOT NULL, grupo TEXT NOT NULL, PRIMARY KEY (email, grupo))").run();
  env.DB.db.prepare("INSERT INTO grupos (id, nome, secoes) VALUES ('saude', 'Saúde', '[\"tech\",\"saude\"]')").run();
  env.DB.db.prepare("INSERT INTO usuario_grupo (email, grupo) VALUES ('g@x.com', 'saude')").run();
  const chamar = (m, c, email, corpo) => worker.fetch(new Request("https://lookout.test" + c, { method: m, headers: { "X-Requested-With": "XMLHttpRequest", "content-type": "application/json" }, body: corpo && m !== "GET" ? JSON.stringify(corpo) : undefined }), { ...env, DEV_EMAIL: email, ADMIN_EMAIL: "admin@x.com" }, { waitUntil() {} });
  const me = await (await chamar("GET", "/api/me", "c@x.com")).json();
  assert.ok(Array.isArray(me.secoes) && !me.secoes.includes("saude"), "o menu do convidado não traz a Saúde");
  assert.ok(!me.widgets.includes("destaques-saude"));
  assert.equal((await chamar("GET", "/api/saude/produtos", "c@x.com")).status, 403);
  assert.equal((await chamar("GET", "/api/q?c=items-saude", "c@x.com")).status, 403);
  assert.equal((await chamar("GET", "/api/q?c=destaques-saude", "c@x.com")).status, 403);
  assert.equal((await chamar("GET", "/api/doc?c=meta&id=status-saude", "c@x.com")).status, 403);
  for (const [m, c] of [["POST", "/api/admin/saude/produtos"], ["PUT", "/api/admin/saude/produtos/retatrutida"], ["DELETE", "/api/admin/saude/produtos/retatrutida"]]) {
    assert.equal((await chamar(m, c, "c@x.com", {})).status, 404, m + " " + c);
    assert.equal((await chamar(m, c, "g@x.com", {})).status, 404, "ver não é editar: " + m + " " + c);
  }
  const meG = await (await chamar("GET", "/api/me", "g@x.com")).json();
  assert.deepEqual(meG.secoes, ["tech", "saude"]);
  assert.ok(meG.widgets.includes("destaques-saude"));
  const g = await (await chamar("GET", "/api/saude/produtos", "g@x.com")).json();
  assert.equal(g.admin, false);
  assert.deepEqual(g.produtos.map((p) => p.id), ["retatrutida"]);
  assert.equal((await chamar("GET", "/api/q?c=items-saude", "g@x.com")).status, 200);
  // Admin
  const a = await (await chamar("GET", "/api/saude/produtos", "admin@x.com")).json();
  assert.equal(a.admin, true);
  const r = await chamar("PUT", "/api/admin/saude/produtos/retatrutida", "admin@x.com", { ativo: false });
  assert.equal(r.status, 200);
  assert.deepEqual((await (await chamar("GET", "/api/saude/produtos", "g@x.com")).json()).produtos, [], "pausado some para quem não é Admin");
  assert.equal((await (await chamar("GET", "/api/saude/produtos", "admin@x.com")).json()).produtos[0].ativo, false, "o Admin vê o pausado");
});

// ---------- semente ----------
test("semente: a Retatrutida com as duas marcas, sem fato de saúde; entra uma vez só e não pisa no Admin", async () => {
  assert.equal(SEMENTE.length, 1);
  const { env, dep } = await semeado();
  const d = docDe(env, "retatrutida");
  assert.equal(d.nome, "Retatrutida");
  assert.deepEqual(d.apelidos, ["retatrutide", "LY3437943", "reta"]);
  assert.deepEqual(d.marcas, [{ id: "zphc-store", nome: "ZPHC Store", tipo: "loja" }, { id: "synedica", nome: "Synedica", tipo: "marca" }]);
  assert.equal(d.ativo, true);
  assert.equal(d.por, "semente");
  for (const k of ["resumo", "tipo", "situacaoBrasil"]) assert.ok(!(k in d), "a semente não escreve " + k);
  const marca = JSON.parse(env.DB.db.prepare("SELECT data FROM docs WHERE collection = '_sistema' AND id = 'saude-semente'").get().data);
  assert.equal(marca.versao, SEMENTE_VERSAO);
  // o Admin edita e tira; a segunda vez não faz nada
  assert.equal((await resp(rotaAdminSaude(req("PUT", { apelidos: ["retatrutide"] }), env, ADMIN, "produtos/retatrutida", dep))).status, 200);
  assert.equal(await semearSaude(env, AGORA + DIA), 0, "a marca segura a segunda vez");
  assert.deepEqual(docDe(env, "retatrutida").apelidos, ["retatrutide"]);
  assert.equal((await resp(rotaAdminSaude(req("DELETE"), env, ADMIN, "produtos/retatrutida", dep))).status, 200);
  await semearSaude(env, AGORA + 2 * DIA);
  assert.equal(docDe(env, "retatrutida"), null, "o que o Admin tirou não volta");
  assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM docs WHERE collection = '_sistema' AND id = 'saude-semente'").get().n, 1);
});

// ---------- produtos: rotas e validação ----------
test("Admin: adicionar, editar apelidos, pôr e tirar marca, pausar e remover; validação com frase em português", async () => {
  const { env, dep } = await semeado();
  const post = (b) => resp(rotaAdminSaude(req("POST", b), env, ADMIN, "produtos", dep));
  const put = (id, b) => resp(rotaAdminSaude(req("PUT", b), env, ADMIN, "produtos/" + id, dep));
  for (const [b, msg] of [
    [{}, /Preencha o nome/],
    [{ nome: "x".repeat(81) }, /O nome guarda até 80/],
    [{ nome: "Produto de teste", apelidos: "um" }, /Apelidos: mande uma lista/],
    [{ nome: "Produto de teste", apelidos: Array.from({ length: 13 }, (_, k) => "ap" + k) }, /Até 12 apelidos/],
    [{ nome: "Produto de teste", apelidos: ["y".repeat(61)] }, /passa de 60/],
    [{ nome: "Produto de teste", tipo: "t".repeat(61) }, /O tipo guarda até 60/],
    [{ nome: "Produto de teste", resumo: "r".repeat(241) }, /O resumo guarda até 240/],
    [{ nome: "Produto de teste", marcas: [{ nome: "Loja de teste", tipo: "farmacia" }] }, /escolha o tipo/],
    [{ nome: "Produto de teste", marcas: [{ nome: "", tipo: "loja" }] }, /Preencha o nome da marca/],
    [{ nome: "Produto de teste", marcas: [{ nome: "Loja de teste", tipo: "loja", nota: "n".repeat(161) }] }, /até 160/],
    [{ nome: "Produto de teste", marcas: [{ nome: "Loja A", tipo: "loja" }, { nome: "Loja A", tipo: "marca" }] }, /aparece duas vezes/],
    [{ nome: "Produto de teste", marcas: Array.from({ length: 21 }, (_, k) => ({ nome: "M" + k, tipo: "marca" })) }, /Até 20 marcas/],
    [{ nome: "Produto de teste", ativo: "sim" }, /Ativo é sim ou não/],
    [{ nome: "Produtos" }, /reservado/],
    [{ nome: "Produto de teste", id: "Com Espaço" }, /só letras minúsculas/],
  ]) { const r = await post(b); assert.equal(r.status, 400, JSON.stringify(b).slice(0, 80)); assert.match(r.j.erro, msg); }
  const ok = await post({ nome: "Produto de Teste Ç", apelidos: ["teste um", "Teste Um", "tst"], marcas: [{ nome: "Loja de Teste", tipo: "loja", nota: "Nota de teste." }], situacaoBrasil: { texto: "não vem do Admin", fonte: "https://x.dev", em: "2026-11-01" } });
  assert.equal(ok.status, 200);
  assert.equal(ok.j.id, "produto-de-teste-c", "id em kebab-case sem acento");
  const d = docDe(env, ok.j.id);
  assert.deepEqual(d.apelidos, ["teste um", "tst"], "apelido repetido (sem caixa) sai");
  assert.deepEqual(d.marcas, [{ id: "loja-de-teste", nome: "Loja de Teste", tipo: "loja", nota: "Nota de teste." }]);
  assert.equal(d.ativo, true);
  assert.equal(d.por, "admin");
  assert.ok(!("situacaoBrasil" in d), "situação no Brasil é só da curadoria");
  assert.ok(!("resumo" in d) && !("tipo" in d), "vazio não vira campo");
  assert.ok(dep.gravados.some((g) => g.id === ok.j.id), "write-through no espelho");
  assert.equal((await post({ nome: "Produto de Teste Ç" })).status, 409, "mesmo id");
  // editar: parcial, lista inteira por json_patch
  assert.equal((await put(ok.j.id, { apelidos: ["outro nome"] })).status, 200);
  assert.deepEqual(docDe(env, ok.j.id).apelidos, ["outro nome"]);
  assert.equal(docDe(env, ok.j.id).marcas.length, 1, "o que não veio fica");
  assert.equal((await put(ok.j.id, { marcas: [...d.marcas, { nome: "Marca Dois", tipo: "fabricante" }] })).status, 200);
  assert.deepEqual(docDe(env, ok.j.id).marcas.map((m) => m.id), ["loja-de-teste", "marca-dois"]);
  assert.equal((await put(ok.j.id, { marcas: [{ id: "marca-dois", nome: "Marca Dois", tipo: "fabricante" }] })).status, 200);
  assert.deepEqual(docDe(env, ok.j.id).marcas.map((m) => m.id), ["marca-dois"], "tirar marca");
  assert.equal((await put(ok.j.id, { tipo: "suplemento" })).status, 200);
  assert.equal(docDe(env, ok.j.id).tipo, "suplemento");
  assert.equal((await put(ok.j.id, { tipo: "" })).status, 200);
  assert.ok(!("tipo" in docDe(env, ok.j.id)), "tipo vazio sai do doc");
  assert.equal((await put(ok.j.id, { ativo: false })).status, 200);
  assert.equal(docDe(env, ok.j.id).ativo, false, "pausar");
  const r400 = await put(ok.j.id, { nome: "" });
  assert.equal(r400.status, 400); assert.match(r400.j.erro, /Preencha o nome/);
  assert.match((await put(ok.j.id, { outro: 1 })).j.erro, /Nada para salvar/);
  assert.equal((await put("nao-existe", { nome: "x" })).status, 404);
  assert.equal((await put("Com Espaco", { nome: "x" })).status, 400);
  assert.equal((await resp(rotaAdminSaude(req("DELETE"), env, ADMIN, "produtos/" + ok.j.id, dep))).status, 200);
  assert.equal(docDe(env, ok.j.id), null);
  assert.ok(dep.removidos.some((x) => x.id === ok.j.id));
  // quem não é Admin
  assert.equal((await rotaAdminSaude(req("POST", { nome: "x" }), env, { email: "g@x.com", admin: false, secoes: ["saude"] }, "produtos", dep)).status, 404);
  assert.equal((await rotaAdminSaude(req("GET"), env, ADMIN, "outra", dep)).status, 404);
});

test("até 30 produtos; a leitura confere cada campo (o que a curadoria gravou errado some)", async () => {
  const { env, dep } = await semeado();
  for (let k = 1; k < S.MAX_PRODUTOS; k++) assert.equal((await resp(rotaAdminSaude(req("POST", { nome: "Produto de teste " + k }), env, ADMIN, "produtos", dep))).status, 200, String(k));
  const cheio = await resp(rotaAdminSaude(req("POST", { nome: "Produto a mais" }), env, ADMIN, "produtos", dep));
  assert.equal(cheio.status, 409); assert.match(cheio.j.erro, /até 30 produtos/);
  env.DB.db.prepare("UPDATE docs SET data = json_set(data, '$.situacaoBrasil', json('{\"texto\":\"sem fonte\"}'), '$.marcas', json('[{\"id\":\"ok\",\"nome\":\"Ok\",\"tipo\":\"loja\"},{\"nome\":\"<b>x</b>\",\"tipo\":\"outro\"}]')) WHERE collection = 'saude-produtos' AND id = 'retatrutida'").run();
  const { j } = await resp(rotaSaude(req("GET"), env, ADMIN, "produtos", dep));
  const p = j.produtos.find((x) => x.id === "retatrutida");
  assert.equal(p.situacaoBrasil, undefined, "situação sem fonte não aparece");
  assert.deepEqual(p.marcas.map((m) => m.id), ["ok"], "marca fora do esquema sai, as outras ficam");
  assert.equal(j.produtos.length, 30);
  assert.equal((await rotaSaude(req("POST"), env, ADMIN, "produtos", dep)).status, 405);
  assert.equal((await rotaSaude(req("GET"), env, ADMIN, "outra", dep)).status, 404);
});

// ---------- coleta: filtro por produto ----------
const PRODS = [
  { id: "retatrutida", nome: "Retatrutida", apelidos: ["retatrutide", "LY3437943", "reta"], ativo: true },
  { id: "produto-de-teste", nome: "Produto de Teste", apelidos: ["PT", "teste-xyz"], ativo: true },
  { id: "pausado", nome: "Pausado de teste", apelidos: ["pausadinho"], ativo: false },
];
test("citaProduto: sem acento e sem caixa, palavra inteira; apelido curto só no feed do assunto; pausado não conta", () => {
  assert.equal(S.citaProduto("Novo estudo da RETATRUTIDA sai em 2027", PRODS), "retatrutida");
  assert.equal(S.citaProduto("Retatrutide phase 3 results", PRODS), "retatrutida");
  assert.equal(S.citaProduto("trial of LY3437943 in adults", PRODS), "retatrutida");
  assert.equal(S.citaProduto("Comprei reta e chegou falsificada", PRODS), "retatrutida", "\"reta\" tem 4 letras: vale como palavra inteira");
  assert.equal(S.citaProduto("A secretaria de saúde publicou nota", PRODS), null, "reta dentro de secretaria não conta");
  assert.equal(S.citaProduto("Retatrutidas e retatrutideos", PRODS), null, "pedaço de palavra não conta");
  assert.equal(S.citaProduto("retatrutída, com acento", PRODS), "retatrutida", "sem acento dos dois lados");
  assert.equal(S.citaProduto("Notícia sobre o produto de teste.", PRODS), "produto-de-teste", "nome de várias palavras");
  assert.equal(S.citaProduto("Relato sobre PT na farmácia", PRODS), null, "apelido de 2 letras fora do feed do assunto");
  assert.equal(S.citaProduto("Relato sobre PT na farmácia", PRODS, { assunto: "produto-de-teste" }), "produto-de-teste", "no feed do próprio assunto vale");
  assert.equal(S.citaProduto("Relato sobre PT na farmácia", PRODS, { assunto: "retatrutida" }), null, "o feed de outro assunto não libera");
  assert.equal(S.citaProduto("teste-xyz chegou", PRODS), "produto-de-teste", "hífen vira separador dos dois lados");
  assert.equal(S.citaProduto("pausadinho voltou", PRODS), null, "produto pausado não conta");
  assert.equal(S.citaProduto("", PRODS), null);
  assert.equal(S.citaProduto("Retatrutida", []), null);
  assert.equal(S.citaProduto("Retatrutida", null), null);
});

test("coleta: candidato do radar saude só entra citando produto ativo (título ou trecho), e o Reddit da Saúde vai para a curadoria", async () => {
  const { filtrarPorProduto, juntarFontes } = await import("../src/coleta.js");
  const itens = [
    { titulo: "Título de teste sobre retatrutide", trecho: "" },
    { titulo: "Título de teste sem produto", trecho: "o trecho fala de LY3437943" },
    { titulo: "Secretaria de teste", trecho: "nada aqui" },
    { titulo: "PT em teste", trecho: "" },
  ];
  assert.deepEqual(filtrarPorProduto(itens, PRODS, { radar: "saude" }).map((i) => [i.titulo, i.produto]), [["Título de teste sobre retatrutide", "retatrutida"], ["Título de teste sem produto", "retatrutida"]]);
  assert.equal(filtrarPorProduto(itens, PRODS, { radar: "saude", assunto: "produto-de-teste" }).length, 3);
  assert.deepEqual(filtrarPorProduto(itens, [], { radar: "saude" }), [], "sem produto ativo nada entra");
  // os ativos lidos do banco pela mesma consulta do contrato
  const { env, dep } = await semeado();
  await rotaAdminSaude(req("POST", { nome: "Pausado de teste", ativo: false }), env, ADMIN, "produtos", dep);
  assert.deepEqual((await produtosAtivos(env)).map((p) => p.id), ["retatrutida"]);
  // Rendimento das fontes: subreddit da Saúde conta como feed da curadoria, não como fórum
  const feeds = [["saude", "Subreddit de teste", "", "https://www.reddit.com/r/exemplo/top/.rss?t=day", "reddit"], ["tech", "Sub tech", "", "https://www.reddit.com/r/exemplo2/top/.rss?t=day", "reddit"]];
  const { fontes, semCandidatos } = juntarFontes([], feeds, [], new Map());
  assert.deepEqual(fontes.map((f) => [f.radar, f.tipo]), [["tech", "reddit"]]);
  assert.deepEqual(semCandidatos.map((f) => [f.radar, f.tipo]), [["saude", "rss"]]);
  const j = juntarFontes([{ radar: "saude", fonte: "Subreddit de teste", feed: feeds[0][3], lidos: 4, publicados: 1 }], feeds, [], new Map());
  assert.ok(j.fontes.some((f) => f.radar === "saude" && f.tipo === "rss" && f.lidos === 4));
  // feeds: nada inventado
  assert.deepEqual(FEEDS_SAUDE, []);
  assert.ok(!FEEDS.some((f) => f[0] === "saude"));
  assert.ok(SAUDE_PARA_SONDAR.includes("Anvisa (notícias e alertas)") && SAUDE_PARA_SONDAR.every((x) => !/https?:|\br\//.test(x)), "só nomes, sem URL nem subreddit");
});

// ---------- filtros puros e hash ----------
const FEED = [
  { titulo: "Título de teste 1", tema: "pesquisa", tipo: "estudo", confianca: "cientifica", pais: "US", produto: "retatrutida", marcas: [] },
  { titulo: "Título de teste 2", tema: "regulacao", tipo: "comunicado", confianca: "oficial", pais: "BR", produto: "retatrutida", marcas: [] },
  { titulo: "Título de teste 3", tema: "golpes", tipo: "alerta", confianca: "oficial", pais: "br", produto: "retatrutida", marcas: ["zphc-store"] },
  { titulo: "Título de teste 4", tema: "mercado", tipo: "noticia", confianca: "imprensa", pais: "GB", produto: "retatrutida", marcas: ["synedica", "zphc-store"] },
  { titulo: "Título de teste 5", tema: "relatos", tipo: "relato", confianca: "comunidade", pais: "", produto: "retatrutida" },
  { titulo: "Título de teste 6", tema: "regulacao", tipo: "noticia", confianca: "imprensa", pais: "BR", produto: "produto-de-teste", marcas: ["loja-de-teste"], resumo: "Resumo com Anvisa" },
];
test("filtros puros: produto, marca, tema, tipo, confiança, país e busca; contagem de cada grupo sem o próprio filtro", () => {
  const ids = (f) => S.filtrar(FEED, f).map((i) => Number(i.titulo.slice(-1)));
  assert.deepEqual(ids({}), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(ids({ produto: "retatrutida" }), [1, 2, 3, 4, 5]);
  assert.deepEqual(ids({ produto: "retatrutida", marca: "zphc-store" }), [3, 4]);
  assert.deepEqual(ids({ marca: "loja-de-teste" }), [6]);
  assert.deepEqual(ids({ temas: ["golpes", "relatos"] }), [3, 5]);
  assert.deepEqual(ids({ tipo: "noticia" }), [4, 6]);
  assert.deepEqual(ids({ confianca: "oficial" }), [2, 3]);
  assert.deepEqual(ids({ confianca: "comunidade" }), [5]);
  assert.deepEqual(ids({ pais: "brasil" }), [2, 3, 6], "BR sem diferença de caixa");
  assert.deepEqual(ids({ pais: "fora" }), [1, 4, 5], "fora do Brasil inclui o item sem país");
  assert.deepEqual(ids({ pais: "todos", confianca: "todos", tipo: "todos" }), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(ids({ q: "anvisa" }), [6], "busca no resumo, sem caixa");
  assert.deepEqual(ids({ produto: "retatrutida", temas: ["regulacao"], pais: "brasil", confianca: "oficial" }), [2]);
  const c = S.contar(FEED, { produto: "retatrutida", tema: "golpes", temas: ["golpes"] }, "tema");
  assert.equal(c.todos, 5, "a contagem de tema ignora o filtro de tema");
  assert.equal(c.regulacao, 1);
  assert.deepEqual(S.contar(FEED, { produto: "retatrutida" }, "marca"), { todos: 5, "zphc-store": 2, synedica: 1 });
  assert.deepEqual(S.contar(FEED, { produto: "retatrutida" }, "pais"), { todos: 5, fora: 3, brasil: 2 });
  assert.deepEqual(S.contar(FEED, { confianca: "oficial" }, "confianca").oficial, 2);
  // destaque discreto de golpe e alerta
  assert.deepEqual(S.destaca(FEED[2]), { golpe: true, alerta: true });
  assert.deepEqual(S.destaca(FEED[0]), { golpe: false, alerta: false });
  assert.equal(S.confiancaDe("comunidade").selo, "relato de usuário, não verificado");
  for (const c of S.CONFIANCAS) assert.ok(!/confi[aá]vel|seguro|recomendad|melhor/i.test(c.selo + " " + c.nome), "selo sem veredito: " + c.id);
  // o que vem do localStorage é conferido
  const f = S.filtrosOk({ produto: "retatrutida", marca: "nao-existe", temas: ["golpes", "x"], tipo: "zzz", confianca: "oficial", pais: "fora", q: "  teste  " }, [{ id: "retatrutida", marcas: [{ id: "synedica" }] }]);
  assert.deepEqual(f, { produto: "retatrutida", marca: "", temas: ["golpes"], tipo: "todos", confianca: "oficial", pais: "fora", q: "teste" });
  assert.equal(S.filtrosOk({ produto: "sumiu" }, [{ id: "retatrutida", marcas: [] }]).produto, "", "produto que saiu do radar volta para Todos");
  assert.deepEqual(S.filtrosOk("lixo"), S.FILTROS_VAZIOS());
});

test("hash: #saude, #saude/<produto> e #saude/produtos; endereço estranho cai em Todos", () => {
  assert.deepEqual(S.lerHash("#saude"), { tela: "feed", produto: null });
  assert.deepEqual(S.lerHash("#saude/retatrutida"), { tela: "feed", produto: "retatrutida" });
  assert.deepEqual(S.lerHash("#saude/produtos"), { tela: "produtos", produto: null });
  assert.deepEqual(S.lerHash("#saude/<script>"), { tela: "feed", produto: null });
  assert.equal(S.lerHash("#oficina"), null);
  for (const e of [{ tela: "feed", produto: null }, { tela: "feed", produto: "retatrutida" }, { tela: "produtos", produto: null }]) assert.deepEqual(S.lerHash(S.escreverHash(e)), e);
});

// ---------- contrato da curadoria ----------
test("contrato: a consulta dos ativos e o UPDATE de situacaoBrasil rodam como estão no D1 falso e só mexem nesse campo", async () => {
  const { env, dep } = await semeado();
  await rotaAdminSaude(req("POST", { nome: "Produto de teste", marcas: [{ nome: "Loja de teste", tipo: "loja" }] }), env, ADMIN, "produtos", dep);
  await rotaAdminSaude(req("POST", { nome: "Pausado de teste", ativo: false }), env, ADMIN, "produtos", dep);
  const ativos = (await env.DB.prepare(SQL_PRODUTOS_ATIVOS).all()).results.map((r) => r.id).sort();
  assert.deepEqual(ativos, ["produto-de-teste", "retatrutida"], "o pausado não vem");
  const antes = docDe(env, "retatrutida");
  const at0 = env.DB.db.prepare("SELECT atualizado FROM docs WHERE collection = ? AND id = 'retatrutida'").get(COL).atualizado;
  const r = await env.DB.prepare(SQL_SITUACAO).bind(patchSituacao({ texto: "Texto de teste da situação.", fonte: "https://exemplo.dev/fonte-teste", em: "2026-11-18" }), "retatrutida").run();
  assert.equal(r.meta.changes, 1);
  const depois = docDe(env, "retatrutida");
  assert.deepEqual(depois.situacaoBrasil, { texto: "Texto de teste da situação.", fonte: "https://exemplo.dev/fonte-teste", em: "2026-11-18" });
  const { situacaoBrasil, ...resto } = depois;
  assert.deepEqual(resto, antes, "o resto do doc fica como estava");
  assert.notEqual(env.DB.db.prepare("SELECT atualizado FROM docs WHERE collection = ? AND id = 'retatrutida'").get(COL).atualizado, at0, "atualizado pelo relógio do banco");
  assert.equal(docDe(env, "produto-de-teste").situacaoBrasil, undefined, "chave explícita: só o produto pedido");
  // a leitura mostra a situação; sem fonte, a regra recusa
  const { j } = await resp(rotaSaude(req("GET"), env, ADMIN, "produtos", dep));
  assert.equal(j.produtos.find((p) => p.id === "retatrutida").situacaoBrasil.em, "2026-11-18");
  assert.throws(() => patchSituacao({ texto: "x", em: "2026-11-18" }), /fonte/);
  assert.throws(() => patchSituacao({ texto: "x", fonte: "http://inseguro.dev", em: "2026-11-18" }), /fonte/);
  assert.throws(() => patchSituacao({ texto: "x", fonte: "https://f.dev", em: "18/11/2026" }), /AAAA-MM-DD/);
  assert.throws(() => patchSituacao({ texto: "y".repeat(301), fonte: "https://f.dev", em: "2026-11-18" }), /até 300/);
  assert.ok(/WHERE collection = 'saude-produtos' AND id = \?2$/.test(SQL_SITUACAO) && !/DROP|DELETE/i.test(SQL_SITUACAO));
  // a lista do Admin traz o pausado no fim
  assert.deepEqual((await listaProdutos(env, dep, true)).map((p) => p.id), ["produto-de-teste", "retatrutida", "pausado-de-teste"]);
});

// ---------- limpeza, janela, rotinas e instruções ----------
test("limpeza por idade: notícia, relato e vídeo saem com mais de 365 dias; estudo, alerta, comunicado e análise ficam", async () => {
  const { JANELA_DIAS, limpar } = await import("../src/coleta.js");
  assert.equal(JANELA_DIAS.saude, 14, "janela de candidatos: 14 dias");
  assert.deepEqual(PRAZOS.saude, { noticia: 365, relato: 365, video: 365 });
  const t = AGORA, dias = (n) => new Date(t - n * DIA).toISOString();
  for (const tp of ["noticia", "relato", "video"]) {
    assert.equal(vencido("saude", { tipo: tp, publicado: dias(366) }, "", t), true, tp + " com 366 dias");
    assert.equal(vencido("saude", { tipo: tp, publicado: dias(364) }, "", t), false, tp + " com 364 dias");
  }
  for (const tp of ["estudo", "alerta", "comunicado", "analise"]) assert.equal(vencido("saude", { tipo: tp, publicado: dias(3000) }, "", t), false, tp + " não sai");
  // a limpeza de verdade, no D1 falso: só items-saude por id; produtos e coisas de pessoa ficam
  const { env } = await semeado();
  const ins = (c, id, d, col = "") => env.DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES (?, ?, ?, ?)").run(c, id, JSON.stringify(d), col);
  ins("items-saude", "velha", { tipo: "noticia", publicado: new Date(Date.now() - 400 * DIA).toISOString() });
  ins("items-saude", "estudo-velho", { tipo: "estudo", publicado: new Date(Date.now() - 4000 * DIA).toISOString() });
  ins("items-saude", "nova", { tipo: "relato", publicado: new Date(Date.now() - 10 * DIA).toISOString() });
  ins("favs/a@x.com", "items-saude:velha", { titulo: "favorito de teste" });
  const rel = await limpar(env);
  assert.equal(rel["items-saude"], 1);
  const ficaram = env.DB.db.prepare("SELECT id FROM docs WHERE collection = 'items-saude' ORDER BY id").all().map((r) => r.id);
  assert.deepEqual(ficaram, ["estudo-velho", "nova"]);
  assert.ok(docDe(env, "retatrutida"), "os produtos não passam pela limpeza");
  assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM docs WHERE collection = 'favs/a@x.com'").get().n, 1, "favorito da pessoa fica");
});

test("rotinas: a linha \"Saúde: curadoria\" com os itens da seção; instruções do Admin listam a Saúde", async () => {
  const { env } = await semeado();
  const agora = Date.now();
  env.DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES ('meta', 'status-saude', ?, '')").run(JSON.stringify({ ultimaRodada: new Date(agora - 3600_000).toISOString(), novosNaUltima: 2 }));
  for (const id of ["a", "b"]) env.DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES ('items-saude', ?, '{}', ?)").run(id, new Date(agora - 7200_000).toISOString());
  const r = await relatorio(env, { agora });
  const l = r.curadorias.find((x) => x.id === "curadoria-saude");
  assert.equal(l.nome, "Saúde: curadoria");
  assert.equal(l.estado, "em dia");
  assert.equal(l.itens24h, 2);
  assert.ok(sqlContagens(agora).sql.split("UNION ALL").length <= 5, "nenhum termo a mais no SELECT composto");
  const { rotaAdminCuradoria } = await import("../src/curadoria.js");
  const ins = await (await rotaAdminCuradoria(new Request("https://x/", { method: "GET" }), env, ADMIN, "instrucoes")).json();
  assert.deepEqual(ins.secoes.map((s) => s.secao), SECOES);
  assert.ok(ins.secoes.some((s) => s.secao === "saude" && s.novosNaUltima === 2));
  assert.equal((await rotaAdminCuradoria(new Request("https://x/", { method: "GET" }), env, ADMIN, "instrucoes/saude")).status, 200);
});
