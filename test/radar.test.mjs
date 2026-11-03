// Radar de dividendos e Leitura do dia: critérios, avisos, "No mês", "Na meta", filtros salvos e os templates da leitura.
// Papéis e números inventados (test/fixtures-radar.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import "../public/radar-filtro.js";
import { resumoFii } from "../src/cvm.js";
import { montarLeitura, FECHO, MAX_ITENS } from "../src/leitura.js";
import { fundos, fiiResumo, b3, extra, posicoes, patrimonio } from "./fixtures-radar.mjs";

const RF = globalThis.RadarFiltro;
const filtro = () => ({ ...RF.FABRICA, seg: [], man: [] });
const linhas = (b = b3, r = fiiResumo) => RF.linhasFii(b, r.fundos, extra);
const ctx = () => RF.ctxCarteira(posicoes, patrimonio);
const perto = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const PROIBIDO = /\b(melhor|melhores|oportunidade|barato|baratos|barata|recomendad[oa]s?|recomendo|compre|venda já)\b/i;

test("resumo da CVM: No mês com os dois últimos informes, meses pagos, maior e mediana", () => {
  const r = fiiResumo.fundos;
  assert.equal(r.PERD11.cot, 8700); assert.equal(r.PERD11.ca, 9100);
  assert.equal(r.PASA11.cot - r.PASA11.ca, 100);
  assert.equal(r.IRRE11.pg, 9); assert.equal(r.NOVO11.pg, 5); assert.equal(r.PASA11.pg, 12);
  perto(r.EXTR11.rmx, 0.5); perto(r.EXTR11.rmd, 0.1);
  perto(r.CAIR11.ra, 0.11); perto(r.CAIR11.rend, 0.06);
  const l = linhas().find((x) => x.t === "PERD11");
  assert.equal(l.cotMes, -400);
});

test("filtro de fábrica: quem passa, quem não passa e por quê", () => {
  const r = RF.aplicar(linhas(), filtro(), ctx());
  assert.equal(r.total, 20);
  const passam = r.passam.map((x) => x.t).sort();
  assert.deepEqual(passam, ["CAIR11", "EXTR11", "PAPA11", "PAPB11", "PASA11", "PASB11", "PASC11", "PASD11", "PERD11", "PVPX11", "QUED11", "SEGX11", "TENH11"]);
  const k = (t) => r.falha.get(t)[0].k;
  assert.equal(k("CARO11"), "pvp"); assert.equal(r.falha.get("CARO11")[0].curto, "P/VP 1,20");
  assert.equal(k("POUC11"), "dy"); assert.equal(k("ZERO11"), "dy");
  assert.equal(k("ILIQ11"), "liq"); assert.match(r.falha.get("ILIQ11")[0].curto, /liquidez R\$ 9 mil/);
  assert.equal(k("IRRE11"), "regular"); assert.equal(r.falha.get("IRRE11")[0].curto, "pagou 9 de 12 meses");
  assert.equal(k("NOVO11"), "regular");
  assert.equal(k("SEMN11"), "preco");
  // ordenado por entrada de cotistas: quem perdeu cotistas vai para o fim
  assert.equal(r.passam[r.passam.length - 1].t, "PERD11");
});

test("cada aviso aparece no papel certo", () => {
  const r = RF.aplicar(linhas(), filtro(), ctx());
  const av = (t) => r.passam.find((x) => x.t === t).avisos.map((a) => a.k);
  assert.ok(av("CAIR11").includes("caindo"));
  assert.ok(av("PERD11").includes("cotistas"));
  assert.ok(av("PVPX11").includes("pvp"));
  assert.ok(av("EXTR11").includes("extra"));
  assert.ok(av("QUED11").includes("queda"));
  assert.deepEqual(av("TENH11"), ["concentra", "tenho"]);
  assert.deepEqual(av("PASB11"), ["tenho"]);
  assert.deepEqual(av("PASA11"), []);
  const tenho = r.passam.find((x) => x.t === "TENH11").avisos.find((a) => a.k === "tenho");
  assert.equal(tenho.txt, "tenho 2.000 · 91,4%");
  // sem carteira, nada de tenho nem passaria de 20%
  const r2 = RF.aplicar(linhas(), filtro(), { posicoes: new Map(), patrimonio: 0 });
  assert.deepEqual(r2.passam.find((x) => x.t === "TENH11").avisos.map((a) => a.k), []);
  for (const x of r.passam) for (const a of x.avisos) assert.doesNotMatch(a.txt + " " + a.dica, PROIBIDO);
});

test("Na meta: aporte × último rendimento ÷ preço, por mês", () => {
  const r = RF.aplicar(linhas(), { ...filtro(), aporte: 1000 }, ctx());
  perto(r.passam.find((x) => x.t === "PASA11").naMeta, (1000 * 0.1) / 9);
  perto(r.passam.find((x) => x.t === "CAIR11").naMeta, (1000 * 0.06) / 9);
  perto(RF.naMeta({ classe: "acoes", preco: 20, div12: 2.4 }, 1000), 10);
  assert.equal(RF.naMeta({ classe: "fiis", preco: 9, rend: 0.1 }, 0), null);
});

test("opções do filtro: esconder o que já tenho, rendimento estável, segmento, regularidade", () => {
  const l = linhas();
  const r1 = RF.aplicar(l, { ...filtro(), semMinhas: true }, ctx());
  assert.ok(!r1.passam.some((x) => x.t === "TENH11" || x.t === "PASB11"));
  assert.equal(r1.falha.get("TENH11")[0].k, "minha");
  const r2 = RF.aplicar(l, { ...filtro(), estavel: true }, ctx());
  assert.equal(r2.falha.get("CAIR11")[0].k, "estavel");
  const r3 = RF.aplicar(l, { ...filtro(), seg: ["Shoppings"] }, ctx());
  assert.deepEqual(r3.passam.map((x) => x.t).sort(), ["PASB11", "QUED11"]);
  const r4 = RF.aplicar(l, { ...filtro(), regular: "0", ordem: "liq" }, ctx());
  assert.ok(r4.passam.some((x) => x.t === "IRRE11") && r4.passam.some((x) => x.t === "NOVO11"));
});

test("carteira contra o filtro", () => {
  const cf = RF.contraFiltro(linhas(), { ...filtro(), semMinhas: true }, ctx(), posicoes);
  assert.equal(cf.n, 3);
  assert.deepEqual(cf.passam.map((x) => x.t).sort(), ["PASB11", "TENH11"]);
  assert.deepEqual(cf.naoPassam.map((x) => [x.t, x.motivo]), [["CARO11", "P/VP 1,20"]]);
  assert.equal(cf.outras, 1);
});

test("ações da B3 com os múltiplos das fichas", () => {
  const fund = { ABCD3: { pl: 6, pvp: 1.1, dy: 9, div12: 1.8, setor: "Finance" } };
  const l = RF.linhasAcoes(b3, fund);
  const r = RF.aplicar(l, RF.novoFiltro("acoes", "Ações", "a1"), { posicoes: new Map(), patrimonio: 0 });
  assert.deepEqual(r.passam.map((x) => x.t), ["ABCD3"]);
  assert.equal(r.falha.get("EFGH4")[0].curto, "sem DY (abra a ficha)");
  perto(r.passam[0].naMeta, (1000 * 1.8) / 12 / 20);
});

test("validação de /api/prefs/radar", () => {
  const ok = RF.validarPrefs({ filtros: [RF.FABRICA, { ...RF.novoFiltro("acoes", "Ações BR dividendos", "acoes-1"), extra: "some" }], padrao: "acoes-1" });
  assert.ok(!ok.erro);
  assert.equal(ok.padrao, "acoes-1");
  assert.ok(!("extra" in ok.filtros[1]));
  assert.equal(RF.validarPrefs({ filtros: [RF.FABRICA], padrao: "nao-existe" }).padrao, RF.FABRICA.id);
  const muitos = Array.from({ length: 11 }, (_, i) => ({ ...RF.FABRICA, id: "f" + i, nome: "F" + i }));
  assert.match(RF.validarPrefs({ filtros: muitos }).erro, /até 10/);
  assert.match(RF.validarPrefs({ filtros: [{ ...RF.FABRICA, nome: "x".repeat(31) }] }).erro, /30 caracteres/);
  assert.match(RF.validarPrefs({ filtros: [{ ...RF.FABRICA, nome: "  " }] }).erro, /nome/);
  assert.match(RF.validarPrefs({ filtros: [RF.FABRICA, { ...RF.FABRICA, id: "outro", nome: RF.FABRICA.nome.toUpperCase() }] }).erro, /Já existe/);
  assert.match(RF.validarPrefs({ filtros: [{ ...RF.FABRICA, classe: "cripto" }] }).erro, /Classe/);
  assert.match(RF.validarPrefs({ filtros: [{ ...RF.FABRICA, pvpMax: 99 }] }).erro, /P\/VP/);
  assert.match(RF.validarPrefs({ filtros: [{ ...RF.FABRICA, dyMin: "abc" }] }).erro, /DY/);
  assert.match(RF.validarPrefs({ filtros: [{ ...RF.FABRICA, id: "../x" }] }).erro, /Id/);
  assert.match(RF.validarPrefs({ filtros: [{ ...RF.FABRICA, seg: [1, 2] }] }).erro, /segmento/);
  assert.match(RF.validarPrefs({ filtros: [] }).erro, /pelo menos/);
  const v = RF.validarPrefs({ filtros: [{ ...RF.FABRICA, pvpMax: "", aporte: null, regular: "7", ordem: "xyz" }] });
  assert.equal(v.filtros[0].pvpMax, null); assert.equal(v.filtros[0].aporte, 0); assert.equal(v.filtros[0].regular, "0"); assert.equal(v.filtros[0].ordem, "cotistas");
  // GET de quem nunca salvou: o de fábrica, sem a palavra proibida no nome
  const p = RF.respostaPrefs(null);
  assert.equal(p.salvo, false); assert.equal(p.filtros[0].pvpMax, 1); assert.equal(p.filtros[0].dyMin, 10); assert.equal(p.filtros[0].liqMin, 1e6); assert.equal(p.filtros[0].regular, "12"); assert.equal(p.filtros[0].ordem, "cotistas");
  assert.doesNotMatch(p.filtros[0].nome, PROIBIDO);
  assert.equal(RF.respostaPrefs({ filtros: "lixo" }).salvo, false);
});

test("Leitura do dia: primeira vez, depois entrou, saiu, rendimento novo, aviso e notícia", () => {
  const f = filtro();
  const d1 = montarLeitura({ dia: "2026-11-02", filtro: f, linhas: linhas(), ctx: ctx(), posicoes, noticias: [], base: null });
  assert.equal(d1.leitura.itens[0].tipo, "inicio");
  assert.match(d1.leitura.itens[0].texto, /13 de 20 FIIs passam hoje/);
  assert.equal(d1.leitura.fecho, FECHO);
  // dia 2: CARO11 cai para R$ 9,50 (P/VP 0,95), PASA11 sobe para R$ 11 (P/VP 1,10), TENH11 entrega o informe de outubro
  // com rendimento maior, PASB11 perde cotistas e sai uma notícia citando PAPA11
  const f2 = JSON.parse(JSON.stringify(fundos));
  f2.TENH11.h.push(["2026-10", 1.1, 10, 13300, 0.5]); f2.TENH11.h.shift(); f2.TENH11.ref = "2026-10"; f2.TENH11.cot = 13300;
  f2.PASB11.h[12][3] = 7000; f2.PASB11.cot = 7000;
  const res2 = { ...fiiResumo, fundos: resumoFii(f2) };
  const b2 = { ...b3, fiis: b3.fiis.map((x) => (x.t === "CARO11" ? { ...x, preco: 9.5 } : x.t === "PASA11" ? { ...x, preco: 11 } : x)) };
  const noticias = [{ titulo: "PAPA11 aprova nova emissão de cotas", fonte: "Valor" }, { titulo: "Ibovespa fecha em alta", fonte: "InfoMoney" }];
  const d2 = montarLeitura({ dia: "2026-11-03", filtro: f, linhas: linhas(b2, res2), ctx: ctx(), posicoes, noticias, base: d1.atual });
  const por = (t) => d2.leitura.itens.filter((i) => i.tipo === t);
  assert.equal(por("rendimento").length, 1);
  assert.equal(por("rendimento")[0].texto, "TENH11: o informe de outubro na CVM indica R$ 0,110 por cota, acima dos R$ 0,100 do mês anterior.");
  assert.equal(por("saiu")[0].texto, "PASA11 saiu do seu filtro: P/VP foi a 1,10, acima de 1,00.");
  assert.equal(por("entrou")[0].texto, "Entrou no filtro hoje: CARO11 (P/VP foi a 0,95).");
  assert.deepEqual(d2.leitura.novos, ["CARO11"]); assert.deepEqual(d2.leitura.saiu, ["PASA11"]);
  assert.equal(por("aviso")[0].texto, 'PASB11, da sua carteira, passou a ter o aviso "perdendo cotistas".');
  assert.equal(por("noticia")[0].texto, 'No feed: "PAPA11 aprova nova emissão de cotas" (Valor) cita PAPA11.');
  assert.equal(por("noticia").length, 1);
  // ordem: rendimento da carteira primeiro
  assert.equal(d2.leitura.itens[0].tipo, "rendimento");
  assert.ok(d2.leitura.itens.length <= MAX_ITENS);
  for (const i of [...d1.leitura.itens, ...d2.leitura.itens]) assert.doesNotMatch(i.texto, PROIBIDO);
  // gerar de novo no mesmo dia compara com a mesma base: o resultado não muda
  const d2b = montarLeitura({ dia: "2026-11-03", filtro: f, linhas: linhas(b2, res2), ctx: ctx(), posicoes, noticias, base: d1.atual });
  assert.deepEqual(d2b.leitura.itens, d2.leitura.itens);
  // dia 3 sem mudança nenhuma
  const d3 = montarLeitura({ dia: "2026-11-04", filtro: f, linhas: linhas(b2, res2), ctx: ctx(), posicoes, noticias: [], base: d2.atual });
  assert.equal(d3.leitura.itens.length, 1); assert.equal(d3.leitura.itens[0].tipo, "nada");
  // trocar o filtro padrão recomeça a contagem
  const d4 = montarLeitura({ dia: "2026-11-05", filtro: { ...f, id: "outro", nome: "Outro" }, linhas: linhas(b2, res2), ctx: ctx(), posicoes, noticias: [], base: d3.atual });
  assert.ok(d4.leitura.itens.some((i) => i.tipo === "filtro"));
  assert.ok(!d4.leitura.itens.some((i) => i.tipo === "entrou" || i.tipo === "saiu"));
});

test("papéis citados numa notícia", () => {
  assert.deepEqual(RF.papeisDaNoticia({ titulo: "HGBS11 e VISC11 lideram; PETR4 cai" }), ["HGBS11", "VISC11", "PETR4"]);
  assert.deepEqual(RF.papeisDaNoticia({ titulo: "x", ativos: ["mxrf11", "IBOV"] }), ["MXRF11", "IBOV"]);
});
