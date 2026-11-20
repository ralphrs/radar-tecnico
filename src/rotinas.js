// Rotinas: o relatório do Admin (pedido de 19/11). O que rodou, o que não rodou ou está parado, e há quanto tempo.
// Em 16/11 a aba Tech ficou 10 dias sem notícia nova e a tradução 3 dias sem rodar, e nada na tela dizia. Este arquivo
// junta as duas pontas:
// - o batimento do cron: cada etapa do `scheduled` (src/index.js) marca o resultado na memória e, no fim, antes da
//   sincronia do espelho, tudo vai para um doc só, _sistema/rotinas, com uma leitura e uma gravação por invocação;
// - o relatório: GET /api/admin/rotinas (só Admin) lê esse doc, o rastro das curadorias (meta/status*), a contagem de
//   itens por seção, o plantão (pedidos "agora" pendentes) e os feeds com falha, em duas consultas ao D1, mais o estado
//   do espelho, que mora no Durable Object.
//
// _sistema/rotinas: { criado, atualizado, porId: { <id>: { ok, erro, msg, ms, feitos, vazio, nota } } }
//   ok: última vez que a etapa teve trabalho e terminou sem exceção (ISO); erro: última falha, inteira ou parcial (ISO),
//   com a mensagem curta em msg; ms: quanto levou a última vez que rodou; feitos: número ou texto curto do que fez;
//   vazio: última vez que rodou e não tinha trabalho (fila vazia, nada vencido); nota: o porquê, quando há (pausa, fim).
//
// Horários em São Paulo (UTC-3 o ano todo desde 2019); o cron e as janelas abaixo estão em UTC.
import { pregaoAberto } from "./mercado.js";
import { pregaoEuaAberto, horaNY } from "./eua.js";
import { FEEDS } from "./feeds.js";
import { ehReddit } from "./coleta.js";

const MIN = 60_000, HORA = 3_600_000;
export const DOC_ID = "rotinas";
export const MSG_MAX = 160;
export const FOLGA_MIN = 2;         // minutos depois da janela antes de contar como perdida (o cron começa e termina com atraso)
export const ESTADOS = ["parada", "atrasada", "com erro", "em dia"]; // ordem da tela: o pior em cima
export const CURADORIA = { EM_DIA_H: 13, ATRASADA_H: 26 };
export const PLANTAO = { ATRASADO_H: 2, PARADO_H: 6 };
// Levantamento da Oficina (tarefa semanal): com pendência, em dia até 8 dias da última gravação, atrasado até 15, parado depois
export const OFICINA = { PRECO_VENCE_DIAS: 7, EM_DIA_D: 8, ATRASADO_D: 15 };
// Periódicas: atrasada passando de 2 janelas perdidas (2 vezes o intervalo), parada passando de 6.
// De janela (uma vez por dia, uma vez por mês): a conta começa na janela perdida. Uma perdida, atrasada; duas, parada.
export const LIMIARES = { periodica: [2, 6], janela: [1, 2] };

const util = (d) => d.getUTCDay() >= 1 && d.getUTCDay() <= 5;
const diaUmEmSP = (d) => new Date(d.getTime() - 3 * HORA).getUTCDate() === 1;
const fechamentoNY = (d) => { const n = horaNY(d); return n.dia >= 1 && n.dia <= 5 && n.min === 16 * 60 + 35; };

// A tabela dos intervalos esperados, num lugar só. Cada rotina tem uma ou mais séries de horários (`horarios`):
// a cada `passo` minutos, começando no minuto `desvio` (contado do início do dia UTC para passo de 1440, do início da
// hora para os outros), só quando `bate` (se houver) aceita o minuto. `dura`: minutos da janela (a leitura do dia roda
// das 7h40 às 7h49). `esperado` é o texto que a tela mostra. docs/LOOKOUT.md, "Rotinas: o relatório do Admin", repete a tabela.
export const ROTINAS = [
  { id: "feeds", nome: "Leitura dos feeds", esperado: "a cada minuto", horarios: [{ passo: 1 }] },
  { id: "foruns", nome: "Fóruns (Reddit)", esperado: "a cada minuto", horarios: [{ passo: 1 }] },
  { id: "mercado", nome: "Cotações de mercado", detalhe: "moedas, bolsa e indicadores", esperado: "a cada 30 min", horarios: [{ passo: 30, desvio: 3 }] },
  { id: "cripto", nome: "Cotações de cripto", esperado: "a cada 30 min", horarios: [{ passo: 30, desvio: 16 }] },
  { id: "b3", nome: "B3", detalhe: "ações, FIIs, ETFs e BDRs", esperado: "a cada 30 min com pregão aberto, e às 18h35", horarios: [{ passo: 30, desvio: 5, bate: pregaoAberto }, { passo: 1440, desvio: 21 * 60 + 35, bate: util }] },
  { id: "eua", nome: "EUA", detalhe: "ações, ETFs e índices", esperado: "a cada 30 min com Nova York aberta, e às 16h35 de lá", horarios: [{ passo: 30, desvio: 8, bate: pregaoEuaAberto }, { passo: 60, desvio: 35, bate: fechamentoNY }] },
  { id: "cvm", nome: "CVM", detalhe: "informe mensal dos FIIs", esperado: "uma vez por dia, 7h17", janela: true, horarios: [{ passo: 1440, desvio: 10 * 60 + 17 }] },
  { id: "esportes", nome: "Esportes", esperado: "a cada 5 min", horarios: [{ passo: 5, desvio: 4 }] },
  { id: "landscape", nome: "Landscape", detalhe: "GitHub e Hacker News", esperado: "a cada minuto", horarios: [{ passo: 1 }] },
  { id: "sonda", nome: "Sonda de feeds", esperado: "a cada minuto, quando há URL na fila", horarios: [{ passo: 1 }] },
  { id: "papel", nome: "Fichas de papel", esperado: "a cada hora, aos 23 min", horarios: [{ passo: 60, desvio: 23 }] },
  { id: "leitura", nome: "Leitura do dia", esperado: "uma vez por dia, 7h40", janela: true, horarios: [{ passo: 1440, desvio: 10 * 60 + 40, dura: 10 }] },
  { id: "listas", nome: "Listas por regra", esperado: "a cada hora, aos 41 min", horarios: [{ passo: 60, desvio: 41 }] },
  { id: "simulador", nome: "Simulador de reinvestimento", detalhe: "fecha o mês", esperado: "dia 1 de cada mês, 6h", janela: true, horarios: [{ passo: 1440, desvio: 9 * 60, dura: 60, bate: diaUmEmSP }] },
  { id: "limpeza", nome: "Limpeza", esperado: "a cada hora, aos 7 min", horarios: [{ passo: 60, desvio: 7 }] },
  { id: "historico", nome: "Histórico", detalhe: "importação inicial", esperado: "a cada minuto, até acabar", horarios: [{ passo: 1 }] },
  { id: "traducao", nome: "Tradução", esperado: "a cada minuto", horarios: [{ passo: 1 }] },
  { id: "espelho", nome: "Sincronia do espelho", esperado: "a cada minuto", horarios: [{ passo: 1 }] },
];
export const ROTINA = Object.fromEntries(ROTINAS.map((r) => [r.id, r]));

const iso = (t) => new Date(t).toISOString();
const ms = (v) => (v ? Date.parse(v) : NaN);
const maior = (...xs) => xs.filter(Boolean).sort().pop() || null;
export const curta = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, MSG_MAX);
export const msgDe = (e) => curta((e && e.message) || e || "erro");

// ---------- horários e estado ----------

// Horários (ms) das janelas depois de `desde` que já deviam ter rodado em `agora` (fim da janela mais a folga), em
// ordem, no máximo `limite`. Fora da janela não há horário: fim de semana para a B3 não conta.
export function janelasPerdidas(rotina, desde, agora, limite = 6) {
  const out = [];
  const de = Math.floor(desde / MIN) + 1;
  for (const h of rotina.horarios) {
    const passo = h.passo, desvio = h.desvio || 0;
    const fim = Math.floor(agora / MIN) - FOLGA_MIN - (h.dura || 0);
    let m = de + ((((desvio - de) % passo) + passo) % passo);
    for (let n = 0; m <= fim && n < 5000; m += passo) {
      if (h.bate && !h.bate(new Date(m * MIN))) continue;
      out.push(m * MIN);
      if (++n >= limite) break;
    }
  }
  return out.sort((a, b) => a - b).slice(0, limite);
}

// Estado de uma rotina do Worker. reg: o que o batimento guardou ({ ok, erro, msg, ms, feitos, vazio, nota }).
// criado: desde quando o registro existe (sem ele, "nunca rodou" já é parada).
export function estadoRotina(rotina, reg, agora, criado = null) {
  reg = reg || {};
  const ref = maior(reg.ok, reg.vazio);
  const [atrasa, para] = rotina.janela ? LIMIARES.janela : LIMIARES.periodica;
  const base = { id: rotina.id, nome: rotina.nome, detalhe: rotina.detalhe || "", esperado: rotina.esperado, janela: !!rotina.janela,
    ultimaOk: reg.ok || null, ultimaVez: ref, ultimoErro: reg.erro || null, msg: reg.msg || "", ms: reg.ms ?? null, feitos: reg.feitos ?? null, nota: reg.nota || "" };
  if (!ref) {
    const perdidas = criado ? janelasPerdidas(rotina, ms(criado), agora, 1) : [0];
    // nunca rodou: a idade conta desde que o registro existe (desdeMin), para o destaque do resumo
    if (perdidas.length) return { ...base, estado: "parada", nunca: true, desde: criado || null, desdeMin: criado ? Math.max(0, Math.floor((agora - ms(criado)) / MIN)) : null, perdida: perdidas[0] ? iso(perdidas[0]) : null, idadeMin: null };
    return { ...base, estado: reg.erro ? "com erro" : "em dia", nunca: true, aguardando: true, desde: criado, idadeMin: null };
  }
  const perdidas = janelasPerdidas(rotina, ms(ref), agora, para);
  const idadeMin = Math.max(0, Math.floor((agora - ms(ref)) / MIN));
  let estado = "em dia";
  if (perdidas.length >= para) estado = "parada";
  else if (perdidas.length >= atrasa) estado = "atrasada";
  else if (reg.erro && reg.erro >= (reg.ok || "")) estado = "com erro";
  const out = { ...base, estado, idadeMin };
  if (perdidas.length) out.perdida = iso(perdidas[0]);
  // rodou depois do último trabalho sem ter o que fazer: "sem trabalho desde ..."
  if (reg.vazio && (!reg.ok || reg.vazio > reg.ok)) out.semTrabalhoDesde = reg.ok || criado || null;
  return out;
}

// Curadoria (tarefa agendada fora do Worker): só o rastro em meta/status*. Três rodadas por dia; em dia até 13 h,
// atrasada até 26 h, parada depois. Rodou e nada entrou em 24 h: com erro (a tarefa roda e não publica).
export function estadoCuradoria({ secao, nome, status, itens24h = 0, itens7d = 0 }, agora) {
  const ultima = status && status.ultimaRodada ? status.ultimaRodada : null;
  const t = ms(ultima);
  const idadeMin = isNaN(t) ? null : Math.max(0, Math.floor((agora - t) / MIN));
  const base = { id: "curadoria-" + secao, secao, nome, esperado: "três rodadas por dia", ultimaOk: ultima, ultimaVez: ultima, ultimoErro: null, msg: "",
    novosNaUltima: status && status.novosNaUltima != null ? Number(status.novosNaUltima) : null, itens24h: Number(itens24h) || 0, itens7d: Number(itens7d) || 0, idadeMin };
  if (idadeMin === null) return { ...base, estado: "parada", nunca: true };
  const h = idadeMin / 60;
  const estado = h > CURADORIA.ATRASADA_H ? "parada" : h > CURADORIA.EM_DIA_H ? "atrasada" : "em dia";
  if (estado === "em dia" && !base.itens24h) return { ...base, estado: "com erro", msg: "rodou, mas nada entrou nas últimas 24 h" };
  return { ...base, estado };
}

// Plantão: pedidos "rodar agora" pendentes. Esperando há mais de 2 h, atrasado; mais de 6 h, parado (a tarefa de
// plantão não está rodando). ultimaOk: o último pedido "agora" atendido.
export function estadoPlantao({ pendentes = 0, maisAntigo = null, ultimoAtendido = null }, agora) {
  const n = Number(pendentes) || 0;
  const t = ms(maisAntigo);
  const esperaMin = n && !isNaN(t) ? Math.max(0, Math.floor((agora - t) / MIN)) : null;
  const ult = ms(ultimoAtendido);
  const base = { id: "plantao", nome: "Plantão", detalhe: "pedidos de rodar agora", esperado: "atende em até 2 h", ultimaOk: ultimoAtendido || null, ultimaVez: ultimoAtendido || null,
    ultimoErro: null, msg: "", pendentes: n, maisAntigo: n ? maisAntigo : null, esperaMin, desdeMin: esperaMin, idadeMin: isNaN(ult) ? null : Math.max(0, Math.floor((agora - ult) / MIN)) };
  if (!n || esperaMin === null) return { ...base, estado: "em dia" };
  const h = esperaMin / 60;
  return { ...base, estado: h > PLANTAO.PARADO_H ? "parada" : h > PLANTAO.ATRASADO_H ? "atrasada" : "em dia" };
}

// Comparações profundas do ArchLandscape: a mesma regra do plantão (pendente há mais de 2 h, atrasado; 6 h, parado),
// com a última pronta como "última vez que funcionou".
export function estadoDossies(d, agora) {
  return { ...estadoPlantao(d, agora), id: "dossies", nome: "Dossiês de ArchLandscape", detalhe: "comparações profundas pedidas", esperado: "atende em até 2 h" };
}

// Oficina: "Oficina: levantamento das ferramentas" (a tarefa também atende insumos e madeiras; os números vêm por collection).
// Sem nada pendente, em dia. Com pendência, conta da última vez que a tarefa gravou alguma coisa.
export function estadoLevantamentoOficina(porCol, agora) {
  const g = (c) => porCol[c] || { faltam: 0, vencidos: 0, ultima: null };
  const f = g("oficina-ferramentas"), i = g("oficina-insumos"), m = g("oficina-madeiras");
  const ultima = maior(f.ultima, i.ultima, m.ultima);
  const t = ms(ultima);
  const idadeMin = isNaN(t) ? null : Math.max(0, Math.floor((agora - t) / MIN));
  const pend = f.faltam + f.vencidos + i.faltam + i.vencidos + m.faltam;
  const base = { id: "oficina-levantamento", nome: "Oficina: levantamento das ferramentas", detalhe: "detalhes e preços por loja; insumos e madeiras na mesma tarefa", esperado: "uma vez por semana",
    ultimaOk: ultima, ultimaVez: ultima, ultimoErro: null, idadeMin, faltam: f.faltam, precoVencido: f.vencidos, insumos: { faltam: i.faltam, precoVencido: i.vencidos }, madeiras: { faltam: m.faltam },
    msg: `ferramentas: ${f.faltam} sem detalhes, ${f.vencidos} com preço vencido · insumos: ${i.faltam} e ${i.vencidos} · madeiras: ${m.faltam} sem detalhes` };
  if (!pend) return { ...base, msg: "nada pendente", estado: "em dia" };
  if (idadeMin === null) return { ...base, estado: "parada", nunca: true };
  const d = idadeMin / (24 * 60);
  return { ...base, estado: d > OFICINA.ATRASADO_D ? "parada" : d > OFICINA.EM_DIA_D ? "atrasada" : "em dia" };
}

const peso = (e) => ESTADOS.indexOf(e);
const idadeOrdem = (l) => (l.id === "plantao" || l.id === "dossies" ? l.esperaMin : l.idadeMin ?? l.desdeMin) ?? Infinity;
export const ordenar = (linhas) => linhas.slice().sort((a, b) => peso(a.estado) - peso(b.estado) || (idadeOrdem(b) - idadeOrdem(a)) || 0);

export function resumoDe(linhas) {
  const r = { emDia: 0, comErro: 0, atrasadas: 0, paradas: 0, total: linhas.length, destaque: null };
  for (const l of linhas) {
    if (l.estado === "em dia") r.emDia++; else if (l.estado === "com erro") r.comErro++; else if (l.estado === "atrasada") r.atrasadas++; else r.paradas++;
  }
  // a parada há mais tempo: pela idade desde a última vez que funcionou; a que nunca rodou, desde que o registro existe
  const idade = (l) => (l.id === "plantao" || l.id === "dossies" ? l.esperaMin : l.idadeMin ?? l.desdeMin) ?? Infinity;
  const paradas = linhas.filter((l) => l.estado === "parada").sort((a, b) => (idade(b) - idade(a)) || 0);
  // plantão: a idade é a espera do pedido mais antigo
  if (paradas.length) {
    const p = paradas[0];
    r.destaque = p.id === "plantao" || p.id === "dossies" ? { id: p.id, nome: p.nome, esperaMin: p.esperaMin, pendentes: p.pendentes, idadeMin: p.esperaMin, ultimaVez: null, nunca: false }
      : { id: p.id, nome: p.nome, idadeMin: p.idadeMin ?? p.desdeMin ?? null, ultimaVez: p.ultimaVez || null, nunca: !!p.nunca };
  }
  return r;
}

// ---------- batimento (cron) ----------

// Um por invocação do cron. marcar() só junta na memória; gravarBatimento() lê o doc, mescla e grava uma vez.
// resultado: { tipo: "ok" | "vazio" | "erro" | "fora", msg?, feitos?, nota? }. "ok" com msg é erro parcial: rodou,
// mas com falha (cripto na reserva, feed com erro, ESPN 403), e marca ok e erro juntos. "fora": fora da janela, nada muda.
export function novoBatimento(relogio = () => Date.now()) {
  const marcas = {};
  const marcar = (id, r, duracao) => {
    if (!r || r.tipo === "fora" || !ROTINA[id]) return;
    const quando = iso(relogio());
    const m = marcas[id] || (marcas[id] = {});
    if (duracao != null) m.ms = Math.max(0, Math.round(duracao));
    if (r.feitos != null) m.feitos = typeof r.feitos === "number" ? r.feitos : curta(r.feitos).slice(0, 60);
    if (r.tipo === "ok") m.ok = quando;
    if (r.tipo === "vazio") { m.vazio = quando; m.nota = r.nota ? curta(r.nota) : ""; }
    if (r.tipo === "erro" || (r.tipo === "ok" && r.msg)) { m.erro = quando; m.msg = curta(r.msg || "erro"); }
  };
  return { marcas, relogio, marcar };
}

// Roda uma etapa e marca o resultado. ids: um id ou uma lista; ler(r) devolve o resultado (ou, com lista, { id: resultado }).
// Exceção: marca erro em cada id e lança de novo, para o try/catch do cron manter o console.error de sempre.
export async function etapa(bat, ids, fn, ler = lerPadrao) {
  const lista = Array.isArray(ids) ? ids : [ids];
  const t0 = bat.relogio();
  let r;
  try { r = await fn(); }
  catch (e) { const d = bat.relogio() - t0; for (const id of lista) bat.marcar(id, { tipo: "erro", msg: msgDe(e) }, d); throw e; }
  const d = bat.relogio() - t0;
  let lido;
  try { lido = ler(r); } catch (e) { lido = { tipo: "ok", msg: "resultado ilegível: " + msgDe(e) }; }
  if (Array.isArray(ids)) for (const id of lista) bat.marcar(id, lido && lido[id], d);
  else bat.marcar(ids, lido, d);
  return r;
}
const lerPadrao = (r) => (r == null ? { tipo: "fora" } : { tipo: "ok" });

// Mescla as marcas no que já estava guardado (campos que a etapa não mexeu agora ficam).
export function mesclar(doc, marcas, agora) {
  const out = { criado: (doc && doc.criado) || iso(agora), atualizado: iso(agora), porId: { ...((doc && doc.porId) || {}) } };
  for (const [id, m] of Object.entries(marcas)) out.porId[id] = { ...(out.porId[id] || {}), ...m };
  return out;
}

export const SQL_LER = "SELECT data FROM docs WHERE collection = '_sistema' AND id = ?";
export const SQL_GRAVAR = "INSERT INTO docs (collection, id, data) VALUES ('_sistema', ?, ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, atualizado = strftime('%Y-%m-%dT%H:%M:%fZ','now')";
// Uma consulta para ler e uma para gravar, com a chave explícita. Nunca lança: falha vai para o console.error e o cron segue.
export async function gravarBatimento(env, bat) {
  try {
    let doc = null;
    try { const r = await env.DB.prepare(SQL_LER).bind(DOC_ID).first(); doc = r ? JSON.parse(r.data) : null; }
    catch (e) { console.error("rotinas", "leitura: " + msgDe(e)); doc = null; }
    const novo = mesclar(doc, bat.marcas, bat.relogio());
    await env.DB.prepare(SQL_GRAVAR).bind(DOC_ID, JSON.stringify(novo)).run();
    return novo;
  } catch (e) { console.error("rotinas", msgDe(e)); return null; }
}
export const CONSULTAS_BATIMENTO = 2; // a tradução reserva estas duas dentro da conta de subrequests

// ---------- leitores: o retorno de cada etapa vira { tipo, msg, feitos, nota } ----------
const plural = (n, um, varios) => n + " " + (n === 1 ? um : varios);
const falhasTexto = (l) => (l.length === 1 ? "1 feed com falha: " : l.length + " feeds com falha: ") + l.slice(0, 3).join("; ");

export const LER = {
  // coleta: { feeds, reddit, falhas, falhasReddit }
  coleta: (r) => {
    if (!r) return {};
    const fs = r.falhas || [], fr = r.falhasReddit || [];
    return {
      feeds: !r.feeds ? { tipo: "vazio" } : { tipo: fs.length >= r.feeds ? "erro" : "ok", msg: fs.length ? falhasTexto(fs) : "", feitos: plural(r.feeds, "feed", "feeds") },
      foruns: !r.reddit ? { tipo: "vazio" } : { tipo: fr.length >= r.reddit ? "erro" : "ok", msg: fr.length ? "falhou: " + fr.slice(0, 2).join("; ") : "", feitos: plural(r.reddit, "subreddit", "subreddits") },
    };
  },
  // cronMercado devolve o painel (com erros por parte) ou null; partes é o partesDoMinuto do mesmo minuto
  mercado: (partes) => (painel) => {
    const out = {};
    if (!painel) return out;
    const erros = painel.erros || {};
    const deMercado = Object.entries(erros).filter(([k]) => k !== "cripto").map(([k, v]) => k + ": " + v);
    if (partes.moedas || partes.bolsa || partes.indicadores) out.mercado = { tipo: "ok", msg: deMercado.join(" | "), feitos: plural((painel.itens || []).length, "item", "itens") };
    if (partes.cripto) out.cripto = { tipo: (painel.cripto || []).length ? "ok" : "erro", msg: erros.cripto || (!(painel.cripto || []).length ? "nenhuma moeda veio" : ""), feitos: plural((painel.cripto || []).length, "moeda", "moedas") };
    return out;
  },
  b3: (r) => (r == null ? { tipo: "fora" } : { tipo: "ok", feitos: `${r.acoes || 0} ações, ${r.fiis || 0} FIIs` }),
  eua: (r) => (r == null ? { tipo: "fora" } : { tipo: "ok", msg: r.erros ? plural(r.erros, "papel com erro", "papéis com erro") : "", feitos: plural(r.novos || 0, "cotação", "cotações"), nota: r.pendentes ? plural(r.pendentes, "pendente", "pendentes") : "" }),
  cvm: (r) => (r == null ? { tipo: "fora" } : { tipo: "ok", feitos: Object.entries(r).map(([k, v]) => k + ": " + (typeof v === "number" ? v : Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : v)).join(", ") }),
  esportes: (r) => {
    if (!r || r.erros === undefined) return { tipo: "fora" };
    const ligas = (r.ligas || []).length;
    if (r.erros) return { tipo: ligas ? "ok" : "erro", msg: r.msg || plural(r.erros, "erro", "erros"), feitos: plural(ligas, "competição", "competições") };
    return ligas ? { tipo: "ok", feitos: plural(ligas, "competição", "competições") } : { tipo: "vazio" };
  },
  landscape: (r) => {
    if (!r) return { tipo: "fora" };
    if (r.erro) return { tipo: "erro", msg: r.erro };
    const fez = (r.pedidos || 0) + (r.semente || 0) + (r.sonda || 0) + (r.cloud || 0);
    if (r.erros) return { tipo: "ok", msg: r.msg || plural(r.erros, "parte com erro", "partes com erro"), feitos: plural(r.pedidos || 0, "pedido", "pedidos") };
    if (!fez) return { tipo: "vazio", nota: r.parou ? "em pausa: " + r.parou : "" };
    return { tipo: "ok", feitos: plural(r.pedidos || 0, "pedido", "pedidos"), msg: r.parou ? "parou: " + r.parou : "" };
  },
  sonda: (n) => (n ? { tipo: "ok", feitos: plural(n, "URL", "URLs") } : { tipo: "vazio" }),
  papel: (r) => {
    if (r == null) return { tipo: "fora" };
    if (!r.candidatos) return { tipo: "vazio" };
    return { tipo: r.erros && !r.feitos ? "erro" : "ok", msg: r.erros ? plural(r.erros, "ficha com erro", "fichas com erro") : r.parou ? "parou no limite da brapi" : "", feitos: plural(r.feitos || 0, "ficha", "fichas") };
  },
  leitura: (r) => {
    if (r == null) return { tipo: "fora" };
    if (!r.pessoas || (!r.geradas && !r.erros)) return { tipo: "vazio", nota: !r.pessoas ? "ninguém recebe" : "" };
    return { tipo: r.erros && !r.geradas ? "erro" : "ok", msg: r.erros ? plural(r.erros, "leitura com erro", "leituras com erro") : "", feitos: plural(r.geradas || 0, "gerada", "geradas") };
  },
  listas: (r) => (r == null ? { tipo: "fora" } : !r.listas ? { tipo: "vazio" } : { tipo: "ok", msg: r.semDados ? "sem dados de mercado" : "", feitos: `${r.mudaram || 0} de ${r.listas} mudaram` }),
  simulador: (r) => {
    if (r == null) return { tipo: "fora" };
    if (r.fim && !r.pessoas) return { tipo: "vazio", nota: "mês " + (r.mes || "") + " já fechado" };
    if (!r.pessoas) return { tipo: "vazio" };
    return { tipo: r.erros && !r.fechadas ? "erro" : "ok", msg: r.erros ? plural(r.erros, "simulação com erro", "simulações com erro") : "", feitos: plural(r.fechadas || 0, "fechada", "fechadas") };
  },
  limpeza: (rel) => {
    if (!rel) return { tipo: "fora" };
    const ruins = Object.entries(rel).filter(([, v]) => typeof v === "string" && /^(erro|suspenso)/.test(v)).map(([k, v]) => k + ": " + v);
    const apagados = Object.values(rel).filter((v) => typeof v === "number").reduce((a, b) => a + b, 0);
    return { tipo: "ok", msg: ruins.join(" | "), feitos: plural(apagados, "apagado", "apagados") };
  },
  historico: (r) => (!r ? { tipo: "fora" } : r.parte != null ? { tipo: "ok", feitos: "parte " + r.parte } : { tipo: "vazio", nota: r.fim ? "importação terminou" : "sem histórico para importar" }),
  traducao: (r) => {
    if (!r) return { tipo: "fora" };
    if (r.desligada) return { tipo: "vazio", nota: "desligada (sem o binding AI)" };
    if (r.semFolga) return { tipo: "erro", msg: `não rodou: sem folga de subrequests (${r.gastos} já gastos neste minuto)` };
    if (r.chamadas || r.marcas) return { tipo: "ok", msg: r.falhas && !r.traduzidos ? plural(r.falhas, "falha", "falhas") : "", feitos: plural(r.traduzidos || 0, "traduzido", "traduzidos") };
    if (r.pausa) return { tipo: "vazio", nota: "em pausa" + (r.pausa.motivo ? ": " + r.pausa.motivo : "") };
    return { tipo: "vazio", nota: r.vazia ? "fila vazia" : "" };
  },
};

// ---------- relatório (GET /api/admin/rotinas) ----------
// O terceiro valor, quando existe, é o nome inteiro da linha (Oficina, pedido de 19/11: "Oficina: curadoria")
export const SECOES_CUR = [["tech", "Tech"], ["negocios", "Negócios"], ["investimentos", "Investimentos"], ["politica", "Notícias e Política"], ["esportes", "Esportes"], ["oficina", "Oficina", "Oficina: curadoria"], ["saude", "Saúde", "Saúde: curadoria"]];
const STATUS_DA_SECAO = (s) => (s === "tech" ? "status" : "status-" + s);
const ITENS_DA_SECAO = (s) => (s === "tech" ? "items" : "items-" + s);

// Consulta 1: os cinco meta/status* e o batimento. Um SELECT só, sem UNION.
export function sqlDocs() {
  const ids = SECOES_CUR.map(([s]) => STATUS_DA_SECAO(s));
  return { sql: `SELECT collection, id, data FROM docs WHERE (collection = 'meta' AND id IN (${ids.map((_, k) => "?" + (k + 1)).join(",")})) OR (collection = '_sistema' AND id = ?${ids.length + 1})`, args: [...ids, DOC_ID] };
}
// Consulta 2: itens por seção (24 h e 7 dias, pela coluna coletado), o plantão, os feeds com falha, as comparações
// profundas do ArchLandscape e o levantamento da Oficina. Cinco termos no UNION ALL (o limite do D1), as mesmas quatro
// colunas em todos.
export function sqlContagens(agora) {
  const cols = SECOES_CUR.map(([s]) => ITENS_DA_SECAO(s));
  const n = cols.length;
  const sql = `SELECT collection AS k, sum(coletado >= ?1) AS a, count(*) AS b, '' AS c FROM docs WHERE collection IN (${cols.map((_, k) => "?" + (k + 3)).join(",")}) AND coletado >= ?2 GROUP BY collection`
    + ` UNION ALL SELECT 'plantao' AS k, sum(json_extract(data, '$.estado') = 'pendente') AS a, min(CASE WHEN json_extract(data, '$.estado') = 'pendente' THEN json_extract(data, '$.criado') END) AS b, max(json_extract(data, '$.atendidoEm')) AS c FROM docs WHERE collection = 'pedidos-curadoria' AND json_extract(data, '$.agora') = 1`
    + ` UNION ALL SELECT 'feed' AS k, url AS a, erros_seguidos AS b, '' AS c FROM feeds_estado WHERE erros_seguidos > ?${n + 3}`
    // comparações profundas do ArchLandscape (src/arch.js): pendentes, o pedido mais antigo e a última pronta
    + ` UNION ALL SELECT 'dossies' AS k, sum(json_extract(data, '$.estado') = 'pendente') AS a, min(CASE WHEN json_extract(data, '$.estado') = 'pendente' THEN coalesce(json_extract(data, '$.pedidoEm'), json_extract(data, '$.criado')) END) AS b, max(json_extract(data, '$.prontoEm')) AS c FROM docs WHERE collection = 'arch-dossies'`
    // Oficina (src/oficina.js): por collection, quantos faltam levantar (a), quantos com preço vencido ou nunca pesquisado
    // (b; madeiras não têm preço por loja e contam 0) e a última data que a tarefa gravou (c)
    + ` UNION ALL SELECT collection AS k, sum(json_extract(data, '$.detalhesEm') IS NULL) AS a, sum(collection <> 'oficina-madeiras' AND (json_extract(data, '$.precosEm') IS NULL OR json_extract(data, '$.precosEm') < ?${n + 4})) AS b, max(max(coalesce(json_extract(data, '$.detalhesEm'), ''), coalesce(json_extract(data, '$.precosEm'), ''))) AS c FROM docs WHERE collection IN ('oficina-ferramentas', 'oficina-insumos', 'oficina-madeiras') GROUP BY collection`;
  return { sql, args: [iso(agora - 24 * HORA), iso(agora - 7 * 24 * HORA), ...cols, 0, iso(agora - OFICINA.PRECO_VENCE_DIAS * 24 * HORA)] };
}

// Feeds com falha, contados como no card Rendimento das fontes: URL antiga de subreddit (fora de src/feeds.js) não entra.
const ATUAIS = new Set(FEEDS.map((f) => f[3]));
export const feedConta = (url) => !(ehReddit(url) && !ATUAIS.has(url));

// Espelho: o estado mora no Durable Object ({ ultima_sincronia, ultima_tentativa, erro, duracao_ms, pendentes }).
export function regEspelho(e) {
  if (!e) return { msg: "sem o estado do espelho" };
  const reg = { ok: e.ultima_sincronia || null, ms: e.duracao_ms ?? null };
  if (e.erro) { reg.erro = e.ultima_tentativa || null; reg.msg = curta(e.erro); }
  if (e.pendentes) reg.feitos = plural(e.pendentes, "pendente", "pendentes");
  return reg;
}

export async function relatorio(env, { agora = Date.now(), estadoEspelho = null } = {}) {
  const q1 = sqlDocs(), q2 = sqlContagens(agora);
  const { results: docs } = await env.DB.prepare(q1.sql).bind(...q1.args).all();
  const { results: conta } = await env.DB.prepare(q2.sql).bind(...q2.args).all();
  const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
  const meta = new Map(), por = new Map();
  let bat = null;
  for (const r of docs || []) { if (r.collection === "_sistema") bat = json(r.data); else meta.set(r.id, json(r.data) || {}); }
  let plantao = { pendentes: 0 }, feedsFalha = 0, dossies = { pendentes: 0 };
  const oficina = {};
  for (const r of conta || []) {
    if (r.k === "dossies") dossies = { pendentes: Number(r.a) || 0, maisAntigo: r.b || null, ultimoAtendido: r.c || null };
    else if (r.k === "plantao") plantao = { pendentes: Number(r.a) || 0, maisAntigo: r.b || null, ultimoAtendido: r.c || null };
    else if (r.k === "feed") { if (feedConta(String(r.a))) feedsFalha++; }
    else if (String(r.k).startsWith("oficina-")) oficina[r.k] = { faltam: Number(r.a) || 0, vencidos: Number(r.b) || 0, ultima: r.c || null };
    else por.set(r.k, { d1: Number(r.a) || 0, d7: Number(r.b) || 0 });
  }
  const curadorias = SECOES_CUR.map(([s, nome, inteiro]) => estadoCuradoria({ secao: s, nome: inteiro || "Curadoria " + nome, status: meta.get(STATUS_DA_SECAO(s)), itens24h: por.get(ITENS_DA_SECAO(s))?.d1, itens7d: por.get(ITENS_DA_SECAO(s))?.d7 }, agora));
  curadorias.push(estadoPlantao(plantao, agora));
  curadorias.push(estadoDossies(dossies, agora));
  curadorias.push(estadoLevantamentoOficina(oficina, agora));

  const criado = bat && bat.criado ? bat.criado : null;
  const porId = (bat && bat.porId) || {};
  let espelho = null;
  if (estadoEspelho) { try { espelho = regEspelho(await estadoEspelho()); } catch (e) { espelho = { msg: "não deu para ler o estado do espelho: " + msgDe(e) }; } }
  else espelho = { msg: "sem o binding ESPELHO" };
  const worker = ROTINAS.map((r) => {
    const linha = estadoRotina(r, r.id === "espelho" ? espelho : porId[r.id], agora, criado);
    if (r.id === "feeds") { linha.feedsComFalha = feedsFalha; }
    return linha;
  });
  const todas = [...curadorias, ...worker];
  return { agora: iso(agora), registroDesde: criado, consultas: 2, resumo: resumoDe(todas), curadorias: ordenar(curadorias), worker: ordenar(worker) };
}

const resposta = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
// Quem não é Admin já recebeu o 404 em src/index.js; aqui o 404 se repete para a rota nunca abrir sozinha.
export async function rotaRotinas(request, env, quem, deps = {}) {
  if (!quem || !quem.admin) return resposta({ erro: "rota" }, 404);
  if (request.method !== "GET") return resposta({ erro: "metodo" }, 405);
  try { return resposta(await relatorio(env, { agora: deps.agora ? deps.agora() : Date.now(), estadoEspelho: deps.estadoEspelho || null })); }
  catch (e) { return resposta({ erro: "Não deu para montar o relatório: " + msgDe(e) }, 500); }
}
