// Pacote 2 das Minhas listas: modelo (descrição, ligada, regra, fixos e excluídos), materializar, histórico,
// comparações com a carteira, sugestões, rota (POST, PUT, recalcular, ordem, mover) e o cron do minuto 41;
// mais os formatos do painel do Início. Dados inventados (test/fixtures-radar.mjs), D1 em SQLite do Node.
import test from "node:test";
import assert from "node:assert/strict";
import { validarLista, validarRegra, materializar, diffDinamica, diffManual, registrar, aplicarRegra, cronListas, rotaListas, resumoParaColecao, moverPapel, HIST_MAX, PAPEIS_MAX } from "../src/listas.js";
import { validarPainel, respostaPainel, formatosDe, migrarFormato } from "../src/painel.js";
import "../public/radar-filtro.js";
import { b3, fiiResumo } from "./fixtures-radar.mjs";
import { d1Falso, espelhoFalso } from "./d1-falso.mjs";

const RF = globalThis.RadarFiltro;
const dados = { b3, fiiResumo, fund: { BR: {}, US: {} } };
const REGRA = { classe: "fiis", criterios: { pvpMax: 1, dyMin: 10, liqMin: 1e6, regular: "12", ordem: "cotistas" } };
const regraOk = () => validarRegra(REGRA).regra;

// ---------- modelo ----------

test("validarLista: campos novos e os erros de cada um", () => {
  const v = validarLista({ nome: "Renda", papeis: ["HGLG11"], descricao: "  Linha 1\r\n\r\n\r\n- **item**  ", ativa: false, regra: REGRA, fixos: ["KNRI11"], excluidos: ["MXRF11"], cor: "verde", posicao: 3 });
  assert.equal(v.erro, undefined);
  assert.equal(v.descricao, "Linha 1\n\n- **item**", "CRLF vira LF, três quebras viram duas, espaço das pontas sai");
  assert.equal(v.ativa, false);
  assert.equal(v.regra.classe, "fiis");
  assert.equal(v.regra.criterios.pvpMax, 1);
  assert.equal(v.regra.criterios.semMinhas, undefined, "semMinhas e aporte não entram na regra");
  assert.deepEqual(v.fixos, ["KNRI11"]);
  assert.equal(v.posicao, 3);
  assert.ok(validarLista({ nome: "X", descricao: "a".repeat(4001) }).erro);
  assert.ok(validarLista({ nome: "X", descricao: 12 }).erro);
  assert.ok(validarLista({ nome: "X", ativa: "sim" }).erro);
  assert.ok(validarLista({ nome: "X", regra: { classe: "cripto" } }).erro);
  assert.ok(validarLista({ nome: "X", regra: { classe: "fiis", criterios: { pvpMax: 99 } } }).erro, "fora do intervalo do Radar");
  assert.match(validarLista({ nome: "X", fixos: ["HGLG11"], excluidos: ["HGLG11"] }).erro, /fixos e nos excluídos/);
  assert.ok(validarLista({ nome: "X", fixos: ["hglg11"] }).erro);
  assert.ok(validarLista({ nome: "X", cor: "rosa-choque" }).erro);
  assert.ok(validarLista({ nome: "X", posicao: -1 }).erro);
  assert.equal(validarLista({ nome: "X", regra: null }).regra, null, "null apaga a regra");
  // as classes da B3 que o Radar não mostra também valem numa regra
  assert.equal(validarRegra({ classe: "fiinfra", criterios: { liqMin: 5e5 } }).regra.criterios.liqMin, 5e5);
  assert.ok(RF.validarFiltro({ id: "x", nome: "x", classe: "fiinfra" }).erro, "o Radar continua só com FIIs, Ações e EUA");
});

test("a FII-Core-2026-11 de produção (descrição gravada direto no D1) passa na validação", () => {
  const doc = { nome: "FII-Core-2026-11", papeis: ["HGLG11", "BTLG11", "BRCO11", "KNRI11", "HGRU11", "GARE11", "KNCR11", "KNSC11", "HGCR11", "XPCI11", "MXRF11", "KNHF11"],
    criado: "2026-11-03T19:45:00.000Z", atualizado: "2026-11-03T19:45:00.000Z",
    descricao: "Criada em 03/11/2026.\n\nCritérios aplicados com dado real: liquidez > R$ 1,5 mi/dia; 12 pagamentos em 12 meses.\n\nNada aqui é recomendação." };
  const v = validarLista(doc);
  assert.equal(v.erro, undefined);
  assert.equal(v.descricao, doc.descricao);
  assert.equal(resumoParaColecao(doc).histN, 0, "sem histórico: a página mostra vazio, sem quebrar");
});

// ---------- materializar ----------

test("materializar: quem passa, na ordem da regra, com o motivo de entrada", () => {
  const m = materializar(regraOk(), dados);
  assert.deepEqual(m.papeis, ["PASA11", "PASB11", "PASC11", "PASD11", "CAIR11", "PVPX11", "EXTR11", "QUED11", "TENH11", "SEGX11", "PAPA11", "PAPB11", "PERD11"], "por entrada de cotistas (empate: a ordem da B3)");
  assert.equal(m.motivos.PASA11, "P/VP 0,90, DY 13,3%");
  assert.ok(m.falha.get("CARO11").some((f) => f.k === "pvp"));
  assert.equal(m.cortados.length, 0);
});

test("materializar: fixos sempre entram, excluídos nunca, e o corte em 60 segue a ordem da regra", () => {
  const m = materializar(regraOk(), dados, { fixos: ["CARO11", "TENH11"], excluidos: ["PASB11", "TENH11"] });
  assert.equal(m.papeis[0], "CARO11", "fixo entra primeiro mesmo sem passar");
  assert.ok(!m.papeis.includes("PASB11") && !m.papeis.includes("TENH11"), "excluído ganha do fixo");
  // 70 FIIs iguais: entram 60, 10 cortados pela ordem (liquidez, a maior primeiro)
  const linhas = Array.from({ length: 70 }, (_, k) => ({ t: "LOTE" + (k + 10) + "11", classe: "fiis", temCvm: true, preco: 9, pvp: 0.9, dy: 12, liq: 1e7 - k * 1000, pg: 12, m12: 12, cotMes: 0 }));
  const r = materializar({ classe: "fiis", criterios: { ...regraOk().criterios, ordem: "liq" } }, { linhas }, { fixos: ["FIXO11"] });
  assert.equal(r.papeis.length, PAPEIS_MAX);
  assert.equal(r.papeis[0], "FIXO11");
  assert.equal(r.cortados.length, 11);
  assert.equal(r.cortados[0], "LOTE6911", "o fixo ocupa uma vaga; os de menor liquidez ficam de fora");
});

test("materializar: só papéis que tenho", () => {
  const m = materializar({ ...regraOk(), soCarteira: true }, { ...dados, posicoes: [{ t: "PASA11", q: 10 }, { t: "CARO11", q: 5 }, { t: "PASB11", q: 0 }] });
  assert.deepEqual(m.papeis, ["PASA11"]);
  assert.equal(m.falha.get("PASD11")[0].k, "carteira");
});

// ---------- histórico ----------

test("histórico: diff entre duas materializações com o motivo de cada saída", () => {
  const antes = ["PASA11", "CARO11", "MXRF11", "PASB11"];
  const m = materializar(regraOk(), dados, { excluidos: ["PASB11"] });
  const h = diffDinamica(antes, m, { quando: "2026-11-03T13:41:00Z", excluidos: ["PASB11"] });
  const por = Object.fromEntries(h.map((x) => [x.papel + ":" + x.acao, x.motivo]));
  assert.equal(por["TENH11:entrou"], "P/VP 0,90, DY 13,3%");
  assert.match(por["CARO11:saiu"], /P\/VP foi a 1,20, acima de 1,00/);
  assert.equal(por["MXRF11:saiu"], "ficou fora das cotações do Lookout");
  assert.equal(por["PASB11:saiu"], "excluído da regra por você");
  assert.ok(!por["PASA11:entrou"] && !por["PASA11:saiu"], "quem ficou não aparece");
  // mudança de regra vira o motivo
  const h2 = diffDinamica(["CARO11"], m, { quando: "x", motivoRegra: "regra alterada: DY 12m mínimo 10% → 9%" });
  assert.ok(h2.every((x) => x.motivo === "regra alterada: DY 12m mínimo 10% → 9%"));
  assert.deepEqual(RF.mudancasRegra(regraOk(), validarRegra({ ...REGRA, criterios: { ...REGRA.criterios, dyMin: 9 } }).regra), ["DY 12m mínimo 10% → 9%"]);
  // manual
  assert.deepEqual(diffManual(["A"], ["B"], "q").map((x) => x.motivo), ["adicionado por você", "removido por você"]);
});

test("histórico: guarda as 500 mais novas", () => {
  const velho = Array.from({ length: 499 }, (_, k) => ({ quando: String(k), papel: "X", acao: "entrou", motivo: "" }));
  const h = registrar(velho, [{ quando: "novo1" }, { quando: "novo2" }]);
  assert.equal(h.length, HIST_MAX);
  assert.equal(h[0].quando, "1", "a mais antiga caiu");
  assert.equal(h[h.length - 1].quando, "novo2");
  assert.equal(resumoParaColecao({ historico: [{ quando: "2020-01-01T00:00:00Z" }, { quando: new Date().toISOString() }] }).historico.length, 1, "a coleção manda só os últimos 7 dias");
});

// ---------- comparações e sugestões ----------

test("comparações da carteira: para empatar e DY sobre custo", () => {
  assert.equal(RF.paraEmpatar(10, 8), 25, "de R$ 8 para R$ 10 são 25%");
  assert.equal(RF.paraEmpatar(10, 12), 0, "acima do preço médio");
  assert.equal(RF.paraEmpatar(null, 8), null);
  assert.equal(RF.dySobreCusto(120, 1000), 12);
  assert.equal(RF.dySobreCusto(120, 0), null);
});

test("sugestões: duas variações por critério numérico ligado, com quem entraria e quem sairia", () => {
  const linhas = RF.linhasDe("fiis", dados);
  const f = { ...regraOk().criterios, classe: "fiis", id: "r", nome: "r", semMinhas: false, aporte: 0 };
  const vs = RF.variacoes(linhas, f, { posicoes: new Map(), patrimonio: 0 });
  assert.deepEqual([...new Set(vs.map((v) => v.campo))], ["pvpMax", "dyMin", "liqMin"]);
  assert.equal(vs.filter((v) => v.campo === "dyMin").length, 2);
  const pvpFolgado = vs.find((v) => v.campo === "pvpMax" && v.valor === 1.05);
  assert.deepEqual(pvpFolgado.sairiam, []);
  const dyApertado = vs.find((v) => v.campo === "dyMin" && v.valor === 11);
  assert.ok(dyApertado.sairiam.length === 0 || dyApertado.sairiam.every((t) => typeof t === "string"));
  const liq = vs.find((v) => v.campo === "liqMin" && v.valor === 1.5e6);
  assert.ok(liq.sairiam.length >= 0);
  assert.equal(RF.fraseRegra("fiis", f), "FIIs · P/VP até 1,00 · DY 12m mínimo 10% · liquidez mínima R$ 1 mi · 12 de 12 meses · ordenado por entrada de cotistas");
});

// ---------- rota ----------

function ambiente() {
  const env = { DB: d1Falso() };
  const esp = espelhoFalso();
  const deps = { ...esp, dados: async () => dados, posicoes: async () => [] };
  const col = "listas/eu@x.com";
  const chamar = async (metodo, id, corpo) => {
    const r = await rotaListas(new Request("https://x/api/listas" + (id ? "/" + id : ""), { method: metodo, headers: { "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined }), env, { email: "eu@x.com" }, id, deps);
    return { status: r.status, j: await r.json() };
  };
  const doc = (id) => JSON.parse(env.DB.db.prepare("SELECT data FROM docs WHERE collection = ? AND id = ?").get(col, id).data);
  const por = (id, d) => env.DB.db.prepare("INSERT INTO docs (collection, id, data) VALUES (?, ?, ?)").run(col, id, JSON.stringify(d));
  return { env, esp, deps, chamar, doc, por, col };
}

test("POST com regra materializa e começa o histórico; PUT parcial guarda a descrição sem perder os papéis", async () => {
  const { chamar, doc } = ambiente();
  const r = await chamar("POST", "", { nome: "FIIs por regra", regra: REGRA, papeis: ["ABCD3"] });
  assert.equal(r.status, 200);
  const id = r.j.id, d = doc(id);
  assert.equal(d.papeis.length, 13, "os papéis vêm da regra, não do corpo");
  assert.equal(d.historico[0].acao, "criada");
  assert.equal(d.historico[0].motivo, "criada com 13 papéis");
  assert.ok(d.calculado);
  const p = await chamar("PUT", id, { descricao: "Por que existe." });
  assert.equal(p.status, 200);
  assert.equal(doc(id).descricao, "Por que existe.");
  assert.deepEqual(doc(id).papeis, d.papeis);
  assert.equal(doc(id).historico.length, 1, "descrição não entra no histórico");
  // regra alterada: DY mínimo 13,5% derruba quem tem 13,3%
  const q = await chamar("PUT", id, { regra: { ...REGRA, criterios: { ...REGRA.criterios, dyMin: 13.5 } } });
  assert.equal(q.status, 200);
  const h = doc(id).historico;
  assert.ok(h.length > 1);
  assert.ok(h.slice(1).every((x) => x.motivo === "regra alterada: DY 12m mínimo 10% → 13,5%"), JSON.stringify(h.slice(1, 3)));
  // fixar e excluir
  await chamar("PUT", id, { fixos: ["CARO11"] });
  assert.equal(doc(id).papeis[0], "CARO11");
  assert.equal(doc(id).historico.at(-1).motivo, "fixado por você");
  await chamar("PUT", id, { excluidos: ["CARO11"], fixos: [] });
  assert.ok(!doc(id).papeis.includes("CARO11"));
  assert.equal(doc(id).historico.at(-1).motivo, "excluído da regra por você");
});

test("PUT da lista manual registra o que entrou e saiu; com regra de referência continua manual", async () => {
  const { chamar, doc, por } = ambiente();
  por("renda-0001", { nome: "Renda", papeis: ["PASA11", "CARO11"], criado: "2026-11-01" });
  await chamar("PUT", "renda-0001", { nome: "Renda", papeis: ["PASA11", "PASB11"] });
  const h = doc("renda-0001").historico;
  assert.deepEqual(h.map((x) => `${x.acao} ${x.papel} ${x.motivo}`), ["entrou PASB11 adicionado por você", "saiu CARO11 removido por você"]);
  await chamar("PUT", "renda-0001", { regra: { ...REGRA, referencia: true } });
  assert.deepEqual(doc("renda-0001").papeis, ["PASA11", "PASB11"], "regra de referência não mexe nos papéis");
  assert.equal(doc("renda-0001").regra.referencia, true);
});

test("automática: PUT só liga, desliga e descreve; a importação guarda isso e registra no histórico", async () => {
  const { chamar, doc, por } = ambiente();
  por("carteira-fiis", { nome: "Carteira · FIIs", papeis: ["PASA11"], auto: true, classe: "fii", criado: "2026-11-01" });
  assert.equal((await chamar("PUT", "carteira-fiis", { nome: "Outra" })).status, 400);
  assert.equal((await chamar("PUT", "carteira-fiis", { ativa: false, descricao: "Só FIIs" })).status, 200);
  assert.equal(doc("carteira-fiis").ativa, false);
  const { planoSincronia } = await import("../src/listas.js");
  const p = planoSincronia({ "carteira-fiis": doc("carteira-fiis") }, { "carteira-fiis": ["PASA11", "PASB11"] }, "2026-11-03T15:00:00.000Z");
  const novo = p.gravar[0].doc;
  assert.equal(novo.ativa, false);
  assert.equal(novo.descricao, "Só FIIs");
  assert.equal(novo.historico.at(-1).motivo, "importação de 03/11");
});

test("recalcular: só lista por regra, uma vez a cada 5 minutos", async () => {
  const { chamar, por } = ambiente();
  por("din-0001", { nome: "Din", papeis: ["CARO11"], regra: regraOk(), criado: "2026-11-01" });
  por("man-0002", { nome: "Man", papeis: [], criado: "2026-11-01" });
  assert.equal((await chamar("POST", "man-0002/recalcular", {})).status, 400);
  const r = await chamar("POST", "din-0001/recalcular", {});
  assert.equal(r.status, 200);
  assert.equal(r.j.mudou, true);
  assert.ok(r.j.novas.some((x) => x.papel === "CARO11" && x.acao === "saiu"));
  const r2 = await chamar("POST", "din-0001/recalcular", {});
  assert.equal(r2.status, 429);
  assert.ok(r2.j.aguarde > 0 && r2.j.aguarde <= 300);
});

test("GET de uma lista dinâmica recalcula se o cálculo passou de 1 h; a coleção vem na ordem de posicao", async () => {
  const { chamar, por, doc } = ambiente();
  por("din-0001", { nome: "Din", papeis: [], regra: regraOk(), criado: "2026-11-01", calculado: "2026-01-01T00:00:00Z", posicao: 1 });
  por("man-0002", { nome: "Man", papeis: [], criado: "2026-11-02", posicao: 0 });
  const g = await chamar("GET", "din-0001");
  assert.equal(g.j.data.papeis.length, 13);
  assert.equal(doc("din-0001").papeis.length, 13, "gravou");
  const c = await chamar("GET", "");
  assert.deepEqual(c.j.docs.map((d) => d.id), ["man-0002", "din-0001"]);
  // ordem nova
  const o = await chamar("PUT", "ordem", { ids: ["din-0001", "man-0002"] });
  assert.equal(o.j.mudaram, 2);
  assert.equal(doc("din-0001").posicao, 0);
  assert.equal((await chamar("PUT", "ordem", { ids: ["din-0001", "din-0001"] })).status, 400);
});

test("mover para lista por regra entra nos fixos; tirar de uma por regra entra nos excluídos", () => {
  const din = { id: "din", doc: { nome: "Din", papeis: ["PASA11"], regra: regraOk() } };
  const man = { id: "man", doc: { nome: "Man", papeis: ["CARO11"] } };
  const r = moverPapel(man, din, "CARO11", false, "q");
  assert.deepEqual(r.para.fixos, ["CARO11"]);
  assert.equal(r.para.historico[0].motivo, "movido de “Man”");
  assert.equal(r.de.historico[0].motivo, "movido para “Din”");
  const r2 = moverPapel(din, man, "PASA11", false, "q");
  assert.deepEqual(r2.de.excluidos, ["PASA11"]);
});

test("cron do minuto 41: recalcula as ligadas por regra e grava só as que mudaram", async () => {
  const { env, esp, deps, por, doc } = ambiente();
  const igual = aplicarRegra({ nome: "Igual", papeis: [], regra: regraOk() }, dados, "t").doc;
  por("igual-0001", igual);
  por("velha-0002", { nome: "Velha", papeis: ["CARO11"], regra: regraOk() });
  por("off-0003", { nome: "Off", papeis: ["CARO11"], regra: regraOk(), ativa: false });
  por("man-0004", { nome: "Man", papeis: ["CARO11"] });
  assert.equal(await cronListas(env, Date.parse("2026-11-03T13:40:00Z"), deps), null, "fora do minuto 41 não faz nada");
  const r = await cronListas(env, Date.parse("2026-11-03T13:41:00Z"), deps);
  assert.deepEqual(r, { listas: 2, mudaram: 1 });
  assert.equal(doc("velha-0002").papeis.length, 13);
  assert.ok(doc("velha-0002").historico.some((x) => x.papel === "CARO11" && x.acao === "saiu"));
  assert.deepEqual(doc("off-0003").papeis, ["CARO11"], "desligada fica como está");
  assert.equal(esp.gravados.length, 1, "write-through só da que mudou");
});

// ---------- painel do Início ----------

test("painel: formatos por widget, validação e migração do tamanho antigo", () => {
  assert.deepEqual(formatosDe("pregao"), ["2x1", "3x1", "2x2"]);
  assert.deepEqual(formatosDe("destaques-tech"), ["1x1", "1x2"]);
  assert.deepEqual(formatosDe("hoje"), ["1x1"]);
  assert.deepEqual(validarPainel({ widgets: [{ id: "pregao", formato: "2x2" }, { id: "listas", formato: "1x2" }] }, null).widgets, [{ id: "pregao", formato: "2x2" }, { id: "listas", formato: "1x2" }]);
  assert.match(validarPainel({ widgets: [{ id: "hoje", formato: "2x1" }] }, null).erro, /Formato inválido em hoje/);
  assert.ok(validarPainel({ widgets: [{ id: "hoje" }] }, null).erro);
  // página antiga mandando tamanho
  assert.deepEqual(validarPainel({ widgets: [{ id: "eua", tamanho: 2 }, { id: "carteira-meta", tamanho: 1 }] }, null).widgets, [{ id: "eua", formato: "2x1" }, { id: "carteira-meta", formato: "2x1" }]);
  assert.equal(migrarFormato("hoje", { tamanho: 2 }), "1x1", "o que não cabe vira o primeiro formato do widget");
  const r = respostaPainel({ widgets: [{ id: "pregao", tamanho: 2 }, { id: "mercado", tamanho: 1 }] }, null);
  assert.deepEqual(r.widgets, [{ id: "pregao", formato: "2x1" }, { id: "mercado", formato: "1x1" }]);
  assert.deepEqual(r.catalogo.find((w) => w.id === "radar-meu").formatos, ["1x1", "2x1", "2x2"]);
  assert.equal(respostaPainel(null, null).widgets[0].formato, "1x1");
});
