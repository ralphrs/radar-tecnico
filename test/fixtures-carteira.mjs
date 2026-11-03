// Linhas sintéticas no formato dos extratos da B3, inventadas para os testes (nenhum dado real).
export const XP = "XP INVESTIMENTOS CCTVM S/A";
export const RICO = "RICO INVESTIMENTOS - GRUPO XP";
// Negociação: data, C/V, mercado, prazo, instituição, papel, quantidade, preço, valor
export const neg = [
  ["02/01/2025", "Compra", "Mercado à Vista", "-", XP, "ABCD3", 100, 10, 1000],
  ["02/01/2025", "Compra", "Mercado Fracionário", "-", XP, "ABCD3F", 5, 11, 55],
  ["03/02/2025", "Compra", "Mercado à Vista", "-", XP, "EFGH4", 100, 20, 2000],
  ["04/03/2025", "Compra", "Mercado à Vista", "-", XP, "IJKL3", 10, 100, 1000],
  ["05/03/2025", "Compra", "Mercado à Vista", "-", XP, "MNOP3", 1000, 1, 1000],
  ["06/03/2025", "Compra", "Mercado à Vista", "-", XP, "QRST11", 100, 100, 10000],
  ["07/03/2025", "Compra", "Mercado à Vista", "-", RICO, "UVWX11", 50, 10, 500],
  ["10/04/2025", "Compra", "Mercado à Vista", "-", XP, "YZAB11", 10, 10, 100],
  ["10/05/2025", "Venda", "Mercado à Vista", "-", XP, "YZAB11", 10, 12, 120],
  ["10/06/2025", "Compra", "Mercado à Vista", "-", XP, "YZAB11", 10, 20, 200],
  ["10/06/2025", "Compra", "Mercado à Vista", "-", XP, "YZAB11", 10, 20, 200], // duas compras iguais no mesmo dia
];
// Movimentação: C/D, data, tipo, produto, instituição, quantidade, preço unitário, valor
export const mov = [
  ["Credito", "06/01/2025", "Transferência - Liquidação", "ABCD3 - EMPRESA ABCD S.A.", XP, 100, 10, 1000],
  ["Credito", "06/01/2025", "Transferência - Liquidação", "ABCD3F - EMPRESA ABCD S.A.", XP, 5, 11, 55],
  ["Credito", "05/02/2025", "Transferência - Liquidação", "EFGH4 - EMPRESA EFGH S.A.", XP, 100, 20, 2000],
  ["Credito", "20/02/2025", "Bonificação em Ativos", "EFGH4 - EMPRESA EFGH S.A.", XP, 10, "-", "-"],
  ["Debito", "28/10/2026", "Empréstimo", "EFGH4 - EMPRESA EFGH S.A.", XP, 50, "-", "-"],
  ["Credito", "06/03/2025", "Transferência - Liquidação", "IJKL3 - EMPRESA IJKL", XP, 10, 100, 1000],
  ["Credito", "20/03/2025", "Desdobro", "IJKL3 - EMPRESA IJKL", XP, 90, "-", "-"],
  ["Credito", "07/03/2025", "Transferência - Liquidação", "MNOP3 - EMPRESA MNOP", XP, 1000, 1, 1000],
  ["Debito", "21/03/2025", "Grupamento", "MNOP3 - EMPRESA MNOP", XP, 900, "-", "-"],
  ["Credito", "10/03/2025", "Transferência - Liquidação", "QRST11 - FUNDO QRST", XP, 100, 100, 10000],
  ["Credito", "01/04/2025", "Direito de Subscrição", "QRST12 - FUNDO QRST", XP, 10, "-", "-"],
  ["Debito", "10/04/2025", "Direitos de Subscrição - Exercido", "QRST12 - FUNDO QRST", XP, 10, 95, 950],
  ["Debito", "10/04/2025", "Solicitação de Subscrição", "QRST12 - FUNDO QRST", XP, 10, "-", "-"],
  ["Credito", "11/04/2025", "Recibo de Subscrição", "QRST13 - FUNDO QRST", XP, 10, "-", "-"],
  ["Credito", "20/05/2025", "Atualização", "QRST11 - FUNDO QRST", XP, 10, "-", "-"],
  ["Credito", "11/03/2025", "Transferência - Liquidação", "UVWX11 - FUNDO UVWX", RICO, 50, 10, 500],
  ["Credito", "01/04/2025", "Direito de Subscrição", "UVWX12 - FUNDO UVWX", RICO, 5, "-", "-"],
  ["Debito", "10/04/2025", "Cessão de Direitos - Solicitada", "UVWX12 - FUNDO UVWX", RICO, 5, "-", "-"],
  ["Credito", "10/04/2025", "Cessão de Direitos", "UVWX12 - FUNDO UVWX", RICO, 5, "-", "-"],
  ["Debito", "11/04/2025", "Direitos de Subscrição - Não Exercido", "UVWX12 - FUNDO UVWX", RICO, 0, "-", "-"],
  ["Credito", "14/04/2025", "Transferência - Liquidação", "YZAB11 - FUNDO YZAB", XP, 10, 10, 100],
  ["Debito", "14/05/2025", "Transferência - Liquidação", "YZAB11 - FUNDO YZAB", XP, 10, 12, 120],
  ["Credito", "12/06/2025", "Transferência - Liquidação", "YZAB11 - FUNDO YZAB", XP, 20, 20, 400],
  ["Credito", "15/07/2025", "Rendimento", "QRST11 - FUNDO QRST", XP, 110, 1, 110],
  ["Credito", "15/07/2025", "Tipo Novo Qualquer", "QRST11 - FUNDO QRST", XP, 1, "-", "-"],
  ["Credito", "15/07/2025", "Transferência - Liquidação", "Tesouro Selic 2029", "TESOURO", 1, 100, 100],
];
// Proventos: produto, pagamento, tipo, instituição, quantidade, preço unitário, líquido
export const prov = [
  ["QRST11 - FUNDO QRST", "15/08/2026", "Rendimento", XP, "110", 1, 110],
  ["QRST11 - FUNDO QRST", "15/09/2026", "Rendimento", XP, "110", 1, 110],
  ["QRST11 - FUNDO QRST", "15/10/2026", "Rendimento", XP, "110", 0.9, 99],
  ["EFGH4 - EMPRESA EFGH", "20/10/2026", "Juros Sobre Capital Próprio", XP, "110", 0.5, 46.75],
  ["UVWX11 - FUNDO UVWX", "20/10/2026", "Rendimento", RICO, "50", 0.1, 5],
  ["", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "Total"],
];
export const arquivos = () => [
  { nome: "negociacao.xlsx", tipo: "negociacao", linhas: neg },
  { nome: "movimentacao.xlsx", tipo: "movimentacao", linhas: mov },
  { nome: "proventos.xlsx", tipo: "proventos", linhas: prov },
];
export const b3 = { acoes: [{ t: "ABCD3", preco: 12 }, { t: "EFGH4", preco: 25 }, { t: "IJKL3", preco: 11 }, { t: "MNOP3", preco: 9 }], fiis: [{ t: "QRST11", preco: 110 }, { t: "UVWX11", preco: 9 }, { t: "YZAB11", preco: 21 }], etfs: [], bdrs: [] };
export const fiiResumo = { fundos: { QRST11: { n: "FUNDO QRST", s: "Logística", rend: 0.9 }, UVWX11: { n: "FUNDO UVWX", s: "Shoppings", rend: 0.1 }, YZAB11: { n: "FUNDO YZAB", s: "Outros", rend: 0.2 } } };
