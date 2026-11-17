// Curadoria pelo Lookout (pedido de 17/11): instruções de cada seção com versão e histórico, pedidos à curadoria com o
// "rodar agora" e as travas, a leitura forçada dos feeds e a limpeza dos pedidos fechados. As consultas do contrato com
// as tarefas agendadas rodam aqui exatamente como estão em docs/LOOKOUT.md, para garantir que elas leem e fecham pedidos.
// O Worker inteiro (src/index.js) carrega em Node com "cloudflare:workers" trocado por uma classe vazia; D1 em SQLite.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { d1Falso } from "./d1-falso.mjs";
import { SECOES as SECOES_CUR, LIMITES, ID_PEDIDO, idHistorico, inicioDoDiaSP, validarInstrucoes, validarPedido, pedidosParaApagar, limparPedidos } from "../src/curadoria.js";
import { coletar, limpar, FORCADA, andamentoForcada, ehReddit } from "../src/coleta.js";
import { FEEDS } from "../src/feeds.js";

register("data:text/javascript," + encodeURIComponent(
  'export async function resolve(s, c, n) { if (s === "cloudflare:workers") return { url: "data:text/javascript,export class DurableObject {}", shortCircuit: true }; return n(s, c); }'));
const { default: worker } = await import("../src/index.js");
const { COLECOES_ESPELHO, PREFIXOS_PESSOAIS } = await import("../src/espelho.js");
const { SECOES } = await import("../src/grupos.js");

const DIA = 86_400_000;
const ADMIN = "admin@x.com", CONVIDADO = "a@x.com";
const ctx = { waitUntil() {} };
function envWorker() {
  const DB = d1Falso();
  DB.db.prepare("INSERT INTO usuarios (email, nome) VALUES (?, ?)").run(CONVIDADO, "A");
  return { DB, ADMIN_EMAIL: ADMIN };
}
const chamar = (env, metodo, caminho, corpo, email = ADMIN, tipo = "application/json") => worker.fetch(new Request("https://lookout.test" + caminho, {
  method: metodo, headers: { "X-Requested-With": "XMLHttpRequest", ...(corpo !== undefined ? { "content-type": tipo } : {}) }, body: corpo === undefined ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo),
}), { ...env, DEV_EMAIL: email }, ctx);
const jsonDe = async (r) => ({ status: r.status, ...(await r.json()) });
const texto = (n, c = "a") => ("Regra " + c + ". ").repeat(Math.ceil(n / 9)).slice(0, n);
const linhas = (env, c) => env.DB.db.prepare("SELECT id, data, atualizado FROM docs WHERE collection = ? ORDER BY id").all(c).map((r) => ({ id: r.id, atualizado: r.atualizado, ...JSON.parse(r.data) }));

// As consultas do contrato, copiadas de docs/LOOKOUT.md ("Curadoria: instruções, pedidos e plantão")
const SQL_INSTRUCAO = "SELECT data FROM docs WHERE collection = 'instrucoes' AND id = ?";
const SQL_PENDENTES = "SELECT id, data FROM docs WHERE collection = 'pedidos-curadoria' AND json_extract(data, '$.secao') = ? AND json_extract(data, '$.estado') = 'pendente'";
const SQL_FECHAR = "UPDATE docs SET data = json_patch(data, ?), atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE collection = 'pedidos-curadoria' AND id = ?";
const SQL_PLANTAO = "SELECT id, data FROM docs WHERE collection = 'pedidos-curadoria' AND json_extract(data, '$.agora') = 1 AND json_extract(data, '$.estado') = 'pendente'";
// As tarefas falam com o D1 pelo conector: aqui, o mesmo SQL pela API do D1 (prepare, bind, all/first/run)
const tarefaLe = async (env, secao) => (await env.DB.prepare(SQL_PENDENTES).bind(secao).all()).results.map((r) => ({ id: r.id, ...JSON.parse(r.data) }));
const tarefaFecha = (env, id, patch) => env.DB.prepare(SQL_FECHAR).bind(JSON.stringify(patch), id).run();
const plantao = async (env) => (await env.DB.prepare(SQL_PLANTAO).all()).results.map((r) => ({ id: r.id, ...JSON.parse(r.data) }));

// ---------- acesso ----------

test("quem não é Admin leva 404 em todas as rotas, e nada é gravado; sem JSON, 415", async () => {
  const env = envWorker();
  const casos = [["GET", "/api/admin/instrucoes"], ["GET", "/api/admin/instrucoes/tech"], ["GET", "/api/admin/instrucoes/tech/1"], ["PUT", "/api/admin/instrucoes/tech", { texto: texto(600), versao: 0 }],
    ["GET", "/api/admin/pedidos"], ["POST", "/api/admin/pedidos", { secao: "tech", texto: "x" }], ["PUT", "/api/admin/pedidos/p0123456789abcdef", { acao: "cancelar" }], ["DELETE", "/api/admin/pedidos/p0123456789abcdef"],
    ["GET", "/api/admin/coleta-agora"], ["POST", "/api/admin/coleta-agora", {}]];
  for (const [m, c, b] of casos) {
    const r = await jsonDe(await chamar(env, m, c, b, CONVIDADO));
    assert.equal(r.status, 404, `${m} ${c}`);
    assert.equal(r.erro, "rota", "o mesmo corpo do 404 do Landscape");
    // quem nem foi convidado não chega até aqui
    assert.equal((await chamar(env, m, c, b, "estranho@x.com")).status, 403, "não convidado: " + c);
  }
  assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM docs WHERE collection IN ('instrucoes', 'instrucoes-hist', 'pedidos-curadoria') OR (collection = '_sistema' AND id = 'coleta-forcada')").get().n, 0);
  assert.equal((await chamar(env, "POST", "/api/admin/pedidos", "secao=tech", ADMIN, "application/x-www-form-urlencoded")).status, 415);
  assert.equal((await chamar(env, "PUT", "/api/admin/instrucoes/tech", JSON.stringify({ texto: texto(600), versao: 0 }), ADMIN, "text/plain")).status, 415);
  assert.equal((await chamar(env, "GET", "/api/admin/pedidos/%E0%A4%A")).status, 400, "caminho malformado");
});

test("as collections da curadoria não vão para o espelho nem saem por /api/q e /api/doc", async () => {
  const env = envWorker();
  await chamar(env, "PUT", "/api/admin/instrucoes/tech", { texto: texto(600), versao: 0 });
  await chamar(env, "POST", "/api/admin/pedidos", { secao: "tech", texto: "Procurar sobre o Kubernetes 1.35" });
  for (const c of ["instrucoes", "instrucoes-hist", "pedidos-curadoria"]) {
    assert.ok(!COLECOES_ESPELHO.includes(c), c + " fora do espelho");
    assert.ok(!PREFIXOS_PESSOAIS.some((p) => c.startsWith(p)), c + " não é dado pessoal");
    for (const email of [ADMIN, CONVIDADO]) {
      assert.equal((await chamar(env, "GET", `/api/q?c=${c}`, undefined, email)).status, 400, "/api/q " + c);
      assert.equal((await chamar(env, "GET", `/api/doc?c=${c}&id=tech`, undefined, email)).status, 400, "/api/doc " + c);
    }
  }
  assert.deepEqual(SECOES_CUR, SECOES, "a lista de seções de src/curadoria.js é a de src/grupos.js");
});

// ---------- instruções ----------

test("instruções: ler vazio, gravar a primeira, a tarefa lê pelo SQL do contrato, gravar de novo guarda o histórico", async () => {
  const env = envWorker();
  env.DB.db.prepare("INSERT INTO docs (collection, id, data) VALUES ('meta', 'status-negocios', ?)").run(JSON.stringify({ ultimaRodada: "2026-11-17T13:41:00Z", novosNaUltima: 7 }));
  let r = await jsonDe(await chamar(env, "GET", "/api/admin/instrucoes"));
  assert.equal(r.status, 200);
  assert.deepEqual(r.secoes.map((s) => s.secao), SECOES);
  assert.ok(r.secoes.every((s) => s.vazia && s.versao === 0 && s.tamanho === 0));
  assert.deepEqual(r.secoes.find((s) => s.secao === "negocios"), { secao: "negocios", versao: 0, atualizado: null, tamanho: 0, vazia: true, ultimaRodada: "2026-11-17T13:41:00Z", novosNaUltima: 7 });
  r = await jsonDe(await chamar(env, "GET", "/api/admin/instrucoes/tech"));
  assert.deepEqual([r.existe, r.doc, r.historico], [false, null, []]);

  const t1 = texto(800, "um"), t2 = texto(900, "dois");
  r = await jsonDe(await chamar(env, "PUT", "/api/admin/instrucoes/tech", { texto: t1, versao: 0 }));
  assert.equal(r.status, 200); assert.equal(r.versao, 1);
  const lido = JSON.parse((await env.DB.prepare(SQL_INSTRUCAO).bind("tech").first()).data);
  assert.deepEqual(Object.keys(lido).sort(), ["atualizado", "por", "texto", "versao"]);
  assert.deepEqual([lido.texto, lido.versao, lido.por], [t1, 1, "admin"]);
  assert.match(lido.atualizado, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.deepEqual(linhas(env, "instrucoes-hist"), [], "a primeira não tem anterior");

  r = await jsonDe(await chamar(env, "PUT", "/api/admin/instrucoes/tech", { texto: t2, versao: 1 }));
  assert.equal(r.versao, 2);
  const hist = linhas(env, "instrucoes-hist");
  assert.deepEqual(hist.map((h) => h.id), ["tech-00001"]);
  assert.deepEqual([hist[0].texto, hist[0].versao, hist[0].por], [t1, 1, "admin"], "o histórico guarda o doc daquela versão");
  r = await jsonDe(await chamar(env, "GET", "/api/admin/instrucoes/tech"));
  assert.deepEqual([r.doc.texto, r.doc.versao, r.historico.map((h) => h.versao)], [t2, 2, [1]]);
  // texto de uma versão: a atual e uma do histórico; versão que não existe; formato errado; seção desconhecida
  assert.deepEqual(await jsonDe(await chamar(env, "GET", "/api/admin/instrucoes/tech/1")), { status: 200, secao: "tech", versao: 1, texto: t1, atualizado: hist[0].atualizado, atual: false });
  assert.equal((await jsonDe(await chamar(env, "GET", "/api/admin/instrucoes/tech/2"))).atual, true);
  assert.equal((await chamar(env, "GET", "/api/admin/instrucoes/tech/9")).status, 404);
  assert.equal((await chamar(env, "GET", "/api/admin/instrucoes/tech/abc")).status, 400);
  assert.equal((await chamar(env, "GET", "/api/admin/instrucoes/tech/0")).status, 400);
  assert.equal((await chamar(env, "GET", "/api/admin/instrucoes/cripto")).status, 404);
  assert.equal((await chamar(env, "PUT", "/api/admin/instrucoes/cripto", { texto: t1, versao: 0 })).status, 404);
  assert.equal((await chamar(env, "DELETE", "/api/admin/instrucoes/tech")).status, 405, "instrução não se apaga pela rota");
  // a lista mostra a versão e o tamanho; as outras seções seguem vazias
  r = await jsonDe(await chamar(env, "GET", "/api/admin/instrucoes"));
  assert.deepEqual(r.secoes.filter((s) => !s.vazia).map((s) => [s.secao, s.versao, s.tamanho]), [["tech", 2, t2.length]]);
});

test("instruções: conflito de versão (duas abas) dá 409 e não grava; limites de 500 e 60.000 caracteres", async () => {
  const env = envWorker();
  await chamar(env, "PUT", "/api/admin/instrucoes/politica", { texto: texto(600), versao: 0 });
  await chamar(env, "PUT", "/api/admin/instrucoes/politica", { texto: texto(700), versao: 1 });
  // a segunda aba ainda leu a versão 1
  let r = await jsonDe(await chamar(env, "PUT", "/api/admin/instrucoes/politica", { texto: texto(650, "aba velha"), versao: 1 }));
  assert.equal(r.status, 409); assert.equal(r.versao, 2); assert.match(r.erro, /outra aba/);
  // a primeira gravação também confere: versão 1 quando o banco ainda está vazio
  assert.equal((await chamar(env, "PUT", "/api/admin/instrucoes/esportes", { texto: texto(600), versao: 1 })).status, 409);
  assert.equal(JSON.parse(env.DB.db.prepare("SELECT data FROM docs WHERE collection = 'instrucoes' AND id = 'politica'").get().data).texto.length, 700, "o 409 não gravou");
  assert.equal(linhas(env, "instrucoes-hist").length, 1);
  // tamanho: 499 e 60.001 não; 500 e 60.000 sim, com o motivo no 400
  r = await jsonDe(await chamar(env, "PUT", "/api/admin/instrucoes/politica", { texto: texto(499), versao: 2 }));
  assert.equal(r.status, 400); assert.match(r.erro, /499 caracteres; o mínimo é 500/);
  r = await jsonDe(await chamar(env, "PUT", "/api/admin/instrucoes/politica", { texto: texto(60_001), versao: 2 }));
  assert.equal(r.status, 400); assert.match(r.erro, /máximo é 60\.000/);
  assert.equal((await jsonDe(await chamar(env, "PUT", "/api/admin/instrucoes/politica", { texto: texto(500), versao: 2 }))).versao, 3);
  assert.equal((await jsonDe(await chamar(env, "PUT", "/api/admin/instrucoes/politica", { texto: texto(60_000), versao: 3 }))).versao, 4);
  // corpo sem texto, sem versão, versão quebrada, JSON quebrado
  for (const b of [{ versao: 4 }, { texto: texto(600) }, { texto: texto(600), versao: "4" }, { texto: texto(600), versao: 4.5 }, { texto: 600, versao: 4 }, "{nada"])
    assert.equal((await chamar(env, "PUT", "/api/admin/instrucoes/politica", b)).status, 400, JSON.stringify(b));
  assert.equal(validarInstrucoes("x\r\n".repeat(250)).texto.length, 500, "CRLF vira LF antes de contar");
});

test("instruções: o histórico fica com as 30 últimas por seção, cortadas por collection e lista de ids", async () => {
  const env = envWorker();
  await chamar(env, "PUT", "/api/admin/instrucoes/negocios", { texto: texto(600), versao: 0 });
  await chamar(env, "PUT", "/api/admin/instrucoes/negocios", { texto: texto(610), versao: 1 }); // outra seção: não é cortada
  for (let v = 0; v < 35; v++) assert.equal((await chamar(env, "PUT", "/api/admin/instrucoes/investimentos", { texto: texto(600 + v), versao: v })).status, 200);
  const ids = linhas(env, "instrucoes-hist").map((h) => h.id);
  const inv = ids.filter((i) => i.startsWith("investimentos-"));
  assert.equal(inv.length, 30);
  assert.deepEqual([inv[0], inv[29]], [idHistorico("investimentos", 5), "investimentos-00034"], "saem as mais antigas; a 35 é a atual");
  assert.deepEqual(ids.filter((i) => i.startsWith("negocios-")), ["negocios-00001"]);
  const deletes = env.DB.log.filter((s) => /^DELETE/i.test(s));
  assert.ok(deletes.length >= 1);
  for (const s of deletes) assert.match(s, /^DELETE FROM docs WHERE collection = 'instrucoes-hist' AND id IN \(\?1(,\?\d+)*\)$/, "só por lista de ids");
  const r = await jsonDe(await chamar(env, "GET", "/api/admin/instrucoes/investimentos"));
  assert.deepEqual([r.historico.length, r.historico[0].versao, r.historico[29].versao], [30, 34, 5], "mais nova primeiro");
  assert.equal((await chamar(env, "GET", "/api/admin/instrucoes/investimentos/4")).status, 404, "a cortada não volta");
});

// ---------- pedidos ----------

test("pedidos: criar, a tarefa lê os pendentes e fecha pelo SQL do contrato; pedido fixo nunca fecha", async () => {
  const env = envWorker();
  let r = await jsonDe(await chamar(env, "POST", "/api/admin/pedidos", { secao: "tech", texto: "  Incluir https://exemplo.dev/post sobre o Postgres 18  " }));
  assert.equal(r.status, 201);
  const p1 = r.pedido;
  assert.match(p1.id, ID_PEDIDO);
  const doc = linhas(env, "pedidos-curadoria")[0];
  const { id, atualizado, ...data } = doc;
  assert.deepEqual(Object.keys(data).sort(), ["agora", "atendidoEm", "criado", "estado", "fixo", "itens", "resposta", "secao", "texto"]);
  assert.deepEqual({ ...data, criado: "" }, { secao: "tech", texto: "Incluir https://exemplo.dev/post sobre o Postgres 18", agora: false, fixo: false, estado: "pendente", criado: "", atendidoEm: null, resposta: null, itens: null });
  const fixo = (await jsonDe(await chamar(env, "POST", "/api/admin/pedidos", { secao: "tech", texto: "Sempre olhar o blog do Kubernetes", fixo: true }))).pedido;
  await chamar(env, "POST", "/api/admin/pedidos", { secao: "esportes", texto: "Procurar o Gauchão feminino" });

  // a tarefa de Tech lê os pendentes dela
  const lidos = await tarefaLe(env, "tech");
  assert.deepEqual(lidos.map((p) => p.id).sort(), [p1.id, fixo.id].sort());
  // fecha o normal com estado; o fixo só com atendidoEm, resposta e itens
  await tarefaFecha(env, p1.id, { estado: "atendido", atendidoEm: "2026-11-17T13:30:00.000Z", resposta: "Entrou o post do Postgres 18.", itens: 1 });
  await tarefaFecha(env, fixo.id, { atendidoEm: "2026-11-17T13:30:00.000Z", resposta: "Dois posts novos do blog.", itens: 2 });
  assert.deepEqual((await tarefaLe(env, "tech")).map((p) => p.id), [fixo.id], "o fixo continua pendente");
  r = await jsonDe(await chamar(env, "GET", "/api/admin/pedidos"));
  const porId = new Map(r.pedidos.map((p) => [p.id, p]));
  assert.deepEqual([porId.get(p1.id).estado, porId.get(p1.id).resposta, porId.get(p1.id).itens], ["atendido", "Entrou o post do Postgres 18.", 1]);
  assert.deepEqual([porId.get(fixo.id).estado, porId.get(fixo.id).fixo, porId.get(fixo.id).itens], ["pendente", true, 2]);
  assert.ok(linhas(env, "pedidos-curadoria").find((p) => p.id === p1.id).atualizado >= atualizado, "o UPDATE da tarefa mexe no atualizado");
  assert.equal(r.pedidos.length, 3);
  assert.deepEqual(r.pedidos.map((p) => p.criado), [...r.pedidos.map((p) => p.criado)].sort().reverse(), "mais novos primeiro");
});

test("pedidos: validações do POST", async () => {
  const env = envWorker();
  const casos = [
    [{ secao: "tech" }, /Escreva/], [{ secao: "tech", texto: "   " }, /Escreva/], [{ secao: "tech", texto: "x".repeat(501) }, /501 caracteres/],
    [{ secao: "cripto", texto: "x" }, /seção/], [{ texto: "x" }, /seção/], [{ secao: "tech", texto: 3 }, /texto/],
    [{ secao: "tech", agora: "sim" }, /sim ou não/], [{ secao: "tech", texto: "x", fixo: 1 }, /sim ou não/],
    [{ secao: "tech", agora: true, fixo: true }, /toda rodada/], ["[1,2]", /json/], ["{quebrado", /json/],
  ];
  for (const [b, msg] of casos) {
    const r = await jsonDe(await chamar(env, "POST", "/api/admin/pedidos", b));
    assert.equal(r.status, 400, JSON.stringify(b)); assert.match(r.erro, msg);
  }
  assert.equal((await chamar(env, "POST", "/api/admin/pedidos", { secao: "tech", texto: "x".repeat(500) })).status, 201, "500 cabe");
  assert.equal((await chamar(env, "POST", "/api/admin/pedidos", JSON.stringify({ secao: "tech", texto: "x".repeat(9000) }))).status, 413);
  assert.equal(validarPedido({ secao: "tech", texto: "", agora: true }).pedido.texto, "", "rodar agora sem texto vale");
  // no máximo 50 pendentes comuns por seção
  for (let i = 1; i < LIMITES.PENDENTES_POR_SECAO; i++) await chamar(env, "POST", "/api/admin/pedidos", { secao: "tech", texto: "pedido " + i });
  assert.equal((await chamar(env, "POST", "/api/admin/pedidos", { secao: "tech", texto: "um a mais" })).status, 400);
  assert.equal((await chamar(env, "POST", "/api/admin/pedidos", { secao: "tech", agora: true })).status, 201, "o rodar agora não entra nessa conta");
});

test("rodar agora: um pendente por seção (o segundo devolve o mesmo), o plantão acha, e no máximo 6 por seção por dia", async () => {
  const env = envWorker();
  const a1 = await jsonDe(await chamar(env, "POST", "/api/admin/pedidos", { secao: "negocios", agora: true }));
  assert.equal(a1.status, 201); assert.deepEqual([a1.pedido.texto, a1.pedido.agora, a1.pedido.fixo], ["", true, false]);
  const a2 = await jsonDe(await chamar(env, "POST", "/api/admin/pedidos", { secao: "negocios", agora: true, texto: "e também isto" }));
  assert.equal(a2.status, 200); assert.equal(a2.existente, true); assert.equal(a2.pedido.id, a1.pedido.id);
  const b1 = await jsonDe(await chamar(env, "POST", "/api/admin/pedidos", { secao: "politica", agora: true, texto: "Procurar a votação de hoje no Senado" }));
  assert.equal(b1.status, 201, "outra seção tem a sua vez");
  await chamar(env, "POST", "/api/admin/pedidos", { secao: "negocios", texto: "pedido comum" });
  // o plantão procura agora = 1 e pendente, em qualquer seção
  assert.deepEqual((await plantao(env)).map((p) => p.secao).sort(), ["negocios", "politica"]);
  // a rodada fecha o pedido; um novo "rodar agora" passa; até 6 no dia (os já fechados contam)
  let ultimo = a1.pedido.id;
  for (let n = 2; n <= 6; n++) {
    await tarefaFecha(env, ultimo, { estado: n % 2 ? "sem-resultado" : "atendido", atendidoEm: new Date().toISOString(), resposta: "Rodada feita.", itens: n % 2 ? 0 : 3 });
    const r = await jsonDe(await chamar(env, "POST", "/api/admin/pedidos", { secao: "negocios", agora: true }));
    assert.equal(r.status, 201, "rodada " + n); ultimo = r.pedido.id;
  }
  await tarefaFecha(env, ultimo, { estado: "atendido", atendidoEm: new Date().toISOString(), resposta: "ok", itens: 1 });
  const r7 = await jsonDe(await chamar(env, "POST", "/api/admin/pedidos", { secao: "negocios", agora: true }));
  assert.equal(r7.status, 429); assert.match(r7.erro, /6 rodadas/);
  // pedido de ontem (dia de São Paulo) não conta
  env.DB.db.prepare("UPDATE docs SET data = json_set(data, '$.criado', ?) WHERE collection = 'pedidos-curadoria' AND id = ?").run(new Date(Date.parse(inicioDoDiaSP()) - 1000).toISOString(), ultimo);
  assert.equal((await chamar(env, "POST", "/api/admin/pedidos", { secao: "negocios", agora: true })).status, 201);
  assert.equal(inicioDoDiaSP(Date.parse("2026-11-17T02:00:00Z")), "2026-11-16T03:00:00.000Z", "23h em São Paulo ainda é o dia 16");
  assert.equal(inicioDoDiaSP(Date.parse("2026-11-17T03:00:00Z")), "2026-11-17T03:00:00.000Z");
});

test("pedidos: editar texto e fixo, cancelar, reabrir, excluir", async () => {
  const env = envWorker();
  const p = (await jsonDe(await chamar(env, "POST", "/api/admin/pedidos", { secao: "investimentos", texto: "Procurar sobre o IFIX" }))).pedido;
  const url = "/api/admin/pedidos/" + p.id;
  let r = await jsonDe(await chamar(env, "PUT", url, { texto: "Procurar sobre o IFIX e o IFIX-L", fixo: true }));
  assert.deepEqual([r.status, r.pedido.texto, r.pedido.fixo, r.pedido.estado], [200, "Procurar sobre o IFIX e o IFIX-L", true, "pendente"]);
  assert.equal((await chamar(env, "PUT", url, { texto: "" })).status, 400, "pedido comum precisa de texto");
  assert.equal((await chamar(env, "PUT", url, { texto: "y".repeat(501) })).status, 400);
  assert.equal((await chamar(env, "PUT", url, { acao: "apagar" })).status, 400);
  r = await jsonDe(await chamar(env, "PUT", url, { acao: "cancelar" }));
  assert.equal(r.pedido.estado, "cancelado");
  assert.deepEqual(await tarefaLe(env, "investimentos"), [], "cancelado sai da leitura da tarefa");
  assert.equal((await chamar(env, "PUT", url, { acao: "cancelar" })).status, 409);
  // atendido e depois reaberto: volta pendente, sem a resposta antiga
  await chamar(env, "PUT", url, { acao: "reabrir" });
  await tarefaFecha(env, p.id, { estado: "atendido", atendidoEm: "2026-11-17T10:00:00.000Z", resposta: "Feito.", itens: 2 });
  r = await jsonDe(await chamar(env, "PUT", url, { acao: "reabrir" }));
  assert.deepEqual([r.pedido.estado, r.pedido.atendidoEm, r.pedido.resposta, r.pedido.itens], ["pendente", null, null, null]);
  assert.equal((await chamar(env, "PUT", url, { acao: "reabrir" })).status, 409, "já está pendente");
  // rodar agora: não vira fixo, e reabrir com outro pendente na seção dá 409
  const a = (await jsonDe(await chamar(env, "POST", "/api/admin/pedidos", { secao: "investimentos", agora: true }))).pedido;
  assert.equal((await chamar(env, "PUT", "/api/admin/pedidos/" + a.id, { fixo: true })).status, 400);
  await chamar(env, "PUT", "/api/admin/pedidos/" + a.id, { acao: "cancelar" });
  const a2 = (await jsonDe(await chamar(env, "POST", "/api/admin/pedidos", { secao: "investimentos", agora: true }))).pedido;
  assert.notEqual(a2.id, a.id);
  assert.equal((await chamar(env, "PUT", "/api/admin/pedidos/" + a.id, { acao: "reabrir" })).status, 409);
  // excluir; de novo dá 404; id fora do formato dá 400
  assert.equal((await chamar(env, "DELETE", url)).status, 200);
  assert.equal((await chamar(env, "DELETE", url)).status, 404);
  assert.equal((await chamar(env, "PUT", url, { acao: "reabrir" })).status, 404);
  for (const ruim of ["x", "p123", "P0123456789ABCDEF", "p0123456789abcdeg", "p0123456789abcdef/extra"])
    assert.ok([400, 404].includes((await chamar(env, "DELETE", "/api/admin/pedidos/" + ruim)).status), ruim);
  assert.equal((await chamar(env, "DELETE", "/api/admin/pedidos/x")).status, 400);
  const deletes = env.DB.log.filter((s) => /^DELETE/i.test(s));
  for (const s of deletes) assert.match(s, /collection = 'pedidos-curadoria' AND id = \?/);
});

// ---------- leitura forçada ----------

const NORMAIS = FEEDS.filter((f) => (f[4] || "rss") !== "reddit").map((f) => f[3]);
function ambienteColeta() {
  const env = { DB: d1Falso() };
  const pedidos = [];
  let abertos = 0, picoNormais = 0, picoTotal = 0, abertosReddit = 0;
  globalThis.fetch = async (url) => {
    const u = String(url), reddit = ehReddit(u);
    pedidos.push(u);
    abertos++; if (reddit) abertosReddit++;
    picoTotal = Math.max(picoTotal, abertos); if (!reddit) picoNormais = Math.max(picoNormais, abertos - abertosReddit);
    await new Promise((ok) => setTimeout(ok, 3));
    abertos--; if (reddit) abertosReddit--;
    return reddit ? new Response('<feed xmlns="http://www.w3.org/2005/Atom"></feed>', { status: 200 }) : new Response("<rss><channel></channel></rss>", { status: 200 });
  };
  return { env, pedidos, pico: () => ({ normais: picoNormais, total: picoTotal }), zerar: () => { pedidos.length = 0; picoNormais = 0; picoTotal = 0; } };
}

test("leitura forçada: estado em _sistema, 30 feeds por minuto com 5 abertos, uma passada por todos, Reddit um por minuto, depois volta aos 6", async () => {
  const { env, pedidos, pico, zerar } = ambienteColeta();
  const envW = { ...env, ADMIN_EMAIL: ADMIN };
  // antes do pedido, o ritmo de sempre
  await coletar(env);
  assert.equal(pedidos.filter((u) => !ehReddit(u)).length, 6);
  zerar();
  let r = await jsonDe(await chamar(envW, "GET", "/api/admin/coleta-agora"));
  assert.deepEqual([r.ativa, r.porMinuto, r.totalHoje, r.minutosPrevistos], [false, FORCADA.POR_MINUTO, NORMAIS.length, Math.ceil(NORMAIS.length / FORCADA.POR_MINUTO)]);
  r = await jsonDe(await chamar(envW, "POST", "/api/admin/coleta-agora", {}));
  assert.equal(r.status, 200);
  assert.deepEqual([r.ativa, r.total, r.lidos, r.faltam], [true, NORMAIS.length, 0, NORMAIS.length]);
  const estado = JSON.parse(env.DB.db.prepare("SELECT data FROM docs WHERE collection = '_sistema' AND id = 'coleta-forcada'").get().data);
  assert.deepEqual(Object.keys(estado).sort(), ["expira", "faltam", "fim", "pedido", "total", "ultima"]);
  // um pedido por vez
  const dup = await jsonDe(await chamar(envW, "POST", "/api/admin/coleta-agora", {}));
  assert.equal(dup.status, 409); assert.equal(dup.ativa, true);

  const minutos = Math.ceil(NORMAIS.length / FORCADA.POR_MINUTO);
  const lidosPorMinuto = [], redditPorMinuto = [];
  for (let m = 0; m < minutos; m++) {
    const antes = pedidos.length;
    // os 6 dos 6 primeiros feeds já lidos antes do pedido também entram: valem só leituras feitas depois dele
    await coletar(env);
    const agora = pedidos.slice(antes);
    lidosPorMinuto.push(agora.filter((u) => !ehReddit(u)).length);
    redditPorMinuto.push(agora.filter(ehReddit).length);
    const a = await jsonDe(await chamar(envW, "GET", "/api/admin/coleta-agora"));
    assert.equal(a.lidos + a.faltam, a.total);
    if (m < minutos - 1) assert.equal(a.ativa, true, "minuto " + m);
  }
  assert.ok(lidosPorMinuto.every((n) => n <= FORCADA.POR_MINUTO), "no máximo 30 por minuto: " + lidosPorMinuto);
  assert.equal(lidosPorMinuto[0], FORCADA.POR_MINUTO);
  assert.ok(redditPorMinuto.every((n) => n === 1), "Reddit segue um por minuto: " + redditPorMinuto);
  assert.ok(pico().normais <= FORCADA.SIMULTANEAS, "abertos ao mesmo tempo: " + pico().normais);
  assert.ok(pico().total <= 6, "com o subreddit da vez: " + pico().total);
  const lidosNormais = pedidos.filter((u) => !ehReddit(u));
  assert.deepEqual([...new Set(lidosNormais)].sort(), [...NORMAIS].sort(), "passou por todos");
  assert.equal(lidosNormais.length, NORMAIS.length, "uma vez cada");
  r = await jsonDe(await chamar(envW, "GET", "/api/admin/coleta-agora"));
  assert.deepEqual([r.ativa, r.lidos, r.faltam, r.expirou], [false, NORMAIS.length, 0, false]);
  assert.ok(r.fim);
  // acabou: o minuto seguinte volta aos 6 da vez (todos foram lidos agora, então nenhum é devido) e o Reddit não muda
  zerar();
  await coletar(env);
  assert.equal(pedidos.filter((u) => !ehReddit(u)).length, 0);
  assert.equal(pedidos.filter(ehReddit).length, 1);
  // e um pedido novo pode ser feito
  assert.equal((await chamar(envW, "POST", "/api/admin/coleta-agora", {})).status, 200);
});

test("leitura forçada: vence em 30 min sem passar por todos e marca expirou", async () => {
  const { env, pedidos } = ambienteColeta();
  const envW = { ...env, ADMIN_EMAIL: ADMIN };
  await chamar(envW, "POST", "/api/admin/coleta-agora", {});
  await coletar(env);
  env.DB.db.prepare("UPDATE docs SET data = json_set(data, '$.expira', ?) WHERE collection = '_sistema' AND id = 'coleta-forcada'").run(new Date(Date.now() - 1000).toISOString());
  const antes = pedidos.length;
  await coletar(env);
  assert.ok(pedidos.slice(antes).filter((u) => !ehReddit(u)).length <= 6, "vencida, volta ao ritmo normal");
  const r = await jsonDe(await chamar(envW, "GET", "/api/admin/coleta-agora"));
  assert.deepEqual([r.ativa, r.expirou, r.lidos], [false, true, FORCADA.POR_MINUTO]);
  assert.equal(andamentoForcada(null).ativa, false);
});

// ---------- limpeza ----------

test("limpeza: pedidos fechados há mais de 30 dias saem, só por lista de ids; pendentes e fixos ficam", async () => {
  const env = { DB: d1Falso() };
  const t = Date.parse("2026-11-17T12:00:00Z");
  const pôr = (id, estado, diasAtras, extra = {}) => env.DB.db.prepare("INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES ('pedidos-curadoria', ?, ?, '', ?)")
    .run(id, JSON.stringify({ secao: "tech", texto: "x", agora: false, fixo: false, estado, criado: new Date(t - (diasAtras + 1) * DIA).toISOString(), atendidoEm: null, resposta: null, itens: null, ...extra }), new Date(t - diasAtras * DIA).toISOString());
  pôr("p0000000000000001", "atendido", 40);
  pôr("p0000000000000002", "cancelado", 31);
  pôr("p0000000000000003", "sem-resultado", 45);
  pôr("p0000000000000004", "sem-resultado", 10);
  pôr("p0000000000000005", "pendente", 90);
  pôr("p0000000000000006", "pendente", 90, { fixo: true, atendidoEm: new Date(t - 60 * DIA).toISOString() });
  pôr("p0000000000000007", "atendido", 29);
  // fora da collection, com o mesmo id: não é tocado
  env.DB.db.prepare("INSERT INTO docs (collection, id, data, atualizado) VALUES ('instrucoes-hist', 'p0000000000000001', '{}', '2020-01-01T00:00:00Z')").run();
  assert.deepEqual((await pedidosParaApagar(env, t)).sort(), ["p0000000000000001", "p0000000000000002", "p0000000000000003"]);
  const fora = await limparPedidos(env, t);
  assert.equal(fora.length, 3);
  assert.deepEqual(env.DB.db.prepare("SELECT id FROM docs WHERE collection = 'pedidos-curadoria' ORDER BY id").all().map((r) => r.id), ["p0000000000000004", "p0000000000000005", "p0000000000000006", "p0000000000000007"]);
  assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM docs WHERE collection = 'instrucoes-hist'").get().n, 1);
  const deletes = env.DB.log.filter((s) => /^DELETE/i.test(s));
  assert.deepEqual(deletes, ["DELETE FROM docs WHERE collection = 'pedidos-curadoria' AND id IN (?1,?2,?3)"]);
  // e a limpeza do minuto 7 (src/coleta.js) chama esta, com a hora de agora, e conta no relatório
  env.DB.db.prepare("INSERT INTO docs (collection, id, data, atualizado) VALUES ('pedidos-curadoria', 'p0000000000000008', ?, ?)")
    .run(JSON.stringify({ secao: "tech", estado: "cancelado" }), new Date(Date.now() - 31 * DIA).toISOString());
  const rel = await limpar(env);
  assert.equal(rel.pedidos, 1);
  assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM docs WHERE collection = 'pedidos-curadoria' AND id = 'p0000000000000008'").get().n, 0);
});
