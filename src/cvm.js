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

// ---------- cadastro do fundo: mandato, gestão, prazo, início, público-alvo, site ----------
// A CVM manda textos livres e com variação de grafia entre anos ("Títulos e Valores Mobiliários", "TITULOS E VAL. MOB.").
// Viram rótulos curtos; o que não estiver no mapa sai em Title Case, do jeito que veio.
const chave = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const MINUSC = new Set(["de", "da", "do", "das", "dos", "e", "em", "para", "a", "o"]);
const titulo = (v) => String(v || "").replace(/\s+/g, " ").trim().toLowerCase()
  .split(" ").map((w, i) => (i > 0 && MINUSC.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
const MANDATOS = {
  "RENDA": "Renda",
  "TITULOS E VALORES MOBILIARIOS": "Papel", "TITULOS E VAL. MOB.": "Papel", "TITULOS E VAL MOB": "Papel", "TVM": "Papel",
  "HIBRIDO": "Híbrido",
  "DESENVOLVIMENTO PARA RENDA": "Desenvolvimento para Renda",
  "DESENVOLVIMENTO PARA VENDA": "Desenvolvimento para Venda",
};
export function normMandato(v) {
  const k = chave(v);
  if (!k) return "";
  if (MANDATOS[k]) return MANDATOS[k];
  if (/^TITULOS\b/.test(k)) return "Papel";
  if (/^DESENV.*RENDA/.test(k)) return "Desenvolvimento para Renda";
  if (/^DESENV.*VENDA/.test(k)) return "Desenvolvimento para Venda";
  return titulo(v);
}
// No informe de 2026 a gestão vem como "Ativa" ou "Definida". Gestão definida é a que segue a carteira fixada no
// regulamento, sem o gestor escolher ativos: é a passiva.
export function normGestao(v) {
  const k = chave(v);
  if (!k) return "";
  if (k === "ATIVA") return "Ativa";
  if (k === "PASSIVA" || k === "DEFINIDA") return "Passiva";
  return titulo(v);
}
// Data como vem da CVM (AAAA-MM-DD ou DD/MM/AAAA) vira AAAA-MM-DD; o resto vira "".
export function dataIso(v) {
  const t = String(v || "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}
export function normPrazo(pz, data) {
  const k = chave(pz), d = dataIso(data);
  if (k.startsWith("INDETERMINADO")) return "Indeterminado";
  if (k.startsWith("DETERMINADO") || (!k && d)) return d ? `Determinado (até ${d})` : "Determinado";
  return k ? titulo(pz) : "";
}
const PUBLICOS = {
  "INVESTIDORES EM GERAL": "Investidores em geral", "GERAL": "Investidores em geral",
  "INVESTIDORES QUALIFICADOS": "Investidores qualificados", "QUALIFICADO": "Investidores qualificados",
  "INVESTIDORES PROFISSIONAIS": "Investidores profissionais", "PROFISSIONAL": "Investidores profissionais",
};
export function normPublico(v) {
  const k = chave(v);
  if (!k) return "";
  if (PUBLICOS[k]) return PUBLICOS[k];
  const t = String(v).replace(/\s+/g, " ").trim();
  return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t;
}
const siteOk = (v) => { const t = String(v || "").trim(); return /^https?:\/\/[^\s"<>]+$/i.test(t) && t.length <= 200 ? t : ""; };

// Cadastro curto de um fundo a partir de uma linha do CSV geral. m e g sempre presentes (como antes, "" quando faltam);
// os campos novos só entram quando vieram, para não inchar o meta/fii.
export function cadastroDe(g) {
  const out = { n: g.nome, s: g.seg, m: normMandato(g.mandato), g: normGestao(g.gestao), a: g.adm, c: g.cnpj };
  const pz = normPrazo(g.pz, g.dpz), ini = dataIso(g.ini), pub = normPublico(g.pub), site = siteOk(g.site);
  if (pz) out.pz = pz;
  if (ini) out.ini = ini;
  if (pub) out.pub = pub;
  if (site) out.site = site;
  return out;
}
// Campos do cadastro que podem faltar no informe mais recente e ser completados com um anterior.
const COMPLETAR = ["m", "g", "a", "pz", "ini", "pub", "site"];
export function completar(novo, velho) {
  if (!velho) return novo;
  for (const k of COMPLETAR) if (!novo[k] && velho[k]) novo[k] = velho[k];
  return novo;
}

// Guarda o cabeçalho do CSV geral do último ano lido, para o admin conferir os nomes das colunas (ex.: mandato).
let cabecalhoGeral = "";
async function lerAno(ano) {
  const buf = await baixarZip(ano);
  const ents = entradasZip(buf);
  const eGeral = ents.find((e) => /geral/i.test(e.nome)), eComp = ents.find((e) => /complemento/i.test(e.nome));
  if (!eGeral || !eComp) throw new Error("zip de " + ano + " sem geral ou complemento: " + ents.map((e) => e.nome).join(", "));
  const txtGeral = texto(await lerEntrada(buf, eGeral));
  cabecalhoGeral = txtGeral.split(/\r?\n/, 1)[0].replace(/^\uFEFF/, "").slice(0, 600);
  return lerCsvs(txtGeral, texto(await lerEntrada(buf, eComp)));
}

// Separado do download para o teste em Node rodar com linhas de exemplo.
export function lerCsvs(txtGeral, txtComp) {
  const geral = csv(txtGeral, {
    cnpj: tem("cnpj"), ref: tem("data_referencia"), nome: (c) => /^nome_fundo/i.test(c), isin: tem("isin"),
    seg: tem("segmento"), mandato: tem("mandato"), gestao: tem("tipo_gestao"), adm: (c) => /^nome_administrador/i.test(c),
    pz: (c) => /^prazo_duracao$/i.test(c), dpz: (c) => /^data_prazo_duracao$/i.test(c), ini: (c) => /^data_funcionamento$/i.test(c),
    pub: (c) => /^publico_alvo$/i.test(c), site: (c) => /^site$/i.test(c),
  });
  // Papel a partir do ISIN; só entram fundos com cota negociada (ISIN de FII: BR + 4 letras + CTF).
  // O cadastro é o do informe mais recente do ano; campo vazio nele é completado pelo informe anterior que tiver.
  const papelDe = {}, cad = {};
  for (const g of geral) {
    const m = /^BR([A-Z]{4})CTF/.exec(g.isin || "");
    if (!m) continue;
    papelDe[g.cnpj] = m[1] + "11";
    const novo = { ref: g.ref, c: cadastroDe(g) }, atual = cad[g.cnpj];
    if (!atual) cad[g.cnpj] = novo;
    else if (g.ref > atual.ref) cad[g.cnpj] = { ref: g.ref, c: completar(novo.c, atual.c) };
    else completar(atual.c, novo.c);
  }
  const comp = csv(txtComp, {
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
  for (const [cnpj, g] of Object.entries(cad)) cadastro[papelDe[cnpj]] = g.c;
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

// Resumo por papel para a tabela, os rankings, os filtros e as listas da Bolsa (meta/fii-resumo, uns 30 a 40 KB contra
// os ~390 KB do meta/fii com 13 meses de histórico). O histórico só desce quando a pessoa abre o diálogo de um FII.
// r12 e m12 seguem a conta que a página fazia com o histórico: rendimento por cota de cada mês = DY do mês x VP;
// r12 é a soma dos últimos 12 meses com dado (ou a média x 12 quando há menos de 12) e m12 quantos meses entraram.
// O DY 12m precisa da cotação do dia, então a página faz r12 / preço.
const r6 = (x) => (x == null ? null : Math.round(x * 1e6) / 1e6);
export function resumoFii(fundos) {
  const out = {};
  for (const [t, f] of Object.entries(fundos || {})) {
    const rends = (f.h || []).map((h) => (h[1] != null && h[2] != null ? (h[1] / 100) * h[2] : null));
    const ult = rends.length ? rends[rends.length - 1] : null;
    const ult12 = rends.slice(-12).filter((v) => v != null);
    const soma = ult12.reduce((a, b) => a + b, 0);
    const r12 = ult12.length ? (ult12.length >= 12 ? soma : (soma / ult12.length) * 12) : null;
    out[t] = { n: f.n, s: f.s, ref: f.ref, vp: f.vp, cot: f.cot ?? null, rend: r6(ult), r12: r6(r12), m12: ult12.length };
    // Radar de dividendos (public/radar-filtro.js): cotistas e rendimento do informe anterior (para "No mês" e a
    // Leitura do dia), quantos dos últimos 12 meses pagaram, e o maior e a mediana desses 12 (rendimento extraordinário).
    const h = f.h || [];
    if (h.length >= 2) {
      const ant = h[h.length - 2];
      if (ant[3] != null) out[t].ca = ant[3];
      if (rends[rends.length - 2] != null) out[t].ra = r6(rends[rends.length - 2]);
    }
    const doze = rends.slice(-12).filter((v) => v != null);
    if (doze.length) {
      out[t].pg = doze.filter((v) => v > 0).length;
      const ord = doze.slice().sort((a, b) => a - b), meio = ord.length >> 1;
      out[t].rmx = r6(ord[ord.length - 1]);
      out[t].rmd = r6(ord.length % 2 ? ord[meio] : (ord[meio - 1] + ord[meio]) / 2);
    }
    // mandato e gestão entram nos filtros da lista; só quando vieram
    if (f.m) out[t].m = f.m;
    if (f.g) out[t].g = f.g;
  }
  return out;
}

export async function etapaAnoAnterior(env) {
  const ano = new Date().getUTCFullYear() - 1;
  const { hist, cadastro } = await lerAno(ano);
  // cad: só os campos que completam o cadastro do ano corrente quando o informe novo vier sem eles
  const cad = {};
  for (const [t, c] of Object.entries(cadastro)) {
    const o = {};
    for (const k of ["m", "g", "pz", "ini", "pub", "site"]) if (c[k]) o[k] = c[k];
    if (Object.keys(o).length) cad[t] = o;
  }
  await gravar(env, "fii-cvm-ant", { ano, hist, cad });
  return Object.keys(hist).length;
}

export async function etapaAnoCorrente(env) {
  const ano = new Date().getUTCFullYear();
  const { hist, cadastro } = await lerAno(ano);
  const ant = await ler(env, "fii-cvm-ant");
  const histAnt = ant && ant.ano === ano - 1 ? ant.hist : {};
  const cadAnt = ant && ant.ano === ano - 1 && ant.cad ? ant.cad : {};
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
    fundos[t] = { ...completar({ ...cad }, cadAnt[t]), ref: u[0], vp: u[2], cot: u[3], pl: u[5], cotas: u[6], h: meses.map((m) => m.slice(0, 5)) };
  }
  const atualizado = new Date().toISOString(), fonte = "CVM, informe mensal de FII";
  await gravar(env, "fii", { atualizado, ref: refMax, fonte, fundos });
  await gravar(env, "fii-resumo", { atualizado, ref: refMax, fonte, fundos: resumoFii(fundos) });
  return Object.keys(fundos).length;
}

function erro(env, etapa, e) {
  return env.DB.prepare("INSERT INTO docs (collection, id, data) VALUES ('_sistema', 'cvm-erro', ?1) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
    .bind(JSON.stringify({ quando: new Date().toISOString(), etapa, erro: String(e && e.message || e) })).run();
}

// Uma vez por dia (10:12 e 10:17 UTC, depois de a CVM publicar o lote da madrugada). Enquanto meta/fii-resumo
// não existir (é gravado junto com meta/fii), tenta de 15 em 15 minutos.
export async function cronCvm(env, quando) {
  const d = new Date(quando), h = d.getUTCHours(), m = d.getUTCMinutes();
  const diario = h === 10;
  let faltando = false;
  if (!diario && (m % 15 === 12 || m % 15 === 2)) faltando = !(await env.DB.prepare("SELECT 1 FROM docs WHERE collection = 'meta' AND id = 'fii-resumo'").first());
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
