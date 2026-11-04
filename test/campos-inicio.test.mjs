// Campos com formato (public/campo.js) e grade do Início em grupos (public/inicio-grade.js e src/painel.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import "../public/campo.js";
import "../public/inicio-grade.js";
import { validarPainel, respostaPainel, padraoDe, migrarPainel } from "../src/painel.js";

const C = globalThis.Campo, G = globalThis.InicioGrade, F = globalThis.Fmt;
const v = (tipo, t, op) => C.ler(tipo, t, op).valor;
const e = (tipo, t, op) => C.ler(tipo, t, op).erro;

test("Campo moeda: entradas variadas viram o mesmo número", () => {
  for (const [t, n] of [["2000", 2000], ["2.000", 2000], ["2000,5", 2000.5], ["2.000,50", 2000.5], ["R$ 2.000,00", 2000], ["2k", 2000], ["1,5m", 1500000], ["1,5 mi", 1500000], ["2 mil", 2000], ["1.500.000", 1500000], ["12.5", 12.5], [" 300 ", 300], ["US$ 10,25", 10.25]])
    assert.equal(v("moeda", t), n, t);
  assert.equal(v("moeda", ""), null);
  assert.equal(e("moeda", ""), undefined);
  assert.equal(e("moeda", "", { obrigatorio: true }), "Preencha este campo");
  for (const t of ["abc", "2,0,0", "1.2.3", "2.00,5", "R$", "--2", "12a"]) assert.equal(e("moeda", t), "Use um número", t);
  assert.equal(C.formatar("moeda", 2000), "R$ 2.000,00");
  assert.equal(C.formatar("moeda", 2000.5, { moeda: "USD" }), "US$ 2.000,50");
  assert.equal(C.formatar("moeda", 1234, { casas: 0 }), "R$ 1.234");
  assert.equal(C.limpo("moeda", 2000), "2000");
  assert.equal(C.limpo("moeda", 2000.5), "2000,5");
  assert.equal(C.limpo("moeda", 0.07), "0,07");
});

test("Campo percentual, número e inteiro", () => {
  for (const t of ["11.9", "11,9", "11,9%", "11,9 %"]) assert.equal(v("percentual", t), 11.9, t);
  assert.equal(C.formatar("percentual", 11.9), "11,9 %");
  assert.equal(C.formatar("percentual", 8, { casas: 2 }), "8,00 %");
  assert.equal(C.limpo("percentual", 11.9), "11,9");
  assert.equal(v("percentual", "-3,5"), -3.5);
  assert.equal(C.formatar("numero", 0.95), "0,95");
  assert.equal(C.formatar("numero", 1.5, { casas: 1 }), "1,5");
  assert.equal(C.formatar("numero", 12345.678), "12.345,68");
  assert.equal(v("inteiro", "1.000"), 1000);
  assert.equal(e("inteiro", "10,5"), "Use um número inteiro");
  assert.equal(C.formatar("inteiro", 1234567), "1.234.567");
});

test("Campo limites e setas", () => {
  assert.deepEqual(C.limitar("percentual", 120, { max: 100 }), { valor: 100, aviso: "O máximo é 100,0 %" });
  assert.deepEqual(C.limitar("moeda", -5, { min: 0 }), { valor: 0, aviso: "O mínimo é R$ 0,00" });
  assert.deepEqual(C.limitar("moeda", 5, { min: 0 }), { valor: 5 });
  assert.equal(C.passo("moeda", 2000, 1), 2001);
  assert.equal(C.passo("moeda", null, 10), 10);
  assert.equal(C.passo("percentual", 11.9, 1), 12.9);
  assert.equal(C.passo("percentual", 99.5, 10, { max: 100 }), 100);
  assert.equal(C.passo("numero", 0.3, -1, { min: 0 }), 0);
});

test("Campo data: máscara, validação real e ISO", () => {
  assert.equal(v("data", "04/11/2026"), "2026-11-04");
  assert.equal(v("data", "4/11/26"), "2026-11-04");
  assert.equal(v("data", "04112026"), "2026-11-04");
  assert.equal(v("data", "2026-11-04"), "2026-11-04");
  assert.equal(v("data", "29/02/2028"), "2028-02-29");
  for (const t of ["29/02/2027", "31/04/2026", "00/01/2026", "12/13/2026", "1/1", "ontem"]) assert.equal(e("data", t), "Data inválida", t);
  assert.equal(C.mascara("data", "0411"), "04/11");
  assert.equal(C.mascara("data", "04112026"), "04/11/2026");
  assert.equal(C.mascara("data", "041120269"), "04/11/2026");
  assert.equal(C.mascara("data", "2026-11-04"), "04/11/2026");
  assert.equal(C.formatar("data", "2026-11-04"), "04/11/2026");
});

test("Campo mês/ano e papel", () => {
  assert.equal(v("mesano", "03/2027"), "2027-03");
  assert.equal(v("mesano", "3/27"), "2027-03");
  assert.equal(v("mesano", "2027-03"), "2027-03");
  assert.equal(e("mesano", "13/2027"), "Use mês e ano, como 03/2027");
  assert.equal(C.mascara("mesano", "032027"), "03/2027");
  assert.equal(C.formatar("mesano", "2027-03"), "03/2027");
  assert.equal(C.mascara("papel", "petr4"), "PETR4");
  assert.equal(C.mascara("papel", "hglg 11"), "HGLG11");
  assert.equal(C.mascara("papel", "taee11x"), "TAEE11");
  assert.equal(C.mascara("papel", "brk.b"), "BRK.B");
  assert.equal(C.mascara("papel", "ação"), "ACAO");
  assert.equal(v("papel", "mxrf11"), "MXRF11");
  assert.equal(e("papel", "."), "Use o código do papel, como PETR4");
  assert.equal(F.num(1234.5, 1), "1.234,5");
});

test("Início: doc antigo (lista plana) vira grupos por tipo, na ordem salva", () => {
  const antigo = { widgets: [{ id: "carteira-proventos-mes", formato: "1x1" }, { id: "carteira-meta", formato: "2x1" }, { id: "hoje", formato: "1x1" }, { id: "mercado", formato: "1x1" },
    { id: "destaques-tech", formato: "1x1" }, { id: "pregao", tamanho: 2 }, { id: "foruns-tech", formato: "1x2" }, { id: "radar-meu", formato: "2x2" }, { id: "esportes-rodada-bra.1", formato: "2x1" }, { id: "destaques-esportes", formato: "1x1" }] };
  const gs = migrarPainel(antigo);
  assert.deepEqual(gs.map((g) => g.id), ["carteira", "noticias", "mercado", "foruns", "analises", "esportes"]);
  assert.deepEqual(gs.map((g) => g.nome), ["Minha carteira", "Notícias", "Mercado", "Fóruns", "Análises", "Esportes"]);
  assert.deepEqual(gs[0].widgets.map((w) => w.id), ["carteira-proventos-mes", "carteira-meta"]);
  assert.deepEqual(gs[1].widgets.map((w) => w.id), ["hoje", "destaques-tech"]);
  assert.equal(gs[2].widgets.find((w) => w.id === "pregao").formato, "2x1");
  assert.deepEqual(gs[5].widgets.map((w) => w.id), ["esportes-rodada-bra.1", "destaques-esportes"]);
  // GET de quem tem o doc antigo: grupos e a lista plana, na mesma ordem
  const r = respostaPainel({ ...antigo, atualizado: "2026-11-04T14:36:16.971Z" }, null);
  assert.equal(r.padrao, false);
  assert.deepEqual(r.grupos.map((g) => g.id), gs.map((g) => g.id));
  assert.deepEqual(r.widgets.map((w) => w.id), gs.flatMap((g) => g.widgets.map((w) => w.id)));
  assert.equal(r.catalogo.find((w) => w.id === "leitura-dia").grupo, "analises");
  // quem não tem Esportes não vê o grupo
  assert.ok(!respostaPainel(antigo, ["tech", "investimentos"]).grupos.some((g) => g.id === "esportes"));
  // sem doc: o padrão em grupos, na ordem dos grupos padrão
  const p = respostaPainel(null, null);
  assert.equal(p.padrao, true);
  assert.deepEqual(p.grupos.map((g) => g.id), ["noticias", "mercado", "esportes"]);
  assert.deepEqual(p.gruposPadrao, padraoDe(null));
});

test("Início: conferência do formato novo", () => {
  const ok = validarPainel({ grupos: [
    { id: "noticias", nome: "  Leitura   do dia ", recolhido: true, widgets: [{ id: "hoje", formato: "1x1" }, { id: "destaques-tech", formato: "1x2" }] },
    { id: "grupo-1", nome: "Vazio", widgets: [] },
    { id: "mercado", widgets: [{ id: "pregao", formato: "3x1" }] },
  ] }, null);
  assert.deepEqual(ok.grupos, [
    { id: "noticias", nome: "Leitura do dia", recolhido: true, widgets: [{ id: "hoje", formato: "1x1" }, { id: "destaques-tech", formato: "1x2" }] },
    { id: "mercado", nome: "Mercado", recolhido: false, widgets: [{ id: "pregao", formato: "3x1" }] },
  ], "grupo vazio some; sem nome, vale o padrão do id");
  const erro = (b, secoes = null) => validarPainel(b, secoes).erro;
  assert.match(erro({ grupos: [{ id: "a", nome: "A", widgets: [{ id: "hoje", formato: "1x1" }] }, { id: "b", nome: "B", widgets: [{ id: "hoje", formato: "1x1" }] }] }), /hoje aparece duas vezes/);
  assert.match(erro({ grupos: [{ id: "a", nome: "A", widgets: [] }, { id: "a", nome: "B", widgets: [] }] }), /grupo a aparece duas vezes/);
  assert.match(erro({ grupos: [{ id: "a", nome: "A", widgets: [{ id: "hoje", formato: "2x1" }] }] }), /Formato inválido em hoje: use 1x1/);
  assert.match(erro({ grupos: [{ id: "a", nome: "A", widgets: [{ id: "pregao", formato: "1x1" }] }] }), /Formato inválido em pregao/);
  assert.match(erro({ grupos: [{ id: "a", nome: "A", widgets: [{ id: "inventado", formato: "1x1" }] }] }), /desconhecido/);
  assert.match(erro({ grupos: [{ id: "a", nome: "A", widgets: [{ id: "foruns-tech", formato: "1x1" }] }] }, ["negocios"]), /não liberada/);
  assert.match(erro({ grupos: [{ id: "Com Espaço", nome: "A", widgets: [] }] }), /id de grupo/);
  assert.match(erro({ grupos: [{ id: "grupo-2", nome: "   ", widgets: [] }] }), /Dê um nome/);
  assert.match(erro({ grupos: [{ id: "a", nome: "A", recolhido: "sim", widgets: [] }] }), /recolhido/);
  assert.match(erro({ grupos: Array.from({ length: 13 }, (_, i) => ({ id: "g" + i, nome: "G", widgets: [] })) }), /até 12 grupos/);
  assert.match(erro({ grupos: "x" }), /grupos/);
  assert.match(erro({}), /grupos/);
  // página antiga mandando a lista plana: vira grupos
  const plano = validarPainel({ widgets: [{ id: "eua", tamanho: 2 }, { id: "hoje", formato: "1x1" }] }, null);
  assert.deepEqual(plano.grupos.map((g) => g.id), ["mercado", "noticias"]);
  // nome passa de 30: corta
  assert.equal(validarPainel({ grupos: [{ id: "a", nome: "x".repeat(50), widgets: [{ id: "hoje", formato: "1x1" }] }] }, null).grupos[0].nome.length, 30);
  // depois de salvar, o GET devolve o mesmo
  assert.deepEqual(respostaPainel({ grupos: ok.grupos }, null).grupos, ok.grupos);
});

test("Início: encaixe do redimensionar e Shift+setas", () => {
  const pregao = ["2x1", "3x1", "2x2"], radar = ["1x1", "2x1", "2x2"], mercado = ["1x1", "1x2"];
  assert.equal(G.encaixe(pregao, 1, 1), "2x1", "pequeno demais: o menor permitido");
  assert.equal(G.encaixe(pregao, 2.9, 1.1), "3x1");
  assert.equal(G.encaixe(pregao, 2.1, 1.8), "2x2");
  assert.equal(G.encaixe(pregao, 3, 2), "3x1", "3x2 não existe: 2x2 e 3x1 empatam, fica o de menor área");
  assert.equal(G.encaixe(pregao, 3, 2, { atual: "2x2" }), "2x2", "no empate, o atual");
  assert.equal(G.encaixe(pregao, 3, 1, { colunas: 2 }), "2x1", "com 2 colunas, o 3x1 não conta");
  assert.equal(G.encaixe(radar, 1.4, 1.9), "2x2");
  assert.equal(G.encaixe(mercado, 2.5, 1), "1x1");
  assert.equal(G.encaixe(mercado, 1, 1.6), "1x2");
  assert.equal(G.encaixe(["1x1"], 3, 2), "1x1");
  assert.equal(G.passoFormato(pregao, "2x1", 1, 0), "3x1");
  assert.equal(G.passoFormato(pregao, "2x1", 0, 1), "2x2");
  assert.equal(G.passoFormato(pregao, "3x1", 0, 1), "2x2", "sem 3x2: o mais perto para baixo");
  assert.equal(G.passoFormato(pregao, "2x1", -1, 0), "2x1", "nada menor que 2 colunas");
  assert.equal(G.passoFormato(radar, "2x2", -1, 0), "1x1", "sem 1x2: o mais perto entre os mais estreitos");
  assert.equal(G.passoFormato(radar, "2x2", 0, -1), "2x1");
  const { permitidas, proibidas } = G.celulas(pregao, 3);
  assert.deepEqual([...permitidas].sort(), ["1,1", "1,2", "2,1", "2,2", "3,1"]);
  assert.deepEqual([...proibidas], ["3,2"]);
  assert.deepEqual([...G.celulas(mercado, 3).proibidas].sort(), ["2,1", "2,2", "3,1", "3,2"]);
});

test("Início: mover entre grupos e setas do teclado", () => {
  const gs = [{ id: "a", nome: "A", widgets: [{ id: "x", formato: "1x1" }, { id: "y", formato: "1x1" }] }, { id: "b", nome: "B", widgets: [{ id: "z", formato: "1x1" }] }];
  assert.deepEqual(G.mover(gs, "x", "b", "z").map((g) => g.widgets.map((w) => w.id)), [["y"], ["x", "z"]]);
  assert.deepEqual(G.mover(gs, "x", "b").map((g) => g.widgets.map((w) => w.id)), [["y"], ["z", "x"]]);
  assert.deepEqual(G.passo(gs, "x", 1).map((g) => g.widgets.map((w) => w.id)), [["y", "x"], ["z"]]);
  assert.deepEqual(G.passo(gs, "y", 1).map((g) => g.widgets.map((w) => w.id)), [["x"], ["y", "z"]], "na ponta, passa para o começo do próximo grupo");
  assert.deepEqual(G.passo(gs, "z", -1).map((g) => g.widgets.map((w) => w.id)), [["x", "y", "z"], []], "e para o fim do anterior");
  assert.equal(G.passo(gs, "x", -1), gs, "no começo do primeiro grupo não anda");
  assert.equal(G.novoId(gs), "grupo-1");
  assert.equal(gs[0].widgets.length, 2, "não mexe no original");
});
