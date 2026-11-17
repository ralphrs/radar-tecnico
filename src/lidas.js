// Notícias lidas (17/11): o ✓ de cada notícia e de cada post de Nos fóruns. Por pessoa, em lidas/<email>, um doc por
// item com o mesmo id que os favoritos usam na conta (Tech: id do doc; outras seções: "<collection>:<id>"; fóruns:
// "foruns-<seção>:<id>") e data { em }. Mesmo caminho dos favoritos: leitura pelo espelho (D1 de reserva), gravação
// no D1 e, depois que deu certo, write-through no espelho.
//
// Só esta rota grava em lidas/. Coletas, curadorias, tradução e a limpeza das notícias não tocam aqui; a única limpeza
// é a de lidasParaApagar, no minuto 7 (src/coleta.js, limpar): marcas com mais de 90 dias, até 200 por rodada,
// apagadas por collection e lista de ids. A conta apagada leva lidas/<email> junto (PREFIXOS_PESSOAIS, src/espelho.js).

export const PREFIXO = "lidas/";
export const DIAS = 90;
export const POR_RODADA = 200;
const LOTE = 90;
const ID_MAX = 200;

const json = (dados, status = 200) =>
  new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

// GET /api/lidas → { ids } (mais recente primeiro); PUT e DELETE /api/lidas/<id>.
// id === null: o caminho veio com "%" malformado.
export async function rotaLidas(request, env, quem, id, deps) {
  if (!quem || !quem.email) return json({ erro: "login" }, 401);
  const col = PREFIXO + quem.email;
  if (request.method === "GET" && id === "") {
    const linhas = await deps.lerLinhas(env, "SELECT id, data FROM docs WHERE collection = ? ORDER BY atualizado DESC, id LIMIT 5000", [col], "lidas");
    return json({ ids: linhas.map((r) => r.id) });
  }
  if (!id || id.length > ID_MAX) return json({ erro: "id" }, 400);
  if (request.method === "PUT") {
    const em = new Date().toISOString();
    const data = JSON.stringify({ em });
    await env.DB.prepare(
      "INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES (?, ?, ?, '', ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = excluded.atualizado"
    ).bind(col, id, data, em).run();
    deps.gravarNoEspelho(env, [{ collection: col, id, data, coletado: "", atualizado: em }]);
    return json({ ok: true, em });
  }
  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM docs WHERE collection = ? AND id = ?").bind(col, id).run();
    deps.removerDoEspelho(env, [{ collection: col, id }]);
    return json({ ok: true });
  }
  return json({ erro: "metodo" }, 405);
}

// Marcas com mais de 90 dias, de todo mundo, no máximo 200: { collection, id }. Busca pela faixa da chave
// (collection >= 'lidas/' AND collection < 'lidas0'), que usa o índice, como a sincronia do espelho.
export async function lidasParaApagar(env, agora = Date.now()) {
  const corte = new Date(agora - DIAS * 86_400_000).toISOString();
  const { results } = await env.DB.prepare(
    "SELECT collection, id FROM docs WHERE collection >= 'lidas/' AND collection < 'lidas0' AND json_extract(data, '$.em') < ? LIMIT ?"
  ).bind(corte, POR_RODADA).all();
  return results || [];
}

// Apaga as velhas por collection e lista de ids (nunca por LIKE nem por data no DELETE). Devolve quantas e as chaves.
export async function limparLidas(env, agora = Date.now()) {
  const velhas = await lidasParaApagar(env, agora);
  const porCol = new Map();
  for (const r of velhas) { if (!porCol.has(r.collection)) porCol.set(r.collection, []); porCol.get(r.collection).push(r.id); }
  for (const [c, ids] of porCol) for (let k = 0; k < ids.length; k += LOTE) {
    const parte = ids.slice(k, k + LOTE);
    await env.DB.prepare(`DELETE FROM docs WHERE collection = ?1 AND id IN (${parte.map((_, j) => `?${j + 2}`).join(",")})`).bind(c, ...parte).run();
  }
  return velhas;
}
