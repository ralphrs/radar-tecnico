// Tabela única (public/tabela.js), estado salvo (src/prefs.js), FI-Infra e Fiagro separados (src/mercado.js),
// proventos do Yahoo na ficha (src/papel.js), classes da carteira e ordem das Minhas listas. Papéis e números inventados.
import test from "node:test";
import assert from "node:assert/strict";
import "../public/tabela.js";
import { validarTabelas, mesclarTabelas, respostaTabelas, validarLayout, respostaLayout, MAX_TABELAS } from "../src/prefs.js";
import { separarFundos } from "../src/mercado.js";
import { lerDividendosYahoo } from "../src/papel.js";
import { classeDe } from "../src/carteira.js";
import { validarLista, papeisDaCarteira } from "../src/listas.js";

const T = globalThis.Tabela;
const COLS = [
  { id: "t", rotulo: "Papel", tipo: "texto", valor: (x) => x.t },
  { id: "seg", rotulo: "Segmento", tipo: "texto", valor: (x) => x.seg },
  { id: "dy", rotulo: "DY", tipo: "num", valor: (x) => x.dy, unidade: "%" },
  { id: "pvp", rotulo: "P/VP", tipo: "num", valor: (x) => x.pvp },
  { id: "d", rotulo: "Pagamento", tipo: "data", valor: (x) => x.d },
  { id: "corr", rotulo: "Corretora", tipo: "texto", valor: (x) => x.corr.join(", "), valores: (x) => x.corr },
];
const L = [
  { t: "AAAA11", seg: "Logística", dy: 10, pvp: 0.9, d: "2026-10-15", corr: ["XP"] },
  { t: "BBBB11", seg: "Papel", dy: 12, pvp: 1.05, d: "2026-09-15", corr: ["Rico"] },
  { t: "CCCC11", seg: "Logística", dy: null, pvp: 0.8, d: "2026-10-01", corr: ["XP", "Modal"] },
  { t: "DDDD11", seg: "Shoppings", dy: 10, pvp: null, d: "", corr: [] },
  { t: "ÉEEE11", seg: "papel", dy: 8, pvp: 1, d: "2026-08-20", corr: ["Modal"] },
];
const ts = (l) => l.map((x) => x.t);

test("ordenação: número como número, texto pt-BR, vazio sempre no fim, estável", () => {
  assert.deepEqual(ts(T.ordenar(L, COLS, [{ c: "dy", d: -1 }])), ["BBBB11", "AAAA11", "DDDD11", "ÉEEE11", "CCCC11"]);
  assert.deepEqual(ts(T.ordenar(L, COLS, [{ c: "dy", d: 1 }])), ["ÉEEE11", "AAAA11", "DDDD11", "BBBB11", "CCCC11"]);
  // empate em DY 10 (AAAA e DDDD) mantém a ordem de entrada
  assert.deepEqual(ts(T.ordenar([L[3], L[0]], COLS, [{ c: "dy", d: -1 }])), ["DDDD11", "AAAA11"]);
  // texto ignora acento e caixa: "papel" e "Papel" empatam e "É" vem junto do "E"
  assert.deepEqual(ts(T.ordenar(L, COLS, [{ c: "t", d: 1 }])), ["AAAA11", "BBBB11", "CCCC11", "DDDD11", "ÉEEE11"]);
  assert.deepEqual(ts(T.ordenar(L, COLS, [])), ts(L));
});

test("ordenação por vários critérios: segundo critério só desempata", () => {
  const o = T.ordenar(L, COLS, [{ c: "seg", d: 1 }, { c: "pvp", d: 1 }]);
  assert.deepEqual(ts(o), ["CCCC11", "AAAA11", "ÉEEE11", "BBBB11", "DDDD11"]);
  const o2 = T.ordenar(L, COLS, [{ c: "dy", d: -1 }, { c: "pvp", d: -1 }]);
  assert.deepEqual(ts(o2).slice(0, 3), ["BBBB11", "AAAA11", "DDDD11"]); // DDDD sem P/VP fica depois no empate
});

test("clique e Shift+clique no cabeçalho", () => {
  let o = T.cliqueOrdem([], "dy", false, -1);
  assert.deepEqual(o, [{ c: "dy", d: -1 }]);
  o = T.cliqueOrdem(o, "dy", false, -1);
  assert.deepEqual(o, [{ c: "dy", d: 1 }]);
  assert.deepEqual(T.cliqueOrdem(o, "dy", false, -1), []); // terceiro clique limpa
  o = T.cliqueOrdem([{ c: "dy", d: -1 }], "pvp", true, 1);
  assert.deepEqual(o, [{ c: "dy", d: -1 }, { c: "pvp", d: 1 }]);
  o = T.cliqueOrdem(o, "pvp", true, 1);
  assert.deepEqual(o, [{ c: "dy", d: -1 }, { c: "pvp", d: -1 }]);
  assert.deepEqual(T.cliqueOrdem(o, "pvp", true, 1), [{ c: "dy", d: -1 }]);
  // clique sem Shift numa ordem múltipla vira um critério só
  assert.deepEqual(T.cliqueOrdem(o, "t", false, 1), [{ c: "t", d: 1 }]);
  // no máximo 5 critérios
  let m = [];
  for (const c of ["a", "b", "c", "d", "e", "f"]) m = T.cliqueOrdem(m, c, true, 1);
  assert.equal(m.length, 5);
});

test("filtros por tipo: faixa numérica, texto contém, valores marcados, datas", () => {
  assert.deepEqual(ts(T.filtrar(L, COLS, { pvp: { max: 1 } })), ["AAAA11", "CCCC11", "ÉEEE11"]); // sem P/VP não passa
  assert.deepEqual(ts(T.filtrar(L, COLS, { dy: { min: 9, max: 11 } })), ["AAAA11", "DDDD11"]);
  assert.deepEqual(ts(T.filtrar(L, COLS, { seg: { q: "PAP" } })), ["BBBB11", "ÉEEE11"]);
  assert.deepEqual(ts(T.filtrar(L, COLS, { seg: { q: "xx", vals: ["Logística", "Shoppings"] } })), ["AAAA11", "CCCC11", "DDDD11"]); // marcados mandam
  assert.deepEqual(ts(T.filtrar(L, COLS, { corr: { vals: ["Modal"] } })), ["CCCC11", "ÉEEE11"]); // vários valores por linha
  assert.deepEqual(ts(T.filtrar(L, COLS, { d: { de: "2026-09-01", ate: "2026-10-10" } })), ["BBBB11", "CCCC11"]);
  assert.deepEqual(ts(T.filtrar(L, COLS, { pvp: { max: 1 }, seg: { vals: ["Logística"] } })), ["AAAA11", "CCCC11"]);
  assert.equal(T.filtrar(L, COLS, { pvp: {} }).length, L.length); // filtro vazio não conta
});

test("sugestões: valores que existem, os mais frequentes primeiro, até 12", () => {
  const s = T.sugestoes(L, COLS[1], "");
  assert.deepEqual(s[0], { v: "Logística", n: 2 });
  assert.equal(T.sugestoes(L, COLS[1], "log").length, 1);
  const muitos = Array.from({ length: 30 }, (_, i) => ({ seg: "S" + i }));
  assert.equal(T.sugestoes(muitos, COLS[1], "").length, 12);
});

test("chips: texto dos filtros ativos", () => {
  assert.equal(T.textoFiltro(COLS[3], { max: 1 }), "P/VP ≤ 1");
  assert.equal(T.textoFiltro(COLS[3], { max: 1.05 }), "P/VP ≤ 1,05");
  assert.equal(T.textoFiltro(COLS[2], { min: 8, max: 12 }), "DY de 8% a 12%");
  assert.equal(T.textoFiltro(COLS[1], { vals: ["Logística", "Papel"] }), "Segmento: Logística, Papel");
  assert.equal(T.textoFiltro(COLS[0], { q: "hg" }), "Papel contém “hg”");
  assert.equal(T.textoFiltro(COLS[4], { de: "2026-01-01" }), "Pagamento desde 01/01/2026");
});

test("paginação com elipse e limites", () => {
  assert.deepEqual(T.paginas(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(T.paginas(1, 10), [1, 2, 3, 4, 5, "…", 10]);
  assert.deepEqual(T.paginas(5, 10), [1, "…", 4, 5, 6, "…", 10]);
  assert.deepEqual(T.paginas(10, 10), [1, "…", 6, 7, 8, 9, 10]);
  assert.deepEqual(T.paginar(130, 3, 25), { pagina: 3, total: 6, ini: 50, fim: 75, porPagina: 25 });
  assert.equal(T.paginar(130, 99, 50).pagina, 3); // página além do fim volta para a última
  assert.equal(T.paginar(0, 2, 25).pagina, 1);
  assert.equal(T.paginar(10, 1, 33).porPagina, 25); // por página fora das opções vira 25
});

test("estado: serializa, lê de volta e recusa o que não presta", () => {
  const e = { ordem: [{ c: "dy", d: -1 }, { c: "pvp", d: 1 }], filtros: { pvp: { max: 1 }, seg: { vals: ["Papel"], q: "" }, nada: {} }, pagina: 2, porPagina: 50 };
  const txt = T.serializar(e);
  assert.deepEqual(JSON.parse(txt), { ordem: e.ordem, filtros: { pvp: { max: 1 }, seg: { vals: ["Papel"] } }, pagina: 2, porPagina: 50 });
  assert.deepEqual(T.lerEstado(txt), JSON.parse(txt));
  const padrao = { ordem: [{ c: "liq", d: -1 }], filtros: {}, pagina: 1, porPagina: 25 };
  assert.deepEqual(T.lerEstado("{quebrado", padrao), padrao);
  assert.deepEqual(T.lerEstado(JSON.stringify({ ordem: [{ c: "x", d: 2 }] }), padrao), padrao);
  for (const ruim of [{ porPagina: 30 }, { pagina: 0 }, { ordem: [{ c: "a b", d: 1 }] }, { filtros: { dy: { min: "10" } } }, { filtros: { d: { de: "01/01/2026" } } }, { filtros: { s: { vals: Array(13).fill("x") } } }])
    assert.ok(T.validarEstado(ruim).erro, JSON.stringify(ruim));
  assert.equal(T.numBr("1.234,5"), 1234.5);
  assert.equal(T.numBr("12%"), 12);
  assert.equal(T.numBr(""), null);
});

test("/api/prefs/tabelas: valida, junta com o salvo e guarda as 40 mais recentes", () => {
  assert.ok(validarTabelas({ tabelas: { "Cot Acoes": {} } }).erro);
  assert.ok(validarTabelas({ tabelas: { "cot-acoes": { porPagina: 7 } } }).erro);
  const v = validarTabelas({ tabelas: { "cot-acoes": { ordem: [{ c: "liq", d: -1 }] }, "lista-renda-0001": null } });
  assert.deepEqual(v.tabelas["cot-acoes"].ordem, [{ c: "liq", d: -1 }]);
  const salvo = { tabelas: { "lista-renda-0001": { ordem: [], em: "2026-11-01" }, "cot-fiis": { ordem: [], em: "2026-11-02" } } };
  const m = mesclarTabelas(salvo, v.tabelas, "2026-11-03T10:00:00Z");
  assert.deepEqual(Object.keys(m).sort(), ["cot-acoes", "cot-fiis"]);
  assert.equal(m["cot-acoes"].em, "2026-11-03T10:00:00Z");
  const muitas = {};
  for (let k = 0; k < 45; k++) muitas["t-" + k] = { ordem: [], em: "2026-10-" + String(k % 28 + 1).padStart(2, "0") + "T" + String(k).padStart(2, "0") };
  assert.equal(Object.keys(mesclarTabelas({ tabelas: muitas }, { nova: T.estadoVazio() }, "2026-11-03")).length, MAX_TABELAS);
  assert.ok("nova" in mesclarTabelas({ tabelas: muitas }, { nova: T.estadoVazio() }, "2026-11-03"));
  const r = respostaTabelas({ tabelas: { "cot-acoes": { ordem: [{ c: "liq", d: -1 }], em: "x" }, "estragada": { porPagina: 9 } } });
  assert.deepEqual(Object.keys(r.tabelas), ["cot-acoes"]);
  assert.equal(r.tabelas["cot-acoes"].em, undefined);
});

test("/api/prefs/layout: só esq e dir, booleanos", () => {
  assert.deepEqual(validarLayout({ esq: true, dir: false }).layout, { esq: true, dir: false });
  assert.ok(validarLayout({ esq: 1, dir: false }).erro);
  assert.ok(validarLayout({ esq: true, dir: false, meio: true }).erro);
  assert.deepEqual(respostaLayout(null), { esq: false, dir: false, salvo: false });
});

test("brapi: FIIs, FI-Infra, Fiagro e ETFs separados pelo subType", () => {
  const fundos = [
    { t: "HGLG11", sub: "fii" }, { t: "IRIF11", sub: "fi-infra" }, { t: "KNCA11", sub: "fi-agro" }, { t: "XPIE11", sub: "fip" },
    { t: "BOVA11", sub: "etf" }, { t: "IBOV11", sub: "" }, { t: "VELH11", sub: "" }, { t: "SEMF", sub: "" }, { t: "AGRO11", sub: "fiagro" },
  ];
  const g = separarFundos(fundos, new Set(["VELH11", "SEMF"]));
  assert.deepEqual(ts(g.fiis), ["HGLG11", "VELH11"]); // sem subType só entra com final 11 e informe na CVM
  assert.deepEqual(ts(g.fiinfra), ["IRIF11", "XPIE11"]);
  assert.deepEqual(ts(g.fiagro), ["KNCA11", "AGRO11"]);
  assert.deepEqual(ts(g.etfs), ["BOVA11"]);
});

test("ficha: proventos do gráfico do Yahoo (events=div)", () => {
  const agora = Date.parse("2026-11-03T12:00:00Z");
  const t = (iso) => Date.parse(iso) / 1000;
  const res = { events: { dividends: { a: { amount: 0.11, date: t("2026-10-15T13:00:00Z") }, b: { amount: 0.1, date: t("2026-09-15T13:00:00Z") }, c: { amount: 0.5, date: t("2025-06-15T13:00:00Z") } } } };
  assert.deepEqual(lerDividendosYahoo(res, -10800, agora), { soma12: 0.21, n12: 2, ult: 0.11, ultData: "2026-10-15" });
  assert.equal(lerDividendosYahoo({}, 0, agora), null);
  assert.equal(lerDividendosYahoo({ events: { dividends: {} } }, 0, agora), null);
});

test("carteira: FI-Infra e Fiagro com classe própria e lista automática própria", () => {
  const ref = { fiis: new Set(["HGLG11"]), fiinfra: new Set(["IRIF11"]), fiagro: new Set(["KNCA11"]), etfs: new Set(["BOVA11"]) };
  assert.equal(classeDe("IRIF11", ref), "fiinfra");
  assert.equal(classeDe("KNCA11", ref), "fiagro");
  assert.equal(classeDe("HGLG11", ref), "fii");
  const l = papeisDaCarteira([{ t: "IRIF11", classe: "fiinfra", q: 10 }, { t: "KNCA11", classe: "fiagro", q: 5 }, { t: "HGLG11", classe: "fii", q: 1 }]);
  assert.deepEqual(l, { "carteira-fiis": ["HGLG11"], "carteira-fiinfra": ["IRIF11"], "carteira-fiagro": ["KNCA11"] });
});

test("Minhas listas: ordem no doc da lista, conferida", () => {
  assert.deepEqual(validarLista({ nome: "Renda", papeis: ["HGLG11"], ordem: [{ c: "dy", d: -1 }, { c: "t", d: 1 }] }).ordem, [{ c: "dy", d: -1 }, { c: "t", d: 1 }]);
  assert.equal(validarLista({ nome: "Renda", papeis: [], ordem: [] }).ordem, undefined); // ordem vazia = personalizada
  assert.ok(validarLista({ nome: "Renda", papeis: [], ordem: [{ c: "liq", d: -1 }] }).erro);
  assert.ok(validarLista({ nome: "Renda", papeis: [], ordem: [{ c: "dy", d: 0 }] }).erro);
});
