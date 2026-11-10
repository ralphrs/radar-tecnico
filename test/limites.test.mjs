// Limites de compra e de venda por posição (pedido de 10/11): sinalPosicao, os limites em prefs/<email> (doc
// "reinvestir"), o GET /api/carteira com `sinal`, `limites` e `sinais`, e o Reinvestir tirando do ranking quem está
// passível de venda. Papéis e números inventados (test/fixtures-carteira.mjs e test/fixtures-radar.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import { sinalPosicao, limitesDe, pontuar, reinvestir, LIMITES_PADRAO, PESOS_PADRAO, TETOS_PADRAO } from "../src/pontuacao-fii.js";
import { validarReinvestir, respostaReinvestir, juntarReinvestir } from "../src/prefs.js";
import { rotaCarteira, limparCacheCarteira, aplicarLimites, mesclar, calcular } from "../src/carteira.js";
import { d1Falso, espelhoFalso } from "./d1-falso.mjs";
import { fiiResumo, b3 } from "./fixtures-radar.mjs";
import * as FC from "./fixtures-carteira.mjs";

const PROIBIDO = /\b(dicas?|melhor|melhores|oportunidade|oportunidades|barato|baratos|barata|recomendad[oa]s?|recomenda[çc][ãa]o|recomendo|compre|sugerimos|ticker|venda agora)\b/i;

test("sinalPosicao: limites exatos, sem cotação, limites diferentes", () => {
  // +10,0% é venda; +9,9% não; −10,0% é compra; −9,9% não
  assert.equal(sinalPosicao(11, 10).tipo, "venda");
  assert.equal(sinalPosicao(10.99, 10).tipo, null);
  assert.equal(sinalPosicao(9, 10).tipo, "compra");
  assert.equal(sinalPosicao(9.01, 10).tipo, null);
  assert.deepEqual(sinalPosicao(11, 10), { tipo: "venda", pct: 10, faltaCompra: 20, faltaVenda: 0, precoCompra: 9, precoVenda: 11 });
  assert.deepEqual(sinalPosicao(9, 10), { tipo: "compra", pct: -10, faltaCompra: 0, faltaVenda: 20, precoCompra: 9, precoVenda: 11 });
  // no meio: quanto falta para cada lado, em pontos percentuais
  assert.deepEqual(sinalPosicao(10.68, 10), { tipo: null, pct: 6.8, faltaCompra: 16.8, faltaVenda: 3.2, precoCompra: 9, precoVenda: 11 });
  // perto do limite sem chegar: "falta" nunca vira 0,0
  assert.equal(sinalPosicao(10.996, 10).faltaVenda, 0.1);
  // pm de vários decimais (o do extrato)
  assert.equal(sinalPosicao(10.0476190476 * 1.1, 10.0476190476).tipo, "venda");
  // sem cotação ou sem preço médio
  for (const [p, pm] of [[null, 10], [0, 10], [10, null], [10, 0], [NaN, 10]]) assert.equal(sinalPosicao(p, pm), null);
  // limites da pessoa: venda com 15%, compra com 5%
  const L = { compra: 5, venda: 15 };
  assert.equal(sinalPosicao(11, 10, L).tipo, null); assert.equal(sinalPosicao(11.5, 10, L).tipo, "venda");
  assert.equal(sinalPosicao(9.5, 10, L).tipo, "compra");
  assert.deepEqual([sinalPosicao(11, 10, L).faltaVenda, sinalPosicao(11, 10, L).precoVenda, sinalPosicao(11, 10, L).precoCompra], [5, 11.5, 9.5]);
  // limite estragado vale o padrão
  assert.deepEqual(limitesDe({ compra: 0, venda: 91 }), LIMITES_PADRAO); assert.deepEqual(limitesDe({ compra: 7.5 }), LIMITES_PADRAO);
  assert.deepEqual(limitesDe({ compra: 1, venda: 90 }), { compra: 1, venda: 90 });
});

test("limites nas prefs: validação, padrão, doc de antes dos limites e PUT parcial", () => {
  assert.deepEqual(validarReinvestir({ limites: { venda: 15 } }).reinvestir.limites, { compra: 10, venda: 15 });
  assert.deepEqual(validarReinvestir({}).reinvestir.limites, LIMITES_PADRAO);
  assert.deepEqual(validarReinvestir({ limites: { compra: 1, venda: 90 } }).reinvestir.limites, { compra: 1, venda: 90 });
  assert.match(validarReinvestir({ limites: { compra: 0 } }).erro, /Limite de compra: use um inteiro de 1 a 90/);
  assert.match(validarReinvestir({ limites: { venda: 91 } }).erro, /Limite de venda: use um inteiro de 1 a 90/);
  assert.match(validarReinvestir({ limites: { venda: 12.5 } }).erro, /inteiro/);
  assert.match(validarReinvestir({ limites: { venda: "10" } }).erro, /inteiro/);
  assert.match(validarReinvestir({ limites: { stop: 5 } }).erro, /Limite desconhecido/);
  assert.equal(validarReinvestir({ limites: [] }).erro, "limites");
  // quem salvou antes dos limites: o resto do que salvou continua e os limites ficam no padrão, sem regravar
  const antes = respostaReinvestir({ pesos: { ...PESOS_PADRAO, pvp: 0 }, tetos: { papel: 12, segmento: 25 }, universo: "meus" });
  assert.equal(antes.salvo, true); assert.equal(antes.pesos.pvp, 0); assert.equal(antes.universo, "meus"); assert.deepEqual(antes.limites, LIMITES_PADRAO);
  // limite estragado no banco: tudo volta ao padrão (como nos tetos)
  assert.equal(respostaReinvestir({ pesos: PESOS_PADRAO, limites: { venda: 0 } }).salvo, false);
  // PUT parcial: o que não veio fica como está salvo
  const salvo = { pesos: { ...PESOS_PADRAO, dy: 40 }, tetos: { papel: 12, segmento: 30 }, universo: "meus", limites: { compra: 8, venda: 20 }, salvo: true };
  assert.deepEqual(validarReinvestir(juntarReinvestir(salvo, { limites: { compra: 15, venda: 25 } })).reinvestir, { pesos: salvo.pesos, tetos: salvo.tetos, universo: "meus", limites: { compra: 15, venda: 25 } });
  assert.deepEqual(validarReinvestir(juntarReinvestir(salvo, { pesos: PESOS_PADRAO, tetos: TETOS_PADRAO, universo: "todos" })).reinvestir.limites, { compra: 8, venda: 20 });
  // nada salvo: o corpo vale como veio; campo estranho segue para a validação recusar
  assert.deepEqual(juntarReinvestir({ salvo: false, pesos: PESOS_PADRAO }, { limites: { compra: 5 } }), { limites: { compra: 5 } });
  assert.equal(validarReinvestir(juntarReinvestir(salvo, { outro: 1 })).erro, "campo outro");
});

test("aplicarLimites: sinal por posição e por lote, listas de cada lado, toda classe", () => {
  const m = mesclar(null, FC.arquivos(), "imp1");
  const c = calcular(m.extrato, { b3: FC.b3, fiiResumo: FC.fiiResumo, hoje: "2026-11-03" });
  const antes = JSON.stringify(c.posicoes);
  const l = aplicarLimites(c.posicoes, null);
  assert.equal(JSON.stringify(c.posicoes), antes, "as posições de calcular não mudam");
  const p = Object.fromEntries(l.posicoes.map((x) => [x.t, x]));
  // ação a +10,0% (IJKL3) é venda; FII e ação a −10,0% (UVWX11, MNOP3) são compra; YZAB11 (+5%) no meio
  assert.equal(p.IJKL3.sinal.tipo, "venda"); assert.equal(p.IJKL3.sinal.pct, 10);
  assert.equal(p.MNOP3.sinal.tipo, "compra"); assert.equal(p.UVWX11.sinal.tipo, "compra"); assert.equal(p.UVWX11.classe, "fii");
  assert.deepEqual(p.YZAB11.sinal, { tipo: null, pct: 5, faltaCompra: 15, faltaVenda: 5, precoCompra: 18, precoVenda: 22 });
  assert.deepEqual(l.sinais, { compra: ["MNOP3", "UVWX11"], venda: ["EFGH4", "ABCD3", "QRST11", "IJKL3"] });
  assert.deepEqual(l.limites, LIMITES_PADRAO);
  // por lote: cada lote pelo preço dele; lote a custo zero (bonificação) fica sem sinal
  assert.ok(p.EFGH4.lotes.some((x) => x.preco === 0 && x.sinal === null));
  assert.ok(p.ABCD3.lotes.some((x) => x.preco === 11 && x.sinal && x.sinal.tipo === null && x.sinal.pct === 9.1));
  // a posição continua pelo preço médio, mesmo com lote passível
  assert.equal(p.ABCD3.sinal.tipo, "venda");
  // limites da pessoa: venda com 20%, compra com 5%
  const l2 = aplicarLimites(c.posicoes, { compra: 5, venda: 20 });
  assert.deepEqual(l2.sinais, { compra: ["MNOP3", "UVWX11"], venda: ["EFGH4"] });
  // sem cotação: sem sinal
  assert.equal(aplicarLimites([{ t: "XXXX3", q: 1, pm: 10, preco: null, semCotacao: true, lotes: [{ preco: 5 }] }]).posicoes[0].sinal, null);
});

test("Reinvestir: passível de venda sai do ranking e da divisão; passível de compra leva o sinal", () => {
  const cheia = (t, extra = {}) => ({ t, nome: "FUNDO " + t, seg: "Logística", preco: 10, pvp: 0.95, dy: 16, pg: 12, m12: 12, rend: 0.12, media: 0.12, liq: 2e6, cot: 2e5, temCvm: true, ...extra });
  const l = [cheia("SOBE11", { preco: 11.5 }), cheia("CAIU11", { preco: 8.8 }), cheia("MEIO11"), cheia("NOVO11")];
  const r = pontuar(l, { cdi: 11, pm: { SOBE11: 10, CAIU11: 10, MEIO11: 10 } });
  assert.deepEqual(r.foraPorVenda, ["SOBE11"]);
  assert.ok(!r.avaliados.some((x) => x.t === "SOBE11"));
  const caiu = r.avaliados.find((x) => x.t === "CAIU11");
  assert.equal(caiu.sinal.tipo, "compra"); assert.equal(r.avaliados.find((x) => x.t === "MEIO11").sinal.tipo, null); assert.equal(r.avaliados.find((x) => x.t === "NOVO11").sinal, null);
  // com venda em 20%, SOBE11 (+15%) volta
  assert.deepEqual(pontuar(l, { cdi: 11, pm: { SOBE11: 10 }, limites: { venda: 20, compra: 10 } }).foraPorVenda, []);
  // na rota pura: contagem e faixa do critério com o limite da pessoa
  const POS = [{ t: "TENH11", q: 2000, valor: 18000, preco: 9, pm: 7, classe: "fii" }, { t: "PASB11", q: 100, valor: 900, preco: 9, pm: 10.5, classe: "fii" }];
  const out = reinvestir({ b3, fiiResumo, mercado: { itens: [{ id: "cdi", valor: 11 }] }, posicoes: POS, universo: "meus", limites: { compra: 12, venda: 25 } });
  assert.equal(out.foraPorVenda, 1); assert.deepEqual(out.top.map((x) => x.t), ["PASB11"]);
  assert.ok(!out.divisao.itens.some((x) => x.t === "TENH11"));
  assert.deepEqual(out.limites, { compra: 12, venda: 25 }); assert.deepEqual(out.limitesPadrao, LIMITES_PADRAO);
  const fx = out.criterios.find((c) => c.id === "abaixo").faixa;
  assert.equal(fx, "só para papel que você tem: zero até cair 12% do seu preço médio; máximo com o dobro");
  assert.doesNotMatch(fx, PROIBIDO);
});

test("GET /api/carteira com os limites: sinal, limites, sinais; PUT dos limites limpa o cache e guarda o resto", async () => {
  const env = { DB: d1Falso(), CARTEIRA_KEY: Buffer.alloc(32, 3).toString("base64") };
  const ins = env.DB.db.prepare("INSERT INTO docs (collection, id, data) VALUES ('meta', ?, ?)");
  ins.run("b3", JSON.stringify({ ...b3, acoes: FC.b3.acoes, fiis: [...FC.b3.fiis, ...b3.fiis] }));
  ins.run("fii-resumo", JSON.stringify({ ...fiiResumo, fundos: { ...fiiResumo.fundos, ...FC.fiiResumo.fundos } }));
  const esp = espelhoFalso();
  const email = "lim@x.com";
  const chamar = async (metodo, caminho, corpo, limpar = true) => {
    if (limpar) limparCacheCarteira(email);
    const r = await rotaCarteira(new Request("https://x/api/carteira/" + caminho, { method: metodo, headers: { "content-type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), env, { email }, caminho.split("?")[0], { ...esp, hoje: "2026-11-03" });
    return { status: r.status, j: await r.json() };
  };
  // vazia: limites padrão e listas vazias
  let r = await chamar("GET", "");
  assert.equal(r.j.vazia, true); assert.deepEqual(r.j.limites, LIMITES_PADRAO); assert.deepEqual(r.j.sinais, { compra: [], venda: [] });
  assert.equal((await chamar("POST", "importar", { arquivos: FC.arquivos() })).j.gravado, true);
  r = await chamar("GET", "");
  assert.deepEqual(r.j.limites, LIMITES_PADRAO);
  assert.deepEqual(r.j.sinais, { compra: ["MNOP3", "UVWX11"], venda: ["EFGH4", "ABCD3", "QRST11", "IJKL3"] });
  assert.ok(r.j.posicoes.every((p) => "sinal" in p));
  assert.equal(r.j.posicoes.find((p) => p.t === "YZAB11").sinal.faltaVenda, 5);
  // pesos e tetos salvos antes; depois só os limites (o painel da Visão geral): os pesos ficam
  assert.equal((await chamar("PUT", "reinvestir", { pesos: { ...PESOS_PADRAO, pvp: 0 }, tetos: { papel: 12 }, universo: "meus" })).status, 200);
  // GET já em cache, para conferir que o PUT dos limites limpa
  await chamar("GET", "");
  assert.equal((await chamar("PUT", "reinvestir", { limites: { compra: 0 } }, false)).status, 400);
  const put = await chamar("PUT", "reinvestir", { limites: { compra: 5, venda: 20 } }, false);
  assert.equal(put.status, 200); assert.deepEqual(put.j.limites, { compra: 5, venda: 20 }); assert.equal(put.j.pesos.pvp, 0); assert.equal(put.j.universo, "meus"); assert.equal(put.j.tetos.papel, 12);
  const linha = JSON.parse(env.DB.db.prepare("SELECT data FROM docs WHERE collection = ? AND id = 'reinvestir'").get("prefs/" + email).data);
  assert.deepEqual(linha.limites, { compra: 5, venda: 20 }); assert.equal(linha.pesos.pvp, 0);
  r = await chamar("GET", "", undefined, false);
  assert.deepEqual(r.j.limites, { compra: 5, venda: 20 });
  assert.deepEqual(r.j.sinais, { compra: ["MNOP3", "UVWX11"], venda: ["EFGH4"] });
  // o Reinvestir lê os mesmos limites
  const rv = await chamar("GET", "reinvestir");
  assert.deepEqual(rv.j.limites, { compra: 5, venda: 20 }); assert.equal(typeof rv.j.foraPorVenda, "number");
  // o seletor de universo (pesos, tetos e universo, sem limites) não apaga os limites
  await chamar("PUT", "reinvestir", { pesos: put.j.pesos, tetos: put.j.tetos, universo: "todos" });
  assert.deepEqual((await chamar("GET", "")).j.limites, { compra: 5, venda: 20 });
});
