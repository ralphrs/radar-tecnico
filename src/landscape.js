// Landscape (Tech, pedido de 12/11): tecnologias que o Admin acompanha, em grade por categoria como o landscape da CNCF,
// com a página de detalhe (números, versões, sobre, notícias, o que estão dizendo, parecidas e as notas do Admin).
// Sem IA nesta versão: os dados vêm do GitHub (REST) e do Hacker News (API pública do Algolia), pelo cron.
//
// Regras puras (URL do repositório, marca, série de estrelas, trecho, README, comentários, categorias, notas, resumo
// leve e novidades do widget) ficam em public/landscape.js, o mesmo arquivo que a página carrega.
//
// Banco (D1, com espelho de leitura como as outras collections):
// - landscape/<id>: um doc por tecnologia (id = owner--repo em minúsculas). O Admin grava os campos dele (repo, nome,
//   categoria, subcategoria, site, feed, adicionado, por) e o cron os dele (gh, releases, sobre, hn, gh_destaques, blog,
//   serie, leve, em, atualizado, erro), cada um com json_patch na própria chave: um não apaga o que o outro gravou.
// - meta/landscape-categorias: a árvore de categorias e a ordem.
// - landscape/<email>, id "notas": as notas do Admin (só ele lê e grava).
// - _sistema/landscape-estado: marcas de cada parte por tecnologia, pausa por host, a última rodada e o limite do GitHub.
// - _sistema/landscape-semente: marca de que as sete primeiras já entraram (semente idempotente, pelo próprio cron).
// - _sistema/sonda-landscape e sonda-landscape-aNN: a sonda das URLs novas (formato real em produção).
// Regras do banco: nunca DROP; UPDATE e DELETE só com a chave explícita; o cron não toca em landscape/<email>.
import { lerFeed } from "./coleta.js";
import "../public/landscape.js";
const L = globalThis.Landscape;

const MIN = 60_000, HORA = 3_600_000, DIA = 86_400_000;
export const UA = "Lookout/1.0 (radar pessoal de tecnologias; +https://lookout.ralph-renato.workers.dev)";
const TIMEOUT = 8000;
const GH = "https://api.github.com";
const HN = "https://hn.algolia.com/api/v1";
export const ORCAMENTO = 6;           // pedidos externos por minuto de cron, somando sonda e coleta, para o landscape inteiro
const GH_SEM_TOKEN = 1;               // sem GITHUB_TOKEN: 1 pedido ao GitHub nos minutos pares (30 por hora; o limite é 60 por IP)
const GH_RESERVA = { comToken: 50, semToken: 2 }; // x-ratelimit-remaining abaixo disso: pausa até o reset
const PAUSA_PADRAO = 15 * MIN;
const ESPERA_FALHA = 30 * MIN;

// Partes da coleta de cada tecnologia: cadência, host e custo em pedidos. A ordem é a da primeira coleta.
export const PARTES = {
  repo: { cada: 6 * HORA, host: "github", custo: 1 },
  commit: { cada: 6 * HORA, host: "github", custo: 1 },
  releases: { cada: 3 * HORA, host: "github", custo: 1 },
  readme: { cada: 24 * HORA, host: "github", custo: 1 },
  linguagens: { cada: 24 * HORA, host: "github", custo: 1 },
  contrib: { cada: 24 * HORA, host: "github", custo: 1 },
  prs: { cada: 24 * HORA, host: "github", custo: 1 },
  issues: { cada: 24 * HORA, host: "github", custo: 1 },
  hn: { cada: 6 * HORA, host: "hn", custo: 2 },
  comentarios: { cada: 6 * HORA, host: "hn", custo: 3 },
  blog: { cada: 6 * HORA, host: "feed", custo: 1 },
};
const ORDEM_PARTES = Object.keys(PARTES);

// ---------- semente ----------
export const CATEGORIAS_INICIAIS = [
  { id: "observabilidade", nome: "Observabilidade e análise", subcategorias: [
    { id: "plataformas", nome: "Plataformas (logs, métricas, traces)" }, { id: "disponibilidade", nome: "Monitoramento de disponibilidade" }] },
  { id: "ci-cd", nome: "Entrega contínua (CI/CD)", subcategorias: [{ id: "pipelines", nome: "Pipelines" }] },
  { id: "dados", nome: "Dados e coleta", subcategorias: [{ id: "web-scraping", nome: "Web scraping" }] },
  { id: "ia-agentes", nome: "IA e agentes", subcategorias: [
    { id: "memoria", nome: "Memória e contexto para agentes" }, { id: "orquestracao", nome: "Orquestração e ferramentas de agentes" }] },
];
// Conferidas em 12/11 pelo README e pela página de cada repositório (topics e descrição do GitHub)
export const SEMENTE = [
  { repo: "openobserve/openobserve", nome: "OpenObserve", categoria: "observabilidade", subcategoria: "plataformas" },
  { repo: "SigNoz/signoz", nome: "SigNoz", categoria: "observabilidade", subcategoria: "plataformas" },
  { repo: "louislam/uptime-kuma", nome: "Uptime Kuma", categoria: "observabilidade", subcategoria: "disponibilidade" },
  { repo: "woodpecker-ci/woodpecker", nome: "Woodpecker CI", categoria: "ci-cd", subcategoria: "pipelines" },
  { repo: "D4Vinci/Scrapling", nome: "Scrapling", categoria: "dados", subcategoria: "web-scraping" },
  { repo: "thedotmack/claude-mem", nome: "claude-mem", categoria: "ia-agentes", subcategoria: "memoria" },
  { repo: "stablyai/orca", nome: "Orca", categoria: "ia-agentes", subcategoria: "orquestracao" },
];

// ---------- banco ----------
const agoraIso = (t = Date.now()) => new Date(t).toISOString();
async function lerDoc(env, c, id) {
  const r = await env.DB.prepare("SELECT data FROM docs WHERE collection = ? AND id = ?").bind(c, id).first();
  try { return r ? JSON.parse(r.data) : null; } catch { return null; }
}
const gravarSistema = (env, id, data) => env.DB.prepare(
  "INSERT INTO docs (collection, id, data) VALUES ('_sistema', ?, ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
).bind(id, JSON.stringify(data)).run();
// Só os campos de quem grava: json_patch junta no doc que está lá (null apaga a chave). Doc que não existe não é criado.
const patchDoc = (env, id, patch, quando) => env.DB.prepare(
  "UPDATE docs SET data = json_patch(data, ?), atualizado = ? WHERE collection = 'landscape' AND id = ?"
).bind(JSON.stringify(patch), quando, id).run();

export async function lerEstado(env) {
  const e = (await lerDoc(env, "_sistema", "landscape-estado")) || {};
  return { porId: e.porId && typeof e.porId === "object" ? e.porId : {}, pausa: e.pausa && typeof e.pausa === "object" ? e.pausa : {}, github: e.github || null, rodada: e.rodada || null, semToken: !!e.semToken };
}

// As sete primeiras e as categorias iniciais, uma vez só, na primeira execução do cron depois do deploy.
// INSERT OR IGNORE: rodar de novo não duplica nem passa por cima do que o Admin mudou; tirada pelo Admin não volta.
export async function semearLandscape(env, agora = Date.now()) {
  if (await lerDoc(env, "_sistema", "landscape-semente")) return 0;
  const quando = agoraIso(agora);
  const ops = [env.DB.prepare("INSERT OR IGNORE INTO docs (collection, id, data, coletado, atualizado) VALUES ('meta', 'landscape-categorias', ?, '', ?)")
    .bind(JSON.stringify({ categorias: CATEGORIAS_INICIAIS, atualizado: quando }), quando)];
  for (const s of SEMENTE) {
    const doc = { repo: s.repo, nome: s.nome, categoria: s.categoria, subcategoria: s.subcategoria, site: "", feed: "", adicionado: quando, por: "semente", atualizado: quando };
    ops.push(env.DB.prepare("INSERT OR IGNORE INTO docs (collection, id, data, coletado, atualizado) VALUES ('landscape', ?, ?, '', ?)").bind(L.idDe(s.repo), JSON.stringify(doc), quando));
  }
  await env.DB.batch(ops);
  await gravarSistema(env, "landscape-semente", { quando, ids: SEMENTE.map((s) => L.idDe(s.repo)) });
  return SEMENTE.length;
}

// ---------- leitores das respostas (tolerantes: campo que falta vira null) ----------
const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const txt = (v, max = 300) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const iso = (v) => { const t = Date.parse(v || ""); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const urlGithub = (u) => (typeof u === "string" && /^https:\/\/github\.com\//.test(u) ? u.slice(0, 400) : "");

// GET /repos/{o}/{r}
export function lerRepo(j) {
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const lic = j.license && typeof j.license === "object" ? j.license : null;
  const spdx = lic ? txt(lic.spdx_id, 60) : "";
  const dono = j.owner && typeof j.owner === "object" ? { login: txt(j.owner.login, 60), tipo: j.owner.type === "Organization" ? "Organization" : j.owner.type === "User" ? "User" : txt(j.owner.type, 20), id: num(j.owner.id) } : null;
  return {
    nomeCompleto: txt(j.full_name, 160),
    descricao: txt(j.description, 400),
    site: L.urlOk(j.homepage) || "",
    estrelas: num(j.stargazers_count),
    forks: num(j.forks_count),
    watchers: num(j.subscribers_count),
    issuesEPrs: num(j.open_issues_count),
    tamanho: num(j.size),
    linguagem: txt(j.language, 40),
    licenca: spdx && spdx !== "NOASSERTION" ? spdx : lic ? (txt(lic.name, 60) || "outra") : "",
    topics: Array.isArray(j.topics) ? j.topics.filter((t) => typeof t === "string" && /^[a-z0-9][a-z0-9-]{0,49}$/.test(t)).slice(0, 20) : [],
    criado: iso(j.created_at),
    push: iso(j.pushed_at),
    arquivado: !!j.archived,
    padrao: txt(j.default_branch, 100),
    url: urlGithub(j.html_url),
    dono,
    marca: L.marcaDe(dono),
  };
}
// GET /repos/{o}/{r}/commits?per_page=1
export function lerCommit(j) {
  const c = Array.isArray(j) ? j[0] : null;
  const d = c && c.commit ? (c.commit.committer && c.commit.committer.date) || (c.commit.author && c.commit.author.date) : null;
  return iso(d);
}
// GET /repos/{o}/{r}/releases?per_page=10 (rascunho fica de fora)
export function lerReleases(j) {
  if (!Array.isArray(j)) return [];
  return j.filter((r) => r && typeof r === "object" && !r.draft && (r.tag_name || r.name)).slice(0, 10).map((r) => {
    // cada linha das notas vira um parágrafo (listas em markdown e títulos sem o marcador), para juntar com " · "
    const corpo = L.textoPuro(String(r.body || "").replace(/\r/g, "").replace(/^\s*([-*+]|#+)\s+/gm, "").replace(/\n/g, "\n\n").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, ""));
    const linhas = corpo.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 4).join(" · ");
    return { tag: txt(r.tag_name, 80), nome: txt(r.name, 120), data: iso(r.published_at || r.created_at), pre: !!r.prerelease, notas: L.trecho(linhas, 280), url: urlGithub(r.html_url) };
  });
}
// GET /repos/{o}/{r}/languages: { Go: 12345, ... } -> [{ nome, bytes, pct }], as 6 maiores e "Outras"
export function lerLinguagens(j) {
  if (!j || typeof j !== "object" || Array.isArray(j)) return [];
  const l = Object.entries(j).filter(([k, v]) => typeof k === "string" && Number(v) > 0).map(([k, v]) => ({ nome: k.slice(0, 40), bytes: Number(v) }));
  const total = l.reduce((s, x) => s + x.bytes, 0);
  if (!total) return [];
  l.sort((a, b) => b.bytes - a.bytes);
  const top = l.slice(0, 6), resto = l.slice(6).reduce((s, x) => s + x.bytes, 0);
  if (resto) top.push({ nome: "Outras", bytes: resto });
  return top.map((x) => ({ ...x, pct: Math.round((x.bytes / total) * 1000) / 10 }));
}
// Contagem pelo cabeçalho Link de uma lista com per_page=1 (rel="last" traz o número da última página).
// Sem Link: a lista coube numa página só, e a contagem é o tamanho dela.
export function contagemPeloLink(link, lista) {
  const m = /<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/.exec(String(link || ""));
  if (m) return Number(m[1]);
  return Array.isArray(lista) ? lista.length : null;
}
// Issues e PRs com mais 👍: aceita a lista de /issues e a resposta da busca ({ items }). Últimos 12 meses, até 10.
export function lerIssues(j, agora = Date.now()) {
  const l = Array.isArray(j) ? j : j && Array.isArray(j.items) ? j.items : [];
  const corte = agora - 365 * DIA;
  return l.filter((x) => x && typeof x === "object" && x.title && (Date.parse(x.created_at || "") || 0) >= corte).map((x) => ({
    numero: num(x.number), titulo: txt(x.title, 200), url: urlGithub(x.html_url), estado: x.state === "closed" ? "fechada" : "aberta",
    tipo: x.pull_request ? "pr" : "issue", reacoes: num(x.reactions && x.reactions["+1"]) || 0, comentarios: num(x.comments) || 0,
    criado: iso(x.created_at), autor: txt(x.user && x.user.login, 40),
  })).sort((a, b) => b.reacoes - a.reacoes || b.comentarios - a.comentarios).slice(0, 10);
}
// Busca do Algolia (search?tags=story): hits -> histórias
export function lerBuscaHn(j) {
  const hits = j && Array.isArray(j.hits) ? j.hits : [];
  return hits.filter((h) => h && h.objectID && h.title).map((h) => ({
    id: String(h.objectID), titulo: txt(h.title, 200), url: typeof h.url === "string" && /^https?:\/\//.test(h.url) ? h.url.slice(0, 500) : "",
    pontos: num(h.points) || 0, comentarios: num(h.num_comments) || 0, autor: txt(h.author, 40), data: iso(h.created_at) || (h.created_at_i ? agoraIso(h.created_at_i * 1000) : null),
  }));
}
// Duas buscas (o repositório no link e o nome), só as que citam a tecnologia, sem repetir; até 20, por pontos.
export function juntarHistorias(listas, tec) {
  const por = new Map();
  for (const l of listas) for (const h of l || []) if (!por.has(h.id) && L.cita(tec, h)) por.set(h.id, h);
  return [...por.values()].sort((a, b) => b.pontos - a.pontos || String(b.data || "").localeCompare(String(a.data || ""))).slice(0, 20);
}

// ---------- URLs ----------
const caminho = (repo) => repo.split("/").map(encodeURIComponent).join("/");
export const urls = {
  repo: (r) => `${GH}/repos/${caminho(r)}`,
  commit: (r) => `${GH}/repos/${caminho(r)}/commits?per_page=1`,
  releases: (r) => `${GH}/repos/${caminho(r)}/releases?per_page=10`,
  readme: (r) => `${GH}/repos/${caminho(r)}/readme`,
  linguagens: (r) => `${GH}/repos/${caminho(r)}/languages`,
  contrib: (r) => `${GH}/repos/${caminho(r)}/contributors?per_page=1&anon=1`,
  prs: (r) => `${GH}/repos/${caminho(r)}/pulls?state=open&per_page=1`,
  // A lista de issues do repositório não ordena por reações (sort aceita created, updated e comments); a busca aceita
  // reactions-+1. A sonda pede as duas para conferir.
  issues: (r, agora = Date.now()) => `${GH}/search/issues?q=${encodeURIComponent(`repo:${r} created:>=${new Date(agora - 365 * DIA).toISOString().slice(0, 10)}`)}&sort=reactions-%2B1&order=desc&per_page=10`,
  issuesLista: (r, agora = Date.now()) => `${GH}/repos/${caminho(r)}/issues?sort=reactions-%2B1&state=all&per_page=10&since=${new Date(agora - 365 * DIA).toISOString()}`,
  hnRepo: (r) => `${HN}/search?query=${encodeURIComponent(r)}&tags=story&restrictSearchableAttributes=url&hitsPerPage=30`,
  hnNome: (n) => `${HN}/search?query=${encodeURIComponent(n)}&tags=story&hitsPerPage=30`,
  hnItem: (id) => `${HN}/items/${encodeURIComponent(id)}`,
};

// ---------- pedidos ----------
const hostDe = (u) => { try { return new URL(u).hostname; } catch { return ""; } };
export class Pausa extends Error { constructor(host, ate, status) { super(`HTTP ${status} em ${host}`); this.pausa = { host, ate, status }; } }
// Um pedido. GitHub com o token quando existe. 403 e 429 viram Pausa (a rodada para); x-ratelimit-remaining baixo
// também (depois de usar a resposta). Devolve { status, ok, json?, texto?, link, restante, limite, reset }.
export async function pedir(url, { env = {}, accept, agora = Date.now(), host = "github" } = {}) {
  const headers = { "user-agent": UA, accept: accept || "application/json" };
  if (host === "github") { headers["x-github-api-version"] = "2022-11-28"; if (env.GITHUB_TOKEN) headers.authorization = "Bearer " + env.GITHUB_TOKEN; if (!accept) headers.accept = "application/vnd.github+json"; }
  let r;
  try { r = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT) }); }
  catch (e) { const er = new Error(String((e && e.message) || e).slice(0, 120) + " em " + hostDe(url)); er.rede = true; throw er; }
  const h = (k) => (r.headers && r.headers.get ? r.headers.get(k) : null);
  const restante = num(h("x-ratelimit-remaining")), limite = num(h("x-ratelimit-limit")), reset = num(h("x-ratelimit-reset"));
  // x-ratelimit-resource: "core" na API comum, "search" na busca (outro limite, 30 por minuto com token)
  const out = { status: r.status, ok: r.ok, link: h("link") || "", restante, limite, reset, recurso: h("x-ratelimit-resource") || "" };
  // feed de blog é um site qualquer: 403 ali é falha daquela tecnologia, não motivo para parar a rodada
  if ((r.status === 403 || r.status === 429) && host !== "feed") {
    const ra = num(h("retry-after"));
    const ate = ra != null ? agora + ra * 1000 : reset != null && restante === 0 ? reset * 1000 : agora + PAUSA_PADRAO;
    const p = new Pausa(host, Math.max(ate, agora + MIN), r.status);
    p.limite = { restante, limite, reset };
    throw p;
  }
  const corpo = await r.text();
  if (r.ok) {
    if (/json/.test(headers.accept)) { try { out.json = JSON.parse(corpo); } catch { const e = new Error("JSON inválido em " + hostDe(url)); throw e; } }
    else out.texto = corpo;
  }
  return out;
}

// ---------- ritmo ----------
// Uma parte está vencida? Sem marca: sim. Falhou há pouco: espera 30 min (ou a própria cadência, se menor).
// comentarios anda junto com hn: vence quando o hn rodou depois dele. blog só com feed.
export function vencida(parte, e = {}, agora = Date.now()) {
  const def = PARTES[parte];
  const m = (e.marcas || {})[parte], t = (e.tent || {})[parte];
  if (t && agora - Date.parse(t) < Math.min(def.cada, ESPERA_FALHA)) return false;
  if (parte === "blog" && e.feed === false) return false;
  if (parte === "comentarios") { const h = (e.marcas || {}).hn; return !!h && (!m || m < h); }
  return !m || agora - Date.parse(m) >= def.cada - 5 * MIN;
}
// Plano da rodada: recém-adicionada (sem estado) primeiro, inteira na ordem das partes; depois as partes vencidas das
// outras, a mais atrasada primeiro. Respeita o orçamento total e o do GitHub; host pausado fica de fora.
export function planejar({ ids, estado, agora = Date.now(), orcamento = ORCAMENTO, github = ORCAMENTO, pausados = new Set() }) {
  const porId = (estado && estado.porId) || {};
  const novas = ids.filter((id) => !porId[id]);
  const cands = [];
  for (const id of novas) for (const p of ORDEM_PARTES) if (vencida(p, { marcas: {} }, agora) || p === "comentarios") cands.push({ id, parte: p, atraso: Infinity, nova: true });
  const outras = [];
  for (const id of ids) {
    if (!porId[id]) continue;
    for (const p of ORDEM_PARTES) {
      if (!vencida(p, porId[id], agora)) continue;
      const m = (porId[id].marcas || {})[p];
      outras.push({ id, parte: p, atraso: m ? agora - Date.parse(m) - PARTES[p].cada : Infinity, nova: false, k: ORDEM_PARTES.indexOf(p) });
    }
  }
  outras.sort((a, b) => (b.atraso === a.atraso ? a.k - b.k : b.atraso - a.atraso));
  const plano = [];
  let total = 0, gh = 0;
  for (const c of [...cands, ...outras]) {
    const def = PARTES[c.parte];
    if (pausados.has(def.host)) continue;
    if (c.parte === "blog" && porId[c.id] && porId[c.id].feed === false) continue;
    if (total + def.custo > orcamento) continue;
    if (def.host === "github" && gh + def.custo > github) continue;
    plano.push({ id: c.id, parte: c.parte, host: def.host, custo: def.custo, nova: c.nova });
    total += def.custo;
    if (def.host === "github") gh += def.custo;
  }
  return plano;
}

// ---------- uma parte ----------
// Faz os pedidos de uma parte e devolve { patch, pedidos } (patch: os campos do cron que mudam no doc).
// `doc` é o doc como está (já com o que as partes anteriores da rodada mudaram). Lança Pausa em 403/429.
async function fazerParte(env, parte, id, doc, { agora, contar }) {
  const repo = doc.repo || L.repoDoId(id);
  const gh = async (u, accept) => { contar("github"); return pedir(u, { env, accept, agora, host: "github" }); };
  const em = { ...(doc.em || {}), [parte]: agoraIso(agora) };
  if (parte === "repo") {
    const r = await gh(urls.repo(repo));
    if (r.status === 404) return { patch: { erro: "Repositório não encontrado no GitHub.", em } };
    if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { status: r.status });
    const g = lerRepo(r.json);
    if (!g) throw new Error("resposta sem repositório");
    const ant = doc.gh || {};
    const novo = { ...ant, ...g, ultimoCommit: ant.ultimoCommit || null };
    return { patch: { gh: novo, serie: L.somarPonto(doc.serie, L.diaSP(agora), g.estrelas), erro: null, em }, limite: r };
  }
  if (parte === "commit") {
    const r = await gh(urls.commit(repo));
    if (!r.ok) { if (r.status === 409 || r.status === 404) return { patch: { gh: { ultimoCommit: null }, em } }; throw Object.assign(new Error("HTTP " + r.status), { status: r.status }); }
    return { patch: { gh: { ultimoCommit: lerCommit(r.json) }, em }, limite: r };
  }
  if (parte === "releases") {
    const r = await gh(urls.releases(repo));
    if (!r.ok) { if (r.status === 404) return { patch: { releases: [], em } }; throw Object.assign(new Error("HTTP " + r.status), { status: r.status }); }
    return { patch: { releases: lerReleases(r.json), em }, limite: r };
  }
  if (parte === "readme") {
    const r = await gh(urls.readme(repo), "application/vnd.github.raw");
    if (!r.ok) { if (r.status === 404) return { patch: { sobre: "", em } }; throw Object.assign(new Error("HTTP " + r.status), { status: r.status }); }
    return { patch: { sobre: L.textoDoReadme(String(r.texto || "").slice(0, 400_000)), em }, limite: r };
  }
  if (parte === "linguagens") {
    const r = await gh(urls.linguagens(repo));
    if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { status: r.status });
    return { patch: { gh: { linguagens: lerLinguagens(r.json) }, em }, limite: r };
  }
  if (parte === "contrib") {
    const r = await gh(urls.contrib(repo));
    // 204: repositório vazio; 403 "too large" para contar pela API vira Pausa como qualquer 403
    if (r.status === 204) return { patch: { gh: { contribuidores: 0 }, em } };
    if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { status: r.status });
    return { patch: { gh: { contribuidores: contagemPeloLink(r.link, r.json) }, em }, limite: r };
  }
  if (parte === "prs") {
    const r = await gh(urls.prs(repo));
    if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { status: r.status });
    return { patch: { gh: { prs: contagemPeloLink(r.link, r.json) }, em }, limite: r };
  }
  if (parte === "issues") {
    const r = await gh(urls.issues(repo, agora));
    if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { status: r.status });
    return { patch: { gh_destaques: lerIssues(r.json, agora), em }, limite: r };
  }
  if (parte === "hn") {
    const tec = { repo, nome: doc.nome, site: doc.site || (doc.gh && doc.gh.site) || "" };
    contar("hn");
    const a = await pedir(urls.hnRepo(repo), { env, agora, host: "hn" });
    if (!a.ok) throw Object.assign(new Error("HTTP " + a.status), { status: a.status });
    let b = { ok: true, json: { hits: [] } };
    if (doc.nome && L.semAcento(doc.nome) !== L.semAcento(repo)) { contar("hn"); b = await pedir(urls.hnNome(doc.nome), { env, agora, host: "hn" }); }
    const historias = juntarHistorias([lerBuscaHn(a.json), b.ok ? lerBuscaHn(b.json) : []], tec);
    return { patch: { hn: { historias, comentarios: (doc.hn && doc.hn.comentarios) || [] }, em } };
  }
  if (parte === "comentarios") {
    const hist = ((doc.hn && doc.hn.historias) || []).filter((h) => h.comentarios > 0).sort((a, b) => b.pontos - a.pontos).slice(0, 3);
    const grupos = [];
    for (const h of hist) {
      contar("hn");
      const r = await pedir(urls.hnItem(h.id), { env, agora, host: "hn" });
      if (!r.ok) continue;
      const itens = L.escolherComentarios(r.json, 5);
      if (itens.length) grupos.push({ historia: { id: h.id, titulo: h.titulo, pontos: h.pontos, comentarios: h.comentarios }, itens });
    }
    return { patch: { hn: { historias: (doc.hn && doc.hn.historias) || [], comentarios: grupos }, em } };
  }
  if (parte === "blog") {
    if (!doc.feed) return { patch: { blog: null, em }, semFeed: true };
    contar("feed");
    const r = await pedir(doc.feed, { env, agora, host: "feed", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5" });
    if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { status: r.status });
    const itens = lerFeed(String(r.texto || "").slice(0, 2_000_000)).slice(0, 10).map((i) => ({ titulo: i.titulo, url: i.url, publicado: i.publicado }));
    return { patch: { blog: itens, em } };
  }
  return { patch: {} };
}
// Junta um patch no doc em memória do jeito do json_patch (objeto mescla, o resto troca, null apaga)
function mesclar(a, b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return b;
  const out = a && typeof a === "object" && !Array.isArray(a) ? { ...a } : {};
  for (const [k, v] of Object.entries(b)) { if (v === null) delete out[k]; else out[k] = mesclar(out[k], v); }
  return out;
}

// ---------- rodada do cron ----------
// Uma rodada: no máximo `orcamento` pedidos externos (6 por minuto, já descontada a sonda). Para em 403/429 e marca a
// pausa do host em _sistema/landscape-estado. Nunca lança.
export async function rodadaLandscape(env, { agora = Date.now(), orcamento = ORCAMENTO } = {}) {
  const out = { pedidos: 0, partes: 0, erros: 0, parou: null };
  const { results } = await env.DB.prepare("SELECT id FROM docs WHERE collection = 'landscape' ORDER BY id").all();
  const ids = (results || []).map((r) => r.id).filter((id) => L.ID_OK.test(id));
  const estado = await lerEstado(env);
  const temToken = !!env.GITHUB_TOKEN;
  const minuto = new Date(agora).getUTCMinutes();
  const pausados = new Set(Object.entries(estado.pausa).filter(([, p]) => p && Date.parse(p.ate) > agora).map(([h]) => h));
  const github = temToken ? orcamento : minuto % 2 === 0 ? GH_SEM_TOKEN : 0;
  const plano = planejar({ ids, estado, agora, orcamento, github, pausados });
  const sobrando = Object.keys(estado.porId).filter((id) => !ids.includes(id));
  if (!plano.length) {
    if (sobrando.length || estado.semToken !== !temToken) {
      const atual = await lerEstado(env);
      for (const id of sobrando) delete atual.porId[id];
      atual.semToken = !temToken;
      await gravarSistema(env, "landscape-estado", atual);
    }
    return out;
  }
  const docs = new Map(), patches = new Map(), marcas = new Map(), erros = {};
  let limite = null, pausa = null;
  const contar = () => { out.pedidos++; };
  for (const item of plano) {
    if (!docs.has(item.id)) docs.set(item.id, await lerDoc(env, "landscape", item.id));
    const doc = docs.get(item.id);
    if (!doc) continue;
    if (!marcas.has(item.id)) marcas.set(item.id, { ok: {}, falha: {}, feed: !!doc.feed });
    const mk = marcas.get(item.id);
    // repositório sumiu nesta rodada: as outras partes do GitHub dele esperam a próxima
    if (doc.erro && item.host === "github" && item.parte !== "repo" && patches.has(item.id) && patches.get(item.id).erro) continue;
    try {
      const r = await fazerParte(env, item.parte, item.id, doc, { agora, contar });
      docs.set(item.id, mesclar(doc, r.patch));
      patches.set(item.id, mesclar(patches.get(item.id) || {}, r.patch));
      mk.ok[item.parte] = agoraIso(agora);
      out.partes++;
      if (r.limite && r.limite.restante != null && r.limite.recurso !== "search") {
        limite = { restante: r.limite.restante, limite: r.limite.limite, reset: r.limite.reset ? agoraIso(r.limite.reset * 1000) : null, quando: agoraIso(agora) };
        if (r.limite.restante <= (temToken ? GH_RESERVA.comToken : GH_RESERVA.semToken) && r.limite.reset) { pausa = { host: "github", ate: r.limite.reset * 1000, status: "limite" }; break; }
      }
    } catch (e) {
      if (e.pausa) { pausa = e.pausa; mk.falha[item.parte] = agoraIso(agora); if (e.limite) limite = { ...e.limite, reset: e.limite.reset ? agoraIso(e.limite.reset * 1000) : null, quando: agoraIso(agora) }; out.parou = e.message; break; }
      mk.falha[item.parte] = agoraIso(agora);
      erros[item.id + ":" + item.parte] = String((e && e.message) || e).slice(0, 160);
      out.erros++;
    }
  }
  // Grava os docs (só os campos do cron) e o estado relido do banco, para não perder o que mudou no meio
  const quando = agoraIso(agora);
  for (const [id, patch] of patches) {
    const leve = L.leveDe(docs.get(id), agora);
    await patchDoc(env, id, { ...patch, leve, atualizado: quando }, quando);
  }
  const atual = await lerEstado(env);
  for (const id of sobrando) delete atual.porId[id];
  for (const [id, mk] of marcas) {
    const e = atual.porId[id] || { marcas: {}, tent: {} };
    e.marcas = { ...(e.marcas || {}) }; e.tent = { ...(e.tent || {}) };
    for (const [p, t] of Object.entries(mk.ok)) { if (t) { e.marcas[p] = t; delete e.tent[p]; } }
    for (const [p, t] of Object.entries(mk.falha)) e.tent[p] = t;
    e.feed = mk.feed;
    atual.porId[id] = e;
  }
  if (pausa) atual.pausa[pausa.host] = { ate: agoraIso(pausa.ate), status: pausa.status, desde: quando };
  for (const [h, p] of Object.entries(atual.pausa)) if (!p || Date.parse(p.ate) <= agora) delete atual.pausa[h];
  if (limite) atual.github = limite;
  atual.semToken = !temToken;
  atual.rodada = { quando, pedidos: out.pedidos, partes: out.partes, erros: Object.keys(erros).length ? erros : undefined, parou: out.parou || undefined };
  await gravarSistema(env, "landscape-estado", atual);
  return out;
}

// ---------- sonda ----------
// Confere em produção o formato real das URLs novas: o que cada uma devolve, os cabeçalhos de limite e Link, e o que
// os leitores acharam. Amostras de até 20 KB em _sistema/sonda-landscape-aNN; o resumo em _sistema/sonda-landscape.
// Dois repositórios: um de organização (openobserve) e um de pessoa (uptime-kuma). Anda 2 por minuto, dentro dos 6.
// O item do HN sai da primeira história da busca. Para rodar de novo, o Admin apaga os docs da sonda pelo id.
const SONDA_POR_VEZ = 2;
const AMOSTRA_MAX = 20_000;
export function listaSonda(agora = Date.now()) {
  const l = [];
  for (const r of ["openobserve/openobserve", "louislam/uptime-kuma"]) {
    for (const p of ["repo", "commit", "releases", "readme", "linguagens", "contrib", "prs", "issues"]) l.push({ tipo: p, repo: r, url: urls[p](r, agora) });
    l.push({ tipo: "issuesLista", repo: r, url: urls.issuesLista(r, agora) });
  }
  l.push({ tipo: "hnRepo", repo: "louislam/uptime-kuma", url: urls.hnRepo("louislam/uptime-kuma") });
  l.push({ tipo: "hnNome", repo: "louislam/uptime-kuma", url: urls.hnNome("Uptime Kuma") });
  l.push({ tipo: "hnItem", repo: "louislam/uptime-kuma", url: "" });
  return l.map((x, i) => ({ ...x, n: i }));
}
function resumoSonda(x, r, agora) {
  const out = {};
  try {
    if (x.tipo === "repo") { const g = lerRepo(r.json); Object.assign(out, { estrelas: g.estrelas, dono: g.dono, licenca: g.licenca, topics: g.topics.length, marca: g.marca, temSubscribers: r.json.subscribers_count != null }); }
    else if (x.tipo === "commit") out.ultimoCommit = lerCommit(r.json);
    else if (x.tipo === "releases") { const rs = lerReleases(r.json); out.releases = rs.length; out.primeira = rs[0] ? `${rs[0].tag} ${rs[0].data}` : ""; }
    else if (x.tipo === "readme") { out.bytes = (r.texto || "").length; out.sobre = L.textoDoReadme(r.texto || "").slice(0, 200); }
    else if (x.tipo === "linguagens") out.linguagens = lerLinguagens(r.json).map((l) => l.nome + " " + l.pct).join(", ");
    else if (x.tipo === "contrib" || x.tipo === "prs") out.contagem = contagemPeloLink(r.link, r.json);
    else if (x.tipo === "issues" || x.tipo === "issuesLista") { const l = lerIssues(r.json, agora); out.lidas = l.length; out.comReacoes = l.filter((i) => i.reacoes > 0).length; out.ordenadaPorReacao = Array.isArray(r.json) ? r.json.every((v, i, a) => !i || ((a[i - 1].reactions || {})["+1"] || 0) >= ((v.reactions || {})["+1"] || 0)) : null; out.formato = Array.isArray(r.json) ? "lista" : r.json && Array.isArray(r.json.items) ? "items" : "outro"; }
    else if (x.tipo === "hnRepo" || x.tipo === "hnNome") { const h = lerBuscaHn(r.json); out.historias = h.length; out.citam = h.filter((y) => L.cita({ repo: x.repo, nome: "Uptime Kuma" }, y)).length; out.primeira = h[0] ? h[0].id : ""; out.nbHits = r.json && r.json.nbHits; }
    else if (x.tipo === "hnItem") { const c = L.escolherComentarios(r.json, 5); out.primeiroNivel = (r.json.children || []).length; out.escolhidos = c.length; out.exemplo = c[0] ? `${c[0].autor} · ${c[0].respostas} respostas · ${c[0].trecho.slice(0, 80)}` : ""; }
  } catch (e) { out.parser = "falhou: " + String((e && e.message) || e).slice(0, 100); }
  return out;
}
export async function cronSondaLandscape(env, { agora = Date.now(), max = SONDA_POR_VEZ } = {}) {
  let s = await lerDoc(env, "_sistema", "sonda-landscape");
  if (s && s.fim) return 0;
  if (!s) s = { inicio: agoraIso(agora), fim: null, pendentes: listaSonda(agora), resultados: [] };
  const lote = s.pendentes.slice(0, max);
  let feitos = 0;
  for (const x of lote) {
    let url = x.url;
    if (x.tipo === "hnItem" && !url) { const b = s.resultados.find((y) => y.tipo === "hnRepo" && y.primeira) || s.resultados.find((y) => y.tipo === "hnNome" && y.primeira); url = b ? urls.hnItem(b.primeira) : ""; }
    const res = { n: x.n, tipo: x.tipo, repo: x.repo, url, quando: agoraIso(agora) };
    if (!url) { res.erro = "sem história do HN para abrir"; s.resultados.push(res); continue; }
    const host = /algolia/.test(url) ? "hn" : "github";
    const t0 = Date.now();
    try {
      feitos++;
      const r = await pedir(url, { env, agora, host, accept: x.tipo === "readme" ? "application/vnd.github.raw" : undefined });
      Object.assign(res, { status: r.status, ms: Date.now() - t0, restante: r.restante, limite: r.limite, link: r.link ? r.link.slice(0, 300) : "" });
      if (r.ok) Object.assign(res, resumoSonda(x, r, agora));
      res.amostra = "sonda-landscape-a" + String(x.n).padStart(2, "0");
      const corpo = r.texto != null ? r.texto : JSON.stringify(r.json === undefined ? null : r.json);
      await gravarSistema(env, res.amostra, { url, status: r.status, quando: res.quando, amostra: String(corpo).slice(0, AMOSTRA_MAX), cortado: String(corpo).length > AMOSTRA_MAX });
    } catch (e) {
      Object.assign(res, { status: e.pausa ? e.pausa.status : 0, ms: Date.now() - t0, erro: String((e && e.message) || e).slice(0, 160) });
      if (e.pausa) { s.resultados.push(res); s.pendentes = s.pendentes.filter((p) => p.n !== x.n); await gravarSistema(env, "sonda-landscape", s); return feitos; }
    }
    s.resultados.push(res);
    s.pendentes = s.pendentes.filter((p) => p.n !== x.n);
  }
  if (!s.pendentes.length) s.fim = agoraIso(agora);
  await gravarSistema(env, "sonda-landscape", s);
  return feitos;
}

// ---------- cron ----------
// A cada minuto: a semente (uma vez), a sonda (enquanto tiver pendentes) e a rodada, juntas no máximo 6 pedidos.
export async function cronLandscape(env, quando = Date.now()) {
  const agora = new Date(quando).getTime();
  const out = { semente: 0, sonda: 0 };
  try { out.semente = await semearLandscape(env, agora); } catch (e) { console.error("landscape-semente", String((e && e.message) || e).slice(0, 120)); }
  try { out.sonda = await cronSondaLandscape(env, { agora }); } catch (e) { console.error("sonda-landscape", String((e && e.message) || e).slice(0, 120)); }
  try { Object.assign(out, await rodadaLandscape(env, { agora, orcamento: Math.max(0, ORCAMENTO - out.sonda) })); } catch (e) { out.erro = String((e && e.message) || e).slice(0, 160); }
  return out;
}

// ---------- leitura (rotas) ----------
const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
// Campos leves de todas, numa consulta só. Começa por "SELECT id, data FROM docs", que é o que o espelho aceita;
// o resto vem do UNION ALL, com json_object só dos campos da grade (o doc inteiro tem README, série e comentários).
export const SQL_LEVE = "SELECT id, data FROM docs WHERE 0 UNION ALL SELECT id, json_object('repo', json_extract(data, '$.repo'), 'nome', json_extract(data, '$.nome'), "
  + "'categoria', json_extract(data, '$.categoria'), 'subcategoria', json_extract(data, '$.subcategoria'), 'site', json_extract(data, '$.site'), "
  + "'adicionado', json_extract(data, '$.adicionado'), 'descricao', json_extract(data, '$.gh.descricao'), 'erro', json_extract(data, '$.erro'), "
  + "'leve', json(json_extract(data, '$.leve'))) AS data FROM docs WHERE collection = 'landscape'";
export async function listaLeve(env, deps) {
  const linhas = await deps.lerLinhas(env, SQL_LEVE, [], "landscape");
  const out = [];
  for (const r of linhas || []) {
    let d;
    try { d = JSON.parse(r.data); } catch { continue; }
    if (!d || !L.ID_OK.test(r.id)) continue;
    const leve = d.leve && typeof d.leve === "object" ? { ...d.leve } : { coletando: true };
    if (leve.marca && !L.marcaOk(leve.marca, leve.dono)) leve.marca = "";
    out.push({ id: r.id, repo: d.repo || L.repoDoId(r.id), nome: d.nome || "", categoria: d.categoria || "", subcategoria: d.subcategoria || "", site: d.site || "", adicionado: d.adicionado || null, descricao: d.descricao || "", erro: d.erro || "", leve });
  }
  out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
  return out;
}
export async function lerCategorias(env, deps) {
  const r = await deps.lerLinha(env, "meta", "landscape-categorias");
  let d = null;
  try { d = r ? JSON.parse(r.data) : null; } catch { d = null; }
  const v = L.validarCategorias(d || { categorias: [] });
  return v.categorias || [];
}

// Notícias que o Lookout já publicou citando a tecnologia: uma consulta por collection de itens liberada, pela faixa
// (collection, coletado) do índice e com limite; o texto do doc é filtrado por instr() e confirmado aqui (palavra
// inteira no título ou resumo, ou o repositório no link). Mesmo esquema para os posts dos fóruns (Reddit).
const COLECOES_ITENS = [["items", "tech"], ["items-negocios", "negocios"], ["items-investimentos", "investimentos"], ["items-politica", "politica"], ["items-esportes", "esportes"]];
const COLECOES_FORUM = [["foruns-tech", "tech"], ["foruns-negocios", "negocios"], ["foruns-investimentos", "investimentos"], ["foruns-politica", "politica"], ["foruns-esportes", "esportes"]];
export function termosDe(tec) {
  const repo = String(tec.repo || "").toLowerCase(), nomeRepo = repo.split("/")[1] || "";
  const t = new Set([repo]);
  if (L.nomeDistinto(tec.nome)) t.add(L.semAcento(tec.nome));
  if (nomeRepo && L.nomeDistinto(nomeRepo)) t.add(nomeRepo);
  return [...t].filter(Boolean);
}
export function sqlCitacoes(colecoes, termos, corte, porColecao = 30) {
  const args = [];
  const filtro = "(" + termos.map(() => "instr(lower(data), ?) > 0").join(" OR ") + ")";
  const partes = colecoes.map((c) => { args.push(c + ":", c, corte, ...termos, porColecao); return `SELECT * FROM (SELECT ? || id AS id, data FROM docs WHERE collection = ? AND coletado >= ? AND ${filtro} ORDER BY coletado DESC LIMIT ?)`; });
  return { sql: "SELECT id, data FROM docs WHERE 0" + partes.map((p) => " UNION ALL " + p).join(""), args };
}
export async function citacoes(env, deps, tec, { secoes = null, forum = false, agora = Date.now(), max = 15 } = {}) {
  const cols = (forum ? COLECOES_FORUM : COLECOES_ITENS).filter(([, s]) => secoes == null || secoes.includes(s)).map(([c]) => c);
  const termos = termosDe(tec);
  if (!cols.length || !termos.length) return [];
  const corte = agoraIso(agora - (forum ? 7 : 120) * DIA);
  const { sql, args } = sqlCitacoes(cols, termos, corte);
  const linhas = await deps.lerLinhas(env, sql, args, "landscape-citacoes");
  const out = [];
  for (const r of linhas || []) {
    let d;
    try { d = JSON.parse(r.data); } catch { continue; }
    if (!d || !d.titulo || !d.url) continue;
    const texto = [d.resumo, d.linkExterno].filter(Boolean).join(" ");
    if (!L.cita(tec, { titulo: d.titulo, url: d.url, texto })) continue;
    const i = String(r.id).indexOf(":");
    const c = String(r.id).slice(0, i);
    out.push(forum
      ? { titulo: txt(d.titulo, 200), url: d.url, sub: txt(d.sub, 60), publicado: d.publicado || d.coletado || null, linkExterno: d.linkExterno || "" }
      : { titulo: txt(d.titulo, 200), url: d.url, fonte: txt(d.fonte, 80), resumo: L.trecho(d.resumo || "", 240), publicado: d.publicado || null, coletado: d.coletado || null, secao: (COLECOES_ITENS.find(([x]) => x === c) || [])[1] || "tech" });
  }
  out.sort((a, b) => String(b.coletado || b.publicado || "").localeCompare(String(a.coletado || a.publicado || "")));
  return out.slice(0, max);
}

// GET /api/landscape, GET /api/landscape/<id>, GET e PUT /api/landscape/<id>/notas.
// quem.secoes já foi conferido (seção Tech) por quem chama; as notas são só do Admin (os outros recebem 404).
export async function rotaLandscape(request, env, quem, resto, deps) {
  const [id, sub, ...mais] = String(resto || "").split("/");
  if (mais.length) return json({ erro: "rota" }, 404);
  if (!id) {
    if (request.method !== "GET") return json({ erro: "metodo" }, 405);
    const [tecnologias, categorias] = await Promise.all([listaLeve(env, deps), lerCategorias(env, deps)]);
    return json({ tecnologias, categorias, admin: !!quem.admin, max: L.MAX_TECNOLOGIAS });
  }
  if (!L.ID_OK.test(id) || id.length > 160) return json({ erro: "id" }, 400);
  if (sub === "notas") {
    if (!quem.admin) return json({ erro: "rota" }, 404);
    return rotaNotas(request, env, quem, id, deps);
  }
  if (sub) return json({ erro: "rota" }, 404);
  if (request.method !== "GET") return json({ erro: "metodo" }, 405);
  const r = await deps.lerLinha(env, "landscape", id);
  if (!r) return json({ erro: "nao-encontrada" }, 404);
  let doc;
  try { doc = JSON.parse(r.data); } catch { return json({ erro: "doc" }, 500); }
  const { por, ...tec } = doc;
  if (tec.gh && !L.marcaOk(tec.gh.marca, tec.gh.dono && tec.gh.dono.tipo)) tec.gh = { ...tec.gh, marca: "" };
  if (tec.gh && tec.gh.dono) tec.gh = { ...tec.gh, dono: { login: tec.gh.dono.login, tipo: tec.gh.dono.tipo } };
  const ref = { repo: tec.repo || L.repoDoId(id), nome: tec.nome, site: tec.site || (tec.gh && tec.gh.site) || "" };
  const secoes = quem.secoes ?? null;
  const [lista, categorias, noticias, reddit] = await Promise.all([
    listaLeve(env, deps), lerCategorias(env, deps),
    citacoes(env, deps, ref, { secoes }).catch(() => []), citacoes(env, deps, ref, { secoes, forum: true }).catch(() => []),
  ]);
  const parecidas = lista.filter((x) => x.id !== id && x.categoria === tec.categoria && x.subcategoria === tec.subcategoria);
  return json({ id, tec, noticias, reddit, parecidas, categorias, admin: !!quem.admin });
}

async function rotaNotas(request, env, quem, id, deps) {
  const col = "landscape/" + quem.email;
  const ler = async () => { const r = await env.DB.prepare("SELECT data FROM docs WHERE collection = ? AND id = 'notas'").bind(col).first(); try { return r ? JSON.parse(r.data) : null; } catch { return null; } };
  if (request.method === "GET") {
    const linhas = await deps.lerLinhas(env, "SELECT id, data FROM docs WHERE collection = ? AND id = ?", [col, "notas"], "landscape-notas");
    let d = null;
    try { d = linhas && linhas[0] ? JSON.parse(linhas[0].data) : null; } catch { d = null; }
    return json({ notas: (d && d.porId && d.porId[id]) || null });
  }
  if (request.method !== "PUT") return json({ erro: "metodo" }, 405);
  const corpo = await request.text();
  if (corpo.length > L.CORPO_MAX) return json({ erro: "grande" }, 413);
  let b;
  try { b = JSON.parse(corpo); } catch { return json({ erro: "json" }, 400); }
  const v = L.validarNotas(b);
  if (v.erro) return json({ erro: v.erro }, 400);
  const quando = agoraIso();
  const d = (await ler()) || { porId: {} };
  const porId = d.porId && typeof d.porId === "object" ? { ...d.porId } : {};
  if (!v.notas.situacao && !v.notas.nota && !v.notas.link) delete porId[id];
  else porId[id] = { ...v.notas, atualizado: quando };
  const data = JSON.stringify({ porId, atualizado: quando });
  await env.DB.prepare("INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES (?, 'notas', ?, '', ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = excluded.atualizado").bind(col, data, quando).run();
  deps.gravarNoEspelho(env, [{ collection: col, id: "notas", data, coletado: "", atualizado: quando }]);
  return json({ ok: true, notas: porId[id] || null });
}

// ---------- admin ----------
async function lerCategoriasD1(env) {
  const d = await lerDoc(env, "meta", "landscape-categorias");
  return (L.validarCategorias(d || { categorias: [] }).categorias) || [];
}
async function gravarCategorias(env, deps, categorias, quando) {
  const data = JSON.stringify({ categorias, atualizado: quando });
  await env.DB.prepare("INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES ('meta', 'landscape-categorias', ?, '', ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = excluded.atualizado").bind(data, quando).run();
  deps.gravarNoEspelho(env, [{ collection: "meta", id: "landscape-categorias", data, coletado: "", atualizado: quando }]);
}
// Categoria e subcategoria do corpo: { categoria, subcategoria } com ids que existem, ou { novaCategoria, novaSubcategoria }
// (nomes) para criar. Devolve { categorias, cid, sid, mudou } ou { erro }.
export function escolherCategoria(cats, b) {
  const lista = cats.map((c) => ({ ...c, subcategorias: c.subcategorias.slice() }));
  let c = null;
  const nc = L.nomeLimpo(b.novaCategoria), ns = L.nomeLimpo(b.novaSubcategoria);
  let mudou = false;
  if (nc) {
    const id = L.slug(nc);
    if (!L.ID_CAT.test(id)) return { erro: "Nome de categoria inválido." };
    c = lista.find((x) => x.id === id);
    if (!c) { if (lista.length >= 30) return { erro: "Até 30 categorias." }; c = { id, nome: nc, subcategorias: [] }; lista.push(c); mudou = true; }
  } else c = lista.find((x) => x.id === b.categoria);
  if (!c) return { erro: "Escolha a categoria." };
  let s = null;
  if (ns) {
    const id = L.slug(ns);
    if (!L.ID_CAT.test(id)) return { erro: "Nome de subcategoria inválido." };
    s = c.subcategorias.find((x) => x.id === id);
    if (!s) { if (c.subcategorias.length >= 30) return { erro: "Até 30 subcategorias por categoria." }; s = { id, nome: ns }; c.subcategorias.push(s); mudou = true; }
  } else s = c.subcategorias.find((x) => x.id === b.subcategoria);
  if (!s) return { erro: "Escolha a subcategoria." };
  return { categorias: lista, cid: c.id, sid: s.id, mudou };
}
const lerCorpo = async (request) => {
  const corpo = await request.text();
  if (corpo.length > L.CORPO_MAX) return { erro: json({ erro: "grande" }, 413) };
  try { const b = JSON.parse(corpo); if (!b || typeof b !== "object" || Array.isArray(b)) return { erro: json({ erro: "corpo" }, 400) }; return { b }; }
  catch { return { erro: json({ erro: "json" }, 400) }; }
};

// /api/admin/landscape (GET estado, POST adiciona), /api/admin/landscape/<id> (PUT edita, DELETE tira) e
// /api/admin/landscape-categorias (PUT). Só o Admin: os outros recebem 404, como se a rota não existisse.
export async function rotaAdminLandscape(request, env, quem, alvo, id, deps) {
  if (!quem || !quem.admin) return json({ erro: "rota" }, 404);
  const quando = agoraIso();
  if (alvo === "categorias") {
    if (request.method !== "PUT") return json({ erro: "metodo" }, 405);
    const { b, erro } = await lerCorpo(request);
    if (erro) return erro;
    const v = L.validarCategorias(b);
    if (v.erro) return json({ erro: v.erro }, 400);
    // categoria ou subcategoria com tecnologia dentro não sai
    const { results } = await env.DB.prepare("SELECT id, json_extract(data, '$.categoria') AS c, json_extract(data, '$.subcategoria') AS s, json_extract(data, '$.nome') AS nome FROM docs WHERE collection = 'landscape'").all();
    for (const t of results || []) {
      if (!L.acharCategoria(v.categorias, t.c, t.s)) return json({ erro: `Ainda há tecnologia nessa subcategoria (${t.nome || t.id}). Mova antes de tirar.` }, 409);
    }
    await gravarCategorias(env, deps, v.categorias, quando);
    return json({ ok: true, categorias: v.categorias });
  }
  if (!id) {
    if (request.method === "GET") {
      const estado = await lerEstado(env);
      const sonda = await lerDoc(env, "_sistema", "sonda-landscape");
      const { results } = await env.DB.prepare("SELECT count(*) AS n FROM docs WHERE collection = 'landscape'").all();
      const falhas = Object.entries(estado.porId).flatMap(([i, e]) => Object.keys(e.tent || {}).map((p) => i + ":" + p));
      return json({ total: Number((results && results[0] && results[0].n) || 0), semToken: !env.GITHUB_TOKEN, pausa: estado.pausa, github: estado.github, rodada: estado.rodada, falhas,
        sonda: sonda ? { inicio: sonda.inicio, fim: sonda.fim, pendentes: (sonda.pendentes || []).length, resultados: (sonda.resultados || []).map(({ n, tipo, repo, status, erro, ...r }) => ({ n, tipo, repo, status, erro, ...r })) } : null });
    }
    if (request.method !== "POST") return json({ erro: "metodo" }, 405);
    const { b, erro } = await lerCorpo(request);
    if (erro) return erro;
    const lidas = L.lerUrls(b.urls);
    if (lidas.erro) return json({ erro: lidas.erro }, 400);
    if (!lidas.validas.length) return json({ erro: lidas.recusadas.length ? lidas.recusadas[0].erro : "Cole a URL do GitHub.", recusadas: lidas.recusadas }, 400);
    const cats = await lerCategoriasD1(env);
    const cat = escolherCategoria(cats, b);
    if (cat.erro) return json({ erro: cat.erro }, 400);
    const site = L.urlOk(b.site), feed = L.urlOk(b.feed);
    if (site === null) return json({ erro: "O site precisa ser um endereço http(s)." }, 400);
    if (feed === null) return json({ erro: "O feed precisa ser um endereço http(s)." }, 400);
    const { results } = await env.DB.prepare("SELECT id FROM docs WHERE collection = 'landscape'").all();
    const ja = new Set((results || []).map((r) => r.id));
    const novas = lidas.validas.filter((x) => !ja.has(x.id));
    const repetidas = lidas.validas.filter((x) => ja.has(x.id)).map((x) => x.id);
    if (ja.size + novas.length > L.MAX_TECNOLOGIAS) return json({ erro: `O landscape guarda até ${L.MAX_TECNOLOGIAS} tecnologias.` }, 400);
    const umaSo = lidas.validas.length === 1;
    const nome = L.nomeLimpo(b.nome);
    const docs = novas.map((x) => ({ id: x.id, doc: { repo: x.repo, nome: (umaSo && nome) || x.repo.split("/")[1], categoria: cat.cid, subcategoria: cat.sid, site: umaSo ? site : "", feed: umaSo ? feed : "", adicionado: quando, por: "admin", atualizado: quando } }));
    if (cat.mudou) await gravarCategorias(env, deps, cat.categorias, quando);
    if (docs.length) {
      await env.DB.batch(docs.map((d) => env.DB.prepare("INSERT OR IGNORE INTO docs (collection, id, data, coletado, atualizado) VALUES ('landscape', ?, ?, '', ?)").bind(d.id, JSON.stringify(d.doc), quando)));
      deps.gravarNoEspelho(env, docs.map((d) => ({ collection: "landscape", id: d.id, data: JSON.stringify(d.doc), coletado: "", atualizado: quando })));
    }
    return json({ ok: true, adicionadas: docs.map((d) => ({ id: d.id, repo: d.doc.repo, nome: d.doc.nome, categoria: d.doc.categoria, subcategoria: d.doc.subcategoria, site: d.doc.site, adicionado: quando, leve: { coletando: true } })),
      repetidas, recusadas: lidas.recusadas, categorias: cat.categorias });
  }
  if (!L.ID_OK.test(id) || id.length > 160) return json({ erro: "id" }, 400);
  const atual = await lerDoc(env, "landscape", id);
  if (!atual) return json({ erro: "nao-encontrada" }, 404);
  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM docs WHERE collection = 'landscape' AND id = ?").bind(id).run();
    deps.removerDoEspelho(env, [{ collection: "landscape", id }]);
    return json({ ok: true });
  }
  if (request.method !== "PUT") return json({ erro: "metodo" }, 405);
  const { b, erro } = await lerCorpo(request);
  if (erro) return erro;
  const patch = {};
  if (b.nome !== undefined) { const n = L.nomeLimpo(b.nome); if (!n) return json({ erro: "O nome não pode ficar vazio." }, 400); patch.nome = n; }
  if (b.site !== undefined) { const s = L.urlOk(b.site); if (s === null) return json({ erro: "O site precisa ser um endereço http(s)." }, 400); patch.site = s; }
  if (b.feed !== undefined) { const f = L.urlOk(b.feed); if (f === null) return json({ erro: "O feed precisa ser um endereço http(s)." }, 400); patch.feed = f; }
  let cats = null;
  if (b.categoria !== undefined || b.subcategoria !== undefined || b.novaCategoria || b.novaSubcategoria) {
    const cat = escolherCategoria(await lerCategoriasD1(env), { categoria: b.categoria ?? atual.categoria, subcategoria: b.subcategoria, novaCategoria: b.novaCategoria, novaSubcategoria: b.novaSubcategoria });
    if (cat.erro) return json({ erro: cat.erro }, 400);
    patch.categoria = cat.cid; patch.subcategoria = cat.sid;
    if (cat.mudou) { await gravarCategorias(env, deps, cat.categorias, quando); cats = cat.categorias; }
  }
  if (!Object.keys(patch).length) return json({ erro: "Nada para mudar." }, 400);
  await patchDoc(env, id, patch, quando);
  const r = await env.DB.prepare("SELECT data, coletado, atualizado FROM docs WHERE collection = 'landscape' AND id = ?").bind(id).first();
  if (r) deps.gravarNoEspelho(env, [{ collection: "landscape", id, data: r.data, coletado: r.coletado || "", atualizado: r.atualizado }]);
  return json({ ok: true, ...patch, ...(cats ? { categorias: cats } : {}) });
}
