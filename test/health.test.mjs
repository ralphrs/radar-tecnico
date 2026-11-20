// Health Checks (pedido de 20/11, 14h27): Health.resumo; o estado de cada tarefa pela tabela Health.TAREFAS com relógio
// injetado (em dia, atrasada, parada, sem dados); a rota só do Admin (404 para convidado) e o ?resumo=1; bloco com erro
// não derruba os outros; cada validação de integridade com dados bons e ruins no D1 falso (que recusa SELECT composto
// com mais de 5 termos, como o D1); a configuração nunca devolve valor.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { d1Falso } from "./d1-falso.mjs";
import { Health, TAREFAS, TAREFA, estadoTarefa, resumo, montar, rotaHealth, grupoConfig, TEMAS_VALIDOS, diaDosDestaques, estadoExterno,
  SQL_TAREFAS_EXTRAS, SQL_FONTES, SQL_EXTERNOS, SQL_INT_CATEGORIAS, SQL_INT_TEMAS } from "../src/health.js";
import { CURADORIA, PLANTAO, OFICINA } from "../src/rotinas.js";

register("data:text/javascript," + encodeURIComponent(
  'export async function resolve(s, c, n) { if (s === "cloudflare:workers") return { url: "data:text/javascript,export class DurableObject {}", shortCircuit: true }; return n(s, c); }'));
const { default: worker } = await import("../src/index.js");

const MIN = 60_000, H = 3_600_000, DIA = 86_400_000;
const iso = (t) => new Date(t).toISOString();
// Sexta-feira, 20/11/2026, 18h UTC (15h em São Paulo)
const AGORA = Date.parse("2026-11-20T18:00:00Z");
const put = (DB, c, id, data, coletado = "") => DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES (?, ?, ?, ?)").run(c, id, JSON.stringify(data), coletado);

test("Health.resumo: pior estado de cada grupo e o geral, com a contagem", () => {
  const r = resumo([
    { id: "a", titulo: "A", linhas: [{ estado: "em dia" }, { estado: "em dia" }, { estado: "atrasada" }] },
    { id: "b", titulo: "B", linhas: [{ estado: "em dia" }] },
    { id: "c", titulo: "C", linhas: [{ estado: "com erro" }, { estado: "parada" }, { estado: "sem dados" }] },
    { id: "d", titulo: "D", erro: "falhou", linhas: [] },
    { id: "e", titulo: "E", emDia: 12, total: 14, linhas: [{ estado: "com erro" }, { estado: "com erro" }] },
  ]);
  const g = Object.fromEntries(r.grupos.map((x) => [x.id, x]));
  assert.deepEqual([g.a.estado, g.a.emDia, g.a.total], ["atrasada", 2, 3]);
  assert.deepEqual([g.b.estado, g.b.emDia, g.b.total], ["em dia", 1, 1]);
  assert.equal(g.c.estado, "parada");
  assert.equal(g.d.estado, "sem dados"); assert.equal(g.d.erro, "falhou");
  assert.deepEqual([g.e.estado, g.e.emDia, g.e.total], ["com erro", 12, 14], "a contagem do grupo vale quando vem pronta");
  assert.equal(r.estado, "parada");
  assert.equal(r.problemas, 4);
  assert.deepEqual(resumo([{ id: "x", linhas: [] }]), { estado: "em dia", problemas: 0, grupos: [{ id: "x", titulo: undefined, estado: "em dia", emDia: 0, total: 0 }] });
  assert.equal(Health.pior(["em dia", "sem dados", "com erro"]), "com erro");
  assert.equal(Health.pior(["em dia", "atrasada", "com erro"]), "atrasada", "a mesma ordem do relatório das rotinas: atrasada pesa mais que com erro");
});

test("Health.TAREFAS: uma tabela só, com os limites de src/rotinas.js", () => {
  assert.deepEqual(TAREFAS.map((t) => t.id), ["curadoria-tech", "curadoria-negocios", "curadoria-investimentos", "curadoria-politica", "curadoria-esportes", "curadoria-oficina", "curadoria-saude",
    "plantao", "dossies", "oficina-levantamento", "saude-situacao"]);
  for (const t of TAREFAS) {
    assert.ok(t.nome && t.le && t.esperado && ["rastro", "fila", "pendencia"].includes(t.modo), t.id);
    assert.ok(t.atrasadaH > 0 && t.paradaH > t.atrasadaH, t.id);
  }
  assert.equal(TAREFA["curadoria-tech"].atrasadaH, CURADORIA.EM_DIA_H);
  assert.equal(TAREFA["curadoria-tech"].paradaH, CURADORIA.ATRASADA_H);
  assert.equal(TAREFA.plantao.atrasadaH, PLANTAO.ATRASADO_H);
  assert.equal(TAREFA.plantao.paradaH, PLANTAO.PARADO_H);
  assert.equal(TAREFA["oficina-levantamento"].paradaH, OFICINA.ATRASADO_D * 24);
});

test("estado de cada tarefa pela tabela, com relógio injetado: em dia, atrasada, parada e sem dados", () => {
  const antes = (h) => iso(AGORA - h * H);
  for (const t of TAREFAS) {
    const meio = (t.atrasadaH + t.paradaH) / 2;
    if (t.modo === "rastro") {
      assert.equal(estadoTarefa(t, { ultima: antes(1), itens24h: 3 }, AGORA).estado, "em dia", t.id);
      assert.equal(estadoTarefa(t, { ultima: antes(meio), itens24h: 3 }, AGORA).estado, "atrasada", t.id);
      assert.equal(estadoTarefa(t, { ultima: antes(t.paradaH + 1), itens24h: 3 }, AGORA).estado, "parada", t.id);
      assert.equal(estadoTarefa(t, { ultima: null }, AGORA).estado, "sem dados", t.id);
    } else if (t.modo === "fila") {
      assert.equal(estadoTarefa(t, { pendentes: 0, ultima: antes(100) }, AGORA).estado, "em dia", t.id + ": sem pendente");
      assert.equal(estadoTarefa(t, { pendentes: 2, desde: antes(0.5) }, AGORA).estado, "em dia", t.id);
      assert.equal(estadoTarefa(t, { pendentes: 1, desde: antes(meio) }, AGORA).estado, "atrasada", t.id);
      assert.equal(estadoTarefa(t, { pendentes: 1, desde: antes(t.paradaH + 1) }, AGORA).estado, "parada", t.id);
      assert.equal(estadoTarefa(t, { pendentes: 1, desde: null }, AGORA).estado, "sem dados", t.id);
    } else {
      assert.equal(estadoTarefa(t, { pendentes: 0, ultima: null }, AGORA).estado, "em dia", t.id + ": nada pendente");
      assert.equal(estadoTarefa(t, { pendentes: 4, ultima: antes(24) }, AGORA).estado, "em dia", t.id);
      assert.equal(estadoTarefa(t, { pendentes: 4, ultima: antes(meio) }, AGORA).estado, "atrasada", t.id);
      assert.equal(estadoTarefa(t, { pendentes: 4, ultima: antes(t.paradaH + 1) }, AGORA).estado, "parada", t.id);
      assert.equal(estadoTarefa(t, { pendentes: 4, ultima: null }, AGORA).estado, "sem dados", t.id);
    }
    assert.equal(estadoTarefa(t, null, AGORA).estado, "sem dados", t.id + ": rastro ilegível");
  }
  // curadoria em dia que não publica nada em 24 h: com erro, como no relatório das rotinas
  const e = estadoTarefa(TAREFA["curadoria-politica"], { ultima: antes(2), itens24h: 0 }, AGORA);
  assert.equal(e.estado, "com erro"); assert.match(e.motivo, /nada entrou/);
  // limite exato: 13 h ainda é em dia
  assert.equal(estadoTarefa(TAREFA["curadoria-tech"], { ultima: antes(13), itens24h: 1 }, AGORA).estado, "em dia");
});

// Banco com tudo em dia: curadorias recentes, itens com tema certo, instruções, destaques de hoje, produto que existe
function bancoBom() {
  const DB = d1Falso();
  const dia = diaDosDestaques(AGORA);
  for (const [s, st, items] of [["tech", "status", "items"], ["negocios", "status-negocios", "items-negocios"], ["investimentos", "status-investimentos", "items-investimentos"], ["politica", "status-politica", "items-politica"],
    ["esportes", "status-esportes", "items-esportes"], ["oficina", "status-oficina", "items-oficina"], ["saude", "status-saude", "items-saude"]]) {
    put(DB, "meta", st, { ultimaRodada: iso(AGORA - 2 * H), novosNaUltima: 2 });
    put(DB, items, s + "1", { titulo: "x", tema: TEMAS_VALIDOS[s][0], ...(s === "saude" ? { produto: "retatrutida" } : {}) }, iso(AGORA - 3 * H));
    put(DB, "instrucoes", s, { texto: "x".repeat(600), versao: 2 });
    put(DB, s === "tech" ? "destaques" : "destaques-" + s, "d" + dia, { data: dia, itens: [] }, dia);
  }
  put(DB, "saude-produtos", "retatrutida", { nome: "Retatrutida", ativo: true, situacaoBrasil: { texto: "sem registro", fonte: "https://exemplo.gov", em: "2026-11-19" } });
  put(DB, "meta", "oficina-categorias", { categorias: [{ id: "serras", nome: "Serras", subcategorias: [] }] });
  put(DB, "meta", "oficina-insumos-categorias", { categorias: [{ id: "colas", nome: "Colas", subcategorias: [] }] });
  put(DB, "meta", "landscape-categorias", { categorias: [{ id: "dados", nome: "Dados", subcategorias: [] }] });
  const lev = { detalhesEm: iso(AGORA - DIA), precosEm: iso(AGORA - DIA) };
  put(DB, "oficina-ferramentas", "serrote", { nome: "Serrote", categoria: "serras", ...lev });
  put(DB, "oficina-insumos", "cola-pva", { nome: "Cola PVA", categoria: "colas", ...lev });
  put(DB, "landscape", "d4vinci--scrapling", { repo: "D4Vinci/Scrapling", categoria: "dados" });
  DB.db.prepare("INSERT INTO feeds_estado (url, radar, fonte, erros_seguidos, ultimo_ok) VALUES ('https://a.exemplo/rss', 'tech', 'A', 0, ?)").run(iso(AGORA - MIN));
  return DB;
}

test("integridade: cada validação com dados bons não acusa nada", async () => {
  const DB = bancoBom();
  const n0 = DB.log.length;
  const d = await montar({ DB }, { agora: AGORA, ids: ["integridade"] });
  assert.equal(DB.log.length - n0, 6, "uma consulta por validação");
  const g = d.grupos[0];
  assert.equal(g.id, "integridade");
  for (const l of g.linhas) assert.equal(l.estado, "em dia", l.id + ": " + l.obs.join(" | "));
  assert.equal(g.linhas.filter((l) => l.id.startsWith("temas-")).length, 7, "uma linha de tema por seção");
  assert.equal(g.estado, "em dia");
  assert.equal(g.emDia, g.total);
});

test("integridade: cada validação acusa os dados ruins, com quantos e até 5 ids", async () => {
  const DB = bancoBom();
  // tema: sem tema e tema de outra seção
  for (let k = 0; k < 7; k++) put(DB, "items", "semtema" + k, { titulo: "x" }, iso(AGORA - k * H));
  put(DB, "items-esportes", "e-errado", { titulo: "x", tema: "marcenaria" }, iso(AGORA - H));
  // Saúde: produto que não existe e sem produto
  put(DB, "items-saude", "s-fantasma", { titulo: "x", tema: "pesquisa", produto: "nao-existe" }, iso(AGORA - H));
  put(DB, "items-saude", "s-sem", { titulo: "x", tema: "pesquisa" }, iso(AGORA - 2 * H));
  // categorias que não existem
  put(DB, "oficina-ferramentas", "plaina", { nome: "Plaina", categoria: "plainas" });
  put(DB, "oficina-insumos", "verniz", { nome: "Verniz", categoria: "acabamento" });
  put(DB, "landscape", "x--y", { repo: "x/y", categoria: "observabilidade" });
  // instruções curtas e ausentes
  DB.db.prepare("UPDATE docs SET data = ? WHERE collection = 'instrucoes' AND id = 'saude'").run(JSON.stringify({ texto: "curta", versao: 1 }));
  DB.db.prepare("DELETE FROM docs WHERE collection = 'instrucoes' AND id = 'oficina'").run();
  // destaques de hoje ausentes em Esportes
  DB.db.prepare("DELETE FROM docs WHERE collection = 'destaques-esportes'").run();
  // candidatos presos em lote há mais de 6 h (e um recente, que não conta)
  const cand = DB.db.prepare("INSERT INTO candidatos (id, radar, url, titulo, fonte, feed, visto, status, lote) VALUES (?, 'tech', ?, 't', 'f', 'https://a.exemplo/rss', ?, 'novo', ?)");
  cand.run("ipreso1", "https://x/1", iso(AGORA - 9 * H), iso(AGORA - 8 * H));
  cand.run("ipreso2", "https://x/2", iso(AGORA - 9 * H), iso(AGORA - 7 * H));
  cand.run("irecente", "https://x/3", iso(AGORA - H), iso(AGORA - H));
  const d = await montar({ DB }, { agora: AGORA, ids: ["integridade"] });
  const L = Object.fromEntries(d.grupos[0].linhas.map((l) => [l.id, l]));
  assert.equal(L["temas-tech"].estado, "com erro");
  assert.equal(L["temas-tech"].n, 7);
  assert.equal(L["temas-tech"].exemplos.length, 5, "até 5 ids");
  assert.deepEqual(L["temas-tech"].exemplos, ["semtema0", "semtema1", "semtema2", "semtema3", "semtema4"], "os mais recentes primeiro");
  assert.equal(L["temas-esportes"].n, 1); assert.deepEqual(L["temas-esportes"].exemplos, ["e-errado"]);
  assert.equal(L["temas-oficina"].estado, "em dia");
  assert.equal(L.produto.n, 2); assert.deepEqual(L.produto.exemplos.sort(), ["s-fantasma", "s-sem"]);
  assert.deepEqual([L["categorias-ferramentas"].n, L["categorias-ferramentas"].exemplos], [1, ["plaina"]]);
  assert.deepEqual([L["categorias-insumos"].n, L["categorias-insumos"].exemplos], [1, ["verniz"]]);
  assert.deepEqual([L["categorias-tecnologias"].n, L["categorias-tecnologias"].exemplos], [1, ["x--y"]]);
  assert.deepEqual(L.instrucoes.exemplos.sort(), ["oficina", "saude"]);
  assert.deepEqual(L.destaques.exemplos, ["esportes"]);
  assert.equal(L.lotes.n, 2); assert.deepEqual(L.lotes.exemplos, ["ipreso1", "ipreso2"]);
  assert.equal(d.grupos[0].estado, "com erro");
  assert.ok(SQL_INT_CATEGORIAS.split("UNION ALL").length <= 5);
});

test("destaques: antes das 9h de São Paulo vale o dia anterior", () => {
  assert.equal(diaDosDestaques(Date.parse("2026-11-20T11:30:00Z")), "2026-11-19", "8h30 em São Paulo");
  assert.equal(diaDosDestaques(Date.parse("2026-11-20T12:30:00Z")), "2026-11-20", "9h30 em São Paulo");
  assert.equal(diaDosDestaques(Date.parse("2026-11-21T02:00:00Z")), "2026-11-20", "23h em São Paulo ainda é dia 20");
});

test("temas válidos: a mesma lista de public/index.html e public/saude.js", () => {
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const bloco = (nome) => { const i = html.indexOf("const " + nome + " = ["); const f = html.indexOf("\n];", i); return html.slice(i, f); };
  const temasDe = (txt) => [...txt.matchAll(/temas: \[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
  const MAPA = { tech: "TEMAS_TECH", politica: "TEMAS_POLITICA", negocios: "TEMAS_NEGOCIOS", investimentos: "TEMAS_INVESTIMENTOS", esportes: "TEMAS_ESPORTES", oficina: "TEMAS_OFICINA" };
  for (const [s, nome] of Object.entries(MAPA)) assert.deepEqual([...TEMAS_VALIDOS[s]].sort(), [...new Set(temasDe(bloco(nome)))].sort(), s);
  assert.deepEqual(TEMAS_VALIDOS.saude, ["pesquisa", "regulacao", "golpes", "mercado", "relatos", "seguranca"]);
});

test("tarefas: rastro do banco vira estado, com a versão das instruções, falhas dos dossiês e a Saúde", async () => {
  const DB = bancoBom();
  DB.db.prepare("UPDATE docs SET data = ? WHERE collection = 'meta' AND id = 'status'").run(JSON.stringify({ ultimaRodada: iso(AGORA - 30 * H), novosNaUltima: 0 })); // Tech parada
  DB.db.prepare("UPDATE docs SET data = ? WHERE collection = 'meta' AND id = 'status-negocios'").run(JSON.stringify({ ultimaRodada: iso(AGORA - 15 * H), novosNaUltima: 1 })); // atrasada
  DB.db.prepare("DELETE FROM docs WHERE collection = 'meta' AND id = 'status-saude'").run(); // sem dados
  put(DB, "pedidos-curadoria", "p0000000000000001", { secao: "tech", agora: true, estado: "pendente", criado: iso(AGORA - 7 * H) });
  put(DB, "arch-dossies", "d0000000000000001", { estado: "falhou", resposta: "As fontes não abriram.", por: "admin@exemplo.dev", criado: iso(AGORA - 5 * H) });
  put(DB, "saude-produtos", "outro", { nome: "Outro", ativo: true, adicionado: iso(AGORA - 30 * H) });
  const d = await montar({ DB }, { agora: AGORA, ids: ["tarefas"] });
  const g = d.grupos[0];
  const L = Object.fromEntries(g.linhas.map((l) => [l.id, l]));
  assert.equal(L["curadoria-tech"].estado, "parada");
  assert.equal(L["curadoria-negocios"].estado, "atrasada");
  assert.equal(L["curadoria-saude"].estado, "sem dados");
  assert.equal(L["curadoria-esportes"].estado, "em dia");
  assert.equal(L["curadoria-esportes"].instrucoes, 2);
  assert.ok(L["curadoria-esportes"].obs.some((o) => /instruções v2/.test(o)));
  assert.equal(L.plantao.estado, "parada", "pedido de rodar agora esperando há 7 h");
  assert.equal(L.dossies.estado, "em dia");
  assert.equal(L.dossies.falhas[0].frase, "As fontes não abriram.");
  assert.ok(!JSON.stringify(g).includes("admin@exemplo.dev"), "o e-mail de quem pediu não aparece");
  assert.equal(L["saude-situacao"].estado, "atrasada", "um produto ativo sem levantar há 30 h");
  assert.equal(L["saude-situacao"].pendentes, 1);
  assert.equal(L["oficina-levantamento"].estado, "em dia");
  assert.equal(g.nota, "O Lookout vê o que cada tarefa gravou, não a agenda dela.");
  assert.equal(g.estado, "parada");
  assert.equal(g.tabela.length, TAREFAS.length);
  assert.ok(SQL_TAREFAS_EXTRAS.split("UNION ALL").length <= 5);
});

test("bloco com erro volta 'sem dados' com a frase e não derruba os outros", async () => {
  const DB = bancoBom();
  const prep = DB.prepare;
  DB.prepare = (sql) => { if (/FROM feeds_estado/.test(sql) && /'falha' AS k/.test(sql)) throw new Error("no such table: feeds_estado"); return prep(sql); };
  const d = await montar({ DB }, { agora: AGORA, estadoEspelho: async () => { throw new Error("DO fora do ar"); } });
  const g = Object.fromEntries(d.grupos.map((x) => [x.id, x]));
  assert.equal(g.fontes.estado, "sem dados");
  assert.match(g.fontes.erro, /no such table: feeds_estado/);
  assert.deepEqual(g.fontes.linhas, []);
  for (const id of ["tarefas", "worker", "externos", "banco", "config", "integridade"]) assert.ok(!g[id].erro, id + " seguiu");
  assert.equal(g.banco.linhas.find((l) => l.id === "espelho").estado, "sem dados");
  assert.match(g.banco.linhas.find((l) => l.id === "espelho").obs[0], /DO fora do ar/);
  assert.deepEqual(d.grupos.map((x) => x.id), ["tarefas", "worker", "fontes", "externos", "banco", "config", "integridade"]);
  assert.ok(d.problemas >= 1);
});

test("fontes: feeds com erros seguidos, sem o subreddit antigo, e as listas para sondar", async () => {
  const DB = bancoBom();
  DB.db.prepare("INSERT INTO feeds_estado (url, radar, fonte, erro, erros_seguidos, seguidos_403, ultimo_ok) VALUES ('https://b.exemplo/rss', 'politica', 'B', 'HTTP 500', 4, 0, ?), ('https://www.reddit.com/r/antigo/new/.rss', 'tech', 'r/antigo', 'HTTP 403', 9, 9, '')").run(iso(AGORA - 2 * DIA));
  const d = await montar({ DB }, { agora: AGORA, ids: ["fontes"] });
  const g = d.grupos[0];
  assert.equal(g.linhas.length, 1);
  assert.equal(g.linhas[0].nome, "B");
  assert.equal(g.linhas[0].estado, "com erro");
  assert.match(g.linhas[0].obs.join(" "), /HTTP 500.*4 vezes seguidas.*há 2 dias/);
  assert.deepEqual([g.emDia, g.total], [1, 2]);
  assert.deepEqual(g.paraSondar.map((x) => x.nome), ["Cripto", "Oficina", "Saúde"]);
  assert.ok(g.paraSondar[0].itens[0].url.startsWith("https://"));
  assert.ok(SQL_FONTES.split("UNION ALL").length <= 5);
});

test("dados externos: resposta boa, erro e reserva", async () => {
  const DB = bancoBom();
  put(DB, "meta", "b3", { atualizado: iso(AGORA - H), acoes: [{ t: "PETR4" }] });
  put(DB, "_sistema", "b3-erro", { quando: iso(AGORA - 2 * H), erro: "HTTP 502" });
  put(DB, "meta", "mercado", { atualizado: iso(AGORA - 10 * MIN), erros: { cripto: "Finnhub: HTTP 429" }, cripto: [{ id: "btc", fonte: "Binance", lido: iso(AGORA - 10 * MIN) }, { id: "eth", fonte: "Binance", lido: iso(AGORA - 10 * MIN) }] });
  put(DB, "_sistema", "landscape-estado", { porId: { "a--b": { marcas: { repo: iso(AGORA - 3 * H), hn: iso(AGORA - 3 * H) }, tent: { readme: iso(AGORA - H) } } }, pausa: {}, github: { restante: 4800, limite: 5000, quando: iso(AGORA - H) } });
  put(DB, "meta", "esportes-bra.1", { rodadaEm: iso(AGORA - 20 * MIN), tabelaEm: iso(AGORA - 2 * H), fonte: "espn" });
  const d = await montar({ DB, FINNHUB_TOKEN: "segredo-finnhub" }, { agora: AGORA, ids: ["externos"] });
  const L = Object.fromEntries(d.grupos[0].linhas.map((l) => [l.id, l]));
  assert.equal(L.b3.estado, "em dia", "a resposta boa veio depois do erro");
  assert.equal(L.cripto.estado, "com erro");
  assert.equal(L.cripto.reserva, true);
  assert.match(L.cripto.obs.join(" "), /reserva: Binance/);
  assert.equal(L.github.estado, "com erro", "parte do GitHub falhou depois da última boa");
  assert.match(L.github.obs.join(" "), /sem GITHUB_TOKEN/);
  assert.match(L.github.obs.join(" "), /4800 de 5000/);
  assert.equal(L.hn.estado, "em dia");
  assert.equal(L.espn.estado, "em dia");
  assert.equal(L.escudos.estado, "sem dados");
  assert.ok(!JSON.stringify(d).includes("segredo-finnhub"));
  assert.equal(estadoExterno({ ok: iso(AGORA - 30 * H), velhoH: 24 }, AGORA), "atrasada");
  assert.ok(SQL_EXTERNOS.split("UNION ALL").length <= 5);
});

test("banco: collections por pessoa somadas, sem e-mail; espelho com a defasagem", async () => {
  const DB = bancoBom();
  put(DB, "favs/convidado@exemplo.com", "x", { a: "x".repeat(5000) });
  put(DB, "carteira/convidado@exemplo.com", "extrato", { cifrado: "zzz" });
  const d = await montar({ DB }, { agora: AGORA, ids: ["banco"], estadoEspelho: async () => ({ ultima_sincronia: iso(AGORA - 2 * MIN), duracao_ms: 300, docs: 40, pendentes: 3 }) });
  const g = d.grupos[0];
  const txt = JSON.stringify(g);
  assert.ok(!txt.includes("convidado@exemplo.com"), "nada de e-mail");
  assert.ok(g.colecoes.some((c) => c.collection === "favs/*"));
  assert.ok(g.colecoes.length <= 15);
  const esp = g.linhas.find((l) => l.id === "espelho");
  assert.equal(esp.estado, "em dia");
  assert.equal(esp.defasagemMin, 2);
  assert.match(esp.obs.join(" "), /3 docs na fila/);
});

test("configuração: só presença, nunca o valor; o que falta diz o que para", () => {
  const env = { DB: {}, ASSETS: {}, ADMIN_EMAIL: "dono@exemplo.dev", ACCESS_TEAM_DOMAIN: "equipe.cloudflareaccess.com", ACCESS_AUD: "aud-secreto-123", CARTEIRA_KEY: "chave-muito-secreta", GITHUB_TOKEN: "ghp_segredo", DEV_EMAIL: "dono@exemplo.dev" };
  const r = grupoConfig(env, { local: false });
  const txt = JSON.stringify(r);
  for (const v of ["dono@exemplo.dev", "equipe.cloudflareaccess.com", "aud-secreto-123", "chave-muito-secreta", "ghp_segredo"]) assert.ok(!txt.includes(v), "vazou " + v);
  const L = Object.fromEntries(r.linhas.map((l) => [l.id, l]));
  assert.equal(L.ADMIN_EMAIL.presente, true);
  assert.equal(L.ADMIN_EMAIL.estado, "em dia");
  assert.equal(L.BRAPI_TOKEN.presente, false);
  assert.equal(L.BRAPI_TOKEN.estado, "em dia", "opcional");
  assert.match(L.BRAPI_TOKEN.obs[0], /Ibovespa/);
  assert.equal(L.DEV_EMAIL.estado, "com erro", "DEV_EMAIL fora do computador desliga o login");
  assert.equal(grupoConfig(env, { local: true }).linhas.find((l) => l.id === "DEV_EMAIL").estado, "em dia");
  const sem = grupoConfig({ DB: {}, ASSETS: {} }, {});
  assert.equal(sem.linhas.find((l) => l.id === "ACCESS_AUD").estado, "com erro");
  assert.match(sem.linhas.find((l) => l.id === "CARTEIRA_KEY").obs[0], /carteira/);
  for (const k of ["ADMIN_EMAIL", "ACCESS_TEAM_DOMAIN", "ACCESS_AUD", "CARTEIRA_KEY", "GITHUB_TOKEN"]) assert.ok(L[k], k);
});

const ctxW = { waitUntil() {} };
const chamar = (env, email, q = "", metodo = "GET") => worker.fetch(new Request("https://lookout.test/api/admin/health" + q, { method: metodo }), { ...env, DEV_EMAIL: email }, ctxW);

test("rota: 404 para convidado, 403 para quem não foi convidado, Admin lê; ?resumo=1 e ?grupo=", async () => {
  const DB = bancoBom();
  DB.db.prepare("INSERT INTO usuarios (email, nome) VALUES ('a@x.com', 'A')").run();
  const env = { DB, ADMIN_EMAIL: "admin@x.com", CARTEIRA_KEY: "nao-mostrar-isto" };
  const n = await chamar(env, "a@x.com");
  assert.equal(n.status, 404);
  assert.equal((await n.json()).erro, "rota");
  assert.equal((await chamar(env, "a@x.com", "?resumo=1")).status, 404);
  assert.equal((await chamar(env, "estranho@x.com")).status, 403);
  assert.equal((await chamar(env, "admin@x.com", "", "POST")).status, 405);
  assert.equal((await chamar(env, "admin@x.com", "?grupo=xyz")).status, 400);
  const r = await chamar(env, "admin@x.com");
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(j.lidoEm && j.estado && typeof j.problemas === "number");
  assert.deepEqual(j.grupos.map((g) => g.id), ["tarefas", "worker", "fontes", "externos", "banco", "config", "integridade"]);
  for (const g of j.grupos) { assert.ok(g.titulo && g.estado && Array.isArray(g.linhas), g.id); for (const l of g.linhas) assert.ok(Health.ESTADOS.includes(l.estado), g.id + "/" + l.id + ": " + l.estado); }
  assert.ok(!JSON.stringify(j).includes("nao-mostrar-isto"));
  assert.ok(!JSON.stringify(j).includes("admin@x.com"));
  // resumo: só o resumo, sem as linhas
  const rr = await (await chamar(env, "admin@x.com", "?resumo=1")).json();
  assert.deepEqual(Object.keys(rr).sort(), ["estado", "grupos", "lidoEm", "problemas"]);
  for (const g of rr.grupos) { assert.ok(!("linhas" in g)); assert.ok(g.id && g.titulo && g.estado && g.total != null && g.emDia != null); }
  assert.equal(rr.problemas, rr.grupos.filter((g) => g.estado !== "em dia").length);
  // um bloco só
  const rg = await (await chamar(env, "admin@x.com", "?grupo=integridade")).json();
  assert.deepEqual(rg.grupos.map((g) => g.id), ["integridade"]);
});

test("nenhuma consulta do Health Checks passa de 5 termos no SELECT composto", async () => {
  for (const sql of [SQL_TAREFAS_EXTRAS, SQL_FONTES, SQL_EXTERNOS, SQL_INT_CATEGORIAS, SQL_INT_TEMAS]) assert.doesNotThrow(() => d1Falso().prepare(sql), sql.slice(0, 60));
  // o D1 falso recusa como o D1; a montagem inteira roda nele
  const d = await montar({ DB: bancoBom() }, { agora: AGORA });
  assert.ok(d.grupos.every((g) => !g.erro), JSON.stringify(d.grupos.filter((g) => g.erro).map((g) => g.erro)));
});
