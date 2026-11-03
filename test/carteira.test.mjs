// Teste do cálculo da carteira com linhas sintéticas (inventadas aqui; nenhum dado real de extrato).
// node --test test/
import test from "node:test";
import assert from "node:assert/strict";
import { mesclar, desfazer, calcular, projecao, twr, mesesAteAlvo, aporteNecessario, normalizarLinha, siglaCorretora, tipoMov, numero, dataIso, validarMeta } from "../src/carteira.js";

import { XP, RICO, neg, mov, prov, arquivos, b3, fiiResumo } from "./fixtures-carteira.mjs";
const HOJE = "2026-11-03";
function montar() {
  const m = mesclar(null, arquivos(), "imp1");
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
