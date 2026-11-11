// Esportes (src/esportes.js e public/esportes.js): parsers da ESPN e do ge, zonas, Meus esportes, cron com D1 em SQLite
// do Node e fetch falso; e as colunas Qtd e Valor das Minhas listas (public/radar-filtro.js). JSON e HTML de exemplo em
// test/fixtures-esportes.mjs: o proxy do ambiente não alcança a ESPN nem o ge.
import test from "node:test";
import assert from "node:assert/strict";
import { lerJogo, lerJogos, lerScoreboard, lerStandings, lerGe, blocosJson, escolherRodada, proximosDe, ultimosDe, vencidos, quente,
  cronEsportes, cronSondaEsportes, atualizarLiga, ligasAtivas, listaSonda, novaFila, urlScoreboard, urlStandings, urlSchedule, diaSP, diasExtras,
  lerTenis, lerPartida, partidasDoDia, lerEscudos, escudoDoTime, lerTimesEspn, atualizarCatalogoEscudos, urlTimes } from "../src/esportes.js";
import { catalogoDe, validarPainel, formatosDe, respostaPainel } from "../src/painel.js";
import { FEEDS, SECOES_COM_FORUM } from "../src/feeds.js";
import { REDDIT } from "../src/coleta.js";
import "../public/esportes.js";
import "../public/radar-filtro.js";
import { d1Falso } from "./d1-falso.mjs";
import { AGORA, T, scoreboardBra, scoreboardLib, standingsBra, standingsLib, scheduleInter, htmlGe, htmlGeTabela,
  scoreboardNba, standingsNba, scoreboardAtp, scoreboardAtpDia, scoreboardWta, timesEspn, ESCUDO } from "./fixtures-esportes.mjs";

const E = globalThis.Esportes;
const RF = globalThis.RadarFiltro;
const MIN = 60_000;

test("scoreboard da ESPN: pre, in (com minuto e intervalo) e post; campos faltando não quebram", () => {
  const sb = lerScoreboard(scoreboardBra());
  assert.equal(sb.temporada, 2026);
  assert.equal(sb.nome, "Brazilian Serie A");
  const porId = Object.fromEntries(sb.jogos.map((j) => [j.id, j]));
  assert.equal(sb.jogos.length, 6, "o evento sem nome de time sai");
  assert.ok(!porId["705"]);
  const vivo = porId["702"];
  assert.deepEqual([vivo.mandante, vivo.visitante, vivo.estado, vivo.minuto], ["Internacional", "Grêmio", "in", "67'"]);
  assert.deepEqual(vivo.placar, [2, 1]);
  assert.deepEqual(vivo.siglas, ["INT", "GRE"]);
  assert.deepEqual(vivo.ids, ["1936", "6273"]);
  assert.equal(vivo.estadio, "Estádio Exemplo");
  assert.equal(porId["707"].minuto, "intervalo");
  const pre = porId["703"];
  assert.equal(pre.estado, "pre");
  assert.equal(pre.placar, null, "jogo que não começou não tem placar");
  assert.equal(pre.estadio, "", "sem venue");
  const fim = porId["701"];
  assert.deepEqual([fim.estado, ...fim.placar], ["post", 3, 1]);
  // placar como objeto e sem homeAway: o primeiro é o mandante
  assert.deepEqual([porId["706"].mandante, porId["706"].visitante, ...porId["706"].placar], ["Bahia", "Palmeiras", 0, 2]);
  // ordenados por data
  assert.deepEqual(sb.jogos.map((j) => j.data), sb.jogos.map((j) => j.data).slice().sort());
  // lixo
  assert.equal(lerJogo(null), null);
  assert.equal(lerJogo({ competitions: [] }), null);
  assert.deepEqual(lerJogos({}), []);
  assert.deepEqual(lerScoreboard(null).jogos, []);
});

test("rodada atual, próximos e últimos a partir da janela de jogos", () => {
  const { jogos } = lerScoreboard(scoreboardBra());
  const r = escolherRodada(jogos, AGORA);
  assert.ok(r.jogos.some((j) => j.estado === "in"), "a rodada é a do jogo ao vivo");
  assert.ok(!r.jogos.some((j) => j.id === "706"), "jogo de mais de 2 dias antes fica fora");
  // com número de rodada, vale o número
  const comNum = jogos.map((j, i) => ({ ...j, rodada: i < 3 ? 31 : 32 }));
  assert.ok(escolherRodada(comNum, AGORA).jogos.every((j) => j.rodada === comNum.find((x) => x.estado === "in").rodada));
  assert.deepEqual(escolherRodada([], AGORA).jogos, []);
  const prox = proximosDe(jogos, AGORA);
  assert.ok(prox.every((j) => j.estado !== "post"));
  assert.equal(prox[0].id, "702", "o ao vivo conta como próximo enquanto não acaba");
  assert.deepEqual(ultimosDe(jogos).map((j) => j.id), ["701", "706"]);
});

test("standings: stats por nome (draws ou ties), linha sem stats, grupos e zonas", () => {
  const { tabela, temporada } = lerStandings(standingsBra(), "bra.1");
  assert.equal(temporada, 2026);
  assert.equal(tabela.length, 6, "a entrada sem time sai");
  const inter = tabela.find((l) => l.time === "Internacional");
  assert.deepEqual({ pos: inter.pos, j: inter.j, v: inter.v, e: inter.e, d: inter.d, gp: inter.gp, gc: inter.gc, sg: inter.sg, pts: inter.pts, sigla: inter.sigla, id: inter.id },
    { pos: 7, j: 33, v: 14, e: 10, d: 9, gp: 45, gc: 38, sg: 7, pts: 52, sigla: "INT", id: "1936" });
  assert.equal(tabela.find((l) => l.time === "Flamengo").e, 8, "draws");
  assert.equal(tabela.find((l) => l.time === "Palmeiras").e, 7, "ties também vira empate");
  assert.deepEqual(tabela.map((l) => l.time + ":" + l.zona), ["Palmeiras:libertadores", "Flamengo:libertadores", "Bahia:libertadores", "Internacional:pre-libertadores", "Santos:sul-americana", "Grêmio:rebaixamento"]);
  const semStats = tabela.find((l) => l.time === "Bahia");
  assert.equal(semStats.pts, null);
  assert.equal(semStats.pos, 6, "sem rank: a posição pela ordem");
  assert.ok(!("grupo" in inter), "competição de grupo único não leva grupo");
  const lib = lerStandings(standingsLib(), "conmebol.libertadores").tabela;
  assert.deepEqual(lib.map((l) => l.grupo + ":" + l.pos + ":" + l.zona), ["Group A:1:classifica", "Group A:2:classifica", "Group B:1:classifica", "Group B:2:classifica"]);
  assert.deepEqual(lerStandings(null, "bra.1").tabela, []);
  assert.deepEqual(lerStandings({ children: [{ standings: { entries: "x" } }] }, "bra.1").tabela, []);
});

test("zonas por liga e legenda", () => {
  const z = (liga, p) => E.zonaDe(liga, p);
  assert.deepEqual([1, 6, 7, 8, 9, 14, 15, 16, 17, 20].map((p) => z("bra.1", p)), ["libertadores", "libertadores", "pre-libertadores", "pre-libertadores", "sul-americana", "sul-americana", "", "", "rebaixamento", "rebaixamento"]);
  assert.equal(z("eng.1", 4), "champions");
  assert.equal(z("eng.1", 5), "europa");
  assert.equal(z("eng.1", 18), "rebaixamento");
  assert.equal(z("ger.1", 16), "playoff-rebaixamento");
  assert.equal(z("bra.copa_do_brasil", 1), "", "mata-mata sem zonas");
  assert.equal(z("liga.inventada", 1), "");
  assert.equal(z("bra.1", "x"), "");
  const leg = E.legendaDe("bra.1");
  assert.deepEqual(leg.map((l) => l.nome + " " + l.faixa), ["Libertadores 1º a 6º", "Pré-Libertadores 7º a 8º", "Sul-Americana 9º a 14º", "Rebaixamento 17º a 20º"]);
  assert.ok(leg.every((l) => /^var\(--/.test(l.cor)), "cores dos tokens do design system");
  // toda competição tem caminho da ESPN e as zonas não se sobrepõem
  for (const id of E.ORDEM_LIGAS) {
    const l = E.LIGAS[id];
    assert.match(l.caminho, /^[a-z]+\/[a-z0-9._]+$/, id);
    const ps = l.zonas.flatMap((x) => Array.from({ length: x.ate - x.de + 1 }, (_, k) => x.de + k));
    assert.equal(new Set(ps).size, ps.length, id);
  }
});

test("ge: JSON embutido, tabela no HTML, HTML inesperado e lixo não quebram", () => {
  const g = lerGe(htmlGe(), "bra.camp.gaucho", AGORA);
  assert.equal(g.tabela.length, 4);
  assert.deepEqual(g.tabela.map((l) => [l.pos, l.time, l.pts, l.zona]), [[1, "Internacional", 25, "quartas"], [2, "Grêmio", 23, "quartas"], [11, "Ypiranga", 8, "rebaixamento"], [12, "São José", 5, "rebaixamento"]]);
  assert.equal(g.tabela[3].sg, -15, "sem saldo: GP − GC");
  assert.equal(g.tabela[0].id, "285");
  assert.equal(g.tabela[3].id, "sao-jose", "sem id: slug do nome");
  assert.equal(g.jogos.length, 2);
  const [gre, ypi] = g.jogos;
  assert.deepEqual([gre.mandante, gre.visitante, gre.estado, ...gre.placar, gre.estadio], ["Internacional", "Grêmio", "post", 2, 0, "Beira-Rio"]);
  assert.equal(gre.data, "2026-03-01T19:00:00.000Z", "hora sem fuso é de Brasília");
  assert.deepEqual([ypi.estado, ypi.placar, ypi.data], ["pre", null, "2026-11-08T21:30:00.000Z"]);
  const t = lerGe(htmlGeTabela(), "bra.camp.gaucho");
  assert.deepEqual(t.tabela.map((l) => [l.pos, l.time, l.pts, l.j, l.sg]), [[1, "Internacional", 25, 11, 13], [2, "Juventude", 21, 11, 5]]);
  assert.equal(lerGe("<html><body><p>Página nova do ge, sem tabela</p></body></html>"), null);
  assert.equal(lerGe('<script>{"classificacao": [ {"quebrado": </script>'), null);
  assert.equal(lerGe(null), null);
  assert.equal(lerGe(12), null);
  assert.deepEqual(blocosJson('a "x": [1, "]", {"y": [2]}] b "x": {"z": 1}', "x"), [[1, "]", { y: [2] }], { z: 1 }]);
});

test("Meus esportes: validação contra LIGAS, padrão e ordem", () => {
  const ok = E.validarPrefs({ competicoes: ["bra.1", "bra.camp.gaucho", "bra.1"], times: [{ liga: "bra.1", id: "1936", nome: " Internacional " }], ordem: ["bra.camp.gaucho", "bra.1"] });
  assert.deepEqual(ok.prefs.competicoes, ["bra.1", "bra.camp.gaucho"]);
  assert.deepEqual(ok.prefs.times, [{ liga: "bra.1", id: "1936", nome: "Internacional" }]);
  assert.deepEqual(ok.prefs.ordem.slice(0, 2), ["bra.camp.gaucho", "bra.1"]);
  assert.equal(ok.prefs.ordem.length, E.ORDEM_LIGAS.length, "a ordem guarda todas, ligadas ou não");
  assert.deepEqual(E.ligadas(ok.prefs), ["bra.camp.gaucho", "bra.1"]);
  assert.match(E.validarPrefs({ competicoes: ["nhl"] }).erro, /desconhecida/);
  assert.match(E.validarPrefs({ competicoes: [], times: [{ liga: "x", id: "1", nome: "a" }] }).erro, /desconhecida/);
  assert.match(E.validarPrefs({ competicoes: [], times: [{ liga: "bra.1", id: "1;DROP", nome: "a" }] }).erro, /id de time/);
  assert.match(E.validarPrefs({ competicoes: [], times: [{ liga: "bra.1", id: "1", nome: "" }] }).erro, /Nome/);
  assert.match(E.validarPrefs({ competicoes: [], times: Array.from({ length: 11 }, (_, i) => ({ liga: "bra.1", id: String(i), nome: "T" + i })) }).erro, /até 10/);
  assert.match(E.validarPrefs({ competicoes: [], extra: 1 }).erro, /campo/);
  assert.match(E.validarPrefs([]).erro, /corpo/);
  assert.match(E.validarPrefs({}).erro, /competições/);
  const padrao = E.respostaPrefs(null);
  assert.equal(padrao.padrao, true);
  assert.deepEqual(padrao.competicoes, ["bra.1", "conmebol.libertadores", "bra.copa_do_brasil"]);
  assert.deepEqual(padrao.times, []);
  assert.equal(padrao.esportes[0].id, "futebol");
  assert.deepEqual(padrao.jogadores, []);
  assert.deepEqual(padrao.esportes.map((e) => e.nome), ["Futebol", "Basquete", "Tênis", "Padel"]);
  assert.deepEqual(padrao.esportes[1].ligas.map((l) => l.id), ["nba"]);
  assert.deepEqual(padrao.esportes[2].ligas.map((l) => l.id), ["atp", "wta"]);
  assert.deepEqual(padrao.esportes[3].ligas, [], "padel sem competição, só a nota");
  assert.equal(padrao.esportes[3].nota, "Resultados de padel ainda sem fonte pública; por enquanto só notícias.");
  assert.ok(!padrao.esportes.some((e) => e.ligas.some((l) => l.id === "nfl")) && !E.LIGAS.nfl, "NFL fora (05/11)");
  assert.ok(!padrao.esportes[0].ligas.some((l) => ["nba", "atp", "wta"].includes(l.id)), "NBA e tênis fora do grupo Futebol");
  assert.ok(["nba", "atp", "wta"].every((l) => !padrao.competicoes.includes(l) && !E.SEMPRE.includes(l)), "ligadas só quando a pessoa marcar");
  assert.deepEqual(E.validarPrefs({ competicoes: ["nba", "atp"], times: [{ liga: "nba", id: "13", nome: "Lakers" }] }).prefs.competicoes, ["nba", "atp"]);
  assert.match(E.validarPrefs({ competicoes: ["nfl"] }).erro, /desconhecida/, "NFL não é mais aceita no PUT");
  // quem salvou antes das competições novas: elas entram no fim da ordem, desligadas
  const velho = E.respostaPrefs({ competicoes: ["bra.1"], times: [], ordem: ["bra.1", "eng.1"] });
  assert.deepEqual(velho.ordem.slice(-3), ["nba", "atp", "wta"]);
  assert.deepEqual(velho.competicoes, ["bra.1"]);
  // quem tinha a NFL ligada: ela sai em silêncio e o resto fica (não vira o padrão)
  const comNfl = E.respostaPrefs({ competicoes: ["bra.1", "nfl", "nba"], times: [{ liga: "nfl", id: "12", nome: "Chiefs" }, { liga: "nba", id: "13", nome: "Lakers" }], ordem: ["nfl", "nba", "bra.1"] });
  assert.equal(comNfl.padrao, false);
  assert.deepEqual(comNfl.competicoes, ["bra.1", "nba"]);
  assert.deepEqual(comNfl.times, [{ liga: "nba", id: "13", nome: "Lakers" }]);
  assert.deepEqual(comNfl.ordem.slice(0, 2), ["nba", "bra.1"]);
  assert.equal(E.respostaPrefs({ competicoes: ["inventada"] }).padrao, true, "salvo estragado vira o padrão");
  assert.deepEqual(E.respostaPrefs({ competicoes: ["eng.1"], times: [], ordem: [] }).competicoes, ["eng.1"]);
});

test("Minhas listas: Qtd, Valor e a cor da linha com e sem carteira", () => {
  const posicoes = [{ t: "HGLG11", q: 30, pm: 160.2, preco: 140, valor: 4200, resPct: -12.6 }, { t: "MXRF11", q: 600, pm: 9.81, preco: 9.5 }, { t: "KNRI11", q: 0, pm: 139.5 }];
  const h = RF.posicaoLista("HGLG11", posicoes, 144.19);
  assert.deepEqual(h, { q: 30, valor: 4325.7, pm: 160.2, resPct: -9.99 }, "valor e resultado pelo preço atual da lista");
  assert.equal(RF.tomLista(h, 2), "neg", "com o papel, vale o resultado da posição, não o dia");
  const m = RF.posicaoLista("MXRF11", posicoes, null);
  assert.equal(m.valor, 5700, "sem cotação na lista, o preço da carteira");
  assert.equal(RF.posicaoLista("KNRI11", posicoes, 146), null, "posição zerada não conta");
  assert.equal(RF.posicaoLista("PETR4", posicoes, 36), null, "sem o papel");
  assert.equal(RF.posicaoLista("HGLG11", null, 144), null, "sem carteira");
  assert.equal(RF.tomLista(null, 1.2), "pos", "sem o papel: a variação do dia");
  assert.equal(RF.tomLista(null, -0.4), "neg");
  assert.equal(RF.tomLista(null, null), "");
  assert.equal(RF.tomLista(RF.posicaoLista("X", [{ t: "X", q: 1, pm: 10 }], 12), -3), "pos");
});

test("Início: rodada e tabela por competição, próximo jogo do time; só para quem tem Esportes", () => {
  const ids = catalogoDe(null).map((w) => w.id);
  for (const l of E.ORDEM_LIGAS) { assert.ok(ids.includes("esportes-rodada-" + l)); assert.equal(ids.includes("esportes-tabela-" + l), !E.LIGAS[l].tenis, l); }
  assert.ok(!ids.some((id) => id.endsWith("-nfl")), "sem widget da NFL");
  assert.ok(ids.includes("esportes-meu-time"));
  assert.deepEqual(formatosDe("esportes-rodada-bra.1"), ["1x1", "2x1"]);
  assert.deepEqual(formatosDe("esportes-tabela-bra.copa_do_brasil"), ["1x1", "1x2"]);
  assert.deepEqual(formatosDe("esportes-meu-time"), ["1x1"]);
  const titulos = Object.fromEntries(catalogoDe(null).map((w) => [w.id, w.titulo]));
  assert.equal(titulos["esportes-rodada-bra.1"], "Brasileirão · rodada");
  assert.equal(titulos["esportes-tabela-bra.1"], "Brasileirão · tabela");
  assert.equal(titulos["esportes-rodada-nba"], "NBA · jogos");
  assert.equal(titulos["esportes-rodada-atp"], "ATP · jogos");
  assert.equal(titulos["esportes-rodada-wta"], "WTA · jogos");
  assert.deepEqual(formatosDe("esportes-rodada-atp"), ["1x1", "2x1"]);
  // painel salvo com widget da NFL: some da resposta sem estragar o resto
  const r = respostaPainel({ widgets: [{ id: "esportes-rodada-nfl", formato: "1x1" }, { id: "esportes-rodada-atp", formato: "1x1" }] }, null);
  assert.deepEqual(r.widgets.map((w) => w.id), ["esportes-rodada-atp"]);
  assert.deepEqual(formatosDe("esportes-tabela-nba"), ["1x1", "1x2"]);
  const semEsportes = ["tech", "negocios", "investimentos", "politica"];
  assert.ok(!catalogoDe(semEsportes).some((w) => w.id.startsWith("esportes-")));
  assert.match(validarPainel({ widgets: [{ id: "esportes-rodada-bra.1", formato: "1x1" }] }, semEsportes).erro, /não liberada/);
  assert.deepEqual(validarPainel({ widgets: [{ id: "esportes-tabela-bra.1", formato: "1x2" }, { id: "esportes-meu-time", formato: "1x1" }] }, null).widgets.length, 2);
  assert.match(validarPainel({ widgets: [{ id: "esportes-meu-time", formato: "2x1" }] }, null).erro, /Formato/);
  assert.ok(!respostaPainel(null, null).widgets.some((w) => w.id.startsWith("esportes-")), "fora do padrão");
  assert.equal(respostaPainel(null, null).catalogo.find((w) => w.id === "esportes-rodada-eng.1").liga, "eng.1");
});

test("subreddits: 38, um por URL, todas as seções com fórum, e o ritmo comporta", () => {
  const subs = FEEDS.filter((f) => f[4] === "reddit");
  assert.equal(subs.length, 38);
  assert.equal(new Set(subs.map((f) => f[3].toLowerCase())).size, 38, "sem URL repetida");
  assert.deepEqual([...SECOES_COM_FORUM].sort(), ["esportes", "investimentos", "negocios", "politica", "tech"]);
  for (const s of ["r/futebol", "r/soccer", "r/brasileirao", "r/SCInternacional"]) assert.ok(subs.some((f) => f[0] === "esportes" && f[1] === s), s);
  for (const s of ["r/investimentos", "r/farialimabets", "r/dividends", "r/investing", "r/stocks", "r/ValueInvesting"]) assert.ok(subs.some((f) => f[0] === "investimentos" && f[1] === s), s);
  // 1 por minuto e cada um a cada 120 min: cabem 120
  assert.ok(subs.length * REDDIT.POR_MINUTO <= REDDIT.INTERVALO_MIN);
  assert.ok(catalogoDe(null).some((w) => w.id === "foruns-esportes") && catalogoDe(null).some((w) => w.id === "foruns-investimentos"));
});

// ---------- cron com D1 em SQLite e fetch falso ----------
function ambiente({ ligasEspn = null, status = {} } = {}) {
  const env = { DB: d1Falso() };
  const pedidos = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    pedidos.push(u);
    for (const [trecho, st] of Object.entries(status)) if (u.includes(trecho)) {
      const s = typeof st === "function" ? st() : st;
      if (s !== 200) return new Response("erro", { status: s });
    }
    const js = (o) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
    if (u.includes("ge.globo.com/futebol/campeonato-gaucho")) return new Response(htmlGe(), { status: 200, headers: { "content-type": "text/html" } });
    if (u.includes("ge.globo.com/rss")) return new Response('<?xml version="1.0"?><rss><channel><item><title>Notícia</title><link>https://ge.globo.com/a</link><pubDate>Wed, 04 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>', { status: 200 });
    if (u.includes("basketball/nba/scoreboard")) return js(scoreboardNba());
    if (u.includes("basketball/nba/standings")) return js(standingsNba());
    if (u.includes("tennis/atp/scoreboard")) return js(u.includes("dates=") ? scoreboardAtpDia() : scoreboardAtp());
    if (u.includes("tennis/wta/scoreboard")) return js(u.includes("dates=") ? { events: [] } : scoreboardWta());
    const m = /sports\/soccer\/([a-z0-9._]+)\//.exec(u);
    const liga = m && m[1];
    if (ligasEspn && liga && !ligasEspn.includes(liga)) return new Response('{"code":400,"message":"league not found"}', { status: 400 });
    if (u.includes("/teams/1936/schedule")) return js(scheduleInter());
    if (u.endsWith("/teams")) return js(timesEspn(liga));
    if (u.includes("/scoreboard")) return js(liga === "bra.1" ? scoreboardBra() : liga === "conmebol.libertadores" ? scoreboardLib() : { events: [] });
    if (u.includes("/standings")) return js(liga === "bra.1" ? standingsBra() : liga === "conmebol.libertadores" ? standingsLib() : { children: [] });
    return new Response("não", { status: 404 });
  };
  const doc = (c, id) => { const r = env.DB.db.prepare("SELECT data FROM docs WHERE collection = ? AND id = ?").get(c, id); return r ? JSON.parse(r.data) : null; };
  const prefs = (email, p) => env.DB.db.prepare("INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES (?, 'esportes', ?, '', '')").run("prefs/" + email, JSON.stringify(p));
  return { env, pedidos, doc, prefs };
}
const minuto = (m) => AGORA - (new Date(AGORA).getUTCMinutes() - m) * MIN; // mesmo horário, minuto m

test("URLs da ESPN: scoreboard de um dia, standings e schedule; qualquer esporte/liga; dias extras pelo calendário", () => {
  assert.equal(diaSP(AGORA), "20261105");
  const sb = lerScoreboard(scoreboardBra());
  assert.equal(sb.calendario.length, 5);
  assert.deepEqual(diasExtras(sb.calendario, AGORA), ["20261103", "20261108"], "só os dias da janela, sem hoje, mais perto primeiro");
  assert.deepEqual(diasExtras([], AGORA), ["20261104", "20261106", "20261107", "20261108", "20261103"], "sem calendário: vizinhos fixos");
  assert.deepEqual(diasExtras(["2026-11-01T08:00Z", "2026-11-02T08:00Z", "2026-11-03T08:00Z", "2026-11-04T08:00Z", "2026-11-06T08:00Z", "2026-11-07T08:00Z", "2026-11-09T08:00Z", "2026-11-15T08:00Z", "2026-11-16T08:00Z"], AGORA, 5), ["20261104", "20261106", "20261103", "20261107", "20261102"], "no máximo 5");
  assert.equal(urlScoreboard("bra.1", "20261102"), "https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard?dates=20261102");
  assert.equal(urlStandings("bra.1"), "https://site.api.espn.com/apis/v2/sports/soccer/bra.1/standings");
  assert.equal(urlSchedule("basketball/nba", "13"), "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/13/schedule");
});

test("cron: grava meta/esportes-bra.1 e Libertadores (sempre), times de interesse, ritmo e reserva do ge", async () => {
  const { env, pedidos, doc, prefs } = ambiente({ ligasEspn: ["bra.1", "conmebol.libertadores"] });
  prefs("a@x.dev", { competicoes: ["bra.1", "bra.camp.gaucho"], times: [{ liga: "bra.1", id: "1936", nome: "Inter" }], ordem: [] });
  prefs("b@x.dev", { competicoes: ["inventada"] }); // estragado: ignorado
  const at = await ligasAtivas(env);
  assert.deepEqual(at.ligas, ["bra.1", "conmebol.libertadores", "bra.camp.gaucho"]);
  assert.deepEqual(at.times.get("bra.1"), [{ id: "1936", nome: "Inter" }]);
  // minuto que não termina em 4 nem 9: só a sonda anda
  const r0 = await cronEsportes(env, minuto(3), { pausa: 0, orcamento: 40 });
  assert.equal(r0.ligas.length, 0);
  assert.ok(r0.sonda > 0);
  const antes = pedidos.length;
  const r = await cronEsportes(env, minuto(4), { pausa: 0, orcamento: 40 });
  assert.deepEqual(r.ligas.sort(), ["bra.1", "bra.camp.gaucho", "conmebol.libertadores"]);
  const bra = doc("meta", "esportes-bra.1");
  assert.equal(bra.nome, "Brasileirão Série A");
  assert.equal(bra.fonte, "espn");
  assert.equal(bra.temporada, 2026);
  assert.ok(bra.rodada.jogos.some((j) => j.estado === "in" && j.minuto === "67'"));
  assert.equal(bra.tabela.length, 6);
  assert.equal(bra.tabela[0].zona, "libertadores");
  assert.ok(bra.proximos.length && bra.ultimos.length);
  assert.deepEqual(bra.times["1936"].proximos.map((j) => j.id), ["603", "604"]);
  assert.deepEqual(bra.times["1936"].ultimos.map((j) => j.id), ["602", "601"]);
  assert.ok(bra.rodadaEm && bra.tabelaEm && bra.timesEm);
  assert.ok(doc("meta", "esportes-conmebol.libertadores").tabela.every((l) => l.grupo));
  // Gauchão: a ESPN responde 400 (sem reserva do ge: a página deu 404 na sonda) → erro anotado, doc vazio, nada do ge
  const gau = doc("meta", "esportes-bra.camp.gaucho");
  assert.equal(gau.fonte, "espn");
  assert.deepEqual(gau.tabela, []);
  assert.ok(gau.tentativas.rodada && gau.tentativas.tabela);
  assert.match(doc("_sistema", "esportes-erro").porLiga["bra.camp.gaucho:rodada"].erro, /HTTP 400/);
  assert.ok(!pedidos.slice(antes).some((u) => u.includes("ge.globo.com/futebol")));
  // Brasileirão: hoje + os dias do calendário dentro da janela (03/11 e 08/11), um dia por chamada
  const sbBra = pedidos.slice(antes).filter((u) => u.includes("bra.1/scoreboard")).map((u) => u.split("dates=")[1]);
  assert.deepEqual(sbBra, ["20261105", "20261103", "20261108"]);
  assert.ok(!pedidos.slice(antes).some((u) => u.includes("site.web.api.espn.com")), "sem o endpoint que dá 403");
  // ao vivo no Brasileirão: 15 min. 10 min depois não pede de novo; 15 min depois pede só a rodada
  // (a sonda pede as mesmas URLs: dá ela por terminada para contar só o cron)
  env.DB.db.prepare("UPDATE docs SET data = json_set(data, '$.fim', 'teste') WHERE collection = '_sistema' AND id = 'sonda-esportes'").run();
  const n1 = pedidos.length;
  await cronEsportes(env, minuto(4) + 10 * MIN - 5 * MIN, { pausa: 0 }); // minuto 9
  assert.equal(pedidos.slice(n1).filter((u) => u.includes("espn") && u.includes("bra.1")).length, 0);
  await cronEsportes(env, minuto(4) + 15 * MIN, { pausa: 0 }); // minuto 19
  const novos = pedidos.slice(n1).filter((u) => u.includes("bra.1"));
  assert.ok(novos.some((u) => u.includes("/scoreboard")), "rodada de novo");
  assert.ok(!novos.some((u) => u.includes("/standings") || u.includes("/schedule")), "tabela 2x/dia e times 1x/dia");
  // Gauchão falhou há 15 min: espera 30 min antes de tentar de novo
  assert.ok(!pedidos.slice(n1).some((u) => u.includes("espn") && u.includes("bra.camp.gaucho")));
});

test("ritmo: sem jogo perto, 1x por hora; tentativa que falhou espera; quente() e vencidos()", () => {
  const frio = { rodada: { jogos: [{ estado: "post", data: new Date(AGORA - 50 * 3600_000).toISOString() }] }, proximos: [{ estado: "pre", data: new Date(AGORA + 5 * 3600_000).toISOString() }], rodadaEm: new Date(AGORA - 20 * MIN).toISOString(), tabelaEm: new Date(AGORA - 3600_000).toISOString() };
  assert.equal(quente(frio, AGORA), false);
  assert.deepEqual(vencidos(frio, [], AGORA), { rodada: false, tabela: false, times: false });
  assert.equal(vencidos({ ...frio, rodadaEm: new Date(AGORA - 61 * MIN).toISOString() }, [], AGORA).rodada, true);
  const perto = { ...frio, proximos: [{ estado: "pre", data: new Date(AGORA + 90 * MIN).toISOString() }] };
  assert.equal(quente(perto, AGORA), true);
  assert.equal(vencidos(perto, [], AGORA).rodada, true, "jogo em 1h30: 15 min");
  assert.equal(vencidos({ ...frio, rodadaEm: null, tentativas: { rodada: new Date(AGORA - 10 * MIN).toISOString() } }, [], AGORA).rodada, false, "falhou há 10 min: espera");
  assert.equal(vencidos({}, [{ id: "1" }], AGORA).times, true);
  assert.equal(vencidos({}, [], AGORA).times, false, "sem time de interesse, sem schedule");
});

test("cron: 429 dobra a espera e tenta de novo; falha vai para _sistema/esportes-erro e mantém o que havia", async () => {
  let vezes = 0;
  const { env, doc } = ambiente({ status: { "bra.1/scoreboard": () => (++vezes === 1 ? 429 : 200) } });
  const fila = novaFila({ pausa: 0, orcamento: 10 });
  await atualizarLiga(env, "bra.1", { fila, agora: AGORA, forcar: { rodada: true, tabela: false, times: false } });
  assert.equal(vezes, 4, "429 uma vez, depois 200 em hoje, 03/11 e 08/11");
  assert.ok(doc("meta", "esportes-bra.1").rodada.jogos.length);
  // agora a ESPN cai: o doc continua com a rodada de antes e o erro fica anotado
  const amb2 = ambiente({ status: { "/scoreboard": 503, "/standings": 503 } });
  amb2.env.DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES ('meta', 'esportes-bra.1', ?, '')").run(JSON.stringify(doc("meta", "esportes-bra.1")));
  const r = await cronEsportes(amb2.env, minuto(4) + 3 * 3600_000, { pausa: 0 });
  assert.ok(r.erros > 0);
  const d = amb2.doc("meta", "esportes-bra.1");
  assert.ok(d.rodada.jogos.length, "a rodada boa fica");
  assert.ok(d.tentativas.rodada);
  const err = amb2.doc("_sistema", "esportes-erro");
  assert.match(err.porLiga["bra.1:rodada"].erro, /HTTP 503/);
  // 429 nas duas tentativas: para a passada sem lançar para fora do cron
  const amb3 = ambiente({ status: { "/scoreboard": 429, "/standings": 429 } });
  const r3 = await cronEsportes(amb3.env, minuto(4), { pausa: 0 });
  assert.ok(r3.erros > 0);
});

test("sonda: amostra crua (até 20 KB) de cada endpoint, com status, em lotes, uma vez só", async () => {
  const { env, doc, pedidos } = ambiente({ ligasEspn: ["bra.1", "conmebol.libertadores", "eng.1"] });
  const lista = listaSonda(AGORA);
  assert.ok(lista.length >= 25);
  assert.ok(lista.some((x) => x.tipo === "rss" && x.jaNaColeta), "marca o feed que a coleta já lê");
  let passadas = 0;
  while (!(doc("_sistema", "sonda-esportes") || {}).fim && passadas < 20) { await cronSondaEsportes(env, { pausa: 0, agora: AGORA }); passadas++; }
  const s = doc("_sistema", "sonda-esportes");
  assert.ok(s.fim);
  assert.equal(s.resultados.length, lista.length);
  assert.ok(passadas >= Math.ceil(lista.length / 6));
  const sb = s.resultados.find((x) => x.tipo === "scoreboard" && x.liga === "bra.1");
  assert.equal(sb.status, 200);
  assert.equal(sb.jogos, 6);
  const amostra = doc("_sistema", sb.amostra);
  assert.equal(amostra.status, 200);
  assert.ok(amostra.amostra.length <= 20000);
  assert.equal(s.resultados.find((x) => x.tipo === "standings" && x.liga === "bra.camp.gaucho").status, 400);
  assert.equal(sb.diasNoCalendario, 5);
  const sch = s.resultados.find((x) => x.tipo === "schedule");
  assert.match(sch.url, /teams\/\d+\/schedule/, "o id do time saiu da tabela do bra.1");
  assert.ok(!s.resultados.some((x) => x.tipo === "ge"), "nenhuma liga tem página do ge hoje");
  assert.ok(s.resultados.filter((x) => x.tipo === "rss" && x.url.includes("ge.globo.com")).every((x) => x.itens === 1));
  assert.ok(s.resultados.filter((x) => x.tipo === "rss" && /padel/.test(x.url)).every((x) => x.status === 404), "candidatos de padel pedidos (aqui o fetch falso dá 404)");
  const n = pedidos.length;
  await cronSondaEsportes(env, { pausa: 0, agora: AGORA });
  assert.equal(pedidos.length, n, "pronta: não roda mais");
});

// ---------- NBA ----------
test("NBA: placar inteiro, quarto e relógio, intervalo, prorrogação, fim de quarto; rodada é a noite de jogos", () => {
  const sb = lerScoreboard(scoreboardNba(), "nba");
  assert.equal(sb.temporada, 2027);
  assert.equal(sb.tipoTemporada, 2);
  assert.equal(sb.numero, null, "NBA não tem semana");
  assert.equal(sb.calendario.length, 6, "calendário em dias");
  const p = Object.fromEntries(sb.jogos.map((j) => [j.id, j]));
  assert.deepEqual(p["401"].placar, [118, 112]);
  assert.ok(Number.isInteger(p["402"].placar[0]) && Number.isInteger(p["402"].placar[1]));
  assert.deepEqual([p["402"].mandante, p["402"].visitante, p["402"].siglas.join("-")], ["New York Knicks", "Miami Heat", "NY-MIA"]);
  assert.equal(p["402"].minuto, "4º quarto · 5:32");
  assert.equal(p["403"].minuto, "intervalo");
  assert.equal(p["404"].minuto, "prorrogação · 2:10");
  assert.equal(p["405"].minuto, "fim do 1º quarto");
  assert.equal(p["406"].placar, null, "jogo que não começou: sem placar, mesmo com score \"0\"");
  assert.deepEqual(p["406"].curtos, ["Lakers", "Warriors"], "nome curto da ESPN para o celular");
  assert.ok(!("curtos" in lerScoreboard(scoreboardBra(), "bra.1").jogos[0]), "futebol sem nome curto");
  // a rodada: os jogos até 12 h em volta do ao vivo (o de ontem e o de amanhã ficam fora)
  const r = escolherRodada(sb.jogos, AGORA, sb.numero, E.LIGAS.nba.raioRodada);
  assert.deepEqual(r.jogos.map((j) => j.id).sort(), ["402", "403", "404", "405", "406"]);
  // o mesmo evento lido como futebol mantém o relógio da ESPN
  assert.equal(lerJogo(scoreboardNba().events[1]).minuto, "5:32");
});

test("período: quartos, intervalo, prorrogações e relógio zerado", () => {
  assert.equal(E.periodo(1, "12:00", "STATUS_IN_PROGRESS"), "1º quarto · 12:00");
  assert.equal(E.periodo(4, "0.0", "STATUS_IN_PROGRESS"), "4º quarto");
  assert.equal(E.periodo(2, "0:00", "STATUS_HALFTIME"), "intervalo");
  assert.equal(E.periodo(5, "4:59", "STATUS_IN_PROGRESS"), "prorrogação · 4:59");
  assert.equal(E.periodo(6, "1:00", ""), "2ª prorrogação · 1:00");
  assert.equal(E.periodo(3, "0.0", "STATUS_END_PERIOD"), "fim do 3º quarto");
  assert.equal(E.periodo(5, "0.0", "STATUS_END_PERIOD"), "fim da prorrogação");
  assert.equal(E.periodo(null, "5:00", ""), "");
  assert.equal(E.periodo(0, "", ""), "");
});

test("nomes de conferência em português", () => {
  assert.equal(E.nomeGrupo("Eastern Conference", "East"), "Leste");
  assert.equal(E.nomeGrupo("Western Conference"), "Oeste");
  assert.equal(E.nomeGrupo("Atlantic Division"), "Atlantic Division", "o resto fica como veio");
  assert.equal(E.nomeGrupo("", "XYZ"), "XYZ");
});

test("standings NBA: conferências como grupos, ordem e zona pelo seed, V, D, % e GB; sem seed vai para o fim", () => {
  const { tabela, temporada } = lerStandings(standingsNba(), "nba");
  assert.equal(temporada, 2027);
  const leste = tabela.filter((l) => l.grupo === "Leste"), oeste = tabela.filter((l) => l.grupo === "Oeste");
  assert.equal(leste.length, 11);
  assert.equal(oeste.length, 4);
  assert.deepEqual(leste.map((l) => l.pos), Array.from({ length: 11 }, (_, i) => i + 1), "pos é a posição no grupo");
  assert.deepEqual(leste.slice(0, 3).map((l) => l.time), ["Boston Celtics", "Time A", "New York Knicks"]);
  const bos = leste[0];
  assert.deepEqual({ v: bos.v, d: bos.d, pct: bos.pct, gb: bos.gb, seed: bos.seed, e: bos.e, j: bos.j, sigla: bos.sigla, id: bos.id, curto: bos.curto }, { v: 6, d: 2, pct: 0.75, gb: 0, seed: 1, e: null, j: 8, sigla: "BOS", id: "2", curto: "Celtics" });
  assert.deepEqual(leste.map((l) => l.zona), ["playoffs", "playoffs", "playoffs", "playoffs", "playoffs", "playoffs", "play-in", "play-in", "play-in", "play-in", ""]);
  assert.equal(leste.find((l) => l.time === "Miami Heat").zona, "play-in", "seed 7");
  assert.deepEqual(oeste.map((l) => l.time), ["Los Angeles Lakers", "Denver Nuggets", "Golden State Warriors", "Phoenix Suns"]);
  assert.equal(oeste[3].seed, null);
  assert.equal(oeste[3].pos, 4, "sem seed: depois dos que têm, pela %");
  assert.equal(oeste[3].zona, "playoffs", "sem seed, a zona sai da posição (4º)");
  assert.ok(tabela.every((l) => l.pts === null), "sem pontos");
  assert.ok(tabela.every((l) => Object.keys(l).every((k) => l[k] !== undefined)));
});

test("colunas da tabela, nome da rodada, abas e zonas da NBA", () => {
  assert.deepEqual(E.colunasDe("nba"), ["v", "d", "pct", "gb"]);
  assert.deepEqual(E.colunasDe("bra.1"), ["j", "pts", "sg", "v", "e", "d", "gp", "gc"]);
  assert.ok(!E.colunasDe("nba").some((c) => ["j", "e", "gp", "gc", "sg", "pts"].includes(c)), "NBA sem J, E, GP, GC, SG e Pts");
  assert.deepEqual([E.rodadaDe("bra.1"), E.rodadaDe("nba"), E.rodadaDe("atp"), E.rodadaDe("x")], ["rodada", "jogos", "jogos", "rodada"]);
  assert.deepEqual(E.abasDe("bra.1").map((a) => a[1]), ["Rodada", "Próximos", "Tabela"]);
  assert.deepEqual(E.abasDe("nba").map((a) => a[1]), ["Jogos", "Próximos", "Tabela"]);
  assert.deepEqual(E.abasDe("wta"), [["rodada", "Jogos"], ["proximos", "Próximos"], ["torneios", "Torneios"]]);
  assert.deepEqual(E.legendaDe("nba").map((l) => l.nome + " " + l.faixa), ["Playoffs 1º a 6º", "Play-in 7º a 10º"]);
  assert.deepEqual([6, 7, 10, 11].map((p) => E.zonaDe("nba", p)), ["playoffs", "play-in", "play-in", ""]);
  assert.ok(!("lider-divisao" in E.ZONAS_NOME) && !("wild-card" in E.ZONAS_NOME), "zonas da NFL fora");
});

test("cron com NBA ligada: hoje e mais 2 dias; doc gravado com tabela por conferência", async () => {
  const { env, pedidos, doc, prefs } = ambiente();
  prefs("a@x.dev", { competicoes: ["nba"], times: [{ liga: "nba", id: "13", nome: "Lakers" }], ordem: [] });
  env.DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES ('_sistema', 'sonda-esportes', ?, '')").run(JSON.stringify({ fim: "teste", resultados: listaSonda(AGORA), pendentes: [] }));
  const r = await cronEsportes(env, minuto(4), { pausa: 0, orcamento: 60 });
  assert.ok(r.ligas.includes("nba"));
  const nbaSb = pedidos.filter((u) => u.includes("nba/scoreboard")).map((u) => u.split("dates=")[1]);
  assert.deepEqual(nbaSb, ["20261105", "20261104", "20261106"], "hoje, ontem e amanhã");
  const nba = doc("meta", "esportes-nba");
  assert.equal(nba.nome, "NBA");
  assert.ok(nba.rodada.jogos.some((j) => j.minuto === "4º quarto · 5:32"));
  assert.equal(nba.tabela[0].zona, "playoffs");
  assert.ok(nba.tabela.every((l) => l.grupo));
  assert.ok(pedidos.some((u) => u.includes("basketball/nba/teams/13/schedule")), "schedule do time de interesse");
  assert.ok(!pedidos.some((u) => u.includes("football/nfl")), "nada da NFL");
});

// ---------- Tênis ----------
test("tênis: torneios, chaves de simples, partidas com sets, cabeça de chave, ao vivo e campos faltando", () => {
  const t = lerTenis(scoreboardAtp(), "atp");
  assert.equal(t.temporada, 2026);
  assert.deepEqual(t.chaves, ["Simples masculino", "Duplas masculinas"], "as chaves vistas, para a sonda");
  const p = Object.fromEntries(t.partidas.map((x) => [x.id, x]));
  assert.ok(!p["9201"], "duplas ficam de fora");
  assert.ok(!p["9106"], "sem nome de um lado sai");
  assert.equal(t.partidas.length, 7);
  const fim = p["9101"];
  assert.deepEqual([fim.jogadores, fim.curtos, fim.cabecas, fim.ranks, fim.vencedor, fim.estado], [["Jannik Sinner", "Ben Shelton"], ["J. Sinner", "B. Shelton"], [1, 6], [1, 7], 0, "post"]);
  assert.deepEqual(fim.sets, [[6, 4], [3, 6], [7, 6]]);
  assert.equal(E.placarSets(fim.sets), "6-4 3-6 7-6");
  assert.deepEqual([fim.torneio, fim.torneioId, fim.chave, fim.rodada, fim.quadra], ["Rolex Paris Masters", "713", "Simples masculino", "2ª rodada", "Court Central"]);
  const vivo = p["9102"];
  assert.deepEqual([vivo.estado, vivo.minuto, vivo.rodada, vivo.cabecas, vivo.ranks, vivo.vencedor], ["in", "2º set", "oitavas de final", [2, null], [2, 24], null]);
  assert.equal(E.placarSets(vivo.sets), "6-4 2-3");
  assert.deepEqual([p["9103"].estado, p["9103"].sets, p["9103"].minuto], ["pre", [], ""]);
  assert.equal(p["9104"].rodada, "quartas de final", "rodada pelas notes quando falta round");
  assert.deepEqual([p["9105"].detalhe, p["9105"].vencedor], ["desistência", 1]);
  assert.deepEqual([p["9107"].jogadores, p["9107"].estado, p["9107"].rodada], [["Tommy Paul", "Grigor Dimitrov"], "pre", ""], "order manda; sem status vira pre");
  assert.equal(p["9301"].minuto, "2º set", "sem period: o número de sets");
  assert.equal(p["9301"].torneio, "Moselle Open", "evento sem groupings, com competitions direto");
  // torneios: local, rodada atual (a da partida ao vivo), ao vivo
  const [paris, metz] = t.torneios;
  assert.deepEqual([paris.nome, paris.local, paris.rodada, paris.aoVivo, paris.partidas], ["Rolex Paris Masters", "Paris, França", "oitavas de final", true, 6]);
  assert.deepEqual([metz.local, metz.rodada], ["", "quartas de final"], "sem venue no torneio e a partida só com a quadra: sem local");
  // WTA: venue só com nome
  const w = lerTenis(scoreboardWta(), "wta");
  assert.deepEqual([w.torneios[0].local, w.torneios[0].rodada, w.partidas.length], ["Riyadh", "fase de grupos", 2]);
  // lixo
  assert.deepEqual(lerTenis(null, "atp"), { partidas: [], torneios: [], temporada: null, chaves: [] });
  assert.deepEqual(lerTenis({ events: [null, 3, { groupings: "x" }] }, "atp").partidas, []);
  assert.equal(lerPartida({ competitors: [{}] }), null);
  assert.ok(Object.values(p).every((x) => Object.keys(x).every((k) => x[k] !== undefined)), "sem undefined");
});

test("tênis: rodada em português, placar, partidas do dia e busca de jogador pelo nome", () => {
  const r = E.rodadaTenis;
  assert.deepEqual(["Round 1", "1st Round", "Round of 64", "Round of 16", "Quarterfinals", "Semifinal", "Final", "Qualifying Round 2", "Round Robin", "Exhibition", ""].map(r),
    ["1ª rodada", "1ª rodada", "rodada de 64", "oitavas de final", "quartas de final", "semifinal", "final", "qualificatório · 2ª rodada", "fase de grupos", "Exhibition", ""]);
  assert.equal(E.placarSets([[6, 4], [null, null], [7, null]]), "6-4 7-0");
  assert.equal(E.placarSets(null), "");
  const { partidas } = lerTenis(scoreboardAtp(), "atp");
  const dia = partidasDoDia(partidas, AGORA);
  assert.deepEqual(dia.slice(0, 2).map((x) => x.estado), ["in", "in"], "ao vivo primeiro");
  assert.ok(dia.every((x) => x.estado === "in" || diaSP(Date.parse(x.data)) === "20261105"), "só as de hoje em São Paulo");
  assert.ok(!dia.some((x) => x.id === "9101"), "a de ontem fica fora");
  const fim = partidas.find((x) => x.id === "9101");
  assert.equal(E.ladoDoJogador(fim, "sinner"), 0);
  assert.equal(E.ladoDoJogador(fim, "  SHELTON "), 1);
  assert.equal(E.ladoDoJogador(fim, "b. shelton"), 1, "pelo nome curto também");
  const joao = partidas.find((x) => x.id === "9102");
  assert.equal(E.ladoDoJogador(joao, "joao fonseca"), 1, "sem acento");
  assert.equal(E.ladoDoJogador(fim, "a"), -1, "menos de 2 letras não busca");
  assert.equal(E.ladoDoJogador(fim, "alcaraz"), -1);
});

test("Meus esportes: jogadores de tênis (só ATP e WTA, nome digitado, até 10, sem repetir)", () => {
  const ok = E.validarPrefs({ competicoes: ["atp"], jogadores: [{ liga: "atp", nome: "  Sinner " }, { liga: "atp", nome: "sínner" }, { liga: "wta", nome: "Swiatek" }] });
  assert.deepEqual(ok.prefs.jogadores, [{ liga: "atp", nome: "Sinner" }, { liga: "wta", nome: "Swiatek" }]);
  assert.match(E.validarPrefs({ competicoes: [], jogadores: [{ liga: "bra.1", nome: "Inter" }] }).erro, /ATP ou WTA/);
  assert.match(E.validarPrefs({ competicoes: [], jogadores: [{ liga: "atp", nome: "S" }] }).erro, /menos de 2/);
  assert.match(E.validarPrefs({ competicoes: [], jogadores: Array.from({ length: 11 }, (_, i) => ({ liga: "atp", nome: "Jogador " + i })) }).erro, /até 10 jogadores/);
  assert.match(E.validarPrefs({ competicoes: [], jogadores: "x" }).erro, /jogadores/);
  assert.deepEqual(E.respostaPrefs({ competicoes: ["atp"], times: [], jogadores: [{ liga: "atp", nome: "Fonseca" }], ordem: [] }).jogadores, [{ liga: "atp", nome: "Fonseca" }]);
  assert.deepEqual(E.respostaPrefs({ competicoes: ["bra.1"], times: [], ordem: [] }).jogadores, [], "salvo antigo sem jogadores");
});

test("cron com ATP e WTA ligadas: sem data, ontem, hoje e amanhã; sem standings; doc com partidas e torneios", async () => {
  const { env, pedidos, doc, prefs } = ambiente();
  prefs("a@x.dev", { competicoes: ["atp", "wta"], times: [], jogadores: [{ liga: "atp", nome: "Sinner" }], ordem: [] });
  env.DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES ('_sistema', 'sonda-esportes', ?, '')").run(JSON.stringify({ fim: "teste", resultados: listaSonda(AGORA), pendentes: [] }));
  assert.deepEqual((await ligasAtivas(env)).ligas.slice(-2), ["atp", "wta"]);
  const r = await cronEsportes(env, minuto(4), { pausa: 0, orcamento: 60 });
  assert.ok(r.ligas.includes("atp") && r.ligas.includes("wta"));
  const atpSb = pedidos.filter((u) => u.includes("tennis/atp/"));
  assert.deepEqual(atpSb, ["", "20261104", "20261105", "20261106"].map((d) => urlScoreboard("atp", d)));
  assert.equal(urlScoreboard("atp", ""), "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard");
  assert.ok(!pedidos.some((u) => u.includes("tennis") && (u.includes("/standings") || u.includes("/schedule"))), "tênis sem tabela e sem schedule");
  const atp = doc("meta", "esportes-atp");
  assert.deepEqual([atp.nome, atp.fonte, atp.temporada, atp.tabela.length], ["ATP", "espn", 2026, 0]);
  assert.ok(atp.rodada.jogos.length && atp.rodada.jogos.every((x) => x.estado === "in" || diaSP(Date.parse(x.data)) === "20261105"));
  assert.equal(atp.rodada.jogos[0].estado, "in");
  assert.ok(atp.proximos.every((x) => x.estado !== "post"));
  assert.deepEqual(atp.ultimos.map((x) => x.id), ["9105", "9101", "9100"], "a de antes de ontem veio do dia; a de ontem não repete");
  assert.deepEqual(atp.torneios.map((t) => t.nome), ["Rolex Paris Masters", "Moselle Open"], "torneios da chamada sem data");
  assert.ok(atp.rodadaEm && !atp.tabelaEm);
  assert.equal(doc("meta", "esportes-wta").torneios[0].nome, "WTA Finals");
  // 10 min depois, com partida ao vivo: nada (15 min); 15 min depois: só as 4 do scoreboard, e o doc não é regravado à toa
  const n = pedidos.length;
  await cronEsportes(env, minuto(4) + 5 * MIN, { pausa: 0, orcamento: 60 });
  assert.equal(pedidos.slice(n).filter((u) => u.includes("tennis")).length, 0);
  await cronEsportes(env, minuto(4) + 15 * MIN, { pausa: 0, orcamento: 60 });
  assert.equal(pedidos.slice(n).filter((u) => u.includes("tennis/atp")).length, 4);
  // ESPN fora do ar: fica o que havia e o erro vai para atp:rodada
  const amb = ambiente({ status: { "tennis/atp": 503 } });
  amb.env.DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES ('meta', 'esportes-atp', ?, '')").run(JSON.stringify(atp));
  const erros = {};
  await atualizarLiga(amb.env, "atp", { fila: novaFila({ pausa: 0, orcamento: 10 }), agora: AGORA + 3600_000, forcar: { rodada: true, tabela: true, times: true }, erros });
  assert.match(erros["atp:rodada"], /HTTP 503/);
  const depois = amb.doc("meta", "esportes-atp");
  assert.deepEqual(depois.rodada.jogos.map((x) => x.id), atp.rodada.jogos.map((x) => x.id));
  assert.ok(depois.tentativas.rodada);
});

test("Copa do Brasil (sem tabela): passada sem rodada vencida não regrava o doc", async () => {
  const { env, doc } = ambiente({ ligasEspn: ["bra.copa_do_brasil"] });
  const fila = novaFila({ pausa: 0, orcamento: 20 });
  await atualizarLiga(env, "bra.copa_do_brasil", { fila, agora: AGORA, forcar: { rodada: true, tabela: true, times: false } });
  const d1 = doc("meta", "esportes-bra.copa_do_brasil");
  assert.ok(d1.rodadaEm && !d1.tabelaEm);
  assert.equal(await atualizarLiga(env, "bra.copa_do_brasil", { fila, agora: AGORA + 10 * MIN }), null, "a tabela não vence nunca");
});

test("sonda pronta volta a andar só para as competições novas", async () => {
  const { env, doc, pedidos } = ambiente();
  // como estava em produção: pronta, sem o tênis e sem os RSS de padel
  const padel = (x) => x.tipo === "rss" && /padel/.test(x.url);
  const de1111 = (x) => /^(escudos-|teams$|paises-tenis$)/.test(x.tipo);
  const antiga = listaSonda(AGORA).filter((x) => !["atp", "wta"].includes(x.liga) && !padel(x) && !de1111(x)).map((x, i) => ({ ...x, n: i, status: 200 }));
  const nPadel = listaSonda(AGORA).filter(padel).length, nEscudos = listaSonda(AGORA).filter(de1111).length;
  assert.equal(nEscudos, 5 + E.LIGAS_ESCUDOS.length, "escudos no scoreboard e na standings, país no tênis e o endpoint de times de 13 ligas");
  assert.ok(nPadel >= 6, "candidatos de padel na sonda");
  env.DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES ('_sistema', 'sonda-esportes', ?, '')").run(JSON.stringify({ inicio: "x", fim: "2026-11-04T15:00:00Z", pendentes: [], resultados: antiga }));
  let passadas = 0;
  do { await cronSondaEsportes(env, { pausa: 0, agora: AGORA }); passadas++; } while (!(doc("_sistema", "sonda-esportes") || {}).fim && passadas < 10);
  const s = doc("_sistema", "sonda-esportes");
  assert.ok(s.fim && s.retomada);
  const novos = s.resultados.slice(antiga.length);
  assert.equal(novos.length, 4 + nPadel + nEscudos);
  assert.deepEqual(novos.slice(0, 4).map((x) => x.tipo + ":" + x.liga), ["scoreboard:atp", "scoreboard:wta", "scoreboard-dia:atp", "scoreboard-dia:wta"]);
  assert.deepEqual(novos.map((x) => x.n), novos.map((_, i) => antiga.length + i), "amostras com número novo");
  assert.equal(novos[0].url, "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard", "tênis: torneios em andamento, sem data");
  assert.equal(novos[2].url, "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard?dates=20261105");
  assert.deepEqual([novos[0].torneios, novos[0].partidas, novos[0].comCabeca, novos[0].comSets], [2, 7, 4, 4]);
  assert.deepEqual(novos[0].chaves, ["Simples masculino", "Duplas masculinas"]);
  assert.match(novos[0].exemplo, /^Carlos Alcaraz x João Fonseca \| 6-4 2-3 \| in 2º set \| oitavas de final/);
  assert.match(novos[0].primeiroTorneio, /Rolex Paris Masters · Paris, França/);
  assert.ok(doc("_sistema", novos[0].amostra).amostra.includes("groupings"));
  assert.ok(!listaSonda(AGORA).some((x) => x.tipo === "standings" && ["atp", "wta"].includes(x.liga)), "tênis sem standings na sonda");
  assert.ok(!listaSonda(AGORA).some((x) => x.liga === "nfl"), "NFL fora da sonda");
  const n = pedidos.length;
  assert.equal(await cronSondaEsportes(env, { pausa: 0, agora: AGORA }), 0);
  assert.equal(pedidos.length, n);
});

// ---------- escudos (11/11) ----------
test("escudos: team.logo no scoreboard, team.logos[] na standings; sem campo ou fora da ESPN = sem escudo", () => {
  const sb = lerEscudos(scoreboardBra());
  assert.equal(sb["1936"], ESCUDO(1936), "Inter pelo team.logo");
  assert.equal(sb["2029"], ESCUDO(2029), "Palmeiras pelo logos[] (o default, não o dark)");
  assert.ok(!("6273" in sb), "Grêmio com logo de outro site: descartado");
  assert.ok(!("819" in sb), "Flamengo com http: descartado");
  assert.ok(!("2674" in sb) && !("9967" in sb), "sem campo: sem escudo");
  const st = lerEscudos(standingsBra());
  assert.deepEqual(Object.keys(st).sort(), ["1936", "2029"]);
  assert.deepEqual(lerEscudos(null), {});
  assert.deepEqual(lerEscudos({ events: [null, { competitions: [{ competitors: [null, { team: { id: 1, logo: 7 } }] }] }] }), {});
  // o que passa e o que não passa
  for (const u of ["javascript:alert(1)", "https://a.espncdn.com.exemplo.dev/x.png", "https://a.espncdn.com/../x.png", "https://a.espncdn.com//x.png", 'https://a.espncdn.com/x.png" onerror="x', "https://b.espncdn.com/x.png", "data:image/png;base64,AAAA"])
    assert.equal(escudoDoTime({ logo: u }), "", u);
  assert.equal(escudoDoTime({ logo: "https://a.espncdn.com/i/teamlogos/nba/500/lal.png" }), "https://a.espncdn.com/i/teamlogos/nba/500/lal.png");
  assert.equal(escudoDoTime({ logo: "https://a.espncdn.com/i/teamlogos/soccer/500/1936.png?w=40" }), "https://a.espncdn.com/i/teamlogos/soccer/500/1936.png?w=40");
  assert.equal(escudoDoTime({ logo: "https://a.espncdn.com/i/headshots/soccer/players/full/1234.png" }), "", "foto de atleta da mesma origem: não");
  assert.equal(escudoDoTime({ logo: "https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/1966.png" }), "", "nem pelo combiner");
  // endpoint de times
  const ts = lerTimesEspn(timesEspn("ita.1"));
  assert.deepEqual(ts[0], { id: "110", nome: "Internazionale", curto: "Inter", sigla: "INT", escudo: ESCUDO(110) });
  assert.equal(lerTimesEspn(timesEspn("bra.1")).find((t) => t.id === "9998").escudo, "", "logo de fora da ESPN");
  assert.deepEqual(lerTimesEspn({ sports: "x" }), []);
});

test("escudos no doc da liga: por time, só a URL; os de antes ficam; nada de foto de jogador no doc", async () => {
  const { env, doc } = ambiente({ ligasEspn: ["bra.1"] });
  env.DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES ('meta', 'esportes-bra.1', ?, '')").run(JSON.stringify({ escudos: { "555": ESCUDO(555), "6273": "https://imagens.exemplo.dev/6273.png" } }));
  const fila = novaFila({ pausa: 0, orcamento: 30 });
  await atualizarLiga(env, "bra.1", { fila, times: [{ id: "1936", nome: "Inter" }], agora: AGORA, forcar: { rodada: true, tabela: true, times: true } });
  const d = doc("meta", "esportes-bra.1");
  assert.deepEqual(d.escudos, { "555": ESCUDO(555), "1936": ESCUDO(1936), "2029": ESCUDO(2029) }, "o de antes fica, o de fora some");
  assert.ok(!d.rodada.jogos.some((j) => "escudo" in j || "logo" in j), "nos jogos só os ids; o escudo fica no mapa do doc");
  // tênis: país do jogador para a bandeira; a foto (headshot) que a ESPN manda não é lida
  const t = lerTenis(scoreboardAtp(), "atp");
  const p = Object.fromEntries(t.partidas.map((x) => [x.id, x]));
  assert.deepEqual(p["9102"].paises, ["ES", "BR"], "citizenshipCountry ESP e flag.alt Brazil");
  assert.deepEqual(p["9101"].paises, ["IT", ""], "pelo arquivo da bandeira; País desconhecido fica vazio");
  assert.ok(!p["9107"].paises, "sem país conhecido: sem o campo");
  assert.ok(!/headshot|foto/i.test(JSON.stringify(t)), "nenhuma foto de jogador");
});

test("catálogo de escudos: docs das ligas e o endpoint de times (até 4 por rodada, 1x por semana, falha espera 24 h)", async () => {
  const { env, doc, pedidos } = ambiente({ ligasEspn: ["bra.1", "conmebol.libertadores", "bra.2", "ita.1", "mex.1", "esp.1", "usa.1", "eng.1", "arg.1", "ger.1", "fra.1", "por.1", "ned.1", "ksa.1"] });
  // a sonda fica de fora da conta
  env.DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES ('_sistema', 'sonda-esportes', ?, '')").run(JSON.stringify({ fim: "x", pendentes: [], resultados: listaSonda(AGORA).map((x) => ({ ...x, status: 200 })) }));
  const n0 = pedidos.length;
  await cronEsportes(env, minuto(4), { pausa: 0, orcamento: 40 });
  const times1 = pedidos.slice(n0).filter((u) => u.endsWith("/teams"));
  assert.deepEqual(times1, E.LIGAS_ESCUDOS.slice(0, 4).map(urlTimes), "4 ligas na primeira rodada");
  const est = doc("_sistema", "esportes-times");
  assert.ok(est.ligas["bra.1"].em && est.ligas["bra.2"].em);
  const cat = doc("meta", "esportes-escudos");
  assert.ok(cat.atualizado);
  assert.deepEqual(cat.times["1936"], { nome: "Internacional", sigla: "INT", escudo: ESCUDO(1936), liga: "bra.1", pais: "BR" });
  assert.equal(cat.times["6154"].liga, "bra.2");
  assert.ok(!cat.times["9999"] && !cat.times["9998"], "time sem escudo, ou com escudo de fora, não entra");
  assert.deepEqual(cat.mapa["internacional"], ["1936"]);
  assert.equal(E.escudoDe("Inter", cat, "BR"), ESCUDO(1936));
  // segunda rodada (5 min depois): as próximas 4; o catálogo ganha a Internazionale
  const n1 = pedidos.length;
  await cronEsportes(env, minuto(4) + 5 * MIN, { pausa: 0, orcamento: 40 });
  assert.deepEqual(pedidos.slice(n1).filter((u) => u.endsWith("/teams")), E.LIGAS_ESCUDOS.slice(4, 8).map(urlTimes));
  assert.equal(E.escudoDe("Inter", doc("meta", "esportes-escudos"), "IT"), ESCUDO(110));
  // até acabar: 13 ligas em 4 rodadas, depois nada por 7 dias
  await cronEsportes(env, minuto(4) + 10 * MIN, { pausa: 0, orcamento: 40 });
  await cronEsportes(env, minuto(4) + 15 * MIN, { pausa: 0, orcamento: 40 });
  const n2 = pedidos.length;
  await cronEsportes(env, minuto(4) + 20 * MIN, { pausa: 0, orcamento: 40 });
  assert.equal(pedidos.slice(n2).filter((u) => u.endsWith("/teams")).length, 0, "todas pedidas: espera a semana");
  assert.equal(Object.keys(doc("_sistema", "esportes-times").ligas).length, 13);
  // uma semana depois volta a pedir, 4 por vez
  const n3 = pedidos.length;
  await cronEsportes(env, minuto(4) + 8 * 24 * 3600_000, { pausa: 0, orcamento: 40 });
  assert.equal(pedidos.slice(n3).filter((u) => u.endsWith("/teams")).length, 4);
  // falha: espera 24 h
  const amb = ambiente({ ligasEspn: ["bra.1"], status: { "/teams": 503 } });
  const fila = novaFila({ pausa: 0, orcamento: 30 });
  const erros = {};
  await atualizarCatalogoEscudos(amb.env, { fila, agora: AGORA, erros });
  assert.match(erros["bra.1:times-escudos"], /HTTP 503/);
  assert.ok(amb.doc("_sistema", "esportes-times").ligas["bra.1"].tentativa);
  const r = await atualizarCatalogoEscudos(amb.env, { fila, agora: AGORA + 3600_000, erros: {} });
  assert.equal(r.pedidas, 4, "as 4 seguintes; a que falhou espera");
  assert.ok(!amb.pedidos.slice(-4).some((u) => u.includes("bra.1/")));
  // passada que bateu no limite só remonta, sem pedir
  const amb2 = ambiente();
  const r2 = await atualizarCatalogoEscudos(amb2.env, { fila: novaFila({ pausa: 0 }), agora: AGORA, pedir: false });
  assert.equal(r2.pedidas, 0);
  assert.ok(amb2.doc("meta", "esportes-escudos"), "grava o catálogo (vazio) na primeira vez");
  const r3 = await atualizarCatalogoEscudos(amb2.env, { fila: novaFila({ pausa: 0 }), agora: AGORA, pedir: false, mudou: true });
  assert.equal(r3.gravou, false, "nada mudou: não regrava");
});

test("sonda: escudos no scoreboard e na standings, endpoint de times e país no tênis", async () => {
  const { env, doc } = ambiente({ ligasEspn: ["bra.1", "eng.1", ...E.LIGAS_ESCUDOS] });
  let passadas = 0;
  while (!(doc("_sistema", "sonda-esportes") || {}).fim && passadas < 30) { await cronSondaEsportes(env, { pausa: 0, agora: AGORA }); passadas++; }
  const s = doc("_sistema", "sonda-esportes");
  const sb = s.resultados.find((x) => x.tipo === "escudos-scoreboard" && x.liga === "bra.1");
  assert.deepEqual([sb.times, sb.comLogo, sb.comEscudo, sb.foraDaEspn, sb.campo], [6, 4, 2, 2, "logo"]);
  assert.match(sb.exemplo, /a\.espncdn\.com/);
  const tb = s.resultados.find((x) => x.tipo === "teams" && x.liga === "bra.1");
  assert.deepEqual([tb.times, tb.comEscudo, tb.foraDaEspn, tb.tipoResposta], [6, 4, 1, "sports"]);
  const pt = s.resultados.find((x) => x.tipo === "paises-tenis");
  assert.equal(pt.comPais, 2);
  assert.match(pt.exemplo, /Jannik Sinner IT/);
});
