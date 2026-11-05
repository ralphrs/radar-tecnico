// Esportes: rodada, próximos jogos e tabela das competições que as pessoas ligaram em "Meus esportes". Sem IA.
//
// Fontes:
// - ESPN, endpoints públicos sem chave (JSON):
//   site.api.espn.com/apis/site/v2/sports/<esporte>/<liga>/scoreboard?dates=AAAAMMDD (jogos de UM dia com placar e status;
//   faixa de datas devolve HTTP 400; a resposta traz leagues[0].calendar com os dias que têm jogo, usado para escolher
//   quais dias buscar), site.api.espn.com/apis/v2/sports/<esporte>/<liga>/standings (tabela; copa do Brasil não tem) e
//   site.api.espn.com/apis/site/v2/sports/<esporte>/<liga>/teams/<id>/schedule (jogos de um time).
//   O caminho "<esporte>/<liga>" vem de public/esportes.js; qualquer um da ESPN serve (basketball/nba, tennis/atp...).
//   Tênis (ATP e WTA): o mesmo scoreboard, sem data (os torneios em andamento) e com ?dates= (um dia). Cada evento é um
//   torneio com `groupings[]` (as chaves: simples, duplas) e, dentro, `competitions[]` = partidas (lerTenis).
// - Globo Esporte: página de competição como reserva (`reserva: "ge"` em LIGAS), quando houver uma que responda. Parser
//   tolerante: procura o JSON embutido e, sem ele, a tabela do HTML. Falhou: _sistema/esportes-erro. Hoje nenhuma liga usa:
//   a página do Gauchão deu 404 na sonda e a ESPN cobre o Gauchão (bra.camp.gaucho) na temporada.
//
// Conferido com a sonda de 04/11/2026 (_sistema/sonda-esportes): scoreboard por dia 200, faixa 400; standings 200 em todas
// menos bra.copa_do_brasil (400, sem tabela); site.web.api.espn.com 403 (não usar); schedule do time 200.
// NBA (04/11/2026) entrou sem amostra real: o ambiente de desenvolvimento não alcança a ESPN. O parser segue o formato
// conhecido (score em texto, status.period e displayClock, standings com children por conferência, stats wins, losses,
// winPercent, gamesBehind, playoffSeed) e o que faltar vira null. A sonda pede as URLs novas mesmo já tendo terminado
// antes (ela completa a lista quando aparece competição nova). A NFL saiu em 05/11/2026 por decisão do dono.
// Tênis (05/11/2026), também sem amostra real: parser tolerante (campo que falta vira null), por conferir pela sonda.
//
// meta/esportes-<liga>: { atualizado, liga, nome, temporada, fonte, tabela: [{ pos, time, sigla, id, j, v, e, d, gp, gc, sg, pts, pct, gb, seed, zona, grupo? }],
//   rodada: { numero, jogos: [jogo] }, proximos: [até 20], ultimos: [até 20], times: { <id>: { nome, proximos, ultimos } },
//   rodadaEm, tabelaEm, timesEm, tentativas: { rodada, tabela, times } }
// jogo: { id, data, mandante, visitante, siglas: [m, v], ids: [m, v], placar: [m, v] | null, estado: "pre"|"in"|"post", minuto, estadio, detalhe,
//   curtos?: [m, v] (NBA: "Lakers") }  linha da NBA também leva curto
// Tênis (meta/esportes-atp e -wta): rodada.jogos = partidas do dia (São Paulo) e as em andamento; proximos e ultimos de
//   partidas; torneios: [{ id, nome, local, inicio, fim, rodada, aoVivo, partidas }]; sem tabela nem times.
// partida: { id, data, torneio, torneioId, chave, rodada, jogadores: [a, b], curtos: [a, b], cabecas: [a, b], ranks: [a, b],
//   sets: [[a, b], ...], vencedor: 0 | 1 | null, estado, minuto ("2º set"), quadra, detalhe }
//
// Ritmo (cronEsportes, conferido a cada 5 min): rodada a cada 15 min quando há jogo ao vivo ou começando nas próximas
// 2 h, senão 1x por hora; tabela 2x por dia; jogos dos times de interesse 1x por dia. Chamadas em fila, 400 ms entre
// elas, 8 s de limite cada; 429 dobra a espera e tenta de novo uma vez. No máximo 30 chamadas por passada (a rodada de
// uma liga gasta até 1 + DIAS_EXTRA: o dia de hoje e os dias com jogo mais perto, entre 3 dias atrás e 10 à frente; no
// tênis, 4: sem data, ontem, hoje e amanhã).

import "../public/esportes.js";
import { lerFeed } from "./coleta.js";
import { FEEDS } from "./feeds.js";

const E = globalThis.Esportes;
const TIMEOUT = 8000;
const PAUSA = 400;
const ORCAMENTO = 30;
const DIAS_EXTRA = 5;
const JANELA = [-3, 10];
const MIN = 60_000, HORA = 3_600_000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const num = (v) => { if (v === null || v === undefined || v === "") return null; const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
const txt = (v, max = 80) => (v == null ? "" : String(v)).replace(/\s+/g, " ").trim().slice(0, max);
const iso = (v) => { const d = new Date(v); return v && !isNaN(d) ? d.toISOString() : ""; };
const slug = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

// ---------- URLs ----------
const caminhoDe = (liga) => (E.LIGAS[liga] ? E.LIGAS[liga].caminho : String(liga).includes("/") ? String(liga) : "soccer/" + liga);
export const urlScoreboard = (liga, dia) => `https://site.api.espn.com/apis/site/v2/sports/${caminhoDe(liga)}/scoreboard${dia ? "?dates=" + dia : ""}`;
export const urlStandings = (liga) => `https://site.api.espn.com/apis/v2/sports/${caminhoDe(liga)}/standings`;
export const urlSchedule = (liga, time, proximos) => `https://site.api.espn.com/apis/site/v2/sports/${caminhoDe(liga)}/teams/${encodeURIComponent(time)}/schedule${proximos ? "?fixture=true" : ""}`;

// AAAAMMDD em São Paulo, deslocado em dias
export function diaSP(quando, dias = 0) {
  const d = new Date(new Date(quando).getTime() + dias * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d).replace(/-/g, "");
}

// ---------- ESPN: jogos ----------
// Um evento do scoreboard ou do schedule. Devolve null quando falta o essencial (dois times com nome).
// `liga` muda só o "minuto": no futebol o relógio da ESPN ("67'"); no basquete o quarto e o relógio ("4º quarto · 5:32",
// "intervalo", "prorrogação").
export function lerJogo(ev, liga) {
  if (!ev || typeof ev !== "object") return null;
  const c = Array.isArray(ev.competitions) ? ev.competitions[0] : null;
  const comps = c && Array.isArray(c.competitors) ? c.competitors.filter((x) => x && typeof x === "object") : [];
  if (comps.length < 2) return null;
  const casa = comps.find((x) => x.homeAway === "home") || comps[0];
  const fora = comps.find((x) => x !== casa && x.homeAway === "away") || comps.find((x) => x !== casa);
  const time = (x) => { const t = x.team || {}; return { nome: txt(t.displayName || t.shortDisplayName || t.name || t.abbreviation || t.location, 60), sigla: txt(t.abbreviation, 4).toUpperCase(), id: t.id != null ? txt(t.id, 20) : "" }; };
  const m = time(casa), v = time(fora);
  if (!m.nome || !v.nome) return null;
  const st = (c && c.status) || ev.status || {};
  const tipo = st.type || {};
  const estado = ["pre", "in", "post"].includes(tipo.state) ? tipo.state : tipo.completed ? "post" : "pre";
  const placarDe = (x) => { const s = x.score; return s && typeof s === "object" ? num(s.value ?? s.displayValue) : num(s); };
  const pm = placarDe(casa), pv = placarDe(fora);
  const intervalo = /HALFTIME/i.test(tipo.name || "") || /^(HT|intervalo)$/i.test(txt(tipo.shortDetail));
  const futebol = !E.LIGAS[liga] || E.LIGAS[liga].esporte === "futebol";
  const minuto = estado !== "in" ? "" : intervalo ? "intervalo"
    : futebol ? txt(st.displayClock || tipo.shortDetail, 12)
    : txt(E.periodo(st.period, st.displayClock, tipo.name) || tipo.shortDetail, 24);
  const adiado = /POSTPONED|CANCELED|CANCELLED|SUSPENDED|ABANDONED/i.test(tipo.name || "");
  const venue = (c && c.venue) || ev.venue || {};
  // NBA: o nome curto da ESPN ("Lakers") para o celular e os cards do Início
  const curtoDe = (x) => { const t = x.team || {}; return txt(t.shortDisplayName || t.name, 30); };
  const j = {
    id: txt(ev.id || (c && c.id), 20), data: iso(ev.date || (c && c.date)),
    mandante: m.nome, visitante: v.nome, siglas: [m.sigla, v.sigla], ids: [m.id, v.id],
    placar: estado === "pre" || pm === null || pv === null ? null : [pm, pv],
    estado, minuto, estadio: txt(venue.fullName || venue.name, 60), detalhe: adiado ? "adiado" : txt(tipo.shortDetail || tipo.description, 30),
  };
  if (!futebol) { const cm = curtoDe(casa), cv = curtoDe(fora); if (cm && cv && (cm !== m.nome || cv !== v.nome)) j.curtos = [cm, cv]; }
  return j;
}
const porData = (a, b) => String(a.data).localeCompare(String(b.data));
export function lerJogos(j, liga) {
  const evs = j && Array.isArray(j.events) ? j.events : [];
  return evs.map((ev) => lerJogo(ev, liga)).filter(Boolean).sort(porData);
}
// calendar: no futebol e na NBA, uma lista de dias ("2026-11-04T08:00Z"), às vezes como objetos com startDate.
export function lerScoreboard(j, liga) {
  const lg = j && Array.isArray(j.leagues) ? j.leagues[0] : null;
  const numero = (j && j.week && num(j.week.number)) ?? null;
  const jogos = lerJogos(j, liga);
  const tipoT = (j && j.season && j.season.type) ?? (lg && lg.season && lg.season.type);
  return {
    jogos, numero,
    temporada: num((j && j.season && j.season.year) ?? (lg && lg.season && lg.season.year)),
    tipoTemporada: num(tipoT && typeof tipoT === "object" ? tipoT.type ?? tipoT.id : tipoT),
    nome: txt(lg && (lg.name || lg.abbreviation)),
    calendario: lg && Array.isArray(lg.calendar) ? lg.calendar.map((d) => (typeof d === "string" ? d : d && d.startDate)).filter(Boolean) : [],
  };
}

// Dias (AAAAMMDD em São Paulo) a buscar além de hoje: os do calendário da ESPN dentro da janela, os mais perto de hoje
// primeiro, no máximo `max`. Sem calendário, os vizinhos fixos (ontem, amanhã, depois...).
export function diasExtras(calendario, agora = Date.now(), max = DIAS_EXTRA) {
  const hoje = diaSP(agora);
  const dias = new Set();
  for (const c of calendario || []) { const t = Date.parse(c); if (!isNaN(t)) dias.add(diaSP(t)); }
  let lista;
  if (dias.size) {
    const de = diaSP(agora, JANELA[0]), ate = diaSP(agora, JANELA[1]);
    lista = [...dias].filter((d) => d !== hoje && d >= de && d <= ate).sort((a, b) => Math.abs(a - hoje) - Math.abs(b - hoje) || a - b);
  } else lista = [-1, 1, 2, 3, -2].map((n) => diaSP(agora, n));
  return lista.slice(0, max);
}

// Rodada atual a partir dos jogos de uma janela de dias: o número de rodada do jogo ao vivo (ou do mais perto de agora),
// quando a ESPN manda; sem número, os jogos até `raio` dias em volta do jogo de referência (NBA: meio dia, a noite de jogos).
export function escolherRodada(jogos, agora = Date.now(), numero = null, raio = 2) {
  if (!jogos.length) return { numero, jogos: [] };
  const t = (x) => Date.parse(x.data) || 0;
  const ref = jogos.find((x) => x.estado === "in")
    || jogos.filter((x) => x.estado === "pre" && t(x) >= agora - 3 * HORA).sort((a, b) => t(a) - t(b)).find((x) => t(x) - agora <= 3 * 86_400_000)
    || jogos.filter((x) => x.estado === "post").sort((a, b) => t(b) - t(a))[0]
    || jogos[0];
  if (ref.rodada != null) return { numero: ref.rodada, jogos: jogos.filter((x) => x.rodada === ref.rodada) };
  const meio = t(ref);
  return { numero, jogos: jogos.filter((x) => Math.abs(t(x) - meio) <= raio * 86_400_000) };
}
export const proximosDe = (jogos, agora = Date.now(), n = 20) => jogos.filter((x) => x.estado !== "post" && (Date.parse(x.data) || 0) >= agora - 3 * HORA).sort(porData).slice(0, n);
export const ultimosDe = (jogos, n = 20) => jogos.filter((x) => x.estado === "post").sort((a, b) => porData(b, a)).slice(0, n);

// ---------- ESPN: tênis ----------
// Formato conhecido (sem amostra real ainda; conferir pela sonda): events[] = torneios (id, name, shortName, date,
// endDate, venue?), cada um com groupings[] ({ grouping: { slug, displayName }, competitions[] }); cada competition é uma
// partida com competitors[] (order, winner, athlete.displayName/shortName, seed, curatedRank.current, linescores[] por set
// com value), status.type (state, name, description), status.period, round ou notes, date, venue.court. Campo que falta
// vira null; partida sem os dois nomes sai. Só as chaves de simples entram (duplas ficam de fora nesta versão); evento
// sem groupings mas com competitions[] direto também é lido.
const CHAVES = { "mens-singles": "Simples masculino", "womens-singles": "Simples feminino", "mens-doubles": "Duplas masculinas", "womens-doubles": "Duplas femininas", "mixed-doubles": "Duplas mistas" };
const ehSimples = (slug, nome) => { const t = (slug || "") + " " + (nome || ""); return !/doubles|duplas|dobles/i.test(t); };
function nomeChave(g) {
  const slug = txt(g && (g.slug || g.id), 40).toLowerCase(), nome = txt(g && (g.displayName || g.name), 40);
  return CHAVES[slug] || (/women'?s singles/i.test(nome) ? CHAVES["womens-singles"] : /men'?s singles/i.test(nome) ? CHAVES["mens-singles"] : nome);
}
function localDe(v) {
  if (!v || typeof v !== "object") return "";
  const a = v.address || {};
  const partes = [a.city, a.country || a.state].map((x) => txt(x, 40)).filter(Boolean);
  return partes.length ? partes.join(", ") : txt(v.displayName || v.fullName || v.name, 60);
}
export function lerPartida(c, ev, chave, liga) {
  if (!c || typeof c !== "object") return null;
  const comps = (Array.isArray(c.competitors) ? c.competitors : []).filter((x) => x && typeof x === "object").slice().sort((a, b) => (num(a.order) ?? 9) - (num(b.order) ?? 9));
  if (comps.length < 2) return null;
  const [a, b] = comps;
  const nome = (x) => { const at = x.athlete || {}; return txt(at.displayName || at.fullName || x.displayName || (x.roster && x.roster.displayName) || (x.team && x.team.displayName), 60); };
  const curto = (x) => { const at = x.athlete || {}; return txt(at.shortName || at.shortDisplayName || (x.roster && x.roster.shortDisplayName) || "", 40); };
  const ja = nome(a), jb = nome(b);
  if (!ja || !jb) return null;
  const st = c.status || {};
  const tipo = st.type || {};
  const estado = ["pre", "in", "post"].includes(tipo.state) ? tipo.state : tipo.completed ? "post" : "pre";
  const ls = (x) => (Array.isArray(x.linescores) ? x.linescores : []).map((l) => (l && typeof l === "object" ? num(l.value ?? l.displayValue) : num(l)));
  const la = ls(a), lb = ls(b);
  const sets = [];
  for (let i = 0; i < Math.max(la.length, lb.length); i++) if (la[i] != null || lb[i] != null) sets.push([la[i] ?? null, lb[i] ?? null]);
  const vencedor = a.winner === true ? 0 : b.winner === true ? 1 : null;
  const nomeSt = String(tipo.name || "") + " " + String(tipo.description || "");
  const detalhe = /RETIRED|\bret\b/i.test(nomeSt) ? "desistência" : /WALKOVER|W\/O/i.test(nomeSt) ? "W.O." : /POSTPONED|CANCEL/i.test(nomeSt) ? "adiado" : /SUSPENDED|DELAYED/i.test(nomeSt) ? "suspenso" : "";
  const per = num(st.period);
  const setNo = Number.isInteger(per) && per >= 1 ? per : sets.length || null;
  const notas = Array.isArray(c.notes) ? c.notes : [];
  const rodadaTxt = (c.round && typeof c.round === "object" ? c.round.displayName || c.round.name || c.round.abbreviation : c.round)
    || (notas[0] && (notas[0].text || notas[0].headline)) || "";
  const venue = c.venue || {};
  const seed = (x) => { const v = num(x.seed); return v != null && v > 0 ? v : null; };
  const rank = (x) => { const v = num(x.curatedRank && typeof x.curatedRank === "object" ? x.curatedRank.current : x.curatedRank); return v != null && v > 0 && v < 99 ? v : null; };
  const p = {
    id: txt(c.id || "", 20) || txt((ev && ev.id) || "", 12) + "-" + slug(ja + "-" + jb), data: iso(c.date || c.startDate || (ev && ev.date)),
    torneio: txt(ev && (ev.name || ev.shortName), 60), torneioId: txt(ev && ev.id, 20), chave: chave || "",
    rodada: E.rodadaTenis(txt(rodadaTxt, 40)),
    jogadores: [ja, jb], curtos: [curto(a) || ja, curto(b) || jb], cabecas: [seed(a), seed(b)], ranks: [rank(a), rank(b)],
    sets, vencedor, estado, minuto: estado === "in" && setNo ? setNo + "º set" : "",
    quadra: txt(venue.court || venue.fullName || venue.displayName, 40), detalhe,
  };
  return p;
}
// Devolve { partidas, torneios, temporada, chaves } (chaves: os nomes de todas as chaves vistas, para a sonda). Nunca lança.
export function lerTenis(j, liga) {
  const partidas = [], torneios = [], chaves = new Set();
  try {
    const evs = j && Array.isArray(j.events) ? j.events : [];
    for (const ev of evs) {
      if (!ev || typeof ev !== "object") continue;
      const grupos = Array.isArray(ev.groupings) && ev.groupings.length ? ev.groupings
        : Array.isArray(ev.competitions) ? [{ grouping: null, competitions: ev.competitions }] : [];
      const daqui = [];
      let localPartida = "";
      for (const g of grupos) {
        if (!g || typeof g !== "object") continue;
        const gr = g.grouping || {};
        const nome = nomeChave(gr);
        if (nome) chaves.add(nome);
        if (!ehSimples(gr.slug, gr.displayName || gr.name)) continue;
        for (const c of Array.isArray(g.competitions) ? g.competitions : []) {
          const p = lerPartida(c, ev, nome, liga);
          if (p) { daqui.push(p); if (!localPartida && c.venue) localPartida = localDe(c.venue); }
        }
      }
      partidas.push(...daqui);
      // rodada atual: a da partida ao vivo; senão a da próxima marcada; senão a da última encerrada
      const t = (x) => Date.parse(x.data) || 0;
      const ref = daqui.find((x) => x.estado === "in") || daqui.filter((x) => x.estado === "pre").sort((x, y) => t(x) - t(y))[0] || daqui.filter((x) => x.estado === "post").sort((x, y) => t(y) - t(x))[0];
      const nomeT = txt(ev.name || ev.shortName, 60);
      if (!nomeT) continue;
      torneios.push({ id: txt(ev.id, 20), nome: nomeT, local: localDe(ev.venue) || (typeof ev.location === "string" ? txt(ev.location, 60) : "") || localPartida,
        inicio: iso(ev.date), fim: iso(ev.endDate), rodada: ref ? ref.rodada : "", aoVivo: daqui.some((x) => x.estado === "in"), partidas: daqui.length });
    }
  } catch (e) {}
  partidas.sort(porData);
  const lg = j && Array.isArray(j.leagues) ? j.leagues[0] : null;
  const temporada = num((j && j.season && j.season.year) ?? (lg && lg.season && lg.season.year));
  return { partidas, torneios, temporada, chaves: [...chaves] };
}
// Partidas do dia (em São Paulo) mais as em andamento, ao vivo primeiro e depois pela hora
export function partidasDoDia(partidas, agora = Date.now()) {
  const hoje = diaSP(agora);
  const t = (x) => Date.parse(x.data) || 0;
  return partidas.filter((x) => x.estado === "in" || (x.data && diaSP(t(x)) === hoje))
    .sort((a, b) => Number(b.estado === "in") - Number(a.estado === "in") || t(a) - t(b));
}

// ---------- ESPN: tabela ----------
// stats por nome (rank, points, gamesPlayed, wins, draws ou ties, losses, pointsFor, pointsAgainst, pointDifferential;
// NBA: winPercent, gamesBehind, playoffSeed). Grupos (Libertadores, conferências da NBA): cada nó em children com
// standings.entries é um grupo e cada linha leva o nome dele.
// Liga com `porSeed`: dentro de cada grupo a ordem é a do playoffSeed (sem ele, % de vitórias e vitórias), pos é a
// posição no grupo e a zona sai do seed.
export function lerStandings(j, liga) {
  const grupos = [];
  const visitar = (no, nome, prof = 0) => {
    if (!no || typeof no !== "object" || prof > 4) return;
    const ents = no.standings && Array.isArray(no.standings.entries) ? no.standings.entries : null;
    if (ents) grupos.push({ nome: txt(E.LIGAS[liga] && E.LIGAS[liga].esporte !== "futebol" ? E.nomeGrupo(no.name || nome, no.abbreviation) : no.name || no.abbreviation || nome || ""), entries: ents });
    if (Array.isArray(no.children)) no.children.forEach((ch) => visitar(ch, ch && ch.name, prof + 1));
  };
  visitar(j, "");
  const out = [];
  const varios = grupos.length > 1;
  const porSeed = !!(E.LIGAS[liga] && E.LIGAS[liga].porSeed);
  for (const g of grupos) {
    const grupoLinhas = [];
    g.entries.forEach((e, i) => {
      if (!e || typeof e !== "object") return;
      const t = e.team || {};
      const nome = txt(t.displayName || t.shortDisplayName || t.name || t.location, 60);
      if (!nome) return;
      const s = {};
      for (const x of Array.isArray(e.stats) ? e.stats : []) {
        const k = x && (x.name || x.type);
        if (k && !(k in s)) s[k] = num(x.value ?? x.displayValue);
      }
      const gp = s.pointsFor ?? null, gc = s.pointsAgainst ?? null;
      const pos = s.rank ?? num(e.position) ?? i + 1;
      const v = s.wins ?? null, d = s.losses ?? null, emp = s.draws ?? s.ties ?? null;
      // winPercent vem em fração (0.732); se vier em 0-100, divide
      let pct = s.winPercent ?? s.winPct ?? null;
      if (pct !== null && pct > 1) pct = pct / 100;
      if (pct === null && v !== null && d !== null && v + d + (emp || 0) > 0) pct = (v + (emp || 0) / 2) / (v + d + (emp || 0));
      const linha = {
        pos, time: nome, sigla: txt(t.abbreviation, 4).toUpperCase(), id: t.id != null ? txt(t.id, 20) : slug(nome),
        j: s.gamesPlayed ?? (porSeed && v !== null && d !== null ? v + d + (emp || 0) : null), v, e: emp, d,
        gp, gc, sg: s.pointDifferential ?? (gp !== null && gc !== null ? gp - gc : null), pts: s.points ?? null,
        zona: E.zonaDe(liga, pos),
      };
      if (porSeed) {
        linha.pct = pct === null ? null : Math.round(pct * 1000) / 1000;
        linha.gb = s.gamesBehind ?? null;
        linha.seed = s.playoffSeed ?? null;
        const curto = txt(t.shortDisplayName || t.name, 30);
        if (curto && curto !== nome) linha.curto = curto;
      }
      if (varios) linha.grupo = g.nome;
      grupoLinhas.push(linha);
    });
    if (porSeed) {
      // ordem do grupo pelo seed; quem não tem seed vai depois, pela % e pelas vitórias
      const chave = (l) => [l.seed ?? Infinity, -(l.pct ?? -1), -(l.v ?? -1)];
      grupoLinhas.sort((a, b) => { const x = chave(a), y = chave(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
      grupoLinhas.forEach((l, k) => { l.pos = k + 1; l.zona = E.zonaDe(liga, l.seed ?? l.pos); });
    }
    out.push(...grupoLinhas);
  }
  out.sort((a, b) => String(a.grupo || "").localeCompare(String(b.grupo || ""), "pt-BR", { numeric: true }) || a.pos - b.pos);
  const filho = j && Array.isArray(j.children) ? j.children[0] : null;
  const temporada = num(j && j.season && (j.season.year ?? j.season)) ?? num(filho && filho.standings && (filho.standings.season ?? filho.standings.seasonDisplayName)) ?? num(j && Array.isArray(j.seasons) && j.seasons[0] && j.seasons[0].year);
  return { tabela: out, temporada };
}

// ---------- Globo Esporte ----------
// Acha o valor JSON (array ou objeto) que vem depois de "chave": no texto, contando colchetes fora das aspas.
export function blocosJson(texto, chave, max = 6) {
  const out = [];
  const alvo = `"${chave}"`;
  let i = 0;
  while (out.length < max) {
    const k = texto.indexOf(alvo, i);
    if (k < 0) break;
    i = k + alvo.length;
    let p = i;
    while (p < texto.length && /[\s:]/.test(texto[p])) p++;
    const abre = texto[p];
    if (abre !== "[" && abre !== "{") continue;
    let prof = 0, aspas = false, esc = false, fim = -1;
    for (let q = p; q < texto.length && q - p < 2_000_000; q++) {
      const ch = texto[q];
      if (aspas) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') aspas = false; continue; }
      if (ch === '"') aspas = true;
      else if (ch === "[" || ch === "{") prof++;
      else if (ch === "]" || ch === "}") { prof--; if (!prof) { fim = q; break; } }
    }
    if (fim < 0) break;
    try { out.push(JSON.parse(texto.slice(p, fim + 1))); } catch (e) {}
    i = fim + 1;
  }
  return out;
}
const nomeGe = (x) => (x && typeof x === "object" ? txt(x.nome_popular || x.nome || x.apelido || (x.equipe && (x.equipe.nome_popular || x.equipe.nome)) || (x.time && (x.time.nome_popular || x.time.nome)), 60) : "");
const siglaGe = (x) => txt((x && (x.sigla || (x.equipe && x.equipe.sigla) || (x.time && x.time.sigla))) || "", 4).toUpperCase();
// "2026-03-08T16:00" sem fuso é hora de Brasília
const dataGe = (d, h) => {
  let s = txt(d, 30);
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += "T" + (/^\d{2}:\d{2}/.test(txt(h)) ? txt(h).slice(0, 5) : "12:00");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) s += "-03:00";
  return iso(s);
};
function linhaGe(r, i, liga) {
  if (!r || typeof r !== "object") return null;
  const time = nomeGe(r);
  if (!time) return null;
  const n = (k) => num(r[k]);
  const gp = n("gols_pro"), gc = n("gols_contra");
  const pos = n("ordem") ?? n("posicao") ?? i + 1;
  return { pos, time, sigla: siglaGe(r), id: txt(r.equipe_id ?? (r.equipe && r.equipe.id) ?? "", 20) || slug(time),
    j: n("jogos"), v: n("vitorias"), e: n("empates"), d: n("derrotas"), gp, gc, sg: n("saldo_gols") ?? (gp !== null && gc !== null ? gp - gc : null), pts: n("pontos"), zona: E.zonaDe(liga, pos) };
}
function jogoGe(x, agora) {
  if (!x || typeof x !== "object" || !x.equipes) return null;
  const m = nomeGe(x.equipes.mandante), v = nomeGe(x.equipes.visitante);
  if (!m || !v) return null;
  const data = dataGe(x.data_realizacao || x.data, x.hora_realizacao || x.hora);
  const pm = num(x.placar_oficial_mandante ?? x.placar_mandante), pv = num(x.placar_oficial_visitante ?? x.placar_visitante);
  const t = Date.parse(data) || 0;
  const estado = pm === null || pv === null ? (x.jogo_ja_comecou ? "in" : "pre") : t && agora - t < 2 * HORA && agora >= t ? "in" : "post";
  return { id: txt(x.id, 20), data, mandante: m, visitante: v, siglas: [siglaGe(x.equipes.mandante), siglaGe(x.equipes.visitante)], ids: [slug(m), slug(v)],
    placar: estado === "pre" ? null : [pm ?? 0, pv ?? 0], estado, minuto: "", estadio: txt(x.sede && (x.sede.nome_popular || x.sede.nome), 60), detalhe: "" };
}
const semTag = (s) => s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
// Sem o JSON: a primeira tabela do HTML que tiver linhas com posição, nome e pelo menos 6 números
function tabelaHtml(html, liga) {
  const linhas = [];
  for (const tb of html.match(/<table[\s\S]*?<\/table>/gi) || []) {
    for (const tr of tb.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
      const cel = (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(semTag).filter(Boolean);
      if (cel.length < 8 || !/^\d{1,2}º?$/.test(cel[0]) || !/[A-Za-zÀ-ú]/.test(cel[1])) continue;
      const ns = cel.slice(2).map(num);
      if (ns.filter((x) => x !== null).length < 6) continue;
      const [pts, j, v, e, d, gp, gc, sg] = ns;
      const pos = parseInt(cel[0], 10);
      linhas.push({ pos, time: cel[1].slice(0, 60), sigla: "", id: slug(cel[1]), j: j ?? null, v: v ?? null, e: e ?? null, d: d ?? null, gp: gp ?? null, gc: gc ?? null, sg: sg ?? (gp != null && gc != null ? gp - gc : null), pts: pts ?? null, zona: E.zonaDe(liga, pos) });
    }
    if (linhas.length) break;
  }
  return linhas;
}
// Devolve { tabela, jogos } ou null quando não achou nada reconhecível. Nunca lança.
export function lerGe(html, liga = "bra.camp.gaucho", agora = Date.now()) {
  try {
    if (typeof html !== "string" || html.length < 20) return null;
    let tabela = [];
    for (const b of blocosJson(html, "classificacao")) {
      const lista = Array.isArray(b) ? b : b && Array.isArray(b.classificacao) ? b.classificacao : [];
      const ls = lista.map((r, i) => linhaGe(r, i, liga)).filter(Boolean);
      if (ls.length > tabela.length) tabela = ls;
    }
    if (!tabela.length) tabela = tabelaHtml(html, liga);
    tabela.sort((a, b) => a.pos - b.pos);
    const jogos = [], vistos = new Set();
    for (const chave of ["lista_jogos", "jogos"]) {
      for (const b of blocosJson(html, chave)) {
        for (const x of Array.isArray(b) ? b : []) {
          const g = jogoGe(x, agora);
          const k = g && (g.id || g.data + g.mandante);
          if (g && !vistos.has(k)) { vistos.add(k); jogos.push(g); }
        }
      }
    }
    jogos.sort(porData);
    if (!tabela.length && !jogos.length) return null;
    return { tabela, jogos };
  } catch (e) { return null; }
}

// ---------- chamadas ----------
export class Limite extends Error { constructor(m) { super(m); this.limite = true; } }
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
// Fila de chamadas: pausa entre uma e outra, 8 s de limite, 429 dobra a pausa e tenta de novo uma vez.
export function novaFila({ pausa = PAUSA, orcamento = ORCAMENTO } = {}) {
  let p = pausa, ultima = 0, usadas = 0;
  const fila = async (url, { json = true } = {}) => {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      if (usadas >= orcamento) throw new Limite("orçamento de chamadas da passada");
      const falta = ultima + p - Date.now();
      if (ultima && falta > 0) await espera(falta);
      usadas++;
      ultima = Date.now();
      const t0 = Date.now();
      let r;
      try { r = await fetch(url, { headers: { "user-agent": UA, accept: json ? "application/json" : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }, signal: AbortSignal.timeout(TIMEOUT) }); }
      catch (e) { throw new Error(String((e && e.message) || e).slice(0, 120) + " em " + new URL(url).host); }
      if (r.status === 429) { p = Math.max(p * 2, 400); if (tentativa === 0) continue; throw new Limite("HTTP 429 em " + new URL(url).host); }
      const corpo = await r.text();
      const res = { status: r.status, ok: r.ok, texto: corpo, ms: Date.now() - t0 };
      if (!r.ok) { const e = new Error("HTTP " + r.status + " em " + new URL(url).host); e.status = r.status; throw e; }
      if (json) { try { res.json = JSON.parse(corpo); } catch (e) { throw new Error("JSON inválido em " + new URL(url).host); } }
      return res;
    }
  };
  Object.defineProperty(fila, "usadas", { get: () => usadas });
  return fila;
}

// ---------- banco ----------
const gravar = (env, c, id, data) => env.DB.prepare(
  "INSERT INTO docs (collection, id, data, coletado) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, coletado = excluded.coletado, atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
).bind(c, id, JSON.stringify(data), new Date().toISOString()).run();
async function lerDoc(env, c, id) {
  const r = await env.DB.prepare("SELECT data FROM docs WHERE collection = ? AND id = ?").bind(c, id).first();
  try { return r ? JSON.parse(r.data) : null; } catch { return null; }
}
export const idDoc = (liga) => "esportes-" + liga;

// Competições ativas: as ligadas por alguém em prefs/<email> (id "esportes", faixa da chave, sem LIKE) mais as fixas.
// Times de interesse por competição, sem repetir.
export async function ligasAtivas(env) {
  const ligas = new Set(E.SEMPRE), times = new Map();
  let results = [];
  try { ({ results } = await env.DB.prepare("SELECT data FROM docs WHERE collection >= 'prefs/' AND collection < 'prefs0' AND id = 'esportes'").all()); } catch (e) {}
  for (const r of results || []) {
    let p;
    try { p = E.semRetiradas(JSON.parse(r.data)); } catch { continue; }
    if (!p || typeof p !== "object") continue;
    const v = E.validarPrefs({ competicoes: p.competicoes, times: p.times, ordem: p.ordem });
    if (!v.prefs) continue;
    v.prefs.competicoes.forEach((l) => ligas.add(l));
    for (const t of v.prefs.times) {
      if (!v.prefs.competicoes.includes(t.liga)) continue;
      if (!times.has(t.liga)) times.set(t.liga, []);
      if (!times.get(t.liga).some((x) => x.id === t.id)) times.get(t.liga).push({ id: t.id, nome: t.nome });
    }
  }
  return { ligas: E.ORDEM_LIGAS.filter((l) => ligas.has(l)), times };
}

// Há jogo ao vivo, ou começando (ou que já devia ter começado) entre 3 h atrás e 2 h à frente?
export function quente(doc, agora = Date.now()) {
  if (!doc) return false;
  const js = [...((doc.rodada && doc.rodada.jogos) || []), ...(doc.proximos || [])];
  return js.some((x) => x.estado === "in" || (x.estado === "pre" && (Date.parse(x.data) || 0) - agora <= 2 * HORA && (Date.parse(x.data) || 0) - agora >= -3 * HORA));
}
// O que está vencido numa competição. Uma tentativa que falhou espera pelo menos 30 min (ou o próprio intervalo, se menor).
export function vencidos(doc, times, agora = Date.now()) {
  const idade = (v) => (v ? agora - Date.parse(v) : Infinity);
  const tent = (doc && doc.tentativas) || {};
  const pede = (em, t, limite) => idade(em) >= limite && idade(t) >= Math.min(limite, 30 * MIN);
  const limRodada = quente(doc, agora) ? 14 * MIN : 59 * MIN;
  return {
    rodada: pede(doc && doc.rodadaEm, tent.rodada, limRodada),
    tabela: pede(doc && doc.tabelaEm, tent.tabela, 12 * HORA - 5 * MIN),
    times: !!(times && times.length) && pede(doc && doc.timesEm, tent.times, 24 * HORA - 5 * MIN),
  };
}

async function gravarErros(env, erros) {
  if (!Object.keys(erros).length) return;
  const antes = (await lerDoc(env, "_sistema", "esportes-erro")) || {};
  const porLiga = { ...(antes.porLiga || {}) };
  const quando = new Date().toISOString();
  for (const [k, v] of Object.entries(erros)) porLiga[k] = { quando, erro: String(v).slice(0, 200) };
  await gravar(env, "_sistema", "esportes-erro", { quando, porLiga });
}

// Atualiza uma competição: só o que está vencido (ou o que `forcar` pedir). Mantém o que já havia quando uma parte falha.
export async function atualizarLiga(env, liga, { fila, times = [], forcar = null, agora = Date.now(), erros = {} } = {}) {
  const def = E.LIGAS[liga];
  if (!def) return null;
  const antes = (await lerDoc(env, "meta", idDoc(liga))) || {};
  const v = { ...(forcar || vencidos(antes, times, agora)) };
  // sem tabela (Copa do Brasil, tênis): a tabela nunca vence, senão o doc seria regravado a cada passada sem motivo
  if (def.semTabela) v.tabela = false;
  if (def.tenis) v.times = false;
  if (!v.rodada && !v.tabela && !v.times) return null;
  if (def.tenis) return atualizarTenis(env, liga, def, antes, { fila, agora, erros });
  const doc = { tabela: [], rodada: { numero: null, jogos: [] }, proximos: [], ultimos: [], times: {}, tentativas: {}, ...antes, liga, nome: def.nome, fonte: antes.fonte || def.fonte };
  doc.tentativas = { ...(antes.tentativas || {}) };
  const quandoIso = new Date(agora).toISOString();
  const erro = (parte, e) => { erros[liga + ":" + parte] = String((e && e.message) || e); doc.tentativas[parte] = quandoIso; };
  // ge direto quando a ESPN já falhou para esta competição nas últimas 24 h
  const viaGe = def.reserva === "ge" && doc.fonte === "ge" && antes.espnFalhouEm && agora - Date.parse(antes.espnFalhouEm) < 24 * HORA;
  let espnFalhou = false;
  if (!viaGe) {
    if (v.rodada) {
      try {
        // hoje e os dias com jogo
        const sb = lerScoreboard((await fila(urlScoreboard(liga, diaSP(agora)))).json, liga);
        if (sb.temporada) doc.temporada = sb.temporada;
        const vistos = new Set(sb.jogos.map((x) => x.id));
        const juntar = (outro) => { for (const j of outro.jogos) if (!vistos.has(j.id)) { vistos.add(j.id); sb.jogos.push(j); } };
        // os outros dias com jogo; se o orçamento acabar no meio, fica com o que veio
        for (const dia of diasExtras(sb.calendario, agora, def.diasExtras ?? DIAS_EXTRA)) {
          let outro;
          try { outro = lerScoreboard((await fila(urlScoreboard(liga, dia))).json, liga); }
          catch (e) { if (e.limite) break; continue; }
          juntar(outro);
          if (sb.numero == null && outro.numero != null) sb.numero = outro.numero;
        }
        if (!sb.jogos.length && def.reserva === "ge" && !(antes.rodada && antes.rodada.jogos && antes.rodada.jogos.length)) espnFalhou = true;
        doc.rodada = escolherRodada(sb.jogos, agora, sb.numero, def.raioRodada ?? 2);
        doc.proximos = proximosDe(sb.jogos, agora);
        doc.ultimos = ultimosDe(sb.jogos);
        doc.rodadaEm = quandoIso; delete doc.tentativas.rodada;
        if (!espnFalhou) doc.fonte = "espn";
      } catch (e) { if (e.limite) throw e; if (def.reserva === "ge" && e.status >= 400 && e.status < 500) espnFalhou = true; else erro("rodada", e); }
    }
    if (v.tabela && !espnFalhou && !def.semTabela) {
      try {
        const st = lerStandings((await fila(urlStandings(liga))).json, liga);
        if (!st.tabela.length && def.reserva === "ge" && !(antes.tabela && antes.tabela.length)) espnFalhou = true;
        else { doc.tabela = st.tabela; if (st.temporada) doc.temporada = st.temporada; doc.tabelaEm = quandoIso; delete doc.tentativas.tabela; }
      } catch (e) { if (e.limite) throw e; if (def.reserva === "ge" && e.status >= 400 && e.status < 500) espnFalhou = true; else erro("tabela", e); }
    }
  }
  if (viaGe || espnFalhou) {
    if (espnFalhou) doc.espnFalhouEm = quandoIso;
    try {
      const r = await fila(def.ge, { json: false });
      const g = lerGe(r.texto, liga, agora);
      if (!g) throw new Error("página do ge sem tabela nem jogos reconhecíveis");
      doc.fonte = "ge";
      if (g.tabela.length) { doc.tabela = g.tabela; doc.tabelaEm = quandoIso; delete doc.tentativas.tabela; }
      doc.rodada = escolherRodada(g.jogos, agora, null);
      doc.proximos = proximosDe(g.jogos, agora);
      doc.ultimos = ultimosDe(g.jogos);
      doc.rodadaEm = quandoIso; delete doc.tentativas.rodada;
      doc._jogosGe = g.jogos;
    } catch (e) { if (e.limite) throw e; erro(v.rodada ? "rodada" : "tabela", e); }
  }
  if (v.times && times.length) {
    const novos = { ...(doc.times || {}) };
    let algum = false;
    for (const t of times) {
      try {
        let jogos;
        if (doc.fonte === "ge") jogos = (doc._jogosGe || [...(doc.ultimos || []), ...(doc.proximos || [])]).filter((x) => x.ids.includes(t.id) || x.mandante === t.nome || x.visitante === t.nome);
        else {
          jogos = lerJogos((await fila(urlSchedule(liga, t.id))).json, liga);
          if (!proximosDe(jogos, agora).length) { try { jogos = jogos.concat(lerJogos((await fila(urlSchedule(liga, t.id, true))).json, liga)); } catch (e) { if (e.limite) throw e; } }
        }
        const vistos = new Set();
        jogos = jogos.filter((x) => { const k = x.id || x.data + x.mandante; if (vistos.has(k)) return false; vistos.add(k); return true; });
        novos[t.id] = { nome: t.nome, proximos: proximosDe(jogos, agora, 10), ultimos: ultimosDe(jogos, 10) };
        algum = true;
      } catch (e) { if (e.limite) throw e; erro("times", e); }
    }
    // times que ninguém acompanha mais saem
    const ids = new Set(times.map((t) => t.id));
    for (const k of Object.keys(novos)) if (!ids.has(k)) delete novos[k];
    doc.times = novos;
    if (algum) { doc.timesEm = quandoIso; if (!erros[liga + ":times"]) delete doc.tentativas.times; }
  }
  delete doc._jogosGe;
  doc.atualizado = quandoIso;
  await gravar(env, "meta", idDoc(liga), doc);
  return doc;
}

// Tênis: o scoreboard sem data (torneios em andamento) e ontem, hoje e amanhã, cada um numa chamada; partidas juntadas
// pelo id. Sem tabela e sem times. Se tudo falhar, fica o doc de antes e o erro vai para "<liga>:rodada".
async function atualizarTenis(env, liga, def, antes, { fila, agora, erros }) {
  const doc = { tabela: [], rodada: { numero: null, jogos: [] }, proximos: [], ultimos: [], torneios: [], times: {}, tentativas: {}, ...antes, liga, nome: def.nome, fonte: "espn" };
  doc.tentativas = { ...(antes.tentativas || {}) };
  const quandoIso = new Date(agora).toISOString();
  const porId = new Map();
  let torneios = null, ok = 0, ultimoErro = null;
  for (const dia of ["", diaSP(agora, -1), diaSP(agora), diaSP(agora, 1)]) {
    let r;
    try { r = lerTenis((await fila(urlScoreboard(liga, dia))).json, liga); }
    catch (e) { if (e.limite) { if (!ok) throw e; break; } ultimoErro = e; continue; }
    ok++;
    if (r.temporada) doc.temporada = r.temporada;
    for (const p of r.partidas) if (!porId.has(p.id)) porId.set(p.id, p);
    // os torneios vêm da chamada sem data; se ela falhar, dos dias
    if (dia === "" && r.torneios.length) torneios = r.torneios;
    else if (!torneios && r.torneios.length) torneios = r.torneios;
  }
  if (!ok) {
    erros[liga + ":rodada"] = String((ultimoErro && ultimoErro.message) || ultimoErro || "sem resposta");
    doc.tentativas.rodada = quandoIso;
  } else {
    const partidas = [...porId.values()].sort(porData);
    doc.rodada = { numero: null, jogos: partidasDoDia(partidas, agora) };
    doc.proximos = proximosDe(partidas, agora, 40);
    doc.ultimos = ultimosDe(partidas, 30);
    doc.torneios = torneios || [];
    doc.rodadaEm = quandoIso; delete doc.tentativas.rodada;
  }
  doc.atualizado = quandoIso;
  await gravar(env, "meta", idDoc(liga), doc);
  return doc;
}

// ---------- sonda ----------
// Na primeira execução monta a lista do que testar; anda 6 por minuto; cada resposta (até 20 KB) vai para
// _sistema/sonda-esportes-aNN e o resumo (status, tamanho, tempo, o que o parser achou) para _sistema/sonda-esportes.
// Depois de pronta só volta a andar quando a lista ganha item novo (competição nova em SONDA_LIGAS): pede só os novos.
// Para rodar tudo de novo, o Admin apaga os docs da sonda (por id).
const SONDA_LIGAS = ["bra.1", "bra.copa_do_brasil", "conmebol.libertadores", "conmebol.sudamericana", "bra.camp.gaucho", "eng.1", "uefa.champions", "esp.1", "ita.1", "ger.1", "fra.1", "nba", "atp", "wta"];
// RSS candidatos. Os de padel (05/11/2026) não deram para abrir do ambiente de desenvolvimento; os que vierem com 200 e
// itens vão para src/feeds.js, seção esportes.
const SONDA_RSS = ["https://ge.globo.com/rss/ge/", "https://ge.globo.com/rss/ge/futebol/times/internacional/", "https://ge.globo.com/rss/ge/rs/", "https://ge.globo.com/rss/ge/futebol/campeonato-gaucho/", "https://ge.globo.com/rss/ge/futebol/copa-do-brasil/", "https://ge.globo.com/rss/ge/futebol/libertadores/", "https://ge.globo.com/rss/ge/futebol/brasileirao-serie-a/",
  "https://www.padelfip.com/feed/", "https://www.padelfip.com/es/feed/", "https://thepadelpaper.com/feed/", "https://padelalto.com/feed",
  "https://www.padelworldpress.es/feed/", "https://www.padeladdict.com/feed/", "https://superpadel.com.br/feed/", "https://www.padelclube.com/blog-feed.xml"];
const SONDA_POR_VEZ = 6;
const AMOSTRA_MAX = 20_000;
export function listaSonda(agora = Date.now()) {
  const l = [];
  // tênis: o scoreboard sem data (torneios em andamento) e o de hoje; sem standings
  const tenis = (liga) => !!(E.LIGAS[liga] && E.LIGAS[liga].tenis);
  for (const liga of SONDA_LIGAS) l.push({ tipo: "scoreboard", liga, url: urlScoreboard(liga, tenis(liga) ? "" : diaSP(agora)) });
  for (const liga of SONDA_LIGAS.filter(tenis)) l.push({ tipo: "scoreboard-dia", liga, url: urlScoreboard(liga, diaSP(agora)) });
  for (const liga of SONDA_LIGAS.filter((x) => !tenis(x))) l.push({ tipo: "standings", liga, url: urlStandings(liga) });
  l.push({ tipo: "schedule", liga: "bra.1", url: "" }); // o id do time sai da tabela do bra.1, quando ela chegar
  for (const liga of Object.keys(E.LIGAS)) if (E.LIGAS[liga].ge) l.push({ tipo: "ge", liga, url: E.LIGAS[liga].ge });
  const ja = new Set(FEEDS.map((f) => f[3]));
  for (const u of SONDA_RSS) l.push({ tipo: "rss", url: u, jaNaColeta: ja.has(u) });
  return l.map((x, i) => ({ ...x, n: i }));
}
function resumoSonda(x, r, agora) {
  const out = {};
  try {
    if ((x.tipo === "scoreboard" || x.tipo === "scoreboard-dia") && E.LIGAS[x.liga] && E.LIGAS[x.liga].tenis) {
      const t = lerTenis(JSON.parse(r), x.liga), p = t.partidas;
      Object.assign(out, { torneios: t.torneios.length, partidas: p.length, estados: [...new Set(p.map((j) => j.estado))], chaves: t.chaves,
        comCabeca: p.filter((j) => j.cabecas.some((c) => c != null)).length, comRank: p.filter((j) => j.ranks.some((c) => c != null)).length,
        comSets: p.filter((j) => j.sets.length).length, semData: p.filter((j) => !j.data).length, semRodada: p.filter((j) => !j.rodada).length,
        primeiroTorneio: t.torneios[0] ? `${t.torneios[0].nome} · ${t.torneios[0].local || "sem local"} · ${t.torneios[0].rodada || "sem rodada"}` : "" });
      const ex = p.find((j) => j.estado === "in") || p.find((j) => j.sets.length) || p[0];
      if (ex) out.exemplo = `${ex.jogadores.join(" x ")} | ${E.placarSets(ex.sets) || "-"} | ${ex.estado}${ex.minuto ? " " + ex.minuto : ""} | ${ex.rodada || "-"} | ${ex.chave || "-"}`;
    }
    else if (x.tipo === "scoreboard") { const s = lerScoreboard(JSON.parse(r), x.liga); out.jogos = s.jogos.length; out.estados = [...new Set(s.jogos.map((j) => j.estado))]; out.numero = s.numero; out.temporada = s.temporada; out.tipoTemporada = s.tipoTemporada; out.diasNoCalendario = s.calendario.length; const vivo = s.jogos.find((j) => j.minuto); if (vivo) out.minuto = vivo.minuto; }
    else if (x.tipo === "standings") {
      const s = lerStandings(JSON.parse(r), x.liga); out.linhas = s.tabela.length; out.grupos = [...new Set(s.tabela.map((l) => l.grupo || ""))].length; out.primeiro = s.tabela[0] ? s.tabela[0].time + " " + s.tabela[0].pts : "";
      if (E.LIGAS[x.liga] && E.LIGAS[x.liga].porSeed) { const p = s.tabela[0] || {}; out.primeiro = p.time ? `${p.time} ${p.v}-${p.d} pct ${p.pct} gb ${p.gb} seed ${p.seed}` : ""; out.comSeed = s.tabela.filter((l) => l.seed != null).length; out.nomesGrupos = [...new Set(s.tabela.map((l) => l.grupo || ""))]; }
    }
    else if (x.tipo === "schedule") { const s = lerJogos(JSON.parse(r)); out.jogos = s.length; out.proximos = proximosDe(s, agora).length; }
    else if (x.tipo === "ge") { const g = lerGe(r, x.liga, agora); out.linhas = g ? g.tabela.length : 0; out.jogos = g ? g.jogos.length : 0; }
    else if (x.tipo === "rss") { out.itens = lerFeed(r).length; }
  } catch (e) { out.parser = "falhou: " + String((e && e.message) || e).slice(0, 100); }
  return out;
}
export async function cronSondaEsportes(env, { pausa = PAUSA, agora = Date.now() } = {}) {
  let s = await lerDoc(env, "_sistema", "sonda-esportes");
  if (s && s.fim) {
    // pronta: só volta se a lista ganhou item que ainda não tem resultado (competição nova)
    const chave = (x) => x.tipo + "|" + (x.liga || "") + "|" + (x.tipo === "rss" || x.tipo === "ge" ? x.url : "");
    const ja = new Set([...(s.resultados || []), ...(s.pendentes || [])].map(chave));
    const novos = listaSonda(agora).filter((x) => !ja.has(chave(x)));
    if (!novos.length) return 0;
    let n = Math.max(-1, ...(s.resultados || []).map((x) => Number(x.n) || 0));
    s.pendentes = novos.map((x) => ({ ...x, n: ++n }));
    s.fim = null; s.retomada = new Date(agora).toISOString();
  }
  if (!s) s = { inicio: new Date(agora).toISOString(), fim: null, pendentes: listaSonda(agora), resultados: [] };
  const lote = s.pendentes.slice(0, SONDA_POR_VEZ);
  for (const x of lote) {
    let url = x.url;
    if (x.tipo === "schedule" && !url) {
      const tab = s.resultados.find((y) => y.tipo === "standings" && y.liga === x.liga && y.timeId);
      url = tab ? urlSchedule(x.liga, tab.timeId) : "";
    }
    const res = { n: x.n, tipo: x.tipo, liga: x.liga || "", url, quando: new Date().toISOString() };
    if (!url) { res.erro = "sem id de time (a tabela do bra.1 não veio)"; s.resultados.push(res); continue; }
    if (x.jaNaColeta) res.jaNaColeta = true;
    const t0 = Date.now();
    try {
      const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(TIMEOUT) });
      const corpo = await r.text();
      Object.assign(res, { status: r.status, ms: Date.now() - t0, bytes: corpo.length, tipoConteudo: (r.headers.get("content-type") || "").slice(0, 60) });
      if (r.ok) Object.assign(res, resumoSonda(x, corpo, agora));
      if (r.ok && x.tipo === "standings" && x.liga === "bra.1" && !s.resultados.some((y) => y.timeId)) {
        try { const t = lerStandings(JSON.parse(corpo), "bra.1").tabela.find((l) => /^\d+$/.test(l.id)); if (t) res.timeId = t.id; } catch (e) {}
      }
      res.amostra = "sonda-esportes-a" + String(x.n).padStart(2, "0");
      await gravar(env, "_sistema", res.amostra, { url, status: r.status, quando: res.quando, amostra: corpo.slice(0, AMOSTRA_MAX), cortado: corpo.length > AMOSTRA_MAX });
    } catch (e) { Object.assign(res, { status: 0, ms: Date.now() - t0, erro: String((e && e.message) || e).slice(0, 160) }); }
    s.resultados.push(res);
    await espera(pausa);
  }
  s.pendentes = s.pendentes.slice(lote.length);
  if (!s.pendentes.length) s.fim = new Date().toISOString();
  await gravar(env, "_sistema", "sonda-esportes", s);
  return lote.length;
}

// ---------- cron ----------
// Chamado a cada minuto pelo scheduled do Worker. A sonda anda enquanto tiver pendentes; as competições são
// conferidas a cada 5 min (minuto terminado em 4 ou 9). Nunca lança: o erro vai para _sistema/esportes-erro.
export async function cronEsportes(env, quando, { pausa = PAUSA, orcamento = ORCAMENTO, forcar = false } = {}) {
  const agora = new Date(quando).getTime();
  const out = { sonda: 0, ligas: [] };
  try { out.sonda = await cronSondaEsportes(env, { pausa, agora }); } catch (e) { console.error("sonda-esportes", String((e && e.message) || e).slice(0, 120)); }
  if (!forcar && new Date(agora).getUTCMinutes() % 5 !== 4) return out;
  const erros = {};
  try {
    const { ligas, times } = await ligasAtivas(env);
    const fila = novaFila({ pausa, orcamento });
    // ao vivo primeiro: se o orçamento acabar, o que tem jogo agora já foi
    const docs = new Map();
    for (const l of ligas) docs.set(l, await lerDoc(env, "meta", idDoc(l)));
    const ordem = ligas.slice().sort((a, b) => Number(quente(docs.get(b), agora)) - Number(quente(docs.get(a), agora)));
    for (const liga of ordem) {
      try { const d = await atualizarLiga(env, liga, { fila, times: times.get(liga) || [], agora, erros }); if (d) out.ligas.push(liga); }
      catch (e) { if (e.limite) { erros[liga] = e.message; break; } erros[liga] = String((e && e.message) || e); }
    }
  } catch (e) { erros.cron = String((e && e.message) || e); }
  try { await gravarErros(env, erros); } catch (e) {}
  out.erros = Object.keys(erros).length;
  return out;
}

// ---------- Meus esportes (/api/prefs/esportes) ----------
export const validarPrefsEsportes = (b) => E.validarPrefs(b);
export const respostaPrefsEsportes = (salvo) => E.respostaPrefs(salvo);
