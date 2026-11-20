// Rotinas: o relatório do Admin (pedido de 19/11). A regra de estado para cada tipo de intervalo (minuto, 30 min,
// diário, mensal, só com pregão), dentro e fora da janela; as curadorias (em dia, atrasada, parada, roda e não publica)
// e o plantão; o batimento do cron (uma leitura e uma gravação por invocação, com chave explícita, e erro numa etapa
// não impede as outras nem o batimento); a rota, que é só do Admin. Relógio sempre injetado: nada aqui depende do dia.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { d1Falso } from "./d1-falso.mjs";
import { ROTINA, ROTINAS, estadoRotina, estadoCuradoria, estadoPlantao, janelasPerdidas, novoBatimento, etapa, gravarBatimento, mesclar, relatorio, resumoDe, ordenar, LER,
  SQL_LER, SQL_GRAVAR, sqlContagens, CURADORIA, PLANTAO } from "../src/rotinas.js";

register("data:text/javascript," + encodeURIComponent(
  'export async function resolve(s, c, n) { if (s === "cloudflare:workers") return { url: "data:text/javascript,export class DurableObject {}", shortCircuit: true }; return n(s, c); }'));
const { default: worker, _etapasDoCron } = await import("../src/index.js");

const MIN = 60_000, H = 3_600_000, DIA = 86_400_000;
const T = (s) => Date.parse(s);
const iso = (t) => new Date(t).toISOString();
// Quinta-feira, 19/11/2026, 15h UTC (12h em São Paulo): pregão da B3 e de Nova York abertos
const QUI = T("2026-11-19T15:00:00Z");
const REG_DESDE = iso(QUI - 30 * DIA);
const est = (id, reg, agora, criado = REG_DESDE) => estadoRotina(ROTINA[id], reg, agora, criado);

// ---------- regra de estado por tipo de intervalo ----------

test("a cada minuto: em dia, atrasada passando de 2 minutos sem rodar, parada passando de 6", () => {
  const ok = iso(QUI);
  assert.equal(est("feeds", { ok }, QUI + 1 * MIN).estado, "em dia");
  assert.equal(est("feeds", { ok }, QUI + 3 * MIN).estado, "em dia", "folga de 2 min para o cron atrasar");
  assert.equal(est("feeds", { ok }, QUI + 4 * MIN + 5000).estado, "atrasada");
  assert.equal(est("feeds", { ok }, QUI + 9 * MIN).estado, "parada");
  const r = est("feeds", { ok }, QUI + 9 * MIN);
  assert.equal(r.idadeMin, 9);
  assert.equal(r.esperado, "a cada minuto");
});

test("a cada 30 min (moedas nos minutos 3 e 33): uma janela perdida ainda é em dia; duas, atrasada; seis, parada", () => {
  const ok = "2026-11-19T15:03:20Z";
  const r = (h) => est("mercado", { ok }, T(ok) + h * H);
  assert.equal(r(0.6).estado, "em dia", "15h33 passou sem rodar, ainda dentro de 2 vezes o intervalo");
  assert.equal(r(1.1).estado, "atrasada", "15h33 e 16h03 perdidas");
  assert.equal(r(1.1).perdida, "2026-11-19T15:33:00.000Z", "a primeira janela perdida");
  assert.equal(r(3.1).estado, "parada");
  assert.equal(ROTINA.mercado.esperado, "a cada 30 min");
});

test("uma vez por dia (CVM às 7h17): a conta começa na janela perdida; fora dela não é atraso", () => {
  const ontem = "2026-11-18T10:17:40Z";
  const agora = (s) => est("cvm", { ok: ontem }, T(s));
  assert.equal(agora("2026-11-19T09:00:00Z").estado, "em dia", "23 h sem rodar, mas a janela de hoje ainda não chegou");
  assert.equal(agora("2026-11-19T10:18:00Z").estado, "em dia", "a janela acabou de passar: folga");
  assert.equal(agora("2026-11-19T10:20:00Z").estado, "atrasada", "perdeu a janela de hoje");
  assert.equal(agora("2026-11-19T10:20:00Z").perdida, "2026-11-19T10:17:00.000Z");
  assert.equal(agora("2026-11-20T10:20:00Z").estado, "parada", "duas janelas perdidas");
  assert.equal(ROTINA.cvm.esperado, "uma vez por dia, 7h17");
  // a leitura do dia tem janela de 10 min (7h40 a 7h49): só conta como perdida depois dela
  const lt = (s) => est("leitura", { ok: "2026-11-18T10:41:00Z" }, T(s)).estado;
  assert.equal(lt("2026-11-19T10:45:00Z"), "em dia", "ainda dentro da janela");
  assert.equal(lt("2026-11-19T10:53:00Z"), "atrasada");
});

test("dia 1 de cada mês (simulador às 6h): o mês inteiro sem rodar é em dia; perdeu o dia 1, atrasada; dois meses, parada", () => {
  const ok = "2026-11-01T09:02:00Z";
  const r = (s) => est("simulador", { ok }, T(s)).estado;
  assert.equal(r("2026-11-30T23:00:00Z"), "em dia", "29 dias sem rodar, fora da janela");
  assert.equal(r("2026-12-01T09:30:00Z"), "em dia", "dentro da janela de 6h a 6h59");
  assert.equal(r("2026-12-01T10:05:00Z"), "atrasada");
  assert.equal(r("2027-01-01T10:05:00Z"), "parada");
  assert.equal(ROTINA.simulador.esperado, "dia 1 de cada mês, 6h");
});

test("só com pregão (B3): fim de semana e madrugada não contam; no pregão, 2 e 6 janelas como as de 30 min", () => {
  // sexta 18h35 em São Paulo (fechamento), e nada até segunda 10h20
  const sexta = "2026-11-20T21:35:30Z";
  const r = (s) => est("b3", { ok: sexta }, T(s));
  assert.equal(r("2026-11-22T15:00:00Z").estado, "em dia", "domingo: fora da janela");
  assert.equal(r("2026-11-23T12:59:00Z").estado, "em dia", "segunda antes do pregão");
  assert.equal(r("2026-11-23T13:20:00Z").estado, "em dia", "segunda, só a janela das 13h05 perdida");
  assert.equal(r("2026-11-23T13:40:00Z").estado, "atrasada", "13h05 e 13h35 perdidas");
  assert.equal(r("2026-11-23T16:00:00Z").estado, "parada");
  // o fechamento das 21h35 UTC entra; 21h05 está dentro do pregão (até 21h10)
  const perd = janelasPerdidas(ROTINA.b3, T("2026-11-23T20:40:00Z"), T("2026-11-23T23:00:00Z"));
  assert.deepEqual(perd.map(iso), ["2026-11-23T21:05:00.000Z", "2026-11-23T21:35:00.000Z"]);
  // EUA: pregão de Nova York, e às 16h35 de lá
  const eua = janelasPerdidas(ROTINA.eua, T("2026-11-23T20:30:00Z"), T("2026-11-23T23:00:00Z"));
  assert.deepEqual(eua.map(iso), ["2026-11-23T20:38:00.000Z", "2026-11-23T21:35:00.000Z"], "16h08 (fim do pregão é 16h, então 15h38 é o último) não; 16h35 sim");
});

test("com erro: falha registrada depois do último sucesso ou junto dele (erro parcial); sucesso depois limpa", () => {
  const ok = iso(QUI), depois = iso(QUI + MIN);
  assert.equal(est("cripto", { ok, erro: ok, msg: "coingecko: HTTP 429" }, QUI + 5 * MIN).estado, "com erro", "caiu para a reserva: rodou, mas com erro");
  assert.equal(est("feeds", { ok, erro: depois, msg: "falhou" }, QUI + 2 * MIN).estado, "com erro");
  assert.equal(est("feeds", { ok: depois, erro: ok, msg: "falhou" }, QUI + 2 * MIN).estado, "em dia");
  // atrasada pesa mais que o erro
  assert.equal(est("feeds", { ok, erro: ok, msg: "x" }, QUI + 10 * MIN).estado, "parada");
});

test("sem trabalho não é atraso, e a linha diz desde quando", () => {
  const r = est("sonda", { ok: "2026-11-10T12:00:00Z", vazio: iso(QUI - MIN) }, QUI);
  assert.equal(r.estado, "em dia");
  assert.equal(r.semTrabalhoDesde, "2026-11-10T12:00:00Z");
  assert.equal(r.ultimaVez, iso(QUI - MIN));
  assert.equal(r.ultimaOk, "2026-11-10T12:00:00Z");
});

test("nunca rodou desde que o registro existe: parada; antes da primeira janela, ainda não", () => {
  const r = est("cvm", {}, T("2026-11-19T12:00:00Z"), "2026-11-17T12:00:00Z");
  assert.equal(r.estado, "parada");
  assert.equal(r.nunca, true);
  assert.equal(r.idadeMin, null);
  const cedo = est("simulador", {}, T("2026-11-19T12:00:00Z"), "2026-11-10T12:00:00Z");
  assert.equal(cedo.estado, "em dia", "o dia 1 ainda não chegou desde que o registro começou");
  assert.equal(cedo.aguardando, true);
  assert.equal(est("feeds", null, QUI, null).estado, "parada", "sem registro nenhum");
});

// ---------- curadorias e plantão ----------

test("curadoria: em dia até 13 h, atrasada até 26 h, parada depois; sem rodada, parada", () => {
  const c = (h, itens24h = 5) => estadoCuradoria({ secao: "tech", nome: "Curadoria Tech", status: { ultimaRodada: iso(QUI - h * H), novosNaUltima: 3 }, itens24h, itens7d: 30 }, QUI);
  assert.equal(c(6).estado, "em dia");
  assert.equal(c(CURADORIA.EM_DIA_H + 0.5).estado, "atrasada");
  assert.equal(c(CURADORIA.ATRASADA_H + 0.5).estado, "parada");
  assert.equal(c(240).estado, "parada");
  assert.equal(c(240).idadeMin, 240 * 60);
  assert.equal(c(6).novosNaUltima, 3);
  assert.equal(estadoCuradoria({ secao: "tech", nome: "x", status: null }, QUI).estado, "parada");
  // a tarefa roda (meta/status anda) mas não publica: nada em 24 h
  const muda = c(3, 0);
  assert.equal(muda.estado, "com erro");
  assert.match(muda.msg, /nada entrou nas últimas 24 h/);
});

test("plantão: pedido rodar agora esperando há mais de 2 h é atrasado; mais de 6 h, parado", () => {
  const p = (h, n = 1) => estadoPlantao({ pendentes: n, maisAntigo: iso(QUI - h * H), ultimoAtendido: iso(QUI - 30 * H) }, QUI);
  assert.equal(p(0.5).estado, "em dia");
  assert.equal(p(0.5).esperaMin, 30);
  assert.equal(p(PLANTAO.ATRASADO_H + 0.1).estado, "atrasada");
  assert.equal(p(PLANTAO.PARADO_H + 0.1, 2).estado, "parada");
  assert.equal(p(7, 2).pendentes, 2);
  assert.equal(estadoPlantao({ pendentes: 0 }, QUI).estado, "em dia");
});

test("resumo e ordem: parada e atrasada em cima, a parada há mais tempo em destaque", () => {
  const linhas = [{ id: "a", nome: "A", estado: "em dia", idadeMin: 1 }, { id: "b", nome: "B", estado: "parada", idadeMin: 60 }, { id: "c", nome: "C", estado: "parada", idadeMin: 14400 },
    { id: "d", nome: "D", estado: "com erro", idadeMin: 2 }, { id: "e", nome: "E", estado: "atrasada", idadeMin: 70 }];
  assert.deepEqual(ordenar(linhas).map((l) => l.id), ["c", "b", "e", "d", "a"]);
  const r = resumoDe(linhas);
  assert.deepEqual([r.emDia, r.comErro, r.atrasadas, r.paradas], [1, 1, 1, 2]);
  assert.equal(r.destaque.id, "c");
});

// ---------- leitores ----------

test("leitores: erro parcial conta (cripto na reserva, feed com falha, ESPN 403); fora da janela não marca nada", () => {
  assert.deepEqual(LER.b3(null), { tipo: "fora" });
  const m = LER.mercado({ moedas: false, bolsa: false, indicadores: false, cripto: true })({ itens: [], cripto: [{ id: "btc" }], erros: { cripto: "coingecko: HTTP 429" } });
  assert.equal(m.mercado, undefined);
  assert.equal(m.cripto.tipo, "ok");
  assert.match(m.cripto.msg, /429/);
  const c = LER.coleta({ feeds: 6, reddit: 1, falhas: ["Fonte X: HTTP 500"], falhasReddit: [] });
  assert.equal(c.feeds.tipo, "ok");
  assert.match(c.feeds.msg, /1 feed com falha: Fonte X/);
  assert.equal(c.foruns.msg, "");
  assert.deepEqual(LER.coleta({ feeds: 0, reddit: 0, falhas: [], falhasReddit: [] }).feeds, { tipo: "vazio" });
  const e = LER.esportes({ sonda: 0, ligas: ["bra"], erros: 1, msg: "lig: HTTP 403" });
  assert.equal(e.tipo, "ok"); assert.match(e.msg, /403/);
  assert.deepEqual(LER.esportes({ sonda: 0, ligas: [] }), { tipo: "fora" }, "fora do minuto 4 ou 9");
  assert.equal(LER.traducao({ semFolga: true, gastos: 900 }).tipo, "erro", "sem folga de subrequests é não ter rodado");
  assert.equal(LER.traducao({ chamadas: 0, traduzidos: 0, marcas: 0, falhas: 0, vazia: true }).tipo, "vazio");
});

// ---------- batimento ----------

test("batimento: marca na memória e grava uma vez, com uma leitura e uma gravação pela chave", async () => {
  let t = QUI;
  const bat = novoBatimento(() => t);
  await etapa(bat, "sonda", async () => { t += 120; return 2; }, LER.sonda);
  await etapa(bat, "b3", async () => null, LER.b3);
  await assert.rejects(etapa(bat, "cvm", async () => { throw new Error("CVM fora do ar"); }, LER.cvm));
  assert.deepEqual(Object.keys(bat.marcas).sort(), ["cvm", "sonda"], "b3 fora da janela não marca");
  assert.equal(bat.marcas.sonda.ms, 120);
  assert.equal(bat.marcas.cvm.msg, "CVM fora do ar");
  const DB = d1Falso();
  DB.db.prepare("INSERT INTO docs (collection, id, data) VALUES ('_sistema', 'rotinas', ?)").run(JSON.stringify({ criado: REG_DESDE, porId: { cvm: { ok: "2026-11-18T10:17:00Z" }, feeds: { ok: "x" } } }));
  const antes = DB.log.length;
  const doc = await gravarBatimento({ DB }, bat);
  assert.deepEqual(DB.log.slice(antes), [SQL_LER, SQL_GRAVAR]);
  assert.equal(doc.criado, REG_DESDE);
  assert.equal(doc.porId.cvm.ok, "2026-11-18T10:17:00Z", "o sucesso de antes fica");
  assert.equal(doc.porId.cvm.erro, iso(QUI + 120));
  assert.equal(doc.porId.feeds.ok, "x", "etapa que não rodou agora fica como estava");
  assert.equal(doc.porId.sonda.feitos, "2 URLs");
  // falha ao gravar não lança
  const quebrado = { prepare: () => { throw new Error("D1 fora"); } };
  const erros = [], ce = console.error; console.error = (...a) => erros.push(a.join(" "));
  try { assert.equal(await gravarBatimento({ DB: quebrado }, bat), null); } finally { console.error = ce; }
  assert.ok(erros.some((e) => /rotinas/.test(e)));
  assert.deepEqual(mesclar(null, {}, QUI).porId, {});
});

// O cron inteiro em Node: D1 em SQLite, sem rede (todo fetch responde 503), sem AI e sem espelho.
function envCron({ quebrar = null } = {}) {
  const DB = d1Falso();
  const prepare = DB.prepare;
  // binds: [sql, argumentos] de cada consulta com bind, para contar as do batimento pela chave
  const binds = [];
  DB.prepare = (sql) => {
    if (quebrar && quebrar.test(sql)) throw new Error("D1 recusou: " + sql.slice(0, 30));
    const st = prepare(sql);
    return { ...st, bind: (...a) => { binds.push([sql, a]); return st.bind(...a); } };
  };
  DB.consertar = () => { quebrar = null; };
  const ASSETS = { fetch: async () => new Response("não", { status: 404 }) };
  return { DB, ASSETS, ADMIN_EMAIL: "admin@x.com", binds };
}
async function rodarCron(env, quando, relogio) {
  const fetchOriginal = globalThis.fetch, ce = console.error, cl = console.log;
  const erros = [];
  globalThis.fetch = async () => new Response("sem rede no teste", { status: 503 });
  console.error = (...a) => erros.push(a.map(String).join(" ")); console.log = () => {};
  try { await _etapasDoCron({ scheduledTime: quando }, env, { d1: 0, fetch: 0 }, relogio); }
  finally { globalThis.fetch = fetchOriginal; console.error = ce; console.log = cl; }
  return erros;
}
const lerDoc = (env) => JSON.parse(env.DB.db.prepare("SELECT data FROM docs WHERE collection = '_sistema' AND id = 'rotinas'").get().data);
// domingo, 22/11/2026, 3h00 UTC: nada de mercado, B3, EUA, CVM nem esportes; coleta, Landscape, tradução e histórico rodam
const DOM = T("2026-11-22T03:00:00Z");

test("cron: o batimento é gravado uma vez por invocação, pela chave, depois de todas as etapas", async () => {
  const env = envCron();
  let t = DOM;
  await rodarCron(env, DOM, () => (t += 10));
  const doBatimento = (de = 0) => env.binds.slice(de).filter(([sql, a]) => (sql === SQL_GRAVAR || sql === SQL_LER) && a[0] === "rotinas");
  const b1 = doBatimento();
  assert.deepEqual(b1.map(([sql]) => sql), [SQL_LER, SQL_GRAVAR], "uma leitura e uma gravação, nessa ordem");
  assert.match(SQL_GRAVAR, /ON CONFLICT\(collection, id\)/, "a gravação é pela chave (collection, id)");
  assert.ok(env.DB.log.every((s) => !/^\s*(DELETE|UPDATE)/i.test(s) || /WHERE/i.test(s)), "nada de UPDATE ou DELETE sem chave");
  const doc = lerDoc(env);
  assert.ok(doc.criado && doc.atualizado);
  assert.ok(doc.porId.feeds.erro, "feeds lidos com 503");
  assert.match(doc.porId.feeds.msg, /feeds? com falha/);
  assert.equal(doc.porId.traducao.nota, "desligada (sem o binding AI)");
  assert.equal(doc.porId.historico.nota, "sem histórico para importar");
  for (const id of ["mercado", "cripto", "b3", "eua", "cvm", "leitura", "simulador", "listas", "limpeza", "papel"]) assert.equal(doc.porId[id], undefined, id + " está fora da janela");
  // segunda invocação, um minuto depois: mesma linha, atualizada, e de novo uma gravação só
  const n0 = env.binds.length;
  await rodarCron(env, DOM + MIN, () => (t += 10));
  assert.deepEqual(doBatimento(n0).map(([sql]) => sql), [SQL_LER, SQL_GRAVAR]);
  assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM docs WHERE collection = '_sistema' AND id = 'rotinas'").get().n, 1);
  assert.equal(lerDoc(env).criado, doc.criado, "criado não muda");
});

test("cron: erro numa etapa não impede as outras nem o batimento", async () => {
  // a coleta lê feeds_estado primeiro: com o D1 recusando, ela cai; a sonda, a tradução e o histórico seguem
  const env = envCron({ quebrar: /FROM feeds_estado/ });
  let t = DOM;
  const erros = await rodarCron(env, DOM, () => (t += 10));
  assert.ok(erros.some((e) => /^coleta/.test(e)), "o console.error da coleta continua");
  const doc = lerDoc(env);
  assert.match(doc.porId.feeds.msg, /D1 recusou/);
  assert.match(doc.porId.foruns.msg, /D1 recusou/);
  assert.equal(doc.porId.feeds.ok, undefined);
  assert.ok(doc.porId.sonda.vazio, "a sonda rodou depois");
  assert.ok(doc.porId.traducao.vazio && doc.porId.historico.vazio, "tradução e histórico também");
  // e o relatório (com o D1 de volta) mostra a linha com erro
  env.DB.consertar();
  const r = await relatorio(env, { agora: t + MIN });
  const feeds = r.worker.find((l) => l.id === "feeds");
  assert.equal(feeds.estado, "com erro");
  assert.match(feeds.msg, /D1 recusou/);
  // o batimento quebrado também não derruba o cron
  const env2 = envCron({ quebrar: /'_sistema', \?, \?\) ON CONFLICT/ });
  const e2 = await rodarCron(env2, DOM, () => (t += 10));
  assert.ok(e2.some((e) => /^rotinas/.test(e)));
});

// ---------- relatório e rota ----------

function semear(DB, agora) {
  const put = (c, id, data, coletado = "") => DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES (?, ?, ?, ?)").run(c, id, JSON.stringify(data), coletado);
  put("meta", "status", { ultimaRodada: iso(agora - 240 * H), novosNaUltima: 0 });        // Tech parada há 10 dias
  put("meta", "status-negocios", { ultimaRodada: iso(agora - 3 * H), novosNaUltima: 4 });
  put("meta", "status-investimentos", { ultimaRodada: iso(agora - 15 * H), novosNaUltima: 2 });
  put("meta", "status-politica", { ultimaRodada: iso(agora - 2 * H), novosNaUltima: 0 });   // roda e não publica
  put("meta", "status-esportes", { ultimaRodada: iso(agora - 5 * H), novosNaUltima: 1 });
  for (let k = 0; k < 6; k++) put("items-negocios", "n" + k, { titulo: "x" }, iso(agora - k * 20 * H));
  put("items-esportes", "e1", { titulo: "x" }, iso(agora - 2 * H));
  put("items-investimentos", "i1", { titulo: "x" }, iso(agora - 4 * H));
  put("items", "t1", { titulo: "x" }, iso(agora - 11 * DIA));
  put("pedidos-curadoria", "p0000000000000001", { secao: "tech", agora: true, estado: "pendente", criado: iso(agora - 3 * H) });
  put("pedidos-curadoria", "p0000000000000002", { secao: "negocios", agora: true, estado: "atendido", criado: iso(agora - 9 * H), atendidoEm: iso(agora - 8 * H) });
  put("pedidos-curadoria", "p0000000000000003", { secao: "tech", agora: false, estado: "pendente", criado: iso(agora - 99 * H) });
  DB.db.prepare("INSERT INTO feeds_estado (url, radar, fonte, erros_seguidos) VALUES (?, 'tech', 'A', 2), (?, 'tech', 'B', 0), ('https://www.reddit.com/r/antigo/new/.rss', 'tech', 'r/antigo', 5)").run("https://a.exemplo/rss", "https://b.exemplo/rss");
  const ok = iso(agora - MIN);
  put("_sistema", "rotinas", { criado: iso(agora - 20 * DIA), porId: { feeds: { ok, erro: ok, msg: "1 feed com falha: A: HTTP 500" }, mercado: { ok: iso(agora - 70 * MIN) }, cripto: { ok: iso(agora - 10 * MIN) } } });
}

test("relatório: duas consultas ao D1 (nenhum SELECT composto com mais de 5 termos), curadorias, plantão e feeds com falha", async () => {
  const agora = T("2026-11-19T12:10:00Z");
  const DB = d1Falso();
  semear(DB, agora);
  // Oficina (19/11): curadoria em dia, para não mexer no destaque do resumo
  DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES ('meta', 'status-oficina', ?, '')").run(JSON.stringify({ ultimaRodada: iso(agora - 2 * H), novosNaUltima: 3 }));
  // Saúde (20/11): idem
  DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES ('meta', 'status-saude', ?, '')").run(JSON.stringify({ ultimaRodada: iso(agora - 2 * H), novosNaUltima: 1 }));
  const n0 = DB.log.length;
  const r = await relatorio({ DB }, { agora, estadoEspelho: async () => ({ ultima_sincronia: iso(agora - MIN), duracao_ms: 420 }) });
  assert.equal(DB.log.length - n0, 2, "duas consultas");
  assert.equal(r.agora, iso(agora));
  const cur = Object.fromEntries(r.curadorias.map((l) => [l.id, l]));
  assert.equal(cur["curadoria-tech"].estado, "parada");
  assert.equal(cur["curadoria-tech"].idadeMin, 240 * 60);
  assert.equal(cur["curadoria-tech"].itens7d, 0);
  assert.equal(cur["curadoria-negocios"].estado, "em dia");
  assert.equal(cur["curadoria-negocios"].itens24h, 2);
  assert.equal(cur["curadoria-negocios"].itens7d, 6);
  assert.equal(cur["curadoria-investimentos"].estado, "atrasada");
  assert.equal(cur["curadoria-politica"].estado, "com erro", "rodou e não publicou");
  assert.equal(cur.plantao.estado, "atrasada");
  assert.equal(cur.plantao.pendentes, 1, "só o pedido agora");
  assert.equal(cur.plantao.esperaMin, 180);
  assert.equal(cur.plantao.ultimaOk, iso(agora - 8 * H));
  const w = Object.fromEntries(r.worker.map((l) => [l.id, l]));
  assert.equal(w.feeds.estado, "com erro");
  assert.equal(w.feeds.feedsComFalha, 1, "o subreddit antigo não conta, como no Rendimento das fontes");
  assert.equal(w.mercado.estado, "atrasada");
  assert.equal(w.cripto.estado, "em dia");
  assert.equal(w.espelho.estado, "em dia");
  assert.equal(w.espelho.ms, 420);
  assert.equal(w.cvm.estado, "parada", "nunca rodou desde que o registro existe");
  assert.equal(r.worker[0].estado, "parada", "ordem: parada em cima");
  // parada há mais tempo: a que nunca rodou conta desde que o registro existe (20 dias), mais que a Tech (10 dias)
  assert.equal(r.resumo.destaque.nunca, true);
  assert.equal(r.resumo.destaque.idadeMin, 20 * 24 * 60);
  for (const k of ["id", "nome", "estado", "ultimaOk", "ultimoErro", "msg", "esperado", "idadeMin"]) assert.ok(k in w.feeds && k in cur.plantao, k);
  assert.equal(r.resumo.total, ROTINAS.length + 10, "sete curadorias (com a Oficina e a Saúde), o plantão, os dossiês do ArchLandscape e o levantamento da Oficina");
  assert.equal(cur["curadoria-saude"].nome, "Saúde: curadoria");
  assert.equal(cur["oficina-levantamento"].nome, "Oficina: levantamento das ferramentas");
  assert.equal(cur["oficina-levantamento"].estado, "em dia", "sem catálogo, nada pendente");
  assert.equal(cur["curadoria-oficina"].nome, "Oficina: curadoria");
  assert.equal(cur.dossies.estado, "em dia", "sem pedido pendente");
  assert.ok(sqlContagens(agora).sql.split("UNION ALL").length <= 5);
});

const ctx = { waitUntil() {} };
const chamar = (env, email, metodo = "GET") => worker.fetch(new Request("https://lookout.test/api/admin/rotinas", { method: metodo }), { ...env, DEV_EMAIL: email }, ctx);

test("rota: só o Admin; convidado leva o mesmo 404 das rotas de Admin do Landscape, e quem não foi convidado, 403", async () => {
  const DB = d1Falso();
  DB.db.prepare("INSERT INTO usuarios (email, nome) VALUES ('a@x.com', 'A')").run();
  semear(DB, Date.now());
  const env = { DB, ADMIN_EMAIL: "admin@x.com" };
  const n = await chamar(env, "a@x.com");
  assert.equal(n.status, 404);
  assert.equal((await n.json()).erro, "rota");
  assert.equal((await chamar(env, "estranho@x.com")).status, 403);
  assert.equal((await chamar(env, "admin@x.com", "POST")).status, 405);
  const r = await chamar(env, "admin@x.com");
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(Array.isArray(j.curadorias) && Array.isArray(j.worker) && j.resumo && j.agora);
  assert.equal(j.worker.find((l) => l.id === "espelho").msg, "sem o binding ESPELHO");
});
