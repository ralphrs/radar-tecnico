// Proventos a Receber (o retrato da B3) na Minha carteira: detecção pelo cabeçalho, normalização, substituição do
// retrato, cálculo do A receber, alerta e o que fica guardado. Linhas inventadas (test/fixtures-carteira.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import { mesclar, calcular, projecao, normalizarAReceber, retratoDe, aplicarRetrato, desfazerRetrato, dataDoNome, tipoAReceber, rotaCarteira, limparCacheCarteira } from "../src/carteira.js";
import { decifrar } from "../src/cofre.js";
import { d1Falso, espelhoFalso } from "./d1-falso.mjs";
import { arquivos, b3, fiiResumo, aReceberPlanilha, CAB_ARECEBER, XP } from "./fixtures-carteira.mjs";
import { detectarTipo as detectarGerador, reduzirLinha as reduzirGerador, CAB } from "./fixtures/b3-fake/gerar.mjs";

const HOJE = "2026-11-10";
const perto = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// As funções da própria página (public/index.html), tiradas do script e avaliadas aqui
const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const trecho = (ini, fim) => { const i = html.indexOf(ini); const j = html.indexOf(fim, i); assert.ok(i >= 0 && j > i, ini); return html.slice(i, j); };
const pagina = new Function(`${trecho("const semAcento = ", "\n")}\n${trecho("const CAB_ARECEBER = ", "let imp = {")}\nreturn { detectarTipo, reduzirLinha };`)();

// A planilha como a página manda: detecta pelo cabeçalho e reduz cada linha
function envio(rows, nome = "proventos-a-receber-2026-11-10.xlsx", p = pagina) {
  const tipo = p.detectarTipo(rows[0]);
  return { nome, tipo, linhas: rows.slice(1).filter((r) => r && r.some((v) => v != null && String(v).trim() !== "")).map((r) => p.reduzirLinha(tipo, r)) };
}
function base() {
  const m = mesclar(null, arquivos(), "imp1");
  const importacoes = { lista: [{ id: "imp1", arquivos: m.porArquivo.map((a) => ({ tipo: a.tipo, de: a.de, ate: a.ate })) }] };
  return { m, importacoes };
}
const calcCom = (retrato, hoje = HOJE, extra = null) => {
  const { m, importacoes } = base();
  const ex = extra ? mesclar(m.extrato, extra, "imp2").extrato : m.extrato;
  return calcular(ex, { b3, fiiResumo, importacoes, retrato, hoje });
};
const retratoFixo = (nome) => { const e = envio(aReceberPlanilha, nome); const r = retratoDe(e.linhas, e.nome, HOJE); return { dataRef: r.dataRef, linhas: r.linhas, total: r.total }; };

test("detecção pelo cabeçalho, com os dois nomes de arquivo, na página e no gerador", () => {
  for (const p of [pagina, { detectarTipo: detectarGerador, reduzirLinha: reduzirGerador }]) {
    assert.equal(p.detectarTipo(CAB_ARECEBER), "areceber");
    assert.equal(p.detectarTipo([...CAB_ARECEBER, null, ""]), "areceber");
    // o extrato de proventos recebidos tem "Pagamento" e "Tipo de Evento" também, e continua sendo proventos
    assert.equal(p.detectarTipo(CAB.proventos), "proventos");
    assert.equal(p.detectarTipo(CAB.negociacao), "negociacao");
    assert.equal(p.detectarTipo(CAB.movimentacao), "movimentacao");
    // faltando uma coluna ou fora de ordem, não é o relatório
    assert.notEqual(p.detectarTipo(CAB_ARECEBER.filter((x) => x !== "Conta")), "areceber");
    assert.notEqual(p.detectarTipo([CAB_ARECEBER[1], CAB_ARECEBER[0], ...CAB_ARECEBER.slice(2)]), "areceber");
  }
  // o nome não decide nada: o mesmo relatório com os dois nomes dá o mesmo envio, e a data sai do nome
  const a = envio(aReceberPlanilha, "proventos-a-receber-2026-11-10.xlsx"), b = envio(aReceberPlanilha, "eventos-2026-11-10-08-12-40.xlsx");
  assert.equal(a.tipo, "areceber"); assert.deepEqual(a.linhas, b.linhas);
  assert.equal(dataDoNome(a.nome, HOJE), "2026-11-10"); assert.equal(dataDoNome(b.nome, HOJE), "2026-11-10");
  assert.equal(dataDoNome("relatorio.xlsx", HOJE), HOJE);
  assert.equal(dataDoNome("eventos-2026-12-01-08-00-00.xlsx", HOJE), HOJE); // data no futuro vira hoje
  assert.equal(dataDoNome("proventos-a-receber-2026-10-02.xlsx", HOJE), "2026-10-02");
});

test("a página tira a conta e o nome do produto antes de mandar", () => {
  const e = envio(aReceberPlanilha);
  const txt = JSON.stringify(e.linhas);
  assert.ok(!txt.includes("0001234") && !txt.includes("0009876"), "conta");
  assert.ok(!txt.includes("FUNDO QRST") && !txt.includes("EMPRESA"), "nome do produto");
  assert.ok(!txt.includes('"Fundo"') && !txt.includes('"PN"'), "coluna Tipo");
  assert.deepEqual(e.linhas[0], ["QRST11", "RENDIMENTO", "13/11/2026", XP, "110", 0.95, 104.5]);
  assert.deepEqual(e.linhas.at(-1), [null, null, null, null, null, "Total líquido", 287.9]);
});

test("normalização: quantidade em texto, tipos, F do fracionário, total conferido", () => {
  const e = envio(aReceberPlanilha);
  const n = normalizarAReceber(e.linhas[0]).linha;
  assert.deepEqual(n, { t: "QRST11", tipo: "rendimento", d: "2026-11-13", inst: "XP", q: 110, unit: 0.95, valor: 104.5 });
  assert.equal(typeof n.q, "number");
  assert.equal(tipoAReceber("JUROS SOBRE CAPITAL PRÓPRIO"), "jcp");
  assert.equal(tipoAReceber("Reembolso - DIVIDENDO"), "reembolso");
  assert.equal(tipoAReceber("DIVIDENDO"), "dividendo");
  assert.equal(tipoAReceber("RENDIMENTO"), "rendimento");
  assert.equal(tipoAReceber("RESTITUIÇÃO DE CAPITAL"), "outro");
  const r = retratoDe(e.linhas, e.nome, HOJE);
  assert.equal(r.linhas.length, 8); // a linha do total não entra
  assert.ok(r.linhas.every((x) => Object.keys(x).join() === "t,tipo,d,inst,q,unit,valor"));
  assert.deepEqual(r.tipos, { rendimento: 2, dividendo: 3, jcp: 1, reembolso: 1, outro: 1 });
  assert.ok(r.linhas.some((x) => x.t === "ABCD3" && x.d === "2028-03-10")); // ABCD3F vira ABCD3
  assert.equal(r.totalArquivo, 287.9); perto(r.total, 287.9); assert.equal(r.confere, true);
  assert.equal(r.dataRef, "2026-11-10"); assert.equal(r.de, "2026-11-05"); assert.equal(r.ate, "2028-03-10");
  // total que não bate em 1 centavo
  const torto = e.linhas.map((l) => (l[5] === "Total líquido" ? [...l.slice(0, 6), 288] : l));
  assert.equal(retratoDe(torto, e.nome, HOJE).confere, false);
  assert.equal(retratoDe(e.linhas.map((l) => (l[5] === "Total líquido" ? [...l.slice(0, 6), 287.91] : l)), e.nome, HOJE).confere, true);
  // sem a linha do total, nada a conferir
  assert.equal(retratoDe(e.linhas.slice(0, -1), e.nome, HOJE).confere, null);
  // linha com papel fora do padrão é ignorada
  assert.equal(retratoDe([["Tesouro Selic 2029", "RENDIMENTO", "13/11/2026", XP, "1", 1, 1]], "x", HOJE).motivos.papel, 1);
});

test("retrato substitui o anterior, o mesmo arquivo não muda nada e um mais antigo é recusado", () => {
  const e = envio(aReceberPlanilha);
  const r1 = retratoDe(e.linhas, e.nome, HOJE);
  const a1 = aplicarRetrato(null, r1, "imp1", "t1");
  assert.equal(a1.status, "novo");
  assert.equal(aplicarRetrato(a1.doc, retratoDe(e.linhas, "eventos-2026-11-10-09-00-00.xlsx", HOJE), "imp2", "t2").status, "igual");
  // novo retrato com uma linha a menos: substitui, não soma
  const r2 = retratoDe(e.linhas.slice(1), "proventos-a-receber-2026-11-12.xlsx", "2026-11-12");
  const a2 = aplicarRetrato(a1.doc, r2, "imp3", "t3");
  assert.equal(a2.status, "novo"); assert.equal(a2.substitui, "2026-11-10");
  assert.equal(a2.doc.atual.linhas.length, 7); assert.equal(a2.doc.atual.dataRef, "2026-11-12");
  assert.equal(a2.doc.anterior.dataRef, "2026-11-10");
  // retrato de antes do guardado
  const velho = retratoDe(e.linhas.slice(2), "proventos-a-receber-2026-11-01.xlsx", HOJE);
  const a3 = aplicarRetrato(a2.doc, velho, "imp4", "t4");
  assert.equal(a3.status, "antigo"); assert.equal(a3.guardado, "2026-11-12"); assert.equal(a3.doc, a2.doc);
  // desfazer a importação do atual devolve o anterior; desfazer a do único apaga
  assert.equal(desfazerRetrato(a2.doc, "imp3").doc.atual.dataRef, "2026-11-10");
  assert.equal(desfazerRetrato(a1.doc, "imp1").doc, null);
  assert.equal(desfazerRetrato(a1.doc, "outra").mudou, false);
});

test("cálculo: linhas da B3 por papel e data, data passada some, estimativa só para quem não está no retrato", () => {
  const c = calcCom(retratoFixo("proventos-a-receber-2026-11-10.xlsx"));
  const ar = c.resumo.aReceber;
  const b3l = ar.filter((x) => x.origem === "b3");
  // EFGH4 de 05/11 já passou: sai sozinho
  assert.ok(!b3l.some((x) => x.t === "EFGH4" && x.data === "2026-11-05"));
  // QRST11 nas duas corretoras vira uma linha
  const q = b3l.filter((x) => x.t === "QRST11");
  assert.equal(q.length, 1); assert.equal(q[0].q, 120); perto(q[0].valor, 114); assert.equal(q[0].porCota, 0.95); assert.deepEqual(q[0].corretoras.sort(), ["Rico", "XP"]);
  assert.deepEqual(b3l.map((x) => `${x.t} ${x.tipo} ${x.data}`), ["QRST11 rendimento 2026-11-13", "EFGH4 jcp 2026-11-28", "EFGH4 reembolso 2026-11-28", "IJKL3 outro 2026-12-07", "ABCD3 dividendo 2026-12-15", "ABCD3 dividendo 2028-03-10"]);
  assert.deepEqual(b3l.filter((x) => x.adiante).map((x) => x.data), ["2028-03-10"]);
  // estimativa: QRST11 está no retrato de novembro e sai; UVWX11 e YZAB11 não estão e continuam, sem data
  const est = ar.filter((x) => x.origem === "estimativa");
  assert.deepEqual(est.map((x) => x.t).sort(), ["UVWX11", "YZAB11"]);
  assert.ok(est.every((x) => x.data === null));
  // agenda: datas reais primeiro, estimativas depois, a data distante por último
  const ag = c.resumo.agenda;
  assert.equal(ag[0].data, "2026-11-13");
  assert.equal(ag.at(-1).data, "2028-03-10"); assert.equal(ag.at(-1).adiante, true);
  assert.ok(ag.findIndex((x) => x.origem === "estimativa") > ag.findIndex((x) => x.data === "2026-12-15"));
  // resumo do retrato
  const rt = c.resumo.retrato;
  assert.equal(rt.dataRef, "2026-11-10"); assert.equal(rt.dias, 0); assert.equal(rt.velho, false); assert.equal(rt.linhas, 8);
  perto(rt.noMes, 114 + 37.4 + 20); perto(rt.total, 114 + 37.4 + 20 + 10 + 21 + 52.5);
});

test("sem retrato, o A receber é a estimativa de antes", () => {
  const c = calcCom(null);
  assert.equal(c.resumo.retrato, null);
  assert.ok(c.resumo.aReceber.length > 0 && c.resumo.aReceber.every((x) => x.origem === "estimativa" && x.data === null));
  assert.ok(c.resumo.aReceber.some((x) => x.t === "QRST11"));
  assert.ok(!c.resumo.alertas.some((a) => a.tipo === "fora-do-retrato"));
});

test("não conta duas vezes com o recebido, e retrato velho fica marcado", () => {
  // QRST11 pago em 13/11 já está nos proventos recebidos; hoje é 13/11: a linha do retrato do mesmo dia não entra
  const recebido = [{ nome: "proventos-nov.xlsx", tipo: "proventos", linhas: [["QRST11 - FUNDO QRST", "13/11/2026", "Rendimento", XP, "110", 0.95, 104.5]] }];
  const c = calcCom(retratoFixo("proventos-a-receber-2026-11-10.xlsx"), "2026-11-13", recebido);
  assert.ok(!c.resumo.aReceber.some((x) => x.t === "QRST11"));
  // retrato de 20/09 visto em 10/11: 51 dias
  const v = calcCom(retratoFixo("proventos-a-receber-2026-09-20.xlsx"));
  assert.equal(v.resumo.retrato.dias, 51); assert.equal(v.resumo.retrato.velho, true);
  // a linha de novembro do retrato velho ainda vale (QRST11 sem estimativa), mas retrato de outro mês não gera alerta
  assert.ok(!v.resumo.aReceber.some((x) => x.origem === "estimativa" && x.t === "QRST11"));
  assert.ok(!v.resumo.alertas.some((a) => a.tipo === "fora-do-retrato"));
  // retrato de setembro só com linhas de setembro: novembro volta para a estimativa
  const set = { dataRef: "2026-09-20", linhas: [{ t: "QRST11", tipo: "rendimento", d: "2026-09-25", inst: "XP", q: 110, unit: 0.9, valor: 99 }], total: 99 };
  assert.ok(calcCom(set).resumo.aReceber.some((x) => x.origem === "estimativa" && x.t === "QRST11"));
});

test("alerta: fundo da carteira que pagou nos últimos 3 meses e não está no retrato do mês", () => {
  const c = calcCom(retratoFixo("proventos-a-receber-2026-11-10.xlsx"));
  const al = c.resumo.alertas.filter((a) => a.tipo === "fora-do-retrato");
  // UVWX11 pagou em outubro e não aparece; QRST11 aparece; YZAB11 não pagou nada nos 3 meses
  assert.deepEqual(al.map((a) => a.t), ["UVWX11"]);
  assert.equal(al[0].mes, "2026-11");
  // texto da página: factual, sem palavras proibidas
  const txt = trecho('if (a.tipo === "fora-do-retrato")', "\n");
  assert.ok(txt.includes("não aparece nos proventos a receber de"), txt);
});

test("Meta: Este mês contra o plano soma o que ainda cai no mês", () => {
  const c = calcCom(retratoFixo("proventos-a-receber-2026-11-10.xlsx"));
  const p = projecao({ alvo: 1000, aporte: 500, yield: 0.1, reinvestir: true }, c, HOJE).mesPlano;
  perto(p.aReceber, 114 + 37.4 + 20);
  perto(p.comAReceber, p.proventos + p.aReceber);
  assert.equal(p.retrato, "2026-11-10");
  const sem = projecao({ alvo: 1000, aporte: 500, yield: 0.1, reinvestir: true }, calcCom(null), HOJE).mesPlano;
  assert.equal(sem.aReceber, 0);
  assert.equal(p.contra, sem.contra); // o contra o plano é do que já aconteceu
});

// ---------- rota ----------
const CHAVE = Buffer.alloc(32, 7).toString("base64");
function ambiente() {
  const env = { DB: d1Falso(), CARTEIRA_KEY: CHAVE };
  env.DB.db.prepare("INSERT INTO docs (collection, id, data) VALUES ('meta', 'b3', ?), ('meta', 'fii-resumo', ?)").run(JSON.stringify(b3), JSON.stringify(fiiResumo));
  const esp = espelhoFalso();
  const chamar = async (metodo, caminho, corpo, hoje = HOJE) => {
    limparCacheCarteira("eu@x.com");
    const r = await rotaCarteira(new Request("https://x/api/carteira/" + caminho, { method: metodo, headers: { "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined }), env, { email: "eu@x.com" }, caminho, { ...esp, hoje });
    return { status: r.status, j: await r.json() };
  };
  const doc = async (id) => { const r = env.DB.db.prepare("SELECT data FROM docs WHERE collection = ? AND id = ?").get("carteira/eu@x.com", id); return r ? { cifrado: r.data, ...(await decifrar(env, r.data)) } : null; };
  return { env, chamar, doc };
}

test("rota: prévia, importação junto com os extratos, reimportação, retrato antigo e desfazer", async () => {
  const { chamar, doc } = ambiente();
  const arec = envio(aReceberPlanilha);
  // prévia: o arquivo fica no lugar dele na lista, com a data e a conferência do total
  const pv = await chamar("POST", "importar", { simular: true, arquivos: [...arquivos(), arec] });
  assert.equal(pv.status, 200);
  const pa = pv.j.porArquivo[3];
  assert.equal(pa.tipo, "areceber"); assert.equal(pa.linhas, 8); assert.equal(pa.novos, 8);
  assert.deepEqual({ dataRef: pa.retrato.dataRef, status: pa.retrato.status, confere: pa.retrato.confere, totalArquivo: pa.retrato.totalArquivo }, { dataRef: "2026-11-10", status: "novo", confere: true, totalArquivo: 287.9 });
  assert.equal(await doc("areceber"), null);
  // importa tudo de uma vez
  const im = await chamar("POST", "importar", { arquivos: [...arquivos(), arec] });
  assert.equal(im.j.gravado, true);
  const d = await doc("areceber");
  assert.equal(d.atual.dataRef, "2026-11-10"); assert.equal(d.atual.linhas.length, 8); assert.equal(d.anterior, null);
  // nada de conta, nome de produto ou razão social no que foi guardado
  const guardado = JSON.stringify(d);
  for (const x of ["0001234", "0009876", "FUNDO QRST", "EMPRESA", "CCTVM", "conta"]) assert.ok(!guardado.includes(x), x);
  // GET: o card usa as linhas da B3
  const g = await chamar("GET", "");
  assert.equal(g.j.resumo.retrato.dataRef, "2026-11-10");
  assert.ok(g.j.resumo.aReceber.some((x) => x.origem === "b3" && x.t === "QRST11" && x.data === "2026-11-13"));
  assert.deepEqual(g.j.importacoes[0].retrato, { dataRef: "2026-11-10", linhas: 8 });
  // o mesmo arquivo de novo (com o outro nome): nada muda
  const de = await chamar("POST", "importar", { arquivos: [{ ...arec, nome: "eventos-2026-11-10-18-00-00.xlsx" }] });
  assert.equal(de.j.gravado, false); assert.equal(de.j.porArquivo[0].retrato.status, "igual"); assert.equal(de.j.porArquivo[0].repetidos, 8);
  // retrato mais novo, sem o JCP: substitui
  const menos = { ...arec, nome: "proventos-a-receber-2026-11-12.xlsx", linhas: arec.linhas.filter((l) => l[1] !== "JUROS SOBRE CAPITAL PRÓPRIO") };
  const nv = await chamar("POST", "importar", { arquivos: [menos] }, "2026-11-12");
  assert.equal(nv.j.gravado, true); assert.equal(nv.j.porArquivo[0].retrato.substitui, "2026-11-10");
  assert.equal(nv.j.porArquivo[0].retrato.confere, false); // a linha do total ainda conta o JCP
  const d2 = await doc("areceber");
  assert.equal(d2.atual.linhas.length, 7); assert.equal(d2.anterior.dataRef, "2026-11-10");
  // retrato mais antigo que o guardado: recusado, com a data do guardado
  const vl = await chamar("POST", "importar", { arquivos: [{ ...arec, nome: "proventos-a-receber-2026-11-01.xlsx", linhas: arec.linhas.slice(1) }] }, "2026-11-12");
  assert.equal(vl.j.gravado, false); assert.equal(vl.j.porArquivo[0].retrato.status, "antigo"); assert.equal(vl.j.porArquivo[0].retrato.guardado, "2026-11-12");
  assert.equal((await doc("areceber")).atual.dataRef, "2026-11-12");
  // desfazer a importação do retrato de 12/11 volta o de 10/11
  const ds = await chamar("DELETE", "importacoes/" + nv.j.importacao, null, "2026-11-12");
  assert.equal(ds.j.ok, true); assert.equal(ds.j.retrato, "2026-11-10");
  assert.equal((await doc("areceber")).atual.linhas.length, 8);
  // e apagar a carteira leva o retrato junto
  await chamar("DELETE", "");
  assert.equal(await doc("areceber"), null);
});

test("reembolso sem quantidade (\"-\" no relatório): a linha entra pelo valor líquido", async () => {
  const { normalizarAReceber } = await import("../src/carteira.js");
  const r = normalizarAReceber(["ABCD3 - EMPRESA ABCD S.A.", "Reembolso - DIVIDENDO", "31/12/2026", "XP INVESTIMENTOS CCTVM S/A.", "-", 0.14, 15.13]);
  assert.equal(r.erro, undefined);
  assert.equal(r.linha.q, null); assert.equal(r.linha.valor, 15.13); assert.equal(r.linha.tipo, "reembolso"); assert.equal(r.linha.d, "2026-12-31");
  assert.equal(normalizarAReceber(["ABCD3 - EMPRESA ABCD S.A.", "DIVIDENDO", "31/12/2026", "XP", "-5", 0.14, 15.13]).erro, "numero");
});

// Soma do A receber (pedido de 10/11): o total da B3 e o da estimativa nunca se misturam, o que fica mais adiante sai
// da soma e "ainda neste mês" é só a parte da B3 com data no mês
test("soma do A receber: B3 e estimativa separadas, sem o que fica mais adiante", () => {
  const { somaAReceber } = new Function(`${trecho("const somaV = ", "\n")}\n${trecho("function somaAReceber(", "\n}\n")}\n}\nreturn { somaAReceber };`)();
  const l = [
    { t: "QRST11", origem: "b3", data: "2026-11-13", valor: 104.5 },
    { t: "EFGH4", origem: "b3", data: "2026-11-28", valor: 66.9 },
    { t: "ABCD3", origem: "b3", data: "2026-12-15", valor: 31 },
    { t: "ABCD3", origem: "b3", data: "2028-03-10", valor: 52.5, adiante: true },
    { t: "UVWX11", origem: "estimativa", data: null, valor: 9 },
  ];
  const s = somaAReceber(l, "2026-11-10");
  perto(s.b3, 202.4); perto(s.est, 9); perto(s.noMes, 171.4);
  assert.equal(s.nB3, 3); assert.equal(s.nEst, 1);
  const so = somaAReceber(l.filter((x) => x.origem !== "b3"), "2026-11-10");
  assert.deepEqual([so.b3, so.est, so.noMes], [0, 9, 0]);
  // e o cálculo do Worker manda as duas origens marcadas, para a página somar separado
  const c = calcCom(retratoFixo("proventos-a-receber-2026-11-10.xlsx"));
  const sc = somaAReceber(c.resumo.aReceber, HOJE);
  perto(sc.b3 + sc.est, c.resumo.aReceber.filter((x) => !x.adiante).reduce((a, x) => a + x.valor, 0));
  perto(sc.b3, c.resumo.aReceber.filter((x) => x.origem === "b3" && !x.adiante).reduce((a, x) => a + x.valor, 0));
});
