// Notícias lidas (17/11): rotas /api/lidas (src/lidas.js e o caminho inteiro do Worker), a ordem com as lidas no fim
// (public/lidas.js), a limpeza de 90 dias só em lidas/ e por chave explícita, e a conta apagada levando as marcas.
// O Worker inteiro (src/index.js) carrega em Node com "cloudflare:workers" trocado por uma classe vazia.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { d1Falso, espelhoFalso } from "./d1-falso.mjs";
import { rotaLidas, lidasParaApagar, limparLidas, DIAS, POR_RODADA } from "../src/lidas.js";
import { limpar } from "../src/coleta.js";
import "../public/lidas.js";

register("data:text/javascript," + encodeURIComponent(
  'export async function resolve(s, c, n) { if (s === "cloudflare:workers") return { url: "data:text/javascript,export class DurableObject {}", shortCircuit: true }; return n(s, c); }'));
const { default: worker } = await import("../src/index.js");
const { PREFIXOS_PESSOAIS } = await import("../src/espelho.js");

const L = globalThis.Lidas;
const DIA = 86_400_000;
const req = (metodo, caminho = "/api/lidas") => new Request("https://x" + caminho, { method: metodo });
const marcasDe = (env, email) => env.DB.db.prepare("SELECT id, data FROM docs WHERE collection = ? ORDER BY id").all("lidas/" + email).map((r) => ({ id: r.id, ...JSON.parse(r.data) }));
const pôr = (env, c, id, data, atualizado = "") => env.DB.db.prepare("INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES (?, ?, ?, '', ?)").run(c, id, JSON.stringify(data), atualizado);

// ---------- rota (src/lidas.js) ----------

test("marcar, listar e desmarcar: doc { em } em lidas/<email>, com write-through no espelho", async () => {
  const env = { DB: d1Falso() };
  const esp = espelhoFalso();
  const eu = { email: "eu@x.com" };
  let r = await rotaLidas(req("PUT"), env, eu, "abc123", esp);
  assert.equal(r.status, 200);
  r = await rotaLidas(req("PUT"), env, eu, "items-politica:p9", esp);
  assert.equal(r.status, 200);
  const marcas = marcasDe(env, "eu@x.com");
  assert.deepEqual(marcas.map((m) => m.id), ["abc123", "items-politica:p9"]);
  assert.deepEqual(Object.keys(marcas[0]).sort(), ["em", "id"], "o doc é só { em }");
  assert.ok(!isNaN(Date.parse(marcas[0].em)));
  assert.equal(esp.gravados.length, 2);
  assert.equal(esp.gravados[0].collection, "lidas/eu@x.com");

  const lista = await (await rotaLidas(req("GET"), env, eu, "", esp)).json();
  assert.deepEqual([...lista.ids].sort(), ["abc123", "items-politica:p9"]);

  r = await rotaLidas(req("DELETE"), env, eu, "abc123", esp);
  assert.equal(r.status, 200);
  assert.deepEqual(marcasDe(env, "eu@x.com").map((m) => m.id), ["items-politica:p9"]);
  assert.deepEqual(esp.removidos, [{ collection: "lidas/eu@x.com", id: "abc123" }]);
  // desmarcar o que não está marcado não quebra
  assert.equal((await rotaLidas(req("DELETE"), env, eu, "nunca", esp)).status, 200);
});

test("a lista sai da mais recente para a mais antiga", async () => {
  const env = { DB: d1Falso() };
  pôr(env, "lidas/eu@x.com", "velha", { em: "2026-11-01T10:00:00.000Z" }, "2026-11-01T10:00:00.000Z");
  pôr(env, "lidas/eu@x.com", "nova", { em: "2026-11-16T10:00:00.000Z" }, "2026-11-16T10:00:00.000Z");
  const j = await (await rotaLidas(req("GET"), env, { email: "eu@x.com" }, "", espelhoFalso())).json();
  assert.deepEqual(j.ids, ["nova", "velha"]);
});

test("id inválido, método errado e sem login", async () => {
  const env = { DB: d1Falso() };
  const esp = espelhoFalso();
  const eu = { email: "eu@x.com" };
  assert.equal((await rotaLidas(req("PUT"), env, eu, "", esp)).status, 400, "sem id");
  assert.equal((await rotaLidas(req("PUT"), env, eu, "x".repeat(201), esp)).status, 400, "passa de 200, como nos favoritos");
  assert.equal((await rotaLidas(req("PUT"), env, eu, "x".repeat(200), esp)).status, 200, "200 cabe");
  assert.equal((await rotaLidas(req("PUT"), env, eu, null, esp)).status, 400, "caminho malformado");
  assert.equal((await rotaLidas(req("POST"), env, eu, "abc", esp)).status, 405);
  assert.equal((await rotaLidas(req("GET"), env, {}, "", esp)).status, 401);
  assert.equal(esp.gravados.length, 1);
});

test("uma pessoa não vê nem apaga as marcas da outra", async () => {
  const env = { DB: d1Falso() };
  const esp = espelhoFalso();
  await rotaLidas(req("PUT"), env, { email: "a@x.com" }, "n1", esp);
  await rotaLidas(req("PUT"), env, { email: "b@x.com" }, "n2", esp);
  const doB = await (await rotaLidas(req("GET"), env, { email: "b@x.com" }, "", esp)).json();
  assert.deepEqual(doB.ids, ["n2"]);
  await rotaLidas(req("DELETE"), env, { email: "b@x.com" }, "n1", esp);
  assert.deepEqual(marcasDe(env, "a@x.com").map((m) => m.id), ["n1"], "o DELETE de b não alcança a marca de a");
});

// ---------- o Worker inteiro (src/index.js) ----------

const ctx = { waitUntil() {} };
function envWorker(extra = {}) {
  const DB = d1Falso();
  DB.db.prepare("INSERT INTO usuarios (email, nome) VALUES (?, ?), (?, ?)").run("a@x.com", "A", "b@x.com", "B");
  return { DB, ADMIN_EMAIL: "admin@x.com", ...extra };
}
const chamar = (env, metodo, caminho, email) => worker.fetch(new Request("https://lookout.test" + caminho, { method: metodo, headers: { "X-Requested-With": "XMLHttpRequest" } }), { ...env, DEV_EMAIL: email }, ctx);

test("Worker: sem login a rota responde 401 e não grava nada", async () => {
  const env = envWorker({ ACCESS_TEAM_DOMAIN: "equipe.cloudflareaccess.com", ACCESS_AUD: "aud" });
  for (const [m, c] of [["GET", "/api/lidas"], ["PUT", "/api/lidas/abc"], ["DELETE", "/api/lidas/abc"]]) {
    const r = await worker.fetch(new Request("https://lookout.test" + c, { method: m }), env, ctx);
    assert.equal(r.status, 401, m + " " + c);
  }
  assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM docs WHERE collection LIKE 'lidas/%'").get().n, 0);
});

test("Worker: marca pela rota, cada um vê as suas, id malformado e grande dão 400", async () => {
  const env = envWorker();
  assert.equal((await chamar(env, "PUT", "/api/lidas/" + encodeURIComponent("items-esportes:e1"), "a@x.com")).status, 200);
  assert.equal((await chamar(env, "PUT", "/api/lidas/t1", "b@x.com")).status, 200);
  const a = await (await chamar(env, "GET", "/api/lidas", "a@x.com")).json();
  const b = await (await chamar(env, "GET", "/api/lidas", "b@x.com")).json();
  assert.deepEqual(a.ids, ["items-esportes:e1"]);
  assert.deepEqual(b.ids, ["t1"]);
  assert.equal((await chamar(env, "PUT", "/api/lidas/%E0%A4%A", "a@x.com")).status, 400);
  assert.equal((await chamar(env, "PUT", "/api/lidas/" + "y".repeat(201), "a@x.com")).status, 400);
  assert.equal((await chamar(env, "DELETE", "/api/lidas/t1", "b@x.com")).status, 200);
  assert.deepEqual((await (await chamar(env, "GET", "/api/lidas", "b@x.com")).json()).ids, []);
  // quem não foi convidado não chega à rota
  assert.equal((await chamar(env, "GET", "/api/lidas", "estranho@x.com")).status, 403);
});

test("Worker: apagar a conta leva as marcas junto (e só as dela)", async () => {
  const env = envWorker();
  await chamar(env, "PUT", "/api/lidas/n1", "a@x.com");
  await chamar(env, "PUT", "/api/lidas/n2", "b@x.com");
  pôr(env, "favs/a@x.com", "n1", { titulo: "x" });
  const r = await chamar(env, "DELETE", "/api/admin/usuarios/" + encodeURIComponent("a@x.com"), "admin@x.com");
  assert.equal(r.status, 200);
  assert.deepEqual(marcasDe(env, "a@x.com"), []);
  assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM docs WHERE collection = 'favs/a@x.com'").get().n, 0);
  assert.deepEqual(marcasDe(env, "b@x.com").map((m) => m.id), ["n2"]);
  // a consulta das chaves é uma só, com um termo por collection pessoal
  const sel = env.DB.log.find((s) => /SELECT collection, id FROM docs WHERE collection IN/.test(s));
  assert.equal((sel.match(/\?/g) || []).length, PREFIXOS_PESSOAIS.length);
});

test("lidas/ é collection pessoal do espelho (write-through, sincronia e conta apagada)", () => {
  assert.ok(PREFIXOS_PESSOAIS.includes("lidas/"));
  for (const p of ["favs/", "listas/", "prefs/", "carteira/", "leitura/", "landscape/"]) assert.ok(PREFIXOS_PESSOAIS.includes(p), p);
});

// ---------- ordem (public/lidas.js) ----------

const AGORA = "2026-11-17T12:00:00.000Z";
const N = [
  { id: "a", publicado: "2026-11-17T10:00:00Z", coletado: "2026-11-17T10:05:00Z", relevancia: 2 },
  { id: "b", publicado: "2026-11-17T09:00:00Z", coletado: "2026-11-17T11:00:00Z", relevancia: 4 },
  { id: "c", publicado: "2026-11-17T08:00:00Z", coletado: "2026-11-17T08:30:00Z", relevancia: 4 },
  { id: "d", publicado: "2026-11-17T07:00:00Z", coletado: "2026-11-17T11:30:00Z", relevancia: 1 },
  { id: "e", publicado: "2026-11-17T06:00:00Z", coletado: "2026-11-17T06:10:00Z", relevancia: 5 },
  { id: "f", publicado: "2026-11-18T06:00:00Z", coletado: "2026-11-17T09:30:00Z", relevancia: 3 }, // previsto: vale o coletado
];
const ids = (l) => l.map((i) => i.id).join("");

test("ordem: lidas no fim em cada ordenação, cada bloco na ordem escolhida", () => {
  const lida = (i) => i.id === "b" || i.id === "e";
  for (const modo of L.MODOS) {
    const sem = L.ordenar(N, modo, AGORA);
    const com = L.ordenarComLidas(N, modo, lida, AGORA);
    assert.equal(com.length, N.length);
    assert.deepEqual(ids(com), ids(sem.filter((i) => !lida(i))) + ids(sem.filter(lida)), modo);
    const k = com.findIndex(lida);
    assert.ok(com.slice(k).every(lida), modo + ": depois da primeira lida só vêm lidas");
  }
  assert.equal(ids(L.ordenar(N, "data", AGORA)), "afbcde", "o previsto (f) entra pela hora da coleta");
  assert.equal(ids(L.ordenarComLidas(N, "data", lida, AGORA)), "afcdbe");
  assert.equal(ids(L.ordenarComLidas(N, "relevancia", lida, AGORA)), "cfadeb", "relevância: e (5) antes de b (4) no bloco das lidas");
  assert.equal(ids(L.ordenarComLidas(N, "entrada", lida, AGORA)), "dafcbe");
});

test("ordem: sem lidas, sem função ou tudo lido, a ordem é a de sempre; a lista de entrada não muda", () => {
  const copia = JSON.stringify(N);
  for (const modo of L.MODOS) {
    assert.equal(ids(L.ordenarComLidas(N, modo, null, AGORA)), ids(L.ordenar(N, modo, AGORA)));
    assert.equal(ids(L.ordenarComLidas(N, modo, () => false, AGORA)), ids(L.ordenar(N, modo, AGORA)));
    assert.equal(ids(L.ordenarComLidas(N, modo, () => true, AGORA)), ids(L.ordenar(N, modo, AGORA)));
  }
  assert.equal(JSON.stringify(N), copia);
  // carregar mais: as não lidas que chegam entram antes do bloco das lidas
  const lida = (i) => i.id === "a";
  const mais = [...N, { id: "g", publicado: "2026-11-16T05:00:00Z", coletado: "2026-11-16T05:00:00Z" }];
  assert.equal(ids(L.ordenarComLidas(mais, "data", lida, AGORA)), "fbcdega");
});

test("id da marca: o mesmo dos favoritos na conta; fóruns com a collection", () => {
  assert.equal(L.idDe("items", "abc"), "abc");
  assert.equal(L.idDe("items-negocios", "x1"), "items-negocios:x1");
  assert.equal(L.idDe("foruns-tech", "1abc01"), "foruns-tech:1abc01");
  assert.ok(L.idOk("a") && L.idOk("x".repeat(200)));
  assert.ok(!L.idOk("") && !L.idOk("x".repeat(201)) && !L.idOk(null));
});

// ---------- limpeza ----------

test("limpeza: marcas com mais de 90 dias saem, por collection e lista de ids; o resto fica", async () => {
  const env = { DB: d1Falso() };
  const t = Date.parse(AGORA);
  const velho = new Date(t - (DIAS + 1) * DIA).toISOString(), novo = new Date(t - 10 * DIA).toISOString();
  pôr(env, "lidas/a@x.com", "v1", { em: velho });
  pôr(env, "lidas/a@x.com", "n1", { em: novo });
  pôr(env, "lidas/b@x.com", "v2", { em: velho });
  // outras collections pessoais com o mesmo campo velho não são tocadas
  pôr(env, "favs/a@x.com", "v1", { em: velho, favoritadoEm: velho });
  pôr(env, "lidasx", "v1", { em: velho });
  const fora = await limparLidas(env, t);
  assert.equal(fora.length, 2);
  assert.deepEqual(marcasDe(env, "a@x.com").map((m) => m.id), ["n1"]);
  assert.deepEqual(marcasDe(env, "b@x.com"), []);
  assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM docs WHERE collection IN ('favs/a@x.com', 'lidasx')").get().n, 2);
  const deletes = env.DB.log.filter((s) => /^DELETE/.test(s));
  assert.equal(deletes.length, 2, "um DELETE por collection");
  for (const d of deletes) {
    assert.match(d, /^DELETE FROM docs WHERE collection = \?1 AND id IN \(\?2(,\?\d+)*\)$/);
    assert.doesNotMatch(d, /LIKE|json_extract|</);
  }
});

test("limpeza: no máximo 200 por rodada, e roda dentro do limpar do minuto 7", async () => {
  const env = { DB: d1Falso() };
  const t = Date.now();
  const velho = new Date(t - 120 * DIA).toISOString();
  for (let k = 0; k < 250; k++) pôr(env, "lidas/a@x.com", "v" + String(k).padStart(3, "0"), { em: velho });
  pôr(env, "lidas/a@x.com", "fica", { em: new Date(t - DIA).toISOString() });
  assert.equal((await lidasParaApagar(env, t)).length, POR_RODADA);
  const rel = await limpar(env);
  assert.equal(rel.lidas, 200);
  assert.equal(marcasDe(env, "a@x.com").length, 51);
  const rel2 = await limpar(env);
  assert.equal(rel2.lidas, 50);
  assert.deepEqual(marcasDe(env, "a@x.com").map((m) => m.id), ["fica"]);
  // a parte de lidas no limpar só apaga por collection e ids (lotes de 90)
  const lidasDel = env.DB.log.filter((s) => /^DELETE/.test(s) && /id IN/.test(s) && !/collection = 'hist'/.test(s));
  assert.ok(lidasDel.length >= 3);
});

test("limpeza das notícias, coletas e tradução não citam lidas/ (só src/lidas.js grava e apaga ali)", () => {
  for (const f of ["coleta.js", "traducao.js", "landscape.js", "esportes.js", "mercado.js", "papel.js", "listas.js", "leitura.js"]) {
    const src = readFileSync(new URL("../src/" + f, import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    assert.doesNotMatch(src, /["'`]lidas\//, f);
  }
});

// ---------- página ----------

test("página: ✓ com rótulos e aria-pressed, chip Lidas nos dois lugares e no estado da lista", () => {
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /<script src="\/lidas\.js"><\/script>/);
  assert.match(html, /id="so-lidas"/);
  assert.match(html, /id="topo-lidas"/);
  assert.match(html, /"Marcar como não lida" : "Marcar como lida"/);
  assert.match(html, /class: "visto", type: "button", "aria-pressed"/);
  assert.match(html, /const estado = \(\) => \[[^\n]*soFav, soLidas/);
  assert.match(html, /Lidas · \$\{n\}/);
  assert.doesNotMatch(html.replace(/<style>[\s\S]*?<\/style>/, ""), /ticker/i);
});
