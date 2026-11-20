// Radar de Oficina (pedido de 19/11): permissão da seção, semente, rotas, lista leve, filtros, preços, notas das
// madeiras, contrato da tarefa de levantamento e a seção nas instruções, pedidos e rotinas.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { d1Falso, espelhoFalso } from "./d1-falso.mjs";
import "../public/oficina.js";
import "../public/oficina-icones.js";
import { SEMENTE_VERSAO, CATEGORIAS_FERRAMENTAS, FERRAMENTAS, CATEGORIAS_INSUMOS, INSUMOS, MADEIRAS } from "../src/oficina-semente.js";
import { semearOficina, rotaOficina, rotaAdminOficina, sqlFaltam, sqlPrecoVencido, sqlFechar, corteVencido, sqlLeve, juntarCategorias, estadoLevantamento } from "../src/oficina.js";
import { SECOES as SECOES_CUR, validarPedido } from "../src/curadoria.js";
import { relatorio, SECOES_CUR as ROT_CUR, estadoLevantamentoOficina } from "../src/rotinas.js";
import { catalogoDe } from "../src/painel.js";
import { FEEDS, FEEDS_OFICINA, OFICINA_PARA_SONDAR } from "../src/feeds.js";

register("data:text/javascript," + encodeURIComponent(
  'export async function resolve(s, c, n) { if (s === "cloudflare:workers") return { url: "data:text/javascript,export class DurableObject {}", shortCircuit: true }; return n(s, c); }'));
const { default: worker } = await import("../src/index.js");
const { SECOES, ABERTAS, FECHADAS, calcularSecoes, paraConvidado, secaoDe } = await import("../src/grupos.js");
const { COLECOES_ESPELHO } = await import("../src/espelho.js");

const O = globalThis.Oficina, IC = globalThis.OficinaIcones;
const DIA = 86_400_000;
const AGORA = Date.parse("2026-11-19T15:00:00Z");
const ADMIN = { email: "admin@x.com", admin: true, secoes: null };
const req = (metodo, corpo) => new Request("https://x/api", { method: metodo, headers: { "content-type": "application/json" }, body: corpo == null || metodo === "GET" ? undefined : JSON.stringify(corpo) });
const resp = async (p) => { const r = await p; return { status: r.status, j: await r.json() }; };
const docDe = (env, c, id) => { const r = env.DB.db.prepare("SELECT data FROM docs WHERE collection = ? AND id = ?").get(c, id); return r ? JSON.parse(r.data) : null; };
async function semeado() { const env = { DB: d1Falso() }; await semearOficina(env, AGORA); return { env, dep: espelhoFalso() }; }

// ---------- permissão ----------
test("seção fechada: convidado sem grupo (ou com grupo sem ela) não recebe a Oficina; grupo que a marca libera; Admin vê", () => {
  assert.ok(SECOES.includes("oficina"));
  assert.deepEqual(FECHADAS, ["oficina"]);
  assert.ok(!ABERTAS.includes("oficina"));
  assert.deepEqual(paraConvidado(null), ABERTAS, "sem grupo nenhum: só as abertas");
  assert.deepEqual(paraConvidado(calcularSecoes([], [])), ABERTAS);
  assert.deepEqual(calcularSecoes([{ id: "f", secoes: '["tech","oficina"]', padrao: 0 }], ["f"]), ["tech", "oficina"]);
  assert.deepEqual(calcularSecoes([{ id: "f", secoes: '["tech"]', padrao: 0 }], ["f"]), ["tech"]);
  assert.equal(secaoDe("items-oficina"), "oficina");
  assert.equal(secaoDe("meta", "status-oficina"), "oficina");
  assert.deepEqual(SECOES_CUR, SECOES, "curadoria e grupos com as mesmas seções");
  // widgets: só quem tem a seção
  assert.ok(catalogoDe(null).some((w) => w.id === "destaques-oficina" && w.titulo === "Oficina: destaques do dia"));
  assert.ok(!catalogoDe(ABERTAS).some((w) => w.secao === "oficina"));
  for (const c of ["items-oficina", "destaques-oficina", "oficina-ferramentas", "oficina-insumos", "oficina-madeiras"]) assert.ok(COLECOES_ESPELHO.includes(c), c);
});

test("Worker: quem não tem a seção não vê menu nem rota; o Admin vê e escreve; rotas de Admin dão 404 aos outros", async () => {
  const { env } = await semeado();
  env.DB.db.prepare("INSERT INTO usuarios (email, nome) VALUES ('c@x.com', 'C'), ('g@x.com', 'G')").run();
  env.DB.db.prepare("CREATE TABLE IF NOT EXISTS grupos (id TEXT PRIMARY KEY, nome TEXT NOT NULL, secoes TEXT NOT NULL DEFAULT '[]', padrao INTEGER NOT NULL DEFAULT 0, criado TEXT)").run();
  env.DB.db.prepare("CREATE TABLE IF NOT EXISTS usuario_grupo (email TEXT NOT NULL, grupo TEXT NOT NULL, PRIMARY KEY (email, grupo))").run();
  env.DB.db.prepare("INSERT INTO grupos (id, nome, secoes) VALUES ('oficina', 'Oficina', '[\"tech\",\"oficina\"]')").run();
  env.DB.db.prepare("INSERT INTO usuario_grupo (email, grupo) VALUES ('g@x.com', 'oficina')").run();
  const chamar = (m, c, email, corpo) => worker.fetch(new Request("https://lookout.test" + c, { method: m, headers: { "X-Requested-With": "XMLHttpRequest", "content-type": "application/json" }, body: corpo && m !== "GET" ? JSON.stringify(corpo) : undefined }), { ...env, DEV_EMAIL: email, ADMIN_EMAIL: "admin@x.com" }, { waitUntil() {} });
  const me = await (await chamar("GET", "/api/me", "c@x.com")).json();
  assert.ok(Array.isArray(me.secoes) && !me.secoes.includes("oficina"), "o menu do convidado não traz a Oficina");
  assert.ok(!me.widgets.includes("destaques-oficina"));
  assert.equal((await chamar("GET", "/api/oficina/ferramentas", "c@x.com")).status, 403);
  assert.equal((await chamar("GET", "/api/q?c=items-oficina", "c@x.com")).status, 403);
  assert.equal((await chamar("GET", "/api/doc?c=meta&id=status-oficina", "c@x.com")).status, 403);
  for (const [m, c] of [["POST", "/api/admin/oficina/ferramentas"], ["PUT", "/api/admin/oficina/categorias"], ["DELETE", "/api/admin/oficina/ferramentas/trena"]])
    assert.equal((await chamar(m, c, "c@x.com", {})).status, 404, m + " " + c);
  // grupo com a Oficina
  const meG = await (await chamar("GET", "/api/me", "g@x.com")).json();
  assert.deepEqual(meG.secoes, ["tech", "oficina"]);
  assert.equal((await chamar("GET", "/api/oficina/ferramentas", "g@x.com")).status, 200);
  assert.equal((await chamar("POST", "/api/admin/oficina/ferramentas", "g@x.com", {})).status, 404, "ver não é editar");
  // Admin
  const meA = await (await chamar("GET", "/api/me", "admin@x.com")).json();
  assert.equal(meA.secoes, null);
  const l = await (await chamar("GET", "/api/oficina/ferramentas", "admin@x.com")).json();
  assert.ok(l.admin && l.estado && l.itens.length === FERRAMENTAS.length);
  assert.equal((await chamar("GET", "/api/oficina/madeiras/ipe", "admin@x.com")).status, 200);
});

// ---------- semente ----------
test("semente: cobertura pedida, ids únicos em kebab-case, ícones que existem, só o seguro (detalhes vazios), frases curtas", () => {
  assert.ok(FERRAMENTAS.length >= 180 && FERRAMENTAS.length <= 260, String(FERRAMENTAS.length));
  assert.ok(INSUMOS.length >= 80 && INSUMOS.length <= 140, String(INSUMOS.length));
  assert.ok(MADEIRAS.length >= 60 && MADEIRAS.length <= 100, String(MADEIRAS.length));
  assert.ok(IC.ids.length >= 50 && IC.ids.length <= 70, "de 50 a 70 ícones: " + IC.ids.length);
  for (const [lista, kind, cats] of [[FERRAMENTAS, "ferramentas", CATEGORIAS_FERRAMENTAS], [INSUMOS, "insumos", CATEGORIAS_INSUMOS], [MADEIRAS, "madeiras", []]]) {
    assert.equal(new Set(lista.map((x) => x.id)).size, lista.length, kind + ": ids únicos");
    for (const x of lista) {
      assert.ok(O.ID_OK.test(x.id), x.id);
      for (const k of O.DETALHES[kind]) assert.ok(O.vazio(x.doc[k]), `${kind}/${x.id}: ${k} nasce vazio`);
      if (kind === "madeiras") { assert.ok(O.GRUPOS_MADEIRA.some((g) => g.id === x.doc.grupo) && O.TIPOS_MADEIRA.some((t) => t.id === x.doc.tipo), x.id); continue; }
      const v = O.validarItem(kind, x.doc, { categorias: cats });
      assert.ok(!v.erro, `${x.id}: ${v.erro}`);
      assert.ok(IC.existe(x.doc.icone), `${x.id}: ícone ${x.doc.icone}`);
      assert.ok(x.doc.resumo && x.doc.resumo.length <= 240, x.id);
      assert.equal(x.doc.detalhesEm, null);
    }
    if (cats.length) {
      const v = O.validarCategorias(cats);
      assert.ok(!v.erro, v.erro);
      for (const c of cats) for (const s of c.subcategorias) { assert.ok(IC.existe(s.icone), s.id); assert.ok(lista.some((x) => x.doc.categoria === c.id && x.doc.subcategoria === s.id), "subcategoria vazia: " + s.id); }
    }
  }
  // insumos: a frase em toda subcategoria onde ela é segura, e nos exemplos do pedido
  const sub = (c, s) => O.subDe(CATEGORIAS_INSUMOS, c, s);
  assert.equal(sub("colas", "pva").indicadaPara, "Madeira com madeira em ambiente interno, encaixes e colagem de painéis.");
  assert.equal(sub("fixadores", "chipboard").indicadaPara, "MDF, MDP e madeira macia, sem pré-furo em peças finas.");
  assert.equal(sub("solda-consumiveis", "e6013").indicadaPara, "Solda de aço carbono em chapas finas, uso geral e posição plana.");
  assert.ok(CATEGORIAS_FERRAMENTAS.flatMap((c) => c.subcategorias).some((s) => s.indicadaPara), "Ferramentas também têm frase");
  // as notas das madeiras nunca nascem preenchidas
  for (const m of MADEIRAS) for (const n of O.NOTAS) assert.equal(O.notaDe(m.doc, n.id).nota, null, m.id + " " + n.id);
  // feeds: nenhum endereço inventado
  assert.deepEqual(FEEDS_OFICINA, []);
  assert.ok(!FEEDS.some((f) => f[0] === "oficina"));
  assert.ok(OFICINA_PARA_SONDAR.includes("Paul Sellers") && OFICINA_PARA_SONDAR.every((x) => !/^https?:/.test(x)));
});

test("semente entra uma vez, não pisa no Admin, item tirado não volta; versão nova traz só o que é novo", async () => {
  const { env, dep } = await semeado();
  const n0 = env.DB.db.prepare("SELECT count(*) AS n FROM docs WHERE collection LIKE 'oficina-%'").get().n;
  assert.equal(n0, FERRAMENTAS.length + INSUMOS.length + MADEIRAS.length);
  assert.ok(!("desde" in docDe(env, "oficina-ferramentas", "trena")), "a marca de versão da semente não vai para o doc");
  // o Admin edita e tira
  assert.equal((await resp(rotaAdminOficina(req("PUT", { resumo: "Resumo do Admin." }), env, ADMIN, "ferramentas/trena", dep))).status, 200);
  assert.equal((await resp(rotaAdminOficina(req("DELETE"), env, ADMIN, "ferramentas/serrote-de-ponta", dep))).status, 200);
  assert.equal(await semearOficina(env, AGORA + DIA), 0, "a marca segura a segunda vez");
  assert.equal(docDe(env, "oficina-ferramentas", "trena").resumo, "Resumo do Admin.");
  assert.equal(docDe(env, "oficina-ferramentas", "serrote-de-ponta"), null);
  // marca de versão anterior: INSERT OR IGNORE só dos itens com desde maior; categorias que faltam entram no fim
  env.DB.db.prepare("UPDATE docs SET data = json_set(data, '$.versao', 0) WHERE collection = '_sistema' AND id = 'oficina-semente'").run();
  await semearOficina(env, AGORA + 2 * DIA);
  assert.equal(docDe(env, "oficina-ferramentas", "trena").resumo, "Resumo do Admin.", "INSERT OR IGNORE não sobrescreve");
  const cats = [{ id: "a", nome: "A", subcategorias: [{ id: "x", nome: "X" }] }];
  assert.deepEqual(juntarCategorias(cats, [{ id: "a", nome: "A2", subcategorias: [{ id: "y", nome: "Y" }] }, { id: "b", nome: "B", subcategorias: [] }]).map((c) => [c.id, c.nome, c.subcategorias.map((s) => s.id)]),
    [["a", "A", ["x", "y"]], ["b", "B", []]], "o nome do Admin fica; o que falta entra");
  assert.equal(SEMENTE_VERSAO, 1);
});

// ---------- rotas ----------
test("lista leve: só os campos da grade, com preço resumido, categorias com indicadaPara e o estado para o Admin", async () => {
  const { env, dep } = await semeado();
  await env.DB.prepare(sqlFechar("oficina-ferramentas")).bind(JSON.stringify({ detalhesEm: true, precosEm: true, paraQueServe: ["Medir."],
    precos: { amazon: { min: 20, max: 90, moeda: "BRL", busca: "https://www.amazon.com.br/s?k=trena" }, shopee: { min: 15, max: 60, moeda: "BRL", busca: "https://shopee.com.br/search?keyword=trena" } } }), "trena").run();
  const { status, j } = await resp(rotaOficina(req("GET"), env, ADMIN, "ferramentas", dep));
  assert.equal(status, 200);
  const t = j.itens.find((x) => x.id === "trena");
  assert.deepEqual(Object.keys(t).sort(), ["apelidos", "categoria", "detalhesEm", "icone", "id", "nivel", "nome", "oficios", "preco", "precosEm", "subcategoria", "temDetalhes", "tipo"].sort());
  assert.deepEqual({ min: t.preco.min, max: t.preco.max, lojas: t.preco.lojas }, { min: 15, max: 90, lojas: 2 });
  assert.equal(t.temDetalhes, true);
  assert.ok(!("paraQueServe" in t) && !("precos" in t));
  assert.ok(j.categorias.some((c) => c.subcategorias.some((s) => s.indicadaPara)), "categorias com a frase");
  assert.deepEqual(j.estado, { total: FERRAMENTAS.length, comDetalhes: 1, precoEmDia: 1, precoVencido: 0, semPreco: FERRAMENTAS.length - 1 });
  const conv = await resp(rotaOficina(req("GET"), env, { email: "g@x.com", admin: false, secoes: ["oficina"] }, "insumos", dep));
  assert.equal(conv.j.estado, undefined, "estado do levantamento só para o Admin");
  assert.ok(conv.j.categorias.find((c) => c.id === "colas").subcategorias.find((s) => s.id === "pu").indicadaPara.startsWith("Peças que pegam umidade"));
  assert.ok(/^SELECT id, data FROM docs WHERE 0 UNION ALL SELECT id, json_object\(/.test(sqlLeve("madeiras")), "a forma que o espelho aceita");
  // madeiras: as notas montadas pela regra
  await env.DB.prepare(sqlFechar("oficina-madeiras")).bind(JSON.stringify({ detalhesEm: true, origem: ["BR", "PY"], dureza: { janka: 15620, unidade: "N", fonte: "https://exemplo.dev/j" } }), "ipe").run();
  const md = await resp(rotaOficina(req("GET"), env, ADMIN, "madeiras", dep));
  const ipe = md.j.itens.find((x) => x.id === "ipe");
  assert.equal(ipe.notas.dureza.nota, 5);
  assert.equal(ipe.notas.preco.nota, null, "sem fonte, sem nota");
  assert.deepEqual(ipe.origem, ["BR", "PY"]);
});

test("detalhe: parecidas da mesma subcategoria, alternativas da madeira, campo que não passa no esquema não aparece; 404 e 400", async () => {
  const { env, dep } = await semeado();
  env.DB.db.prepare("UPDATE docs SET data = json_set(data, '$.tutoriais', json('[{\"titulo\":\"x\",\"url\":\"http://inseguro.dev\",\"tipo\":\"video\"}]'), '$.marcas', json('[{\"nome\":\"A\",\"faixa\":\"entrada\",\"fonte\":\"https://f.dev\"}]')) WHERE collection = 'oficina-ferramentas' AND id = 'serrote-universal'").run();
  const { j } = await resp(rotaOficina(req("GET"), env, ADMIN, "ferramentas/serrote-universal", dep));
  assert.ok(j.parecidas.length && j.parecidas.every((p) => p.subcategoria === "serrotes" && p.id !== "serrote-universal"));
  assert.equal(j.item.tutoriais, undefined, "link http não passa");
  assert.equal(j.item.marcas.length, 1);
  await env.DB.prepare(sqlFechar("oficina-madeiras")).bind(JSON.stringify({ detalhesEm: true, alternativas: ["cumaru", "jatoba", "nao-existe"] }), "ipe").run();
  const m = await resp(rotaOficina(req("GET"), env, ADMIN, "madeiras/ipe", dep));
  assert.deepEqual(m.j.alternativas.map((a) => a.id), ["cumaru", "jatoba"]);
  assert.equal((await rotaOficina(req("GET"), env, ADMIN, "ferramentas/nao-existe", dep)).status, 404);
  assert.equal((await rotaOficina(req("GET"), env, ADMIN, "ferramentas/Com Espaco", dep)).status, 400);
  assert.equal((await rotaOficina(req("GET"), env, ADMIN, "outra", dep)).status, 404);
});

test("Admin: validação com mensagem em português (tamanhos, https, valores fechados, loja, categoria) e o ciclo adicionar, editar, tirar", async () => {
  const { env, dep } = await semeado();
  const post = (b, kind = "ferramentas") => resp(rotaAdminOficina(req("POST", b), env, ADMIN, kind, dep));
  const base = { nome: "Serra de teste", categoria: "serras-manuais", subcategoria: "serrotes", oficios: ["marcenaria"], tipo: "manual", nivel: "essencial", resumo: "Serra de teste." };
  for (const [b, msg] of [
    [{ ...base, resumo: "x".repeat(241) }, /Resumo guarda até 240/],
    [{ ...base, tipo: "laser" }, /Tipo: valor fora da lista/],
    [{ ...base, nivel: "" }, /Preencha nível/],
    [{ ...base, oficios: [] }, /ao menos um/],
    [{ ...base, oficios: ["pintura"] }, /fora da lista/],
    [{ ...base, categoria: "nao-tem" }, /Categoria desconhecida/],
    [{ ...base, subcategoria: "plainas-manuais" }, /subcategoria não existe/],
    [{ ...base, fontes: [{ titulo: "x", url: "http://inseguro.dev" }] }, /só endereço https/],
    [{ ...base, precos: { amazon: { min: 10, max: 5, busca: "https://www.amazon.com.br/s?k=x" } } }, /máximo é menor/],
    [{ ...base, precos: { amazon: { min: 10, max: 50, busca: "https://outra-loja.com/s?k=x" } } }, /endereço https da própria loja/],
    [{ ...base, precos: { kabum: { min: 10, max: 50, busca: "https://x.com" } } }, /Loja desconhecida/],
    [{ ...base, marcas: [{ nome: "A", faixa: "a melhor", fonte: "https://f.dev" }] }, /fora da lista/],
  ]) { const r = await post(b); assert.equal(r.status, 400, JSON.stringify(b).slice(0, 80)); assert.match(r.j.erro, msg); }
  const ok = await post({ ...base, precos: { amazon: { min: 10, max: 50, busca: "https://www.amazon.com.br/s?k=serra&tag=afiliado-20" } } });
  assert.equal(ok.status, 200);
  const d = docDe(env, "oficina-ferramentas", ok.j.id);
  assert.equal(d.por, "admin");
  assert.equal(d.precos.amazon.busca, "https://www.amazon.com.br/s?k=serra", "parâmetro de afiliado sai");
  assert.ok(d.precosEm, "preço digitado pelo Admin ganha a data");
  assert.equal((await post(base)).status, 409, "mesmo id");
  // editar: parcial, preço da loja que saiu vira null e some
  assert.equal((await resp(rotaAdminOficina(req("PUT", { precos: { shopee: { min: 5, max: 9, busca: "https://shopee.com.br/search?keyword=serra" } } }), env, ADMIN, "ferramentas/" + ok.j.id, dep))).status, 200);
  assert.deepEqual(Object.keys(docDe(env, "oficina-ferramentas", ok.j.id).precos), ["shopee"]);
  assert.equal((await resp(rotaAdminOficina(req("PUT", { nome: "" }), env, ADMIN, "ferramentas/" + ok.j.id, dep))).status, 400);
  assert.ok(dep.gravados.some((g) => g.id === ok.j.id), "write-through no espelho");
  assert.equal((await resp(rotaAdminOficina(req("DELETE"), env, ADMIN, "ferramentas/" + ok.j.id, dep))).status, 200);
  assert.equal(docDe(env, "oficina-ferramentas", ok.j.id), null);
  // madeira com nota sem fonte
  const mb = { nome: "Madeira de teste", grupo: "importada", tipo: "folhosa", dureza: { janka: 5000 } };
  assert.match((await post(mb, "madeiras")).j.erro, /Nota sem fonte não entra/);
  assert.equal((await post({ ...mb, dureza: { janka: 5000, fonte: "https://f.dev" }, origem: ["br", "PY"] }, "madeiras")).status, 200);
  assert.deepEqual(docDe(env, "oficina-madeiras", "madeira-de-teste").origem, ["BR", "PY"]);
  assert.match((await post({ ...mb, nome: "Outra", origem: ["Brasil"] }, "madeiras")).j.erro, /código de duas letras/);
});

test("categorias: indicadaPara até 160 (categoria e subcategoria), subcategoria com item não sai, e a leitura devolve a frase", async () => {
  const { env, dep } = await semeado();
  const put = (cats, alvo = "insumos-categorias") => resp(rotaAdminOficina(req("PUT", { categorias: cats }), env, ADMIN, alvo, dep));
  const atual = (await resp(rotaOficina(req("GET"), env, ADMIN, "insumos", dep))).j.categorias;
  const longa = JSON.parse(JSON.stringify(atual)); longa[0].subcategorias[0].indicadaPara = "x".repeat(161);
  const r1 = await put(longa);
  assert.equal(r1.status, 400); assert.match(r1.j.erro, /até 160 caracteres/);
  const longaCat = JSON.parse(JSON.stringify(atual)); longaCat[0].indicadaPara = "y".repeat(161);
  assert.equal((await put(longaCat)).status, 400);
  const nova = JSON.parse(JSON.stringify(atual)); nova[0].subcategorias[0].indicadaPara = "Frase nova do Admin."; nova[0].indicadaPara = "";
  assert.equal((await put(nova)).status, 200);
  const lida = (await resp(rotaOficina(req("GET"), env, ADMIN, "insumos", dep))).j.categorias;
  assert.equal(lida[0].subcategorias[0].indicadaPara, "Frase nova do Admin.");
  assert.ok(!("indicadaPara" in lida[0]), "frase vazia sai");
  const sem = JSON.parse(JSON.stringify(atual)); sem[0].subcategorias.shift();
  assert.equal((await put(sem)).status, 409, "subcategoria com item dentro não sai");
  assert.equal(O.indicadaDe(lida, lida[0].id, lida[0].subcategorias[0].id), "Frase nova do Admin.");
  assert.equal((await put([{ nome: "x".repeat(61), subcategorias: [] }], "categorias")).status, 400);
});

// ---------- regras puras ----------
test("filtros, agrupamento por categoria e por ofício, parecidas", () => {
  const l = FERRAMENTAS.map((x) => ({ id: x.id, ...x.doc, preco: x.id === "trena" ? { min: 1, max: 2, lojas: 1 } : null }));
  const so = (f) => O.filtrar(l, f).map((x) => x.id);
  assert.ok(so({ oficios: ["serralheria"] }).every((id) => l.find((x) => x.id === id).oficios.includes("serralheria")));
  assert.deepEqual(so({ comPreco: true }), ["trena"]);
  assert.ok(so({ q: "speed square" }).includes("esquadro-triangular"), "busca pelo apelido");
  assert.ok(so({ q: "ESQUADRIA" }).includes("serra-de-esquadria"), "sem diferença de caixa");
  assert.ok(so({ tipos: ["epi"], niveis: ["essencial"] }).every((id) => { const x = l.find((y) => y.id === id); return x.tipo === "epi" && x.nivel === "essencial"; }));
  const g = O.agruparPorCategoria(l, CATEGORIAS_FERRAMENTAS);
  assert.deepEqual(g.map((c) => c.id), CATEGORIAS_FERRAMENTAS.map((c) => c.id), "na ordem das categorias");
  assert.equal(g.reduce((n, c) => n + c.subs.reduce((k, s) => k + s.itens.length, 0), 0), l.length);
  const po = O.agruparPorOficio(l, CATEGORIAS_FERRAMENTAS);
  assert.deepEqual(po.map((x) => x.id), ["marcenaria", "carpintaria", "serralheria"]);
  const trena = l.find((x) => x.id === "trena");
  assert.equal(po.filter((x) => x.cats.some((c) => c.itens.some((i) => i.id === "trena"))).length, trena.oficios.length, "item de vários ofícios aparece em cada um");
  assert.ok(O.parecidas(l, trena).every((x) => x.subcategoria === trena.subcategoria && x.id !== "trena"));
});

test("preço: URL de busca por loja sem afiliado, faixa em reais e desatualizado depois de 21 dias (relógio injetado)", () => {
  assert.equal(O.urlBusca("amazon", "Serra circular"), "https://www.amazon.com.br/s?k=Serra%20circular");
  assert.equal(O.urlBusca("mercadolivre", "Formão de bancada"), "https://lista.mercadolivre.com.br/formao-de-bancada");
  assert.equal(O.urlBusca("shopee", "Lixa grão 80"), "https://shopee.com.br/search?keyword=Lixa%20gr%C3%A3o%2080");
  assert.ok(O.urlBusca("aliexpress", "trena").startsWith("https://pt.aliexpress.com/wholesale?SearchText="));
  for (const l of O.LOJAS) assert.ok(!/tag=|aff|ref=|utm_/.test(O.urlBusca(l.id, "trena")), l.id);
  assert.equal(O.buscaLimpa("amazon", "https://www.amazon.com.br/s?k=trena&tag=x-20&ref=abc"), "https://www.amazon.com.br/s?k=trena");
  assert.equal(O.buscaLimpa("amazon", "http://www.amazon.com.br/s?k=trena"), null);
  assert.equal(O.buscaLimpa("shopee", "https://www.amazon.com.br/s?k=trena"), null);
  assert.equal(O.faixaTexto({ min: 289, max: 1290 }), "de R$ 289 a R$ 1.290");
  const item = { nome: "Trena", precosEm: "2026-11-01T12:00:00Z", precos: { amazon: { min: 10, max: 20, busca: "https://www.amazon.com.br/s?k=trena" }, shopee: { min: 9, max: 9, busca: "https://shopee.com.br/search?keyword=t", em: "2026-11-18T00:00:00Z" } } };
  const em20 = O.linhasPreco(item, Date.parse("2026-11-21T12:00:00Z")), em23 = O.linhasPreco(item, Date.parse("2026-11-23T12:00:00Z"));
  const de = (l, id) => l.find((x) => x.loja === id);
  assert.equal(de(em20, "amazon").desatualizado, false, "20 dias");
  assert.equal(de(em23, "amazon").desatualizado, true, "22 dias");
  assert.equal(de(em23, "amazon").em, item.precosEm, "sem `em` na loja, vale o precosEm");
  assert.equal(de(em23, "shopee").desatualizado, false);
  assert.equal(de(em23, "aliexpress").tem, false);
  assert.equal(de(em23, "aliexpress").montada, true);
  assert.equal(de(em23, "aliexpress").busca, O.urlBusca("aliexpress", "Trena"));
  assert.deepEqual(em23.map((x) => x.loja), ["aliexpress", "shopee", "mercadolivre", "amazon"]);
});

test("madeiras: faixas do Janka numa tabela só, durabilidade pela classe, raridade e preço só com fonte, bandeiras e comparar", () => {
  assert.deepEqual(O.JANKA_FAIXAS.map((f) => [f.nota, f.min]), [[1, 0], [2, 3000], [3, 5000], [4, 7500], [5, 11000]]);
  for (const [j, n] of [[1700, 1], [2999, 1], [3000, 2], [4999, 2], [5000, 3], [7499, 3], [7500, 4], [10999, 4], [11000, 5], [15620, 5]]) assert.equal(O.notaDureza(j), n, String(j));
  assert.equal(O.notaDureza(3540, "lbf"), 5, "3.540 lbf = 15.746 N");
  assert.equal(O.notaDureza(0), null);
  for (const [c, n] of [["classe 1, muito durável", 5], ["Classe 2", 4], ["classe 3", 3], ["classe 5", 1], ["muito durável", 5], ["durável", 4], ["moderadamente durável", 3], ["pouco durável", 2], ["não durável", 1], ["", null], ["sem dado", null]]) assert.equal(O.notaDurabilidade(c), n, c);
  const m = { dureza: { janka: 1360, unidade: "lbf", fonte: "https://f.dev" }, raridade: { nota: 4, motivo: "m" }, preco: { nota: 3, faixa: "f", fonte: "https://f.dev", em: "2026-11-01" } };
  const ns = O.notasDe(m);
  assert.equal(ns.dureza.nota, 3); assert.equal(ns.dureza.jankaN, 6050); assert.equal(ns.dureza.jankaLbf, 1360);
  assert.equal(ns.raridade.nota, null, "nota de raridade sem fonte fica vazia");
  assert.equal(ns.preco.nota, 3);
  assert.equal(ns.durabilidade.nota, null);
  assert.equal(O.bandeira("BR"), "🇧🇷"); assert.equal(O.bandeira("Brasil"), "");
  assert.deepEqual(O.bandeirasDe(["BR", "PY", "AR", "BO", "PE", "CO", "VE"]).mais, 2);
  assert.equal(O.protegida({ raridade: { status: "CITES Apêndice I" } }), true);
  assert.equal(O.protegida({ raridade: { status: "IUCN: EN" } }), true);
  assert.equal(O.protegida({ durabilidade: { classe: "EN 350 classe 1" } }), false);
  const lista = [{ id: "a", nome: "A", grupo: "nativa-brasil", tipo: "folhosa", origem: ["BR"], notas: { dureza: { nota: 5 }, preco: { nota: 2 } } },
    { id: "b", nome: "B", grupo: "importada", tipo: "conifera", origem: ["US"], notas: { dureza: { nota: 2 } } }, { id: "c", nome: "C", grupo: "nativa-brasil", tipo: "folhosa", origem: ["BR", "PY"], notas: {} }];
  assert.deepEqual(O.filtrarMadeiras(lista, { pais: "BR" }).map((x) => x.id), ["a", "c"]);
  assert.deepEqual(O.filtrarMadeiras(lista, { faixas: { dureza: { min: 4 } } }).map((x) => x.id), ["a"], "sem nota sai quando a faixa está ativa");
  assert.deepEqual(O.filtrarMadeiras(lista, { faixas: { dureza: { min: 1, max: 5 } } }).length, 3, "faixa inteira não filtra");
  assert.deepEqual(O.ordenarMadeiras(lista, "dureza").map((x) => x.id), ["a", "b", "c"]);
  assert.deepEqual(O.filtrarMadeiras([{ id: "x", nome: "Ipê", nomesPopulares: ["pau-d'arco"], nomeCientifico: "Handroanthus spp." }], { q: "handroanthus" }).length, 1);
  assert.equal(O.podeComparar([], lista).pode, false);
  assert.match(O.podeComparar(["a"], lista).motivo, /mais uma/);
  assert.equal(O.podeComparar(["a", "b"], lista).pode, true);
  assert.equal(O.podeComparar(["a", "b", "c", "d", "e"], [...lista, { id: "d" }, { id: "e" }]).pode, false);
});

test("hash: abas, detalhe e comparar; endereço estranho cai na grade", () => {
  assert.deepEqual(O.lerHash("#oficina"), { aba: "conteudos", id: null, comparar: [] });
  assert.deepEqual(O.lerHash("#oficina/ferramentas/serra-circular"), { aba: "ferramentas", id: "serra-circular", comparar: [] });
  assert.deepEqual(O.lerHash("#oficina/madeiras/comparar/ipe,cumaru"), { aba: "madeiras", id: null, comparar: ["ipe", "cumaru"] });
  assert.deepEqual(O.lerHash("#oficina/insumos/<script>"), { aba: "insumos", id: null, comparar: [] });
  assert.equal(O.lerHash("#tech"), null);
  for (const e of [{ aba: "conteudos" }, { aba: "ferramentas", id: "trena" }, { aba: "madeiras", comparar: ["ipe", "teca"] }, { aba: "insumos" }])
    assert.deepEqual(O.lerHash(O.escreverHash(e)), { id: null, comparar: [], ...e });
});

// ---------- contrato da tarefa de levantamento ----------
test("contrato: as três consultas rodam como estão no D1 falso, nas três collections, com as datas pelo relógio do banco", async () => {
  const { env } = await semeado();
  const faltam = (await env.DB.prepare(sqlFaltam("oficina-ferramentas")).bind(500).all()).results;
  assert.equal(faltam.length, FERRAMENTAS.length);
  const nivel = (id) => FERRAMENTAS.find((x) => x.id === id).doc.nivel;
  const ordem = faltam.map((r) => ["essencial", "intermediaria", "avancada"].indexOf(nivel(r.id)));
  assert.deepEqual(ordem, ordem.slice().sort((a, b) => a - b), "essencial, intermediária, avançada");
  // fechar com a hora do D1: detalhesEm e precosEm vêm do strftime, não do patch
  await env.DB.prepare(sqlFechar("oficina-ferramentas")).bind(JSON.stringify({ detalhesEm: true, precosEm: "2001-01-01", paraQueServe: ["Medir."] }), "trena").run();
  const t = docDe(env, "oficina-ferramentas", "trena");
  assert.ok(Date.now() - Date.parse(t.detalhesEm) < 60_000 && t.precosEm === t.detalhesEm, "as duas datas pelo relógio do banco");
  assert.deepEqual(t.paraQueServe, ["Medir."]);
  assert.ok(!(await env.DB.prepare(sqlFaltam("oficina-ferramentas")).bind(500).all()).results.some((r) => r.id === "trena"));
  // patch só de detalhe não mexe no precosEm
  await env.DB.prepare(sqlFechar("oficina-ferramentas")).bind(JSON.stringify({ detalhesEm: true }), "metro-articulado").run();
  assert.equal(docDe(env, "oficina-ferramentas", "metro-articulado").precosEm, null);
  const venc = (await env.DB.prepare(sqlPrecoVencido("oficina-ferramentas")).bind(corteVencido(), 1000).all()).results;
  assert.ok(!venc.some((r) => r.id === "trena"), "pesquisado agora não está vencido");
  assert.equal(venc.length, FERRAMENTAS.length - 1);
  const vencDepois = (await env.DB.prepare(sqlPrecoVencido("oficina-ferramentas")).bind(corteVencido(Date.now() + 8 * DIA), 1000).all()).results;
  assert.ok(vencDepois.some((r) => r.id === "trena"), "oito dias depois, vencido");
  for (const c of ["oficina-insumos", "oficina-madeiras"]) {
    assert.ok((await env.DB.prepare(sqlFaltam(c)).bind(5).all()).results.length === 5, c);
    await env.DB.prepare(sqlFechar(c)).bind(JSON.stringify({ detalhesEm: true }), c === "oficina-madeiras" ? "ipe" : "cola-pu").run();
    assert.ok(docDe(env, c, c === "oficina-madeiras" ? "ipe" : "cola-pu").detalhesEm);
    await env.DB.prepare(sqlPrecoVencido(c)).bind(corteVencido(), 5).all();
  }
  assert.throws(() => sqlFaltam("items"), /fora da Oficina/);
  assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM docs WHERE collection = 'oficina-ferramentas' AND atualizado IS NULL").get().n, 0);
  // estado para o Admin
  const e = estadoLevantamento("ferramentas", [{ temDetalhes: true, precosEm: new Date().toISOString() }, { temDetalhes: false, precosEm: "2020-01-01" }, { temDetalhes: false, precosEm: null }]);
  assert.deepEqual(e, { total: 3, comDetalhes: 1, precoEmDia: 1, precoVencido: 1, semPreco: 1 });
});

test("rotinas, instruções e pedidos: a Oficina entra em todos, com a linha do levantamento", async () => {
  assert.ok(ROT_CUR.some(([s, , n]) => s === "oficina" && n === "Oficina: curadoria"));
  assert.ok(!validarPedido({ secao: "oficina", texto: "Traga vídeos de afiação de formão." }).erro);
  const { env } = await semeado();
  const agora = Date.now();
  let r = await relatorio(env, { agora });
  let l = r.curadorias.find((x) => x.id === "oficina-levantamento");
  assert.equal(l.nome, "Oficina: levantamento das ferramentas");
  assert.equal(l.estado, "parada", "catálogo semeado e nada levantado");
  assert.equal(l.faltam, FERRAMENTAS.length);
  assert.equal(l.precoVencido, FERRAMENTAS.length);
  assert.equal(r.curadorias.find((x) => x.id === "curadoria-oficina").nome, "Oficina: curadoria");
  await env.DB.prepare(sqlFechar("oficina-ferramentas")).bind(JSON.stringify({ detalhesEm: true, precosEm: true }), "trena").run();
  r = await relatorio(env, { agora });
  l = r.curadorias.find((x) => x.id === "oficina-levantamento");
  assert.equal(l.estado, "em dia", "gravou há pouco");
  assert.equal(l.faltam, FERRAMENTAS.length - 1);
  assert.equal(l.madeiras.faltam, MADEIRAS.length);
  assert.ok(l.idadeMin <= 1);
  assert.equal(estadoLevantamentoOficina({ "oficina-ferramentas": { faltam: 3, vencidos: 0, ultima: new Date(agora - 10 * DIA).toISOString() } }, agora).estado, "atrasada");
  assert.equal(estadoLevantamentoOficina({ "oficina-ferramentas": { faltam: 3, vencidos: 0, ultima: new Date(agora - 20 * DIA).toISOString() } }, agora).estado, "parada");
  assert.equal(estadoLevantamentoOficina({}, agora).estado, "em dia");
});
