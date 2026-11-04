// JSON e HTML de exemplo para os testes de Esportes, escritos à mão no formato conhecido da ESPN e do ge.
// Times e placares inventados; datas relativas a AGORA para os estados pre/in/post fazerem sentido.
export const AGORA = Date.parse("2026-11-05T22:10:00Z");
const h = (horas) => new Date(AGORA + horas * 3_600_000).toISOString().replace(":00.000Z", "Z");

const time = (id, nome, sigla) => ({ id: String(id), displayName: nome, abbreviation: sigla, shortDisplayName: nome });
const competidor = (lado, t, gols) => ({ homeAway: lado, team: t, ...(gols === undefined ? {} : { score: String(gols) }) });
const evento = (id, quando, casa, fora, estado, extra = {}) => ({
  id: String(id), date: quando,
  competitions: [{ id: String(id), date: quando, venue: extra.venue === null ? undefined : { fullName: extra.venue || "Estádio Exemplo" },
    competitors: [competidor("home", casa, extra.gm), competidor("away", fora, extra.gv)],
    status: { displayClock: extra.relogio || "0'", period: estado === "in" ? 2 : 0, type: { state: estado, completed: estado === "post", name: extra.nome || (estado === "post" ? "STATUS_FULL_TIME" : estado === "in" ? "STATUS_SECOND_HALF" : "STATUS_SCHEDULED"), shortDetail: extra.detalhe || (estado === "post" ? "FT" : estado === "in" ? extra.relogio || "67'" : "Thu, November 5th at 7:30 PM") } } }],
});

export const T = {
  inter: time(1936, "Internacional", "INT"), gremio: time(6273, "Grêmio", "GRE"), palmeiras: time(2029, "Palmeiras", "PAL"),
  flamengo: time(819, "Flamengo", "FLA"), santos: time(2674, "Santos", "SAN"), bahia: time(9967, "Bahia", "BAH"),
};

export function scoreboardBra() {
  return {
    // calendar: os dias com jogo (a ESPN manda assim); hoje (05/11 em SP), 03/11, 08/11, um de 30 dias atrás (fora da janela) e lixo
    leagues: [{ name: "Brazilian Serie A", abbreviation: "BRA.1", season: { year: 2026 }, calendar: ["2026-11-05T08:00Z", "2026-11-03T08:00Z", "2026-11-08T08:00Z", "2026-10-06T08:00Z", "x"] }],
    season: { year: 2026 },
    events: [
      evento(701, h(-48), T.flamengo, T.santos, "post", { gm: 3, gv: 1 }),
      evento(702, h(-0.9), T.inter, T.gremio, "in", { gm: 2, gv: 1, relogio: "67'" }),
      evento(703, h(1.5), T.palmeiras, T.bahia, "pre", { venue: null }),
      evento(704, h(24), T.santos, T.inter, "pre"),
      // sem nome de time: fica de fora
      { id: "705", date: h(30), competitions: [{ competitors: [{ homeAway: "home", team: {} }, { homeAway: "away", team: T.bahia }], status: { type: { state: "pre" } } }] },
      // placar como objeto e sem homeAway (o primeiro é o mandante)
      { id: "706", date: h(-50), competitions: [{ competitors: [{ team: T.bahia, score: { value: 0, displayValue: "0" } }, { team: T.palmeiras, score: { value: 2 } }], status: { type: { state: "post", completed: true } } }] },
      // intervalo
      evento(707, h(-0.8), T.gremio, T.flamengo, "in", { gm: 0, gv: 0, nome: "STATUS_HALFTIME", detalhe: "HT", relogio: "45'" }),
    ],
  };
}
export function scoreboardLib() {
  return { leagues: [{ name: "CONMEBOL Libertadores", season: { year: 2026 } }], events: [evento(801, h(48), T.palmeiras, T.flamengo, "pre")] };
}

const stats = (rank, pts, j, v, e, d, gp, gc, comTies) => [
  { name: "rank", value: rank }, { name: "points", value: pts }, { name: "gamesPlayed", value: j }, { name: "wins", value: v },
  comTies ? { name: "ties", value: e } : { name: "draws", value: e }, { name: "losses", value: d },
  { name: "pointsFor", value: gp }, { name: "pointsAgainst", value: gc }, { name: "pointDifferential", value: gp - gc },
];
export function standingsBra() {
  const linhas = [
    [T.palmeiras, 1, 70, 33, 21, 7, 5, 60, 25], [T.flamengo, 2, 68, 33, 20, 8, 5, 62, 28], [T.inter, 7, 52, 33, 14, 10, 9, 45, 38],
    [T.santos, 12, 44, 33, 12, 8, 13, 40, 44], [T.gremio, 18, 33, 33, 8, 9, 16, 31, 50],
  ];
  return {
    name: "Brazilian Serie A", season: { year: 2026 },
    children: [{ name: "Brazilian Serie A", standings: { season: 2026, entries: [
      ...linhas.map(([t, ...s], i) => ({ team: t, stats: stats(...s, i % 2 === 0) })),
      // sem stats: linha com "–", posição pela ordem
      { team: T.bahia, stats: [] },
      // sem time: fica de fora
      { stats: [{ name: "rank", value: 20 }] },
    ] } }],
  };
}
export function standingsLib() {
  const g = (nome, ts) => ({ name: nome, standings: { entries: ts.map((t, i) => ({ team: t, stats: stats(i + 1, 12 - i * 3, 6, 4 - i, 0, i, 10 - i, 4 + i) })) } });
  return { children: [g("Group A", [T.palmeiras, T.santos]), g("Group B", [T.flamengo, T.inter])] };
}
export function scheduleInter() {
  return { team: T.inter, events: [
    evento(601, h(-170), T.inter, T.santos, "post", { gm: 1, gv: 1 }),
    evento(602, h(-96), T.bahia, T.inter, "post", { gm: 0, gv: 2 }),
    evento(603, h(24), T.santos, T.inter, "pre"),
    evento(604, h(96), T.inter, T.palmeiras, "pre"),
  ] };
}

// Página do ge com o JSON embutido (como as páginas de campeonato trazem): classificação e lista de jogos
export function htmlGe() {
  const classificacao = [
    { ordem: 1, nome_popular: "Internacional", sigla: "INT", pontos: 25, jogos: 11, vitorias: 8, empates: 1, derrotas: 2, gols_pro: 22, gols_contra: 9, saldo_gols: 13, equipe_id: 285 },
    { ordem: 2, nome_popular: "Grêmio", sigla: "GRE", pontos: 23, jogos: 11, vitorias: 7, empates: 2, derrotas: 2, gols_pro: 19, gols_contra: 8, saldo_gols: 11, equipe_id: 284 },
    { ordem: 11, nome_popular: "Ypiranga", sigla: "YPI", pontos: 8, jogos: 11, vitorias: 2, empates: 2, derrotas: 7, gols_pro: 7, gols_contra: 18, saldo_gols: -11, equipe_id: 1200 },
    { ordem: 12, equipe: { nome_popular: "São José", sigla: "SJO" }, pontos: 5, jogos: 11, vitorias: 1, empates: 2, derrotas: 8, gols_pro: 6, gols_contra: 21 },
  ];
  const jogos = [
    { id: 9001, data_realizacao: "2026-03-01T16:00", equipes: { mandante: { nome_popular: "Internacional", sigla: "INT" }, visitante: { nome_popular: "Grêmio", sigla: "GRE" } }, placar_oficial_mandante: 2, placar_oficial_visitante: 0, sede: { nome_popular: "Beira-Rio" } },
    { id: 9002, data_realizacao: "2026-11-08", hora_realizacao: "18:30", equipes: { mandante: { nome_popular: "Ypiranga" }, visitante: { nome_popular: "Internacional" } }, placar_oficial_mandante: null, placar_oficial_visitante: null },
  ];
  return `<!doctype html><html><head><title>Gauchão</title></head><body><div id="app"></div>
<script>window.dados = { "edicao": { "nome": "Gauchão 2026" }, "classificacao": ${JSON.stringify(classificacao)}, "lista_jogos": ${JSON.stringify(jogos).replace(/"Grêmio"/g, '"Gr\\u00eamio"')} };</script></body></html>`;
}
// Sem JSON: uma tabela simples no HTML
export function htmlGeTabela() {
  const tr = (p, n, ...ns) => `<tr><td>${p}º</td><td><strong>${n}</strong></td>${ns.map((x) => `<td>${x}</td>`).join("")}</tr>`;
  return `<html><body><table><thead><tr><th>#</th><th>Time</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th></tr></thead><tbody>
${tr(1, "Internacional", 25, 11, 8, 1, 2, 22, 9, 13)}${tr(2, "Juventude", 21, 11, 6, 3, 2, 15, 10, 5)}</tbody></table></body></html>`;
}

// ---------- NBA e NFL ----------
// Formato conhecido da ESPN (o proxy do ambiente não alcança a API; conferir com as amostras da sonda em produção):
// score em texto, status com clock (número), displayClock (texto), period e type.name/state/shortDetail; standings
// com um nó em children por conferência e stats por name (wins, losses, ties, winPercent em fração, gamesBehind,
// playoffSeed) mais os de resumo, sem value (overall "8-2", Home, Road), que o parser ignora. Times reais, números
// inventados. Os dois scoreboards seguem as datas pedidas (NBA em 04/11, NFL na semana 10, domingo 08/11).
const tUS = (id, local, nome, sigla) => ({ id: String(id), uid: "s:40~l:46~t:" + id, location: local, name: nome, abbreviation: sigla, displayName: local + " " + nome, shortDisplayName: nome, isActive: true });
export const NBA = {
  lakers: tUS(13, "Los Angeles", "Lakers", "LAL"), celtics: tUS(2, "Boston", "Celtics", "BOS"), knicks: tUS(18, "New York", "Knicks", "NY"),
  heat: tUS(14, "Miami", "Heat", "MIA"), nuggets: tUS(7, "Denver", "Nuggets", "DEN"), warriors: tUS(9, "Golden State", "Warriors", "GS"),
  bucks: tUS(15, "Milwaukee", "Bucks", "MIL"), suns: tUS(21, "Phoenix", "Suns", "PHX"),
};
export const NFL = {
  chiefs: tUS(12, "Kansas City", "Chiefs", "KC"), bills: tUS(2, "Buffalo", "Bills", "BUF"), ravens: tUS(33, "Baltimore", "Ravens", "BAL"),
  texans: tUS(34, "Houston", "Texans", "HOU"), eagles: tUS(21, "Philadelphia", "Eagles", "PHI"), lions: tUS(8, "Detroit", "Lions", "DET"),
  niners: tUS(25, "San Francisco", "49ers", "SF"), cowboys: tUS(6, "Dallas", "Cowboys", "DAL"),
};
const evUS = (id, quando, casa, fora, st, extra = {}) => ({
  id: String(id), uid: "s:40~e:" + id, date: quando, name: fora.displayName + " at " + casa.displayName, shortName: fora.abbreviation + " @ " + casa.abbreviation,
  ...(extra.semana ? { week: { number: extra.semana }, season: { year: 2026, type: 2, slug: "regular-season" } } : { season: { year: 2027, type: 2, slug: "regular-season" } }),
  competitions: [{ id: String(id), date: quando, attendance: 0, neutralSite: false, venue: { id: "1", fullName: extra.venue || "Arena Exemplo", address: { city: "Cidade", state: "UF" }, indoor: true },
    competitors: [
      { id: casa.id, homeAway: "home", order: 0, team: casa, score: extra.pc === undefined ? "0" : String(extra.pc), records: [{ name: "overall", type: "total", summary: "5-3" }] },
      { id: fora.id, homeAway: "away", order: 1, team: fora, score: extra.pf === undefined ? "0" : String(extra.pf), records: [{ name: "overall", type: "total", summary: "4-4" }] },
    ],
    status: { clock: extra.clock ?? 0, displayClock: extra.relogio ?? "0.0", period: extra.periodo ?? 0,
      type: { id: st === "post" ? "3" : st === "in" ? "2" : "1", name: extra.nome || (st === "post" ? "STATUS_FINAL" : st === "in" ? "STATUS_IN_PROGRESS" : "STATUS_SCHEDULED"), state: st, completed: st === "post",
        description: st === "post" ? "Final" : st === "in" ? "In Progress" : "Scheduled", detail: extra.detalhe || "", shortDetail: extra.detalhe || (st === "post" ? "Final" : st === "in" ? "5:32 - 4th" : "11/4 - 7:30 PM EST") } } }],
  status: { clock: 0, displayClock: "0.0", period: 0, type: { state: st } },
});
export function scoreboardNba() {
  return {
    leagues: [{ id: "46", uid: "s:40~l:46", name: "National Basketball Association", abbreviation: "NBA", slug: "nba",
      season: { year: 2027, startDate: "2026-09-30T07:00Z", endDate: "2027-06-30T06:59Z", displayName: "2026-27", type: { id: "2", type: 2, name: "Regular Season", abbreviation: "reg" } },
      calendarType: "day", calendarIsWhitelist: true, calendarStartDate: "2026-09-30T07:00Z", calendarEndDate: "2027-06-30T06:59Z",
      calendar: ["2026-11-02T07:00Z", "2026-11-03T07:00Z", "2026-11-04T07:00Z", "2026-11-05T07:00Z", "2026-11-06T07:00Z", "2026-11-07T07:00Z"] }],
    season: { type: 2, year: 2027 }, day: { date: "2026-11-04" },
    events: [
      evUS(401, h(-27), NBA.lakers, NBA.celtics, "post", { pc: 118, pf: 112 }),
      evUS(402, h(-0.7), NBA.knicks, NBA.heat, "in", { pc: 98, pf: 101, periodo: 4, relogio: "5:32", clock: 332 }),
      evUS(403, h(-0.6), NBA.nuggets, NBA.warriors, "in", { pc: 55, pf: 60, periodo: 2, relogio: "0.0", nome: "STATUS_HALFTIME", detalhe: "Halftime" }),
      evUS(404, h(-0.5), NBA.bucks, NBA.suns, "in", { pc: 120, pf: 120, periodo: 5, relogio: "2:10", detalhe: "2:10 - OT" }),
      evUS(405, h(-0.4), NBA.celtics, NBA.heat, "in", { pc: 30, pf: 28, periodo: 1, relogio: "0.0", nome: "STATUS_END_PERIOD", detalhe: "End of 1st" }),
      evUS(406, h(2), NBA.lakers, NBA.warriors, "pre"),
      evUS(407, h(23), NBA.suns, NBA.lakers, "pre"),
    ],
  };
}
// Linhas: [time, wins, losses, winPercent, gamesBehind, playoffSeed]. Entradas fora da ordem de seed, como a ESPN manda.
const statsUS = (v, d, pct, gb, seed, ties) => [
  { name: "avgPointsAgainst", abbreviation: "OPP PPG", type: "avgpointsagainst", value: 110.4, displayValue: "110.4" },
  { name: "gamesBehind", abbreviation: "GB", type: "gamesbehind", value: gb, displayValue: gb ? String(gb) : "-" },
  { name: "losses", abbreviation: "L", type: "losses", value: d, displayValue: String(d) },
  { name: "playoffSeed", abbreviation: "PS", type: "playoffseed", value: seed, displayValue: String(seed) },
  ...(ties === undefined ? [] : [{ name: "ties", abbreviation: "T", type: "ties", value: ties, displayValue: String(ties) }]),
  { name: "winPercent", abbreviation: "PCT", type: "winpercent", value: pct, displayValue: String(pct).replace(/^0/, "") },
  { name: "wins", abbreviation: "W", type: "wins", value: v, displayValue: String(v) },
  { name: "pointsFor", abbreviation: "PF", type: "pointsfor", value: 900 + v, displayValue: String(900 + v) },
  { id: "0", name: "overall", type: "total", summary: v + "-" + d, displayValue: v + "-" + d },
  { id: "1", name: "Home", type: "home", summary: "3-1", displayValue: "3-1" },
];
const conf = (id, nome, sigla, linhas, ties) => ({ uid: "s:40~l:46~g:" + id, id: String(id), name: nome, abbreviation: sigla, isConference: true,
  standings: { id: "0", name: nome, displayName: nome, season: 2027, seasonType: 2, seasonDisplayName: "2026-27", entries: linhas.map(([t, ...s]) => ({ team: t, stats: statsUS(...s, ...(ties ? [s[5] ?? 0] : [])) })) } });
export function standingsNba() {
  // Leste com 11 times (para passar das zonas: 1-6 playoffs, 7-10 play-in, 11 fora); Oeste com 4 e um sem seed
  const leste = [
    [NBA.heat, 4, 4, 0.5, 2, 7], [NBA.celtics, 6, 2, 0.75, 0, 1], [NBA.knicks, 5, 3, 0.625, 1, 3],
    ...["A", "B", "C", "D", "E", "F", "G"].map((x, i) => [tUS(100 + i, "Time", x, "T" + x), 5 - Math.floor(i / 2), 3 + Math.floor(i / 2), 0.6 - i * 0.05, 1 + i * 0.5, [2, 4, 5, 6, 8, 9, 10][i]]),
    [NBA.bucks, 1, 7, 0.125, 5, 11],
  ];
  const oeste = [[NBA.lakers, 7, 1, 0.875, 0, 1], [NBA.warriors, 4, 4, 0.5, 3, 3], [NBA.nuggets, 6, 2, 0.75, 1, 2], [NBA.suns, 2, 6, 0.25, 5, null]];
  const o = conf(6, "Western Conference", "West", oeste);
  o.standings.entries[3].stats = o.standings.entries[3].stats.filter((x) => x.name !== "playoffSeed");
  return { uid: "s:40~l:46~g:9", id: "9", name: "National Basketball Association", abbreviation: "NBA",
    children: [conf(5, "Eastern Conference", "East", leste), o], links: [], seasons: [{ year: 2027, displayName: "2026-27" }] };
}
export function scoreboardNfl() {
  return {
    leagues: [{ id: "28", name: "National Football League", abbreviation: "NFL", slug: "nfl",
      season: { year: 2026, startDate: "2026-07-31T07:00Z", endDate: "2027-02-11T07:59Z", displayName: "2026", type: { id: "2", type: 2, name: "Regular Season", abbreviation: "reg" } },
      calendarType: "list", calendarIsWhitelist: true,
      calendar: [{ label: "Regular Season", value: "2", startDate: "2026-09-02T07:00Z", endDate: "2027-01-06T07:59Z", entries: [
        { label: "Week 9", alternateLabel: "Wk 9", detail: "Oct 28-Nov 3", value: "9", startDate: "2026-10-28T07:00Z", endDate: "2026-11-04T07:59Z" },
        { label: "Week 10", alternateLabel: "Wk 10", detail: "Nov 4-10", value: "10", startDate: "2026-11-04T08:00Z", endDate: "2026-11-11T07:59Z" }] }] }],
    season: { type: 2, year: 2026 }, week: { number: 10 },
    events: [
      evUS(501, h(-50), NFL.ravens, NFL.texans, "post", { pc: 27, pf: 24, semana: 10 }),
      evUS(502, h(-0.8), NFL.chiefs, NFL.bills, "in", { pc: 17, pf: 14, periodo: 3, relogio: "8:41", semana: 10 }),
      evUS(503, h(-0.7), NFL.eagles, NFL.cowboys, "in", { pc: 10, pf: 10, periodo: 2, relogio: "0:00", nome: "STATUS_HALFTIME", detalhe: "Halftime", semana: 10 }),
      evUS(504, h(60), NFL.lions, NFL.niners, "pre", { semana: 10 }),
      // sem week no evento: vale o número do topo
      { ...evUS(505, h(70), NFL.niners, NFL.chiefs, "pre"), season: undefined },
    ],
  };
}
// Semana anterior (ultimos): pedida por ?dates=2026&seasontype=2&week=9
export function scoreboardNflAnterior() {
  return { season: { type: 2, year: 2026 }, week: { number: 9 }, events: [
    evUS(491, h(-150), NFL.bills, NFL.ravens, "post", { pc: 31, pf: 20, semana: 9 }),
    evUS(492, h(-148), NFL.cowboys, NFL.lions, "post", { pc: 23, pf: 23, semana: 9, detalhe: "Final/OT" }),
  ] };
}
// Por conferência (AFC e NFC, 16 cada; aqui 4), stats com ties; seeds 1-4 líderes de divisão, 5-7 wild card
export function standingsNfl() {
  const afc = [[NFL.texans, 5, 3, 0.625, 2, 5], [NFL.chiefs, 7, 1, 0.875, 0, 1], [NFL.bills, 6, 2, 0.75, 1, 2], [NFL.ravens, 4, 4, 0.5, 3, 8]];
  const nfc = [[NFL.eagles, 6, 2, 0.75, 0, 1], [NFL.lions, 5, 2, 0.688, 0.5, 2, 1], [NFL.niners, 5, 3, 0.625, 1, 6], [NFL.cowboys, 2, 6, 0.25, 4, 13]];
  const c = (id, nome, sigla, ls) => ({ id: String(id), name: nome, abbreviation: sigla, isConference: true,
    standings: { season: 2026, seasonType: 2, entries: ls.map(([t, v, d, pct, gb, seed, ties]) => ({ team: t, stats: statsUS(v, d, pct, gb, seed, ties ?? 0) })) } });
  return { id: "9", name: "National Football League", abbreviation: "NFL", children: [c(8, "American Football Conference", "AFC", afc), c(7, "National Football Conference", "NFC", nfc)], seasons: [{ year: 2026 }] };
}
