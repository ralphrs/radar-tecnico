// Cripto em Investimentos (pedido de 17/11): subtemas do tema cripto na lista e no filtro da página, cotações das
// principais moedas (CoinGecko numa chamada só, resposta cheia, parcial e a queda para a reserva de BTC e ETH),
// o ritmo do cron e os subreddits novos. Sem rede: o fetch é trocado aqui e o banco é o D1 em SQLite (test/d1-falso.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FEEDS, CRIPTO_PARA_SONDAR } from "../src/feeds.js";
import { REDDIT } from "../src/coleta.js";
import { CRIPTO, URL_COINGECKO, lerCoingecko, cripto, atualizarMercado, partesDoMinuto, MINUTO_CRIPTO } from "../src/mercado.js";
import { d1Falso } from "./d1-falso.mjs";

// ---------- página: temas de Investimentos, subDe e passaTema tirados do script de public/index.html ----------
const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const trecho = (ini, fim) => { const i = html.indexOf(ini); const j = html.indexOf(fim, i); assert.ok(i >= 0 && j > i, ini); return html.slice(i, j); };
const pagina = new Function(`
  ${trecho("const G = ", "\n")}
  ${trecho("const TEMAS_INVESTIMENTOS = ", "const TEMAS_ESPORTES = ")}
  let TEMAS = TEMAS_INVESTIMENTOS, GRUPO_DE = {}, TEMA = {};
  ${trecho("const grp = ", "const IC_VIDEO = ")}
  let temasSel = new Set(), subsSel = new Set();
  ${trecho("const subsDe = ", "function salvarTemas()")}
  GRUPO_DE = {}; TEMAS.forEach((g) => g.temas.forEach((t) => { GRUPO_DE[t] = g.id; }));
  TEMA = Object.fromEntries(TEMAS.map((t) => [t.id, t]));
  return { TEMAS, subDe, passaTema, grp, escolher: (temas, subs) => { temasSel = new Set(temas); subsSel = new Set(subs); } };
`)();

const IDS = ["bitcoin", "ethereum", "altcoins", "defi", "stablecoins", "etfs", "regulacao", "corretoras", "mercado"];
const PROIBIDO = /\b(ticker|recomend\w*|melhor(es)?|oportunidades?|barat[oa]s?)\b/i;

test("tema cripto: nove subtemas com os ids que a curadoria grava, no desenho dos outros temas", () => {
  const t = pagina.TEMAS.find((x) => x.id === "cripto");
  assert.deepEqual(t.temas, ["cripto"]);
  assert.deepEqual(t.subs.map((s) => s.id), IDS);
  assert.deepEqual(t.subs.map((s) => s.nome), ["Bitcoin", "Ethereum", "Outras moedas", "DeFi e tokenização", "Stablecoins e Drex", "ETFs e institucional", "Regulação e impostos", "Corretoras e segurança", "Mercado"]);
  for (const s of t.subs) { assert.doesNotMatch(s.nome, PROIBIDO); assert.ok(!s.nome.includes("—"), s.nome); }
  // mesmo formato de outro tema com subtemas (Bolsa e empresas)
  const bolsa = pagina.TEMAS.find((x) => x.id === "bolsa");
  assert.deepEqual(Object.keys(t).sort(), Object.keys(bolsa).sort());
});

test("filtro: item com subtema vai para o subgrupo; item antigo sem subtema fica no tema, fora dos subtemas, sem erro", () => {
  const com = { tema: "cripto", subtema: "regulacao" }, sem = { tema: "cripto" }, vazio = { tema: "cripto", subtema: "" }, estranho = { tema: "cripto", subtema: "nft" };
  assert.equal(pagina.grp(com), "cripto");
  assert.equal(pagina.subDe(com), "regulacao");
  for (const i of [sem, vazio, estranho]) { assert.equal(pagina.grp(i), "cripto"); assert.equal(pagina.subDe(i), "cripto", "cai em Outros"); }
  // "mercado" de cripto não se confunde com o "mercado" de Bolsa e empresas
  assert.equal(pagina.subDe({ tema: "cripto", subtema: "mercado" }), "mercado");
  assert.equal(pagina.grp({ tema: "bolsa", subtema: "mercado" }), "bolsa");
  // sem filtro: tudo passa
  pagina.escolher([], []);
  assert.ok([com, sem].every(pagina.passaTema));
  // só o tema Cripto: com e sem subtema passam, outro tema não
  pagina.escolher(["cripto"], []);
  assert.ok(pagina.passaTema(com) && pagina.passaTema(sem));
  assert.ok(!pagina.passaTema({ tema: "fiis" }));
  // tema Cripto com o subtema Regulação: só o item de regulação
  pagina.escolher(["cripto"], ["cripto:regulacao"]);
  assert.ok(pagina.passaTema(com));
  assert.ok(!pagina.passaTema(sem));
  assert.ok(!pagina.passaTema({ tema: "cripto", subtema: "bitcoin" }));
  // dois subtemas
  pagina.escolher(["cripto"], ["cripto:regulacao", "cripto:bitcoin"]);
  assert.ok(pagina.passaTema({ tema: "cripto", subtema: "bitcoin" }) && pagina.passaTema(com));
  pagina.escolher([], []);
});

test("textos da aba: vazio e rodapé citam cripto sem palavra proibida; a ressalva continua só no rodapé", () => {
  const inv = trecho("  investimentos: { id: \"investimentos\"", "  politica: {");
  const vazio = inv.match(/vazio: "([^"]+)"/)[1], rodape = inv.match(/rodape: "([^"]+)"/)[1];
  assert.match(vazio, /criptomoedas/);
  assert.match(vazio, /stablecoins/);
  assert.doesNotMatch(vazio + " " + rodape, /ticker|recomenda[^ç]|melhor|oportunidade|barat/i);
  assert.doesNotMatch(vazio, /recomendação/);
  assert.match(rodape, /Nada aqui é recomendação de investimento\./);
  assert.equal(html.split("Nada aqui é recomendação").length - 1, 1, "a frase aparece uma vez só na página");
  // bloco Cripto: seção própria, mesmo cartão das listas do pregão
  assert.match(html, /<section class="rankings cripto-cot" id="cripto-cot" aria-label="Cotações de cripto" hidden><\/section>/);
  const bloco = trecho("function renderCripto()", "/* Visões de Investimentos.");
  assert.match(bloco, /class: "rk-card"/);
  assert.match(bloco, /preço em reais · variação em 24 h/);
  assert.doesNotMatch(bloco, PROIBIDO);
});

// ---------- cotações ----------
const RESPOSTA_CHEIA = {
  bitcoin: { brl: 512340.12, brl_24h_change: -1.21, last_updated_at: 1763380000 },
  ethereum: { brl: 17120.5, brl_24h_change: 0.84, last_updated_at: 1763380000 },
  solana: { brl: 812.4, brl_24h_change: 3.12, last_updated_at: 1763380000 },
  binancecoin: { brl: 3105.2, brl_24h_change: -0.4, last_updated_at: 1763380000 },
  ripple: { brl: 12.31, brl_24h_change: 1.9, last_updated_at: 1763380000 },
  cardano: { brl: 3.412, brl_24h_change: -2.35, last_updated_at: 1763380000 },
  dogecoin: { brl: 1.087, brl_24h_change: 5.02, last_updated_at: 1763380000 },
  tether: { brl: 5.334, brl_24h_change: 0.01, last_updated_at: 1763380000 },
};
const AWESOME_CRIPTO = { BTCBRL: { bid: "511900", pctChange: "-1.3", create_date: "2026-11-17 10:31:00" }, ETHBRL: { bid: "17090", pctChange: "0.7", create_date: "2026-11-17 10:31:00" } };
const MB = [{ pair: "BTC-BRL", last: "511000", open: "515000", date: 1763380000 }, { pair: "ETH-BRL", last: "17000", open: "16900", date: 1763380000 }];

// fetch falso: respostas por host; conta os pedidos
function comFetch(respostas, fn) {
  const original = globalThis.fetch, pedidos = [];
  globalThis.fetch = async (url) => {
    const u = String(url), host = new URL(u).host;
    pedidos.push(u);
    const r = typeof respostas[host] === "function" ? respostas[host](u) : respostas[host];
    if (r === undefined) return new Response("sem rede no teste", { status: 503 });
    if (r instanceof Response) return r;
    return new Response(JSON.stringify(r), { status: 200, headers: { "content-type": "application/json" } });
  };
  return Promise.resolve(fn(pedidos)).finally(() => { globalThis.fetch = original; });
}
const CG = "api.coingecko.com", AW = "economia.awesomeapi.com.br", MBH = "api.mercadobitcoin.net";

test("CoinGecko: as oito moedas numa chamada só, em reais e com a variação de 24 h", () => {
  const u = new URL(URL_COINGECKO);
  assert.equal(u.host, CG);
  assert.deepEqual(u.searchParams.get("ids").split(","), ["bitcoin", "ethereum", "solana", "binancecoin", "ripple", "cardano", "dogecoin", "tether"]);
  assert.equal(u.searchParams.get("vs_currencies"), "brl");
  assert.equal(u.searchParams.get("include_24hr_change"), "true");
  assert.equal(CRIPTO.length, 8);
  const l = lerCoingecko(RESPOSTA_CHEIA);
  assert.deepEqual(l.map((i) => i.id), ["btc", "eth", "sol", "bnb", "xrp", "ada", "doge", "usdt"]);
  const usdt = l.find((i) => i.id === "usdt");
  assert.deepEqual({ ...usdt }, { id: "usdt", nome: "Tether", sigla: "USDT", valor: 5.334, variacao: 0.01, unidade: "R$", casas: 3, fonte: "CoinGecko", data: new Date(1763380000 * 1000).toISOString() });
  // moeda sem preço, preço zero ou lixo fica de fora (sem buraco)
  assert.deepEqual(lerCoingecko({ bitcoin: { brl: null }, solana: { brl: 0 }, ripple: "x", cardano: { brl: 3 } }).map((i) => i.id), ["ada"]);
  assert.deepEqual(lerCoingecko(null), []);
});

test("resposta cheia: um pedido só, oito moedas no bloco, bitcoin e ether no letreiro", async () => {
  await comFetch({ [CG]: RESPOSTA_CHEIA }, async (pedidos) => {
    const r = await cripto();
    assert.equal(pedidos.length, 1);
    assert.equal(r.lista.length, 8);
    assert.equal(r.erro, "");
    const env = { DB: d1Falso() };
    pedidos.length = 0;
    const p = await atualizarMercado(env, { cripto: true });
    assert.equal(pedidos.length, 1, "só o CoinGecko");
    assert.deepEqual(p.cripto.map((i) => i.id), ["btc", "eth", "sol", "bnb", "xrp", "ada", "doge", "usdt"]);
    assert.ok(p.cripto.every((i) => i.fonte === "CoinGecko" && i.lido && typeof i.variacao === "number"));
    assert.deepEqual(p.itens.map((i) => i.id), ["btc", "eth"], "o letreiro não cresce");
    assert.ok(!("sigla" in p.itens[0]));
    assert.deepEqual(p.erros, {});
    const gravado = JSON.parse((await env.DB.prepare("SELECT data FROM docs WHERE collection = 'meta' AND id = 'mercado'").first()).data);
    assert.equal(gravado.cripto.length, 8);
  });
});

test("resposta parcial: entra o que veio, na ordem, sem buraco; o Mercado Bitcoin completa o que faltou e a AwesomeAPI, bitcoin e ether", async () => {
  const parcial = { ethereum: RESPOSTA_CHEIA.ethereum, solana: RESPOSTA_CHEIA.solana, dogecoin: RESPOSTA_CHEIA.dogecoin, bitcoin: RESPOSTA_CHEIA.bitcoin };
  await comFetch({ [CG]: parcial, [MBH]: [...MB, { pair: "XRP-BRL", last: "12.5", open: "12", date: 1763380000 }] }, async (pedidos) => {
    const r = await cripto();
    assert.deepEqual(r.lista.map((i) => [i.id, i.fonte]), [["btc", "CoinGecko"], ["eth", "CoinGecko"], ["sol", "CoinGecko"], ["xrp", "Mercado Bitcoin"], ["doge", "CoinGecko"]]);
    assert.equal(pedidos.length, 2, "CoinGecko e uma chamada ao Mercado Bitcoin com a lista inteira");
    assert.match(pedidos[1], /BTC-BRL,ETH-BRL,SOL-BRL,BNB-BRL,XRP-BRL,ADA-BRL,DOGE-BRL,USDT-BRL/);
    assert.equal(r.lista.find((i) => i.id === "xrp").casas, 2);
  });
  // Mercado Bitcoin fora e sem bitcoin no CoinGecko: a AwesomeAPI traz o bitcoin
  const semBtc = { ethereum: RESPOSTA_CHEIA.ethereum, solana: RESPOSTA_CHEIA.solana };
  await comFetch({ [CG]: semBtc, [AW]: AWESOME_CRIPTO }, async (pedidos) => {
    const r = await cripto();
    assert.deepEqual(r.lista.map((i) => [i.id, i.fonte]), [["btc", "AwesomeAPI"], ["eth", "CoinGecko"], ["sol", "CoinGecko"]]);
    assert.match(pedidos[pedidos.length - 1], /economia\.awesomeapi/);
  });
});

test("queda para a reserva: CoinGecko fora, o Mercado Bitcoin traz o que negocia; sem ele, BTC e ETH da AwesomeAPI", async () => {
  await comFetch({ [CG]: new Response("muitos pedidos", { status: 429 }), [AW]: AWESOME_CRIPTO }, async () => {
    const env = { DB: d1Falso() };
    const p = await atualizarMercado(env, { cripto: true });
    assert.deepEqual(p.cripto.map((i) => [i.id, i.fonte, i.valor]), [["btc", "AwesomeAPI", 511900], ["eth", "AwesomeAPI", 17090]]);
    assert.deepEqual(p.itens.map((i) => i.id), ["btc", "eth"]);
    assert.match(p.erros.cripto, /CoinGecko: HTTP 429/);
  });
  await comFetch({ [MBH]: MB }, async (pedidos) => {
    const r = await cripto();
    assert.deepEqual(r.lista.map((i) => [i.id, i.fonte]), [["btc", "Mercado Bitcoin"], ["eth", "Mercado Bitcoin"]]);
    assert.equal(pedidos.length, 2, "CoinGecko e Mercado Bitcoin");
    const btc = r.lista[0];
    assert.ok(Math.abs(btc.variacao - ((511000 - 515000) / 515000) * 100) < 1e-9);
  });
  // tudo fora: o painel guarda a lista anterior e o letreiro anterior
  const env = { DB: d1Falso() };
  await comFetch({ [CG]: RESPOSTA_CHEIA }, () => atualizarMercado(env, { cripto: true }));
  await comFetch({}, async () => {
    await assert.rejects(cripto(), /CoinGecko/);
    const p = await atualizarMercado(env, { cripto: true });
    assert.equal(p.cripto.length, 8, "a lista anterior fica");
    assert.deepEqual(p.itens.map((i) => i.id), ["btc", "eth"]);
    assert.ok(p.erros.cripto);
  });
  // e uma atualização só de moedas não apaga a lista de cripto
  await comFetch({ [AW]: { USDBRL: { bid: "5.33", pctChange: "0.1" }, EURBRL: { bid: "6.18", pctChange: "-0.1" } } }, async (pedidos) => {
    const p = await atualizarMercado(env, { moedas: true });
    assert.equal(pedidos.length, 1);
    assert.match(pedidos[0], /json\/last\/USD-BRL,EUR-BRL$/, "dólar e euro, sem cripto");
    assert.equal(p.cripto.length, 8);
    assert.deepEqual(p.itens.map((i) => i.id), ["usd", "eur", "btc", "eth"]);
  });
});

test("cron: cripto nos minutos 16 e 46, longe do minuto 3 das moedas; nenhum minuto ganha pedido de mercado a mais", () => {
  assert.equal(MINUTO_CRIPTO, 16);
  const em = (h, m) => Date.UTC(2026, 10, 17, h, m);
  const contar = (p) => (p.moedas ? 1 : 0) + (p.cripto ? 1 : 0);
  let maxAntes = 0, maxDepois = 0;
  for (let m = 0; m < 60; m++) {
    const p = partesDoMinuto(em(14, m));
    assert.equal(p.cripto, m === 16 || m === 46, "minuto " + m);
    assert.ok(!(p.cripto && p.moedas), "cripto e moedas nunca no mesmo minuto");
    maxAntes = Math.max(maxAntes, p.moedas ? 1 : 0);
    maxDepois = Math.max(maxDepois, contar(p));
  }
  assert.equal(maxDepois, maxAntes, "no máximo 1 pedido de moedas ou cripto por minuto, como antes");
});

// ---------- fontes ----------
test("feeds: sem URL repetida; subreddits de cripto em Investimentos; ciclo do Reddit dentro do limite", () => {
  const urls = FEEDS.map((f) => f[3].toLowerCase());
  assert.equal(new Set(urls).size, urls.length, "nenhuma URL duas vezes na lista");
  const subs = FEEDS.filter((f) => f[4] === "reddit");
  for (const s of ["r/BitcoinBrasil", "r/CryptoCurrency", "r/Bitcoin", "r/ethereum", "r/defi", "r/CryptoMarkets"]) {
    const f = subs.find((x) => x[1] === s);
    assert.ok(f, s);
    assert.equal(f[0], "investimentos");
    assert.equal(f[3], `https://www.reddit.com/${s}/top/.rss?t=day`, "no desenho dos outros");
  }
  assert.equal(subs.find((x) => x[1] === "r/BitcoinBrasil")[2], "BR");
  // um por minuto, cada um a cada 120 min: a volta inteira cabe
  assert.ok(subs.length * REDDIT.POR_MINUTO <= REDDIT.INTERVALO_MIN);
  // os feeds de cripto que já estavam continuam
  for (const f of ["Livecoins", "CoinDesk", "Cointelegraph"]) assert.ok(FEEDS.some((x) => x[0] === "investimentos" && x[1] === f && !x[4]), f);
  // a lista para a sonda de produção não repete o que já está na coleta, e cada linha tem fonte, país e URL
  const naColeta = new Set(urls);
  for (const [fonte, pais, url] of CRIPTO_PARA_SONDAR) {
    assert.ok(fonte && /^(|[A-Z]{2})$/.test(pais) && /^https:\/\//.test(url), fonte);
    assert.ok(!naColeta.has(url.toLowerCase()), url);
  }
  assert.equal(new Set(CRIPTO_PARA_SONDAR.map((x) => x[2])).size, CRIPTO_PARA_SONDAR.length);
});
