// Roteiro dos extratos falsos da B3 para a conta de teste. Um cenário por item, cada um com o que testa.
//
// Tudo aqui é inventado: quantidades, preços e proventos saem de um passeio aleatório com semente fixa
// (gerar.mjs), dentro de uma faixa plausível para cada papel, sem compromisso com a cotação histórica.
// Os códigos são reais (presentes em meta/b3 e meta/fii-resumo de produção em 04/11/2026), menos o XPTO3 e os QZ* dos
// cenários 18 a 20 (versão 1.3.0), inventados.
// Ficaram de fora de propósito os papéis da lista FII-Core-2026-11 e MXRF11, KNSC11, CPTS11 e GARE11.
//
// Mudou um cenário? Suba a versão em VERSAO e anote no CHANGELOG.md (veja docs/dados-de-teste.md).
//
// Cada roteiro recebe `c` (o contexto do gerador):
//   c.compra(data, papel, q, corretora, { frac, preco })  negócio no lote (e `frac` cotas no fracionário, com F)
//   c.venda(data, papel, q, corretora, { frac, preco })   idem, venda
//   c.prov(data, papel, tipo, porCota, { corr, evento, aviso })
//                                                        provento a quem tem o papel na data, por corretora
//                                                        (tipo: rend | div | jcp | amort); sai na Movimentação e nos Proventos.
//                                                        Com pagamento depois de --ate, sai no Proventos a Receber se a B3
//                                                        já provisionou: `aviso` dias antes (padrão 20, AVISO_PADRAO)
//   c.mov(data, "C"|"D", "Tipo como a B3 escreve", papel, q, preco | null, corretora, { dq })
//                                                        linha solta da Movimentação; dq é o que ela muda na quantidade
//                                                        que o gerador acompanha (para os proventos saírem certos)
//   c.crua(tipo, linha)                                  linha exatamente como vai para a planilha
//   c.mensal(deMes, ateMes, dia)                         datas de pagamento (dia útil), uma por mês
//   c.r(...chave)                                        número em [0, 1) fixo para a chave e a semente
//   c.preco(papel, data)                                 preço do passeio aleatório naquele dia
//   dq: número, "+" (soma q), "-" (tira q), "zera" ou { de: "PAPEL" } (passa q daquele papel para este)
// Quantidade pode ser função do estado: (s) => s.q("KNIP11", XP) dá o que o gerador tem naquela data, e
// s.memo(chave, fn) guarda o primeiro valor para as linhas seguintes do mesmo evento.
// Data depois de --ate não entra.

export const XP = "XP INVESTIMENTOS CCTVM S/A.";
export const RICO = "RICO INVESTIMENTOS -  GRUPO XP";
export const MODAL = "MODAL DTVM LTDA";
export const NU = "NU INVEST CORRETORA DE VALORES S.A.";
export const INTER = "INTER DTVM LTDA";

// Nome do produto (vai só na planilha; o navegador corta no código) e passeio de preço (mensal, desde jan/2020).
// fator: multiplica o preço a partir da data (desdobro, grupamento).
export const PAPEIS = {
  PETR4: { nome: "PETROLEO BRASILEIRO S/A PETROBRAS", ini: 30, vol: 0.07, min: 12, max: 45 },
  VALE3: { nome: "VALE S.A.", ini: 50, vol: 0.05, min: 40, max: 62 },
  MGLU3: { nome: "MAGAZINE LUIZA S/A", ini: 22, vol: 0.06, min: 15, max: 28, fator: [{ desde: "2024-05-20", f: 10 }] },
  ITSA4: { nome: "ITAUSA S.A.", ini: 40, vol: 0.04, min: 32, max: 52, fator: [{ desde: "2022-08-15", f: 0.25 }] },
  B3SA3: { nome: "B3 S.A. - BRASIL, BOLSA, BALCAO", ini: 17, vol: 0.06, min: 10, max: 22 },
  BBAS3: { nome: "BANCO DO BRASIL S.A.", ini: 25, vol: 0.05, min: 16, max: 30 },
  BBSE3: { nome: "BB SEGURIDADE PARTICIPACOES S.A.", ini: 30, vol: 0.03, min: 26, max: 42 },
  XPTO3: { nome: "XPTO PARTICIPACOES S.A.", ini: 8, vol: 0.08, min: 2, max: 12 },
  KNIP11: { nome: "KINEA INDICES DE PRECOS FII", ini: 108, vol: 0.02, min: 85, max: 120 },
  KNIP12: { nome: "KINEA INDICES DE PRECOS FII" },
  KNIP13: { nome: "KINEA INDICES DE PRECOS FII" },
  VILG11: { nome: "VINCI LOGISTICA FUNDO DE INVESTIMENTO IMOBILIARIO", ini: 125, vol: 0.03, min: 80, max: 130 },
  XPML11: { nome: "XP MALLS FII", ini: 115, vol: 0.03, min: 85, max: 125 },
  TRXF11: { nome: "LIQUIDEZ PROJETOS GD FI IMOBILIARIO RESP LIMITADA", ini: 100, vol: 0.02, min: 85, max: 110 },
  TRXF12: { nome: "LIQUIDEZ PROJETOS GD FI IMOBILIARIO RESP LIMITADA" },
  BOVA11: { nome: "ISHARES BOVA CI", ini: 110, vol: 0.06, min: 70, max: 135 },
  IVVB11: { nome: "ISHARES SP500 CI", ini: 170, vol: 0.05, min: 150, max: 380, drift: 0.015 },
  AAPL34: { nome: "APPLE INC DRN", ini: 50, vol: 0.07, min: 35, max: 95, drift: 0.01 },
  NVDC34: { nome: "NVIDIA CORP DRN", ini: 6, vol: 0.08, min: 3, max: 25, drift: 0.03 },
  IFRA11: { nome: "BTG PACTUAL FI-INFRA CI", ini: 105, vol: 0.02, min: 85, max: 115 },
  KNCA11: { nome: "KINEA CREDITO AGRO FIAGRO-IMOBILIARIO", ini: 100, vol: 0.02, min: 85, max: 110 },
  // cenários 16 e 17 (versão 1.2.0): preços sempre escritos no roteiro, o passeio só existe para o gerador não reclamar
  EGIE3: { nome: "ENGIE BRASIL ENERGIA S.A.", ini: 40, vol: 0.03, min: 30, max: 50 },
  WEGE3: { nome: "WEG S.A.", ini: 38, vol: 0.04, min: 25, max: 55 },
  // cenários 18 a 20 (versão 1.3.0): códigos inventados, preços sempre escritos no roteiro
  QZDT3: { nome: "QZ DAY TRADE PARTICIPACOES S.A.", ini: 5, vol: 0.03, min: 3, max: 8 },
  QZFA11: { nome: "QZ FUNDO A FII", ini: 10, vol: 0.02, min: 8, max: 12 },
  QZFB11: { nome: "QZ FUNDO B FII", ini: 95, vol: 0.02, min: 80, max: 110 },
  QZFC11: { nome: "QZ FUNDO C FII", ini: 15, vol: 0.02, min: 12, max: 18 },
  QZFC13: { nome: "QZ FUNDO C FII" },
  QZFD11: { nome: "QZ FUNDO D FII", ini: 12, vol: 0.02, min: 10, max: 14 },
};

// Cotação e classe de 04/11/2026 (meta/b3 e meta/fii-resumo de produção), só dos papéis usados: o README e o teste
// calculam a carteira com isto, para os números não mudarem a cada cotação nova.
export const REF = {
  b3: {
    atualizado: "2026-11-04T14:05:26.416Z",
    // EGIE3 e WEGE3 (cenários 16 e 17) com cotação inventada, fixa aqui como as outras
    // QZDT3, QZFB11 e QZFC11 (cenários 18 a 20) inventados; QZFA11 e QZFD11 foram incorporados e não têm cotação
    acoes: [["PETR4", 49.88], ["VALE3", 61.67], ["MGLU3", 5.35], ["ITSA4", 12.72], ["B3SA3", 13.95], ["BBAS3", 16.53], ["BBSE3", 39.58], ["EGIE3", 36.4], ["WEGE3", 41.2], ["QZDT3", 5.05]],
    fiis: [["KNIP11", 84.16], ["VILG11", 86.83], ["XPML11", 94.5], ["TRXF11", 62.85], ["QZFB11", 97.3], ["QZFC11", 14.9]],
    fiinfra: [["IFRA11", 83.38]],
    fiagro: [["KNCA11", 83.45]],
    etfs: [["BOVA11", 164.68], ["IVVB11", 472.57]],
    bdrs: [["AAPL34", 90.88], ["NVDC34", 23.7]],
  },
  fiiResumo: {
    ref: "2026-09",
    fundos: {
      KNIP11: { n: "KINEA INDICES DE PREÇOS FII RESPONSABILIDADE LIMITADA", s: "Multicategoria", rend: 0.611091, ref: "2026-09" },
      VILG11: { n: "VINCI LOGISTICA FUNDO DE INVESTIMENTO IMOBILIARIO", s: "Logística", rend: 0.819763, ref: "2026-09" },
      XPML11: { n: "XP MALLS FII", s: "Shoppings", rend: -0.118418, ref: "2026-09" },
      TRXF11: { n: "LIQUIDEZ PROJETOS GD FI IMOBILIÁRIO RESP LIMITADA", s: "Multicategoria", rend: 0, ref: "2026-09" },
      // os fundos incorporados dos cenários 19 e 20: só o informe antigo, para a classe ser FII
      QZFA11: { n: "QZ FUNDO A FII", s: "Outros", rend: 0, ref: "2025-09" },
      QZFD11: { n: "QZ FUNDO D FII", s: "Outros", rend: 0, ref: "2025-04" },
    },
  },
};
export const refCalculo = () => {
  const lista = (l) => l.map(([t, preco]) => ({ t, preco, var: 0 }));
  const b = REF.b3;
  return {
    b3: { atualizado: b.atualizado, acoes: lista(b.acoes), fiis: lista(b.fiis), fiinfra: lista(b.fiinfra), fiagro: lista(b.fiagro), etfs: lista(b.etfs), bdrs: lista(b.bdrs) },
    fiiResumo: JSON.parse(JSON.stringify(REF.fiiResumo)),
  };
};

const trimestres = (anoDe, anoAte, meses, dia) => {
  const out = [];
  for (let a = anoDe; a <= anoAte; a++) for (const m of meses) out.push(`${a}-${String(m).padStart(2, "0")}-${String(dia).padStart(2, "0")}`);
  return out;
};
const dois = (x) => Math.round(x * 100) / 100;

export const CENARIOS = [
  {
    id: 1, titulo: "Ação comprada aos poucos, no lote e no fracionário", papeis: ["PETR4"],
    testa: "PETR4 e PETR4F somam numa posição só; PM ponderado; dividendos e JCP (líquido 85%); venda parcial em 2023 baixa a quantidade sem mexer no PM e entra no realizado.",
    espera: "PETR4 aberta na XP, uma linha só (sem PETR4F), com realizado da venda de 2023 e proventos todo trimestre.",
    roteiro(c) {
      let i = 0;
      for (const d of trimestres(2020, 2022, [2, 5, 8, 11], 10)) c.compra(d, "PETR4", 100, XP, { frac: 1 + Math.floor(c.r("PETR4", "frac", i++) * 30) });
      c.venda("2023-05-16", "PETR4", 300, XP);
      for (const d of trimestres(2020, 2026, [3, 6, 9, 12], 20)) {
        c.prov(d, "PETR4", "div", dois(0.3 + c.r("PETR4", "div", d) * 1.2), { aviso: 60 }); // cenário 15
        c.prov(d, "PETR4", "jcp", dois(0.2 + c.r("PETR4", "jcp", d) * 0.6));
      }
    },
  },
  {
    id: 2, titulo: "Ações encerradas: uma com lucro, outra com prejuízo e grupamento", papeis: ["VALE3", "MGLU3"],
    testa: "Venda total zera a posição e manda o papel para Encerradas com o resultado realizado mais os proventos. Grupamento 10:1 (Débito de 90% das ações) mantém o custo e multiplica o PM por 10 antes da venda.",
    espera: "VALE3 encerrada com lucro (vendida em mai/2021) e MGLU3 encerrada com prejuízo (grupamento em mai/2024, venda em set/2024). Nenhuma das duas em Posições.",
    roteiro(c) {
      c.compra("2020-03-17", "VALE3", 300, RICO);
      c.compra("2020-06-09", "VALE3", 200, RICO);
      c.prov("2020-09-30", "VALE3", "div", 2.41, { corr: RICO });
      c.prov("2021-03-15", "VALE3", "div", 3.62, { corr: RICO });
      c.venda("2021-05-12", "VALE3", 500, RICO, { preco: 110.37 });
      c.compra("2020-11-04", "MGLU3", 500, XP);
      c.compra("2021-07-14", "MGLU3", 300, XP);
      c.mov("2024-05-20", "D", "Grupamento", "MGLU3", 720, null, XP, { dq: -720 });
      c.venda("2024-09-10", "MGLU3", 80, XP, { preco: 11.2 });
    },
  },
  {
    id: 3, titulo: "Bonificação e desdobro ajustando o PM", papeis: ["ITSA4"],
    testa: "Bonificação de 10% (dez/2021) e desdobro 1:4 (ago/2022) mudam a quantidade e mantêm o custo: o PM cai na proporção. Depois do desdobro o preço do passeio também vai a 1/4.",
    espera: "ITSA4 aberta com 4.400 ações (1.000 compradas, +100 da bonificação, ×4 no desdobro) e custo igual ao total das compras.",
    roteiro(c) {
      for (const d of ["2020-02-12", "2020-05-13", "2020-09-15", "2021-01-13", "2021-04-14", "2021-06-16", "2021-08-11", "2021-09-14", "2021-10-13", "2021-11-10"])
        c.compra(d, "ITSA4", 100, XP);
      c.mov("2021-12-20", "C", "Bonificação em Ativos", "ITSA4", 100, null, XP, { dq: 100 });
      c.mov("2022-08-15", "C", "Desdobro", "ITSA4", 3300, null, XP, { dq: 3300 });
      for (const d of trimestres(2020, 2026, [1, 4, 7, 10], 2)) c.prov(d, "ITSA4", "div", d < "2022-08-15" ? 0.08 : 0.02);
    },
  },
  {
    id: 4, titulo: "FII de papel: rendimento todo mês, amortização e duas subscrições", papeis: ["KNIP11", "KNIP12", "KNIP13"],
    testa: "Rendimento mensal desde fev/2020. Amortização em jun/2024 (não mexe na quantidade nem no PM). Subscrição exercida em 2022: direito KNIP12, exercido a R$ 100, recibo KNIP13 e atualização que vira cota KNIP11 e entra no PM ao preço do exercício. Subscrição de 2024 não exercida: o direito some sem resultado. Em 2026 o rendimento cai todo mês, para o alerta de rendimento menor.",
    espera: "KNIP11 aberta na XP com as cotas da subscrição de 2022 somadas. KNIP12 e KNIP13 não aparecem em Posições nem em Encerradas. Alerta \"rendimento menor\" no KNIP11 (o último pagamento de 2026 foi menor que o anterior).",
    roteiro(c) {
      for (const d of ["2020-01-14", "2020-04-15", "2020-10-14", "2021-03-16", "2021-09-15", "2022-06-14", "2023-02-14", "2023-11-14", "2024-08-14", "2025-05-14"])
        c.compra(d, "KNIP11", 20 + Math.floor(c.r("KNIP11", "q", d) * 40), XP);
      // 10% das cotas na data, guardado para as linhas seguintes da mesma subscrição
      const q22 = (s) => s.memo("knip-2022", () => Math.floor(s.q("KNIP11", XP) * 0.1));
      c.mov("2022-03-02", "C", "Direito de Subscrição", "KNIP12", q22, null, XP, { dq: "+" });
      c.mov("2022-03-10", "D", "Direitos de Subscrição - Exercido", "KNIP12", q22, 100, XP, { dq: "-" });
      c.mov("2022-03-10", "D", "Solicitação de Subscrição", "KNIP12", q22, null, XP);
      c.mov("2022-03-11", "C", "Recibo de Subscrição", "KNIP13", q22, null, XP, { dq: "+" });
      c.mov("2022-04-20", "C", "Atualização", "KNIP11", q22, null, XP, { dq: { de: "KNIP13" } });
      c.mov("2024-09-02", "C", "Direito de Subscrição", "KNIP12", (s) => s.memo("knip-2024", () => Math.floor(s.q("KNIP11", XP) * 0.08)), null, XP, { dq: "+" });
      c.mov("2024-09-20", "D", "Direitos de Subscrição - Não Exercido", "KNIP12", 0, null, XP, { dq: "zera" });
      // Em 2026 o rendimento cai 3 centavos por mês: o último pagamento é sempre menor que o anterior (alerta)
      for (const d of c.mensal("2020-02", "2026-12", 15))
        c.prov(d, "KNIP11", "rend", d >= "2026-01" ? dois(1.1 - 0.03 * (Number(d.slice(5, 7)) - 1)) : dois(0.5 + c.r("KNIP11", "rend", d) * 0.9));
      c.prov("2024-06-14", "KNIP11", "amort", 1.2);
    },
  },
  {
    id: 5, titulo: "FII de tijolo com rendimento irregular e cotas emprestadas", papeis: ["VILG11"],
    testa: "Meses sem pagamento e valor por cota oscilando. Empréstimo em 2025 (Crédito em mar, Débito em jul) e um novo Crédito em 13/10/2026: empréstimo não tira da posição; só a última linha dos últimos 60 dias marca as emprestadas.",
    espera: "VILG11 aberta na Rico com 30 cotas emprestadas (se --ate cair até 60 dias depois de 13/10/2026) e buracos no gráfico de proventos.",
    roteiro(c) {
      for (const d of ["2020-03-11", "2020-08-12", "2021-05-12", "2022-01-12", "2023-06-14"]) c.compra(d, "VILG11", 25 + Math.floor(c.r("VILG11", "q", d) * 30), RICO);
      for (const d of c.mensal("2020-04", "2026-12", 14)) {
        if (c.r("VILG11", "pula", d) < 0.3) continue;
        c.prov(d, "VILG11", "rend", dois(0.3 + c.r("VILG11", "rend", d) * 0.6));
      }
      c.mov("2025-03-10", "C", "Empréstimo", "VILG11", 50, null, RICO);
      c.mov("2025-07-10", "D", "Empréstimo", "VILG11", 50, null, RICO);
      c.mov("2026-10-13", "C", "Empréstimo", "VILG11", 30, null, RICO);
    },
  },
  {
    id: 6, titulo: "FII levado de uma corretora para outra", papeis: ["XPML11"],
    testa: "Comprado na Modal em 2020 e 2021; em mar/2023 a Transferência tira tudo da Modal e põe na XP, sem compra nem venda. PM continua o das compras. Um pagamento com Tipo de Evento vazio entra como 'outro'.",
    espera: "XPML11 aberta só na XP; a Modal não aparece em Por corretora. Rendimentos na Modal até fev/2023 e na XP depois.",
    roteiro(c) {
      c.compra("2020-07-08", "XPML11", 100, MODAL);
      c.compra("2021-02-10", "XPML11", 50, MODAL);
      c.mov("2023-03-15", "D", "Transferência", "XPML11", 150, null, MODAL, { dq: -150 });
      c.mov("2023-03-15", "C", "Transferência", "XPML11", 150, null, XP, { dq: 150 });
      for (const d of c.mensal("2020-08", "2026-12", 13)) c.prov(d, "XPML11", "rend", dois(0.4 + c.r("XPML11", "rend", d) * 0.5), { evento: d === "2022-05-13" ? "" : undefined });
    },
  },
  {
    id: 7, titulo: "ETFs comprados e mantidos", papeis: ["BOVA11", "IVVB11"],
    testa: "Final 11 que é ETF (pela lista etfs do meta/b3), não FII. Sem proventos.",
    espera: "BOVA11 e IVVB11 abertos na Nu Invest, classe ETF, provento zero.",
    roteiro(c) {
      c.compra("2020-04-08", "BOVA11", 10, NU);
      c.compra("2021-03-10", "BOVA11", 5, NU);
      c.compra("2023-08-09", "BOVA11", 5, NU);
      c.compra("2020-09-09", "IVVB11", 10, NU);
      c.compra("2022-06-08", "IVVB11", 10, NU);
    },
  },
  {
    id: 8, titulo: "BDRs com dividendo pequeno", papeis: ["AAPL34", "NVDC34"],
    testa: "Final 34 vira BDR. Dividendo em dólar já convertido: centavos por BDR, com até 6 casas no valor por cota.",
    espera: "AAPL34 e NVDC34 abertos no Inter, classe BDR, proventos de poucos reais por trimestre.",
    roteiro(c) {
      c.compra("2021-01-13", "AAPL34", 20, INTER);
      c.compra("2022-10-11", "AAPL34", 10, INTER);
      c.compra("2023-05-10", "NVDC34", 30, INTER);
      for (const d of trimestres(2021, 2026, [2, 5, 8, 11], 18)) c.prov(d, "AAPL34", "div", Math.round((0.03 + c.r("AAPL34", "div", d) * 0.03) * 1e6) / 1e6);
      for (const d of trimestres(2023, 2026, [3, 6, 9, 12], 28)) c.prov(d, "NVDC34", "div", Math.round((0.01 + c.r("NVDC34", "div", d) * 0.01) * 1e6) / 1e6);
    },
  },
  {
    id: 9, titulo: "FI-Infra e Fiagro com rendimentos", papeis: ["IFRA11", "KNCA11"],
    testa: "IFRA11 está em fiinfra e KNCA11 em fiagro no meta/b3; nenhum dos dois tem informe na CVM (fora do meta/fii-resumo). Classe própria, rendimento mensal, sem segmento de FII.",
    espera: "IFRA11 (classe FI-Infra) na XP e KNCA11 (classe Fiagro) na Rico, com rendimento mensal.",
    roteiro(c) {
      c.compra("2021-05-12", "IFRA11", 100, XP);
      c.compra("2023-09-13", "IFRA11", 40, XP);
      c.compra("2022-02-09", "KNCA11", 50, RICO);
      for (const d of c.mensal("2021-06", "2026-12", 20)) c.prov(d, "IFRA11", "rend", dois(0.8 + c.r("IFRA11", "rend", d) * 0.3));
      for (const d of c.mensal("2022-03", "2026-12", 16)) c.prov(d, "KNCA11", "rend", dois(0.9 + c.r("KNCA11", "rend", d) * 0.4));
    },
  },
  {
    id: 10, titulo: "Direito cedido, fração em ativos e leilão de fração", papeis: ["TRXF11", "TRXF12", "B3SA3"],
    testa: "TRXF12: Direito de Subscrição, Cessão de Direitos - Solicitada e Cessão de Direitos (se anulam) e Não Exercido zera. B3SA3: bonificação que dá 4 ações inteiras e 0,65 de fração; a fração entra e sai (Fração em Ativos C e D) e o Leilão de Fração paga em dinheiro sem mexer na quantidade.",
    espera: "TRXF11 aberta na XP, TRXF12 não aparece. B3SA3 aberta na Nu Invest com 159 ações (155 + 4).",
    roteiro(c) {
      c.compra("2021-08-11", "TRXF11", 100, XP);
      for (const d of c.mensal("2021-09", "2026-12", 22)) c.prov(d, "TRXF11", "rend", dois(0.7 + c.r("TRXF11", "rend", d) * 0.4), { aviso: 5 }); // cenário 15
      c.mov("2023-04-03", "C", "Direito de Subscrição", "TRXF12", 20, null, XP, { dq: 20 });
      c.mov("2023-04-12", "D", "Cessão de Direitos - Solicitada", "TRXF12", 20, null, XP);
      c.mov("2023-04-12", "C", "Cessão de Direitos", "TRXF12", 20, null, XP);
      c.mov("2023-04-20", "D", "Direitos de Subscrição - Não Exercido", "TRXF12", 0, null, XP, { dq: "zera" });
      c.compra("2021-03-09", "B3SA3", 100, NU, { frac: 55 });
      c.mov("2023-06-12", "C", "Bonificação em Ativos", "B3SA3", 4, null, NU, { dq: 4 });
      c.mov("2023-06-12", "C", "Fração em Ativos", "B3SA3", 0.65, null, NU);
      c.mov("2023-07-05", "D", "Fração em Ativos", "B3SA3", 0.65, null, NU);
      c.mov("2023-07-05", "C", "Leilão de Fração", "B3SA3", 0.65, 12.48, NU);
      for (const d of trimestres(2021, 2026, [3, 6, 9, 12], 8)) c.prov(d, "B3SA3", "jcp", dois(0.05 + c.r("B3SA3", "jcp", d) * 0.1));
    },
  },
  {
    id: 11, titulo: "Linhas que o importador ignora ou guarda sem efeito", papeis: [],
    testa: "Tesouro Selic, Tesouro IPCA+, CDB e VENCIMENTO de Tesouro têm Produto fora do formato de papel: contam como ignorados. Os tipos com ' - Cancelado' e ' - Transferido' entram no extrato e não mexem em quantidade nem em proventos.",
    espera: "5 linhas ignoradas na Movimentação (motivo: papel). Os Cancelados e Transferidos não mudam nenhum total.",
    roteiro(c) {
      c.crua("movimentacao", ["Credito", "2021-02-03", "Transferência - Liquidação", "Tesouro Selic 2025", XP, 1.25, 10512.33, 13140.41]);
      c.crua("movimentacao", ["Credito", "2022-05-04", "Transferência - Liquidação", "Tesouro IPCA+ 2029", XP, 0.8, 2875.5, 2300.4]);
      c.crua("movimentacao", ["Credito", "2023-01-10", "Compra", "CDB - BANCO X S.A.", INTER, 5, 1000, 5000]);
      c.crua("movimentacao", ["Debito", "2025-03-03", "VENCIMENTO", "Tesouro Selic 2025", XP, 1.25, 15488.12, 19360.15]);
      c.crua("movimentacao", ["Debito", "2026-01-12", "VENCIMENTO", "CDB - BANCO X S.A.", INTER, 5, 1000, 5000]);
      c.crua("movimentacao", ["Credito", "2021-06-21", "Dividendo - Cancelado", "PETR4 - " + PAPEIS.PETR4.nome, XP, 100, 0.5, 50]);
      c.crua("movimentacao", ["Credito", "2022-12-20", "Juros Sobre Capital Próprio - Transferido", "PETR4 - " + PAPEIS.PETR4.nome, XP, 1000, 0.3, 255]);
      c.crua("movimentacao", ["Credito", "2023-10-02", "Dividendo - Transferido", "ITSA4 - " + PAPEIS.ITSA4.nome, XP, 4400, 0.02, 88]);
      c.crua("movimentacao", ["Credito", "2024-02-15", "Rendimento - Cancelado", "KNIP11 - " + PAPEIS.KNIP11.nome, XP, 100, 0.9, 90]);
    },
  },
  {
    id: 12, titulo: "Duas compras iguais no mesmo dia", papeis: ["BBAS3"],
    testa: "Mesmo papel, quantidade, preço e corretora duas vezes no mesmo dia (na Negociação e na liquidação): o dedupe por multiconjunto guarda as duas na primeira importação e nenhuma na reimportação.",
    espera: "BBAS3 aberta na XP com 200 ações (100 + 100).",
    roteiro(c) {
      c.compra("2022-09-14", "BBAS3", 100, XP, { preco: 18.42 });
      c.compra("2022-09-14", "BBAS3", 100, XP, { preco: 18.42 });
      for (const d of trimestres(2022, 2026, [3, 6, 9, 12], 12)) c.prov(d, "BBAS3", "jcp", dois(0.2 + c.r("BBAS3", "jcp", d) * 0.3), { aviso: 40 }); // cenário 15
    },
  },
  {
    id: 13, titulo: "Aportes em 2026 até a data final", papeis: ["BBSE3"],
    testa: "Compras no fracionário nos dias 2 e 16 de cada mês de 2026 (dia útil seguinte): sempre há negócio nos últimos 30 dias e, a partir do dia 2, no mês atual. Alimenta movimentos recentes, aportes mês a mês e 'este mês contra o plano'. As datas são fixas no calendário: mudar --ate só acrescenta compras.",
    espera: "BBSE3 aberta na Rico; aporte no mês atual maior que zero (com --ate a partir do dia 2 útil).",
    roteiro(c) {
      for (const d of [...c.mensal("2026-01", "2026-12", 2), ...c.mensal("2026-01", "2026-12", 16)])
        c.compra(d, "BBSE3", 0, RICO, { frac: 10 + Math.floor(c.r("BBSE3", "q", d) * 21) });
    },
  },
  {
    id: 14, titulo: "Papel sem cotação", papeis: ["XPTO3"],
    testa: "XPTO3 (inventado, como um delistado) não existe no meta/b3: fica 'sem cotação', avaliado pelo PM. O FI-Infra do cenário 9 (IFRA11) está no meta/b3 mas sem informe na CVM: tem cotação, não tem segmento nem 'a receber'.",
    espera: "XPTO3 aberta na XP com o selo sem cotação; resumo.semCotacao = 1.",
    roteiro(c) {
      c.compra("2021-06-09", "XPTO3", 200, XP);
      c.compra("2022-03-09", "XPTO3", 100, XP);
    },
  },
  {
    id: 15, titulo: "Proventos a Receber: o retrato do que a B3 já provisionou", papeis: ["KNIP11", "VILG11", "XPML11", "IFRA11", "KNCA11", "AAPL34", "PETR4", "BBAS3", "TRXF11", "ITSA4"],
    testa: "Arquivo proventos-a-receber-<data>.xlsx com o cabeçalho do relatório da B3, quantidade em texto, conta inventada e a linha \"Total líquido\". Entram os proventos do roteiro com pagamento depois de --ate já provisionados (20 dias antes; o dividendo de PETR4 com 60 e o JCP de BBAS3 com 40). O rendimento de TRXF11 só é provisionado 5 dias antes: o FII pagou nos meses anteriores e fica fora do retrato do mês. Um dividendo de ITSA4 em 2028 fica no grupo \"mais adiante\". Nenhuma linha dos outros arquivos muda.",
    espera: "Com --ate 04/11/2026: A receber com data e valor da B3 para XPML11, KNIP11, VILG11, KNCA11, AAPL34 e IFRA11 em novembro, o JCP de BBAS3 e o dividendo de PETR4 em dezembro e ITSA4 recolhido em mais adiante. Alerta \"TRXF11 não aparece nos proventos a receber de novembro\" (sem estimativa: o informe da CVM guardado traz rendimento zero para ele). A prévia mostra o retrato de 04/11 com o total conferido.",
    roteiro(c) {
      c.prov("2028-04-28", "ITSA4", "div", 0.04, { aviso: 900 });
    },
  },
  {
    id: 16, titulo: "Três corretoras: compra numa, giro noutra, portabilidade e bonificação com fração", papeis: ["EGIE3"],
    testa: "102 ações compradas no Inter em 2021 e nunca vendidas; 1.147 compradas e vendidas na Nu Invest a preços menores; em ago/2023 as 102 saem do Inter numa segunda e chegam na Rico dois dias úteis depois (portabilidade em dias diferentes: casa como transferência, não é retirada); bonificação de 10,2 em 29/12/2025 (10 inteiras e 0,2 de fração, leiloada em jan/2026). A conta por corretora da Rico é a que o app dela mostra; a de todas juntas, a da Receita.",
    espera: "EGIE3 aberta com 112 ações, só na Rico. Em Posições › Por corretora: Rico com 112 e o preço médio daquela custódia (mais alto que o de todas juntas), Nu Invest zerada com o realizado dela e Inter zerada. Situações: várias corretoras, transferência, bonificação sem custo (dado a completar) e fração.",
    roteiro(c) {
      c.compra("2021-03-10", "EGIE3", 102, INTER, { preco: 42 });
      c.compra("2021-06-09", "EGIE3", 600, NU, { preco: 36.5 });
      c.compra("2021-09-15", "EGIE3", 547, NU, { preco: 35.2 });
      c.venda("2022-02-09", "EGIE3", 1147, NU, { preco: 33.9 });
      c.mov("2023-08-14", "D", "Transferência", "EGIE3", 102, null, INTER, { dq: -102 });
      c.mov("2023-08-16", "C", "Transferência", "EGIE3", 102, null, RICO, { dq: 102 });
      c.mov("2025-12-29", "C", "Bonificação em Ativos", "EGIE3", 10, null, RICO, { dq: 10 });
      c.mov("2025-12-29", "C", "Fração em Ativos", "EGIE3", 0.2, null, RICO);
      c.mov("2026-01-20", "D", "Fração em Ativos", "EGIE3", 0.2, null, RICO);
      c.mov("2026-01-20", "C", "Leilão de Fração", "EGIE3", 0.2, 37.15, RICO);
    },
  },
  {
    id: 17, titulo: "Venda sem origem: ações compradas antes do período do extrato", papeis: ["WEGE3"],
    testa: "O extrato traz 30 ações compradas na XP em abr/2024 e a venda de 50 em mai/2025: 20 vieram de antes do período exportado. As linhas vão cruas (o gerador não deixa a quantidade ficar negativa). A quantidade dá negativa (aviso) e o papel fica encerrado com a situação 'venda sem origem', que a pessoa resolve informando a posição inicial.",
    espera: "WEGE3 em Encerradas com a situação venda sem origem (20 ações, dado a completar); o aviso de quantidade negativa aparece uma vez.",
    roteiro(c) {
      const prod = "WEGE3 - " + PAPEIS.WEGE3.nome;
      c.crua("negociacao", ["2024-04-10", "Compra", "Mercado à Vista", "-", XP, "WEGE3", 30, 38, 1140]);
      c.crua("movimentacao", ["Credito", "2024-04-12", "Transferência - Liquidação", prod, XP, 30, 38, 1140]);
      c.crua("negociacao", ["2025-05-14", "Venda", "Mercado à Vista", "-", XP, "WEGE3", 50, 45, 2250]);
      c.crua("movimentacao", ["Debito", "2025-05-16", "Transferência - Liquidação", prod, XP, 50, 45, 2250]);
    },
  },
  {
    id: 18, titulo: "Day trade com a venda listada antes da compra", papeis: ["QZDT3"],
    testa: "300 ações compradas em 2025. Em 11/03/2026, na mesma corretora, venda de 200 a R$ 5,12 e compra de 200 a R$ 5,18; no arquivo a venda vem primeiro e a Negociação não tem hora. Sem linha de liquidação na Movimentação (o dia zera). As compras do dia entram antes das vendas: o day trade dá −R$ 12,00 e a posição de antes fica como estava.",
    espera: "QZDT3 aberta com 300 ações, preço médio R$ 4,90, realizado −R$ 12,00 e a situação day trade. Nada de venda sem origem nem de 200 ações a mais.",
    roteiro(c) {
      c.compra("2025-02-12", "QZDT3", 300, XP, { preco: 4.9 });
      c.crua("negociacao", ["2026-03-11", "Venda", "Mercado à Vista", "-", XP, "QZDT3", 200, 5.12, 1024]);
      c.crua("negociacao", ["2026-03-11", "Compra", "Mercado à Vista", "-", XP, "QZDT3", 200, 5.18, 1036]);
    },
  },
  {
    id: 19, titulo: "Fundo incorporado por outro que já estava na carteira", papeis: ["QZFA11", "QZFB11"],
    testa: "QZFA11 (150 cotas) é incorporado por QZFB11 (80 cotas). Mesma corretora: Atualização de QZFA11 com 150 (só confirma a custódia) e de QZFB11 com 98,64 novas no mesmo dia, Fração em Ativos de 0,64 no débito no dia seguinte, Resgate das 150 de QZFA11 a R$ 0,274 três dias úteis depois e o leilão da fração. O custo de QZFA11 menos o resgate passa para as cotas novas de QZFB11.",
    espera: "QZFA11 em Encerradas, \"incorporado por QZFB11\", sem resultado próprio. QZFB11 aberta com 178 cotas e o custo das 80 compradas mais o que veio de QZFA11. Situação incorporação nos dois, sem quantidade diferente da B3.",
    roteiro(c) {
      c.compra("2023-03-08", "QZFA11", 150, XP, { preco: 9.8 });
      c.compra("2024-05-08", "QZFB11", 80, XP, { preco: 95 });
      c.mov("2025-10-15", "C", "Atualização", "QZFA11", 150, null, XP, { dq: 0 });
      c.mov("2025-10-15", "C", "Atualização", "QZFB11", 98.64, null, XP, { dq: 98.64 });
      c.mov("2025-10-16", "D", "Fração em Ativos", "QZFB11", 0.64, null, XP, { dq: -0.64 });
      c.mov("2025-10-20", "C", "Resgate", "QZFA11", 150, 0.274, XP, { dq: "zera" });
      c.mov("2025-10-28", "C", "Leilão de Fração", "QZFB11", 0.64, 96, XP);
    },
  },
  {
    id: 20, titulo: "Fundo incorporado com recibo: as cotas novas chegam como recibo e viram cota depois", papeis: ["QZFD11", "QZFC11", "QZFC13"],
    testa: "QZFD11 (40 cotas na Rico) é incorporado por QZFC11, que não estava na carteira. Atualização do recibo QZFC13 com 31,57, Resgate das 40 de QZFD11 a R$ 0,512 três dias úteis depois, Atualização de QZFC11 com as 31,57 (o recibo vira cota), fração de 0,57 no débito e leilão. Sem subscrição exercida: não é subscrição, é incorporação.",
    espera: "QZFD11 em Encerradas, \"incorporado por QZFC11\". QZFC11 aberta na Rico com 31 cotas e o custo de QZFD11 menos o resgate. QZFC13 não aparece.",
    roteiro(c) {
      c.compra("2023-08-09", "QZFD11", 40, RICO, { preco: 12 });
      c.mov("2025-05-12", "C", "Atualização", "QZFC13", 31.57, null, RICO, { dq: "+" });
      c.mov("2025-05-15", "C", "Resgate", "QZFD11", 40, 0.512, RICO, { dq: "zera" });
      c.mov("2025-05-28", "C", "Atualização", "QZFC11", 31.57, null, RICO, { dq: { de: "QZFC13" } });
      c.mov("2025-05-29", "D", "Fração em Ativos", "QZFC11", 0.57, null, RICO, { dq: -0.57 });
      c.mov("2025-06-05", "C", "Leilão de Fração", "QZFC11", 0.57, 15, RICO);
    },
  },
];

// O que o README promete e o teste confere (independe da semente). Vale para --ate de 2026-10-13 a 2026-12-12
// (empréstimo nos últimos 60 dias, rendimento menor nos últimos 45); fora disso só emprestadas e o alerta mudam.
export const ESPERADO = {
  abertas: ["AAPL34", "B3SA3", "BBAS3", "BBSE3", "BOVA11", "EGIE3", "IFRA11", "ITSA4", "IVVB11", "KNCA11", "KNIP11", "NVDC34", "PETR4", "QZDT3", "QZFB11", "QZFC11", "TRXF11", "VILG11", "XPML11", "XPTO3"],
  encerradas: ["MGLU3", "QZFA11", "QZFD11", "VALE3", "WEGE3"],
  semCotacao: ["XPTO3"],
  quantidade: { ITSA4: 4400, B3SA3: 159, BBAS3: 200, XPML11: 150, EGIE3: 112, QZDT3: 300, QZFB11: 178, QZFC11: 31 },
  corretoras: { XPML11: ["XP"], VILG11: ["Rico"], BOVA11: ["Nu Invest"], AAPL34: ["Inter"], EGIE3: ["Rico"], QZFB11: ["XP"], QZFC11: ["Rico"] },
  avisos: [{ k: "negativa", n: 1 }], // WEGE3, cenário 17
  classes: { IFRA11: "fiinfra", KNCA11: "fiagro", BOVA11: "etf", IVVB11: "etf", AAPL34: "bdr", NVDC34: "bdr", KNIP11: "fii", PETR4: "acao" },
  emprestadas: { VILG11: 30 },
  rendimentoMenor: ["KNIP11"],
  ignorados: { negociacao: 0, movimentacao: 5, proventos: 0 },
};

// O retrato dos proventos a receber (cenário 15) com --ate 04/11/2026, a data do teste: quem aparece, em que data, e o
// alerta. Depende da semente nos dias em que VILG11 não paga: com outra semente, confira o README.
export const ESPERADO_ARECEBER = {
  ate: "2026-11-04",
  nome: "proventos-a-receber-2026-11-04.xlsx",
  linhas: 9,
  total: 2046.92,
  papeis: ["XPML11", "KNIP11", "VILG11", "KNCA11", "AAPL34", "IFRA11", "BBAS3", "PETR4", "ITSA4"], // em ordem de data
  noMes: 793.34,
  adiante: ["ITSA4"],
  foraDoRetrato: ["TRXF11"],
  estimativa: [],
  tipos: { BBAS3: "jcp", PETR4: "dividendo", AAPL34: "dividendo", KNIP11: "rendimento", ITSA4: "dividendo" },
};

// Conferência (cenários 16 e 17, versão 1.2.0), com --ate 04/11/2026: situações por papel e a conta por corretora.
// EGIE3 na Rico: 4.284 das 102 (a R$ 42), bonificação a zero, menos 0,2 de fração pelo preço médio da Rico.
export const ESPERADO_CONFERENCIA = {
  situacoes: {
    EGIE3: ["bonificacao-sem-custo", "transferencia", "varias-corretoras", "fracao"],
    WEGE3: ["venda-sem-origem"],
    ITSA4: ["bonificacao-sem-custo"],
    B3SA3: ["bonificacao-sem-custo", "fracao"],
    XPML11: ["transferencia"],
    // desde a versão 1.3.0: XPTO3 (cenário 14) também cai na varredura de papel parado (sem cotação e sem linha há 24 meses)
    XPTO3: ["parada", "sem-cotacao"],
    QZDT3: ["day-trade"],
    QZFA11: ["incorporacao"], QZFB11: ["incorporacao"], QZFC11: ["incorporacao"], QZFD11: ["incorporacao"],
  },
  graves: 4, // EGIE3, WEGE3, ITSA4 e B3SA3
  porCorretora: { EGIE3: { Rico: { q: 112, custo: 4276.36 }, "Nu Invest": { q: 0, realizado: 1147 * 33.9 - (600 * 36.5 + 547 * 35.2) }, Inter: { q: 0, realizado: 0 } } },
  vendaSemOrigem: { WEGE3: 20 },
};

// Day trade e incorporação (cenários 18 a 20, versão 1.3.0), com --ate 04/11/2026
export const ESPERADO_FANTASMAS = {
  dayTrade: { QZDT3: { q: 300, pm: 4.9, realizado: -12 } },
  incorporacao: {
    QZFA11: { para: "QZFB11", d: "2025-10-15", resgate: 41.1, comprado: 1470, texto: "QZFA11 foi incorporado por QZFB11 em 15/10/2025: 150 cotas viraram 98,64; R$\u00a041,10 de resgate." },
    QZFD11: { para: "QZFC11", d: "2025-05-12", resgate: 20.48, comprado: 480, texto: "QZFD11 foi incorporado por QZFC11 em 12/05/2025: 40 cotas viraram 31,57; R$\u00a020,48 de resgate." },
  },
  // custo de QZFB11: 80 × 95 + (1.470 − 41,10), menos a fração de 0,64 pelo preço médio; QZFC11: 480 − 20,48, menos 0,57
  custo: { QZFB11: (7600 + 1428.9) * 178 / 178.64, QZFC11: (480 - 20.48) * 31 / 31.57 },
};
