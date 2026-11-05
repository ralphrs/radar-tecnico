// Preferências de tela por pessoa, em prefs/<email>:
// - doc "tabelas": estado de cada tabela da página (ordenação, filtros por coluna, página, linhas por página e colunas
//   ocultas, até 30), por id da tabela, mais as Minhas listas automáticas ("lista-<id>"), cujo PUT de lista é recusado. Até 40 tabelas; o PUT
//   manda só as que mudaram ({ tabelas: { <id>: estado | null } }) e o servidor junta com o que já havia, guardando as
//   40 mexidas por último. Assim dois aparelhos abertos não apagam a tabela um do outro.
// - doc "layout": colunas recolhidas ({ esq, dir }).
// - doc "reinvestir": pesos e universo do card Reinvestir da Minha carteira (validarReinvestir, no fim do arquivo).
// A conferência do estado é a mesma da página (public/tabela.js). Sem nada do Worker aqui, para os testes rodarem no Node.

import "../public/tabela.js";
import { IDS as IDS_REINV, PESOS_PADRAO as PESOS_REINV, PESO_MAX as PESO_MAX_REINV, UNIVERSOS as UNIVERSOS_REINV } from "./pontuacao-fii.js";
const T = globalThis.Tabela;

export const MAX_TABELAS = 40;

// Confere o corpo do PUT de tabelas. Devolve { tabelas: { id: estado | null } } ou { erro }.
export function validarTabelas(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return { erro: "corpo" };
  const t = b.tabelas;
  if (!t || typeof t !== "object" || Array.isArray(t)) return { erro: "tabelas" };
  const ids = Object.keys(t);
  if (ids.length > MAX_TABELAS) return { erro: `Dá para guardar até ${MAX_TABELAS} tabelas.` };
  const out = {};
  for (const id of ids) {
    if (!T.ID_OK.test(id)) return { erro: "id de tabela: " + String(id).slice(0, 40) };
    if (t[id] === null) { out[id] = null; continue; }
    const v = T.validarEstado(t[id]);
    if (v.erro) return { erro: `${id}: ${v.erro}` };
    out[id] = v.estado;
  }
  return { tabelas: out };
}

// Junta o salvo com o que chegou. Cada tabela leva "em" (quando mudou); passando de 40, saem as mais antigas.
export function mesclarTabelas(salvo, novas, agora = new Date().toISOString()) {
  const base = salvo && salvo.tabelas && typeof salvo.tabelas === "object" ? { ...salvo.tabelas } : {};
  for (const [id, e] of Object.entries(novas || {})) {
    if (e === null) delete base[id];
    else base[id] = { ...e, em: agora };
  }
  const ids = Object.keys(base).sort((a, b) => String(base[b].em || "").localeCompare(String(base[a].em || "")));
  const out = {};
  for (const id of ids.slice(0, MAX_TABELAS)) out[id] = base[id];
  return out;
}

// Resposta do GET: só o estado conferido de cada tabela (o que estiver estragado no banco fica de fora).
export function respostaTabelas(salvo) {
  const out = {};
  for (const [id, e] of Object.entries((salvo && salvo.tabelas) || {})) {
    if (!T.ID_OK.test(id)) continue;
    const v = T.validarEstado(e);
    if (v.estado) out[id] = v.estado;
  }
  return { tabelas: out, atualizado: (salvo && salvo.atualizado) || null };
}

export function validarLayout(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return { erro: "corpo" };
  for (const k of Object.keys(b)) if (k !== "esq" && k !== "dir") return { erro: "campo " + String(k).slice(0, 20) };
  if (typeof b.esq !== "boolean" || typeof b.dir !== "boolean") return { erro: "Use true ou false em esq e dir." };
  return { layout: { esq: b.esq, dir: b.dir } };
}
export const respostaLayout = (salvo) => ({ esq: !!(salvo && salvo.esq), dir: !!(salvo && salvo.dir), salvo: !!salvo });

// Doc "reinvestir": pesos dos critérios do card Reinvestir da Minha carteira e o universo ({ pesos, universo }).
// Critérios, faixas e padrão em src/pontuacao-fii.js. Pesos inteiros de 0 a 50, pelo menos um acima de zero; critério
// que não vier fica com o peso padrão.
export function validarReinvestir(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return { erro: "corpo" };
  for (const k of Object.keys(b)) if (k !== "pesos" && k !== "universo") return { erro: "campo " + String(k).slice(0, 20) };
  const universo = b.universo === undefined ? "todos" : b.universo;
  if (!UNIVERSOS_REINV.includes(universo)) return { erro: "Universo: use todos ou meus." };
  const p = b.pesos === undefined ? {} : b.pesos;
  if (!p || typeof p !== "object" || Array.isArray(p)) return { erro: "pesos" };
  const pesos = { ...PESOS_REINV };
  for (const [k, v] of Object.entries(p)) {
    if (!IDS_REINV.includes(k)) return { erro: "Critério desconhecido: " + String(k).slice(0, 20) };
    if (!Number.isInteger(v) || v < 0 || v > PESO_MAX_REINV) return { erro: `Peso de ${k}: use um inteiro de 0 a ${PESO_MAX_REINV}.` };
    pesos[k] = v;
  }
  if (!Object.values(pesos).some((v) => v > 0)) return { erro: "Deixe pelo menos um critério com peso acima de zero." };
  return { reinvestir: { pesos, universo } };
}
// O salvo (conferido de novo) ou o padrão.
export function respostaReinvestir(salvo) {
  const v = salvo ? validarReinvestir({ pesos: salvo.pesos, universo: salvo.universo }) : null;
  if (v && v.reinvestir) return { ...v.reinvestir, salvo: true };
  return { pesos: { ...PESOS_REINV }, universo: "todos", salvo: false };
}
