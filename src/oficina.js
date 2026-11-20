// Radar de Oficina (pedido de 19/11): abas Ferramentas, Insumos e Madeiras. A aba Conteúdos é a máquina dos outros
// radares (items-oficina, destaques-oficina, meta/status-oficina; src/coleta.js, src/curadoria.js).
//
// Regras puras em public/oficina.js (globalThis.Oficina): esquema dos campos, validação, preços por loja, notas das
// madeiras, filtros e hash. Aqui: semente, rotas públicas (seção oficina) e de Admin, e as consultas do contrato da
// tarefa de levantamento (exportadas e testadas no D1 falso).
//
// Banco (D1, com espelho):
// - oficina-ferramentas/<id>, oficina-insumos/<id>, oficina-madeiras/<id> (id em kebab-case sem acento)
// - meta/oficina-categorias e meta/oficina-insumos-categorias { categorias, atualizado }
// - _sistema/oficina-semente: marca da semente ({ quando, versao, ... })
// Regras: nunca DROP; UPDATE e DELETE só com a chave explícita; coletas, curadorias, tradução e limpeza não tocam aqui.
import "../public/oficina.js";
import "../public/oficina-icones.js";
import { SEMENTE_VERSAO, CATEGORIAS_FERRAMENTAS, FERRAMENTAS, CATEGORIAS_INSUMOS, INSUMOS, MADEIRAS } from "./oficina-semente.js";

const O = globalThis.Oficina;
const DIA = 86_400_000;
const KINDS = ["ferramentas", "insumos", "madeiras"];
const agoraIso = (t = Date.now()) => new Date(t).toISOString();
const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };

// ---------- contrato da tarefa de levantamento (docs/LOOKOUT.md, "Radar de Oficina") ----------
// As mesmas três consultas para as três collections; a tarefa troca só o nome da collection. Ordem: primeiro os que
// faltam (essencial, intermediária, avançada; madeiras e insumos não têm nível e vêm pelo id), depois os de preço
// vencido (nunca pesquisado primeiro, depois o mais antigo). O fechamento grava as datas pelo relógio do banco: o
// patch traz "detalhesEm": true e/ou "precosEm": true (qualquer valor não nulo) e o SQL troca pela hora do D1, a
// mesma solução de relogioDoBanco em src/arch.js; quem não vem no patch fica como estava.
const colOk = (c) => { if (!Object.values(O.COLECAO).includes(c)) throw new Error("collection fora da Oficina: " + c); return c; };
export const sqlFaltam = (c = "oficina-ferramentas") => `SELECT id, data FROM docs WHERE collection = '${colOk(c)}' AND json_extract(data, '$.detalhesEm') IS NULL ORDER BY CASE json_extract(data, '$.nivel') WHEN 'essencial' THEN 0 WHEN 'intermediaria' THEN 1 ELSE 2 END, id LIMIT ?`;
export const sqlPrecoVencido = (c = "oficina-ferramentas") => `SELECT id, data FROM docs WHERE collection = '${colOk(c)}' AND (json_extract(data, '$.precosEm') IS NULL OR json_extract(data, '$.precosEm') < ?) ORDER BY json_extract(data, '$.precosEm') LIMIT ?`;
const AGORA_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
export const sqlFechar = (c = "oficina-ferramentas") => `UPDATE docs SET data = json_set(json_patch(data, ?1), `
  + `'$.detalhesEm', CASE WHEN json_extract(?1, '$.detalhesEm') IS NOT NULL THEN ${AGORA_SQL} ELSE json_extract(data, '$.detalhesEm') END, `
  + `'$.precosEm', CASE WHEN json_extract(?1, '$.precosEm') IS NOT NULL THEN ${AGORA_SQL} ELSE json_extract(data, '$.precosEm') END), `
  + `atualizado = ${AGORA_SQL} WHERE collection = '${colOk(c)}' AND id = ?2`;
// o corte do "preço vencido" (a tarefa pesquisa uma vez por semana)
export const corteVencido = (agora = Date.now()) => agoraIso(agora - O.PRECO_VENCE_DIAS * DIA);

// ---------- semente ----------
const semDesde = ({ desde, ...d }) => d;
export async function semearOficina(env, agora = Date.now()) {
  const r = await env.DB.prepare("SELECT data FROM docs WHERE collection = '_sistema' AND id = 'oficina-semente'").first();
  const marca = r ? parse(r.data) : null;
  if (marca && Number(marca.versao) >= SEMENTE_VERSAO) return 0;
  const quando = agoraIso(agora);
  const desde = marca ? Number(marca.versao) || 0 : 0;
  const ins = (c, id, data) => env.DB.prepare("INSERT OR IGNORE INTO docs (collection, id, data, coletado, atualizado) VALUES (?, ?, ?, '', ?)").bind(c, id, JSON.stringify(data), quando);
  const ops = [];
  const novos = (l) => l.filter((x) => (x.doc.desde || 1) > desde);
  for (const x of novos(FERRAMENTAS)) ops.push(ins(O.COLECAO.ferramentas, x.id, { ...semDesde(x.doc), adicionado: quando, atualizado: quando }));
  for (const x of novos(INSUMOS)) ops.push(ins(O.COLECAO.insumos, x.id, { ...semDesde(x.doc), adicionado: quando, atualizado: quando }));
  for (const x of novos(MADEIRAS)) ops.push(ins(O.COLECAO.madeiras, x.id, { ...semDesde(x.doc), adicionado: quando, atualizado: quando }));
  if (!marca) {
    ops.push(ins("meta", O.META_CATS.ferramentas, { categorias: CATEGORIAS_FERRAMENTAS, atualizado: quando }));
    ops.push(ins("meta", O.META_CATS.insumos, { categorias: CATEGORIAS_INSUMOS, atualizado: quando }));
  }
  for (let i = 0; i < ops.length; i += 50) await env.DB.batch(ops.slice(i, i + 50));
  // versão nova: categorias e subcategorias que faltam entram no fim; o que o Admin renomeou ou reordenou fica
  if (marca) for (const [k, cats] of [["ferramentas", CATEGORIAS_FERRAMENTAS], ["insumos", CATEGORIAS_INSUMOS]]) {
    const m = await env.DB.prepare("SELECT data FROM docs WHERE collection = 'meta' AND id = ?").bind(O.META_CATS[k]).first();
    const atual = (m && parse(m.data) && parse(m.data).categorias) || [];
    const junto = juntarCategorias(atual, cats);
    if (JSON.stringify(junto) !== JSON.stringify(atual)) await gravarMeta(env, O.META_CATS[k], { categorias: junto, atualizado: quando });
  }
  await env.DB.prepare(
    "INSERT INTO docs (collection, id, data) VALUES ('_sistema', 'oficina-semente', ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
  ).bind(JSON.stringify({ quando, versao: SEMENTE_VERSAO, anterior: marca ? marca.versao : null, ferramentas: FERRAMENTAS.length, insumos: INSUMOS.length, madeiras: MADEIRAS.length })).run();
  return ops.length;
}
export function juntarCategorias(atual, semente) {
  const out = (atual || []).map((c) => ({ ...c, subcategorias: (c.subcategorias || []).slice() }));
  for (const c of semente) {
    const a = out.find((x) => x.id === c.id);
    if (!a) { out.push(c); continue; }
    for (const s of c.subcategorias) if (!a.subcategorias.some((x) => x.id === s.id)) a.subcategorias.push(s);
  }
  return out;
}
async function gravarMeta(env, id, data, deps) {
  const txt = JSON.stringify(data), at = data.atualizado || agoraIso();
  await env.DB.prepare("INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES ('meta', ?, ?, '', ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = excluded.atualizado")
    .bind(id, txt, at).run();
  if (deps && deps.gravarNoEspelho) deps.gravarNoEspelho(env, [{ collection: "meta", id, data: txt, coletado: "", atualizado: at }]);
}

// ---------- leitura ----------
// Campos leves numa consulta só (começa por "SELECT id, data FROM docs", que o espelho aceita)
const CAMPOS_LEVES = {
  ferramentas: ["nome", "categoria", "subcategoria", "tipo", "nivel", "icone", "detalhesEm", "precosEm"],
  insumos: ["nome", "categoria", "subcategoria", "icone", "unidade", "detalhesEm", "precosEm"],
  madeiras: ["nome", "nomeCientifico", "familia", "grupo", "tipo", "origemNota", "legalidade", "detalhesEm"],
};
const JSONS_LEVES = {
  ferramentas: ["apelidos", "oficios", "precos"],
  insumos: ["apelidos", "oficios", "precos"],
  madeiras: ["nomesPopulares", "origem", "dureza", "durabilidade", "raridade", "preco", "densidade"],
};
export function sqlLeve(kind, extra = "") {
  const campos = [...CAMPOS_LEVES[kind].map((k) => `'${k}', json_extract(data, '$.${k}')`), ...JSONS_LEVES[kind].map((k) => `'${k}', json(json_extract(data, '$.${k}'))`),
    `'nf', json_array_length(json_extract(data, '$.fontes'))`];
  return `SELECT id, data FROM docs WHERE 0 UNION ALL SELECT id, json_object(${campos.join(", ")}) AS data FROM docs WHERE collection = '${O.COLECAO[kind]}'${extra}`;
}
const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
const precosLimpos = (p) => { const x = O.validarCampo(O.CAMPOS.ferramentas.find((c) => c.k === "precos"), p, {}); return x.erro ? {} : x.v || {}; };
function leveDe(kind, id, d) {
  if (!d || !O.ID_OK.test(id)) return null;
  const base = { id, nome: typeof d.nome === "string" ? d.nome : id, detalhesEm: O.isoOk(d.detalhesEm) ? d.detalhesEm : null };
  if (kind === "madeiras") {
    const m = { ...base, nomesPopulares: arr(d.nomesPopulares), nomeCientifico: d.nomeCientifico || "", familia: d.familia || "", grupo: d.grupo || "", tipo: d.tipo || "",
      origem: arr(d.origem).filter((x) => /^[A-Z]{2}$/.test(x)), origemNota: d.origemNota || "", dureza: d.dureza || null, durabilidade: d.durabilidade || null,
      raridade: d.raridade || null, preco: d.preco || null, legalidade: d.legalidade || "" };
    const notas = O.notasDe(m);
    const densidade = d.densidade && typeof d.densidade.valor === "number" ? d.densidade.valor : null;
    return { id, nome: m.nome, nomesPopulares: m.nomesPopulares, nomeCientifico: m.nomeCientifico, familia: m.familia, grupo: m.grupo, tipo: m.tipo, origem: m.origem,
      origemNota: m.origemNota, notas, densidade, protegida: O.protegida(m), detalhesEm: m.detalhesEm, temDetalhes: !!(m.detalhesEm || d.nf) };
  }
  const precos = precosLimpos(d.precos);
  const l = { ...base, apelidos: arr(d.apelidos), categoria: d.categoria || "", subcategoria: d.subcategoria || "", oficios: arr(d.oficios), icone: d.icone || "",
    precosEm: O.isoOk(d.precosEm) ? d.precosEm : null, preco: O.resumoPreco(precos, d.precosEm), temDetalhes: !!(base.detalhesEm || d.nf) };
  if (kind === "ferramentas") { l.tipo = d.tipo || ""; l.nivel = d.nivel || ""; } else l.unidade = d.unidade || "";
  return l;
}
export async function listaLeve(env, kind, deps, extra = "", args = []) {
  const linhas = await deps.lerLinhas(env, sqlLeve(kind, extra), args, "oficina");
  const out = [];
  for (const r of linhas || []) { const x = leveDe(kind, r.id, parse(r.data)); if (x) out.push(x); }
  out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base", numeric: true }));
  return out;
}
export async function lerCategorias(env, kind, deps) {
  if (kind === "madeiras") return [];
  const r = await deps.lerLinha(env, "meta", O.META_CATS[kind]);
  const d = r ? parse(r.data) : null;
  return d && Array.isArray(d.categorias) ? d.categorias : [];
}
// Doc completo com cada campo conferido pelo esquema (a tarefa grava direto no banco: o site nunca confia). Campo que
// não passa sai da resposta (e a tela mostra "Ainda não levantado").
export function saneado(kind, d) {
  const out = {};
  for (const c of O.CAMPOS[kind]) {
    if (!(c.k in d)) continue;
    const x = O.validarCampo({ ...c, obrigatorio: false }, d[c.k], { parcial: true });
    if (!x.erro && x.v !== null) out[c.k] = x.v;
  }
  for (const k of ["detalhesEm", "precosEm", "adicionado", "atualizado"]) if (O.isoOk(d[k])) out[k] = d[k];
  if (d.por === "semente" || d.por === "admin" || d.por === "ia") out.por = d.por;
  return out;
}
// estado do levantamento (Admin): quantas com detalhes, com preço em dia, vencido e nunca pesquisado
export function estadoLevantamento(kind, lista, agora = Date.now()) {
  const corte = corteVencido(agora);
  const e = { total: lista.length, comDetalhes: lista.filter((x) => x.temDetalhes).length };
  if (kind === "madeiras") {
    e.comNotas = lista.filter((x) => Object.values(x.notas || {}).some((n) => n && n.nota)).length;
    return e;
  }
  e.precoEmDia = lista.filter((x) => x.precosEm && x.precosEm >= corte).length;
  e.precoVencido = lista.filter((x) => x.precosEm && x.precosEm < corte).length;
  e.semPreco = lista.filter((x) => !x.precosEm).length;
  return e;
}

// ---------- rotas públicas: /api/oficina/<kind>[/<id>] ----------
export async function rotaOficina(request, env, quem, resto, deps) {
  if (request.method !== "GET") return json({ erro: "metodo" }, 405);
  const [kind, id, ...mais] = String(resto || "").split("/");
  if (!KINDS.includes(kind) || mais.length) return json({ erro: "rota" }, 404);
  const categorias = await lerCategorias(env, kind, deps);
  if (!id) {
    const itens = await listaLeve(env, kind, deps);
    return json({ itens, categorias, admin: !!quem.admin, ...(quem.admin ? { estado: estadoLevantamento(kind, itens) } : {}) });
  }
  if (!O.ID_OK.test(id) || id.length > O.ID_MAX) return json({ erro: "Endereço inválido." }, 400);
  const r = await deps.lerLinha(env, O.COLECAO[kind], id);
  const d = r ? parse(r.data) : null;
  if (!d) return json({ erro: "Não encontrado." }, 404);
  const item = { id, ...saneado(kind, d) };
  let parecidas = [], alternativas = [];
  if (kind === "madeiras") {
    const ids = (item.alternativas || []).filter((x) => x !== id).slice(0, 10);
    if (ids.length) alternativas = await listaLeve(env, kind, deps, ` AND id IN (${ids.map(() => "?").join(", ")})`, ids);
    item.notas = O.notasDe(item);
    item.protegida = O.protegida(item);
  } else if (item.subcategoria) {
    parecidas = (await listaLeve(env, kind, deps, " AND json_extract(data, '$.subcategoria') = ? AND json_extract(data, '$.categoria') = ?", [item.subcategoria, item.categoria || ""])).filter((x) => x.id !== id).slice(0, 12);
  }
  return json({ item, categorias, parecidas, alternativas, admin: !!quem.admin });
}

// ---------- Admin: /api/admin/oficina/<kind>[/<id>], /api/admin/oficina/categorias e /insumos-categorias ----------
async function lerCorpo(request) {
  const txt = await request.text();
  if (txt.length > O.CORPO_MAX) return { erro: json({ erro: "Corpo grande demais." }, 413) };
  const b = parse(txt);
  if (!b || typeof b !== "object" || Array.isArray(b)) return { erro: json({ erro: "Corpo inválido." }, 400) };
  return { b };
}
const temAlgo = (kind, doc) => O.DETALHES[kind].some((k) => k in doc && !O.vazio(doc[k]) && k !== "precos");
export async function rotaAdminOficina(request, env, quem, resto, deps) {
  if (!quem || !quem.admin) return json({ erro: "rota" }, 404);
  const partes = String(resto || "").split("/");
  // categorias
  if (partes[0] === "categorias" || partes[0] === "insumos-categorias") {
    if (partes.length > 1) return json({ erro: "rota" }, 404);
    if (request.method !== "PUT") return json({ erro: "metodo" }, 405);
    const kind = partes[0] === "categorias" ? "ferramentas" : "insumos";
    const c = await lerCorpo(request); if (c.erro) return c.erro;
    const v = O.validarCategorias(c.b.categorias);
    if (v.erro) return json({ erro: v.erro }, 400);
    // categoria ou subcategoria com item dentro não sai
    const itens = await listaLeve(env, kind, deps);
    for (const x of itens) {
      if (!x.categoria) continue;
      if (!O.subDe(v.categorias, x.categoria, x.subcategoria)) {
        const antes = O.subDe(await lerCategorias(env, kind, deps), x.categoria, x.subcategoria);
        if (antes) return json({ erro: `Não dá para tirar ${antes.nome}: ${x.nome} está nela. Mova ou tire os itens antes.` }, 409);
      }
    }
    const data = { categorias: v.categorias, atualizado: agoraIso() };
    await gravarMeta(env, O.META_CATS[kind], data, deps);
    return json({ ok: true, categorias: v.categorias });
  }
  const [kind, id, ...mais] = partes;
  if (!KINDS.includes(kind) || mais.length) return json({ erro: "rota" }, 404);
  const col = O.COLECAO[kind];
  if (id && (!O.ID_OK.test(id) || id.length > O.ID_MAX)) return json({ erro: "Endereço inválido." }, 400);
  const categorias = await lerCategorias(env, kind, deps);
  if (request.method === "POST" && !id) {
    const c = await lerCorpo(request); if (c.erro) return c.erro;
    const v = O.validarItem(kind, c.b, { categorias });
    if (v.erro) return json({ erro: v.erro }, 400);
    const novoId = c.b.id ? String(c.b.id) : O.slug(v.doc.nome);
    if (!O.ID_OK.test(novoId) || novoId.length > O.ID_MAX) return json({ erro: "O id usa só letras minúsculas sem acento, números e hífen." }, 400);
    const n = await env.DB.prepare("SELECT count(*) AS n FROM docs WHERE collection = ?").bind(col).first();
    if (Number(n && n.n) >= O.MAX_ITENS[kind]) return json({ erro: `A aba guarda até ${O.MAX_ITENS[kind]} itens.` }, 409);
    const quando = agoraIso();
    const doc = Object.fromEntries(Object.entries(v.doc).filter(([, x]) => x !== null));
    Object.assign(doc, { detalhesEm: temAlgo(kind, doc) ? quando : null, ...(kind !== "madeiras" ? { precosEm: doc.precos && Object.keys(doc.precos).length ? quando : null } : {}),
      adicionado: quando, por: "admin", atualizado: quando });
    const txt = JSON.stringify(doc);
    const r = await env.DB.prepare("INSERT OR IGNORE INTO docs (collection, id, data, coletado, atualizado) VALUES (?, ?, ?, '', ?)").bind(col, novoId, txt, quando).run();
    if (!r.meta || !r.meta.changes) return json({ erro: "Já existe um item com esse id." }, 409);
    deps.gravarNoEspelho(env, [{ collection: col, id: novoId, data: txt, coletado: "", atualizado: quando }]);
    return json({ ok: true, id: novoId });
  }
  if (!id) return json({ erro: "metodo" }, 405);
  const atualR = await env.DB.prepare("SELECT data FROM docs WHERE collection = ? AND id = ?").bind(col, id).first();
  const atual = atualR ? parse(atualR.data) : null;
  if (!atual) return json({ erro: "Não encontrado." }, 404);
  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM docs WHERE collection = ? AND id = ?").bind(col, id).run();
    deps.removerDoEspelho(env, [{ collection: col, id }]);
    return json({ ok: true });
  }
  if (request.method !== "PUT") return json({ erro: "metodo" }, 405);
  const c = await lerCorpo(request); if (c.erro) return c.erro;
  const v = O.validarItem(kind, c.b, { categorias, parcial: true, atual });
  if (v.erro) return json({ erro: v.erro }, 400);
  if (!Object.keys(v.doc).length) return json({ erro: "Nada para salvar." }, 400);
  const quando = agoraIso();
  const patch = { ...v.doc, atualizado: quando };
  // O Admin preencheu detalhe ou preço à mão: a data vai junto, para a tarefa não refazer por cima
  if (temAlgo(kind, v.doc)) patch.detalhesEm = quando;
  if (kind !== "madeiras" && "precos" in v.doc) patch.precosEm = v.doc.precos && Object.values(v.doc.precos).some(Boolean) ? quando : atual.precosEm || null;
  // json_patch junta objetos campo a campo: preços chegam inteiros (a loja que sumiu vira null e sai)
  if ("precos" in v.doc && atual.precos && typeof atual.precos === "object") {
    const p = { ...(v.doc.precos || {}) };
    for (const k of Object.keys(atual.precos)) if (!(k in p)) p[k] = null;
    patch.precos = p;
  }
  await env.DB.prepare("UPDATE docs SET data = json_patch(data, ?), atualizado = ? WHERE collection = ? AND id = ?").bind(JSON.stringify(patch), quando, col, id).run();
  const novo = await env.DB.prepare("SELECT data FROM docs WHERE collection = ? AND id = ?").bind(col, id).first();
  if (novo) deps.gravarNoEspelho(env, [{ collection: col, id, data: novo.data, coletado: "", atualizado: quando }]);
  return json({ ok: true, id });
}
