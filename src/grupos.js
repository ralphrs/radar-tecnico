import { convidadoNoEspelho } from "./espelho.js";

// Seções por grupo. O admin cria grupos (Família, Trabalho...) com as seções que cada um vê, e põe
// cada convidado em um ou mais grupos. A pessoa vê a soma das seções dos seus grupos.
//
// Regras:
// - Sem nenhum grupo criado, todo convidado vê tudo (é o comportamento de antes).
// - Convidado sem grupo cai nos grupos marcados como padrão; se não houver padrão, vê tudo.
// - O admin vê tudo, sempre.
// - O bloqueio vale no servidor: a API recusa listas e documentos de seção não liberada.

export const SECOES = ["tech", "negocios", "investimentos", "politica", "esportes"];

// Collection ou documento de meta -> seção. O que não estiver aqui não é lido por convidado.
const SECAO_DA_COLECAO = {
  items: "tech", destaques: "tech",
  "items-negocios": "negocios", "destaques-negocios": "negocios",
  "items-investimentos": "investimentos", "destaques-investimentos": "investimentos",
  "items-politica": "politica", "destaques-politica": "politica",
  "items-esportes": "esportes", "destaques-esportes": "esportes",
};
const SECAO_DO_META = {
  status: "tech", "status-negocios": "negocios", "status-investimentos": "investimentos", "status-politica": "politica", "status-esportes": "esportes",
  mercado: "investimentos", b3: "investimentos", fii: "investimentos", "fii-resumo": "investimentos", eua: "investimentos",
};
export const secaoDe = (c, id) => (c === "meta" ? SECAO_DO_META[id] : SECAO_DA_COLECAO[c]);

export const ESQUEMA = [
  "CREATE TABLE IF NOT EXISTS grupos (id TEXT PRIMARY KEY, nome TEXT NOT NULL, secoes TEXT NOT NULL DEFAULT '[]', padrao INTEGER NOT NULL DEFAULT 0, criado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
  "CREATE TABLE IF NOT EXISTS usuario_grupo (email TEXT NOT NULL, grupo TEXT NOT NULL, PRIMARY KEY (email, grupo))",
];

// Cache por 60 s, como a lista de convidados: quem perde uma seção deixa de ver em no máximo 1 minuto.
const cache = new Map();
const TTL = 60_000;
export const limparCacheGrupos = () => cache.clear();

// A regra das seções, sem banco: recebe todos os grupos ({ id, secoes, padrao }) e os ids dos grupos da pessoa.
// Usada aqui (leitura no D1) e no espelho de São Paulo (src/espelho.js), para as duas pontas darem o mesmo resultado.
export function calcularSecoes(grupos, meusIds) {
  if (!grupos.length) return null;
  const ids = new Set(meusIds);
  let valem = grupos.filter((g) => ids.has(g.id));
  if (!valem.length) valem = grupos.filter((g) => g.padrao);
  if (!valem.length) return null;
  const u = new Set();
  for (const g of valem) for (const x of JSON.parse(g.secoes || "[]")) if (SECOES.includes(x)) u.add(x);
  return SECOES.filter((x) => u.has(x));
}

function guardar(email, s) {
  if (cache.size > 500) cache.clear();
  cache.set(email, { s, em: Date.now() });
}
// O index.js já recebe as seções junto com o convidado quando lê do espelho; guarda aqui para não perguntar de novo.
export const guardarSecoes = guardar;

// Devolve a lista de seções liberadas, ou null quando a pessoa vê tudo.
// Primeiro o espelho; se ele não responder (desligado, vazio, lento), o D1 como antes.
export async function secoesDe(env, email, admin) {
  if (admin) return null;
  const c = cache.get(email);
  if (c && Date.now() - c.em < TTL) return c.s;
  const doEspelho = await convidadoNoEspelho(env, email);
  if (doEspelho) { guardar(email, doEspelho.secoes); return doEspelho.secoes; }
  let s = null;
  try {
    const { results: grupos } = await env.DB.prepare("SELECT id, secoes, padrao FROM grupos").all();
    if (grupos.length) {
      const { results: meus } = await env.DB.prepare("SELECT grupo FROM usuario_grupo WHERE email = ?").bind(email).all();
      s = calcularSecoes(grupos, meus.map((m) => m.grupo));
    }
  } catch (e) {
    // Tabela ainda não criada: comportamento antigo.
    s = null;
  }
  guardar(email, s);
  return s;
}

export const libera = (secoes, secao) => !!secao && (secoes === null || secoes.includes(secao));

const slug = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function garantirEsquema(env) {
  for (const sql of ESQUEMA) await env.DB.prepare(sql).run();
}

// /api/admin/grupos e /api/admin/grupos/<id>
export async function adminGrupos(request, env, id) {
  await garantirEsquema(env);
  // Ids nascem de slug(nome); qualquer outra coisa no caminho é recusada (não cria grupo com id arbitrário).
  if (id && !/^[a-z0-9-]{1,40}$/.test(id)) return json({ erro: "id" }, 400);
  if (request.method === "GET" && !id) {
    const [{ results: grupos }, { results: membros }] = await Promise.all([
      env.DB.prepare("SELECT id, nome, secoes, padrao FROM grupos ORDER BY criado").all(),
      env.DB.prepare("SELECT email, grupo FROM usuario_grupo").all(),
    ]);
    return json({ secoes: SECOES, grupos: grupos.map((g) => ({ ...g, secoes: JSON.parse(g.secoes || "[]"), padrao: !!g.padrao })), membros });
  }
  if (request.method === "POST" || request.method === "PUT") {
    let b;
    try { b = await request.json(); } catch { return json({ erro: "json" }, 400); }
    const nome = String(b.nome || "").trim().slice(0, 40);
    if (!nome) return json({ erro: "Dê um nome ao grupo." }, 400);
    const gid = id || slug(nome) || "grupo";
    const secoes = (Array.isArray(b.secoes) ? b.secoes : []).filter((x) => SECOES.includes(x));
    if (request.method === "POST" && !id && (await env.DB.prepare("SELECT 1 FROM grupos WHERE id = ?").bind(gid).first())) return json({ erro: "Já existe um grupo com esse nome." }, 409);
    await env.DB.prepare("INSERT INTO grupos (id, nome, secoes, padrao) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET nome = excluded.nome, secoes = excluded.secoes, padrao = excluded.padrao")
      .bind(gid, nome, JSON.stringify(secoes), b.padrao ? 1 : 0).run();
    limparCacheGrupos();
    return json({ ok: true, id: gid });
  }
  if (request.method === "DELETE" && id) {
    await env.DB.prepare("DELETE FROM usuario_grupo WHERE grupo = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM grupos WHERE id = ?").bind(id).run();
    limparCacheGrupos();
    return json({ ok: true });
  }
  return json({ erro: "metodo" }, 405);
}

// PUT /api/admin/membros/<email> { grupos: [ids] }: troca os grupos de um convidado.
export async function adminMembro(request, env, email) {
  await garantirEsquema(env);
  if (request.method !== "PUT" || !email) return json({ erro: "metodo" }, 405);
  if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ erro: "E-mail inválido." }, 400);
  let b;
  try { b = await request.json(); } catch { return json({ erro: "json" }, 400); }
  const e = email.toLowerCase();
  const { results } = await env.DB.prepare("SELECT id FROM grupos").all();
  const validos = new Set(results.map((g) => g.id));
  const ids = [...new Set((Array.isArray(b.grupos) ? b.grupos : []).filter((g) => validos.has(g)))];
  const ops = [env.DB.prepare("DELETE FROM usuario_grupo WHERE email = ?").bind(e)];
  for (const g of ids) ops.push(env.DB.prepare("INSERT INTO usuario_grupo (email, grupo) VALUES (?, ?)").bind(e, g));
  await env.DB.batch(ops);
  limparCacheGrupos();
  return json({ ok: true, grupos: ids });
}
