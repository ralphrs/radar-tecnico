// Extratos falsos da B3 (test/fixtures/b3-fake): gera, lê de volta as planilhas como a página lê e passa pelo
// parser e pelo cálculo de src/carteira.js. Precisa de python3 com openpyxl (escreve e lê os .xlsx); sem ele, pula.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mesclar, calcular, chaveLinha } from "../src/carteira.js";
import { gerar, manifesto, diferenca, escreverXlsx, lerXlsx, linhasDaPagina, simularImportacao, reduzirLinha } from "./fixtures/b3-fake/gerar.mjs";
import { ESPERADO, refCalculo } from "./fixtures/b3-fake/cenarios.mjs";

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
      assert.equal(lido.aba, { negociacao: "Negociação", movimentacao: "Movimentação", proventos: "Proventos Recebidos" }[a.tipo]);
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
  assert.deepEqual(calc.resumo.avisos, []);
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
