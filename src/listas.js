// Minhas listas (Investimentos): nome e papéis, uma collection por pessoa, listas/<email>.
//
// Dois tipos de lista no mesmo lugar:
// - manuais: a pessoa cria, renomeia, põe e tira papel (POST, PUT e DELETE em /api/listas);
// - automáticas da carteira: ids fixos (carteira-fiis, carteira-acoes...), campo `auto: true`, papéis = posições abertas
//   da classe, ordenados por valor. Só a sincronia da carteira (src/carteira.js, ao importar, desfazer ou apagar) grava
//   nelas; o PUT do usuário responde 400 "lista automática". O DELETE é aceito e a lista volta na próxima importação.
//
// Mover e copiar papel entre listas: POST /api/listas/mover { de, para, papel, copiar }, as duas listas gravadas juntas
// num batch do D1 e depois no espelho (write-through), como o resto.
//
// Este arquivo não importa nada do Worker, para os testes rodarem no Node; o espelho chega em `deps`.

// B3: quatro caracteres e o número; o segundo pode ser dígito (B3SA3, BDRs como M1TA34).
// EUA: de 1 a 5 letras, com a classe depois do ponto quando houver (AAPL, F, BRK.B).
export const PAPEL_OK = /^(?:[A-Z][A-Z0-9]{3}\d{1,2}|[A-Z]{1,5}(?:\.[A-Z])?)$/;
export const LISTA_ID_OK = /^[a-z0-9-]{1,60}$/;
export const LISTAS_MAX = 30;
export const PAPEIS_MAX = 60;

// Listas automáticas, na ordem em que aparecem. A classe é a de classeDe() em src/carteira.js.
export const AUTOMATICAS = [
  { id: "carteira-fiis", classe: "fii", nome: "Carteira · FIIs" },
  { id: "carteira-acoes", classe: "acao", nome: "Carteira · Ações" },
  { id: "carteira-bdrs", classe: "bdr", nome: "Carteira · BDRs" },
  { id: "carteira-etfs", classe: "etf", nome: "Carteira · ETFs" },
  { id: "carteira-subscricoes", classe: "subscricao", nome: "Carteira · Subscrições" },
];
const IDS_AUTO = new Set(AUTOMATICAS.map((a) => a.id));
export const ehAutomatica = (id, doc) => IDS_AUTO.has(id) && !!(doc && doc.auto);

const json = (dados, status = 200) =>
  new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const agoraIso = () => new Date().toISOString();
const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "lista";
const UPSERT = "INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES (?, ?, ?, '', ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = excluded.atualizado";

// Confere o corpo de uma lista. Devolve { nome, papeis } ou { erro }.
export function validarLista(b) {
  if (!b || typeof b !== "object") return { erro: "corpo" };
  const nome = String(b.nome ?? "").replace(/\s+/g, " ").trim();
  if (!nome) return { erro: "Dê um nome à lista." };
  if (nome.length > 40) return { erro: "O nome passa de 40 caracteres." };
  const papeis = b.papeis ?? [];
  if (!Array.isArray(papeis)) return { erro: "papeis" };
  if (papeis.length > PAPEIS_MAX) return { erro: `Uma lista guarda até ${PAPEIS_MAX} papéis.` };
  const vistos = new Set();
  for (const p of papeis) {
    if (typeof p !== "string" || !PAPEL_OK.test(p)) return { erro: `Papel inválido: ${String(p).slice(0, 12)}` };
    if (vistos.has(p)) return { erro: `${p} aparece duas vezes.` };
    vistos.add(p);
  }
  return { nome, papeis: [...vistos] };
}

// ---------- listas automáticas da carteira ----------

// Posições (calcular() de src/carteira.js, já em ordem de valor) -> { id: papeis } só das classes com papel.
export function papeisDaCarteira(posicoes) {
  const out = {};
  for (const a of AUTOMATICAS) {
    const ps = [];
    for (const p of posicoes || []) {
      if (p.classe !== a.classe || !(p.q > 0) || !PAPEL_OK.test(p.t) || ps.includes(p.t)) continue;
      ps.push(p.t);
    }
    if (ps.length) out[a.id] = ps.slice(0, PAPEIS_MAX);
  }
  return out;
}

// O que muda em listas/<email>: atuais = { id: doc } só das automáticas que existem hoje.
// Devolve { gravar: [{ id, doc }], apagar: [id] }. Lista que não mudou não é regravada.
export function planoSincronia(atuais, desejadas, agora = agoraIso()) {
  const gravar = [], apagar = [];
  for (const a of AUTOMATICAS) {
    const velho = atuais[a.id], papeis = desejadas[a.id];
    if (!papeis || !papeis.length) { if (velho) apagar.push(a.id); continue; }
    if (velho && velho.auto && velho.nome === a.nome && JSON.stringify(velho.papeis) === JSON.stringify(papeis)) continue;
    gravar.push({ id: a.id, doc: { nome: a.nome, papeis, auto: true, classe: a.classe, criado: (velho && velho.criado) || agora, atualizado: agora } });
  }
  return { gravar, apagar };
}

// Sincroniza as automáticas de uma pessoa. posicoes = null (ou vazio) apaga todas. Lê do D1, não do espelho.
// DELETE só pela lista de ids que o plano devolveu.
export async function sincronizarListasCarteira(env, email, posicoes, deps = {}) {
  const col = "listas/" + email;
  const ids = AUTOMATICAS.map((a) => a.id);
  const { results } = await env.DB.prepare(`SELECT id, data FROM docs WHERE collection = ? AND id IN (${ids.map(() => "?").join(",")})`).bind(col, ...ids).all();
  const atuais = {};
  for (const r of results || []) { try { atuais[r.id] = JSON.parse(r.data); } catch {} }
  const plano = planoSincronia(atuais, papeisDaCarteira(posicoes));
  const linhas = plano.gravar.map(({ id, doc }) => ({ collection: col, id, data: JSON.stringify(doc), coletado: "", atualizado: doc.atualizado }));
  const st = env.DB.prepare(UPSERT);
  const passos = linhas.map((l) => st.bind(l.collection, l.id, l.data, l.atualizado));
  if (plano.apagar.length) passos.push(env.DB.prepare(`DELETE FROM docs WHERE collection = ? AND id IN (${plano.apagar.map(() => "?").join(",")})`).bind(col, ...plano.apagar));
  if (passos.length) await env.DB.batch(passos);
  if (linhas.length && deps.gravarNoEspelho) deps.gravarNoEspelho(env, linhas);
  if (plano.apagar.length && deps.removerDoEspelho) deps.removerDoEspelho(env, plano.apagar.map((id) => ({ collection: col, id })));
  return { gravadas: plano.gravar.map((g) => g.id), apagadas: plano.apagar };
}

// ---------- mover e copiar ----------

// Confere o pedido e devolve as duas listas como ficam, ou { erro, status }. de e para: { id, doc } ou null.
export function moverPapel(de, para, papel, copiar) {
  if (!de) return { erro: "Lista de origem não encontrada.", status: 404 };
  if (!para) return { erro: "Lista de destino não encontrada.", status: 404 };
  if (de.id === para.id) return { erro: "Escolha outra lista.", status: 400 };
  if (ehAutomatica(para.id, para.doc)) return { erro: "Lista automática não recebe papel.", status: 400 };
  if (!copiar && ehAutomatica(de.id, de.doc)) return { erro: "Da lista da carteira dá só para copiar.", status: 400 };
  const origem = Array.isArray(de.doc.papeis) ? de.doc.papeis : [];
  const destino = Array.isArray(para.doc.papeis) ? para.doc.papeis : [];
  if (!origem.includes(papel)) return { erro: `${papel} não está em “${de.doc.nome}”.`, status: 400 };
  if (destino.includes(papel)) return { erro: `${papel} já está em “${para.doc.nome}”.`, status: 400 };
  if (destino.length >= PAPEIS_MAX) return { erro: `“${para.doc.nome}” já tem ${PAPEIS_MAX} papéis.`, status: 400 };
  const agora = agoraIso();
  return {
    de: copiar ? null : { ...de.doc, papeis: origem.filter((p) => p !== papel), atualizado: agora },
    para: { ...para.doc, papeis: [...destino, papel], atualizado: agora },
  };
}

// ---------- rota ----------

// /api/listas, /api/listas/<id> e /api/listas/mover. A seção já foi conferida em src/index.js.
// deps: { lerLinhas, gravarNoEspelho, removerDoEspelho }
export async function rotaListas(request, env, quem, idLista, deps) {
  const col = "listas/" + quem.email;
  if (request.method === "GET" && !idLista) {
    const results = await deps.lerLinhas(env, "SELECT id, data FROM docs WHERE collection = ? ORDER BY json_extract(data, '$.criado') LIMIT ?", [col, LISTAS_MAX + AUTOMATICAS.length], "listas");
    return json({ docs: results.map((r) => ({ id: r.id, data: JSON.parse(r.data) })) });
  }
  const lerJson = async (limite) => {
    const corpo = await request.text();
    if (corpo.length > limite) return { erro: "grande", status: 413 };
    try { return { b: JSON.parse(corpo) }; } catch { return { erro: "json" }; }
  };
  const lerCorpo = async () => { const r = await lerJson(8000); return r.erro ? r : validarLista(r.b); };
  const lerDoc = async (id) => {
    const r = await env.DB.prepare("SELECT data FROM docs WHERE collection = ? AND id = ?").bind(col, id).first();
    if (!r) return null;
    try { return { id, doc: JSON.parse(r.data) }; } catch { return null; }
  };
  const gravar = async (pares) => {
    const linhas = pares.map(([id, doc]) => ({ collection: col, id, data: JSON.stringify(doc), coletado: "", atualizado: doc.atualizado }));
    const st = env.DB.prepare(UPSERT);
    if (linhas.length === 1) await st.bind(col, linhas[0].id, linhas[0].data, linhas[0].atualizado).run();
    else await env.DB.batch(linhas.map((l) => st.bind(l.collection, l.id, l.data, l.atualizado)));
    deps.gravarNoEspelho(env, linhas);
  };

  if (idLista === "mover") {
    if (request.method !== "POST") return json({ erro: "metodo" }, 405);
    const { b, erro, status } = await lerJson(2000);
    if (erro) return json({ erro }, status || 400);
    const de = String((b && b.de) || ""), para = String((b && b.para) || ""), papel = String((b && b.papel) || "").trim().toUpperCase();
    if (!LISTA_ID_OK.test(de) || !LISTA_ID_OK.test(para)) return json({ erro: "id" }, 400);
    if (!PAPEL_OK.test(papel)) return json({ erro: "Papel inválido." }, 400);
    const copiar = b.copiar === true;
    const r = moverPapel(await lerDoc(de), await lerDoc(para), papel, copiar);
    if (r.erro) return json({ erro: r.erro }, r.status);
    await gravar(r.de ? [[de, r.de], [para, r.para]] : [[para, r.para]]);
    return json({ ok: true, copiar, de: r.de ? { id: de, data: r.de } : null, para: { id: para, data: r.para } });
  }

  if (request.method === "POST" && !idLista) {
    const v = await lerCorpo();
    if (v.erro) return json({ erro: v.erro }, v.status || 400);
    const n = await env.DB.prepare("SELECT count(*) AS n FROM docs WHERE collection = ? AND json_extract(data, '$.auto') IS NOT 1").bind(col).first();
    if ((n?.n || 0) >= LISTAS_MAX) return json({ erro: `Dá para ter até ${LISTAS_MAX} listas.` }, 400);
    // Id com sufixo aleatório; confere antes para não sobrescrever outra lista com o mesmo nome.
    let id = "";
    for (let k = 0; k < 8 && !id; k++) {
      const tenta = slug(v.nome) + "-" + String(Math.floor(Math.random() * 10000)).padStart(4, "0");
      if (!(await env.DB.prepare("SELECT 1 FROM docs WHERE collection = ? AND id = ?").bind(col, tenta).first())) id = tenta;
    }
    if (!id) return json({ erro: "Não deu para criar a lista agora. Tente de novo." }, 409);
    const agora = agoraIso();
    const doc = { nome: v.nome, papeis: v.papeis, criado: agora, atualizado: agora };
    await gravar([[id, doc]]);
    return json({ ok: true, id, data: doc });
  }
  if (!idLista || !LISTA_ID_OK.test(idLista)) return json({ erro: "id" }, 400);
  if (request.method === "PUT") {
    const atual = await lerDoc(idLista);
    if (!atual) return json({ erro: "Lista não encontrada." }, 404);
    if (ehAutomatica(idLista, atual.doc)) return json({ erro: "lista automática" }, 400);
    const v = await lerCorpo();
    if (v.erro) return json({ erro: v.erro }, v.status || 400);
    const agora = agoraIso();
    const doc = { nome: v.nome, papeis: v.papeis, criado: atual.doc.criado || agora, atualizado: agora };
    await gravar([[idLista, doc]]);
    return json({ ok: true, id: idLista, data: doc });
  }
  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM docs WHERE collection = ? AND id = ?").bind(col, idLista).run();
    deps.removerDoEspelho(env, [{ collection: col, id: idLista }]);
    return json({ ok: true });
  }
  return json({ erro: "metodo" }, 405);
}
