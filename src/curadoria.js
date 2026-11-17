// Curadoria pelo Lookout (pedido de 17/11): as instruções de cada seção, os pedidos para a curadoria e o "rodar agora".
// As tarefas agendadas do Claude leem e fecham o que está aqui direto no D1, pelo conector da Cloudflare; o contrato
// (nomes de collection, de campo e de estado) está em docs/LOOKOUT.md, "Curadoria: instruções, pedidos e plantão", e é fixo.
//
// - instrucoes/<secao>: { texto, versao, atualizado, por: "admin" }. Só a rota do Admin grava.
// - instrucoes-hist/<secao>-<versao com 5 dígitos>: a versão anterior a cada gravação; ficam as 30 últimas por seção.
// - pedidos-curadoria/p<16 hex>: { secao, texto, agora, fixo, estado, criado, atendidoEm, resposta, itens }.
//
// Nada disso vai para o espelho nem aparece para quem não é Admin: as rotas leem do D1 e as collections não estão em
// COLECOES_ESPELHO (src/espelho.js) nem nas listas que /api/q e /api/doc aceitam (src/index.js).
// As cinco seções, as mesmas de src/grupos.js (repetidas aqui porque grupos.js puxa o espelho e o "cloudflare:workers",
// e este arquivo é importado pela coleta; test/instrucoes.test.mjs confere que as duas listas são iguais).
export const SECOES = ["tech", "negocios", "investimentos", "politica", "esportes"];

export const COL_INSTRUCOES = "instrucoes";
export const COL_HISTORICO = "instrucoes-hist";
export const COL_PEDIDOS = "pedidos-curadoria";
export const LIMITES = {
  TEXTO_MIN: 500,          // instruções com menos que isso: recusa
  TEXTO_MAX: 60_000,       // e com mais que isso também
  CORPO_MAX: 300_000,      // bytes do corpo do PUT (texto em JSON, com folga para os escapes)
  HISTORICO: 30,           // versões anteriores guardadas por seção
  PEDIDO_MAX: 500,         // caracteres do texto de um pedido
  AGORA_POR_DIA: 6,        // pedidos "rodar agora" por seção por dia (dia de São Paulo)
  PENDENTES_POR_SECAO: 50, // pedidos pendentes (fora o "rodar agora") por seção
  LISTA: 200,              // GET /api/admin/pedidos devolve até tantos
  FECHADO_DIAS: 30,        // pedido fechado há mais que isso sai na limpeza
};
export const ESTADOS = ["pendente", "atendido", "sem-resultado", "cancelado"];
const FECHADOS = new Set(["atendido", "sem-resultado", "cancelado"]);
const STATUS_DA_SECAO = (s) => (s === "tech" ? "status" : "status-" + s);
export const ID_PEDIDO = /^p[0-9a-f]{16}$/;
const DIA = 86_400_000;
const FUSO_SP = 3 * 3600_000; // São Paulo sem horário de verão desde 2019: UTC-3 o ano todo

const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const agoraIso = () => new Date().toISOString();
const jsonOu = (s) => { try { return JSON.parse(s); } catch { return null; } };
export const idHistorico = (secao, versao) => secao + "-" + String(versao).padStart(5, "0");
// Faixa da chave para os ids de uma seção no histórico: "tech-" até "tech." ('.' vem logo depois de '-'), usa o índice
const faixaHist = (secao) => [secao + "-", secao + "."];
export const inicioDoDiaSP = (t = Date.now()) => new Date(Math.floor((t - FUSO_SP) / DIA) * DIA + FUSO_SP).toISOString();

export function novoIdPedido() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return "p" + [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function lerCorpo(request, max = 8000) {
  const txt = await request.text();
  if (txt.length > max) return { erro: json({ erro: "Corpo grande demais." }, 413) };
  const b = jsonOu(txt);
  if (!b || typeof b !== "object" || Array.isArray(b)) return { erro: json({ erro: "json" }, 400) };
  return { b };
}

// ---------- instruções ----------

// Confere o texto das instruções. Devolve { texto } ou { erro } com o motivo para mostrar na tela.
export function validarInstrucoes(texto) {
  if (typeof texto !== "string") return { erro: "Faltou o texto das instruções." };
  const t = texto.replace(/\r\n?/g, "\n");
  if (t.length < LIMITES.TEXTO_MIN) return { erro: `O texto tem ${t.length} caracteres; o mínimo é ${LIMITES.TEXTO_MIN.toLocaleString("pt-BR")}. Instrução curta assim deixa a curadoria sem regra.` };
  if (t.length > LIMITES.TEXTO_MAX) return { erro: `O texto tem ${t.length.toLocaleString("pt-BR")} caracteres; o máximo é ${LIMITES.TEXTO_MAX.toLocaleString("pt-BR")}.` };
  return { texto: t };
}

async function lerInstrucao(env, secao) {
  const r = await env.DB.prepare("SELECT data FROM docs WHERE collection = 'instrucoes' AND id = ?").bind(secao).first();
  return r ? jsonOu(r.data) : null;
}

async function listaHistorico(env, secao) {
  const [de, ate] = faixaHist(secao);
  const { results } = await env.DB.prepare(
    "SELECT id, json_extract(data, '$.versao') AS versao, json_extract(data, '$.atualizado') AS atualizado FROM docs WHERE collection = 'instrucoes-hist' AND id >= ? AND id < ? ORDER BY id DESC"
  ).bind(de, ate).all();
  return results || [];
}

// Guarda a versão que saiu e corta o histórico da seção nas 30 últimas (DELETE por collection e lista de ids).
async function guardarHistorico(env, secao, anterior) {
  const quando = agoraIso();
  await env.DB.prepare(
    "INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES ('instrucoes-hist', ?, ?, '', ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = excluded.atualizado"
  ).bind(idHistorico(secao, anterior.versao), JSON.stringify(anterior), quando).run();
  const ids = (await listaHistorico(env, secao)).map((r) => r.id);
  const fora = ids.slice(LIMITES.HISTORICO);
  for (let k = 0; k < fora.length; k += 90) {
    const parte = fora.slice(k, k + 90);
    await env.DB.prepare(`DELETE FROM docs WHERE collection = 'instrucoes-hist' AND id IN (${parte.map((_, j) => `?${j + 1}`).join(",")})`).bind(...parte).run();
  }
  return fora.length;
}

async function rotaInstrucoes(request, env, partes) {
  const [secao, versaoTxt, ...resto] = partes;
  if (resto.length) return json({ erro: "rota" }, 404);
  // GET /api/admin/instrucoes: as cinco seções, com a última rodada de cada curadoria (meta/status*)
  if (!secao) {
    if (request.method !== "GET") return json({ erro: "metodo" }, 405);
    const marcas = (n, de) => Array.from({ length: n }, (_, k) => "?" + (de + k)).join(",");
    const ins = await env.DB.prepare(`SELECT id, data FROM docs WHERE collection = 'instrucoes' AND id IN (${marcas(SECOES.length, 1)})`).bind(...SECOES).all();
    const sts = await env.DB.prepare(`SELECT id, data FROM docs WHERE collection = 'meta' AND id IN (${marcas(SECOES.length, 1)})`).bind(...SECOES.map(STATUS_DA_SECAO)).all();
    const porId = (rs) => new Map((rs.results || []).map((r) => [r.id, jsonOu(r.data) || {}]));
    const I = porId(ins), S = porId(sts);
    return json({
      secoes: SECOES.map((s) => {
        const d = I.get(s), st = S.get(STATUS_DA_SECAO(s)) || {};
        const tamanho = d && typeof d.texto === "string" ? d.texto.length : 0;
        return { secao: s, versao: d ? Number(d.versao) || 0 : 0, atualizado: d ? d.atualizado || null : null, tamanho, vazia: !tamanho,
          ultimaRodada: st.ultimaRodada || null, novosNaUltima: st.novosNaUltima ?? null };
      }),
      limites: { min: LIMITES.TEXTO_MIN, max: LIMITES.TEXTO_MAX, historico: LIMITES.HISTORICO },
    });
  }
  if (!SECOES.includes(secao)) return json({ erro: "Seção desconhecida." }, 404);

  // GET /api/admin/instrucoes/<secao>/<versao>: o texto daquela versão (a atual ou uma do histórico)
  if (versaoTxt !== undefined) {
    if (request.method !== "GET") return json({ erro: "metodo" }, 405);
    if (!/^[1-9]\d{0,4}$/.test(versaoTxt)) return json({ erro: "Versão inválida." }, 400);
    const v = Number(versaoTxt);
    const atual = await lerInstrucao(env, secao);
    let d = atual && Number(atual.versao) === v ? atual : null;
    if (!d) {
      const r = await env.DB.prepare("SELECT data FROM docs WHERE collection = 'instrucoes-hist' AND id = ?").bind(idHistorico(secao, v)).first();
      d = r ? jsonOu(r.data) : null;
    }
    if (!d) return json({ erro: "Essa versão não está mais guardada." }, 404);
    return json({ secao, versao: v, texto: d.texto || "", atualizado: d.atualizado || null, atual: !!atual && Number(atual.versao) === v });
  }

  // GET /api/admin/instrucoes/<secao>: o doc inteiro e a lista do histórico
  if (request.method === "GET") {
    const d = await lerInstrucao(env, secao);
    const historico = (await listaHistorico(env, secao)).map((r) => ({ versao: Number(r.versao), atualizado: r.atualizado || null }));
    return json({ secao, existe: !!d, doc: d ? { texto: d.texto || "", versao: Number(d.versao) || 0, atualizado: d.atualizado || null, por: d.por || "admin" } : null, historico,
      limites: { min: LIMITES.TEXTO_MIN, max: LIMITES.TEXTO_MAX, historico: LIMITES.HISTORICO } });
  }

  // PUT /api/admin/instrucoes/<secao> { texto, versao }: versao é a que a tela leu (0 quando ainda não havia)
  if (request.method === "PUT") {
    const { b, erro } = await lerCorpo(request, LIMITES.CORPO_MAX);
    if (erro) return erro;
    const versao = b.versao;
    if (!Number.isInteger(versao) || versao < 0 || versao > 99_998) return json({ erro: "Faltou a versão que a tela leu." }, 400);
    const v = validarInstrucoes(b.texto);
    if (v.erro) return json({ erro: v.erro }, 400);
    const atual = await lerInstrucao(env, secao);
    const versaoBanco = atual ? Number(atual.versao) || 0 : 0;
    const conflito = () => json({ erro: `As instruções de ${secao} mudaram em outra aba (agora estão na versão ${versaoBanco}). Recarregue antes de salvar.`, versao: versaoBanco }, 409);
    if (versaoBanco !== versao) return conflito();
    const quando = agoraIso();
    const doc = { texto: v.texto, versao: versao + 1, atualizado: quando, por: "admin" };
    const data = JSON.stringify(doc);
    // Gravação condicional: se outra aba gravou entre a leitura e aqui, nenhuma linha muda e a resposta é 409
    const r = atual
      ? await env.DB.prepare("UPDATE docs SET data = ?, atualizado = ? WHERE collection = 'instrucoes' AND id = ? AND json_extract(data, '$.versao') = ?").bind(data, quando, secao, versao).run()
      : await env.DB.prepare("INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES ('instrucoes', ?, ?, '', ?) ON CONFLICT(collection, id) DO NOTHING").bind(secao, data, quando).run();
    if (!(r.meta && r.meta.changes)) return conflito();
    let cortadas = 0;
    if (atual) cortadas = await guardarHistorico(env, secao, atual);
    return json({ ok: true, secao, versao: doc.versao, atualizado: quando, tamanho: doc.texto.length, cortadas });
  }
  return json({ erro: "metodo" }, 405);
}

// ---------- pedidos ----------

const pedidoDe = (r) => {
  const d = jsonOu(r.data) || {};
  return { id: r.id, secao: d.secao, texto: d.texto || "", agora: !!d.agora, fixo: !!d.fixo, estado: d.estado || "pendente", criado: d.criado || null,
    atendidoEm: d.atendidoEm ?? null, resposta: d.resposta ?? null, itens: d.itens ?? null };
};
const dadosDe = (p) => ({ secao: p.secao, texto: p.texto, agora: p.agora, fixo: p.fixo, estado: p.estado, criado: p.criado, atendidoEm: p.atendidoEm, resposta: p.resposta, itens: p.itens });

async function lerPedido(env, id) {
  const r = await env.DB.prepare("SELECT id, data FROM docs WHERE collection = 'pedidos-curadoria' AND id = ?").bind(id).first();
  return r ? pedidoDe(r) : null;
}
async function agoraPendente(env, secao) {
  const r = await env.DB.prepare(
    "SELECT id, data FROM docs WHERE collection = 'pedidos-curadoria' AND json_extract(data, '$.secao') = ? AND json_extract(data, '$.agora') = 1 AND json_extract(data, '$.estado') = 'pendente' LIMIT 1"
  ).bind(secao).first();
  return r ? pedidoDe(r) : null;
}
async function gravarPedido(env, p) {
  const quando = agoraIso();
  await env.DB.prepare(
    "INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES ('pedidos-curadoria', ?, ?, ?, ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = excluded.atualizado"
  ).bind(p.id, JSON.stringify(dadosDe(p)), p.criado || quando, quando).run();
}
const limparTexto = (t) => String(t ?? "").replace(/\r\n?/g, "\n").trim();

// Valida o corpo do POST. Devolve { pedido } ou { erro }.
export function validarPedido(b) {
  if (!b || typeof b !== "object") return { erro: "json" };
  if (!SECOES.includes(b.secao)) return { erro: "Escolha a seção." };
  if (b.texto != null && typeof b.texto !== "string") return { erro: "O texto do pedido tem de ser texto." };
  for (const k of ["agora", "fixo"]) if (b[k] != null && typeof b[k] !== "boolean") return { erro: `"${k}" é sim ou não.` };
  const texto = limparTexto(b.texto), agora = !!b.agora, fixo = !!b.fixo;
  if (texto.length > LIMITES.PEDIDO_MAX) return { erro: `O pedido tem ${texto.length} caracteres; o máximo é ${LIMITES.PEDIDO_MAX}.` };
  if (!texto && !agora) return { erro: "Escreva o que a curadoria deve procurar ou incluir." };
  if (agora && fixo) return { erro: "Um pedido de rodada agora não vale para toda rodada." };
  return { pedido: { secao: b.secao, texto, agora, fixo } };
}

async function rotaPedidos(request, env, partes) {
  const [id, ...resto] = partes;
  if (resto.length) return json({ erro: "rota" }, 404);
  if (!id) {
    if (request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT id, data FROM docs WHERE collection = 'pedidos-curadoria' ORDER BY json_extract(data, '$.criado') DESC, id DESC LIMIT ?"
      ).bind(LIMITES.LISTA).all();
      return json({ pedidos: (results || []).map(pedidoDe), limites: { texto: LIMITES.PEDIDO_MAX, agoraPorDia: LIMITES.AGORA_POR_DIA } });
    }
    if (request.method !== "POST") return json({ erro: "metodo" }, 405);
    const { b, erro } = await lerCorpo(request);
    if (erro) return erro;
    const v = validarPedido(b);
    if (v.erro) return json({ erro: v.erro }, 400);
    const p = v.pedido;
    if (p.agora) {
      // Trava do "rodar agora": um pendente por seção (o segundo recebe o que já existe) e 6 por seção por dia
      const ja = await agoraPendente(env, p.secao);
      if (ja) return json({ ok: true, existente: true, pedido: ja });
      const { results } = await env.DB.prepare(
        "SELECT count(*) AS n FROM docs WHERE collection = 'pedidos-curadoria' AND json_extract(data, '$.secao') = ? AND json_extract(data, '$.agora') = 1 AND json_extract(data, '$.criado') >= ?"
      ).bind(p.secao, inicioDoDiaSP()).all();
      if (Number(results[0].n) >= LIMITES.AGORA_POR_DIA) return json({ erro: `Já foram ${LIMITES.AGORA_POR_DIA} rodadas pedidas hoje nesta seção. Amanhã dá para pedir de novo.` }, 429);
    } else {
      const { results } = await env.DB.prepare(
        "SELECT count(*) AS n FROM docs WHERE collection = 'pedidos-curadoria' AND json_extract(data, '$.secao') = ? AND json_extract(data, '$.estado') = 'pendente' AND json_extract(data, '$.agora') = 0"
      ).bind(p.secao).all();
      if (Number(results[0].n) >= LIMITES.PENDENTES_POR_SECAO) return json({ erro: `Já há ${LIMITES.PENDENTES_POR_SECAO} pedidos pendentes nesta seção. Cancele ou exclua alguns antes.` }, 400);
    }
    const novo = { id: novoIdPedido(), ...p, estado: "pendente", criado: agoraIso(), atendidoEm: null, resposta: null, itens: null };
    await gravarPedido(env, novo);
    return json({ ok: true, pedido: novo }, 201);
  }
  if (!ID_PEDIDO.test(id)) return json({ erro: "id" }, 400);
  const atual = await lerPedido(env, id);
  if (!atual) return json({ erro: "Esse pedido não existe mais." }, 404);
  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM docs WHERE collection = 'pedidos-curadoria' AND id = ?").bind(id).run();
    return json({ ok: true });
  }
  if (request.method !== "PUT") return json({ erro: "metodo" }, 405);
  // PUT { texto?, fixo?, acao?: "cancelar" | "reabrir" }
  const { b, erro } = await lerCorpo(request);
  if (erro) return erro;
  const p = { ...atual };
  if (b.texto !== undefined) {
    if (typeof b.texto !== "string") return json({ erro: "O texto do pedido tem de ser texto." }, 400);
    p.texto = limparTexto(b.texto);
    if (p.texto.length > LIMITES.PEDIDO_MAX) return json({ erro: `O pedido tem ${p.texto.length} caracteres; o máximo é ${LIMITES.PEDIDO_MAX}.` }, 400);
    if (!p.texto && !p.agora) return json({ erro: "Escreva o que a curadoria deve procurar ou incluir." }, 400);
  }
  if (b.fixo !== undefined) {
    if (typeof b.fixo !== "boolean") return json({ erro: '"fixo" é sim ou não.' }, 400);
    if (b.fixo && p.agora) return json({ erro: "Um pedido de rodada agora não vale para toda rodada." }, 400);
    p.fixo = b.fixo;
  }
  if (b.acao !== undefined) {
    if (b.acao === "cancelar") {
      if (p.estado !== "pendente") return json({ erro: "Só dá para cancelar pedido pendente." }, 409);
      p.estado = "cancelado";
    } else if (b.acao === "reabrir") {
      if (p.estado === "pendente") return json({ erro: "O pedido já está pendente." }, 409);
      if (p.agora) {
        const ja = await agoraPendente(env, p.secao);
        if (ja) return json({ erro: "Já há uma rodada pedida para esta seção.", pedido: ja }, 409);
      }
      Object.assign(p, { estado: "pendente", atendidoEm: null, resposta: null, itens: null });
    } else return json({ erro: "Ação desconhecida." }, 400);
  }
  await gravarPedido(env, p);
  return json({ ok: true, pedido: p });
}

// ---------- limpeza ----------

// Pedidos fechados (atendido, sem-resultado, cancelado) há mais de 30 dias, pela coluna `atualizado` (toda gravação,
// da rota ou da tarefa, mexe nela); sem ela, atendidoEm e por fim criado. Pedido fixo pendente nunca sai.
export async function pedidosParaApagar(env, t = Date.now()) {
  const corte = t - LIMITES.FECHADO_DIAS * DIA;
  const { results } = await env.DB.prepare(
    "SELECT id, atualizado, json_extract(data, '$.estado') AS estado, json_extract(data, '$.atendidoEm') AS atendido, json_extract(data, '$.criado') AS criado FROM docs WHERE collection = 'pedidos-curadoria'"
  ).all();
  return (results || []).filter((r) => {
    if (!FECHADOS.has(r.estado)) return false;
    const ref = Date.parse(r.atualizado || r.atendido || r.criado || "");
    return !isNaN(ref) && ref < corte;
  }).map((r) => r.id);
}
export async function limparPedidos(env, t = Date.now()) {
  const fora = await pedidosParaApagar(env, t);
  for (let k = 0; k < fora.length; k += 90) {
    const parte = fora.slice(k, k + 90);
    await env.DB.prepare(`DELETE FROM docs WHERE collection = 'pedidos-curadoria' AND id IN (${parte.map((_, j) => `?${j + 1}`).join(",")})`).bind(...parte).run();
  }
  return fora;
}

// ---------- entrada ----------

// /api/admin/instrucoes[/<secao>[/<versao>]] e /api/admin/pedidos[/<id>]. caminho: o resto depois de /api/admin/, já decodificado.
// Quem não é Admin recebe o mesmo 404 das rotas de Admin do Landscape.
export async function rotaAdminCuradoria(request, env, quem, caminho) {
  if (!quem || !quem.admin) return json({ erro: "rota" }, 404);
  const [base, ...partes] = String(caminho || "").split("/");
  if (partes.length && partes[partes.length - 1] === "") partes.pop();
  if (base === "instrucoes") return rotaInstrucoes(request, env, partes);
  if (base === "pedidos") return rotaPedidos(request, env, partes);
  return json({ erro: "rota" }, 404);
}
