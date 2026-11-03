// FIIs inventados para o teste do Radar de dividendos (papéis e números fictícios), no formato de meta/fii.
// Cada um cobre um caso: os que passam, e um para cada critério e cada aviso.
import { resumoFii } from "../src/cvm.js";

const MESES = ["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
// h: [mês, DY do mês em %, VP, cotistas, rentabilidade]. dys: 13 valores; cots: 13 valores (ou um número que cresce 100/mês)
function fundo(nome, seg, vp, dys, cots) {
  const h = MESES.map((m, i) => [m, dys[i], vp, Array.isArray(cots) ? cots[i] : cots + i * 100, 0.5]);
  return { n: nome, s: seg, m: "", ref: "2026-09", vp, cot: h[12][3], h };
}
const reto = (dy) => Array(13).fill(dy);

// vp 10; DY do mês 1% => rendimento 0,10 por cota; preço 9 => P/VP 0,9, DY 12m 13,3%
export const fundos = {
  PASA11: fundo("FUNDO PASSA A", "Logística", 10, reto(1), 5000),
  PASB11: fundo("FUNDO PASSA B", "Shoppings", 10, reto(1), 8000),
  PASC11: fundo("FUNDO PASSA C", "Multicategoria", 10, reto(1.05), 3000),
  PASD11: fundo("FUNDO PASSA D", "Logística", 10, reto(1), 1000),
  CAIR11: fundo("FUNDO RENDIMENTO CAINDO", "Multicategoria", 10, [...reto(1.1).slice(0, 12), 0.6], 4000),
  PERD11: fundo("FUNDO PERDENDO COTISTAS", "Escritórios", 10, reto(1), [9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9100, 8700]),
  PVPX11: fundo("FUNDO VP ESTRANHO", "Outros", 30, reto(0.4), 2000),
  EXTR11: fundo("FUNDO EXTRAORDINARIO", "Outros", 10, [1, 1, 1, 1, 1, 1, 1, 5, 1, 1, 1, 1, 1], 2500),
  QUED11: fundo("FUNDO QUEDA DE PRECO", "Shoppings", 10, reto(1), 6000),
  CARO11: fundo("FUNDO ACIMA DO VP", "Logística", 10, reto(1), 7000),
  POUC11: fundo("FUNDO PAGA POUCO", "Escritórios", 10, reto(0.5), 1500),
  ILIQ11: fundo("FUNDO POUCO NEGOCIADO", "Residencial", 10, reto(1), 300),
  IRRE11: fundo("FUNDO IRREGULAR", "Multicategoria", 10, [1.4, 1.4, 1.4, 1.4, 0, 1.4, 0, 1.4, 1.4, 0, 1.4, 1.4, 1.4], 1800),
  TENH11: fundo("FUNDO DA CARTEIRA", "Logística", 10, reto(1), 12000),
  SEGX11: fundo("FUNDO HOTEL", "Hotel", 10, reto(1), 900),
  PAPA11: fundo("FUNDO PAPEL A", "Outros", 10, reto(1.2), 2200),
  PAPB11: fundo("FUNDO PAPEL B", "Outros", 10, reto(1.2), 2300),
  SEMN11: fundo("FUNDO SEM NEGOCIO", "Outros", 10, reto(1), 100),
  NOVO11: fundo("FUNDO NOVO", "Logística", 10, [null, null, null, null, null, null, null, null, 1, 1, 1, 1, 1], 700),
  ZERO11: fundo("FUNDO SEM RENDIMENTO", "Escritórios", 10, reto(0), 400),
};
export const fiiResumo = { atualizado: "2026-11-03T10:17:00Z", ref: "2026-09", fundos: resumoFii(fundos) };
// meta/b3: preço e volume. vol 200 mil × R$ 9 = R$ 1,8 mi por dia
const q = (t, preco, vol = 200000) => ({ t, nome: t, preco, var: 0.1, vol });
export const b3 = {
  atualizado: "2026-11-03T15:00:00Z",
  fiis: [q("PASA11", 9), q("PASB11", 9), q("PASC11", 9), q("PASD11", 9), q("CAIR11", 9), q("PERD11", 9), q("PVPX11", 9), q("EXTR11", 9), q("QUED11", 9),
    q("CARO11", 12), q("POUC11", 9), q("ILIQ11", 9, 1000), q("IRRE11", 9), q("TENH11", 9), q("SEGX11", 9), q("PAPA11", 9), q("PAPB11", 9), q("SEMN11", null), q("NOVO11", 9), q("ZERO11", 9)],
  acoes: [{ t: "ABCD3", nome: "ABCD", preco: 20, var: 1, vol: 1e6, setor: "Finance" }, { t: "EFGH4", nome: "EFGH", preco: 10, var: -1, vol: 2e6, setor: "Utilities" }],
};
// variação em 1 ano vinda das fichas (hist)
export const extra = { QUED11: { var1a: -22 } };
// carteira: TENH11 grande (passaria de 20% com o aporte), PASB11 pequeno
export const posicoes = [
  { t: "TENH11", q: 2000, valor: 18000, classe: "fii" },
  { t: "PASB11", q: 100, valor: 900, classe: "fii" },
  { t: "CARO11", q: 50, valor: 600, classe: "fii" },
  { t: "ABCD3", q: 10, valor: 200, classe: "acao" },
];
export const patrimonio = 19700;
