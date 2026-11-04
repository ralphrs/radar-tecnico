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
    leagues: [{ name: "Brazilian Serie A", abbreviation: "BRA.1", season: { year: 2026 } }],
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
