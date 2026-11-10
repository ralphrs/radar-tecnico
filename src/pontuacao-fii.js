// Reinvestir: pontuação de FIIs pelos critérios que a pessoa define (card da Minha carteira, acima de Posições).
//
// Conta pura, sem nada do Worker nem do navegador, para os testes rodarem no Node. A tela mostra a conta e os fatos de
// cada papel; nenhum texto daqui diz o que fazer com ele.
//
// Cada critério dá uma parcial de 0 a 1, multiplicada pelo peso. Pontos = soma(peso × parcial) / soma dos pesos dos
// critérios com dado × 100, arredondado. Critério com peso 0 não entra (nem na soma, nem em `faltando`). FII com mais
// de 2 critérios sem dado fica fora da lista e conta em `excluidos`.
//
// De onde vem cada dado (as linhas são as do Radar de dividendos, public/radar-filtro.js, linhasFii):
// - pvp: preço do meta/b3 (brapi) / valor patrimonial da cota do último informe da CVM.
// - dy: rendimento de 12 meses da CVM (r12 do meta/fii-resumo) / preço, contra o CDI do painel de mercado (meta/mercado,
//   Banco Central, série 4389). A NTN-B entra como referência numa versão futura, quando o Tesouro entrar no Lookout.
// - regularidade: `pg` do meta/fii-resumo, a mesma fonte do critério "12 de 12 meses" do Radar: quantos dos últimos 12
//   informes mensais da CVM tiveram rendimento acima de zero. Fundo com menos de 12 informes conta só os que tem.
// - rendimento: último rendimento por cota (`rend`) contra a média de 12 meses (r12 / 12), os dois da CVM.
// - liquidez: volume do último pregão × preço, do meta/b3 (a mesma "liquidez do dia" do Radar). O Lookout não guarda
//   a média diária de um período; quando guardar, troca aqui.
// - cotistas: total de cotistas do último informe da CVM.
// - abaixo: cotação do meta/b3 contra o preço médio da posição, que vem do extrato importado (calcular). Só vale para
//   papel que a pessoa tem. A régua é o limite de compra da pessoa (limites.compra, em prefs).
// - equilibrio: o menor de três partes, todas sobre a parte de FIIs da carteira depois de pôr o aporte inteiro no papel:
//   o peso do papel contra o teto por papel, o peso do segmento (o da CVM) contra o teto por segmento e quanto das
//   compras dos últimos 3 meses fechados mais o mês atual (do extrato) foi neste papel. Tetos da pessoa, em prefs.
//
// Papel passível de venda pelo limite da pessoa (cotação ≥ preço médio × (1 + venda%)) não entra na lista nem na
// divisão: conta em `foraPorVenda`.
//
// Divisão do aporte (dividirAporte): cota inteira por cota inteira, cada uma para o papel de maior pontuação naquele
// passo, com a carteira já somando as cotas anteriores. Com tetos, a conta espalha sozinha.
import "../public/radar-filtro.js";
const RF = globalThis.RadarFiltro;

export const CRITERIOS = [
  { id: "equilibrio", nome: "Equilíbrio", peso: 25, faixa: "o menor de três: papel e segmento até o teto (zero no dobro); até 25% das compras recentes neste papel" },
  { id: "abaixo", nome: "Abaixo do que você pagou", peso: 25, faixa: "só para papel que você tem: zero até cair 10% do seu preço médio; máximo com o dobro" },
  { id: "dy", nome: "DY 12m sobre o CDI", peso: 20, faixa: "zero no CDI; máximo com 4 pontos acima" },
  { id: "pvp", nome: "P/VP", peso: 20, faixa: "máximo de 0,85 a 1,00; zero em 1,25 e em 0,60" },
  { id: "regularidade", nome: "Regularidade", peso: 10, faixa: "12 de 12 meses pagando = máximo; 11 = 70%; 10 = 40%" },
  { id: "liquidez", nome: "Liquidez", peso: 10, faixa: "máximo com R$ 1 mi por dia; zero abaixo de R$ 100 mil" },
  { id: "cotistas", nome: "Cotistas", peso: 10, faixa: "máximo com 100 mil; 30% com 10 mil" },
  { id: "rendimento", nome: "Último rendimento", peso: 5, faixa: "máximo na média de 12 meses; zero 30% abaixo" },
];
export const IDS = CRITERIOS.map((c) => c.id);
export const PESOS_PADRAO = Object.fromEntries(CRITERIOS.map((c) => [c.id, c.peso]));
export const PESO_MAX = 50;
export const MAX_FALTANDO = 2;
export const APORTE_PADRAO = 1000;
export const UNIVERSOS = ["todos", "meus"];
export const TOP = 5;
// Tetos do equilíbrio, em % da parte de FIIs: inteiros, papel de 2 a 50, segmento de 5 a 100
export const TETOS_PADRAO = { papel: 10, segmento: 25 };
export const TETOS_LIM = { papel: [2, 50], segmento: [5, 100] };
export const CANDIDATOS_DIVISAO = 15;
// Limites da pessoa por posição, em % sobre o preço médio: inteiros de 1 a 90 (pedido de 10/11)
export const LIMITES_PADRAO = { compra: 10, venda: 10 };
export const LIMITES_LIM = [1, 90];
export const PASSOS_DIVISAO = 400;

const fmt = RF.fmt, fmtMi = RF.fmtMi;
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const lim = (x) => Math.round(Math.max(0, Math.min(1, x)) * 1e6) / 1e6;
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

// ---------- limites de compra e de venda ----------
// Limites salvos (já conferidos) por cima do padrão; o que vier estragado fica no padrão.
export const limitesDe = (salvos) => {
  const out = { ...LIMITES_PADRAO };
  for (const k of Object.keys(LIMITES_PADRAO)) {
    const v = salvos && salvos[k];
    if (Number.isInteger(v) && v >= LIMITES_LIM[0] && v <= LIMITES_LIM[1]) out[k] = v;
  }
  return out;
};
// Variação da cotação contra o preço médio, em %, sem o ruído do ponto flutuante (11 contra 10 dá 10, não 10,000…02)
const variacao = (preco, pm) => Math.round(((preco - pm) / pm) * 1e8) / 1e6;
// A posição contra os limites da pessoa, pelo preço médio do extrato:
// cotação ≥ pm × (1 + venda%) = "venda"; cotação ≤ pm × (1 − compra%) = "compra"; no meio, null.
// pct com 1 casa; faltaCompra e faltaVenda em pontos percentuais (0 no lado atingido; no outro, nunca menos que 0,1, para
// a tela não dizer "falta 0,0"). Sem cotação ou sem preço médio: null.
export function sinalPosicao(preco, pm, limites) {
  if (!(num(preco) > 0) || !(num(pm) > 0)) return null;
  const L = limitesDe(limites), d = variacao(preco, pm);
  const tipo = d >= L.venda ? "venda" : d <= -L.compra ? "compra" : null;
  const falta = (x) => Math.max(0.1, r1(x));
  return {
    tipo, pct: r1(d),
    faltaCompra: tipo === "compra" ? 0 : falta(d + L.compra),
    faltaVenda: tipo === "venda" ? 0 : falta(L.venda - d),
    precoCompra: r2(pm * (1 - L.compra / 100)), precoVenda: r2(pm * (1 + L.venda / 100)),
  };
}

// ---------- parciais (0 a 1), uma por critério; null = sem dado ----------
// Abaixo do que a pessoa pagou: cotação contra o preço médio da posição (o do extrato), na régua do limite de compra
// da pessoa (padrão 10%). Queda menor que o limite = 0; no limite = 0,6; sobe em linha reta até 1 no dobro do limite;
// acima do preço médio = 0. Pedido do dono (10/11): pôr o aporte onde a posição caiu até o limite dele. Papel que a
// pessoa não tem não entra na conta deste critério (nem soma, nem conta como dado faltando).
export function parcialAbaixo(preco, pm, limiteCompra = LIMITES_PADRAO.compra) {
  if (!(num(preco) > 0) || !(num(pm) > 0)) return null;
  const L = limitesDe({ compra: limiteCompra }).compra, q = -variacao(preco, pm);
  if (q < L) return 0;
  return lim(0.6 + (0.4 * (q - L)) / L);
}
export function notaAbaixo(preco, pm, limiteCompra = LIMITES_PADRAO.compra) {
  if (!(num(pm) > 0)) return "você não tem este papel";
  if (!(num(preco) > 0)) return "sem cotação";
  const L = limitesDe({ compra: limiteCompra }).compra, d = variacao(preco, pm);
  const txt = `cotação R$ ${fmt(preco, 2)}, seu preço médio R$ ${fmt(pm, 2)}`;
  if (Math.abs(d) < 0.05) return `${txt}: no preço médio`;
  if (d > 0) return `cotação R$ ${fmt(preco, 2)}: ${fmt(d, 1)}% acima do seu preço médio (R$ ${fmt(pm, 2)})`;
  const q = -d;
  if (q >= L) return `${txt}: ${fmt(q, 1)}% abaixo, ${r1(q) === L ? "no" : "passou do"} seu limite de ${L}%`;
  return `${txt}: ${fmt(q, 1)}% abaixo, falta ${fmt(Math.max(0.1, r1(L - q)), 1)} para o seu limite de ${L}%`;
}
// P/VP: 1 entre 0,85 e 1,00. Acima, cai em linha reta até 0 em 1,25. Abaixo, cai 4 por unidade (0,70 dá 0,4 e 0,60 dá 0):
// desconto grande costuma ter motivo.
export function parcialPvp(v) {
  if (v == null || !(v > 0)) return null;
  if (v >= 0.85 && v <= 1) return 1;
  if (v > 1) return lim(1 - (v - 1) / 0.25);
  return lim(1 - (0.85 - v) * 4);
}
// DY 12m e CDI em % ao ano. 0 com o DY no CDI ou abaixo, 1 com 4 pontos ou mais acima, linear no meio.
export function parcialDy(dy, cdi) {
  if (dy == null || cdi == null) return null;
  return lim((dy - cdi) / 4);
}
// Meses com rendimento nos últimos 12: 12 = 1; 11 = 0,7; 10 = 0,4; menos = 0.
export function parcialRegularidade(pg) {
  if (pg == null) return null;
  return pg >= 12 ? 1 : pg === 11 ? 0.7 : pg === 10 ? 0.4 : 0;
}
// Último rendimento sobre a média de 12 meses: na média ou acima = 1; cai em linha reta até 0 com 30% abaixo.
export function parcialRendimento(ult, media) {
  if (ult == null || media == null || !(media > 0)) return null;
  return lim((ult / media - 0.7) / 0.3);
}
// Volume em R$ por dia: R$ 1 mi ou mais = 1; R$ 200 mil = 0,2 (linear: volume / R$ 1 mi); abaixo de R$ 100 mil = 0.
export function parcialLiquidez(liq) {
  if (liq == null) return null;
  return liq < 1e5 ? 0 : lim(liq / 1e6);
}
// Cotistas, linear no log: 100 mil ou mais = 1; 10 mil = 0,3; a mesma reta segue para baixo até 0 (uns 3,7 mil).
export function parcialCotistas(c) {
  if (c == null || c < 0) return null;
  if (c <= 0) return 0;
  return lim(0.3 + 0.7 * (Math.log10(c) - 4));
}
// Parte do equilíbrio contra um teto (frações): até o teto = 1; cai em linha reta até 0 no dobro do teto.
export function parcialTeto(x, teto) {
  if (x == null || !(teto > 0)) return null;
  return x <= teto ? 1 : lim(1 - (x - teto) / teto);
}
// Parte das compras recentes (fração das compras de FIIs do período que foi neste papel): até 25% = 1; cai em linha reta
// até 0,3 com 100%. Sem compra no período (null) = 1.
export function parcialCompras(c) {
  if (c == null || c <= 0.25) return 1;
  return lim(1 - (0.7 * (Math.min(c, 1) - 0.25)) / 0.75);
}

// ---------- notas: o que a conta viu, em uma frase ----------
const pct1 = (v) => fmt(v, 1) + "%";
function notaPvp(v) {
  if (v == null || !(v > 0)) return "sem P/VP (falta preço ou valor patrimonial)";
  const t = "P/VP " + fmt(v, 2);
  if (v >= 0.85 && v <= 1) return t + ": dentro da faixa de 0,85 a 1,00";
  if (v > 1) return v >= 1.25 ? t + ": 1,25 ou mais, sem pontos" : t + ": acima de 1,00";
  return v <= 0.6 ? t + ": 0,60 ou menos, sem pontos" : t + ": abaixo de 0,85, desconto grande costuma ter motivo";
}
function notaDy(dy, cdi) {
  if (cdi == null) return "sem CDI no painel de mercado";
  if (dy == null) return "sem DY 12m (falta preço ou rendimento no informe)";
  const s = dy - cdi, base = `DY 12m ${pct1(dy)} contra CDI ${fmt(cdi, 2)}%`;
  if (s <= 0) return base + ": no CDI ou abaixo";
  return `${base}: ${fmt(s, 1)} ${s >= 0.95 && s < 1.05 ? "ponto" : "pontos"} acima${s >= 4 ? " (4 ou mais dão o máximo)" : ""}`;
}
function notaRegularidade(pg, m12) {
  if (pg == null) return "sem informes de rendimento na CVM";
  const t = `${pg} ${pg === 1 ? "pagamento" : "pagamentos"} em 12 meses`;
  return m12 != null && m12 < 12 ? `${t} (a CVM tem só ${m12} ${m12 === 1 ? "informe" : "informes"} do fundo)` : t;
}
function notaRendimento(ult, media) {
  if (ult == null || media == null || !(media > 0)) return "sem rendimento médio de 12 meses";
  const d = (ult / media - 1) * 100;
  const base = `último R$ ${fmt(ult, 2)} por cota contra média de R$ ${fmt(media, 2)}`;
  if (Math.abs(d) < 0.5) return base + ": na média";
  return `${base}: ${fmt(Math.abs(d), 0)}% ${d > 0 ? "acima" : "abaixo"}${d <= -30 ? ", sem pontos" : ""}`;
}
function notaLiquidez(liq) {
  if (liq == null) return "sem volume negociado no meta/b3";
  return `${fmtMi(liq)} negociados no último pregão${liq < 1e5 ? ", abaixo de R$ 100 mil, sem pontos" : ""}`;
}
function notaCotistas(c) {
  if (c == null) return "sem número de cotistas no informe";
  return `${fmt(c, 0)} ${c === 1 ? "cotista" : "cotistas"}`;
}
// ---------- universo ----------
// Linhas no formato do Radar (RF.linhasFii) com a média de 12 meses junto. universo "meus": só os FIIs da carteira;
// os que não estão entre os mais negociados do meta/b3 entram com o preço da posição e sem liquidez.
// posicoes: as de calcular() (t, q, valor, preco, classe).
export function linhasUniverso({ b3, fiiResumo, posicoes, universo = "todos" }) {
  const fundos = (fiiResumo && fiiResumo.fundos) || {};
  const meus = (posicoes || []).filter((p) => p && p.q > 0 && p.classe === "fii");
  let base = (b3 && b3.fiis) || [];
  if (universo === "meus") {
    const porT = new Map(base.map((x) => [x.t, x]));
    base = meus.map((p) => porT.get(p.t) || { t: p.t, nome: p.nome || p.t, preco: num(p.preco), var: null, vol: null });
  }
  return RF.linhasFii({ fiis: base }, fundos).filter((l) => l.temCvm).map((l) => {
    const f = fundos[l.t];
    const r12 = num(f.r12);
    return { ...l, media: r12 != null && f.m12 ? r12 / 12 : null };
  });
}


// ---------- equilíbrio ----------
const MESES_NOME = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeMes = (m) => (typeof m === "string" && /^\d{4}-\d{2}$/.test(m) ? MESES_NOME[Number(m.slice(5)) - 1] : "");
const semAcento = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

// Segmento do equilíbrio: o da CVM (campo `s` do meta/fii-resumo), com as grafias de títulos e valores mobiliários
// juntas num rótulo só. Sem segmento = "Outros". A CVM não separa fundo de fundos: ele cai no segmento que o
// administrador informou (quase sempre títulos ou outros).
export function segmentoDe(s) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "Outros";
  const k = semAcento(t);
  if (/^TITULOS\b|^TVM$/.test(k)) return "Títulos e Val. Mob.";
  if (k === "OUTROS" || k === "SEM SEGMENTO") return "Outros";
  if (k === "HIBRIDO") return "Híbrido";
  return t;
}

// Percentual curto para as notas: inteiro; com uma casa quando o inteiro esconderia a diferença.
// pc(10,2, 10) dá "10,2%", para não aparecer "10%, acima do teto de 10%".
const pc = (v, ...outros) => {
  const c = outros.some((o) => o != null && Math.round(v) === Math.round(o) && Math.abs(v - o) >= 0.05) ? 1 : 0;
  return fmt(c ? Math.round(v * 10) / 10 : Math.round(v), c) + "%";
};

// Retrato dos FIIs da carteira. posicoes: as de calcular(); fundos: meta/fii-resumo.fundos (para o segmento).
export function baseFiis(posicoes, fundos = {}) {
  const porPapel = {}, porSeg = {}, segPapel = {};
  let total = 0;
  for (const p of posicoes || []) {
    if (!p || !(p.q > 0) || p.classe !== "fii") continue;
    const v = num(p.valor) || 0;
    const seg = segmentoDe((fundos[p.t] && fundos[p.t].s) || p.seg);
    porPapel[p.t] = (porPapel[p.t] || 0) + v;
    porSeg[seg] = (porSeg[seg] || 0) + v;
    segPapel[p.t] = seg;
    total += v;
  }
  return { porPapel, porSeg, segPapel, total };
}

// Compras recentes: { desde: "AAAA-MM", porPapel: { t: compras − vendas no período } }. Conta só o que ficou positivo.
function comprasDe(c) {
  const porPapel = {};
  let total = 0;
  for (const [t, v] of Object.entries((c && c.porPapel) || {})) if (num(v) > 0) { porPapel[t] = v; total += v; }
  return { porPapel, total, desde: (c && c.desde) || null };
}

// Equilíbrio de um papel. base: baseFiis (pode já somar o que a divisão alocou); entra: quanto vai para o papel agora;
// final: total dos FIIs no fim (o de hoje mais o aporte inteiro); compras: comprasDe; tetos em frações.
// semFii: carteira sem FII hoje (só na lista; a divisão faz a conta mesmo assim, sobre o aporte).
function contaEquilibrio(t, seg, entra, base, final, compras, tetos, semFii) {
  const vP = base.porPapel[t] || 0, vS = base.porSeg[seg] || 0, T = base.total;
  const papelAntes = T > 0 ? vP / T : 0, segAntes = T > 0 ? vS / T : 0;
  const papelDepois = final > 0 ? (vP + entra) / final : 0, segDepois = final > 0 ? (vS + entra) / final : 0;
  const cp = compras.total > 0 ? (compras.porPapel[t] || 0) / compras.total : null;
  const partes = {
    papel: { antes: r1(papelAntes * 100), depois: r1(papelDepois * 100), teto: Math.round(tetos.papel * 100), parcial: parcialTeto(papelDepois, tetos.papel) },
    segmento: { nome: seg, antes: r1(segAntes * 100), depois: r1(segDepois * 100), teto: Math.round(tetos.segmento * 100), parcial: parcialTeto(segDepois, tetos.segmento) },
    compras: { pct: cp == null ? null : r1(cp * 100), desde: compras.desde, parcial: parcialCompras(cp) },
  };
  if (semFii) return { parcial: 1, limita: null, partes, nota: "você ainda não tem FIIs" };
  let limita = "papel";
  for (const k of ["segmento", "compras"]) if (partes[k].parcial < partes[limita].parcial - 1e-9) limita = k;
  const parcial = partes[limita].parcial;
  if (parcial >= 1) return { parcial: 1, limita: null, partes, nota: `dentro dos tetos: papel ${pc(papelDepois * 100)}, segmento ${pc(segDepois * 100)}` };
  let nota;
  const mexe = (a, d) => d - a >= 0.0005;
  // já acima do teto hoje: "já é"; senão, de quanto para quanto o aporte levaria
  const frase = (antes, depois, teto, tinha) => antes > teto
    ? `já é ${pc(antes * 100, teto * 100)} dos seus FIIs, acima do teto de ${pc(teto * 100)}${mexe(antes, depois) ? `; com o aporte, ${pc(depois * 100, antes * 100, teto * 100)}` : ""}`
    : `${tinha ? `iria de ${pc(antes * 100, depois * 100)} para` : "iria a"} ${pc(depois * 100, antes * 100, teto * 100)} dos seus FIIs, acima do teto de ${pc(teto * 100)}`;
  if (limita === "papel") nota = frase(papelAntes, papelDepois, tetos.papel, vP > 0);
  else if (limita === "segmento") nota = `${seg} ${frase(segAntes, segDepois, tetos.segmento, vS > 0)}`;
  else {
    const m = nomeMes(compras.desde);
    nota = `${pc(cp * 100)} das suas compras de FIIs${m ? " desde " + m : " recentes"} foram neste papel`;
  }
  return { parcial, limita, partes, nota };
}

// O equilíbrio de um papel sozinho (testes e conferência): aporte inteiro nele, sobre os FIIs de `fiis` (baseFiis).
export function equilibrio(t, seg, { fiis, compras, tetos, aporte = 0 } = {}) {
  const tt = tetosDe(tetos), b = fiis || baseFiis([]);
  return contaEquilibrio(t, segmentoDe(seg), aporte, b, b.total + aporte, comprasDe(compras), { papel: tt.papel / 100, segmento: tt.segmento / 100 }, !(b.total > 0));
}

// Pesos e tetos de uma pessoa: os salvos (já conferidos) por cima do padrão. Peso salvo como `carteira` (o critério de
// antes) vale como `equilibrio`.
export function migrarPesos(p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return p;
  if (!("carteira" in p)) return p;
  const { carteira, ...resto } = p;
  return "equilibrio" in resto ? resto : { ...resto, equilibrio: carteira };
}
// Pesos padrão de antes do equilíbrio. Quem salvou exatamente eles não escolheu nada: passa a valer o padrão novo.
const PESOS_ANTIGOS = { pvp: 20, dy: 25, regularidade: 15, rendimento: 10, liquidez: 10, cotistas: 10, carteira: 10 };
const eramOsAntigos = (p) => !!p && typeof p === "object" && Object.keys(PESOS_ANTIGOS).every((k) => p[k] === PESOS_ANTIGOS[k]) && !("equilibrio" in p);
export const pesosDe = (salvos) => {
  if (eramOsAntigos(salvos)) return { ...PESOS_PADRAO };
  const s = migrarPesos(salvos && typeof salvos === "object" ? salvos : {});
  const out = { ...PESOS_PADRAO };
  for (const id of IDS) if (num(s[id]) != null) out[id] = s[id];
  return out;
};
export const tetosDe = (salvos) => {
  const out = { ...TETOS_PADRAO };
  for (const k of Object.keys(TETOS_PADRAO)) {
    const v = salvos && salvos[k];
    if (Number.isInteger(v) && v >= TETOS_LIM[k][0] && v <= TETOS_LIM[k][1]) out[k] = v;
  }
  return out;
};

// Pontua cada linha. opts: { cdi (% a.a.), fiis: baseFiis(...), compras: { desde, porPapel }, aporte, pesos, tetos }.
// Devolve { avaliados: [...] em ordem de pontos, excluidos: [{ t, faltando }], aporte, cdi }. Cada avaliado leva
// `_fixo` (soma e pesos dos critérios fora o equilíbrio), usado pela divisão do aporte e tirado da resposta.
export function pontuar(linhas, opts = {}) {
  const cdi = num(opts.cdi);
  const pesos = pesosDe(opts.pesos);
  const tt = tetosDe(opts.tetos), tetos = { papel: tt.papel / 100, segmento: tt.segmento / 100 };
  const aporte = num(opts.aporte) != null && opts.aporte >= 0 ? opts.aporte : APORTE_PADRAO;
  const base = opts.fiis || baseFiis([]);
  const compras = comprasDe(opts.compras);
  const semFii = !(base.total > 0);
  const pms = opts.pm || {};
  const limites = limitesDe(opts.limites);
  const ativos = CRITERIOS.filter((c) => num(pesos[c.id]) > 0);
  const avaliados = [], excluidos = [], foraPorVenda = [];
  for (const l of linhas || []) {
    const seg = segmentoDe(l.seg);
    const eq = contaEquilibrio(l.t, seg, aporte, base, base.total + aporte, compras, tetos, semFii);
    const pmL = num(pms[l.t]) > 0 ? pms[l.t] : null;
    const sinal = pmL != null ? sinalPosicao(num(l.preco), pmL, limites) : null;
    const dados = {
      abaixo: { valor: pmL != null && num(l.preco) > 0 ? r2(((l.preco - pmL) / pmL) * 100) : null, parcial: parcialAbaixo(num(l.preco), pmL, limites.compra), nota: notaAbaixo(num(l.preco), pmL, limites.compra), naoSeAplica: pmL == null },
      pvp: { valor: num(l.pvp), parcial: parcialPvp(num(l.pvp)), nota: notaPvp(num(l.pvp)) },
      dy: { valor: num(l.dy), parcial: parcialDy(num(l.dy), cdi), nota: notaDy(num(l.dy), cdi) },
      regularidade: { valor: num(l.pg), parcial: parcialRegularidade(num(l.pg)), nota: notaRegularidade(num(l.pg), num(l.m12)) },
      rendimento: { valor: num(l.rend), parcial: parcialRendimento(num(l.rend), num(l.media)), nota: notaRendimento(num(l.rend), num(l.media)) },
      liquidez: { valor: num(l.liq), parcial: parcialLiquidez(num(l.liq)), nota: notaLiquidez(num(l.liq)) },
      cotistas: { valor: num(l.cot), parcial: parcialCotistas(num(l.cot)), nota: notaCotistas(num(l.cot)) },
      equilibrio: { valor: eq.partes.papel.depois, parcial: eq.parcial, nota: eq.nota, partes: eq.partes, limita: eq.limita },
    };
    const criterios = [], faltando = [];
    let soma = 0, somaPesos = 0, fixo = 0, fixoPesos = 0;
    for (const c of ativos) {
      const d = dados[c.id], w = pesos[c.id];
      const extra = c.id === "equilibrio" ? { partes: d.partes, limita: d.limita } : {};
      if (d.naoSeAplica) { criterios.push({ id: c.id, nome: c.nome, valor: null, pontos: null, max: w, nota: d.nota, naoSeAplica: true }); continue; }
      if (d.parcial == null) { faltando.push(c.id); criterios.push({ id: c.id, nome: c.nome, valor: d.valor, pontos: null, max: w, nota: d.nota, ...extra }); continue; }
      soma += w * d.parcial; somaPesos += w;
      if (c.id !== "equilibrio") { fixo += w * d.parcial; fixoPesos += w; }
      criterios.push({ id: c.id, nome: c.nome, valor: d.valor, pontos: r1(w * d.parcial), max: w, nota: d.nota, ...extra });
    }
    // Sem cotação não dá para falar em reinvestir: fica fora mesmo com os outros critérios preenchidos
    if (faltando.length > MAX_FALTANDO || !(num(l.preco) > 0)) { excluidos.push({ t: l.t, faltando: num(l.preco) > 0 ? faltando : [...new Set([...faltando, "preco"])] }); continue; }
    // passível de venda pelo limite da pessoa: fora do ranking e da divisão (quem já ficou fora por falta de dado conta lá)
    if (sinal && sinal.tipo === "venda") { foraPorVenda.push(l.t); continue; }
    const dy = num(l.dy);
    const valorAtual = base.porPapel[l.t] || 0;
    avaliados.push({
      t: l.t, nome: l.nome || "", segmento: seg, pontos: somaPesos > 0 ? Math.round((soma / somaPesos) * 100) : 0,
      criterios, faltando,
      dy: dy == null ? null : r2(dy), pvp: num(l.pvp) == null ? null : r2(l.pvp), preco: num(l.preco), liq: num(l.liq),
      tenho: valorAtual > 0 ? { valor: r2(valorAtual), pct: base.total > 0 ? r2((valorAtual / base.total) * 100) : null } : null,
      sinal,
      rendaAporte: dy != null ? r2((aporte * dy) / 100 / 12) : null,
      efeito: { papelAntes: eq.partes.papel.antes, papelDepois: eq.partes.papel.depois, segmentoAntes: eq.partes.segmento.antes, segmentoDepois: eq.partes.segmento.depois },
      _fixo: { soma: fixo, pesos: fixoPesos, peq: num(pesos.equilibrio) > 0 ? pesos.equilibrio : 0, pontos: somaPesos > 0 ? soma / somaPesos : 0 },
    });
  }
  avaliados.sort((a, b) => b.pontos - a.pontos || desempate(a, b));
  return { avaliados, excluidos, foraPorVenda, aporte, cdi, tetos: tt, limites };
}
const desempate = (a, b) => (b.dy ?? -1) - (a.dy ?? -1) || (b.liq || 0) - (a.liq || 0) || (a.t < b.t ? -1 : a.t > b.t ? 1 : 0);

// Divisão do aporte, cota inteira por cota inteira. candidatos: os avaliados de pontuar (os 15 primeiros). A cada passo
// recalcula o equilíbrio de cada candidato com a carteira somando o que já foi alocado (o resto da pontuação não muda) e
// põe uma cota no de maior pontuação cujo preço cabe no que sobra. Para quando nenhuma cota cabe ou em 400 passos.
// Aporte que pede mais de 400 cotas anda em lotes iguais (aporte / menor preço / 400, arredondado para cima), para a
// conta chegar ao fim do dinheiro; com aportes comuns o lote é 1. As compras recentes ficam as do extrato.
// Devolve { itens: [{ t, cotas, valor, pct }] por valor, sobra, lote }.
export const TETO_NO_APORTE = 0.4;
const FOLGA_NO_APORTE = 0.05;
export function dividirAporte(candidatos, opts = {}) {
  const aporteC = Math.round((num(opts.aporte) || 0) * 100);
  const cands = (candidatos || []).filter((c) => num(c.preco) > 0).map((c) => ({ ...c, precoC: Math.round(c.preco * 100) }));
  if (!(aporteC > 0) || !cands.length) return { itens: [], sobra: Math.max(0, aporteC) / 100, lote: 1 };
  const tt = tetosDe(opts.tetos), tetos = { papel: tt.papel / 100, segmento: tt.segmento / 100 };
  const b0 = opts.fiis || baseFiis([]);
  const base = { porPapel: { ...b0.porPapel }, porSeg: { ...b0.porSeg }, total: b0.total };
  const compras = comprasDe(opts.compras);
  const final = b0.total + aporteC / 100;
  const menor = Math.min(...cands.map((c) => c.precoC));
  const lote = Math.max(1, Math.ceil(aporteC / menor / PASSOS_DIVISAO));
  const cotas = {};
  let resto = aporteC;
  // Nenhum papel leva mais de 40% do aporte enquanto houver outro, a até 5 pontos do primeiro, que ainda caiba; sem
  // isso, aporte pequeno perto de uma carteira grande iria quase todo para o primeiro da lista, porque não chega a
  // encostar no teto do papel. Papel bem atrás na pontuação não entra só para cumprir a regra.
  const maxPorPapelC = cands.length >= 3 ? Math.floor(aporteC * TETO_NO_APORTE) : aporteC;
  const ptsDe = (c) => {
    const f = c._fixo || { soma: 0, pesos: 0, peq: 0, pontos: c.pontos / 100 };
    if (!(f.peq > 0)) return f.pontos;
    const eq = contaEquilibrio(c.t, c.segmento, c.precoC / 100, base, final, compras, tetos, false);
    return (f.soma + f.peq * eq.parcial) / (f.pesos + f.peq);
  };
  const escolher = (lista) => {
    let e = null;
    for (const x of lista) if (!e || x.pts > e.pts + 1e-12 || (Math.abs(x.pts - e.pts) <= 1e-12 && desempate(x.c, e.c) < 0)) e = x;
    return e;
  };
  for (let passo = 0; passo < PASSOS_DIVISAO; passo++) {
    const cabem = cands.filter((c) => c.precoC <= resto).map((c) => ({ c, pts: ptsDe(c) }));
    const topo = escolher(cabem);
    const sobTeto = topo ? cabem.filter((x) => (cotas[x.c.t] || 0) * x.c.precoC + x.c.precoC <= maxPorPapelC && x.pts >= topo.pts - FOLGA_NO_APORTE) : [];
    const escolhido = ((sobTeto.length ? escolher(sobTeto) : topo) || {}).c || null;
    if (!escolhido) break;
    const n = Math.min(lote, Math.floor(resto / escolhido.precoC));
    const v = (n * escolhido.precoC) / 100;
    cotas[escolhido.t] = (cotas[escolhido.t] || 0) + n;
    resto -= n * escolhido.precoC;
    base.porPapel[escolhido.t] = (base.porPapel[escolhido.t] || 0) + v;
    base.porSeg[escolhido.segmento] = (base.porSeg[escolhido.segmento] || 0) + v;
    base.total += v;
  }
  const porT = new Map(cands.map((c) => [c.t, c]));
  const itens = Object.entries(cotas).map(([t, n]) => {
    const valorC = n * porT.get(t).precoC;
    return { t, cotas: n, valor: valorC / 100, pct: r1((valorC / aporteC) * 100) };
  }).sort((a, b) => b.valor - a.valor || (a.t < b.t ? -1 : 1));
  return { itens, sobra: resto / 100, lote };
}

// Retrato dos FIIs de hoje para a faixa do card: segmentos por valor (percentuais com uma casa que somam 100) e a maior
// posição.
export function retratoFiis(base, tetos) {
  const tt = tetosDe(tetos);
  const segs = Object.entries(base.porSeg).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const T = base.total;
  // maior resto: os décimos que faltam para 100 vão para quem perdeu mais no arredondamento
  const brutos = segs.map(([, v]) => (T > 0 ? (v / T) * 1000 : 0));
  const pisos = brutos.map(Math.floor);
  let falta = T > 0 ? 1000 - pisos.reduce((a, b) => a + b, 0) : 0;
  const ordem = brutos.map((b, i) => [b - pisos[i], i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of ordem) { if (falta <= 0) break; pisos[i]++; falta--; }
  const porSegmento = segs.map(([segmento, v], i) => ({ segmento, valor: r2(v), pct: pisos[i] / 10, teto: tt.segmento, acima: T > 0 && (v / T) * 100 > tt.segmento + 1e-9 }));
  let maior = null;
  for (const [t, v] of Object.entries(base.porPapel)) if (v > 0 && (!maior || v > maior.v || (v === maior.v && t < maior.t))) maior = { t, v };
  return { total: r2(T), porSegmento, maiorPapel: maior && T > 0 ? { t: maior.t, pct: r1((maior.v / T) * 100) } : null };
}

const faixaAbaixo = (L) => `só para papel que você tem: zero até cair ${L.compra}% do seu preço médio; máximo com o dobro`;
const faixaEquilibrio = (tt) => `o menor de três: papel até ${tt.papel}% e segmento até ${tt.segmento}% dos seus FIIs (zero no dobro); até 25% das compras recentes neste papel`;

// Tudo que a rota devolve. ctx: { b3, fiiResumo, mercado, posicoes, aporte: { valor, origem }, sugerido: { valor, origem },
// pesos, tetos, limites, universo, compras: { desde, porPapel } }. origem: meta | media3 | padrao, ou simulado quando veio
// digitado na tela. Sem ctx.aporte vale ctx.aporteMeta (número) e, sem ele, R$ 1.000.
export function reinvestir(ctx) {
  const universo = UNIVERSOS.includes(ctx.universo) ? ctx.universo : "todos";
  const posicoes = ctx.posicoes || [];
  const fundos = (ctx.fiiResumo && ctx.fiiResumo.fundos) || {};
  const fiis = baseFiis(posicoes, fundos);
  const cdiItem = ((ctx.mercado && ctx.mercado.itens) || []).find((i) => i && i.id === "cdi");
  const cdi = cdiItem ? num(cdiItem.valor) : null;
  const aporteMeta = num(ctx.aporteMeta) > 0 ? ctx.aporteMeta : null;
  const okAp = (a) => a && num(a.valor) != null && a.valor >= 0 && typeof a.origem === "string";
  const sugerido = okAp(ctx.sugerido) ? { valor: ctx.sugerido.valor, origem: ctx.sugerido.origem } : aporteMeta ? { valor: aporteMeta, origem: "meta" } : { valor: APORTE_PADRAO, origem: "padrao" };
  const aporte = okAp(ctx.aporte) ? { valor: ctx.aporte.valor, origem: ctx.aporte.origem } : sugerido;
  const linhas = linhasUniverso({ b3: ctx.b3, fiiResumo: ctx.fiiResumo, posicoes, universo });
  const pesos = pesosDe(ctx.pesos), tetos = tetosDe(ctx.tetos), limites = limitesDe(ctx.limites);
  const compras = { desde: (ctx.compras && ctx.compras.desde) || null, porPapel: (ctx.compras && ctx.compras.porPapel) || {} };
  const pm = {};
  for (const p of posicoes) if (p && p.classe === "fii" && p.q > 0 && num(p.pm) > 0) pm[p.t] = p.pm;
  const r = pontuar(linhas, { cdi, fiis, compras, aporte: aporte.valor, pesos, tetos, pm, limites });
  const div = dividirAporte(r.avaliados.slice(0, CANDIDATOS_DIVISAO), { aporte: aporte.valor, fiis, compras, tetos });
  const limpo = ({ _fixo, ...x }) => x;
  return {
    universo, pesos, padrao: PESOS_PADRAO, tetos, tetosPadrao: TETOS_PADRAO, limites, limitesPadrao: LIMITES_PADRAO,
    criterios: CRITERIOS.map(({ id, nome, faixa }) => ({ id, nome, faixa: id === "equilibrio" ? faixaEquilibrio(tetos) : id === "abaixo" ? faixaAbaixo(limites) : faixa })),
    aporte, sugerido, cdi, cdiData: cdiItem ? cdiItem.data || null : null,
    total: r.avaliados.length, excluidos: r.excluidos.length, foraPorVenda: r.foraPorVenda.length, top: r.avaliados.slice(0, TOP).map(limpo),
    fiis: retratoFiis(fiis, tetos),
    divisao: { itens: div.itens, sobra: div.sobra, lote: div.lote },
    compras: { desde: compras.desde },
    ref: { cvm: (ctx.fiiResumo && ctx.fiiResumo.ref) || null, b3: (ctx.b3 && ctx.b3.atualizado) || null },
  };
}
