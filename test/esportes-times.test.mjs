// Esportes, pedidos de 19/11: time do coração e times seguidos (rota /api/esportes/times, regra de quando perguntar),
// campeonato em andamento (Esportes.emAndamento), faixa de jogos acima da tabela (Esportes.jogosDoCabecalho), notícia x
// time e o filtro "Meus times" (Esportes.noticiaDoTime e filtrarMeusTimes), e a agenda em rodízio do cron (diasExtras com
// os dias já buscados, juntarAgenda). Relógio sempre injetado; nada aqui olha a hora da máquina.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { d1Falso, espelhoFalso } from "./d1-falso.mjs";
import { rotaTimesEsportes, timesConhecidos, limparCacheTimes, ID_TIMES, diasExtras, juntarAgenda, diasDoCalendario, lerScoreboard, atualizarLiga, novaFila, diaSP } from "../src/esportes.js";
import "../public/esportes.js";

register("data:text/javascript," + encodeURIComponent(
  'export async function resolve(s, c, n) { if (s === "cloudflare:workers") return { url: "data:text/javascript,export class DurableObject {}", shortCircuit: true }; return n(s, c); }'));
const { default: worker } = await import("../src/index.js");

const E = globalThis.Esportes;
const DIA = 86_400_000, HORA = 3_600_000;
// quinta, 19/11/2026, 15h30 em São Paulo
const AGORA = Date.parse("2026-11-19T18:30:00Z");
const em = (dias, horas = 0) => new Date(AGORA + dias * DIA + horas * HORA).toISOString();
const jogo = (id, quando, a, b, estado, placar = null) => ({ id: String(id), data: quando, mandante: "Time " + a, visitante: "Time " + b, siglas: ["T" + a, "T" + b], ids: [String(a), String(b)], placar, estado, minuto: estado === "in" ? "67'" : "", estadio: "", detalhe: "" });

// ---------- campeonato em andamento ----------

test("emAndamento: em curso, encerrado, ainda não começou e sem jogos (relógio injetado)", () => {
  // em curso: jogo daqui a 3 dias (e um de 2 dias atrás)
  const emCurso = { rodada: { jogos: [jogo(1, em(-2), 1, 2, "post", [1, 0])] }, proximos: [jogo(2, em(3), 3, 4, "pre")], ultimos: [] };
  assert.equal(E.emAndamento(emCurso, AGORA), true);
  // ao vivo conta mesmo com a data esquisita
  assert.equal(E.emAndamento({ rodada: { jogos: [{ ...jogo(3, em(-40), 1, 2, "in", [0, 0]) }] } }, AGORA), true);
  // encerrado: o último jogo foi há 12 dias e não há próximo
  const encerrado = { ultimos: [jogo(4, em(-12), 1, 2, "post", [2, 2])], diasJogo: ["2026-11-01", "2026-11-07"] };
  assert.equal(E.emAndamento(encerrado, AGORA), false);
  const s = E.situacaoCampeonato(encerrado, AGORA);
  assert.equal(s.andamento, false);
  assert.equal(s.ultimo.slice(0, 10), em(-12).slice(0, 10), "a data do último jogo vem junto");
  assert.equal(s.proximo, null);
  // 10 dias atrás ainda conta; 11, não
  assert.equal(E.emAndamento({ ultimos: [jogo(5, em(-10, 1), 1, 2, "post", [0, 1])] }, AGORA), true);
  assert.equal(E.emAndamento({ ultimos: [jogo(5, em(-11), 1, 2, "post", [0, 1])] }, AGORA), false);
  // ainda não começou: o calendário da ESPN marca o primeiro dia daqui a 40 dias
  const futuro = { diasJogo: ["2026-12-29", "2027-01-10"] };
  assert.equal(E.emAndamento(futuro, AGORA), false);
  assert.equal(E.situacaoCampeonato(futuro, AGORA).proximo.slice(0, 10), "2026-12-29");
  // ... e 21 dias à frente já conta
  assert.equal(E.emAndamento({ diasJogo: ["2026-12-10"] }, AGORA), true);
  assert.equal(E.emAndamento({ diasJogo: ["2026-12-11"] }, AGORA), false);
  // a janela da temporada da ESPN: em curso fora da pré-temporada e das férias
  assert.equal(E.emAndamento({ temporadaJanela: { inicio: em(-200), fim: em(30), tipo: 2 } }, AGORA), true);
  assert.equal(E.emAndamento({ temporadaJanela: { inicio: em(-200), fim: em(30), tipo: 4 } }, AGORA), false, "fora de temporada");
  assert.equal(E.emAndamento({ temporadaJanela: { inicio: em(-200), fim: em(-5), tipo: 2 } }, AGORA), false);
  // tênis: torneio com início e fim em volta de agora
  assert.equal(E.emAndamento({ torneios: [{ nome: "ATP Finals", inicio: em(-4), fim: em(3) }] }, AGORA), true);
  // sem jogos
  assert.equal(E.emAndamento({ tabela: [{ pos: 1, time: "A" }], rodada: { jogos: [] }, proximos: [], ultimos: [] }, AGORA), false);
  assert.equal(E.emAndamento(null, AGORA), false);
  assert.equal(E.emAndamento({}, AGORA), false);
});

test("jogosDoDoc junta agenda, rodada, próximos, últimos e a agenda dos times, um por id", () => {
  const a = jogo(1, em(1), 1, 2, "pre"), b = jogo(2, em(-1), 3, 4, "post", [1, 1]), c = jogo(3, em(5), 1, 5, "pre");
  const d = { agenda: { jogos: [a, b] }, rodada: { jogos: [{ ...a, estado: "in" }] }, proximos: [a], ultimos: [b], times: { 1: { proximos: [c], ultimos: [] } } };
  const js = E.jogosDoDoc(d);
  assert.deepEqual(js.map((j) => j.id), ["2", "1", "3"]);
  assert.equal(js.find((j) => j.id === "1").estado, "pre", "a agenda (a mais nova) vale");
});

// ---------- faixa de jogos acima da tabela ----------

test("jogosDoCabecalho: hoje com jogo do coração, coração só daqui a 3 dias, jogou ontem sem próximo, fora do campeonato, sem jogos", () => {
  // hoje: um encerrado (às 12h), o do coração ao vivo, um a jogar às 21h; amanhã e daqui a 5 dias; um daqui a 9 (fora)
  const hojeFim = jogo(10, em(0, -6), 3, 4, "post", [2, 0]);
  const hojeVivo = jogo(11, em(0, -1), 1936, 6, "in", [1, 0]);
  const hojeDepois = jogo(12, em(0, 3), 7, 8, "pre");
  const amanha = jogo(13, em(1), 9, 1936, "pre");
  const cinco = jogo(14, em(5), 5, 6, "pre");
  const nove = jogo(15, em(9), 1936, 7, "pre");
  const ontem = jogo(16, em(-1), 1936, 3, "post", [0, 0]);
  const todos = [nove, cinco, amanha, hojeDepois, hojeVivo, hojeFim, ontem];
  let r = E.jogosDoCabecalho(todos, "bra.1", "1936", AGORA);
  assert.equal(r.fixo.id, "11", "o jogo de hoje do coração, em qualquer estado");
  assert.deepEqual(r.lista.map((j) => j.id), ["10", "12", "13", "14"], "hoje em ordem, depois os 7 dias; o fixo não se repete; ontem e o de 9 dias ficam de fora");

  // coração só joga daqui a 3 dias
  const tres = jogo(20, em(3), 6, 1936, "pre");
  r = E.jogosDoCabecalho([hojeFim, hojeDepois, tres, cinco], "bra.1", "1936", AGORA);
  assert.equal(r.fixo.id, "20");
  assert.deepEqual(r.lista.map((j) => j.id), ["10", "12", "14"]);

  // coração jogou ontem e não tem próximo: o último resultado
  r = E.jogosDoCabecalho([ontem, hojeFim, cinco], "bra.1", "1936", AGORA);
  assert.equal(r.fixo.id, "16");
  assert.deepEqual(r.lista.map((j) => j.id), ["10", "14"]);
  // só o fixo, sem jogo na semana: a faixa ainda tem o que mostrar
  r = E.jogosDoCabecalho([ontem], "bra.1", "1936", AGORA);
  assert.equal(r.fixo.id, "16");
  assert.deepEqual(r.lista, []);

  // coração fora do campeonato (ou sem time): sem fixo, a faixa começa normal
  r = E.jogosDoCabecalho([hojeFim, cinco], "uefa.champions", "1936", AGORA);
  assert.equal(r.fixo, null);
  assert.deepEqual(r.lista.map((j) => j.id), ["10", "14"]);
  r = E.jogosDoCabecalho([hojeFim, cinco], "bra.1", null, AGORA);
  assert.equal(r.fixo, null);
  assert.equal(r.lista.length, 2);

  // sem jogos
  r = E.jogosDoCabecalho([], "bra.1", "1936", AGORA);
  assert.deepEqual(r, { fixo: null, lista: [] });
  assert.deepEqual(E.jogosDoCabecalho(undefined, "bra.1", null, AGORA), { fixo: null, lista: [] });
});

test("jogosDoCabecalho: o dia é o de São Paulo (jogo às 23h de hoje é hoje; às 00h30 é amanhã)", () => {
  const tarde = jogo(1, "2026-11-20T02:00:00Z", 1, 2, "pre");   // 23h de 19/11 em SP
  const madrugada = jogo(2, "2026-11-20T03:30:00Z", 3, 4, "pre"); // 00h30 de 20/11 em SP
  const r = E.jogosDoCabecalho([madrugada, tarde], "bra.1", null, AGORA);
  assert.deepEqual(r.lista.map((j) => j.id), ["1", "2"]);
  assert.equal(E.rotuloDiaCartao(tarde.data, AGORA), "Hoje");
  assert.equal(E.rotuloDiaCartao(madrugada.data, AGORA), "Amanhã");
  assert.equal(E.rotuloDiaCartao("2026-11-21T19:00:00Z", AGORA), "Sáb 21/11");
  assert.equal(E.rotuloDiaCartao("2026-11-18T19:00:00Z", AGORA), "Ontem");
});

// ---------- notícia x time ----------

const INTER = { nome: "Internacional", pais: "BR" }, INTERNAZ = { nome: "Internazionale", curto: "Inter", pais: "IT" }, MIAMI = { nome: "Inter Miami CF", pais: "US" };
const GREMIO = { nome: "Grêmio", pais: "BR" }, SANTOS = { nome: "Santos", pais: "BR" }, VITORIA = { nome: "Vitória", pais: "BR" };
const SPURS_NBA = { nome: "San Antonio Spurs", curto: "Spurs", pais: "US" }, TOTTENHAM = { nome: "Tottenham Hotspur", pais: "GB" };
const OUTROS = [INTER, INTERNAZ, MIAMI, GREMIO, SANTOS, VITORIA, SPURS_NBA, TOTTENHAM];
const cita = (t, item) => E.noticiaDoTime(item, t, OUTROS);

test("notícia x time: campo da curadoria primeiro, depois o texto com nomes e apelidos", () => {
  assert.equal(cita(GREMIO, { titulo: "Treino fechado antes do clássico", clube: "Grêmio" }), true, "clube da curadoria");
  assert.equal(cita(INTER, { titulo: "Treino fechado antes do clássico", clube: "Grêmio" }), false);
  assert.equal(cita(INTER, { titulo: "Zagueiro renova até 2028", tema: "inter" }), true, "o tema inter é do Internacional");
  assert.equal(cita(INTERNAZ, { titulo: "Zagueiro renova até 2028", tema: "inter" }), false);
  assert.equal(cita(INTER, { titulo: "Meia acerta", transferencia: { jogador: "X", destino: { clube: "Internacional", pais: "BR" } } }), true, "destino da negociação");
  assert.equal(cita(GREMIO, { titulo: "Grêmio vence fora de casa", tema: "brasileirao" }), true);
  assert.equal(cita(GREMIO, { titulo: "Clássico no domingo", resumo: "O Grêmio recebe o rival na Arena." }), true, "o resumo também conta");
  assert.equal(cita(SANTOS, { titulo: "Neymar volta ao Santos", tema: "brasileirao" }), true);
  assert.equal(cita(INTER, { titulo: "Sport Club Internacional anuncia patrocínio", tema: "internacional" }), true, "nome completo, sem depender do país");
});

test("notícia x time: os casos ambíguos (Inter de Milão, Inter Miami, palavra comum, sobrenome, nome repetido)", () => {
  // "Inter" sozinho: o Internacional só em item do Brasil; a Internazionale só em item da Itália; sem país, ninguém
  assert.equal(cita(INTER, { titulo: "Inter vence o Grêmio no Beira-Rio", tema: "brasileirao" }), true);
  assert.equal(cita(INTER, { titulo: "Inter vence o Grêmio no Beira-Rio", escopo: "nacional" }), true);
  assert.equal(cita(INTERNAZ, { titulo: "Inter vence o Grêmio no Beira-Rio", tema: "brasileirao" }), false);
  assert.equal(cita(INTER, { titulo: "Inter vence a Roma em casa", tema: "internacional", subtema: "europa" }), false, "tema internacional: não é o Internacional");
  assert.equal(cita(INTER, { titulo: "Inter vence a Roma em casa" }), false, "sem país: nenhum");
  // nome mais longo ganha: "Inter de Milão" e "Inter Miami" não viram "Inter"
  assert.equal(cita(INTER, { titulo: "Inter de Milão quer zagueiro do Brasileirão", tema: "brasileirao" }), false);
  assert.equal(cita(INTERNAZ, { titulo: "Inter de Milão quer zagueiro do Brasileirão", tema: "brasileirao" }), true);
  assert.equal(cita(INTER, { titulo: "Messi renova com o Inter Miami", tema: "mercado", subtema: "brasil" }), false);
  assert.equal(cita(MIAMI, { titulo: "Messi renova com o Inter Miami", tema: "mercado", subtema: "brasil" }), true);
  // "internacional" como adjetivo não é o clube
  assert.equal(cita(INTER, { titulo: "Janela do mercado internacional abre em janeiro", tema: "mercado", subtema: "brasil" }), false);
  assert.equal(cita(INTER, { titulo: "Notícias do futebol Internacional", tema: "brasileirao" }), false);
  // palavra comum no começo da frase não conta; no meio, com maiúscula, conta
  assert.equal(cita(VITORIA, { titulo: "Vitória marcante do Palmeiras", tema: "brasileirao" }), false);
  assert.equal(cita(VITORIA, { titulo: "Bahia e Vitória fazem o clássico", tema: "brasileirao" }), true);
  assert.equal(cita(VITORIA, { titulo: "Palmeiras busca a vitória fora", tema: "brasileirao" }), false, "minúscula é a palavra");
  // sobrenome
  assert.equal(cita(SANTOS, { titulo: "Lucas dos Santos é convocado", tema: "brasileirao" }), false);
  // o mesmo nome em dois times conhecidos: só o nome completo resolve
  assert.equal(cita(SPURS_NBA, { titulo: "Na NBA, Spurs vencem de novo" }), false);
  assert.equal(cita(SPURS_NBA, { titulo: "San Antonio Spurs vencem de novo" }), true);
  assert.equal(cita(TOTTENHAM, { titulo: "Tottenham demite o técnico" }), true);
});

test("filtro Meus times: só as notícias que citam algum time seguido; sem time, nada", () => {
  const itens = [
    { id: "a", titulo: "Inter vence o Gre-Nal", tema: "inter" },
    { id: "b", titulo: "Palmeiras lidera", tema: "brasileirao" },
    { id: "c", titulo: "Inter de Milão perde em casa", tema: "internacional" },
    { id: "d", titulo: "Grêmio anuncia técnico", tema: "brasileirao", clube: "Grêmio" },
    { id: "e", titulo: "Mercado internacional aquece", tema: "mercado", subtema: "internacional" },
  ];
  assert.deepEqual(E.filtrarMeusTimes(itens, [INTER], OUTROS).map((i) => i.id), ["a"]);
  assert.deepEqual(E.filtrarMeusTimes(itens, [INTER, GREMIO], OUTROS).map((i) => i.id), ["a", "d"]);
  assert.deepEqual(E.filtrarMeusTimes(itens, [INTERNAZ], OUTROS).map((i) => i.id), ["c"], "\"Inter de Milão\" vale sem país; o Gre-Nal do tema inter, não");
  assert.deepEqual(E.filtrarMeusTimes(itens, [], OUTROS), []);
  assert.equal(E.paisDoItem({ tema: "gauchao" }), "BR");
  assert.equal(E.paisDoItem({ tema: "internacional" }), "");
  assert.equal(E.paisDoItem({ tema: "libertadores" }), "");
});

// ---------- quando perguntar ----------

test("devePerguntar: sem resposta pergunta; Agora não esconde nesta visita; Não torço e quem já respondeu não veem mais", () => {
  const nunca = E.respostaTimes(null);
  assert.deepEqual(nunca, { coracao: null, seguidos: [], perguntado: null, v: 1, atualizado: null });
  assert.equal(E.devePerguntar(nunca), true, "sem resposta");
  assert.equal(E.devePerguntar(nunca, { agoraNao: true }), false, "Agora não, nesta visita");
  assert.equal(E.devePerguntar(nunca, { agoraNao: false }), true, "na próxima visita volta");
  const naoTorco = E.respostaTimes({ coracao: null, seguidos: [], perguntado: "2026-11-19T18:00:00.000Z", v: 1 });
  assert.equal(E.devePerguntar(naoTorco), false, "Não torço para nenhum time");
  const respondeu = E.respostaTimes({ coracao: "1936", seguidos: ["6273"], perguntado: "2026-11-19T18:00:00.000Z", v: 1 });
  assert.deepEqual(respondeu.seguidos, ["1936", "6273"], "o do coração sempre entre os seguidos, primeiro");
  assert.equal(E.devePerguntar(respondeu), false);
  // quem já usava Esportes (com Meus esportes salvo) e nunca respondeu também é perguntado
  assert.equal(E.devePerguntar(E.respostaTimes({ seguidos: ["6273"] })), true);
  assert.equal(E.devePerguntar(undefined), false, "antes de ler, não pisca");
});

// ---------- rota /api/esportes/times ----------

const ESC = (id) => `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`;
function docsLigas() {
  return {
    "esportes-bra.1": { liga: "bra.1", tabela: [{ pos: 1, time: "Palmeiras", sigla: "PAL", id: "2029" }, { pos: 7, time: "Internacional", sigla: "INT", id: "1936" }, { pos: 13, time: "Grêmio", sigla: "GRE", id: "6273" }],
      rodada: { jogos: [jogo(1, em(1), 1936, 6273, "pre")] }, proximos: [], ultimos: [], escudos: { 1936: ESC(1936), 6273: ESC(6273) } },
    "esportes-conmebol.libertadores": { liga: "conmebol.libertadores", tabela: [{ pos: 1, time: "Internacional", sigla: "INT", id: "1936", grupo: "Grupo B" }, { pos: 2, time: "River Plate", sigla: "RIV", id: "16" }] },
    "esportes-nba": { liga: "nba", tabela: [{ pos: 1, time: "Boston Celtics", sigla: "BOS", id: "2", curto: "Celtics", grupo: "Leste" }] },
    "esportes-atp": { liga: "atp", tabela: [], rodada: { jogos: [] } },
  };
}
function ambiente() {
  const DB = d1Falso();
  for (const [id, d] of Object.entries(docsLigas())) DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES ('meta', ?, ?, '')").run(id, JSON.stringify(d));
  const esp = espelhoFalso();
  const lerLinhas = async (env, sql, args) => (await env.DB.prepare(sql).bind(...args).all()).results;
  return { env: { DB }, deps: { lerLinhas, gravarNoEspelho: esp.gravarNoEspelho }, esp };
}
const pedido = (metodo, corpo) => new Request("https://x/api/esportes/times", { method: metodo, headers: { "content-type": "application/json" }, ...(corpo === undefined ? {} : { body: typeof corpo === "string" ? corpo : JSON.stringify(corpo) }) });
const salvoDe = (env, email) => { const r = env.DB.db.prepare("SELECT data FROM docs WHERE collection = ? AND id = ?").get("prefs/" + email, ID_TIMES); return r ? JSON.parse(r.data) : null; };

test("times conhecidos: os das tabelas e dos jogos coletados, com país da liga nacional e as competições; NBA com o esporte na chave", () => {
  const docs = new Map(Object.entries(docsLigas()).map(([k, v]) => [k.slice(9), v]));
  const m = timesConhecidos(docs);
  assert.deepEqual([...m.keys()].sort(), ["16", "1936", "2029", "6273", "basquete-2"]);
  const inter = m.get("1936");
  assert.deepEqual([inter.nome, inter.pais, inter.ligas, inter.escudo], ["Internacional", "BR", ["bra.1", "conmebol.libertadores"], ESC(1936)]);
  assert.equal(m.get("16").pais, "", "time só da Libertadores fica sem país");
  assert.deepEqual([m.get("basquete-2").id, m.get("basquete-2").curto, m.get("basquete-2").pais], ["2", "Celtics", "US"]);
  assert.equal(E.chaveTime("nba", "2"), "basquete-2");
  assert.equal(E.chaveTime("bra.1", "1936"), "1936");
});

test("rota de times: GET de quem nunca respondeu, PUT valida contra os conhecidos, grava perguntado e o coração entre os seguidos", async () => {
  limparCacheTimes();
  const { env, deps, esp } = ambiente();
  const eu = { email: "eu@x.dev" };
  let j = await (await rotaTimesEsportes(pedido("GET"), env, eu, deps, AGORA)).json();
  assert.deepEqual([j.coracao, j.seguidos, j.perguntado], [null, [], null]);
  assert.ok(j.conhecidos.some((t) => t.chave === "1936" && t.nome === "Internacional"));

  // validação
  for (const [corpo, msg] of [
    [{ coracao: "9999" }, /tabelas coletadas/],
    [{ coracao: "1936", seguidos: ["nao-existe"] }, /tabelas coletadas/],
    [{ coracao: "19 36" }, /inválido/],
    [{ coracao: "1936", seguidos: "6273" }, /seguidos/],
    [{ coracao: "1936", extra: 1 }, /campo extra/],
    [{ coracao: 1936 }, /inválido/],
  ]) {
    const r = await rotaTimesEsportes(pedido("PUT", corpo), env, eu, deps, AGORA);
    assert.equal(r.status, 400, JSON.stringify(corpo));
    assert.match((await r.json()).erro, msg);
  }
  assert.equal((await rotaTimesEsportes(pedido("PUT", "{nao é json"), env, eu, deps, AGORA)).status, 400);
  assert.equal(salvoDe(env, "eu@x.dev"), null, "nada gravado com corpo ruim");
  // limite de seguidos
  const muitos = E.validarTimes({ coracao: null, seguidos: Array.from({ length: 11 }, (_, i) => "t" + i) }, new Map(Array.from({ length: 11 }, (_, i) => ["t" + i, {}])));
  assert.match(muitos.erro, /até 10/);

  // certo
  const r = await rotaTimesEsportes(pedido("PUT", { coracao: "1936", seguidos: ["6273", "basquete-2", "6273"] }), env, eu, deps, AGORA);
  assert.equal(r.status, 200);
  j = await r.json();
  assert.deepEqual([j.coracao, j.seguidos], ["1936", ["1936", "6273", "basquete-2"]]);
  const salvo = salvoDe(env, "eu@x.dev");
  assert.deepEqual(Object.keys(salvo).sort(), ["atualizado", "coracao", "perguntado", "seguidos", "v"]);
  assert.equal(salvo.perguntado, new Date(AGORA).toISOString());
  assert.equal(salvo.v, 1);
  assert.equal(esp.gravados.at(-1).collection, "prefs/eu@x.dev");
  assert.equal(esp.gravados.at(-1).id, "esportes-times");
  assert.equal(E.devePerguntar(j), false);

  // Não torço para nenhum time: grava perguntado sem coração
  j = await (await rotaTimesEsportes(pedido("PUT", { coracao: null, seguidos: [] }), env, eu, deps, AGORA + 1000)).json();
  assert.deepEqual([j.coracao, j.seguidos], [null, []]);
  assert.ok(j.perguntado);
  assert.equal(E.devePerguntar(j), false);
  assert.equal((await rotaTimesEsportes(new Request("https://x", { method: "DELETE" }), env, eu, deps, AGORA)).status, 405);
  assert.equal((await rotaTimesEsportes(pedido("GET"), env, {}, deps, AGORA)).status, 401);
});

test("rota de times: cada pessoa só lê e grava o próprio doc", async () => {
  limparCacheTimes();
  const { env, deps } = ambiente();
  await rotaTimesEsportes(pedido("PUT", { coracao: "1936", seguidos: [] }), env, { email: "a@x.dev" }, deps, AGORA);
  await rotaTimesEsportes(pedido("PUT", { coracao: "6273", seguidos: ["2029"] }), env, { email: "b@x.dev" }, deps, AGORA);
  const a = await (await rotaTimesEsportes(pedido("GET"), env, { email: "a@x.dev" }, deps, AGORA)).json();
  const b = await (await rotaTimesEsportes(pedido("GET"), env, { email: "b@x.dev" }, deps, AGORA)).json();
  assert.deepEqual(a.seguidos, ["1936"]);
  assert.deepEqual(b.seguidos, ["6273", "2029"]);
  assert.equal(salvoDe(env, "a@x.dev").coracao, "1936", "o PUT de b não mexeu no doc de a");
  const docs = env.DB.db.prepare("SELECT collection FROM docs WHERE id = ? ORDER BY collection").all(ID_TIMES).map((r) => r.collection);
  assert.deepEqual(docs, ["prefs/a@x.dev", "prefs/b@x.dev"]);
});

test("Worker: /api/esportes/times pede a seção Esportes e corpo JSON; grava no doc de quem chamou", async () => {
  limparCacheTimes();
  const DB = d1Falso();
  for (const [id, d] of Object.entries(docsLigas())) DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES ('meta', ?, ?, '')").run(id, JSON.stringify(d));
  DB.db.prepare("INSERT INTO usuarios (email, nome) VALUES (?, ?), (?, ?)").run("times-a@x.com", "A", "times-sem@x.com", "S");
  DB.db.prepare("INSERT INTO grupos (id, nome, secoes, padrao) VALUES ('so-tech', 'Só tech', '[\"tech\"]', 0), ('todos', 'Todos', '[\"tech\",\"esportes\"]', 0)").run();
  DB.db.prepare("INSERT INTO usuario_grupo (email, grupo) VALUES ('times-sem@x.com', 'so-tech'), ('times-a@x.com', 'todos')").run();
  const env = { DB, ADMIN_EMAIL: "admin@x.com" };
  const ctx = { waitUntil() {} };
  const chamar = (metodo, email, corpo, tipo = "application/json") => worker.fetch(new Request("https://lookout.test/api/esportes/times", { method: metodo, headers: { "X-Requested-With": "XMLHttpRequest", "content-type": tipo }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) }), { ...env, DEV_EMAIL: email }, ctx);
  assert.equal((await chamar("GET", "times-sem@x.com")).status, 403, "sem a seção Esportes");
  assert.equal((await chamar("PUT", "times-sem@x.com", { coracao: "1936" })).status, 403);
  assert.equal((await chamar("PUT", "times-a@x.com", { coracao: "1936" }, "text/plain")).status, 415);
  const r = await chamar("PUT", "times-a@x.com", { coracao: "1936", seguidos: ["6273"] });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).seguidos, ["1936", "6273"]);
  assert.equal(salvoDe(env, "times-a@x.com").coracao, "1936");
  assert.equal(salvoDe(env, "times-sem@x.com"), null);
});

// ---------- agenda em rodízio (faixa da semana sem pedir mais) ----------

test("diasExtras com os dias já buscados: rodízio dentro da semana, ontem e amanhã voltam mais, o número de dias não muda", () => {
  const cal = [-3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 9].map((n) => new Date(AGORA + n * DIA).toISOString());
  const d = (n) => diaSP(AGORA, n);
  // sem memória: como antes, os mais perto
  assert.deepEqual(diasExtras(cal, AGORA, 2), [d(-1), d(1)]);
  // memória vazia: igual (nunca buscado empata e o mais perto desempata)
  assert.deepEqual(diasExtras(cal, AGORA, 2, {}), [d(-1), d(1)]);
  // ontem e amanhã buscados há 10 min: vão os dias da semana nunca buscados, o mais perto primeiro
  const recente = new Date(AGORA - 10 * 60000).toISOString();
  assert.deepEqual(diasExtras(cal, AGORA, 2, { [d(-1)]: recente, [d(1)]: recente }), [d(-2), d(2)]);
  // todos da semana buscados; o buscado há mais tempo volta primeiro; o dia 9 (fora da semana) fica por último
  const h = (horas) => new Date(AGORA - horas * HORA).toISOString();
  const vistos = { [d(-3)]: h(1), [d(-2)]: h(1), [d(-1)]: h(1), [d(1)]: h(1), [d(2)]: h(1), [d(3)]: h(1), [d(4)]: h(5), [d(5)]: h(1), [d(6)]: h(1), [d(7)]: h(3) };
  assert.deepEqual(diasExtras(cal, AGORA, 2, vistos), [d(4), d(7)]);
  // ontem buscado há 2 h conta como 4 h: passa na frente do dia 7 (3 h)
  assert.deepEqual(diasExtras(cal, AGORA, 2, { ...vistos, [d(-1)]: h(2) }), [d(4), d(-1)]);
  assert.equal(diasExtras(cal, AGORA, 5, vistos).length, 5);
});

test("juntarAgenda: o dia buscado troca o que havia dele; os outros dias ficam; fora da janela de 10 dias sai", () => {
  const velho = jogo(1, em(3), 1, 2, "pre"), velhoMudou = jogo(2, em(0, 2), 3, 4, "pre"), antigo = jogo(3, em(-12), 5, 6, "post", [1, 0]);
  const antes = { jogos: [velho, velhoMudou, antigo], vistos: { [diaSP(AGORA, 3)]: em(-1), [diaSP(AGORA, -30)]: em(-30) } };
  const agoraHoje = [{ ...velhoMudou, estado: "in", placar: [0, 0] }];
  const a = juntarAgenda(antes, agoraHoje, [diaSP(AGORA)], AGORA);
  assert.deepEqual(a.jogos.map((j) => [j.id, j.estado]), [["2", "in"], ["1", "pre"]]);
  assert.equal(a.vistos[diaSP(AGORA)], new Date(AGORA).toISOString());
  assert.ok(a.vistos[diaSP(AGORA, 3)]);
  assert.ok(!a.vistos[diaSP(AGORA, -30)], "dia velho sai da memória");
  assert.deepEqual(diasDoCalendario(["2026-11-04T08:00Z", "2026-11-04T23:00Z", "2026-11-08T08:00Z"]), ["2026-11-04", "2026-11-08"]);
});

test("cron: a agenda guarda a semana, o calendário vira diasJogo e a janela da temporada vem do scoreboard", async () => {
  const env = { DB: d1Falso() };
  const t = (id, nome, sigla) => ({ id: String(id), displayName: nome, abbreviation: sigla });
  const ev = (id, quando, a, b) => ({ id: String(id), date: quando, competitions: [{ competitors: [{ homeAway: "home", team: a }, { homeAway: "away", team: b }], status: { type: { state: "pre" } } }] });
  const INTER_T = t(1936, "Internacional", "INT"), GRE_T = t(6273, "Grêmio", "GRE"), PAL_T = t(2029, "Palmeiras", "PAL");
  const porDia = { [diaSP(AGORA)]: [ev(1, em(0, 2), INTER_T, GRE_T)], [diaSP(AGORA, 3)]: [ev(2, em(3), PAL_T, INTER_T)], [diaSP(AGORA, 6)]: [ev(3, em(6), GRE_T, PAL_T)] };
  const calendario = [0, 3, 6, 40].map((n) => new Date(AGORA + n * DIA).toISOString());
  const pedidos = [];
  globalThis.fetch = async (url) => {
    const u = String(url); pedidos.push(u);
    const dia = (/dates=(\d{8})/.exec(u) || [])[1];
    if (u.includes("/scoreboard")) return new Response(JSON.stringify({ events: porDia[dia] || [], leagues: [{ calendar: calendario, season: { year: 2026, startDate: "2026-01-28T08:00Z", endDate: "2026-12-07T07:59Z", type: { type: 2 } } }] }));
    return new Response("{}", { status: 404 });
  };
  const sb = lerScoreboard({ leagues: [{ calendar: calendario, season: { year: 2026, startDate: "2026-01-28T08:00Z", endDate: "2026-12-07T07:59Z", type: { type: 2 } } }] });
  assert.deepEqual(sb.janela, { inicio: "2026-01-28T08:00:00.000Z", fim: "2026-12-07T07:59:00.000Z", tipo: 2 });
  // primeira passada, sem memória: hoje e os dias do calendário na janela (3 e 6), como antes
  const fila = novaFila({ pausa: 0, orcamento: 20 });
  const d1 = await atualizarLiga(env, "bra.1", { fila, forcar: { rodada: true, tabela: false, times: false }, agora: AGORA });
  assert.equal(pedidos.filter((u) => u.includes("scoreboard")).length, 3, "hoje e mais 2 dias, como antes (diasExtras padrão é 5, o calendário só tem 2 na janela)");
  assert.deepEqual(d1.agenda.jogos.map((j) => j.id), ["1", "2", "3"]);
  assert.ok(d1.diasJogo.includes(diaSP(AGORA, 40).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3")), "o dia de daqui a 40 dias fica guardado");
  assert.equal(d1.temporadaJanela.tipo, 2);
  assert.equal(E.emAndamento(d1, AGORA), true);
  const cab = E.jogosDoCabecalho(E.jogosDoDoc(d1), "bra.1", "1936", AGORA);
  assert.equal(cab.fixo.id, "1");
  assert.deepEqual(cab.lista.map((j) => j.id), ["2", "3"]);
});

test("ícone da notícia: clube da curadoria, título, delegação e palavra comum", () => {
  const ES = globalThis.Esportes;
  const esc = (n) => `https://a.espncdn.com/i/teamlogos/soccer/500/${n}.png`;
  const cat = { times: { 1: { nome: "Grêmio", sigla: "GRE", escudo: esc(1), pais: "BR" }, 2: { nome: "Santos", sigla: "SAN", escudo: esc(2), pais: "BR" }, 3: { nome: "Manchester City", sigla: "MCI", escudo: esc(3), pais: "GB" } },
    mapa: { gremio: ["1"], santos: ["2"], "manchester city": ["3"] } };
  assert.equal(ES.iconeDaNoticia({ titulo: "Volante renova até 2028", clube: "Grêmio", tema: "gremio" }, cat).nome, "Grêmio");
  assert.equal(ES.iconeDaNoticia({ titulo: "Manchester City vence fora de casa", tema: "internacional" }, cat).sigla, "MCI");
  assert.equal(ES.iconeDaNoticia({ titulo: "Os santos do dia e a rodada", escopo: "nacional" }, cat), null);
  const p = ES.iconeDaNoticia({ titulo: "Seleção brasileira é convocada para amistosos" }, cat);
  assert.equal(p.tipo, "pais"); assert.equal(p.nome, "Brasil"); assert.equal(p.bandeira, "🇧🇷");
  assert.equal(ES.iconeDaNoticia({ titulo: "Delegação da Argentina chega ao Rio" }, cat).nome, "Argentina");
  assert.equal(ES.iconeDaNoticia({ titulo: "Federação muda o calendário" }, cat), null);
  assert.equal(ES.iconeDaNoticia({ titulo: "x", clube: "Seleção Brasileira" }, cat).tipo, "pais");
  assert.equal(ES.iconeDaNoticia({ titulo: "Grêmio joga hoje" }, null), null);
  assert.equal(ES.iconeDaNoticia({ titulo: "Scaloni mantém a camisa 10 da Argentina sem dono" }, cat).nome, "Argentina");
  assert.equal(ES.iconeDaNoticia({ titulo: "Técnico elogia a torcida Brasileira no estádio" }, cat), null);
});
