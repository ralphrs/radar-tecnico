import { emailDoAccess, accessConfigurado } from "./auth.js";
import { coletar, limpar } from "./coleta.js";
import { cronMercado, pedirAtualizacao, cronB3 } from "./mercado.js";
import { cronEua } from "./eua.js";
import { cronCvm, etapaAnoAnterior, etapaAnoCorrente } from "./cvm.js";
import { adminCustos } from "./custos.js";
import { secoesDe, secaoDe, libera, adminGrupos, adminMembro, guardarSecoes, SECOES } from "./grupos.js";
import { cronSonda, adminSonda } from "./sonda.js";
import { doEspelho, convidadoNoEspelho, sincronizarEspelho, adminEspelho, logD1, gravarNoEspelho, removerDoEspelho } from "./espelho.js";
import { catalogoDe, validarPainel, respostaPainel } from "./painel.js";

// O Durable Object do espelho de leitura em São Paulo (src/espelho.js) precisa sair exportado daqui.
export { Espelho } from "./espelho.js";

// Collections que a página pode ler. Tudo o mais é negado.
const LISTAS = new Set(["items", "destaques", "items-politica", "destaques-politica", "items-esportes", "destaques-esportes", "items-negocios", "destaques-negocios", "items-investimentos", "destaques-investimentos"]);
const DOCS = new Set([...LISTAS, "meta"]);
const CAMPOS_ORDEM = new Set(["coletado", "data", "publicado"]);
const OPS = new Set(["<", "<=", ">", ">="]);

const json = (dados, status = 200) =>
  new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

const agoraIso = () => new Date().toISOString();

function pagina(titulo, corpo, status) {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo} · Lookout</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><style>
:root{color-scheme:light dark;--bg:#f7f7f8;--fg:#18181b;--mut:#6b6b76;--card:#fff;--line:#e4e4e7;--pri:#5b4bdb}
@media (prefers-color-scheme:dark){:root{--bg:#111114;--fg:#ececf1;--mut:#9a9aa6;--card:#1b1b20;--line:#2c2c33;--pri:#9d92ff}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px;box-sizing:border-box}
main{max-width:420px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px}
h1{font-size:20px;margin:0 0 8px}p{color:var(--mut);margin:8px 0}a{color:var(--pri)}
.marca{font-weight:700;letter-spacing:.02em;color:var(--pri);font-size:13px;text-transform:uppercase;margin-bottom:12px}
</style></head><body><main><div class="marca">Lookout</div>${corpo}</main></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Lista de convidados guardada na memória do Worker por 60 s, para não ir ao banco a cada requisição.
// Quem é removido da lista perde o acesso em no máximo 1 minuto (mais o tempo da sincronia do espelho,
// que o admin dispara na hora ao remover alguém).
// A leitura vai primeiro ao espelho, que já devolve as seções da pessoa; sem espelho, ao D1 como antes.
const convidados = new Map();
const CONVITE_TTL = 60_000;
async function buscarConvidado(env, email) {
  const c = convidados.get(email);
  if (c && Date.now() - c.em < CONVITE_TTL) return c.u;
  let u;
  const e = await convidadoNoEspelho(env, email);
  if (e) {
    u = e.usuario;
    guardarSecoes(email, e.secoes);
  } else {
    const t0 = Date.now();
    u = await env.DB.prepare("SELECT email, nome, ultimo_acesso FROM usuarios WHERE email = ?").bind(email).first();
    logD1(env, "convidado", Date.now() - t0);
  }
  if (convidados.size > 500) convidados.clear();
  convidados.set(email, { u, em: Date.now() });
  // marca o último acesso no máximo uma vez por hora, fora do caminho da resposta
  const umaHora = new Date(Date.now() - 3600_000).toISOString();
  if (u && (!u.ultimo_acesso || u.ultimo_acesso < umaHora)) {
    u.ultimo_acesso = agoraIso();
    const gravar = env.DB.prepare("UPDATE usuarios SET ultimo_acesso = ? WHERE email = ?").bind(u.ultimo_acesso, email).run();
    if (env.ctx) env.ctx.waitUntil(gravar); else await gravar;
  }
  return u;
}

async function quemEntra(request, env, conferirLista = true) {
  if (!env.DEV_EMAIL && !accessConfigurado(env)) return { erro: "config" };
  const email = await emailDoAccess(request, env);
  if (!email) return { erro: "login" };
  const admin = email === String(env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (!conferirLista) return { email, admin, nome: "" };
  const u = await buscarConvidado(env, email);
  if (!admin && !u) return { erro: "convite", email };
  return { email, admin, nome: u?.nome || "", secoes: await secoesDe(env, email, admin) };
}

// Respostas das listas guardadas em duas camadas: memória do isolate por 30 s e cache de borda da Cloudflare por 3 min.
// São iguais para todo mundo e só mudam quando as coletas rodam. O cache de borda é o que segura as leituras do D1
// quando há várias pessoas ou vários isolates: a permissão de seção é conferida antes, por usuário, e não entra aqui.
// Cada camada guarda o JSON já como texto e um ETag dele: a resposta sai sem parse nem stringify, e o navegador
// revalida com If-None-Match (cache-control: private, no-cache) e recebe 304 quando nada mudou.
const respostas = new Map();
const RESPOSTA_TTL = 30_000;
const BORDA_TTL = 180;

// ETag curto: tamanho e FNV-1a de 32 bits do texto, os dois em base 36.
export function etagDe(txt) {
  let h = 0x811c9dc5;
  for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `"${txt.length.toString(36)}-${(h >>> 0).toString(36)}"`;
}
// A borda da Cloudflare pode trocar o ETag forte por fraco (W/"...") ao comprimir: compara sem o W/.
const semFraco = (e) => e.trim().replace(/^W\//, "");
function bateEtag(request, etag) {
  const h = request && request.headers.get("if-none-match");
  if (!h) return false;
  if (h.trim() === "*") return true;
  const alvo = semFraco(etag);
  return h.split(",").some((e) => semFraco(e) === alvo);
}
function responderTexto(request, txt, etag) {
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-cache", etag };
  if (bateEtag(request, etag)) return new Response(null, { status: 304, headers: { "cache-control": headers["cache-control"], etag } });
  return new Response(txt, { status: 200, headers });
}
async function comCache(chave, gerar, request) {
  const c = respostas.get(chave);
  if (c && Date.now() - c.em < RESPOSTA_TTL) return responderTexto(request, c.txt, c.etag);
  const borda = typeof caches !== "undefined" ? caches.default : null;
  const chaveBorda = new Request("https://cache.lookout.local/" + encodeURIComponent(chave));
  if (borda) {
    try {
      const r = await borda.match(chaveBorda);
      if (r) {
        const txt = await r.text();
        const etag = r.headers.get("x-lookout-etag") || etagDe(txt);
        respostas.set(chave, { txt, etag, em: Date.now() });
        return responderTexto(request, txt, etag);
      }
    } catch (e) {}
  }
  const txt = JSON.stringify(await gerar());
  const etag = etagDe(txt);
  if (respostas.size > 200) respostas.clear();
  respostas.set(chave, { txt, etag, em: Date.now() });
  if (borda) {
    try { await borda.put(chaveBorda, new Response(txt, { headers: { "content-type": "application/json", "cache-control": "s-maxage=" + BORDA_TTL, "x-lookout-etag": etag } })); } catch (e) {}
  }
  return responderTexto(request, txt, etag);
}

function linhaParaDoc(r) {
  return { id: r.id, data: JSON.parse(r.data) };
}

// Leitura de lista e de documento: espelho em São Paulo primeiro, D1 se ele não responder.
// Log { leitura, rotulo, ms } amostrado (1 em 20) quando dá certo no espelho e sempre quando cai no D1 (src/espelho.js).
async function lerLinhas(env, sql, args, rotulo = "lista") {
  const e = await doEspelho(env, rotulo, (s) => s.consultar(sql, args));
  if (e) return e.linhas;
  const t0 = Date.now();
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  logD1(env, rotulo, Date.now() - t0);
  return results;
}
async function lerLinha(env, c, id) {
  const e = await doEspelho(env, "doc", (s) => s.doc(c, id));
  if (e) return e.linha;
  const t0 = Date.now();
  const r = await env.DB.prepare("SELECT id, data FROM docs WHERE collection = ? AND id = ?").bind(c, id).first();
  logD1(env, "doc", Date.now() - t0);
  return r;
}

async function consultar(url, env, quem, request) {
  const c = url.searchParams.get("c");
  if (!LISTAS.has(c)) return json({ erro: "collection" }, 400);
  if (!libera(quem.secoes, secaoDe(c))) return json({ erro: "secao" }, 403);
  const ordem = url.searchParams.get("order") || "coletado";
  if (!CAMPOS_ORDEM.has(ordem)) return json({ erro: "order" }, 400);
  const dir = url.searchParams.get("dir") === "asc" ? "ASC" : "DESC";
  const limite = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "100", 10) || 100, 1), 500);
  const campoOrdem = ordem === "coletado" ? "coletado" : `json_extract(data, '$.${ordem}')`;
  let sql = "SELECT id, data FROM docs WHERE collection = ?";
  const args = [c];
  const wf = url.searchParams.get("wf");
  if (wf) {
    const wo = url.searchParams.get("wo");
    if (!CAMPOS_ORDEM.has(wf) || !OPS.has(wo)) return json({ erro: "where" }, 400);
    sql += ` AND ${wf === "coletado" ? "coletado" : `json_extract(data, '$.${wf}')`} ${wo} ?`;
    args.push(url.searchParams.get("wv") || "");
  }
  // Desempate fixo (coletado e id): sem ele, itens com o mesmo valor no campo da ordem podiam vir em ordem diferente
  // do D1 e do espelho, e a paginação por "mais antigos" pulava ou repetia item. Mesmo SQL nos dois lados.
  sql += ordem === "coletado" ? ` ORDER BY coletado ${dir}, id DESC LIMIT ?` : ` ORDER BY ${campoOrdem} ${dir}, coletado DESC, id DESC LIMIT ?`;
  args.push(limite);
  return comCache(sql + "|" + args.join("|"), async () => {
    const results = await lerLinhas(env, sql, args);
    return { docs: results.map(linhaParaDoc) };
  }, request);
}

async function lerDoc(url, env, quem, request) {
  const c = url.searchParams.get("c");
  const id = url.searchParams.get("id") || "";
  if (!DOCS.has(c) || !id) return json({ erro: "doc" }, 400);
  // Convidado só lê documentos de meta conhecidos e das seções liberadas; o admin lê qualquer um.
  if (!quem.admin && !libera(quem.secoes, secaoDe(c, id))) return json({ erro: "secao" }, 403);
  return comCache("doc|" + c + "|" + id, async () => {
    const r = await lerLinha(env, c, id);
    return r ? { existe: true, ...linhaParaDoc(r) } : { existe: false, id };
  }, request);
}

// Favoritos e listas: leitura pelo espelho (D1 de reserva); gravação no D1 e, depois que ela deu certo,
// write-through no espelho fora do caminho da resposta.
async function favoritos(request, env, quem, idFav) {
  const col = "favs/" + quem.email;
  if (request.method === "GET" && !idFav) {
    const results = await lerLinhas(env, "SELECT id, data FROM docs WHERE collection = ? ORDER BY atualizado DESC LIMIT 2000", [col], "favs");
    return json({ docs: results.map(linhaParaDoc) });
  }
  if (!idFav || idFav.length > 200) return json({ erro: "id" }, 400);
  if (request.method === "PUT") {
    const corpo = await request.text();
    if (corpo.length > 20000) return json({ erro: "grande" }, 413);
    let dados;
    try { dados = JSON.parse(corpo); } catch { return json({ erro: "json" }, 400); }
    const data = JSON.stringify(dados), atualizado = agoraIso();
    await env.DB.prepare(
      "INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES (?, ?, ?, '', ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = excluded.atualizado"
    ).bind(col, idFav, data, atualizado).run();
    gravarNoEspelho(env, [{ collection: col, id: idFav, data, coletado: "", atualizado }]);
    return json({ ok: true });
  }
  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM docs WHERE collection = ? AND id = ?").bind(col, idFav).run();
    removerDoEspelho(env, [{ collection: col, id: idFav }]);
    return json({ ok: true });
  }
  return json({ erro: "metodo" }, 405);
}

// Listas de acompanhamento (Investimentos): nome e papéis, uma collection por pessoa.
// B3: quatro caracteres e o número; o segundo pode ser dígito (B3SA3, BDRs como M1TA34).
// EUA: de 1 a 5 letras, com a classe depois do ponto quando houver (AAPL, F, BRK.B).
const PAPEL_OK = /^(?:[A-Z][A-Z0-9]{3}\d{1,2}|[A-Z]{1,5}(?:\.[A-Z])?)$/;
const LISTA_ID_OK = /^[a-z0-9-]{1,60}$/;
const LISTAS_MAX = 30;
const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "lista";

// Confere o corpo de uma lista. Devolve { nome, papeis } ou { erro }.
export function validarLista(b) {
  if (!b || typeof b !== "object") return { erro: "corpo" };
  const nome = String(b.nome ?? "").replace(/\s+/g, " ").trim();
  if (!nome) return { erro: "Dê um nome à lista." };
  if (nome.length > 40) return { erro: "O nome passa de 40 caracteres." };
  const papeis = b.papeis ?? [];
  if (!Array.isArray(papeis)) return { erro: "papeis" };
  if (papeis.length > 60) return { erro: "Uma lista guarda até 60 papéis." };
  const vistos = new Set();
  for (const p of papeis) {
    if (typeof p !== "string" || !PAPEL_OK.test(p)) return { erro: `Papel inválido: ${String(p).slice(0, 12)}` };
    if (vistos.has(p)) return { erro: `${p} aparece duas vezes.` };
    vistos.add(p);
  }
  return { nome, papeis: [...vistos] };
}

export async function listas(request, env, quem, idLista) {
  if (!libera(quem.secoes, "investimentos")) return json({ erro: "secao" }, 403);
  const col = "listas/" + quem.email;
  if (request.method === "GET" && !idLista) {
    const results = await lerLinhas(env, "SELECT id, data FROM docs WHERE collection = ? ORDER BY json_extract(data, '$.criado') LIMIT ?", [col, LISTAS_MAX], "listas");
    return json({ docs: results.map(linhaParaDoc) });
  }
  const lerCorpo = async () => {
    const corpo = await request.text();
    if (corpo.length > 8000) return { erro: "grande", status: 413 };
    try { return validarLista(JSON.parse(corpo)); } catch { return { erro: "json" }; }
  };
  const gravar = async (id, doc) => {
    const data = JSON.stringify(doc);
    await env.DB.prepare(
      "INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES (?, ?, ?, '', ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = excluded.atualizado"
    ).bind(col, id, data, doc.atualizado).run();
    gravarNoEspelho(env, [{ collection: col, id, data, coletado: "", atualizado: doc.atualizado }]);
  };
  if (request.method === "POST" && !idLista) {
    const v = await lerCorpo();
    if (v.erro) return json({ erro: v.erro }, v.status || 400);
    const n = await env.DB.prepare("SELECT count(*) AS n FROM docs WHERE collection = ?").bind(col).first();
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
    await gravar(id, doc);
    return json({ ok: true, id, data: doc });
  }
  if (!idLista || !LISTA_ID_OK.test(idLista)) return json({ erro: "id" }, 400);
  if (request.method === "PUT") {
    const v = await lerCorpo();
    if (v.erro) return json({ erro: v.erro }, v.status || 400);
    const atual = await env.DB.prepare("SELECT data FROM docs WHERE collection = ? AND id = ?").bind(col, idLista).first();
    if (!atual) return json({ erro: "Lista não encontrada." }, 404);
    const agora = agoraIso();
    const doc = { nome: v.nome, papeis: v.papeis, criado: JSON.parse(atual.data).criado || agora, atualizado: agora };
    await gravar(idLista, doc);
    return json({ ok: true, id: idLista, data: doc });
  }
  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM docs WHERE collection = ? AND id = ?").bind(col, idLista).run();
    removerDoEspelho(env, [{ collection: col, id: idLista }]);
    return json({ ok: true });
  }
  return json({ erro: "metodo" }, 405);
}

// Painel inicial (aba Início): ordem, tamanho e o que aparece, um doc por pessoa em prefs/<email>, id "painel".
// Mesmo caminho dos favoritos: leitura pelo espelho (D1 de reserva), gravação no D1 e write-through no espelho.
// Catálogo, padrão e validação em src/painel.js.
async function prefsPainel(request, env, quem) {
  const col = "prefs/" + quem.email;
  const secoes = quem.secoes ?? null;
  if (request.method === "GET") {
    const linhas = await lerLinhas(env, "SELECT id, data FROM docs WHERE collection = ? AND id = ?", [col, "painel"], "prefs");
    let salvo = null;
    try { salvo = linhas[0] ? JSON.parse(linhas[0].data) : null; } catch { salvo = null; }
    return json(respostaPainel(salvo, secoes));
  }
  if (request.method === "PUT") {
    const corpo = await request.text();
    if (corpo.length > 4000) return json({ erro: "grande" }, 413);
    let b;
    try { b = JSON.parse(corpo); } catch { return json({ erro: "json" }, 400); }
    const v = validarPainel(b, secoes);
    if (v.erro) return json({ erro: v.erro }, 400);
    const doc = { widgets: v.widgets, atualizado: agoraIso() };
    const data = JSON.stringify(doc);
    await env.DB.prepare(
      "INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES (?, 'painel', ?, '', ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = excluded.atualizado"
    ).bind(col, data, doc.atualizado).run();
    gravarNoEspelho(env, [{ collection: col, id: "painel", data, coletado: "", atualizado: doc.atualizado }]);
    return json({ ok: true, ...respostaPainel(doc, secoes) });
  }
  return json({ erro: "metodo" }, 405);
}

// Widget "Hoje no Lookout": notícias que entraram nas últimas 24 h e a última rodada de cada seção liberada.
// Uma ida só ao banco: os docs meta/status* e a contagem por collection, juntos num UNION ALL. A consulta começa
// por "SELECT id, data FROM docs", que é o que o espelho aceita (só leitura na tabela docs); nas linhas da
// contagem, "id" é a collection e "data" o número. O corte anda de 10 em 10 min para a resposta caber no cache.
const ITENS_DA_SECAO = (s) => (s === "tech" ? "items" : "items-" + s);
const STATUS_DA_SECAO = (s) => (s === "tech" ? "status" : "status-" + s);
async function painelHoje(env, quem, request) {
  const secs = SECOES.filter((s) => libera(quem.secoes ?? null, s));
  const corte = new Date(Math.floor(Date.now() / 600_000) * 600_000 - 86_400_000).toISOString();
  if (!secs.length) return json({ corte, secoes: [] });
  const marcas = (n, de) => Array.from({ length: n }, (_, k) => "?" + (de + k)).join(",");
  const sql = `SELECT id, data FROM docs WHERE collection = 'meta' AND id IN (${marcas(secs.length, 1)})`
    + ` UNION ALL SELECT collection AS id, count(*) AS data FROM docs WHERE collection IN (${marcas(secs.length, secs.length + 1)}) AND coletado >= ?${2 * secs.length + 1} GROUP BY collection`;
  const args = [...secs.map(STATUS_DA_SECAO), ...secs.map(ITENS_DA_SECAO), corte];
  return comCache("hoje|" + secs.join(",") + "|" + corte, async () => {
    const linhas = await lerLinhas(env, sql, args, "hoje");
    const por = new Map(linhas.map((r) => [r.id, r.data]));
    return {
      corte,
      secoes: secs.map((s) => {
        let st = {};
        try { st = JSON.parse(por.get(STATUS_DA_SECAO(s)) || "{}") || {}; } catch {}
        return { secao: s, n: Number(por.get(ITENS_DA_SECAO(s)) || 0), ultimaRodada: st.ultimaRodada || null, novosNaUltima: st.novosNaUltima ?? null };
      }),
    };
  }, request);
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Rendimento das fontes nos últimos 10 dias (o tempo que os candidatos ficam no banco)
async function adminFontes(env) {
  const { results } = await env.DB.prepare(
    `SELECT c.radar, c.fonte, c.feed, count(*) AS lidos,
       sum(c.status = 'publicado') AS publicados, sum(c.status = 'descartado') AS descartados, sum(c.status = 'novo') AS fila,
       sum(c.motivo = 'repetido') AS repetido, sum(c.motivo = 'promocional') AS promocional, sum(c.motivo = 'fora-do-tema') AS fora, sum(c.motivo = 'antigo') AS antigo, sum(c.motivo = 'raso') AS raso,
       f.erro, f.erros_seguidos
     FROM candidatos c LEFT JOIN feeds_estado f ON f.url = c.feed
     GROUP BY c.feed ORDER BY c.radar, publicados DESC`
  ).all();
  const { results: falhas } = await env.DB.prepare("SELECT radar, fonte, url AS feed, erro, erros_seguidos FROM feeds_estado WHERE erros_seguidos > 0 ORDER BY radar, fonte").all();
  return json({ fontes: results, falhas });
}

async function adminUsuarios(request, env, email) {
  if (request.method === "GET" && !email) {
    const { results } = await env.DB.prepare("SELECT email, nome, criado, ultimo_acesso FROM usuarios ORDER BY criado DESC").all();
    return json({ usuarios: results, admin: String(env.ADMIN_EMAIL || "").toLowerCase() });
  }
  if (request.method === "POST" && !email) {
    let b;
    try { b = await request.json(); } catch { return json({ erro: "json" }, 400); }
    const novo = String(b.email || "").trim().toLowerCase();
    const nome = String(b.nome || "").trim().slice(0, 80);
    if (!EMAIL_OK.test(novo) || novo.length > 200) return json({ erro: "E-mail inválido." }, 400);
    await env.DB.prepare("INSERT INTO usuarios (email, nome) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET nome = excluded.nome").bind(novo, nome).run();
    if (Array.isArray(b.grupos) && b.grupos.length) {
      const req = new Request("https://x/", { method: "PUT", body: JSON.stringify({ grupos: b.grupos }) });
      await adminMembro(req, env, novo);
    }
    return json({ ok: true });
  }
  if (request.method === "DELETE" && email) {
    const cols = ["favs/", "listas/", "prefs/"].map((p) => p + email.toLowerCase());
    // As chaves saem antes do DELETE para o espelho apagar as mesmas linhas logo depois
    const { results: chaves } = await env.DB.prepare("SELECT collection, id FROM docs WHERE collection IN (?, ?, ?)").bind(...cols).all();
    await env.DB.prepare("DELETE FROM usuarios WHERE email = ?").bind(email.toLowerCase()).run();
    for (const c of cols) await env.DB.prepare("DELETE FROM docs WHERE collection = ?").bind(c).run();
    removerDoEspelho(env, chaves);
    try { await env.DB.prepare("DELETE FROM usuario_grupo WHERE email = ?").bind(email.toLowerCase()).run(); } catch (e) {}
    return json({ ok: true });
  }
  return json({ erro: "metodo" }, 405);
}

// Caminho com "%" malformado não derruba o Worker: vira null e a rota responde 400.
const decodificar = (s) => { try { return decodeURIComponent(s); } catch { return null; } };
// Gravações com corpo JSON (listas, painel e admin) só aceitam application/json: formulário de outro site não consegue mandar.
const corpoJson = (request) => (request.method !== "POST" && request.method !== "PUT") || (request.headers.get("content-type") || "").toLowerCase().includes("application/json");

function servirAsset(request, env, caminho) {
  const u = new URL(request.url);
  u.pathname = caminho;
  return env.ASSETS.fetch(new Request(u.toString(), { headers: request.headers }));
}

export default {
  async fetch(request, env, ctx) {
    env = Object.assign({}, env, { ctx });
    const url = new URL(request.url);
    const p = url.pathname;

    if (p.startsWith("/seed/")) return new Response("Não encontrado", { status: 404 });

    // Arquivos estáticos (ícones, imagens) só precisam do login. A lista de convidados é conferida
    // na página principal, no /admin e na API, que é onde estão os dados.
    const estatico = p !== "/" && p !== "/index.html" && !p.startsWith("/api/") && !p.startsWith("/admin");
    const quem = await quemEntra(request, env, !estatico);
    if (quem.erro === "config")
      return pagina("Configuração pendente", "<h1>Falta ligar o login</h1><p>O Cloudflare Access ainda não foi configurado para este site. Assim que as variáveis ACCESS_TEAM_DOMAIN e ACCESS_AUD estiverem no painel, o acesso abre.</p>", 503);
    if (quem.erro === "login")
      return pagina("Entrar", '<h1>Faça login para continuar</h1><p>Sua sessão expirou ou não foi reconhecida.</p><p><a href="/">Entrar de novo</a></p>', 401);
    if (quem.erro === "convite") {
      if (p.startsWith("/api/")) return json({ erro: "convite" }, 403);
      return pagina("Só por convite", `<h1>Este espaço é só para convidados</h1><p>Você entrou como <strong>${esc(quem.email)}</strong>, que ainda não está na lista.</p><p>Se recebeu um convite em outro e-mail, <a href="/cdn-cgi/access/logout">saia</a> e entre com ele.</p>`, 403);
    }

    if (p === "/api/me") return json({ email: quem.email, nome: quem.nome, admin: quem.admin, secoes: quem.secoes ?? null, widgets: catalogoDe(quem.secoes ?? null).map((w) => w.id) });
    if (p === "/api/q" && request.method === "GET") return consultar(url, env, quem, request);
    if (p === "/api/doc" && request.method === "GET") return lerDoc(url, env, quem, request);
    if (p === "/api/mercado/atualizar" && request.method === "POST") {
      if (!libera(quem.secoes, "investimentos")) return json({ erro: "secao" }, 403);
      const painel = await pedirAtualizacao(env);
      if (!painel.aguarde) ctx.waitUntil(sincronizarEspelho(env));
      return json(painel);
    }
    if (p === "/api/favs" || p.startsWith("/api/favs/"))
      return favoritos(request, env, quem, p.length > 10 ? decodeURIComponent(p.slice(10)) : "");
    if (p === "/api/prefs/painel") {
      if (!corpoJson(request)) return json({ erro: "json" }, 415);
      return prefsPainel(request, env, quem);
    }
    if (p === "/api/painel/hoje" && request.method === "GET") return painelHoje(env, quem, request);
    if (p === "/api/listas" || p.startsWith("/api/listas/")) {
      const idLista = p.length > 12 ? decodificar(p.slice(12)) : "";
      if (idLista === null) return json({ erro: "id" }, 400);
      if (!corpoJson(request)) return json({ erro: "json" }, 415);
      return listas(request, env, quem, idLista);
    }

    if (p === "/admin" || p === "/admin.html" || p.startsWith("/api/admin/")) {
      if (!quem.admin) return p.startsWith("/api/") ? json({ erro: "admin" }, 403) : pagina("Sem permissão", "<h1>Área do administrador</h1><p>Só quem cuida do Lookout acessa esta página.</p><p><a href=\"/\">Voltar ao radar</a></p>", 403);
      if (p.startsWith("/api/admin/") && p !== "/api/admin/cvm" && !corpoJson(request)) return json({ erro: "json" }, 415);
      const resto = (n) => decodificar(p.slice(n));
      if ((p.startsWith("/api/admin/usuarios/") && resto(20) === null) || (p.startsWith("/api/admin/grupos/") && resto(18) === null) || (p.startsWith("/api/admin/membros/") && resto(19) === null))
        return json({ erro: "id" }, 400);
      // Mudança em convidados, grupos ou membros vai para o espelho logo depois da resposta, sem esperar o cron.
      const comPessoas = (r) => { if (request.method !== "GET") ctx.waitUntil(r.catch(() => {}).then(() => sincronizarEspelho(env, { soPessoas: true }))); return r; };
      if (p === "/api/admin/usuarios") return comPessoas(adminUsuarios(request, env, ""));
      if (p.startsWith("/api/admin/usuarios/")) return comPessoas(adminUsuarios(request, env, resto(20)));
      if (p === "/api/admin/fontes") return adminFontes(env);
      if (p === "/api/admin/grupos") return comPessoas(adminGrupos(request, env, ""));
      if (p.startsWith("/api/admin/grupos/")) return comPessoas(adminGrupos(request, env, resto(18)));
      if (p.startsWith("/api/admin/membros/")) return comPessoas(adminMembro(request, env, resto(19)));
      if (p === "/api/admin/espelho") return adminEspelho(request, env);
      if (p === "/api/admin/custos") return json(await adminCustos(env));
      if (p === "/api/admin/sonda") return adminSonda(request, env);
      if (p === "/api/admin/cvm" && request.method === "POST") {
        try { return json({ ok: true, anterior: await etapaAnoAnterior(env), corrente: await etapaAnoCorrente(env) }); }
        catch (e) { return json({ ok: false, erro: String(e.message || e) }, 500); }
      }
      if (p.startsWith("/api/admin/")) return json({ erro: "rota" }, 404);
      return servirAsset(request, env, "/admin");
    }

    if (p.startsWith("/api/")) return json({ erro: "rota" }, 404);
    return env.ASSETS.fetch(request);
  },

  // A cada minuto: importa o histórico (enquanto houver), lê alguns feeds RSS e, uma vez por hora, apaga o que venceu.
  // Por último copia para o espelho de São Paulo o que mudou no D1.
  async scheduled(evento, env) {
    const minuto = new Date(evento.scheduledTime || Date.now()).getUTCMinutes();
    try { await coletar(env); } catch (e) { console.error("coleta", e); }
    try { await cronMercado(env, evento.scheduledTime || Date.now()); } catch (e) { console.error("mercado", e); }
    try { await cronB3(env, evento.scheduledTime || Date.now()); } catch (e) { console.error("b3", e); }
    try { await cronEua(env, evento.scheduledTime || Date.now()); } catch (e) { console.error("eua", e); }
    try { await cronCvm(env, evento.scheduledTime || Date.now()); } catch (e) { console.error("cvm", e); }
    try { await cronSonda(env); } catch (e) { console.error("sonda", e); }
    if (minuto === 7) {
      // Índice que a coleta precisa (barato: só confere o catálogo). Fica aqui para valer mesmo onde o schema.sql não foi reaplicado.
      try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS docs_url ON docs (json_extract(data, '$.url'))").run(); } catch (e) { console.error("indice", e); }
      try { console.log("limpeza", JSON.stringify(await limpar(env))); } catch (e) { console.error("limpeza", e); }
    }
    try { await importarHistorico(env); } catch (e) { console.error("historico", e); }
    await sincronizarEspelho(env);
  },
};

// Importa o histórico em partes (public/seed/NNN.json), uma por minuto, até acabar.
async function importarHistorico(env) {
  {
    const estado = await env.DB.prepare("SELECT data FROM docs WHERE collection = '_sistema' AND id = 'seed'").first();
    const s = estado ? JSON.parse(estado.data) : { parte: 0, fim: false };
    if (s.fim) return;
    const idx = await env.ASSETS.fetch(new Request("https://lookout.local/seed/index.json"));
    if (!idx.ok) return;
    const { partes } = await idx.json();
    if (s.parte >= partes.length) {
      await salvarEstado(env, { ...s, fim: true, terminou: agoraIso() });
      return;
    }
    const r = await env.ASSETS.fetch(new Request(`https://lookout.local/seed/${partes[s.parte]}`));
    if (!r.ok) return;
    const docs = await r.json();
    const stmt = env.DB.prepare("INSERT OR IGNORE INTO docs (collection, id, data, coletado) VALUES (?, ?, ?, ?)");
    for (let i = 0; i < docs.length; i += 50) {
      await env.DB.batch(docs.slice(i, i + 50).map((d) => stmt.bind(d.c, d.id, JSON.stringify(d.data), d.k || "")));
    }
    await salvarEstado(env, { parte: s.parte + 1, fim: s.parte + 1 >= partes.length, atualizado: agoraIso() });
  }
}

async function salvarEstado(env, s) {
  await env.DB.prepare(
    "INSERT INTO docs (collection, id, data) VALUES ('_sistema', 'seed', ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
  ).bind(JSON.stringify(s)).run();
}
