// Esportes: rodada, próximos jogos e tabela das competições que as pessoas ligaram em "Meus esportes". Sem IA.
//
// Fontes:
// - ESPN, endpoints públicos sem chave (JSON):
//   site.api.espn.com/apis/site/v2/sports/<esporte>/<liga>/scoreboard?dates=AAAAMMDD-AAAAMMDD (jogos com placar e status),
//   site.api.espn.com/apis/v2/sports/<esporte>/<liga>/standings (tabela; site.web.api.espn.com de reserva) e
//   site.api.espn.com/apis/site/v2/sports/<esporte>/<liga>/teams/<id>/schedule (jogos de um time).
//   O caminho "<esporte>/<liga>" vem de public/esportes.js; qualquer um da ESPN serve (basketball/nba, racing/f1...).
// - Globo Esporte: a página da competição (Gauchão), quando a ESPN não tiver. Parser tolerante: procura o JSON que a
//   página traz embutido ("classificacao" e listas de jogos) e, sem ele, a tabela do HTML. Falhou: _sistema/esportes-erro.
//
// O proxy do ambiente de desenvolvimento não alcança a ESPN nem o ge. Os parsers foram escritos pelo formato conhecido
// e testados com JSON e HTML de exemplo (test/esportes.test.mjs). A sonda abaixo grava, no primeiro cron em produção,
// uma amostra crua de cada endpoint em _sistema/sonda-esportes-aNN, para conferir os formatos reais e ajustar.
//
// meta/esportes-<liga>: { atualizado, liga, nome, temporada, fonte, tabela: [{ pos, time, sigla, id, j, v, e, d, gp, gc, sg, pts, zona, grupo? }],
//   rodada: { numero, jogos: [jogo] }, proximos: [até 20], ultimos: [até 20], times: { <id>: { nome, proximos, ultimos } },
//   rodadaEm, tabelaEm, timesEm, tentativas: { rodada, tabela, times } }
// jogo: { id, data, mandante, visitante, siglas: [m, v], ids: [m, v], placar: [m, v] | null, estado: "pre"|"in"|"post", minuto, estadio, detalhe }
//
// Ritmo (cronEsportes, conferido a cada 5 min): rodada a cada 15 min quando há jogo ao vivo ou começando nas próximas
// 2 h, senão 1x por hora; tabela 2x por dia; jogos dos times de interesse 1x por dia. Chamadas em fila, 400 ms entre
// elas, 8 s de limite cada; 429 dobra a espera e tenta de novo uma vez. No máximo 14 chamadas por passada.

import "../public/esportes.js";
import { lerFeed } from "./coleta.js";
import { FEEDS } from "./feeds.js";

const E = globalThis.Esportes;
const TIMEOUT = 8000;
const PAUSA = 400;
const ORCAMENTO = 14;
const MIN = 60_000, HORA = 3_600_000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const num = (v) => { if (v === null || v === undefined || v === "") return null; const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
const txt = (v, max = 80) => (v == null ? "" : String(v)).replace(/\s+/g, " ").trim().slice(0, max);
const iso = (v) => { const d = new Date(v); return v && !isNaN(d) ? d.toISOString() : ""; };
const slug = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

// ---------- URLs ----------
const caminhoDe = (liga) => (E.LIGAS[liga] ? E.LIGAS[liga].caminho : String(liga).includes("/") ? String(liga) : "soccer/" + liga);
export const urlScoreboard = (liga, de, ate) => `https://site.api.espn.com/apis/site/v2/sports/${caminhoDe(liga)}/scoreboard?dates=${de}${ate ? "-" + ate : ""}&limit=200`;
export const urlStandings = (liga) => `https://site.api.espn.com/apis/v2/sports/${caminhoDe(liga)}/standings`;
export const urlStandingsWeb = (liga, temporada) => `https://site.web.api.espn.com/apis/v2/sports/${caminhoDe(liga)}/standings${temporada ? "?season=" + temporada : ""}`;
export const urlSchedule = (liga, time, proximos) => `https://site.api.espn.com/apis/site/v2/sports/${caminhoDe(liga)}/teams/${encodeURIComponent(time)}/schedule${proximos ? "?fixture=true" : ""}`;

// AAAAMMDD em São Paulo, deslocado em dias
export function diaSP(quando, dias = 0) {
  const d = new Date(new Date(quando).getTime() + dias * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d).replace(/-/g, "");
}

// ---------- ESPN: jogos ----------
// Um evento do scoreboard ou do schedule. Devolve null quando falta o essencial (dois times com nome).
export function lerJogo(ev) {
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
  const minuto = estado !== "in" ? "" : intervalo ? "intervalo" : txt(st.displayClock || tipo.shortDetail, 12);
  const adiado = /POSTPONED|CANCELED|CANCELLED|SUSPENDED|ABANDONED/i.test(tipo.name || "");
  const venue = (c && c.venue) || ev.venue || {};
  const j = {
    id: txt(ev.id || (c && c.id), 20), data: iso(ev.date || (c && c.date)),
    mandante: m.nome, visitante: v.nome, siglas: [m.sigla, v.sigla], ids: [m.id, v.id],
    placar: estado === "pre" || pm === null || pv === null ? null : [pm, pv],
    estado, minuto, estadio: txt(venue.fullName || venue.name, 60), detalhe: adiado ? "adiado" : txt(tipo.shortDetail || tipo.description, 30),
  };
  const sem = (ev.week && num(ev.week.number)) ?? null;
  if (sem !== null) j.rodada = sem;
  return j;
}
const porData = (a, b) => String(a.data).localeCompare(String(b.data));
export function lerJogos(j) {
  const evs = j && Array.isArray(j.events) ? j.events : [];
  return evs.map(lerJogo).filter(Boolean).sort(porData);
}
export function lerScoreboard(j) {
  const liga = j && Array.isArray(j.leagues) ? j.leagues[0] : null;
  return {
    jogos: lerJogos(j),
    numero: (j && j.week && num(j.week.number)) ?? null,
    temporada: num((j && j.season && j.season.year) ?? (liga && liga.season && liga.season.year)),
    nome: txt(liga && (liga.name || liga.abbreviation)),
  };
}

// Rodada atual a partir dos jogos de uma janela de dias: o número de rodada do jogo ao vivo (ou do mais perto de agora),
// quando a ESPN manda; sem número, os jogos até 2 dias em volta do jogo de referência.
export function escolherRodada(jogos, agora = Date.now(), numero = null) {
  if (!jogos.length) return { numero, jogos: [] };
  const t = (x) => Date.parse(x.data) || 0;
  const ref = jogos.find((x) => x.estado === "in")
    || jogos.filter((x) => x.estado === "pre" && t(x) >= agora - 3 * HORA).sort((a, b) => t(a) - t(b)).find((x) => t(x) - agora <= 3 * 86_400_000)
    || jogos.filter((x) => x.estado === "post").sort((a, b) => t(b) - t(a))[0]
    || jogos[0];
  if (ref.rodada != null) return { numero: ref.rodada, jogos: jogos.filter((x) => x.rodada === ref.rodada) };
  const meio = t(ref);
  return { numero, jogos: jogos.filter((x) => Math.abs(t(x) - meio) <= 2 * 86_400_000) };
}
export const proximosDe = (jogos, agora = Date.now(), n = 20) => jogos.filter((x) => x.estado !== "post" && (Date.parse(x.data) || 0) >= agora - 3 * HORA).sort(porData).slice(0, n);
export const ultimosDe = (jogos, n = 20) => jogos.filter((x) => x.estado === "post").sort((a, b) => porData(b, a)).slice(0, n);

// ---------- ESPN: tabela ----------
// stats por nome (rank, points, gamesPlayed, wins, draws ou ties, losses, pointsFor, pointsAgainst, pointDifferential).
// Grupos (Libertadores): um nó em children para cada grupo; cada linha leva o nome dele.
export function lerStandings(j, liga) {
  const grupos = [];
  const visitar = (no, nome, prof = 0) => {
    if (!no || typeof no !== "object" || prof > 4) return;
    const ents = no.standings && Array.isArray(no.standings.entries) ? no.standings.entries : null;
    if (ents) grupos.push({ nome: txt(no.name || no.abbreviation || nome || ""), entries: ents });
    if (Array.isArray(no.children)) no.children.forEach((ch) => visitar(ch, ch && ch.name, prof + 1));
  };
  visitar(j, "");
  const out = [];
  const varios = grupos.length > 1;
  for (const g of grupos) {
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
      const linha = {
        pos, time: nome, sigla: txt(t.abbreviation, 4).toUpperCase(), id: t.id != null ? txt(t.id, 20) : slug(nome),
        j: s.gamesPlayed ?? null, v: s.wins ?? null, e: s.draws ?? s.ties ?? null, d: s.losses ?? null,
        gp, gc, sg: s.pointDifferential ?? (gp !== null && gc !== null ? gp - gc : null), pts: s.points ?? null,
        zona: E.zonaDe(liga, pos),
      };
      if (varios) linha.grupo = g.nome;
      out.push(linha);
    });
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
    try { p = JSON.parse(r.data); } catch { continue; }
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
  const v = forcar || vencidos(antes, times, agora);
  if (!v.rodada && !v.tabela && !v.times) return null;
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
        const r = await fila(urlScoreboard(liga, diaSP(agora, -3), diaSP(agora, 10)));
        const sb = lerScoreboard(r.json);
        if (sb.temporada) doc.temporada = sb.temporada;
        if (!sb.jogos.length && def.reserva === "ge" && !(antes.rodada && antes.rodada.jogos && antes.rodada.jogos.length)) espnFalhou = true;
        doc.rodada = escolherRodada(sb.jogos, agora, sb.numero);
        doc.proximos = proximosDe(sb.jogos, agora);
        doc.ultimos = ultimosDe(sb.jogos);
        doc.rodadaEm = quandoIso; delete doc.tentativas.rodada;
        if (!espnFalhou) doc.fonte = "espn";
      } catch (e) { if (e.limite) throw e; if (def.reserva === "ge" && e.status >= 400 && e.status < 500) espnFalhou = true; else erro("rodada", e); }
    }
    if (v.tabela && !espnFalhou) {
      try {
        let r;
        try { r = await fila(urlStandings(liga)); }
        catch (e) { if (e.limite) throw e; r = await fila(urlStandingsWeb(liga, doc.temporada || new Date(agora).getUTCFullYear())); }
        const st = lerStandings(r.json, liga);
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
          jogos = lerJogos((await fila(urlSchedule(liga, t.id))).json);
          if (!proximosDe(jogos, agora).length) { try { jogos = jogos.concat(lerJogos((await fila(urlSchedule(liga, t.id, true))).json)); } catch (e) { if (e.limite) throw e; } }
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

// ---------- sonda ----------
// Na primeira execução monta a lista do que testar; anda 6 por minuto; cada resposta (até 20 KB) vai para
// _sistema/sonda-esportes-aNN e o resumo (status, tamanho, tempo, o que o parser achou) para _sistema/sonda-esportes.
// Depois de pronta não roda mais. Para rodar de novo, o Admin apaga os docs da sonda (por id).
const SONDA_LIGAS = ["bra.1", "bra.copa_do_brasil", "conmebol.libertadores", "conmebol.sudamericana", "bra.camp.gaucho", "eng.1", "uefa.champions", "esp.1", "ita.1", "ger.1", "fra.1"];
const SONDA_RSS = ["https://ge.globo.com/rss/ge/", "https://ge.globo.com/rss/ge/futebol/times/internacional/", "https://ge.globo.com/rss/ge/rs/", "https://ge.globo.com/rss/ge/futebol/campeonato-gaucho/", "https://ge.globo.com/rss/ge/futebol/copa-do-brasil/", "https://ge.globo.com/rss/ge/futebol/libertadores/"];
const SONDA_POR_VEZ = 6;
const AMOSTRA_MAX = 20_000;
export function listaSonda(agora = Date.now()) {
  const l = [];
  for (const liga of SONDA_LIGAS) l.push({ tipo: "scoreboard", liga, url: urlScoreboard(liga, diaSP(agora, -3), diaSP(agora, 10)) });
  for (const liga of SONDA_LIGAS) l.push({ tipo: "standings", liga, url: urlStandings(liga) });
  l.push({ tipo: "standings", liga: "bra.1", url: urlStandingsWeb("bra.1", new Date(agora).getUTCFullYear()) });
  l.push({ tipo: "scoreboard", liga: "bra.1", url: `https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard?dates=${diaSP(agora)}` });
  l.push({ tipo: "schedule", liga: "bra.1", url: "" }); // o id do time sai da tabela do bra.1, quando ela chegar
  l.push({ tipo: "ge", liga: "bra.camp.gaucho", url: E.LIGAS["bra.camp.gaucho"].ge });
  const ja = new Set(FEEDS.map((f) => f[3]));
  for (const u of SONDA_RSS) l.push({ tipo: "rss", url: u, jaNaColeta: ja.has(u) });
  return l.map((x, i) => ({ ...x, n: i }));
}
function resumoSonda(x, r, agora) {
  const out = {};
  try {
    if (x.tipo === "scoreboard") { const s = lerScoreboard(JSON.parse(r)); out.jogos = s.jogos.length; out.estados = [...new Set(s.jogos.map((j) => j.estado))]; out.numero = s.numero; out.temporada = s.temporada; }
    else if (x.tipo === "standings") { const s = lerStandings(JSON.parse(r), x.liga); out.linhas = s.tabela.length; out.grupos = [...new Set(s.tabela.map((l) => l.grupo || ""))].length; out.primeiro = s.tabela[0] ? s.tabela[0].time + " " + s.tabela[0].pts : ""; }
    else if (x.tipo === "schedule") { const s = lerJogos(JSON.parse(r)); out.jogos = s.length; out.proximos = proximosDe(s, agora).length; }
    else if (x.tipo === "ge") { const g = lerGe(r, x.liga, agora); out.linhas = g ? g.tabela.length : 0; out.jogos = g ? g.jogos.length : 0; }
    else if (x.tipo === "rss") { out.itens = lerFeed(r).length; }
  } catch (e) { out.parser = "falhou: " + String((e && e.message) || e).slice(0, 100); }
  return out;
}
export async function cronSondaEsportes(env, { pausa = PAUSA, agora = Date.now() } = {}) {
  let s = await lerDoc(env, "_sistema", "sonda-esportes");
  if (s && s.fim) return 0;
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
