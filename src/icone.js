// Ícone do site oficial (regra do dono de 19/11: "tem que sempre tentar colocar um ícone"). GET /icone/<dominio>.
//
// Só atende domínio que já está no banco: o `site` (ou o site que o GitHub informa) de uma tecnologia do Landscape, o
// `links.produto` de um serviço da aba Cloud ou o `site` de um provedor. Qualquer outro domínio: 404 (não é proxy aberto).
// Tenta https://<dominio>/favicon.ico e, se não vier imagem, o <link rel="icon"> da página inicial (lida até 100 KB).
// Só devolve content-type de imagem, até 200 KB; SVG vai com CSP default-src 'none' e nosniff. Cache na borda (Cache
// API): 7 dias para sucesso, 1 dia para falha. Mesma origem: a CSP da página não ganha domínio novo. O cron não usa.
import "../public/arch.js";
import { UA } from "./landscape.js";

const A = globalThis.Arch;
export const MAX_ICONE = 200_000;
export const MAX_PAGINA = 100_000;
const TIMEOUT = 4000;
const SUCESSO_S = 7 * 86400, FALHA_S = 86400;

export const SQL_DOMINIOS = "SELECT id, data FROM docs WHERE 0"
  + " UNION ALL SELECT id, json_object('a', json_extract(data, '$.site'), 'b', json_extract(data, '$.gh.site')) AS data FROM docs WHERE collection = 'landscape'"
  + " UNION ALL SELECT id, json_object('a', json_extract(data, '$.links.produto')) AS data FROM docs WHERE collection = 'cloud'"
  + " UNION ALL SELECT id, data FROM docs WHERE collection = 'meta' AND id = 'cloud-provedores'";
export async function dominiosPermitidos(env, deps) {
  const linhas = (await deps.lerLinhas(env, SQL_DOMINIOS, [], "icone")) || [];
  const out = new Set();
  for (const r of linhas) {
    let d;
    try { d = JSON.parse(r.data); } catch { continue; }
    if (!d) continue;
    if (Array.isArray(d.provedores)) { for (const p of d.provedores) { const x = A.dominioDe(p && p.site); if (x) out.add(x); } continue; }
    for (const u of [d.a, d.b]) { const x = A.dominioDe(u); if (x) out.add(x); }
  }
  return out;
}

const ehImagem = (ct) => /^image\/(png|x-icon|vnd\.microsoft\.icon|svg\+xml|gif|jpeg|webp|avif)\b/i.test(String(ct || ""));
// Lê o corpo até `max` bytes; passou disso, null
async function lerAte(r, max) {
  const cl = Number(r.headers.get("content-length") || "");
  if (Number.isFinite(cl) && cl > max) return null;
  if (!r.body || !r.body.getReader) { const b = new Uint8Array(await r.arrayBuffer()); return b.length > max ? null : b; }
  const rd = r.body.getReader(), partes = [];
  let total = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    total += value.length;
    if (total > max) { try { await rd.cancel(); } catch {} return null; }
    partes.push(value);
  }
  const out = new Uint8Array(total);
  let k = 0;
  for (const p of partes) { out.set(p, k); k += p.length; }
  return out;
}
async function tentarImagem(url, fetcher) {
  let r;
  try { r = await fetcher(url, { headers: { "user-agent": UA, accept: "image/*" }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT) }); } catch { return null; }
  if (!r || !r.ok) return null;
  const ct = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!ehImagem(ct)) return null;
  const corpo = await lerAte(r, MAX_ICONE);
  if (!corpo || !corpo.length) return null;
  return { corpo, tipo: ct };
}
// O <link rel="icon"> (ou shortcut icon, apple-touch-icon) da página inicial, como URL absoluta http(s)
export function iconeDaPagina(html, base) {
  const links = String(html || "").match(/<link\b[^>]*>/gi) || [];
  for (const rel of [/\bicon\b/i, /apple-touch-icon/i]) {
    for (const l of links) {
      const r = (l.match(/\brel\s*=\s*["']?([^"'>]+)/i) || [])[1] || "";
      if (!rel.test(r) || /mask-icon/i.test(r)) continue;
      const h = (l.match(/\bhref\s*=\s*["']([^"']+)["']/i) || l.match(/\bhref\s*=\s*([^\s>]+)/i) || [])[1];
      if (!h || /^data:/i.test(h)) continue;
      try { const u = new URL(h.replace(/&amp;/g, "&"), base); if (u.protocol === "https:" || u.protocol === "http:") return u.toString(); } catch {}
    }
  }
  return "";
}
export function respostaIcone({ corpo, tipo }) {
  const h = { "content-type": tipo, "cache-control": "public, max-age=" + SUCESSO_S, "x-content-type-options": "nosniff" };
  if (/svg/.test(tipo)) h["content-security-policy"] = "default-src 'none'";
  return new Response(corpo, { status: 200, headers: h });
}
const semIcone = () => new Response("sem ícone", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=" + FALHA_S, "x-content-type-options": "nosniff" } });

export async function buscarIcone(dominio, fetcher = fetch) {
  const direto = await tentarImagem(`https://${dominio}/favicon.ico`, fetcher);
  if (direto) return direto;
  let pagina;
  try { pagina = await fetcher(`https://${dominio}/`, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT) }); } catch { return null; }
  if (!pagina || !pagina.ok || !/html/i.test(pagina.headers.get("content-type") || "")) return null;
  const bytes = await lerAte(pagina, MAX_PAGINA * 20).catch(() => null);
  const html = bytes ? new TextDecoder().decode(bytes.slice(0, MAX_PAGINA)) : "";
  const u = iconeDaPagina(html, pagina.url || `https://${dominio}/`);
  return u ? tentarImagem(u, fetcher) : null;
}

export async function rotaIcone(request, env, dominio, deps = {}) {
  if (request.method !== "GET") return new Response("método", { status: 405 });
  const d = String(dominio || "").toLowerCase();
  if (!/^[a-z0-9.-]{1,200}$/.test(d) || !d.includes(".")) return semIcone();
  const permitidos = await dominiosPermitidos(env, deps);
  if (!permitidos.has(d)) return new Response("domínio fora da lista", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  const cache = deps.cache !== undefined ? deps.cache : (typeof caches !== "undefined" ? caches.default : null);
  const chave = new Request("https://icone.lookout.local/" + d);
  if (cache) { try { const c = await cache.match(chave); if (c) return c; } catch {} }
  const img = await buscarIcone(d, deps.fetcher || fetch);
  const r = img ? respostaIcone(img) : semIcone();
  if (cache) { const guardar = cache.put(chave, r.clone()).catch(() => {}); if (deps.ctx && deps.ctx.waitUntil) deps.ctx.waitUntil(guardar); else await guardar; }
  return r;
}
