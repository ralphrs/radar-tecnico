// Landscape de tecnologias em Tech (pedido de 12/11): leitores do GitHub e do HN, URL do repositório, marca só de
// organização, série de estrelas, comentários do HN, ritmo e orçamento do cron, semente, notícias do próprio Lookout,
// rotas (Admin e limites), categorias, notas e o widget do Início. D1 em SQLite do Node, fetch falso.
import test from "node:test";
import assert from "node:assert/strict";
import { lerRepo, lerCommit, lerReleases, lerLinguagens, contagemPeloLink, lerIssues, lerBuscaHn, juntarHistorias, planejar, vencida, PARTES, ORCAMENTO,
  rodadaLandscape, cronLandscape, semearLandscape, lerEstado, SEMENTE, CATEGORIAS_INICIAIS, rotaLandscape, rotaAdminLandscape, citacoes, sqlCitacoes, termosDe, urls, listaSonda } from "../src/landscape.js";
import { catalogoDe, formatosDe, validarPainel } from "../src/painel.js";
import { CSP } from "../src/seguranca.js";
import { d1Falso, espelhoFalso } from "./d1-falso.mjs";
import { REPOS, commits, releases, linguagens, link, buscaIssues, buscaHn, hit, itemHn, readme, resposta } from "./fixtures-landscape.mjs";
import "../public/landscape.js";
import "../public/inicio-grade.js";

const L = globalThis.Landscape;
const DIA = 86_400_000;
const AGORA = Date.parse("2026-11-12T15:00:00Z");
const ADMIN = { email: "admin@teste.dev", admin: true, secoes: null };
const CONVIDADO = { email: "convidado@teste.dev", admin: false, secoes: ["tech"] };

// ---------- URL do repositório ----------
test("URL do GitHub: aceita com barra, .git, caminho extra e sem https; recusa o resto", () => {
  const ok = (u, repo) => assert.deepEqual(L.lerUrlRepo(u), { repo, id: repo.toLowerCase().replace("/", "--") }, u);
  ok("https://github.com/SigNoz/signoz", "SigNoz/signoz");
  ok("https://github.com/SigNoz/signoz/", "SigNoz/signoz");
  ok("https://github.com/louislam/uptime-kuma.git", "louislam/uptime-kuma");
  ok("https://github.com/stablyai/orca/tree/main/docs?tab=readme#x", "stablyai/orca");
  ok("http://www.github.com/D4Vinci/Scrapling/issues/12", "D4Vinci/Scrapling");
  ok("github.com/thedotmack/claude-mem", "thedotmack/claude-mem");
  ok("  https://github.com/woodpecker-ci/woodpecker  ", "woodpecker-ci/woodpecker");
  ok("https://github.com/a/b.c_d-e", "a/b.c_d-e");
  for (const u of ["", "https://gitlab.com/a/b", "https://gist.github.com/a/b", "https://github.com/SigNoz", "https://github.com/orgs/SigNoz/people", "https://github.com/topics/observability",
    "https://github.com/-ruim/x", "https://github.com/ru--im/x", "https://github.com/a/..", "https://github.com/a/b%20c", "ftp://github.com/a/b", "javascript:alert(1)", "https://user:pw@github.com/a/b",
    "https://github.com.evil.dev/a/b", "https://github.com:8443/a/b", "https://github.com/" + "a".repeat(40) + "/x", "https://github.com/a/" + "b".repeat(101)])
    assert.ok(L.lerUrlRepo(u).erro, "recusa " + u);
  const lote = L.lerUrls("https://github.com/SigNoz/signoz\n\nhttps://github.com/signoz/SIGNOZ/\nhttps://gitlab.com/x/y\nhttps://github.com/stablyai/orca");
  assert.deepEqual(lote.validas.map((x) => x.id), ["signoz--signoz", "stablyai--orca"], "repetida conta uma vez (caixa não importa)");
  assert.equal(lote.recusadas.length, 1);
  assert.ok(L.lerUrls(Array.from({ length: 51 }, (_, i) => "https://github.com/a/r" + i)).erro, "até 50 por vez");
  assert.equal(L.repoDoId("woodpecker-ci--woodpecker"), "woodpecker-ci/woodpecker");
  assert.equal(L.repoDoId("a--b--c"), "a/b--c", "o primeiro -- separa: login do GitHub não tem --");
  assert.ok(L.ID_OK.test("openobserve--openobserve") && !L.ID_OK.test("openobserve") && !L.ID_OK.test("Open--x") && !L.ID_OK.test("a--b/c"));
});

// ---------- marca ----------
test("marcaOk: avatar só de organização, só da origem do GitHub e no formato montado pelo id; CSP com a origem", () => {
  const url = "https://avatars.githubusercontent.com/u/76905799?s=96";
  assert.equal(L.marcaOk(url, "Organization"), true);
  assert.equal(L.marcaOk(url, "User"), false, "pessoa: monograma, nunca foto");
  assert.equal(L.marcaOk(url, undefined), false);
  for (const u of ["https://avatars.githubusercontent.com/u/76905799?v=4", "http://avatars.githubusercontent.com/u/1?s=96", "https://evil.dev/u/1?s=96",
    "https://avatars.githubusercontent.com.evil.dev/u/1?s=96", "https://avatars.githubusercontent.com/u/1?s=96&x=1", "https://avatars.githubusercontent.com/in/1?s=96", "", null, 42])
    assert.equal(L.marcaOk(u, "Organization"), false, String(u));
  assert.equal(L.marcaDe({ tipo: "Organization", id: 76905799 }), url);
  assert.equal(L.marcaDe({ tipo: "User", id: 1336778 }), "");
  assert.equal(L.marcaDe({ tipo: "Organization", id: "1;x" }), "");
  // lerRepo monta a marca pelo id, ignora o avatar_url que veio, e não monta para pessoa
  assert.equal(lerRepo(REPOS["signoz--signoz"]).marca, url);
  assert.equal(lerRepo(REPOS["louislam--uptime-kuma"]).marca, "");
  assert.match(CSP, /img-src [^;]*https:\/\/avatars\.githubusercontent\.com\/u\/(\s|$)/, "só a pasta de avatares por id");
  assert.ok(!/\*/.test(CSP));
  const m = L.monograma("Uptime Kuma"), m2 = L.monograma("SigNoz"), m3 = L.monograma("claude-mem"), m4 = L.monograma("Scrapling");
  assert.deepEqual([m.iniciais, m2.iniciais, m3.iniciais, m4.iniciais], ["UK", "SN", "CM", "SC"]);
  assert.equal(L.monograma("Uptime Kuma").matiz, m.matiz, "a cor sai do nome, sempre a mesma");
});

// ---------- leitores do GitHub ----------
test("leitores do GitHub: repositório, commit, releases, linguagens, contagem pelo Link e issues com reações", () => {
  const g = lerRepo(REPOS["openobserve--openobserve"]);
  assert.equal(g.estrelas, 23000); assert.equal(g.forks, 1200); assert.equal(g.watchers, 120, "watchers é subscribers_count (watchers_count repete as estrelas)");
  assert.equal(g.licenca, "AGPL-3.0"); assert.equal(g.linguagem, "Rust"); assert.equal(g.site, "https://openobserve.ai/");
  assert.equal(g.dono.tipo, "Organization"); assert.equal(g.arquivado, false); assert.equal(g.topics.length, 18); assert.equal(g.push, "2026-11-13T00:24:35.000Z");
  assert.equal(lerRepo(REPOS["signoz--signoz"]).licenca, "Other", "NOASSERTION mostra o nome que o GitHub dá");
  assert.equal(lerRepo({ full_name: "a/b", homepage: "javascript:alert(1)", topics: ["ok", "NÃO", 3] }).site, "");
  assert.deepEqual(lerRepo({ topics: ["ok", "NÃO", 3] }).topics, ["ok"]);
  assert.equal(lerRepo(null), null); assert.equal(lerRepo([]), null);
  const vazio = lerRepo({});
  assert.equal(vazio.estrelas, null); assert.equal(vazio.licenca, ""); assert.equal(vazio.dono, null); assert.equal(vazio.marca, "");
  assert.equal(lerCommit(commits("2026-11-12T10:00:00Z")), "2026-11-12T10:00:00.000Z");
  assert.equal(lerCommit([]), null); assert.equal(lerCommit({ message: "Git Repository is empty." }), null);
  const rs = lerReleases(releases());
  assert.deepEqual(rs.map((r) => r.tag), ["v0.70.0-rc1", "v0.60.0", "v0.40.0"], "rascunho fica de fora");
  assert.equal(rs[0].pre, true);
  assert.equal(rs[1].nome, "v0.60.0 <b>grande</b>", "o nome vai como texto (a página escapa)");
  assert.ok(!/[<>]|script|!\[|\]\(/.test(rs[1].notas), "notas em texto puro: " + rs[1].notas);
  assert.match(rs[1].notas, /New SLO dashboards/); assert.match(rs[1].notas, /Faster search/);
  assert.equal(rs[2].url, "", "link fora do github.com não passa");
  assert.deepEqual(lerReleases({ message: "Not Found" }), []);
  const ls = lerLinguagens(linguagens());
  assert.equal(ls.length, 7); assert.equal(ls[0].nome, "Rust"); assert.equal(ls[6].nome, "Outras");
  assert.ok(Math.abs(ls.reduce((s, x) => s + x.pct, 0) - 100) < 0.5);
  assert.deepEqual(lerLinguagens({}), []);
  const base = "https://api.github.com/repositories/1/contributors?per_page=1&anon=1";
  assert.equal(contagemPeloLink(link(base, 1873), [{}]), 1873);
  assert.equal(contagemPeloLink("", [{ login: "a" }]), 1, "sem Link: cabe numa página");
  assert.equal(contagemPeloLink("", []), 0);
  const is = lerIssues(buscaIssues(AGORA), AGORA);
  assert.deepEqual(is.map((i) => i.numero), [812, 900, 950], "mais de 12 meses fica de fora; mais reações primeiro");
  assert.deepEqual([is[0].tipo, is[1].tipo], ["issue", "pr"]);
  assert.deepEqual([is[0].estado, is[1].estado], ["aberta", "fechada"]);
  assert.equal(is[0].reacoes, 120); assert.equal(is[2].reacoes, 0); assert.equal(is[0].autor, "fulano");
  assert.ok(!("avatar" in is[0]) && !JSON.stringify(is).includes("avatars."), "nada de avatar de autor");
  assert.equal(lerIssues(buscaIssues(AGORA).items, AGORA).length, 3, "aceita a lista de /issues também");
});

// ---------- README ----------
test("README em texto puro: os primeiros parágrafos dos sete repositórios, sem HTML, imagem nem badge", () => {
  const esperado = {
    "openobserve--openobserve": /^Open source Datadog alternative for logs, metrics, traces/,
    "signoz--signoz": /^SigNoz is an open-source observability platform built on OpenTelemetry\./,
    "louislam--uptime-kuma": /^Uptime Kuma is an easy-to-use self-hosted monitoring tool\.$/,
    "woodpecker-ci--woodpecker": /^Woodpecker is a simple, yet powerful CI\/CD engine with great extensibility\.$/,
    "d4vinci--scrapling": /^Scrapling is a Python Web Scraping framework/,
    "thedotmack--claude-mem": /^Every new session, your agent starts from zero\./,
    "stablyai--orca": /^The AI Orchestrator for 100x builders\. Run Claude Code, Codex, and any other coding agent in parallel/,
  };
  for (const [id, re] of Object.entries(esperado)) {
    const t = L.textoDoReadme(readme(id));
    assert.match(t, re, id + ": " + t.slice(0, 120));
    assert.ok(t.length <= 1200, id);
    assert.ok(!/<|>|!\[|\]\(|https:\/\/img\.shields|·\s.*·\s.*·/.test(t), id + " sem HTML, imagem, badge nem linha de navegação: " + t);
  }
  const longo = "# T\n\n" + Array.from({ length: 30 }, (_, i) => `Parágrafo número ${i} com bastante texto para passar do mínimo de quarenta caracteres.`).join("\n\n");
  const t = L.textoDoReadme(longo);
  assert.ok(t.length <= 1200 && t.length > 900, "corta perto de 1.200: " + t.length);
  assert.equal(L.textoDoReadme("```js\nconst x = 1; // código não entra, mesmo com texto comprido aqui dentro\n```\n\nTexto de verdade que explica o projeto em uma frase longa."), "Texto de verdade que explica o projeto em uma frase longa.");
});

// ---------- série de estrelas ----------
test("série diária de estrelas: um ponto por dia, até 400, e o ganho em 7 e 30 dias", () => {
  let s = [];
  s = L.somarPonto(s, "2026-11-01", 100);
  s = L.somarPonto(s, "2026-11-01", 110);
  assert.deepEqual(s, [["2026-11-01", 110]], "o mesmo dia troca o ponto");
  s = L.somarPonto(s, "2026-10-30", 90);
  assert.deepEqual(s.map((p) => p[0]), ["2026-10-30", "2026-11-01"], "fica em ordem");
  assert.deepEqual(L.somarPonto(s, "ontem", 5), s, "dia inválido não entra");
  assert.deepEqual(L.somarPonto(s, "2026-11-02", "x"), s);
  let longa = [];
  for (let i = 0; i < 450; i++) longa = L.somarPonto(longa, new Date(Date.UTC(2025, 0, 1) + i * DIA).toISOString().slice(0, 10), i);
  assert.equal(longa.length, 400); assert.equal(longa[0][1], 50, "saem os mais velhos");
  const serie = [["2026-10-01", 1000], ["2026-10-13", 1200], ["2026-11-01", 1500], ["2026-11-05", 1600], ["2026-11-06", 1650], ["2026-11-12", 1800]];
  assert.equal(L.ganho(serie, 7), 1800 - 1600, "7 dias: contra 05/11 (o mais recente com 7 dias ou mais)");
  assert.equal(L.ganho(serie, 30), 1800 - 1200, "30 dias: contra 13/10");
  assert.equal(L.ganho(serie, 60), null, "sem ponto tão velho: null");
  assert.equal(L.ganho([["2026-11-12", 5]], 7), null);
  assert.equal(L.ganho([], 7), null);
  assert.equal(L.formatoCurto(950), "950"); assert.equal(L.formatoCurto(12400), "12,4 mil"); assert.equal(L.formatoCurto(12000), "12 mil");
  assert.equal(L.formatoCurto(121400), "121 mil"); assert.equal(L.formatoCurto(1_240_000), "1,2 mi"); assert.equal(L.formatoCurto(999_700), "1 mi"); assert.equal(L.formatoCurto(null), "–");
  assert.equal(L.atividade("2026-11-01T00:00:00Z", AGORA), "verde"); assert.equal(L.atividade("2026-08-01T00:00:00Z", AGORA), "ambar");
  assert.equal(L.atividade("2026-01-01T00:00:00Z", AGORA), "cinza"); assert.equal(L.atividade(null, AGORA), "cinza");
  assert.equal(L.ehNova(new Date(AGORA - 13 * DIA).toISOString(), AGORA), true); assert.equal(L.ehNova(new Date(AGORA - 15 * DIA).toISOString(), AGORA), false);
  assert.equal(L.releaseRecente({ data: new Date(AGORA - 6 * DIA).toISOString() }, AGORA), true); assert.equal(L.releaseRecente({ data: new Date(AGORA - 8 * DIA).toISOString() }, AGORA), false);
});

// ---------- Hacker News ----------
test("comentários do HN: primeiro nível, os com mais respostas, trecho de até 280 cortado em frase, só o nome de usuário", () => {
  const c = L.escolherComentarios(itemHn(1), 5);
  assert.equal(c.length, 5);
  assert.deepEqual(c.map((x) => x.autor), ["ana", "eva", "carla", "bruno", "fabio"], "mais respostas diretas primeiro; empate: mais descendentes, depois o mais antigo; apagado (sem autor) sai");
  assert.deepEqual(c.map((x) => x.respostas), [3, 2, 2, 1, 1]);
  assert.ok(c.every((x) => x.trecho.length <= 280));
  assert.match(c[0].trecho, /\.$/, "cortado no fim de uma frase");
  assert.ok(!c[0].trecho.includes("S3 lifecycle"), "a frase que não cabe fica de fora");
  assert.equal(c[2].trecho, 'How does it compare to SigNoz? "Cheaper" isn\'t enough.', "texto puro, entidades resolvidas, sem link");
  assert.equal(c[0].url, "https://news.ycombinator.com/item?id=11");
  assert.ok(!JSON.stringify(c).includes("avatar"));
  assert.deepEqual(L.escolherComentarios(null), []);
  assert.deepEqual(L.escolherComentarios({ children: [{ id: 1, author: "x", text: "" }] }), []);
  // trecho sem frase que caiba: corta na palavra com reticências
  const t = L.trecho("palavra ".repeat(60), 280);
  assert.ok(t.length <= 281 && t.endsWith("…"), t);
  assert.equal(L.trecho("Curto.", 280), "Curto.");
  // busca: histórias que citam a tecnologia (link do repositório, site ou nome distinto no título)
  const tec = { repo: "stablyai/orca", nome: "Orca", site: "https://orca.dev" };
  const a = lerBuscaHn(buscaHn([hit(1, "Show HN: Orca, run coding agents in parallel", "https://github.com/stablyai/orca", 250, 120, "2026-11-10T10:00:00Z"),
    hit(2, "Orca whales spotted near Seattle", "https://news.example/orca", 400, 300, "2026-11-09T10:00:00Z"),
    hit(3, "Agent IDEs compared", "https://orca.dev/blog/ides", 90, 40, "2026-11-08T10:00:00Z"),
    hit(4, "Fork of orca", "https://github.com/stablyai/orcas", 10, 1, "2026-11-08T10:00:00Z"),
    { objectID: "5", title: null, url: null, points: 1 }]));
  assert.equal(a.length, 4, "hit sem título sai");
  assert.deepEqual(juntarHistorias([a, a], tec).map((h) => h.id), ["1", "3"], "orca sozinho não basta (nome curto demais); repo parecido não conta; sem repetir");
  const kuma = { repo: "louislam/uptime-kuma", nome: "Uptime Kuma", site: "https://uptime.kuma.pet" };
  const b = lerBuscaHn(buscaHn([hit(7, "Uptime Kuma 2.0 released", "https://medium.com/x", 180, 90, "2026-11-11T10:00:00Z"), hit(8, "uptime-kuma alternatives?", null, 30, 25, "2026-11-01T10:00:00Z"), hit(9, "Uptime for Kumas", "", 5, 0, "2026-11-01T10:00:00Z")]));
  assert.deepEqual(juntarHistorias([b], kuma).map((h) => h.id), ["7", "8"]);
  assert.equal(b[1].url, "", "Ask HN sem link: a página aponta para o HN");
});

// ---------- ritmo ----------
test("ritmo: recém-adicionada fura a fila, até 6 pedidos por minuto, GitHub sem token devagar, host pausado fica de fora", () => {
  const marcas = (h) => Object.fromEntries(Object.keys(PARTES).map((p) => [p, new Date(AGORA - h * 3600_000).toISOString()]));
  const estado = { porId: { "a--velha": { marcas: marcas(30), feed: false }, "b--em-dia": { marcas: marcas(1), feed: false } } };
  const p = planejar({ ids: ["a--velha", "b--em-dia", "z--nova"], estado, agora: AGORA });
  assert.equal(p[0].id, "z--nova", "a nova vem primeiro");
  assert.deepEqual(p.filter((x) => x.id === "z--nova").map((x) => x.parte), ["repo", "commit", "releases", "readme", "linguagens", "contrib"], "inteira, na ordem das partes, até o orçamento");
  assert.ok(p.reduce((s, x) => s + x.custo, 0) <= ORCAMENTO);
  assert.ok(!p.some((x) => x.id === "b--em-dia"), "em dia não entra");
  // sem token: 1 pedido ao GitHub; o resto do orçamento vai ao HN
  const semToken = planejar({ ids: ["a--velha"], estado, agora: AGORA, github: 1 });
  assert.equal(semToken.filter((x) => x.host === "github").length, 1);
  assert.ok(semToken.some((x) => x.parte === "hn"));
  assert.ok(semToken.reduce((s, x) => s + x.custo, 0) <= ORCAMENTO);
  // GitHub pausado: só HN
  assert.ok(planejar({ ids: ["a--velha", "z--nova"], estado, agora: AGORA, pausados: new Set(["github"]) }).every((x) => x.host !== "github"));
  // cadências: repo 6 h, releases 3 h, readme 1x/dia; falha espera 30 min; comentarios anda junto do hn
  const e = { marcas: { repo: new Date(AGORA - 5 * 3600_000).toISOString(), releases: new Date(AGORA - 3 * 3600_000).toISOString(), readme: new Date(AGORA - 20 * 3600_000).toISOString(), hn: new Date(AGORA - 1000).toISOString(), comentarios: new Date(AGORA - 5000).toISOString() }, tent: { commit: new Date(AGORA - 10 * 60000).toISOString() } };
  assert.equal(vencida("repo", e, AGORA), false); assert.equal(vencida("releases", e, AGORA), true); assert.equal(vencida("readme", e, AGORA), false);
  assert.equal(vencida("commit", e, AGORA), false, "falhou há 10 min: espera"); assert.equal(vencida("comentarios", e, AGORA), true, "o hn rodou depois");
  assert.equal(vencida("blog", { feed: false }, AGORA), false);
});

// fetch falso: GitHub e Algolia pelos fixtures; conta os pedidos e pode responder 403/429 a partir de um ponto
function fetchFalso({ falhaEm = null, status = 403, headers = {} } = {}) {
  const pedidos = [];
  const f = async (url, op) => {
    const u = String(url);
    pedidos.push({ url: u, headers: op && op.headers });
    if (falhaEm != null && pedidos.length >= falhaEm) return resposta({ message: "API rate limit exceeded" }, { status, headers });
    const lim = { "x-ratelimit-remaining": "4800", "x-ratelimit-limit": "5000", "x-ratelimit-reset": String(Math.floor(AGORA / 1000) + 1800), "x-ratelimit-resource": "core" };
    const m = /api\.github\.com\/repos\/([^/]+)\/([^/?]+)(\/[a-z]+)?/.exec(u);
    if (u.includes("/search/issues")) return resposta(buscaIssues(AGORA), { headers: { ...lim, "x-ratelimit-resource": "search", "x-ratelimit-remaining": "28" } });
    if (m) {
      const id = (m[1] + "--" + m[2]).toLowerCase(), parte = m[3] || "";
      if (!REPOS[id] && !parte) return resposta({ message: "Not Found" }, { status: 404, headers: lim });
      if (!parte) return resposta(REPOS[id], { headers: lim });
      if (parte === "/commits") return resposta(commits("2026-11-12T10:00:00Z"), { headers: lim });
      if (parte === "/releases") return resposta(releases(), { headers: lim });
      if (parte === "/readme") return new Response(readme(id), { status: 200, headers: { "content-type": "text/plain", ...lim } });
      if (parte === "/languages") return resposta(linguagens(), { headers: lim });
      if (parte === "/contributors") return resposta([{ login: "a" }], { headers: { ...lim, link: link(u, 640) } });
      if (parte === "/pulls") return resposta([{}], { headers: { ...lim, link: link(u, 37) } });
    }
    if (u.includes("hn.algolia.com/api/v1/search")) return resposta(buscaHn([hit(41, "Show HN: OpenObserve, a cheaper Datadog", "https://github.com/openobserve/openobserve", 300, 150, "2026-11-10T10:00:00Z"), hit(42, "Unrelated", "https://x.dev", 500, 10, "2026-11-10T10:00:00Z")]));
    if (u.includes("hn.algolia.com/api/v1/items/")) return resposta(itemHn(Number(u.split("/").pop())));
    return resposta("sem rede", { status: 503 });
  };
  f.pedidos = pedidos;
  return f;
}
const comFetch = async (f, fn) => { const antes = globalThis.fetch; globalThis.fetch = f; try { return await fn(); } finally { globalThis.fetch = antes; } };
const docDe = (env, id) => { const r = env.DB.db.prepare("SELECT data FROM docs WHERE collection = 'landscape' AND id = ?").get(id); return r ? JSON.parse(r.data) : null; };
const sistema = (env, id) => { const r = env.DB.db.prepare("SELECT data FROM docs WHERE collection = '_sistema' AND id = ?").get(id); return r ? JSON.parse(r.data) : null; };
const gravar = (env, c, id, data) => env.DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES (?, ?, ?, ?)").run(c, id, JSON.stringify(data), data.coletado || "");

// ---------- semente ----------
test("semente: as sete e as categorias entram uma vez só, pelo cron; tirada pelo Admin não volta", async () => {
  const env = { DB: d1Falso() };
  assert.equal(await semearLandscape(env, AGORA), 7);
  assert.equal(await semearLandscape(env, AGORA), 0, "segunda vez: nada");
  const ids = env.DB.db.prepare("SELECT id FROM docs WHERE collection = 'landscape' ORDER BY id").all().map((r) => r.id);
  assert.deepEqual(ids, ["d4vinci--scrapling", "louislam--uptime-kuma", "openobserve--openobserve", "signoz--signoz", "stablyai--orca", "thedotmack--claude-mem", "woodpecker-ci--woodpecker"]);
  const cats = JSON.parse(env.DB.db.prepare("SELECT data FROM docs WHERE collection = 'meta' AND id = 'landscape-categorias'").get().data).categorias;
  assert.deepEqual(cats, CATEGORIAS_INICIAIS);
  for (const s of SEMENTE) assert.ok(L.acharCategoria(cats, s.categoria, s.subcategoria), s.repo + " numa subcategoria que existe");
  assert.equal(docDe(env, "stablyai--orca").subcategoria, "orquestracao");
  // o Admin tira uma e muda o nome de outra: a semente não desfaz
  env.DB.db.prepare("DELETE FROM docs WHERE collection = 'landscape' AND id = 'stablyai--orca'").run();
  env.DB.db.prepare("UPDATE docs SET data = json_set(data, '$.nome', 'Kuma') WHERE collection = 'landscape' AND id = 'louislam--uptime-kuma'").run();
  await semearLandscape(env, AGORA + DIA);
  assert.equal(docDe(env, "stablyai--orca"), null);
  assert.equal(docDe(env, "louislam--uptime-kuma").nome, "Kuma");
  // mesmo sem a marca, o INSERT OR IGNORE não passa por cima
  env.DB.db.prepare("DELETE FROM docs WHERE collection = '_sistema' AND id = 'landscape-semente'").run();
  await semearLandscape(env, AGORA + 2 * DIA);
  assert.equal(docDe(env, "louislam--uptime-kuma").nome, "Kuma");
});

// ---------- rodada ----------
test("rodada: no máximo 6 pedidos por minuto, recém-adicionada coletada primeiro e completa em poucas rodadas", async () => {
  const env = { DB: d1Falso(), GITHUB_TOKEN: "t" };
  await semearLandscape(env, AGORA);
  const f = fetchFalso();
  let t = AGORA;
  const porMinuto = [];
  await comFetch(f, async () => {
    for (let i = 0; i < 40; i++) { const antes = f.pedidos.length; await rodadaLandscape(env, { agora: t }); porMinuto.push(f.pedidos.length - antes); t += 60_000; }
  });
  assert.ok(porMinuto.every((n) => n <= 6), "por minuto: " + porMinuto.join(","));
  assert.ok(f.pedidos.every((p) => p.headers["user-agent"].startsWith("Lookout/")), "User-Agent do Lookout");
  assert.ok(f.pedidos.filter((p) => p.url.includes("api.github.com")).every((p) => p.headers.authorization === "Bearer t"));
  const oo = docDe(env, "openobserve--openobserve");
  assert.equal(oo.gh.estrelas, 23000); assert.equal(oo.gh.contribuidores, 640); assert.equal(oo.gh.prs, 37); assert.equal(oo.gh.ultimoCommit, "2026-11-12T10:00:00.000Z");
  assert.equal(oo.releases.length, 3); assert.match(oo.sobre, /^Open source Datadog alternative/); assert.equal(oo.gh_destaques[0].numero, 812);
  assert.deepEqual(oo.hn.historias.map((h) => h.id), ["41"], "só a que cita");
  assert.equal(oo.hn.comentarios[0].itens[0].autor, "ana");
  assert.deepEqual(oo.serie, [[L.diaSP(AGORA), 23000]]);
  assert.equal(oo.leve.estrelas, 23000); assert.equal(oo.leve.issues, 410 - 37, "issues abertas sem os PRs");
  assert.equal(oo.leve.marca, "https://avatars.githubusercontent.com/u/123456789?s=96");
  assert.equal(docDe(env, "louislam--uptime-kuma").leve.marca, "", "dono pessoa: sem marca");
  assert.equal(oo.categoria, "observabilidade", "os campos do Admin ficam");
  // repositório que não existe (fixture sem /repos): erro no doc, sem quebrar a rodada
  assert.equal(docDe(env, "stablyai--orca").erro, "Repositório não encontrado no GitHub.");
  // nova tecnologia entra depois: vai na frente das que já têm estado
  gravar(env, "landscape", "signoz--signoz2", { repo: "SigNoz/signoz2", nome: "Outra", categoria: "observabilidade", subcategoria: "plataformas", adicionado: new Date(t).toISOString() });
  const f2 = fetchFalso();
  await comFetch(f2, () => rodadaLandscape(env, { agora: t + 6 * 3600_000 }));
  assert.ok(f2.pedidos.length <= 6);
  assert.match(f2.pedidos[0].url, /signoz2/, "a recém-adicionada é a primeira, mesmo com as outras vencidas");
  // um ponto por dia: rodar de novo no mesmo dia troca o ponto, no outro dia soma
  const e = sistema(env, "landscape-estado");
  assert.ok(e.porId["openobserve--openobserve"].marcas.repo);
  assert.equal(e.semToken, false);
});

test("rodada: para no 403 e no 429, marca a pausa e não chama o GitHub até ela vencer; sem token vai devagar", async () => {
  const env = { DB: d1Falso() };
  await semearLandscape(env, AGORA);
  const f = fetchFalso({ falhaEm: 2, status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(AGORA / 1000) + 900) } });
  const minutoPar = AGORA - (new Date(AGORA).getUTCMinutes() % 2) * 60_000;
  // sem token: 1 pedido ao GitHub em minuto par, nenhum em minuto ímpar
  const r1 = await comFetch(f, () => rodadaLandscape(env, { agora: minutoPar }));
  assert.equal(f.pedidos.filter((p) => p.url.includes("api.github.com")).length, 1);
  assert.ok(!f.pedidos[0].headers.authorization, "sem token não manda Authorization");
  assert.equal(sistema(env, "landscape-estado").semToken, true);
  const n1 = f.pedidos.length;
  await comFetch(f, () => rodadaLandscape(env, { agora: minutoPar + 60_000 }));
  assert.equal(f.pedidos.slice(n1).filter((p) => p.url.includes("api.github.com")).length, 0, "minuto ímpar sem token: nada no GitHub");
  // o segundo pedido (HN, no minuto ímpar) já levou 403: a rodada parou ali
  const e = sistema(env, "landscape-estado");
  assert.ok(e.pausa.hn || e.pausa.github, "pausa marcada: " + JSON.stringify(e.pausa));
  assert.ok(r1.pedidos <= 6);
  // com token, 429 com retry-after: para na hora e respeita o retry-after
  const env2 = { DB: d1Falso(), GITHUB_TOKEN: "t" };
  await semearLandscape(env2, AGORA);
  // a primeira em ordem (Scrapling) não está nos fixtures e daria 404: sai, para a rodada começar por uma que existe
  env2.DB.db.prepare("DELETE FROM docs WHERE collection = 'landscape' AND id = 'd4vinci--scrapling'").run();
  const f2 = fetchFalso({ falhaEm: 3, status: 429, headers: { "retry-after": "120" } });
  const r = await comFetch(f2, () => rodadaLandscape(env2, { agora: AGORA }));
  assert.equal(f2.pedidos.length, 3, "parou no 429");
  assert.match(r.parou, /429/);
  const e2 = sistema(env2, "landscape-estado");
  assert.equal(e2.pausa.github.ate, new Date(AGORA + 120_000).toISOString());
  const f3 = fetchFalso();
  await comFetch(f3, () => rodadaLandscape(env2, { agora: AGORA + 60_000 }));
  assert.ok(f3.pedidos.every((p) => !p.url.includes("api.github.com")), "pausado: nada no GitHub");
  await comFetch(f3, () => rodadaLandscape(env2, { agora: AGORA + 180_000 }));
  assert.ok(f3.pedidos.some((p) => p.url.includes("api.github.com")), "a pausa venceu");
  assert.equal(sistema(env2, "landscape-estado").pausa.github, undefined);
  // limite baixo no cabeçalho (core): pausa até o reset sem esperar o 403
  const env3 = { DB: d1Falso(), GITHUB_TOKEN: "t" };
  await semearLandscape(env3, AGORA);
  const baixo = async (url) => resposta(REPOS["signoz--signoz"], { headers: { "x-ratelimit-remaining": "10", "x-ratelimit-reset": String(Math.floor(AGORA / 1000) + 600), "x-ratelimit-resource": "core" } });
  const pedidos = [];
  await comFetch(async (u, o) => { pedidos.push(u); return baixo(u); }, () => rodadaLandscape(env3, { agora: AGORA }));
  assert.equal(pedidos.length, 1);
  assert.equal(sistema(env3, "landscape-estado").pausa.github.status, "limite");
});

test("cron: semente, sonda e rodada somadas não passam de 6 pedidos; a sonda guarda amostra e resumo", async () => {
  const env = { DB: d1Falso(), GITHUB_TOKEN: "t" };
  const f = fetchFalso();
  let t = AGORA;
  await comFetch(f, async () => {
    for (let i = 0; i < 15; i++) { const antes = f.pedidos.length; await cronLandscape(env, t); assert.ok(f.pedidos.length - antes <= 6, "minuto " + i); t += 60_000; }
  });
  const s = sistema(env, "sonda-landscape");
  assert.ok(s.fim, "a sonda terminou: " + s.pendentes.length);
  assert.equal(s.resultados.length, listaSonda(AGORA).length);
  const repo = s.resultados.find((x) => x.tipo === "repo" && x.repo === "openobserve/openobserve");
  assert.equal(repo.status, 200); assert.equal(repo.estrelas, 23000); assert.equal(repo.restante, 4800);
  assert.ok(sistema(env, repo.amostra).amostra.length > 100);
  assert.ok(s.resultados.find((x) => x.tipo === "hnItem").url.endsWith("/items/41"), "o item sai da busca");
  assert.equal(s.resultados.find((x) => x.tipo === "contrib").contagem, 640);
  assert.ok(urls.issues("a/b", AGORA).includes("sort=reactions-%2B1"));
});

// ---------- notícias do próprio Lookout ----------
test("notícias do Lookout: só as que citam, das seções liberadas, consulta pela faixa do índice e com limite", async () => {
  const env = { DB: d1Falso() };
  const dep = espelhoFalso();
  const it = (c, id, titulo, url, resumo, dias) => gravar(env, c, id, { titulo, url, resumo, fonte: "Fonte", publicado: new Date(AGORA - dias * DIA).toISOString(), coletado: new Date(AGORA - dias * DIA).toISOString() });
  it("items", "a", "SigNoz lança versão 1.0", "https://x.dev/a", "", 1);
  it("items", "b", "Observabilidade barata", "https://x.dev/b", "Comparamos o SigNoz com o Datadog.", 2);
  it("items", "c", "Repositório do mês", "https://github.com/SigNoz/signoz", "", 3);
  it("items", "d", "Signozinho não é o mesmo", "https://x.dev/d", "", 1);
  it("items-negocios", "e", "SigNoz capta rodada série B", "https://x.dev/e", "", 1);
  it("items-investimentos", "f", "SigNoz na bolsa?", "https://x.dev/f", "", 1);
  it("items", "g", "SigNoz antigo", "https://x.dev/g", "", 200);
  gravar(env, "foruns-tech", "r1", { titulo: "We moved from Datadog to SigNoz", url: "https://reddit.com/r/devops/comments/r1", sub: "devops", publicado: new Date(AGORA - DIA).toISOString(), coletado: new Date(AGORA - DIA).toISOString() });
  const tec = { repo: "SigNoz/signoz", nome: "SigNoz", site: "https://signoz.io" };
  assert.deepEqual(termosDe(tec), ["signoz/signoz", "signoz"]);
  const n = await citacoes(env, dep, tec, { secoes: ["tech", "negocios"], agora: AGORA });
  assert.deepEqual(n.map((x) => x.titulo), ["SigNoz lança versão 1.0", "SigNoz capta rodada série B", "Observabilidade barata", "Repositório do mês"], "Signozinho não conta; investimentos não liberada; 200 dias fica fora");
  assert.equal(n[1].secao, "negocios");
  const todos = await citacoes(env, dep, tec, { secoes: null, agora: AGORA });
  assert.ok(todos.some((x) => x.secao === "investimentos"));
  const red = await citacoes(env, dep, tec, { secoes: ["tech"], forum: true, agora: AGORA });
  assert.deepEqual(red.map((x) => x.sub), ["devops"]);
  // SQL: começa como o espelho aceita, uma subconsulta por collection, com a faixa de coletado e LIMIT
  const { sql } = sqlCitacoes(["items", "items-negocios"], ["signoz"], "2026-01-01");
  assert.ok(sql.startsWith("SELECT id, data FROM docs") && !sql.includes(";"));
  assert.equal((sql.match(/collection = \?/g) || []).length, 2);
  assert.equal((sql.match(/LIMIT \?/g) || []).length, 2);
  assert.ok(!/LIKE/i.test(sql));
  const plano = env.DB.db.prepare("EXPLAIN QUERY PLAN " + sqlCitacoes(["items"], ["signoz"], "x").sql).all(...sqlCitacoes(["items"], ["signoz"], "x").args).map((r) => r.detail).join(" | ");
  assert.match(plano, /docs_col_coletado|sqlite_autoindex_docs_1/, "usa índice: " + plano);
});

// ---------- rotas ----------
const req = (metodo, corpo) => new Request("https://x/api", { method: metodo, headers: { "content-type": "application/json" }, body: corpo == null ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo) });
const corpoDe = async (r) => ({ status: r.status, j: await r.json() });

test("rotas de leitura: grade com os campos leves e as categorias; detalhe com notícias, Reddit e parecidas", async () => {
  const env = { DB: d1Falso(), GITHUB_TOKEN: "t" };
  const dep = espelhoFalso();
  await semearLandscape(env, AGORA);
  await comFetch(fetchFalso(), async () => { for (let i = 0; i < 25; i++) await rodadaLandscape(env, { agora: AGORA + i * 60_000 }); });
  const g = await corpoDe(await rotaLandscape(req("GET"), env, CONVIDADO, "", dep));
  assert.equal(g.status, 200);
  assert.equal(g.j.tecnologias.length, 7); assert.equal(g.j.categorias.length, 4); assert.equal(g.j.admin, false);
  const oo = g.j.tecnologias.find((x) => x.id === "openobserve--openobserve");
  assert.equal(oo.leve.estrelas, 23000); assert.equal(oo.categoria, "observabilidade"); assert.match(oo.descricao, /observability/);
  assert.ok(!("sobre" in oo) && !("serie" in oo) && !("hn" in oo), "a grade não leva README, série nem comentários");
  gravar(env, "items", "n1", { titulo: "OpenObserve chega à versão 0.60", url: "https://x.dev/n1", resumo: "", fonte: "X", coletado: new Date().toISOString() });
  const d = await corpoDe(await rotaLandscape(req("GET"), env, CONVIDADO, "openobserve--openobserve", dep));
  assert.equal(d.status, 200);
  assert.equal(d.j.tec.gh.estrelas, 23000); assert.ok(!("por" in d.j.tec)); assert.ok(!("id" in d.j.tec.gh.dono), "só login e tipo do dono");
  assert.deepEqual(d.j.parecidas.map((x) => x.id), ["signoz--signoz"], "a mesma subcategoria");
  assert.deepEqual(d.j.noticias.map((x) => x.titulo), ["OpenObserve chega à versão 0.60"]);
  assert.equal((await rotaLandscape(req("GET"), env, CONVIDADO, "nao--existe", dep)).status, 404);
  assert.equal((await rotaLandscape(req("GET"), env, CONVIDADO, "Ruim", dep)).status, 400);
  assert.equal((await rotaLandscape(req("GET"), env, CONVIDADO, "a--b/c/d", dep)).status, 404);
  assert.equal((await rotaLandscape(req("POST", {}), env, CONVIDADO, "", dep)).status, 405);
});

test("rotas do Admin: quem não é Admin leva 404; adicionar em lote, editar, tirar; limites de corpo, quantidade e id", async () => {
  const env = { DB: d1Falso() };
  const dep = espelhoFalso();
  await semearLandscape(env, AGORA);
  // quem não é Admin: 404 em tudo, inclusive nas notas
  for (const [m, alvo, id, corpo] of [["POST", "", "", { urls: "https://github.com/a/b" }], ["GET", "", ""], ["PUT", "", "signoz--signoz", { nome: "x" }], ["DELETE", "", "signoz--signoz"], ["PUT", "categorias", "", { categorias: [] }]])
    assert.equal((await rotaAdminLandscape(req(m, corpo), env, CONVIDADO, alvo, id, dep)).status, 404, m + " " + alvo + id);
  assert.equal((await rotaLandscape(req("GET"), env, CONVIDADO, "signoz--signoz/notas", dep)).status, 404);
  assert.equal((await rotaLandscape(req("PUT", { nota: "x" }), env, CONVIDADO, "signoz--signoz/notas", dep)).status, 404);
  assert.equal(docDe(env, "signoz--signoz").nome, "SigNoz");
  // adicionar: várias URLs, uma por linha; repetida e recusada voltam separadas; subcategoria nova é criada
  const r = await corpoDe(await rotaAdminLandscape(req("POST", { urls: "https://github.com/grafana/loki\nhttps://github.com/SigNoz/signoz/\nhttps://gitlab.com/x/y\nhttps://github.com/jaegertracing/jaeger.git", categoria: "observabilidade", novaSubcategoria: "Traces" }), env, ADMIN, "", "", dep));
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.deepEqual(r.j.adicionadas.map((x) => x.id), ["grafana--loki", "jaegertracing--jaeger"]);
  assert.deepEqual(r.j.repetidas, ["signoz--signoz"]); assert.equal(r.j.recusadas.length, 1);
  assert.equal(r.j.adicionadas[0].leve.coletando, true, "o cartão aparece como coletando");
  assert.equal(docDe(env, "grafana--loki").subcategoria, "traces"); assert.equal(docDe(env, "grafana--loki").nome, "loki"); assert.equal(docDe(env, "grafana--loki").por, "admin");
  assert.ok(JSON.parse(env.DB.db.prepare("SELECT data FROM docs WHERE collection = 'meta' AND id = 'landscape-categorias'").get().data).categorias[0].subcategorias.some((s) => s.id === "traces"));
  assert.ok(dep.gravados.some((g) => g.collection === "landscape" && g.id === "grafana--loki"), "write-through no espelho");
  // uma URL só: nome, site e feed valem
  const um = await corpoDe(await rotaAdminLandscape(req("POST", { urls: ["https://github.com/prometheus/prometheus"], nome: "Prometheus", categoria: "observabilidade", subcategoria: "plataformas", site: "https://prometheus.io", feed: "https://prometheus.io/blog/feed.xml" }), env, ADMIN, "", "", dep));
  assert.equal(um.status, 200);
  assert.equal(docDe(env, "prometheus--prometheus").site, "https://prometheus.io/"); assert.equal(docDe(env, "prometheus--prometheus").feed, "https://prometheus.io/blog/feed.xml");
  for (const corpo of [{ urls: "" }, { urls: "https://github.com/a/b", categoria: "nao-existe", subcategoria: "x" }, { urls: "https://github.com/a/b", categoria: "observabilidade" }, { urls: "https://github.com/a/b", categoria: "observabilidade", subcategoria: "plataformas", site: "javascript:alert(1)" }])
    assert.equal((await rotaAdminLandscape(req("POST", corpo), env, ADMIN, "", "", dep)).status, 400, JSON.stringify(corpo));
  assert.equal((await rotaAdminLandscape(req("POST", "x".repeat(8001)), env, ADMIN, "", "", dep)).status, 413, "corpo até 8 KB");
  assert.equal((await rotaAdminLandscape(req("POST", "{nao"), env, ADMIN, "", "", dep)).status, 400);
  // até 300 tecnologias
  const muitas = Array.from({ length: 290 }, (_, i) => ({ id: "x--r" + i }));
  for (const m of muitas) gravar(env, "landscape", m.id, { repo: "x/r", nome: "r", categoria: "dados", subcategoria: "web-scraping" });
  const total = env.DB.db.prepare("SELECT count(*) AS n FROM docs WHERE collection = 'landscape'").get().n;
  assert.equal(total, 300, "7 da semente + 3 do Admin + 290");
  const cheio = await rotaAdminLandscape(req("POST", { urls: "https://github.com/a/b", categoria: "dados", subcategoria: "web-scraping" }), env, ADMIN, "", "", dep);
  assert.equal(cheio.status, 400);
  assert.match((await cheio.json()).erro, /300/);
  env.DB.db.prepare("DELETE FROM docs WHERE collection = 'landscape' AND id LIKE 'x--%'").run();
  // editar: só os campos do Admin; o que o cron gravou fica
  env.DB.db.prepare("UPDATE docs SET data = json_set(data, '$.gh', json('{\"estrelas\": 5}')) WHERE collection = 'landscape' AND id = 'grafana--loki'").run();
  const ed = await corpoDe(await rotaAdminLandscape(req("PUT", { nome: "Grafana Loki", subcategoria: "plataformas", site: "" }), env, ADMIN, "", "grafana--loki", dep));
  assert.equal(ed.status, 200, JSON.stringify(ed.j));
  const loki = docDe(env, "grafana--loki");
  assert.equal(loki.nome, "Grafana Loki"); assert.equal(loki.subcategoria, "plataformas"); assert.equal(loki.categoria, "observabilidade"); assert.equal(loki.gh.estrelas, 5);
  assert.equal((await rotaAdminLandscape(req("PUT", { nome: "" }), env, ADMIN, "", "grafana--loki", dep)).status, 400);
  assert.equal((await rotaAdminLandscape(req("PUT", { subcategoria: "nao-existe" }), env, ADMIN, "", "grafana--loki", dep)).status, 400);
  assert.equal((await rotaAdminLandscape(req("PUT", {}), env, ADMIN, "", "grafana--loki", dep)).status, 400);
  assert.equal((await rotaAdminLandscape(req("PUT", { nome: "x" }), env, ADMIN, "", "nao--existe", dep)).status, 404);
  assert.equal((await rotaAdminLandscape(req("PUT", { nome: "x" }), env, ADMIN, "", "Ruim/../x", dep)).status, 400);
  // tirar: só o doc daquela tecnologia
  const antes = env.DB.db.prepare("SELECT count(*) AS n FROM docs").get().n;
  assert.equal((await rotaAdminLandscape(req("DELETE"), env, ADMIN, "", "grafana--loki", dep)).status, 200);
  assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM docs").get().n, antes - 1);
  assert.equal(docDe(env, "grafana--loki"), null);
  assert.deepEqual(dep.removidos.at(-1), { collection: "landscape", id: "grafana--loki" });
  assert.equal((await rotaAdminLandscape(req("DELETE"), env, ADMIN, "", "grafana--loki", dep)).status, 404);
  // GET do Admin: estado, sem token, sonda
  const st = await corpoDe(await rotaAdminLandscape(req("GET"), env, ADMIN, "", "", dep));
  assert.equal(st.j.semToken, true); assert.equal(st.j.total, 9);
});

test("categorias: renomear e reordenar valem; tirar subcategoria com tecnologia dentro é recusado; validação", async () => {
  const env = { DB: d1Falso() };
  const dep = espelhoFalso();
  await semearLandscape(env, AGORA);
  const cats = JSON.parse(JSON.stringify(CATEGORIAS_INICIAIS));
  cats.reverse(); cats[0].nome = "IA, agentes e afins"; cats[0].subcategorias.reverse();
  const ok = await corpoDe(await rotaAdminLandscape(req("PUT", { categorias: cats }), env, ADMIN, "categorias", "", dep));
  assert.equal(ok.status, 200, JSON.stringify(ok.j));
  const salvo = JSON.parse(env.DB.db.prepare("SELECT data FROM docs WHERE collection = 'meta' AND id = 'landscape-categorias'").get().data).categorias;
  assert.deepEqual(salvo.map((c) => c.id), ["ia-agentes", "dados", "ci-cd", "observabilidade"]);
  assert.equal(salvo[0].nome, "IA, agentes e afins"); assert.equal(salvo[0].subcategorias[0].id, "orquestracao");
  const sem = cats.map((c) => (c.id === "dados" ? { ...c, subcategorias: [] } : c));
  const r = await rotaAdminLandscape(req("PUT", { categorias: sem }), env, ADMIN, "categorias", "", dep);
  assert.equal(r.status, 409);
  assert.match((await r.json()).erro, /Scrapling/);
  // mover a tecnologia antes libera
  await rotaAdminLandscape(req("PUT", { categoria: "ia-agentes", subcategoria: "memoria" }), env, ADMIN, "", "d4vinci--scrapling", dep);
  assert.equal((await rotaAdminLandscape(req("PUT", { categorias: sem }), env, ADMIN, "categorias", "", dep)).status, 200);
  for (const b of [{}, { categorias: [{ nome: "" }] }, { categorias: [{ nome: "A" }, { nome: "a" }] }, { categorias: [{ id: "Ruim!", nome: "x" }] }, { categorias: [{ nome: "A", subcategorias: [{ nome: "x" }, { nome: "X" }] }] }, { categorias: Array.from({ length: 31 }, (_, i) => ({ nome: "c" + i })) }])
    assert.ok(L.validarCategorias(b).erro, JSON.stringify(b).slice(0, 80));
  assert.deepEqual(L.validarCategorias({ categorias: [{ nome: "Bancos de dados", subcategorias: [{ nome: "Séries temporais" }] }] }).categorias, [{ id: "bancos-de-dados", nome: "Bancos de dados", subcategorias: [{ id: "series-temporais", nome: "Séries temporais" }] }]);
});

test("notas do Admin: guardadas por pessoa em landscape/<email>, validadas, e só ele lê", async () => {
  const env = { DB: d1Falso() };
  const dep = espelhoFalso();
  await semearLandscape(env, AGORA);
  const put = await corpoDe(await rotaLandscape(req("PUT", { situacao: "testando", nota: "Subi no homelab.", link: "https://wiki.exemplo.dev/signoz" }), env, ADMIN, "signoz--signoz/notas", dep));
  assert.equal(put.status, 200); assert.equal(put.j.notas.situacao, "testando");
  const doc = JSON.parse(env.DB.db.prepare("SELECT data FROM docs WHERE collection = 'landscape/admin@teste.dev' AND id = 'notas'").get().data);
  assert.equal(doc.porId["signoz--signoz"].nota, "Subi no homelab.");
  assert.ok(dep.gravados.some((g) => g.collection === "landscape/admin@teste.dev"));
  const get = await corpoDe(await rotaLandscape(req("GET"), env, ADMIN, "signoz--signoz/notas", dep));
  assert.equal(get.j.notas.link, "https://wiki.exemplo.dev/signoz");
  assert.equal((await corpoDe(await rotaLandscape(req("GET"), env, ADMIN, "stablyai--orca/notas", dep))).j.notas, null);
  for (const b of [{ situacao: "amando" }, { nota: "x".repeat(2001) }, { link: "http://inseguro.dev" }, { link: "javascript:alert(1)" }])
    assert.equal((await rotaLandscape(req("PUT", b), env, ADMIN, "signoz--signoz/notas", dep)).status, 400, JSON.stringify(b).slice(0, 60));
  // vazio apaga a nota daquela tecnologia
  await rotaLandscape(req("PUT", { situacao: "", nota: "", link: "" }), env, ADMIN, "signoz--signoz/notas", dep);
  assert.equal((await corpoDe(await rotaLandscape(req("GET"), env, ADMIN, "signoz--signoz/notas", dep))).j.notas, null);
  // o cron não toca nas notas
  await comFetch(fetchFalso(), () => rodadaLandscape(env, { agora: AGORA }));
  assert.ok(env.DB.db.prepare("SELECT 1 FROM docs WHERE collection = 'landscape/admin@teste.dev'").get());
});

// ---------- widget ----------
test("widget tech-landscape: catálogo de Tech, formatos 1x1 e 2x1, e as novidades (release, salto de estrelas, HN com mais de 100 pontos)", () => {
  const w = catalogoDe(["tech"]).find((x) => x.id === "tech-landscape");
  assert.ok(w); assert.equal(w.secao, "tech");
  assert.ok(!catalogoDe(["esportes"]).some((x) => x.id === "tech-landscape"), "sem a seção Tech, sem o widget");
  assert.deepEqual(formatosDe("tech-landscape"), ["1x1", "2x1"]);
  assert.equal(globalThis.InicioGrade.grupoDe("tech-landscape"), "tech");
  assert.ok(!validarPainel({ grupos: [{ id: "tech", nome: "Tech", widgets: [{ id: "tech-landscape", formato: "2x1" }] }] }, ["tech"]).erro);
  assert.ok(validarPainel({ grupos: [{ id: "tech", nome: "Tech", widgets: [{ id: "tech-landscape", formato: "2x2" }] }] }, ["tech"]).erro);
  const d = (n) => new Date(AGORA - n * DIA).toISOString();
  const lista = [
    { id: "a--a", nome: "A", leve: { estrelas: 1100, ganho7: 100, release: { tag: "v2", data: d(1) }, hn: { pontos: 150, titulo: "Show HN: A", data: d(2) } } },
    { id: "b--b", nome: "B", leve: { estrelas: 1000, ganho7: 40, release: { tag: "v1", data: d(10) }, hn: { pontos: 90, titulo: "B", data: d(1) } } },
    { id: "c--c", nome: "C", leve: { coletando: true } },
  ];
  const n = L.novidades(lista, AGORA, 5);
  assert.deepEqual(n.map((x) => x.tipo + ":" + x.id), ["estrelas:a--a", "release:a--a", "hn:a--a"], "B: 4% e release de 10 dias e HN com 90 pontos não contam");
  assert.match(n[0].texto, /\+100 estrelas em 7 dias \(\+10%\)/);
  assert.equal(L.novidades(lista, AGORA, 1).length, 1);
});
