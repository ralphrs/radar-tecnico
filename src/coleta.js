// Coleta sem IA: o cron lê os feeds de src/feeds.js, descarta o que já existe e guarda o resto em "candidatos".
// Subreddits (tipo "reddit" em src/feeds.js) têm fila e ritmo próprios: veja REDDIT abaixo e docs/coleta.md.
// A tarefa de curadoria (Claude) só lê os candidatos novos, escolhe, resume e grava os itens.
// Aqui também fica a limpeza por idade, que antes era feita pelas tarefas.
import { FEEDS } from "./feeds.js";
import { histParaApagar } from "./papel.js";
import { leiturasParaApagar } from "./leitura.js";

const INTERVALO_MIN = 90;      // cada feed é lido no máximo a cada 90 minutos
const FEEDS_POR_MINUTO = 6;    // o cron roda de minuto em minuto
const ITENS_POR_FEED = 20;
const JANELA_DIAS = { tech: 21, politica: 3, esportes: 3, negocios: 7, investimentos: 7 };
const UA = "Mozilla/5.0 (compatible; LookoutBot/1.0; +https://news.ralph-renato.workers.dev)";
// Reddit: ritmo próprio, porque 4 pedidos no mesmo minuto já deram 429 (sonda de 03/11/2026).
export const REDDIT = {
  INTERVALO_MIN: 120,     // cada subreddit relido a cada 120 min
  POR_MINUTO: 1,          // no máximo 1 subreddit por minuto de cron, somando coleta e sonda
  ESPERA_MAX_MIN: 24 * 60, // erro dobra a espera (429 incluído) até 24 h
  BLOQUEIO_403: 3,        // 403 três vezes seguidas: feed marcado como bloqueado (tentado de novo só a cada 24 h)
  TRECHO: 600,
  UA: "Lookout/1.0 (agregador pessoal de noticias; +https://news.ralph-renato.workers.dev)",
};
const COLECOES_ITENS = ["items", "items-politica", "items-esportes", "items-negocios", "items-investimentos", "sombra-items"];

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

// Atom quando há <entry> e nenhum <item>. A sonda usa a mesma regra para dizer o tipo do feed.
export const ehAtom = (xml) => /<entry[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml);

export function lerFeed(xml) {
  const atom = ehAtom(xml);
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

// ---------- Atom do Reddit ----------

export const ehReddit = (u) => { try { const h = new URL(u).hostname.toLowerCase(); return h === "reddit.com" || h.endsWith(".reddit.com"); } catch { return false; } };
// Hosts do próprio Reddit (post, imagem, vídeo, galeria): link para eles não é "link externo".
const doReddit = (u) => { try { const h = new URL(u).hostname.toLowerCase(); return /(^|\.)(reddit\.com|redd\.it|redditmedia\.com|redditstatic\.com)$/.test(h); } catch { return true; } };

// Cada <entry> do Atom de /r/<sub>/new/.rss vira { titulo, url, publicado, trecho, linkExterno, tipo: "reddit" }.
// title: o título do post como veio (prefixo de flair entre colchetes fica; a curadoria decide). url: o link do post.
// content: HTML escapado; o texto do post é o <div class="md">, e o [link] do rodapé aponta para fora quando o post é
// um link. Post fixado: o Atom do Reddit não marca e /new/ não lista os fixados; se alguma marca aparecer
// (<stickied>true</stickied>, category "stickied" ou "pinned"), o post fica de fora.
export function lerReddit(xml) {
  const blocos = String(xml || "").match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  const out = [];
  for (const b of blocos) {
    if (/<(?:\w+:)?stickied>\s*true\s*</i.test(b) || /<category\b[^>]*\bterm\s*=\s*["'](?:stickied|pinned)["']/i.test(b)) continue;
    const url = decodificar(linkAtom(b).trim());
    const titulo = texto(tag(b, "title")).slice(0, 300);
    if (!titulo || !/^https?:\/\//.test(url)) continue;
    const data = texto(tag(b, "published", "updated"));
    const d = data ? new Date(data) : null;
    const html = decodificar(semCdata(tag(b, "content")));
    const md = html.match(/<div class="md">([\s\S]*?)<\/div>\s*(?:<!--\s*SC_ON\s*-->|$)/i) || html.match(/<div class="md">([\s\S]*)<\/div>/i);
    const trecho = md ? texto(md[1]).slice(0, REDDIT.TRECHO) : "";
    let linkExterno = "";
    const lk = [...html.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>\s*\[link\]\s*<\/a>/gi)].map((m) => decodificar(m[1]))[0] || "";
    if (!trecho && /^https?:\/\//.test(lk) && !doReddit(lk)) linkExterno = lk.slice(0, 1000);
    out.push({ titulo, url, publicado: d && !isNaN(d) ? iso(d) : "", trecho, linkExterno, tipo: "reddit" });
  }
  return out;
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

// Colunas que entraram depois do schema.sql original (tipo e link_externo dos candidatos, seguidos_403 do feeds_estado).
// ALTER TABLE ADD COLUMN só quando falta; confere uma vez por isolate. Fica aqui para valer onde o schema não foi reaplicado.
const COLUNAS = [
  ["candidatos", "tipo", "TEXT NOT NULL DEFAULT ''"],
  ["candidatos", "link_externo", "TEXT NOT NULL DEFAULT ''"],
  ["feeds_estado", "seguidos_403", "INTEGER NOT NULL DEFAULT 0"],
];
let colunasOk = false;
export async function garantirColunas(env) {
  if (colunasOk) return;
  for (const tabela of new Set(COLUNAS.map((c) => c[0]))) {
    const { results } = await env.DB.prepare("SELECT name FROM pragma_table_info(?)").bind(tabela).all();
    const tem = new Set((results || []).map((r) => r.name));
    for (const [t, col, tipo] of COLUNAS) if (t === tabela && !tem.has(col)) await env.DB.prepare(`ALTER TABLE ${t} ADD COLUMN ${col} ${tipo}`).run();
  }
  colunasOk = true;
}

// Espera do Reddit: 120 min, dobrando a cada erro seguido (429 incluído), até 24 h.
export const esperaReddit = (erros) => Math.min(REDDIT.INTERVALO_MIN * Math.pow(2, Math.max(0, erros || 0)), REDDIT.ESPERA_MAX_MIN) * 60_000;
export const bloqueado = (e) => !!e && (e.seguidos_403 || 0) >= REDDIT.BLOQUEIO_403;

// Fila do Reddit: os devidos, do que está há mais tempo sem leitura para o mais recente. estados: Map(url -> linha de feeds_estado).
export function filaReddit(feeds, estados, t = Date.now()) {
  return feeds.map((f) => {
    const e = estados.get(f.url);
    const ultima = e && e.ultima_checagem ? Date.parse(e.ultima_checagem) : 0;
    const espera = bloqueado(e) ? REDDIT.ESPERA_MAX_MIN * 60_000 : esperaReddit(e ? e.erros_seguidos : 0);
    return { ...f, ultima, devido: t - ultima >= espera };
  }).filter((f) => f.devido).sort((a, b) => a.ultima - b.ultima);
}

async function feedsDaVez(env) {
  const { results } = await env.DB.prepare("SELECT url, ultima_checagem, erros_seguidos, seguidos_403 FROM feeds_estado").all();
  const est = new Map(results.map((r) => [r.url, r]));
  const t = Date.now();
  const todos = FEEDS.map(([radar, fonte, pais, url, tipo]) => ({ radar, fonte, pais, url, tipo: tipo || "rss" }));
  const devidos = todos.filter((f) => f.tipo !== "reddit").map((f) => {
    const e = est.get(f.url);
    const ultima = e && e.ultima_checagem ? Date.parse(e.ultima_checagem) : 0;
    const espera = INTERVALO_MIN * 60_000 * Math.pow(2, Math.min(e ? e.erros_seguidos : 0, 4));
    return { ...f, ultima, devido: t - ultima >= espera };
  }).filter((f) => f.devido);
  devidos.sort((a, b) => a.ultima - b.ultima);
  return { normais: devidos.slice(0, FEEDS_POR_MINUTO), reddit: filaReddit(todos.filter((f) => f.tipo === "reddit"), est, t) };
}

// http: o status da resposta (0 sem resposta). 403 conta em seguidos_403; no Reddit, a terceira seguida vira "bloqueado".
async function registrar(env, f, ok, erro, itens, novos, http = 0) {
  const t = iso(agora());
  const reddit = f.tipo === "reddit" ? 1 : 0;
  await env.DB.prepare(
    `INSERT INTO feeds_estado (url, radar, fonte, ultima_checagem, ultimo_ok, erro, erros_seguidos, itens_ultima, novos_total, seguidos_403)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?11)
     ON CONFLICT(url) DO UPDATE SET radar = excluded.radar, fonte = excluded.fonte, ultima_checagem = excluded.ultima_checagem,
       ultimo_ok = CASE WHEN ?10 THEN excluded.ultimo_ok ELSE feeds_estado.ultimo_ok END,
       erro = CASE WHEN ?11 AND ?12 AND feeds_estado.seguidos_403 + 1 >= ?13 THEN 'bloqueado: HTTP 403 ' || (feeds_estado.seguidos_403 + 1) || ' vezes seguidas' ELSE excluded.erro END,
       erros_seguidos = CASE WHEN ?10 THEN 0 ELSE feeds_estado.erros_seguidos + 1 END,
       itens_ultima = excluded.itens_ultima,
       novos_total = feeds_estado.novos_total + ?9,
       seguidos_403 = CASE WHEN ?11 THEN feeds_estado.seguidos_403 + 1 ELSE 0 END`
  ).bind(f.url, f.radar, f.fonte, t, ok ? t : "", erro, ok ? 0 : 1, itens, novos, ok ? 1 : 0, http === 403 ? 1 : 0, reddit, REDDIT.BLOQUEIO_403).run();
}

// Busca um feed com 10 s de limite. Usado pela coleta e pela sonda (src/sonda.js).
// O Reddit recebe o user-agent do Lookout (pedido deles para agregadores); o resto, o do robô.
export function pegar(url) {
  const ua = ehReddit(url) ? REDDIT.UA : UA;
  return fetch(url, { headers: { "user-agent": ua, accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5" }, signal: AbortSignal.timeout(10_000), redirect: "follow" });
}

// Devolve o status HTTP da resposta (0 quando não houve resposta), para a coleta do Reddit parar no 429.
async function lerUm(env, f) {
  let r;
  try {
    r = await pegar(f.url);
  } catch (e) {
    await registrar(env, f, false, String(e && e.message || e).slice(0, 200), 0, 0);
    return 0;
  }
  if (!r.ok) { await registrar(env, f, false, "HTTP " + r.status, 0, 0, r.status); return r.status; }
  const xml = (await r.text()).slice(0, 3_000_000);
  const reddit = f.tipo === "reddit";
  const lidos = reddit ? lerReddit(xml) : lerFeed(xml);
  if (!lidos.length) {
    // subreddit sem post novo responde um <feed> sem <entry>: não é erro
    if (reddit && /<feed[\s>]/i.test(xml.slice(0, 2000))) { await registrar(env, f, true, "", 0, 0, r.status); return r.status; }
    await registrar(env, f, false, "nenhum item reconhecido", 0, 0, r.status);
    return r.status;
  }

  const limite = Date.now() - JANELA_DIAS[f.radar] * 86_400_000;
  const recentes = lidos.slice(0, ITENS_POR_FEED).filter((i) => !i.publicado || Date.parse(i.publicado) >= limite);
  const itens = [];
  for (const i of recentes) {
    const url = urlCanonica(i.url);
    itens.push({ ...i, url, id: await idDe(url) });
  }
  if (!itens.length) { await registrar(env, f, true, "", lidos.length, 0, r.status); return r.status; }

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
      "INSERT OR IGNORE INTO candidatos (id, radar, url, titulo, fonte, pais, publicado, trecho, feed, visto, tipo, link_externo) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)"
    );
    await env.DB.batch(novos.map((i) => ins.bind(i.id, f.radar, i.url, i.titulo, f.fonte, f.pais, i.publicado, i.trecho, f.url, t, reddit ? "reddit" : "", i.linkExterno ? urlCanonica(i.linkExterno) : "")));
  }
  await registrar(env, f, true, "", lidos.length, novos.length, r.status);
  return r.status;
}

// Devolve { feeds, reddit }: quantos feeds normais e quantos subreddits foram lidos neste minuto.
// A sonda (src/sonda.js) só testa URL do Reddit quando a coleta não usou a vez dele.
export async function coletar(env) {
  await garantirColunas(env);
  const { normais, reddit } = await feedsDaVez(env);
  const falha = (f) => (e) => registrar(env, f, false, "falha: " + String(e && e.message || e).slice(0, 180), 0, 0).then(() => 0);
  const normal = Promise.all(normais.map((f) => lerUm(env, f).catch(falha(f))));
  // Reddit em fila, um de cada vez: 429 encerra a vez do Reddit neste minuto
  let lidosReddit = 0;
  for (const f of reddit.slice(0, REDDIT.POR_MINUTO)) {
    lidosReddit++;
    const status = await lerUm(env, f).catch(falha(f));
    if (status === 429) break;
  }
  await normal;
  return { feeds: normais.length, reddit: lidosReddit };
}

// ---------- limpeza por idade (antes feita pelas tarefas) ----------

const DIA = 86_400_000;
const ACUMULATIVOS = new Set(["arquitetura", "dados", "eip", "legado", "programacao", "infra", "carreira", "docs", "diagramas", "cursos"]);
const PRAZOS = {
  tech: { noticia: 30, release: 90, video: 90, youtube: 90, podcast: 90, review: 90, whitepaper: 365, artigo: 730 },
  politica: { noticia: 30, analise: 90, video: 90, podcast: 90, oficial: 365 },
  esportes: { noticia: 30, resultado: 30, analise: 90, video: 90, podcast: 90 },
  negocios: { noticia: 30, balanco: 90, analise: 90, video: 90, podcast: 90, relatorio: 365 },
  investimentos: { noticia: 30, analise: 90, relatorio: 180, video: 90, podcast: 90 },
};
const COLECOES = [
  { c: "items", radar: "tech" }, { c: "sombra-items", radar: "tech" },
  { c: "items-politica", radar: "politica" }, { c: "items-esportes", radar: "esportes" },
  { c: "items-negocios", radar: "negocios" },
  { c: "items-investimentos", radar: "investimentos" },
];
const DESTAQUES = ["destaques", "destaques-politica", "destaques-esportes", "destaques-negocios", "destaques-investimentos", "sombra-destaques"];
const LIMITE_EXCLUSOES = 60;

function vencido(radar, item, coletado, t) {
  if (radar === "tech" && ACUMULATIVOS.has(item.tema)) return false;
  const dias = PRAZOS[radar][item.tipo];
  if (!dias) return false;
  const ref = Date.parse(item.publicado || coletado || "");
  if (isNaN(ref) || ref > t) return false; // sem data confiável ou evento/lançamento futuro: fica
  return t - ref > dias * DIA;
}

// Só mexe nas collections de itens e destaques, em hist (fichas de papel) e em candidatos: favs/, listas/, prefs/ e carteira/ (de cada pessoa) ficam de fora; de leitura/ saem só os dias com mais de 30 dias.
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
  // Fichas de papel (hist) que ninguém abre há mais de 30 dias: DELETE por lista de ids, em lotes de 90
  try {
    const hist = await histParaApagar(env);
    for (let k = 0; k < hist.length; k += 90) {
      const parte = hist.slice(k, k + 90);
      await env.DB.prepare(`DELETE FROM docs WHERE collection = 'hist' AND id IN (${parte.map((_, j) => `?${j + 1}`).join(",")})`).bind(...parte).run();
    }
    relatorio.hist = hist.length;
  } catch (e) { relatorio.hist = "erro: " + String(e.message || e).slice(0, 100); }
  // Leitura do dia (src/leitura.js) com mais de 30 dias: DELETE por lista de ids, por pessoa, em lotes de 90
  try {
    const velhas = await leiturasParaApagar(env, t);
    const porCol = new Map();
    for (const r of velhas) { if (!porCol.has(r.collection)) porCol.set(r.collection, []); porCol.get(r.collection).push(r.id); }
    for (const [c, ids] of porCol) for (let k = 0; k < ids.length; k += 90) {
      const parte = ids.slice(k, k + 90);
      await env.DB.prepare(`DELETE FROM docs WHERE collection = ?1 AND id IN (${parte.map((_, j) => `?${j + 2}`).join(",")})`).bind(c, ...parte).run();
    }
    relatorio.leitura = velhas.length;
  } catch (e) { relatorio.leitura = "erro: " + String(e.message || e).slice(0, 100); }
  const r = await env.DB.prepare("DELETE FROM candidatos WHERE visto < ?").bind(new Date(t - 10 * DIA).toISOString()).run();
  relatorio.candidatos = r.meta?.changes ?? 0;
  await env.DB.prepare(
    "INSERT INTO docs (collection, id, data) VALUES ('_sistema', 'limpeza', ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
  ).bind(JSON.stringify({ quando: new Date(t).toISOString(), ...relatorio })).run();
  return relatorio;
}
