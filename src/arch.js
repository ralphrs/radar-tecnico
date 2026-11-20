// ArchLandscape: comparação profunda (o "dossiê para ADR"), pedida pelo Admin na tela de comparação e feita por uma
// tarefa agendada fora do Worker. O site só grava o pedido, guarda e mostra o que a tarefa escreveu.
//
// Contrato (fixo), collection `arch-dossies`, id "d" + 16 hexadecimais:
//   { aba: "tools" | "cloud", ids: [...], subcategoria, contexto (até 600), estado: "pendente" | "pronto" | "falhou",
//     criado, pedidoEm (o último pedido), forcado (true quando o Admin pediu "Atualizar análise"), por (e-mail de quem
//     pediu), roteiro (o texto que o site monta para a IA, Arch.roteiroProfunda: capacidades, limites, maturidade,
//     dependência do fornecedor, operação e encaixe por cenário, sem preço; refeito a cada pedido), prontoEm, expiraEm (prontoEm + 30 dias; a tarefa grava, e o site calcula
//     quando não vier), markdown (até 60.000; com `estrutura`, só a reserva), estrutura (a análise em colunas, veja
//     Arch.estruturaOk em public/arch.js; a tarefa grava, o site valida ao ler), fontes: [{ titulo, url, em }] (os números
//     de `estrutura` apontam para esta lista, a partir de 1), resposta (frase curta em caso de falha) }
// A tarefa lê os pendentes com SQL_PENDENTES e fecha cada um com SQL_FECHAR (as duas rodam nos testes como estão).
// Validade: pronta vale 30 dias (Arch.estadoDaAnalise). Dentro dela, pedir o mesmo conjunto (mesmos ids, qualquer
// ordem) devolve a que existe, sem gastar a trava do dia; { forcar: true } pede de novo no mesmo doc. Vencida, a tela
// pede sozinha ao abrir, também no mesmo doc. Pendente não expira. A limpeza apaga as de mais de 180 dias (pelo último pedido).
import "../public/landscape.js";
import "../public/arch.js";
import { listaLeve as listaCloud, lerProvedores, lerCategorias } from "./cloud.js";
import { listaLeve as listaTools } from "./landscape.js";

const A = globalThis.Arch;
const L = globalThis.Landscape;
const DIA = 86_400_000;
export const MAX_PENDENTES = 3;
export const MAX_POR_DIA = 10;
export const DIAS_GUARDA = 180;
export const SQL_PENDENTES = "SELECT id, data FROM docs WHERE collection = 'arch-dossies' AND json_extract(data, '$.estado') = 'pendente' ORDER BY json_extract(data, '$.criado')";
export const SQL_FECHAR = "UPDATE docs SET data = json_patch(data, ?), atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE collection = 'arch-dossies' AND id = ?";

const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const agoraIso = (t = Date.now()) => new Date(t).toISOString();
/* A tarefa que escreve a análise não tem relógio confiável (já gravou "pronto" com a hora de 11 horas à frente). A hora
   certa é a da coluna `atualizado`, que o próprio UPDATE de fechamento grava com o relógio do banco. Numa análise pronta,
   `prontoEm` passa a ser essa hora, `expiraEm` os 30 dias a partir dela, e `iniciadoEm` nunca fica depois dela. */
export function relogioDoBanco(data, atualizado) {
  if (!data || typeof data !== "object" || data.estado !== "pronto") return data;
  const t = Date.parse(atualizado || "");
  if (!Number.isFinite(t)) return data;
  const out = { ...data, prontoEm: new Date(t).toISOString(), expiraEm: new Date(t + 30 * DIA).toISOString() };
  if (out.iniciadoEm && !(Date.parse(out.iniciadoEm) <= t)) delete out.iniciadoEm;
  return out;
}
const novoId = () => { const b = new Uint8Array(8); crypto.getRandomValues(b); return "d" + [...b].map((x) => x.toString(16).padStart(2, "0")).join(""); };

export async function todos(env) {
  const { results } = await env.DB.prepare("SELECT id, data, atualizado FROM docs WHERE collection = 'arch-dossies'").all();
  return (results || []).map((r) => ({ id: r.id, data: relogioDoBanco(parse(r.data), r.atualizado) })).filter((d) => d.data && A.ID_DOSSIE.test(d.id));
}
// O que a tela mostra de cada um: o estado de hoje (pronta, vencida...) e a validade calculada
// Inteiro (o doc aberto): com o Markdown e a `estrutura` já saneada (Arch.estruturaOk; null quando não dá para usar).
// A lista vai sem os dois.
export const vista = (d, agora, inteiro = false) => {
  const { markdown, estrutura, ...resto } = d.data;
  const fontes = Array.isArray(resto.fontes) ? resto.fontes : [];
  return { id: d.id, ...resto, ...(inteiro ? { markdown: typeof markdown === "string" ? markdown.slice(0, A.MARKDOWN_MAX) : "", estrutura: A.estruturaOk(estrutura, resto.ids, fontes.length) } : {}), situacao: A.estadoDaAnalise(d.data, agora), expiraEm: A.expiraDe(d.data) };
};

// POST /api/admin/arch/dossies { aba, ids, contexto }, GET (lista, sem o Markdown), GET <id>, DELETE <id>
export async function rotaDossies(request, env, quem, id, deps, { agora = Date.now() } = {}) {
  if (!quem || !quem.admin) return json({ erro: "rota" }, 404);
  if (id) {
    if (!A.ID_DOSSIE.test(id)) return json({ erro: "id" }, 400);
    const r = await env.DB.prepare("SELECT data, atualizado FROM docs WHERE collection = 'arch-dossies' AND id = ?").bind(id).first();
    const d = r ? relogioDoBanco(parse(r.data), r.atualizado) : null;
    if (!d) return json({ erro: "nao-encontrado" }, 404);
    if (request.method === "GET") return json({ dossie: vista({ id, data: d }, agora, true) });
    if (request.method === "DELETE") { await env.DB.prepare("DELETE FROM docs WHERE collection = 'arch-dossies' AND id = ?").bind(id).run(); return json({ ok: true }); }
    return json({ erro: "metodo" }, 405);
  }
  const lista = await todos(env);
  if (request.method === "GET") {
    const url = new URL(request.url);
    const aba = url.searchParams.get("aba"), ids = url.searchParams.get("ids");
    // a aba Profunda de uma comparação: o que existe para aquele conjunto (pronta, pendente, vencida, falhou)
    if (aba && ids) {
      const a = A.analisesDoConjunto(lista, aba, ids.split(","), agora);
      const v = (x, inteiro) => (x ? vista(x, agora, inteiro) : null);
      return json({ conjunto: A.conjunto(ids.split(",")), pronta: v(a.pronta, true), pendente: v(a.pendente, true), vencida: v(a.vencida, true), falhou: v(a.falhou) });
    }
    return json({ dossies: lista.map((d) => vista(d, agora)).sort((a, b) => String(b.criado || "").localeCompare(String(a.criado || ""))) });
  }
  if (request.method !== "POST") return json({ erro: "metodo" }, 405);
  const corpo = await request.text();
  if (corpo.length > 4000) return json({ erro: "grande" }, 413);
  const b = parse(corpo);
  if (!b || typeof b !== "object" || Array.isArray(b)) return json({ erro: "corpo" }, 400);
  if (!A.ABAS.includes(b.aba)) return json({ erro: "Aba desconhecida." }, 400);
  const ids = Array.isArray(b.ids) ? [...new Set(b.ids.map(String))] : [];
  const contexto = typeof b.contexto === "string" ? b.contexto.replace(/\s+/g, " ").trim() : "";
  if (contexto.length > A.CONTEXTO_MAX) return json({ erro: `O contexto guarda até ${A.CONTEXTO_MAX} caracteres.` }, 400);
  // só concorrentes da mesma subcategoria, de 2 a 4, que existem na aba
  const catalogo = b.aba === "cloud" ? await listaCloud(env, deps) : await listaTools(env, deps);
  const pode = A.podeComparar(ids, catalogo);
  if (!pode.pode) return json({ erro: pode.motivo }, 400);
  // Um doc por conjunto (adendo de 19/11, 14h10): o mesmo id é reaproveitado e a análise nova sobrescreve a antiga.
  // - pendente: volta como está (abrir duas vezes não cria dois pedidos);
  // - pronta dentro da validade: volta como está, a não ser com { forcar: true } ("Atualizar análise");
  // - vencida ou falhou: o mesmo doc volta a pendente (a tela pede sozinha ao abrir), com o markdown antigo guardado.
  const ja = A.analisesDoConjunto(lista, b.aba, ids, agora);
  const roteiro = await montarRoteiro(env, deps, b.aba, ids, catalogo, pode.subcategoria, contexto || (ja.pronta || ja.vencida || ja.falhou || {}).data?.contexto || "");
  if (ja.pendente) return json({ ok: true, existente: true, dossie: vista(ja.pendente, agora, true) }, 200);
  if (ja.pronta && !b.forcar) return json({ ok: true, existente: true, dossie: vista(ja.pronta, agora, true) }, 200);
  const pendentes = lista.filter((d) => d.data.estado === "pendente").length;
  if (pendentes >= MAX_PENDENTES) return json({ erro: `Já há ${MAX_PENDENTES} comparações profundas na fila. Espere uma ficar pronta.` }, 429);
  const hoje = L.diaSP(agora);
  if (lista.filter((d) => L.diaSP(Date.parse(d.data.pedidoEm || d.data.criado || "")) === hoje).length >= MAX_POR_DIA) return json({ erro: `Até ${MAX_POR_DIA} pedidos por dia. Amanhã dá para pedir de novo.` }, 429);
  const reusar = ja.pronta || ja.vencida || ja.falhou;
  if (reusar) {
    const patch = { estado: "pendente", pedidoEm: agoraIso(agora), forcado: !!(ja.pronta && b.forcar), por: quem.email, resposta: "", roteiro, ...(contexto ? { contexto } : {}) };
    await env.DB.prepare(SQL_FECHAR).bind(JSON.stringify(patch), reusar.id).run();
    const data = { ...reusar.data, ...patch };
    return json({ ok: true, existente: false, renovado: true, dossie: vista({ id: reusar.id, data }, agora, true) }, 200);
  }
  const data = { aba: b.aba, ids: ids.slice().sort(), subcategoria: pode.subcategoria, contexto, estado: "pendente", criado: agoraIso(agora), pedidoEm: agoraIso(agora), por: quem.email, roteiro, prontoEm: null, expiraEm: null, markdown: "", fontes: [], resposta: "", forcado: false };
  const nid = novoId();
  await env.DB.prepare("INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES ('arch-dossies', ?, ?, '', ?)").bind(nid, JSON.stringify(data), data.criado).run();
  return json({ ok: true, existente: false, dossie: vista({ id: nid, data }, agora, true) }, 201);
}

// O roteiro do pedido: as opções na ordem pedida, o nome da subcategoria e as capacidades da matriz dela
async function montarRoteiro(env, deps, aba, ids, catalogo, sub, contexto) {
  const servs = ids.map((id) => catalogo.find((s) => s.id === id)).filter(Boolean);
  let provs = [], subNome = sub;
  if (aba === "cloud") {
    const [p, c] = await Promise.all([lerProvedores(env, deps).catch(() => []), lerCategorias(env, deps).catch(() => [])]);
    provs = p; subNome = A.nomeSub(c, sub) || sub;
  }
  return A.roteiroProfunda(servs, { aba, provs, sub, subNome, contexto });
}

// Limpeza (src/coleta.js, limpar): as de mais de 180 dias saem, por lista de ids, em lotes de 90
export async function limparDossies(env, agora = Date.now()) {
  const corte = agoraIso(agora - DIAS_GUARDA * DIA);
  // pela data do último pedido (um doc renovado não sai por ter sido criado há muito tempo)
  const { results } = await env.DB.prepare("SELECT id, coalesce(json_extract(data, '$.pedidoEm'), json_extract(data, '$.criado')) AS criado FROM docs WHERE collection = 'arch-dossies'").all();
  const fora = (results || []).filter((r) => r.criado && r.criado < corte).map((r) => r.id);
  for (let k = 0; k < fora.length; k += 90) {
    const parte = fora.slice(k, k + 90);
    await env.DB.prepare(`DELETE FROM docs WHERE collection = 'arch-dossies' AND id IN (${parte.map((_, j) => `?${j + 1}`).join(",")})`).bind(...parte).run();
  }
  return fora;
}
