// Minha carteira: extratos da B3 importados pela própria pessoa, cifrados no banco, e o que se calcula com eles.
//
// A página lê os .xlsx no navegador (SheetJS) e manda só as linhas, como arrays no formato do cabeçalho da B3.
// Aqui cada linha é conferida, reduzida ao que pode ser guardado e deduplicada contra o que já existe.
//
// Collection carteira/<email>, cinco docs, todos cifrados por src/cofre.js:
// - extrato: { v, neg, mov, prov } em arrays compactos (formato abaixo), cada linha marcada com o id da importação;
// - importacoes: { lista: [{ id, em, arquivos: [{ tipo, hash, linhas, novos, repetidos, ignorados, de, ate }] }] };
// - meta: { alvo, aporte, yield, reinvestir, atualizado };
// - simulacoes e mensal: o simulador de reinvestimento (seção própria, mais abaixo).
//
// Linhas guardadas (nunca nome, CPF, conta, CNPJ, ISIN, a linha "Produto" inteira, razão social nem totais em dinheiro):
//   neg:  [data, "C"|"V", papel, quantidade, preço, corretora, imp]
//   mov:  [data, "C"|"D", tipo, papel, quantidade, preço unitário | null, corretora, imp]
//   prov: [data, papel, tipo, quantidade | null, valor por cota | null, líquido, corretora, imp]
// data em AAAA-MM-DD, papel como veio (COGN3F fica com o F; soma com COGN3 só no cálculo), corretora em sigla curta.
//
// Este arquivo não importa nada do Worker, para os testes rodarem no Node; as leituras e gravações chegam em `deps`.

import { cifrar, decifrar, cofreLigado } from "./cofre.js";
import { reinvestir, UNIVERSOS, APORTE_PADRAO } from "./pontuacao-fii.js";
import { validarReinvestir, respostaReinvestir } from "./prefs.js";

// ---------- formato das linhas ----------

// Papel da B3: 4 caracteres (o segundo a quarto podem ser dígito: B3SA3, M1TA34), 1 ou 2 dígitos e o F do fracionário.
export const PAPEL_CART = /^[A-Z][A-Z0-9]{3}\d{1,2}F?$/;
export const MAX_LINHAS = 20000;
const MAX_ARQUIVOS = 40;
const MAX_IMPORTACOES = 200;

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const chaveTxt = (s) => semAcento(s).toLowerCase().replace(/\s+/g, " ").trim();

// Corretora: sigla curta por mapa; desconhecida vira a primeira palavra em Title Case. Nunca a razão social.
const CORRETORAS = [
  [/^XP\b/, "XP"], [/^RICO\b/, "Rico"], [/^CLEAR\b/, "Clear"], [/^MODAL\b/, "Modal"], [/^NU ?INVEST\b/, "Nu Invest"],
  [/^NU\b/, "Nu Invest"], [/^BTG\b/, "BTG"], [/^INTER\b/, "Inter"], [/^BANCO INTER\b/, "Inter"], [/^ITAU\b/, "Itaú"],
  [/^BRADESCO\b/, "Bradesco"], [/^AGORA\b/, "Ágora"], [/^ORAMA\b/, "Órama"], [/^GENIAL\b/, "Genial"], [/^TORO\b/, "Toro"],
  [/^SANTANDER\b/, "Santander"], [/^BB\b/, "BB"], [/^BANCO DO BRASIL\b/, "BB"], [/^C6\b/, "C6"], [/^MIRAE\b/, "Mirae"],
  [/^GUIDE\b/, "Guide"], [/^WARREN\b/, "Warren"], [/^SAFRA\b/, "Safra"], [/^CAIXA\b/, "Caixa"], [/^SICREDI\b/, "Sicredi"],
  [/^SICOOB\b/, "Sicoob"], [/^PAGBANK\b|^PAGSEGURO\b/, "PagBank"], [/^MERCADO PAGO\b/, "Mercado Pago"], [/^AVENUE\b/, "Avenue"],
];
const CURTAS = new Set(CORRETORAS.map(([, n]) => n));
export function siglaCorretora(v) {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (CURTAS.has(t)) return t;
  const k = semAcento(t).toUpperCase();
  for (const [re, nome] of CORRETORAS) if (re.test(k)) return nome;
  const p = t.split(/[\s\-/.,]+/).find(Boolean) || "";
  return (p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).slice(0, 20);
}

// Tipos da Movimentação, normalizados. Os com " - Transferido" e " - Cancelado" ganham o sufixo e não mexem em nada.
const TIPOS_MOV = {
  "transferencia - liquidacao": "liq", "transferencia": "transf", "transferencia sem financeiro": "transf-sf",
  "compra": "compra", "venda": "venda", "compra / venda": "compra-venda",
  "rendimento": "rend", "dividendo": "div", "juros sobre capital proprio": "jcp", "amortizacao": "amort",
  "reembolso": "reemb", "resgate": "resgate", "emprestimo": "emp",
  "direito de subscricao": "dir", "direitos de subscricao": "dir", "direito sobras de subscricao": "dir",
  "direitos de subscricao - exercido": "dir-exe", "direito de subscricao - exercido": "dir-exe", "direito sobras de subscricao - exercido": "dir-exe",
  "direitos de subscricao - nao exercido": "dir-nexe", "direito de subscricao - nao exercido": "dir-nexe", "direito sobras de subscricao - nao exercido": "dir-nexe",
  "cessao de direitos": "cessao", "cessao de direitos - solicitada": "cessao-sol",
  "solicitacao de subscricao": "sub-sol", "recibo de subscricao": "recibo",
  "atualizacao": "atual", "bonificacao em ativos": "bonif", "desdobro": "desdobro", "grupamento": "grupamento",
  "fracao em ativos": "fracao", "leilao de fracao": "leilao", "retirada de custodia": "retirada", "vencimento": "venc",
};
export function tipoMov(v) {
  let k = chaveTxt(v);
  let suf = "";
  const m = / - (transferido|cancelado)$/.exec(k);
  if (m) { suf = m[1] === "transferido" ? "~t" : "~c"; k = k.slice(0, m.index); }
  const t = TIPOS_MOV[k];
  if (t) return t + suf;
  return "x:" + k.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}
// Efeito de cada tipo na quantidade: "sinal" soma no Crédito e tira no Débito; "zera" encerra o código; o resto não mexe.
const SINAL = new Set(["liq", "transf", "transf-sf", "compra", "venda", "compra-venda", "bonif", "desdobro", "grupamento", "dir", "recibo", "atual", "fracao", "retirada", "venc", "dir-exe"]);
const NADA = new Set(["rend", "div", "jcp", "amort", "reemb", "resgate", "leilao", "cessao", "cessao-sol", "sub-sol", "emp"]);
export const efeitoMov = (t) => (t.startsWith("x:") ? "desconhecido" : t.includes("~") || NADA.has(t) ? "nada" : t === "dir-nexe" ? "zera" : SINAL.has(t) ? "sinal" : "desconhecido");
const TIPO_PROV_MOV = { rend: "rend", div: "div", jcp: "jcp", amort: "amort" };

const TIPOS_PROV = { "rendimento": "rend", "dividendo": "div", "juros sobre capital proprio": "jcp", "amortizacao": "amort", "reembolso": "reemb" };
export const tipoProv = (v) => TIPOS_PROV[chaveTxt(v)] || "outro";

// Número como a B3 manda: número de verdade, "1.037" (milhar), "25,86" (vírgula decimal), "R$ 1.234,56" ou "-".
export function numero(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let t = String(v ?? "").replace(/R\$|\s|\u00a0/g, "").trim();
  if (!t || t === "-" || t === "–") return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
// Data dd/mm/aaaa, AAAA-MM-DD ou número de série do Excel; devolve AAAA-MM-DD ou "".
export function dataIso(v) {
  let a, m, d;
  if (typeof v === "number" && Number.isFinite(v) && v > 20000 && v < 80000) {
    const x = new Date(Math.round((v - 25569) * 86400000));
    a = x.getUTCFullYear(); m = x.getUTCMonth() + 1; d = x.getUTCDate();
  } else {
    const t = String(v ?? "").trim();
    let r = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
    if (r) { d = +r[1]; m = +r[2]; a = +r[3]; }
    else if ((r = /^(\d{4})-(\d{2})-(\d{2})/.exec(t))) { a = +r[1]; m = +r[2]; d = +r[3]; }
    else return "";
  }
  if (a < 1990 || a > 2100 || m < 1 || m > 12 || d < 1) return "";
  const dias = new Date(Date.UTC(a, m, 0)).getUTCDate();
  if (d > dias) return "";
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
// Só o código, de antes do " - " ("PETR4 - PETROLEO BRASILEIRO S/A" vira PETR4).
export const papelDe = (v) => String(v ?? "").split(" - ")[0].replace(/\s+/g, "").toUpperCase();
const r8 = (x) => (x == null ? null : Math.round(x * 1e8) / 1e8);

// Uma linha crua -> linha compacta, ou { erro } com o motivo do descarte.
export function normalizarLinha(tipo, l, imp = "") {
  if (!Array.isArray(l)) return { erro: "formato" };
  if (l.every((v) => v == null || String(v).trim() === "")) return { erro: "vazia" };
  if (tipo === "negociacao") {
    const data = dataIso(l[0]), cv = chaveTxt(l[1]), papel = papelDe(l[5]);
    const q = numero(l[6]), p = numero(l[7]);
    if (!data) return { erro: "data" };
    if (!PAPEL_CART.test(papel)) return { erro: "papel" };
    if (cv !== "compra" && cv !== "venda") return { erro: "tipo" };
    if (q == null || q <= 0 || p == null || p < 0) return { erro: "numero" };
    return { linha: [data, cv === "compra" ? "C" : "V", papel, r8(q), r8(p), siglaCorretora(l[4]), imp] };
  }
  if (tipo === "movimentacao") {
    const es = chaveTxt(l[0]), data = dataIso(l[1]), t = tipoMov(l[2]), papel = papelDe(l[3]);
    const q = numero(l[5]), p = numero(l[6]);
    if (!data) return { erro: "data" };
    if (!PAPEL_CART.test(papel)) return { erro: "papel" };
    if (es !== "credito" && es !== "debito") return { erro: "tipo" };
    if (q == null || q < 0 || (p != null && p < 0)) return { erro: "numero" };
    return { linha: [data, es === "credito" ? "C" : "D", t, papel, r8(q), p == null ? null : r8(p), siglaCorretora(l[4]), imp] };
  }
  if (tipo === "proventos") {
    const papel = papelDe(l[0]), data = dataIso(l[1]);
    const q = numero(l[4]), p = numero(l[5]), liq = numero(l[6]);
    if (!data) return { erro: "data" };
    if (!PAPEL_CART.test(papel)) return { erro: "papel" };
    if (liq == null || (q != null && q < 0)) return { erro: "numero" };
    return { linha: [data, papel, tipoProv(l[2]), q == null ? null : r8(q), p == null ? null : r8(p), r8(liq), siglaCorretora(l[3]), imp] };
  }
  return { erro: "tipo" };
}

// Chave de deduplicação: tudo menos o id da importação.
export function chaveLinha(tipo, x) {
  if (tipo === "negociacao") return x.slice(0, 6).join("|");
  if (tipo === "movimentacao") return x.slice(0, 7).map((v) => (v == null ? "" : v)).join("|");
  return x.slice(0, 7).map((v) => (v == null ? "" : v)).join("|");
}
const CAMPO = { negociacao: "neg", movimentacao: "mov", proventos: "prov" };
export const extratoVazio = () => ({ v: 1, neg: [], mov: [], prov: [] });

// Junta arquivos novos no extrato. Deduplica por multiconjunto: a linha que aparece k vezes no banco e m vezes no
// arquivo entra max(0, m - k) vezes. Reimportar o mesmo arquivo dá zero novos, e duas compras iguais no mesmo dia
// (mesma data, papel, quantidade, preço e corretora) no mesmo arquivo continuam sendo duas.
// Devolve { extrato, porArquivo, novos, repetidos, ignorados } sem mexer no extrato recebido.
export function mesclar(extrato, arquivos, imp) {
  const ex = { v: 1, neg: [...(extrato?.neg || [])], mov: [...(extrato?.mov || [])], prov: [...(extrato?.prov || [])] };
  const contagem = {};
  for (const [tipo, campo] of Object.entries(CAMPO)) {
    const c = new Map();
    for (const x of ex[campo]) { const k = chaveLinha(tipo, x); c.set(k, (c.get(k) || 0) + 1); }
    contagem[tipo] = c;
  }
  const porArquivo = [];
  let novos = 0, repetidos = 0, ignorados = 0;
  for (const a of arquivos) {
    const campo = CAMPO[a.tipo];
    const r = { nome: a.nome, tipo: a.tipo, hash: a.hash, linhas: 0, novos: 0, repetidos: 0, ignorados: 0, motivos: {}, de: "", ate: "", tiposDesconhecidos: {} };
    if (!campo) { r.ignorados = (a.linhas || []).length; r.motivos.tipo = r.ignorados; porArquivo.push(r); ignorados += r.ignorados; continue; }
    const doArquivo = new Map(), linhas = [];
    for (const l of a.linhas || []) {
      const n = normalizarLinha(a.tipo, l, imp);
      if (n.erro) { if (n.erro !== "vazia") { r.ignorados++; r.motivos[n.erro] = (r.motivos[n.erro] || 0) + 1; } continue; }
      r.linhas++;
      const k = chaveLinha(a.tipo, n.linha);
      doArquivo.set(k, (doArquivo.get(k) || 0) + 1);
      linhas.push([k, n.linha]);
      const d = n.linha[0];
      if (!r.de || d < r.de) r.de = d;
      if (!r.ate || d > r.ate) r.ate = d;
      if (a.tipo === "movimentacao" && n.linha[2].startsWith("x:")) r.tiposDesconhecidos[n.linha[2].slice(2)] = (r.tiposDesconhecidos[n.linha[2].slice(2)] || 0) + 1;
    }
    const c = contagem[a.tipo], vistos = new Map();
    for (const [k, linha] of linhas) {
      const ja = c.get(k) || 0, n = (vistos.get(k) || 0) + 1;
      vistos.set(k, n);
      if (n > ja) { ex[campo].push(linha); r.novos++; } else r.repetidos++;
    }
    for (const [k, n] of vistos) c.set(k, Math.max(c.get(k) || 0, n));
    novos += r.novos; repetidos += r.repetidos; ignorados += r.ignorados;
    porArquivo.push(r);
  }
  for (const campo of Object.values(CAMPO)) ex[campo].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  return { extrato: ex, porArquivo, novos, repetidos, ignorados };
}

// Tira as linhas de uma importação. Devolve { extrato, removidas }.
export function desfazer(extrato, imp) {
  let removidas = 0;
  const ex = { v: 1 };
  for (const campo of Object.values(CAMPO)) {
    const idx = campo === "neg" ? 6 : 7;
    ex[campo] = (extrato?.[campo] || []).filter((x) => (x[idx] === imp ? (removidas++, false) : true));
  }
  return { extrato: ex, removidas };
}

// ---------- cálculo ----------

const sufixo = (t) => { const m = /(\d{1,2})F?$/.exec(t); return m ? Number(m[1]) : null; };
const baseDe = (t) => String(t).replace(/F$/, "");
const raizDe = (t) => String(t).slice(0, 4);
const SUB = new Set([1, 2, 9, 10, 12, 13, 14, 15]);
const RECIBO = new Set([9, 10, 13, 14, 15]);
const BDR = new Set([31, 32, 33, 34, 35, 39]);
const ehSub = (t) => SUB.has(sufixo(t));
const ym = (d) => d.slice(0, 7);
export function somarMeses(mes, n) {
  const [a, m] = mes.split("-").map(Number);
  const x = a * 12 + (m - 1) + n;
  return `${Math.floor(x / 12)}-${String((x % 12) + 1).padStart(2, "0")}`;
}
const mesesEntre = (de, ate) => { const out = []; for (let m = de; m <= ate && out.length < 1200; m = somarMeses(m, 1)) out.push(m); return out; };
const r2 = (x) => Math.round(x * 100) / 100;

// Classe do papel. FII, ETF e units terminam em 11; o que decide é estar nas tabelas da B3 ou no informe da CVM.
export function classeDe(t, ref = {}) {
  const b = baseDe(t), s = sufixo(b);
  if (SUB.has(s)) return "subscricao";
  if (ref.etfs && ref.etfs.has(b)) return "etf";
  if (ref.fiinfra && ref.fiinfra.has(b)) return "fiinfra";
  if (ref.fiagro && ref.fiagro.has(b)) return "fiagro";
  if (ref.fiis && ref.fiis.has(b)) return "fii";
  if (ref.acoes && ref.acoes.has(b)) return "acao";
  if (BDR.has(s) || (ref.bdrs && ref.bdrs.has(b))) return "bdr";
  if (s >= 3 && s <= 8) return "acao";
  return "outro";
}

// Rentabilidade por cotas (TWR). meses: [{ v0, fluxo, v1, prov }] em ordem; cada mês rende
// (v1 + prov - v0 - fluxo) / (v0 + fluxo), com o aporte (fluxo) no começo do mês. Mês sem base (v0 + fluxo <= 0) não conta.
export function twr(meses) {
  let acc = 1;
  for (const m of meses) {
    const base = (m.v0 || 0) + (m.fluxo || 0);
    if (base <= 0) continue;
    acc *= 1 + ((m.v1 || 0) + (m.prov || 0) - base) / base;
  }
  return acc - 1;
}

// Meses até a renda mensal chegar ao alvo. Cada mês: renda = P × y / 12; depois P += aporte (+ renda, se reinvestir).
// Devolve o número de meses (0 = já chegou) ou null se não chegar em `limite` meses.
export function mesesAteAlvo({ alvo, aporte, y, reinvestir = true, p0 = 0, limite = 480 }) {
  if (!(alvo > 0) || !(y > 0)) return null;
  let p = p0;
  for (let m = 0; m <= limite; m++) {
    const renda = (p * y) / 12;
    if (renda >= alvo - 1e-9) return m;
    p += (aporte || 0) + (reinvestir ? renda : 0);
  }
  return null;
}
export function serieProjetada({ aporte, y, reinvestir = true, p0 = 0, meses }) {
  const out = [];
  let p = p0;
  for (let m = 0; m <= meses; m++) {
    const renda = (p * y) / 12;
    out.push(r2(renda));
    p += (aporte || 0) + (reinvestir ? renda : 0);
  }
  return out;
}
// Aporte mensal para chegar ao alvo em `prazo` meses (busca binária, ao centavo).
export function aporteNecessario({ alvo, y, reinvestir = true, p0 = 0, prazo = 120 }) {
  if (!(alvo > 0) || !(y > 0)) return null;
  if ((mesesAteAlvo({ alvo, aporte: 0, y, reinvestir, p0, limite: prazo }) ?? Infinity) <= prazo) return 0;
  let lo = 0, hi = (alvo * 12) / y;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if ((mesesAteAlvo({ alvo, aporte: mid, y, reinvestir, p0, limite: prazo }) ?? Infinity) <= prazo) hi = mid; else lo = mid;
  }
  return Math.ceil(hi * 100) / 100;
}

export const META_PADRAO = { alvo: null, aporte: null, yield: null, reinvestir: true };
export function validarMeta(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return { erro: "corpo" };
  const num = (v, min, max, nome) => {
    if (v === null || v === undefined || v === "") return { v: null };
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) return { erro: `${nome} fora do intervalo.` };
    return { v: n };
  };
  const a = num(b.alvo, 1, 10_000_000, "Meta"), ap = num(b.aporte, 0, 10_000_000, "Aporte"), y = num(b.yield, 0.001, 1, "Yield");
  for (const x of [a, ap, y]) if (x.erro) return { erro: x.erro };
  if (a.v == null) return { erro: "Defina a meta de renda por mês." };
  return { meta: { alvo: r2(a.v), aporte: ap.v == null ? 0 : r2(ap.v), yield: y.v == null ? null : Math.round(y.v * 1e4) / 1e4, reinvestir: b.reinvestir !== false } };
}

function referencias({ b3, fiiResumo }) {
  const set = (l) => new Set((l || []).map((x) => x.t));
  const cot = new Map();
  for (const k of ["acoes", "fiis", "fiinfra", "fiagro", "etfs", "bdrs"]) for (const x of (b3 && b3[k]) || []) if (!cot.has(x.t)) cot.set(x.t, x);
  const fundos = (fiiResumo && fiiResumo.fundos) || {};
  // meta/b3 de antes da separação (sem fiinfra/fiagro): decide pelo subType que veio junto na lista de FIIs
  const antigo = b3 && !b3.fiinfra && Array.isArray(b3.fiis);
  const doSub = (subs) => new Set(antigo ? b3.fiis.filter((x) => subs.includes(String(x.sub || "").toLowerCase())).map((x) => x.t) : []);
  return {
    cot, fundos,
    acoes: set(b3 && b3.acoes), etfs: set(b3 && b3.etfs), bdrs: set(b3 && b3.bdrs),
    fiinfra: antigo ? doSub(["fi-infra", "fiinfra", "fip"]) : set(b3 && b3.fiinfra),
    fiagro: antigo ? doSub(["fi-agro", "fiagro"]) : set(b3 && b3.fiagro),
    fiis: new Set([...set(b3 && b3.fiis), ...Object.keys(fundos)]),
  };
}

// Carteira por lote (FIFO), ao lado do preço médio (que continua sendo o oficial, o da Receita). Cada entrada vira um
// lote { d, q, preco, origem }: compra ("compra", preço do negócio), subscrição que virou cota ("subscricao", preço do
// exercício), bonificação ("bonificacao", o valor que o extrato trouxer ou zero), transferência de entrada
// ("transferencia", o preço médio na data, por falta de dado melhor), fração em ativos ("fracao", zero; quando sai,
// sai ela mesma) e o resto que soma quantidade sem preço ("ajuste", zero). Desdobro e grupamento mudam q e preço de todos os lotes na proporção. Venda, transferência de saída, retirada
// e vencimento baixam do lote mais antigo. Conta: entrou = baixadoVendas + baixadoOutros + custo dos lotes que sobram.
function filaFifo(evs, L, ano) {
  const lotes = [], vendas = [];
  const c = { entrou: 0, baixadoVendas: 0, baixadoOutros: 0, realizado: 0, realizadoAno: 0, acerto: 0 };
  const custoDe = (ls) => ls.reduce((s, l) => s + l.q * l.preco, 0);
  const entrar = (d, q, preco, origem) => { if (!(q > 1e-9)) return; lotes.push({ d, q, preco, origem }); c.entrou += q * preco; };
  // Baixa do mais antigo. A fração que sai (Fração em Ativos no Débito) é a mesma que entrou: sai antes do lote de fração.
  const consumir = (q, origem) => {
    const usados = [];
    let resta = q;
    const tirar = (i) => {
      const l = lotes[i], usa = Math.min(l.q, resta);
      usados.push({ d: l.d, q: usa, preco: l.preco });
      l.q -= usa; resta -= usa;
      if (l.q <= 1e-9) lotes.splice(i, 1);
    };
    if (origem) for (let i = lotes.length - 1; i >= 0 && resta > 1e-9; i--) if (lotes[i].origem === origem) tirar(i);
    while (resta > 1e-9 && lotes.length) tirar(0);
    return { usados, resta: resta > 1e-9 ? resta : 0 };
  };
  const pmNaData = (d) => { let pm = null; for (const s of L.passos) { if (s.d > d) break; if (s.pm != null) pm = s.pm; } return pm != null ? pm : L.q > 1e-9 && L.custo > 0 ? L.custo / L.q : 0; };
  const perda = (d, v) => { c.realizado -= v; if (d.startsWith(ano)) c.realizadoAno -= v; };
  for (const e of evs) {
    if (e.k === "C") entrar(e.d, e.q, e.p, "compra");
    else if (e.k === "V") {
      const { usados, resta } = consumir(e.q);
      const custo = custoDe(usados), valor = e.q * e.p, res = valor - custo;
      c.baixadoVendas += custo; c.realizado += res;
      if (e.d.startsWith(ano)) c.realizadoAno += res;
      vendas.push({
        d: e.d, q: r8(e.q), precoVenda: r8(e.p), valor: r2(valor),
        lotes: usados.map((u) => ({ dLote: u.d, q: r8(u.q), precoLote: r8(u.preco), resultado: r2(u.q * (e.p - u.preco)) })),
        semLote: r8(resta), resultado: r2(res), resultadoPm: r2(e.resPm ?? res),
      });
    } else if (e.k === "ajuste" || e.k === "transf") {
      const origem = e.k === "transf" ? "transferencia" : e.t === "fracao" ? "fracao" : "ajuste";
      if (e.q >= 0) entrar(e.d, e.q, e.k === "transf" ? pmNaData(e.d) : 0, origem);
      else c.baixadoOutros += custoDe(consumir(-e.q, origem === "fracao" ? "fracao" : null).usados);
    } else if (e.k === "proporcao") {
      if (e.t === "bonif" && e.q > 0) { entrar(e.d, e.q, e.p > 0 ? e.p : 0, "bonificacao"); continue; }
      const tot = lotes.reduce((s, l) => s + l.q, 0);
      if (tot <= 1e-9) continue;
      const f = (tot + e.q) / tot;
      if (f <= 1e-9) { c.baixadoOutros += custoDe(lotes); lotes.length = 0; continue; }
      for (const l of lotes) { l.q *= f; l.preco /= f; }
    } else if (e.k === "zera") {
      const v = custoDe(lotes);
      c.baixadoOutros += v;
      if (v > 0) perda(e.d, v);
      lotes.length = 0;
    } else if (e.k === "atual") {
      const v = e.custoAtual || 0;
      entrar(e.d, e.q, e.q > 0 ? v / e.q : 0, v > 0 ? "subscricao" : "ajuste");
    }
  }
  // A quantidade que vale é a da posição (Movimentação). Se a fila não bate com ela, acerta e anota em `acerto`.
  const acertar = (q, d) => {
    const tot = lotes.reduce((s, l) => s + l.q, 0);
    if (tot > q + 1e-6) { c.acerto += tot - q; c.baixadoOutros += custoDe(consumir(tot - q).usados); }
    else if (tot < q - 1e-6) { c.acerto += q - tot; entrar(d, q - tot, pmNaData(d), "ajuste"); }
  };
  return { lotes, vendas, c, acertar, custo: () => custoDe(lotes) };
}

// Os lotes que sobram numa posição aberta, contra a cotação de hoje (sem cotação: valor pelo preço médio, sem diferença).
const pct2 = (a, b) => (b > 0 ? Math.round((a / b) * 1e4) / 100 : null);
function lotesDaPosicao(F, preco, precoUsado, valor, contaFifo) {
  if (!F) return { lotes: [], fifo: null, vendas: [] };
  const lotes = F.lotes.map((l) => {
    const custo = l.q * l.preco, hojeL = precoUsado != null ? l.q * precoUsado : null;
    return { d: l.d, q: r8(l.q), preco: r8(l.preco), origem: l.origem, custo: r2(custo), hoje: hojeL == null ? null : r2(hojeL), diferenca: preco == null ? null : r2(hojeL - custo), pct: preco == null ? null : pct2(hojeL - custo, custo) };
  });
  const fc = F.custo();
  return { lotes, fifo: { custo: r2(fc), resultado: preco == null ? null : r2(valor - fc), pct: preco == null ? null : pct2(valor - fc, fc), ...contaFifo() }, vendas: F.vendas };
}

// Tudo que a página mostra, a partir do extrato decifrado. ctx: { b3, fiiResumo, importacoes, meta, hoje: "AAAA-MM-DD" }.
export function calcular(extrato, ctx = {}) {
  const ex = extrato || extratoVazio();
  const hoje = ctx.hoje || new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const mesAtual = ym(hoje);
  const ref = referencias(ctx);
  const avisos = {};
  const avisar = (k, n = 1) => { avisos[k] = (avisos[k] || 0) + n; };

  // 1. Quantidade pela Movimentação, por código e corretora (fracionário junto do lote)
  const movs = [...ex.mov].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] === b[1] ? 0 : a[1] === "C" ? -1 : 1));
  const qMov = new Map(); // base -> Map(corr -> q)
  const comMov = new Set();
  const emprestimo = new Map(); // base -> { d, q }
  const ultimoMov = new Map(); // base -> data da última linha que mexeu na quantidade
  const pegar = (b, c) => { if (!qMov.has(b)) qMov.set(b, new Map()); const m = qMov.get(b); return [m, m.get(c) || 0]; };
  for (const [d, es, t, papel, q, , corr] of movs) {
    const b = baseDe(papel), ef = efeitoMov(t);
    if (ef === "desconhecido") { avisar("tipo:" + t.replace(/^x:/, "")); continue; }
    if (t === "emp") { if (q > 0) emprestimo.set(b, { d, q }); continue; }
    if (ef === "nada") continue;
    comMov.add(b);
    ultimoMov.set(b, d);
    const [m, atual] = pegar(b, corr);
    if (ef === "zera") { m.set(corr, 0); continue; }
    const sinal = es === "C" ? 1 : -1;
    m.set(corr, atual + sinal * q);
    // Atualização no papel (fora dos recibos): o recibo da mesma raiz virou cota e sai da carteira
    if (t === "atual" && es === "C" && !ehSub(b)) {
      let resta = q;
      for (const [cod, porCorr] of qMov) {
        if (resta <= 0) break;
        if (cod === b || raizDe(cod) !== raizDe(b) || !RECIBO.has(sufixo(cod))) continue;
        const tem = porCorr.get(corr) || 0;
        if (tem > 0) { const usa = Math.min(tem, resta); porCorr.set(corr, tem - usa); resta -= usa; }
      }
    }
  }

  // 2. Preço médio pela Negociação (Movimentação de liquidação quando o papel não tem Negociação), com os eventos
  const trades = new Map(); // base -> [{ d, k: "C"|"V", q, p, corr }]
  for (const [d, cv, papel, q, p, corr] of ex.neg) {
    const b = baseDe(papel);
    if (!trades.has(b)) trades.set(b, []);
    trades.get(b).push({ d, k: cv, q, p, corr });
  }
  const temNeg = new Set(trades.keys());
  for (const [d, es, t, papel, q, p, corr] of ex.mov) {
    const b = baseDe(papel);
    if (t !== "liq" || p == null || temNeg.has(b)) continue;
    if (!trades.has(b)) trades.set(b, []);
    trades.get(b).push({ d, k: es === "C" ? "C" : "V", q, p, corr });
  }
  const eventos = new Map(); // base -> [{ d, k, q, p }]
  const subPreco = new Map(); // raiz -> [{ q, p }] subscrições exercidas esperando virar cota
  const addEv = (b, e) => { if (!eventos.has(b)) eventos.set(b, []); eventos.get(b).push(e); };
  for (const [d, es, t, papel, q, p] of movs) {
    const b = baseDe(papel);
    if (["bonif", "desdobro", "grupamento"].includes(t)) addEv(b, { d, k: "proporcao", q: es === "C" ? q : -q, t, p });
    else if (["fracao", "retirada", "venc"].includes(t)) addEv(b, { d, k: "ajuste", q: es === "C" ? q : -q, t });
    else if (t === "dir") addEv(b, { d, k: "ajuste", q: es === "C" ? q : -q });
    else if (t === "dir-nexe") addEv(b, { d, k: "zera" });
    else if (t === "dir-exe") { addEv(b, { d, k: "ajuste", q: -q }); if (p != null && p > 0) addEv("#sub:" + raizDe(b), { d, k: "subPreco", q, p }); }
    else if (t === "recibo" || (t === "atual" && ehSub(b))) addEv(b, { d, k: "ajuste", q: es === "C" ? q : -q });
    else if (t === "atual" && es === "C") addEv(b, { d, k: "atual", q });
  }
  for (const [k, l] of eventos) if (k.startsWith("#sub:")) subPreco.set(k.slice(5), l.sort((a, b) => (a.d < b.d ? -1 : 1)).map((x) => ({ ...x })));

  // Transferência por papel e dia (saldo: entre corretoras no mesmo dia se anula), só para os lotes
  const transfDia = new Map(); // base -> Map(d -> saldo)
  for (const [d, es, t, papel, q] of ex.mov) {
    if (t !== "transf" && t !== "transf-sf") continue;
    const b = baseDe(papel);
    if (!transfDia.has(b)) transfDia.set(b, new Map());
    const m = transfDia.get(b);
    m.set(d, (m.get(d) || 0) + (es === "C" ? q : -q));
  }
  const bases = new Set([...trades.keys(), ...[...eventos.keys()].filter((k) => !k.startsWith("#")), ...qMov.keys()]);
  const livro = new Map(); // base -> { q, custo, realizado, vendas: [], porMes: Map(mes -> q), primeiro, ultimo, compras }
  const vendasTodas = []; // { d, b, valor, custo }
  const fluxoMes = new Map(); // mes -> { compras, vendas }
  const somaFluxo = (mes, k, v) => { if (!fluxoMes.has(mes)) fluxoMes.set(mes, { compras: 0, vendas: 0 }); fluxoMes.get(mes)[k] += v; };
  // compras menos vendas por papel e mês (Reinvestir: compras recentes do equilíbrio); classe junto, para separar os FIIs
  const fluxoPapel = new Map(); // base -> { classe, meses: Map(mes -> compras − vendas) }
  const somaPapel = (b, mes, v) => { if (!fluxoPapel.has(b)) fluxoPapel.set(b, { meses: new Map() }); const m = fluxoPapel.get(b).meses; m.set(mes, (m.get(mes) || 0) + v); };
  for (const b of bases) {
    const evs = [...(trades.get(b) || []).map((x) => ({ ...x, ord: 0 })), ...(eventos.get(b) || []).map((x) => ({ ...x, ord: 1 }))]
      .sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : x.ord - y.ord));
    const L = { q: 0, custo: 0, realizado: 0, pago: 0, recebido: 0, primeiro: evs[0] ? evs[0].d : "", ultimo: evs.length ? evs[evs.length - 1].d : "", passos: [] };
    for (const e of evs) {
      if (e.k === "C") { L.q += e.q; L.custo += e.q * e.p; L.pago += e.q * e.p; somaFluxo(ym(e.d), "compras", e.q * e.p); somaPapel(b, ym(e.d), e.q * e.p); L.ultPreco = e.p; }
      else if (e.k === "V") {
        const q = Math.min(e.q, Math.max(L.q, 0));
        const baixa = L.q > 0 ? (L.custo / L.q) * q : 0;
        const valor = e.q * e.p;
        const res = valor - baixa;
        L.realizado += res; L.recebido += valor;
        e.resPm = res; // para a venda por lote mostrar os dois resultados lado a lado
        vendasTodas.push({ d: e.d, b, valor, custo: baixa, res });
        somaFluxo(ym(e.d), "vendas", valor);
        somaPapel(b, ym(e.d), -valor);
        L.q -= e.q; L.custo -= baixa;
        if (L.q <= 1e-9) { L.q = 0; L.custo = 0; }
        L.ultPreco = e.p;
      } else if (e.k === "ajuste") {
        if (e.q >= 0) L.q += e.q;
        else { const q = Math.min(-e.q, Math.max(L.q, 0)); if (L.q > 0) L.custo -= (L.custo / L.q) * q; L.q -= q; }
        if (L.q <= 1e-9) { L.q = 0; L.custo = 0; }
      } else if (e.k === "proporcao") {
        // bonificação, desdobro e grupamento: muda a quantidade e o custo total fica, então o PM anda na proporção
        L.q = Math.max(0, L.q + e.q);
        if (L.q <= 1e-9) { L.q = 0; L.custo = 0; }
      } else if (e.k === "zera") {
        if (L.custo > 0) { L.realizado -= L.custo; vendasTodas.push({ d: e.d, b, valor: 0, custo: L.custo, res: -L.custo, zera: true }); }
        L.q = 0; L.custo = 0;
      } else if (e.k === "atual") {
        let resta = e.q;
        const fila = subPreco.get(raizDe(b)) || [];
        e.custoAtual = 0;
        for (const s of fila) {
          if (resta <= 0) break;
          if (s.d > e.d || s.q <= 0) continue;
          const usa = Math.min(s.q, resta);
          L.custo += usa * s.p; L.pago += usa * s.p; somaFluxo(ym(e.d), "compras", usa * s.p);
          e.custoAtual += usa * s.p;
          s.q -= usa; resta -= usa;
        }
        L.q += e.q;
      }
      L.passos.push({ d: e.d, q: L.q, pm: L.q > 1e-9 ? L.custo / L.q : null });
    }
    // Por lote (FIFO): os mesmos eventos e as transferências da Movimentação, que o preço médio não usa
    const transf = [...(transfDia.get(b) || [])].filter(([, s]) => Math.abs(s) > 1e-9).map(([d, s]) => ({ d, k: "transf", q: s, ord: 2 }));
    L.fifo = filaFifo(transf.length ? [...evs, ...transf].sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : x.ord - y.ord)) : evs, L, hoje.slice(0, 4));
    livro.set(b, L);
  }

  // 3. Posições
  const classeCache = new Map();
  const classe = (b) => { if (!classeCache.has(b)) classeCache.set(b, classeDe(b, ref)); return classeCache.get(b); };
  const nomeDe = (b) => { const f = ref.fundos[b]; if (f && f.n) return f.n; const c = ref.cot.get(b); return c ? c.nome || "" : ""; };
  const segDe = (b) => (ref.fundos[b] && ref.fundos[b].s) || "";

  // Proventos: arquivo de proventos; a Movimentação completa os períodos que nenhum arquivo de proventos cobriu
  const cobertura = [];
  for (const imp of (ctx.importacoes && ctx.importacoes.lista) || [])
    for (const a of imp.arquivos || []) if (a.tipo === "proventos" && a.de && a.ate) cobertura.push([a.de, a.ate]);
  const coberto = (d) => cobertura.some(([de, ate]) => d >= de && d <= ate);
  const provs = [];
  for (const [d, papel, tipo, q, pc, liq, corr] of ex.prov) provs.push([d, baseDe(papel), tipo, q, pc, liq, corr, "p"]);
  let daMov = 0;
  for (const [d, es, t, papel, q, p, corr] of ex.mov) {
    const tp = TIPO_PROV_MOV[t];
    if (!tp || es !== "C" || p == null || coberto(d)) continue;
    provs.push([d, baseDe(papel), tp, q, p, r2(q * p), corr, "m"]);
    daMov++;
  }
  provs.sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
  const ini12 = somarMeses(mesAtual, -12), fim12 = somarMeses(mesAtual, -1); // 12 meses fechados
  const provMes = new Map(), prov12Papel = new Map(), provTotPapel = new Map(), prov12Corr = new Map();
  let prov12 = 0, provTotal = 0;
  const porTipo12 = {};
  for (const [d, b, tipo, , , liq, corr] of provs) {
    const m = ym(d);
    if (!provMes.has(m)) provMes.set(m, { mes: m, total: 0, n: 0, rend: 0, div: 0, jcp: 0, amort: 0, outro: 0 });
    const pm = provMes.get(m);
    pm.total += liq; pm.n++;
    pm[tipo in pm ? tipo : "outro"] += liq;
    provTotal += liq;
    provTotPapel.set(b, (provTotPapel.get(b) || 0) + liq);
    if (m >= ini12 && m <= fim12) {
      prov12 += liq;
      prov12Papel.set(b, (prov12Papel.get(b) || 0) + liq);
      prov12Corr.set(corr, (prov12Corr.get(corr) || 0) + liq);
      porTipo12[tipo] = (porTipo12[tipo] || 0) + liq;
    }
  }

  const posicoes = [], encerradas = [];
  const qCorr = new Map(); // corr -> { papeis, valor }
  let patrimonio = 0, custoTotal = 0, valorEmprestado = 0, semCotacao = 0;
  const fifoReal = { total: 0, ano: 0 }, fifoAberto = { custo: 0, aberto: 0 };
  const porClasse = {}, porSegmento = {};
  for (const b of bases) {
    const L = livro.get(b) || { q: 0, custo: 0, realizado: 0 };
    let q, corrs;
    if (comMov.has(b)) {
      corrs = qMov.get(b) || new Map();
      q = [...corrs.values()].reduce((s, v) => s + v, 0);
    } else {
      corrs = new Map();
      for (const t of trades.get(b) || []) corrs.set(t.corr, (corrs.get(t.corr) || 0) + (t.k === "C" ? t.q : -t.q));
      q = L.q;
    }
    if (q < -1e-6) avisar("negativa");
    q = Math.max(0, Math.round(q * 1e6) / 1e6);
    const cls = classe(b);
    const F = L.fifo;
    if (F) { F.acertar(q, L.ultimo || hoje); fifoReal.total += F.c.realizado; fifoReal.ano += F.c.realizadoAno; }
    const contaFifo = () => ({ realizado: r2(F.c.realizado), entrou: r2(F.c.entrou), baixadoVendas: r2(F.c.baixadoVendas), baixadoOutros: r2(F.c.baixadoOutros), acerto: r8(F.c.acerto) });
    if (q <= 1e-9) {
      const hist = (trades.get(b) || []).length || (eventos.get(b) || []).length;
      if (hist && (cls !== "subscricao" || Math.abs(L.realizado) > 0.005)) {
        const d0 = L.primeiro || "", d1 = L.ultimo || ultimoMov.get(b) || "";
        const pr = provTotPapel.get(b) || 0;
        encerradas.push({ t: b, nome: nomeDe(b), classe: cls, de: d0, ate: d1, resultado: r2(L.realizado), proventos: r2(pr), total: r2(L.realizado + pr), pago: r2(L.pago || 0), recebido: r2(L.recebido || 0),
          vendas: F ? F.vendas : [], fifo: F ? { custo: 0, ...contaFifo() } : null });
      }
      continue;
    }
    const pm = L.q > 1e-9 && L.custo > 0 ? L.custo / L.q : L.q > 1e-9 ? 0 : null;
    const c = ref.cot.get(b);
    const preco = c && c.preco != null ? c.preco : null;
    const custo = pm != null ? q * pm : null;
    const precoUsado = preco != null ? preco : pm;
    const valor = precoUsado != null ? q * precoUsado : 0;
    if (preco == null) semCotacao++;
    const emp = emprestimo.get(b);
    const empAtivo = emp && emp.d >= isoMenosDias(hoje, 60) ? Math.min(emp.q, q) : 0;
    const p12 = prov12Papel.get(b) || 0;
    const corrList = [...corrs].filter(([, v]) => v > 1e-9).map(([k]) => k).filter(Boolean).sort();
    posicoes.push({
      t: b, nome: nomeDe(b), classe: cls, seg: cls === "fii" ? segDe(b) : "", q, pm: pm == null ? null : r8(pm), preco, var: c && c.var != null ? c.var : null,
      valor: r2(valor), custo: custo == null ? null : r2(custo), resultado: custo == null || preco == null ? null : r2(valor - custo),
      resPct: custo && preco != null ? Math.round(((valor - custo) / custo) * 1e4) / 100 : null,
      prov12: r2(p12), yoc: custo ? Math.round((p12 / custo) * 1e4) / 100 : null,
      corretoras: corrList, emprestadas: empAtivo || 0, semCotacao: preco == null, realizado: r2(L.realizado),
      proventos: r2(provTotPapel.get(b) || 0), // tudo o que o papel pagou desde o começo (a coluna "Com proventos")
      ...lotesDaPosicao(F, preco, precoUsado, valor, contaFifo),
    });
    if (F) {
      const fc = F.custo();
      fifoAberto.custo += fc;
      if (preco != null) fifoAberto.aberto += valor - fc;
    }
    patrimonio += valor; if (custo != null) custoTotal += custo;
    const empValor = empAtivo && precoUsado != null ? empAtivo * precoUsado : 0;
    valorEmprestado += empValor;
    porClasse[cls] = (porClasse[cls] || 0) + valor - empValor;
    if (cls === "fii") { const s = segDe(b) || "Sem segmento"; porSegmento[s] = porSegmento[s] || { valor: 0, prov12: 0 }; porSegmento[s].valor += valor; }
    for (const [corr, qc] of corrs) {
      if (qc <= 1e-9 || !corr) continue;
      const x = qCorr.get(corr) || { papeis: 0, valor: 0 };
      x.papeis++; x.valor += precoUsado != null ? qc * precoUsado : 0;
      qCorr.set(corr, x);
    }
  }
  posicoes.sort((a, b) => b.valor - a.valor);
  encerradas.sort((a, b) => (a.ate < b.ate ? 1 : -1));

  // Renda por classe e segmento (12 meses)
  const rendaClasse = {};
  for (const [b, v] of prov12Papel) {
    const cls = classe(b);
    const k = cls === "fii" ? "fii:" + (segDe(b) || "Sem segmento") : cls;
    rendaClasse[k] = (rendaClasse[k] || 0) + v;
    if (cls === "fii") { const s = segDe(b) || "Sem segmento"; porSegmento[s] = porSegmento[s] || { valor: 0, prov12: 0 }; porSegmento[s].prov12 += v; }
  }

  // 4. TWR mês a mês, com o preço da última negociação de cada papel nos meses passados e a cotação no mês atual
  const primeiroMes = [...ex.neg.map((x) => x[0]), ...ex.mov.map((x) => x[0])].reduce((m, d) => (!m || d < m ? d : m), "");
  let rent = null;
  if (primeiroMes) {
    const meses = mesesEntre(ym(primeiroMes), mesAtual);
    const precos = new Map(); // base -> [{ d, p }]
    for (const [b, l] of trades) precos.set(b, l.map((t) => ({ d: t.d, p: t.p })).sort((x, y) => (x.d < y.d ? -1 : 1)));
    const valorEm = (mes, atual) => {
      const fim = mes + "-31";
      let v = 0;
      for (const [b, L] of livro) {
        let q = 0;
        for (const s of L.passos) { if (s.d > fim) break; q = s.q; }
        if (q <= 0) continue;
        let p = null;
        if (atual) { const c = ref.cot.get(b); if (c && c.preco != null) p = c.preco; }
        if (p == null) { for (const x of precos.get(b) || []) { if (x.d > fim) break; p = x.p; } }
        if (p == null && L.q > 0 && L.custo > 0) p = L.custo / L.q;
        if (p != null) v += q * p;
      }
      return v;
    };
    const serie = [];
    let v0 = 0;
    for (const m of meses) {
      const v1 = valorEm(m, m === mesAtual);
      const f = fluxoMes.get(m) || { compras: 0, vendas: 0 };
      serie.push({ mes: m, v0, fluxo: f.compras - f.vendas, v1, prov: provMes.has(m) ? provMes.get(m).total : 0 });
      v0 = v1;
    }
    const pct = (l) => (l.length ? Math.round(twr(l) * 1e4) / 100 : null);
    rent = {
      m12: pct(serie.filter((x) => x.mes > somarMeses(mesAtual, -12))),
      ano: pct(serie.filter((x) => x.mes.startsWith(mesAtual.slice(0, 4)))),
      inicio: pct(serie),
      desde: ym(primeiroMes),
      indices: null, // IFIX, CDI e Ibovespa precisam de série histórica, que o Lookout ainda não guarda
    };
  }

  // 5. IR (simplificado, só para conferir)
  const anoAtual = hoje.slice(0, 4);
  let vendasAcoesMes = 0, lucroFiiMes = 0, prejuizoAcoes = 0, prejuizoFii = 0;
  const porMesAcoes = new Map();
  for (const v of vendasTodas) {
    const cls = classe(v.b), m = ym(v.d);
    if (cls === "acao") {
      if (m === mesAtual) vendasAcoesMes += v.valor;
      const x = porMesAcoes.get(m) || { vendas: 0, res: 0 };
      x.vendas += v.valor; x.res += v.res; porMesAcoes.set(m, x);
    } else if (cls === "fii" || cls === "fiagro") {
      // Fiagro segue a regra do FII (20% sobre o lucro). FI-Infra fica de fora: cota de fundo incentivado de
      // infraestrutura tem alíquota zero para pessoa física.
      if (m === mesAtual) lucroFiiMes += v.res;
    }
  }
  for (const [, x] of [...porMesAcoes].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (x.res < 0) prejuizoAcoes += -x.res;
    else if (x.vendas > 20000) prejuizoAcoes = Math.max(0, prejuizoAcoes - x.res);
  }
  const fiiPorMes = new Map();
  for (const v of vendasTodas) if (classe(v.b) === "fii" || classe(v.b) === "fiagro") fiiPorMes.set(ym(v.d), (fiiPorMes.get(ym(v.d)) || 0) + v.res);
  for (const [, r] of [...fiiPorMes].sort((a, b) => (a[0] < b[0] ? -1 : 1))) prejuizoFii = r < 0 ? prejuizoFii - r : Math.max(0, prejuizoFii - r);
  const jcpAno = provs.filter((p) => p[2] === "jcp" && p[0].startsWith(anoAtual)).reduce((s, p) => s + p[5], 0);

  // 6. Mês a mês: proventos (todos os meses com dado) e aportes (12 meses)
  const mesesProv = [...provMes.values()].sort((a, b) => (a.mes < b.mes ? -1 : 1)).map((x) => ({ ...x, total: r2(x.total), rend: r2(x.rend), div: r2(x.div), jcp: r2(x.jcp), amort: r2(x.amort), outro: r2(x.outro) }));
  const aportes = mesesEntre(somarMeses(mesAtual, -11), mesAtual).map((m) => { const f = fluxoMes.get(m) || { compras: 0, vendas: 0 }; return { mes: m, compras: r2(f.compras), vendas: r2(f.vendas), liquido: r2(f.compras - f.vendas) }; });

  // 7. Movimentos recentes: negócios, eventos da Movimentação (sem liquidação e sem proventos) e proventos
  const recentes = [
    ...ex.neg.map(([d, cv, t, q, p]) => ({ d, o: cv === "C" ? "compra" : "venda", t: baseDe(t), q, p })),
    ...ex.mov.filter((x) => x[2] !== "liq" && !TIPO_PROV_MOV[x[2]] && !x[2].includes("~") && !["cessao", "cessao-sol", "leilao"].includes(x[2])).map(([d, es, t, papel, q]) => ({ d, o: t, es, t: baseDe(papel), q })),
    ...provs.slice(0, 20).map(([d, b, tipo, q, pc, liq]) => ({ d, o: tipo, t: b, q, v: liq })),
  ].sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0)).slice(0, 12);

  // 8. A receber, agenda e alertas
  const aReceber = [];
  const pagouEsteMes = new Set(provs.filter((p) => ym(p[0]) === mesAtual).map((p) => p[1]));
  for (const p of posicoes) {
    if (p.classe !== "fii") continue;
    const f = ref.fundos[p.t];
    // O rendimento do resumo é estimado (DY do mês × VP) e às vezes vem torto: fica de fora o que passa de 5% da cota no mês
    const pc = p.preco != null ? p.preco : p.pm;
    if (!f || !(f.rend > 0) || pagouEsteMes.has(p.t) || (pc > 0 && f.rend > pc * 0.05)) continue;
    aReceber.push({ t: p.t, porCota: f.rend, valor: r2(f.rend * p.q), ref: f.ref || "", data: null });
  }
  aReceber.sort((a, b) => b.valor - a.valor);
  const alertas = [];
  const porCotaRend = new Map();
  for (const [d, b, tipo, , pc] of [...provs].reverse()) {
    if (tipo !== "rend" || !(pc > 0)) continue;
    const l = porCotaRend.get(b) || [];
    if (!l.length || l[l.length - 1].d !== d) l.push({ d, pc }); else l[l.length - 1].pc = Math.max(l[l.length - 1].pc, pc);
    porCotaRend.set(b, l);
  }
  for (const p of posicoes) {
    const l = porCotaRend.get(p.t);
    if (p.classe === "fii" && l && l.length >= 2) {
      const [a, b] = l.slice(-2);
      if (b.pc < a.pc * 0.995 && b.d >= isoMenosDias(hoje, 45)) alertas.push({ tipo: "rendimento-menor", t: p.t, de: a.pc, para: b.pc, d: b.d });
    }
    if (p.classe === "subscricao" && (ultimoMov.get(p.t) || "") >= isoMenosDias(hoje, 60)) alertas.push({ tipo: "subscricao", t: p.t, q: p.q, vence: null });
    if (patrimonio > 0 && p.valor / patrimonio > 0.2) alertas.push({ tipo: "concentracao", t: p.t, pct: Math.round((p.valor / patrimonio) * 1000) / 10 });
  }
  const agenda = [
    ...alertas.filter((a) => a.tipo === "subscricao").map((a) => ({ o: "subscricao", t: a.t, q: a.q, data: null })),
    ...aReceber.map((x) => ({ o: "pagamento", t: x.t, valor: x.valor, data: null, ref: x.ref })),
  ];

  // 9. Saídas: vendas e retiradas, e o realizado
  // Venda: negociação de venda (ou liquidação de venda, sem Negociação), pelo valor da venda. "Não exercido" entra no
  // realizado como perda, mas não é venda. Retirada: o que tira quantidade sem ser venda nem evento societário
  // (transferência de saída, retirada de custódia, vencimento), pelo PM da data: sem cotação histórica, o custo é o que
  // dá para afirmar. Transferência entre corretoras no mesmo dia se anula (saldo por papel e dia). Amortização e resgate
  // não mexem na quantidade (efeitoMov) e a amortização já conta como provento: não entram aqui.
  const anoCivil = hoje.slice(0, 4);
  const realizado = { total: 0, ano: 0, n: 0, nAno: 0 };
  for (const [, L] of livro) realizado.total += L.realizado;
  const vendas = { total: 0, ano: 0, n: 0 };
  for (const v of vendasTodas) {
    const noAno = v.d.startsWith(anoCivil);
    if (noAno) realizado.ano += v.res;
    if (v.zera) continue;
    vendas.total += v.valor; vendas.n++; realizado.n++;
    if (noAno) { vendas.ano += v.valor; realizado.nAno++; }
  }
  const GRUPO_RET = { transf: "transf", "transf-sf": "transf", retirada: "retirada", venc: "venc" };
  const saldoRet = new Map(); // base|data|grupo -> saldo
  for (const [d, es, t, papel, q] of ex.mov) {
    const g = GRUPO_RET[t];
    if (!g) continue;
    const k = baseDe(papel) + "|" + d + "|" + g;
    saldoRet.set(k, (saldoRet.get(k) || 0) + (es === "C" ? q : -q));
  }
  const pmEm = (b, d) => { let pm = null; for (const s of (livro.get(b) || { passos: [] }).passos) { if (s.d > d) break; if (s.pm != null) pm = s.pm; } return pm; };
  const retiradas = { total: 0, ano: 0, n: 0, tipos: {} };
  for (const [k, saldo] of saldoRet) {
    if (saldo > -1e-9) continue;
    const [b, d, g] = k.split("|");
    const valor = -saldo * (pmEm(b, d) || 0);
    retiradas.total += valor; retiradas.n++;
    retiradas.tipos[g] = (retiradas.tipos[g] || 0) + valor;
    if (d.startsWith(anoCivil)) retiradas.ano += valor;
  }

  // 10. Paguei × hoje contando proventos e vendas: tudo o que entrou em compras desde o começo (inclui a subscrição
  // exercida, que é dinheiro pago) contra o que se tem hoje mais o que já voltou em dinheiro (proventos e vendas).
  // Retirada de custódia não entra em nenhum lado: não é compra nem venda e saiu sem virar dinheiro.
  let comprasTotal = 0;
  for (const [, f] of fluxoMes) comprasTotal += f.compras;
  const totHoje = patrimonio + provTotal + vendas.total;
  const total = {
    pago: r2(comprasTotal), hoje: r2(totHoje), proventos: r2(provTotal), vendas: r2(vendas.total),
    ganho: r2(totHoje - comprasTotal), pct: comprasTotal > 0 ? Math.round(((totHoje - comprasTotal) / comprasTotal) * 1e4) / 100 : null,
  };

  // 11. Resumo
  const corretoras = [...qCorr].map(([c, x]) => ({ corretora: c, papeis: x.papeis, valor: r2(x.valor), prov12: r2(prov12Corr.get(c) || 0) })).sort((a, b) => b.valor - a.valor);
  const mAnt = somarMeses(mesAtual, -1);
  const pegaMes = (m) => { const x = provMes.get(m); return { mes: m, total: r2(x ? x.total : 0), n: x ? x.n : 0 }; };
  const resumo = {
    hoje, patrimonio: r2(patrimonio), custo: r2(custoTotal), resultado: r2(patrimonio - custoTotal), aberto: r2(patrimonio - custoTotal),
    realizado: { total: r2(realizado.total), ano: r2(realizado.ano), n: realizado.n, nAno: realizado.nAno }, total,
    saidas: {
      vendas: { total: r2(vendas.total), ano: r2(vendas.ano), n: vendas.n },
      retiradas: { total: r2(retiradas.total), ano: r2(retiradas.ano), n: retiradas.n, tipos: Object.fromEntries(Object.entries(retiradas.tipos).map(([k, v]) => [k, r2(v)])) },
    },
    fifo: { custo: r2(fifoAberto.custo), aberto: r2(fifoAberto.aberto), pct: pct2(fifoAberto.aberto, fifoAberto.custo), realizado: r2(fifoReal.total), realizadoAno: r2(fifoReal.ano) },
    resultadoPct: custoTotal > 0 ? Math.round(((patrimonio - custoTotal) / custoTotal) * 1e4) / 100 : null,
    papeis: posicoes.length, corretoras: corretoras.map((c) => c.corretora), semCotacao,
    porClasse: Object.fromEntries(Object.entries(porClasse).map(([k, v]) => [k, r2(v)])), emprestado: r2(valorEmprestado),
    porSegmento: Object.fromEntries(Object.entries(porSegmento).map(([k, v]) => [k, { valor: r2(v.valor), prov12: r2(v.prov12) }])),
    rendaClasse: Object.fromEntries(Object.entries(rendaClasse).map(([k, v]) => [k, r2(v)])),
    porCorretora: corretoras,
    prov12: r2(prov12), media12: r2(prov12 / 12), yoc: custoTotal > 0 ? Math.round((prov12 / custoTotal) * 1e4) / 100 : null,
    porTipo12: Object.fromEntries(Object.entries(porTipo12).map(([k, v]) => [k, r2(v)])),
    mesAtual: pegaMes(mesAtual), mesAnterior: pegaMes(mAnt), provTotal: r2(provTotal), provDesde: provs.length ? ym(provs[provs.length - 1][0]) : null, provN: provs.length, provDaMov: daMov,
    meses: mesesProv, aportes, rentabilidade: rent, encerradas, recentes, aReceber, agenda, alertas,
    ir: { mes: mesAtual, vendasAcoes: r2(vendasAcoesMes), lucroFii: r2(lucroFiiMes), jcpAno: r2(jcpAno), ano: anoAtual, prejuizoAcoes: r2(prejuizoAcoes), prejuizoFii: r2(prejuizoFii) },
    avisos: Object.entries(avisos).map(([k, n]) => ({ k, n })),
    linhas: { neg: ex.neg.length, mov: ex.mov.length, prov: ex.prov.length },
  };
  for (const [b, x] of fluxoPapel) x.classe = classe(b);
  return { posicoes, proventos: provs.map((p) => p.slice(0, 7)), resumo, fluxoMes, fluxoPapel };
}

const isoMenosDias = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") - n * 86400000).toISOString().slice(0, 10);

// Meta e projeção. yield: o da meta ou, sem ele, o da carteira (proventos 12m / custo).
export function projecao(metaCfg, calc, hoje) {
  const r = calc.resumo, mesAtual = ym(hoje || r.hoje);
  const cfg = { ...META_PADRAO, ...(metaCfg || {}) };
  const yCart = r.custo > 0 ? r.prov12 / r.custo : null;
  const y = cfg.yield != null ? cfg.yield : yCart;
  const rendaHoje = r.media12;
  const out = { definida: cfg.alvo != null, cfg, yieldCarteira: yCart == null ? null : Math.round(yCart * 1e4) / 1e4, yieldUsado: y, rendaHoje, mes: mesAtual };
  // Este mês contra o plano
  const f = calc.fluxoMes.get(mesAtual) || { compras: 0, vendas: 0 };
  const provMes = r.mesAtual.total;
  const aportado = f.compras - f.vendas;
  const esperado = (cfg.aporte || 0) + (cfg.reinvestir ? provMes : 0);
  out.mesPlano = { planejado: cfg.aporte || 0, aportado: r2(aportado), proventos: provMes, reinvestidos: r2(Math.min(Math.max(f.compras, 0), provMes)), contra: r2(aportado - esperado), esperado: r2(esperado) };
  // Realizado: média móvel de 12 meses dos proventos, do primeiro mês com dado até o mês passado
  const pm = new Map((r.meses || []).map((m) => [m.mes, m.total]));
  const realizado = [];
  if (r.meses && r.meses.length) {
    const ms = mesesEntre(r.meses[0].mes, somarMeses(mesAtual, -1));
    for (let i = 0; i < ms.length; i++) {
      let s = 0;
      for (let k = Math.max(0, i - 11); k <= i; k++) s += pm.get(ms[k]) || 0;
      realizado.push([ms[i], r2(s / 12)]);
    }
  }
  out.realizado = realizado;
  if (!out.definida || !(y > 0)) return out;
  const p0 = rendaHoje > 0 ? (rendaHoje * 12) / y : r.custo;
  const base = { aporte: cfg.aporte || 0, reinvestir: cfg.reinvestir, p0 };
  const meses = mesesAteAlvo({ ...base, alvo: cfg.alvo, y });
  const y2 = y - 0.02;
  const meses2 = y2 > 0 ? mesesAteAlvo({ ...base, p0: rendaHoje > 0 ? (rendaHoje * 12) / y2 : r.custo, alvo: cfg.alvo, y: y2 }) : null;
  out.p0 = r2(p0);
  out.mesesAteAlvo = meses;
  out.quando = meses == null ? null : somarMeses(mesAtual, meses);
  out.cenarioBaixo = { yield: Math.round(y2 * 1e4) / 1e4, meses: meses2, quando: meses2 == null ? null : somarMeses(mesAtual, meses2), patrimonio: y2 > 0 ? r2((cfg.alvo * 12) / y2) : null };
  out.aporte10anos = aporteNecessario({ alvo: cfg.alvo, y, reinvestir: cfg.reinvestir, p0, prazo: 120 });
  out.patrimonioAlvo = r2((cfg.alvo * 12) / y);
  const marcos = [...new Set([500, 1000, 2500].filter((x) => x < cfg.alvo).concat([cfg.alvo]))];
  out.marcos = marcos.map((m) => { const n = mesesAteAlvo({ ...base, alvo: m, y }); return { renda: m, patrimonio: r2((m * 12) / y), meses: n, quando: n == null ? null : somarMeses(mesAtual, n), atingido: rendaHoje >= m }; });
  const prox = out.marcos.find((m) => !m.atingido);
  out.proximoMarco = prox || null;
  const horizonte = Math.min(480, Math.max(meses ?? 480, meses2 ?? 0));
  out.projetado = serieProjetada({ ...base, y, meses: Math.min(horizonte, meses ?? 480) });
  out.projetadoBaixo = y2 > 0 ? serieProjetada({ ...base, p0: rendaHoje > 0 ? (rendaHoje * 12) / y2 : r.custo, y: y2, meses: Math.min(horizonte, meses2 ?? 480) }) : [];
  out.pct = cfg.alvo > 0 ? Math.round((rendaHoje / cfg.alvo) * 1000) / 10 : null;
  return out;
}

// ---------- simulador de reinvestimento ----------
//
// Dois docs a mais em carteira/<email>, cifrados como os outros:
// - simulacoes: { v: 1, lista: [{ id, nome, criado, atualizado, cfg: { ate, aporte, reinvestir, yield }, memoria }] }.
//   memoria é a foto da criação e nunca é recalculada: { mesInicio, p0, y, yCarteira, rendaHoje, custo, patrimonio,
//   noMes: { fluxo, proventos }, posicoes: [{ papel, classe, q, pm }], previsto: [[mes, renda, patrimonio]] }.
//   A renda do mês sai de serieProjetada (a mesma conta da Meta). O patrimônio previsto é o do fim do mês, em valor de
//   mercado: o patrimônio da criação mais o que a conta soma de aporte e reinvestimento até ali, para dar para comparar
//   com o patrimônio real do fechamento. noMes guarda compras menos vendas e proventos do mês de início até a criação.
// - mensal: { v: 1, meses: { "AAAA-MM": { fechadoEm, proventos, compras, vendas, patrimonio, custo, prov12, posicoes } } },
//   os números do que aconteceu, um por mês, gravados no fechamento (GET da carteira ou cron do dia 1). O patrimônio e o
//   custo são os do dia do fechamento, com a cotação que o Lookout tem naquele dia (meta/b3).
// A análise é só leitura: previsto × real mês a mês e o desvio de renda decomposto no nível da carteira.
export const MAX_SIMULACOES = 12;
const MAX_MESES_MENSAL = 480;
export const ID_SIMULACAO = /^[a-z0-9]{4,20}$/;
const MES_OK = /^\d{4}-(0[1-9]|1[0-2])$/;
export const difMeses = (de, ate) => { const [a1, m1] = de.split("-").map(Number), [a2, m2] = ate.split("-").map(Number); return (a2 - a1) * 12 + (m2 - m1); };

// Corpo do POST -> { nome, cfg } ou { erro }. yield em fração (0,104 = 10,4% ao ano), null = o da carteira.
export function validarSimulacao(b, mesAtual) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return { erro: "corpo" };
  const ate = String(b.ate ?? "").trim();
  if (!MES_OK.test(ate)) return { erro: "Escolha o mês e o ano em que a simulação termina." };
  const n = difMeses(mesAtual, ate);
  if (n < 1) return { erro: "A simulação precisa terminar do mês que vem em diante." };
  if (n > 480) return { erro: "A simulação pode ir até 40 anos daqui." };
  const num = (v, min, max, msg) => {
    if (v === null || v === undefined || v === "") return { v: null };
    const x = Number(v);
    if (!Number.isFinite(x) || x < min || x > max) return { erro: msg };
    return { v: x };
  };
  const ap = num(b.aporte, 0, 1_000_000, "O aporte mensal vai de R$ 0 a R$ 1.000.000.");
  const y = num(b.yield, 0.001, 0.3, "O yield vai de 0,1% a 30% ao ano.");
  for (const x of [ap, y]) if (x.erro) return { erro: x.erro };
  if (b.reinvestir != null && typeof b.reinvestir !== "boolean") return { erro: "reinvestir" };
  let nome = String(b.nome ?? "").replace(/\s+/g, " ").trim();
  if (nome.length > 60) return { erro: "O nome pode ter até 60 caracteres." };
  if (!nome) nome = "Até " + ate.slice(5) + "/" + ate.slice(0, 4);
  return { nome, cfg: { ate, aporte: ap.v == null ? 0 : r2(ap.v), reinvestir: b.reinvestir !== false, yield: y.v == null ? null : Math.round(y.v * 1e4) / 1e4 } };
}

// Memória de cálculo, a partir de calcular(). y e p0 como na projeção da Meta.
export function memoriaSimulacao(calc, cfg, mesAtual) {
  const r = calc.resumo;
  const yCart = r.custo > 0 && r.prov12 > 0 ? Math.round((r.prov12 / r.custo) * 1e6) / 1e6 : null;
  const y = cfg.yield != null ? cfg.yield : yCart;
  if (!(y > 0)) return { erro: "A carteira ainda não tem proventos em 12 meses para dar o yield. Escreva o yield que quer usar." };
  const rendaHoje = r.media12;
  const p0 = rendaHoje > 0 ? (rendaHoje * 12) / y : r.custo;
  const n = difMeses(mesAtual, cfg.ate);
  const renda = serieProjetada({ aporte: cfg.aporte, y, reinvestir: cfg.reinvestir, p0, meses: n });
  const previsto = [];
  let p = p0;
  for (let k = 0; k <= n; k++) {
    p += (cfg.aporte || 0) + (cfg.reinvestir ? renda[k] : 0); // fim do mês k
    previsto.push([somarMeses(mesAtual, k), renda[k], r2(r.patrimonio + p - p0)]);
  }
  const f = calc.fluxoMes.get(mesAtual) || { compras: 0, vendas: 0 };
  return {
    mesInicio: mesAtual, p0: r2(p0), y, yCarteira: yCart, rendaHoje, custo: r.custo, patrimonio: r.patrimonio,
    noMes: { fluxo: r2(f.compras - f.vendas), proventos: r.mesAtual.total },
    posicoes: calc.posicoes.map((x) => ({ papel: x.t, classe: x.classe, q: x.q, pm: x.pm })),
    previsto,
  };
}

// Fechamento de `mes` com o cálculo de hoje (chamado no mês seguinte). prov12 são os 12 meses fechados até `mes`.
export function fechamentoDoMes(calc, mes, agora = new Date().toISOString()) {
  const r = calc.resumo;
  const pm = (r.meses || []).find((x) => x.mes === mes);
  const f = calc.fluxoMes.get(mes) || { compras: 0, vendas: 0 };
  return { fechadoEm: agora, proventos: r2(pm ? pm.total : 0), compras: r2(f.compras), vendas: r2(f.vendas), patrimonio: r.patrimonio, custo: r.custo, prov12: r.prov12, posicoes: calc.posicoes.map((x) => ({ papel: x.t, q: x.q })) };
}
// mensal com o mês novo, guardando os 480 mais recentes
export function comFechamento(mensal, mes, fech) {
  const meses = { ...((mensal && mensal.meses) || {}), [mes]: fech };
  const chaves = Object.keys(meses).sort();
  for (const k of chaves.slice(0, Math.max(0, chaves.length - MAX_MESES_MENSAL))) delete meses[k];
  return { v: 1, meses };
}
// O mês anterior precisa ser fechado? Só para quem tem simulação e ainda não tem o fechamento dele.
export const mesParaFechar = (simulacoes, mensal, mesAtual) => {
  if (!simulacoes || !(simulacoes.lista || []).length) return null;
  const mes = somarMeses(mesAtual, -1);
  return mensal && mensal.meses && mensal.meses[mes] ? null : mes;
};

const pct1 = (v, base) => (base > 0 ? Math.round((v / base) * 1000) / 10 : null);
const tendenciaDe = (pct, desvio) => (pct == null ? (Math.abs(desvio || 0) < 0.005 ? "na linha" : desvio > 0 ? "acima" : "abaixo") : Math.abs(pct) <= 3 ? "na linha" : pct > 0 ? "acima" : "abaixo");

// Previsto × real nos meses que já fecharam, e a decomposição do desvio acumulado de renda (nível da carteira):
//   rendimento: (yield real 12m − y) × patrimônio previsto / 12, somado nos meses. O yield real é o que a carteira paga
//     sobre o custo no fechamento (prov12 / custo), na escala da conta: y × (yield real / yield da carteira na criação),
//     para que um yield escrito à mão não vire desvio no primeiro mês;
//   capital: (patrimônio real − patrimônio previsto) × y / 12, somado; dentro dele, aportes (compras menos vendas contra o
//     que o plano pedia: o aporte e, quando reinvestir, os proventos do mês; acumulado, × y / 12) e reinvestimento e
//     cotação (o resto do capital);
//   resíduo: o que sobra (total − rendimento − capital), como o vaivém de proventos entre um mês e outro.
export function analisarSimulacao(sim, mensal) {
  const mem = sim.memoria, cfg = sim.cfg, y = mem.y;
  const doMes = (mensal && mensal.meses) || {};
  const meses = [];
  let total = 0, totPrev = 0, rend = 0, cap = 0, ap = 0, fluxoReal = 0, fluxoPlano = 0, ultimo = null;
  for (const [mes, renda, patr] of mem.previsto) {
    const f = doMes[mes];
    if (!f) continue;
    const ini = mes === mem.mesInicio && mem.noMes ? mem.noMes : { fluxo: 0, proventos: 0 };
    const aportes = r2(f.compras - f.vendas);
    const dr = f.proventos - renda;
    const yReal = f.custo > 0 ? f.prov12 / f.custo : null;
    const yConta = yReal == null ? null : mem.yCarteira > 0 ? (y * yReal) / mem.yCarteira : yReal;
    fluxoReal += aportes - ini.fluxo;
    fluxoPlano += (cfg.aporte || 0) + (cfg.reinvestir ? Math.max(0, f.proventos - ini.proventos) : 0);
    total += dr; totPrev += renda;
    if (yConta != null) rend += (yConta - y) * ((renda * 12) / y) / 12;
    cap += ((f.patrimonio - patr) * y) / 12;
    ap += ((fluxoReal - fluxoPlano) * y) / 12;
    ultimo = { mes, yReal, yConta, fluxoGap: fluxoReal - fluxoPlano, patrGap: f.patrimonio - patr };
    meses.push({ mes, previsto: { renda, patrimonio: patr }, real: { proventos: f.proventos, aportes, patrimonio: f.patrimonio }, desvio: { renda: r2(dr), pct: pct1(dr, renda) } });
  }
  const proximo = somarMeses(meses.length ? meses[meses.length - 1].mes : somarMeses(mem.mesInicio, -1), 1);
  const out = { id: sim.id, mesesFechados: meses.length, meses, proximoFechamento: proximo <= cfg.ate ? proximo : null };
  if (!meses.length) return { ...out, decomposicao: null, pct: null, tendencia: null, parecer: "" };
  const d = { total: r2(total), rendimento: r2(rend), capital: r2(cap), aportes: r2(ap) };
  d.reinvestimento = r2(d.capital - d.aportes);
  d.residuo = r2(d.total - d.rendimento - d.capital);
  const u = meses[meses.length - 1];
  const a = {
    ...out, decomposicao: d, pct: pct1(total, totPrev), previstoAcumulado: r2(totPrev),
    tendencia: tendenciaDe(u.desvio.pct, u.desvio.renda),
    ultimo: { mes: u.mes, yieldReal: ultimo.yReal == null ? null : Math.round(ultimo.yReal * 1e4) / 1e4, yieldConta: ultimo.yConta == null ? null : Math.round(ultimo.yConta * 1e4) / 1e4, aportesGap: r2(ultimo.fluxoGap), patrimonioGap: r2(ultimo.patrGap) },
  };
  a.parecer = parecerSimulacao(a, sim);
  return a;
}

// Parecer em texto fixo, de 2 a 5 frases, só com fatos da conta (nada de recomendação).
const MESES_EXT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const mesExt = (m) => `${MESES_EXT[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;
const fmtBr = (v, c) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
const reais = (v) => { const x = Math.abs(v); return "R$ " + fmtBr(x, x < 100 ? 2 : 0); };
const pctSinal = (v) => (v > 0.05 ? "+" : v < -0.05 ? "−" : "") + fmtBr(Math.abs(v), 1) + "%";
const pctAno = (y) => fmtBr(y * 100, 1) + "%";
const lado = (v) => (v >= 0 ? "acima" : "abaixo");
export function parecerSimulacao(a, sim) {
  const d = a.decomposicao, mem = sim.memoria, cfg = sim.cfg, u = a.ultimo, n = a.mesesFechados;
  const frases = [];
  const abre = n === 1 ? `No primeiro mês fechado (${mesExt(a.meses[0].mes)})` : `Em ${n} meses fechados`;
  const pct = a.pct == null ? 0 : a.pct;
  frases.push(Math.abs(pct) <= 3 && Math.abs(d.total) >= 0.005
    ? `${abre} a renda ficou na linha do previsto: ${reais(d.total)} ${lado(d.total)} (${pctSinal(pct)}).`
    : Math.abs(d.total) < 0.005 ? `${abre} a renda ficou igual ao previsto.`
    : `${abre} a renda ficou ${reais(d.total)} ${lado(d.total)} do previsto (${pctSinal(pct)}).`);
  const partes = [["rendimento", d.rendimento], ["aportes", d.aportes], ["reinvestimento", d.reinvestimento], ["residuo", d.residuo]];
  const yPadrao = mem.yCarteira == null || Math.abs(mem.y - mem.yCarteira) < 1e-4;
  const explica = (k, v, intro) => {
    if (k === "rendimento") {
      if (u.yieldReal == null) return `${intro} do rendimento.`;
      return yPadrao
        ? `${intro} do rendimento: a carteira pagou ${pctAno(u.yieldReal)} ao ano sobre o custo contra ${pctAno(mem.y)} usados na conta.`
        : `${intro} do rendimento: o que a carteira paga sobre o custo foi de ${pctAno(mem.yCarteira)} para ${pctAno(u.yieldReal)} ao ano, o que na conta equivale a ${pctAno(u.yieldConta)} contra ${pctAno(mem.y)} usados.`;
    }
    if (k === "aportes") return `${intro} dos aportes: entraram na carteira ${reais(u.aportesGap)} ${u.aportesGap >= 0 ? "a mais" : "a menos"} do que o plano pedia${cfg.reinvestir ? " (o aporte mais os proventos de cada mês)" : ""}.`;
    if (k === "reinvestimento") return `${intro} do patrimônio: sem contar os aportes, ele cresceu ${v >= 0 ? "mais" : "menos"} do que a conta previa, pela cotação dos papéis e pelo que foi reinvestido.`;
    return `${intro} do vaivém dos proventos entre um mês e outro, que o yield e o patrimônio não explicam.`;
  };
  const somaAbs = partes.reduce((s, [, v]) => s + Math.abs(v), 0);
  if (somaAbs < 0.5) frases.push("Rendimento, aportes e patrimônio andaram como a conta previa.");
  else {
    const mesmoLado = partes.filter(([, v]) => Math.abs(d.total) < 0.005 || Math.sign(v) === Math.sign(d.total)).sort((x, y2) => Math.abs(y2[1]) - Math.abs(x[1]));
    const [k, v] = mesmoLado[0] || partes.slice().sort((x, y2) => Math.abs(y2[1]) - Math.abs(x[1]))[0];
    frases.push(explica(k, v, Math.abs(d.total) >= 0.005 && Math.abs(v) >= Math.abs(d.total) * 0.5 ? "A maior parte veio" : "A parte maior veio"));
    const contra = partes.filter(([k2, v2]) => k2 !== k && Math.abs(d.total) >= 0.005 && Math.sign(v2) === -Math.sign(d.total) && Math.abs(v2) >= Math.max(1, Math.abs(d.total) * 0.1))
      .sort((x, y2) => Math.abs(y2[1]) - Math.abs(x[1]))[0];
    if (contra) {
      const [k2, v2] = contra;
      if (k2 === "aportes" && Math.sign(u.aportesGap) === Math.sign(v2)) frases.push(`Os aportes ficaram ${reais(u.aportesGap)} ${lado(u.aportesGap)} do plano, o que compensou uma parte.`);
      else if (k2 === "rendimento") frases.push(`O rendimento foi para o outro lado (${reais(v2)} na renda) e compensou uma parte.`);
      else if (k2 === "reinvestimento") frases.push(`A cotação e o reinvestimento foram para o outro lado (${reais(v2)} na renda) e compensaram uma parte.`);
      else if (k2 === "aportes") frases.push(`Os aportes foram para o outro lado (${reais(v2)} na renda) e compensaram uma parte.`);
      else frases.push(`O vaivém dos proventos entre os meses foi para o outro lado (${reais(v2)}) e compensou uma parte.`);
    }
  }
  if (n > 1) {
    const um = a.meses[a.meses.length - 1];
    frases.push(a.tendencia === "na linha" ? `No último mês fechado (${mesExt(um.mes)}) a renda ficou na linha do previsto.` : `No último mês fechado (${mesExt(um.mes)}) a renda ficou ${fmtBr(Math.abs(um.desvio.pct ?? 0), 1)}% ${a.tendencia} do previsto.`);
  }
  return frases.slice(0, 5).join(" ");
}

// O que a lista e a comparação mostram de cada simulação
export function resumoSimulacao(sim, mensal) {
  const prev = sim.memoria.previsto, fim = prev[prev.length - 1];
  const doMes = (mensal && mensal.meses) || {};
  const fechados = prev.filter(([m]) => doMes[m]);
  let ultimoDesvioPct = null, tendencia = null;
  if (fechados.length) {
    const [m, renda] = fechados[fechados.length - 1];
    const dr = doMes[m].proventos - renda;
    ultimoDesvioPct = pct1(dr, renda);
    tendencia = tendenciaDe(ultimoDesvioPct, dr);
  }
  return { id: sim.id, nome: sim.nome, criado: sim.criado, cfg: sim.cfg, mesInicio: sim.memoria.mesInicio, ate: sim.cfg.ate, rendaFinal: fim[1], patrimonioFinal: fim[2], mesesFechados: fechados.length, ultimoDesvioPct, tendencia };
}
export const listarSimulacoes = (simulacoes, mensal) => ((simulacoes && simulacoes.lista) || []).map((s) => resumoSimulacao(s, mensal));

// ---------- rota ----------

const resp = (dados, status = 200) =>
  new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" } });

const IDS = ["extrato", "importacoes", "meta"];
const IDS_SIM = ["simulacoes", "mensal"];
const IDS_TODOS = [...IDS, ...IDS_SIM];
const cacheGet = new Map(); // email -> { em, txt }
const CACHE_MS = 60_000;
const cacheReinv = new Map(); // email|universo|aporte (vazio = o sugerido) -> { em, txt }
export const limparCacheCarteira = (email) => {
  if (!email) { cacheGet.clear(); cacheReinv.clear(); return; }
  cacheGet.delete(email);
  for (const k of [...cacheReinv.keys()]) if (k.startsWith(email + "|")) cacheReinv.delete(k);
};

async function lerDocs(env, col, deps, doD1, ids = IDS) {
  let linhas;
  const sql = `SELECT id, data FROM docs WHERE collection = ? AND id IN (${ids.map(() => "?").join(", ")})`;
  if (doD1) linhas = (await env.DB.prepare(sql).bind(col, ...ids).all()).results;
  else linhas = await deps.lerLinhas(env, sql, [col, ...ids], "carteira");
  const out = {};
  for (const r of linhas || []) out[r.id] = await decifrar(env, r.data);
  return out;
}
async function gravarDocs(env, col, docs, deps) {
  const atualizado = new Date().toISOString();
  const linhas = [];
  for (const [id, obj] of Object.entries(docs)) {
    const data = await cifrar(env, obj);
    if (data.length > 1_800_000) throw Object.assign(new Error("A carteira passou do tamanho que dá para guardar num documento."), { status: 413 });
    linhas.push({ collection: col, id, data, coletado: "", atualizado });
  }
  const st = env.DB.prepare("INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES (?, ?, ?, '', ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = excluded.atualizado");
  await env.DB.batch(linhas.map((l) => st.bind(l.collection, l.id, l.data, l.atualizado)));
  deps.gravarNoEspelho(env, linhas);
}
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const hojeBr = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
// deps.hoje (AAAA-MM-DD) só nos testes
const hojeDe = (deps) => (deps && deps.hoje) || hojeBr();
async function hashDe(linhas) {
  const b = new TextEncoder().encode(JSON.stringify(linhas));
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", b));
  return [...h.slice(0, 8)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function lerCorpo(request, limite) {
  const txt = await request.text();
  if (txt.length > limite) return { erro: "O pedido passou do tamanho aceito.", status: 413 };
  try { return { b: JSON.parse(txt) }; } catch { return { erro: "json", status: 400 }; }
}

async function lerMetaDoc(env, id, deps) {
  try { const r = await deps.lerLinha(env, "meta", id); return r ? JSON.parse(r.data) : null; } catch { return null; }
}

// Listas automáticas (src/listas.js): recalcula as posições e sincroniza listas/<email> depois de importar, desfazer
// ou apagar. Falha aqui não desfaz a gravação da carteira; o erro vai ao log sem nada da carteira.
async function sincronizarListas(env, quem, extrato, importacoes, deps) {
  if (!deps.sincronizarListas) return null;
  try {
    let posicoes = null;
    const n = extrato ? (extrato.neg || []).length + (extrato.mov || []).length + (extrato.prov || []).length : 0;
    if (n) {
      const [b3, fiiResumo] = await Promise.all([lerMetaDoc(env, "b3", deps), lerMetaDoc(env, "fii-resumo", deps)]);
      posicoes = calcular(extrato, { b3, fiiResumo, importacoes, hoje: hojeBr() }).posicoes;
    }
    return await deps.sincronizarListas(env, quem.email, posicoes, deps);
  } catch (e) {
    console.error("carteira listas", String((e && e.name) || "erro"), String((e && e.message) || "").slice(0, 80));
    return null;
  }
}

// GET /api/carteira (e o GET de /meta, que é o mesmo cálculo)
const temLinhas = (ex) => !!(ex && (ex.neg || []).length + (ex.mov || []).length + (ex.prov || []).length);
async function montar(env, quem, deps) {
  const col = "carteira/" + quem.email;
  const docs = await lerDocs(env, col, deps, false, IDS_TODOS);
  const hoje = hojeDe(deps);
  if (!temLinhas(docs.extrato)) {
    return { vazia: true, meta: projecao(docs.meta, calcular(extratoVazio(), { hoje }), hoje), importacoes: docs.importacoes?.lista || [], simulacoes: [] };
  }
  const [b3, fiiResumo] = await Promise.all([lerMetaDoc(env, "b3", deps), lerMetaDoc(env, "fii-resumo", deps)]);
  const calc = calcular(docs.extrato, { b3, fiiResumo, importacoes: docs.importacoes, hoje });
  const mensal = await fecharSePreciso(env, col, docs, calc, hoje, deps);
  return {
    vazia: false,
    posicoes: calc.posicoes, proventos: calc.proventos, resumo: calc.resumo,
    meta: projecao(docs.meta, calc, hoje),
    importacoes: (docs.importacoes?.lista || []).slice().reverse(),
    cotacoes: { b3: b3 ? b3.atualizado : null, cvm: fiiResumo ? fiiResumo.ref : null },
    simulacoes: listarSimulacoes(docs.simulacoes, mensal),
  };
}

// Fechamento do mês anterior, na primeira leitura do mês de quem tem simulação. A leitura do GET pode ter vindo de uma
// cópia atrasada do espelho: antes de gravar, confere no D1. Falha aqui não derruba o GET.
async function fecharSePreciso(env, col, docs, calc, hoje, deps) {
  const mes = mesParaFechar(docs.simulacoes, docs.mensal, ym(hoje));
  if (!mes) return docs.mensal;
  try {
    const d1 = await lerDocs(env, col, deps, true, IDS_SIM);
    if (!mesParaFechar(d1.simulacoes, d1.mensal, ym(hoje))) return d1.mensal;
    const mensal = comFechamento(d1.mensal, mes, fechamentoDoMes(calc, mes));
    await gravarDocs(env, col, { mensal }, deps);
    return mensal;
  } catch (e) {
    console.error("carteira fechamento", String((e && e.name) || "erro"), String((e && e.message) || "").slice(0, 80));
    return docs.mensal;
  }
}

// Fechamento no cron: dia 1, das 6h às 6h59 em Brasília (UTC−3), até 20 pessoas por minuto, uma vez por mês.
// A marca _sistema/simulador-fechamento guarda o mês feito e quantas pessoas já passaram (sem e-mail de ninguém).
// Só lê e grava carteira/<email> (simulacoes, mensal, extrato, importacoes) e lê meta/b3 e meta/fii-resumo.
const SIM_POR_MINUTO = 20;
export async function cronSimulador(env, quando, deps = {}) {
  const br = new Date(new Date(quando).getTime() - 3 * 3600_000);
  if (br.getUTCDate() !== 1 || br.getUTCHours() !== 6) return null;
  if (!cofreLigado(env)) return null;
  const hoje = br.toISOString().slice(0, 10), mes = somarMeses(ym(hoje), -1);
  const marca = await env.DB.prepare("SELECT data FROM docs WHERE collection = '_sistema' AND id = 'simulador-fechamento'").first();
  let st = null;
  try { st = marca ? JSON.parse(marca.data) : null; } catch {}
  if (!st || st.mes !== mes) st = { mes, feitos: 0, fim: false, fechadas: 0, erros: 0, inicio: new Date(quando).toISOString() };
  if (st.fim) return { mes, fim: true, fechadas: 0 };
  const { results } = await env.DB.prepare("SELECT collection FROM docs WHERE id = 'simulacoes' AND collection >= 'carteira/' AND collection < 'carteira0' ORDER BY collection LIMIT ? OFFSET ?")
    .bind(SIM_POR_MINUTO, st.feitos).all();
  const pessoas = results || [];
  let fechadas = 0, erros = 0, base = null;
  for (const { collection: col } of pessoas) {
    try {
      const docs = await lerDocs(env, col, deps, true, IDS_TODOS);
      if (!mesParaFechar(docs.simulacoes, docs.mensal, ym(hoje)) || !temLinhas(docs.extrato)) continue;
      if (!base) {
        const ler = async (id) => { const r = await env.DB.prepare("SELECT data FROM docs WHERE collection = 'meta' AND id = ?").bind(id).first(); try { return r ? JSON.parse(r.data) : null; } catch { return null; } };
        base = { b3: await ler("b3"), fiiResumo: await ler("fii-resumo") };
      }
      const calc = calcular(docs.extrato, { ...base, importacoes: docs.importacoes, hoje });
      await gravarDocs(env, col, { mensal: comFechamento(docs.mensal, mes, fechamentoDoMes(calc, mes, new Date(quando).toISOString())) }, { gravarNoEspelho: () => {}, ...deps });
      limparCacheCarteira(col.slice(9));
      fechadas++;
    } catch (e) {
      erros++;
      console.error("simulador fechamento", String((e && e.name) || "erro"), String((e && e.message) || "").slice(0, 80));
    }
  }
  st.feitos += pessoas.length; st.fechadas += fechadas; st.erros += erros;
  if (pessoas.length < SIM_POR_MINUTO) { st.fim = true; st.terminou = new Date(quando).toISOString(); }
  await env.DB.prepare("INSERT INTO docs (collection, id, data) VALUES ('_sistema', 'simulador-fechamento', ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
    .bind(JSON.stringify(st)).run();
  return { mes, pessoas: pessoas.length, fechadas, erros, fim: st.fim };
}

// caminho depois de "simulacoes": "" | "/<id>" | "/<id>/analisar"
async function rotaSimulacoes(request, env, quem, resto, deps) {
  const col = "carteira/" + quem.email, m = request.method;
  if (resto && !resto.startsWith("/")) return resp({ erro: "rota" }, 404);
  const partes = resto.split("/").slice(1);
  const id = partes[0] || "", acao = partes[1] || "";
  if (partes.length > 2 || (acao && acao !== "analisar")) return resp({ erro: "rota" }, 404);
  if (resto && !ID_SIMULACAO.test(id)) return resp({ erro: "id" }, 400);
  const hoje = hojeDe(deps);
  if (!id && m === "GET") {
    const docs = await lerDocs(env, col, deps, false, IDS_SIM);
    return resp({ simulacoes: listarSimulacoes(docs.simulacoes, docs.mensal), max: MAX_SIMULACOES });
  }
  if (!id && m === "POST") {
    const { b, erro, status } = await lerCorpo(request, 2000);
    if (erro) return resp({ erro }, status);
    const docs = await lerDocs(env, col, deps, true, IDS_TODOS);
    if (!temLinhas(docs.extrato)) return resp({ erro: "Importe os extratos antes de simular." }, 409);
    const lista = (docs.simulacoes && docs.simulacoes.lista) || [];
    if (lista.length >= MAX_SIMULACOES) return resp({ erro: `Dá para guardar até ${MAX_SIMULACOES} simulações. Exclua uma para criar outra.` }, 400);
    const v = validarSimulacao(b, ym(hoje));
    if (v.erro) return resp({ erro: v.erro }, 400);
    const [b3, fiiResumo] = await Promise.all([lerMetaDoc(env, "b3", deps), lerMetaDoc(env, "fii-resumo", deps)]);
    const calc = calcular(docs.extrato, { b3, fiiResumo, importacoes: docs.importacoes, hoje });
    const memoria = memoriaSimulacao(calc, v.cfg, ym(hoje));
    if (memoria.erro) return resp({ erro: memoria.erro }, 400);
    const agora = new Date().toISOString();
    let sid = novoId();
    while (lista.some((x) => x.id === sid)) sid = novoId();
    const sim = { id: sid, nome: v.nome, criado: agora, atualizado: agora, cfg: v.cfg, memoria };
    await gravarDocs(env, col, { simulacoes: { v: 1, lista: lista.concat([sim]) } }, deps);
    limparCacheCarteira(quem.email);
    return resp(sim);
  }
  if (id && !acao && m === "DELETE") {
    const docs = await lerDocs(env, col, deps, true, IDS_SIM);
    const lista = (docs.simulacoes && docs.simulacoes.lista) || [];
    const resta = lista.filter((x) => x.id !== id);
    if (resta.length === lista.length) return resp({ erro: "Simulação não encontrada." }, 404);
    // A última que sai leva o doc junto (o cron procura quem tem simulacoes); os números de mensal ficam.
    if (resta.length) await gravarDocs(env, col, { simulacoes: { v: 1, lista: resta } }, deps);
    else {
      await env.DB.prepare("DELETE FROM docs WHERE collection = ? AND id = 'simulacoes'").bind(col).run();
      deps.removerDoEspelho(env, [{ collection: col, id: "simulacoes" }]);
    }
    limparCacheCarteira(quem.email);
    return resp({ ok: true, restam: resta.length });
  }
  if (id && (m === "GET" || (acao === "analisar" && m === "POST"))) {
    if ((m === "GET") !== !acao) return resp({ erro: "metodo" }, 405);
    const docs = await lerDocs(env, col, deps, false, IDS_SIM);
    const sim = ((docs.simulacoes && docs.simulacoes.lista) || []).find((x) => x.id === id);
    if (!sim) return resp({ erro: "Simulação não encontrada." }, 404);
    if (acao) return resp(analisarSimulacao(sim, docs.mensal));
    const doMes = (docs.mensal && docs.mensal.meses) || {};
    const meses = Object.fromEntries(sim.memoria.previsto.filter(([mes]) => doMes[mes]).map(([mes]) => [mes, doMes[mes]]));
    return resp({ ...sim, mensal: { meses } });
  }
  return resp({ erro: "metodo" }, 405);
}

// Reinvestir (src/pontuacao-fii.js): os 5 FIIs de maior pontuação pelos critérios da pessoa, o retrato dos FIIs por
// segmento e a divisão do aporte. Pesos, tetos e universo em prefs/<email>, doc "reinvestir" (JSON puro, sem cifra: não
// tem nada da carteira). GET ?universo=todos|meus (sem ele, o universo salvo) e &aporte=<número> para simular (de 0 a 10
// milhões, não fica salvo; sem ele ou inválido, o sugerido de aporteSugerido); PUT { pesos, tetos, universo }, corpo até
// 2 KB. O GET fica 60 s na memória por pessoa, universo e aporte.
async function lerPrefsReinvestir(env, email, deps, doD1) {
  try {
    const r = doD1 ? await env.DB.prepare("SELECT id, data FROM docs WHERE collection = ? AND id = 'reinvestir'").bind("prefs/" + email).first()
      : await deps.lerLinha(env, "prefs/" + email, "reinvestir");
    return respostaReinvestir(r ? JSON.parse(r.data) : null);
  } catch { return respostaReinvestir(null); }
}
// Aporte sugerido do Reinvestir: o da Meta; sem ele, a média de compras menos vendas dos 3 meses fechados antes do mês
// de hoje (o mês corrente ainda está pela metade); média zero ou negativa, ou sem carteira, R$ 1.000.
export function aporteSugerido(meta, calc, hoje) {
  if (meta && meta.aporte > 0) return { valor: r2(meta.aporte), origem: "meta" };
  if (calc && calc.fluxoMes) {
    const atual = ym(hoje);
    let soma = 0;
    for (let k = 1; k <= 3; k++) { const f = calc.fluxoMes.get(somarMeses(atual, -k)) || { compras: 0, vendas: 0 }; soma += f.compras - f.vendas; }
    if (soma / 3 >= 0.01) return { valor: r2(soma / 3), origem: "media3" };
  }
  return { valor: APORTE_PADRAO, origem: "padrao" };
}
// Compras recentes do equilíbrio: compras menos vendas de cada FII nos 3 meses fechados antes do mês de hoje mais o mês
// de hoje (no dia 10/11: agosto, setembro, outubro e novembro). { desde: "AAAA-MM", porPapel: { t: valor } }.
export function comprasRecentes(calc, hoje) {
  const atual = ym(hoje), desde = somarMeses(atual, -3);
  const porPapel = {};
  if (calc && calc.fluxoPapel) for (const [t, x] of calc.fluxoPapel) {
    if (x.classe !== "fii") continue;
    let soma = 0;
    for (const [m, v] of x.meses) if (m >= desde && m <= atual) soma += v;
    if (Math.abs(soma) >= 0.005) porPapel[t] = r2(soma);
  }
  return { desde, porPapel };
}
export const APORTE_MAX = 10000000;
// ?aporte= da URL: número de 0 a 10 milhões (ponto decimal); qualquer outra coisa vale como ausente.
export function aporteDaUrl(txt) {
  if (txt == null || !/^\d{1,8}(\.\d{1,2})?$/.test(txt.trim())) return null;
  const v = Number(txt);
  return Number.isFinite(v) && v >= 0 && v <= APORTE_MAX ? v : null;
}
async function montarReinvestir(env, quem, universo, prefs, deps, aporteSim = null) {
  const col = "carteira/" + quem.email;
  const docs = await lerDocs(env, col, deps, false);
  const hoje = hojeDe(deps);
  const [b3, fiiResumo, mercado] = await Promise.all([lerMetaDoc(env, "b3", deps), lerMetaDoc(env, "fii-resumo", deps), lerMetaDoc(env, "mercado", deps)]);
  const vazia = !temLinhas(docs.extrato);
  const calc = vazia ? null : calcular(docs.extrato, { b3, fiiResumo, importacoes: docs.importacoes, hoje });
  const sugerido = aporteSugerido(docs.meta, calc, hoje);
  const aporte = aporteSim == null ? sugerido : { valor: aporteSim, origem: "simulado" };
  const compras = comprasRecentes(calc, hoje);
  const out = reinvestir({ b3, fiiResumo, mercado, posicoes: calc ? calc.posicoes : [], aporte, sugerido, pesos: prefs.pesos, tetos: prefs.tetos, universo, compras });
  return { ...out, vazia, salvo: prefs.salvo, universoSalvo: prefs.universo };
}
async function rotaReinvestir(request, env, quem, deps) {
  const m = request.method;
  if (m === "GET") {
    const prefs = await lerPrefsReinvestir(env, quem.email, deps, false);
    const pedido = new URL(request.url).searchParams.get("universo");
    if (pedido && !UNIVERSOS.includes(pedido)) return resp({ erro: "Universo: use todos ou meus." }, 400);
    const universo = pedido || prefs.universo;
    const aporteSim = aporteDaUrl(new URL(request.url).searchParams.get("aporte"));
    const chave = quem.email + "|" + universo + "|" + (aporteSim == null ? "" : aporteSim);
    const c = cacheReinv.get(chave);
    if (c && Date.now() - c.em < CACHE_MS) return new Response(c.txt, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" } });
    const txt = JSON.stringify(await montarReinvestir(env, quem, universo, prefs, deps, aporteSim));
    if (cacheReinv.size > 400) cacheReinv.clear();
    cacheReinv.set(chave, { em: Date.now(), txt });
    return new Response(txt, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" } });
  }
  if (m === "PUT") {
    const { b, erro, status } = await lerCorpo(request, 2048);
    if (erro) return resp({ erro }, status);
    const v = validarReinvestir(b);
    if (v.erro) return resp({ erro: v.erro }, 400);
    const col = "prefs/" + quem.email, atualizado = new Date().toISOString();
    const data = JSON.stringify({ ...v.reinvestir, atualizado });
    await env.DB.prepare("INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES (?, 'reinvestir', ?, '', ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = excluded.atualizado")
      .bind(col, data, atualizado).run();
    deps.gravarNoEspelho(env, [{ collection: col, id: "reinvestir", data, coletado: "", atualizado }]);
    limparCacheCarteira(quem.email);
    return resp({ ok: true, ...v.reinvestir, salvo: true });
  }
  return resp({ erro: "metodo" }, 405);
}

// caminho: "" | "importar" | "meta" | "importacoes/<id>" | "simulacoes" | "simulacoes/<id>" | "simulacoes/<id>/analisar" | "reinvestir"
export async function rotaCarteira(request, env, quem, caminho, deps) {
  if (!cofreLigado(env)) return resp({ erro: "carteira desligada" }, 503);
  const col = "carteira/" + quem.email;
  const m = request.method;
  try {
    if (caminho === "" && m === "GET") {
      const c = cacheGet.get(quem.email);
      if (c && Date.now() - c.em < CACHE_MS) return new Response(c.txt, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" } });
      const txt = JSON.stringify(await montar(env, quem, deps));
      if (cacheGet.size > 200) cacheGet.clear();
      cacheGet.set(quem.email, { em: Date.now(), txt });
      return new Response(txt, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" } });
    }
    if (caminho === "reinvestir") return await rotaReinvestir(request, env, quem, deps);
    if (caminho === "simulacoes" || caminho.startsWith("simulacoes/")) return await rotaSimulacoes(request, env, quem, caminho.slice(10), deps);
    if (caminho === "" && m === "DELETE") {
      await env.DB.prepare(`DELETE FROM docs WHERE collection = ? AND id IN (${IDS_TODOS.map(() => "?").join(", ")})`).bind(col, ...IDS_TODOS).run();
      deps.removerDoEspelho(env, IDS_TODOS.map((id) => ({ collection: col, id })));
      limparCacheCarteira(quem.email);
      const listas = await sincronizarListas(env, quem, null, null, deps);
      return resp({ ok: true, listas });
    }
    if (caminho === "importar" && m === "POST") {
      const { b, erro, status } = await lerCorpo(request, 8_000_000);
      if (erro) return resp({ erro }, status);
      const arquivos = b && Array.isArray(b.arquivos) ? b.arquivos : null;
      if (!arquivos || !arquivos.length) return resp({ erro: "Nenhum arquivo." }, 400);
      if (arquivos.length > MAX_ARQUIVOS) return resp({ erro: `Mande até ${MAX_ARQUIVOS} arquivos por vez.` }, 400);
      let total = 0;
      for (const a of arquivos) {
        if (!a || typeof a !== "object" || !Array.isArray(a.linhas)) return resp({ erro: "arquivo" }, 400);
        if (!CAMPO[a.tipo]) return resp({ erro: "Tipo de arquivo desconhecido." }, 400);
        total += a.linhas.length;
        a.nome = String(a.nome || "").slice(0, 120);
        a.hash = /^[0-9a-f]{16,64}$/.test(String(a.hash || "")) ? String(a.hash).slice(0, 16) : await hashDe(a.linhas);
      }
      if (total > MAX_LINHAS) return resp({ erro: `Até ${MAX_LINHAS.toLocaleString("pt-BR")} linhas por vez. Mande os arquivos em partes.` }, 413);
      const docs = await lerDocs(env, col, deps, true);
      const imp = novoId();
      const r = mesclar(docs.extrato || extratoVazio(), arquivos, imp);
      const porArquivo = r.porArquivo.map((x) => ({ nome: x.nome, tipo: x.tipo, linhas: x.linhas, novos: x.novos, repetidos: x.repetidos, ignorados: x.ignorados, motivos: x.motivos, de: x.de, ate: x.ate, tiposDesconhecidos: x.tiposDesconhecidos }));
      const saida = { novos: r.novos, repetidos: r.repetidos, ignorados: r.ignorados, porArquivo };
      if (b.simular === true) return resp({ ...saida, simulado: true, gravado: false });
      // Nada novo: a carteira fica como está, mas as listas automáticas são conferidas (voltam se a pessoa apagou alguma)
      if (!r.novos) return resp({ ...saida, simulado: false, gravado: false, listas: await sincronizarListas(env, quem, docs.extrato, docs.importacoes, deps) });
      const lista = (docs.importacoes?.lista || []).concat([{ id: imp, em: new Date().toISOString(), novos: r.novos,
        arquivos: r.porArquivo.filter((x) => x.novos).map((x) => ({ tipo: x.tipo, hash: x.hash, linhas: x.linhas, novos: x.novos, repetidos: x.repetidos, ignorados: x.ignorados, de: x.de, ate: x.ate })) }]).slice(-MAX_IMPORTACOES);
      await gravarDocs(env, col, { extrato: r.extrato, importacoes: { lista } }, deps);
      limparCacheCarteira(quem.email);
      const listas = await sincronizarListas(env, quem, r.extrato, { lista }, deps);
      return resp({ ...saida, gravado: true, importacao: imp, listas });
    }
    if (caminho.startsWith("importacoes/") && m === "DELETE") {
      const id = caminho.slice(12);
      if (!/^[a-z0-9]{4,20}$/.test(id)) return resp({ erro: "id" }, 400);
      const docs = await lerDocs(env, col, deps, true);
      const lista = docs.importacoes?.lista || [];
      if (!lista.some((x) => x.id === id)) return resp({ erro: "Importação não encontrada." }, 404);
      const r = desfazer(docs.extrato || extratoVazio(), id);
      const restantes = lista.filter((x) => x.id !== id);
      await gravarDocs(env, col, { extrato: r.extrato, importacoes: { lista: restantes } }, deps);
      limparCacheCarteira(quem.email);
      const listas = await sincronizarListas(env, quem, r.extrato, { lista: restantes }, deps);
      return resp({ ok: true, removidas: r.removidas, listas });
    }
    if (caminho === "meta" && m === "GET") {
      const j = await montar(env, quem, deps);
      return resp(j.meta);
    }
    if (caminho === "meta" && m === "PUT") {
      const { b, erro, status } = await lerCorpo(request, 2000);
      if (erro) return resp({ erro }, status);
      const v = validarMeta(b);
      if (v.erro) return resp({ erro: v.erro }, 400);
      await gravarDocs(env, col, { meta: { ...v.meta, atualizado: new Date().toISOString() } }, deps);
      limparCacheCarteira(quem.email);
      const j = await montar(env, quem, { ...deps, lerLinhas: async (e, sql, args) => (await env.DB.prepare(sql).bind(...args).all()).results });
      return resp({ ok: true, meta: j.meta });
    }
    return resp({ erro: "metodo" }, 405);
  } catch (e) {
    if (e && e.status === 413) return resp({ erro: e.message }, 413);
    // Sem detalhes no log: a mensagem pode vir do cálculo, mas nunca leva linha da carteira
    console.error("carteira", String((e && e.name) || "erro"), String((e && e.message) || "").slice(0, 80));
    return resp({ erro: "Não deu para abrir a carteira agora." }, 500);
  }
}
