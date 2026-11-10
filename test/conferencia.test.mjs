// Conferência da carteira (pedido de 10/11): situações por papel, conta por corretora, ajustes da pessoa e o
// "desde o começo" por papel. Linhas inventadas aqui; nenhum dado real de extrato.
import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import { mesclar, calcular, parearTransferencias, diasUteisEntre, validarAjuste, rotaCarteira, limparCacheCarteira } from "../src/carteira.js";
import { decifrar } from "../src/cofre.js";
import { d1Falso, espelhoFalso } from "./d1-falso.mjs";
import { arquivos, arquivosSaidas, arquivosLotes, b3, fiiResumo } from "./fixtures-carteira.mjs";

const HOJE = "2026-11-10";
const CLEAR = "CLEAR CORRETORA - GRUPO XP", RICO = "RICO INVESTIMENTOS - GRUPO XP", XP = "XP INVESTIMENTOS CCTVM S/A";
const br = (iso) => iso.split("-").reverse().join("/");
const perto = (a, b, eps = 0.006) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
// negs: [data, C|V, papel, q, preço, corretora]; movs: [C|D, data, tipo como a B3 escreve, papel, q, preço|null, corretora].
// Cada negócio ganha a liquidação na Movimentação dois dias depois (como a B3), salvo semLiq.
function montar(negs, movs = [], { cot = {}, ajustes = [], semLiq = false, semMov = false } = {}) {
  const mais2 = (d) => { const x = new Date(d + "T12:00:00Z"); let n = 2; while (n) { x.setUTCDate(x.getUTCDate() + 1); if (x.getUTCDay() % 6) n--; } return x.toISOString().slice(0, 10); };
  const neg = negs.map(([d, cv, t, q, p, c]) => [br(d), cv === "C" ? "Compra" : "Venda", "Mercado à Vista", "-", c, t, q, p, q * p]);
  const mv = [
    ...(semLiq ? [] : negs.map(([d, cv, t, q, p, c]) => [cv === "C" ? "Credito" : "Debito", br(mais2(d)), "Transferência - Liquidação", t + " - EMPRESA", c, q, p, q * p])),
    ...movs.map(([es, d, tipo, t, q, p, c]) => [es === "C" ? "Credito" : "Debito", br(d), tipo, t + " - EMPRESA", c, q, p ?? "-", p != null ? q * p : "-"]),
  ];
  const arqs = [{ nome: "n", tipo: "negociacao", linhas: neg }];
  if (!semMov && mv.length) arqs.push({ nome: "m", tipo: "movimentacao", linhas: mv });
  const m = mesclar(null, arqs, "x");
  const c = calcular(m.extrato, { b3: { acoes: Object.entries(cot).map(([t, preco]) => ({ t, preco })), fiis: [], etfs: [], bdrs: [] }, fiiResumo: { fundos: {} }, importacoes: { lista: [] }, ajustes, hoje: HOJE });
  return { c, ex: m.extrato };
}
const pos = (c, t) => c.posicoes.find((p) => p.t === t) || c.resumo.encerradas.find((p) => p.t === t);
const ids = (p) => p.situacoes.map((s) => s.id);
const sitDe = (p, id) => p.situacoes.filter((s) => s.id === id);

// O caso do COGN3 (inventado com os mesmos formatos): 102 compradas na Clear e nunca vendidas; 1.147 compradas e
// vendidas na Rico; anos depois as 102 passam da Clear para a XP (portabilidade em dias diferentes); bonificação de 10,2
// em 29/12/2025 (10 inteiras e 0,2 de fração leiloada).
const COGN = () => montar(
  [["2020-03-10", "C", "COGN3", 100, 8.4, CLEAR], ["2020-03-10", "C", "COGN3", 2, 8.38, CLEAR],
    ["2020-06-10", "C", "COGN3", 600, 5, RICO], ["2020-09-10", "C", "COGN3", 547, 4.5, RICO], ["2021-02-10", "V", "COGN3", 1147, 4, RICO]],
  [["D", "2023-05-15", "Transferência", "COGN3", 102, null, CLEAR], ["C", "2023-05-17", "Transferência", "COGN3", 102, null, XP],
    ["C", "2025-12-29", "Bonificação em Ativos", "COGN3", 10, null, XP], ["C", "2025-12-29", "Fração em Ativos", "COGN3", 0.2, null, XP],
    ["D", "2026-01-20", "Fração em Ativos", "COGN3", 0.2, null, XP], ["C", "2026-01-20", "Leilão de Fração", "COGN3", 0.2, 7, XP]],
  { cot: { COGN3: 3.1 } });

test("dias úteis e pareamento de transferências", () => {
  assert.equal(diasUteisEntre("2023-05-12", "2023-05-15"), 1); // sexta para segunda
  assert.equal(diasUteisEntre("2023-05-15", "2023-05-22"), 5);
  assert.equal(diasUteisEntre("2023-05-15", "2023-05-23"), 6);
  const l = (es, d, q, c) => [d, es, "transf", "ABCD3", q, null, c, "x"];
  const r = parearTransferencias([l("D", "2023-05-15", 10, "XP"), l("C", "2023-05-22", 10, "Rico"), l("D", "2023-06-01", 5, "XP"), l("C", "2023-06-09", 5, "Rico"), l("D", "2023-07-03", 4, "XP"), l("C", "2023-07-03", 3, "Rico")]);
  assert.deepEqual(r.pares.map((p) => [p.dDe, p.dPara, p.q, p.de, p.para]), [["2023-05-15", "2023-05-22", 10, "XP", "Rico"]]);
  assert.equal(r.semPar.length, 4); // 6 dias úteis depois não casa; quantidade diferente não casa
});

test("COGN3: conta por corretora dá 112 cotas, custo 855,23 e preço médio 7,64 na XP; a Rico zerada com o realizado dela", () => {
  const { c } = COGN();
  const p = pos(c, "COGN3");
  assert.equal(p.q, 112);
  const xp = p.porCorretora.find((x) => x.inst === "XP"), rico = p.porCorretora.find((x) => x.inst === "Rico"), clear = p.porCorretora.find((x) => x.inst === "Clear");
  assert.equal(xp.q, 112); assert.equal(xp.custo, 855.23); assert.equal(Math.round(xp.pm * 100) / 100, 7.64);
  assert.equal(rico.q, 0); assert.equal(rico.custo, 0); perto(rico.realizado, 1147 * 4 - (3000 + 547 * 4.5));
  assert.equal(clear.q, 0); assert.equal(clear.realizado, 0); assert.equal(clear.comprado, 856.76);
  // o consolidado (o da Receita) junta tudo: preço médio bem menor
  assert.ok(p.pm < 5);
  // invariante: aberto + realizado somados por corretora = consolidado, salvo a fração (0,2 cota baixada pelo preço médio
  // de cada livro)
  const soma = p.porCorretora.reduce((s, x) => s + (x.resultado || 0) + x.realizado, 0);
  assert.ok(Math.abs(soma - (p.resultado + p.realizado)) <= 0.2 * Math.abs(xp.pm - p.pm) + 0.02, `${soma} x ${p.resultado + p.realizado}`);
  // situações: várias corretoras, transferência casada em dias diferentes (não é retirada), bonificação sem custo, fração
  assert.deepEqual(ids(p), ["bonificacao-sem-custo", "transferencia", "varias-corretoras", "fracao"]);
  assert.equal(sitDe(p, "bonificacao-sem-custo")[0].grave, true);
  assert.equal(sitDe(p, "bonificacao-sem-custo")[0].texto, "Bonificação de 10 em 29/12/2025 sem custo no extrato: entrou a R$\u00a00,00.");
  assert.equal(sitDe(p, "transferencia")[0].texto, "102 ações saíram da Clear em 15/05/2023 e chegaram na XP em 17/05/2023; o custo foi junto.");
  assert.match(sitDe(p, "varias-corretoras")[0].texto, /^Negociado em 3 corretoras: preço médio de \d,\d\d juntando as 3; 7,64 só na XP\.$/);
  assert.equal(sitDe(p, "fracao")[0].texto, "Fração de 0,2 em 29/12/2025, leiloada por R$\u00a01,40.");
  assert.equal(c.resumo.saidas.retiradas.n, 0);
  assert.deepEqual(c.resumo.conferencia, { papeis: 1, graves: 1, porTipo: { "bonificacao-sem-custo": 1, transferencia: 1, "varias-corretoras": 1, fracao: 1 }, situacoes: 4, ajustes: 0, ajustesSemEfeito: 0 });
  assert.deepEqual(c.resumo.alertas[0], { tipo: "conferencia", n: 1 });
  // por lote, a transferência casada não mexe nos lotes (nenhum lote de transferência); por CPF, a venda da Rico baixou
  // os lotes mais antigos, os da Clear
  assert.deepEqual(p.lotes.map((l) => [l.d, l.origem]), [["2020-09-10", "compra"], ["2025-12-29", "bonificacao"]]);
});

test("desde o começo por papel: não depende do método e a soma bate com resumo.total.ganho", () => {
  const { c } = COGN();
  const g = pos(c, "COGN3").geral;
  assert.deepEqual({ comprado: g.comprado, vendido: g.vendido, hoje: g.hoje }, { comprado: 856.76 + 3000 + 2461.5, vendido: 4588, hoje: 347.2 });
  perto(g.resultado, 4588 + 347.2 - 6318.26);
  perto(c.resumo.total.ganho, g.resultado);
  for (const arqs of [arquivos(), arquivosSaidas(), arquivosLotes()]) {
    const m = mesclar(null, arqs, "i");
    const importacoes = { lista: [{ id: "i", arquivos: m.porArquivo.map((a) => ({ tipo: a.tipo, de: a.de, ate: a.ate })) }] };
    const cc = calcular(m.extrato, { b3, fiiResumo, importacoes, hoje: "2026-11-03" });
    const soma = [...cc.posicoes, ...cc.resumo.encerradas].reduce((s, p) => s + p.geral.resultado, 0);
    assert.ok(Math.abs(soma - cc.resumo.total.ganho) < 0.05, `${soma} x ${cc.resumo.total.ganho}`);
    // a encerrada: o desde o começo é o resultado mais os proventos
    for (const e of cc.resumo.encerradas) perto(e.geral.resultado, e.total, 0.02);
    // e a conta por corretora fecha com o consolidado em cada papel
    for (const p of [...cc.posicoes, ...cc.resumo.encerradas]) {
      const soma2 = p.porCorretora.reduce((s, x) => s + (x.resultado || 0) + x.realizado, 0);
      assert.ok(Math.abs(soma2 - ((p.resultado ?? 0) + p.realizado)) < 0.05, `${p.t}: ${soma2} x ${(p.resultado ?? 0) + p.realizado}`);
    }
  }
});

test("situações que não aparecem num papel simples, e sem cotação", () => {
  const { c } = montar([["2025-01-10", "C", "SIMP3", 10, 10, XP], ["2025-01-10", "C", "NOCO3", 10, 10, XP]], [], { cot: { SIMP3: 11 } });
  assert.deepEqual(pos(c, "SIMP3").situacoes, []);
  assert.deepEqual(ids(pos(c, "NOCO3")), ["sem-cotacao"]);
  assert.equal(c.resumo.conferencia.graves, 0);
  assert.ok(!c.resumo.alertas.some((a) => a.tipo === "conferencia"));
});

test("venda sem origem (com e sem Movimentação) e o ajuste de posição inicial, que se desfaz ao excluir", () => {
  const negs = [["2025-01-10", "C", "VEND3", 10, 10, XP], ["2025-05-12", "V", "VEND3", 15, 12, XP]];
  for (const semMov of [false, true]) {
    const { c } = montar(negs, [], { cot: { VEND3: 12 }, semMov });
    const p = pos(c, "VEND3");
    const s = sitDe(p, "venda-sem-origem");
    assert.equal(s.length, 1); assert.equal(s[0].grave, true); assert.equal(s[0].dados.q, 5);
    assert.match(s[0].texto, /^Saíram 5 ações a mais do que havia na XP em \d\d\/05\/2025: compradas antes do período do extrato ou vindas de fora\.$/);
    // ajuste: 5 a R$ 8 em 02/01/2025
    const aj = [{ id: "a1", t: "VEND3", tipo: "posicao-inicial", d: "2025-01-02", q: 5, valor: 8, inst: "XP", criado: "2026-11-10T10:00:00Z" }];
    const { c: c2 } = montar(negs, [], { cot: { VEND3: 12 }, semMov, ajustes: aj });
    const p2 = pos(c2, "VEND3");
    assert.equal(p2.situacoes.filter((x) => x.grave).length, 0);
    assert.equal(sitDe(p2, "venda-sem-origem")[0].ajuste, "a1");
    assert.equal(sitDe(p2, "venda-sem-origem")[0].texto, "Posição de 5 ações a R$\u00a08,00 em 02/01/2025 na XP, informada por você em 10/11.");
    perto(p2.resultado, 15 * 12 - (100 + 40)); // encerrada
    // entra no que foi pago (desde o começo e total), mas não nos aportes mês a mês
    assert.equal(p2.geral.comprado, 140); perto(c2.resumo.total.pago, 140);
    assert.ok(c2.resumo.aportes.every((a) => a.compras === 0 || a.mes !== "2025-01"));
    assert.ok(c2.ajustes[0].aplicado);
    // sem o ajuste, a conta volta ao que era
    assert.deepEqual(montar(negs, [], { cot: { VEND3: 12 }, semMov }).c.resumo, c.resumo);
  }
});

test("bonificação: o custo informado entra no preço médio, no lote e na corretora; sem ele volta a zero", () => {
  const negs = [["2025-01-10", "C", "BONI3", 100, 20, XP]], movs = [["C", "2025-03-20", "Bonificação em Ativos", "BONI3", 10, null, XP]];
  const sem = pos(montar(negs, movs, { cot: { BONI3: 21 } }).c, "BONI3");
  perto(sem.pm, 2000 / 110, 1e-6);
  const aj = [{ id: "b1", t: "BONI3", tipo: "custo-bonificacao", d: "2025-03-20", q: 10, valor: 5, criado: "2026-11-10T10:00:00Z" }];
  const { c } = montar(negs, movs, { cot: { BONI3: 21 }, ajustes: aj });
  const p = pos(c, "BONI3");
  perto(p.pm, 2050 / 110, 1e-6);
  assert.equal(p.lotes[1].preco, 5);
  assert.equal(p.porCorretora[0].custo, 2050);
  const s = sitDe(p, "bonificacao-sem-custo")[0];
  assert.equal(s.grave, false); assert.equal(s.texto, "Bonificação de 10 em 20/03/2025: custo de R$\u00a05,00 por ação informado por você em 10/11.");
  // o desde o começo não muda: ninguém pagou pela bonificação
  assert.equal(p.geral.resultado, sem.geral.resultado);
  // ajuste de outra data não casa com nada
  const fora = montar(negs, movs, { cot: { BONI3: 21 }, ajustes: [{ ...aj[0], d: "2025-03-21" }] }).c;
  assert.equal(sitDe(pos(fora, "BONI3"), "bonificacao-sem-custo")[0].grave, true);
  assert.equal(fora.ajustes[0].aplicado, false); assert.equal(fora.resumo.conferencia.ajustesSemEfeito, 1);
});

test("transferência que chegou de fora: grave até a pessoa informar o custo; saída para fora é retirada", () => {
  const negs = [["2025-01-10", "C", "TRAZ3", 10, 10, XP]];
  const movs = [["C", "2025-06-02", "Transferência", "TRAZ3", 20, null, RICO], ["D", "2025-08-01", "Transferência", "TRAZ3", 5, null, XP]];
  const { c } = montar(negs, movs, { cot: { TRAZ3: 15 } });
  const p = pos(c, "TRAZ3");
  assert.equal(p.q, 25);
  const ts = sitDe(p, "transferencia");
  assert.equal(ts.length, 2);
  assert.equal(ts.find((s) => s.dados.para === "Rico").grave, true);
  assert.equal(ts.find((s) => s.dados.de === "XP").texto, "5 ações saíram da XP por transferência em 01/08/2025 sem entrada em outra corretora do extrato; contam como retirada.");
  assert.equal(c.resumo.saidas.retiradas.n, 1);
  const aj = [{ id: "t1", t: "TRAZ3", tipo: "custo-transferencia", d: "2025-06-02", q: 20, valor: 7, criado: "2026-11-10T10:00:00Z" }];
  const { c: c2 } = montar(negs, movs, { cot: { TRAZ3: 15 }, ajustes: aj });
  const p2 = pos(c2, "TRAZ3");
  assert.equal(sitDe(p2, "transferencia").filter((s) => s.grave).length, 0);
  perto(p2.pm, (100 + 140) / 30, 1e-6); // as 20 entram a R$ 7 no preço médio
  assert.equal(p2.porCorretora.find((x) => x.inst === "Rico").custo, 140);
  assert.ok(p2.lotes.some((l) => l.origem === "transferencia" && l.preco === 7));
  assert.equal(p2.geral.comprado, 240);
});

test("Atualização: a que só confirma a custódia não soma de novo; a que não bate vira quantidade-diverge", () => {
  const negs = [["2025-01-10", "C", "ATUA3", 100, 10, XP]];
  const igual = pos(montar(negs, [["C", "2025-09-01", "Atualização", "ATUA3", 100, null, XP]], { cot: { ATUA3: 10 } }).c, "ATUA3");
  assert.equal(igual.q, 100); assert.deepEqual(ids(igual), []);
  const dif = pos(montar(negs, [["C", "2025-09-01", "Atualização", "ATUA3", 120, null, XP]], { cot: { ATUA3: 10 } }).c, "ATUA3");
  assert.deepEqual(sitDe(dif, "quantidade-diverge").map((s) => [s.grave, s.dados]), [[true, { calculada: 100, informada: 120, d: "2025-09-01" }]]);
  assert.equal(sitDe(dif, "quantidade-diverge")[0].texto, "A B3 informa 120 em 01/09/2025 na linha de Atualização; pela conta do extrato eram 100.");
  // a subscrição que vira cota (com recibo) continua como era: soma e não diverge
  const { c } = montar([], [["C", "2025-03-01", "Direito de Subscrição", "SUBS12", 10, null, XP], ["D", "2025-03-10", "Direitos de Subscrição - Exercido", "SUBS12", 10, 50, XP],
    ["C", "2025-03-11", "Recibo de Subscrição", "SUBS13", 10, null, XP], ["C", "2025-04-20", "Atualização", "SUBS11", 10, null, XP]], { cot: {} });
  const s = pos(c, "SUBS11");
  assert.equal(s.q, 10); perto(s.pm, 50, 1e-6);
  assert.deepEqual(ids(s).filter((x) => x === "quantidade-diverge"), []);
  assert.ok(sitDe(s, "subscricao").some((x) => x.texto === "10 direitos de SUBS12 exercidos em 10/03/2025 a R$\u00a050,00."));
});

test("evento que o cálculo não trata vira situação, com o tipo e a data", () => {
  const { c } = montar([["2025-01-10", "C", "EVEN3", 10, 10, XP]], [["C", "2025-02-03", "Tipo Novo Qualquer", "EVEN3", 1, null, XP]], { cot: { EVEN3: 10 } });
  const s = sitDe(pos(c, "EVEN3"), "evento-ignorado")[0];
  assert.deepEqual([s.grave, s.dados.tipo, s.dados.d], [false, "tipo-novo-qualquer", "2025-02-03"]);
  assert.equal(s.texto, "Linha de tipo novo qualquer em 03/02/2025 que o cálculo não trata (1 no crédito).");
});

test("validação dos ajustes", () => {
  const { ex } = COGN();
  const v = (b) => validarAjuste(b, ex, HOJE);
  assert.deepEqual(v({ tipo: "custo-bonificacao", t: "COGN3", d: "2025-12-29", valor: 3.2 }).ajuste, { t: "COGN3", tipo: "custo-bonificacao", d: "2025-12-29", q: 10, valor: 3.2, nota: "", inst: "" });
  assert.match(v({ tipo: "custo-bonificacao", t: "COGN3", d: "2025-12-30", valor: 3.2 }).erro, /Não há bonificação/);
  assert.match(v({ tipo: "custo-bonificacao", t: "PETR4", d: "2025-12-29", valor: 3.2 }).erro, /não aparece/);
  assert.match(v({ tipo: "custo-bonificacao", t: "COGN3", d: "31/02/2025", valor: 3.2 }).erro, /Data/);
  assert.match(v({ tipo: "custo-bonificacao", t: "COGN3", d: "2025-12-29", valor: 0 }).erro, /maior que zero/);
  assert.match(v({ tipo: "custo-bonificacao", t: "COGN3", d: "2025-12-29", valor: -1 }).erro, /maior que zero/);
  assert.match(v({ tipo: "outro", t: "COGN3", d: "2025-12-29", valor: 1 }).erro, /Tipo/);
  assert.match(v({ tipo: "posicao-inicial", t: "COGN3", d: "2020-03-11", q: 10, valor: 8 }).erro, /para trás/);
  assert.match(v({ tipo: "posicao-inicial", t: "COGN3", d: "2020-01-02", q: 0, valor: 8 }).erro, /quantidade/);
  assert.equal(v({ tipo: "posicao-inicial", t: "COGN3", d: "2020-01-02", q: 10, valor: 8, inst: CLEAR }).ajuste.inst, "Clear");
  assert.match(v({ tipo: "custo-transferencia", t: "COGN3", d: "2023-05-17", valor: 8 }).erro, /outra corretora do extrato/);
  assert.match(v({ tipo: "custo-bonificacao", t: "COGN3", d: "2025-12-29", valor: 3, nota: "x".repeat(141) }).erro, /nota/);
});

// ---------- rotas ----------
const CHAVE = Buffer.alloc(32, 9).toString("base64");
function ambiente() {
  const env = { DB: d1Falso(), CARTEIRA_KEY: CHAVE };
  env.DB.db.prepare("INSERT INTO docs (collection, id, data) VALUES ('meta', 'b3', ?), ('meta', 'fii-resumo', ?)").run(JSON.stringify(b3), JSON.stringify(fiiResumo));
  const esp = espelhoFalso();
  const chamar = async (metodo, caminho, corpo) => {
    limparCacheCarteira("eu@x.com");
    const body = corpo === undefined ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo);
    const r = await rotaCarteira(new Request("https://x/api/carteira/" + caminho, { method: metodo, headers: { "content-type": "application/json" }, body }), env, { email: "eu@x.com" }, caminho, { ...esp, hoje: HOJE });
    return { status: r.status, j: await r.json() };
  };
  const doc = async (id) => { const r = env.DB.db.prepare("SELECT data FROM docs WHERE collection = ? AND id = ?").get("carteira/eu@x.com", id); return r ? await decifrar(env, r.data) : null; };
  return { chamar, doc };
}

test("rota: ajustes GET, POST, DELETE, validação e efeito no GET da carteira", async () => {
  const { chamar, doc } = ambiente();
  assert.equal((await chamar("POST", "ajustes", { tipo: "custo-bonificacao", t: "EFGH4", d: "2025-02-20", valor: 2 })).status, 409); // sem extrato
  await chamar("POST", "importar", { arquivos: arquivos() });
  const g0 = await chamar("GET", "");
  const e0 = g0.j.posicoes.find((p) => p.t === "EFGH4");
  assert.equal(e0.situacoes.find((s) => s.id === "bonificacao-sem-custo").grave, true);
  assert.ok(g0.j.resumo.alertas.some((a) => a.tipo === "conferencia"));
  assert.deepEqual(g0.j.ajustes, []);
  // POST válido
  const p = await chamar("POST", "ajustes", { tipo: "custo-bonificacao", t: "EFGH4", d: "20/02/2025", valor: 2, nota: "aviso da empresa" });
  assert.equal(p.status, 200);
  assert.match(p.j.item.id, /^[a-z0-9]{4,20}$/);
  assert.equal((await doc("ajustes")).itens.length, 1);
  const g1 = await chamar("GET", "");
  const e1 = g1.j.posicoes.find((p2) => p2.t === "EFGH4");
  perto(e1.pm, 2020 / 110, 1e-6);
  assert.equal(e1.situacoes.find((s) => s.id === "bonificacao-sem-custo").grave, false);
  assert.equal(g1.j.ajustes[0].aplicado, true);
  assert.equal((await chamar("GET", "ajustes")).j.itens.length, 1);
  // o mesmo ajuste de novo troca o anterior
  const p2 = await chamar("POST", "ajustes", { tipo: "custo-bonificacao", t: "EFGH4", d: "2025-02-20", valor: 3 });
  assert.equal(p2.j.substituiu, p.j.item.id);
  assert.equal((await doc("ajustes")).itens.length, 1);
  // validação
  assert.equal((await chamar("POST", "ajustes", { tipo: "custo-bonificacao", t: "EFGH4", d: "2025-02-21", valor: 3 })).status, 400);
  assert.equal((await chamar("POST", "ajustes", "{x")).status, 400);
  assert.equal((await chamar("POST", "ajustes", { tipo: "custo-bonificacao", t: "EFGH4", d: "2025-02-20", valor: 3, nota: "x".repeat(2100) })).status, 413);
  assert.equal((await chamar("DELETE", "ajustes/!!")).status, 400);
  assert.equal((await chamar("DELETE", "ajustes/zzzz")).status, 404);
  // excluir volta ao que era
  const d = await chamar("DELETE", "ajustes/" + p2.j.item.id);
  assert.equal(d.status, 200);
  const g2 = await chamar("GET", "");
  assert.deepEqual(g2.j.posicoes.find((x) => x.t === "EFGH4"), e0);
  assert.equal((await chamar("PUT", "ajustes", {})).status, 405);
});

test("rota: até 200 ajustes", async () => {
  const { chamar, doc } = ambiente();
  await chamar("POST", "importar", { arquivos: arquivos() });
  for (let i = 0; i < 200; i++) {
    const d = new Date(Date.UTC(2020, 0, 1) + i * 86400000).toISOString().slice(0, 10);
    const r = await chamar("POST", "ajustes", { tipo: "posicao-inicial", t: "ABCD3", d, q: 1, valor: 1 });
    assert.equal(r.status, 200, r.j.erro);
  }
  assert.equal((await doc("ajustes")).itens.length, 200);
  const r = await chamar("POST", "ajustes", { tipo: "custo-bonificacao", t: "EFGH4", d: "2025-02-20", valor: 2 });
  assert.equal(r.status, 400); assert.match(r.j.erro, /200/);
});
