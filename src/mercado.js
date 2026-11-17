// Painel de mercado da aba Investimentos. Sem IA: o cron busca cotações e indicadores em APIs públicas
// e grava em meta/mercado. Cada indicador guarda o último valor bom; se uma fonte falhar, o anterior fica.
//
// Fontes:
// - AwesomeAPI (economia.awesomeapi.com.br): dólar e euro em reais. Grátis, sem chave.
// - CoinGecko (api.coingecko.com): as principais moedas de cripto em reais, numa chamada só (veja CRIPTO abaixo).
//   Reservas para bitcoin e ether: AwesomeAPI e, por último, Mercado Bitcoin.
// - Banco Central, SGS (api.bcb.gov.br): Selic meta (432), CDI anualizado (4389) e IPCA em 12 meses (13522).
// - brapi.dev, só quando houver o secret BRAPI_TOKEN: Ibovespa. No plano grátis é 1 papel por chamada
//   e a cotação muda a cada 30 minutos.
// - S&P 500, Nasdaq e Dow Jones entram pelo cron dos EUA (src/eua.js), que chama mesclarLetreiro.

import { paisBdr, nomeBdr } from "./bdr.js";
import { atualizarEua } from "./eua.js";

const TIMEOUT = 8000;

async function pegar(url, headers = {}) {
  const r = await fetch(url, { headers: { "user-agent": "LookoutBot/1.0", accept: "application/json", ...headers }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error("HTTP " + r.status + " em " + new URL(url).host + ": " + (await r.text()).slice(0, 200));
  return r.json();
}

const num = (v) => { const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
const isoDeBr = (d) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || ""); return m ? `${m[3]}-${m[2]}-${m[1]}` : ""; };

// A AwesomeAPI às vezes devolve 429 para os IPs compartilhados do Workers. Nesse caso o dólar e o euro vêm
// da PTAX do Banco Central (fechamento do dia, sem variação intradiária). Cripto tem a parte própria (cripto() abaixo).
async function moedas() {
  try { return await moedasAwesome(); } catch (e) {
    let out = [];
    try { out = await ptax(); } catch (e2) {}
    if (!out.length) throw e;
    return out;
  }
}
async function ptax() {
  const um = async (cod, id, nome) => {
    const d = await pegar(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${cod}/dados/ultimos/2?formato=json`);
    const [a, b] = [d[d.length - 2], d[d.length - 1]];
    const v = num(b && b.valor), ant = num(a && a.valor);
    return v === null ? null : { id, nome, valor: v, variacao: ant ? ((v - ant) / ant) * 100 : null, unidade: "R$", casas: 4, fonte: "Banco Central (PTAX)", data: isoDeBr(b.data) };
  };
  return (await Promise.all([um(1, "usd", "Dólar"), um(21619, "eur", "Euro")])).filter(Boolean);
}
async function moedasAwesome() {
  const d = await pegar("https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL");
  const um = (k, id, nome) => {
    const x = d[k]; if (!x) return null;
    return { id, nome, valor: num(x.bid), variacao: num(x.pctChange), unidade: "R$", casas: 4, fonte: "AwesomeAPI", data: (x.create_date || "").replace(" ", "T") };
  };
  return [um("USDBRL", "usd", "Dólar"), um("EURBRL", "eur", "Euro")].filter(Boolean);
}

// ---------- Cripto (pedido de 17/11) ----------
// As principais moedas numa chamada só ao CoinGecko, com variação de 24 h: [id no CoinGecko, id no painel, nome,
// sigla, casas]. Vão para meta/mercado em `cripto` (bloco "Cripto" da aba Investimentos), nesta ordem. O letreiro
// (`itens`) continua só com bitcoin e ether.
export const CRIPTO = [
  ["bitcoin", "btc", "Bitcoin", "BTC", 0],
  ["ethereum", "eth", "Ether", "ETH", 0],
  ["solana", "sol", "Solana", "SOL", 2],
  ["binancecoin", "bnb", "BNB", "BNB", 2],
  ["ripple", "xrp", "XRP", "XRP", 2],
  ["cardano", "ada", "Cardano", "ADA", 3],
  ["dogecoin", "doge", "Dogecoin", "DOGE", 3],
  ["tether", "usdt", "Tether", "USDT", 3],
];
export const URL_COINGECKO = "https://api.coingecko.com/api/v3/simple/price?ids=" + CRIPTO.map((c) => c[0]).join(",") +
  "&vs_currencies=brl&include_24hr_change=true&include_last_updated_at=true";
const NO_LETREIRO = new Set(["btc", "eth"]);
const posCripto = (id) => { const i = CRIPTO.findIndex((c) => c[1] === id); return i < 0 ? CRIPTO.length : i; };

// Resposta do CoinGecko -> itens do painel. Moeda que não veio, ou veio sem preço, fica de fora (sem buraco).
export function lerCoingecko(d) {
  const out = [];
  for (const [cg, id, nome, sigla, casas] of CRIPTO) {
    const x = d && d[cg];
    const v = x ? num(x.brl) : null;
    if (v === null || v <= 0) continue;
    const t = x.last_updated_at ? new Date(Number(x.last_updated_at) * 1000) : null;
    out.push({ id, nome, sigla, valor: v, variacao: num(x.brl_24h_change), unidade: "R$", casas, fonte: "CoinGecko", data: t && !isNaN(t) ? t.toISOString() : "" });
  }
  return out;
}
// Última reserva, só bitcoin e ether: AwesomeAPI.
async function criptoAwesome() {
  const d = await pegar("https://economia.awesomeapi.com.br/json/last/BTC-BRL,ETH-BRL");
  const um = (k, id, nome, sigla) => {
    const x = d[k], v = x ? num(x.bid) : null;
    return v === null ? null : { id, nome, sigla, valor: v, variacao: num(x.pctChange), unidade: "R$", casas: 0, fonte: "AwesomeAPI", data: (x.create_date || "").replace(" ", "T") };
  };
  return [um("BTCBRL", "btc", "Bitcoin", "BTC"), um("ETHBRL", "eth", "Ether", "ETH")].filter(Boolean);
}
// Mercado Bitcoin (corretora brasileira, API pública em reais): todas as moedas de CRIPTO numa chamada, variação desde
// a abertura de 24 h. É a reserva principal: o CoinGecko recusa com 429 boa parte dos pedidos que saem do Worker
// (visto em produção em 17/11). Par que a corretora não negocia simplesmente não vem.
export const URL_MERCADO_BITCOIN = "https://api.mercadobitcoin.net/api/v4/tickers?symbols=" + CRIPTO.map((c) => c[3] + "-BRL").join(",");
export function lerMercadoBitcoin(d) {
  const por = Object.fromEntries((Array.isArray(d) ? d : []).map((x) => [x.pair, x]));
  const out = [];
  for (const [, id, nome, sigla, casas] of CRIPTO) {
    const x = por[sigla + "-BRL"]; if (!x) continue;
    const v = num(x.last), o = num(x.open);
    if (v === null || v <= 0) continue;
    const t = x.date ? new Date(Number(x.date) * 1000) : null;
    out.push({ id, nome, sigla, valor: v, variacao: o ? ((v - o) / o) * 100 : null, unidade: "R$", casas, fonte: "Mercado Bitcoin", data: t && !isNaN(t) ? t.toISOString() : "" });
  }
  return out;
}
async function criptoMercadoBitcoin() {
  try { return lerMercadoBitcoin(await pegar(URL_MERCADO_BITCOIN)); }
  catch (e) { return lerMercadoBitcoin(await pegar("https://api.mercadobitcoin.net/api/v4/tickers?symbols=BTC-BRL,ETH-BRL")); } // se um par da lista derrubar o pedido
}
// Devolve { lista, erro }. Normal: um pedido só (CoinGecko). Se ele falhar ou vier incompleto, o Mercado Bitcoin
// completa o que faltou (qualquer moeda da lista); se ainda faltar bitcoin ou ether, a AwesomeAPI. Lança quando nada
// veio, para o painel manter o último valor bom.
export async function cripto() {
  let lista = [], erro = "";
  try { lista = lerCoingecko(await pegar(URL_COINGECKO)); if (!lista.length) erro = "CoinGecko: resposta sem moedas"; }
  catch (e) { erro = "CoinGecko: " + String(e.message || e).slice(0, 200); }
  const tem = new Set(lista.map((i) => i.id));
  const completar = (reserva) => { for (const r of reserva) if (!tem.has(r.id)) { lista.push(r); tem.add(r.id); } };
  if (tem.size < CRIPTO.length) { try { completar(await criptoMercadoBitcoin()); } catch (e) {} }
  if (!tem.has("btc") || !tem.has("eth")) { try { completar(await criptoAwesome()); } catch (e) {} }
  lista.sort((a, b) => posCripto(a.id) - posCripto(b.id));
  if (!lista.length) throw new Error(erro || "cripto: nenhuma fonte respondeu");
  return { lista, erro };
}

async function serieBcb(codigo) {
  const d = await pegar(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados/ultimos/1?formato=json`);
  const x = Array.isArray(d) ? d[d.length - 1] : null;
  return x ? { valor: num(x.valor), data: isoDeBr(x.data) } : null;
}

async function indicadores() {
  const lista = [["selic", "Selic", 432], ["cdi", "CDI", 4389], ["ipca", "IPCA 12 meses", 13522]];
  const out = [];
  for (const [id, nome, cod] of lista) {
    try {
      const s = await serieBcb(cod);
      if (s && s.valor !== null) out.push({ id, nome, valor: s.valor, unidade: "% a.a.", casas: 2, fonte: "Banco Central", data: s.data });
    } catch (e) { out.push({ id, erro: String(e.message || e) }); }
  }
  return out;
}

async function bolsa(env) {
  if (!env.BRAPI_TOKEN) return [];
  const d = await pegar("https://brapi.dev/api/quote/%5EBVSP", { authorization: "Bearer " + env.BRAPI_TOKEN });
  const x = d && d.results && d.results[0];
  if (!x) return [];
  return [{ id: "ibov", nome: "Ibovespa", valor: num(x.regularMarketPrice), variacao: num(x.regularMarketChangePercent), unidade: "pts", casas: 0, fonte: "brapi", data: x.regularMarketTime || "" }];
}

// Pregão da B3: segunda a sexta, 10h às 18h10 em Brasília (13h às 21h10 UTC, sem horário de verão).
const pregaoAberto = (d) => { const dia = d.getUTCDay(), m = d.getUTCHours() * 60 + d.getUTCMinutes(); return dia >= 1 && dia <= 5 && m >= 13 * 60 && m <= 21 * 60 + 10; };

async function lerPainel(env) {
  const r = await env.DB.prepare("SELECT data FROM docs WHERE collection = 'meta' AND id = 'mercado'").first();
  return r ? JSON.parse(r.data) : { itens: [] };
}

// partes: { moedas, indicadores, bolsa, cripto }; o que não vier no pedido não é consultado.
export async function atualizarMercado(env, partes) {
  const antes = await lerPainel(env);
  const porId = new Map((antes.itens || []).map((i) => [i.id, i]));
  const erros = {};
  const tarefas = [];
  if (partes.moedas) tarefas.push(["moedas", moedas()]);
  if (partes.indicadores) tarefas.push(["indicadores", indicadores()]);
  if (partes.bolsa) tarefas.push(["bolsa", bolsa(env)]);
  const pCripto = partes.cripto ? cripto() : null;
  if (pCripto) pCripto.catch(() => {}); // o erro é tratado lá embaixo; isto só evita rejeição solta enquanto as outras partes rodam
  const agora = new Date().toISOString();
  for (const [nome, p] of tarefas) {
    try {
      for (const i of await p) {
        if (i.erro) { erros[i.id] = i.erro; continue; }
        if (i.valor === null || i.valor === undefined) continue;
        porId.set(i.id, { ...i, lido: agora });
      }
    } catch (e) { erros[nome] = String(e.message || e); }
  }
  // Cripto: a lista inteira troca de uma vez (com o CoinGecko fora, fica só o que a reserva trouxe); bitcoin e ether
  // também vão para o letreiro. Se nada veio, a lista anterior fica.
  let listaCripto = Array.isArray(antes.cripto) ? antes.cripto : undefined;
  if (pCripto) {
    try {
      const { lista, erro } = await pCripto;
      listaCripto = lista.map((i) => ({ ...i, lido: agora }));
      for (const i of listaCripto) if (NO_LETREIRO.has(i.id)) { const { sigla, ...noLetreiro } = i; porId.set(i.id, noLetreiro); }
      if (erro) erros.cripto = erro;
    } catch (e) { erros.cripto = String(e.message || e); }
  }
  const painel = { atualizado: agora, itens: ordenarLetreiro([...porId.values()]), erros, temBolsa: !!env.BRAPI_TOKEN };
  if (listaCripto) painel.cripto = listaCripto;
  await gravarPainel(env, painel, agora);
  return painel;
}

// Ordem do letreiro: bolsa daqui, bolsas americanas, moedas, juros e cripto. O que não estiver na lista vai para o fim.
const ORDEM = ["ibov", "ifix", "spx", "nasdaq", "dow", "usd", "eur", "selic", "cdi", "ipca", "btc", "eth"];
const posicao = (id) => { const i = ORDEM.indexOf(id); return i < 0 ? ORDEM.length : i; };
const ordenarLetreiro = (itens) => itens.sort((a, b) => posicao(a.id) - posicao(b.id));
function gravarPainel(env, painel, quando) {
  return env.DB.prepare(
    "INSERT INTO docs (collection, id, data, coletado) VALUES ('meta', 'mercado', ?1, ?2) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, coletado = excluded.coletado, atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
  ).bind(JSON.stringify(painel), quando).run();
}

// Põe ou troca itens no letreiro sem mexer no resto (usado pelos índices americanos). Não muda `atualizado`,
// que é o relógio do botão "Atualizar agora".
export async function mesclarLetreiro(env, novos) {
  const antes = await lerPainel(env);
  const porId = new Map((antes.itens || []).map((i) => [i.id, i]));
  const agora = new Date().toISOString();
  for (const i of novos) if (i.valor !== null && i.valor !== undefined) porId.set(i.id, { ...i, lido: agora });
  const painel = { ...antes, itens: ordenarLetreiro([...porId.values()]) };
  await gravarPainel(env, painel, agora);
  return painel;
}

// Chamado pelo cron a cada minuto: moedas a cada 30 min, Ibovespa a cada 30 min no pregão, indicadores do BC duas vezes por dia.
// Cripto também a cada 30 min, mas nos minutos 16 e 46, em que nenhuma outra parte de mercado, B3, EUA, CVM ou
// Esportes consulta fora: o pedido do CoinGecko não se soma aos do minuto 3 (MINUTO_CRIPTO).
export const MINUTO_CRIPTO = 16;
export function partesDoMinuto(quando) {
  const d = new Date(quando);
  const m = d.getUTCMinutes(), h = d.getUTCHours();
  const meiaHora = m % 30 === 3;
  return { moedas: meiaHora, bolsa: meiaHora && pregaoAberto(d), indicadores: m === 15 && (h === 12 || h === 22), cripto: m % 30 === MINUTO_CRIPTO };
}
export async function cronMercado(env, quando) {
  const partes = partesDoMinuto(quando);
  const meiaHora = partes.moedas;
  if (meiaHora && !partes.indicadores) {
    const antes = await lerPainel(env);
    if (!(antes.itens || []).some((i) => i.id === "selic")) partes.indicadores = true; // primeira vez ou falhou antes
  }
  if (partes.moedas || partes.bolsa || partes.indicadores || partes.cripto) return atualizarMercado(env, partes);
  return null;
}

// Botão "Atualizar agora": no máximo uma consulta a cada 5 minutos, para todo mundo.
export async function pedirAtualizacao(env) {
  const antes = await lerPainel(env);
  const idade = Date.now() - Date.parse(antes.atualizado || 0);
  if (idade < 5 * 60_000) return { ...antes, aguarde: Math.ceil((5 * 60_000 - idade) / 1000) };
  try { await atualizarB3(env); } catch (e) {}
  // Os EUA levam uns 15 s (uma chamada por símbolo): seguem depois da resposta, e a página vê o resultado na próxima leitura.
  const eua = atualizarEua(env).catch((e) => console.error("eua", e));
  if (env.ctx && env.ctx.waitUntil) env.ctx.waitUntil(eua); else await eua;
  return atualizarMercado(env, { moedas: true, bolsa: true, cripto: true, indicadores: !(antes.itens || []).some((i) => i.id === "selic") || idade > 6 * 3600_000 });
}


// Tabelas de ações, FIIs, ETFs e BDRs: a rota /api/quote/list da brapi responde sem token e traz a B3 inteira, uma chamada por tipo.
// Guardamos as mais negociadas em meta/b3. Não usamos os logos que a rota devolve (marcas das empresas).
async function listaB3(tipo, limite, env) {
  const d = await pegar(`https://brapi.dev/api/quote/list?type=${tipo}&sortBy=volume&sortOrder=desc&limit=${limite}`);
  if (env && tipo === "bdr") await sondarBdr(env, d);
  return (d.stocks || []).map((x) => ({ t: x.stock, nome: x.name || x.stock, preco: num(x.close), var: num(x.change), vol: num(x.volume), cap: num(x.market_cap), setor: x.sector || "", sub: x.subType || "" }))
    .filter((x) => x.t && x.preco !== null);
}
// Na primeira carga de BDRs guarda uma amostra crua da resposta em _sistema/sonda-brapi-bdr, para conferir campos e subType.
async function sondarBdr(env, d) {
  try {
    if (await env.DB.prepare("SELECT 1 FROM docs WHERE collection = '_sistema' AND id = 'sonda-brapi-bdr'").first()) return;
    const lista = (d && d.stocks) || [];
    const amostra = { quando: new Date().toISOString(), total: lista.length, campos: lista[0] ? Object.keys(lista[0]) : [], subTypes: [...new Set(lista.map((x) => x.subType || ""))], primeiros: lista.slice(0, 5) };
    await env.DB.prepare("INSERT INTO docs (collection, id, data) VALUES ('_sistema', 'sonda-brapi-bdr', ?1) ON CONFLICT(collection, id) DO NOTHING").bind(JSON.stringify(amostra)).run();
  } catch (e) {}
}
// A lista "fund" da brapi mistura FIIs, FI-Infra, Fiagro, FIP e ETFs. O `subType` decide (valores conferidos em
// meta/b3 de produção em 03/11/2026: "fii" 114, "fi-infra" 19, "fi-agro" 14, "fip" 7, "" 1, e "etf" 95):
// - fiis: "fii", ou sem subType, com final 11 e com informe de FII na CVM (o único sem subType era o IBOV11, que fica de fora);
// - fiinfra: "fi-infra" e também "fip" (FIP-IE, os fundos de participação em infraestrutura: nenhum dos dois entrega o
//   informe mensal de FII, e o rendimento vem da ficha);
// - fiagro: "fi-agro" (ou "fiagro", se a brapi mudar a grafia);
// - etfs: "etf". O resto sai.
export const SUB_FIINFRA = new Set(["fi-infra", "fiinfra", "fip"]);
export const SUB_FIAGRO = new Set(["fi-agro", "fiagro"]);
export function separarFundos(fundos, cvm = new Set()) {
  const out = { fiis: [], fiinfra: [], fiagro: [], etfs: [] };
  for (const f of fundos || []) {
    const sub = String(f.sub || "").toLowerCase();
    if (sub === "etf") out.etfs.push(f);
    else if (SUB_FIINFRA.has(sub)) out.fiinfra.push(f);
    else if (SUB_FIAGRO.has(sub)) out.fiagro.push(f);
    else if (sub === "fii" || (!sub && /11$/.test(f.t) && cvm.has(f.t))) out.fiis.push(f);
  }
  return out;
}
// Papéis com informe de FII na CVM (chaves de meta/fii-resumo), para decidir os fundos sem subType
async function papeisCvm(env) {
  try {
    const { results } = await env.DB.prepare("SELECT j.key AS t FROM docs d, json_each(d.data, '$.fundos') j WHERE d.collection = 'meta' AND d.id = 'fii-resumo'").all();
    return new Set((results || []).map((r) => r.t));
  } catch { return new Set(); }
}
export async function atualizarB3(env) {
  // BDRs numa chamada à parte: se falharem, ações, FIIs e ETFs saem mesmo assim e os BDRs anteriores ficam.
  const [acoes, fundos, bdrsLidos, cvm] = await Promise.all([listaB3("stock", 120), listaB3("fund", 250), listaB3("bdr", 150, env).catch(() => null), papeisCvm(env)]);
  const { fiis, fiinfra, fiagro, etfs } = separarFundos(fundos, cvm);
  let bdrs = bdrsLidos ? bdrsLidos.map((x) => ({ ...x, nome: nomeBdr(x.t) || (x.nome !== x.t ? x.nome : x.t), pais: paisBdr(x.t) })) : null;
  if (!bdrs) {
    const r = await env.DB.prepare("SELECT data FROM docs WHERE collection = 'meta' AND id = 'b3'").first();
    try { bdrs = (r && JSON.parse(r.data).bdrs) || []; } catch { bdrs = []; }
  }
  const doc = { atualizado: new Date().toISOString(), acoes, fiis, fiinfra, fiagro, etfs, bdrs };
  await env.DB.prepare(
    "INSERT INTO docs (collection, id, data, coletado) VALUES ('meta', 'b3', ?1, ?2) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, coletado = excluded.coletado, atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
  ).bind(JSON.stringify(doc), doc.atualizado).run();
  return { acoes: acoes.length, fiis: fiis.length, fiinfra: fiinfra.length, fiagro: fiagro.length, etfs: etfs.length, bdrs: bdrs.length };
}
export async function cronB3(env, quando) {
  const d = new Date(quando), m = d.getUTCMinutes(), h = d.getUTCHours();
  const noPregao = pregaoAberto(d) && m % 30 === 5;
  const fechamento = h === 21 && m === 35 && d.getUTCDay() >= 1 && d.getUTCDay() <= 5;
  let vazio = false;
  if (!noPregao && !fechamento && m % 10 === 5) vazio = !(await env.DB.prepare("SELECT 1 FROM docs WHERE collection = 'meta' AND id = 'b3'").first());
  if (noPregao || fechamento || vazio) {
    try { return await atualizarB3(env); }
    catch (e) {
      await env.DB.prepare("INSERT INTO docs (collection, id, data) VALUES ('_sistema', 'b3-erro', ?1) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
        .bind(JSON.stringify({ quando: new Date().toISOString(), erro: String(e.message || e) })).run();
      throw e;
    }
  }
  return null;
}
