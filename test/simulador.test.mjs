// Simulador de reinvestimento (src/carteira.js): criação, fechamento mensal, cron, decomposição e parecer.
// Linhas sintéticas de test/fixtures-carteira.mjs e o D1 falso de test/d1-falso.mjs; nenhum dado real.
import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import { rotaCarteira, limparCacheCarteira, cronSimulador, calcular, mesclar, serieProjetada, analisarSimulacao, validarSimulacao, MAX_SIMULACOES } from "../src/carteira.js";
import { decifrar } from "../src/cofre.js";
import { d1Falso, espelhoFalso } from "./d1-falso.mjs";
import { arquivos, b3, fiiResumo } from "./fixtures-carteira.mjs";

const CHAVE = Buffer.alloc(32, 9).toString("base64");
const PROIBIDAS = /recomend|melhor|oportunidade|barato|ticker|deveria/i;
const perto = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

function ambiente() {
  const env = { DB: d1Falso(), CARTEIRA_KEY: CHAVE };
  env.DB.db.prepare("INSERT INTO docs (collection, id, data) VALUES ('meta', 'b3', ?), ('meta', 'fii-resumo', ?)").run(JSON.stringify(b3), JSON.stringify(fiiResumo));
  const esp = espelhoFalso();
  const chamar = async (email, metodo, caminho, corpo, hoje = "2026-11-03") => {
    limparCacheCarteira(email);
    const r = await rotaCarteira(new Request("https://x/api/carteira/" + caminho, { method: metodo, headers: { "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined }), env, { email }, caminho, { ...esp, hoje });
    return { status: r.status, j: await r.json() };
  };
  const doc = async (email, id) => {
    const r = env.DB.db.prepare("SELECT data, atualizado FROM docs WHERE collection = ? AND id = ?").get("carteira/" + email, id);
    return r ? { ...(await decifrar(env, r.data)), _em: r.atualizado } : null;
  };
  const gravacoes = (email, id) => esp.gravados.filter((x) => x.collection === "carteira/" + email && x.id === id).length;
  return { env, esp, chamar, doc, gravacoes };
}
async function comCarteira(email = "eu@x.com") {
  const a = ambiente();
  const r = await a.chamar(email, "POST", "importar", { arquivos: arquivos() });
  assert.equal(r.j.gravado, true);
  return a;
}

test("criação: memória congelada e série prevista mês a mês", async () => {
  const { chamar } = await comCarteira();
  const { status, j: sim } = await chamar("eu@x.com", "POST", "simulacoes", { nome: "  Reinvestir   tudo ", ate: "2027-10", aporte: 1000, reinvestir: true, yield: null });
  assert.equal(status, 200);
  assert.match(sim.id, /^[a-z0-9]{4,20}$/);
  assert.equal(sim.nome, "Reinvestir tudo");
  const m = sim.memoria;
  // o yield e o P inicial são os da Meta: proventos de 12 meses / custo e renda de hoje × 12 / y
  const calc = calcular(mesclar(null, arquivos(), "i").extrato, { b3, fiiResumo, hoje: "2026-11-03", importacoes: { lista: [{ arquivos: [{ tipo: "proventos", de: "2026-08-15", ate: "2026-10-20" }] }] } });
  perto(m.y, calc.resumo.prov12 / calc.resumo.custo, 1e-6);
  assert.equal(m.yCarteira, m.y);
  assert.equal(m.mesInicio, "2026-11");
  assert.equal(m.rendaHoje, calc.resumo.media12);
  perto(m.p0, (m.rendaHoje * 12) / m.y);
  assert.equal(m.previsto.length, 12, "de nov/2026 a out/2027");
  assert.equal(m.previsto[0][0], "2026-11");
  assert.equal(m.previsto[11][0], "2027-10");
  const serie = serieProjetada({ aporte: 1000, y: m.y, reinvestir: true, p0: (m.rendaHoje * 12) / m.y, meses: 11 });
  assert.deepEqual(m.previsto.map((x) => x[1]), serie);
  // patrimônio previsto no fim de cada mês: o da criação + aportes + renda reinvestida
  let p = m.patrimonio;
  m.previsto.forEach(([, renda, patr]) => { p += 1000 + renda; perto(patr, p, 0.02); });
  // foto da carteira sem corretora
  assert.ok(m.posicoes.length > 0 && m.posicoes.every((x) => Object.keys(x).sort().join() === "classe,papel,pm,q"));
  const lista = (await chamar("eu@x.com", "GET", "simulacoes")).j;
  assert.equal(lista.simulacoes.length, 1);
  assert.deepEqual(Object.keys(lista.simulacoes[0]).sort(), ["ate", "cfg", "criado", "id", "mesInicio", "mesesFechados", "nome", "patrimonioFinal", "rendaFinal", "tendencia", "ultimoDesvioPct"]);
  assert.equal(lista.simulacoes[0].rendaFinal, serie[11]);
  // GET da carteira traz a mesma lista para a tela e o widget
  const cart = (await chamar("eu@x.com", "GET", "")).j;
  assert.equal(cart.simulacoes[0].id, sim.id);
  // yield escrito à mão vale no lugar do da carteira
  const s2 = (await chamar("eu@x.com", "POST", "simulacoes", { nome: "12%", ate: "2027-01", aporte: 0, reinvestir: false, yield: 0.12 })).j;
  assert.equal(s2.memoria.y, 0.12);
  assert.equal(s2.memoria.previsto.length, 3);
  assert.ok(s2.memoria.previsto.every(([, r]) => r === s2.memoria.previsto[0][1]), "sem aporte e sem reinvestir a renda fica parada");
});

test("limites: 13ª simulação, fim no passado, nome comprido, yield fora, carteira vazia", async () => {
  const { chamar } = await comCarteira();
  assert.equal((await chamar("eu@x.com", "POST", "simulacoes", { ate: "2026-10" })).status, 400);
  assert.equal((await chamar("eu@x.com", "POST", "simulacoes", { ate: "2026-11" })).status, 400, "o mês atual não serve");
  assert.equal((await chamar("eu@x.com", "POST", "simulacoes", { ate: "2066-12" })).status, 400, "passa de 40 anos");
  assert.equal((await chamar("eu@x.com", "POST", "simulacoes", { ate: "2027-13" })).status, 400);
  assert.equal((await chamar("eu@x.com", "POST", "simulacoes", { ate: "2027-01", nome: "x".repeat(61) })).status, 400);
  assert.equal((await chamar("eu@x.com", "POST", "simulacoes", { ate: "2027-01", yield: 0.31 })).status, 400);
  assert.equal((await chamar("eu@x.com", "POST", "simulacoes", { ate: "2027-01", aporte: 1_000_001 })).status, 400);
  for (let i = 0; i < MAX_SIMULACOES; i++) assert.equal((await chamar("eu@x.com", "POST", "simulacoes", { ate: "2027-06", aporte: i * 100 })).status, 200);
  const r = await chamar("eu@x.com", "POST", "simulacoes", { ate: "2027-06" });
  assert.equal(r.status, 400);
  assert.match(r.j.erro, /até 12/);
  assert.equal((await chamar("eu@x.com", "GET", "simulacoes")).j.simulacoes.length, 12);
  assert.equal(validarSimulacao({ ate: "2027-01" }, "2026-11").nome, "Até 01/2027");
  const vazia = ambiente();
  const v = await vazia.chamar("ela@x.com", "POST", "simulacoes", { ate: "2027-06" });
  assert.equal(v.status, 409);
  assert.equal(v.j.erro, "Importe os extratos antes de simular.");
  // corpo acima de 2 KB
  assert.equal((await chamar("eu@x.com", "POST", "simulacoes", { ate: "2027-01", x: "y".repeat(2100) })).status, 413);
  // sem a chave, 503 como o resto da carteira
  const r503 = await rotaCarteira(new Request("https://x/api/carteira/simulacoes"), { DB: d1Falso() }, { email: "eu@x.com" }, "simulacoes", espelhoFalso());
  assert.equal(r503.status, 503);
});

test("fechamento mensal no GET: grava o mês anterior uma vez só", async () => {
  const { chamar, doc, gravacoes } = await comCarteira();
  // sem simulação, nada de mensal
  await chamar("eu@x.com", "GET", "", null, "2026-12-02");
  assert.equal(await doc("eu@x.com", "mensal"), null);
  const sim = (await chamar("eu@x.com", "POST", "simulacoes", { nome: "A", ate: "2027-06", aporte: 500 })).j;
  // em dezembro, o primeiro GET fecha novembro
  await chamar("eu@x.com", "GET", "", null, "2026-12-02");
  const m1 = await doc("eu@x.com", "mensal");
  assert.ok(m1.meses["2026-11"]);
  const f = m1.meses["2026-11"];
  assert.deepEqual(Object.keys(f).sort(), ["compras", "custo", "fechadoEm", "patrimonio", "posicoes", "prov12", "proventos", "vendas"]);
  assert.ok(f.posicoes.every((p) => Object.keys(p).sort().join() === "papel,q"));
  assert.equal(gravacoes("eu@x.com", "mensal"), 1);
  // com o fechamento já gravado, não grava de novo
  await chamar("eu@x.com", "GET", "", null, "2026-12-20");
  assert.equal(gravacoes("eu@x.com", "mensal"), 1);
  // em janeiro fecha dezembro e mantém novembro
  await chamar("eu@x.com", "GET", "", null, "2027-01-05");
  assert.deepEqual(Object.keys((await doc("eu@x.com", "mensal")).meses).sort(), ["2026-11", "2026-12"]);
  // a simulação mostra os meses dela e a análise compara
  const ver = (await chamar("eu@x.com", "GET", "simulacoes/" + sim.id, null, "2027-01-05")).j;
  assert.deepEqual(Object.keys(ver.mensal.meses).sort(), ["2026-11", "2026-12"]);
  const an = (await chamar("eu@x.com", "POST", "simulacoes/" + sim.id + "/analisar", {}, "2027-01-05")).j;
  assert.equal(an.mesesFechados, 2);
  assert.ok(["acima", "na linha", "abaixo"].includes(an.tendencia));
  const d = an.decomposicao;
  perto(d.rendimento + d.capital + d.residuo, d.total, 1e-6);
  perto(d.aportes + d.reinvestimento, d.capital, 1e-6);
  assert.ok(!PROIBIDAS.test(an.parecer));
  // analisar não grava nada
  const antes = gravacoes("eu@x.com", "simulacoes") + gravacoes("eu@x.com", "mensal");
  await chamar("eu@x.com", "POST", "simulacoes/" + sim.id + "/analisar", {}, "2027-01-05");
  assert.equal(gravacoes("eu@x.com", "simulacoes") + gravacoes("eu@x.com", "mensal"), antes);
  // excluir; a última leva o doc, os números ficam
  assert.equal((await chamar("eu@x.com", "DELETE", "simulacoes/zzzz9999")).status, 404);
  assert.equal((await chamar("eu@x.com", "DELETE", "simulacoes/" + sim.id)).j.restam, 0);
  assert.equal(await doc("eu@x.com", "simulacoes"), null);
  assert.ok(await doc("eu@x.com", "mensal"));
  // apagar a carteira apaga simulações e números junto
  await chamar("eu@x.com", "POST", "simulacoes", { ate: "2027-06" }, "2027-01-05");
  await chamar("eu@x.com", "DELETE", "");
  assert.equal(await doc("eu@x.com", "simulacoes"), null);
  assert.equal(await doc("eu@x.com", "mensal"), null);
});

test("cron: dia 1 entre 6h e 7h de Brasília, uma vez por mês, só quem tem simulação", async () => {
  const a = await comCarteira("a@x.com");
  await a.chamar("b@x.com", "POST", "importar", { arquivos: arquivos() });
  await a.chamar("c@x.com", "POST", "importar", { arquivos: arquivos() }); // sem simulação
  await a.chamar("a@x.com", "POST", "simulacoes", { ate: "2027-06" });
  await a.chamar("b@x.com", "POST", "simulacoes", { ate: "2027-06" });
  const t = (iso) => Date.parse(iso);
  assert.equal(await cronSimulador(a.env, t("2026-12-01T08:59:00Z"), a.esp), null, "5h59 em Brasília");
  assert.equal(await cronSimulador(a.env, t("2026-12-02T09:05:00Z"), a.esp), null, "dia 2");
  const r = await cronSimulador(a.env, t("2026-12-01T09:05:00Z"), a.esp);
  assert.deepEqual({ fechadas: r.fechadas, fim: r.fim, mes: r.mes }, { fechadas: 2, fim: true, mes: "2026-11" });
  assert.ok((await a.doc("a@x.com", "mensal")).meses["2026-11"]);
  assert.ok((await a.doc("b@x.com", "mensal")).meses["2026-11"]);
  assert.equal(await a.doc("c@x.com", "mensal"), null);
  const n = a.gravacoes("a@x.com", "mensal") + a.gravacoes("b@x.com", "mensal");
  const r2 = await cronSimulador(a.env, t("2026-12-01T09:06:00Z"), a.esp);
  assert.equal(r2.fechadas, 0);
  assert.equal(a.gravacoes("a@x.com", "mensal") + a.gravacoes("b@x.com", "mensal"), n, "o segundo minuto não grava");
  const marca = JSON.parse(a.env.DB.db.prepare("SELECT data FROM docs WHERE collection = '_sistema' AND id = 'simulador-fechamento'").get().data);
  assert.equal(marca.mes, "2026-11");
  assert.ok(!JSON.stringify(marca).includes("@"), "a marca não guarda e-mail");
  // só toca em carteira/ e _sistema
  const cols = new Set(a.env.DB.log.filter((s) => /^(INSERT|UPDATE|DELETE)/.test(s)).map((s) => s));
  assert.ok([...cols].every((s) => s.includes("INSERT INTO docs")));
  assert.ok(a.esp.gravados.every((x) => x.collection.startsWith("carteira/")));
  // no mês seguinte roda de novo
  assert.equal((await cronSimulador(a.env, t("2027-01-01T09:00:00Z"), a.esp)).fechadas, 2);
});

// Caso montado à mão: y 12% (1% ao mês), P inicial 100 mil, aporte 1.000 reinvestindo.
function simMao() {
  return {
    id: "mao1", nome: "Mão", criado: "", cfg: { ate: "2027-01", aporte: 1000, reinvestir: true, yield: 0.12 },
    memoria: { mesInicio: "2026-11", p0: 100000, y: 0.12, yCarteira: 0.12, rendaHoje: 1000, custo: 100000, patrimonio: 100000, noMes: { fluxo: 0, proventos: 0 }, posicoes: [],
      previsto: [["2026-11", 1000, 102000], ["2026-12", 1020, 104040], ["2027-01", 1040.4, 106120.8]] },
  };
}
test("decomposição fecha: rendimento + capital + resíduo = total (caso à mão)", () => {
  // nov: pagou 900 (yield sobre o custo caiu para 10,8%), comprou 1.000 de aporte + os 900, cotação parada
  const mensal = { meses: { "2026-11": { proventos: 900, compras: 1900, vendas: 0, patrimonio: 101900, custo: 101900, prov12: 11005.2 } } };
  const a = analisarSimulacao(simMao(), mensal);
  assert.equal(a.mesesFechados, 1);
  assert.deepEqual(a.meses[0], { mes: "2026-11", previsto: { renda: 1000, patrimonio: 102000 }, real: { proventos: 900, aportes: 1900, patrimonio: 101900 }, desvio: { renda: -100, pct: -10 } });
  const d = a.decomposicao;
  assert.equal(d.total, -100);
  assert.equal(d.rendimento, -100); // (10,8% − 12%) × 100.000 / 12
  assert.equal(d.capital, -1); // (101.900 − 102.000) × 1%
  assert.equal(d.aportes, 0); // entrou 1.900, o plano pedia 1.000 + 900 de proventos
  assert.equal(d.reinvestimento, -1);
  assert.equal(d.residuo, 1);
  assert.equal(d.rendimento + d.capital + d.residuo, d.total);
  assert.equal(a.tendencia, "abaixo");
  assert.equal(a.parecer, "No primeiro mês fechado (novembro de 2026) a renda ficou R$ 100 abaixo do previsto (−10,0%). A maior parte veio do rendimento: a carteira pagou 10,8% ao ano sobre o custo contra 12,0% usados na conta.");

  // três meses: dezembro com aporte maior e cotação subindo, janeiro com a renda na linha
  mensal.meses["2026-12"] = { proventos: 960, compras: 3000, vendas: 0, patrimonio: 106000, custo: 104860, prov12: 11325 };
  mensal.meses["2027-01"] = { proventos: 1050, compras: 2050, vendas: 0, patrimonio: 108300, custo: 106910, prov12: 11546 };
  const b = analisarSimulacao(simMao(), mensal);
  const e = b.decomposicao;
  assert.equal(b.mesesFechados, 3);
  perto(e.total, -100 + (960 - 1020) + (1050 - 1040.4), 1e-6);
  perto(e.rendimento + e.capital + e.residuo, e.total, 1e-9);
  perto(e.aportes + e.reinvestimento, e.capital, 1e-9);
  assert.equal(b.tendencia, "na linha"); // jan: +0,9%
  const frases = b.parecer.split(/(?<=\.)\s+/);
  assert.ok(frases.length >= 2 && frases.length <= 5, b.parecer);
  assert.match(b.parecer, /^Em 3 meses fechados a renda ficou R\$ 150 abaixo do previsto \(−4,9%\)\./);
  assert.match(b.parecer, /No último mês fechado \(janeiro de 2027\) a renda ficou na linha do previsto\./);
  // o yield de 12 meses ficou em 10,8% enquanto janeiro pagou mais: o resíduo puxa para o outro lado
  assert.ok(e.residuo > 0 && e.aportes > 0);
  assert.match(b.parecer, /O vaivém dos proventos entre os meses foi para o outro lado \(R\$ 115\) e compensou uma parte\./);
});

test("parecer: só fatos, 2 a 5 frases, sem palavra proibida, em vários cenários", () => {
  const casos = [];
  for (const prov of [700, 980, 1000, 1010, 1300]) for (const compras of [0, 1000, 2000, 5000]) for (const patr of [95000, 101000, 103000, 110000]) for (const yc of [0.12, 0.1])
    casos.push({ prov, compras, patr, yc });
  for (const c of casos) {
    const s = simMao();
    s.memoria.yCarteira = c.yc;
    const a = analisarSimulacao(s, { meses: { "2026-11": { proventos: c.prov, compras: c.compras, vendas: 0, patrimonio: c.patr, custo: 100000 + c.compras, prov12: c.prov * 12 }, "2026-12": { proventos: c.prov * 1.01, compras: c.compras, vendas: 100, patrimonio: c.patr + c.compras, custo: 100000 + 2 * c.compras, prov12: c.prov * 12.1 } } });
    const d = a.decomposicao;
    perto(d.rendimento + d.capital + d.residuo, d.total, 1e-9);
    const n = a.parecer.split(/(?<=\.)\s+/).length;
    assert.ok(n >= 2 && n <= 5, a.parecer);
    assert.ok(!PROIBIDAS.test(a.parecer), a.parecer);
    assert.ok(!/NaN|undefined|null|Infinity/.test(a.parecer), a.parecer);
  }
  // sem meses fechados: nada a dizer ainda, só quando sai a primeira comparação
  const v = analisarSimulacao(simMao(), { meses: {} });
  assert.deepEqual([v.mesesFechados, v.parecer, v.proximoFechamento], [0, "", "2026-11"]);
});
