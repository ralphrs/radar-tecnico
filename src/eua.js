// Mercado americano na aba Investimentos (visão EUA). Sem IA: o cron consulta cotações e grava em meta/eua.
//
// Fontes (sondadas pelo próprio Worker em 02/11/2026):
// - Yahoo Finance, gráfico v8 (query2.finance.yahoo.com/v8/finance/chart/<símbolo>?range=2d&interval=1d), sem chave.
//   É a única que respondeu 200 do Worker: Stooq estourou o tempo, CNBC deu 404, Yahoo v7 quote 401 e Nasdaq 520.
//   query1 deu 429 numa tentativa, então query2 vem primeiro e query1 fica de reserva. Pede user-agent de navegador.
//   Uma chamada por símbolo: lotes de 10 em paralelo, 400 ms entre lotes, 8 s de limite por chamada. Se vier 429,
//   o lote para, o que já veio é gravado e o resto fica em `pendentes` (meta/eua) para a próxima passada do cron.
// - Finnhub (finnhub.io/api/v1/quote), só quando houver o secret FINNHUB_TOKEN: vira a fonte principal das ações
//   e ETFs, no máximo 50 símbolos por execução (o plano grátis permite 60 por minuto); o resto vai para `pendentes`
//   e sai no minuto seguinte. O quote da Finnhub não traz volume, então a liquidez desses papéis fica vazia até o
//   Yahoo responder por eles. Índices (^GSPC, ^IXIC, ^DJI) vêm sempre do Yahoo, porque a Finnhub cobra por eles.
//
// meta/eua: { atualizado, fonte, acoes: [{ t, nome, preco, var, vol, liq, moeda, abre, max, min, ant, quando }],
//             etfs: [...], indices: [...], pendentes: [símbolos], semDado: [símbolos] }
// var é a variação do dia em %, liq = vol × preço em US$. Os índices também vão para o letreiro (meta/mercado).

import { mesclarLetreiro } from "./mercado.js";

// S&P 100 (composição de 2026). O nome daqui só aparece quando a fonte não manda o dela.
export const ACOES = {
  AAPL: "Apple", ABBV: "AbbVie", ABT: "Abbott", ACN: "Accenture", ADBE: "Adobe", AIG: "AIG", AMD: "AMD", AMGN: "Amgen",
  AMT: "American Tower", AMZN: "Amazon", AVGO: "Broadcom", AXP: "American Express", BA: "Boeing", BAC: "Bank of America",
  BK: "BNY Mellon", BKNG: "Booking", BLK: "BlackRock", BMY: "Bristol-Myers Squibb", "BRK.B": "Berkshire Hathaway",
  C: "Citigroup", CAT: "Caterpillar", CHTR: "Charter", CL: "Colgate-Palmolive", CMCSA: "Comcast", COF: "Capital One",
  COP: "ConocoPhillips", COST: "Costco", CRM: "Salesforce", CSCO: "Cisco", CVS: "CVS Health", CVX: "Chevron",
  DE: "Deere", DHR: "Danaher", DIS: "Disney", DUK: "Duke Energy", EMR: "Emerson", F: "Ford", FDX: "FedEx",
  GD: "General Dynamics", GE: "GE Aerospace", GILD: "Gilead", GM: "General Motors", GOOG: "Alphabet (classe C)",
  GOOGL: "Alphabet (classe A)", GS: "Goldman Sachs", HD: "Home Depot", HON: "Honeywell", IBM: "IBM", INTC: "Intel",
  INTU: "Intuit", ISRG: "Intuitive Surgical", JNJ: "Johnson & Johnson", JPM: "JPMorgan Chase", KO: "Coca-Cola",
  LIN: "Linde", LLY: "Eli Lilly", LMT: "Lockheed Martin", LOW: "Lowe's", MA: "Mastercard", MCD: "McDonald's",
  MDLZ: "Mondelez", MDT: "Medtronic", MET: "MetLife", META: "Meta", MMM: "3M", MO: "Altria", MRK: "Merck",
  MS: "Morgan Stanley", MSFT: "Microsoft", NEE: "NextEra Energy", NFLX: "Netflix", NKE: "Nike", NOW: "ServiceNow",
  NVDA: "Nvidia", ORCL: "Oracle", PEP: "PepsiCo", PFE: "Pfizer", PG: "Procter & Gamble", PLTR: "Palantir",
  PM: "Philip Morris", PYPL: "PayPal", QCOM: "Qualcomm", RTX: "RTX", SBUX: "Starbucks", SCHW: "Charles Schwab",
  SO: "Southern Company", SPG: "Simon Property", T: "AT&T", TGT: "Target", TMO: "Thermo Fisher", TMUS: "T-Mobile US",
  TSLA: "Tesla", TXN: "Texas Instruments", UBER: "Uber", UNH: "UnitedHealth", UNP: "Union Pacific", UPS: "UPS",
  USB: "U.S. Bancorp", V: "Visa", VZ: "Verizon", WFC: "Wells Fargo", WMT: "Walmart", XOM: "ExxonMobil",
};
export const ETFS = {
  SPY: "SPDR S&P 500", QQQ: "Invesco QQQ (Nasdaq-100)", VOO: "Vanguard S&P 500", IVV: "iShares Core S&P 500",
  VTI: "Vanguard Total Stock Market", DIA: "SPDR Dow Jones", IWM: "iShares Russell 2000", TLT: "iShares Treasury 20+ anos",
  GLD: "SPDR Gold (ouro)", SLV: "iShares Silver (prata)", XLF: "Financial Select Sector", XLK: "Technology Select Sector",
  XLE: "Energy Select Sector", ARKK: "ARK Innovation",
};
// [símbolo, id no letreiro, nome]
export const INDICES = [["^GSPC", "spx", "S&P 500"], ["^IXIC", "nasdaq", "Nasdaq"], ["^DJI", "dow", "Dow Jones"]];

// Índices primeiro: se o Yahoo cortar no meio, o letreiro já tem o que mostrar.
export const UNIVERSO = [...INDICES.map((i) => i[0]), ...Object.keys(ETFS), ...Object.keys(ACOES)];

const TIMEOUT = 8000;
const LOTE = 10;
const PAUSA = 400;
const FINNHUB_POR_VEZ = 50;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

class Limite extends Error { constructor(m) { super(m); this.limite = true; } }

const num = (v) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const arred = (v, c = 4) => (v === null ? null : Math.round(v * 10 ** c) / 10 ** c);
const ehIndice = (s) => s.startsWith("^");
// Yahoo escreve classe de ação com hífen (BRK-B); a Finnhub e o resto do site, com ponto.
const simboloYahoo = (s) => s.replace(".", "-");

// Data (AAAA-MM-DD) e minutos do dia em Nova York, com horário de verão.
const FMT_NY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function horaNY(d) {
  const p = Object.fromEntries(FMT_NY.formatToParts(d).map((x) => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, dia: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), min: Number(p.hour) * 60 + Number(p.minute) };
}
// Pregão regular da NYSE e da Nasdaq: 9h30 às 16h de Nova York, segunda a sexta (feriados não entram na conta).
export const pregaoEuaAberto = (d) => { const n = horaNY(d); return n.dia >= 1 && n.dia <= 5 && n.min >= 9 * 60 + 30 && n.min <= 16 * 60; };

// Lê a resposta do gráfico v8. Devolve null quando o símbolo não tem dado.
// A variação usa o fechamento do pregão anterior: com range=2d, chartPreviousClose é o fechamento de antes do
// primeiro dia do gráfico (anteontem), então ele só serve de último recurso.
export function lerChart(j) {
  const res = j && j.chart && Array.isArray(j.chart.result) ? j.chart.result[0] : null;
  if (!res || !res.meta) return null;
  const m = res.meta;
  const preco = num(m.regularMarketPrice);
  if (preco === null || preco <= 0) return null;
  const q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
  const ts = Array.isArray(res.timestamp) ? res.timestamp : [];
  const col = (k, i) => (Array.isArray(q[k]) ? num(q[k][i]) : null);
  const dias = ts.map((t, i) => ({ dia: horaNY(new Date(t * 1000)).data, o: col("open", i), h: col("high", i), l: col("low", i), c: col("close", i), v: col("volume", i) })).filter((b) => b.c !== null);
  const hoje = m.regularMarketTime ? horaNY(new Date(m.regularMarketTime * 1000)).data : dias.length ? dias[dias.length - 1].dia : "";
  const doDia = dias.length && dias[dias.length - 1].dia === hoje ? dias[dias.length - 1] : null;
  const antes = dias.filter((b) => b.dia < hoje);
  const ant = num(m.previousClose) ?? (antes.length ? antes[antes.length - 1].c : null) ?? num(m.chartPreviousClose);
  const vol = num(m.regularMarketVolume) ?? (doDia ? doDia.v : null);
  return {
    nome: String(m.shortName || m.longName || "").trim(),
    preco: arred(preco), ant: arred(ant), var: ant ? arred((preco / ant - 1) * 100) : null,
    vol, abre: arred(doDia ? doDia.o : null), max: arred(num(m.regularMarketDayHigh) ?? (doDia ? doDia.h : null)), min: arred(num(m.regularMarketDayLow) ?? (doDia ? doDia.l : null)),
    moeda: m.currency || "USD", quando: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : "",
  };
}

async function buscar(url, headers) {
  return fetch(url, { headers: { "user-agent": UA, accept: "application/json", ...headers }, signal: AbortSignal.timeout(TIMEOUT) });
}

// Um símbolo no Yahoo: query2 e, se falhar, query1. 404 é "sem dado"; 429 nos dois vira Limite.
export async function yahoo(sim) {
  let ultimo = null, limites = 0;
  for (const host of ["query2", "query1"]) {
    let r;
    try { r = await buscar(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simboloYahoo(sim))}?range=2d&interval=1d`); }
    catch (e) { ultimo = e; continue; }
    if (r.status === 429) { limites++; ultimo = new Error("HTTP 429 em " + host); continue; }
    if (r.status === 404) return null;
    if (!r.ok) { ultimo = new Error("HTTP " + r.status + " em " + host); continue; }
    return lerChart(await r.json());
  }
  if (limites === 2) throw new Limite("Yahoo respondeu 429 para " + sim);
  throw ultimo || new Error("sem resposta para " + sim);
}

// Um símbolo na Finnhub. c = preço, pc = fechamento anterior, dp = variação %, o/h/l do dia, t em segundos.
export async function finnhub(sim, token) {
  const r = await buscar(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sim)}&token=${encodeURIComponent(token)}`);
  if (r.status === 429) throw new Limite("Finnhub respondeu 429 para " + sim);
  if (!r.ok) throw new Error("HTTP " + r.status + " na Finnhub");
  const x = await r.json();
  const preco = num(x.c);
  if (!preco) return null;
  const ant = num(x.pc);
  return {
    nome: "", preco: arred(preco), ant: arred(ant), var: num(x.dp) !== null ? arred(num(x.dp)) : ant ? arred((preco / ant - 1) * 100) : null,
    vol: num(x.v), abre: arred(num(x.o)), max: arred(num(x.h)), min: arred(num(x.l)), moeda: "USD", quando: x.t ? new Date(x.t * 1000).toISOString() : "",
  };
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Consulta uma lista de símbolos. Devolve { dados: Map(símbolo -> cotação), semDado: [], pendentes: [], erros: [] }.
export async function consultar(simbolos, env, { pausa = PAUSA } = {}) {
  const dados = new Map(), semDado = [], erros = [];
  let pendentes = [];
  let fila = simbolos.slice();
  // Finnhub primeiro (quando houver token), no máximo 50 por execução; o que falhar nela tenta o Yahoo.
  const token = env.FINNHUB_TOKEN;
  const peloYahoo = [];
  if (token) {
    const paraFinnhub = fila.filter((s) => !ehIndice(s)).slice(0, FINNHUB_POR_VEZ);
    const usar = new Set(paraFinnhub);
    pendentes.push(...fila.filter((s) => !ehIndice(s) && !usar.has(s)));
    peloYahoo.push(...fila.filter(ehIndice));
    for (let i = 0; i < paraFinnhub.length; i += LOTE) {
      if (i) await espera(pausa);
      const lote = paraFinnhub.slice(i, i + LOTE);
      const res = await Promise.allSettled(lote.map((s) => finnhub(s, token)));
      res.forEach((r, k) => {
        if (r.status === "fulfilled" && r.value) dados.set(lote[k], r.value);
        else peloYahoo.push(lote[k]);
      });
    }
    fila = peloYahoo;
  }
  for (let i = 0; i < fila.length; i += LOTE) {
    if (i) await espera(pausa);
    const lote = fila.slice(i, i + LOTE);
    const res = await Promise.allSettled(lote.map(yahoo));
    let parou = false;
    res.forEach((r, k) => {
      if (r.status === "fulfilled") { if (r.value) dados.set(lote[k], r.value); else semDado.push(lote[k]); }
      else if (r.reason && r.reason.limite) { parou = true; pendentes.push(lote[k]); }
      else erros.push(lote[k] + ": " + String((r.reason && r.reason.message) || r.reason).slice(0, 120));
    });
    if (parou) { pendentes.push(...fila.slice(i + LOTE)); break; }
  }
  pendentes = [...new Set(pendentes)];
  return { dados, semDado, pendentes, erros };
}

export async function lerEua(env) {
  const r = await env.DB.prepare("SELECT data FROM docs WHERE collection = 'meta' AND id = 'eua'").first();
  try { return r ? JSON.parse(r.data) : null; } catch { return null; }
}

// Consulta (todos ou só `so`) e grava meta/eua, mantendo a última cotação boa de quem não respondeu agora.
export async function atualizarEua(env, { so = null, pausa = PAUSA } = {}) {
  const antes = (await lerEua(env)) || {};
  const alvo = so && so.length ? so.filter((s) => UNIVERSO.includes(s)) : UNIVERSO;
  const { dados, semDado, pendentes, erros } = await consultar(alvo, env, { pausa });
  const agora = new Date().toISOString();
  const velhos = new Map([...(antes.acoes || []), ...(antes.etfs || []), ...(antes.indices || [])].map((x) => [x.t, x]));
  const linha = (t, nomeLocal) => {
    const d = dados.get(t);
    if (!d) return velhos.get(t) || null;
    const { nome, ...resto } = d;
    return { t, nome: nome || nomeLocal, ...resto, liq: d.vol !== null && d.preco !== null ? Math.round(d.vol * d.preco) : null, lido: agora };
  };
  const porLiq = (a, b) => (b.liq || 0) - (a.liq || 0);
  const acoes = Object.entries(ACOES).map(([t, n]) => linha(t, n)).filter(Boolean).sort(porLiq);
  const etfs = Object.entries(ETFS).map(([t, n]) => linha(t, n)).filter(Boolean).sort(porLiq);
  // Índice usa sempre o nome curto daqui ("S&P 500"), não o do Yahoo.
  const indices = INDICES.map(([t, id, n]) => { const x = linha(t, n); return x ? { ...x, id, nome: n } : null; }).filter(Boolean);
  if (!dados.size && !acoes.length && !etfs.length) throw new Error("nenhuma cotação dos EUA" + (erros.length ? ": " + erros.slice(0, 3).join("; ") : pendentes.length ? " (limite de consultas)" : ""));
  const doc = { atualizado: agora, fonte: env.FINNHUB_TOKEN ? "Finnhub e Yahoo Finance" : "Yahoo Finance", acoes, etfs, indices, pendentes, semDado };
  if (erros.length) doc.erros = erros.slice(0, 10);
  await env.DB.prepare(
    "INSERT INTO docs (collection, id, data, coletado) VALUES ('meta', 'eua', ?1, ?2) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, coletado = excluded.coletado, atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
  ).bind(JSON.stringify(doc), agora).run();
  const novosIndices = indices.filter((x) => dados.has(x.t));
  if (novosIndices.length) {
    await mesclarLetreiro(env, novosIndices.map((x) => ({ id: x.id, nome: x.nome, valor: x.preco, variacao: x.var, unidade: "pts", casas: 0, fonte: "Yahoo Finance", pais: "US", data: x.quando || "" })));
  }
  return { acoes: acoes.length, etfs: etfs.length, indices: indices.length, novos: dados.size, pendentes: pendentes.length, semDado: semDado.length, erros: erros.length };
}

async function gravarErro(env, e) {
  await env.DB.prepare("INSERT INTO docs (collection, id, data) VALUES ('_sistema', 'eua-erro', ?1) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
    .bind(JSON.stringify({ quando: new Date().toISOString(), erro: String((e && e.message) || e) })).run();
}

// Chamado pelo cron a cada minuto:
// - a cada 30 min durante o pregão de Nova York (9h30 às 16h, que dá 14h30 às 21h UTC no inverno de lá);
// - uma vez às 16h35 de Nova York (21h35 UTC no inverno), para pegar o fechamento;
// - a cada 10 min enquanto meta/eua não existir;
// - o que ficou em `pendentes` (429 ou o teto da Finnhub) a cada 5 min, ou a cada minuto com a Finnhub.
export async function cronEua(env, quando) {
  const d = new Date(quando), m = d.getUTCMinutes(), ny = horaNY(d);
  const util = ny.dia >= 1 && ny.dia <= 5;
  const noPregao = pregaoEuaAberto(d) && m % 30 === 8;
  const fechamento = util && ny.min === 16 * 60 + 35;
  let so = null, rodar = noPregao || fechamento;
  if (!rodar && m % 10 === 8) rodar = !(await env.DB.prepare("SELECT 1 FROM docs WHERE collection = 'meta' AND id = 'eua'").first());
  if (!rodar && (env.FINNHUB_TOKEN || m % 5 === 3)) {
    const atual = await lerEua(env);
    if (atual && Array.isArray(atual.pendentes) && atual.pendentes.length) { so = atual.pendentes; rodar = true; }
  }
  if (!rodar) return null;
  try { return await atualizarEua(env, { so }); }
  catch (e) { await gravarErro(env, e); throw e; }
}
