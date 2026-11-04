// Subreddits como fonte (parser do Atom, fila e ritmo, 429 e 403) e Minhas listas (automáticas da carteira, mover e copiar).
// XML escrito à mão (test/fixtures-reddit.mjs), D1 em SQLite do Node (test/d1-falso.mjs), fetch falso.
import test from "node:test";
import assert from "node:assert/strict";
import { lerReddit, filaReddit, esperaReddit, coletar, garantirColunas, REDDIT, ehReddit } from "../src/coleta.js";
import { loteSonda } from "../src/sonda.js";
import { FEEDS } from "../src/feeds.js";
import { papeisDaCarteira, planoSincronia, sincronizarListasCarteira, rotaListas, AUTOMATICAS } from "../src/listas.js";
import { rotaCarteira } from "../src/carteira.js";
import { atomReddit, POSTS, EXTERNO } from "./fixtures-reddit.mjs";
import { arquivos, b3, fiiResumo } from "./fixtures-carteira.mjs";
import { d1Falso, espelhoFalso } from "./d1-falso.mjs";

const MIN = 60_000;
const SUBS = FEEDS.filter((f) => f[4] === "reddit").map(([radar, fonte, pais, url]) => ({ radar, fonte, pais, url, tipo: "reddit" }));

// ---------- A. Atom do Reddit ----------

test("Atom do Reddit: post com texto, só link, fixado e imagem", () => {
  const itens = lerReddit(atomReddit());
  assert.equal(itens.length, 3, "o fixado fica de fora");
  const [txt, lnk, img] = itens;
  assert.equal(txt.url, POSTS.texto);
  assert.equal(txt.titulo, "[P] Unity Catalog: permissões por schema & grupos", "flair entre colchetes fica");
  assert.equal(txt.tipo, "reddit");
  assert.ok(txt.trecho.startsWith("Estamos migrando o pipeline"));
  assert.ok(txt.trecho.length <= REDDIT.TRECHO && txt.trecho.length > 280);
  assert.ok(!/submitted by|\[link\]|<|&#/.test(txt.trecho), "sem rodapé, tag nem entidade");
  assert.equal(txt.linkExterno, "", "post com texto não leva link externo");
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(txt.publicado));
  assert.equal(lnk.url, POSTS.link);
  assert.equal(lnk.trecho, "");
  assert.equal(lnk.linkExterno, EXTERNO);
  assert.equal(img.linkExterno, "", "imagem do próprio Reddit não é link externo");
  assert.ok(!itens.some((i) => i.url === POSTS.fixado));
});

test("fixado marcado por category também sai; feed sem entry dá lista vazia", () => {
  const xml = atomReddit().replace("<stickied>true</stickied>", '<category term="pinned"/>');
  assert.equal(lerReddit(xml).length, 3);
  assert.deepEqual(lerReddit('<feed xmlns="http://www.w3.org/2005/Atom"><title>x</title></feed>'), []);
  assert.ok(ehReddit("https://www.reddit.com/r/x/new/.rss") && ehReddit("https://old.reddit.com/r/x") && !ehReddit("https://notreddit.com/"));
});

// ---------- A. Ritmo ----------

test("espera do Reddit: 120 min, dobra a cada erro, até 24 h", () => {
  assert.equal(esperaReddit(0), 120 * MIN);
  assert.equal(esperaReddit(1), 240 * MIN);
  assert.equal(esperaReddit(2), 480 * MIN);
  assert.equal(esperaReddit(3), 960 * MIN);
  assert.equal(esperaReddit(4), 24 * 60 * MIN);
  assert.equal(esperaReddit(9), 24 * 60 * MIN);
});

test("fila do Reddit: só os devidos, do mais tempo sem ler para o mais recente", () => {
  const t = Date.parse("2026-11-03T12:00:00Z");
  const [a, b, c, d, e] = SUBS;
  const est = new Map([
    [a.url, { ultima_checagem: new Date(t - 100 * MIN).toISOString(), erros_seguidos: 0 }], // 100 min: ainda não
    [b.url, { ultima_checagem: new Date(t - 121 * MIN).toISOString(), erros_seguidos: 0 }], // 121 min: devido
    [c.url, { ultima_checagem: new Date(t - 200 * MIN).toISOString(), erros_seguidos: 1 }], // 429 uma vez: espera 240
    [d.url, { ultima_checagem: new Date(t - 300 * MIN).toISOString(), erros_seguidos: 1 }], // 300 > 240: devido
    [e.url, { ultima_checagem: new Date(t - 23 * 60 * MIN).toISOString(), erros_seguidos: 0, seguidos_403: 3 }], // bloqueado: 24 h
  ]);
  const fila = filaReddit([a, b, c, d, e], est, t).map((f) => f.url);
  assert.deepEqual(fila, [d.url, b.url]);
  const nunca = filaReddit(SUBS, new Map(), t);
  assert.equal(nunca.length, SUBS.length, "nunca lidos: todos devidos");
});

test("sonda: até 4 URLs comuns por minuto e 1 do Reddit só quando a vez dele está livre", () => {
  const p = ["https://a.com/feed", "https://www.reddit.com/r/a/new/.rss", "https://b.com/feed", "https://www.reddit.com/r/b/new/.rss", "https://c.com/feed", "https://d.com/feed", "https://e.com/feed"];
  assert.deepEqual(loteSonda(p, true), ["https://a.com/feed", "https://b.com/feed", "https://c.com/feed", "https://d.com/feed", "https://www.reddit.com/r/a/new/.rss"]);
  assert.deepEqual(loteSonda(p, false), ["https://a.com/feed", "https://b.com/feed", "https://c.com/feed", "https://d.com/feed"]);
});

// Coleta inteira com D1 em SQLite e fetch falso: feeds comuns respondem 404, o Reddit responde o que `reddit` mandar.
function ambiente(reddit) {
  const env = { DB: d1Falso() };
  const pedidos = [];
  globalThis.fetch = async (url, op) => {
    pedidos.push({ url: String(url), ua: op && op.headers && op.headers["user-agent"] });
    if (!ehReddit(url)) return new Response("não", { status: 404 });
    return reddit(String(url));
  };
  return { env, pedidos, doReddit: () => pedidos.filter((p) => ehReddit(p.url)) };
}

test("coleta: cada cron lê no máximo 1 subreddit, com o user-agent do Lookout; o post vai para foruns-<radar>, não para candidatos", async () => {
  const { env, doReddit } = ambiente(() => new Response(atomReddit(), { status: 200 }));
  const r1 = await coletar(env);
  assert.equal(r1.reddit, 1);
  assert.equal(doReddit().length, 1);
  assert.equal(doReddit()[0].ua, REDDIT.UA);
  const r2 = await coletar(env);
  assert.equal(r2.reddit, 1);
  assert.equal(doReddit().length, 2);
  assert.notEqual(doReddit()[0].url, doReddit()[1].url, "o segundo cron pega outro subreddit");
  assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM candidatos").get().n, 0, "post de subreddit não vira candidato");
  const forum = env.DB.db.prepare("SELECT id, json_extract(data, '$.url') AS url, json_extract(data, '$.linkExterno') AS ext FROM docs WHERE collection = 'foruns-tech' ORDER BY id").all();
  assert.equal(forum.length, 3, "mesmos posts nos dois subs de mentira: dedupe pelo id do post");
  assert.equal(forum.find((c) => c.url === POSTS.link).ext, "https://www.databricks.com/blog/anuncio", "link externo sem utm");
  const est = env.DB.db.prepare("SELECT novos_total FROM feeds_estado WHERE url = ?").get(doReddit()[0].url);
  assert.equal(est.novos_total, 3, "novos_total conta os posts novos no fórum");
});

test("coleta: 429 registra, dobra a espera e o próximo cron vai para outro subreddit", async () => {
  let n = 0;
  const { env, doReddit } = ambiente(() => (n++ === 0 ? new Response("devagar", { status: 429 }) : new Response(atomReddit(), { status: 200 })));
  await coletar(env);
  const primeiro = doReddit()[0].url;
  const e = env.DB.db.prepare("SELECT erro, erros_seguidos FROM feeds_estado WHERE url = ?").get(primeiro);
  assert.deepEqual({ ...e }, { erro: "HTTP 429", erros_seguidos: 1 });
  await coletar(env);
  assert.notEqual(doReddit()[1].url, primeiro);
  // depois de 3 h, o do 429 ainda espera (240 min); os nunca lidos vêm antes
  const t = Date.now() + 180 * MIN;
  const est = new Map(env.DB.db.prepare("SELECT url, ultima_checagem, erros_seguidos, seguidos_403 FROM feeds_estado").all().map((r) => [r.url, r]));
  assert.ok(!filaReddit(SUBS, est, t).some((f) => f.url === primeiro));
  assert.ok(filaReddit(SUBS, est, Date.now() + 241 * MIN).some((f) => f.url === primeiro));
});

test("coleta: 403 três vezes seguidas marca o subreddit como bloqueado", async () => {
  const { env } = ambiente(() => new Response("proibido", { status: 403 }));
  const sub = SUBS[0].url;
  // só esse sub fica devido: os outros com leitura recente
  const agoraIso = new Date().toISOString();
  for (const s of SUBS.slice(1)) env.DB.db.prepare("INSERT INTO feeds_estado (url, radar, fonte, ultima_checagem) VALUES (?, ?, ?, ?)").run(s.url, s.radar, s.fonte, agoraIso);
  for (let k = 0; k < 3; k++) {
    await coletar(env);
    env.DB.db.prepare("UPDATE feeds_estado SET ultima_checagem = '' WHERE url = ?").run(sub); // força a próxima tentativa
  }
  const e = env.DB.db.prepare("SELECT erro, seguidos_403 FROM feeds_estado WHERE url = ?").get(sub);
  assert.equal(e.seguidos_403, 3);
  assert.match(e.erro, /^bloqueado: HTTP 403/);
});

test("colunas novas entram por ALTER TABLE quando o banco é antigo", async () => {
  const antigo = "CREATE TABLE candidatos (id TEXT PRIMARY KEY, radar TEXT NOT NULL, url TEXT NOT NULL, titulo TEXT NOT NULL, fonte TEXT NOT NULL, pais TEXT NOT NULL DEFAULT '', publicado TEXT NOT NULL DEFAULT '', trecho TEXT NOT NULL DEFAULT '', feed TEXT NOT NULL, visto TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'novo', lote TEXT, motivo TEXT);"
    + "CREATE TABLE feeds_estado (url TEXT PRIMARY KEY, radar TEXT NOT NULL, fonte TEXT NOT NULL, ultima_checagem TEXT NOT NULL DEFAULT '', ultimo_ok TEXT NOT NULL DEFAULT '', erro TEXT NOT NULL DEFAULT '', erros_seguidos INTEGER NOT NULL DEFAULT 0, itens_ultima INTEGER NOT NULL DEFAULT 0, novos_total INTEGER NOT NULL DEFAULT 0);"
    + "INSERT INTO candidatos (id, radar, url, titulo, fonte, feed, visto) VALUES ('i1', 'tech', 'https://x', 't', 'f', 'https://feed', '2026-11-01');";
  const DB = d1Falso({ schema: antigo });
  // o módulo guarda que já conferiu; aqui o teste usa um banco novo, então zera pela importação dinâmica
  const { garantirColunas: g } = await import("../src/coleta.js?antigo");
  await g({ DB });
  const cols = (t) => DB.db.prepare(`SELECT name FROM pragma_table_info('${t}')`).all().map((r) => r.name);
  assert.ok(cols("candidatos").includes("tipo") && cols("candidatos").includes("link_externo"));
  assert.ok(cols("feeds_estado").includes("seguidos_403"));
  assert.equal(DB.db.prepare("SELECT tipo FROM candidatos WHERE id = 'i1'").get().tipo, "", "linha antiga fica com tipo vazio");
  await g({ DB }); // segunda vez não faz nada
  assert.ok(typeof garantirColunas === "function");
});

// ---------- B. Listas automáticas da carteira ----------

const P = (t, classe, valor, q = 10) => ({ t, classe, valor, q });

test("papéis por classe, na ordem de valor, só posição aberta", () => {
  const pos = [P("HGLG11", "fii", 900), P("PETR4", "acao", 800), P("KNRI11", "fii", 700), P("ZERO11", "fii", 0, 0), P("BOVA11", "etf", 100), P("XPTO99", "outro", 50)];
  assert.deepEqual(papeisDaCarteira(pos), { "carteira-fiis": ["HGLG11", "KNRI11"], "carteira-acoes": ["PETR4"], "carteira-etfs": ["BOVA11"] });
  assert.deepEqual(papeisDaCarteira(null), {});
});

test("plano da sincronia: cria, atualiza, mantém o que não mudou e remove a vazia", () => {
  const t0 = "2026-11-01T00:00:00.000Z";
  const atuais = {
    "carteira-fiis": { nome: "Carteira · FIIs", papeis: ["HGLG11", "KNRI11"], auto: true, criado: t0 },
    "carteira-acoes": { nome: "Carteira · Ações", papeis: ["PETR4"], auto: true, criado: t0 },
    "carteira-bdrs": { nome: "Carteira · BDRs", papeis: ["AAPL34"], auto: true, criado: t0 },
  };
  const p = planoSincronia(atuais, { "carteira-fiis": ["KNRI11"], "carteira-acoes": ["PETR4"], "carteira-etfs": ["BOVA11"] }, "2026-11-03T00:00:00.000Z");
  assert.deepEqual(p.gravar.map((g) => g.id), ["carteira-fiis", "carteira-etfs"]);
  assert.deepEqual(p.apagar, ["carteira-bdrs"]);
  const fiis = p.gravar[0].doc;
  assert.deepEqual(fiis.papeis, ["KNRI11"], "papel vendido some");
  assert.equal(fiis.criado, t0);
  assert.equal(fiis.auto, true);
  assert.equal(p.gravar[1].doc.nome, "Carteira · ETFs");
});

test("sincronia no D1: cria, atualiza, remove e apaga tudo sem carteira, sem tocar nas listas manuais", async () => {
  const env = { DB: d1Falso() };
  const esp = espelhoFalso();
  const col = "listas/eu@x.com";
  env.DB.db.prepare("INSERT INTO docs (collection, id, data) VALUES (?, 'minha-0001', ?)").run(col, JSON.stringify({ nome: "Minha", papeis: ["HGLG11"], criado: "2026-10-01" }));
  const r1 = await sincronizarListasCarteira(env, "eu@x.com", [P("HGLG11", "fii", 900), P("PETR4", "acao", 800)], esp);
  assert.deepEqual(r1.gravadas, ["carteira-fiis", "carteira-acoes"]);
  const ids = () => env.DB.db.prepare("SELECT id FROM docs WHERE collection = ? ORDER BY id").all(col).map((r) => r.id);
  assert.deepEqual(ids(), ["carteira-acoes", "carteira-fiis", "minha-0001"]);
  const r2 = await sincronizarListasCarteira(env, "eu@x.com", [P("HGLG11", "fii", 900)], esp);
  assert.deepEqual(r2, { gravadas: [], apagadas: ["carteira-acoes"] });
  assert.deepEqual(esp.removidos, [{ collection: col, id: "carteira-acoes" }]);
  await sincronizarListasCarteira(env, "eu@x.com", null, esp);
  assert.deepEqual(ids(), ["minha-0001"]);
  assert.equal(esp.gravados.length, 2);
});

test("carteira: importar cria as listas automáticas; apagar a carteira apaga", async () => {
  const env = { DB: d1Falso(), CARTEIRA_KEY: Buffer.alloc(32, 7).toString("base64") };
  const esp = espelhoFalso();
  env.DB.db.prepare("INSERT INTO docs (collection, id, data) VALUES ('meta', 'b3', ?), ('meta', 'fii-resumo', ?)").run(JSON.stringify(b3), JSON.stringify(fiiResumo));
  const deps = { ...esp, sincronizarListas: sincronizarListasCarteira };
  const quem = { email: "eu@x.com" };
  const pedir = (metodo, corpo) => new Request("https://x/api/carteira", { method: metodo, headers: { "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
  const simulado = await (await rotaCarteira(pedir("POST", { simular: true, arquivos: arquivos() }), env, quem, "importar", deps)).json();
  assert.equal(simulado.gravado, false);
  assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM docs WHERE collection = 'listas/eu@x.com'").get().n, 0, "simular não cria lista");
  const r = await (await rotaCarteira(pedir("POST", { arquivos: arquivos() }), env, quem, "importar", deps)).json();
  assert.equal(r.gravado, true);
  const listas = Object.fromEntries(env.DB.db.prepare("SELECT id, data FROM docs WHERE collection = 'listas/eu@x.com'").all().map((x) => [x.id, JSON.parse(x.data)]));
  assert.deepEqual(Object.keys(listas).sort(), ["carteira-acoes", "carteira-fiis"]);
  assert.deepEqual(listas["carteira-fiis"].papeis, ["QRST11", "UVWX11", "YZAB11"], "por valor: 11.000, 450 (50 × 9) e 420 (20 × 21)");
  assert.equal(listas["carteira-acoes"].auto, true);
  await rotaCarteira(pedir("DELETE"), env, quem, "", deps);
  assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM docs WHERE collection = 'listas/eu@x.com'").get().n, 0);
});

// ---------- C. Rota das listas: PUT travado, mover e copiar ----------

function listasEnv() {
  const env = { DB: d1Falso() };
  const esp = espelhoFalso();
  const col = "listas/eu@x.com";
  const por = (id, doc) => env.DB.db.prepare("INSERT INTO docs (collection, id, data) VALUES (?, ?, ?)").run(col, id, JSON.stringify(doc));
  por("carteira-fiis", { nome: "Carteira · FIIs", papeis: ["HGLG11", "KNRI11"], auto: true, criado: "2026-11-01" });
  por("renda-0001", { nome: "Renda", papeis: ["MXRF11", "PETR4"], criado: "2026-11-02" });
  por("olho-0002", { nome: "De olho", papeis: ["VALE3"], criado: "2026-11-03" });
  const chamar = async (metodo, id, corpo) => {
    const r = await rotaListas(new Request("https://x/api/listas" + (id ? "/" + id : ""), { method: metodo, headers: { "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined }), env, { email: "eu@x.com" }, id, esp);
    return { status: r.status, j: await r.json() };
  };
  const papeis = (id) => JSON.parse(env.DB.db.prepare("SELECT data FROM docs WHERE collection = ? AND id = ?").get(col, id).data).papeis;
  return { env, esp, chamar, papeis, por };
}

test("PUT em lista automática dá 400; DELETE é aceito", async () => {
  const { chamar } = listasEnv();
  const r = await chamar("PUT", "carteira-fiis", { nome: "Outra", papeis: ["HGLG11"] });
  assert.equal(r.status, 400);
  assert.equal(r.j.erro, "lista automática");
  assert.equal((await chamar("PUT", "renda-0001", { nome: "Renda", papeis: ["MXRF11"] })).status, 200);
  assert.equal((await chamar("DELETE", "carteira-fiis")).status, 200);
});

test("mover e copiar entre listas", async () => {
  const { chamar, papeis, esp } = listasEnv();
  let r = await chamar("POST", "mover", { de: "renda-0001", para: "olho-0002", papel: "PETR4", copiar: false });
  assert.equal(r.status, 200);
  assert.deepEqual(papeis("renda-0001"), ["MXRF11"]);
  assert.deepEqual(papeis("olho-0002"), ["VALE3", "PETR4"]);
  assert.equal(esp.gravados.length, 2, "as duas listas vão ao espelho");
  r = await chamar("POST", "mover", { de: "olho-0002", para: "renda-0001", papel: "VALE3", copiar: true });
  assert.equal(r.status, 200);
  assert.deepEqual(papeis("olho-0002"), ["VALE3", "PETR4"], "copiar não tira da origem");
  assert.deepEqual(papeis("renda-0001"), ["MXRF11", "VALE3"]);
  // da automática: copiar pode, mover não
  r = await chamar("POST", "mover", { de: "carteira-fiis", para: "renda-0001", papel: "HGLG11", copiar: false });
  assert.equal(r.status, 400);
  r = await chamar("POST", "mover", { de: "carteira-fiis", para: "renda-0001", papel: "HGLG11", copiar: true });
  assert.equal(r.status, 200);
  assert.deepEqual(papeis("carteira-fiis"), ["HGLG11", "KNRI11"]);
});

test("mover: destino automático, duplicado, papel ausente, lista de outra pessoa e limite de 60", async () => {
  const { chamar, por, env } = listasEnv();
  let r = await chamar("POST", "mover", { de: "renda-0001", para: "carteira-fiis", papel: "MXRF11" });
  assert.equal(r.status, 400); assert.match(r.j.erro, /automática/);
  r = await chamar("POST", "mover", { de: "renda-0001", para: "olho-0002", papel: "MXRF11" });
  assert.equal(r.status, 200);
  por("tem-0003", { nome: "Tem", papeis: ["MXRF11"], criado: "2026-11-03" });
  r = await chamar("POST", "mover", { de: "olho-0002", para: "tem-0003", papel: "MXRF11" });
  assert.equal(r.status, 400); assert.match(r.j.erro, /já está/);
  r = await chamar("POST", "mover", { de: "olho-0002", para: "tem-0003", papel: "ITUB4" });
  assert.equal(r.status, 400); assert.match(r.j.erro, /não está/);
  env.DB.db.prepare("INSERT INTO docs (collection, id, data) VALUES ('listas/outra@x.com', 'dela-0001', ?)").run(JSON.stringify({ nome: "Dela", papeis: [] }));
  r = await chamar("POST", "mover", { de: "olho-0002", para: "dela-0001", papel: "VALE3" });
  assert.equal(r.status, 404, "lista de outra pessoa não existe para mim");
  const cheia = Array.from({ length: 60 }, (_, k) => "AAAA" + (k + 10));
  por("cheia-0004", { nome: "Cheia", papeis: cheia, criado: "2026-11-03" });
  r = await chamar("POST", "mover", { de: "olho-0002", para: "cheia-0004", papel: "VALE3" });
  assert.equal(r.status, 400); assert.match(r.j.erro, /60/);
  r = await chamar("POST", "mover", { de: "olho-0002", para: "olho-0002", papel: "VALE3" });
  assert.equal(r.status, 400);
  assert.equal((await chamar("GET", "mover")).status, 405);
});

test("as automáticas não contam no limite de listas do POST", async () => {
  const { chamar, por } = listasEnv();
  for (let k = 0; k < 27; k++) por("l-" + k, { nome: "L" + k, papeis: [], criado: "2026-11-03" });
  // 29 manuais + 1 automática
  assert.equal((await chamar("POST", "", { nome: "Trigésima", papeis: [] })).status, 200);
  assert.equal((await chamar("POST", "", { nome: "Uma a mais", papeis: [] })).status, 400);
  assert.equal(AUTOMATICAS.length, 7); // FIIs, FI-Infra, Fiagro, Ações, BDRs, ETFs, Subscrições
});
