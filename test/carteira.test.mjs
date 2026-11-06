// Teste do cálculo da carteira com linhas sintéticas (inventadas aqui; nenhum dado real de extrato).
// node --test test/
import test from "node:test";
import assert from "node:assert/strict";
import { mesclar, desfazer, calcular, projecao, twr, mesesAteAlvo, aporteNecessario, normalizarLinha, siglaCorretora, tipoMov, numero, dataIso, validarMeta } from "../src/carteira.js";

import { XP, RICO, neg, mov, prov, arquivos, arquivosSaidas, b3, fiiResumo, conferirLotes, compradoPorPapel, arquivosLotes } from "./fixtures-carteira.mjs";
const HOJE = "2026-11-03";
function montar(arqs = arquivos()) {
  const m = mesclar(null, arqs, "imp1");
  const importacoes = { lista: [{ id: "imp1", arquivos: m.porArquivo.map((a) => ({ tipo: a.tipo, de: a.de, ate: a.ate })) }] };
  return { m, importacoes, c: calcular(m.extrato, { b3, fiiResumo, importacoes, hoje: HOJE }) };
}
const pos = (c, t) => c.posicoes.find((p) => p.t === t);
const perto = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("formatos da B3", () => {
  assert.equal(numero("1.037"), 1037); assert.equal(numero("25,86"), 25.86); assert.equal(numero("-"), null); assert.equal(numero("R$ 1.234,56"), 1234.56);
  assert.equal(dataIso("31/02/2025"), ""); assert.equal(dataIso("29/02/2024"), "2024-02-29");
  assert.equal(siglaCorretora(XP), "XP"); assert.equal(siglaCorretora(RICO), "Rico"); assert.equal(siglaCorretora("BANCO QUALQUER S.A."), "Banco");
  assert.equal(tipoMov("Juros Sobre Capital Próprio - Transferido"), "jcp~t");
  assert.equal(normalizarLinha("movimentacao", mov[mov.length - 1]).erro, "papel");
  // a linha guardada não leva o nome do produto nem a razão social
  const l = normalizarLinha("movimentacao", mov[0], "x").linha;
  assert.ok(!JSON.stringify(l).includes("EMPRESA") && !JSON.stringify(l).includes("CCTVM"));
});

test("importação: contagem, rodapé ignorado e duplicata legítima no mesmo arquivo", () => {
  const { m } = montar();
  assert.equal(m.porArquivo[0].novos, neg.length);
  assert.equal(m.porArquivo[1].ignorados, 1); // Tesouro
  assert.equal(m.porArquivo[2].novos, 5); // rodapé (linha vazia e "Total") fora
  assert.deepEqual(m.porArquivo[1].tiposDesconhecidos, { "tipo-novo-qualquer": 1 });
});

test("dedupe na reimportação e desfazer", () => {
  const { m } = montar();
  const r = mesclar(m.extrato, arquivos(), "imp2");
  assert.equal(r.novos, 0);
  assert.equal(r.repetidos, m.novos);
  const extra = mesclar(m.extrato, [{ nome: "x", tipo: "negociacao", linhas: [["01/11/2026", "Compra", "Mercado à Vista", "-", XP, "ABCD3", 1, 12, 12]] }], "imp3");
  assert.equal(extra.novos, 1);
  const d = desfazer(extra.extrato, "imp3");
  assert.equal(d.removidas, 1);
  assert.equal(d.extrato.neg.length, m.extrato.neg.length);
});

test("fracionário soma com o lote", () => {
  const p = pos(montar().c, "ABCD3");
  assert.equal(p.q, 105);
  perto(p.pm, 1055 / 105);
  assert.equal(pos(montar().c, "ABCD3F"), undefined);
});

test("bonificação, desdobro 1:10 e grupamento 10:1 ajustam o PM pela proporção", () => {
  const { c } = montar();
  const e = pos(c, "EFGH4"); assert.equal(e.q, 110); perto(e.pm, 2000 / 110);
  const i = pos(c, "IJKL3"); assert.equal(i.q, 100); perto(i.pm, 10);
  const g = pos(c, "MNOP3"); assert.equal(g.q, 100); perto(g.pm, 10);
});

test("empréstimo marca as cotas sem tirar da posição", () => {
  const e = pos(montar().c, "EFGH4");
  assert.equal(e.q, 110); assert.equal(e.emprestadas, 50);
});

test("subscrição exercida vira cota ao preço do recibo; não exercida some", () => {
  const { c } = montar();
  const q = pos(c, "QRST11"); assert.equal(q.q, 110); perto(q.pm, (10000 + 950) / 110);
  assert.equal(pos(c, "QRST12"), undefined); assert.equal(pos(c, "QRST13"), undefined);
  assert.equal(pos(c, "UVWX12"), undefined);
  assert.equal(pos(c, "UVWX11").q, 50);
  assert.deepEqual(pos(c, "UVWX11").corretoras, ["Rico"]);
});

test("venda que zera a posição recomeça o PM e entra no realizado", () => {
  const y = pos(montar().c, "YZAB11");
  assert.equal(y.q, 20); perto(y.pm, 20); perto(y.realizado, 20);
});

test("proventos por mês, por tipo e tipo desconhecido em avisos", () => {
  const { c } = montar();
  const r = c.resumo;
  const out = r.meses.find((m) => m.mes === "2026-10");
  perto(out.total, 99 + 46.75 + 5); perto(out.jcp, 46.75); perto(out.rend, 104);
  // a Movimentação de 07/2025 não está coberta pelo arquivo de proventos (que começa em 08/2026): entra
  assert.equal(r.provDaMov, 1);
  perto(r.prov12, 110 + 110 + 99 + 46.75 + 5); // 12 meses fechados (nov/25 a out/26); jul/25 fica de fora
  assert.ok(r.avisos.some((a) => a.k === "tipo:tipo-novo-qualquer"));
  assert.ok(r.alertas.some((a) => a.tipo === "rendimento-menor" && a.t === "QRST11"));
  assert.equal(r.ir.jcpAno, 46.75);
});

test("TWR em 3 meses", () => {
  const meses = [{ v0: 0, fluxo: 1000, v1: 1100, prov: 0 }, { v0: 1100, fluxo: 0, v1: 1045, prov: 10 }, { v0: 1045, fluxo: 500, v1: 1600, prov: 0 }];
  perto(twr(meses), 1.1 * (1055 / 1100) * (1600 / 1545) - 1, 1e-12);
});

test("projeção da meta, caso simples conferido à mão", () => {
  // aporte 1000/mês, yield 12% a.a. (1% ao mês), reinvestindo, do zero: P chega a 10.462,20 no 10º mês e a renda passa de 100
  assert.equal(mesesAteAlvo({ alvo: 100, aporte: 1000, y: 0.12, reinvestir: true, p0: 0 }), 10);
  assert.equal(mesesAteAlvo({ alvo: 100, aporte: 1000, y: 0.12, reinvestir: false, p0: 0 }), 10); // sem reinvestir: 10 × 1000
  const ap = aporteNecessario({ alvo: 100, y: 0.12, p0: 0, prazo: 10 });
  assert.ok(ap <= 1000 && ap > 950);
  const { c } = montar();
  const p = projecao({ alvo: 5000, aporte: 2000, yield: 0.12, reinvestir: true }, c, HOJE);
  assert.ok(p.mesesAteAlvo > 0 && p.marcos.length === 4 && p.marcos[3].renda === 5000);
  assert.equal(p.patrimonioAlvo, 500000);
  assert.equal(validarMeta({ alvo: "x" }).erro, "Meta fora do intervalo.");
});

// Soma por papel: resultado em aberto das posições + realizado de cada papel (aberto ou encerrado)
const somaPorPapel = (c) => c.posicoes.reduce((s, p) => s + p.resultado + p.realizado, 0) + c.resumo.encerradas.reduce((s, e) => s + e.resultado, 0);

test("topo: só a venda de 2025, nenhuma retirada", () => {
  const r = montar().c.resumo;
  assert.equal(r.aberto, r.resultado);
  assert.deepEqual(r.realizado, { total: 20, ano: 0, n: 1, nAno: 0 });
  assert.deepEqual(r.saidas, { vendas: { total: 120, ano: 0, n: 1 }, retiradas: { total: 0, ano: 0, n: 0, tipos: {} } });
  perto(r.aberto + r.realizado.total, somaPorPapel(montar().c), 0.02);
});

test("topo: venda parcial com lucro, venda com prejuízo, transferência de saída e amortização", () => {
  const { c } = montar(arquivosSaidas());
  const r = c.resumo;
  const lucro = 700 - 50 * (1055 / 105);
  // venda parcial: a posição continua com o mesmo PM e o lucro fica no realizado do papel
  const a = pos(c, "ABCD3"); assert.equal(a.q, 55); perto(a.pm, 1055 / 105); perto(a.realizado, lucro, 0.005);
  const m = pos(c, "MNOP3"); assert.equal(m.q, 60); perto(m.realizado, -80, 0.005);
  // transferência de saída: tira da posição e o custo restante segue o PM
  const i = pos(c, "IJKL3"); assert.equal(i.q, 70); perto(i.custo, 700);
  // entre corretoras no mesmo dia: a quantidade fica, só muda de casa
  const e = pos(c, "EFGH4"); assert.equal(e.q, 110); assert.deepEqual(e.corretoras, ["Rico", "XP"]);
  // amortização: provento, a quantidade fica
  assert.equal(pos(c, "QRST11").q, 110);
  perto(r.meses.find((x) => x.mes === "2026-06").amort, 55);

  perto(r.realizado.total, 20 + lucro - 80, 0.01);
  perto(r.realizado.ano, lucro - 80, 0.01);
  assert.equal(r.realizado.n, 3); assert.equal(r.realizado.nAno, 2);
  assert.deepEqual(r.saidas.vendas, { total: 1140, ano: 1020, n: 3 });
  assert.deepEqual(r.saidas.retiradas, { total: 300, ano: 300, n: 1, tipos: { transf: 300 } });
  assert.equal(r.aberto, r.resultado);
  perto(r.aberto + r.realizado.total, somaPorPapel(c), 0.02);
});

test("topo: retirada de custódia vale pelo PM da data, e uma compra depois não muda esse valor", () => {
  const extra = [
    { nome: "m.xlsx", tipo: "movimentacao", linhas: [["Debito", "02/03/2026", "Retirada de Custódia", "YZAB11 - FUNDO YZAB", XP, 5, "-", "-"], ["Credito", "14/04/2026", "Transferência - Liquidação", "YZAB11 - FUNDO YZAB", XP, 15, 30, 450]] },
    { nome: "n.xlsx", tipo: "negociacao", linhas: [["10/04/2026", "Compra", "Mercado à Vista", "-", XP, "YZAB11", 15, 30, 450]] },
  ];
  const { c } = montar([...arquivos(), ...extra]);
  const r = c.resumo;
  assert.equal(pos(c, "YZAB11").q, 30);
  assert.deepEqual(r.saidas.retiradas, { total: 100, ano: 100, n: 1, tipos: { retirada: 100 } }); // 5 × PM 20
});

test("Paguei × hoje contando proventos e vendas (resumo.total)", () => {
  // compras: 16.055 na Negociação + 950 da subscrição exercida; proventos 110 (Movimentação de 07/2025) + 370,75; venda 120
  const r = montar().c.resumo;
  perto(r.total.pago, 17005, 0.005);
  perto(r.total.proventos, 480.75, 0.005);
  assert.equal(r.total.vendas, 120);
  perto(r.patrimonio, 18980, 0.005);
  perto(r.total.hoje, 18980 + 480.75 + 120, 0.005);
  perto(r.total.ganho, 19580.75 - 17005, 0.005);
  assert.equal(r.total.pct, 15.15);
  // a coluna "Com proventos" usa os proventos de cada papel desde o começo
  const c = montar().c;
  perto(c.posicoes.reduce((s, p) => s + p.proventos, 0), 480.75, 0.005);
  perto(pos(c, "QRST11").proventos, 429, 0.005);

  // com vendas, amortização e uma transferência de saída: vendas e amortização entram, a retirada (300) não
  const s = montar(arquivosSaidas()).c.resumo;
  assert.equal(s.saidas.retiradas.total, 300);
  perto(s.total.pago, 17005, 0.005);
  assert.equal(s.total.vendas, 1140);
  perto(s.total.proventos, 535.75, 0.005);
  perto(s.patrimonio, 17690, 0.005);
  perto(s.total.hoje, 17690 + 535.75 + 1140, 0.005);
  perto(s.total.ganho, s.total.hoje - s.total.pago, 0.005);
});

// ---------- carteira por lote (FIFO) ----------
// negs: [data ISO, "C"|"V", papel, q, preço]; movs: [C|D, data ISO, tipo como a B3 escreve, papel, q, preço | null].
// comMov: a Movimentação traz a liquidação de cada negócio (a quantidade da posição passa a vir dela).
const br = (iso) => iso.split("-").reverse().join("/");
function carteiraDe(negs, { movs = [], cot = {}, comMov = movs.length > 0 } = {}) {
  const neg = negs.map(([d, cv, t, q, p]) => [br(d), cv === "C" ? "Compra" : "Venda", "Mercado à Vista", "-", XP, t, q, p, q * p]);
  const mv = comMov ? [
    ...negs.map(([d, cv, t, q, p]) => [cv === "C" ? "Credito" : "Debito", br(d), "Transferência - Liquidação", t + " - EMPRESA", XP, q, p, q * p]),
    ...movs.map(([es, d, tipo, t, q, p]) => [es === "C" ? "Credito" : "Debito", br(d), tipo, t + " - EMPRESA", XP, q, p ?? "-", p != null ? q * p : "-"]),
  ] : [];
  const arqs = [{ nome: "n", tipo: "negociacao", linhas: neg }];
  if (mv.length) arqs.push({ nome: "m", tipo: "movimentacao", linhas: mv });
  const m = mesclar(null, arqs, "x");
  const c = calcular(m.extrato, { b3: { acoes: Object.entries(cot).map(([t, preco]) => ({ t, preco })), fiis: [], etfs: [], bdrs: [] }, fiiResumo: { fundos: {} }, importacoes: { lista: [] }, hoje: HOJE });
  return { c, ex: m.extrato };
}
const lotesDe = (p) => p.lotes.map((l) => [l.d, l.q, l.preco, l.origem]);

test("por lote: três compras a preços diferentes e uma venda baixa o lote mais antigo", () => {
  // 1 a 10, 1 a 9, 1 a 5; vende 1 a 7. Preço médio 8: −1. Por lote sai o de 10: −3. Sobram o de 9 e o de 5.
  const { c, ex } = carteiraDe([["2025-02-03", "C", "LOTE3", 1, 10], ["2025-03-03", "C", "LOTE3", 1, 9], ["2025-04-01", "C", "LOTE3", 1, 5], ["2026-05-04", "V", "LOTE3", 1, 7]], { cot: { LOTE3: 6 } });
  const p = pos(c, "LOTE3");
  assert.equal(p.q, 2); perto(p.pm, 8); perto(p.custo, 16); perto(p.realizado, -1); // o preço médio não muda
  assert.deepEqual(lotesDe(p), [["2025-03-03", 1, 9, "compra"], ["2025-04-01", 1, 5, "compra"]]);
  assert.deepEqual(p.lotes.map((l) => [l.hoje, l.diferenca, l.pct]), [[6, -3, -33.33], [6, 1, 20]]);
  assert.deepEqual(p.vendas, [{ d: "2026-05-04", q: 1, precoVenda: 7, valor: 7, lotes: [{ dLote: "2025-02-03", q: 1, precoLote: 10, resultado: -3 }], semLote: 0, resultado: -3, resultadoPm: -1 }]);
  assert.deepEqual({ custo: p.fifo.custo, resultado: p.fifo.resultado, pct: p.fifo.pct, realizado: p.fifo.realizado }, { custo: 14, resultado: -2, pct: -14.29, realizado: -3 });
  const r = c.resumo;
  assert.deepEqual(r.fifo, { custo: 14, aberto: -2, pct: -14.29, realizado: -3, realizadoAno: -3 });
  assert.equal(r.aberto, -4); assert.equal(r.realizado.total, -1);
  // os dois jeitos de contar dão o mesmo no total: só muda o que é aberto e o que é realizado
  perto(r.fifo.aberto + r.fifo.realizado, r.aberto + r.realizado.total);
  assert.deepEqual(conferirLotes(c, compradoPorPapel(ex, ["LOTE3"])), []);
});

test("por lote: venda que atravessa dois lotes", () => {
  const { c } = carteiraDe([["2025-01-10", "C", "DOIS3", 10, 10], ["2025-02-10", "C", "DOIS3", 10, 12], ["2025-06-10", "V", "DOIS3", 15, 15]], { cot: { DOIS3: 14 } });
  const p = pos(c, "DOIS3");
  assert.deepEqual(p.vendas[0].lotes, [{ dLote: "2025-01-10", q: 10, precoLote: 10, resultado: 50 }, { dLote: "2025-02-10", q: 5, precoLote: 12, resultado: 15 }]);
  assert.equal(p.vendas[0].resultado, 65); perto(p.vendas[0].resultadoPm, 15 * 15 - 15 * 11, 0.005);
  assert.deepEqual(lotesDe(p), [["2025-02-10", 5, 12, "compra"]]);
  assert.equal(c.resumo.fifo.realizadoAno, 0); // venda de 2025
  assert.deepEqual(conferirLotes(c), []);
});

test("por lote: desdobro antes da venda divide quantidade e preço de cada lote", () => {
  const { c } = carteiraDe([["2025-01-10", "C", "DESD3", 10, 100], ["2025-02-10", "C", "DESD3", 10, 50], ["2025-06-10", "V", "DESD3", 15, 30]],
    { movs: [["C", "2025-03-20", "Desdobro", "DESD3", 20, null]], cot: { DESD3: 28 } });
  const p = pos(c, "DESD3");
  assert.equal(p.q, 25); perto(p.pm, 37.5); perto(p.realizado, 450 - 15 * 37.5);
  assert.deepEqual(p.vendas[0].lotes, [{ dLote: "2025-01-10", q: 15, precoLote: 50, resultado: -300 }]);
  assert.deepEqual(lotesDe(p), [["2025-01-10", 5, 50, "compra"], ["2025-02-10", 20, 25, "compra"]]);
  assert.deepEqual(conferirLotes(c), []);
});

test("por lote: bonificação vira lote a custo zero (ou ao valor que o extrato traz) e o preço médio fica como era", () => {
  const sem = carteiraDe([["2025-01-10", "C", "BONI3", 100, 20]], { movs: [["C", "2025-03-20", "Bonificação em Ativos", "BONI3", 10, null]], cot: { BONI3: 21 } }).c;
  const a = pos(sem, "BONI3");
  assert.equal(a.q, 110); perto(a.pm, 2000 / 110);
  assert.deepEqual(lotesDe(a), [["2025-01-10", 100, 20, "compra"], ["2025-03-20", 10, 0, "bonificacao"]]);
  assert.deepEqual(a.lotes.map((l) => l.pct), [5, null]);
  assert.equal(a.fifo.custo, 2000);
  const com = carteiraDe([["2025-01-10", "C", "BONI3", 100, 20]], { movs: [["C", "2025-03-20", "Bonificação em Ativos", "BONI3", 10, 5]], cot: { BONI3: 21 } }).c;
  const b = pos(com, "BONI3");
  perto(b.pm, 2000 / 110); // o preço médio não usa o valor da bonificação
  assert.deepEqual(lotesDe(b)[1], ["2025-03-20", 10, 5, "bonificacao"]);
  assert.equal(b.fifo.entrou, 2050); assert.equal(b.fifo.custo, 2050);
  assert.deepEqual(conferirLotes(sem), []); assert.deepEqual(conferirLotes(com), []);
});

test("por lote: transferência de saída baixa do mais antigo; a de entrada entra pelo preço médio da data", () => {
  const { c, ex } = carteiraDe([["2025-01-10", "C", "TRAN3", 10, 10], ["2025-02-10", "C", "TRAN3", 10, 20]],
    { movs: [["D", "2025-05-05", "Transferência", "TRAN3", 5, null], ["C", "2025-07-01", "Transferência", "TRAN3", 4, null],
      // entre corretoras no mesmo dia: se anula e não mexe nos lotes
      ["D", "2025-08-01", "Transferência", "TRAN3", 3, null], ["C", "2025-08-01", "Transferência", "TRAN3", 3, null]], cot: { TRAN3: 16 } });
  const p = pos(c, "TRAN3");
  assert.equal(p.q, 19); perto(p.pm, 15); perto(p.custo, 19 * 15); // preço médio como era
  assert.deepEqual(lotesDe(p), [["2025-01-10", 5, 10, "compra"], ["2025-02-10", 10, 20, "compra"], ["2025-07-01", 4, 15, "transferencia"]]);
  assert.deepEqual([p.fifo.entrou, p.fifo.baixadoVendas, p.fifo.baixadoOutros, p.fifo.custo], [360, 0, 50, 310]);
  assert.deepEqual(p.vendas, []);
  // contando à parte: comprado 300, mais as 4 que entraram por transferência a R$ 15
  const comprado = compradoPorPapel(ex, ["TRAN3"]); comprado.TRAN3 += 4 * 15;
  assert.deepEqual(conferirLotes(c, comprado), []);
});

test("por lote: invariantes nas linhas de teste, com vendas, grupamento, desdobro, subscrição e transferência", () => {
  for (const arqs of [arquivos(), arquivosSaidas(), arquivosLotes()]) {
    const { m, c } = montar(arqs);
    assert.deepEqual(conferirLotes(c, compradoPorPapel(m.extrato, [...c.posicoes, ...c.resumo.encerradas].map((p) => p.t))), []);
  }
  const { c } = montar(arquivosSaidas());
  // a subscrição exercida é um lote ao preço do exercício; a transferência de saída tirou 30 do lote de IJKL3
  assert.deepEqual(lotesDe(pos(c, "QRST11")), [["2025-03-06", 100, 100, "compra"], ["2025-05-20", 10, 95, "subscricao"]]);
  assert.deepEqual(lotesDe(pos(c, "IJKL3")), [["2025-03-04", 70, 10, "compra"]]);
  assert.equal(pos(c, "IJKL3").fifo.baixadoOutros, 300);
  // a venda parcial de ABCD3 sai do lote de 100 a R$ 10 (o fracionário a R$ 11 fica)
  const v = pos(c, "ABCD3").vendas[0];
  assert.deepEqual(v.lotes, [{ dLote: "2025-01-02", q: 50, precoLote: 10, resultado: 200 }]);
  perto(v.resultadoPm, 700 - 50 * (1055 / 105), 0.005);
  assert.deepEqual(lotesDe(pos(c, "ABCD3")), [["2025-01-02", 50, 10, "compra"], ["2025-01-02", 5, 11, "compra"]]);
  assert.equal(c.resumo.fifo.realizadoAno, 200 - 80);
  // a venda de 60 de ABCD3 em set/2026 (as linhas dos prints) baixa três lotes: o resto do de 100, o fracionário e parte do de 13
  const l = pos(montar(arquivosLotes()).c, "ABCD3");
  assert.deepEqual(l.vendas[1].lotes.map((x) => [x.dLote, x.q, x.precoLote, x.resultado]), [["2025-01-02", 50, 10, 125], ["2025-01-02", 5, 11, 7.5], ["2025-08-12", 5, 13, -2.5]]);
  assert.deepEqual(lotesDe(l), [["2025-08-12", 35, 13, "compra"], ["2026-01-15", 30, 9.5, "compra"]]);
});
