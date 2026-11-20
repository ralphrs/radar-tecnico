// Health Checks (pedido de 20/11, 14h27): "Sobre o funcionamento das tarefas, coloque em Health Checks dentro de admin...
// mova todo e qualquer tipo de validação da plataforma lá para dentro."
//
// GET /api/admin/health (só Admin; os outros recebem 404) devolve tudo em blocos:
//   { lidoEm, estado, problemas, grupos: [{ id, titulo, estado, emDia, total, linhas: [...], erro?, ... }] }
// ?resumo=1 devolve só o resumo (sem as linhas), para o menu do /admin e o ponto no avatar do site.
// ?grupo=<id> monta só aquele bloco (a tela aberta carrega só os dados dela).
//
// Só lê. Cada bloco roda no seu try: um que der erro volta com estado "sem dados" e a frase do erro, e os outros seguem.
// Consultas ao D1 (nenhuma com SELECT composto de mais de 5 termos):
//   tarefas e worker: as duas do relatório das rotinas (src/rotinas.js, uma vez só para os dois blocos) e uma de extras
//   (versão das instruções, falhas das comparações profundas e a situação no Brasil dos produtos de Saúde);
//   fontes: uma (feeds_estado); dados externos: uma; banco: uma, mais o estado do espelho (Durable Object, uma chamada
//   para os blocos todos); configuração: nenhuma; integridade: uma por validação (seis).
// Nada de valor de segredo, e-mail de convidado ou dado de carteira: collection por pessoa (favs/<email>, carteira/<email>)
// sai somada como favs/*, carteira/*; dossiês sem o campo `por`; configuração só diz se existe.
//
// O site não enxerga o agendador do Claude: as tarefas são julgadas pelo rastro que deixaram no banco, com a janela de
// cada uma em TAREFAS (os limites são os mesmos de src/rotinas.js, importados de lá).
import { relatorio, SECOES_CUR, CURADORIA, PLANTAO, OFICINA, ROTINA, estadoRotina, regEspelho, feedConta, msgDe, curta } from "./rotinas.js";
import { CRIPTO_PARA_SONDAR, OFICINA_PARA_SONDAR, SAUDE_PARA_SONDAR } from "./feeds.js";
import { PARTES } from "./landscape.js";
import { LIMITES as LIM_CURADORIA } from "./curadoria.js";
import "../public/saude.js";

const S = globalThis.Saude;
const MIN = 60_000, HORA = 3_600_000, DIA = 86_400_000;
const FUSO_SP = 3 * HORA; // São Paulo, UTC-3 o ano todo desde 2019

// Do pior para o melhor. "sem dados": nada gravado ainda, ou o bloco não conseguiu ler.
export const ESTADOS = ["parada", "atrasada", "com erro", "sem dados", "em dia"];
const peso = (e) => { const i = ESTADOS.indexOf(e); return i < 0 ? 0 : i; };
export const pior = (lista) => (lista.length ? lista.reduce((a, b) => (peso(b) < peso(a) ? b : a)) : "em dia");

export const NOME_SECAO = { tech: "Tech", negocios: "Negócios", investimentos: "Investimentos", politica: "Notícias", esportes: "Esportes", oficina: "Oficina", saude: "Saúde" };
const SECOES = SECOES_CUR.map(([s]) => s);
const STATUS_DA_SECAO = (s) => (s === "tech" ? "status" : "status-" + s);
const ITENS_DA_SECAO = (s) => (s === "tech" ? "items" : "items-" + s);
const DESTAQUES_DA_SECAO = (s) => (s === "tech" ? "destaques" : "destaques-" + s);

// ---------- tarefas agendadas: a tabela das janelas ----------
// modo "rastro": idade da última gravação. "fila": espera do pedido mais antigo (sem pendente, em dia). "pendencia": sem
// pendência, em dia; com pendência, idade da última gravação. Nada gravado: "sem dados". Horas acima de atrasadaH,
// atrasada; acima de paradaH, parada.
export const TAREFAS = [
  ...SECOES_CUR.map(([s, nome, inteiro]) => ({ id: "curadoria-" + s, nome: inteiro || "Curadoria " + nome, le: "meta/" + STATUS_DA_SECAO(s) + " e " + ITENS_DA_SECAO(s),
    esperado: "três rodadas por dia", cadaH: 8, modo: "rastro", atrasadaH: CURADORIA.EM_DIA_H, paradaH: CURADORIA.ATRASADA_H, exigeItens24h: true })),
  { id: "plantao", nome: "Plantão", le: "pedidos-curadoria (rodar agora)", esperado: "atende em até 2 h, das 7h às 23h", cadaH: 1, modo: "fila", atrasadaH: PLANTAO.ATRASADO_H, paradaH: PLANTAO.PARADO_H },
  { id: "dossies", nome: "Comparações profundas", le: "arch-dossies", esperado: "atende em até 2 h", cadaH: 1, modo: "fila", atrasadaH: PLANTAO.ATRASADO_H, paradaH: PLANTAO.PARADO_H },
  { id: "oficina-levantamento", nome: "Oficina: levantamento", le: "oficina-ferramentas, oficina-insumos e oficina-madeiras", esperado: "uma vez por semana, quando há pendência", cadaH: 7 * 24, modo: "pendencia", atrasadaH: OFICINA.EM_DIA_D * 24, paradaH: OFICINA.ATRASADO_D * 24 },
  { id: "saude-situacao", nome: "Saúde: situação no Brasil", le: "saude-produtos (situacaoBrasil)", esperado: "levantada pela curadoria de Saúde em até um dia", cadaH: 8, modo: "fila", atrasadaH: 26, paradaH: 72 },
];
export const TAREFA = Object.fromEntries(TAREFAS.map((t) => [t.id, t]));

const ms = (v) => (v ? Date.parse(v) : NaN);
const idade = (iso, agora) => { const t = ms(iso); return isNaN(t) ? null : Math.max(0, Math.floor((agora - t) / MIN)); };
export function haTempo(min) {
  if (min == null) return "nunca";
  if (min < 1) return "agora há pouco";
  if (min < 60) return "há " + min + " min";
  const h = Math.floor(min / 60);
  if (h < 48) return "há " + h + " h";
  return "há " + Math.floor(h / 24) + " dias";
}
const plural = (n, um, varios) => n + " " + (n === 1 ? um : varios);
const porLimite = (t, min) => (min / 60 > t.paradaH ? "parada" : min / 60 > t.atrasadaH ? "atrasada" : "em dia");

// rastro: { ultima, pendentes, desde, itens24h } (null quando não deu para ler). Devolve { estado, idadeMin, esperaMin, motivo }.
export function estadoTarefa(t, rastro, agora) {
  if (!t) return { estado: "sem dados", motivo: "tarefa desconhecida" };
  if (!rastro) return { estado: "sem dados", motivo: "nada gravado" };
  const idadeMin = idade(rastro.ultima, agora);
  if (t.modo === "fila" || t.modo === "pendencia") {
    const n = Number(rastro.pendentes) || 0;
    if (!n) return { estado: "em dia", idadeMin, motivo: "nada pendente" };
    if (t.modo === "pendencia") {
      if (idadeMin == null) return { estado: "sem dados", idadeMin, motivo: "nenhuma gravação ainda" };
      return { estado: porLimite(t, idadeMin), idadeMin };
    }
    const esperaMin = idade(rastro.desde, agora);
    if (esperaMin == null) return { estado: "sem dados", idadeMin, motivo: "pendente sem data" };
    return { estado: porLimite(t, esperaMin), idadeMin, esperaMin };
  }
  if (idadeMin == null) return { estado: "sem dados", idadeMin, motivo: "nenhuma rodada registrada" };
  const estado = porLimite(t, idadeMin);
  if (estado === "em dia" && t.exigeItens24h && rastro.itens24h != null && !Number(rastro.itens24h)) return { estado: "com erro", idadeMin, motivo: "rodou, mas nada entrou nas últimas 24 h" };
  return { estado, idadeMin };
}

// Consulta de extras das tarefas: quatro termos, as mesmas quatro colunas
export const SQL_TAREFAS_EXTRAS = "SELECT 'instr' AS k, id AS a, json_extract(data, '$.versao') AS b, length(coalesce(json_extract(data, '$.texto'), '')) AS c FROM docs WHERE collection = 'instrucoes'"
  + " UNION ALL SELECT * FROM (SELECT 'falha' AS k, id AS a, atualizado AS b, substr(coalesce(json_extract(data, '$.resposta'), ''), 1, 160) AS c FROM docs WHERE collection = 'arch-dossies' AND json_extract(data, '$.estado') = 'falhou' ORDER BY atualizado DESC LIMIT 3)"
  + " UNION ALL SELECT 'saude' AS k, sum(json_extract(data, '$.situacaoBrasil') IS NULL) AS a, count(*) AS b, min(CASE WHEN json_extract(data, '$.situacaoBrasil') IS NULL THEN coalesce(json_extract(data, '$.adicionado'), atualizado) END) AS c FROM docs WHERE collection = 'saude-produtos' AND json_extract(data, '$.ativo') = 1"
  + " UNION ALL SELECT 'saude-ult' AS k, max(json_extract(data, '$.situacaoBrasil.em')) AS a, '' AS b, '' AS c FROM docs WHERE collection = 'saude-produtos'";

async function grupoTarefas(ctx) {
  const rel = await ctx.relatorio();
  const { results } = await ctx.env.DB.prepare(SQL_TAREFAS_EXTRAS).all();
  const instr = new Map(), falhas = [];
  let saude = { pendentes: 0, total: 0, desde: null, ultima: null };
  for (const r of results || []) {
    if (r.k === "instr") instr.set(r.a, { versao: Number(r.b) || 0, tamanho: Number(r.c) || 0 });
    else if (r.k === "falha") falhas.push({ id: r.a, quando: r.b, frase: curta(r.c) });
    else if (r.k === "saude") saude = { ...saude, pendentes: Number(r.a) || 0, total: Number(r.b) || 0, desde: r.c || null };
    else if (r.k === "saude-ult") saude.ultima = r.a || null;
  }
  const deRot = new Map(rel.curadorias.map((l) => [l.id, l]));
  const { agora } = ctx;
  const linhas = TAREFAS.map((t) => {
    const l = deRot.get(t.id) || {};
    const obs = [];
    let rastro = null, extra = {};
    if (t.id.startsWith("curadoria-")) {
      const s = t.id.slice(10);
      rastro = { ultima: l.ultimaVez || null, itens24h: l.itens24h ?? null };
      const iv = instr.get(s);
      extra = { secaoId: s, itens24h: l.itens24h ?? 0, itens7d: l.itens7d ?? 0, novosNaUltima: l.novosNaUltima ?? null, instrucoes: iv ? iv.versao : null };
      if (l.novosNaUltima != null) obs.push(plural(l.novosNaUltima, "novo", "novos") + " na última rodada");
      obs.push(`${plural(extra.itens24h, "item", "itens")} em 24 h, ${extra.itens7d} em 7 dias`);
      obs.push(iv ? `instruções v${iv.versao}${iv.tamanho < LIM_CURADORIA.TEXTO_MIN ? ", curtas demais" : ""}` : "sem instruções no Lookout");
    } else if (t.id === "plantao" || t.id === "dossies") {
      rastro = { ultima: l.ultimaOk || null, pendentes: l.pendentes || 0, desde: l.maisAntigo || null };
      extra = { pendentes: l.pendentes || 0 };
      if (l.pendentes) obs.push(`${plural(l.pendentes, "pendente", "pendentes")}, o mais antigo ${haTempo(idade(l.maisAntigo, agora))}`);
      else obs.push("nada pendente");
      obs.push(t.id === "plantao" ? (l.ultimaOk ? "último pedido atendido " + haTempo(idade(l.ultimaOk, agora)) : "nenhum pedido atendido ainda") : (l.ultimaOk ? "última pronta " + haTempo(idade(l.ultimaOk, agora)) : "nenhuma pronta ainda"));
      if (t.id === "dossies") {
        extra.falhas = falhas;
        for (const f of falhas) obs.push(`falhou ${haTempo(idade(f.quando, agora))}${f.frase ? ': "' + f.frase + '"' : ""}`);
      }
    } else if (t.id === "oficina-levantamento") {
      const f = { faltam: l.faltam || 0, precoVencido: l.precoVencido || 0 }, i = l.insumos || { faltam: 0, precoVencido: 0 }, m = l.madeiras || { faltam: 0 };
      const pend = f.faltam + f.precoVencido + i.faltam + i.precoVencido + m.faltam;
      rastro = { ultima: l.ultimaVez || null, pendentes: pend };
      extra = { porCollection: { "oficina-ferramentas": f, "oficina-insumos": i, "oficina-madeiras": { faltam: m.faltam } } };
      obs.push(`ferramentas: ${f.faltam} sem detalhes, ${f.precoVencido} com preço vencido`, `insumos: ${i.faltam} sem detalhes, ${i.precoVencido} com preço vencido`, `madeiras: ${m.faltam} sem detalhes`);
      obs.push(l.ultimaVez ? "última gravação " + haTempo(idade(l.ultimaVez, agora)) : "nenhuma gravação ainda");
    } else if (t.id === "saude-situacao") {
      rastro = { ultima: saude.ultima, pendentes: saude.pendentes, desde: saude.desde };
      extra = { pendentes: saude.pendentes, ativos: saude.total };
      obs.push(saude.total ? `${saude.pendentes} de ${plural(saude.total, "produto ativo", "produtos ativos")} sem levantar` : "nenhum produto ativo");
      if (saude.pendentes && saude.desde) obs.push("o mais antigo esperando " + haTempo(idade(saude.desde, agora)));
      if (saude.ultima) obs.push("último levantamento em " + saude.ultima.slice(8, 10) + "/" + saude.ultima.slice(5, 7));
    }
    const e = estadoTarefa(t, rastro, agora);
    if (e.motivo && e.estado !== "em dia") obs.unshift(e.motivo);
    return { id: t.id, nome: t.nome, le: t.le, esperado: t.esperado, estado: e.estado, quando: rastro && rastro.ultima, idadeMin: e.idadeMin ?? null, esperaMin: e.esperaMin ?? null, obs, ...extra };
  });
  return { linhas, nota: "O Lookout vê o que cada tarefa gravou, não a agenda dela.", tabela: TAREFAS.map(({ id, nome, le, esperado, atrasadaH, paradaH, modo }) => ({ id, nome, le, esperado, atrasadaH, paradaH, modo })) };
}

// ---------- Worker e cron: as linhas do relatório das rotinas, com a observação em texto ----------
export function obsWorker(l, agora) {
  const p = [];
  const ruim = l.estado !== "em dia";
  if (l.msg && l.ultimoErro && (!l.ultimaOk || l.ultimoErro >= l.ultimaOk)) p.push("último erro " + haTempo(idade(l.ultimoErro, agora)) + ": " + l.msg);
  else if (l.msg && ruim && !l.ultimoErro) p.push(l.msg);
  if (l.nunca) p.push(l.aguardando ? "ainda não chegou a hora desde que o registro começou" : l.desde ? "nunca rodou desde que o registro começou, " + haTempo(idade(l.desde, agora)) : "nada registrado ainda");
  else if (l.perdida && (l.estado === "atrasada" || l.estado === "parada")) p.push(l.janela ? "a janela passou sem rodar " + haTempo(idade(l.perdida, agora)) : "devia ter rodado " + haTempo(idade(l.perdida, agora)));
  if (l.semTrabalhoDesde && !ruim) p.push("sem trabalho " + haTempo(idade(l.semTrabalhoDesde, agora)));
  if (l.feitos != null && l.feitos !== "") p.push("fez: " + l.feitos);
  if (l.nota) p.push(l.nota);
  if (l.feedsComFalha) p.push(plural(l.feedsComFalha, "feed com falha", "feeds com falha") + " agora");
  return p;
}
async function grupoWorker(ctx) {
  const rel = await ctx.relatorio();
  const linhas = rel.worker.map((l) => ({ id: l.id, nome: l.nome, detalhe: l.detalhe || "", esperado: l.esperado, estado: l.estado, quando: l.ultimaVez || l.ultimaOk || null,
    idadeMin: l.idadeMin ?? null, ms: l.ms ?? null, ultimoErro: l.ultimoErro || null, erro: l.ultimoErro && (!l.ultimaOk || l.ultimoErro >= l.ultimaOk) ? l.msg || "" : "", obs: obsWorker(l, ctx.agora) }));
  return { linhas, registroDesde: rel.registroDesde || null };
}

// ---------- Fontes: feeds com erros seguidos e as listas para sondar ----------
export const SQL_FONTES = "SELECT 'falha' AS k, url, radar, fonte, erro, erros_seguidos AS n, seguidos_403 AS n403, ultimo_ok, ultima_checagem FROM feeds_estado WHERE erros_seguidos > 0"
  + " UNION ALL SELECT 'url' AS k, url, '' AS radar, '' AS fonte, '' AS erro, 0 AS n, 0 AS n403, '' AS ultimo_ok, '' AS ultima_checagem FROM feeds_estado WHERE erros_seguidos = 0";
export const PARA_SONDAR = [
  { radar: "investimentos", nome: "Cripto", itens: CRIPTO_PARA_SONDAR.map(([fonte, , url]) => ({ nome: fonte, url })) },
  { radar: "oficina", nome: "Oficina", itens: OFICINA_PARA_SONDAR.map((nome) => ({ nome, url: "" })) },
  { radar: "saude", nome: "Saúde", itens: SAUDE_PARA_SONDAR.map((nome) => ({ nome, url: "" })) },
];
async function grupoFontes(ctx) {
  const { results } = await ctx.env.DB.prepare(SQL_FONTES).all();
  let total = 0;
  const linhas = [];
  for (const r of results || []) {
    if (!feedConta(String(r.url))) continue; // URL antiga de subreddit, que não é mais lida
    total++;
    if (r.k !== "falha") continue;
    const desde = r.ultimo_ok || null;
    const obs = [r.erro ? curta(r.erro) : "erro sem mensagem", plural(Number(r.n) || 0, "vez seguida", "vezes seguidas")];
    obs.push(desde ? "última leitura boa " + haTempo(idade(desde, ctx.agora)) : "nunca leu certo");
    if (Number(r.n403) >= 3) obs.push("bloqueado: tenta de novo a cada 24 h");
    linhas.push({ id: r.url, nome: r.fonte || r.url, radar: r.radar, secao: NOME_SECAO[r.radar] || r.radar, estado: "com erro", erro: curta(r.erro || ""), seguidos: Number(r.n) || 0, quando: desde, idadeMin: idade(desde, ctx.agora), obs });
  }
  linhas.sort((a, b) => b.seguidos - a.seguidos || a.nome.localeCompare(b.nome));
  return { linhas, emDia: total - linhas.length, total, paraSondar: PARA_SONDAR };
}

// ---------- Dados externos ----------
export const SQL_EXTERNOS = "SELECT collection AS c, id, atualizado, CASE"
  + " WHEN id = 'mercado' THEN json_object('atualizado', json_extract(data, '$.atualizado'), 'erros', json(coalesce(json_extract(data, '$.erros'), '{}')), 'fontesCripto', (SELECT json_group_array(DISTINCT json_extract(j.value, '$.fonte')) FROM json_each(data, '$.cripto') j), 'lidoCripto', (SELECT max(json_extract(j.value, '$.lido')) FROM json_each(data, '$.cripto') j), 'temBolsa', json_extract(data, '$.temBolsa'))"
  + " WHEN id = 'b3' THEN json_object('atualizado', json_extract(data, '$.atualizado'), 'acoes', json_array_length(data, '$.acoes'))"
  + " WHEN id = 'esportes-escudos' THEN json_object('atualizado', json_extract(data, '$.atualizado'))"
  + " ELSE data END AS d FROM docs WHERE (collection = 'meta' AND id IN ('mercado', 'b3', 'esportes-escudos')) OR (collection = '_sistema' AND id IN ('b3-erro', 'esportes-erro', 'landscape-estado'))"
  + " UNION ALL SELECT 'meta' AS c, 'esportes-ligas' AS id, max(atualizado) AS atualizado, json_object('rodadaEm', max(json_extract(data, '$.rodadaEm')), 'tabelaEm', max(json_extract(data, '$.tabelaEm')), 'espnFalhouEm', max(json_extract(data, '$.espnFalhouEm')), 'viaGe', sum(json_extract(data, '$.fonte') = 'ge'), 'ligas', count(*)) AS d"
  + " FROM docs WHERE collection = 'meta' AND id > 'esportes-' AND id < 'esportes.' AND id <> 'esportes-escudos'";
const maior = (...xs) => xs.filter(Boolean).sort().pop() || null;
// estado de uma fonte externa: nada bom ainda, sem dados; erro depois do último bom (ou junto), com erro; bom velho demais, atrasada
export function estadoExterno({ ok, erroEm, velhoH }, agora) {
  if (!ok) return erroEm ? "com erro" : "sem dados";
  if (erroEm && erroEm >= ok) return "com erro"; // erro do mesmo instante é falha parcial (cripto que caiu para a reserva)
  if (velhoH && (agora - ms(ok)) / HORA > velhoH) return "atrasada";
  return "em dia";
}
function marcasDoHost(estado, host) {
  const partes = Object.entries(PARTES).filter(([, p]) => p.host === host).map(([k]) => k);
  let ok = null, erro = null;
  for (const e of Object.values((estado && estado.porId) || {})) {
    for (const k of partes) { ok = maior(ok, e.marcas && e.marcas[k]); erro = maior(erro, e.tent && e.tent[k]); }
  }
  return { ok, erro };
}
async function grupoExternos(ctx) {
  const { env, agora } = ctx;
  const { results } = await env.DB.prepare(SQL_EXTERNOS).all();
  const d = {};
  for (const r of results || []) { try { d[r.c + "/" + r.id] = r.d ? JSON.parse(r.d) : null; } catch { d[r.c + "/" + r.id] = null; } }
  const mercado = d["meta/mercado"], b3 = d["meta/b3"], b3erro = d["_sistema/b3-erro"], ls = d["_sistema/landscape-estado"], esp = d["meta/esportes-ligas"], esperro = d["_sistema/esportes-erro"], escudos = d["meta/esportes-escudos"];
  const linha = (id, nome, { ok, erroEm, erro, velhoH, obs = [], reserva = "" }) => {
    const estado = estadoExterno({ ok, erroEm, velhoH }, agora);
    const o = [ok ? "última resposta boa " + haTempo(idade(ok, agora)) : "nenhuma resposta boa gravada"];
    if (erroEm || erro) o.push("último erro" + (erroEm ? " " + haTempo(idade(erroEm, agora)) : "") + (erro ? ": " + curta(erro) : ""));
    if (reserva) o.push(reserva);
    return { id, nome, estado, quando: ok || null, idadeMin: idade(ok, agora), erro: erro ? curta(erro) : "", erroEm: erroEm || null, reserva: !!reserva, obs: [...o, ...obs] };
  };
  const linhas = [];
  // brapi e B3
  const errosMercado = (mercado && mercado.erros) || {};
  const bolsaErro = Object.entries(errosMercado).filter(([k]) => k !== "cripto").map(([k, v]) => k + ": " + v).join(" | ");
  linhas.push(linha("b3", "brapi e B3", { ok: b3 && b3.atualizado, erroEm: b3erro && b3erro.quando, erro: (b3erro && b3erro.erro) || bolsaErro, velhoH: 4 * 24,
    obs: [env.BRAPI_TOKEN ? "com BRAPI_TOKEN" : "sem BRAPI_TOKEN: Ibovespa fora do letreiro"] }));
  // cripto: com FINNHUB_TOKEN a principal é a Finnhub; sem ele, o CoinGecko. Outra fonte na lista é a reserva.
  const principal = env.FINNHUB_TOKEN ? "Finnhub" : "CoinGecko";
  let fontes = [];
  try { fontes = mercado && mercado.fontesCripto ? (typeof mercado.fontesCripto === "string" ? JSON.parse(mercado.fontesCripto) : mercado.fontesCripto).filter(Boolean) : []; } catch { fontes = []; }
  const reserva = fontes.filter((f) => f !== principal);
  linhas.push(linha("cripto", "Cotações de cripto", { ok: (mercado && mercado.lidoCripto) || (fontes.length && mercado.atualizado) || null, erroEm: errosMercado.cripto ? mercado.atualizado : null, erro: errosMercado.cripto || "", velhoH: 2,
    reserva: reserva.length ? "em modo de reserva: " + reserva.join(", ") + (fontes.includes(principal) ? " completou o que a " + principal + " não trouxe" : " no lugar da " + principal) : "" }));
  // GitHub e Hacker News: o que a coleta do Landscape guardou em _sistema/landscape-estado
  const gh = marcasDoHost(ls, "github"), hn = marcasDoHost(ls, "hn");
  const pausa = (ls && ls.pausa) || {};
  const pausaTxt = (p) => (p && ms(p.ate) > agora ? `em pausa até ${new Date(ms(p.ate) - FUSO_SP).toISOString().slice(11, 16)} (${p.status || "limite"})` : "");
  const lim = ls && ls.github;
  linhas.push(linha("github", "GitHub", { ok: gh.ok, erroEm: gh.erro && (!gh.ok || gh.erro > gh.ok) ? gh.erro : null, velhoH: 24,
    obs: [env.GITHUB_TOKEN ? "com GITHUB_TOKEN" : "sem GITHUB_TOKEN: a coleta anda devagar", ...(lim && lim.restante != null ? [`último limite de taxa visto: ${lim.restante} de ${lim.limite ?? "?"} restantes, ${haTempo(idade(lim.quando, agora))}`] : []), ...(pausaTxt(pausa.github) ? [pausaTxt(pausa.github)] : [])] }));
  linhas.push(linha("hn", "Hacker News", { ok: hn.ok, erroEm: hn.erro && (!hn.ok || hn.erro > hn.ok) ? hn.erro : null, velhoH: 24, obs: pausaTxt(pausa.hn) ? [pausaTxt(pausa.hn)] : [] }));
  // ESPN: tabelas e rodadas das competições, e o catálogo de escudos
  const espOk = esp ? maior(esp.rodadaEm, esp.tabelaEm) : null;
  const ultErroLiga = esperro && esperro.porLiga ? Object.entries(esperro.porLiga).sort((a, b) => String(b[1].quando).localeCompare(String(a[1].quando)))[0] : null;
  const viaGe = esp && (Number(esp.viaGe) > 0 || (esp.espnFalhouEm && agora - ms(esp.espnFalhouEm) < DIA));
  linhas.push(linha("espn", "ESPN: tabelas e rodadas", { ok: espOk, erroEm: esperro && esperro.quando, erro: ultErroLiga ? ultErroLiga[0] + ": " + ultErroLiga[1].erro : "", velhoH: 24,
    reserva: viaGe ? "em modo de reserva: alguma competição veio do Globo Esporte" : "", obs: esp && esp.ligas ? [plural(Number(esp.ligas), "competição", "competições")] : [] }));
  linhas.push(linha("escudos", "ESPN: escudos", { ok: escudos && escudos.atualizado, velhoH: 8 * 24 }));
  return { linhas };
}

// ---------- Banco e espelho ----------
// collection por pessoa (favs/<email>, carteira/<email>...) sai somada como favs/*: nada de e-mail no bloco
export const SQL_BANCO = "SELECT CASE WHEN instr(collection, '/') > 0 THEN substr(collection, 1, instr(collection, '/')) || '*' ELSE collection END AS collection, count(*) AS n, sum(length(data)) AS bytes FROM docs GROUP BY 1 ORDER BY bytes DESC";
export const D1_LIMITE_BYTES = 10e9; // tamanho máximo de um banco D1 no plano pago
async function grupoBanco(ctx) {
  const { env, agora } = ctx;
  const r = await env.DB.prepare(SQL_BANCO).all();
  const cols = (r.results || []).map((x) => ({ collection: x.collection, n: Number(x.n) || 0, bytes: Number(x.bytes) || 0 }));
  const dados = cols.reduce((s, x) => s + x.bytes, 0);
  const tamanho = (r.meta && Number(r.meta.size_after)) || null; // o D1 devolve o tamanho do arquivo em meta.size_after
  const linhas = [];
  const base = tamanho || dados;
  linhas.push({ id: "tamanho", nome: "Tamanho do banco", estado: base > 0.9 * D1_LIMITE_BYTES ? "com erro" : "em dia", bytes: tamanho, dados,
    obs: [tamanho ? fmtBytes(tamanho) + " no arquivo do D1" : "tamanho do arquivo não veio", fmtBytes(dados) + " em docs, sem índices", "limite do D1: 10 GB"] });
  let e = null, erroEsp = "";
  try { e = await ctx.espelho(); } catch (x) { erroEsp = msgDe(x); }
  if (!ctx.temEspelho) linhas.push({ id: "espelho", nome: "Espelho em São Paulo", estado: "sem dados", obs: ["sem o binding ESPELHO"] });
  else if (!e) linhas.push({ id: "espelho", nome: "Espelho em São Paulo", estado: "sem dados", obs: ["não deu para ler o estado do espelho" + (erroEsp ? ": " + erroEsp : "")] });
  else {
    const l = estadoRotina(ROTINA.espelho, regEspelho(e), agora, null);
    const defasagemMin = idade(e.ultima_sincronia, agora);
    const obs = [e.ultima_sincronia ? "defasagem: última sincronia " + haTempo(defasagemMin) : "a primeira carga não terminou"];
    if (e.pendentes) obs.push(plural(Number(e.pendentes), "doc na fila", "docs na fila"));
    if (e.erro) obs.push("último erro: " + curta(e.erro));
    if (!ctx.espelhoLigado) obs.push("desligado pela variável ESPELHO_ATIVO: as leituras vão ao D1");
    linhas.push({ id: "espelho", nome: "Espelho em São Paulo", estado: l.estado, quando: e.ultima_sincronia || null, idadeMin: defasagemMin, defasagemMin, ms: e.duracao_ms ?? null, docs: Number(e.docs) || 0, obs });
  }
  return { linhas, colecoes: cols.slice(0, 15), totalColecoes: cols.length };
}
function fmtBytes(b) {
  const f = (v, c) => v.toLocaleString("pt-BR", { maximumFractionDigits: c, minimumFractionDigits: c });
  return b >= 1e9 ? f(b / 1e9, 2) + " GB" : b >= 1e6 ? f(b / 1e6, 1) + " MB" : f(b / 1e3, 0) + " KB";
}

// ---------- Configuração: só presença, nunca o valor ----------
// obrigatoria: sem ela, algo essencial para; local: só para o ambiente de desenvolvimento (fora dele, é erro)
export const CONFIG = [
  { nome: "ADMIN_EMAIL", tipo: "variável", obrigatoria: true, sem: "ninguém entra como Admin: esta área e as rotas de Admin ficam fechadas" },
  { nome: "ACCESS_TEAM_DOMAIN", tipo: "variável", obrigatoria: true, sem: "o login não é conferido e o site mostra \"Falta ligar o login\"" },
  { nome: "ACCESS_AUD", tipo: "variável", obrigatoria: true, sem: "o login não é conferido e o site mostra \"Falta ligar o login\"" },
  { nome: "CARTEIRA_KEY", tipo: "segredo", obrigatoria: true, sem: "Minha carteira não cifra nem abre os extratos" },
  { nome: "GITHUB_TOKEN", tipo: "segredo", sem: "a coleta do Landscape anda devagar (60 pedidos por hora) e o roteiro das ferramentas não aparece" },
  { nome: "BRAPI_TOKEN", tipo: "segredo", sem: "Ibovespa fora do letreiro e fichas de papel sem os dados da brapi" },
  { nome: "FINNHUB_TOKEN", tipo: "segredo", sem: "cotações dos EUA só pelo Yahoo e cripto sem a fonte principal" },
  { nome: "CF_API_TOKEN", tipo: "segredo", sem: "Custos e consumo mostra só o que dá para medir daqui" },
  { nome: "CF_ACCOUNT_ID", tipo: "variável", sem: "Custos e consumo descobre a conta pela API, com uma chamada a mais" },
  { nome: "WORKER_NOME", tipo: "variável", sem: "o custo do espelho procura o Worker pelo nome lookout" },
  { nome: "ESPELHO_ATIVO", tipo: "variável", sem: "vale o padrão: espelho ligado" },
  { nome: "DEV_EMAIL", tipo: "variável", local: true, sem: "nada: é só para rodar no computador" },
  { nome: "DEV_FETCH_FALSO", tipo: "variável", local: true, sem: "nada: é só para rodar no computador" },
  { nome: "DB", tipo: "binding", obrigatoria: true, sem: "nada funciona: é o banco D1" },
  { nome: "ASSETS", tipo: "binding", obrigatoria: true, sem: "as páginas e os arquivos do site não abrem" },
  { nome: "ESPELHO", tipo: "binding", sem: "todas as leituras vão direto ao D1" },
  { nome: "AI", tipo: "binding", sem: "a tradução das notícias fica desligada" },
];
const presente = (v) => (typeof v === "string" ? v.trim() !== "" : v != null);
export function grupoConfig(env, { local = false } = {}) {
  const linhas = CONFIG.map((c) => {
    const tem = presente(env[c.nome]);
    let estado = "em dia";
    const obs = [];
    if (c.local) {
      if (tem && !local) { estado = "com erro"; obs.push("ligada fora do computador: " + (c.nome === "DEV_EMAIL" ? "o login deixa de ser conferido" : "as fontes viram dados falsos")); }
      else obs.push(tem ? "ligada (ambiente local)" : "ausente, como deve ser em produção");
    } else if (!tem) { estado = c.obrigatoria ? "com erro" : "em dia"; obs.push((c.obrigatoria ? "falta: " : "ausente (opcional): ") + c.sem); }
    else obs.push(c.nome === "ESPELHO_ATIVO" ? (String(env.ESPELHO_ATIVO).trim() === "0" ? "presente: espelho desligado" : "presente: espelho ligado") : "presente");
    return { id: c.nome, nome: c.nome, tipo: c.tipo, obrigatoria: !!c.obrigatoria, presente: tem, estado, sem: c.sem, obs };
  });
  return { linhas };
}

// ---------- Integridade dos dados: uma consulta cada, até 5 ids de exemplo ----------
// Temas válidos de cada seção: os ids gravados em `tema` (TEMAS_* em public/index.html; Saúde em public/saude.js).
// test/health.test.mjs confere que a lista daqui é a mesma da página.
export const TEMAS_VALIDOS = {
  tech: ["arquitetura", "eip", "legado", "docs", "diagramas", "dados", "programacao", "infra", "ia", "seguranca", "seguranca-ia", "plataformas", "startups", "carreira", "cursos", "eventos", "setup", "aliexpress"],
  politica: ["leis", "congresso", "governo", "rs", "escandalos", "eleicoes", "economia", "brasil", "mundo"],
  negocios: ["startups", "ma", "bigtech", "ia", "financas", "varejo", "trabalho", "regulacao", "latam", "asia"],
  investimentos: ["bolsa", "fiis", "rendafixa", "macro", "cripto", "regulacao", "mundo"],
  esportes: ["inter", "gauchao", "brasileirao", "libertadores", "copadobrasil", "mercado", "internacional", "padel"],
  oficina: ["marcenaria", "carpintaria", "serralheria", "ferramentas", "seguranca", "negocio"],
  saude: S.TEMAS.map((t) => t.id),
};
const TEMAS_POR_COL = Object.fromEntries(SECOES.map((s) => [ITENS_DA_SECAO(s), TEMAS_VALIDOS[s]]));
const marcas = (n, de = 1) => Array.from({ length: n }, (_, i) => "?" + (i + de)).join(", ");
export const SQL_INT_TEMAS = "SELECT k, id, n FROM (SELECT collection AS k, id, count(*) OVER (PARTITION BY collection) AS n, row_number() OVER (PARTITION BY collection ORDER BY coletado DESC, id) AS r FROM docs"
  + ` WHERE collection IN (${marcas(SECOES.length, 2)}) AND (coalesce(json_extract(data, '$.tema'), '') = '' OR json_extract(data, '$.tema') NOT IN (SELECT value FROM json_each(?1, '$."' || collection || '"')))) WHERE r <= 5`;
export const SQL_INT_PRODUTO = "SELECT id, count(*) OVER () AS n FROM docs i WHERE collection = 'items-saude' AND (coalesce(json_extract(data, '$.produto'), '') = ''"
  + " OR NOT EXISTS (SELECT 1 FROM docs p WHERE p.collection = 'saude-produtos' AND p.id = json_extract(i.data, '$.produto'))) ORDER BY coletado DESC, id LIMIT 5";
const termoCategoria = (k, col, meta) => `SELECT * FROM (SELECT '${k}' AS k, x.id, count(*) OVER () AS n FROM docs x WHERE x.collection = '${col}' AND coalesce(json_extract(x.data, '$.categoria'), '') <> ''`
  + ` AND json_extract(x.data, '$.categoria') NOT IN (SELECT coalesce(json_extract(j.value, '$.id'), '') FROM docs m, json_each(m.data, '$.categorias') j WHERE m.collection = 'meta' AND m.id = '${meta}') ORDER BY x.id LIMIT 5)`;
export const SQL_INT_CATEGORIAS = [termoCategoria("ferramentas", "oficina-ferramentas", "oficina-categorias"), termoCategoria("insumos", "oficina-insumos", "oficina-insumos-categorias"), termoCategoria("tecnologias", "landscape", "landscape-categorias")].join(" UNION ALL ");
export const SQL_INT_INSTRUCOES = `SELECT id, length(coalesce(json_extract(data, '$.texto'), '')) AS n FROM docs WHERE collection = 'instrucoes' AND id IN (${marcas(SECOES.length)})`;
export const SQL_INT_DESTAQUES = `SELECT collection FROM docs WHERE id = ?1 AND collection IN (${marcas(SECOES.length, 2)})`;
export const SQL_INT_LOTES = "SELECT id, lote, count(*) OVER () AS n FROM candidatos WHERE status = 'novo' AND coalesce(lote, '') <> '' AND lote < ?1 ORDER BY lote, id LIMIT 5";
export const LOTE_PRESO_H = 6;
// Destaques do dia (id "d<AAAA-MM-DD>", dia de São Paulo). Antes das 9h a primeira rodada ainda não passou: vale o de ontem.
export function diaDosDestaques(agora) {
  const sp = new Date(agora - FUSO_SP);
  const dia = sp.getUTCHours() < 9 ? new Date(sp.getTime() - DIA) : sp;
  return dia.toISOString().slice(0, 10);
}
async function grupoIntegridade(ctx) {
  const { env, agora } = ctx;
  const DB = env.DB;
  const linhas = [];
  const linha = (id, nome, n, exemplos, obs = []) => ({ id, nome, estado: n ? "com erro" : "em dia", n, exemplos: exemplos.slice(0, 5), obs: [n ? plural(n, "caso", "casos") : "nada fora do lugar", ...obs] });
  const tenta = async (id, nome, fn) => { try { return await fn(); } catch (e) { linhas.push({ id, nome, estado: "sem dados", n: null, exemplos: [], obs: ["não deu para conferir: " + msgDe(e)] }); return null; } };
  // 1. tema ausente ou fora da lista, por seção
  await tenta("temas", "Itens sem tema ou com tema fora da lista", async () => {
    const { results } = await DB.prepare(SQL_INT_TEMAS).bind(JSON.stringify(TEMAS_POR_COL), ...SECOES.map(ITENS_DA_SECAO)).all();
    const por = new Map();
    for (const r of results || []) { const p = por.get(r.k) || { n: Number(r.n) || 0, ids: [] }; p.ids.push(r.id); por.set(r.k, p); }
    for (const s of SECOES) { const p = por.get(ITENS_DA_SECAO(s)) || { n: 0, ids: [] }; linhas.push({ ...linha("temas-" + s, "Temas · " + NOME_SECAO[s], p.n, p.ids), secao: s }); }
  });
  // 2. itens de Saúde com produto que não existe
  await tenta("produto", "Saúde: itens com produto que não existe", async () => {
    const { results } = await DB.prepare(SQL_INT_PRODUTO).all();
    linhas.push(linha("produto", "Saúde: itens com produto que não existe", results && results[0] ? Number(results[0].n) : 0, (results || []).map((r) => r.id)));
  });
  // 3. ferramentas, insumos e tecnologias em categoria que não existe
  await tenta("categorias", "Categorias que não existem", async () => {
    const { results } = await DB.prepare(SQL_INT_CATEGORIAS).all();
    const nomes = { ferramentas: "Oficina: ferramentas em categoria que não existe", insumos: "Oficina: insumos em categoria que não existe", tecnologias: "ArchLandscape: tecnologias em categoria que não existe" };
    for (const k of Object.keys(nomes)) { const rs = (results || []).filter((r) => r.k === k); linhas.push(linha("categorias-" + k, nomes[k], rs[0] ? Number(rs[0].n) : 0, rs.map((r) => r.id))); }
  });
  // 4. instruções ausentes ou com menos de 500 caracteres
  await tenta("instrucoes", "Instruções ausentes ou curtas", async () => {
    const { results } = await DB.prepare(SQL_INT_INSTRUCOES).bind(...SECOES).all();
    const tam = new Map((results || []).map((r) => [r.id, Number(r.n) || 0]));
    const ruins = SECOES.filter((s) => !tam.has(s) || tam.get(s) < LIM_CURADORIA.TEXTO_MIN);
    linhas.push(linha("instrucoes", "Instruções ausentes ou com menos de " + LIM_CURADORIA.TEXTO_MIN + " caracteres", ruins.length, ruins,
      ruins.map((s) => NOME_SECAO[s] + ": " + (tam.has(s) ? plural(tam.get(s), "caractere", "caracteres") : "sem instruções no Lookout"))));
  });
  // 5. destaques do dia ausentes por seção
  await tenta("destaques", "Destaques do dia ausentes", async () => {
    const dia = diaDosDestaques(agora);
    const { results } = await DB.prepare(SQL_INT_DESTAQUES).bind("d" + dia, ...SECOES.map(DESTAQUES_DA_SECAO)).all();
    const tem = new Set((results || []).map((r) => r.collection));
    const faltam = SECOES.filter((s) => !tem.has(DESTAQUES_DA_SECAO(s)));
    linhas.push({ ...linha("destaques", "Destaques do dia ausentes", faltam.length, faltam, [`dia conferido: ${dia.slice(8, 10)}/${dia.slice(5, 7)}${dia !== new Date(agora - FUSO_SP).toISOString().slice(0, 10) ? " (antes das 9h vale o de ontem)" : ""}`, ...faltam.map((s) => NOME_SECAO[s])]), dia });
  });
  // 6. candidatos reservados em lote há mais de 6 horas sem destino
  await tenta("lotes", "Candidatos presos em lote", async () => {
    const corte = new Date(agora - LOTE_PRESO_H * HORA).toISOString();
    const { results } = await DB.prepare(SQL_INT_LOTES).bind(corte).all();
    linhas.push(linha("lotes", `Candidatos reservados há mais de ${LOTE_PRESO_H} h sem destino`, results && results[0] ? Number(results[0].n) : 0, (results || []).map((r) => r.id),
      results && results[0] ? ["lote mais antigo: " + results[0].lote] : []));
  });
  return { linhas };
}

// ---------- montagem ----------
export const GRUPOS = [
  { id: "tarefas", titulo: "Tarefas agendadas", montar: grupoTarefas },
  { id: "worker", titulo: "Worker e cron", montar: grupoWorker },
  { id: "fontes", titulo: "Fontes", montar: grupoFontes },
  { id: "externos", titulo: "Dados externos", montar: grupoExternos },
  { id: "banco", titulo: "Banco e espelho", montar: grupoBanco },
  { id: "config", titulo: "Configuração", montar: (ctx) => grupoConfig(ctx.env, { local: ctx.local }) },
  { id: "integridade", titulo: "Integridade dos dados", montar: grupoIntegridade },
];
export const GRUPO_IDS = GRUPOS.map((g) => g.id);

// Pior estado de cada grupo e o geral. Grupo com erro de leitura fica "sem dados".
export function resumo(grupos) {
  const out = (grupos || []).map((g) => {
    const ls = Array.isArray(g.linhas) ? g.linhas : [];
    const emDia = g.emDia != null ? g.emDia : ls.filter((l) => l.estado === "em dia").length;
    const total = g.total != null ? g.total : ls.length;
    const estado = g.erro ? "sem dados" : pior(ls.map((l) => l.estado).concat(g.estado && g.estado !== "em dia" ? [g.estado] : []));
    return { id: g.id, titulo: g.titulo, estado, emDia, total, ...(g.erro ? { erro: g.erro } : {}) };
  });
  const problemas = out.filter((g) => g.estado !== "em dia").length;
  return { estado: pior(out.map((g) => g.estado)), problemas, grupos: out };
}

export async function montar(env, { agora = Date.now(), ids = GRUPO_IDS, estadoEspelho = null, local = false, espelhoLigado = false } = {}) {
  const memo = {};
  const uma = (k, fn) => memo[k] || (memo[k] = fn());
  const espelho = estadoEspelho ? () => uma("esp", () => Promise.resolve().then(estadoEspelho)) : null;
  const ctx = {
    env, agora, local, espelhoLigado, temEspelho: !!estadoEspelho,
    relatorio: () => uma("rel", () => relatorio(env, { agora, estadoEspelho: espelho })),
    espelho: () => (espelho ? espelho() : Promise.resolve(null)),
  };
  const grupos = await Promise.all(GRUPOS.filter((g) => ids.includes(g.id)).map(async (g) => {
    try {
      const r = await g.montar(ctx);
      const base = { id: g.id, titulo: g.titulo, ...r };
      return { ...base, ...resumo([base]).grupos[0], linhas: r.linhas || [] };
    } catch (e) {
      return { id: g.id, titulo: g.titulo, estado: "sem dados", erro: "Não deu para ler este bloco: " + msgDe(e), emDia: 0, total: 0, linhas: [] };
    }
  }));
  const r = resumo(grupos);
  return { lidoEm: new Date(agora).toISOString(), estado: r.estado, problemas: r.problemas, grupos };
}

const resposta = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
// Quem não é Admin já recebeu o 404 em src/index.js; aqui o 404 se repete para a rota nunca abrir sozinha.
export async function rotaHealth(request, env, quem, deps = {}) {
  if (!quem || !quem.admin) return resposta({ erro: "rota" }, 404);
  if (request.method !== "GET") return resposta({ erro: "metodo" }, 405);
  const url = new URL(request.url);
  const grupo = url.searchParams.get("grupo");
  if (grupo && !GRUPO_IDS.includes(grupo)) return resposta({ erro: "grupo" }, 400);
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname);
  try {
    const d = await montar(env, { agora: deps.agora ? deps.agora() : Date.now(), ids: grupo ? [grupo] : GRUPO_IDS, estadoEspelho: deps.estadoEspelho || null, local, espelhoLigado: !!deps.espelhoLigado });
    if (url.searchParams.get("resumo") === "1") return resposta({ lidoEm: d.lidoEm, estado: d.estado, problemas: d.problemas, grupos: d.grupos.map(({ linhas, ...g }) => ({ id: g.id, titulo: g.titulo, estado: g.estado, emDia: g.emDia, total: g.total, ...(g.erro ? { erro: g.erro } : {}) })) });
    return resposta(d);
  } catch (e) { return resposta({ erro: "Não deu para montar os Health Checks: " + msgDe(e) }, 500); }
}

export const Health = { TAREFAS, TAREFA, ESTADOS, GRUPOS: GRUPO_IDS, CONFIG, TEMAS_VALIDOS, resumo, pior, estadoTarefa, estadoExterno, montar, rotaHealth, haTempo, diaDosDestaques };
