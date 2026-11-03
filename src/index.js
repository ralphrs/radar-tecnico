import { emailDoAccess, accessConfigurado } from "./auth.js";
import { coletar, limpar, garantirColunas, ehReddit, REDDIT } from "./coleta.js";
import { FEEDS } from "./feeds.js";
import { cronMercado, pedirAtualizacao, cronB3 } from "./mercado.js";
import { cronEua } from "./eua.js";
import { cronCvm, etapaAnoAnterior, etapaAnoCorrente } from "./cvm.js";
import { adminCustos } from "./custos.js";
import { secoesDe, secaoDe, libera, adminGrupos, adminMembro, guardarSecoes, SECOES } from "./grupos.js";
import { cronSonda, adminSonda } from "./sonda.js";
import { doEspelho, convidadoNoEspelho, sincronizarEspelho, adminEspelho, logD1, gravarNoEspelho, removerDoEspelho } from "./espelho.js";
import { catalogoDe, validarPainel, respostaPainel } from "./painel.js";
import { rotaPapel, cronPapel, ID_OK as PAPEL_ID_OK } from "./papel.js";
import { BDR_DE_US, US_DE_BDR } from "./bdr.js";
import { rotaCarteira, limparCacheCarteira } from "./carteira.js";
import { rotaListas, sincronizarListasCarteira, cronListas } from "./listas.js";
import { rotaLeitura, cronLeitura, lerFundamentos } from "./leitura.js";
// Radar de dividendos: o mesmo arquivo que a página carrega (critérios, avisos e validação dos filtros salvos)
import "../public/radar-filtro.js";
import { validarTabelas, mesclarTabelas, respostaTabelas, validarLayout, respostaLayout } from "./prefs.js";
const RF = globalThis.RadarFiltro;

// O Durable Object do espelho de leitura em São Paulo (src/espelho.js) precisa sair exportado daqui.
export { Espelho } from "./espelho.js";

// Collections que a página pode ler. Tudo o mais é negado.
const LISTAS = new Set(["items", "destaques", "items-politica", "destaques-politica", "items-esportes", "destaques-esportes", "items-negocios", "destaques-negocios", "items-investimentos", "destaques-investimentos"]);
// hist: fichas de papel (src/papel.js), um doc por papel ("US:NVDA", "BR:PETR4"); a página lê pela /api/papel.
const DOCS = new Set([...LISTAS, "meta", "hist"]);
const CAMPOS_ORDEM = new Set(["coletado", "data", "publicado"]);
const OPS = new Set(["<", "<=", ">", ">="]);

const json = (dados, status = 200) =>
  new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

const agoraIso = () => new Date().toISOString();

function pagina(titulo, corpo, status, extraHead = "") {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo} · Lookout</title><link rel="icon" href="/favicon.svg" type="image/svg+xml">${extraHead}<style>
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

// Listas de acompanhamento (Investimentos): manuais, por regra e automáticas da carteira, mover e copiar papel,
// ordem de exibição e recálculo. Tudo em src/listas.js; as regras leem meta/* pelo espelho e as fichas guardadas.
export { validarLista } from "./listas.js";
export async function listas(request, env, quem, idLista) {
  if (!libera(quem.secoes, "investimentos")) return json({ erro: "secao" }, 403);
  return rotaListas(request, env, quem, idLista, { lerLinhas, lerLinha, lerFundamentos, gravarNoEspelho, removerDoEspelho });
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

// Estado das tabelas (doc "tabelas") e colunas recolhidas (doc "layout"), em prefs/<email>. Regras em src/prefs.js.
// Leitura pelo espelho como o painel; o PUT de tabelas junta com o que está no D1 (lido do D1, não do espelho).
async function prefsTela(request, env, quem, docId) {
  const col = "prefs/" + quem.email;
  const ler = async (doEspelho) => {
    let linha = null;
    if (doEspelho) linha = (await lerLinhas(env, "SELECT id, data FROM docs WHERE collection = ? AND id = ?", [col, docId], "prefs"))[0] || null;
    else linha = await env.DB.prepare("SELECT id, data FROM docs WHERE collection = ? AND id = ?").bind(col, docId).first();
    try { return linha ? JSON.parse(linha.data) : null; } catch { return null; }
  };
  const resposta = (salvo) => (docId === "tabelas" ? respostaTabelas(salvo) : respostaLayout(salvo));
  if (request.method === "GET") return json(resposta(await ler(true)));
  if (request.method === "PUT") {
    const corpo = await request.text();
    if (corpo.length > (docId === "tabelas" ? 40000 : 200)) return json({ erro: "grande" }, 413);
    let b;
    try { b = JSON.parse(corpo); } catch { return json({ erro: "json" }, 400); }
    const agora = agoraIso();
    let doc;
    if (docId === "tabelas") {
      const v = validarTabelas(b);
      if (v.erro) return json({ erro: v.erro }, 400);
      doc = { tabelas: mesclarTabelas(await ler(false), v.tabelas, agora), atualizado: agora };
    } else {
      const v = validarLayout(b);
      if (v.erro) return json({ erro: v.erro }, 400);
      doc = { ...v.layout, atualizado: agora };
    }
    const data = JSON.stringify(doc);
    await env.DB.prepare(
      "INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES (?, ?, ?, '', ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = excluded.atualizado"
    ).bind(col, docId, data, agora).run();
    gravarNoEspelho(env, [{ collection: col, id: docId, data, coletado: "", atualizado: agora }]);
    return json({ ok: true, ...resposta(doc) });
  }
  return json({ erro: "metodo" }, 405);
}

// Radar de dividendos (visão Radar de Investimentos): filtros salvos de cada pessoa em prefs/<email>, id "radar",
// { filtros: [...], padrao, atualizado }. Mesmo caminho do painel; validação e padrão de fábrica em public/radar-filtro.js.
async function prefsRadar(request, env, quem) {
  if (!libera(quem.secoes, "investimentos")) return json({ erro: "secao" }, 403);
  const col = "prefs/" + quem.email;
  if (request.method === "GET") {
    const linhas = await lerLinhas(env, "SELECT id, data FROM docs WHERE collection = ? AND id = ?", [col, "radar"], "prefs");
    let salvo = null;
    try { salvo = linhas[0] ? JSON.parse(linhas[0].data) : null; } catch { salvo = null; }
    return json(RF.respostaPrefs(salvo));
  }
  if (request.method === "PUT") {
    const corpo = await request.text();
    if (corpo.length > 12000) return json({ erro: "grande" }, 413);
    let b;
    try { b = JSON.parse(corpo); } catch { return json({ erro: "json" }, 400); }
    const v = RF.validarPrefs(b);
    if (v.erro) return json({ erro: v.erro }, 400);
    const doc = { filtros: v.filtros, padrao: v.padrao, atualizado: agoraIso() };
    const data = JSON.stringify(doc);
    await env.DB.prepare(
      "INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES (?, 'radar', ?, '', ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = excluded.atualizado"
    ).bind(col, data, doc.atualizado).run();
    gravarNoEspelho(env, [{ collection: col, id: "radar", data, coletado: "", atualizado: doc.atualizado }]);
    return json({ ok: true, ...RF.respostaPrefs(doc) });
  }
  return json({ erro: "metodo" }, 405);
}

// Múltiplos (P/L, P/VP, DY, dividendo 12m, variação em 1 ano) das fichas de papel já guardadas em `hist`, compactos,
// para o Radar filtrar ações da B3 e dos EUA. Igual para todo mundo: cache de 30 s no isolate e 3 min na borda.
async function fundamentos(env, quem, request) {
  if (!libera(quem.secoes, "investimentos")) return json({ erro: "secao" }, 403);
  const janela = Math.floor(Date.now() / 600_000);
  return comCache("fundamentos|" + janela, () => lerFundamentos(env), request);
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

// Ficha do papel: lê `hist` pelo espelho (D1 de reserva) e, se faltar ou tiver mais de 24 h, busca nas fontes,
// grava no D1 e empurra ao espelho. Regras e fontes em src/papel.js. Sem cache de borda: a resposta muda com o token
// (o admin vê quais secrets faltam) e o próprio `hist` já é o cache de 24 h.
async function fichaPapel(url, env, quem) {
  if (!libera(quem.secoes, "investimentos")) return json({ erro: "secao" }, 403);
  const id = String(url.searchParams.get("id") || "").toUpperCase();
  if (!PAPEL_ID_OK.test(id)) return json({ erro: "id" }, 400);
  const ler = async (i) => { const r = await lerLinha(env, "hist", i); return r ? JSON.parse(r.data) : null; };
  const r = await rotaPapel(env, quem, id, { ler, gravarNoEspelho });
  // Listagem cruzada (BDR <-> EUA): a página só mostra se o outro papel estiver em meta/b3 ou meta/eua
  const [m, t] = id.split(":");
  const outro = m === "US" ? BDR_DE_US[t] && "BR:" + BDR_DE_US[t] : US_DE_BDR[t] && "US:" + US_DE_BDR[t];
  if (outro) r.cruzado = outro;
  return json(r);
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Rendimento das fontes nos últimos 10 dias (o tempo que os candidatos ficam no banco).
// semCandidatos: feeds de src/feeds.js que ainda não trouxeram nada (subreddit novo, feed bloqueado), com o estado deles.
async function adminFontes(env) {
  await garantirColunas(env);
  const { results } = await env.DB.prepare(
    `SELECT c.radar, c.fonte, c.feed, count(*) AS lidos,
       sum(c.status = 'publicado') AS publicados, sum(c.status = 'descartado') AS descartados, sum(c.status = 'novo') AS fila,
       sum(c.motivo = 'repetido') AS repetido, sum(c.motivo = 'promocional') AS promocional, sum(c.motivo = 'fora-do-tema') AS fora, sum(c.motivo = 'antigo') AS antigo, sum(c.motivo = 'raso') AS raso,
       f.erro, f.erros_seguidos, f.seguidos_403, f.ultima_checagem, f.ultimo_ok
     FROM candidatos c LEFT JOIN feeds_estado f ON f.url = c.feed
     GROUP BY c.feed ORDER BY c.radar, publicados DESC`
  ).all();
  const { results: estados } = await env.DB.prepare("SELECT radar, fonte, url AS feed, erro, erros_seguidos, seguidos_403, ultima_checagem, ultimo_ok FROM feeds_estado").all();
  const falhas = estados.filter((f) => f.erros_seguidos > 0).sort((a, b) => a.radar.localeCompare(b.radar) || a.fonte.localeCompare(b.fonte));
  const comCandidatos = new Set(results.map((r) => r.feed));
  const porUrl = new Map(estados.map((e) => [e.feed, e]));
  const semCandidatos = FEEDS.filter(([, , , url]) => !comCandidatos.has(url)).map(([radar, fonte, , url, tipo]) => {
    const e = porUrl.get(url) || {};
    return { radar, fonte, feed: url, tipo: tipo || "rss", erro: e.erro || "", erros_seguidos: e.erros_seguidos || 0, seguidos_403: e.seguidos_403 || 0, ultima_checagem: e.ultima_checagem || "", ultimo_ok: e.ultimo_ok || "" };
  });
  return json({ fontes: results.map((r) => ({ ...r, tipo: ehReddit(r.feed) ? "reddit" : "rss" })), falhas, semCandidatos, bloqueio403: REDDIT.BLOQUEIO_403 });
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
    // carteira/<email>: os três docs cifrados da Minha carteira saem junto (sem abrir); leitura/<email>, a Leitura do dia
    const cols = ["favs/", "listas/", "prefs/", "carteira/", "leitura/"].map((p) => p + email.toLowerCase());
    // As chaves saem antes do DELETE para o espelho apagar as mesmas linhas logo depois
    const { results: chaves } = await env.DB.prepare("SELECT collection, id FROM docs WHERE collection IN (?, ?, ?, ?, ?)").bind(...cols).all();
    await env.DB.prepare("DELETE FROM usuarios WHERE email = ?").bind(email.toLowerCase()).run();
    for (const c of cols) await env.DB.prepare("DELETE FROM docs WHERE collection = ?").bind(c).run();
    removerDoEspelho(env, chaves);
    limparCacheCarteira(email.toLowerCase());
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

    // Página do convite, pública: é o que o WhatsApp e o e-mail visitam para montar a prévia com o logotipo.
    // Não tem dado nenhum, só o cartão e o botão de entrar. O Access precisa de uma política Bypass em /convite*.
    if (p === "/convite" || p === "/convite.png") {
      if (p === "/convite.png") return env.ASSETS.fetch(request);
      const base = url.origin;
      const og = `<meta property="og:type" content="website"><meta property="og:site_name" content="Lookout"><meta property="og:title" content="Lookout">` +
        `<meta property="og:description" content="Radar pessoal de notícias: tech, negócios, investimentos, política e esportes, atualizado o dia todo. Só para convidados."><meta property="og:url" content="${base}/convite">` +
        `<meta property="og:image" content="${base}/convite.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">`;
      const r = pagina("Convite", `<h1>Você foi convidado para o Lookout</h1><p>Radar pessoal de notícias: tech, negócios, investimentos, política e esportes, atualizado o dia todo.</p><p>Entre com o Google ou peça um código no e-mail que recebeu o convite.</p><p><a href="/" style="display:inline-block;margin-top:8px;padding:10px 16px;border-radius:8px;background:var(--pri);color:#fff;text-decoration:none;font-weight:600">Entrar no Lookout</a></p>`, 200, og);
      return new Response(r.body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });
    }

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
    if (p === "/api/prefs/tabelas" || p === "/api/prefs/layout") {
      if (!corpoJson(request)) return json({ erro: "json" }, 415);
      return prefsTela(request, env, quem, p === "/api/prefs/tabelas" ? "tabelas" : "layout");
    }
    if (p === "/api/painel/hoje" && request.method === "GET") return painelHoje(env, quem, request);
    if (p === "/api/prefs/radar") {
      if (!corpoJson(request)) return json({ erro: "json" }, 415);
      return prefsRadar(request, env, quem);
    }
    if (p === "/api/radar/fundamentos" && request.method === "GET") return fundamentos(env, quem, request);
    // Leitura do dia (src/leitura.js): pessoal, cifrada, sem cache
    if (p === "/api/leitura" || p === "/api/leitura/gerar") {
      if (!libera(quem.secoes, "investimentos")) return json({ erro: "secao" }, 403);
      if (!corpoJson(request)) return json({ erro: "json" }, 415);
      return rotaLeitura(request, env, quem, p === "/api/leitura" ? "" : "gerar", { lerLinhas, lerLinha, gravarNoEspelho });
    }
    if (p === "/api/papel" && request.method === "GET") return fichaPapel(url, env, quem);
    if (p === "/api/listas" || p.startsWith("/api/listas/")) {
      const idLista = p.length > 12 ? decodificar(p.slice(12)) : "";
      if (idLista === null) return json({ erro: "id" }, 400);
      if (!corpoJson(request)) return json({ erro: "json" }, 415);
      return listas(request, env, quem, idLista);
    }

    // Minha carteira (src/carteira.js): extratos da B3 cifrados, posições, proventos e meta. Pessoal, sem cache de borda.
    if (p === "/api/carteira" || p.startsWith("/api/carteira/")) {
      if (!libera(quem.secoes, "investimentos")) return json({ erro: "secao" }, 403);
      if (!corpoJson(request)) return json({ erro: "json" }, 415);
      const resto = p.length > 14 ? decodificar(p.slice(14)) : "";
      if (resto === null) return json({ erro: "id" }, 400);
      return rotaCarteira(request, env, quem, resto, { lerLinhas, lerLinha, gravarNoEspelho, removerDoEspelho, sincronizarListas: sincronizarListasCarteira });
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
    let coleta = null;
    try { coleta = await coletar(env); } catch (e) { console.error("coleta", e); }
    try { await cronMercado(env, evento.scheduledTime || Date.now()); } catch (e) { console.error("mercado", e); }
    try { await cronB3(env, evento.scheduledTime || Date.now()); } catch (e) { console.error("b3", e); }
    try { await cronEua(env, evento.scheduledTime || Date.now()); } catch (e) { console.error("eua", e); }
    try { await cronCvm(env, evento.scheduledTime || Date.now()); } catch (e) { console.error("cvm", e); }
    // Reddit: uma URL por minuto somando coleta e sonda; se a coleta falhou antes de saber, a sonda não arrisca
    try { await cronSonda(env, { redditLivre: !!coleta && !coleta.reddit }); } catch (e) { console.error("sonda", e); }
    try { const r = await cronPapel(env, evento.scheduledTime || Date.now()); if (r && r.candidatos) console.log("papel", JSON.stringify(r)); } catch (e) { console.error("papel", e); }
    // Leitura do dia: 10h40 a 10h49 UTC (7h40 em São Paulo), depois do informe da CVM das 10h17
    try {
      const podeVer = async (email) => { const admin = email === String(env.ADMIN_EMAIL || "").trim().toLowerCase(); if (!admin && !(await env.DB.prepare("SELECT 1 FROM usuarios WHERE email = ?").bind(email).first())) return false; return libera(await secoesDe(env, email, admin), "investimentos"); };
      const r = await cronLeitura(env, evento.scheduledTime || Date.now(), { lerLinhas, lerLinha, gravarNoEspelho }, podeVer);
      if (r && (r.geradas || r.erros)) console.log("leitura", JSON.stringify(r));
    } catch (e) { console.error("leitura", String((e && e.message) || e).slice(0, 120)); }
    // Minhas listas por regra: recalcula as ligadas de todo mundo no minuto 41 (grava só as que mudaram)
    try { const r = await cronListas(env, evento.scheduledTime || Date.now(), { lerLinha, lerFundamentos, gravarNoEspelho }); if (r && r.listas) console.log("listas", JSON.stringify(r)); } catch (e) { console.error("listas", String((e && e.message) || e).slice(0, 120)); }
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
