// Sonda de feeds: o admin manda uma lista de URLs e o cron testa até 4 por minuto (URL do Reddit: 1 por minuto, e só
// quando a coleta não leu subreddit naquele minuto, o mesmo ritmo de src/coleta.js), daqui do Worker,
// que alcança os sites de notícia. Serve para conferir um feed antes de pô-lo em src/feeds.js.
// Usa o mesmo fetch e o mesmo parser da coleta, então o resultado é o que a coleta veria.
// Estado em docs: collection '_sistema', id 'sonda-feeds', data { pendentes: [url], resultados: { url: {...} } }.
import { pegar, lerFeed, ehAtom, ehReddit, REDDIT } from "./coleta.js";

const POR_EXECUCAO = 4;
const URLS_POR_PEDIDO = 30;
const URL_MAX = 300;
const PENDENTES_MAX = 200;
const RESULTADOS_MAX = 300;   // guarda os mais recentes; os antigos saem

const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const resumo = (e) => String((e && e.message) || e).slice(0, 200);

async function lerEstado(env) {
  const r = await env.DB.prepare("SELECT data FROM docs WHERE collection = '_sistema' AND id = 'sonda-feeds'").first();
  let s = {};
  try { s = r ? JSON.parse(r.data) : {}; } catch { s = {}; }
  return { pendentes: Array.isArray(s.pendentes) ? s.pendentes : [], resultados: s.resultados && typeof s.resultados === "object" ? s.resultados : {} };
}

async function gravarEstado(env, s) {
  const urls = Object.keys(s.resultados);
  if (urls.length > RESULTADOS_MAX) {
    urls.sort((a, b) => String(s.resultados[b].quando || "").localeCompare(String(s.resultados[a].quando || "")));
    for (const u of urls.slice(RESULTADOS_MAX)) delete s.resultados[u];
  }
  await env.DB.prepare(
    "INSERT INTO docs (collection, id, data) VALUES ('_sistema', 'sonda-feeds', ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
  ).bind(JSON.stringify(s)).run();
}

// Testa uma URL e devolve { status, tipo, itens, maisRecente, erro, quando }.
export async function sondar(url) {
  const quando = new Date().toISOString();
  const base = { status: 0, tipo: "erro", itens: 0, maisRecente: "", erro: "", quando };
  let r;
  try { r = await pegar(url); } catch (e) { return { ...base, erro: resumo(e) }; }
  base.status = r.status;
  if (!r.ok) return { ...base, erro: "HTTP " + r.status };
  let corpo;
  try { corpo = (await r.text()).slice(0, 3_000_000); } catch (e) { return { ...base, erro: "corpo: " + resumo(e) }; }
  const lidos = lerFeed(corpo);
  const maisRecente = lidos.reduce((m, i) => (i.publicado && i.publicado > m ? i.publicado : m), "");
  const inicio = corpo.slice(0, 2000);
  let tipo;
  if (lidos.length) tipo = ehAtom(corpo) ? "atom" : "rss";
  else if (/<feed[\s>]/i.test(inicio)) tipo = "atom";
  else if (/<(rss|rdf:RDF|channel)[\s>]/i.test(inicio)) tipo = "rss";
  else if (/<(!doctype html|html)[\s>]/i.test(inicio) || /text\/html/i.test(r.headers.get("content-type") || "")) tipo = "html";
  else tipo = "erro";
  const erro = lidos.length ? "" : tipo === "html" ? "página HTML, não é feed" : tipo === "erro" ? "formato não reconhecido" : "nenhum item reconhecido";
  return { ...base, tipo, itens: lidos.length, maisRecente, erro };
}

// Quais pendentes vão neste minuto: até 4 fora do Reddit e, se a vez do Reddit estiver livre, 1 do Reddit.
export function loteSonda(pendentes, redditLivre = true) {
  const outros = pendentes.filter((u) => !ehReddit(u)).slice(0, POR_EXECUCAO);
  const reddit = redditLivre ? pendentes.filter((u) => ehReddit(u)).slice(0, REDDIT.POR_MINUTO) : [];
  return [...outros, ...reddit];
}

// Cron: com a lista vazia faz só o SELECT do doc. redditLivre: a coleta não leu subreddit neste minuto.
export async function cronSonda(env, { redditLivre = true } = {}) {
  const s = await lerEstado(env);
  if (!s.pendentes.length) return 0;
  const lote = loteSonda(s.pendentes, redditLivre);
  if (!lote.length) return 0;
  const feitos = await Promise.all(lote.map(async (u) => [u, await sondar(u).catch((e) => ({ status: 0, tipo: "erro", itens: 0, maisRecente: "", erro: "falha: " + resumo(e), quando: new Date().toISOString() }))]));
  // Relê antes de gravar: o admin pode ter mandado URLs novas enquanto os fetches rodavam.
  const atual = await lerEstado(env);
  const feitas = new Set(lote);
  atual.pendentes = atual.pendentes.filter((u) => !feitas.has(u));
  for (const [u, res] of feitos) atual.resultados[u] = res;
  await gravarEstado(env, atual);
  return lote.length;
}

// Confere a lista do POST. Devolve { urls } ou { erro }.
export function validarUrls(b) {
  if (!b || typeof b !== "object" || !Array.isArray(b.urls)) return { erro: "Mande { urls: [...] }." };
  if (!b.urls.length) return { erro: "Nenhuma URL." };
  if (b.urls.length > URLS_POR_PEDIDO) return { erro: `Até ${URLS_POR_PEDIDO} URLs por vez.` };
  const urls = [];
  for (const x of b.urls) {
    const u = typeof x === "string" ? x.trim() : "";
    if (!u || u.length > URL_MAX) return { erro: `URL vazia ou com mais de ${URL_MAX} caracteres: ${String(x).slice(0, 60)}` };
    let ok = false;
    try { ok = /^https?:$/.test(new URL(u).protocol); } catch {}
    if (!ok || !/^https?:\/\//i.test(u)) return { erro: `URL inválida: ${u.slice(0, 60)}` };
    if (!urls.includes(u)) urls.push(u);
  }
  return { urls };
}

export async function adminSonda(request, env) {
  if (request.method === "GET") return json(await lerEstado(env));
  if (request.method !== "POST") return json({ erro: "metodo" }, 405);
  const corpo = await request.text();
  if (corpo.length > 20000) return json({ erro: "grande" }, 413);
  let v;
  try { v = validarUrls(JSON.parse(corpo)); } catch { return json({ erro: "json" }, 400); }
  if (v.erro) return json({ erro: v.erro }, 400);
  const s = await lerEstado(env);
  const novas = v.urls.filter((u) => !s.pendentes.includes(u));
  if (s.pendentes.length + novas.length > PENDENTES_MAX) return json({ erro: `A fila passaria de ${PENDENTES_MAX} URLs. Espere a sonda andar.` }, 400);
  s.pendentes.push(...novas);
  await gravarEstado(env, s);
  return json({ ok: true, acrescentadas: novas.length, pendentes: s.pendentes.length });
}
