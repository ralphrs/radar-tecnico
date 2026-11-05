// Preferências de tela por pessoa, em prefs/<email>:
// - doc "tabelas": estado de cada tabela da página (ordenação, filtros por coluna, página, linhas por página e colunas
//   ocultas, até 30), por id da tabela, mais as Minhas listas automáticas ("lista-<id>"), cujo PUT de lista é recusado. Até 40 tabelas; o PUT
//   manda só as que mudaram ({ tabelas: { <id>: estado | null } }) e o servidor junta com o que já havia, guardando as
//   40 mexidas por último. Assim dois aparelhos abertos não apagam a tabela um do outro.
// - doc "layout": colunas recolhidas ({ esq, dir }).
// A conferência do estado é a mesma da página (public/tabela.js). Sem nada do Worker aqui, para os testes rodarem no Node.

import "../public/tabela.js";
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
