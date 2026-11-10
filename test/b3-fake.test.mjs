// Extratos falsos da B3 (test/fixtures/b3-fake): gera, lê de volta as planilhas como a página lê e passa pelo
// parser e pelo cálculo de src/carteira.js. Precisa de python3 com openpyxl (escreve e lê os .xlsx); sem ele, pula.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mesclar, calcular, chaveLinha, retratoDe, aplicarRetrato } from "../src/carteira.js";
import { gerar, manifesto, diferenca, escreverXlsx, lerXlsx, linhasDaPagina, simularImportacao, reduzirLinha } from "./fixtures/b3-fake/gerar.mjs";
import { ESPERADO, ESPERADO_ARECEBER, ESPERADO_CONFERENCIA, ESPERADO_FANTASMAS, refCalculo } from "./fixtures/b3-fake/cenarios.mjs";
import { conferirLotes, compradoPorPapel } from "./fixtures-carteira.mjs";

const ATE = "2026-11-04";
const GERADOR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/b3-fake/gerar.mjs");
let semPython = false;
try { execFileSync("python3", ["-I", "-c", "import openpyxl"], { stdio: "ignore" }); } catch { semPython = "python3 com openpyxl não encontrado"; }

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "b3-fake-teste-"));
const g = gerar({ ate: ATE });
const pos = (calc, t) => calc.posicoes.find((p) => p.t === t);
const chaves = (ex) => ["neg", "mov", "prov"].flatMap((c) => ex[c].map((x) => c + "|" + chaveLinha(c === "neg" ? "negociacao" : c === "mov" ? "movimentacao" : "proventos", x))).sort();
const enviar = (arquivos) => arquivos.map((a) => ({ nome: a.nome, tipo: a.tipo, linhas: a.linhas.map((l) => reduzirLinha(a.tipo, l)) }));

test("planilhas: a página reconhece cada arquivo e lê as mesmas linhas que o gerador escreveu", { skip: semPython }, () => {
  const dir = tmp();
  try {
    escreverXlsx(dir, g.arquivos, ATE);
    for (const a of g.arquivos) {
      const lido = lerXlsx(path.join(dir, a.nome));
      const { tipo, linhas } = linhasDaPagina(lido.linhas);
      assert.equal(tipo, a.tipo, a.nome);
      assert.equal(lido.aba, { negociacao: "Negociação", movimentacao: "Movimentação", proventos: "Proventos Recebidos", areceber: "Proventos a Receber" }[a.tipo]);
      assert.deepEqual(linhas, a.linhas.map((l) => reduzirLinha(a.tipo, l)), a.nome);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("determinismo: mesma semente e data dão os mesmos arquivos, byte a byte", { skip: semPython }, () => {
  const g2 = gerar({ ate: ATE });
  assert.deepEqual(manifesto(g2), manifesto(g));
  const a = tmp(), b = tmp();
  try {
    escreverXlsx(a, g.arquivos.slice(0, 2), ATE);
    escreverXlsx(b, g2.arquivos.slice(0, 2), ATE);
    for (const x of g.arquivos.slice(0, 2)) assert.ok(fs.readFileSync(path.join(a, x.nome)).equals(fs.readFileSync(path.join(b, x.nome))), x.nome);
  } finally { fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true }); }
  assert.notDeepEqual(manifesto(gerar({ ate: ATE, semente: 7 })).linhas, manifesto(g).linhas);
});

test("importação: nenhum tipo desconhecido, ignorados só Tesouro e CDB, nada negativo", () => {
  const { m, calc } = simularImportacao(g.arquivos, ATE);
  for (const a of m.porArquivo) assert.deepEqual(a.tiposDesconhecidos, {}, a.nome);
  const ign = { negociacao: 0, movimentacao: 0, proventos: 0 };
  for (const a of m.porArquivo) { ign[a.tipo] += a.ignorados; if (a.ignorados) assert.deepEqual(Object.keys(a.motivos), ["papel"]); }
  assert.deepEqual(ign, ESPERADO.ignorados);
  assert.deepEqual(calc.resumo.avisos, ESPERADO.avisos); // só a venda sem origem do cenário 17
  for (const p of calc.posicoes) assert.ok(p.q > 0, p.t);
  assert.equal(calc.resumo.provDaMov, 0); // os arquivos de proventos cobrem todos os pagamentos da Movimentação
});

test("posições abertas e encerradas batem com o README", () => {
  const { calc } = simularImportacao(g.arquivos, ATE);
  assert.deepEqual(calc.posicoes.map((p) => p.t).sort(), ESPERADO.abertas);
  assert.deepEqual(calc.resumo.encerradas.map((e) => e.t).sort(), ESPERADO.encerradas);
  assert.deepEqual(calc.posicoes.filter((p) => p.semCotacao).map((p) => p.t), ESPERADO.semCotacao);
  for (const [t, q] of Object.entries(ESPERADO.quantidade)) assert.equal(pos(calc, t).q, q, t);
  for (const [t, c] of Object.entries(ESPERADO.corretoras)) assert.deepEqual(pos(calc, t).corretoras, c, t);
  for (const [t, c] of Object.entries(ESPERADO.classes)) assert.equal(pos(calc, t).classe, c, t);
  for (const [t, q] of Object.entries(ESPERADO.emprestadas)) assert.equal(pos(calc, t).emprestadas, q, t);
  assert.deepEqual(calc.resumo.alertas.filter((a) => a.tipo === "rendimento-menor").map((a) => a.t), ESPERADO.rendimentoMenor);
  const enc = Object.fromEntries(calc.resumo.encerradas.map((e) => [e.t, e]));
  assert.ok(enc.VALE3.resultado > 0 && enc.MGLU3.resultado < 0);
  assert.equal(pos(calc, "PETR4F"), undefined);
  for (const t of ["KNIP12", "KNIP13", "TRXF12"]) assert.equal(pos(calc, t), undefined, t);
});

test("topo da carteira: aberto igual ao resultado, realizado bate com os papéis, transferência entre corretoras não é retirada", () => {
  const { calc } = simularImportacao(g.arquivos, ATE);
  const r = calc.resumo;
  assert.equal(r.aberto, r.resultado);
  const soma = calc.posicoes.reduce((s, p) => s + (p.resultado ?? 0) + p.realizado, 0) + r.encerradas.reduce((s, e) => s + e.resultado, 0);
  assert.ok(Math.abs(r.aberto + r.realizado.total - soma) < 0.05);
  assert.equal(r.saidas.vendas.n, r.realizado.n);
  assert.equal(r.saidas.retiradas.n, 0);
});

test("bonificação e desdobro mantêm o custo; subscrição exercida entra no PM", () => {
  const { calc } = simularImportacao(g.arquivos, ATE);
  const neg = g.arquivos.find((a) => a.tipo === "negociacao").linhas;
  const custo = (t) => neg.filter((l) => l[5].replace(/F$/, "") === t && l[1] === "Compra").reduce((s, l) => s + l[6] * l[7], 0);
  const itsa = pos(calc, "ITSA4");
  assert.ok(Math.abs(itsa.q * itsa.pm - custo("ITSA4")) < 0.01);
  const mov = g.arquivos.find((a) => a.tipo === "movimentacao").linhas;
  const exe = mov.find((l) => l[2] === "Direitos de Subscrição - Exercido");
  const knip = pos(calc, "KNIP11");
  assert.ok(Math.abs(knip.q * knip.pm - (custo("KNIP11") + exe[5] * exe[6])) < 0.01);
});

test("por lote (FIFO): lotes somam a quantidade, o custo fecha com o comprado e o preço médio não muda", () => {
  const { m, calc } = simularImportacao(g.arquivos, ATE);
  const papeis = [...calc.posicoes, ...calc.resumo.encerradas].map((p) => p.t);
  assert.deepEqual(conferirLotes(calc, compradoPorPapel(m.extrato, papeis)), []);
  // cada venda baixa do lote mais antigo, e as encerradas trazem as vendas também
  for (const p of [...calc.posicoes, ...calc.resumo.encerradas]) for (const v of p.vendas) {
    assert.ok(Math.abs(v.lotes.reduce((s, l) => s + l.q, 0) + v.semLote - v.q) < 1e-6, p.t);
    assert.deepEqual(v.lotes.map((l) => l.dLote), [...v.lotes.map((l) => l.dLote)].sort(), p.t);
  }
  // toda encerrada saiu por venda, menos o fundo incorporado (cenários 19 e 20), que sai pelo resgate
  assert.ok(calc.resumo.encerradas.every((e) => e.vendas.length > 0 || e.incorporadoPor), calc.resumo.encerradas.filter((e) => !e.vendas.length).map((e) => e.t).join(","));
  // sem transferência de saída nem retirada nos dados falsos, aberto + realizado é o mesmo nos dois jeitos, papel a
  // papel. As exceções são B3SA3 e EGIE3: a fração que saiu baixa pelo preço médio num e, no outro, é o próprio lote de
  // fração (zero).
  const total = (p) => ({ pm: (p.resultado ?? 0) + p.realizado, lote: (p.preco != null ? p.valor - p.fifo.custo : 0) + p.fifo.realizado });
  const FRACAO = { B3SA3: 0.65, EGIE3: 0.2 };
  // QZFB11 (cenário 19): a fração de 0,64 sai do lote que veio da incorporação num e pelo preço médio de antes no outro
  const pmAntes = (7600 + 1428.9) / 178.64, pInc = 1428.9 / 98.64;
  const OUTRA = { QZFB11: 0.64 * (pmAntes - pInc) };
  for (const p of calc.posicoes) {
    const x = total(p);
    if (FRACAO[p.t]) assert.ok(Math.abs(x.pm - x.lote - FRACAO[p.t] * (p.custo / p.q)) < 0.01, p.t);
    else if (OUTRA[p.t] != null) assert.ok(Math.abs(x.pm - x.lote - OUTRA[p.t]) < 0.02, `${p.t}: ${x.pm - x.lote}`);
    else assert.ok(Math.abs(x.pm - x.lote) < 0.02, p.t);
  }
  for (const e of calc.resumo.encerradas) assert.ok(Math.abs(e.resultado - e.fifo.realizado) < 0.02, e.t);
  // a bonificação de ITSA4 e a de B3SA3 são lotes a custo zero; a fração de B3SA3 entrou e saiu ela mesma
  assert.ok(pos(calc, "ITSA4").lotes.some((l) => l.origem === "bonificacao" && l.preco === 0));
  assert.ok(!pos(calc, "B3SA3").lotes.some((l) => l.origem === "fracao"));
  assert.ok(pos(calc, "KNIP11").lotes.some((l) => l.origem === "subscricao"));
});

test("reimportar os mesmos arquivos dá 0 novos; duas compras iguais no mesmo dia entram as duas", () => {
  const { m } = simularImportacao(g.arquivos, ATE);
  const r = mesclar(m.extrato, enviar(g.arquivos), "imp2");
  assert.equal(r.novos, 0);
  assert.equal(r.repetidos, m.novos);
  assert.equal(m.extrato.neg.filter((x) => x[0] === "2022-09-14" && x[2] === "BBAS3").length, 2);
});

test("--diff: só o delta, e base + correção = geração nova", () => {
  const g1 = gerar({ ate: "2026-06-30" });
  const d = diferenca(g, manifesto(g1));
  assert.deepEqual(d.sumiram, { negociacao: 0, movimentacao: 0, proventos: 0 });
  const total = Object.values(d.novas).reduce((a, b) => a + b, 0);
  assert.ok(total > 0 && d.arquivos.every((a) => a.nome.startsWith("correcao-2026-11-04-")));
  const m1 = mesclar(null, enviar(g1.arquivos), "a");
  const m2 = mesclar(m1.extrato, enviar(d.arquivos), "b");
  assert.equal(m2.novos, total);
  assert.equal(m2.repetidos, 0);
  const direto = mesclar(null, enviar(g.arquivos), "c");
  assert.deepEqual(chaves(m2.extrato), chaves(direto.extrato));
  // reimportar a correção não duplica
  assert.equal(mesclar(m2.extrato, enviar(d.arquivos), "d").novos, 0);
  // e o cálculo dá o mesmo
  const imps = (l) => ({ lista: l.map((pa, i) => ({ id: "i" + i, arquivos: pa.porArquivo.map((x) => ({ tipo: x.tipo, de: x.de, ate: x.ate })) })) });
  const { b3, fiiResumo } = refCalculo();
  const c1 = calcular(m2.extrato, { b3, fiiResumo, importacoes: imps([m1, m2]), hoje: ATE });
  const c2 = calcular(direto.extrato, { b3, fiiResumo, importacoes: imps([direto]), hoje: ATE });
  assert.deepEqual(c1.posicoes, c2.posicoes);
  // a mesma geração contra o próprio manifesto: nada
  assert.equal(diferenca(g, manifesto(g)).arquivos.length, 0);
});

test("linha de comando: gera a pasta e depois só a correção", { skip: semPython }, () => {
  const dir = tmp();
  try {
    execFileSync("node", [GERADOR, "--saida", dir, "--ate", "2026-10-30"], { stdio: "ignore" });
    const man = JSON.parse(fs.readFileSync(path.join(dir, "manifesto.json"), "utf8"));
    assert.equal(man.ate, "2026-10-30");
    assert.ok(fs.existsSync(path.join(dir, "README.md")));
    for (const a of man.arquivos) assert.ok(fs.existsSync(path.join(dir, a.nome)), a.nome);
    const corr = path.join(dir, "correcao");
    fs.mkdirSync(corr);
    const saida = execFileSync("node", [GERADOR, "--saida", corr, "--ate", ATE, "--diff", path.join(dir, "manifesto.json")], { encoding: "utf8" });
    const arquivos = fs.readdirSync(corr).filter((n) => n.endsWith(".xlsx")).sort();
    assert.ok(arquivos.length > 0 && arquivos.every((n) => n.startsWith("correcao-2026-11-04-")), arquivos.join(","));
    assert.ok(fs.existsSync(path.join(corr, "correcao-2026-11-04-manifesto.json")));
    assert.ok(!saida.includes("atenção"));
    const d = diferenca(gerar({ ate: ATE }), man);
    for (const a of d.arquivos) assert.equal(linhasDaPagina(lerXlsx(path.join(corr, a.nome)).linhas).linhas.length, a.linhas.length, a.nome);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------- Proventos a Receber (cenário 15) ----------
const EA = ESPERADO_ARECEBER;

test("a receber: o retrato sai com o cabeçalho da B3, a linha do total e nada dos outros arquivos muda", () => {
  const a = g.arquivos.find((x) => x.tipo === "areceber");
  assert.equal(a.nome, EA.nome);
  assert.equal(a.linhas.length, EA.linhas + 1); // mais a linha do total
  const total = a.linhas.at(-1);
  assert.deepEqual(total.slice(0, 8), [null, null, null, null, null, null, null, "Total líquido"]);
  assert.ok(a.linhas.slice(0, -1).every((l) => typeof l[6] === "string" && /^\d+$/.test(l[5]) && / - /.test(l[0])), "quantidade em texto, conta e produto com nome");
  // os arquivos de antes são os mesmos com ou sem o cenário 15 (nenhum provento futuro entra nos recebidos)
  const man = manifesto(g);
  assert.deepEqual(Object.keys(man.linhas), ["negociacao", "movimentacao", "proventos"]);
  assert.deepEqual(man.retrato, { nome: EA.nome, dataRef: EA.ate, linhas: EA.linhas, total: EA.total, confere: true });
  assert.ok(!g.arquivos.filter((x) => x.tipo === "proventos").some((x) => x.linhas.some((l) => l[1] > "2026-11-04" && l[1].includes("2028"))));
});

test("a receber: números da tela com o retrato de 04/11/2026", () => {
  const { calc, rr } = simularImportacao(g.arquivos, ATE);
  assert.equal(rr.confere, true); assert.equal(rr.totalArquivo, EA.total); assert.equal(rr.ignorados, 0);
  const r = calc.resumo;
  const b3l = r.aReceber.filter((x) => x.origem === "b3");
  assert.deepEqual(b3l.map((x) => x.t), EA.papeis);
  assert.deepEqual(b3l.filter((x) => x.adiante).map((x) => x.t), EA.adiante);
  for (const [t, tipo] of Object.entries(EA.tipos)) assert.equal(b3l.find((x) => x.t === t).tipo, tipo, t);
  assert.deepEqual(r.aReceber.filter((x) => x.origem === "estimativa").map((x) => x.t), EA.estimativa);
  assert.deepEqual(r.alertas.filter((a) => a.tipo === "fora-do-retrato").map((a) => a.t), EA.foraDoRetrato);
  assert.equal(r.retrato.dataRef, EA.ate); assert.equal(r.retrato.noMes, EA.noMes);
  // a quantidade de cada linha é a da posição na data final
  for (const x of b3l) { const p = pos(calc, x.t); if (p) assert.equal(x.q, p.q, x.t); }
  // as datas reais vão para a agenda, a distante por último
  assert.equal(r.agenda[0].data, "2026-11-13"); assert.equal(r.agenda.at(-1).t, "ITSA4");
});

test("a receber: a página reconhece o arquivo e manda a linha sem conta; a correção traz o retrato inteiro", { skip: semPython }, () => {
  const dir = tmp();
  try {
    const a = g.arquivos.find((x) => x.tipo === "areceber");
    escreverXlsx(dir, [a, { ...a, nome: "eventos-2026-11-04-09-30-12.xlsx" }], ATE);
    const l1 = linhasDaPagina(lerXlsx(path.join(dir, a.nome)).linhas), l2 = linhasDaPagina(lerXlsx(path.join(dir, "eventos-2026-11-04-09-30-12.xlsx")).linhas);
    assert.equal(l1.tipo, "areceber"); assert.deepEqual(l1, l2);
    assert.ok(!JSON.stringify(l1.linhas).match(/00\d{4}"/), "conta");
    const r1 = retratoDe(l1.linhas, a.nome, ATE), r2 = retratoDe(l2.linhas, "eventos-2026-11-04-09-30-12.xlsx", ATE);
    assert.equal(aplicarRetrato(aplicarRetrato(null, r1, "a", "x").doc, r2, "b", "y").status, "igual");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const d = diferenca(g, manifesto(gerar({ ate: "2026-06-30" })));
  const c = d.arquivos.find((x) => x.tipo === "areceber");
  assert.equal(c.nome, "correcao-2026-11-04-proventos-a-receber.xlsx");
  assert.equal(c.linhas.length, EA.linhas + 1);
});

// ---------- Conferência (cenários 16 e 17) ----------
const EC = ESPERADO_CONFERENCIA;

test("conferência: situações por papel, conta por corretora de EGIE3 e venda sem origem de WEGE3", () => {
  const { calc } = simularImportacao(g.arquivos, ATE);
  const todos = [...calc.posicoes, ...calc.resumo.encerradas];
  const porT = Object.fromEntries(todos.map((p) => [p.t, p]));
  for (const [t, l] of Object.entries(EC.situacoes)) assert.deepEqual(porT[t].situacoes.map((s) => s.id), l, t);
  assert.equal(calc.resumo.conferencia.graves, EC.graves);
  assert.deepEqual(calc.resumo.alertas[0], { tipo: "conferencia", n: EC.graves });
  for (const [t, cs] of Object.entries(EC.porCorretora)) for (const [inst, x] of Object.entries(cs)) {
    const c = porT[t].porCorretora.find((y) => y.inst === inst);
    assert.ok(c, t + " " + inst);
    for (const [k, v] of Object.entries(x)) assert.ok(Math.abs(c[k] - v) < 0.01, `${t} ${inst} ${k}: ${c[k]} != ${v}`);
  }
  for (const [t, q] of Object.entries(EC.vendaSemOrigem)) assert.equal(porT[t].situacoes.find((s) => s.id === "venda-sem-origem").dados.q, q);
  // a portabilidade em dias diferentes não é retirada
  assert.equal(calc.resumo.saidas.retiradas.n, 0);
});

test("conferência: invariantes nos dados falsos (desde o começo = total; por corretora = consolidado, salvo a fração)", () => {
  const { calc } = simularImportacao(g.arquivos, ATE);
  const todos = [...calc.posicoes, ...calc.resumo.encerradas];
  const soma = todos.reduce((s, p) => s + p.geral.resultado, 0);
  assert.ok(Math.abs(soma - calc.resumo.total.ganho) < 0.05, `${soma} x ${calc.resumo.total.ganho}`);
  for (const p of todos) {
    const porCorr = p.porCorretora.reduce((s, x) => s + (x.resultado || 0) + x.realizado, 0);
    // aberta: em aberto + realizado; encerrada: o resultado já é o realizado
    const consolidado = p.q != null ? (p.resultado ?? 0) + p.realizado : p.resultado;
    // a fração que sai baixa pelo preço médio de cada livro: a diferença é 0,2 × (PM da Rico − PM de todas juntas)
    const tol = p.t === "EGIE3" ? 0.2 * Math.abs(p.porCorretora[0].pm - p.pm) + 0.02 : 0.05;
    assert.ok(Math.abs(porCorr - consolidado) <= tol, `${p.t}: ${porCorr} x ${consolidado}`);
  }
});

// ---------- Posições fantasmas (cenários 18 a 20) ----------
const EF = ESPERADO_FANTASMAS;

test("fantasmas: day trade com a venda antes, incorporação com e sem recibo", () => {
  const { calc } = simularImportacao(g.arquivos, ATE);
  const porT = Object.fromEntries([...calc.posicoes, ...calc.resumo.encerradas].map((p) => [p.t, p]));
  for (const [t, x] of Object.entries(EF.dayTrade)) {
    const p = pos(calc, t);
    assert.equal(p.q, x.q); assert.ok(Math.abs(p.pm - x.pm) < 1e-9, t); assert.ok(Math.abs(p.realizado - x.realizado) < 0.005, t);
    assert.ok(Math.abs(p.fifo.realizado - x.realizado) < 0.005, t);
    assert.ok(Math.abs(p.porCorretora[0].realizado - x.realizado) < 0.005, t);
  }
  for (const [t, x] of Object.entries(EF.incorporacao)) {
    const e = calc.resumo.encerradas.find((y) => y.t === t);
    assert.ok(e, t + " encerrada");
    assert.equal(pos(calc, t), undefined, t + " não fica aberta");
    assert.equal(e.incorporadoPor, x.para); assert.equal(e.incorporadoEm, x.d);
    assert.equal(e.resultado, 0);
    assert.deepEqual([e.geral.comprado, e.geral.resgate], [x.comprado, x.resgate]);
    for (const k of [t, x.para]) assert.deepEqual(porT[k].situacoes.filter((s) => s.id === "incorporacao").map((s) => s.texto), [x.texto], k);
    assert.deepEqual(porT[x.para].situacoes.filter((s) => s.grave), [], x.para);
  }
  for (const [t, c] of Object.entries(EF.custo)) assert.ok(Math.abs(pos(calc, t).custo - c) < 0.01, `${t}: ${pos(calc, t).custo} x ${c}`);
  assert.equal(pos(calc, "QZFC13"), undefined);
  // o resgate volta como capital: não é provento nem venda
  assert.ok(Math.abs(calc.resumo.total.resgates - 41.1 - 20.48) < 0.005);
});
