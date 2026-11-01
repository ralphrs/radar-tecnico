// Dados dos FIIs a partir do informe mensal que os fundos entregam à CVM (dados abertos, grátis, sem chave).
// https://dados.cvm.gov.br/dataset/fii-doc-inf_mensal
//
// Um zip por ano com três CSVs separados por ";". Usamos dois:
// - geral: nome, ISIN (de onde sai o papel: BRHGLGCTF004 vira HGLG11), segmento, mandato, gestão, administrador;
// - complemento: cotistas, patrimônio líquido, cotas emitidas, valor patrimonial da cota e dividend yield do mês.
//
// O informe chega com uns 30 a 45 dias de atraso, então cotistas, VP e rendimento são do último mês entregue.
// O rendimento por cota é estimado como DY do mês x VP da cota (a CVM calcula o DY sobre o patrimônio).
//
// Duas etapas por dia, em minutos diferentes do cron, para não estourar o tempo de CPU de uma execução:
// o ano anterior (meta/fii-cvm-ant) e o ano corrente, que no fim junta os dois em meta/fii.

const BASE = "https://dados.cvm.gov.br/dados/FII/DOC/INF_MENSAL/DADOS/";

async function baixarZip(ano) {
  const r = await fetch(`${BASE}inf_mensal_fii_${ano}.zip`, { headers: { "user-agent": "LookoutBot/1.0" }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error("CVM HTTP " + r.status + " no zip de " + ano);
  return new Uint8Array(await r.arrayBuffer());
}

// Leitor mínimo de zip: diretório central, depois o cabeçalho local de cada arquivo e o deflate cru.
function entradasZip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let fim = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
  if (fim < 0) throw new Error("zip sem diretório central");
  const total = dv.getUint16(fim + 10, true);
  let p = dv.getUint32(fim + 16, true);
  const lista = [];
  for (let k = 0; k < total; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(p + 10, true), tam = dv.getUint32(p + 20, true);
    const nLen = dv.getUint16(p + 28, true), eLen = dv.getUint16(p + 30, true), cLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const nome = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nLen));
    lista.push({ nome, metodo, tam, local });
    p += 46 + nLen + eLen + cLen;
  }
  return lista;
}
async function lerEntrada(buf, e) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const ini = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true);
  const dados = buf.subarray(ini, ini + e.tam);
  if (e.metodo === 0) return dados;
  if (e.metodo !== 8) throw new Error("zip com compressão " + e.metodo);
  const s = new Blob([dados]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
function texto(bytes) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch (e) {}
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return s;
}
// CSV com ";" e cabeçalho; devolve as linhas já como objetos só com as colunas pedidas.
function csv(txt, pedir) {
  const linhas = txt.split(/\r?\n/);
  const cab = linhas[0].replace(/^﻿/, "").split(";").map((c) => c.replace(/"/g, "").trim());
  const idx = {};
  for (const [chave, teste] of Object.entries(pedir)) idx[chave] = cab.findIndex(teste);
  const out = [];
  for (let i = 1; i < linhas.length; i++) {
    if (!linhas[i]) continue;
    const v = linhas[i].split(";");
    const o = {};
    for (const k in idx) o[k] = idx[k] >= 0 ? (v[idx[k]] || "").replace(/"/g, "").trim() : "";
    out.push(o);
  }
  return out;
}
const n = (v) => { if (v === "" || v == null) return null; const x = Number(String(v).replace(",", ".")); return Number.isFinite(x) ? x : null; };
const tem = (...partes) => (c) => partes.every((p) => c.toLowerCase().includes(p));

// Guarda o cabeçalho do CSV geral do último ano lido, para o admin conferir os nomes das colunas (ex.: mandato).
let cabecalhoGeral = "";
async function lerAno(ano) {
  const buf = await baixarZip(ano);
  const ents = entradasZip(buf);
  const eGeral = ents.find((e) => /geral/i.test(e.nome)), eComp = ents.find((e) => /complemento/i.test(e.nome));
  if (!eGeral || !eComp) throw new Error("zip de " + ano + " sem geral ou complemento: " + ents.map((e) => e.nome).join(", "));
  const txtGeral = texto(await lerEntrada(buf, eGeral));
  cabecalhoGeral = txtGeral.split(/\r?\n/, 1)[0].replace(/^\uFEFF/, "").slice(0, 600);
  const geral = csv(txtGeral, {
    cnpj: tem("cnpj"), ref: tem("data_referencia"), nome: (c) => /^nome_fundo/i.test(c), isin: tem("isin"),
    seg: tem("segmento"), mandato: tem("mandato"), gestao: tem("tipo_gestao"), adm: (c) => /^nome_administrador/i.test(c),
  });
  // Papel a partir do ISIN; só entram fundos com cota negociada (ISIN de FII: BR + 4 letras + CTF).
  const papelDe = {}, cad = {};
  for (const g of geral) {
    const m = /^BR([A-Z]{4})CTF/.exec(g.isin || "");
    if (!m) continue;
    papelDe[g.cnpj] = m[1] + "11";
    if (!cad[g.cnpj] || g.ref > cad[g.cnpj].ref) cad[g.cnpj] = g;
  }
  const comp = csv(texto(await lerEntrada(buf, eComp)), {
    cnpj: tem("cnpj"), ref: tem("data_referencia"), cot: tem("total_numero_cotistas"), pl: tem("patrimonio_liquido"),
    cotas: tem("cotas_emitidas"), vp: tem("valor_patrimonial_cota"), dy: tem("dividend_yield"), rent: tem("rentabilidade_efetiva"),
  });
  const hist = {};
  for (const c of comp) {
    const t = papelDe[c.cnpj];
    // Data fora do formato AAAA-MM-DD não entra: o mês vira chave e texto na página.
    if (!t || !/^\d{4}-\d{2}/.test(c.ref)) continue;
    (hist[t] = hist[t] || {})[c.ref.slice(0, 7)] = [c.ref.slice(0, 7), n(c.dy), n(c.vp), n(c.cot), n(c.rent), n(c.pl), n(c.cotas)];
  }
  const cadastro = {};
  for (const [cnpj, g] of Object.entries(cad)) cadastro[papelDe[cnpj]] = { n: g.nome, s: g.seg, m: g.mandato, g: g.gestao, a: g.adm, c: cnpj };
  return { hist, cadastro };
}

async function gravar(env, id, doc) {
  await env.DB.prepare(
    "INSERT INTO docs (collection, id, data, coletado) VALUES ('meta', ?1, ?2, ?3) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, coletado = excluded.coletado, atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
  ).bind(id, JSON.stringify(doc), new Date().toISOString()).run();
}
async function ler(env, id) {
  const r = await env.DB.prepare("SELECT data, atualizado FROM docs WHERE collection = 'meta' AND id = ?1").bind(id).first();
  return r ? { ...JSON.parse(r.data), _em: r.atualizado } : null;
}

// O DY vem como fração (0,0081) em alguns anos e como percentual (0,81) em outros: decide pela mediana.
function emPercentual(hist) {
  const v = [];
  for (const meses of Object.values(hist)) for (const h of Object.values(meses)) if (h[1] > 0) v.push(h[1]);
  v.sort((a, b) => a - b);
  return v.length && v[v.length >> 1] < 0.1 ? 100 : 1;
}

const r4 = (x) => (x === null ? null : Math.round(x * 1e4) / 1e4);
const escala = (h, f) => [h[0], h[1] === null ? null : r4(h[1] * f), h[2], h[3], h[4] === null ? null : r4(h[4] * f), h[5], h[6]];

export async function etapaAnoAnterior(env) {
  const ano = new Date().getUTCFullYear() - 1;
  const { hist } = await lerAno(ano);
  await gravar(env, "fii-cvm-ant", { ano, hist });
  return Object.keys(hist).length;
}

export async function etapaAnoCorrente(env) {
  const ano = new Date().getUTCFullYear();
  const { hist, cadastro } = await lerAno(ano);
  const ant = await ler(env, "fii-cvm-ant");
  const histAnt = ant && ant.ano === ano - 1 ? ant.hist : {};
  const fAtual = emPercentual(hist), fAnt = emPercentual(histAnt);
  const fundos = {};
  let refMax = "";
  for (const [t, cad] of Object.entries(cadastro)) {
    const meses = [
      ...Object.values(histAnt[t] || {}).map((h) => escala(h, fAnt)),
      ...Object.values(hist[t] || {}).map((h) => escala(h, fAtual)),
    ].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-13);
    if (!meses.length) continue;
    const u = meses[meses.length - 1];
    if (u[0] > refMax) refMax = u[0];
    // h: [mês, DY do mês em %, VP da cota, cotistas, rentabilidade efetiva do mês, PL, cotas emitidas]
    fundos[t] = { ...cad, ref: u[0], vp: u[2], cot: u[3], pl: u[5], cotas: u[6], h: meses.map((m) => m.slice(0, 5)) };
  }
  await gravar(env, "fii", { atualizado: new Date().toISOString(), ref: refMax, fonte: "CVM, informe mensal de FII", fundos });
  return Object.keys(fundos).length;
}

function erro(env, etapa, e) {
  return env.DB.prepare("INSERT INTO docs (collection, id, data) VALUES ('_sistema', 'cvm-erro', ?1) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
    .bind(JSON.stringify({ quando: new Date().toISOString(), etapa, erro: String(e && e.message || e) })).run();
}

// Uma vez por dia (10:12 e 10:17 UTC, depois de a CVM publicar o lote da madrugada). Enquanto meta/fii
// não existir, tenta de 15 em 15 minutos.
export async function cronCvm(env, quando) {
  const d = new Date(quando), h = d.getUTCHours(), m = d.getUTCMinutes();
  const diario = h === 10;
  let faltando = false;
  if (!diario && (m % 15 === 12 || m % 15 === 2)) faltando = !(await env.DB.prepare("SELECT 1 FROM docs WHERE collection = 'meta' AND id = 'fii'").first());
  const etapa = (diario && m === 12) || (faltando && m % 15 === 12) ? "anterior" : (diario && m === 17) || (faltando && m % 15 === 2) ? "corrente" : "";
  if (!etapa) return null;
  // Marca o início: se a execução for interrompida por limite de CPU, o admin vê "iniciou e não terminou".
  const marca = (data) => env.DB.prepare("INSERT INTO docs (collection, id, data) VALUES ('_sistema', 'cvm-etapa', ?1) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(JSON.stringify(data)).run();
  const ini = Date.now();
  await marca({ etapa, inicio: new Date(ini).toISOString(), fim: null });
  try {
    const fundos = etapa === "anterior" ? await etapaAnoAnterior(env) : await etapaAnoCorrente(env);
    await marca({ etapa, inicio: new Date(ini).toISOString(), fim: new Date().toISOString(), ms: Date.now() - ini, fundos, cabecalhoGeral });
    return { [etapa]: fundos };
  } catch (e) { await erro(env, etapa, e); throw e; }
}
