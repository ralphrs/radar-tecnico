// Leitura do dia: até 8 fatos curtos sobre a carteira e o filtro padrão de cada pessoa, montados por templates no
// próprio Worker. Nada de modelo de IA aqui: cada frase sai de uma comparação entre o estado de ontem e o de hoje.
//
// Collection leitura/<email>, cifrada com a mesma chave da carteira (src/cofre.js):
// - <AAAA-MM-DD>: { dia, geradaEm, filtro: { id, nome, classe }, itens: [{ tipo, papeis, texto }], novos, saiu, passam, total }
// - estado: { dia, base, atual }. `atual` é o retrato da última geração; `base`, o do dia anterior a ela. Gerar de novo
//   no mesmo dia compara sempre com `base`, então o "Gerar agora" não apaga o que mudou desde ontem.
//   Retrato: { dia, filtroId, passam: [papéis], falha: { papel: critério }, rend: { papel: [ref, rendimento] }, avisos: { papel: [avisos] } }.
//
// Quem recebe: quem tem carteira (carteira/<email>, doc extrato) ou filtro salvo (prefs/<email>, doc radar). Cron às 10h40 UTC
// (7h40 em São Paulo), cinco pessoas por minuto até 10h49. Os docs de mais de 30 dias saem na limpeza (src/coleta.js).
//
// Este arquivo não importa nada do Worker (só cofre.js, carteira.js e o filtro), para o teste rodar no Node.

import { cifrar, decifrar, cofreLigado } from "./cofre.js";
import { calcular } from "./carteira.js";
import "../public/radar-filtro.js";

const RF = globalThis.RadarFiltro;
export const MAX_ITENS = 8;
export const FECHO = "Só fatos. Nada aqui é recomendação.";
export const INTERVALO_GERAR_MS = 10 * 60_000;
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const mesNome = (ref) => MESES[Number(String(ref).slice(5, 7)) - 1] || ref;
export const hojeSp = (agora = Date.now()) => new Date(agora - 3 * 3600_000).toISOString().slice(0, 10);
const rs3 = (v) => "R$ " + RF.fmt(v, v < 1 ? 3 : 2);
const lista = (l) => (l.length <= 1 ? l.join("") : l.slice(0, -1).join(", ") + " e " + l[l.length - 1]);

// Valor de hoje do critério que barrava o papel ontem, para o "entrou" dizer o que mudou
function oQueMudou(k, l) {
  if (k === "pvp" && l.pvp != null) return `P/VP foi a ${RF.fmt(l.pvp, 2)}`;
  if (k === "dy" && l.dy != null) return `DY 12m chegou a ${RF.fmt(l.dy, 1)}%`;
  if (k === "liq" && l.liq != null) return `liquidez de ${RF.fmtMi(l.liq, l.classe === "eua")} no dia`;
  if (k === "regular") return "completou os meses pagando";
  if (k === "estavel") return "rendimento voltou ao ritmo dos 12 meses";
  if (k === "pl" && l.pl != null) return `P/L foi a ${RF.fmt(l.pl, 1)}`;
  if (k === "minha") return "saiu da sua carteira";
  return "";
}

// Função pura: retrato de hoje, comparação com a base e as frases. Testada em test/radar.test.mjs.
// e: { dia, filtro, linhas (da classe do filtro), ctx (ctxCarteira), posicoes, noticias: [{ titulo, fonte, ativos }], base }
export function montarLeitura(e) {
  const { dia, filtro, linhas, ctx, base } = e;
  const posicoes = e.posicoes || [];
  const r = RF.aplicar(linhas, filtro, ctx);
  const porT = new Map(linhas.map((l) => [l.t, l]));
  const passam = r.passam.map((l) => l.t);
  const falha = {};
  for (const [t, fs] of r.falha) falha[t] = fs[0].k;
  const minhas = new Set(posicoes.filter((p) => p.q > 0).map((p) => p.t));
  // rendimentos e avisos: só FIIs (é o que o informe da CVM dá); avisos só de quem está na carteira
  const rend = {}, avisosHoje = {};
  for (const l of linhas) {
    if (l.classe === "fiis" && l.ref && l.rend != null) rend[l.t] = [l.ref, l.rend, l.rendAnt ?? null];
    if (minhas.has(l.t)) {
      const a = RF.avisos(l, filtro, ctx).filter((x) => x.k !== "tenho" && x.k !== "concentra").map((x) => x.k + "|" + x.txt);
      if (a.length) avisosHoje[l.t] = a;
    }
  }
  const atual = { dia, filtroId: filtro.id, classe: filtro.classe, passam, falha, rend, avisos: avisosHoje };
  const itens = [];
  const add = (tipo, papeis, texto) => itens.push({ tipo, papeis, texto });
  const interesse = new Set([...minhas, ...passam]);
  let novos = [], saiu = [];
  if (!base) {
    add("inicio", [], `Primeira leitura com o filtro "${filtro.nome}": ${passam.length} de ${r.total} ${RF.NOME_CLASSE[filtro.classe]} passam hoje. A partir de amanhã entram aqui as mudanças.`);
  } else {
    // 1. Rendimento novo no informe da CVM (mês de referência mudou desde a base)
    const rendNovos = [];
    for (const t of interesse) {
      const h = rend[t], b = base.rend && base.rend[t];
      if (!h || !b || h[0] === b[0]) continue;
      const antes = b[1] != null ? b[1] : h[2];
      let comp = "";
      if (antes != null && antes > 0) {
        const d = h[1] / antes - 1;
        comp = Math.abs(d) < 0.005 ? "igual ao mês anterior" : d > 0 ? `acima dos ${rs3(antes)} do mês anterior` : `abaixo dos ${rs3(antes)} do mês anterior`;
      }
      rendNovos.push({ t, texto: `${t}: o informe de ${mesNome(h[0])} na CVM indica ${rs3(h[1])} por cota${comp ? ", " + comp : ""}.`, minha: minhas.has(t) });
    }
    rendNovos.sort((a, b) => b.minha - a.minha);
    // 2. Saiu e entrou
    const mesmoFiltro = base.filtroId === filtro.id;
    if (mesmoFiltro) {
      const antes = new Set(base.passam || []), agora = new Set(passam);
      saiu = (base.passam || []).filter((t) => !agora.has(t));
      novos = passam.filter((t) => !antes.has(t));
    }
    const frasesSaiu = saiu.map((t) => {
      const fs = r.falha.get(t);
      const motivo = fs ? fs.map((x) => x.longo).slice(0, 2).join(" e ") : porT.has(t) ? "" : "ficou fora das cotações do Lookout";
      return { t, texto: `${t} saiu do seu filtro${motivo ? ": " + motivo : ""}.` };
    });
    const entrou = novos.map((t) => { const l = porT.get(t), k = base.falha && base.falha[t]; const m = l && k ? oQueMudou(k, l) : ""; return t + (m ? ` (${m})` : ""); });
    // 3. Avisos da carteira que mudaram
    const frasesAviso = [];
    for (const t of minhas) {
      const h = new Set(avisosHoje[t] || []), b = new Set((base.avisos && base.avisos[t]) || []);
      const ganhou = [...h].filter((x) => !b.has(x)).map((x) => x.split("|")[1]), perdeu = [...b].filter((x) => !h.has(x)).map((x) => x.split("|")[1]);
      const partes = [];
      if (ganhou.length) partes.push(`passou a ter o aviso ${lista(ganhou.map((x) => `"${x}"`))}`);
      if (perdeu.length) partes.push(`deixou de ter ${lista(perdeu.map((x) => `"${x}"`))}`);
      if (partes.length) frasesAviso.push({ t, texto: `${t}, da sua carteira, ${partes.join(" e ")}.` });
    }
    // ordem: rendimentos da carteira, saídas, entradas, avisos, rendimentos do filtro, notícias
    rendNovos.filter((x) => x.minha).forEach((x) => add("rendimento", [x.t], x.texto));
    frasesSaiu.forEach((x) => add("saiu", [x.t], x.texto));
    if (entrou.length) add("entrou", novos, (novos.length === 1 ? "Entrou no filtro hoje: " : "Entraram no filtro hoje: ") + lista(entrou) + ".");
    frasesAviso.forEach((x) => add("aviso", [x.t], x.texto));
    rendNovos.filter((x) => !x.minha).forEach((x) => add("rendimento", [x.t], x.texto));
    if (!mesmoFiltro) add("filtro", [], `O filtro padrão agora é "${filtro.nome}". As entradas e saídas recomeçam a contar a partir de hoje.`);
  }
  // 4. Notícias das últimas 24 h que citam papéis da carteira ou do filtro
  const vistas = new Set();
  for (const n of e.noticias || []) {
    const cita = RF.papeisDaNoticia(n).filter((t) => interesse.has(t));
    if (!cita.length || !n.titulo || vistas.has(n.titulo)) continue;
    vistas.add(n.titulo);
    add("noticia", cita, `No feed: "${String(n.titulo).replace(/\s+/g, " ").trim()}"${n.fonte ? ` (${n.fonte})` : ""} cita ${lista(cita.slice(0, 4))}.`);
  }
  if (!itens.length) add("nada", [], "Nada mudou desde ontem no seu filtro nem nos papéis da sua carteira.");
  return {
    leitura: { dia, filtro: { id: filtro.id, nome: filtro.nome, classe: filtro.classe }, itens: itens.slice(0, MAX_ITENS), novos, saiu, passam: passam.length, total: r.total, fecho: FECHO },
    atual,
  };
}

// ---------- leitura das fontes ----------

// Múltiplos das fichas de papel (collection hist) já no banco: { BR: { PETR4: {...} }, US: { KO: {...} } }.
// Só leitura: as fichas são buscadas quando alguém abre a ficha (src/papel.js) e renovadas pelo cron dela.
export async function lerFundamentos(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, json_extract(data, '$.pl') AS pl, json_extract(data, '$.pvp') AS pvp, json_extract(data, '$.dy') AS dy, json_extract(data, '$.dividendo12m') AS div12, json_extract(data, '$.var1a') AS var1a, json_extract(data, '$.setor') AS setor, json_extract(data, '$.atualizado') AS em FROM docs WHERE collection = 'hist'"
  ).all();
  const out = { BR: {}, US: {} };
  for (const r of results || []) {
    const [m, t] = String(r.id).split(":");
    if (!out[m] || !t) continue;
    const o = {};
    for (const k of ["pl", "pvp", "dy", "div12", "var1a"]) if (typeof r[k] === "number") o[k] = r[k];
    if (r.setor) o.setor = String(r.setor);
    if (r.em) o.em = r.em;
    out[m][t] = o;
  }
  return out;
}

async function metaDoc(env, id, deps) {
  try { const r = await deps.lerLinha(env, "meta", id); return r ? JSON.parse(r.data) : null; } catch { return null; }
}
// Linhas da classe do filtro com tudo o que o Worker tem: meta/b3, meta/fii-resumo, meta/eua e as fichas
export function linhasDaClasse(classe, { b3, fiiResumo, eua, fund }) {
  if (classe === "fiis") return RF.linhasFii(b3, fiiResumo && fiiResumo.fundos, fund && fund.BR);
  if (classe === "acoes") return RF.linhasAcoes(b3, fund && fund.BR);
  return RF.linhasEua(eua, fund && fund.US);
}

// Gera (ou refaz) a leitura do dia de uma pessoa. deps: { lerLinhas, lerLinha, gravarNoEspelho }. Devolve o doc do dia.
export async function gerarLeitura(env, email, deps, agora = Date.now()) {
  if (!cofreLigado(env)) throw Object.assign(new Error("carteira desligada"), { status: 503 });
  const dia = hojeSp(agora);
  const col = "leitura/" + email;
  const pessoal = await env.DB.prepare("SELECT collection, id, data FROM docs WHERE (collection = ?1 AND id IN ('extrato', 'importacoes')) OR (collection = ?2 AND id = 'radar') OR (collection = ?3 AND id = 'estado')")
    .bind("carteira/" + email, "prefs/" + email, col).all();
  const doc = (c, id) => (pessoal.results || []).find((r) => r.collection === c && r.id === id);
  let prefs = null;
  try { const p = doc("prefs/" + email, "radar"); prefs = p ? JSON.parse(p.data) : null; } catch { prefs = null; }
  const filtro = RF.filtroPadrao(RF.respostaPrefs(prefs));
  const [b3, fiiResumo, eua] = await Promise.all([metaDoc(env, "b3", deps), metaDoc(env, "fii-resumo", deps), filtro.classe === "eua" ? metaDoc(env, "eua", deps) : null]);
  const fund = await lerFundamentos(env).catch(() => ({ BR: {}, US: {} }));
  let posicoes = [], patrimonio = 0;
  const ex = doc("carteira/" + email, "extrato");
  if (ex) {
    const extrato = await decifrar(env, ex.data);
    const imp = doc("carteira/" + email, "importacoes");
    const importacoes = imp ? await decifrar(env, imp.data) : null;
    const c = calcular(extrato, { b3, fiiResumo, importacoes, hoje: dia });
    posicoes = c.posicoes; patrimonio = c.resumo.patrimonio;
  }
  const est = doc(col, "estado");
  let estado = null;
  if (est) { try { estado = await decifrar(env, est.data); } catch { estado = null; } }
  const base = estado ? (estado.dia === dia ? estado.base : estado.atual) : null;
  const corte = new Date(agora - 24 * 3600_000).toISOString();
  let noticias = [];
  try {
    const l = await deps.lerLinhas(env, "SELECT id, data FROM docs WHERE collection = ? AND coletado >= ? ORDER BY coletado DESC LIMIT 300", ["items-investimentos", corte], "leitura");
    noticias = (l || []).map((r) => { try { return JSON.parse(r.data); } catch { return null; } }).filter(Boolean);
  } catch (e) {}
  const { leitura, atual } = montarLeitura({ dia, filtro, linhas: linhasDaClasse(filtro.classe, { b3, fiiResumo, eua, fund }), ctx: RF.ctxCarteira(posicoes, patrimonio), posicoes, noticias, base });
  leitura.geradaEm = new Date(agora).toISOString();
  leitura.cvm = fiiResumo ? fiiResumo.ref || null : null;
  const novoEstado = { dia, base: base || null, atual };
  const quando = new Date(agora).toISOString();
  const linhas = [
    { collection: col, id: dia, data: await cifrar(env, leitura), coletado: "", atualizado: quando },
    { collection: col, id: "estado", data: await cifrar(env, novoEstado), coletado: "", atualizado: quando },
  ];
  const st = env.DB.prepare("INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES (?, ?, ?, '', ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = excluded.atualizado");
  await env.DB.batch(linhas.map((l) => st.bind(l.collection, l.id, l.data, l.atualizado)));
  if (deps.gravarNoEspelho) deps.gravarNoEspelho(env, linhas);
  return leitura;
}

// Pessoas com carteira ou com filtro salvo (faixa da chave primária, sem LIKE)
export async function quemRecebe(env) {
  const { results } = await env.DB.prepare(
    "SELECT DISTINCT collection FROM docs WHERE (collection >= 'carteira/' AND collection < 'carteira0' AND id = 'extrato') OR (collection >= 'prefs/' AND collection < 'prefs0' AND id = 'radar')"
  ).all();
  return [...new Set((results || []).map((r) => String(r.collection).slice(String(r.collection).indexOf("/") + 1).toLowerCase()).filter((e) => e.includes("@")))].sort();
}

const POR_MINUTO = 5;
// 10h40 a 10h49 UTC: gera para até 5 pessoas por minuto que ainda não têm a de hoje. podeVer(email): seção Investimentos liberada.
export async function cronLeitura(env, quando, deps, podeVer) {
  const d = new Date(quando);
  if (d.getUTCHours() !== 10 || d.getUTCMinutes() < 40 || d.getUTCMinutes() > 49) return null;
  if (!cofreLigado(env)) return null;
  const dia = hojeSp(d.getTime());
  const pessoas = await quemRecebe(env);
  if (!pessoas.length) return { pessoas: 0 };
  const { results } = await env.DB.prepare("SELECT collection FROM docs WHERE collection >= 'leitura/' AND collection < 'leitura0' AND id = ?").bind(dia).all();
  const feitas = new Set((results || []).map((r) => String(r.collection).slice(8)));
  const falta = pessoas.filter((e) => !feitas.has(e));
  let geradas = 0, erros = 0;
  for (const email of falta.slice(0, POR_MINUTO)) {
    try {
      if (podeVer && !(await podeVer(email))) continue;
      await gerarLeitura(env, email, deps, d.getTime());
      geradas++;
    } catch (e) { erros++; console.error("leitura", String((e && e.name) || "erro"), String((e && e.message) || "").slice(0, 80)); }
  }
  return { pessoas: pessoas.length, faltavam: falta.length, geradas, erros };
}

// Ids (collection, id) de leitura/* com mais de 30 dias, para a limpeza apagar por lista
export async function leiturasParaApagar(env, agora = Date.now()) {
  const corte = hojeSp(agora - 30 * 86400_000);
  const { results } = await env.DB.prepare("SELECT collection, id FROM docs WHERE collection >= 'leitura/' AND collection < 'leitura0' AND id < ? AND id GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'").bind(corte).all();
  return results || [];
}

// ---------- rotas: GET /api/leitura?dia= e POST /api/leitura/gerar ----------
const resp = (dados, status = 200) =>
  new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" } });
const DIA_OK = /^\d{4}-\d{2}-\d{2}$/;
const gerando = new Map(); // email -> promessa, para dois cliques não gerarem duas vezes no mesmo isolate

export async function rotaLeitura(request, env, quem, caminho, deps) {
  if (!cofreLigado(env)) return resp({ erro: "carteira desligada" }, 503);
  const col = "leitura/" + quem.email;
  try {
    if (caminho === "" && request.method === "GET") {
      const url = new URL(request.url);
      const dia = url.searchParams.get("dia") || hojeSp();
      if (!DIA_OK.test(dia)) return resp({ erro: "dia" }, 400);
      const r = await deps.lerLinha(env, col, dia);
      if (!r) return resp({ existe: false, dia });
      return resp({ existe: true, ...(await decifrar(env, r.data)) });
    }
    if (caminho === "gerar" && request.method === "POST") {
      const dia = hojeSp();
      const r = await env.DB.prepare("SELECT atualizado FROM docs WHERE collection = ? AND id = ?").bind(col, dia).first();
      const idade = r && r.atualizado ? Date.now() - Date.parse(r.atualizado) : Infinity;
      if (idade < INTERVALO_GERAR_MS) return resp({ erro: "A leitura de hoje foi gerada há pouco. Dá para gerar de novo daqui a alguns minutos.", aguarde: Math.ceil((INTERVALO_GERAR_MS - idade) / 1000) }, 429);
      let p = gerando.get(quem.email);
      if (!p) { p = gerarLeitura(env, quem.email, deps).finally(() => gerando.delete(quem.email)); gerando.set(quem.email, p); }
      return resp({ existe: true, ...(await p) });
    }
    return resp({ erro: "metodo" }, 405);
  } catch (e) {
    if (e && e.status === 503) return resp({ erro: "carteira desligada" }, 503);
    console.error("leitura", String((e && e.name) || "erro"), String((e && e.message) || "").slice(0, 80));
    return resp({ erro: "Não deu para montar a leitura agora." }, 500);
  }
}
