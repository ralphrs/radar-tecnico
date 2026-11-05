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
// - carteira: o peso que o papel teria na carteira da pessoa depois do aporte do mês todo nele.
import "../public/radar-filtro.js";
const RF = globalThis.RadarFiltro;

export const CRITERIOS = [
  { id: "pvp", nome: "P/VP", peso: 20, faixa: "máximo de 0,85 a 1,00; zero em 1,25 e em 0,60" },
  { id: "dy", nome: "DY 12m sobre o CDI", peso: 25, faixa: "zero no CDI; máximo com 4 pontos acima" },
  { id: "regularidade", nome: "Regularidade", peso: 15, faixa: "12 de 12 meses pagando = máximo; 11 = 70%; 10 = 40%" },
  { id: "rendimento", nome: "Último rendimento", peso: 10, faixa: "máximo na média de 12 meses; zero 30% abaixo" },
  { id: "liquidez", nome: "Liquidez", peso: 10, faixa: "máximo com R$ 1 mi por dia; zero abaixo de R$ 100 mil" },
  { id: "cotistas", nome: "Cotistas", peso: 10, faixa: "máximo com 100 mil; 30% com 10 mil" },
  { id: "carteira", nome: "Peso na carteira", peso: 10, faixa: "máximo até 10% depois do aporte; zero com 30%" },
];
export const IDS = CRITERIOS.map((c) => c.id);
export const PESOS_PADRAO = Object.fromEntries(CRITERIOS.map((c) => [c.id, c.peso]));
export const PESO_MAX = 50;
export const MAX_FALTANDO = 2;
export const APORTE_PADRAO = 1000;
export const UNIVERSOS = ["todos", "meus"];
export const TOP = 5;

const fmt = RF.fmt, fmtMi = RF.fmtMi;
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const lim = (x) => Math.round(Math.max(0, Math.min(1, x)) * 1e6) / 1e6;
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

// ---------- parciais (0 a 1), uma por critério; null = sem dado ----------
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
// Peso na carteira depois do aporte (fração): até 10% = 1; 20% = 0,5; 30% ou mais = 0. Papel que a pessoa não tem = 1.
export function parcialCarteira(peso, tem) {
  if (!tem) return 1;
  if (peso == null) return null;
  return lim(1 - (peso - 0.1) * 5);
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
function notaCarteira(peso, tem, aporte) {
  if (!tem) return "fora da carteira hoje";
  if (!(aporte > 0)) return `sem aporte, está em ${pct1(peso * 100)} da carteira`;
  return `com ${fmtMi(aporte)} do aporte aqui, ficaria em ${pct1(peso * 100)} da carteira`;
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

// Pesos de uma pessoa: os salvos (já conferidos) por cima do padrão.
export const pesosDe = (salvos) => ({ ...PESOS_PADRAO, ...((salvos && typeof salvos === "object") ? salvos : {}) });

// Pontua cada linha. opts: { cdi (% a.a.), carteira: { porPapel: { t: valor }, total }, aporte, pesos }.
// Devolve { avaliados: [...] em ordem de pontos, excluidos: [{ t, faltando }] }.
export function pontuar(linhas, opts = {}) {
  const cdi = num(opts.cdi);
  const pesos = pesosDe(opts.pesos);
  const aporte = num(opts.aporte) != null && opts.aporte >= 0 ? opts.aporte : APORTE_PADRAO;
  const porPapel = (opts.carteira && opts.carteira.porPapel) || {};
  const total = num(opts.carteira && opts.carteira.total) || 0;
  const ativos = CRITERIOS.filter((c) => num(pesos[c.id]) > 0);
  const avaliados = [], excluidos = [];
  for (const l of linhas || []) {
    const valorAtual = num(porPapel[l.t]);
    const tem = valorAtual != null && valorAtual > 0;
    const pesoCart = tem && total + aporte > 0 ? (valorAtual + aporte) / (total + aporte) : null;
    const dados = {
      pvp: { valor: num(l.pvp), parcial: parcialPvp(num(l.pvp)), nota: notaPvp(num(l.pvp)) },
      dy: { valor: num(l.dy), parcial: parcialDy(num(l.dy), cdi), nota: notaDy(num(l.dy), cdi) },
      regularidade: { valor: num(l.pg), parcial: parcialRegularidade(num(l.pg)), nota: notaRegularidade(num(l.pg), num(l.m12)) },
      rendimento: { valor: num(l.rend), parcial: parcialRendimento(num(l.rend), num(l.media)), nota: notaRendimento(num(l.rend), num(l.media)) },
      liquidez: { valor: num(l.liq), parcial: parcialLiquidez(num(l.liq)), nota: notaLiquidez(num(l.liq)) },
      cotistas: { valor: num(l.cot), parcial: parcialCotistas(num(l.cot)), nota: notaCotistas(num(l.cot)) },
      carteira: { valor: pesoCart == null ? 0 : r2(pesoCart * 100), parcial: parcialCarteira(pesoCart, tem), nota: notaCarteira(pesoCart, tem, aporte) },
    };
    const criterios = [], faltando = [];
    let soma = 0, somaPesos = 0;
    for (const c of ativos) {
      const d = dados[c.id], w = pesos[c.id];
      if (d.parcial == null) { faltando.push(c.id); criterios.push({ id: c.id, nome: c.nome, valor: d.valor, pontos: null, max: w, nota: d.nota }); continue; }
      soma += w * d.parcial; somaPesos += w;
      criterios.push({ id: c.id, nome: c.nome, valor: d.valor, pontos: r1(w * d.parcial), max: w, nota: d.nota });
    }
    // Sem cotação não dá para falar em reinvestir: fica fora mesmo com os outros critérios preenchidos
    if (faltando.length > MAX_FALTANDO || !(num(l.preco) > 0)) { excluidos.push({ t: l.t, faltando: num(l.preco) > 0 ? faltando : [...new Set([...faltando, "preco"])] }); continue; }
    const dy = num(l.dy);
    avaliados.push({
      t: l.t, nome: l.nome || "", segmento: l.seg || "", pontos: somaPesos > 0 ? Math.round((soma / somaPesos) * 100) : 0,
      criterios, faltando,
      dy: dy == null ? null : r2(dy), pvp: num(l.pvp) == null ? null : r2(l.pvp), preco: num(l.preco), liq: num(l.liq),
      tenho: tem ? { valor: r2(valorAtual), pct: total > 0 ? r2((valorAtual / total) * 100) : null } : null,
      rendaAporte: dy != null ? r2((aporte * dy) / 100 / 12) : null,
    });
  }
  avaliados.sort((a, b) => b.pontos - a.pontos || (b.dy ?? -1) - (a.dy ?? -1) || (b.liq || 0) - (a.liq || 0) || (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  return { avaliados, excluidos, aporte, cdi };
}

// Tudo que a rota devolve. ctx: { b3, fiiResumo, mercado, posicoes, patrimonio, aporte: { valor, origem }, sugerido:
// { valor, origem }, pesos, universo }. origem: meta | media3 | padrao, ou simulado quando veio digitado na tela.
// Sem ctx.aporte vale ctx.aporteMeta (número) e, sem ele, R$ 1.000.
export function reinvestir(ctx) {
  const universo = UNIVERSOS.includes(ctx.universo) ? ctx.universo : "todos";
  const posicoes = ctx.posicoes || [];
  const porPapel = {};
  for (const p of posicoes) if (p && p.q > 0) porPapel[p.t] = (porPapel[p.t] || 0) + (num(p.valor) || 0);
  const cdiItem = ((ctx.mercado && ctx.mercado.itens) || []).find((i) => i && i.id === "cdi");
  const cdi = cdiItem ? num(cdiItem.valor) : null;
  const aporteMeta = num(ctx.aporteMeta) > 0 ? ctx.aporteMeta : null;
  const okAp = (a) => a && num(a.valor) != null && a.valor >= 0 && typeof a.origem === "string";
  const sugerido = okAp(ctx.sugerido) ? { valor: ctx.sugerido.valor, origem: ctx.sugerido.origem } : aporteMeta ? { valor: aporteMeta, origem: "meta" } : { valor: APORTE_PADRAO, origem: "padrao" };
  const aporte = okAp(ctx.aporte) ? { valor: ctx.aporte.valor, origem: ctx.aporte.origem } : sugerido;
  const linhas = linhasUniverso({ b3: ctx.b3, fiiResumo: ctx.fiiResumo, posicoes, universo });
  const pesos = pesosDe(ctx.pesos);
  const r = pontuar(linhas, { cdi, carteira: { porPapel, total: num(ctx.patrimonio) || 0 }, aporte: aporte.valor, pesos });
  return {
    universo, pesos, padrao: PESOS_PADRAO, criterios: CRITERIOS.map(({ id, nome, faixa }) => ({ id, nome, faixa })),
    aporte, sugerido, cdi, cdiData: cdiItem ? cdiItem.data || null : null,
    total: r.avaliados.length, excluidos: r.excluidos.length, top: r.avaliados.slice(0, TOP),
    ref: { cvm: (ctx.fiiResumo && ctx.fiiResumo.ref) || null, b3: (ctx.b3 && ctx.b3.atualizado) || null },
  };
}
