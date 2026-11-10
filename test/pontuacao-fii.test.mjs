// Reinvestir: pontuação de FIIs (src/pontuacao-fii.js), validação dos pesos (src/prefs.js) e a rota
// /api/carteira/reinvestir com o D1 falso. Papéis e números inventados (test/fixtures-radar.mjs e test/fixtures-carteira.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import {
  parcialPvp, parcialDy, parcialRegularidade, parcialRendimento, parcialLiquidez, parcialCotistas, parcialTeto, parcialCompras,
  pontuar, linhasUniverso, reinvestir, equilibrio, baseFiis, dividirAporte, retratoFiis, segmentoDe, pesosDe,
  PESOS_PADRAO, TETOS_PADRAO, LIMITES_PADRAO, CRITERIOS, APORTE_PADRAO,
} from "../src/pontuacao-fii.js";
import { validarReinvestir, respostaReinvestir } from "../src/prefs.js";
import { rotaCarteira, limparCacheCarteira, aporteSugerido, aporteDaUrl, comprasRecentes } from "../src/carteira.js";
import { d1Falso, espelhoFalso } from "./d1-falso.mjs";
import { fiiResumo, b3 } from "./fixtures-radar.mjs";
import * as FC from "./fixtures-carteira.mjs";

const perto = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const PROIBIDO = /\b(dicas?|melhor|melhores|oportunidade|oportunidades|barato|baratos|barata|recomendad[oa]s?|recomenda[çc][ãa]o|recomendo|compre|sugerimos|ticker)\b/i;

test("P/VP nos limites da faixa", () => {
  for (const v of [0.85, 0.9, 1]) assert.equal(parcialPvp(v), 1);
  perto(parcialPvp(1.125), 0.5); assert.equal(parcialPvp(1.25), 0); assert.equal(parcialPvp(1.6), 0);
  perto(parcialPvp(0.7), 0.4); assert.equal(parcialPvp(0.6), 0); assert.equal(parcialPvp(0.3), 0);
  assert.equal(parcialPvp(null), null); assert.equal(parcialPvp(0), null);
});

test("DY sobre o CDI, regularidade, rendimento, liquidez, cotistas e as partes do equilíbrio nos limites", () => {
  assert.equal(parcialDy(10, 11), 0); assert.equal(parcialDy(11, 11), 0); perto(parcialDy(13, 11), 0.5); assert.equal(parcialDy(15, 11), 1); assert.equal(parcialDy(20, 11), 1);
  assert.equal(parcialDy(12, null), null); assert.equal(parcialDy(null, 11), null);
  assert.deepEqual([12, 11, 10, 9, 0].map(parcialRegularidade), [1, 0.7, 0.4, 0, 0]); assert.equal(parcialRegularidade(null), null);
  assert.equal(parcialRendimento(0.1, 0.1), 1); assert.equal(parcialRendimento(0.12, 0.1), 1); perto(parcialRendimento(0.085, 0.1), 0.5); assert.equal(parcialRendimento(0.07, 0.1), 0); assert.equal(parcialRendimento(0.05, 0.1), 0);
  assert.equal(parcialRendimento(0.1, 0), null); assert.equal(parcialRendimento(null, 0.1), null);
  assert.equal(parcialLiquidez(1e6), 1); assert.equal(parcialLiquidez(5e6), 1); perto(parcialLiquidez(2e5), 0.2); perto(parcialLiquidez(6e5), 0.6); perto(parcialLiquidez(1e5), 0.1); assert.equal(parcialLiquidez(99999), 0); assert.equal(parcialLiquidez(null), null);
  assert.equal(parcialCotistas(1e5), 1); assert.equal(parcialCotistas(5e5), 1); perto(parcialCotistas(1e4), 0.3); perto(parcialCotistas(Math.sqrt(1e9)), 0.65); assert.equal(parcialCotistas(1000), 0); assert.equal(parcialCotistas(null), null);
  // teto de 10%: até 10% = 1; 15% = 0,5; 20% (o dobro) ou mais = 0
  assert.equal(parcialTeto(0.05, 0.1), 1); assert.equal(parcialTeto(0.1, 0.1), 1); perto(parcialTeto(0.15, 0.1), 0.5); assert.equal(parcialTeto(0.2, 0.1), 0); assert.equal(parcialTeto(0.6, 0.1), 0);
  perto(parcialTeto(0.3, 0.25), 0.8); assert.equal(parcialTeto(0.5, 0.25), 0); assert.equal(parcialTeto(null, 0.1), null);
  // compras: até 25% = 1; 100% = 0,3; sem compra = 1
  assert.equal(parcialCompras(null), 1); assert.equal(parcialCompras(0), 1); assert.equal(parcialCompras(0.25), 1); perto(parcialCompras(1), 0.3); perto(parcialCompras(0.625), 0.65);
});

// Uma linha no formato do Radar com tudo na faixa máxima
const cheia = (t, extra = {}) => ({ t, nome: "FUNDO " + t, seg: "Logística", preco: 9, pvp: 0.95, dy: 16, pg: 12, m12: 12, rend: 0.12, media: 0.12, liq: 2e6, cot: 2e5, temCvm: true, ...extra });

test("pontos: soma ponderada sobre os critérios com dado, faltando e exclusão", () => {
  const r = pontuar([cheia("AAAA11"), cheia("BBBB11", { pvp: 1.125, liq: null }), cheia("CCCC11", { pvp: null, liq: null, cot: null }), cheia("DDDD11", { dy: 13 })], { cdi: 11, carteira: { porPapel: {}, total: 0 } });
  const a = r.avaliados.find((x) => x.t === "AAAA11");
  assert.equal(a.pontos, 100); assert.deepEqual(a.faltando, []);
  assert.equal(a.criterios.length, CRITERIOS.length);
  assert.ok(a.criterios.every((c) => c.max === PESOS_PADRAO[c.id] && (c.naoSeAplica ? c.id === "abaixo" && c.pontos === null : c.pontos === c.max)));
  // B: P/VP vale metade (10 de 20) e liquidez fica de fora da conta: (100 − 10 − 10) / 90
  const b = r.avaliados.find((x) => x.t === "BBBB11");
  assert.deepEqual(b.faltando, ["liquidez"]);
  assert.equal(b.pontos, Math.round((80 / 90) * 100));
  assert.equal(b.criterios.find((c) => c.id === "liquidez").pontos, null);
  // C: três critérios sem dado, fora
  assert.deepEqual(r.excluidos, [{ t: "CCCC11", faltando: ["pvp", "liquidez", "cotistas"] }]);
  // D: DY 2 pontos acima do CDI = metade dos 20
  assert.equal(r.avaliados.find((x) => x.t === "DDDD11").pontos, 90);
  // ordem: maior para o menor (D 90, B 89)
  assert.deepEqual(r.avaliados.map((x) => x.t), ["AAAA11", "DDDD11", "BBBB11"]);
  // sem FII na carteira: equilíbrio no máximo para todos
  const eq = a.criterios.find((c) => c.id === "equilibrio");
  assert.equal(eq.pontos, 25); assert.equal(eq.nota, "você ainda não tem FIIs");
  // aporte padrão, renda do aporte = aporte × DY / 12
  assert.equal(r.aporte, APORTE_PADRAO);
  perto(a.rendaAporte, Math.round(((1000 * 16) / 100 / 12) * 100) / 100);
});

test("pesos zero: critério ignorado na conta e em faltando; sem CDI o DY falta", () => {
  const l = [cheia("AAAA11", { pvp: 1.25, liq: null, cot: null })];
  const base = pontuar(l, { cdi: 11 });
  assert.deepEqual(base.avaliados[0].faltando, ["liquidez", "cotistas"]);
  assert.equal(base.avaliados[0].pontos, Math.round((60 / 80) * 100));
  const sem = pontuar(l, { cdi: 11, pesos: { pvp: 0, liquidez: 0 } });
  assert.deepEqual(sem.avaliados[0].faltando, ["cotistas"]);
  assert.equal(sem.avaliados[0].pontos, 100);
  assert.ok(!sem.avaliados[0].criterios.some((c) => c.id === "pvp" || c.id === "liquidez"));
  // sem CDI e sem liquidez nem cotistas: 3 faltando, fora
  assert.equal(pontuar(l, { cdi: null }).excluidos.length, 1);
  // peso dobrado muda a conta
  const dobro = pontuar([cheia("AAAA11", { pvp: 1.125 })], { cdi: 11, pesos: { pvp: 40 } });
  assert.equal(dobro.avaliados[0].pontos, Math.round((100 / 120) * 100));
});

// FIIs da carteira em segmentos diferentes, R$ 10.000 no total
const carteiraDe = (lista) => baseFiis(lista.map(([t, seg, valor]) => ({ t, q: 1, valor, classe: "fii", seg })));
const espalhada = (extra = []) => carteiraDe([["QQQQ11", "Shoppings", 2000], ["RRRR11", "Escritórios", 2000], ["SSSS11", "Hotel", 2000], ["UUUU11", "Residencial", 2000], ...extra]);

test("equilíbrio: papel, segmento e compras recentes nos limites; o menor manda", () => {
  // papel com 10% (no teto) = 1; 15% = 0,5; 20% = 0
  const fiis = (v) => espalhada([["PAPL11", "Logística", v], ["VVVV11", "Agro", 2000 - v]]);
  let e = equilibrio("PAPL11", "Logística", { fiis: fiis(1000) });
  assert.equal(e.parcial, 1); assert.equal(e.limita, null); assert.equal(e.nota, "dentro dos tetos: papel 10%, segmento 10%");
  e = equilibrio("PAPL11", "Logística", { fiis: fiis(1500) });
  perto(e.parcial, 0.5); assert.equal(e.limita, "papel"); assert.equal(e.nota, "já é 15% dos seus FIIs, acima do teto de 10%");
  assert.equal(equilibrio("PAPL11", "Logística", { fiis: fiis(2000) }).parcial, 0);
  // com aporte: de 8% para 12% (aporte de 476,19 sobre 10.000 com 800 no papel)
  e = equilibrio("PAPL11", "Logística", { fiis: fiis(800), aporte: 500 });
  perto(e.partes.papel.depois, 12.4); assert.equal(e.nota, "iria de 8% para 12% dos seus FIIs, acima do teto de 10%");
  // papel que a pessoa não tem
  e = equilibrio("NOVO11", "Agro", { fiis: fiis(500), aporte: 2500 });
  assert.equal(e.partes.papel.depois, 20); assert.equal(e.parcial, 0); assert.equal(e.nota, "iria a 20% dos seus FIIs, acima do teto de 10%");
  // segmento: Logística em 30% com o papel em 5% = 0,8; em 50% = 0
  e = equilibrio("PAPL11", "Logística", { fiis: carteiraDe([["PAPL11", "Logística", 500], ["LOGB11", "Logística", 2500], ["QQQQ11", "Shoppings", 2000], ["RRRR11", "Escritórios", 2000], ["SSSS11", "Hotel", 2000], ["UUUU11", "Residencial", 1000]]) });
  perto(e.parcial, 0.8); assert.equal(e.limita, "segmento"); assert.equal(e.nota, "Logística já é 30% dos seus FIIs, acima do teto de 25%");
  e = equilibrio("PAPL11", "Logística", { fiis: carteiraDe([["PAPL11", "Logística", 500], ["LOGB11", "Logística", 4500], ["QQQQ11", "Shoppings", 2500], ["RRRR11", "Escritórios", 2500]]) });
  assert.equal(e.parcial, 0);
  // segmento subindo com o aporte: de 31% para 33%
  e = equilibrio("PAPL11", "Logística", { fiis: carteiraDe([["PAPL11", "Logística", 500], ["LOGB11", "Logística", 2600], ["QQQQ11", "Shoppings", 2300], ["RRRR11", "Escritórios", 2300], ["SSSS11", "Hotel", 2300]]), aporte: 300 });
  assert.equal(e.nota, "Logística já é 31% dos seus FIIs, acima do teto de 25%; com o aporte, 33%");
  // tetos da pessoa mudam a conta
  assert.equal(equilibrio("PAPL11", "Logística", { fiis: fiis(1500), tetos: { papel: 15, segmento: 25 } }).parcial, 1);
  // compras recentes: 25% = 1; 62% = 0,65; 100% = 0,3; venda deixa o papel sem compra
  const base = fiis(500), compras = (porPapel) => ({ desde: "2026-08", porPapel });
  assert.equal(equilibrio("PAPL11", "Logística", { fiis: base, compras: compras({ PAPL11: 250, QQQQ11: 750 }) }).parcial, 1);
  e = equilibrio("PAPL11", "Logística", { fiis: base, compras: compras({ PAPL11: 620, QQQQ11: 380 }) });
  perto(e.parcial, 1 - (0.7 * 0.37) / 0.75, 1e-5); assert.equal(e.limita, "compras"); assert.equal(e.nota, "62% das suas compras de FIIs desde agosto foram neste papel");
  perto(equilibrio("PAPL11", "Logística", { fiis: base, compras: compras({ PAPL11: 1000 }) }).parcial, 0.3);
  assert.equal(equilibrio("PAPL11", "Logística", { fiis: base, compras: compras({ PAPL11: -500, QQQQ11: 900 }) }).parcial, 1);
  assert.equal(equilibrio("PAPL11", "Logística", { fiis: base, compras: compras({}) }).partes.compras.pct, null);
  // o menor manda: papel 0,5 (15%), segmento 1, compras 0,65 => 0,5 pelo papel
  e = equilibrio("PAPL11", "Logística", { fiis: fiis(1500), compras: compras({ PAPL11: 625, QQQQ11: 375 }) });
  perto(e.parcial, 0.5); assert.equal(e.limita, "papel");
  perto(e.partes.compras.parcial, 0.65); assert.equal(e.partes.segmento.parcial, 1);
  // compras limitam mais que o papel
  e = equilibrio("PAPL11", "Logística", { fiis: fiis(1100), compras: compras({ PAPL11: 1000 }) });
  assert.equal(e.limita, "compras"); perto(e.parcial, 0.3);
  // sem FII: 1 para todos, mesmo com aporte
  e = equilibrio("PAPL11", "Logística", { fiis: baseFiis([]), aporte: 5000 });
  assert.equal(e.parcial, 1); assert.equal(e.nota, "você ainda não tem FIIs");
  // segmento: o da CVM; vazio = Outros; grafias de títulos juntas
  assert.equal(segmentoDe(""), "Outros"); assert.equal(segmentoDe(null), "Outros"); assert.equal(segmentoDe(" Logística "), "Logística");
  assert.equal(segmentoDe("Títulos e Val. Mob."), "Títulos e Val. Mob."); assert.equal(segmentoDe("TITULOS E VALORES MOBILIARIOS"), "Títulos e Val. Mob."); assert.equal(segmentoDe("Hibrido"), "Híbrido");
});

test("equilíbrio na pontuação: quem já pesa muito perde pontos, quem não tem fica no máximo", () => {
  const l = [cheia("TENH11"), cheia("NAOT11", { seg: "Shoppings" })];
  // TENH11 com 18.000 de 20.000 em FIIs; aporte de 2.000: 20.000 / 22.000 = 90,9% => 0
  const fiis = carteiraDe([["TENH11", "Logística", 18000], ["OUTR11", "Escritórios", 2000]]);
  const r = pontuar(l, { cdi: 11, aporte: 2000, fiis });
  const t = r.avaliados.find((x) => x.t === "TENH11"), n = r.avaliados.find((x) => x.t === "NAOT11");
  const ce = (x) => x.criterios.find((c) => c.id === "equilibrio");
  assert.equal(ce(t).pontos, 0); assert.equal(ce(t).valor, 90.9); assert.equal(ce(t).limita, "papel");
  assert.match(ce(t).nota, /^já é 90% \(1 cota\) dos seus FIIs, acima do teto de 10%; com o aporte, 91% \(223 cotas\)$/);
  assert.deepEqual(t.tenho, { valor: 18000, pct: 90 });
  // NAOT11: 2.000 / 22.000 = 9,1% (papel e Shoppings) => máximo
  assert.equal(ce(n).pontos, 25); assert.equal(n.tenho, null);
  assert.deepEqual(n.efeito, { papelAntes: 0, papelDepois: 9.1, cotas: { antes: 0, compra: 222, depois: 222 }, segmentoAntes: 0, segmentoDepois: 9.1 });
  assert.deepEqual(t.efeito, { papelAntes: 90, papelDepois: 90.9, cotas: { antes: 1, compra: 222, depois: 223 }, segmentoAntes: 90, segmentoDepois: 90.9 });
  assert.equal(t.pontos, 75); assert.equal(r.avaliados[0].t, "NAOT11");
  assert.ok(!("partes" in t.criterios.find((c) => c.id === "dy")));
  for (const k of ["papel", "segmento", "compras"]) assert.ok(k in ce(t).partes, k);
});

test("pesos salvos com o critério carteira viram equilíbrio; tetos na validação", () => {
  assert.equal(pesosDe({ carteira: 30 }).equilibrio, 30);
  assert.ok(!("carteira" in pesosDe({ carteira: 30 })));
  assert.equal(pesosDe({ carteira: 30, equilibrio: 5 }).equilibrio, 5);
  const velho = { pesos: { pvp: 20, dy: 25, regularidade: 15, rendimento: 10, liquidez: 10, cotistas: 10, carteira: 10 }, universo: "meus" };
  const r = respostaReinvestir(velho);
  assert.equal(r.salvo, true); assert.equal(r.universo, "meus"); assert.equal(r.pesos.equilibrio, 10); assert.equal(r.pesos.dy, 25);
  assert.ok(!("carteira" in r.pesos)); assert.deepEqual(r.tetos, TETOS_PADRAO);
  assert.equal(validarReinvestir({ pesos: { carteira: 12 } }).reinvestir.pesos.equilibrio, 12);
  assert.deepEqual(validarReinvestir({ tetos: { papel: 15 } }).reinvestir.tetos, { papel: 15, segmento: 25 });
  assert.deepEqual(validarReinvestir({ tetos: { papel: 2, segmento: 100 } }).reinvestir.tetos, { papel: 2, segmento: 100 });
  assert.match(validarReinvestir({ tetos: { papel: 1 } }).erro, /Teto por papel: use um inteiro de 2 a 50/);
  assert.match(validarReinvestir({ tetos: { papel: 51 } }).erro, /2 a 50/);
  assert.match(validarReinvestir({ tetos: { papel: 10.5 } }).erro, /inteiro/);
  assert.match(validarReinvestir({ tetos: { segmento: 4 } }).erro, /Teto por segmento: use um inteiro de 5 a 100/);
  assert.match(validarReinvestir({ tetos: { segmento: 101 } }).erro, /5 a 100/);
  assert.match(validarReinvestir({ tetos: { vacancia: 10 } }).erro, /Teto desconhecido/);
  assert.equal(validarReinvestir({ tetos: [] }).erro, "tetos");
  // teto estragado no banco: volta tudo ao padrão
  assert.equal(respostaReinvestir({ pesos: PESOS_PADRAO, tetos: { papel: 99 } }).salvo, false);
  assert.deepEqual(Object.values(PESOS_PADRAO).reduce((a, b) => a + b, 0), 125);
  assert.deepEqual(PESOS_PADRAO, { equilibrio: 25, abaixo: 25, dy: 20, pvp: 20, regularidade: 10, liquidez: 10, cotistas: 10, rendimento: 5 });
});

test("divisão do aporte: cotas inteiras, soma com a sobra, espalha com os tetos", () => {
  const linhas = [cheia("AAAA11", { preco: 9.87 }), cheia("BBBB11", { seg: "Shoppings", preco: 101.3 }), cheia("CCCC11", { seg: "Escritórios", preco: 10 }), cheia("DDDD11", { seg: "Hotel", preco: 23.45, pvp: 1.05 }), cheia("EEEE11", { seg: "Agro", preco: 7.1, pvp: 1.1 })];
  const fiis = carteiraDe([["QQQQ11", "Shoppings", 5000], ["RRRR11", "Escritórios", 5000], ["SSSS11", "Residencial", 5000], ["UUUU11", "Logística", 5000]]);
  for (const aporte of [1037, 1500, 333.33, 25000]) {
    const r = pontuar(linhas, { cdi: 11, aporte, fiis });
    const d = dividirAporte(r.avaliados, { aporte, fiis });
    const soma = d.itens.reduce((s, x) => s + x.valor, 0);
    perto(Math.round((soma + d.sobra) * 100) / 100, aporte, 1e-6);
    for (const x of d.itens) { assert.ok(Number.isInteger(x.cotas) && x.cotas > 0, x.t); perto(x.valor, Math.round(x.cotas * linhas.find((l) => l.t === x.t).preco * 100) / 100, 1e-6); }
    for (let i = 1; i < d.itens.length; i++) assert.ok(d.itens[i - 1].valor >= d.itens[i].valor);
    // sobra menor que a cota mais barata (o lote chega a cota por cota no fim)
    assert.ok(d.sobra < 7.1, `sobra ${d.sobra} com ${aporte}`);
    perto(d.itens.reduce((s, x) => s + x.pct, 0) + (d.sobra / aporte) * 100, 100, 0.5);
  }
  // com R$ 25.000 sobre R$ 20.000 de FIIs, teto de 10% por papel (4.500) e 25% por segmento: espalha
  const g = dividirAporte(pontuar(linhas, { cdi: 11, aporte: 25000, fiis }).avaliados, { aporte: 25000, fiis });
  assert.ok(g.itens.length >= 4, JSON.stringify(g.itens));
  assert.ok(g.itens[0].valor < 25000 * 0.6);
  // um papel dominante: AAAA11 com 80% dos FIIs e a maior pontuação fora o equilíbrio fica sem cota
  const dom = carteiraDe([["AAAA11", "Logística", 16000], ["QQQQ11", "Shoppings", 4000]]);
  const rd = pontuar([cheia("AAAA11", { preco: 10 }), cheia("CCCC11", { seg: "Escritórios", preco: 10, pvp: 1.05 }), cheia("FFFF11", { seg: "Residencial", preco: 10, pvp: 1.05 })], { cdi: 11, aporte: 1000, fiis: dom });
  const dd = dividirAporte(rd.avaliados, { aporte: 1000, fiis: dom });
  assert.ok(!dd.itens.some((x) => x.t === "AAAA11"), JSON.stringify(dd.itens));
  assert.equal(dd.sobra, 0);
  // sem o critério equilíbrio a divisão vai inteira para o primeiro
  const sem = pontuar([cheia("AAAA11", { preco: 10 }), cheia("CCCC11", { seg: "Escritórios", preco: 10, pvp: 1.05 })], { cdi: 11, aporte: 1000, fiis: dom, pesos: { equilibrio: 0 } });
  assert.deepEqual(dividirAporte(sem.avaliados, { aporte: 1000, fiis: dom }).itens.map((x) => [x.t, x.cotas]), [["AAAA11", 100]]);
  // aporte menor que qualquer cota: tudo sobra
  const pouco = dividirAporte(pontuar(linhas, { cdi: 11, aporte: 5, fiis }).avaliados, { aporte: 5, fiis });
  assert.deepEqual(pouco.itens, []); assert.equal(pouco.sobra, 5);
  // aporte zero
  assert.deepEqual(dividirAporte(pontuar(linhas, { cdi: 11, aporte: 0, fiis }).avaliados, { aporte: 0, fiis }), { itens: [], sobra: 0, lote: 1 });
  // sem FII: a conta é sobre o próprio aporte, e os tetos espalham (10% de R$ 1.000 = R$ 100 por papel antes de perder
  // pontos): 10 papéis com 10 cotas cada, empate desfeito pelo código
  const vazio = baseFiis([]);
  const iguais = Array.from({ length: 15 }, (_, i) => cheia("F" + String.fromCharCode(65 + i) + "XX11", { seg: "Seg " + i, preco: 10 }));
  const dv = dividirAporte(pontuar(iguais, { cdi: 11, aporte: 1000, fiis: vazio }).avaliados, { aporte: 1000, fiis: vazio });
  assert.equal(dv.itens.length, 10); assert.ok(dv.itens.every((x) => x.cotas === 10), JSON.stringify(dv.itens)); assert.equal(dv.sobra, 0);
});

test("retrato dos FIIs: segmentos somam 100%, acima do teto marcado, maior posição", () => {
  const fiis = carteiraDe([["AAAA11", "Logística", 3333], ["BBBB11", "Logística", 1000], ["CCCC11", "Shoppings", 3333], ["DDDD11", "", 3334]]);
  const r = retratoFiis(fiis, { segmento: 25 });
  assert.equal(r.total, 11000);
  assert.deepEqual(r.porSegmento.map((x) => x.segmento), ["Logística", "Outros", "Shoppings"]);
  perto(r.porSegmento.reduce((s, x) => s + x.pct, 0), 100, 1e-9);
  assert.deepEqual(r.porSegmento.map((x) => x.acima), [true, true, true]);
  assert.ok(r.porSegmento.every((x) => x.teto === 25));
  assert.deepEqual(r.maiorPapel, { t: "DDDD11", pct: 30.3 });
  const t2 = retratoFiis(carteiraDe([["A1", "a", 1], ["A2", "b", 1], ["A3", "c", 1]]), {});
  perto(t2.porSegmento.reduce((s, x) => s + x.pct, 0), 100, 1e-9);
  assert.deepEqual(t2.porSegmento.map((x) => x.pct), [33.4, 33.3, 33.3]);
  assert.ok(t2.porSegmento.every((x) => x.acima));
  assert.deepEqual(retratoFiis(baseFiis([]), {}), { total: 0, porSegmento: [], maiorPapel: null });
});

test("compras recentes do extrato: 3 meses fechados mais o atual, só FIIs, compras menos vendas", () => {
  const calc = { fluxoPapel: new Map([
    ["AAAA11", { classe: "fii", meses: new Map([["2026-07", 5000], ["2026-08", 1000], ["2026-11", 300]]) }],
    ["BBBB11", { classe: "fii", meses: new Map([["2026-09", 800], ["2026-10", -800]]) }],
    ["CCCC11", { classe: "fii", meses: new Map([["2026-10", -400]]) }],
    ["ABCD3", { classe: "acao", meses: new Map([["2026-10", 9000]]) }],
  ]) };
  assert.deepEqual(comprasRecentes(calc, "2026-11-10"), { desde: "2026-08", porPapel: { AAAA11: 1300, CCCC11: -400 } });
  assert.deepEqual(comprasRecentes(null, "2026-01-05"), { desde: "2025-10", porPapel: {} });
});

test("notas: frases curtas e sem palavras proibidas", () => {
  const r = pontuar([cheia("AAAA11", { pvp: 0.92, pg: 11, rend: 0.1, media: 0.12 }), cheia("BBBB11", { pvp: 0.75, m12: 8, pg: 8, seg: "Hotel" }), cheia("CCCC11", { pvp: 1.3, dy: 9, seg: "Agro" })], { cdi: 11, fiis: carteiraDe([["AAAA11", "Logística", 500], ["QQQQ11", "Shoppings", 2250], ["RRRR11", "Escritórios", 2250]]) });
  const nota = (t, id) => r.avaliados.find((x) => x.t === t).criterios.find((c) => c.id === id).nota;
  assert.equal(nota("AAAA11", "pvp"), "P/VP 0,92: dentro da faixa de 0,85 a 1,00");
  assert.equal(nota("AAAA11", "regularidade"), "11 pagamentos em 12 meses");
  assert.match(nota("AAAA11", "rendimento"), /17% abaixo/);
  assert.equal(nota("AAAA11", "equilibrio"), "iria de 10% (1 cota) para 25% (112 cotas) dos seus FIIs, acima do teto de 10%");
  assert.equal(nota("BBBB11", "equilibrio"), "iria a 17% (111 cotas) dos seus FIIs, acima do teto de 10%");
  assert.match(nota("BBBB11", "pvp"), /abaixo de 0,85/);
  assert.equal(nota("BBBB11", "regularidade"), "8 pagamentos em 12 meses (a CVM tem só 8 informes do fundo)");
  assert.match(nota("CCCC11", "pvp"), /sem pontos/);
  assert.equal(nota("CCCC11", "dy"), "DY 12m 9,0% contra CDI 11,00%: no CDI ou abaixo");
  assert.match(nota("AAAA11", "dy"), /5,0 pontos acima \(4 ou mais dão o máximo\)/);
  for (const a of r.avaliados) for (const c of a.criterios) assert.doesNotMatch(c.nome + " " + c.nota, PROIBIDO);
  for (const c of CRITERIOS) assert.doesNotMatch(c.nome + " " + c.faixa, PROIBIDO);
});

const POS = [{ t: "TENH11", q: 2000, valor: 18000, preco: 9, classe: "fii" }, { t: "PASB11", q: 100, valor: 900, preco: 9, classe: "fii" }, { t: "FORA11", q: 10, valor: 100, preco: 10, classe: "fii" }, { t: "ABCD3", q: 10, valor: 200, preco: 20, classe: "acao" }];
const MERCADO = { itens: [{ id: "cdi", valor: 11, data: "2026-11-04" }] };

test("universo: todos os FIIs com dado da CVM, ou só os da carteira", () => {
  const todos = linhasUniverso({ b3, fiiResumo, posicoes: POS, universo: "todos" });
  assert.equal(todos.length, 20);
  const meus = linhasUniverso({ b3, fiiResumo, posicoes: POS, universo: "meus" });
  assert.deepEqual(meus.map((l) => l.t), ["TENH11", "PASB11"], "FORA11 não tem informe na CVM; ação não entra");
  const r = reinvestir({ b3, fiiResumo, mercado: MERCADO, posicoes: POS, patrimonio: 19200, aporteMeta: 500, universo: "meus" });
  assert.equal(r.universo, "meus"); assert.equal(r.total, 2); assert.equal(r.excluidos, 0);
  assert.deepEqual(r.aporte, { valor: 500, origem: "meta" }); assert.deepEqual(r.sugerido, r.aporte); assert.equal(r.cdi, 11);
  assert.ok(r.top.every((x) => x.tenho));
  assert.equal(r.top[0].t, "PASB11", "TENH11 perde os pontos de peso na carteira");
});

test("reinvestir com o universo todos: 5 primeiros, total, excluídos e ordenação", () => {
  const r = reinvestir({ b3, fiiResumo, mercado: MERCADO, posicoes: POS, patrimonio: 19200, universo: "todos" });
  assert.equal(r.top.length, 5);
  assert.deepEqual(r.aporte, { valor: 1000, origem: "padrao" });
  // SEMN11 (sem preço): sem P/VP, sem DY, sem liquidez => fora
  assert.equal(r.excluidos, 1);
  assert.equal(r.total, 19);
  for (let i = 1; i < r.top.length; i++) assert.ok(r.top[i - 1].pontos >= r.top[i].pontos);
  // CARO11 (P/VP 1,2) e ILIQ11 (R$ 9 mil por dia) não aparecem entre os 5
  assert.ok(!r.top.some((x) => x.t === "CARO11" || x.t === "ILIQ11"));
  const x = r.top[0];
  for (const k of ["t", "nome", "segmento", "pontos", "criterios", "faltando", "dy", "pvp", "rendaAporte"]) assert.ok(k in x, k);
  assert.ok(x.pontos >= 0 && x.pontos <= 100);
});

test("pesos salvos: validação e padrão", () => {
  assert.deepEqual(validarReinvestir({ pesos: { pvp: 30 }, universo: "meus" }).reinvestir, { pesos: { ...PESOS_PADRAO, pvp: 30 }, tetos: TETOS_PADRAO, universo: "meus", limites: LIMITES_PADRAO });
  assert.match(validarReinvestir({ pesos: { pvp: 51 } }).erro, /0 a 50/);
  assert.match(validarReinvestir({ pesos: { pvp: 2.5 } }).erro, /inteiro/);
  assert.match(validarReinvestir({ pesos: { pvp: -1 } }).erro, /inteiro/);
  assert.match(validarReinvestir({ pesos: { vacancia: 10 } }).erro, /desconhecido/);
  assert.match(validarReinvestir({ universo: "alguns" }).erro, /Universo/);
  assert.match(validarReinvestir({ pesos: Object.fromEntries(Object.keys(PESOS_PADRAO).map((k) => [k, 0])) }).erro, /pelo menos um/);
  assert.equal(validarReinvestir({ outro: 1 }).erro, "campo outro");
  assert.deepEqual(respostaReinvestir(null), { pesos: PESOS_PADRAO, tetos: TETOS_PADRAO, universo: "todos", limites: LIMITES_PADRAO, salvo: false });
  assert.deepEqual(respostaReinvestir({ pesos: { pvp: 999 } }), { pesos: PESOS_PADRAO, tetos: TETOS_PADRAO, universo: "todos", limites: LIMITES_PADRAO, salvo: false });
});

test("rota /api/carteira/reinvestir com o D1 falso: GET, PUT, cache e universo", async () => {
  const env = { DB: d1Falso(), CARTEIRA_KEY: Buffer.alloc(32, 7).toString("base64") };
  const ins = env.DB.db.prepare("INSERT INTO docs (collection, id, data) VALUES ('meta', ?, ?)");
  // meta/b3 da carteira de teste com os FIIs do Radar juntos; CDI no painel de mercado
  ins.run("b3", JSON.stringify({ ...b3, acoes: FC.b3.acoes, fiis: [...FC.b3.fiis.map((x) => ({ ...x, vol: 50000 })), ...b3.fiis] }));
  ins.run("fii-resumo", JSON.stringify({ ...fiiResumo, fundos: { ...fiiResumo.fundos, ...FC.fiiResumo.fundos } }));
  ins.run("mercado", JSON.stringify(MERCADO));
  const esp = espelhoFalso();
  const email = "eu@x.com";
  const chamar = async (metodo, caminho, corpo, limpar = true) => {
    if (limpar) limparCacheCarteira(email);
    const r = await rotaCarteira(new Request("https://x/api/carteira/" + caminho, { method: metodo, headers: { "content-type": "application/json" }, body: corpo === undefined ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo) }), env, { email }, caminho.split("?")[0], { ...esp, hoje: "2026-11-05" });
    return { status: r.status, j: await r.json() };
  };
  // sem carteira: responde com o universo todos, vazia
  let r = await chamar("GET", "reinvestir");
  assert.equal(r.status, 200);
  assert.equal(r.j.vazia, true); assert.equal(r.j.universo, "todos"); assert.equal(r.j.top.length, 5); assert.equal(r.j.salvo, false);
  assert.ok(r.j.top.every((x) => x.tenho === null));
  assert.deepEqual(r.j.fiis, { total: 0, porSegmento: [], maiorPapel: null });
  assert.ok(r.j.top.every((x) => x.criterios.find((c) => c.id === "equilibrio").nota === "você ainda não tem FIIs"));
  assert.ok(r.j.divisao.itens.length > 0);
  assert.equal((await chamar("POST", "importar", { arquivos: FC.arquivos() })).j.gravado, true);
  r = await chamar("GET", "reinvestir?universo=meus");
  assert.equal(r.j.vazia, false); assert.equal(r.j.universo, "meus");
  // FIIs da carteira: QRST11, UVWX11 e YZAB11 têm dado da CVM só com nome e rendimento: sem P/VP, DY nem cotistas => fora
  assert.equal(r.j.total, 0); assert.equal(r.j.excluidos, 3);
  assert.equal((await chamar("GET", "reinvestir?universo=alguns")).status, 400);
  // PUT: valida, grava em prefs/<email> e passa a valer no GET sem universo
  assert.equal((await chamar("PUT", "reinvestir", { pesos: { pvp: 60 } })).status, 400);
  assert.equal((await chamar("PUT", "reinvestir", "x".repeat(2100))).status, 413);
  assert.equal((await chamar("PUT", "reinvestir", { tetos: { papel: 60 } })).status, 400);
  const put = await chamar("PUT", "reinvestir", { pesos: { pvp: 0, equilibrio: 30 }, tetos: { papel: 12 }, universo: "todos" });
  assert.equal(put.status, 200); assert.equal(put.j.pesos.pvp, 0); assert.equal(put.j.pesos.equilibrio, 30); assert.deepEqual(put.j.tetos, { papel: 12, segmento: 25 });
  const linha = env.DB.db.prepare("SELECT data FROM docs WHERE collection = ? AND id = 'reinvestir'").get("prefs/" + email);
  assert.deepEqual(JSON.parse(linha.data).pesos, { ...PESOS_PADRAO, pvp: 0, equilibrio: 30 });
  assert.deepEqual(JSON.parse(linha.data).tetos, { papel: 12, segmento: 25 });
  assert.ok(esp.gravados.some((x) => x.collection === "prefs/" + email && x.id === "reinvestir"));
  r = await chamar("GET", "reinvestir");
  assert.equal(r.j.salvo, true); assert.equal(r.j.pesos.pvp, 0); assert.equal(r.j.universo, "todos"); assert.equal(r.j.tetos.papel, 12);
  assert.match(r.j.criterios.find((c) => c.id === "equilibrio").faixa, /papel até 12%/);
  assert.ok(r.j.top.every((x) => !x.criterios.some((c) => c.id === "pvp")));
  // cache de 60 s por pessoa: uma gravação por fora não aparece até limpar
  env.DB.db.prepare("UPDATE docs SET data = ? WHERE collection = ? AND id = 'reinvestir'").run(JSON.stringify({ pesos: PESOS_PADRAO, universo: "todos" }), "prefs/" + email);
  r = await chamar("GET", "reinvestir", undefined, false);
  assert.equal(r.j.pesos.pvp, 0);
  r = await chamar("GET", "reinvestir");
  assert.equal(r.j.pesos.pvp, 20);
  // doc salvo antes do equilíbrio, com `carteira` e universo "meus": lido como equilíbrio, sem regravar, e o universo fica
  const velho = JSON.stringify({ pesos: { pvp: 20, dy: 25, regularidade: 15, rendimento: 10, liquidez: 10, cotistas: 10, carteira: 15 }, universo: "meus", atualizado: "2026-11-05T10:00:00Z" });
  env.DB.db.prepare("UPDATE docs SET data = ? WHERE collection = ? AND id = 'reinvestir'").run(velho, "prefs/" + email);
  r = await chamar("GET", "reinvestir");
  assert.equal(r.j.universo, "meus"); assert.equal(r.j.pesos.equilibrio, 15); assert.ok(!("carteira" in r.j.pesos)); assert.deepEqual(r.j.tetos, TETOS_PADRAO);
  assert.equal(env.DB.db.prepare("SELECT data FROM docs WHERE collection = ? AND id = 'reinvestir'").get("prefs/" + email).data, velho);
  // retrato dos FIIs da carteira: segmentos somam 100%
  assert.ok(r.j.fiis.total > 0); perto(r.j.fiis.porSegmento.reduce((s, x) => s + x.pct, 0), 100, 1e-9);
  assert.ok(r.j.fiis.maiorPapel && r.j.fiis.maiorPapel.pct > 0);
  assert.equal((await chamar("DELETE", "reinvestir")).status, 405);
  for (const x of r.j.top) for (const c of x.criterios) assert.doesNotMatch(c.nota, PROIBIDO);
});

test("aporte simulado: muda rendaAporte e o equilíbrio, sem mexer no sugerido", () => {
  const base = reinvestir({ b3, fiiResumo, mercado: MERCADO, posicoes: POS, patrimonio: 19200, aporteMeta: 500, universo: "meus" });
  const sim = reinvestir({ b3, fiiResumo, mercado: MERCADO, posicoes: POS, patrimonio: 19200, aporte: { valor: 20000, origem: "simulado" }, sugerido: { valor: 500, origem: "meta" }, universo: "meus" });
  assert.deepEqual(sim.aporte, { valor: 20000, origem: "simulado" }); assert.deepEqual(sim.sugerido, { valor: 500, origem: "meta" });
  const b = base.top.find((x) => x.t === "PASB11"), s = sim.top.find((x) => x.t === "PASB11");
  assert.ok(Math.abs(s.rendaAporte - (20000 * s.dy) / 100 / 12) < 0.5, "dy da linha vem arredondado");
  assert.ok(s.rendaAporte > b.rendaAporte * 39);
  // PASB11: 900 de 19.000 em FIIs; com 500 fica em 7,2% (máximo); com 20.000 fica em 53,6% (zero)
  const cb = b.criterios.find((c) => c.id === "equilibrio"), cs = s.criterios.find((c) => c.id === "equilibrio");
  assert.equal(cb.pontos, 25); assert.equal(cs.pontos, 0); assert.ok(cs.valor > 50);
  assert.deepEqual(s.efeito, { papelAntes: 4.7, papelDepois: 53.6, cotas: { antes: 100, compra: 2222, depois: 2322 }, segmentoAntes: 4.7, segmentoDepois: 53.6 });
  assert.ok(s.pontos < b.pontos);
  // aporte zero vale: renda zero e o peso de hoje
  const zero = reinvestir({ b3, fiiResumo, mercado: MERCADO, posicoes: POS, patrimonio: 19200, aporte: { valor: 0, origem: "simulado" }, universo: "meus" });
  const z = zero.top.find((x) => x.t === "PASB11");
  assert.equal(z.rendaAporte, 0); assert.equal(z.criterios.find((c) => c.id === "equilibrio").nota, "dentro dos tetos: papel 5%, segmento 5%");
  assert.deepEqual(zero.divisao, { itens: [], sobra: 0, lote: 1 });
});

test("aporte sugerido: Meta, média de 3 meses fechados, padrão; aporte da URL", () => {
  const fluxo = (o) => ({ fluxoMes: new Map(Object.entries(o)) });
  assert.deepEqual(aporteSugerido({ aporte: 1500 }, fluxo({ "2026-10": { compras: 9000, vendas: 0 } }), "2026-11-05"), { valor: 1500, origem: "meta" });
  // agosto, setembro e outubro; novembro (pela metade) fica fora
  const f = fluxo({ "2026-08": { compras: 1000, vendas: 0 }, "2026-09": { compras: 2500, vendas: 500 }, "2026-10": { compras: 0, vendas: 0 }, "2026-11": { compras: 50000, vendas: 0 } });
  assert.deepEqual(aporteSugerido({ aporte: 0 }, f, "2026-11-05"), { valor: 1000, origem: "media3" });
  assert.deepEqual(aporteSugerido(null, fluxo({ "2026-09": { compras: 100, vendas: 0 } }), "2026-11-05"), { valor: 33.33, origem: "media3" });
  assert.deepEqual(aporteSugerido(null, fluxo({ "2026-10": { compras: 100, vendas: 900 } }), "2026-11-05"), { valor: APORTE_PADRAO, origem: "padrao" }, "média negativa");
  assert.deepEqual(aporteSugerido(null, null, "2026-11-05"), { valor: APORTE_PADRAO, origem: "padrao" });
  // janeiro olha para outubro, novembro e dezembro do ano anterior
  assert.equal(aporteSugerido(null, fluxo({ "2025-10": { compras: 300, vendas: 0 } }), "2026-01-10").origem, "media3");
  assert.equal(aporteDaUrl("2500"), 2500); assert.equal(aporteDaUrl("0"), 0); assert.equal(aporteDaUrl("1234.5"), 1234.5); assert.equal(aporteDaUrl("10000000"), 10000000);
  for (const x of [null, "", "-5", "10000001", "abc", "1e5", "1.234,50", "Infinity", "NaN", "12.345"]) assert.equal(aporteDaUrl(x), null, x);
});

test("rota /api/carteira/reinvestir com aporte na URL: simulado, origem e cache por aporte", async () => {
  const env = { DB: d1Falso(), CARTEIRA_KEY: Buffer.alloc(32, 9).toString("base64") };
  const ins = env.DB.db.prepare("INSERT INTO docs (collection, id, data) VALUES ('meta', ?, ?)");
  ins.run("b3", JSON.stringify({ ...b3, acoes: FC.b3.acoes, fiis: [...FC.b3.fiis.map((x) => ({ ...x, vol: 50000 })), ...b3.fiis] }));
  ins.run("fii-resumo", JSON.stringify({ ...fiiResumo, fundos: { ...fiiResumo.fundos, ...FC.fiiResumo.fundos } }));
  ins.run("mercado", JSON.stringify(MERCADO));
  const esp = espelhoFalso();
  const email = "ap@x.com";
  const chamar = async (metodo, caminho, corpo, limpar = true) => {
    if (limpar) limparCacheCarteira(email);
    const r = await rotaCarteira(new Request("https://x/api/carteira/" + caminho, { method: metodo, headers: { "content-type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), env, { email }, caminho.split("?")[0], { ...esp, hoje: "2026-11-05" });
    return { status: r.status, j: await r.json() };
  };
  // sem carteira e sem Meta: padrão
  let r = await chamar("GET", "reinvestir");
  assert.deepEqual(r.j.aporte, { valor: 1000, origem: "padrao" }); assert.deepEqual(r.j.sugerido, r.j.aporte);
  // carteira com compras em agosto, setembro e outubro de 2026: média de 3 meses
  const arqs = FC.arquivos();
  arqs[0] = { ...arqs[0], linhas: [...arqs[0].linhas, ["10/08/2026", "Compra", "Mercado à Vista", "-", FC.XP, "QRST11", 10, 110, 1100], ["10/09/2026", "Compra", "Mercado à Vista", "-", FC.XP, "QRST11", 10, 110, 1100], ["12/10/2026", "Compra", "Mercado à Vista", "-", FC.XP, "UVWX11", 100, 9, 900]] };
  assert.equal((await chamar("POST", "importar", { arquivos: arqs })).j.gravado, true);
  r = await chamar("GET", "reinvestir");
  assert.deepEqual(r.j.aporte, { valor: 1033.33, origem: "media3" });
  const base = r.j;
  // com a Meta: o da Meta
  assert.equal((await chamar("PUT", "meta", { alvo: 3000, aporte: 1500, yield: null, reinvestir: true })).status, 200);
  r = await chamar("GET", "reinvestir");
  assert.deepEqual(r.j.aporte, { valor: 1500, origem: "meta" });
  const meta = r.j;
  // aporte na URL: simulado; rendaAporte e o critério carteira mudam; o sugerido segue o da Meta e nada é gravado
  r = await chamar("GET", "reinvestir?universo=todos&aporte=30000");
  assert.equal(r.status, 200);
  assert.deepEqual(r.j.aporte, { valor: 30000, origem: "simulado" }); assert.deepEqual(r.j.sugerido, { valor: 1500, origem: "meta" });
  const x = r.j.top[0], x0 = meta.top.find((y) => y.t === x.t) || base.top.find((y) => y.t === x.t);
  assert.ok(Math.abs(x.rendaAporte - (30000 * x.dy) / 100 / 12) < 0.5);
  if (x0) assert.notEqual(x.rendaAporte, x0.rendaAporte);
  for (const y of r.j.top) assert.ok(y.efeito.papelDepois > y.efeito.papelAntes && y.criterios.find((c) => c.id === "equilibrio").valor === y.efeito.papelDepois);
  // compras de agosto a outubro no extrato: QRST11 (2.200) e UVWX11 (900) entram na parte de compras recentes
  assert.equal(r.j.compras.desde, "2026-08");
  const soma = r.j.divisao.itens.reduce((t, y) => t + y.valor, 0);
  perto(Math.round((soma + r.j.divisao.sobra) * 100) / 100, 30000, 1e-6);
  const linhas = () => env.DB.db.prepare("SELECT collection, id, atualizado FROM docs ORDER BY collection, id").all();
  const antes = JSON.stringify(linhas());
  await chamar("GET", "reinvestir?aporte=777");
  assert.equal(JSON.stringify(linhas()), antes, "simular não grava nada");
  // só o peso na carteira, universo só os meus: os FIIs da carteira entram e a pontuação muda com o aporte
  // (o PUT com `carteira`, de uma aba aberta antes da troca, vale como equilíbrio)
  assert.equal((await chamar("PUT", "reinvestir", { pesos: { pvp: 0, dy: 0, regularidade: 0, rendimento: 0, liquidez: 0, cotistas: 0, carteira: 50 }, universo: "meus" })).status, 200);
  const m0 = (await chamar("GET", "reinvestir")).j, m1 = (await chamar("GET", "reinvestir?aporte=50000")).j;
  assert.equal(m0.universo, "meus"); assert.ok(m0.top.length >= 1); assert.equal(m0.pesos.equilibrio, 50);
  const kc = (x) => x.criterios.find((c) => c.id === "equilibrio");
  for (const q0 of m0.top) { const q1 = m1.top.find((y) => y.t === q0.t); assert.ok(kc(q1).valor > kc(q0).valor, `${q0.t}: peso depois do aporte ${kc(q0).valor} -> ${kc(q1).valor}`); }
  const menor = m0.top.reduce((a, b) => (kc(b).valor < kc(a).valor ? b : a));
  const q1 = m1.top.find((y) => y.t === menor.t), k1 = kc(q1);
  assert.ok(q1.pontos < menor.pontos, `${menor.t}: pontos ${menor.pontos} -> ${q1.pontos}`);
  assert.match(k1.nota, /acima do teto/);
  // aporte inválido: cai no sugerido (sem erro)
  for (const q of ["-10", "abc", "20000000", "1,5"]) {
    r = await chamar("GET", "reinvestir?aporte=" + encodeURIComponent(q));
    assert.equal(r.status, 200, q); assert.deepEqual(r.j.aporte, { valor: 1500, origem: "meta" }, q);
  }
  // cache por pessoa, universo e aporte: um aporte novo não sai do cache do anterior
  await chamar("GET", "reinvestir?aporte=2000");
  const c1 = await chamar("GET", "reinvestir?aporte=3000", undefined, false);
  assert.equal(c1.j.aporte.valor, 3000);
  const c2 = await chamar("GET", "reinvestir?aporte=2000", undefined, false);
  assert.equal(c2.j.aporte.valor, 2000);
  for (const y of c1.j.top) for (const c of y.criterios) assert.doesNotMatch(c.nota, PROIBIDO);
});

test("abaixo do que pagou: só para quem tem o papel, na régua do limite de compra (0 antes, 0,6 no limite, 1 no dobro)", async () => {
  const { parcialAbaixo, notaAbaixo } = await import("../src/pontuacao-fii.js");
  assert.equal(parcialAbaixo(10, null), null); assert.equal(parcialAbaixo(null, 10), null);
  // acima do preço médio, no preço médio e caindo menos que o limite de 10%: zero
  assert.equal(parcialAbaixo(11, 10), 0); assert.equal(parcialAbaixo(10, 10), 0); assert.equal(parcialAbaixo(9.01, 10), 0);
  // no limite (−10%) = 0,6; −15% = 0,8; −20% (o dobro) = 1; mais que o dobro continua 1
  perto(parcialAbaixo(9, 10), 0.6, 1e-6); perto(parcialAbaixo(8.5, 10), 0.8, 1e-6); assert.equal(parcialAbaixo(8, 10), 1); assert.equal(parcialAbaixo(5, 10), 1);
  // limite da pessoa em 5%: −5% = 0,6, −10% = 1; limite inválido cai no padrão
  perto(parcialAbaixo(9.5, 10, 5), 0.6, 1e-6); assert.equal(parcialAbaixo(9, 10, 5), 1); assert.equal(parcialAbaixo(9.5, 10, 5.5), 0);
  assert.equal(notaAbaixo(8.54, 9.12), "cotação R$ 8,54, seu preço médio R$ 9,12: 6,4% abaixo, falta 3,6 para o seu limite de 10%");
  assert.equal(notaAbaixo(8, 9.12), "cotação R$ 8,00, seu preço médio R$ 9,12: 12,3% abaixo, passou do seu limite de 10%");
  assert.equal(notaAbaixo(9, 10), "cotação R$ 9,00, seu preço médio R$ 10,00: 10,0% abaixo, no seu limite de 10%");
  assert.equal(notaAbaixo(9.49, 9.12), "cotação R$ 9,49: 4,1% acima do seu preço médio (R$ 9,12)");
  assert.match(notaAbaixo(9.5, 10, 5), /no seu limite de 5%/);
  assert.match(notaAbaixo(10, null), /não tem este papel/);
  // dois papéis iguais em tudo: o que caiu 20% do preço médio passa o que está acima, e quem não tem fica no meio
  const l = [cheia("AAAA11", { preco: 8 }), cheia("BBBB11", { preco: 8 }), cheia("CCCC11", { preco: 8 }), cheia("DDDD11", { preco: 8 })];
  const r = pontuar(l, { cdi: 11, pm: { AAAA11: 10, BBBB11: 7.6, DDDD11: 8.5 } });
  const p = Object.fromEntries(r.avaliados.map((x) => [x.t, x]));
  assert.equal(p.AAAA11.pontos, 100); assert.equal(p.CCCC11.pontos, 100);
  // BBBB11 5,3% acima: abaixo zera (25 de 125); DDDD11 5,9% abaixo, antes do limite: também zera
  assert.equal(p.BBBB11.pontos, 80); assert.equal(p.DDDD11.pontos, 80);
  assert.deepEqual(p.CCCC11.faltando, []);
  assert.equal(p.CCCC11.criterios.find((c) => c.id === "abaixo").naoSeAplica, true);
  assert.equal(p.AAAA11.criterios.find((c) => c.id === "abaixo").pontos, 25);
  // com limite de compra em 5%: DDDD11 (−5,9%) já pontua
  const r5 = pontuar(l, { cdi: 11, pm: { DDDD11: 8.5 }, limites: { compra: 5 } });
  assert.ok(r5.avaliados.find((x) => x.t === "DDDD11").criterios.find((c) => c.id === "abaixo").pontos > 15);
  // peso zero tira o critério
  assert.ok(!pontuar(l, { cdi: 11, pm: { AAAA11: 10 }, pesos: { abaixo: 0 } }).avaliados[0].criterios.some((c) => c.id === "abaixo"));
  for (const x of [notaAbaixo(8.54, 9.12), notaAbaixo(8, 9.12), notaAbaixo(9.49, 9.12)]) assert.doesNotMatch(x, PROIBIDO);
});
