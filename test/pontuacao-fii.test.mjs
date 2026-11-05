// Reinvestir: pontuação de FIIs (src/pontuacao-fii.js), validação dos pesos (src/prefs.js) e a rota
// /api/carteira/reinvestir com o D1 falso. Papéis e números inventados (test/fixtures-radar.mjs e test/fixtures-carteira.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import {
  parcialPvp, parcialDy, parcialRegularidade, parcialRendimento, parcialLiquidez, parcialCotistas, parcialCarteira,
  pontuar, linhasUniverso, reinvestir, PESOS_PADRAO, CRITERIOS, APORTE_PADRAO,
} from "../src/pontuacao-fii.js";
import { validarReinvestir, respostaReinvestir } from "../src/prefs.js";
import { rotaCarteira, limparCacheCarteira } from "../src/carteira.js";
import { d1Falso, espelhoFalso } from "./d1-falso.mjs";
import { fiiResumo, b3 } from "./fixtures-radar.mjs";
import * as FC from "./fixtures-carteira.mjs";

const perto = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const PROIBIDO = /\b(melhor|melhores|oportunidade|oportunidades|barato|baratos|barata|recomendad[oa]s?|recomenda[çc][ãa]o|recomendo|compre|ticker)\b/i;

test("P/VP nos limites da faixa", () => {
  for (const v of [0.85, 0.9, 1]) assert.equal(parcialPvp(v), 1);
  perto(parcialPvp(1.125), 0.5); assert.equal(parcialPvp(1.25), 0); assert.equal(parcialPvp(1.6), 0);
  perto(parcialPvp(0.7), 0.4); assert.equal(parcialPvp(0.6), 0); assert.equal(parcialPvp(0.3), 0);
  assert.equal(parcialPvp(null), null); assert.equal(parcialPvp(0), null);
});

test("DY sobre o CDI, regularidade, rendimento, liquidez, cotistas e carteira nos limites", () => {
  assert.equal(parcialDy(10, 11), 0); assert.equal(parcialDy(11, 11), 0); perto(parcialDy(13, 11), 0.5); assert.equal(parcialDy(15, 11), 1); assert.equal(parcialDy(20, 11), 1);
  assert.equal(parcialDy(12, null), null); assert.equal(parcialDy(null, 11), null);
  assert.deepEqual([12, 11, 10, 9, 0].map(parcialRegularidade), [1, 0.7, 0.4, 0, 0]); assert.equal(parcialRegularidade(null), null);
  assert.equal(parcialRendimento(0.1, 0.1), 1); assert.equal(parcialRendimento(0.12, 0.1), 1); perto(parcialRendimento(0.085, 0.1), 0.5); assert.equal(parcialRendimento(0.07, 0.1), 0); assert.equal(parcialRendimento(0.05, 0.1), 0);
  assert.equal(parcialRendimento(0.1, 0), null); assert.equal(parcialRendimento(null, 0.1), null);
  assert.equal(parcialLiquidez(1e6), 1); assert.equal(parcialLiquidez(5e6), 1); perto(parcialLiquidez(2e5), 0.2); perto(parcialLiquidez(6e5), 0.6); perto(parcialLiquidez(1e5), 0.1); assert.equal(parcialLiquidez(99999), 0); assert.equal(parcialLiquidez(null), null);
  assert.equal(parcialCotistas(1e5), 1); assert.equal(parcialCotistas(5e5), 1); perto(parcialCotistas(1e4), 0.3); perto(parcialCotistas(Math.sqrt(1e9)), 0.65); assert.equal(parcialCotistas(1000), 0); assert.equal(parcialCotistas(null), null);
  assert.equal(parcialCarteira(0.5, false), 1); assert.equal(parcialCarteira(0.1, true), 1); perto(parcialCarteira(0.2, true), 0.5); perto(parcialCarteira(0.3, true), 0); assert.equal(parcialCarteira(0.45, true), 0);
});

// Uma linha no formato do Radar com tudo na faixa máxima
const cheia = (t, extra = {}) => ({ t, nome: "FUNDO " + t, seg: "Logística", preco: 9, pvp: 0.95, dy: 16, pg: 12, m12: 12, rend: 0.12, media: 0.12, liq: 2e6, cot: 2e5, temCvm: true, ...extra });

test("pontos: soma ponderada sobre os critérios com dado, faltando e exclusão", () => {
  const r = pontuar([cheia("AAAA11"), cheia("BBBB11", { pvp: 1.125, liq: null }), cheia("CCCC11", { pvp: null, liq: null, cot: null }), cheia("DDDD11", { dy: 13 })], { cdi: 11, carteira: { porPapel: {}, total: 0 } });
  const a = r.avaliados.find((x) => x.t === "AAAA11");
  assert.equal(a.pontos, 100); assert.deepEqual(a.faltando, []);
  assert.equal(a.criterios.length, CRITERIOS.length);
  assert.ok(a.criterios.every((c) => c.max === PESOS_PADRAO[c.id] && c.pontos === c.max));
  // B: P/VP vale metade (10 de 20) e liquidez fica de fora da conta: (100 − 10 − 10) / 90
  const b = r.avaliados.find((x) => x.t === "BBBB11");
  assert.deepEqual(b.faltando, ["liquidez"]);
  assert.equal(b.pontos, Math.round((80 / 90) * 100));
  assert.equal(b.criterios.find((c) => c.id === "liquidez").pontos, null);
  // C: três critérios sem dado, fora
  assert.deepEqual(r.excluidos, [{ t: "CCCC11", faltando: ["pvp", "liquidez", "cotistas"] }]);
  // D: DY 2 pontos acima do CDI = metade dos 25
  assert.equal(r.avaliados.find((x) => x.t === "DDDD11").pontos, Math.round(((100 - 12.5) / 100) * 100));
  // ordem: maior para o menor (B 89, D 88)
  assert.deepEqual(r.avaliados.map((x) => x.t), ["AAAA11", "BBBB11", "DDDD11"]);
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

test("carteira: peso depois do aporte, quem não tem fica com o máximo", () => {
  const l = [cheia("TENH11"), cheia("NAOT11")];
  // 18.000 de 20.000; com R$ 2.000 de aporte: 20.000 / 22.000 = 90,9% => 0
  const r = pontuar(l, { cdi: 11, aporte: 2000, carteira: { porPapel: { TENH11: 18000 }, total: 20000 } });
  const t = r.avaliados.find((x) => x.t === "TENH11"), n = r.avaliados.find((x) => x.t === "NAOT11");
  assert.equal(t.criterios.find((c) => c.id === "carteira").pontos, 0);
  assert.equal(t.criterios.find((c) => c.id === "carteira").valor, 90.91);
  assert.deepEqual(t.tenho, { valor: 18000, pct: 90 });
  assert.equal(n.criterios.find((c) => c.id === "carteira").pontos, 10);
  assert.equal(n.tenho, null);
  assert.equal(t.pontos, 90); assert.equal(r.avaliados[0].t, "NAOT11");
  // 1.000 de 20.000 com 1.000 de aporte = 2.000 / 21.000 = 9,5% => máximo
  const p = pontuar([cheia("TENH11")], { cdi: 11, aporte: 1000, carteira: { porPapel: { TENH11: 1000 }, total: 20000 } });
  assert.equal(p.avaliados[0].criterios.find((c) => c.id === "carteira").pontos, 10);
});

test("notas: frases curtas e sem palavras proibidas", () => {
  const r = pontuar([cheia("AAAA11", { pvp: 0.92, pg: 11, rend: 0.1, media: 0.12 }), cheia("BBBB11", { pvp: 0.75, m12: 8, pg: 8 }), cheia("CCCC11", { pvp: 1.3, dy: 9 })], { cdi: 11, carteira: { porPapel: { AAAA11: 500 }, total: 5000 } });
  const nota = (t, id) => r.avaliados.find((x) => x.t === t).criterios.find((c) => c.id === id).nota;
  assert.equal(nota("AAAA11", "pvp"), "P/VP 0,92: dentro da faixa de 0,85 a 1,00");
  assert.equal(nota("AAAA11", "regularidade"), "11 pagamentos em 12 meses");
  assert.match(nota("AAAA11", "rendimento"), /17% abaixo/);
  assert.match(nota("AAAA11", "carteira"), /ficaria em 25,0% da carteira/);
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
  assert.equal(r.aporte, 500); assert.equal(r.aporteOrigem, "meta"); assert.equal(r.cdi, 11);
  assert.ok(r.top.every((x) => x.tenho));
  assert.equal(r.top[0].t, "PASB11", "TENH11 perde os pontos de peso na carteira");
});

test("reinvestir com o universo todos: 5 primeiros, total, excluídos e ordenação", () => {
  const r = reinvestir({ b3, fiiResumo, mercado: MERCADO, posicoes: POS, patrimonio: 19200, universo: "todos" });
  assert.equal(r.top.length, 5);
  assert.equal(r.aporteOrigem, "padrao"); assert.equal(r.aporte, 1000);
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
  assert.deepEqual(validarReinvestir({ pesos: { pvp: 30 }, universo: "meus" }).reinvestir, { pesos: { ...PESOS_PADRAO, pvp: 30 }, universo: "meus" });
  assert.match(validarReinvestir({ pesos: { pvp: 51 } }).erro, /0 a 50/);
  assert.match(validarReinvestir({ pesos: { pvp: 2.5 } }).erro, /inteiro/);
  assert.match(validarReinvestir({ pesos: { pvp: -1 } }).erro, /inteiro/);
  assert.match(validarReinvestir({ pesos: { vacancia: 10 } }).erro, /desconhecido/);
  assert.match(validarReinvestir({ universo: "alguns" }).erro, /Universo/);
  assert.match(validarReinvestir({ pesos: Object.fromEntries(Object.keys(PESOS_PADRAO).map((k) => [k, 0])) }).erro, /pelo menos um/);
  assert.equal(validarReinvestir({ outro: 1 }).erro, "campo outro");
  assert.deepEqual(respostaReinvestir(null), { pesos: PESOS_PADRAO, universo: "todos", salvo: false });
  assert.deepEqual(respostaReinvestir({ pesos: { pvp: 999 } }), { pesos: PESOS_PADRAO, universo: "todos", salvo: false });
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
  assert.equal((await chamar("POST", "importar", { arquivos: FC.arquivos() })).j.gravado, true);
  r = await chamar("GET", "reinvestir?universo=meus");
  assert.equal(r.j.vazia, false); assert.equal(r.j.universo, "meus");
  // FIIs da carteira: QRST11, UVWX11 e YZAB11 têm dado da CVM só com nome e rendimento: sem P/VP, DY nem cotistas => fora
  assert.equal(r.j.total, 0); assert.equal(r.j.excluidos, 3);
  assert.equal((await chamar("GET", "reinvestir?universo=alguns")).status, 400);
  // PUT: valida, grava em prefs/<email> e passa a valer no GET sem universo
  assert.equal((await chamar("PUT", "reinvestir", { pesos: { pvp: 60 } })).status, 400);
  assert.equal((await chamar("PUT", "reinvestir", "x".repeat(2100))).status, 413);
  const put = await chamar("PUT", "reinvestir", { pesos: { pvp: 0, carteira: 25 }, universo: "todos" });
  assert.equal(put.status, 200); assert.equal(put.j.pesos.pvp, 0); assert.equal(put.j.pesos.carteira, 25);
  const linha = env.DB.db.prepare("SELECT data FROM docs WHERE collection = ? AND id = 'reinvestir'").get("prefs/" + email);
  assert.deepEqual(JSON.parse(linha.data).pesos, { ...PESOS_PADRAO, pvp: 0, carteira: 25 });
  assert.ok(esp.gravados.some((x) => x.collection === "prefs/" + email && x.id === "reinvestir"));
  r = await chamar("GET", "reinvestir");
  assert.equal(r.j.salvo, true); assert.equal(r.j.pesos.pvp, 0); assert.equal(r.j.universo, "todos");
  assert.ok(r.j.top.every((x) => !x.criterios.some((c) => c.id === "pvp")));
  // cache de 60 s por pessoa: uma gravação por fora não aparece até limpar
  env.DB.db.prepare("UPDATE docs SET data = ? WHERE collection = ? AND id = 'reinvestir'").run(JSON.stringify({ pesos: PESOS_PADRAO, universo: "todos" }), "prefs/" + email);
  r = await chamar("GET", "reinvestir", undefined, false);
  assert.equal(r.j.pesos.pvp, 0);
  r = await chamar("GET", "reinvestir");
  assert.equal(r.j.pesos.pvp, 20);
  assert.equal((await chamar("DELETE", "reinvestir")).status, 405);
  for (const x of r.j.top) for (const c of x.criterios) assert.doesNotMatch(c.nota, PROIBIDO);
});
