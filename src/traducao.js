// Tradução das notícias para o português (pedido de 13/11): Workers AI pelo binding AI, uma etapa por minuto no cron.
// Regras puras (idioma, proteção do que não se traduz, campos do Landscape e dos destaques, preferência) ficam em
// public/traducao.js, o mesmo arquivo que a página carrega.
//
// Chamada ao modelo (conferida em 13/11 na página do modelo na documentação da Cloudflare e nos tipos do workerd que vêm
// com o wrangler, node_modules/workerd/worker.mjs, Ai_Cf_Meta_M2M100_1_2B_Input/Output):
//   env.AI.run("@cf/meta/m2m100-1.2b", { text, source_lang, target_lang }) -> { translated_text }
// source_lang tem padrão "en"; a doc descreve os campos com códigos ("en", "es") e o exemplo usa nomes ("english",
// "french"). Usamos os códigos (IDIOMA abaixo, num lugar só). O lote da doc (requests[]) é a fila assíncrona: devolve
// request_id e a resposta vem depois. Não serve a um cron de um minuto, então vai um texto por chamada.
//
// Banco (só UPDATE com chave explícita, json_patch em campos novos ao lado dos originais; nunca DROP):
// - items*, foruns-*: titulo_pt, resumo_pt e trad: { m, em, f: { titulo: "pt" | "igual" | "x<n>" }, ok?, igual?, velho? }.
//   trad.ok tira o doc da fila; trad.igual marca o que não precisou de tradução.
// - destaques*: itens[k].titulo_pt e itens[k].porque_pt, e trad.ok no doc quando não sobra nada.
// - landscape (doc da tecnologia): gh.descricao_pt, sobre_pt, releases[k].nome_pt/notas_pt, hn.historias[k].titulo_pt,
//   hn.comentarios[k].historia.titulo_pt e .itens[k].trecho_pt, gh_destaques[k].titulo_pt, blog[k].titulo_pt.
//   O cron do Landscape mantém o português quando o original não mudou (Traducao.manterLandscape, em src/landscape.js).
// - _sistema/traducao-estado: o dia (UTC), neurons estimados, contadores, a fila, a pausa e os textos desistidos.
// Nunca toca em data/users, favs/, listas/, prefs/, carteira/, leitura/ nem landscape/<email>.
import "../public/traducao.js";
const T = globalThis.Traducao;

export const MODELO = "@cf/meta/m2m100-1.2b";
export const IDIOMA = { en: "en", es: "es", pt: "pt" };   // códigos de idioma que vão ao modelo
export const TETO_DIA = 8000;          // neurons estimados por dia (a conta tem 10.000 grátis; zera 00:00 UTC)
export const POR_MINUTO = 8;           // chamadas ao AI por minuto, no máximo
export const FRACAO_LONGOS = 0.75;     // resumo, notas e trechos só enquanto o gasto do dia está abaixo de 75% do teto
export const LIMITE_SUBREQ = 1000;     // subrequests por invocação que a conta aceita sem susto (Free: 1.000 internos; Paid: 10.000)
export const RESERVA_SUBREQ = 150;     // o que fica guardado para o espelho e o histórico, que rodam depois
const CUSTO_FIXO = 5;                  // estado (ler e gravar), as duas consultas da fila e o batch das gravações
const MIN = 60_000, DIA = 86_400_000;
const PAUSA_CURTA = 10 * MIN;
const DIAS = 3;                        // não traduz o que foi publicado há mais de 3 dias
const POR_COLECAO = 40;                // linhas lidas por collection a cada minuto
const MARCAS_MAX = 60;                 // marcas "igual" e "velho" gravadas por minuto
const VAZIO_ESPERA = 5 * MIN;          // fila vazia: olha de novo em 5 minutos
const TENTATIVAS = 3;                  // falhou três vezes: fica o original
const DESISTIDOS_MAX = 400;

export const COLECOES_ITENS = ["items", "items-negocios", "items-investimentos", "items-politica", "items-esportes"];
export const COLECOES_DESTAQUES = ["destaques", "destaques-negocios", "destaques-investimentos", "destaques-politica", "destaques-esportes"];
export const COLECOES_FORUM = ["foruns-tech", "foruns-negocios", "foruns-investimentos", "foruns-politica", "foruns-esportes"];
const CAMPOS_DOC = ["titulo", "resumo"];

const iso = (t) => new Date(t).toISOString();
const diaUtc = (t) => iso(t).slice(0, 10);
const proximaVirada = (t) => Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), new Date(t).getUTCDate() + 1);
// FNV-1a de 32 bits, em base 36: marca curta de um texto (desistidos do Landscape e dos destaques)
export function marca(s) {
  let h = 0x811c9dc5;
  const x = String(s);
  for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

// ---------- estado ----------
export async function lerEstado(env, agora = Date.now()) {
  const r = await env.DB.prepare("SELECT data FROM docs WHERE collection = '_sistema' AND id = 'traducao-estado'").first();
  let e = {};
  try { e = r ? JSON.parse(r.data) || {} : {}; } catch { e = {}; }
  return normalizarEstado(e, agora);
}
export function normalizarEstado(e, agora = Date.now()) {
  const dia = diaUtc(agora);
  const base = { dia, neurons: 0, traduzidos: 0, iguais: 0, falhas: 0, descartadas: 0, chamadas: 0 };
  const out = { ...base, fila: 0, filaLongos: 0, pausa: null, vazioAte: null, desistidos: {}, ultima: null, modelo: MODELO, ...(e && typeof e === "object" ? e : {}) };
  if (out.dia !== dia) Object.assign(out, base, { ontem: { dia: e.dia, neurons: e.neurons, traduzidos: e.traduzidos } });
  if (out.pausa && !(Date.parse(out.pausa.ate) > agora)) out.pausa = null;
  if (!out.desistidos || typeof out.desistidos !== "object") out.desistidos = {};
  return out;
}
const gravarEstado = (env, e) => env.DB.prepare(
  "INSERT INTO docs (collection, id, data) VALUES ('_sistema', 'traducao-estado', ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
).bind(JSON.stringify(e)).run();

// Erro do AI -> "cota" (acabou o grátis do dia: pausa até 00:00 UTC), "limite" (429 ou 3040: pausa de 10 min) ou "falha".
export function classificarErro(e) {
  const m = String((e && (e.message || e.name)) || e || "") + " " + String((e && (e.code || e.status)) || "");
  if (/\b3036\b|daily free allocation|used up your daily|free tier allocation|allocation exceeded|neurons? per day|\b402\b/i.test(m)) return "cota";
  if (/\b3040\b|capacity temporarily exceeded|out of capacity|\b429\b|too many requests|rate.?limit/i.test(m)) return "limite";
  return "falha";
}
const MOTIVO = { cota: "acabou a cota grátis do dia no Workers AI", limite: "Workers AI pediu para esperar (429 ou 3040)", teto: "chegou ao teto de 8.000 neurons do dia" };

// ---------- fila ----------
const corte = (agora, dias) => iso(agora - dias * DIA);
export function sqlFila(agora) {
  const partes = [], args = [];
  const campos = "json_object('titulo', json_extract(data, '$.titulo'), 'resumo', json_extract(data, '$.resumo'), 'titulo_pt', json_extract(data, '$.titulo_pt'), "
    + "'resumo_pt', json_extract(data, '$.resumo_pt'), 'trad', json(json_extract(data, '$.trad')), 'pais', json_extract(data, '$.pais'), "
    + "'idioma', json_extract(data, '$.idioma'), 'publicado', json_extract(data, '$.publicado'), 'coletado', json_extract(data, '$.coletado'))";
  // limpeza (src/coleta.js) apaga foruns-* com mais de 3 dias, de hora em hora: o que sai na próxima hora fica de fora
  for (const c of COLECOES_ITENS) { partes.push(`SELECT * FROM (SELECT ? AS c, id, ${campos} AS data, coletado FROM docs WHERE collection = ? AND coletado >= ? AND json_extract(data, '$.trad.ok') IS NULL ORDER BY coletado DESC LIMIT ?)`); args.push(c, c, corte(agora, DIAS), POR_COLECAO); }
  for (const c of COLECOES_DESTAQUES) { partes.push(`SELECT * FROM (SELECT ? AS c, id, json_object('itens', json(json_extract(data, '$.itens')), 'data', json_extract(data, '$.data')) AS data, coletado FROM docs WHERE collection = ? AND id >= ? AND json_extract(data, '$.trad.ok') IS NULL ORDER BY id DESC LIMIT 4)`); args.push(c, c, "d" + diaUtc(agora - DIAS * DIA)); }
  for (const c of COLECOES_FORUM) { partes.push(`SELECT * FROM (SELECT ? AS c, id, ${campos} AS data, coletado FROM docs WHERE collection = ? AND coletado >= ? AND json_extract(data, '$.trad.ok') IS NULL ORDER BY coletado DESC LIMIT ?)`); args.push(c, c, iso(agora - DIAS * DIA + 60 * MIN), POR_COLECAO); }
  return { sql: partes.join(" UNION ALL "), args };
}
// Só os campos de texto de cada tecnologia (o doc inteiro tem série, README e o resto)
export const SQL_LANDSCAPE = "SELECT id, json_object('nome', json_extract(data, '$.nome'), 'repo', json_extract(data, '$.repo'), "
  + "'gh', json_object('descricao', json_extract(data, '$.gh.descricao'), 'descricao_pt', json_extract(data, '$.gh.descricao_pt')), "
  + "'sobre', json_extract(data, '$.sobre'), 'sobre_pt', json_extract(data, '$.sobre_pt'), 'releases', json(json_extract(data, '$.releases')), "
  + "'hn', json(json_extract(data, '$.hn')), 'gh_destaques', json(json_extract(data, '$.gh_destaques')), 'blog', json(json_extract(data, '$.blog'))) AS data "
  + "FROM docs WHERE collection = 'landscape' ORDER BY id";

const jsonOu = (s, x = null) => { try { return typeof s === "string" ? JSON.parse(s) : s || x; } catch { return x; } };
const prioridade = (c) => (c === "landscape" ? 1 : c.startsWith("foruns-") ? 3 : 2);
const nomesDoLandscape = (docs) => docs.flatMap((d) => [d.nome, ...String(d.repo || "").split("/")]).filter((n) => typeof n === "string" && n.length >= 3);

// Monta a fila a partir das linhas lidas: tarefas (texto a traduzir) e marcas (o que não precisa, gravado sem chamar o AI).
// Ordem: títulos primeiro (Landscape, itens e destaques do mais novo ao mais velho, fóruns), depois os textos longos.
export function montarFila({ linhas = [], landscape = [], estado = {}, agora = Date.now() }) {
  const tarefas = [], marcas = [];
  const desistidos = (estado && estado.desistidos) || {};
  const lsDocs = landscape.map((r) => ({ id: r.id, ...(jsonOu(r.data, {}) || {}) }));
  const nomes = nomesDoLandscape(lsDocs);
  for (const d of lsDocs) {
    const extras = [d.nome, ...String(d.repo || "").split("/")].filter(Boolean);
    for (const x of T.textosLandscape(d)) {
      if (x.pt || desistidos[marca(x.chave + "|" + x.texto)] >= TENTATIVAS) continue;
      const lang = T.idioma(x.texto);
      if (lang !== "en" && lang !== "es") continue;
      tarefas.push({ tipo: "ls", c: "landscape", id: d.id, chave: x.chave, texto: x.texto, origem: lang, curto: x.curto, quando: "", nomes: extras });
    }
  }
  const limite = agora - DIAS * DIA;
  for (const r of linhas) {
    const d = jsonOu(r.data, {}) || {};
    if (COLECOES_DESTAQUES.includes(r.c)) {
      const doc = { itens: Array.isArray(d.itens) ? d.itens : [] };
      let pend = 0;
      for (const x of T.textosDestaque(doc)) {
        if (x.pt || desistidos[marca(r.c + r.id + x.chave + "|" + x.texto)] >= TENTATIVAS) continue;
        const lang = T.idioma(x.texto);
        if (lang !== "en" && lang !== "es") continue;
        pend++;
        tarefas.push({ tipo: "dest", c: r.c, id: r.id, chave: x.chave, texto: x.texto, origem: lang, curto: x.curto, quando: String(r.id).slice(1) });
      }
      if (!pend) marcas.push({ c: r.c, id: r.id, patch: { trad: { ok: true, em: iso(agora) } } });
      continue;
    }
    const trad = d.trad && typeof d.trad === "object" ? d.trad : {};
    const f = trad.f && typeof trad.f === "object" ? trad.f : {};
    const ref = Date.parse(d.publicado || "") || Date.parse(r.coletado || d.coletado || "");
    if (Number.isFinite(ref) && ref < limite) { marcas.push({ c: r.c, id: r.id, patch: { trad: { ok: true, velho: true, em: iso(agora) } } }); continue; }
    const dica = { pais: d.pais, idioma: d.idioma };
    const marcaF = {};
    let pend = 0, feitos = 0;
    for (const campo of CAMPOS_DOC) {
      const texto = d[campo];
      if (typeof texto !== "string" || !texto.trim()) continue;
      if (typeof d[campo + "_pt"] === "string" && d[campo + "_pt"]) { feitos++; continue; }
      const st = String(f[campo] || "");
      if (st === "igual" || st === "pt") continue;
      if (/^x\d+$/.test(st) && Number(st.slice(1)) >= TENTATIVAS) continue;
      const lang = T.idioma(texto, dica);
      if (lang !== "en" && lang !== "es") { marcaF[campo] = "igual"; continue; }
      pend++;
      tarefas.push({ tipo: "doc", c: r.c, id: r.id, campo, chave: campo, texto, origem: lang, curto: campo === "titulo", quando: r.coletado || "", tentativas: /^x\d+$/.test(st) ? Number(st.slice(1)) : 0 });
    }
    if (Object.keys(marcaF).length || !pend) {
      const t = { em: iso(agora), f: marcaF };
      if (!pend) { t.ok = true; if (!feitos && !Object.values(f).includes("pt")) t.igual = true; }
      marcas.push({ c: r.c, id: r.id, patch: { trad: t } });
    }
  }
  const ordem = (a, b) => prioridade(a.c) - prioridade(b.c) || String(b.quando).localeCompare(String(a.quando));
  const curtos = tarefas.filter((t) => t.curto).sort(ordem), longos = tarefas.filter((t) => !t.curto).sort(ordem);
  return { tarefas: [...curtos, ...longos], curtos: curtos.length, longos: longos.length, marcas, nomes };
}

// ---------- uma chamada ----------
// Devolve { pt } (texto já com os pedaços de volta), { descartada: true } (marcador perdido ou saída estranha) ou lança
// o erro do AI. neurons: a estimativa do que a chamada gastou.
export async function traduzirTexto(env, texto, origem, nomes = []) {
  const { texto: prot, pedacos } = T.proteger(texto, nomes);
  const r = await env.AI.run(MODELO, { text: prot, source_lang: IDIOMA[origem] || "en", target_lang: IDIOMA.pt });
  const saida = r && typeof r.translated_text === "string" ? r.translated_text : "";
  const gasto = T.neurons(prot, saida);
  if (!T.saidaOk(prot, saida)) return { descartada: true, neurons: gasto };
  const pt = T.restaurar(saida, pedacos);
  if (pt == null) return { descartada: true, neurons: gasto };
  return { pt: pt.replace(/\s+/g, " ").trim(), neurons: gasto };
}

const SQL_PATCH = "UPDATE docs SET data = json_patch(data, ?1), atualizado = ?2 WHERE collection = ?3 AND id = ?4";
// Junta patches do jeito do json_patch (objeto mescla, o resto troca)
function juntar(a, b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return b;
  const out = a && typeof a === "object" && !Array.isArray(a) ? { ...a } : {};
  for (const [k, v] of Object.entries(b)) out[k] = juntar(out[k], v);
  return out;
}

// ---------- etapa do cron ----------
// Uma etapa por minuto, depois das coletas. gastos: subrequests que a invocação já fez (src/index.js conta). Nunca lança.
// Sem env.AI (testes, wrangler dev sem a conta): não faz nada.
export async function cronTraducao(env, { agora = Date.now(), gastos = 0, limite = LIMITE_SUBREQ, reserva = RESERVA_SUBREQ } = {}) {
  if (!env || !env.AI || typeof env.AI.run !== "function") return { desligada: true };
  const livres = limite - reserva - gastos;
  const maxAI = Math.min(POR_MINUTO, Math.floor((livres - CUSTO_FIXO) / 2));
  if (maxAI < 1) return { semFolga: true, gastos };
  const est = await lerEstado(env, agora);
  const out = { chamadas: 0, traduzidos: 0, marcas: 0, falhas: 0 };
  if (est.pausa) return { ...out, pausa: est.pausa };
  if (est.neurons >= TETO_DIA) {
    est.pausa = { ate: iso(proximaVirada(agora)), motivo: MOTIVO.teto, tipo: "teto", desde: iso(agora) };
    await gravarEstado(env, est);
    return { ...out, pausa: est.pausa };
  }
  if (est.vazioAte && Date.parse(est.vazioAte) > agora) return { ...out, vazia: true };

  const { sql, args } = sqlFila(agora);
  const [{ results: linhas }, { results: lsLinhas }] = [await env.DB.prepare(sql).bind(...args).all(), await env.DB.prepare(SQL_LANDSCAPE).all()];
  const fila = montarFila({ linhas: linhas || [], landscape: lsLinhas || [], estado: est, agora });
  const longosOk = est.neurons < TETO_DIA * FRACAO_LONGOS;
  const escolhidas = fila.tarefas.filter((t) => t.curto || longosOk);

  const patches = new Map();               // "c|id" -> patch (itens e fóruns)
  const listas = new Map();                // "c|id" -> [{ chave, origem, pt }] (destaques e landscape: relê antes de gravar)
  const pore = (k, m) => { if (!m.has(k)) m.set(k, []); return m.get(k); };
  const quando = iso(agora);
  const desistir = (t) => { const k = marca((t.tipo === "dest" ? t.c + t.id : "") + t.chave + "|" + t.texto); est.desistidos[k] = (est.desistidos[k] || 0) + 1; };
  const falhou = (t) => {
    out.falhas++; est.falhas++;
    if (t.tipo === "doc") patches.set(t.c + "|" + t.id, juntar(patches.get(t.c + "|" + t.id), { trad: { em: quando, f: { [t.campo]: "x" + ((t.tentativas || 0) + 1) } } }));
    else desistir(t);
  };
  for (const t of escolhidas) {
    if (out.chamadas >= maxAI) break;
    if (est.neurons + T.neurons(t.texto, t.texto + t.texto.slice(0, t.texto.length / 5)) > TETO_DIA) {
      est.pausa = { ate: iso(proximaVirada(agora)), motivo: MOTIVO.teto, tipo: "teto", desde: quando };
      break;
    }
    out.chamadas++; est.chamadas++;
    let r;
    try { r = await traduzirTexto(env, t.texto, t.origem, [...fila.nomes, ...(t.nomes || [])]); }
    catch (e) {
      const tipo = classificarErro(e);
      if (tipo === "cota" || tipo === "limite") {
        est.pausa = { ate: iso(tipo === "cota" ? proximaVirada(agora) : agora + PAUSA_CURTA), motivo: MOTIVO[tipo], tipo, desde: quando, erro: String((e && e.message) || e).slice(0, 160) };
        out.chamadas--; est.chamadas--;
        break;
      }
      est.neurons += T.neurons(t.texto, "");
      est.ultimoErro = { quando, erro: String((e && e.message) || e).slice(0, 160) };
      falhou(t);
      continue;
    }
    est.neurons = Math.round((est.neurons + r.neurons) * 1000) / 1000;
    if (r.descartada) { est.descartadas++; falhou(t); continue; }
    out.traduzidos++; est.traduzidos++;
    if (t.tipo === "doc") {
      const k = t.c + "|" + t.id;
      patches.set(k, juntar(patches.get(k), { [t.campo + "_pt"]: r.pt, trad: { m: MODELO, em: quando, f: { [t.campo]: "pt" } } }));
    } else pore(t.c + "|" + t.id, listas).push({ chave: t.chave, origem: t.texto, pt: r.pt, tarefa: t });
  }
  // doc que ficou sem nada pendente (traduzido agora e o resto igual ou já feito) sai da fila
  const pendentes = new Map();
  for (const t of fila.tarefas) if (t.tipo === "doc") pendentes.set(t.c + "|" + t.id, (pendentes.get(t.c + "|" + t.id) || 0) + 1);
  for (const [k, p] of patches) {
    const feitos = Object.values((p.trad && p.trad.f) || {}).filter((v) => v === "pt" || (/^x\d+$/.test(v) && Number(v.slice(1)) >= TENTATIVAS)).length;
    if (feitos >= (pendentes.get(k) || 0)) p.trad.ok = true;
  }

  // gravações: um UPDATE por doc, com a chave explícita, num batch só
  const stmts = [];
  const add = (c, id, patch) => stmts.push(env.DB.prepare(SQL_PATCH).bind(JSON.stringify(patch), quando, c, id));
  for (const m of fila.marcas.slice(0, MARCAS_MAX)) {
    const k = m.c + "|" + m.id;
    if (patches.has(k)) patches.set(k, juntar(m.patch, patches.get(k)));
    else { add(m.c, m.id, m.patch); out.marcas++; }
  }
  for (const [k, p] of patches) { const i = k.indexOf("|"); add(k.slice(0, i), k.slice(i + 1), p); }
  for (const [k, l] of listas) {
    const i = k.indexOf("|"), c = k.slice(0, i), id = k.slice(i + 1);
    const r = await env.DB.prepare("SELECT data FROM docs WHERE collection = ? AND id = ?").bind(c, id).first();
    const doc = r ? jsonOu(r.data, null) : null;
    if (!doc) continue;
    const ap = c === "landscape" ? T.aplicarLandscape(doc, l) : T.aplicarDestaque(doc, l);
    if (!ap.n) continue;
    if (c !== "landscape") {
      const resta = T.textosDestaque(ap.doc).filter((x) => !x.pt && T.precisaTraduzir(x.texto) && !((est.desistidos[marca(c + id + x.chave + "|" + x.texto)] || 0) >= TENTATIVAS));
      ap.patch.trad = { m: MODELO, em: quando, ...(resta.length ? {} : { ok: true }) };
    }
    add(c, id, ap.patch);
  }
  if (stmts.length) await env.DB.batch(stmts);

  // estado
  const k = Object.keys(est.desistidos);
  if (k.length > DESISTIDOS_MAX) for (const x of k.slice(0, k.length - DESISTIDOS_MAX)) delete est.desistidos[x];
  est.iguais += out.marcas;
  est.fila = Math.max(0, fila.tarefas.length - out.traduzidos - out.falhas);
  est.filaLongos = fila.longos;
  est.vazioAte = fila.tarefas.length === 0 && fila.marcas.length <= MARCAS_MAX ? iso(agora + VAZIO_ESPERA) : null;
  est.ultima = { quando, chamadas: out.chamadas, traduzidos: out.traduzidos, falhas: out.falhas, marcas: out.marcas, fila: est.fila, longosOk, gastos, maxAI };
  est.modelo = MODELO;
  await gravarEstado(env, est);
  return { ...out, fila: est.fila, pausa: est.pausa || undefined };
}

// Subrequests da invocação do cron (fetch e D1), para a tradução saber quanto ainda cabe no limite.
// O D1 é contado por um invólucro em env.DB (prepare, bind, first, all, run, raw, batch), só nesta invocação.
// O fetch é contado por um invólucro instalado uma vez no globalThis.fetch: ele soma em todas as contagens abertas no
// isolate, então se dois crons se sobrepõem cada um conta os dois (a conta erra para mais, nunca para menos).
// O espelho (Durable Object) e os assets não passam por aqui: ficam na reserva de src/traducao.js.
export const contagens = new Set();
export function contarFetch() {
  const f = globalThis.fetch;
  if (typeof f !== "function" || f.__lookoutConta) return;
  const novo = function (...a) { for (const c of contagens) c.fetch++; return f.apply(this, a); };
  novo.__lookoutConta = true;
  globalThis.fetch = novo;
}
export function envContado(env, conta) {
  const db = env && env.DB;
  if (!db || typeof db.prepare !== "function") return env;
  const real = Symbol.for("lookout.stmt");
  const emb = (st) => ({
    [real]: st,
    bind: (...a) => emb(st.bind(...a)),
    first: (...a) => { conta.d1++; return st.first(...a); },
    all: (...a) => { conta.d1++; return st.all(...a); },
    run: (...a) => { conta.d1++; return st.run(...a); },
    raw: (...a) => { conta.d1++; return st.raw(...a); },
  });
  const DB = {
    prepare: (sql) => emb(db.prepare(sql)),
    batch: (l) => { conta.d1++; return db.batch((l || []).map((x) => (x && x[real]) || x)); },
    exec: (...a) => { conta.d1++; return db.exec(...a); },
  };
  return Object.assign({}, env, { DB });
}

// Linha do Admin (Rendimento das fontes): traduzidos hoje, fila, neurons estimados, pausa e motivo.
export function resumoAdmin(est, { ligada = true, agora = Date.now() } = {}) {
  const e = normalizarEstado(est || {}, agora);
  return { ligada, modelo: e.modelo || MODELO, dia: e.dia, traduzidos: e.traduzidos, falhas: e.falhas, descartadas: e.descartadas, iguais: e.iguais,
    fila: e.fila, filaLongos: e.filaLongos, neurons: Math.round(e.neurons), teto: TETO_DIA, pausa: e.pausa, ultima: e.ultima || null, ultimoErro: e.ultimoErro || null };
}
export async function estadoAdmin(env, agora = Date.now()) {
  const r = await env.DB.prepare("SELECT data FROM docs WHERE collection = '_sistema' AND id = 'traducao-estado'").first();
  return resumoAdmin(r ? jsonOu(r.data, {}) : {}, { ligada: !!(env.AI && typeof env.AI.run === "function"), agora });
}
