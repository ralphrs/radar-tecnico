#!/usr/bin/env node
// Gerador de extratos falsos da B3 para a conta de teste da Minha carteira.
//
//   node test/fixtures/b3-fake/gerar.mjs --saida <pasta> [--ate AAAA-MM-DD] [--semente 2020]
//   node test/fixtures/b3-fake/gerar.mjs --saida <pasta> --diff <manifesto-anterior.json> [--ate ...]
//
// Sem --diff: grava negociacao-*.xlsx, movimentacao-*.xlsx, proventos-recebidos-*.xlsx (um por ano),
// proventos-a-receber-AAAA-MM-DD.xlsx (o retrato do que a B3 já provisionou na data final), README.md e manifesto.json.
// Com --diff: grava só as linhas que o manifesto anterior não tem, em correcao-AAAA-MM-DD-*.xlsx, mais o retrato
// inteiro (ele não soma, substitui), e correcao-AAAA-MM-DD-manifesto.json (o manifesto completo desta geração).
//
// O roteiro fica em cenarios.mjs. Mesma versão + mesma semente + mesma data final = mesmos arquivos, byte a byte.
// As planilhas são escritas por xlsx.py (openpyxl), porque o repositório não tem biblioteca de planilha.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizarLinha, normalizarAReceber, retratoDe, chaveLinha, mesclar, calcular } from "../../../src/carteira.js";
import { CENARIOS, PAPEIS, ESPERADO, refCalculo } from "./cenarios.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const VERSAO = fs.readFileSync(path.join(AQUI, "VERSAO"), "utf8").trim();
export const SEMENTE = 2020;
export const INICIO = "2020-01-01";

export const CAB = {
  negociacao: ["Data do Negócio", "Tipo de Movimentação", "Mercado", "Prazo/Vencimento", "Instituição", "Código de Negociação", "Quantidade", "Preço", "Valor"],
  movimentacao: ["Entrada/Saída", "Data", "Movimentação", "Produto", "Instituição", "Quantidade", "Preço unitário", "Valor da Operação"],
  proventos: ["Produto", "Pagamento", "Tipo de Evento", "Instituição", "Quantidade", "Preço unitário", "Valor líquido"],
  areceber: ["Produto", "Tipo", "Tipo de Evento", "Previsão de pagamento", "Instituição", "Conta", "Quantidade", "Preço unitário", "Valor líquido"],
};
export const ABA = { negociacao: "Negociação", movimentacao: "Movimentação", proventos: "Proventos Recebidos", areceber: "Proventos a Receber" };
// Proventos a Receber: o evento em maiúsculas, como a B3 escreve nesse relatório, e um número de conta inventado
const EVENTO_AREC = { rend: "RENDIMENTO", div: "DIVIDENDO", jcp: "JUROS SOBRE CAPITAL PRÓPRIO", amort: "AMORTIZAÇÃO" };
const CONTA_FAKE = (corr) => "00" + String(1000 + (parseInt(sha(corr).toString("hex").slice(0, 6), 16) % 9000));
const tipoPapel = (t) => (/11$/.test(t) ? "Fundo" : /3[1-9]$/.test(t) ? "BDR" : /4$/.test(t) ? "PN" : /3$/.test(t) ? "ON" : "Outro");
export const AVISO_PADRAO = 20; // dias entre a B3 provisionar o provento e a data de pagamento
const COL_DATA = { negociacao: 0, movimentacao: 1, proventos: 1 };
const TIPO_TXT = { rend: "Rendimento", div: "Dividendo", jcp: "Juros Sobre Capital Próprio", amort: "Amortização" };

// ---------- números e datas ----------

const sha = (s) => createHash("sha256").update(s).digest();
const unif = (s) => sha(s).readUInt32BE(0) / 2 ** 32;
const r2 = (x) => Math.round(x * 100) / 100;
const ym = (d) => d.slice(0, 7);
const br = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const deBr = (s) => (/^\d{2}\/\d{2}\/\d{4}$/.test(s) ? `${s.slice(6)}-${s.slice(3, 5)}-${s.slice(0, 2)}` : s);
const dia = (iso) => new Date(iso + "T12:00:00Z");
const iso = (dt) => dt.toISOString().slice(0, 10);
const menosDias = (d, n) => { const x = dia(d); x.setUTCDate(x.getUTCDate() - n); return iso(x); };
export const util = (d) => { const x = dia(d); const w = x.getUTCDay(); if (w === 6) x.setUTCDate(x.getUTCDate() + 2); if (w === 0) x.setUTCDate(x.getUTCDate() + 1); return iso(x); };
const maisUteis = (d, n) => { const x = dia(d); while (n > 0) { x.setUTCDate(x.getUTCDate() + 1); const w = x.getUTCDay(); if (w !== 0 && w !== 6) n--; } return iso(x); };
const proxMes = (m) => { const [a, mm] = m.split("-").map(Number); return mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, "0")}`; };
const qtdTexto = (q) => q.toLocaleString("pt-BR", { maximumFractionDigits: 8 });
export const hojeBr = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

// ---------- o que a página faz antes de mandar (public/index.html: detectarTipo e reduzirLinha) ----------

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const CAB_ARECEBER = ["produto", "tipo", "tipo de evento", "previsao de pagamento", "instituicao", "conta", "quantidade", "preco unitario", "valor liquido"];
export function detectarTipo(cab) {
  const c = cab.map((v) => semAcento(String(v || "")).toLowerCase().replace(/\s+/g, " ").trim());
  const tem = (x) => c.some((v) => v.includes(x));
  // Proventos a Receber: cabeçalho exato (o nome do arquivo varia); vem antes, porque também tem "pagamento"
  if (CAB_ARECEBER.every((x, i) => c[i] === x) && c.slice(9).every((v) => !v)) return "areceber";
  if (tem("data do negocio") && tem("codigo de negociacao")) return "negociacao";
  if (tem("entrada/saida") && tem("movimentacao") && tem("produto")) return "movimentacao";
  if (tem("produto") && tem("pagamento") && tem("tipo de evento") && !tem("previsao de pagamento")) return "proventos";
  return null;
}
export function reduzirLinha(tipo, r) {
  // Proventos a Receber: sai o Tipo (ON, PN, Fundo) e a Conta; fica [papel, evento, previsão, instituição, qtd, unitário, líquido]
  if (tipo === "areceber") {
    const l = [r[0], r[2], r[3], r[4], r[6], r[7], r[8]].map((v) => (v === undefined ? null : v));
    if (l[0] != null) l[0] = String(l[0]).split(" - ")[0].trim();
    return l;
  }
  const l = r.slice(0, tipo === "negociacao" ? 9 : tipo === "movimentacao" ? 8 : 7);
  const k = tipo === "movimentacao" ? 3 : tipo === "proventos" ? 0 : -1;
  if (k >= 0 && l[k] != null) l[k] = String(l[k]).split(" - ")[0].trim();
  return l;
}
// Linhas de uma planilha (com o cabeçalho) como a página manda ao servidor
export function linhasDaPagina(rows) {
  const tipo = detectarTipo(rows[0] || []);
  if (!tipo) return { tipo: null, linhas: [] };
  return { tipo, linhas: rows.slice(1).filter((r) => r && r.some((v) => v != null && String(v).trim() !== "")).map((r) => reduzirLinha(tipo, r)) };
}

// Hash da linha: o da chave do dedupe de src/carteira.js; linha que o importador ignora usa a linha inteira.
export function hashLinha(tipo, row) {
  const n = normalizarLinha(tipo, reduzirLinha(tipo, row), "");
  const base = n.erro ? `ignorada|${tipo}|${JSON.stringify(row)}` : `${tipo}|${chaveLinha(tipo, n.linha)}`;
  return sha(base).toString("hex").slice(0, 16);
}

// ---------- geração ----------

export function gerar({ ate = hojeBr(), semente = SEMENTE } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ate) || ate < "2020-02-01") throw new Error("--ate precisa ser AAAA-MM-DD, a partir de 2020-02-01");
  const r = (...k) => unif(`${semente}|${k.join("|")}`);
  const gauss = (...k) => Math.sqrt(-2 * Math.log(1 - r(...k, "a"))) * Math.cos(2 * Math.PI * r(...k, "b"));

  // Passeio do preço: um passo por mês desde jan/2020, cada passo com a sua chave (o começo não muda quando --ate cresce)
  const cacheMes = new Map();
  const precoMes = (papel, mes) => {
    const cfg = PAPEIS[papel];
    if (!cfg || !cfg.ini) throw new Error(`sem passeio de preço para ${papel}`);
    if (!cacheMes.has(papel)) cacheMes.set(papel, new Map([["2020-01", cfg.ini]]));
    const m = cacheMes.get(papel);
    let atual = [...m.keys()].pop();
    while (atual < mes) {
      let p = m.get(atual) * Math.exp((cfg.drift || 0) + cfg.vol * gauss(papel, "passo", atual));
      if (p > cfg.max) p = cfg.max - (p - cfg.max) * 0.5;
      if (p < cfg.min) p = cfg.min + (cfg.min - p) * 0.5;
      atual = proxMes(atual);
      m.set(atual, p);
    }
    return m.get(mes);
  };
  const preco = (papel, d) => {
    const base = papel.replace(/F$/, "");
    let p = precoMes(base, ym(d) < "2020-01" ? "2020-01" : ym(d)) * (1 + 0.01 * (2 * r(base, "dia", d) - 1));
    for (const f of PAPEIS[base].fator || []) if (d >= f.desde) p *= f.f;
    return r2(p);
  };
  const mensal = (deMes, ateMes, d) => {
    const out = [];
    for (let m = deMes; m <= ateMes; m = proxMes(m)) out.push(util(`${m}-${String(d).padStart(2, "0")}`));
    return out;
  };

  const intents = [];
  let cen = 0;
  const add = (x) => intents.push({ ...x, cen, ord: intents.length });
  const c = {
    ate, r, preco, mensal, util,
    compra: (d, papel, q, corr, o = {}) => add({ k: "neg", d, cv: "C", papel, q, corr, ...o }),
    venda: (d, papel, q, corr, o = {}) => add({ k: "neg", d, cv: "V", papel, q, corr, ...o }),
    prov: (d, papel, tipo, pc, o = {}) => add({ k: "prov", d, papel, tipo, pc, ...o }),
    mov: (d, es, tipo, papel, q, p, corr, o = {}) => add({ k: "mov", d, es, tipo, papel, q, p, corr, ...o }),
    crua: (tipo, linha) => add({ k: "crua", d: linha[COL_DATA[tipo]], tipo, linha }),
  };
  for (const s of CENARIOS) { cen = s.id; s.roteiro(c); }

  // Execução em ordem de data, acompanhando a quantidade por papel e corretora
  const est = new Map();
  const memo = new Map();
  const s = {
    q: (papel, corr) => { const m = est.get(papel); if (!m) return 0; return corr ? m.get(corr) || 0 : [...m.values()].reduce((a, b) => a + b, 0); },
    memo: (k, fn) => { if (!memo.has(k)) memo.set(k, fn()); return memo.get(k); },
  };
  const mudar = (papel, corr, dq) => { if (!est.has(papel)) est.set(papel, new Map()); const m = est.get(papel); m.set(corr, r2((m.get(corr) || 0) + dq) || 0); };
  const prod = (papel) => `${papel} - ${PAPEIS[papel] ? PAPEIS[papel].nome : papel}`;
  const linhas = { negociacao: [], movimentacao: [], proventos: [] };
  let seq = 0;
  const por = (tipo, d, row, ic) => linhas[tipo].push({ d, row, cen: ic, seq: seq++ });

  const fila = intents.filter((x) => x.d >= INICIO && x.d <= ate).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.ord - b.ord));
  for (const x of fila) {
    if (x.k === "neg") {
      const p = x.preco != null ? x.preco : preco(x.papel, x.d);
      const tv = x.cv === "C" ? "Compra" : "Venda", es = x.cv === "C" ? "Credito" : "Debito";
      const liq = maisUteis(x.d, 2);
      for (const [q, cod, mercado] of [[x.q, x.papel, "Mercado à Vista"], [x.frac || 0, x.papel + "F", "Mercado Fracionário"]]) {
        if (!(q > 0)) continue;
        por("negociacao", x.d, [br(x.d), tv, mercado, "-", x.corr, cod, q, p, r2(q * p)], x.cen);
        if (liq <= ate) por("movimentacao", liq, [es, br(liq), "Transferência - Liquidação", prod(x.papel), x.corr, q, p, r2(q * p)], x.cen);
        mudar(x.papel, x.corr, x.cv === "C" ? q : -q);
      }
      if (s.q(x.papel) < -1e-9) throw new Error(`quantidade negativa em ${x.papel} em ${x.d} (cenário ${x.cen})`);
    } else if (x.k === "prov") {
      const m = est.get(x.papel) || new Map();
      for (const [corr, q] of m) {
        if (!(q > 0) || (x.corr && corr !== x.corr)) continue;
        const liq = r2(q * x.pc * (x.tipo === "jcp" ? 0.85 : 1));
        if (liq < 0.01) continue;
        por("movimentacao", x.d, ["Credito", br(x.d), TIPO_TXT[x.tipo], prod(x.papel), corr, q, x.pc, liq], x.cen);
        por("proventos", x.d, [prod(x.papel), br(x.d), x.evento !== undefined ? (x.evento || null) : TIPO_TXT[x.tipo], corr, qtdTexto(q), x.evento === "" ? "-" : x.pc, liq], x.cen);
      }
    } else if (x.k === "mov") {
      const q = typeof x.q === "function" ? x.q(s) : x.q;
      por("movimentacao", x.d, [x.es === "C" ? "Credito" : "Debito", br(x.d), x.tipo, prod(x.papel), x.corr, q, x.p == null ? "-" : x.p, x.p == null ? "-" : r2(q * x.p)], x.cen);
      const dq = x.dq;
      if (typeof dq === "number") mudar(x.papel, x.corr, dq);
      else if (dq === "+") mudar(x.papel, x.corr, q);
      else if (dq === "-") mudar(x.papel, x.corr, -q);
      else if (dq === "zera") mudar(x.papel, x.corr, -s.q(x.papel, x.corr));
      else if (dq && dq.de) { mudar(dq.de, x.corr, -q); mudar(x.papel, x.corr, q); }
      for (const [papel] of est) if (s.q(papel) < -1e-9) throw new Error(`quantidade negativa em ${papel} em ${x.d} (cenário ${x.cen})`);
    } else if (x.k === "crua") {
      const row = [...x.linha];
      row[COL_DATA[x.tipo]] = br(row[COL_DATA[x.tipo]]);
      por(x.tipo, x.d, row, x.cen);
    }
  }
  // Mais novo primeiro, como a B3 exporta
  for (const t of Object.keys(linhas)) linhas[t].sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : a.seq - b.seq));

  // Proventos a Receber na data final: os proventos do roteiro com pagamento depois de --ate que a B3 já provisionou
  // (aviso dias antes do pagamento; AVISO_PADRAO sem `aviso`), com a quantidade de cada corretora em --ate. Não muda
  // nenhuma linha dos outros arquivos: quando --ate passar da data, o mesmo provento sai nos recebidos.
  const previstos = intents.filter((x) => x.k === "prov" && x.d > ate && menosDias(x.d, x.aviso ?? AVISO_PADRAO) <= ate)
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.papel < b.papel ? -1 : a.papel > b.papel ? 1 : a.ord - b.ord));
  const itensRet = [];
  let somaRet = 0;
  for (const x of previstos) {
    for (const [corr, q] of est.get(x.papel) || new Map()) {
      if (!(q > 0) || (x.corr && corr !== x.corr)) continue;
      const liq = r2(q * x.pc * (x.tipo === "jcp" ? 0.85 : 1));
      if (liq < 0.01) continue;
      somaRet += liq;
      itensRet.push({ d: x.d, cen: x.cen, row: [prod(x.papel), tipoPapel(x.papel), EVENTO_AREC[x.tipo], br(x.d), corr, CONTA_FAKE(corr), qtdTexto(q), x.pc, liq] });
    }
  }
  itensRet.push({ d: ate, cen: 15, row: [null, null, null, null, null, null, null, "Total líquido", r2(somaRet)] });

  // Arquivos: Negociação e Movimentação inteiras; Proventos por ano (a B3 limita o período)
  const carimbo = `${ate}-12-00-00`;
  const arquivos = [
    { nome: `negociacao-${carimbo}.xlsx`, tipo: "negociacao", itens: linhas.negociacao },
    { nome: `movimentacao-${carimbo}.xlsx`, tipo: "movimentacao", itens: linhas.movimentacao },
  ];
  for (let a = 2020; a <= Number(ate.slice(0, 4)); a++) {
    const de = `${a}-01-01`, fim = a === Number(ate.slice(0, 4)) ? ate : `${a}-12-31`;
    arquivos.push({ nome: `proventos-recebidos-${de}-a-${fim}.xlsx`, tipo: "proventos", itens: linhas.proventos.filter((l) => l.d >= de && l.d <= fim) });
  }
  arquivos.push({ nome: `proventos-a-receber-${ate}.xlsx`, tipo: "areceber", itens: itensRet });
  return { ate, semente, versao: VERSAO, arquivos: arquivos.map(comHashes) };
}

function comHashes(a) {
  return { ...a, linhas: a.itens.map((l) => l.row), hashes: a.itens.map((l) => hashLinha(a.tipo, l.row)), cenarios: a.itens.map((l) => l.cen) };
}

// O retrato (areceber) não entra em `linhas`: ele não é deduplicado, cada importação troca o anterior. Fica em `retrato`.
export function manifesto(g) {
  const linhas = { negociacao: [], movimentacao: [], proventos: [] };
  for (const a of g.arquivos) if (linhas[a.tipo]) linhas[a.tipo].push(...a.hashes);
  const ret = g.arquivos.find((a) => a.tipo === "areceber");
  const rr = ret ? retratoDe(ret.linhas.map((l) => reduzirLinha("areceber", l)), ret.nome, g.ate) : null;
  const ignoradas = (a) => (a.tipo === "areceber" ? a.linhas.filter((l) => normalizarAReceber(reduzirLinha(a.tipo, l)).erro).length : a.linhas.filter((l) => normalizarLinha(a.tipo, reduzirLinha(a.tipo, l)).erro).length);
  return {
    gerador: "test/fixtures/b3-fake/gerar.mjs",
    versao: g.versao, semente: g.semente, ate: g.ate,
    arquivos: g.arquivos.map((a) => ({ nome: a.nome, tipo: a.tipo, linhas: a.linhas.length, ignoradas: ignoradas(a) })),
    totais: Object.fromEntries(Object.entries(linhas).map(([k, v]) => [k, v.length])),
    linhas,
    ...(rr ? { retrato: { nome: ret.nome, dataRef: rr.dataRef, linhas: rr.linhas.length, total: rr.total, confere: rr.confere } } : {}),
  };
}

// Linhas desta geração que o manifesto anterior não tem (por multiconjunto de hashes, como o dedupe da importação)
export function diferenca(g, anterior) {
  const resto = {};
  for (const [tipo, hs] of Object.entries(anterior.linhas || {})) {
    const m = new Map();
    for (const h of hs) m.set(h, (m.get(h) || 0) + 1);
    resto[tipo] = m;
  }
  const novas = { negociacao: [], movimentacao: [], proventos: [] };
  for (const a of g.arquivos) {
    if (a.tipo === "areceber") continue;
    const m = resto[a.tipo] || new Map();
    a.linhas.forEach((row, i) => {
      const h = a.hashes[i];
      if ((m.get(h) || 0) > 0) m.set(h, m.get(h) - 1);
      else novas[a.tipo].push({ row, h, cen: a.cenarios[i] });
    });
  }
  const sumiram = Object.fromEntries(Object.entries(resto).map(([t, m]) => [t, [...m.values()].reduce((x, y) => x + y, 0)]));
  const arquivos = Object.entries(novas).filter(([, l]) => l.length).map(([tipo, l]) => ({
    nome: `correcao-${g.ate}-${tipo === "proventos" ? "proventos-recebidos" : tipo}.xlsx`, tipo,
    linhas: l.map((x) => x.row), hashes: l.map((x) => x.h), cenarios: l.map((x) => x.cen),
  }));
  // O retrato vai inteiro (na importação ele toma o lugar do anterior), a menos que seja o mesmo do manifesto anterior
  const ret = g.arquivos.find((a) => a.tipo === "areceber");
  const ra = manifesto(g).retrato, rb = anterior.retrato;
  if (ret && !(rb && ra && rb.dataRef === ra.dataRef && rb.linhas === ra.linhas && rb.total === ra.total)) arquivos.push({ ...ret, nome: `correcao-${g.ate}-proventos-a-receber.xlsx` });
  return { arquivos, sumiram, novas: Object.fromEntries(Object.entries(novas).map(([t, l]) => [t, l.length])) };
}

// ---------- planilhas ----------

const PY = path.join(AQUI, "xlsx.py");
export function escreverXlsx(pasta, arquivos, data) {
  fs.mkdirSync(pasta, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "b3-fake-"));
  try {
    const pedido = path.join(tmp, "pedido.json");
    fs.writeFileSync(pedido, JSON.stringify({ data, arquivos: arquivos.map((a) => ({ caminho: path.resolve(pasta, a.nome), aba: ABA[a.tipo], linhas: [CAB[a.tipo], ...a.linhas] })) }));
    execFileSync("python3", ["-I", PY, "escrever", pedido], { stdio: ["ignore", "inherit", "inherit"] });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
export function lerXlsx(caminho) {
  return JSON.parse(execFileSync("python3", ["-I", PY, "ler", path.resolve(caminho)], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
}

// ---------- o que esperar na tela ----------

// Importa tudo como a página faria e calcula com a cotação guardada em cenarios.mjs (REF)
export function simularImportacao(arquivos, hoje) {
  const envio = arquivos.map((a) => ({ nome: a.nome, tipo: a.tipo, linhas: a.linhas.map((l) => reduzirLinha(a.tipo, l)) }));
  const m = mesclar(null, envio.filter((a) => a.tipo !== "areceber"), "imp1");
  const importacoes = { lista: [{ id: "imp1", arquivos: m.porArquivo.map((x) => ({ tipo: x.tipo, de: x.de, ate: x.ate })) }] };
  const ra = envio.filter((a) => a.tipo === "areceber").pop();
  const rr = ra ? retratoDe(ra.linhas, ra.nome, hoje) : null;
  const retrato = rr ? { dataRef: rr.dataRef, linhas: rr.linhas, total: rr.total } : null;
  const { b3, fiiResumo } = refCalculo();
  return { m, importacoes, rr, calc: calcular(m.extrato, { b3, fiiResumo, importacoes, retrato, hoje }) };
}

const NOME_CLASSE = { acao: "Ação", fii: "FII", fiinfra: "FI-Infra", fiagro: "Fiagro", etf: "ETF", bdr: "BDR", subscricao: "Subscrição", outro: "Outro" };
const brl = (v) => (v == null ? "–" : "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const num = (v, c = 0) => (v == null ? "–" : v.toLocaleString("pt-BR", { maximumFractionDigits: c }));

export function readme(g, man) {
  const { m, calc } = simularImportacao(g.arquivos, g.ate);
  const r = calc.resumo;
  const L = [];
  L.push(`# Extratos falsos da B3 (conta de teste)`, "");
  L.push(`Gerados por \`test/fixtures/b3-fake/gerar.mjs\`, roteiro versão ${g.versao}, semente ${g.semente}, até ${br(g.ate)}. Tudo inventado: os códigos são reais (menos o XPTO3), as quantidades, preços e proventos não.`, "");
  L.push(`## Arquivos`, "");
  L.push(`| Arquivo | Linhas | Ignoradas na importação |`, `|---|---:|---:|`);
  for (const a of man.arquivos) L.push(`| ${a.nome} | ${a.linhas} | ${a.ignoradas} |`);
  L.push("", `Total: ${man.totais.negociacao} negócios, ${man.totais.movimentacao} linhas de Movimentação e ${man.totais.proventos} pagamentos.`, "");
  L.push(`## Como importar`, "");
  L.push(`Na conta de teste, menu da conta → Importar extratos, solte todos os .xlsx de uma vez. A prévia deve mostrar ${m.novos + (man.retrato ? man.retrato.linhas : 0)} linhas novas (${m.novos} dos extratos e ${man.retrato ? man.retrato.linhas : 0} do retrato dos proventos a receber) e ${m.ignorados} ignoradas (Tesouro e CDB). Importar de novo os mesmos arquivos dá 0 novas.`, "");
  L.push(`Mais tarde, para acompanhar a data, gere só a diferença: \`node test/fixtures/b3-fake/gerar.mjs --saida <pasta> --diff <esta pasta>/manifesto.json\`. Saem arquivos \`correcao-AAAA-MM-DD-*.xlsx\` só com as linhas novas; importe-os por cima. Veja docs/dados-de-teste.md.`, "");
  L.push(`## Roteiro`, "");
  for (const s of CENARIOS) {
    L.push(`**${s.id}. ${s.titulo}**${s.papeis.length ? ` (${s.papeis.join(", ")})` : ""}`, "");
    L.push(`- Testa: ${s.testa}`, `- Na tela: ${s.espera}`, "");
  }
  L.push(`## O que esperar na tela`, "");
  L.push(`Conta feita pelo próprio \`src/carteira.js\` sobre estes arquivos, com "hoje" = ${br(g.ate)} e a cotação de 04/11/2026 guardada em cenarios.mjs. Patrimônio e resultado mudam com a cotação do dia; quantidade, PM, custo e proventos não.`, "");
  L.push(`**Posições abertas: ${calc.posicoes.length}** (o teste confere: ${ESPERADO.abertas.length})`, "");
  L.push(`| Papel | Classe | Qtd | PM | Custo | Corretoras | Proventos 12m | Observação |`, `|---|---|---:|---:|---:|---|---:|---|`);
  for (const p of [...calc.posicoes].sort((a, b) => (a.t < b.t ? -1 : 1))) {
    const obs = [p.semCotacao ? "sem cotação" : "", p.emprestadas ? `${num(p.emprestadas)} emprestadas` : ""].filter(Boolean).join("; ");
    L.push(`| ${p.t} | ${NOME_CLASSE[p.classe] || p.classe} | ${num(p.q, 2)} | ${brl(p.pm == null ? null : Math.round(p.pm * 100) / 100)} | ${brl(p.custo)} | ${p.corretoras.join(", ")} | ${brl(p.prov12)} | ${obs} |`);
  }
  L.push("", `**Encerradas: ${r.encerradas.length}** (o teste confere: ${ESPERADO.encerradas.length})`, "");
  L.push(`| Papel | De | Até | Resultado | Proventos | Total |`, `|---|---|---|---:|---:|---:|`);
  for (const e of r.encerradas) L.push(`| ${e.t} | ${br(e.de)} | ${br(e.ate)} | ${brl(e.resultado)} | ${brl(e.proventos)} | ${brl(e.total)} |`);
  L.push("", `**Totais**`, "");
  L.push(`- Custo das posições abertas: ${brl(r.custo)}`);
  L.push(`- Patrimônio com a cotação de 04/11/2026: ${brl(r.patrimonio)} (sem cotação: ${r.semCotacao})`);
  L.push(`- Proventos desde ${r.provDesde}: ${brl(r.provTotal)} em ${r.provN} pagamentos (${r.provDaMov} vindos da Movimentação; o esperado é 0, porque os arquivos de proventos cobrem tudo)`);
  L.push(`- Proventos nos 12 meses fechados: ${brl(r.prov12)} (média ${brl(r.media12)} por mês)`);
  L.push(`- Mês atual (${r.mesAtual.mes}): ${brl(r.mesAtual.total)} em proventos; compras ${brl(r.aportes[r.aportes.length - 1].compras)}`);
  L.push(`- Por corretora: ${r.porCorretora.map((x) => `${x.corretora} ${x.papeis} papéis`).join(", ")}`);
  L.push(`- Avisos (tipos desconhecidos, quantidade negativa): ${r.avisos.length ? r.avisos.map((a) => `${a.k} ${a.n}`).join(", ") : "nenhum"}`);
  L.push("", `**Alertas com esta data final**`, "");
  if (!r.alertas.length) L.push("- nenhum");
  for (const a of r.alertas) {
    if (a.tipo === "rendimento-menor") L.push(`- Rendimento menor: ${a.t}, de ${brl(a.de)} para ${brl(a.para)} por cota em ${br(a.d)}`);
    else if (a.tipo === "concentracao") L.push(`- Concentração: ${a.t} com ${num(a.pct, 1)}% da carteira`);
    else if (a.tipo === "subscricao") L.push(`- Subscrição em carteira: ${a.t}`);
    else if (a.tipo === "fora-do-retrato") L.push(`- ${a.t} não aparece nos proventos a receber do mês`);
    else L.push(`- ${a.tipo}: ${a.t}`);
  }
  L.push("", `**A receber**`, "");
  const rt = r.retrato, man2 = man.retrato;
  if (rt && man2) {
    L.push(`O arquivo ${man2.nome} é o retrato do relatório Proventos a Receber em ${br(rt.dataRef)}: ${man2.linhas} linhas, total líquido ${brl(man2.total)} (a linha "Total líquido" ${man2.confere ? "bate com a soma" : "não bate com a soma"}). Na tela, o card A receber mostra:`, "");
    L.push(`| Data | Papel | Tipo | Por cota | Líquido | Grupo |`, `|---|---|---|---:|---:|---|`);
    for (const x of r.aReceber.filter((y) => y.origem === "b3")) L.push(`| ${br(x.data)} | ${x.t} | ${x.tipo} | ${x.porCota == null ? "–" : x.porCota.toLocaleString("pt-BR", { maximumFractionDigits: 6 })} | ${brl(x.valor)} | ${x.adiante ? "mais adiante" : ""} |`);
    L.push("", `- Ainda neste mês, pela B3: ${brl(rt.noMes)}; total sem o que fica mais adiante: ${brl(r.aReceber.filter((y) => y.origem === "b3" && !y.adiante).reduce((s, y) => s + y.valor, 0))}`);
  }
  const est = r.aReceber.filter((x) => x.origem === "estimativa");
  L.push(`- Estimativa pela CVM (FII que não aparece no retrato do mês): ${est.length ? est.map((x) => `${x.t} ${brl(x.valor)}`).join(", ") : "nenhuma"}`);
  const fora = r.alertas.filter((a) => a.tipo === "fora-do-retrato").map((a) => a.t);
  L.push(`- Alerta "não aparece nos proventos a receber": ${fora.length ? fora.join(", ") : "nenhum"}`, "");
  return L.join("\n");
}

// ---------- linha de comando ----------

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith("--")) throw new Error(`argumento solto: ${k}`);
    o[k.slice(2)] = argv[++i];
    if (o[k.slice(2)] == null) throw new Error(`${k} sem valor`);
  }
  return o;
}

async function main() {
  const o = args(process.argv.slice(2));
  if (!o.saida) throw new Error("uso: gerar.mjs --saida <pasta> [--ate AAAA-MM-DD] [--semente 2020] [--diff manifesto.json]");
  const g = gerar({ ate: o.ate || hojeBr(), semente: o.semente ? Number(o.semente) : SEMENTE });
  const man = manifesto(g);
  if (o.diff) {
    const ant = JSON.parse(fs.readFileSync(o.diff, "utf8"));
    const d = diferenca(g, ant);
    if (d.arquivos.length) escreverXlsx(o.saida, d.arquivos, g.ate);
    fs.writeFileSync(path.join(o.saida, `correcao-${g.ate}-manifesto.json`), JSON.stringify(man) + "\n");
    console.log(`correção de ${ant.ate} (versão ${ant.versao}) para ${g.ate} (versão ${g.versao}):`);
    for (const a of d.arquivos) console.log(`  ${a.nome}: ${a.linhas.length} linhas`);
    if (!d.arquivos.length) console.log("  nada novo");
    const sum = Object.entries(d.sumiram).filter(([, n]) => n);
    if (sum.length) console.log(`  atenção: linhas do manifesto anterior que não existem mais (${sum.map(([t, n]) => `${t} ${n}`).join(", ")}). A correção só acrescenta; veja docs/dados-de-teste.md.`);
    return;
  }
  escreverXlsx(o.saida, g.arquivos, g.ate);
  fs.writeFileSync(path.join(o.saida, "manifesto.json"), JSON.stringify(man) + "\n");
  fs.writeFileSync(path.join(o.saida, "README.md"), readme(g, man));
  console.log(`versão ${g.versao}, semente ${g.semente}, até ${g.ate} -> ${path.resolve(o.saida)}`);
  for (const a of man.arquivos) console.log(`  ${a.nome}: ${a.linhas} linhas${a.ignoradas ? ` (${a.ignoradas} ignoradas)` : ""}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
