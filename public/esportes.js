/* Esportes: competições que o Lookout conhece, zonas da tabela, validação de "Meus esportes" e a hora no fuso de quem vê.
 *
 * Script clássico (<script src="/esportes.js">), como o tabela.js e o radar-filtro.js: a página usa window.Esportes, e o
 * Worker (src/esportes.js, src/painel.js) e os testes em Node importam pelo efeito e leem globalThis.Esportes.
 * Sem import nem export, nem nada do navegador ou do Worker.
 *
 * Competição (LIGAS): { id, nome, curto, esporte, caminho, pais, fonte, reserva?, zonas: [{ de, ate, id }] }
 *   id é o slug da ESPN (bra.1, conmebol.libertadores); caminho é o "<esporte>/<liga>" da URL dela.
 *   fonte "espn"; reserva "ge" quando a página do Globo Esporte entra se a ESPN não tiver a competição.
 *   zonas: faixas de posição da tabela. Mexer aqui muda a cor das linhas e a legenda, sem tocar no resto.
 *   Faixas de 2026; quando o regulamento mudar, é só trocar os números.
 * "Meus esportes" (prefs/<email>, id "esportes"): { competicoes: [ids ligados], times: [{ liga, id, nome }], ordem: [ids] }
 *   ordem guarda a posição de todas, ligadas ou não, para a competição voltar ao mesmo lugar quando for religada.
 */
(function (raiz) {
  "use strict";

  const Z = (de, ate, id) => ({ de, ate, id });
  const ZONAS_NOME = {
    libertadores: "Libertadores", "pre-libertadores": "Pré-Libertadores", "sul-americana": "Sul-Americana", rebaixamento: "Rebaixamento",
    champions: "Champions League", europa: "Liga Europa", conference: "Conference League", "playoff-rebaixamento": "Playoff de rebaixamento",
    oitavas: "Oitavas", playoff: "Playoff", classifica: "Classifica", "quartas": "Quartas de final",
  };
  /* cor de cada zona: um token do design system (a página mistura com o fundo do card) */
  const ZONAS_COR = {
    libertadores: "var(--ok)", "pre-libertadores": "var(--info)", "sul-americana": "var(--brand-end)", rebaixamento: "var(--err)",
    champions: "var(--ok)", europa: "var(--brand-end)", conference: "var(--info)", "playoff-rebaixamento": "var(--warn)",
    oitavas: "var(--ok)", playoff: "var(--info)", classifica: "var(--ok)", quartas: "var(--ok)",
  };

  const futebol = (id, nome, curto, pais, zonas, extra) => ({ id, nome, curto, esporte: "futebol", caminho: "soccer/" + id, pais, fonte: "espn", zonas, ...(extra || {}) });
  const LISTA = [
    futebol("bra.1", "Brasileirão Série A", "Brasileirão", "BR", [Z(1, 6, "libertadores"), Z(7, 8, "pre-libertadores"), Z(9, 14, "sul-americana"), Z(17, 20, "rebaixamento")]),
    futebol("conmebol.libertadores", "Copa Libertadores", "Libertadores", "", [Z(1, 2, "classifica"), Z(3, 3, "sul-americana")], { grupos: true }),
    futebol("bra.copa_do_brasil", "Copa do Brasil", "Copa do Brasil", "BR", []),
    futebol("bra.camp.gaucho", "Campeonato Gaúcho", "Gauchão", "BR", [Z(1, 8, "quartas"), Z(11, 12, "rebaixamento")], { reserva: "ge", ge: "https://ge.globo.com/futebol/campeonato-gaucho/" }),
    futebol("conmebol.sudamericana", "Copa Sul-Americana", "Sul-Americana", "", [Z(1, 1, "oitavas"), Z(2, 2, "playoff")], { grupos: true }),
    futebol("eng.1", "Premier League", "Premier League", "GB", [Z(1, 4, "champions"), Z(5, 5, "europa"), Z(18, 20, "rebaixamento")]),
    futebol("uefa.champions", "Champions League", "Champions", "", [Z(1, 8, "oitavas"), Z(9, 24, "playoff")]),
    futebol("esp.1", "La Liga", "La Liga", "ES", [Z(1, 4, "champions"), Z(5, 5, "europa"), Z(18, 20, "rebaixamento")]),
    futebol("ita.1", "Serie A italiana", "Serie A", "IT", [Z(1, 4, "champions"), Z(5, 5, "europa"), Z(18, 20, "rebaixamento")]),
    futebol("ger.1", "Bundesliga", "Bundesliga", "DE", [Z(1, 4, "champions"), Z(5, 5, "europa"), Z(16, 16, "playoff-rebaixamento"), Z(17, 18, "rebaixamento")]),
    futebol("fra.1", "Ligue 1", "Ligue 1", "FR", [Z(1, 3, "champions"), Z(4, 4, "europa"), Z(16, 16, "playoff-rebaixamento"), Z(17, 18, "rebaixamento")]),
  ];
  const LIGAS = Object.fromEntries(LISTA.map((l) => [l.id, l]));
  const ORDEM_LIGAS = LISTA.map((l) => l.id);
  /* Esportes da tela "Meus esportes". Basquete, futebol americano e F1 entram depois: o módulo do Worker já aceita
     qualquer "<esporte>/<liga>" da ESPN, falta só pôr as competições aqui. */
  const ESPORTES = [{ id: "futebol", nome: "Futebol", ligas: ORDEM_LIGAS.filter((id) => LIGAS[id].esporte === "futebol") }];
  /* Sempre coletadas, mesmo que ninguém tenha ligado */
  const SEMPRE = ["bra.1", "conmebol.libertadores"];
  const PADRAO = ["bra.1", "conmebol.libertadores", "bra.copa_do_brasil"];
  const MAX_TIMES = 10, NOME_MAX = 40;
  const ID_TIME_OK = /^[A-Za-z0-9-]{1,40}$/;

  const slugLiga = (id) => String(id || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  function zonaDe(liga, pos) {
    const l = LIGAS[liga];
    const p = Number(pos);
    if (!l || !Number.isInteger(p)) return "";
    const z = l.zonas.find((x) => p >= x.de && p <= x.ate);
    return z ? z.id : "";
  }
  /* Legenda: as zonas da competição, na ordem da tabela */
  const legendaDe = (liga) => ((LIGAS[liga] && LIGAS[liga].zonas) || []).map((z) => ({ id: z.id, nome: ZONAS_NOME[z.id] || z.id, cor: ZONAS_COR[z.id] || "var(--muted-foreground)", faixa: z.de === z.ate ? z.de + "º" : z.de + "º a " + z.ate + "º" }));

  const padraoPrefs = () => ({ competicoes: PADRAO.slice(), times: [], ordem: ORDEM_LIGAS.slice() });
  /* Ordem completa: a salva (só ids conhecidos, sem repetir) e, no fim, as competições novas que ainda não estavam lá */
  function ordemCompleta(o) {
    const vistos = new Set(), out = [];
    for (const id of Array.isArray(o) ? o : []) if (LIGAS[id] && !vistos.has(id)) { vistos.add(id); out.push(id); }
    for (const id of ORDEM_LIGAS) if (!vistos.has(id)) out.push(id);
    return out;
  }
  /* Competições ligadas na ordem da pessoa */
  const ligadas = (p) => { const on = new Set((p && p.competicoes) || []); return ordemCompleta(p && p.ordem).filter((id) => on.has(id)); };

  // Confere o corpo do PUT. Devolve { prefs } ou { erro }.
  function validarPrefs(b) {
    if (!b || typeof b !== "object" || Array.isArray(b)) return { erro: "corpo" };
    for (const k of Object.keys(b)) if (!["competicoes", "times", "ordem"].includes(k)) return { erro: "campo " + String(k).slice(0, 20) };
    if (!Array.isArray(b.competicoes)) return { erro: "Mande a lista de competições." };
    const comp = [];
    for (const id of b.competicoes) {
      if (typeof id !== "string" || !LIGAS[id]) return { erro: "Competição desconhecida: " + String(id).slice(0, 40) };
      if (!comp.includes(id)) comp.push(id);
    }
    let ordem = ORDEM_LIGAS.slice();
    if (b.ordem !== undefined) {
      if (!Array.isArray(b.ordem)) return { erro: "ordem" };
      for (const id of b.ordem) if (typeof id !== "string" || !LIGAS[id]) return { erro: "Competição desconhecida na ordem: " + String(id).slice(0, 40) };
      ordem = ordemCompleta(b.ordem);
    }
    const times = [];
    if (b.times !== undefined) {
      if (!Array.isArray(b.times)) return { erro: "times" };
      if (b.times.length > MAX_TIMES) return { erro: `Dá para acompanhar até ${MAX_TIMES} times.` };
      for (const t of b.times) {
        if (!t || typeof t !== "object") return { erro: "time" };
        const liga = t.liga, id = String(t.id ?? ""), nome = String(t.nome ?? "").replace(/\s+/g, " ").trim();
        if (!LIGAS[liga]) return { erro: "Competição desconhecida no time: " + String(liga).slice(0, 40) };
        if (!ID_TIME_OK.test(id)) return { erro: "id de time: " + id.slice(0, 40) };
        if (!nome || nome.length > NOME_MAX) return { erro: "Nome do time vazio ou com mais de " + NOME_MAX + " letras." };
        if (!times.some((x) => x.liga === liga && x.id === id)) times.push({ liga, id, nome });
      }
    }
    return { prefs: { competicoes: comp, times, ordem } };
  }
  // Resposta do GET: o salvo conferido (o que estiver estragado vira o padrão) e o catálogo para a tela.
  function respostaPrefs(salvo) {
    let p = null;
    if (salvo) { const v = validarPrefs({ competicoes: salvo.competicoes, times: salvo.times, ordem: salvo.ordem }); p = v.prefs || null; }
    const base = p || padraoPrefs();
    return {
      ...base, padrao: !p, atualizado: (salvo && salvo.atualizado) || null,
      esportes: ESPORTES.map((e) => ({ id: e.id, nome: e.nome, ligas: e.ligas.map((id) => ({ id, nome: LIGAS[id].nome, curto: LIGAS[id].curto, pais: LIGAS[id].pais })) })),
    };
  }

  /* Hora de um jogo no fuso de quem vê: "qua., 05/11 · 21:30" (fuso padrão America/Sao_Paulo) */
  function fusoLocal() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo"; } catch (e) { return "America/Sao_Paulo"; }
  }
  function partesData(iso, fuso) {
    const d = new Date(iso);
    if (!iso || isNaN(d)) return null;
    try {
      const f = new Intl.DateTimeFormat("pt-BR", { timeZone: fuso || fusoLocal(), weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
      const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
      const dia = new Intl.DateTimeFormat("en-CA", { timeZone: fuso || fusoLocal(), year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
      return { semana: String(p.weekday || "").replace(".", ""), ddmm: p.day + "/" + p.month, hora: p.hour + ":" + p.minute, dia };
    } catch (e) { return null; }
  }
  /* "hoje", "amanhã", "ontem" ou "qua 05/11" */
  function rotuloDia(iso, fuso, agora = new Date()) {
    const p = partesData(iso, fuso);
    if (!p) return "";
    const fmt = (d) => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: fuso || fusoLocal(), year: "numeric", month: "2-digit", day: "2-digit" }).format(d); } catch (e) { return ""; } };
    const hoje = fmt(agora), amanha = fmt(new Date(agora.getTime() + 86400000)), ontem = fmt(new Date(agora.getTime() - 86400000));
    if (p.dia === hoje) return "hoje";
    if (p.dia === amanha) return "amanhã";
    if (p.dia === ontem) return "ontem";
    return p.semana + " " + p.ddmm;
  }

  raiz.Esportes = { LIGAS, ORDEM_LIGAS, ESPORTES, SEMPRE, PADRAO, MAX_TIMES, ZONAS_NOME, ZONAS_COR, slugLiga, zonaDe, legendaDe, padraoPrefs, ordemCompleta, ligadas, validarPrefs, respostaPrefs, fusoLocal, partesData, rotuloDia };
})(typeof globalThis !== "undefined" ? globalThis : this);
