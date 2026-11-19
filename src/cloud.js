// ArchLandscape, aba Cloud (pedido de 19/11): serviços de nuvem por categoria e provedor.
//
// Regras puras em public/arch.js (globalThis.Arch): validação, filtros, agrupamento, equivalentes, comparar, citação,
// novidades e o Markdown do ADR. Aqui: semente, rotas públicas e de Admin, notas por pessoa e o feed de novidades na hora.
//
// Banco (D1, com espelho de leitura):
// - cloud/<provedor>--<slug>: um doc por serviço (veja Arch.validarServico). Só o Admin e a semente gravam.
// - meta/cloud-provedores { provedores, atualizado } e meta/cloud-categorias { categorias, atualizado }.
// - cloud-notas/<email>, id "notas": as notas de cada pessoa ({ porId: { <id>: { situacao, nota, link, atualizado } } }).
// - _sistema/cloud-semente: marca de que a semente entrou. _sistema/cloud-feed-<provedor>: cache do feed de novidades
//   (já enxuto, até 300 itens, trocado a cada leitura: é cache, não histórico). _sistema/cloud-feeds-sonda: o que a
//   sonda do Admin achou de cada feed (só feed confirmado é lido).
// Regras: nunca DROP; UPDATE e DELETE só com a chave explícita; coletas, curadorias, tradução e limpeza não tocam aqui.
import "../public/landscape.js";
import "../public/arch.js";
import { lerFeed } from "./coleta.js";
import { sqlCitacoes, COLECOES_ITENS, COLECOES_FORUM, UA } from "./landscape.js";
import { PROVEDORES, CATEGORIAS, SERVICOS, SEMENTE_EM } from "./cloud-semente.js";

const A = globalThis.Arch;
const L = globalThis.Landscape;
const HORA = 3_600_000, DIA = 86_400_000;
export const CACHE_FEED_MS = 12 * HORA;
export const FEED_MAX = 300;
const TIMEOUT_FEED = 5000;
const CORPO_MAX = 16_000;

// Feeds oficiais de novidades. O ambiente onde isto foi escrito não abre nenhum desses hosts, então todos começam em
// CLOUD_PARA_SONDAR: a sonda do Admin (POST /api/admin/cloud-sonda) lê cada um uma vez em produção e grava o resultado;
// só feed que respondeu com itens passa a ser lido. Provedor sem feed confirmado mostra o link de novidades do site.
export const FEEDS_CLOUD = {
  aws: "https://aws.amazon.com/about-aws/whats-new/recent/feed/",
  gcp: "https://cloud.google.com/feeds/gcp-release-notes.xml",
  azure: "https://www.microsoft.com/releasecommunications/api/v2/azure/rss",
  cloudflare: "https://developers.cloudflare.com/changelog/rss/index.xml",
  oci: "https://docs.oracle.com/en-us/iaas/releasenotes/feed/",
};
export const CLOUD_PARA_SONDAR = Object.keys(FEEDS_CLOUD);

const agoraIso = (t = Date.now()) => new Date(t).toISOString();
const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
async function lerDocD1(env, c, id) { const r = await env.DB.prepare("SELECT data FROM docs WHERE collection = ? AND id = ?").bind(c, id).first(); return r ? parse(r.data) : null; }
const gravarSistema = (env, id, data) => env.DB.prepare(
  "INSERT INTO docs (collection, id, data) VALUES ('_sistema', ?, ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
).bind(id, JSON.stringify(data)).run();

// ---------- semente ----------
// Primeira vez (sem a marca): INSERT OR IGNORE de tudo, no primeiro cron depois do deploy.
// Semente nova (SEMENTE_EM diferente da marca): só as capacidades chegam aos docs que já existem, campo a campo, por
// json_patch (patchSemente). Valor gravado pelo Admin (ou pela curadoria ou por um dossiê) fica; valor antigo da semente
// que a nova não traz sai. Serviço que o Admin tirou não volta, e nenhum outro campo do doc muda.
export function patchSemente(atual, novos) {
  const at = atual && typeof atual === "object" && !Array.isArray(atual) ? atual : {};
  const dela = (v) => !v || typeof v !== "object" || !v.por || v.por === "semente";
  const p = {};
  for (const [k, v] of Object.entries(novos || {})) if (dela(at[k])) p[k] = v;
  for (const [k, v] of Object.entries(at)) if (!(k in (novos || {})) && dela(v)) p[k] = null;
  return Object.keys(p).length ? { atributos: p } : null;
}
export async function semearCloud(env, agora = Date.now()) {
  const marca = await lerDocD1(env, "_sistema", "cloud-semente");
  if (marca && marca.versao === SEMENTE_EM) return 0;
  const quando = agoraIso(agora);
  if (!marca) {
    const ins = (c, id, data) => env.DB.prepare("INSERT OR IGNORE INTO docs (collection, id, data, coletado, atualizado) VALUES (?, ?, ?, '', ?)").bind(c, id, JSON.stringify(data), quando);
    const ops = [ins("meta", "cloud-provedores", { provedores: PROVEDORES, atualizado: quando }), ins("meta", "cloud-categorias", { categorias: CATEGORIAS, atualizado: quando })];
    for (const s of SERVICOS) ops.push(ins("cloud", s.id, s.doc));
    for (let i = 0; i < ops.length; i += 50) await env.DB.batch(ops.slice(i, i + 50));
    await gravarSistema(env, "cloud-semente", { quando, versao: SEMENTE_EM, servicos: SERVICOS.length });
    return SERVICOS.length;
  }
  const { results } = await env.DB.prepare("SELECT id, data FROM docs WHERE collection = 'cloud'").all();
  const atuais = new Map((results || []).map((r) => [r.id, parse(r.data)]));
  const ops = [];
  for (const s of SERVICOS) {
    const d = atuais.get(s.id);
    if (!d) continue; // tirado pelo Admin: não volta
    const patch = patchSemente(d.atributos, s.doc.atributos);
    if (patch) ops.push(env.DB.prepare("UPDATE docs SET data = json_patch(data, ?), atualizado = ? WHERE collection = 'cloud' AND id = ?").bind(JSON.stringify(patch), quando, s.id));
  }
  for (let i = 0; i < ops.length; i += 50) await env.DB.batch(ops.slice(i, i + 50));
  await gravarSistema(env, "cloud-semente", { ...marca, quando, versao: SEMENTE_EM, anterior: marca.versao || marca.quando || null, atualizados: ops.length });
  return ops.length;
}

// ---------- leitura ----------
// Campos leves de todos, numa consulta (começa por "SELECT id, data FROM docs", que o espelho aceita)
export const SQL_LEVE = "SELECT id, data FROM docs WHERE 0 UNION ALL SELECT id, json_object('provedor', json_extract(data, '$.provedor'), 'nome', json_extract(data, '$.nome'), "
  + "'apelidos', json(json_extract(data, '$.apelidos')), 'categoria', json_extract(data, '$.categoria'), 'subcategoria', json_extract(data, '$.subcategoria'), "
  + "'resumo', json_extract(data, '$.resumo'), 'gratis', json_extract(data, '$.gratis'), 'uso', json(json_extract(data, '$.uso')), 'icone', json_extract(data, '$.icone'), "
  + "'conferido', json_extract(data, '$.conferido')) AS data FROM docs WHERE collection = 'cloud'";
export async function listaLeve(env, deps) {
  const linhas = await deps.lerLinhas(env, SQL_LEVE, [], "cloud");
  const out = [];
  for (const r of linhas || []) {
    const d = parse(r.data);
    if (!d || !A.ID_SERV.test(r.id)) continue;
    out.push({ id: r.id, provedor: d.provedor || "", nome: d.nome || "", apelidos: Array.isArray(d.apelidos) ? d.apelidos : [], categoria: d.categoria || "", subcategoria: d.subcategoria || "",
      resumo: d.resumo || "", gratis: d.gratis || "", uso: L.usoDe(d).length ? L.usoDe(d) : ["nuvem"], ...(d.icone ? { icone: d.icone } : {}), conferido: d.conferido || null });
  }
  out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
  return out;
}
async function lerMeta(env, deps, id, campo) {
  const r = await deps.lerLinha(env, "meta", id);
  const d = r ? parse(r.data) : null;
  return d && Array.isArray(d[campo]) ? d[campo] : [];
}
export const lerProvedores = (env, deps) => lerMeta(env, deps, "cloud-provedores", "provedores");
export const lerCategorias = (env, deps) => lerMeta(env, deps, "cloud-categorias", "categorias");
async function servicoCompleto(env, deps, id) {
  const r = await deps.lerLinha(env, "cloud", id);
  const d = r ? parse(r.data) : null;
  if (!d) return null;
  const { por, ...s } = d;
  return { id, ...s, uso: L.usoDe(s).length ? L.usoDe(s) : ["nuvem"] };
}

// Notícias e fóruns do Lookout que citam o serviço: o mesmo SELECT das citações do Landscape (quatro collections por
// consulta, para caber nos 5 termos do D1), com o filtro final de Arch.citaServico (nome genérico só com o provedor junto).
export async function citacoesServico(env, deps, serv, prov, { secoes = null, forum = false, agora = Date.now(), max = 10 } = {}) {
  const cols = (forum ? COLECOES_FORUM : COLECOES_ITENS).filter(([, s]) => secoes == null || secoes.includes(s)).map(([c]) => c);
  const termos = A.termosBusca(serv);
  if (!cols.length || !termos.length) return [];
  const corte = agoraIso(agora - (forum ? 7 : 120) * DIA);
  const linhas = [];
  for (let i = 0; i < cols.length; i += 4) {
    const { sql, args } = sqlCitacoes(cols.slice(i, i + 4), termos, corte);
    linhas.push(...((await deps.lerLinhas(env, sql, args, "cloud-citacoes")) || []));
  }
  const out = [];
  for (const r of linhas) {
    const d = parse(r.data);
    if (!d || !d.titulo || !d.url) continue;
    if (!A.citaServico(serv, prov, [d.titulo, d.resumo || "", d.titulo_pt || ""].join(" "))) continue;
    const c = String(r.id).slice(0, String(r.id).indexOf(":"));
    out.push(forum ? { titulo: String(d.titulo).slice(0, 200), url: d.url, sub: String(d.sub || "").slice(0, 60), publicado: d.publicado || d.coletado || null, ...(d.titulo_pt ? { titulo_pt: String(d.titulo_pt).slice(0, 200) } : {}) }
      : { titulo: String(d.titulo).slice(0, 200), url: d.url, fonte: String(d.fonte || "").slice(0, 80), resumo: L.trecho(d.resumo || "", 240), publicado: d.publicado || null, coletado: d.coletado || null,
        secao: (COLECOES_ITENS.find(([x]) => x === c) || [])[1] || "tech", ...(d.titulo_pt ? { titulo_pt: String(d.titulo_pt).slice(0, 200) } : {}) });
  }
  out.sort((a, b) => String(b.coletado || b.publicado || "").localeCompare(String(a.coletado || a.publicado || "")));
  return out.slice(0, max);
}

// ---------- novidades na hora ----------
// O feed do provedor, com cache de 12 h em _sistema/cloud-feed-<provedor>. Uma leitura externa por provedor a cada 12 h
// (contando a tentativa que falhou). Falha ou feed lento: o que estiver no cache, com a data; sem cache, só o link.
export async function feedConfirmado(env, prov) {
  if (!FEEDS_CLOUD[prov]) return false;
  const s = await lerDocD1(env, "_sistema", "cloud-feeds-sonda");
  return !!(s && s.porProvedor && s.porProvedor[prov] && s.porProvedor[prov].ok);
}
const enxuto = (itens) => itens.slice(0, FEED_MAX).map((i) => ({ titulo: String(i.titulo).slice(0, 240), url: String(i.url).slice(0, 400), publicado: i.publicado || null, ...(i.tipo ? { tipo: String(i.tipo).slice(0, 60) } : {}) }));
// <category> de cada item, quando o feed diz (AWS e Azure usam), para o "tipo"
function comTipo(xml, itens) {
  const blocos = String(xml).match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  const tipos = blocos.map((b) => { const m = b.match(/<category(?:\s[^>]*term="([^"]+)")?[^>]*>(?:<!\[CDATA\[)?([^<\]]*)/i); return m ? (m[1] || m[2] || "").trim() : ""; });
  return itens.map((i, k) => (tipos[k] ? { ...i, tipo: tipos[k].replace(/^.*[:/]/, "").slice(0, 60) } : i));
}
export async function lerFeedProvedor(env, prov, { agora = Date.now(), forcar = false } = {}) {
  const idCache = "cloud-feed-" + prov;
  const cache = await lerDocD1(env, "_sistema", idCache);
  const recente = cache && Number.isFinite(Date.parse(cache.tentado || "")) && agora - Date.parse(cache.tentado) < CACHE_FEED_MS;
  if (recente && !forcar) return { itens: cache.itens || [], lido: cache.lido || null, de: "cache", erro: cache.erro || "" };
  if (!forcar && !(await feedConfirmado(env, prov))) return { itens: cache ? cache.itens || [] : [], lido: cache ? cache.lido || null : null, de: cache ? "cache" : "sem-feed", semFeed: true };
  try {
    const r = await fetch(FEEDS_CLOUD[prov], { headers: { "user-agent": UA, accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5" }, signal: AbortSignal.timeout(TIMEOUT_FEED) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const xml = (await r.text()).slice(0, 3_000_000);
    const itens = enxuto(comTipo(xml, lerFeed(xml)).sort((a, b) => String(b.publicado || "").localeCompare(String(a.publicado || ""))));
    if (!itens.length) throw new Error("feed sem itens");
    await gravarSistema(env, idCache, { lido: agoraIso(agora), tentado: agoraIso(agora), itens });
    return { itens, lido: agoraIso(agora), de: "rede", status: r.status };
  } catch (e) {
    const erro = String((e && e.message) || e).slice(0, 120);
    await gravarSistema(env, idCache, { lido: cache ? cache.lido || null : null, tentado: agoraIso(agora), itens: cache ? cache.itens || [] : [], erro });
    return { itens: cache ? cache.itens || [] : [], lido: cache ? cache.lido || null : null, de: cache && cache.itens && cache.itens.length ? "cache" : "falhou", erro };
  }
}
// Novidades e "o que vem por aí" de um serviço: do feed (com a regra de anúncio) e o roteiro que o Admin escreveu
function blocoNovidades(serv, prov, feed) {
  const itens = A.novidadesDoServico(feed.itens, serv, prov, 15);
  const vem = itens.filter((i) => i.anuncio).map((i) => ({ titulo: i.titulo, estado: i.anuncio, quando: "", fonte: i.url, em: i.publicado }));
  const manual = (Array.isArray(serv.roteiro) ? serv.roteiro : []).map((r) => ({ ...r, manual: true }));
  return { itens, roteiro: [...manual, ...vem].slice(0, 10), lido: feed.lido, de: feed.de, link: (prov && (prov.novidades || prov.site)) || "", temFeed: !feed.semFeed };
}

// ---------- rotas ----------
// GET /api/cloud, /api/cloud/<id>, /api/cloud/<id>/novidades, /api/cloud/novidades?ids=, /api/cloud/comparar?ids=,
// GET e PUT /api/cloud/<id>/notas (da própria pessoa). quem.secoes já foi conferido (Tech) por quem chama.
export async function rotaCloud(request, env, quem, resto, deps, { agora = Date.now() } = {}) {
  const [id, sub, ...mais] = String(resto || "").split("/");
  if (mais.length) return json({ erro: "rota" }, 404);
  const url = new URL(request.url);
  if (!id) {
    if (request.method !== "GET") return json({ erro: "metodo" }, 405);
    const [servicos, provedores, categorias] = await Promise.all([listaLeve(env, deps), lerProvedores(env, deps), lerCategorias(env, deps)]);
    return json({ servicos, provedores, categorias, admin: !!quem.admin });
  }
  if (id === "comparar" || id === "novidades") {
    if (request.method !== "GET" || sub) return json({ erro: "rota" }, 404);
    const ids = String(url.searchParams.get("ids") || "").split(",").filter(Boolean).slice(0, 8);
    const [lista, provedores] = await Promise.all([listaLeve(env, deps), lerProvedores(env, deps)]);
    const pode = A.podeComparar(ids, lista);
    if (!pode.pode) return json({ erro: pode.motivo, motivo: pode.motivo }, 400);
    if (id === "comparar") {
      const servicos = (await Promise.all(ids.map((x) => servicoCompleto(env, deps, x)))).filter(Boolean);
      return json({ servicos, provedores, categorias: await lerCategorias(env, deps), admin: !!quem.admin });
    }
    // no máximo 4 leituras externas por pedido de comparação: uma por provedor, e são no máximo 4 serviços
    const servicos = (await Promise.all(ids.map((x) => servicoCompleto(env, deps, x)))).filter(Boolean);
    const feeds = new Map();
    for (const s of servicos) if (!feeds.has(s.provedor)) feeds.set(s.provedor, await lerFeedProvedor(env, s.provedor, { agora }));
    const porId = {};
    for (const s of servicos) porId[s.id] = blocoNovidades(s, A.provDe(provedores, s.provedor), feeds.get(s.provedor));
    return json({ porId });
  }
  if (!A.ID_SERV.test(id) || id.length > 160) return json({ erro: "id" }, 400);
  if (sub === "notas") return rotaNotas(request, env, quem, id, deps);
  if (request.method !== "GET") return json({ erro: "metodo" }, 405);
  const serv = await servicoCompleto(env, deps, id);
  if (!serv) return json({ erro: "nao-encontrado" }, 404);
  const provedores = await lerProvedores(env, deps);
  const prov = A.provDe(provedores, serv.provedor);
  if (sub === "novidades") return json({ id, ...blocoNovidades(serv, prov, await lerFeedProvedor(env, serv.provedor, { agora })) });
  if (sub) return json({ erro: "rota" }, 404);
  const secoes = quem.secoes ?? null;
  const [lista, categorias, noticias, foruns] = await Promise.all([listaLeve(env, deps), lerCategorias(env, deps),
    citacoesServico(env, deps, serv, prov, { secoes, agora }).catch(() => []), citacoesServico(env, deps, serv, prov, { secoes, forum: true, agora }).catch(() => [])]);
  return json({ id, servico: serv, provedor: prov, equivalentes: A.equivalentes(serv, lista, provedores), noticias, foruns, categorias, provedores, admin: !!quem.admin });
}

async function rotaNotas(request, env, quem, id, deps) {
  const col = "cloud-notas/" + quem.email;
  if (request.method === "GET") {
    const linhas = await deps.lerLinhas(env, "SELECT id, data FROM docs WHERE collection = ? AND id = ?", [col, "notas"], "cloud-notas");
    const d = linhas && linhas[0] ? parse(linhas[0].data) : null;
    return json({ notas: (d && d.porId && d.porId[id]) || null });
  }
  if (request.method !== "PUT") return json({ erro: "metodo" }, 405);
  const corpo = await request.text();
  if (corpo.length > L.CORPO_MAX) return json({ erro: "grande" }, 413);
  const b = parse(corpo);
  const v = L.validarNotas(b);
  if (v.erro) return json({ erro: v.erro === "corpo" ? "corpo" : v.erro }, 400);
  const quando = agoraIso();
  const d = (await lerDocD1(env, col, "notas")) || { porId: {} };
  const porId = d.porId && typeof d.porId === "object" ? { ...d.porId } : {};
  if (!v.notas.situacao && !v.notas.nota && !v.notas.link) delete porId[id];
  else porId[id] = { ...v.notas, atualizado: quando };
  const data = JSON.stringify({ porId, atualizado: quando });
  await env.DB.prepare("INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES (?, 'notas', ?, '', ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = excluded.atualizado").bind(col, data, quando).run();
  deps.gravarNoEspelho(env, [{ collection: col, id: "notas", data, coletado: "", atualizado: quando }]);
  return json({ ok: true, notas: porId[id] || null });
}

// ---------- admin ----------
const lerCorpo = async (request) => {
  const corpo = await request.text();
  if (corpo.length > CORPO_MAX) return { erro: json({ erro: "grande" }, 413) };
  const b = parse(corpo);
  if (!b || typeof b !== "object" || Array.isArray(b)) return { erro: json({ erro: "corpo" }, 400) };
  return { b };
};
async function gravarMeta(env, deps, id, data, quando) {
  const s = JSON.stringify(data);
  await env.DB.prepare("INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES ('meta', ?, ?, '', ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = excluded.atualizado").bind(id, s, quando).run();
  deps.gravarNoEspelho(env, [{ collection: "meta", id, data: s, coletado: "", atualizado: quando }]);
}
const metaD1 = async (env, id, campo) => { const d = await lerDocD1(env, "meta", id); return d && Array.isArray(d[campo]) ? d[campo] : []; };

// /api/admin/cloud (GET estado, POST adiciona), /api/admin/cloud/<id> (PUT edita, DELETE tira), /api/admin/cloud-provedores
// (PUT), /api/admin/cloud-categorias (PUT), /api/admin/cloud-sonda (POST). Só o Admin: os outros recebem 404.
export async function rotaAdminCloud(request, env, quem, alvo, id, deps, { agora = Date.now() } = {}) {
  if (!quem || !quem.admin) return json({ erro: "rota" }, 404);
  const quando = agoraIso(agora);
  if (alvo === "provedores" || alvo === "categorias") {
    if (request.method !== "PUT") return json({ erro: "metodo" }, 405);
    const { b, erro } = await lerCorpo(request);
    if (erro) return erro;
    const v = alvo === "provedores" ? A.validarProvedores(b) : A.validarCategorias(b);
    if (v.erro) return json({ erro: v.erro }, 400);
    // provedor ou subcategoria com serviço dentro não sai
    const { results } = await env.DB.prepare("SELECT id, json_extract(data, '$.provedor') AS p, json_extract(data, '$.categoria') AS c, json_extract(data, '$.subcategoria') AS s, json_extract(data, '$.nome') AS nome FROM docs WHERE collection = 'cloud'").all();
    for (const s of results || []) {
      if (alvo === "provedores" && !v.provedores.some((p) => p.id === s.p)) return json({ erro: `Ainda há serviço desse provedor (${s.nome || s.id}). Tire antes.` }, 409);
      if (alvo === "categorias" && !v.categorias.some((c) => c.id === s.c && c.subcategorias.some((x) => x.id === s.s))) return json({ erro: `Ainda há serviço nessa subcategoria (${s.nome || s.id}). Mova antes de tirar.` }, 409);
    }
    await gravarMeta(env, deps, alvo === "provedores" ? "cloud-provedores" : "cloud-categorias", { [alvo]: v[alvo], atualizado: quando }, quando);
    return json({ ok: true, [alvo]: v[alvo] });
  }
  if (alvo === "sonda") {
    if (request.method !== "POST") return json({ erro: "metodo" }, 405);
    const porProvedor = {};
    for (const p of CLOUD_PARA_SONDAR) {
      const r = await lerFeedProvedor(env, p, { agora, forcar: true });
      porProvedor[p] = { ok: r.de === "rede" && r.itens.length > 0, itens: r.itens.length, erro: r.erro || "", url: FEEDS_CLOUD[p], quando };
    }
    await gravarSistema(env, "cloud-feeds-sonda", { quando, porProvedor });
    return json({ ok: true, porProvedor });
  }
  const ctx = { provedores: await metaD1(env, "cloud-provedores", "provedores"), categorias: await metaD1(env, "cloud-categorias", "categorias"), agora, por: "admin" };
  if (!id) {
    if (request.method === "GET") {
      const { results } = await env.DB.prepare("SELECT count(*) AS n FROM docs WHERE collection = 'cloud'").all();
      const sonda = await lerDocD1(env, "_sistema", "cloud-feeds-sonda");
      return json({ total: Number((results && results[0] && results[0].n) || 0), feeds: FEEDS_CLOUD, paraSondar: CLOUD_PARA_SONDAR, sonda });
    }
    if (request.method !== "POST") return json({ erro: "metodo" }, 405);
    const { b, erro } = await lerCorpo(request);
    if (erro) return erro;
    const v = A.validarServico(b, ctx);
    if (v.erro) return json({ erro: v.erro }, 400);
    const novoId = A.idServico(v.servico.provedor, v.servico.nome);
    if (!A.ID_SERV.test(novoId)) return json({ erro: "Nome que não vira id: use letras e números." }, 400);
    if (await lerDocD1(env, "cloud", novoId)) return json({ erro: "Esse serviço já está no catálogo." }, 409);
    const doc = { ...v.servico, conferido: b.conferirHoje ? quando : v.servico.conferido, adicionado: quando, por: "admin", atualizado: quando };
    const data = JSON.stringify(doc);
    await env.DB.prepare("INSERT OR IGNORE INTO docs (collection, id, data, coletado, atualizado) VALUES ('cloud', ?, ?, '', ?)").bind(novoId, data, quando).run();
    deps.gravarNoEspelho(env, [{ collection: "cloud", id: novoId, data, coletado: "", atualizado: quando }]);
    return json({ ok: true, id: novoId, servico: doc });
  }
  if (!A.ID_SERV.test(id) || id.length > 160) return json({ erro: "id" }, 400);
  const atual = await lerDocD1(env, "cloud", id);
  if (!atual) return json({ erro: "nao-encontrado" }, 404);
  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM docs WHERE collection = 'cloud' AND id = ?").bind(id).run();
    deps.removerDoEspelho(env, [{ collection: "cloud", id }]);
    return json({ ok: true });
  }
  if (request.method !== "PUT") return json({ erro: "metodo" }, 405);
  const { b, erro } = await lerCorpo(request);
  if (erro) return erro;
  // edição: o doc como está, com os campos que vieram por cima, validado inteiro; provedor e nome não mudam (são o id)
  const junto = { ...atual, ...b, provedor: atual.provedor, nome: b.nome !== undefined ? b.nome : atual.nome };
  if (b.atributos && typeof b.atributos === "object" && !Array.isArray(b.atributos)) junto.atributos = { ...(atual.atributos || {}), ...b.atributos };
  // chave que saiu da tabela (doc antigo) não trava a edição
  junto.atributos = A.soConhecidas(junto.atributos, junto.subcategoria);
  if (junto.atributos) for (const [k, x] of Object.entries(junto.atributos)) if (x == null || x === "" || (x && typeof x === "object" && (x.valor == null || x.valor === ""))) delete junto.atributos[k];
  const v = A.validarServico(junto, ctx);
  if (v.erro) return json({ erro: v.erro }, 400);
  const doc = { ...v.servico, conferido: b.conferirHoje ? quando : v.servico.conferido, adicionado: atual.adicionado || quando, por: atual.por || "admin", atualizado: quando };
  const data = JSON.stringify(doc);
  await env.DB.prepare("UPDATE docs SET data = ?, atualizado = ? WHERE collection = 'cloud' AND id = ?").bind(data, quando, id).run();
  deps.gravarNoEspelho(env, [{ collection: "cloud", id, data, coletado: "", atualizado: quando }]);
  return json({ ok: true, id, servico: doc });
}
