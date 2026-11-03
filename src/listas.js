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
// Campos opcionais do doc (todos conferidos em validarLista):
// - descricao: até 4.000 caracteres, markdown simples (parágrafos, "- " para lista, **negrito**); a página escapa tudo;
// - ativa: false tira a lista da lateral, do Início e do Radar (ela continua na lista de listas);
// - regra: { classe, criterios, soCarteira, referencia? } no formato dos filtros do Radar (public/radar-filtro.js).
//   Sem `referencia`, a lista é dinâmica: os papéis saem de materializar() a cada hora (cronListas, minuto 41), ao abrir
//   a página da lista (se o cálculo tiver mais de 1 h) e no "Recalcular" (1 vez a cada 5 min). `fixos` sempre entram,
//   `excluidos` nunca. Com `referencia: true` a regra só serve de comparação numa lista manual;
// - historico: [{ quando, papel, acao: "entrou" | "saiu" | "criada" | "regra", motivo }], até 500, os mais antigos caem.
//   Gravado só pelo servidor; o GET da coleção manda só os últimos 7 dias (o GET de uma lista manda tudo);
// - posicao: ordem na lateral, gravada pela lista de listas (PUT /api/listas/ordem);
// - cor: uma das CORES;
// - calculado, cortados (quantos passaram na regra e ficaram fora do limite de 60), recalcManual.
//
// Este arquivo não importa nada do Worker, para os testes rodarem no Node; o espelho chega em `deps`.

import { decifrar, cofreLigado } from "./cofre.js";
import { calcular } from "./carteira.js";
import { lerFundamentos } from "./leitura.js";
import "../public/radar-filtro.js";
const RF = globalThis.RadarFiltro;

// B3: quatro caracteres e o número; o segundo pode ser dígito (B3SA3, BDRs como M1TA34).
// EUA: de 1 a 5 letras, com a classe depois do ponto quando houver (AAPL, F, BRK.B).
export const PAPEL_OK = /^(?:[A-Z][A-Z0-9]{3}\d{1,2}|[A-Z]{1,5}(?:\.[A-Z])?)$/;
export const LISTA_ID_OK = /^[a-z0-9-]{1,60}$/;
export const LISTAS_MAX = 30;
export const PAPEIS_MAX = 60;
export const DESCRICAO_MAX = 4000;
export const HIST_MAX = 500;
export const RECALC_MANUAL_MS = 5 * 60_000;
export const RECALC_ABRIR_MS = 3600_000;
export const CORES = ["roxo", "azul", "verde", "amarelo", "laranja", "vermelho", "cinza"];

// Listas automáticas, na ordem em que aparecem. A classe é a de classeDe() em src/carteira.js.
export const AUTOMATICAS = [
  { id: "carteira-fiis", classe: "fii", nome: "Carteira · FIIs" },
  { id: "carteira-fiinfra", classe: "fiinfra", nome: "Carteira · FI-Infra" },
  { id: "carteira-fiagro", classe: "fiagro", nome: "Carteira · Fiagro" },
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

// Confere uma lista de papéis (papeis, fixos, excluidos). Devolve { lista } ou { erro }.
function conferirPapeis(l, rotulo) {
  if (l == null) return { lista: [] };
  if (!Array.isArray(l)) return { erro: rotulo };
  if (l.length > PAPEIS_MAX) return { erro: `Uma lista guarda até ${PAPEIS_MAX} papéis.` };
  const vistos = new Set();
  for (const p of l) {
    if (typeof p !== "string" || !PAPEL_OK.test(p)) return { erro: `Papel inválido: ${String(p).slice(0, 12)}` };
    if (vistos.has(p)) return { erro: `${p} aparece duas vezes.` };
    vistos.add(p);
  }
  return { lista: [...vistos] };
}

// Regra de lista: { classe, criterios, soCarteira, referencia? }. null apaga. Devolve { regra } ou { erro }.
export function validarRegra(r) {
  if (r === null) return { regra: null };
  if (!r || typeof r !== "object" || Array.isArray(r)) return { erro: "regra" };
  if (!RF.CLASSES_REGRA.includes(r.classe)) return { erro: "Classe da regra desconhecida." };
  const c = r.criterios && typeof r.criterios === "object" && !Array.isArray(r.criterios) ? r.criterios : {};
  const v = RF.validarFiltro({ ...c, id: "regra", nome: "regra", classe: r.classe }, true);
  if (v.erro) return { erro: v.erro };
  const { id, nome, classe, aporte, semMinhas, ...criterios } = v.filtro;
  return { regra: { classe: r.classe, criterios, soCarteira: r.soCarteira === true, ...(r.referencia === true ? { referencia: true } : {}) } };
}
export const ehDinamica = (doc) => !!(doc && doc.regra && !doc.regra.referencia && !doc.auto);
export const filtroDaRegra = (regra) => ({ ...regra.criterios, classe: regra.classe, id: "regra", nome: "regra", semMinhas: false, aporte: 0 });

// Confere o corpo de uma lista. Devolve { nome, papeis, ...campos que vieram } ou { erro }.
export function validarLista(b) {
  if (!b || typeof b !== "object") return { erro: "corpo" };
  const nome = String(b.nome ?? "").replace(/\s+/g, " ").trim();
  if (!nome) return { erro: "Dê um nome à lista." };
  if (nome.length > 40) return { erro: "O nome passa de 40 caracteres." };
  const pp = conferirPapeis(b.papeis ?? [], "papeis");
  if (pp.erro) return pp;
  const out = { nome, papeis: pp.lista };
  // Ordem escolhida no cabeçalho da lista (até 5 critérios por coluna); sem ela, vale a ordem dos papéis
  if (b.ordem !== undefined && b.ordem !== null) {
    if (!Array.isArray(b.ordem) || b.ordem.length > ORDEM_MAX) return { erro: "ordem" };
    const cols = new Set();
    for (const o of b.ordem) {
      if (!o || !COLS_ORDEM.has(o.c) || (o.d !== 1 && o.d !== -1) || cols.has(o.c)) return { erro: "ordem" };
      cols.add(o.c);
    }
    if (b.ordem.length) out.ordem = b.ordem.map((o) => ({ c: o.c, d: o.d }));
  }
  if (b.descricao !== undefined) {
    if (b.descricao !== null && typeof b.descricao !== "string") return { erro: "descricao" };
    const d = String(b.descricao ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/\n{3,}/g, "\n\n").trim();
    if (d.length > DESCRICAO_MAX) return { erro: `A descrição passa de ${DESCRICAO_MAX.toLocaleString("pt-BR")} caracteres.` };
    out.descricao = d;
  }
  if (b.ativa !== undefined) {
    if (typeof b.ativa !== "boolean") return { erro: "Use true ou false em ativa." };
    out.ativa = b.ativa;
  }
  if (b.regra !== undefined) {
    const r = validarRegra(b.regra);
    if (r.erro) return r;
    out.regra = r.regra;
  }
  for (const k of ["fixos", "excluidos"]) {
    if (b[k] === undefined) continue;
    const r = conferirPapeis(b[k], k);
    if (r.erro) return r;
    out[k] = r.lista;
  }
  if (out.fixos && out.excluidos) { const x = out.fixos.find((t) => out.excluidos.includes(t)); if (x) return { erro: `${x} está nos fixos e nos excluídos.` }; }
  if (b.cor !== undefined && b.cor !== null) {
    if (!CORES.includes(b.cor)) return { erro: "Cor desconhecida." };
    out.cor = b.cor;
  }
  if (b.posicao !== undefined) {
    if (!Number.isInteger(b.posicao) || b.posicao < 0 || b.posicao > 999) return { erro: "posicao" };
    out.posicao = b.posicao;
  }
  return out;
}
export const COLS_ORDEM = new Set(["t", "preco", "var", "dy", "pvp"]);
const ORDEM_MAX = 5;

// ---------- listas por regra ----------

// Função pura: os papéis de uma regra hoje. dados: { linhas } ou { b3, fiiResumo, eua, fund }, mais { posicoes } para
// "só papéis que tenho". Os fixos entram primeiro e sempre; os excluídos nunca. Passando de `limite`, o corte segue a
// ordenação da regra e os que sobraram voltam em `cortados`.
export function materializar(regra, dados, { fixos = [], excluidos = [], limite = PAPEIS_MAX } = {}) {
  const linhas = (dados && dados.linhas) || RF.linhasDe(regra.classe, dados || {});
  const r = RF.aplicar(linhas, filtroDaRegra(regra), { posicoes: new Map(), patrimonio: 0 });
  const falha = new Map(r.falha);
  let passam = r.passam;
  if (regra.soCarteira) {
    const tenho = new Set(((dados && dados.posicoes) || []).filter((p) => p && p.q > 0).map((p) => p.t));
    for (const l of passam) if (!tenho.has(l.t)) falha.set(l.t, [{ k: "carteira", curto: "não está na carteira", longo: "não está na sua carteira" }]);
    passam = passam.filter((l) => tenho.has(l.t));
  }
  const ex = new Set(excluidos);
  const fx = fixos.filter((t) => !ex.has(t)).slice(0, limite);
  const candidatos = passam.filter((l) => !ex.has(l.t) && !fx.includes(l.t));
  const vagas = Math.max(0, limite - fx.length);
  const entram = candidatos.slice(0, vagas);
  const motivos = {};
  for (const l of entram) motivos[l.t] = RF.resumoValores(l);
  return {
    papeis: [...fx, ...entram.map((l) => l.t)], passam: passam.map((l) => l.t), motivos, falha,
    cortados: candidatos.slice(vagas).map((l) => l.t), total: linhas.length, porT: new Map(linhas.map((l) => [l.t, l])),
  };
}

// Entradas do histórico entre os papéis de antes e uma materialização. motivoRegra: texto da mudança de regra, que vira
// o motivo de quem entrou ou saiu por causa dela.
export function diffDinamica(antes, m, { quando, fixos = [], excluidos = [], motivoRegra = "" } = {}) {
  const a = new Set(antes || []), d = new Set(m.papeis), out = [];
  for (const t of m.papeis) {
    if (a.has(t)) continue;
    const motivo = fixos.includes(t) ? "fixado por você" : motivoRegra || m.motivos[t] || "passou na regra";
    out.push({ quando, papel: t, acao: "entrou", motivo });
  }
  for (const t of antes || []) {
    if (d.has(t)) continue;
    let motivo;
    if (excluidos.includes(t)) motivo = "excluído da regra por você";
    else if (motivoRegra) motivo = motivoRegra;
    else if (m.cortados.includes(t)) motivo = `passa na regra, mas ficou fora do limite de ${PAPEIS_MAX}`;
    else {
      const fs = m.falha.get(t);
      motivo = fs ? fs.slice(0, 2).map((x) => x.longo).join(" e ") : m.porT.has(t) ? "deixou de passar na regra" : "ficou fora das cotações do Lookout";
    }
    out.push({ quando, papel: t, acao: "saiu", motivo });
  }
  return out;
}
// Lista manual: o que a pessoa pôs e tirou
export function diffManual(antes, depois, quando, motivos = {}) {
  const a = new Set(antes || []), d = new Set(depois || []);
  return [
    ...(depois || []).filter((t) => !a.has(t)).map((t) => ({ quando, papel: t, acao: "entrou", motivo: motivos.entrou || "adicionado por você" })),
    ...(antes || []).filter((t) => !d.has(t)).map((t) => ({ quando, papel: t, acao: "saiu", motivo: motivos.saiu || "removido por você" })),
  ];
}
export const registrar = (hist, novas) => [...(Array.isArray(hist) ? hist : []), ...(novas || [])].slice(-HIST_MAX);
const nPapeis = (n) => (n === 1 ? "1 papel" : `${n} papéis`);

// Recalcula uma lista dinâmica. Devolve { doc, mudou, novas }. mudou: papéis (ou a ordem deles) diferentes.
export function aplicarRegra(doc, dados, quando, motivoRegra = "") {
  const m = materializar(doc.regra, dados, { fixos: doc.fixos || [], excluidos: doc.excluidos || [] });
  const novas = diffDinamica(doc.papeis || [], m, { quando, fixos: doc.fixos || [], excluidos: doc.excluidos || [], motivoRegra });
  const mudou = JSON.stringify(m.papeis) !== JSON.stringify(doc.papeis || []) || (doc.cortados || 0) !== m.cortados.length;
  return { doc: { ...doc, papeis: m.papeis, cortados: m.cortados.length, historico: registrar(doc.historico, novas), calculado: quando }, mudou, novas, m };
}

// Dados que a regra precisa: meta/b3, meta/fii-resumo, meta/eua (só se alguma regra for dos EUA) e as fichas guardadas.
// deps.lerLinha lê pelo espelho (D1 de reserva). Sem o meta, a lista fica como está (devolve null).
export async function dadosBase(env, deps, classes) {
  const meta = async (id) => { try { const r = await deps.lerLinha(env, "meta", id); return r ? JSON.parse(r.data) : null; } catch { return null; } };
  const [b3, fiiResumo, eua, fund] = await Promise.all([meta("b3"), meta("fii-resumo"), classes.includes("eua") ? meta("eua") : null, (deps.lerFundamentos || lerFundamentos)(env).catch(() => ({ BR: {}, US: {} }))]);
  if (!b3) return null;
  return { b3, fiiResumo, eua, fund };
}
// Posições abertas da pessoa (para "só papéis que tenho"). Lê do D1 e decifra; sem cofre ou sem carteira, nada.
export async function posicoesDe(env, email, base) {
  if (!cofreLigado(env)) return [];
  const { results } = await env.DB.prepare("SELECT id, data FROM docs WHERE collection = ? AND id IN ('extrato', 'importacoes')").bind("carteira/" + email).all();
  const ex = (results || []).find((r) => r.id === "extrato");
  if (!ex) return [];
  try {
    const extrato = await decifrar(env, ex.data);
    const imp = (results || []).find((r) => r.id === "importacoes");
    const importacoes = imp ? await decifrar(env, imp.data) : null;
    return calcular(extrato, { b3: base && base.b3, fiiResumo: base && base.fiiResumo, importacoes }).posicoes;
  } catch { return []; }
}
async function dadosDaLista(env, deps, email, regra) {
  const base = deps.dados ? await deps.dados(env, [regra.classe]) : await dadosBase(env, deps, [regra.classe]);
  if (!base) return null;
  return regra.soCarteira ? { ...base, posicoes: deps.posicoes ? await deps.posicoes(env, email, base) : await posicoesDe(env, email, base) } : base;
}

// Cron do minuto 41: recalcula as dinâmicas ativas de todo mundo e grava só as que mudaram, com histórico e write-through.
export async function cronListas(env, quando, deps = {}) {
  if (new Date(quando).getUTCMinutes() !== 41) return null;
  const { results } = await env.DB.prepare("SELECT collection, id, data FROM docs WHERE collection >= 'listas/' AND collection < 'listas0' AND json_extract(data, '$.regra') IS NOT NULL").all();
  const alvo = [];
  for (const r of results || []) {
    let doc; try { doc = JSON.parse(r.data); } catch { continue; }
    if (ehDinamica(doc) && doc.ativa !== false) alvo.push({ collection: r.collection, id: r.id, doc });
  }
  if (!alvo.length) return { listas: 0, mudaram: 0 };
  const classes = [...new Set(alvo.map((a) => a.doc.regra.classe))];
  const base = deps.dados ? await deps.dados(env, classes) : await dadosBase(env, deps, classes);
  if (!base) return { listas: alvo.length, mudaram: 0, semDados: true };
  const iso = new Date(quando).toISOString();
  const pos = new Map();
  const linhas = [];
  for (const a of alvo) {
    let dados = base;
    if (a.doc.regra.soCarteira) {
      const email = a.collection.slice(7);
      if (!pos.has(email)) pos.set(email, deps.posicoes ? await deps.posicoes(env, email, base) : await posicoesDe(env, email, base));
      dados = { ...base, posicoes: pos.get(email) };
    }
    const r = aplicarRegra(a.doc, dados, iso);
    if (!r.mudou) continue;
    const doc = { ...r.doc, atualizado: iso };
    linhas.push({ collection: a.collection, id: a.id, data: JSON.stringify(doc), coletado: "", atualizado: iso });
  }
  const st = env.DB.prepare(UPSERT);
  for (let i = 0; i < linhas.length; i += 50) await env.DB.batch(linhas.slice(i, i + 50).map((l) => st.bind(l.collection, l.id, l.data, l.atualizado)));
  if (linhas.length && deps.gravarNoEspelho) deps.gravarNoEspelho(env, linhas);
  return { listas: alvo.length, mudaram: linhas.length };
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
    // o que a pessoa mexeu (descrição, ligada ou não, posição) fica; o histórico ganha o que a importação mudou
    const dia = new Date(Date.parse(agora) - 3 * 3600_000).toISOString();
    const motivo = `importação de ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
    const novas = velho ? diffManual(velho.papeis, papeis, agora, { entrou: motivo, saiu: motivo }) : [{ quando: agora, papel: null, acao: "criada", motivo: `criada pela ${motivo} com ${nPapeis(papeis.length)}` }];
    const doc = { nome: a.nome, papeis, auto: true, classe: a.classe, criado: (velho && velho.criado) || agora, atualizado: agora, historico: registrar(velho && velho.historico, novas) };
    for (const k of ["descricao", "ativa", "posicao", "cor"]) if (velho && velho[k] !== undefined) doc[k] = velho[k];
    gravar.push({ id: a.id, doc });
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
// Lista dinâmica que recebe um papel passa a tê-lo nos fixos; a que perde (mover) passa a tê-lo nos excluídos.
export function moverPapel(de, para, papel, copiar, agora = agoraIso()) {
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
  const novoPara = { ...para.doc, papeis: [...destino, papel], atualizado: agora,
    historico: registrar(para.doc.historico, [{ quando: agora, papel, acao: "entrou", motivo: `${copiar ? "copiado" : "movido"} de “${de.doc.nome}”` }]) };
  if (ehDinamica(para.doc)) { novoPara.fixos = [...(para.doc.fixos || []).filter((t) => t !== papel), papel]; novoPara.excluidos = (para.doc.excluidos || []).filter((t) => t !== papel); }
  let novoDe = null;
  if (!copiar) {
    novoDe = { ...de.doc, papeis: origem.filter((p) => p !== papel), atualizado: agora,
      historico: registrar(de.doc.historico, [{ quando: agora, papel, acao: "saiu", motivo: `movido para “${para.doc.nome}”` }]) };
    if (ehDinamica(de.doc)) { novoDe.fixos = (de.doc.fixos || []).filter((t) => t !== papel); novoDe.excluidos = [...(de.doc.excluidos || []).filter((t) => t !== papel), papel]; }
  }
  return { de: novoDe, para: novoPara };
}

// ---------- rota ----------

// Lista da coleção (GET /api/listas): histórico só dos últimos 7 dias, mais o total e a última mudança.
export function resumoParaColecao(doc, agora = Date.now()) {
  const h = Array.isArray(doc.historico) ? doc.historico : [];
  const corte = new Date(agora - 7 * 86400_000).toISOString();
  const { historico, ...resto } = doc;
  return { ...resto, historico: h.filter((x) => String(x.quando || "") >= corte), histN: h.length, ultimaMudanca: h.length ? h[h.length - 1].quando : null };
}
// Ordem de exibição: posição gravada; sem ela, automáticas na ordem fixa e depois as manuais por criação
const ORDEM_AUTO = AUTOMATICAS.map((a) => a.id);
export function ordenarDocs(docs) {
  const peso = (d) => (Number.isInteger(d.data.posicao) ? d.data.posicao : 1000 + (d.data.auto ? ORDEM_AUTO.indexOf(d.id) : 100));
  return docs.map((d, i) => ({ d, i })).sort((a, b) => peso(a.d) - peso(b.d) || a.i - b.i).map((x) => x.d);
}
// Campos que o PUT aceita em lista automática (o resto é da carteira)
const CAMPOS_AUTO = new Set(["ativa", "descricao", "posicao", "cor"]);
const CAMPOS_OPCIONAIS = ["descricao", "ativa", "regra", "fixos", "excluidos", "cor", "posicao"];

// /api/listas, /api/listas/<id>, /api/listas/<id>/recalcular, /api/listas/mover e /api/listas/ordem.
// A seção já foi conferida em src/index.js. deps: { lerLinhas, lerLinha, gravarNoEspelho, removerDoEspelho, dados?, posicoes? }
export async function rotaListas(request, env, quem, idLista, deps) {
  const col = "listas/" + quem.email;
  const [idBase, acao] = String(idLista || "").split("/");
  if (request.method === "GET" && !idLista) {
    const results = await deps.lerLinhas(env, "SELECT id, data FROM docs WHERE collection = ? ORDER BY json_extract(data, '$.criado') LIMIT ?", [col, LISTAS_MAX + AUTOMATICAS.length], "listas");
    const docs = results.map((r) => ({ id: r.id, data: JSON.parse(r.data) }));
    return json({ docs: ordenarDocs(docs).map((d) => ({ id: d.id, data: resumoParaColecao(d.data) })) });
  }
  const lerJson = async (limite) => {
    const corpo = await request.text();
    if (corpo.length > limite) return { erro: "grande", status: 413 };
    try { return { b: JSON.parse(corpo) }; } catch { return { erro: "json" }; }
  };
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
  const semDados = () => json({ erro: "As cotações ainda não chegaram. Tente de novo em alguns minutos." }, 503);

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

  // Ordem de exibição (lista de listas): { ids: [...] } na ordem nova; grava `posicao` só em quem mudou
  if (idLista === "ordem") {
    if (request.method !== "PUT") return json({ erro: "metodo" }, 405);
    const { b, erro, status } = await lerJson(4000);
    if (erro) return json({ erro }, status || 400);
    const ids = b && Array.isArray(b.ids) ? b.ids : null;
    if (!ids || ids.length > LISTAS_MAX + AUTOMATICAS.length || !ids.every((x) => typeof x === "string" && LISTA_ID_OK.test(x)) || new Set(ids).size !== ids.length) return json({ erro: "ids" }, 400);
    if (!ids.length) return json({ ok: true, mudaram: 0 });
    const { results } = await env.DB.prepare(`SELECT id, data FROM docs WHERE collection = ? AND id IN (${ids.map(() => "?").join(",")})`).bind(col, ...ids).all();
    const atuais = new Map((results || []).map((r) => { try { return [r.id, JSON.parse(r.data)]; } catch { return [r.id, null]; } }));
    const agora = agoraIso(), pares = [];
    ids.forEach((id, k) => { const d = atuais.get(id); if (d && d.posicao !== k) pares.push([id, { ...d, posicao: k, atualizado: agora }]); });
    if (pares.length) await gravar(pares);
    return json({ ok: true, mudaram: pares.length });
  }

  if (request.method === "POST" && !idLista) {
    const { b, erro, status } = await lerJson(20000);
    if (erro) return json({ erro }, status || 400);
    const v = validarLista(b);
    if (v.erro) return json({ erro: v.erro }, 400);
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
    let doc = { nome: v.nome, papeis: v.papeis, criado: agora, atualizado: agora };
    for (const k of CAMPOS_OPCIONAIS) if (v[k] !== undefined && v[k] !== null && v[k] !== "") doc[k] = v[k];
    if (v.ordem) doc.ordem = v.ordem;
    if (ehDinamica(doc)) {
      const dados = await dadosDaLista(env, deps, quem.email, doc.regra);
      if (!dados) return semDados();
      const m = materializar(doc.regra, dados, { fixos: doc.fixos || [], excluidos: doc.excluidos || [] });
      doc = { ...doc, papeis: m.papeis, cortados: m.cortados.length, calculado: agora };
    }
    doc.historico = [{ quando: agora, papel: null, acao: "criada", motivo: `criada com ${nPapeis(doc.papeis.length)}` }];
    await gravar([[id, doc]]);
    return json({ ok: true, id, data: doc });
  }
  if (!idBase || !LISTA_ID_OK.test(idBase) || (acao && acao !== "recalcular")) return json({ erro: "id" }, 400);

  // Recalcular agora (dono): uma vez a cada 5 min
  if (acao === "recalcular") {
    if (request.method !== "POST") return json({ erro: "metodo" }, 405);
    const atual = await lerDoc(idBase);
    if (!atual) return json({ erro: "Lista não encontrada." }, 404);
    if (!ehDinamica(atual.doc)) return json({ erro: "Só lista por regra é recalculada." }, 400);
    const idade = atual.doc.recalcManual ? Date.now() - Date.parse(atual.doc.recalcManual) : Infinity;
    if (idade < RECALC_MANUAL_MS) return json({ erro: "A lista foi recalculada há pouco. Dá para recalcular de novo daqui a alguns minutos.", aguarde: Math.ceil((RECALC_MANUAL_MS - idade) / 1000) }, 429);
    const dados = await dadosDaLista(env, deps, quem.email, atual.doc.regra);
    if (!dados) return semDados();
    const agora = agoraIso();
    const r = aplicarRegra(atual.doc, dados, agora);
    const doc = { ...r.doc, recalcManual: agora, atualizado: agora };
    await gravar([[idBase, doc]]);
    return json({ ok: true, id: idBase, data: doc, mudou: r.mudou, novas: r.novas });
  }

  // Uma lista inteira (página da lista). Dinâmica com cálculo de mais de 1 h é recalculada antes.
  if (request.method === "GET") {
    const atual = await lerDoc(idBase);
    if (!atual) return json({ erro: "Lista não encontrada." }, 404);
    let doc = atual.doc;
    if (ehDinamica(doc) && doc.ativa !== false && !(Date.now() - Date.parse(doc.calculado || 0) < RECALC_ABRIR_MS)) {
      const dados = await dadosDaLista(env, deps, quem.email, doc.regra).catch(() => null);
      if (dados) {
        const agora = agoraIso();
        doc = { ...aplicarRegra(doc, dados, agora).doc, atualizado: agora };
        await gravar([[idBase, doc]]);
      }
    }
    return json({ id: idBase, data: doc });
  }

  if (request.method === "PUT") {
    const atual = await lerDoc(idBase);
    if (!atual) return json({ erro: "Lista não encontrada." }, 404);
    const { b, erro, status } = await lerJson(20000);
    if (erro) return json({ erro }, status || 400);
    if (!b || typeof b !== "object" || Array.isArray(b)) return json({ erro: "corpo" }, 400);
    const agora = agoraIso();
    if (ehAutomatica(idBase, atual.doc)) {
      // da automática a pessoa só liga, desliga, descreve e reordena
      if (Object.keys(b).some((k) => !CAMPOS_AUTO.has(k))) return json({ erro: "lista automática" }, 400);
      const v = validarLista({ nome: atual.doc.nome, papeis: atual.doc.papeis, ...b });
      if (v.erro) return json({ erro: v.erro }, 400);
      const doc = { ...atual.doc, atualizado: agora };
      for (const k of CAMPOS_AUTO) if (v[k] !== undefined) { if (v[k] === "") delete doc[k]; else doc[k] = v[k]; }
      await gravar([[idBase, doc]]);
      return json({ ok: true, id: idBase, data: doc });
    }
    const corpo = { nome: atual.doc.nome, papeis: atual.doc.papeis, ...b };
    for (const k of ["historico", "criado", "atualizado", "calculado", "auto", "classe", "cortados", "recalcManual"]) delete corpo[k];
    const v = validarLista(corpo);
    if (v.erro) return json({ erro: v.erro }, 400);
    let doc = { ...atual.doc, nome: v.nome, papeis: v.papeis, atualizado: agora, criado: atual.doc.criado || agora };
    if ("ordem" in b) { if (v.ordem) doc.ordem = v.ordem; else delete doc.ordem; }
    for (const k of CAMPOS_OPCIONAIS) {
      if (!(k in b)) continue;
      const x = v[k];
      if (x === null || x === "" || (Array.isArray(x) && !x.length)) delete doc[k]; else doc[k] = x;
    }
    const eraDin = ehDinamica(atual.doc), din = ehDinamica(doc);
    let novas = [];
    if (din) {
      const mudRegra = eraDin ? RF.mudancasRegra(atual.doc.regra, doc.regra) : [];
      const mexeu = !eraDin || mudRegra.length || JSON.stringify(atual.doc.fixos || []) !== JSON.stringify(doc.fixos || []) || JSON.stringify(atual.doc.excluidos || []) !== JSON.stringify(doc.excluidos || []);
      if (mexeu) {
        const dados = await dadosDaLista(env, deps, quem.email, doc.regra);
        if (!dados) return semDados();
        const motivoRegra = !eraDin ? "virou lista por regra" : mudRegra.length ? "regra alterada: " + mudRegra.join("; ") : "";
        const r = aplicarRegra({ ...doc, papeis: atual.doc.papeis || [] }, dados, agora, motivoRegra);
        doc = { ...r.doc, atualizado: agora };
        novas = r.novas;
        if (motivoRegra && !novas.length) doc.historico = registrar(doc.historico, [{ quando: agora, papel: null, acao: "regra", motivo: motivoRegra + " (nenhum papel entrou nem saiu)" }]);
      } else doc.papeis = atual.doc.papeis || []; // na dinâmica os papéis vêm da regra, não do corpo
    } else {
      novas = diffManual(atual.doc.papeis, doc.papeis, agora);
      if (eraDin) novas.unshift({ quando: agora, papel: null, acao: "regra", motivo: "virou lista manual; os papéis de agora ficam" });
      doc.historico = registrar(atual.doc.historico, novas);
      for (const k of ["calculado", "cortados", "recalcManual"]) delete doc[k];
    }
    await gravar([[idBase, doc]]);
    return json({ ok: true, id: idBase, data: doc });
  }
  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM docs WHERE collection = ? AND id = ?").bind(col, idBase).run();
    deps.removerDoEspelho(env, [{ collection: col, id: idBase }]);
    return json({ ok: true });
  }
  return json({ erro: "metodo" }, 405);
}
