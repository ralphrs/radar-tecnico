// "Nos fóruns": posts de subreddit gravados em foruns-<radar> pela coleta, sem curadoria (src/coleta.js), limpeza por
// 3 dias, widget foruns-<secao> no catálogo do Início (src/painel.js) e a coluna "No fórum" do admin (juntarFontes).
// XML escrito à mão (test/fixtures-reddit.mjs), D1 em SQLite do Node (test/d1-falso.mjs), fetch falso.
import test from "node:test";
import assert from "node:assert/strict";
import { lerReddit, coletar, gravarForuns, docForum, forunsParaApagar, limpar, juntarFontes, ehReddit, REDDIT } from "../src/coleta.js";
import { FEEDS, SECOES_COM_FORUM } from "../src/feeds.js";
import { catalogoDe, validarPainel, respostaPainel, formatosDe, padraoDe } from "../src/painel.js";
import { atomReddit, POSTS, EXTERNO } from "./fixtures-reddit.mjs";
import { d1Falso } from "./d1-falso.mjs";

const DIA = 86_400_000;
const SUB = { radar: "tech", fonte: "r/databricks", pais: "", url: "https://www.reddit.com/r/databricks/top/.rss?t=day", tipo: "reddit" };
const forunsDe = (env, c = "foruns-tech") => env.DB.db.prepare("SELECT id, data, coletado FROM docs WHERE collection = ? ORDER BY id").all(c).map((r) => ({ id: r.id, coletado: r.coletado, ...JSON.parse(r.data) }));

function ambiente() {
  const env = { DB: d1Falso() };
  globalThis.fetch = async (url) => (ehReddit(url) ? new Response(atomReddit(), { status: 200 }) : new Response("não", { status: 404 }));
  return env;
}

test("subreddits leem os mais votados do dia (/top/.rss?t=day) e as seções com fórum saem da lista", () => {
  const subs = FEEDS.filter((f) => f[4] === "reddit");
  assert.ok(subs.length >= 10);
  for (const [, fonte, , url] of subs) assert.match(url, /^https:\/\/www\.reddit\.com\/r\/[A-Za-z0-9_]+\/top\/\.rss\?t=day$/, fonte);
  assert.deepEqual([...SECOES_COM_FORUM].sort(), ["esportes", "investimentos", "negocios", "politica", "tech"]);
  assert.equal(REDDIT.INTERVALO_MIN, 120, "ritmo mantido");
  assert.equal(REDDIT.POR_MINUTO, 1);
});

test("Atom: id do post, autor sem link e subreddit", () => {
  const [txt, lnk, img] = lerReddit(atomReddit());
  assert.equal(txt.idReddit, "1abc01");
  assert.equal(lnk.idReddit, "1abc02");
  assert.equal(img.idReddit, "1abc04");
  assert.equal(txt.autor, "alguem", "só o nome de usuário, sem /u/ nem a url do perfil");
  assert.equal(txt.sub, "databricks");
  // sem <id>: o id sai da url do post
  const semId = atomReddit().replace(/<id>t3_[^<]+<\/id>/g, "");
  assert.deepEqual(lerReddit(semId).map((i) => i.idReddit), ["1abc01", "1abc02", "1abc04"]);
});

test("doc de foruns-<radar>: campos da spec, resumo até 300, link externo sem utm, sem votos", () => {
  const [txt, lnk] = lerReddit(atomReddit());
  const t = "2026-11-04T12:00:00.000Z";
  const d = docForum(txt, SUB, t);
  assert.equal(d.id, "1abc01");
  assert.deepEqual(Object.keys(d.data).sort(), ["autor", "coletado", "linkExterno", "publicado", "resumo", "sub", "titulo", "url"]);
  assert.equal(d.data.titulo, "[P] Unity Catalog: permissões por schema & grupos");
  assert.equal(d.data.url, POSTS.texto);
  assert.equal(d.data.resumo.length, 300);
  assert.ok(txt.trecho.startsWith(d.data.resumo));
  assert.equal(d.data.linkExterno, "");
  assert.equal(d.data.coletado, t);
  assert.ok(!("votos" in d.data) && !("score" in d.data));
  assert.equal(docForum(lnk, SUB, t).data.linkExterno, "https://www.databricks.com/blog/anuncio", "sem utm, como no candidato");
  assert.notEqual(EXTERNO, "https://www.databricks.com/blog/anuncio");
  assert.equal(docForum({ ...txt, idReddit: "" }, SUB, t), null, "sem id não grava");
});

test("coleta: o cron grava o post só em foruns-tech (nada em candidatos); o segundo subreddit com os mesmos posts não duplica", async () => {
  const env = ambiente();
  await coletar(env);
  assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM candidatos").get().n, 0);
  const f1 = forunsDe(env);
  assert.deepEqual(f1.map((d) => d.id), ["1abc01", "1abc02", "1abc04"], "o fixado fica de fora aqui também");
  assert.ok(f1.every((d) => d.sub === "databricks" && d.autor === "alguem" && /^\d{4}-\d{2}-\d{2}T/.test(d.coletado)));
  assert.equal(f1.find((d) => d.id === "1abc02").linkExterno, "https://www.databricks.com/blog/anuncio");
  // segundo minuto: outro subreddit de tech responde o mesmo XML; candidatos e fórum seguem com 3, sem reescrever
  const antes = env.DB.db.prepare("SELECT id, data, atualizado FROM docs WHERE collection = 'foruns-tech' ORDER BY id").all();
  await new Promise((ok) => setTimeout(ok, 5));
  await coletar(env);
  assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM candidatos").get().n, 0);
  const depois = env.DB.db.prepare("SELECT id, data, atualizado FROM docs WHERE collection = 'foruns-tech' ORDER BY id").all();
  assert.deepEqual(depois, antes, "dedupe pelo id: o doc fica como estava");
  // só tech tem os subs lidos até aqui
  assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM docs WHERE collection LIKE 'foruns-%' AND collection <> 'foruns-tech'").get().n, 0);
});

test("gravarForuns: dedupe pelo id; candidato reddit antigo (de /new/) não atrapalha", async () => {
  const env = ambiente();
  const [txt] = lerReddit(atomReddit());
  env.DB.db.prepare("INSERT INTO candidatos (id, radar, url, titulo, fonte, feed, visto, status, motivo, tipo) VALUES ('ix', 'tech', ?, 't', 'r/databricks', 'x', '2026-11-03', 'descartado', 'raso', 'reddit')").run(txt.url);
  assert.equal(await gravarForuns(env, SUB, lerReddit(atomReddit())), 3);
  assert.equal(await gravarForuns(env, SUB, lerReddit(atomReddit())), 0, "segunda vez: nada novo");
  assert.equal(forunsDe(env).length, 3);
  assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM candidatos").get().n, 1, "o candidato antigo fica (sai pela limpeza de 10 dias)");
});

test("limpeza: foruns-* com mais de 3 dias saem por lista de ids; os recentes e as outras collections ficam", async () => {
  const env = { DB: d1Falso() };
  const t = Date.now();
  const ins = env.DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES (?, ?, ?, ?)");
  const doc = (coletado) => JSON.stringify({ titulo: "x", url: "https://www.reddit.com/r/x/comments/a/", coletado });
  ins.run("foruns-tech", "velho1", doc(new Date(t - 4 * DIA).toISOString()), new Date(t - 4 * DIA).toISOString());
  ins.run("foruns-tech", "velho2", doc(""), new Date(t - 3 * DIA - 60_000).toISOString());
  ins.run("foruns-tech", "novo", doc(""), new Date(t - 2 * DIA).toISOString());
  ins.run("foruns-negocios", "velho3", doc(new Date(t - 5 * DIA).toISOString()), "");
  ins.run("foruns-politica", "novo2", doc(new Date(t - DIA).toISOString()), new Date(t - DIA).toISOString());
  ins.run("items", "velho1", JSON.stringify({ tema: "arquitetura", tipo: "noticia" }), new Date(t - 4 * DIA).toISOString());
  assert.deepEqual((await forunsParaApagar(env, "foruns-tech", t)).sort(), ["velho1", "velho2"]);
  const rel = await limpar(env);
  assert.equal(rel["foruns-tech"], 2);
  assert.equal(rel["foruns-negocios"], 1, "sem coletado na linha: vale o do doc");
  const sobram = env.DB.db.prepare("SELECT collection, id FROM docs WHERE collection LIKE 'foruns-%' OR collection = 'items' ORDER BY collection, id").all().map((r) => r.collection + "/" + r.id);
  assert.deepEqual(sobram, ["foruns-politica/novo2", "foruns-tech/novo", "items/velho1"]);
  const deletes = env.DB.log.filter((q) => /DELETE FROM docs/.test(q) && /foruns|collection = \?1 AND id IN/.test(q));
  assert.ok(deletes.length >= 2 && deletes.every((q) => /AND id IN \(/.test(q)), "DELETE sempre com lista de ids");
});

test("catálogo do Início: Fóruns · <seção> só onde há subreddit e para quem tem a seção, em 1x1 e 1x2", () => {
  const ids = catalogoDe(null).filter((w) => w.id.startsWith("foruns-")).map((w) => [w.id, w.titulo]);
  // desde 04/11/2026 as cinco seções têm subreddit (src/feeds.js)
  assert.deepEqual(ids, [["foruns-tech", "Fóruns · Tech"], ["foruns-negocios", "Fóruns · Negócios"], ["foruns-investimentos", "Fóruns · Investimentos"], ["foruns-politica", "Fóruns · Notícias"], ["foruns-esportes", "Fóruns · Esportes"]]);
  assert.deepEqual(formatosDe("foruns-tech"), ["1x1", "1x2"]);
  assert.deepEqual(catalogoDe(["esportes", "investimentos"]).filter((w) => w.id.startsWith("foruns-")).map((w) => w.id), ["foruns-investimentos", "foruns-esportes"]);
  assert.deepEqual(catalogoDe(["negocios"]).filter((w) => w.id.startsWith("foruns-")).map((w) => w.id), ["foruns-negocios"]);
  assert.ok(!padraoDe(null).some((w) => w.id.startsWith("foruns-")), "fora do padrão: a pessoa escolhe em Personalizar");
  assert.deepEqual(validarPainel({ widgets: [{ id: "foruns-tech", formato: "1x2" }, { id: "foruns-politica", formato: "1x1" }] }, null).widgets.map((w) => w.formato), ["1x2", "1x1"]);
  assert.match(validarPainel({ widgets: [{ id: "foruns-tech", formato: "2x1" }] }, null).erro, /Formato inválido/);
  assert.match(validarPainel({ widgets: [{ id: "foruns-tech", formato: "1x1" }] }, ["negocios"]).erro, /seção não liberada/);
  assert.match(validarPainel({ widgets: [{ id: "foruns-inventada", formato: "1x1" }] }, null).erro, /desconhecido/);
  const r = respostaPainel({ widgets: [{ id: "foruns-tech", formato: "1x2" }] }, ["politica"]);
  assert.deepEqual(r.widgets, [], "perdeu Tech: o widget some da grade");
  assert.deepEqual(r.catalogo.find((w) => w.id === "foruns-politica").formatos, ["1x1", "1x2"]);
});

test("admin: subreddit aparece uma vez, só com os posts no fórum; linhas de candidatos reddit antigos ficam de fora", () => {
  const velho = "https://www.reddit.com/r/databricks/new/.rss", novo = "https://www.reddit.com/r/databricks/top/.rss?t=day";
  const results = [
    { radar: "tech", fonte: "r/databricks", feed: velho, lidos: 40, publicados: 0, descartados: 38, fila: 2, raso: 30, fora: 8, erro: "", erros_seguidos: 0, seguidos_403: 0 },
    { radar: "tech", fonte: "InfoQ", feed: "https://feed.infoq.com/", lidos: 10, publicados: 4, descartados: 6 },
  ];
  const estados = [{ feed: novo, erro: "HTTP 429", erros_seguidos: 1, seguidos_403: 0, ultima_checagem: "2026-11-04T10:00:00Z", ultimo_ok: "2026-11-04T08:00:00Z" }];
  const { fontes, semCandidatos } = juntarFontes(results, FEEDS, estados, new Map([["tech|r/databricks", 17]]));
  const db = fontes.filter((f) => f.fonte === "r/databricks");
  assert.equal(db.length, 1);
  assert.deepEqual(db[0], { radar: "tech", fonte: "r/databricks", feed: novo, tipo: "reddit", forum: 17, erro: "HTTP 429", erros_seguidos: 1, seguidos_403: 0, ultima_checagem: "2026-11-04T10:00:00Z", ultimo_ok: "2026-11-04T08:00:00Z" });
  assert.ok(!("lidos" in db[0]) && !("descartados" in db[0]), "sem números de curadoria");
  assert.equal(fontes.filter((f) => f.tipo === "reddit").length, FEEDS.filter((f) => f[4] === "reddit").length, "todo subreddit da lista, com ou sem post");
  assert.equal(fontes.find((f) => f.fonte === "r/opensource").forum, 0);
  assert.equal(fontes.find((f) => f.fonte === "InfoQ").forum, undefined, "feed comum não leva a coluna");
  assert.ok(!semCandidatos.some((f) => f.tipo === "reddit"));
  assert.ok(semCandidatos.some((f) => f.fonte === "Martin Fowler"));
  // dentro da aba, os subreddits vêm depois dos feeds comuns
  const tech = fontes.filter((f) => f.radar === "tech");
  assert.equal(tech[0].fonte, "InfoQ");
});
