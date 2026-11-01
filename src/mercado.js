// Painel de mercado da aba Investimentos. Sem IA: o cron busca cotações e indicadores em APIs públicas
// e grava em meta/mercado. Cada indicador guarda o último valor bom; se uma fonte falhar, o anterior fica.
//
// Fontes:
// - AwesomeAPI (economia.awesomeapi.com.br): dólar, euro, bitcoin e ether em reais. Grátis, sem chave.
// - Banco Central, SGS (api.bcb.gov.br): Selic meta (432), CDI anualizado (4389) e IPCA em 12 meses (13522).
// - brapi.dev, só quando houver o secret BRAPI_TOKEN: Ibovespa. No plano grátis é 1 ticker por chamada
//   e a cotação muda a cada 30 minutos.

const TIMEOUT = 8000;

async function pegar(url, headers = {}) {
  const r = await fetch(url, { headers: { "user-agent": "LookoutBot/1.0", accept: "application/json", ...headers }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error("HTTP " + r.status + " em " + new URL(url).host + ": " + (await r.text()).slice(0, 200));
  return r.json();
}

const num = (v) => { const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
const isoDeBr = (d) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || ""); return m ? `${m[3]}-${m[2]}-${m[1]}` : ""; };

// A AwesomeAPI às vezes devolve 429 para os IPs compartilhados do Workers. Nesse caso o dólar e o euro vêm
// da PTAX do Banco Central (fechamento do dia, sem variação intradiária) e o bitcoin e o ether do CoinGecko.
async function moedas() {
  try { return await moedasAwesome(); } catch (e) {
    const out = [];
    try { out.push(...(await ptax())); } catch (e2) {}
    try { out.push(...(await criptoCoingecko())); } catch (e3) {
      try { out.push(...(await criptoMercadoBitcoin())); } catch (e4) {}
    }
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
async function criptoCoingecko() {
  const d = await pegar("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=brl&include_24hr_change=true");
  const um = (k, id, nome) => (d[k] ? { id, nome, valor: num(d[k].brl), variacao: num(d[k].brl_24h_change), unidade: "R$", casas: 0, fonte: "CoinGecko" } : null);
  return [um("bitcoin", "btc", "Bitcoin"), um("ethereum", "eth", "Ether")].filter(Boolean);
}
// Último recurso para cripto: API pública do Mercado Bitcoin (corretora brasileira), variação desde a abertura de 24 h.
async function criptoMercadoBitcoin() {
  const d = await pegar("https://api.mercadobitcoin.net/api/v4/tickers?symbols=BTC-BRL,ETH-BRL");
  const por = Object.fromEntries((Array.isArray(d) ? d : []).map((x) => [x.pair, x]));
  const um = (k, id, nome) => {
    const x = por[k]; if (!x) return null;
    const v = num(x.last), o = num(x.open);
    return v === null ? null : { id, nome, valor: v, variacao: o ? ((v - o) / o) * 100 : null, unidade: "R$", casas: 0, fonte: "Mercado Bitcoin" };
  };
  return [um("BTC-BRL", "btc", "Bitcoin"), um("ETH-BRL", "eth", "Ether")].filter(Boolean);
}
async function moedasAwesome() {
  const d = await pegar("https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,BTC-BRL,ETH-BRL");
  const um = (k, id, nome, unidade, casas) => {
    const x = d[k]; if (!x) return null;
    return { id, nome, valor: num(x.bid), variacao: num(x.pctChange), unidade, casas, fonte: "AwesomeAPI", data: (x.create_date || "").replace(" ", "T") };
  };
  return [um("USDBRL", "usd", "Dólar", "R$", 4), um("EURBRL", "eur", "Euro", "R$", 4), um("BTCBRL", "btc", "Bitcoin", "R$", 0), um("ETHBRL", "eth", "Ether", "R$", 0)].filter(Boolean);
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

// partes: { moedas, indicadores, bolsa }; o que não vier no pedido não é consultado.
export async function atualizarMercado(env, partes) {
  const antes = await lerPainel(env);
  const porId = new Map((antes.itens || []).map((i) => [i.id, i]));
  const erros = {};
  const tarefas = [];
  if (partes.moedas) tarefas.push(["moedas", moedas()]);
  if (partes.indicadores) tarefas.push(["indicadores", indicadores()]);
  if (partes.bolsa) tarefas.push(["bolsa", bolsa(env)]);
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
  const ORDEM = ["ibov", "usd", "eur", "selic", "cdi", "ipca", "btc", "eth"];
  const itens = [...porId.values()].sort((a, b) => ORDEM.indexOf(a.id) - ORDEM.indexOf(b.id));
  const painel = { atualizado: agora, itens, erros, temBolsa: !!env.BRAPI_TOKEN };
  await env.DB.prepare(
    "INSERT INTO docs (collection, id, data, coletado) VALUES ('meta', 'mercado', ?1, ?2) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, coletado = excluded.coletado, atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
  ).bind(JSON.stringify(painel), agora).run();
  return painel;
}

// Chamado pelo cron a cada minuto: moedas a cada 30 min, Ibovespa a cada 30 min no pregão, indicadores do BC duas vezes por dia.
export async function cronMercado(env, quando) {
  const d = new Date(quando);
  const m = d.getUTCMinutes(), h = d.getUTCHours();
  const meiaHora = m % 30 === 3;
  const partes = { moedas: meiaHora, bolsa: meiaHora && pregaoAberto(d), indicadores: m === 15 && (h === 12 || h === 22) };
  if (meiaHora && !partes.indicadores) {
    const antes = await lerPainel(env);
    if (!(antes.itens || []).some((i) => i.id === "selic")) partes.indicadores = true; // primeira vez ou falhou antes
  }
  if (partes.moedas || partes.bolsa || partes.indicadores) return atualizarMercado(env, partes);
  return null;
}

// Botão "Atualizar agora": no máximo uma consulta a cada 5 minutos, para todo mundo.
export async function pedirAtualizacao(env) {
  const antes = await lerPainel(env);
  const idade = Date.now() - Date.parse(antes.atualizado || 0);
  if (idade < 5 * 60_000) return { ...antes, aguarde: Math.ceil((5 * 60_000 - idade) / 1000) };
  try { await atualizarB3(env); } catch (e) {}
  return atualizarMercado(env, { moedas: true, bolsa: true, indicadores: !(antes.itens || []).some((i) => i.id === "selic") || idade > 6 * 3600_000 });
}


// Tabelas de ações e FIIs: a rota /api/quote/list da brapi responde sem token e traz a B3 inteira, uma chamada por tipo.
// Guardamos as mais negociadas em meta/b3. Não usamos os logos que a rota devolve (marcas das empresas).
async function listaB3(tipo, limite) {
  const d = await pegar(`https://brapi.dev/api/quote/list?type=${tipo}&sortBy=volume&sortOrder=desc&limit=${limite}`);
  return (d.stocks || []).map((x) => ({ t: x.stock, nome: x.name || x.stock, preco: num(x.close), var: num(x.change), vol: num(x.volume), cap: num(x.market_cap), setor: x.sector || "", sub: x.subType || "" }))
    .filter((x) => x.t && x.preco !== null);
}
export async function atualizarB3(env) {
  const [acoes, fundos] = await Promise.all([listaB3("stock", 120), listaB3("fund", 250)]);
  const fiis = fundos.filter((f) => f.sub !== "etf" && /11$/.test(f.t));
  const etfs = fundos.filter((f) => f.sub === "etf");
  const doc = { atualizado: new Date().toISOString(), acoes, fiis, etfs };
  await env.DB.prepare(
    "INSERT INTO docs (collection, id, data, coletado) VALUES ('meta', 'b3', ?1, ?2) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, coletado = excluded.coletado, atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
  ).bind(JSON.stringify(doc), doc.atualizado).run();
  return { acoes: acoes.length, fiis: fiis.length, etfs: etfs.length };
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
