// Coleta sem IA: o cron lê os feeds de src/feeds.js, descarta o que já existe e guarda o resto em "candidatos".
// A tarefa de curadoria (Claude) só lê os candidatos novos, escolhe, resume e grava os itens.
// Aqui também fica a limpeza por idade, que antes era feita pelas tarefas.
import { FEEDS } from "./feeds.js";

const INTERVALO_MIN = 90;      // cada feed é lido no máximo a cada 90 minutos
const FEEDS_POR_MINUTO = 6;    // o cron roda de minuto em minuto
const ITENS_POR_FEED = 20;
const JANELA_DIAS = { tech: 21, politica: 3, esportes: 3 };
const UA = "Mozilla/5.0 (compatible; LookoutBot/1.0; +https://news.ralph-renato.workers.dev)";
const COLECOES_ITENS = ["items", "items-politica", "items-esportes", "sombra-items"];

const agora = () => new Date();
const iso = (d) => d.toISOString();

// ---------- leitura de RSS e Atom ----------

const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", laquo: "«", raquo: "»" };
function decodificar(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(n); } catch { return m; }
    }
    return ENTIDADES[e.toLowerCase()] ?? m;
  });
}
const semCdata = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
const texto = (s) => decodificar(semCdata(s || "").replace(/<!\[CDATA\[|\]\]>/g, "")).replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();

function tag(bloco, ...nomes) {
  for (const nome of nomes) {
    const re = new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, "i");
    const m = bloco.match(re);
    if (m && m[1].trim()) return m[1];
  }
  return "";
}

function linkAtom(bloco) {
  const links = [...bloco.matchAll(/<link\b([^>]*?)\/?>/gi)].map((m) => m[1]);
  const attr = (a, n) => { const m = a.match(new RegExp(`${n}\\s*=\\s*["']([^"']+)["']`, "i")); return m ? m[1] : ""; };
  const alt = links.find((a) => !/rel\s*=/i.test(a) || /rel\s*=\s*["']alternate["']/i.test(a));
  return attr(alt || links[0] || "", "href");
}

export function lerFeed(xml) {
  const atom = /<entry[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml);
  const blocos = xml.match(atom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) || [];
  return blocos.map((b) => {
    let link = atom ? linkAtom(b) : texto(tag(b, "link"));
    if (!link) {
      const guid = b.match(/<guid(?:\s[^>]*)?>([\s\S]*?)<\/guid>/i);
      if (guid && /^https?:\/\//.test(texto(guid[1]))) link = texto(guid[1]);
    }
    if (!link && !atom) link = linkAtom(b);
    const data = texto(tag(b, "pubDate", "published", "updated", "dc:date"));
    const d = data ? new Date(data) : null;
    return {
      titulo: texto(tag(b, "title")).slice(0, 300),
      url: decodificar(link.trim()),
      publicado: d && !isNaN(d) ? iso(d) : "",
      trecho: texto(tag(b, "description", "summary", "content:encoded", "content")).slice(0, 280),
    };
  }).filter((i) => i.titulo && /^https?:\/\//.test(i.url));
}

export function urlCanonica(u) {
  try {
    const x = new URL(u);
    x.hash = "";
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_cid|mc_eid)/i.test(k)) x.searchParams.delete(k);
    return x.toString();
  } catch { return u; }
}

export async function idDe(url) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url));
  return "i" + [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

// ---------- coleta ----------

async function feedsDaVez(env) {
  const { results } = await env.DB.prepare("SELECT url, ultima_checagem, erros_seguidos FROM feeds_estado").all();
  const est = new Map(results.map((r) => [r.url, r]));
  const t = Date.now();
  const devidos = FEEDS.map(([radar, fonte, pais, url]) => {
    const e = est.get(url);
    const ultima = e && e.ultima_checagem ? Date.parse(e.ultima_checagem) : 0;
    const espera = INTERVALO_MIN * 60_000 * Math.pow(2, Math.min(e ? e.erros_seguidos : 0, 4));
    return { radar, fonte, pais, url, ultima, devido: t - ultima >= espera };
  }).filter((f) => f.devido);
  devidos.sort((a, b) => a.ultima - b.ultima);
  return devidos.slice(0, FEEDS_POR_MINUTO);
}

async function registrar(env, f, ok, erro, itens, novos) {
  const t = iso(agora());
  await env.DB.prepare(
    `INSERT INTO feeds_estado (url, radar, fonte, ultima_checagem, ultimo_ok, erro, erros_seguidos, itens_ultima, novos_total)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
     ON CONFLICT(url) DO UPDATE SET radar = excluded.radar, fonte = excluded.fonte, ultima_checagem = excluded.ultima_checagem,
       ultimo_ok = CASE WHEN ?10 THEN excluded.ultimo_ok ELSE feeds_estado.ultimo_ok END,
       erro = excluded.erro,
       erros_seguidos = CASE WHEN ?10 THEN 0 ELSE feeds_estado.erros_seguidos + 1 END,
       itens_ultima = excluded.itens_ultima,
       novos_total = feeds_estado.novos_total + ?9`
  ).bind(f.url, f.radar, f.fonte, t, ok ? t : "", erro, ok ? 0 : 1, itens, novos, ok ? 1 : 0).run();
}

async function lerUm(env, f) {
  let r;
  try {
    r = await fetch(f.url, { headers: { "user-agent": UA, accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5" }, signal: AbortSignal.timeout(10_000), redirect: "follow" });
  } catch (e) {
    return registrar(env, f, false, String(e && e.message || e).slice(0, 200), 0, 0);
  }
  if (!r.ok) return registrar(env, f, false, "HTTP " + r.status, 0, 0);
  const xml = (await r.text()).slice(0, 3_000_000);
  const lidos = lerFeed(xml);
  if (!lidos.length) return registrar(env, f, false, "nenhum item reconhecido", 0, 0);

  const limite = Date.now() - JANELA_DIAS[f.radar] * 86_400_000;
  const recentes = lidos.slice(0, ITENS_POR_FEED).filter((i) => !i.publicado || Date.parse(i.publicado) >= limite);
  const itens = [];
  for (const i of recentes) {
    const url = urlCanonica(i.url);
    itens.push({ ...i, url, id: await idDe(url) });
  }
  if (!itens.length) return registrar(env, f, true, "", lidos.length, 0);

  // descarta o que já é candidato ou já está no banco (pelo id e pela url)
  const ids = itens.map((i) => i.id), urls = itens.map((i) => i.url);
  const marcas = ids.map((_, k) => `?${k + 1}`).join(",");
  const marcasUrl = urls.map((_, k) => `?${ids.length + k + 1}`).join(",");
  const cols = COLECOES_ITENS.map((c) => `'${c}'`).join(",");
  const { results } = await env.DB.prepare(
    `SELECT id, '' AS url FROM candidatos WHERE id IN (${marcas})
     UNION SELECT id, '' FROM docs WHERE collection IN (${cols}) AND id IN (${marcas})
     UNION SELECT '', json_extract(data, '$.url') FROM docs WHERE collection IN (${cols}) AND json_extract(data, '$.url') IN (${marcasUrl})`
  ).bind(...ids, ...urls).all();
  const existentes = new Set(results.flatMap((r) => [r.id, r.url]).filter(Boolean));
  const novos = itens.filter((i) => !existentes.has(i.id) && !existentes.has(i.url));

  if (novos.length) {
    const t = iso(agora());
    const ins = env.DB.prepare(
      "INSERT OR IGNORE INTO candidatos (id, radar, url, titulo, fonte, pais, publicado, trecho, feed, visto) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
    );
    await env.DB.batch(novos.map((i) => ins.bind(i.id, f.radar, i.url, i.titulo, f.fonte, f.pais, i.publicado, i.trecho, f.url, t)));
  }
  return registrar(env, f, true, "", lidos.length, novos.length);
}

export async function coletar(env) {
  const lista = await feedsDaVez(env);
  await Promise.all(lista.map((f) => lerUm(env, f).catch((e) => registrar(env, f, false, "falha: " + String(e && e.message || e).slice(0, 180), 0, 0))));
  return lista.length;
}

// ---------- limpeza por idade (antes feita pelas tarefas) ----------

const DIA = 86_400_000;
const ACUMULATIVOS = new Set(["arquitetura", "dados", "eip", "legado", "programacao", "infra", "carreira", "docs", "diagramas", "cursos"]);
const PRAZOS = {
  tech: { noticia: 30, release: 90, video: 90, youtube: 90, podcast: 90, review: 90, whitepaper: 365, artigo: 730 },
  politica: { noticia: 30, analise: 90, video: 90, podcast: 90, oficial: 365 },
  esportes: { noticia: 30, resultado: 30, analise: 90, video: 90, podcast: 90 },
};
const COLECOES = [
  { c: "items", radar: "tech" }, { c: "sombra-items", radar: "tech" },
  { c: "items-politica", radar: "politica" }, { c: "items-esportes", radar: "esportes" },
];
const DESTAQUES = ["destaques", "destaques-politica", "destaques-esportes", "sombra-destaques"];
const LIMITE_EXCLUSOES = 60;

function vencido(radar, item, coletado, t) {
  if (radar === "tech" && ACUMULATIVOS.has(item.tema)) return false;
  const dias = PRAZOS[radar][item.tipo];
  if (!dias) return false;
  const ref = Date.parse(item.publicado || coletado || "");
  if (isNaN(ref) || ref > t) return false; // sem data confiável ou evento/lançamento futuro: fica
  return t - ref > dias * DIA;
}

export async function limpar(env) {
  const t = Date.now();
  const relatorio = {};
  for (const { c, radar } of COLECOES) {
    const { results } = await env.DB.prepare(
      "SELECT id, coletado, json_extract(data, '$.tema') AS tema, json_extract(data, '$.tipo') AS tipo, json_extract(data, '$.publicado') AS publicado FROM docs WHERE collection = ?"
    ).bind(c).all();
    const fora = results.filter((r) => vencido(radar, r, r.coletado, t)).map((r) => r.id);
    if (fora.length > LIMITE_EXCLUSOES) { relatorio[c] = `suspenso: ${fora.length} vencidos`; continue; }
    for (let k = 0; k < fora.length; k += 90) {
      const parte = fora.slice(k, k + 90);
      await env.DB.prepare(`DELETE FROM docs WHERE collection = ?1 AND id IN (${parte.map((_, j) => `?${j + 2}`).join(",")})`).bind(c, ...parte).run();
    }
    relatorio[c] = fora.length;
  }
  const corte = new Date(t - 7 * DIA).toISOString().slice(0, 10);
  for (const c of DESTAQUES) {
    const r = await env.DB.prepare("DELETE FROM docs WHERE collection = ? AND substr(id, 2) < ?").bind(c, corte).run();
    relatorio[c] = r.meta?.changes ?? 0;
  }
  const r = await env.DB.prepare("DELETE FROM candidatos WHERE visto < ?").bind(new Date(t - 10 * DIA).toISOString()).run();
  relatorio.candidatos = r.meta?.changes ?? 0;
  await env.DB.prepare(
    "INSERT INTO docs (collection, id, data) VALUES ('_sistema', 'limpeza', ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
  ).bind(JSON.stringify({ quando: new Date(t).toISOString(), ...relatorio })).run();
  return relatorio;
}
