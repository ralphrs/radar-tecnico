// Radar de Saúde (pedido de 20/11): acompanhamento por produto. As notícias são a máquina dos outros radares
// (items-saude, destaques-saude, meta/status-saude; src/coleta.js, src/curadoria.js). Aqui: os produtos acompanhados
// (semente, rotas públicas e de Admin), a lista dos ativos para a coleta e as consultas do contrato da curadoria
// (exportadas e testadas no D1 falso).
//
// Regras puras em public/saude.js (globalThis.Saude): validação, citaProduto, filtros e hash.
//
// Banco (D1, com espelho):
// - saude-produtos/<id> (id em kebab-case sem acento): { nome, apelidos, tipo, resumo, marcas, situacaoBrasil, ativo,
//   adicionado, por, atualizado }
// - _sistema/saude-semente: marca da semente ({ quando, versao, produtos })
// Regras: nunca DROP; UPDATE e DELETE só com a chave explícita; a curadoria só mexe em situacaoBrasil (sqlSituacao);
// coletas, tradução e limpeza não tocam aqui.
import "../public/saude.js";

const S = globalThis.Saude;
export const COL = "saude-produtos";
export const SEMENTE_VERSAO = 1;
// Só o que o Admin pediu: nome, grafias e as duas marcas. Nada de resumo, tipo ou situação no Brasil (fato de saúde
// vem da curadoria, com fonte).
export const SEMENTE = [
  { id: "retatrutida", doc: { nome: "Retatrutida", apelidos: ["retatrutide", "LY3437943", "reta"],
    marcas: [{ id: "zphc-store", nome: "ZPHC Store", tipo: "loja" }, { id: "synedica", nome: "Synedica", tipo: "marca" }], ativo: true } },
];
const AGORA_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const agoraIso = (t = Date.now()) => new Date(t).toISOString();
const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };

// ---------- contrato da curadoria (docs/LOOKOUT.md, "Radar de Saúde") ----------
// 1. Os produtos ativos (a curadoria procura notícia de cada um pelo nome, pelos apelidos e pelas marcas).
export const SQL_PRODUTOS_ATIVOS = "SELECT id, data FROM docs WHERE collection = 'saude-produtos' AND json_extract(data, '$.ativo') = 1";
// 2. A única gravação da curadoria nesta collection: o campo situacaoBrasil de um produto, sempre com fonte.
//    ?1 = {"situacaoBrasil": { "texto": "...", "fonte": "https://...", "em": "AAAA-MM-DD" }}, ?2 = id do produto.
export const SQL_SITUACAO = `UPDATE docs SET data = json_patch(data, ?1), atualizado = ${AGORA_SQL} WHERE collection = 'saude-produtos' AND id = ?2`;
// O ?1 pronto a partir de { texto, fonte, em }, conferido pela mesma regra da leitura (sem fonte não entra).
export function patchSituacao(s) {
  const v = S.validarSituacao(s);
  if (v.erro) throw new Error(v.erro);
  return JSON.stringify({ situacaoBrasil: v.v });
}

// Produtos ativos, saneados, para a coleta (filtro por produto dos candidatos do radar saude). Lê direto do D1.
export async function produtosAtivos(env) {
  const { results } = await env.DB.prepare(SQL_PRODUTOS_ATIVOS).all();
  return (results || []).map((r) => S.saneado(r.id, parse(r.data))).filter((p) => p && p.ativo);
}

// ---------- semente ----------
// Uma vez: INSERT OR IGNORE de cada produto e a marca _sistema/saude-semente. Com a marca, nada mais entra; o que o
// Admin editou fica e o que ele tirou não volta.
export async function semearSaude(env, agora = Date.now()) {
  const r = await env.DB.prepare("SELECT data FROM docs WHERE collection = '_sistema' AND id = 'saude-semente'").first();
  const marca = r ? parse(r.data) : null;
  if (marca && Number(marca.versao) >= SEMENTE_VERSAO) return 0;
  const quando = agoraIso(agora);
  const ops = SEMENTE.map((x) => env.DB.prepare("INSERT OR IGNORE INTO docs (collection, id, data, coletado, atualizado) VALUES (?, ?, ?, '', ?)")
    .bind(COL, x.id, JSON.stringify({ ...x.doc, adicionado: quando, por: "semente", atualizado: quando }), quando));
  ops.push(env.DB.prepare(
    "INSERT INTO docs (collection, id, data) VALUES ('_sistema', 'saude-semente', ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
  ).bind(JSON.stringify({ quando, versao: SEMENTE_VERSAO, anterior: marca ? marca.versao : null, produtos: SEMENTE.length })));
  await env.DB.batch(ops);
  return SEMENTE.length;
}

// ---------- leitura ----------
export async function listaProdutos(env, deps, admin = false) {
  const linhas = await deps.lerLinhas(env, "SELECT id, data FROM docs WHERE collection = 'saude-produtos'", [], "saude");
  const l = (linhas || []).map((r) => S.saneado(r.id, parse(r.data))).filter(Boolean);
  return S.ordenarProdutos(admin ? l : l.filter((p) => p.ativo));
}

// GET /api/saude/produtos: para quem tem a seção (o index.js confere antes). O Admin recebe também os pausados.
export async function rotaSaude(request, env, quem, resto, deps) {
  if (resto !== "produtos") return json({ erro: "rota" }, 404);
  if (request.method !== "GET") return json({ erro: "metodo" }, 405);
  const produtos = await listaProdutos(env, deps, !!quem.admin);
  return json({ produtos, admin: !!quem.admin, max: S.MAX_PRODUTOS });
}

// ---------- Admin: /api/admin/saude/produtos[/<id>] (404 para quem não é Admin) ----------
async function lerCorpo(request) {
  const txt = await request.text();
  if (txt.length > S.CORPO_MAX) return { erro: json({ erro: "Corpo grande demais." }, 413) };
  const b = parse(txt);
  if (!b || typeof b !== "object" || Array.isArray(b)) return { erro: json({ erro: "Corpo inválido." }, 400) };
  return { b };
}
const semNulos = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
export async function rotaAdminSaude(request, env, quem, resto, deps) {
  if (!quem || !quem.admin) return json({ erro: "rota" }, 404);
  const [base, id, ...mais] = String(resto || "").split("/");
  if (base !== "produtos" || mais.length) return json({ erro: "rota" }, 404);
  if (!id) {
    if (request.method !== "POST") return json({ erro: "metodo" }, 405);
    const c = await lerCorpo(request); if (c.erro) return c.erro;
    const v = S.validarProduto(c.b);
    if (v.erro) return json({ erro: v.erro }, 400);
    const n = S.idNovo(c.b, v.doc.nome);
    if (n.erro) return json({ erro: n.erro }, 400);
    const conta = await env.DB.prepare("SELECT count(*) AS n FROM docs WHERE collection = ?").bind(COL).first();
    if (Number(conta && conta.n) >= S.MAX_PRODUTOS) return json({ erro: `O radar acompanha até ${S.MAX_PRODUTOS} produtos. Tire ou pause algum antes.` }, 409);
    const quando = agoraIso();
    const doc = { ...semNulos(v.doc), adicionado: quando, por: "admin", atualizado: quando };
    const txt = JSON.stringify(doc);
    const r = await env.DB.prepare("INSERT OR IGNORE INTO docs (collection, id, data, coletado, atualizado) VALUES (?, ?, ?, '', ?)").bind(COL, n.id, txt, quando).run();
    if (!r.meta || !r.meta.changes) return json({ erro: "Já existe um produto com esse id." }, 409);
    if (deps && deps.gravarNoEspelho) deps.gravarNoEspelho(env, [{ collection: COL, id: n.id, data: txt, coletado: "", atualizado: quando }]);
    return json({ ok: true, id: n.id, produto: S.saneado(n.id, doc) });
  }
  if (!S.idOk(id)) return json({ erro: "Endereço inválido." }, 400);
  const atualR = await env.DB.prepare("SELECT data FROM docs WHERE collection = ? AND id = ?").bind(COL, id).first();
  if (!atualR) return json({ erro: "Esse produto não está mais no radar." }, 404);
  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM docs WHERE collection = ? AND id = ?").bind(COL, id).run();
    if (deps && deps.removerDoEspelho) deps.removerDoEspelho(env, [{ collection: COL, id }]);
    return json({ ok: true });
  }
  if (request.method !== "PUT") return json({ erro: "metodo" }, 405);
  const c = await lerCorpo(request); if (c.erro) return c.erro;
  const v = S.validarProduto(c.b, { parcial: true });
  if (v.erro) return json({ erro: v.erro }, 400);
  if (!Object.keys(v.doc).length) return json({ erro: "Nada para salvar." }, 400);
  const quando = agoraIso();
  // json_patch: listas (apelidos, marcas) chegam inteiras; tipo ou resumo vazio vira null e sai do doc
  await env.DB.prepare("UPDATE docs SET data = json_patch(data, ?), atualizado = ? WHERE collection = ? AND id = ?").bind(JSON.stringify({ ...v.doc, atualizado: quando }), quando, COL, id).run();
  const novo = await env.DB.prepare("SELECT data FROM docs WHERE collection = ? AND id = ?").bind(COL, id).first();
  if (novo && deps && deps.gravarNoEspelho) deps.gravarNoEspelho(env, [{ collection: COL, id, data: novo.data, coletado: "", atualizado: quando }]);
  return json({ ok: true, id, produto: novo ? S.saneado(id, parse(novo.data)) : null });
}
