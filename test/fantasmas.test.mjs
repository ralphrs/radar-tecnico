// Posições fantasmas (pedido de 10/11): day trade com a venda listada antes da compra, resgate da posição inteira,
// incorporação de fundo, cotas que aparecem em custódia sem origem e a varredura de papéis parados.
// Papéis, datas e números inventados aqui; nenhum dado real de extrato.
import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import { mesclar, calcular, validarAjuste, rotaCarteira, limparCacheCarteira } from "../src/carteira.js";
import { d1Falso, espelhoFalso } from "./d1-falso.mjs";
import { conferirLotes } from "./fixtures-carteira.mjs";

const HOJE = "2026-11-10";
const XP = "XP INVESTIMENTOS CCTVM S/A", RICO = "RICO INVESTIMENTOS - GRUPO XP";
const br = (iso) => iso.split("-").reverse().join("/");
const perto = (a, b, eps = 0.006) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const mais2 = (d) => { const x = new Date(d + "T12:00:00Z"); let n = 2; while (n) { x.setUTCDate(x.getUTCDate() + 1); if (x.getUTCDay() % 6) n--; } return x.toISOString().slice(0, 10); };
// negs: [data, C|V, papel, q, preço, corretora]; movs: [C|D, data, tipo como a B3 escreve, papel, q, preço|null, corretora].
// Cada negócio ganha a liquidação dois dias úteis depois, salvo semLiq. cot: papel -> preço (ação); fiis: papel -> preço
// ou null (FII sem cotação, só no informe da CVM).
function arquivosDe(negs, movs = [], { semLiq = false, prov = [] } = {}) {
  const neg = negs.map(([d, cv, t, q, p, c]) => [br(d), cv === "C" ? "Compra" : "Venda", "Mercado à Vista", "-", c, t, q, p, q * p]);
  const mv = [
    ...(semLiq ? [] : negs.map(([d, cv, t, q, p, c]) => [cv === "C" ? "Credito" : "Debito", br(mais2(d)), "Transferência - Liquidação", t + " - FUNDO", c, q, p, q * p])),
    ...movs.map(([es, d, tipo, t, q, p, c]) => [es === "C" ? "Credito" : "Debito", br(d), tipo, t + " - FUNDO", c, q, p ?? "-", p != null ? q * p : "-"]),
  ];
  const arqs = [];
  if (neg.length) arqs.push({ nome: "n", tipo: "negociacao", linhas: neg });
  if (mv.length) arqs.push({ nome: "m", tipo: "movimentacao", linhas: mv });
  if (prov.length) arqs.push({ nome: "p", tipo: "proventos", linhas: prov.map(([t, d, tipo, c, q, pc, liq]) => [t + " - FUNDO", br(d), tipo, c, String(q), pc, liq]) });
  return arqs;
}
function montar(negs, movs = [], { cot = {}, fiis = {}, ajustes = [], semLiq = false, prov = [] } = {}) {
  const m = mesclar(null, arquivosDe(negs, movs, { semLiq, prov }), "x");
  const importacoes = { lista: [{ id: "x", arquivos: m.porArquivo.map((a) => ({ tipo: a.tipo, de: a.de, ate: a.ate })) }] };
  const b3 = { acoes: Object.entries(cot).map(([t, preco]) => ({ t, preco })), fiis: Object.entries(fiis).filter(([, p]) => p != null).map(([t, preco]) => ({ t, preco })), etfs: [], bdrs: [] };
  const fundos = Object.fromEntries(Object.keys(fiis).map((t) => [t, { n: "FUNDO " + t, s: "Outros" }]));
  const c = calcular(m.extrato, { b3, fiiResumo: { fundos }, importacoes, ajustes, hoje: HOJE });
  return { c, ex: m.extrato };
}
const pos = (c, t) => c.posicoes.find((p) => p.t === t) || c.resumo.encerradas.find((p) => p.t === t);
const aberta = (c, t) => c.posicoes.find((p) => p.t === t);
const ids = (p) => p.situacoes.map((s) => s.id);
const sitDe = (p, id) => p.situacoes.filter((s) => s.id === id);
const corr = (p, inst) => p.porCorretora.find((x) => x.inst === inst);
// As invariantes de sempre: desde o começo somado = total da carteira; lotes fecham; por corretora = consolidado (com a
// tolerância da fração que sai, quando dita)
function invariantes(c, tolFracao = {}) {
  const todos = [...c.posicoes, ...c.resumo.encerradas];
  perto(todos.reduce((s, p) => s + p.geral.resultado, 0), c.resumo.total.ganho, 0.05);
  assert.deepEqual(conferirLotes(c), []);
  for (const p of todos) {
    const porCorr = p.porCorretora.reduce((s, x) => s + (x.resultado || 0) + x.realizado, 0);
    const consolidado = p.q != null ? (p.resultado ?? 0) + p.realizado : p.resultado; // encerrada: o resultado já é o realizado
    assert.ok(Math.abs(porCorr - consolidado) <= (tolFracao[p.t] || 0) + 0.02, `${p.t}: por corretora ${porCorr} x ${consolidado}`);
  }
}

// ---------- 1. day trade ----------

test("day trade com a venda listada antes da compra: resultado do dia, posição zero, sem venda sem origem", () => {
  for (const semLiq of [false, true]) {
    const { c } = montar([["2025-06-10", "V", "DTRA3", 200, 5.12, XP], ["2025-06-10", "C", "DTRA3", 200, 5.18, XP]], [], { cot: { DTRA3: 5.3 }, semLiq });
    assert.equal(aberta(c, "DTRA3"), undefined, "nenhuma posição aberta");
    const p = pos(c, "DTRA3");
    perto(p.resultado, -12);
    assert.deepEqual(ids(p), ["day-trade"]);
    assert.equal(sitDe(p, "day-trade")[0].grave, false);
    assert.equal(sitDe(p, "day-trade")[0].texto, "Day trade em 10/06/2025 na XP: 200 ações compradas a R$ 5,18 e vendidas a R$ 5,12 no mesmo dia, resultado de −R$ 12,00.");
    // por lote e por corretora dão o mesmo
    perto(p.fifo.realizado, -12); perto(corr(p, "XP").realizado, -12);
    assert.equal(p.vendas[0].dayTrade, true);
    assert.deepEqual(c.resumo.avisos, []);
    perto(c.resumo.realizado.total, -12); assert.equal(c.resumo.saidas.vendas.n, 1);
    invariantes(c);
  }
});

test("day trade com várias compras e vendas no dia: casa pelo preço médio de cada lado", () => {
  const { c } = montar([["2025-06-10", "C", "DTRB3", 100, 10, XP], ["2025-06-10", "V", "DTRB3", 150, 11, XP], ["2025-06-10", "C", "DTRB3", 100, 12, XP], ["2025-06-10", "V", "DTRB3", 50, 12.5, XP]], [], { cot: { DTRB3: 12 } });
  assert.equal(aberta(c, "DTRB3"), undefined);
  const p = pos(c, "DTRB3");
  perto(p.resultado, 200 * ((150 * 11 + 50 * 12.5) / 200 - 11)); // 75
  perto(p.fifo.realizado, 75); perto(corr(p, "XP").realizado, 75);
  assert.equal(sitDe(p, "day-trade")[0].dados.q, 200);
  invariantes(c);
});

test("day trade com posição anterior: primeiro casa o do dia; o que sobra de venda baixa da posição antiga pelo preço médio", () => {
  const negs = [["2025-01-10", "C", "DTRC3", 100, 8, XP], ["2025-06-10", "V", "DTRC3", 150, 11, XP], ["2025-06-10", "C", "DTRC3", 100, 10, XP]];
  const { c } = montar(negs, [], { cot: { DTRC3: 11 } });
  const p = aberta(c, "DTRC3");
  assert.equal(p.q, 50);
  perto(p.pm, 8, 1e-9); // a posição de antes não se mistura com a compra do dia
  perto(p.realizado, 100 * (11 - 10) + 50 * (11 - 8)); // 100 do day trade + 150 da venda normal
  perto(p.fifo.realizado, 250); perto(corr(p, "XP").realizado, 250);
  assert.deepEqual(p.lotes.map((l) => [l.d, l.q, l.preco, l.origem]), [["2025-01-10", 50, 8, "compra"]]);
  const v = p.vendas.map((x) => [x.q, x.resultado, !!x.dayTrade]);
  assert.deepEqual(v, [[100, 100, true], [50, 150, false]]);
  // compra de sobra no dia entra pelo preço médio das compras do dia
  const { c: c2 } = montar([["2025-01-10", "C", "DTRD3", 100, 8, XP], ["2025-06-10", "V", "DTRD3", 50, 11, XP], ["2025-06-10", "C", "DTRD3", 80, 10, XP]], [], { cot: { DTRD3: 11 } });
  const p2 = aberta(c2, "DTRD3");
  assert.equal(p2.q, 130); perto(p2.realizado, 50); perto(p2.pm, (800 + 30 * 10) / 130, 1e-6);
  perto(p2.fifo.realizado, 50);
  // compra numa corretora e venda noutra no mesmo dia não é day trade, mas a compra entra antes
  const { c: c3 } = montar([["2025-06-10", "V", "DTRE3", 100, 11, RICO], ["2025-06-10", "C", "DTRE3", 100, 10, XP]], [], { cot: { DTRE3: 11 }, semLiq: true });
  const p3 = pos(c3, "DTRE3");
  assert.deepEqual(ids(p3).filter((x) => x === "day-trade" || x === "venda-sem-origem"), []);
  perto(p3.resultado, 100);
  invariantes(c); invariantes(c2);
});

// ---------- 2. resgate ----------

test("resgate da posição inteira fecha o papel; sem fundo sucessor, o resgate é o que voltou e o resto é perda", () => {
  const { c } = montar([["2023-03-10", "C", "FUNA11", 150, 9.8, XP]], [["C", "2025-10-20", "Resgate", "FUNA11", 150, 0.274, XP]],
    { fiis: { FUNA11: null }, prov: [["FUNA11", "2025-10-20", "Amortização", XP, 150, 0.274, 41.1]] });
  assert.equal(aberta(c, "FUNA11"), undefined, "a posição fechou");
  const p = pos(c, "FUNA11");
  perto(p.resultado, 41.1 - 1470);
  assert.equal(p.ate, "2025-10-20");
  assert.deepEqual(ids(p), ["resgate-total"]);
  const s = sitDe(p, "resgate-total")[0];
  assert.equal(s.grave, true);
  assert.equal(s.texto, "150 cotas resgatadas na XP em 20/10/2025 a R$ 0,274 (R$ 41,10) e a posição fechou. Confira se o fundo foi incorporado por outro.");
  // o resgate volta como capital, não como provento (a linha igual nos proventos não conta de novo) nem como venda
  assert.equal(c.resumo.provTotal, 0);
  assert.equal(c.resumo.saidas.vendas.n, 0);
  assert.equal(c.resumo.total.resgates, 41.1);
  assert.deepEqual({ comprado: p.geral.comprado, resgate: p.geral.resgate, resultado: p.geral.resultado }, { comprado: 1470, resgate: 41.1, resultado: -1428.9 });
  perto(p.fifo.realizado, -1428.9); perto(corr(p, "XP").realizado, -1428.9);
  perto(c.resumo.realizado.total, -1428.9);
  assert.equal(c.resumo.conferencia.graves, 1);
  invariantes(c);
  // a menos de uma fração também fecha
  const { c: c2 } = montar([["2023-03-10", "C", "FUNA11", 150, 9.8, XP]], [["C", "2024-01-10", "Bonificação em Ativos", "FUNA11", 0.4, null, XP], ["C", "2025-10-20", "Resgate", "FUNA11", 150, 0.274, XP]], { fiis: { FUNA11: null } });
  assert.equal(aberta(c2, "FUNA11"), undefined);
});

test("resgate parcial continua sendo só dinheiro e não conta duas vezes com a amortização", () => {
  const { c } = montar([["2023-03-10", "C", "FUNB11", 150, 9.8, XP]], [["C", "2025-10-20", "Resgate", "FUNB11", 50, 0.3, XP], ["C", "2025-10-20", "Amortização", "FUNB11", 150, 0.1, XP]], { fiis: { FUNB11: 9 } });
  const p = aberta(c, "FUNB11");
  assert.equal(p.q, 150); perto(p.pm, 9.8, 1e-9);
  assert.deepEqual(ids(p), []);
  assert.equal(c.resumo.provTotal, 15); // só a amortização
  assert.equal(c.resumo.total.resgates, 0);
  invariantes(c);
});

// ---------- 3. incorporação ----------

// Caso A: FUNX11 (150 cotas) incorporado por FUNY11, que já tinha 80. Atualização confirma FUNX11, Atualização de FUNY11
// traz 98,64 novas, fração de 0,64 sai no dia seguinte, o resgate de FUNX11 vem 3 dias úteis depois e o leilão no fim.
const NEG_A = [["2023-03-10", "C", "FUNX11", 150, 9.8, XP], ["2024-05-10", "C", "FUNY11", 80, 95, XP]];
const MOV_A = [["C", "2025-10-15", "Atualização", "FUNX11", 150, null, XP], ["C", "2025-10-15", "Atualização", "FUNY11", 98.64, null, XP],
  ["D", "2025-10-16", "Fração em Ativos", "FUNY11", 0.64, null, XP], ["C", "2025-10-20", "Resgate", "FUNX11", 150, 0.274, XP],
  ["C", "2025-10-28", "Leilão de Fração", "FUNY11", 0.64, 96, XP]];
const casoA = (extra = {}) => montar(NEG_A, MOV_A, { fiis: { FUNX11: null, FUNY11: 100 }, ...extra });

test("incorporação, caso A: o custo de X menos o resgate vai para as cotas novas de Y; X fecha sem realizado próprio", () => {
  const { c } = casoA();
  assert.equal(aberta(c, "FUNX11"), undefined);
  const x = pos(c, "FUNX11"), y = aberta(c, "FUNY11");
  assert.equal(x.resultado, 0);
  assert.equal(x.incorporadoPor, "FUNY11"); assert.equal(x.incorporadoEm, "2025-10-15");
  assert.equal(y.q, 178);
  const custoAntes = 80 * 95 + (1470 - 41.1);
  perto(y.custo, custoAntes * 178 / 178.64, 0.01); // a fração saiu pelo preço médio
  assert.deepEqual(y.incorporou, [{ de: "FUNX11", d: "2025-10-15", q: 98.64 }]);
  const texto = "FUNX11 foi incorporado por FUNY11 em 15/10/2025: 150 cotas viraram 98,64; R$ 41,10 de resgate.";
  assert.deepEqual(sitDe(x, "incorporacao").map((s) => [s.grave, s.texto]), [[false, texto]]);
  assert.deepEqual(sitDe(y, "incorporacao").map((s) => [s.grave, s.texto]), [[false, texto]]);
  // a Atualização de FUNY11 está explicada: nada de quantidade diferente nem de custódia sem origem
  assert.deepEqual(ids(y).filter((i) => i === "quantidade-diverge" || i === "custodia-sem-origem"), []);
  assert.equal(c.resumo.conferencia.graves, 0);
  // desde o começo: X conta a compra e o resgate; Y não conta compra nova
  assert.deepEqual([x.geral.comprado, x.geral.resgate, x.geral.resultado], [1470, 41.1, -1428.9]);
  assert.equal(y.geral.comprado, 7600);
  perto(c.resumo.total.pago, 1470 + 7600);
  assert.equal(c.resumo.provTotal, 0); assert.equal(c.resumo.saidas.vendas.n, 0);
  // por lote: os lotes de X viram lotes de Y na proporção, com a data deles; a fração sai do lote incorporado
  assert.deepEqual(y.lotes.map((l) => [l.d, l.q, l.origem]), [["2023-03-10", 98, "incorporacao"], ["2024-05-10", 80, "compra"]]);
  perto(y.lotes[0].preco, 1428.9 / 98.64, 1e-6);
  perto(y.fifo.incorporado, 1428.9);
  perto(x.fifo.realizado, 0);
  // por corretora: a XP de Y recebe o custo, a de X fica zerada sem realizado
  perto(corr(x, "XP").realizado, 0); assert.equal(corr(x, "XP").q, 0);
  perto(corr(y, "XP").custo, y.custo, 0.01);
  // a diferença entre por lote e preço médio em Y é só a fração (baixada pelo lote incorporado num, pelo preço médio no outro)
  const tol = 0.64 * Math.abs(custoAntes / 178.64 - 1428.9 / 98.64);
  perto((y.resultado + y.realizado) - (y.valor - y.fifo.custo + y.fifo.realizado), tol, 0.02);
  invariantes(c);
});

test("incorporação, caso B: com recibo da raiz de Y, que vira cota depois do resgate", () => {
  const { c } = montar([["2023-08-10", "C", "FUND11", 40, 12, RICO]], [
    ["C", "2025-05-12", "Atualização", "FUNC13", 31.57, null, RICO], ["C", "2025-05-15", "Resgate", "FUND11", 40, 0.512, RICO],
    ["C", "2025-05-28", "Atualização", "FUNC11", 31.57, null, RICO], ["D", "2025-05-29", "Fração em Ativos", "FUNC11", 0.57, null, RICO],
    ["C", "2025-06-05", "Leilão de Fração", "FUNC11", 0.57, 15, RICO]], { fiis: { FUND11: null, FUNC11: 15.2 } });
  const x = pos(c, "FUND11"), y = aberta(c, "FUNC11");
  assert.equal(aberta(c, "FUND11"), undefined);
  assert.equal(x.incorporadoPor, "FUNC11");
  assert.equal(y.q, 31);
  perto(y.custo, (480 - 20.48) * 31 / 31.57, 0.01);
  const texto = "FUND11 foi incorporado por FUNC11 em 12/05/2025: 40 cotas viraram 31,57; R$ 20,48 de resgate.";
  assert.equal(sitDe(x, "incorporacao")[0].texto, texto);
  assert.equal(sitDe(y, "incorporacao")[0].texto, texto);
  assert.equal(pos(c, "FUNC13"), undefined); // o recibo não aparece como papel
  assert.deepEqual(y.lotes.map((l) => [l.d, l.q, l.origem]), [["2023-08-10", 31, "incorporacao"]]);
  perto(y.fifo.custo, y.custo, 0.01); // um lote só: por lote e preço médio dão o mesmo
  assert.equal(c.resumo.conferencia.graves, 0);
  invariantes(c);
});

test("incorporação sem candidato não adivinha: resgate-total grave; o ajuste da pessoa resolve", () => {
  // a Atualização de FUNY11 veio 25 dias depois, fora dos 10 dias úteis
  const mov = [["C", "2025-10-20", "Resgate", "FUNX11", 150, 0.274, XP], ["C", "2025-11-14", "Atualização", "FUNY11", 98.64, null, XP]];
  const { c, ex } = montar(NEG_A, mov, { fiis: { FUNX11: null, FUNY11: 100 } });
  const x = pos(c, "FUNX11");
  assert.equal(sitDe(x, "resgate-total")[0].grave, true);
  perto(x.resultado, 41.1 - 1470);
  assert.equal(x.incorporadoPor, undefined);
  // a Atualização de FUNY11 continua dando quantidade diferente
  assert.ok(ids(aberta(c, "FUNY11")).includes("quantidade-diverge"));
  // ajuste: FUNX11 foi incorporado por FUNY11 (a data é a do resgate)
  const v = validarAjuste({ tipo: "incorporacao", t: "FUNX11", para: "funy11", d: "20/10/2025" }, ex, HOJE);
  assert.deepEqual(v.ajuste, { t: "FUNX11", tipo: "incorporacao", d: "2025-10-20", q: 150, valor: null, para: "FUNY11", nota: "", inst: "" });
  const aj = [{ id: "i1", ...v.ajuste, criado: "2026-11-10T10:00:00Z" }];
  const { c: c2 } = montar(NEG_A, mov, { fiis: { FUNX11: null, FUNY11: 100 }, ajustes: aj });
  const x2 = pos(c2, "FUNX11"), y2 = aberta(c2, "FUNY11");
  assert.equal(x2.resultado, 0); assert.equal(x2.incorporadoPor, "FUNY11");
  assert.deepEqual(ids(x2), ["incorporacao"]);
  assert.equal(sitDe(x2, "incorporacao")[0].ajuste, "i1");
  assert.equal(sitDe(x2, "incorporacao")[0].texto, "FUNX11 foi incorporado por FUNY11 em 20/10/2025: 150 cotas viraram 98,64; R$ 41,10 de resgate, informado por você em 10/11.");
  assert.deepEqual(ids(y2).filter((i) => i === "quantidade-diverge"), []);
  perto(y2.custo, 7600 + 1428.9, 0.01);
  assert.equal(c2.resumo.conferencia.graves, 0);
  assert.ok(c2.ajustes[0].aplicado);
  invariantes(c2);
  // validação
  assert.match(validarAjuste({ tipo: "incorporacao", t: "FUNX11", para: "FUNY11", d: "2025-10-21" }, ex, HOJE).erro, /Não há resgate de FUNX11 em 21\/10\/2025/);
  assert.match(validarAjuste({ tipo: "incorporacao", t: "FUNX11", para: "FUNX11", d: "2025-10-20" }, ex, HOJE).erro, /outro/);
  assert.match(validarAjuste({ tipo: "incorporacao", t: "FUNX11", para: "ZZZZ11", d: "2025-10-20" }, ex, HOJE).erro, /não aparece/);
  assert.match(validarAjuste({ tipo: "incorporacao", t: "FUNX11", para: "x", d: "2025-10-20" }, ex, HOJE).erro, /código/);
});

test("ajuste de incorporação com a entrada de Y noutra corretora, e sem entrada nenhuma (o custo vai para as cotas de Y)", () => {
  // Y entrou na Rico; X saiu da XP
  const mov = [["C", "2025-10-20", "Resgate", "FUNX11", 150, 0.274, XP], ["C", "2025-10-22", "Atualização", "FUNY11", 98.64, null, RICO]];
  const aj = [{ id: "i3", t: "FUNX11", tipo: "incorporacao", d: "2025-10-20", q: 150, valor: null, para: "FUNY11", criado: "2026-11-10T10:00:00Z" }];
  const { c } = montar(NEG_A, mov, { fiis: { FUNX11: null, FUNY11: 100 }, ajustes: aj });
  const y = aberta(c, "FUNY11");
  assert.equal(y.q, 178.64);
  perto(corr(y, "Rico").custo, 1428.9); perto(corr(y, "XP").custo, 7600);
  assert.deepEqual(ids(y).filter((i) => i === "custodia-sem-origem"), []);
  invariantes(c);
  // nenhuma linha de Y perto: o custo entra nas 80 cotas que Y já tinha, sem quantidade nova
  const { c: c2 } = montar(NEG_A, [mov[0]], { fiis: { FUNX11: null, FUNY11: 100 }, ajustes: aj });
  const y2 = aberta(c2, "FUNY11");
  assert.equal(y2.q, 80); perto(y2.custo, 7600 + 1428.9);
  perto(y2.fifo.custo, 7600 + 1428.9); perto(corr(y2, "XP").custo, 7600 + 1428.9);
  assert.equal(sitDe(y2, "incorporacao")[0].texto, "FUNX11 foi incorporado por FUNY11 em 20/10/2025: o custo de 150 cotas passou para as de FUNY11; R$\u00a041,10 de resgate, informado por você em 10/11.");
  invariantes(c2);
});

test("incorporação com dois candidatos não adivinha; o ajuste escolhe um e o outro continua a conferir", () => {
  const mov = [...MOV_A, ["C", "2025-10-17", "Atualização", "FUNZ11", 20.5, null, XP]];
  const { c } = montar(NEG_A, mov, { fiis: { FUNX11: null, FUNY11: 100, FUNZ11: 50 } });
  const x = pos(c, "FUNX11");
  const s = sitDe(x, "resgate-total")[0];
  assert.equal(s.grave, true); assert.deepEqual(s.dados.candidatos, ["FUNY11", "FUNZ11"]);
  assert.match(s.texto, /Há entradas por Atualização de FUNY11 e FUNZ11 perto dessa data: confira se o fundo foi incorporado por um deles\.$/);
  // FUNZ11 apareceu sem nada antes: custódia sem origem, grave
  assert.equal(sitDe(aberta(c, "FUNZ11"), "custodia-sem-origem")[0].grave, true);
  const aj = [{ id: "i2", t: "FUNX11", tipo: "incorporacao", d: "2025-10-20", q: 150, valor: null, para: "FUNY11", criado: "2026-11-10T10:00:00Z" }];
  const { c: c2 } = montar(NEG_A, mov, { fiis: { FUNX11: null, FUNY11: 100, FUNZ11: 50 }, ajustes: aj });
  assert.equal(pos(c2, "FUNX11").incorporadoPor, "FUNY11");
  assert.equal(aberta(c2, "FUNY11").q, 178);
  assert.equal(sitDe(aberta(c2, "FUNZ11"), "custodia-sem-origem")[0].grave, true);
  assert.equal(c2.resumo.conferencia.graves, 1);
  invariantes(c2);
});

test("rota: o ajuste de incorporação entra pelas mesmas rotas, sem valor", async () => {
  const env = { DB: d1Falso(), CARTEIRA_KEY: Buffer.alloc(32, 9).toString("base64") };
  env.DB.db.prepare("INSERT INTO docs (collection, id, data) VALUES ('meta', 'b3', ?), ('meta', 'fii-resumo', ?)").run(JSON.stringify({ acoes: [], fiis: [{ t: "FUNY11", preco: 100 }], etfs: [], bdrs: [] }), JSON.stringify({ fundos: { FUNX11: { n: "X" }, FUNY11: { n: "Y" } } }));
  const esp = espelhoFalso();
  const chamar = async (metodo, caminho, corpo) => {
    limparCacheCarteira("eu@x.com");
    const r = await rotaCarteira(new Request("https://x/api/carteira/" + caminho, { method: metodo, headers: { "content-type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), env, { email: "eu@x.com" }, caminho, { ...esp, hoje: HOJE });
    return { status: r.status, j: await r.json() };
  };
  const mov = [["C", "2025-10-20", "Resgate", "FUNX11", 150, 0.274, XP], ["C", "2025-11-14", "Atualização", "FUNY11", 98.64, null, XP]];
  await chamar("POST", "importar", { arquivos: arquivosDe(NEG_A, mov) });
  const g0 = await chamar("GET", "");
  assert.equal(g0.j.resumo.encerradas.find((e) => e.t === "FUNX11").situacoes[0].id, "resgate-total");
  assert.equal((await chamar("POST", "ajustes", { tipo: "incorporacao", t: "FUNX11", para: "FUNY11", d: "2025-10-21" })).status, 400);
  const p = await chamar("POST", "ajustes", { tipo: "incorporacao", t: "FUNX11", para: "FUNY11", d: "2025-10-20", nota: "fato relevante" });
  assert.equal(p.status, 200, p.j.erro);
  const g1 = await chamar("GET", "");
  const x = g1.j.resumo.encerradas.find((e) => e.t === "FUNX11");
  assert.equal(x.incorporadoPor, "FUNY11");
  assert.equal(g1.j.ajustes[0].aplicado, true);
  // o mesmo papel e data troca o anterior; excluir volta ao que era
  const p2 = await chamar("POST", "ajustes", { tipo: "incorporacao", t: "FUNX11", para: "FUNY11", d: "2025-10-20" });
  assert.equal(p2.j.substituiu, p.j.item.id);
  await chamar("DELETE", "ajustes/" + p2.j.item.id);
  const g2 = await chamar("GET", "");
  assert.deepEqual(g2.j.resumo.encerradas.find((e) => e.t === "FUNX11"), g0.j.resumo.encerradas.find((e) => e.t === "FUNX11"));
});

// ---------- também: custódia sem origem e papel parado ----------

test("cotas que aparecem por Atualização sem compra, recibo nem incorporação: somam, grave, e o custo informado resolve", () => {
  const mov = [["C", "2024-11-08", "Atualização", "SORI11", 63, null, XP]];
  const { c, ex } = montar([], mov, { fiis: { SORI11: 11 } });
  const p = aberta(c, "SORI11");
  assert.equal(p.q, 63);
  const s = sitDe(p, "custodia-sem-origem")[0];
  assert.equal(s.grave, true);
  assert.equal(s.texto, "63 cotas apareceram em custódia em 08/11/2024 sem compra no extrato: custo desconhecido.");
  assert.equal(p.lotes[0].origem, "custodia");
  const v = validarAjuste({ tipo: "custo-transferencia", t: "SORI11", d: "2024-11-08", valor: 10 }, ex, HOJE);
  assert.equal(v.ajuste.q, 63);
  const { c: c2 } = montar([], mov, { fiis: { SORI11: 11 }, ajustes: [{ id: "s1", ...v.ajuste, criado: "2026-11-10T10:00:00Z" }] });
  const p2 = aberta(c2, "SORI11");
  perto(p2.pm, 10, 1e-9); assert.equal(p2.geral.comprado, 630); perto(c2.resumo.total.pago, 630);
  assert.equal(sitDe(p2, "custodia-sem-origem")[0].grave, false);
  assert.equal(sitDe(p2, "custodia-sem-origem")[0].texto, "63 cotas apareceram em custódia em 08/11/2024: preço médio de R$ 10,00 informado por você em 10/11.");
  assert.equal(p2.lotes[0].preco, 10);
  perto(corr(p2, "XP").custo, 630);
  invariantes(c2);
  // a que só confirma a custódia e a que converte recibo continuam sem situação
  const { c: c3 } = montar([["2024-01-10", "C", "SORJ11", 10, 10, XP]], [["C", "2024-11-08", "Atualização", "SORJ11", 10, null, XP]], { fiis: { SORJ11: 10 } });
  assert.deepEqual(ids(aberta(c3, "SORJ11")), []);
});

test("varredura: posição aberta sem cotação e sem linha há 24 meses ganha a situação parada", () => {
  const { c } = montar([["2023-01-10", "C", "PARA3", 10, 10, XP], ["2023-01-10", "C", "PARB3", 10, 10, XP], ["2025-06-10", "C", "PARC3", 10, 10, XP]], [], { cot: { PARB3: 9 } });
  assert.deepEqual(ids(aberta(c, "PARA3")), ["parada", "sem-cotacao"]);
  assert.equal(sitDe(aberta(c, "PARA3"), "parada")[0].texto, "Sem movimento desde 01/2023 e sem cotação: confira se o papel ainda existe.");
  assert.equal(sitDe(aberta(c, "PARA3"), "parada")[0].grave, false);
  assert.deepEqual(ids(aberta(c, "PARB3")), []); // tem cotação
  assert.deepEqual(ids(aberta(c, "PARC3")), ["sem-cotacao"]); // linha recente
});
