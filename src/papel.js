// Ficha do papel (ações da B3, BDRs e ações dos EUA): um doc por papel na collection `hist`, id "US:NVDA",
// "BR:PETR4" ou "BR:NVDC34", buscado quando alguém abre a ficha e válido por 24 h.
//
// Fontes:
// - Yahoo Finance, gráfico v8 de 1 ano (range=1y&interval=1d&events=div), sem chave, para os dois mercados. Mesmo fetch, mesmo
//   user-agent e a mesma ordem query2 -> query1 de src/eua.js. Na B3 o símbolo leva ".SA" (PETR4.SA, NVDC34.SA).
//   Dá preço, fechamento anterior, faixa do dia e de 52 semanas, volume, nome, bolsa e a série diária do ano.
// - brapi (/api/quote/<PAPEL>?fundamental=true&dividends=true), só com o secret BRAPI_TOKEN, para ações e BDRs da B3:
//   valor de mercado, LPA, P/L e os dividendos pagos nos últimos 12 meses. Uma chamada por ficha (plano grátis é
//   1 papel por chamada). A primeira resposta vai crua, resumida, para _sistema/sonda-brapi-quote.
// - Finnhub (/stock/metric, /stock/profile2 e /calendar/earnings), só com o secret FINNHUB_TOKEN, para os EUA:
//   P/L, LPA, P/VP, beta, valor de mercado, ações em circulação, yield, indústria, site e o próximo balanço.
// - Sem token: setor da B3 pelo `setor` que a lista da brapi já grava em meta/b3; setor dos EUA pelo mapa SETOR_US
//   (src/eua.js); valor de mercado da B3 pelo `cap` da mesma lista.
//
// O que não veio fica em `faltando` e a página mostra "–".

import { buscar, Limite, simboloYahoo, SETOR_US, ACOES, ETFS } from "./eua.js";
import { NOME_BDR } from "./bdr.js";

export const ID_OK = /^(US|BR):[A-Z0-9.\-]{1,10}$/;
export const VALIDADE_MS = 24 * 3600_000;
const TIMEOUT_ROTA = 10_000;
const BUSCAS_POR_HORA = 30;
const DIA = 86_400_000;

// Campos que a ficha mostra nas estatísticas e no perfil; o que ficar nulo entra em `faltando`.
const CAMPOS = ["prevClose", "abertura", "vol", "volMedio3m", "varAno", "var1a", "cap", "acoesCirc", "lpa", "pl", "pvp", "dividendo12m", "dy", "beta",
  "setor", "industria", "funcionarios", "site", "descricao", "proximoBalanco"];
// Os que só a Finnhub traz nos EUA (a página avisa o admin com "Precisa do token do Finnhub").
export const SO_FINNHUB = ["cap", "acoesCirc", "lpa", "pl", "pvp", "dividendo12m", "dy", "beta", "funcionarios", "site", "descricao", "proximoBalanco"];
export const SO_BRAPI = ["lpa", "pl", "pvp", "dividendo12m", "dy", "descricao", "funcionarios", "site"];

const num = (v) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const arred = (v, c = 4) => (v === null || v === undefined ? null : Math.round(v * 10 ** c) / 10 ** c);
const pct = (a, b) => (a != null && b ? arred((a / b - 1) * 100, 2) : null);
const texto = (s, max) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : t; };
const siteOk = (u) => (/^https?:\/\/[^\s"<>]+$/i.test(String(u || "").trim()) ? String(u).trim() : "");

// ---------- leitura das fontes (funções puras, testadas em Node) ----------

// Data local da bolsa (AAAA-MM-DD) a partir do timestamp e do gmtoffset que o próprio Yahoo manda.
const dataLocal = (t, off) => new Date((t + (off || 0)) * 1000).toISOString().slice(0, 10);
// Fechamento no último pregão até a data (inclusive). Série em ordem crescente.
function ateData(serie, data) {
  let r = null;
  for (const p of serie) { if (p[0] <= data) r = p; else break; }
  return r;
}
const menosMeses = (data, m) => { const d = new Date(data + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() - m); return d.toISOString().slice(0, 10); };

// Resposta do gráfico v8 de 1 ano -> campos de preço da ficha. null se não houver preço.
export function lerChart1a(j, mercado) {
  const res = j && j.chart && Array.isArray(j.chart.result) ? j.chart.result[0] : null;
  if (!res || !res.meta) return null;
  const m = res.meta;
  const preco = num(m.regularMarketPrice);
  if (preco === null || preco <= 0) return null;
  const off = num(m.gmtoffset) || 0;
  const q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
  const ts = Array.isArray(res.timestamp) ? res.timestamp : [];
  const col = (k, i) => (Array.isArray(q[k]) ? num(q[k][i]) : null);
  // Dias com fechamento nulo (feriado, papel sem negócio) saem da série
  const barras = ts.map((t, i) => ({ dia: dataLocal(t, off), o: col("open", i), h: col("high", i), l: col("low", i), c: col("close", i), v: col("volume", i) }))
    .filter((b) => b.c !== null && b.c > 0);
  // Uma barra por dia: o Yahoo às vezes repete o pregão corrente no fim
  const porDia = new Map();
  for (const b of barras) porDia.set(b.dia, b);
  const dias = [...porDia.values()].sort((a, b) => (a.dia < b.dia ? -1 : 1));
  const hoje = m.regularMarketTime ? dataLocal(m.regularMarketTime, off) : dias.length ? dias[dias.length - 1].dia : "";
  const doDia = dias.length && dias[dias.length - 1].dia === hoje ? dias[dias.length - 1] : null;
  const antes = dias.filter((b) => b.dia < hoje);
  const prevClose = num(m.previousClose) ?? (antes.length ? antes[antes.length - 1].c : null) ?? num(m.chartPreviousClose);
  // A série termina no preço atual: o último ponto é hoje com o preço da hora
  const fechamentos = dias.map((b) => [b.dia, arred(b.c)]);
  if (hoje && (!fechamentos.length || fechamentos[fechamentos.length - 1][0] < hoje)) fechamentos.push([hoje, arred(preco)]);
  else if (fechamentos.length && fechamentos[fechamentos.length - 1][0] === hoje) fechamentos[fechamentos.length - 1][1] = arred(preco);
  const vols = dias.map((b) => b.v).filter((v) => v !== null && v > 0);
  const ult63 = vols.slice(-63);
  const altas = dias.map((b) => b.h ?? b.c), baixas = dias.map((b) => b.l ?? b.c);
  const base = (d) => { const p = d ? ateData(fechamentos, d) : null; return p ? p[1] : null; };
  // Variação em 1 ano: se a série começa depois da data (papel novo ou range curto), usa o primeiro ponto só se estiver a até 10 dias
  const umAno = menosMeses(hoje, 12);
  let base1a = base(umAno);
  if (base1a === null && fechamentos.length && Date.parse(fechamentos[0][0]) - Date.parse(umAno) <= 10 * DIA) base1a = fechamentos[0][1];
  const fimAnoPassado = hoje ? String(Number(hoje.slice(0, 4)) - 1) + "-12-31" : "";
  const bolsaYahoo = String(m.exchangeName || m.fullExchangeName || "");
  const out = {
    mercado, moeda: m.currency || (mercado === "US" ? "USD" : "BRL"),
    nome: texto(m.longName || m.shortName || "", 120), bolsa: bolsaYahoo,
    preco: arred(preco), prevClose: arred(prevClose), var: pct(preco, prevClose),
    abertura: arred(doDia ? doDia.o : null),
    maxDia: arred(num(m.regularMarketDayHigh) ?? (doDia ? doDia.h : null)), minDia: arred(num(m.regularMarketDayLow) ?? (doDia ? doDia.l : null)),
    vol: num(m.regularMarketVolume) ?? (doDia ? doDia.v : null),
    volMedio3m: ult63.length ? Math.round(ult63.reduce((a, b) => a + b, 0) / ult63.length) : null,
    max52: arred(num(m.fiftyTwoWeekHigh) ?? (altas.length ? Math.max(...altas, preco) : null)),
    min52: arred(num(m.fiftyTwoWeekLow) ?? (baixas.length ? Math.min(...baixas, preco) : null)),
    var1m: pct(preco, base(menosMeses(hoje, 1))), var3m: pct(preco, base(menosMeses(hoje, 3))), var1a: pct(preco, base1a),
    varAno: pct(preco, base(fimAnoPassado)),
    quando: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : "",
    fechamentos,
  };
  // Pré-abertura e pós-mercado: só EUA e só quando o Yahoo manda (com range=1y normalmente não manda)
  if (mercado === "US") {
    const pre = num(m.preMarketPrice), pos = num(m.postMarketPrice);
    if (pre) out.pre = { preco: arred(pre), var: num(m.preMarketChangePercent) !== null ? arred(num(m.preMarketChangePercent), 2) : pct(pre, preco) };
    if (pos) out.pos = { preco: arred(pos), var: num(m.postMarketChangePercent) !== null ? arred(num(m.postMarketChangePercent), 2) : pct(pos, preco) };
  }
  const divs = lerDividendosYahoo(res, off);
  if (divs) out.divYahoo = divs;
  return out;
}
// Proventos do gráfico (events=div): { "<ts>": { amount, date } }. Devolve a soma dos últimos 12 meses, o último valor
// e a data dele, ou null. É o que FI-Infra e Fiagro têm de rendimento (não entregam o informe de FII na CVM).
export function lerDividendosYahoo(res, off = 0, agora = Date.now()) {
  const ev = res && res.events && res.events.dividends;
  if (!ev || typeof ev !== "object") return null;
  const l = Object.values(ev).map((d) => ({ t: num(d && d.date), v: num(d && d.amount) })).filter((d) => d.t && d.v !== null && d.v > 0).sort((a, b) => a.t - b.t);
  if (!l.length) return null;
  const corte = agora / 1000 - 365 * 86400;
  const doAno = l.filter((d) => d.t >= corte);
  const ult = l[l.length - 1];
  return { soma12: arred(doAno.reduce((s, d) => s + d.v, 0), 4), n12: doAno.length, ult: arred(ult.v, 4), ultData: dataLocal(ult.t, off) };
}

// brapi /api/quote/<papel>?fundamental=true&dividends=true -> fundamentos. `preco` para calcular o yield.
// Nomes dos campos conferidos pela documentação da brapi; a sonda _sistema/sonda-brapi-quote guarda a primeira resposta real.
export function lerBrapiQuote(j, preco, agora = Date.now()) {
  const x = j && Array.isArray(j.results) ? j.results[0] : null;
  if (!x) return {};
  const out = {};
  const cap = num(x.marketCap); if (cap) out.cap = cap;
  const lpa = num(x.earningsPerShare); if (lpa !== null) out.lpa = arred(lpa, 4);
  const pl = num(x.priceEarnings); if (pl !== null) out.pl = arred(pl, 2);
  const ks = x.defaultKeyStatistics || {};
  const pvp = num(x.priceToBook) ?? num(ks.priceToBook);
  const vpa = num(x.bookValuePerShare) ?? num(ks.bookValue);
  const p = num(preco) ?? num(x.regularMarketPrice);
  if (pvp !== null) out.pvp = arred(pvp, 2); else if (vpa && p) out.pvp = arred(p / vpa, 2);
  const acoes = num(ks.sharesOutstanding) ?? num(x.sharesOutstanding);
  if (acoes) out.acoesCirc = acoes;
  const beta = num(ks.beta) ?? num(x.beta); if (beta !== null) out.beta = arred(beta, 2);
  const divs = x.dividendsData && Array.isArray(x.dividendsData.cashDividends) ? x.dividendsData.cashDividends : null;
  if (divs) {
    const corte = agora - 365 * DIA;
    let soma = 0;
    for (const d of divs) {
      const t = Date.parse(d.paymentDate || d.lastDatePrior || "");
      const v = num(d.rate);
      if (!isNaN(t) && t >= corte && t <= agora && v !== null && v > 0) soma += v;
    }
    out.dividendo12m = arred(soma, 4);
    if (p) out.dy = arred((soma / p) * 100, 2);
  }
  const perfil = x.summaryProfile || {};
  if (perfil.longBusinessSummary) out.descricao = texto(perfil.longBusinessSummary, 400);
  if (num(perfil.fullTimeEmployees)) out.funcionarios = num(perfil.fullTimeEmployees);
  if (siteOk(perfil.website)) out.site = siteOk(perfil.website);
  if (perfil.industry) out.industria = texto(perfil.industry, 80);
  return out;
}

// Finnhub: metric (metric.*), profile2 e calendar/earnings -> fundamentos dos EUA.
export function lerFinnhub(metric, perfil, balancos, hoje = new Date().toISOString().slice(0, 10)) {
  const m = (metric && metric.metric) || {};
  const out = {};
  const pl = num(m.peTTM) ?? num(m.peBasicExclExtraTTM) ?? num(m.peExclExtraTTM); if (pl !== null) out.pl = arred(pl, 2);
  const lpa = num(m.epsTTM) ?? num(m.epsBasicExclExtraItemsTTM) ?? num(m.epsExclExtraItemsTTM); if (lpa !== null) out.lpa = arred(lpa, 4);
  const pvp = num(m.pbQuarterly) ?? num(m.pbAnnual); if (pvp !== null) out.pvp = arred(pvp, 2);
  const beta = num(m.beta); if (beta !== null) out.beta = arred(beta, 2);
  const cap = num(m.marketCapitalization); if (cap) out.cap = Math.round(cap * 1e6);
  const dy = num(m.dividendYieldIndicatedAnnual) ?? num(m.currentDividendYieldTTM); if (dy !== null) out.dy = arred(dy, 2);
  const div = num(m.dividendPerShareTTM) ?? num(m.dividendPerShareAnnual); if (div !== null) out.dividendo12m = arred(div, 4);
  if (num(m["52WeekHigh"])) out._max52 = num(m["52WeekHigh"]);
  if (num(m["52WeekLow"])) out._min52 = num(m["52WeekLow"]);
  const p = perfil || {};
  if (p.finnhubIndustry) out.industria = texto(p.finnhubIndustry, 80);
  if (siteOk(p.weburl)) out.site = siteOk(p.weburl);
  if (num(p.shareOutstanding)) out.acoesCirc = Math.round(num(p.shareOutstanding) * 1e6);
  if (num(p.employeeTotal)) out.funcionarios = num(p.employeeTotal);
  if (p.exchange) out._bolsaLonga = texto(p.exchange, 80);
  const lista = balancos && Array.isArray(balancos.earningsCalendar) ? balancos.earningsCalendar : [];
  const prox = lista.map((e) => String(e.date || "")).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= hoje).sort()[0];
  if (prox) out.proximoBalanco = prox;
  return out;
}

// ---------- busca ----------

// Fetch falso para o wrangler dev (DEV_FETCH_FALSO=1, só junto com DEV_EMAIL): série sintética e determinística,
// 600 ms de atraso para dar para testar a trava. Papel com "ERRO" no nome responde 500.
export const chamadasFalsas = { n: 0 };
function serieFalsa(sim) {
  let h = 0; for (const c of sim) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const base = 20 + (h % 300), agora = Math.floor(Date.now() / 1000), ts = [], open = [], high = [], low = [], close = [], volume = [];
  let v = base;
  for (let k = 364; k >= 0; k--) {
    const t = agora - k * 86400, d = new Date(t * 1000).getUTCDay();
    if (d === 0 || d === 6) continue;
    v = Math.max(1, v * (1 + Math.sin((k + h) / 9) * 0.012 + ((k * 7 + h) % 11 - 5) / 900));
    ts.push(t); open.push(v * 0.995); high.push(v * 1.01); low.push(v * 0.99);
    close.push(k % 47 === 3 ? null : v); volume.push(k % 47 === 3 ? null : 1e6 + ((k * 13 + h) % 50) * 1e5);
  }
  const preco = close.filter(Boolean).pop();
  return { chart: { result: [{ meta: { currency: sim.endsWith(".SA") ? "BRL" : "USD", symbol: sim, exchangeName: sim.endsWith(".SA") ? "SAO" : "NMS", longName: sim.replace(".SA", "") + " Exemplo S.A.", regularMarketPrice: preco, previousClose: preco / 1.012, regularMarketDayHigh: preco * 1.01, regularMarketDayLow: preco * 0.985, regularMarketVolume: 2.3e6, regularMarketTime: ts[ts.length - 1], gmtoffset: sim.endsWith(".SA") ? -10800 : -18000 }, timestamp: ts, indicators: { quote: [{ open, high, low, close, volume }] } }] } };
}
async function fetchFalso(url) {
  chamadasFalsas.n++;
  await new Promise((r) => setTimeout(r, 600));
  const u = new URL(url);
  const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });
  if (/ERRO/.test(u.pathname)) return json({ erro: "falso" }, 500);
  if (u.host.includes("yahoo")) return json(serieFalsa(decodeURIComponent(u.pathname.split("/").pop())));
  if (u.host.includes("brapi")) return json({ results: [{ marketCap: 4.1e11, earningsPerShare: 6.2, priceEarnings: 5.9, dividendsData: { cashDividends: [{ paymentDate: new Date(Date.now() - 40 * DIA).toISOString(), rate: 1.1 }, { paymentDate: new Date(Date.now() - 200 * DIA).toISOString(), rate: 0.9 }] } }] });
  if (u.pathname.endsWith("/metric")) return json({ metric: { peTTM: 52.1, epsTTM: 3.9, pbQuarterly: 44.2, beta: 1.7, marketCapitalization: 4.9e6, dividendYieldIndicatedAnnual: 0.02, dividendPerShareTTM: 0.04 } });
  if (u.pathname.endsWith("/profile2")) return json({ finnhubIndustry: "Semiconductors", weburl: "https://www.nvidia.com/", shareOutstanding: 24300, exchange: "NASDAQ NMS - GLOBAL MARKET" });
  if (u.pathname.includes("/calendar/earnings")) return json({ earningsCalendar: [{ date: new Date(Date.now() + 20 * DIA).toISOString().slice(0, 10) }] });
  return json({}, 404);
}
const falso = (env) => String(env.DEV_FETCH_FALSO || "") === "1" && !!env.DEV_EMAIL;
async function pegarJson(env, url, headers) {
  const r = falso(env) ? await fetchFalso(url) : await buscar(url, headers);
  if (r.status === 429) throw new Limite("HTTP 429 em " + new URL(url).host);
  if (!r.ok) throw new Error("HTTP " + r.status + " em " + new URL(url).host);
  return r.json();
}

// Gráfico de 1 ano no Yahoo, query2 e depois query1.
async function yahoo1a(env, sim) {
  let ultimo = null, limites = 0;
  for (const host of ["query2", "query1"]) {
    try { return await pegarJson(env, `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sim)}?range=1y&interval=1d&events=div`); }
    catch (e) { ultimo = e; if (e.limite) limites++; if (/HTTP 404/.test(e.message)) return null; }
  }
  if (limites === 2) throw new Limite("Yahoo respondeu 429 para " + sim);
  throw ultimo || new Error("sem resposta para " + sim);
}

async function sondarBrapiQuote(env, papel, j) {
  try {
    if (await env.DB.prepare("SELECT 1 FROM docs WHERE collection = '_sistema' AND id = 'sonda-brapi-quote'").first()) return;
    const x = j && Array.isArray(j.results) ? j.results[0] : null;
    const amostra = { quando: new Date().toISOString(), papel, campos: x ? Object.keys(x) : [], chavesTopo: j ? Object.keys(j) : [],
      dividendos: x && x.dividendsData ? Object.keys(x.dividendsData) : [], umDividendo: x && x.dividendsData && x.dividendsData.cashDividends ? x.dividendsData.cashDividends[0] : null,
      corpo: JSON.stringify(j).slice(0, 2500) };
    await env.DB.prepare("INSERT INTO docs (collection, id, data) VALUES ('_sistema', 'sonda-brapi-quote', ?1) ON CONFLICT(collection, id) DO NOTHING").bind(JSON.stringify(amostra)).run();
  } catch (e) {}
}

async function lerMetaDoc(env, id) {
  try { const r = await env.DB.prepare("SELECT data FROM docs WHERE collection = 'meta' AND id = ?").bind(id).first(); return r ? JSON.parse(r.data) : null; } catch { return null; }
}

// Monta o doc `hist` de um papel nas fontes. Lança se o Yahoo falhar (é a fonte do preço).
export async function montarHist(env, id) {
  const [mercado, papel] = id.split(":");
  const sim = mercado === "US" ? simboloYahoo(papel) : papel + ".SA";
  const j = await yahoo1a(env, sim);
  const base = lerChart1a(j, mercado);
  if (!base) return null;
  const fontes = ["Yahoo Finance"], extra = {}, erros = [];
  if (mercado === "BR") {
    const b3 = await lerMetaDoc(env, "b3");
    const linha = b3 ? [...(b3.acoes || []), ...(b3.bdrs || []), ...(b3.etfs || []), ...(b3.fiis || []), ...(b3.fiinfra || []), ...(b3.fiagro || [])].find((x) => x.t === papel) : null;
    if (linha) {
      if (linha.setor) extra.setor = linha.setor;
      if (linha.cap) extra.cap = linha.cap;
      if (NOME_BDR[papel]) extra.nomeCurto = NOME_BDR[papel];
    }
    if (env.BRAPI_TOKEN) {
      try {
        const q = await pegarJson(env, `https://brapi.dev/api/quote/${encodeURIComponent(papel)}?fundamental=true&dividends=true`, { authorization: "Bearer " + env.BRAPI_TOKEN });
        await sondarBrapiQuote(env, papel, q);
        Object.assign(extra, lerBrapiQuote(q, base.preco));
        fontes.push("brapi");
      } catch (e) { erros.push("brapi: " + String(e.message || e).slice(0, 120)); }
    }
    // Proventos pelo Yahoo: o último pagamento sempre; os 12 meses só quando a brapi não trouxe (FI-Infra, Fiagro, sem token)
    const dv = base.divYahoo;
    if (dv) {
      extra.ultDiv = dv.ult; extra.ultDivData = dv.ultData;
      if (extra.dividendo12m == null && dv.n12) {
        extra.dividendo12m = dv.soma12;
        if (base.preco) extra.dy = arred((dv.soma12 / base.preco) * 100, 2);
        extra.fonteDiv = "Yahoo";
      }
    }
  } else {
    const s = SETOR_US[papel];
    if (s) { extra.setor = s[0]; extra.industria = s[1]; }
    if (ETFS[papel]) extra.etf = true;
    if (ACOES[papel] || ETFS[papel]) extra.nomeCurto = ACOES[papel] || ETFS[papel];
    if (env.FINNHUB_TOKEN) {
      const t = encodeURIComponent(env.FINNHUB_TOKEN), s2 = encodeURIComponent(papel);
      const hoje = new Date().toISOString().slice(0, 10), ate = new Date(Date.now() + 120 * DIA).toISOString().slice(0, 10);
      const [m, p, c] = await Promise.allSettled([
        pegarJson(env, `https://finnhub.io/api/v1/stock/metric?symbol=${s2}&metric=all&token=${t}`),
        pegarJson(env, `https://finnhub.io/api/v1/stock/profile2?symbol=${s2}&token=${t}`),
        pegarJson(env, `https://finnhub.io/api/v1/calendar/earnings?symbol=${s2}&from=${hoje}&to=${ate}&token=${t}`),
      ]);
      const v = (r) => (r.status === "fulfilled" ? r.value : null);
      for (const r of [m, p, c]) if (r.status === "rejected") erros.push("finnhub: " + String(r.reason && r.reason.message || r.reason).slice(0, 120));
      if (v(m) || v(p) || v(c)) {
        const f = lerFinnhub(v(m), v(p), v(c), hoje);
        if (base.max52 == null && f._max52) base.max52 = f._max52;
        if (base.min52 == null && f._min52) base.min52 = f._min52;
        delete f._max52; delete f._min52; delete f._bolsaLonga;
        // a indústria do mapa local fica quando a Finnhub não manda; a dela vem em inglês, então só entra se não houver a nossa
        if (extra.industria && f.industria) delete f.industria;
        Object.assign(extra, f);
        fontes.push("Finnhub");
      }
    }
  }
  const agora = new Date().toISOString();
  delete base.divYahoo;
  const doc = { atualizado: agora, papel, ...base, ...extra, fontes };
  doc.faltando = CAMPOS.filter((k) => doc[k] === null || doc[k] === undefined || doc[k] === "");
  if (erros.length) doc.erros = erros.slice(0, 4);
  return doc;
}

// ---------- gravação ----------

async function gravarHist(env, id, doc, gravarNoEspelho) {
  const data = JSON.stringify(doc), agora = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES ('hist', ?1, ?2, ?3, ?3) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, coletado = excluded.coletado, atualizado = excluded.atualizado"
  ).bind(id, data, agora).run();
  if (gravarNoEspelho) gravarNoEspelho(env, [{ collection: "hist", id, data, coletado: agora, atualizado: agora }]);
}

// Contagem do dia em _sistema/papel-contagem: { dia, buscas (página), cron }. Dia em UTC.
async function contar(env, campo) {
  const dia = new Date().toISOString().slice(0, 10);
  const novo = JSON.stringify({ dia, buscas: campo === "buscas" ? 1 : 0, cron: campo === "cron" ? 1 : 0 });
  try {
    await env.DB.prepare(
      `INSERT INTO docs (collection, id, data) VALUES ('_sistema', 'papel-contagem', ?1) ON CONFLICT(collection, id) DO UPDATE SET
         data = CASE WHEN json_extract(docs.data, '$.dia') = ?2 THEN json_set(docs.data, '$.${campo}', coalesce(json_extract(docs.data, '$.${campo}'), 0) + 1) ELSE excluded.data END,
         atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now')`
    ).bind(novo, dia).run();
  } catch (e) {}
}

// ---------- rota GET /api/papel?id=US:NVDA ----------

// Trava contra repetição: a busca em andamento de cada id, no isolate. Duas aberturas da mesma ficha esperam a mesma.
const emAndamento = new Map();
// Limite por pessoa: buscas novas na última hora, por e-mail, no isolate (janela deslizante simples).
const buscasPorEmail = new Map();
function podeBuscar(email) {
  const agora = Date.now();
  const l = (buscasPorEmail.get(email) || []).filter((t) => agora - t < 3600_000);
  if (buscasPorEmail.size > 1000) buscasPorEmail.clear();
  buscasPorEmail.set(email, l);
  return l.length < BUSCAS_POR_HORA;
}
const registrarBusca = (email) => { const l = buscasPorEmail.get(email) || []; l.push(Date.now()); buscasPorEmail.set(email, l); };
export const _limparTravas = () => { emAndamento.clear(); buscasPorEmail.clear(); };

// ler(id) -> doc ou null (espelho com D1 de reserva); gravarNoEspelho do src/espelho.js.
export async function rotaPapel(env, quem, id, { ler, gravarNoEspelho }) {
  const tokens = quem.admin ? { brapi: !!env.BRAPI_TOKEN, finnhub: !!env.FINNHUB_TOKEN } : undefined;
  let doc = null;
  try { doc = await ler(id); } catch (e) { doc = null; }
  const agora = Date.now();
  const fresco = doc && Date.now() - Date.parse(doc.atualizado || 0) < VALIDADE_MS;
  const extra = falso(env) ? { _dev: { chamadas: chamadasFalsas.n } } : {};
  if (fresco) {
    // Marca a abertura (para o cron renovar o que foi visto nos últimos 7 dias), no máximo a cada 6 h por papel
    if (!doc.ultimaAbertura || agora - Date.parse(doc.ultimaAbertura) > 6 * 3600_000) {
      const novo = { ...doc, ultimaAbertura: new Date(agora).toISOString() };
      const p = gravarHist(env, id, novo, gravarNoEspelho).catch((e) => console.error("hist", String(e.message || e)));
      if (env.ctx) env.ctx.waitUntil(p);
    }
    return { existe: true, id, data: doc, tokens, ...extra };
  }
  const velho = (erro) => (doc ? { existe: true, id, data: doc, velho: true, erro, tokens, ...extra } : { existe: false, id, erro, tokens, ...extra });
  let p = emAndamento.get(id);
  if (!p) {
    if (!podeBuscar(quem.email)) return velho("Muitas fichas novas na última hora. Tente de novo mais tarde.");
    registrarBusca(quem.email);
    p = (async () => {
      try {
        const novo = await montarHist(env, id);
        if (!novo) return { semDado: true };
        novo.ultimaAbertura = new Date().toISOString();
        await gravarHist(env, id, novo, gravarNoEspelho);
        await contar(env, "buscas");
        return { doc: novo };
      } finally { emAndamento.delete(id); }
    })();
    emAndamento.set(id, p);
    if (env.ctx) env.ctx.waitUntil(p.catch(() => {}));
  }
  let timer;
  try {
    const r = await Promise.race([p, new Promise((res) => { timer = setTimeout(() => res({ demorou: true }), TIMEOUT_ROTA); })]);
    if (r.demorou) return velho("A busca está demorando. Abra de novo em alguns segundos.");
    if (r.semDado) return velho("Sem dados para este papel na fonte.");
    return { existe: true, id, data: r.doc, tokens, ...(falso(env) ? { _dev: { chamadas: chamadasFalsas.n } } : {}) };
  } catch (e) {
    console.error("papel", id, String(e && e.message || e));
    return velho(e && e.limite ? "A fonte pediu uma pausa. Tente de novo em alguns minutos." : "Não deu para buscar os dados agora.");
  } finally { clearTimeout(timer); }
}

// ---------- cron e limpeza ----------

const LOTE = 10, PAUSA = 400, POR_HORA = 30;
// A cada hora (minuto 23): renova os `hist` vencidos que alguém abriu nos últimos 7 dias, em lotes de 10.
// Se o Yahoo responder 429, para e deixa o resto para a hora seguinte.
export async function cronPapel(env, quando, gravarNoEspelho) {
  if (new Date(quando).getUTCMinutes() !== 23) return null;
  const vencido = new Date(Date.now() - VALIDADE_MS).toISOString(), semana = new Date(Date.now() - 7 * DIA).toISOString();
  const { results } = await env.DB.prepare(
    "SELECT id FROM docs WHERE collection = 'hist' AND json_extract(data, '$.atualizado') < ?1 AND json_extract(data, '$.ultimaAbertura') >= ?2 ORDER BY json_extract(data, '$.ultimaAbertura') DESC LIMIT ?3"
  ).bind(vencido, semana, POR_HORA).all();
  const ids = results.map((r) => r.id).filter((id) => ID_OK.test(id));
  let feitos = 0, erros = 0, parou = false;
  for (let i = 0; i < ids.length && !parou; i += LOTE) {
    if (i) await new Promise((r) => setTimeout(r, PAUSA));
    const lote = ids.slice(i, i + LOTE);
    const res = await Promise.allSettled(lote.map(async (id) => {
      const antigo = await env.DB.prepare("SELECT data FROM docs WHERE collection = 'hist' AND id = ?").bind(id).first();
      const novo = await montarHist(env, id);
      if (!novo) return false;
      try { novo.ultimaAbertura = JSON.parse(antigo.data).ultimaAbertura; } catch (e) {}
      await gravarHist(env, id, novo, gravarNoEspelho);
      await contar(env, "cron");
      return true;
    }));
    for (const r of res) {
      if (r.status === "fulfilled") { if (r.value) feitos++; }
      else if (r.reason && r.reason.limite) parou = true;
      else erros++;
    }
  }
  return { candidatos: ids.length, feitos, erros, parou };
}

// Ids de `hist` que ninguém abre há mais de 30 dias (ou sem abertura e com dado de mais de 30 dias). Para limpar() em coleta.js.
export async function histParaApagar(env) {
  const corte = new Date(Date.now() - 30 * DIA).toISOString();
  const { results } = await env.DB.prepare(
    "SELECT id FROM docs WHERE collection = 'hist' AND coalesce(json_extract(data, '$.ultimaAbertura'), json_extract(data, '$.atualizado'), '') < ?1"
  ).bind(corte).all();
  return results.map((r) => r.id);
}
