// Respostas do GitHub e do Algolia (HN) para os testes do Landscape, no formato das APIs.
//
// O que é real: os READMEs (test/fixtures/landscape/readme-*.md, os primeiros 7 KB de cada repositório, tirados do
// próprio repositório por git em 12/11/2026) e, nos objetos de /repos abaixo, descrição, site, topics, licença,
// linguagem e a contagem de estrelas e forks mostradas na página de cada repositório em 12/11. O ambiente de
// desenvolvimento não alcança api.github.com nem hn.algolia.com, então os campos que a página não mostra (ids
// numéricos, datas, owner.type, cabeçalhos) seguem o formato documentado da API e estão marcados como "formato".
// A sonda de produção (_sistema/sonda-landscape) confere o formato real.
import { readFileSync } from "node:fs";

export const readme = (id) => readFileSync(new URL(`./fixtures/landscape/readme-${id}.md`, import.meta.url), "utf8");

// GET /repos/{o}/{r} (campos reduzidos ao que o leitor usa, mais alguns que ele ignora)
const repo = (o) => ({
  id: o.rid, node_id: "R_kgDO" + o.rid, name: o.repo.split("/")[1], full_name: o.repo, private: false,
  owner: { login: o.repo.split("/")[0], id: o.oid, avatar_url: `https://avatars.githubusercontent.com/u/${o.oid}?v=4`, type: o.tipo, site_admin: false },
  html_url: "https://github.com/" + o.repo, description: o.desc, fork: false, homepage: o.site, size: o.size,
  stargazers_count: o.estrelas, watchers_count: o.estrelas, subscribers_count: o.watchers, forks_count: o.forks, open_issues_count: o.issues,
  language: o.ling, license: o.lic, topics: o.topics, archived: false, disabled: false, default_branch: "main",
  created_at: o.criado, updated_at: "2026-11-12T20:00:00Z", pushed_at: o.push, visibility: "public",
});
export const REPOS = {
  "openobserve--openobserve": repo({ repo: "openobserve/openobserve", rid: 583041312, oid: 123456789, tipo: "Organization", estrelas: 23000, forks: 1200, watchers: 120, issues: 410, size: 512000,
    desc: "Open source observability platform for logs, metrics, traces, RUM, session replay, pipelines, SLOs and LLM observability. Lower cost alternative to Datadog, Splunk and Elasticsearch.",
    site: "https://openobserve.ai", ling: "Rust", lic: { key: "agpl-3.0", name: "GNU Affero General Public License v3.0", spdx_id: "AGPL-3.0" },
    topics: ["analytics", "apm", "datadog", "elasticsearch", "grafana", "jaeger", "kibana", "log-analytics", "log-management", "logs", "metrics", "monitoring", "observability", "opentelemetry", "prometheus", "rust-lang", "splunk", "traces"],
    criado: "2023-01-13T10:00:00Z", push: "2026-11-13T00:24:35Z" }),
  "signoz--signoz": repo({ repo: "SigNoz/signoz", rid: 324000000, oid: 76905799, tipo: "Organization", estrelas: 32000, forks: 2500, watchers: 180, issues: 980, size: 640000,
    desc: "SigNoz is an open-source observability platform built on OpenTelemetry. Logs, metrics and traces with APM, distributed tracing, log management and infrastructure monitoring.",
    site: "https://signoz.io", ling: "TypeScript", lic: { key: "other", name: "Other", spdx_id: "NOASSERTION" },
    topics: ["apm", "application-monitoring", "distributed-tracing", "go", "observability", "opentelemetry", "self-hosted"], criado: "2020-12-01T10:00:00Z", push: "2026-11-12T16:50:41Z" }),
  "louislam--uptime-kuma": repo({ repo: "louislam/uptime-kuma", rid: 382000000, oid: 1336778, tipo: "User", estrelas: 93300, forks: 8700, watchers: 600, issues: 700, size: 90000,
    desc: "A fancy self-hosted monitoring tool", site: "https://uptime.kuma.pet", ling: "JavaScript", lic: { key: "mit", name: "MIT License", spdx_id: "MIT" },
    topics: ["docker", "monitor", "monitoring", "self-hosted", "uptime", "uptime-monitoring", "websocket"], criado: "2021-07-01T10:00:00Z", push: "2026-11-12T13:58:20Z" }),
};

// GET /repos/{o}/{r}/commits?per_page=1
export const commits = (data) => [{ sha: "25123f739e16984e7ccd1456545f5bdbdc1345b1", commit: { author: { name: "x", date: data }, committer: { name: "x", date: data }, message: "fix" }, author: { login: "alguem" } }];

// GET /repos/{o}/{r}/releases?per_page=10
export const releases = () => [
  { id: 3, tag_name: "v0.70.0-rc1", name: "v0.70.0-rc1", draft: false, prerelease: true, created_at: "2026-11-11T09:00:00Z", published_at: "2026-11-11T10:00:00Z", html_url: "https://github.com/openobserve/openobserve/releases/tag/v0.70.0-rc1",
    body: "## What's Changed\r\n* feat: pipelines by @dev in https://github.com/openobserve/openobserve/pull/1\r\n\r\n**Full Changelog**: https://github.com/openobserve/openobserve/compare/v0.60.0...v0.70.0-rc1" },
  { id: 2, tag_name: "v0.60.0", name: "v0.60.0 <b>grande</b>", draft: false, prerelease: false, created_at: "2026-11-05T09:00:00Z", published_at: "2026-11-05T10:00:00Z", html_url: "https://github.com/openobserve/openobserve/releases/tag/v0.60.0",
    body: "### Highlights\n- New **SLO** dashboards ![img](https://x/y.png)\n- [Faster search](https://openobserve.ai/blog)\n<script>alert(1)</script>" },
  { id: 1, tag_name: "v0.50.0", name: "", draft: true, prerelease: false, created_at: "2026-10-01T09:00:00Z", published_at: null, html_url: "https://github.com/openobserve/openobserve/releases/tag/v0.50.0", body: "rascunho" },
  { id: 0, tag_name: "v0.40.0", name: "v0.40.0", draft: false, prerelease: false, created_at: "2026-09-01T09:00:00Z", published_at: "2026-09-01T10:00:00Z", html_url: "https://evil.example/x", body: "" },
];

// GET /repos/{o}/{r}/languages
export const linguagens = () => ({ Rust: 6000000, TypeScript: 2500000, Vue: 900000, JavaScript: 300000, Shell: 50000, Python: 40000, Dockerfile: 5000, HTML: 3000, CSS: 2000 });

// Cabeçalho Link de uma lista com per_page=1 (contribuidores, PRs abertos)
export const link = (base, ultima) => `<${base}&page=2>; rel="next", <${base}&page=${ultima}>; rel="last"`;

// GET /search/issues?q=repo:...&sort=reactions-+1 (formato da busca: { total_count, items })
export const buscaIssues = (agora) => ({ total_count: 4, incomplete_results: false, items: [
  { number: 812, title: "Support for ClickHouse as storage", html_url: "https://github.com/openobserve/openobserve/issues/812", state: "open", comments: 40, created_at: new Date(agora - 60 * 864e5).toISOString(), user: { login: "fulano", avatar_url: "https://avatars.githubusercontent.com/u/1?v=4" }, reactions: { "+1": 120, total_count: 150 } },
  { number: 900, title: "feat: SLO dashboards", html_url: "https://github.com/openobserve/openobserve/pull/900", state: "closed", comments: 12, created_at: new Date(agora - 20 * 864e5).toISOString(), user: { login: "beltrano" }, reactions: { "+1": 30 }, pull_request: { url: "https://api.github.com/repos/openobserve/openobserve/pulls/900" } },
  { number: 10, title: "Issue antiga demais", html_url: "https://github.com/openobserve/openobserve/issues/10", state: "open", comments: 300, created_at: new Date(agora - 500 * 864e5).toISOString(), user: { login: "x" }, reactions: { "+1": 999 } },
  { number: 950, title: "Docs typo", html_url: "https://github.com/openobserve/openobserve/issues/950", state: "open", comments: 1, created_at: new Date(agora - 5 * 864e5).toISOString(), user: { login: "y" } },
] });

// Algolia: search?tags=story
export const buscaHn = (hits) => ({ hits, nbHits: hits.length, page: 0, nbPages: 1, hitsPerPage: 30, processingTimeMS: 1, query: "x", params: "x" });
export const hit = (id, title, url, points, num_comments, created_at, author = "autor" + id) => ({ objectID: String(id), title, url, points, num_comments, author, created_at, created_at_i: Math.floor(Date.parse(created_at) / 1000), story_id: id, _tags: ["story", "author_" + author, "story_" + id] });

// Algolia: items/<id> (a árvore inteira; o texto é HTML do HN)
const c = (id, author, text, children = [], t = 1731400000) => ({ id, created_at: new Date(t * 1000).toISOString(), created_at_i: t, type: "comment", author, title: null, url: null, text, points: null, parent_id: 1, story_id: 1, children, options: [] });
export function itemHn(id) {
  const longo = "I've been running this in production for eight months now. It replaced our Elasticsearch cluster and the storage bill dropped a lot. The UI still has rough edges, especially around dashboards. Alerting works fine for our case. The docs could be clearer about retention settings and S3 lifecycle rules, which tripped us up at first and took a while to sort out.";
  return {
    id, created_at: "2026-11-01T12:00:00.000Z", created_at_i: 1793534400, type: "story", author: "op", title: "Show HN", url: "https://github.com/openobserve/openobserve", text: null, points: 300, parent_id: null, story_id: id,
    children: [
      c(11, "ana", `<p>${longo}</p>`, [c(111, "b", "<p>same</p>"), c(112, "c", "<p>+1</p>"), c(113, "d", "<p>agree</p>")]),
      c(12, "bruno", "<p>Short take.</p>", [c(121, "e", "<p>why?</p>", [c(1211, "f", "<p>because</p>"), c(1212, "g", "<p>ok</p>"), c(1213, "h", "<p>hm</p>"), c(1214, "i", "<p>yes</p>")])]),
      c(13, "carla", "<p>How does it compare to <a href=\"https://signoz.io\">SigNoz</a>? &quot;Cheaper&quot; isn&#x27;t enough.</p>", [c(131, "j", "<p>a</p>"), c(132, "k", "<p>b</p>")]),
      { id: 14, created_at: "2026-11-01T12:10:00.000Z", type: "comment", author: null, text: null, children: [c(141, "l", "<p>x</p>"), c(142, "m", "<p>y</p>"), c(143, "n", "<p>z</p>"), c(144, "o", "<p>w</p>"), c(145, "p", "<p>v</p>")] },
      c(15, "davi", "<p>Nice.</p>"),
      c(16, "eva", "<p>Two replies here.</p>", [c(161, "q", "<p>a</p>"), c(162, "r", "<p>b</p>")], 1731300000),
      c(17, "fabio", "<p>One reply.</p>", [c(171, "s", "<p>a</p>")]),
    ],
  };
}

// Resposta falsa do fetch: corpo, status e cabeçalhos
export const resposta = (corpo, { status = 200, headers = {} } = {}) => new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), { status, headers: { "content-type": typeof corpo === "string" ? "text/plain" : "application/json", ...headers } });
