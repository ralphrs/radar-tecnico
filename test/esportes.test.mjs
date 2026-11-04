// Esportes (src/esportes.js e public/esportes.js): parsers da ESPN e do ge, zonas, Meus esportes, cron com D1 em SQLite
// do Node e fetch falso; e as colunas Qtd e Valor das Minhas listas (public/radar-filtro.js). JSON e HTML de exemplo em
// test/fixtures-esportes.mjs: o proxy do ambiente não alcança a ESPN nem o ge.
import test from "node:test";
import assert from "node:assert/strict";
import { lerJogo, lerJogos, lerScoreboard, lerStandings, lerGe, blocosJson, escolherRodada, proximosDe, ultimosDe, vencidos, quente,
  cronEsportes, cronSondaEsportes, atualizarLiga, ligasAtivas, listaSonda, novaFila, urlScoreboard, urlStandings, urlSchedule, diaSP } from "../src/esportes.js";
import { catalogoDe, validarPainel, formatosDe, respostaPainel } from "../src/painel.js";
import { FEEDS, SECOES_COM_FORUM } from "../src/feeds.js";
import { REDDIT } from "../src/coleta.js";
import "../public/esportes.js";
import "../public/radar-filtro.js";
import { d1Falso } from "./d1-falso.mjs";
import { AGORA, T, scoreboardBra, scoreboardLib, standingsBra, standingsLib, scheduleInter, htmlGe, htmlGeTabela } from "./fixtures-esportes.mjs";

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
  assert.match(E.validarPrefs({ competicoes: ["nba"] }).erro, /desconhecida/);
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
  for (const l of E.ORDEM_LIGAS) { assert.ok(ids.includes("esportes-rodada-" + l)); assert.ok(ids.includes("esportes-tabela-" + l)); }
  assert.ok(ids.includes("esportes-meu-time"));
  assert.deepEqual(formatosDe("esportes-rodada-bra.1"), ["1x1", "2x1"]);
  assert.deepEqual(formatosDe("esportes-tabela-bra.copa_do_brasil"), ["1x1", "1x2"]);
  assert.deepEqual(formatosDe("esportes-meu-time"), ["1x1"]);
  const titulos = Object.fromEntries(catalogoDe(null).map((w) => [w.id, w.titulo]));
  assert.equal(titulos["esportes-rodada-bra.1"], "Brasileirão · rodada");
  assert.equal(titulos["esportes-tabela-bra.1"], "Brasileirão · tabela");
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
    const m = /sports\/soccer\/([a-z0-9._]+)\//.exec(u);
    const liga = m && m[1];
    if (ligasEspn && liga && !ligasEspn.includes(liga)) return new Response('{"code":400,"message":"league not found"}', { status: 400 });
    if (u.includes("/teams/1936/schedule")) return js(scheduleInter());
    if (u.includes("/scoreboard")) return js(liga === "bra.1" ? scoreboardBra() : liga === "conmebol.libertadores" ? scoreboardLib() : { events: [] });
    if (u.includes("/standings")) return js(liga === "bra.1" ? standingsBra() : liga === "conmebol.libertadores" ? standingsLib() : { children: [] });
    return new Response("não", { status: 404 });
  };
  const doc = (c, id) => { const r = env.DB.db.prepare("SELECT data FROM docs WHERE collection = ? AND id = ?").get(c, id); return r ? JSON.parse(r.data) : null; };
  const prefs = (email, p) => env.DB.db.prepare("INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES (?, 'esportes', ?, '', '')").run("prefs/" + email, JSON.stringify(p));
  return { env, pedidos, doc, prefs };
}
const minuto = (m) => AGORA - (new Date(AGORA).getUTCMinutes() - m) * MIN; // mesmo horário, minuto m

test("URLs da ESPN: scoreboard por intervalo de datas, standings e schedule; qualquer esporte/liga", () => {
  assert.equal(diaSP(AGORA), "20261105");
  assert.equal(urlScoreboard("bra.1", "20261102", "20261115"), "https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard?dates=20261102-20261115&limit=200");
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
  // Gauchão: a ESPN responde 400 e entra a página do ge
  const gau = doc("meta", "esportes-bra.camp.gaucho");
  assert.equal(gau.fonte, "ge");
  assert.equal(gau.tabela[0].time, "Internacional");
  assert.ok(gau.espnFalhouEm);
  assert.ok(pedidos.slice(antes).some((u) => u.includes("ge.globo.com/futebol/campeonato-gaucho")));
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
  // Gauchão no ge por 24 h: sem nova tentativa na ESPN
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
  assert.equal(vezes, 2, "429 uma vez, depois 200");
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
  const sch = s.resultados.find((x) => x.tipo === "schedule");
  assert.match(sch.url, /teams\/\d+\/schedule/, "o id do time saiu da tabela do bra.1");
  assert.equal(s.resultados.find((x) => x.tipo === "ge").linhas, 4);
  assert.ok(s.resultados.filter((x) => x.tipo === "rss").every((x) => x.itens === 1));
  const n = pedidos.length;
  await cronSondaEsportes(env, { pausa: 0, agora: AGORA });
  assert.equal(pedidos.length, n, "pronta: não roda mais");
});
