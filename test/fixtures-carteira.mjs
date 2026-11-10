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
// Saídas (topo da carteira): venda parcial com lucro, venda com prejuízo, transferência de saída, transferência entre
// corretoras no mesmo dia (se anula) e amortização (provento, não mexe na quantidade). Entram por cima das linhas acima.
export const negSaidas = [
  ["10/02/2026", "Venda", "Mercado à Vista", "-", XP, "ABCD3", 50, 14, 700], // PM 1055/105: lucro de 700 − 50 × 10,0476
  ["12/03/2026", "Venda", "Mercado à Vista", "-", XP, "MNOP3", 40, 8, 320], // PM 10: prejuízo de 80
];
export const movSaidas = [
  ["Debito", "12/02/2026", "Transferência - Liquidação", "ABCD3 - EMPRESA ABCD S.A.", XP, 50, 14, 700],
  ["Debito", "16/03/2026", "Transferência - Liquidação", "MNOP3 - EMPRESA MNOP", XP, 40, 8, 320],
  ["Debito", "05/05/2026", "Transferência", "IJKL3 - EMPRESA IJKL", XP, 30, "-", "-"], // saiu da B3: 30 × PM 10
  ["Debito", "06/05/2026", "Transferência", "EFGH4 - EMPRESA EFGH S.A.", XP, 20, "-", "-"],
  ["Credito", "06/05/2026", "Transferência", "EFGH4 - EMPRESA EFGH S.A.", RICO, 20, "-", "-"],
  ["Credito", "22/06/2026", "Amortização", "QRST11 - FUNDO QRST", XP, 110, 0.5, 55],
];
export const arquivosSaidas = () => [
  ...arquivos(),
  { nome: "negociacao-2026.xlsx", tipo: "negociacao", linhas: negSaidas },
  { nome: "movimentacao-2026.xlsx", tipo: "movimentacao", linhas: movSaidas },
];
// Conferência da carteira por lote (FIFO), usada em carteira.test.mjs e b3-fake.test.mjs. Para cada papel (aberto ou
// encerrado): a soma dos lotes é a quantidade da posição, nada precisou de acerto e o custo que entrou nos lotes fecha
// com o que sobrou mais o que saiu em venda e em transferência, retirada, vencimento ou resgate. Com `comprado` (papel ->
// R$), o que entrou nos lotes, tirando o custo que veio de incorporação, bate também com o total comprado contado à parte. Devolve a lista de problemas (vazia = ok).
export function conferirLotes(calc, comprado = null) {
  const erros = [];
  const papeis = [
    ...calc.posicoes.map((p) => ({ t: p.t, q: p.q, lotes: p.lotes, f: p.fifo })),
    ...calc.resumo.encerradas.map((e) => ({ t: e.t, q: 0, lotes: [], f: e.fifo })),
  ];
  let realizado = 0;
  for (const p of papeis) {
    const sq = p.lotes.reduce((s, l) => s + l.q, 0);
    if (Math.abs(sq - p.q) > 1e-6) erros.push(`${p.t}: lotes somam ${sq}, a posição tem ${p.q}`);
    if (p.f.acerto) erros.push(`${p.t}: acerto de ${p.f.acerto}`);
    const conta = p.f.custo + p.f.baixadoVendas + p.f.baixadoOutros;
    if (Math.abs(conta - p.f.entrou) > 0.03) erros.push(`${p.t}: sobrou ${p.f.custo} + vendido ${p.f.baixadoVendas} + saiu ${p.f.baixadoOutros} != entrou ${p.f.entrou}`);
    // o custo que veio de um fundo incorporado entrou nos lotes sem compra nova
    if (comprado && Math.abs(p.f.entrou - (p.f.incorporado || 0) - (comprado[p.t] || 0)) > 0.03) erros.push(`${p.t}: entrou ${p.f.entrou} (${p.f.incorporado || 0} de incorporação), comprado ${comprado[p.t] || 0}`);
    const somaLotes = p.lotes.reduce((s, l) => s + l.custo, 0);
    if (Math.abs(somaLotes - p.f.custo) > 0.03 * Math.max(1, p.lotes.length)) erros.push(`${p.t}: custo dos lotes ${somaLotes} != ${p.f.custo}`);
    realizado += p.f.realizado;
  }
  if (Math.abs(realizado - calc.resumo.fifo.realizado) > 0.05) erros.push(`realizado por lote: papéis ${realizado}, resumo ${calc.resumo.fifo.realizado}`);
  return erros;
}
// Total comprado por papel, contado direto no extrato (compras da Negociação, fracionário junto, mais a subscrição
// exercida, que vai para o papel da mesma raiz). Bonificação sem valor e transferência entre corretoras não entram.
export function compradoPorPapel(extrato, papeis) {
  const out = {};
  for (const [, cv, t, q, p] of extrato.neg) if (cv === "C") { const b = t.replace(/F$/, ""); out[b] = (out[b] || 0) + q * p; }
  for (const [, , tipo, t, q, p] of extrato.mov) {
    if (tipo !== "dir-exe" || !(p > 0)) continue;
    const dono = papeis.find((x) => x.slice(0, 4) === t.slice(0, 4) && /11$/.test(x));
    if (dono) out[dono] = (out[dono] || 0) + q * p;
  }
  return out;
}
// Por lote (FIFO), para os prints da tela: compras do mesmo papel a preços diferentes e vendas que atravessam lotes.
// Entram por cima de arquivosSaidas(); os testes antigos não usam. QWER3 é o caso de 1 a 10, 1 a 9, 1 a 5 e venda a 7
// (aqui em lotes de 100), sem Movimentação; ABCD3 ganha duas compras e uma venda que baixa três lotes.
export const negLotes = [
  ["12/08/2025", "Compra", "Mercado à Vista", "-", XP, "ABCD3", 40, 13, 520],
  ["15/01/2026", "Compra", "Mercado à Vista", "-", XP, "ABCD3", 30, 9.5, 285],
  ["15/09/2026", "Venda", "Mercado à Vista", "-", XP, "ABCD3", 60, 12.5, 750],
  ["03/02/2025", "Compra", "Mercado à Vista", "-", XP, "QWER3", 100, 10, 1000],
  ["03/03/2025", "Compra", "Mercado à Vista", "-", XP, "QWER3", 100, 9, 900],
  ["01/04/2025", "Compra", "Mercado à Vista", "-", XP, "QWER3", 100, 5, 500],
  ["04/05/2026", "Venda", "Mercado à Vista", "-", XP, "QWER3", 100, 7, 700],
];
export const movLotes = [
  ["Credito", "14/08/2025", "Transferência - Liquidação", "ABCD3 - EMPRESA ABCD S.A.", XP, 40, 13, 520],
  ["Credito", "19/01/2026", "Transferência - Liquidação", "ABCD3 - EMPRESA ABCD S.A.", XP, 30, 9.5, 285],
  ["Debito", "17/09/2026", "Transferência - Liquidação", "ABCD3 - EMPRESA ABCD S.A.", XP, 60, 12.5, 750],
];
export const b3Lotes = [{ t: "QWER3", nome: "EMPRESA QWER", preco: 6 }];
export const arquivosLotes = () => [
  ...arquivosSaidas(),
  { nome: "negociacao-lotes.xlsx", tipo: "negociacao", linhas: negLotes },
  { nome: "movimentacao-lotes.xlsx", tipo: "movimentacao", linhas: movLotes },
];
// Proventos a Receber (relatório da Área do Investidor), como a planilha vem: cabeçalho, linhas e a linha do total.
// Quantidade em texto, data em texto, conta inventada. Para os testes de test/areceber.test.mjs, com "hoje" = 10/11/2026.
export const CAB_ARECEBER = ["Produto", "Tipo", "Tipo de Evento", "Previsão de pagamento", "Instituição", "Conta", "Quantidade", "Preço unitário", "Valor líquido"];
export const aReceberPlanilha = [
  CAB_ARECEBER,
  ["QRST11 - FUNDO QRST                        ", "Fundo", "RENDIMENTO", "13/11/2026", XP, "0001234", "110", 0.95, 104.5],
  ["QRST11 - FUNDO QRST                        ", "Fundo", "RENDIMENTO", "13/11/2026", RICO, "0009876", "10", 0.95, 9.5],
  ["EFGH4 - EMPRESA EFGH S.A.", "PN", "DIVIDENDO", "05/11/2026", XP, "0001234", "110", 0.3, 33],
  ["EFGH4 - EMPRESA EFGH S.A.", "PN", "JUROS SOBRE CAPITAL PRÓPRIO", "28/11/2026", XP, "0001234", "110", 0.4, 37.4],
  ["EFGH4 - EMPRESA EFGH S.A.", "PN", "Reembolso - DIVIDENDO", "28/11/2026", XP, "0001234", "50", 0.4, 20],
  ["ABCD3 - EMPRESA ABCD S.A.", "ON", "DIVIDENDO", "15/12/2026", XP, "0001234", "105", 0.2, 21],
  ["IJKL3 - EMPRESA IJKL", "ON", "RESTITUIÇÃO DE CAPITAL", "07/12/2026", XP, "0001234", "100", 0.1, 10],
  ["ABCD3F - EMPRESA ABCD S.A.", "ON", "DIVIDENDO", "10/03/2028", XP, "0001234", "105", 0.5, 52.5],
  [null, null, null, null, null, null, null, "Total líquido", 287.9],
];
