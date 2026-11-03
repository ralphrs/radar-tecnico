/* Radar de dividendos: critérios, avisos, ordenação e filtros salvos, num arquivo só.
 *
 * A página carrega como script clássico (<script src="/radar-filtro.js">) e usa window.RadarFiltro. O Worker
 * (src/index.js e src/leitura.js) e os testes em Node importam pelo efeito (import "../public/radar-filtro.js")
 * e leem globalThis.RadarFiltro. Por isso não tem import nem export, nem nada do navegador ou do Worker.
 *
 * O que entra aqui é conta e regra, sem opinião: a tela mostra quem passa nos critérios da própria pessoa e os fatos
 * de cada papel. Nenhum texto daqui diz o que comprar ou vender.
 *
 * Uma linha (papel) tem sempre { t, classe, preco, liq } e, conforme a classe:
 *   fiis:  nome, seg, man, pvp, dy (12m, %), ult12 (último rendimento × 12 / preço, %), rend, cot, cotMes, pg, m12, rmx, rmd, var1a
 *   acoes: nome, setor, pl, pvp, dy, div12, var1a
 *   eua:   nome, setor, pl, pvp, dy, div12, var1a (em dólar)
 */
(function (raiz) {
  "use strict";

  const CLASSES = ["fiis", "acoes", "eua"];
  const NOME_CLASSE = { fiis: "FIIs", acoes: "Ações BR", eua: "EUA" };
  const ORDENS = { fiis: ["cotistas", "liq"], acoes: ["dy", "liq"], eua: ["dy", "liq"] };
  const REGULAR = ["12", "10", "0"];
  const MAX_FILTROS = 10;
  const NOME_MAX = 30;

  // Valores de partida de cada classe. null = sem limite.
  const PADRAO_CLASSE = {
    fiis: { pvpMax: 1, dyMin: 10, liqMin: 1e6, regular: "12", ordem: "cotistas", seg: [], man: [], semMinhas: false, estavel: false, aporte: 1000 },
    acoes: { dyMin: 6, plMax: 15, pvpMax: 2, liqMin: 5e6, setor: [], ordem: "dy", semMinhas: false, aporte: 1000 },
    eua: { dyMin: 2, plMax: 25, pvpMax: null, liqMin: null, setor: [], ordem: "dy", semMinhas: false, aporte: 1000 },
  };
  // Para quem nunca salvou nada: P/VP até 1, DY 12m de 10% ou mais, R$ 1 mi por dia, 12 de 12 meses, por cotistas.
  const FABRICA = { id: "fiis-padrao", nome: "FIIs P/VP < 1 e DY > 10%", classe: "fiis", ...PADRAO_CLASSE.fiis };

  const novoFiltro = (classe, nome, id) => ({ id: id || "f-" + Date.now().toString(36), nome: nome || NOME_CLASSE[classe], classe, ...clonar(PADRAO_CLASSE[classe]) });
  function clonar(o) { const c = {}; for (const k in o) c[k] = Array.isArray(o[k]) ? o[k].slice() : o[k]; return c; }
  const padraoPrefs = () => ({ filtros: [clonar(FABRICA)], padrao: FABRICA.id, salvo: false });

  // ---------- validação de /api/prefs/radar ----------
  const ID_OK = /^[a-z0-9-]{1,40}$/;
  // [campo, mínimo, máximo] dos números; vazio ou null = sem limite (o aporte vira 0)
  const NUMEROS = { pvpMax: [0.05, 10], dyMin: [0, 60], plMax: [0.1, 500], liqMin: [0, 1e11], aporte: [0, 1e7] };
  const CAMPOS = {
    fiis: ["pvpMax", "dyMin", "liqMin", "regular", "ordem", "seg", "man", "semMinhas", "estavel", "aporte"],
    acoes: ["dyMin", "plMax", "pvpMax", "liqMin", "setor", "ordem", "semMinhas", "aporte"],
    eua: ["dyMin", "plMax", "pvpMax", "liqMin", "setor", "ordem", "semMinhas", "aporte"],
  };
  function validarFiltro(b) {
    if (!b || typeof b !== "object" || Array.isArray(b)) return { erro: "filtro" };
    const classe = b.classe;
    if (!CLASSES.includes(classe)) return { erro: "Classe desconhecida." };
    const nome = String(b.nome == null ? "" : b.nome).replace(/\s+/g, " ").trim();
    if (!nome) return { erro: "Dê um nome ao filtro." };
    if (nome.length > NOME_MAX) return { erro: `O nome passa de ${NOME_MAX} caracteres.` };
    const id = String(b.id || "");
    if (!ID_OK.test(id)) return { erro: "Id de filtro inválido." };
    const f = { id, nome, classe };
    for (const k of CAMPOS[classe]) {
      const v = b[k];
      if (k in NUMEROS) {
        const [min, max] = NUMEROS[k];
        if (v === null || v === undefined || v === "") { f[k] = k === "aporte" ? 0 : null; continue; }
        const n = Number(v);
        if (!Number.isFinite(n) || n < min || n > max) return { erro: `Valor fora do intervalo em ${rotuloCampo(k)}.` };
        f[k] = Math.round(n * 1e4) / 1e4;
      } else if (k === "regular") {
        f[k] = REGULAR.includes(String(v)) ? String(v) : "0";
      } else if (k === "ordem") {
        f[k] = ORDENS[classe].includes(v) ? v : ORDENS[classe][0];
      } else if (k === "seg" || k === "man" || k === "setor") {
        if (v == null) { f[k] = []; continue; }
        if (!Array.isArray(v) || v.length > 40) return { erro: `Lista inválida em ${rotuloCampo(k)}.` };
        const l = [];
        for (const x of v) {
          if (typeof x !== "string" || !x.trim() || x.length > 60) return { erro: `Lista inválida em ${rotuloCampo(k)}.` };
          if (!l.includes(x.trim())) l.push(x.trim());
        }
        f[k] = l;
      } else f[k] = v === true;
    }
    return { filtro: f };
  }
  function rotuloCampo(k) {
    return { pvpMax: "P/VP até", dyMin: "DY mínimo", plMax: "P/L até", liqMin: "liquidez mínima", aporte: "aporte", seg: "segmento", man: "mandato", setor: "setor" }[k] || k;
  }
  // Corpo do PUT: { filtros: [...], padrao: id }. Devolve { filtros, padrao } ou { erro }.
  function validarPrefs(b) {
    if (!b || typeof b !== "object" || Array.isArray(b)) return { erro: "corpo" };
    if (!Array.isArray(b.filtros)) return { erro: "filtros" };
    if (!b.filtros.length) return { erro: "Guarde pelo menos um filtro." };
    if (b.filtros.length > MAX_FILTROS) return { erro: `Dá para guardar até ${MAX_FILTROS} filtros.` };
    const filtros = [], ids = new Set(), nomes = new Set();
    for (const x of b.filtros) {
      const v = validarFiltro(x);
      if (v.erro) return v;
      if (ids.has(v.filtro.id)) return { erro: "Dois filtros com o mesmo id." };
      const k = v.filtro.nome.toLowerCase();
      if (nomes.has(k)) return { erro: `Já existe um filtro chamado "${v.filtro.nome}".` };
      ids.add(v.filtro.id); nomes.add(k);
      filtros.push(v.filtro);
    }
    const padrao = ids.has(b.padrao) ? b.padrao : filtros[0].id;
    return { filtros, padrao };
  }
  // Resposta do GET: o que foi salvo (já conferido) ou o padrão de fábrica.
  function respostaPrefs(salvo) {
    if (salvo && Array.isArray(salvo.filtros)) {
      const v = validarPrefs(salvo);
      if (!v.erro) return { filtros: v.filtros, padrao: v.padrao, salvo: true, atualizado: salvo.atualizado || null };
    }
    return padraoPrefs();
  }
  const filtroPadrao = (prefs) => { const p = prefs && Array.isArray(prefs.filtros) && prefs.filtros.length ? prefs : padraoPrefs(); return p.filtros.find((f) => f.id === p.padrao) || p.filtros[0]; };

  // ---------- linhas a partir dos documentos de meta ----------
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  // b3: meta/b3; fundos: meta/fii-resumo.fundos; extra: { t -> { var1a } } das fichas (opcional)
  function linhasFii(b3, fundos, extra) {
    const out = [];
    for (const x of (b3 && b3.fiis) || []) {
      const f = fundos && fundos[x.t];
      const preco = num(x.preco);
      const liq = num(x.vol) != null && preco != null ? x.vol * preco : null;
      const l = { t: x.t, classe: "fiis", nome: (f && f.n) || x.nome || "", preco, var: num(x.var), liq, seg: (f && f.s) || "", man: (f && f.m) || "", temCvm: !!f };
      if (f) {
        const vp = num(f.vp), rend = num(f.rend), r12 = num(f.r12);
        l.pvp = vp && vp > 0 && preco ? preco / vp : null;
        l.dy = f.m12 && r12 != null && preco ? (r12 / preco) * 100 : null;
        l.ult12 = rend != null && preco ? ((rend * 12) / preco) * 100 : null;
        l.rend = rend; l.rendAnt = num(f.ra);
        l.cot = num(f.cot);
        l.cotMes = num(f.cot) != null && num(f.ca) != null ? f.cot - f.ca : null;
        l.m12 = num(f.m12) || 0;
        l.pg = num(f.pg); l.rmx = num(f.rmx); l.rmd = num(f.rmd);
        l.ref = f.ref || "";
      }
      const e = extra && extra[x.t];
      if (e && num(e.var1a) != null) l.var1a = e.var1a;
      out.push(l);
    }
    return out;
  }
  // Ações da B3 (meta/b3.acoes) com os múltiplos das fichas abertas (fund: { PETR4: { pl, pvp, dy, div12, var1a } })
  function linhasAcoes(b3, fund) {
    return ((b3 && b3.acoes) || []).map((x) => {
      const preco = num(x.preco), f = (fund && fund[x.t]) || {};
      return { t: x.t, classe: "acoes", nome: x.nome || "", preco, var: num(x.var), liq: num(x.vol) != null && preco != null ? x.vol * preco : null, setor: x.setor || f.setor || "",
        pl: num(f.pl), pvp: num(f.pvp), dy: num(f.dy), div12: num(f.div12), var1a: num(f.var1a), temFicha: !!(fund && fund[x.t]) };
    });
  }
  function linhasEua(eua, fund) {
    return ((eua && eua.acoes) || []).map((x) => {
      const preco = num(x.preco), f = (fund && fund[x.t]) || {};
      return { t: x.t, classe: "eua", us: true, nome: x.nome || "", preco, var: num(x.var), liq: num(x.liq), setor: f.setor || "",
        pl: num(f.pl), pvp: num(f.pvp), dy: num(f.dy), div12: num(f.div12), var1a: num(f.var1a), temFicha: !!(fund && fund[x.t]) };
    });
  }

  // ---------- formatação dos textos ----------
  const fmt = (v, c) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
  const fmtMi = (v, us) => {
    const m = us ? "US$ " : "R$ ";
    if (v == null) return "–";
    if (v >= 1e9) return m + fmt(v / 1e9, 1) + " bi";
    if (v >= 1e6) return m + fmt(v / 1e6, 1) + " mi";
    if (v >= 1e3) return m + fmt(v / 1e3, 0) + " mil";
    return m + fmt(v, 0);
  };

  // ---------- critérios ----------
  // Cada falha: { k, curto (para a lista da carteira), longo (para a Leitura do dia) }.
  function avaliar(l, f, ctx) {
    const falhas = [];
    const add = (k, curto, longo) => falhas.push({ k, curto, longo: longo || curto });
    const us = l.classe === "eua";
    if (l.preco == null) add("preco", "sem cotação", "ficou sem cotação");
    if (l.classe === "fiis") {
      if (!l.temCvm) add("cvm", "sem informe da CVM", "ficou sem informe da CVM");
      if (f.pvpMax != null && !(l.pvp != null && l.pvp > 0 && l.pvp <= f.pvpMax)) add("pvp", l.pvp == null ? "sem P/VP" : "P/VP " + fmt(l.pvp, 2), l.pvp == null ? "ficou sem P/VP" : `P/VP foi a ${fmt(l.pvp, 2)}, acima de ${fmt(f.pvpMax, 2)}`);
      if (f.dyMin != null && f.dyMin > 0 && !(l.dy != null && l.dy >= f.dyMin)) add("dy", l.dy == null ? "não paga rendimento" : "DY 12m " + fmt(l.dy, 1) + "%", l.dy == null ? "ficou sem rendimento nos informes" : `DY 12m caiu para ${fmt(l.dy, 1)}%, abaixo de ${fmt(f.dyMin, 0)}%`);
      if (f.liqMin != null && f.liqMin > 0 && !((l.liq || 0) >= f.liqMin)) add("liq", "liquidez " + fmtMi(l.liq || 0), `liquidez do dia em ${fmtMi(l.liq || 0)}, abaixo de ${fmtMi(f.liqMin)}`);
      const min = f.regular === "12" ? 12 : f.regular === "10" ? 10 : 0;
      if (min) {
        const pagos = l.pg != null ? l.pg : l.m12 || 0;
        if (pagos < min) add("regular", `pagou ${pagos} de 12 meses`, `pagou em ${pagos} dos últimos 12 meses`);
      }
      if (f.seg && f.seg.length && !f.seg.includes(l.seg || "")) add("seg", "outro segmento", "está em outro segmento");
      if (f.man && f.man.length && !f.man.includes(l.man || "")) add("man", "outro mandato", "está em outro mandato");
      if (f.estavel && caindo(l)) add("estavel", "rendimento caindo", `último rendimento anualizado em ${fmt(l.ult12, 1)}%, abaixo de 90% do DY 12m`);
    } else {
      if (f.dyMin != null && f.dyMin > 0 && !(l.dy != null && l.dy >= f.dyMin)) add("dy", l.dy == null ? (l.temFicha ? "não paga dividendo" : "sem DY (abra a ficha)") : "DY " + fmt(l.dy, 1) + "%", l.dy == null ? "ficou sem DY" : `DY caiu para ${fmt(l.dy, 1)}%, abaixo de ${fmt(f.dyMin, 0)}%`);
      if (f.plMax != null && !(l.pl != null && l.pl > 0 && l.pl <= f.plMax)) add("pl", l.pl == null ? "sem P/L (abra a ficha)" : l.pl <= 0 ? "P/L negativo" : "P/L " + fmt(l.pl, 1), l.pl == null ? "ficou sem P/L" : `P/L foi a ${fmt(l.pl, 1)}`);
      if (f.pvpMax != null && !(l.pvp != null && l.pvp > 0 && l.pvp <= f.pvpMax)) add("pvp", l.pvp == null ? "sem P/VP (abra a ficha)" : "P/VP " + fmt(l.pvp, 2), l.pvp == null ? "ficou sem P/VP" : `P/VP foi a ${fmt(l.pvp, 2)}, acima de ${fmt(f.pvpMax, 2)}`);
      if (f.liqMin != null && f.liqMin > 0 && !((l.liq || 0) >= f.liqMin)) add("liq", "liquidez " + fmtMi(l.liq || 0, us), `liquidez do dia em ${fmtMi(l.liq || 0, us)}, abaixo de ${fmtMi(f.liqMin, us)}`);
      if (f.setor && f.setor.length && !f.setor.includes(l.setor || "")) add("setor", "outro setor", "está em outro setor");
    }
    if (f.semMinhas && ctx && ctx.ignorarMinhas !== true && ctx.posicoes && ctx.posicoes.has(l.t)) add("minha", "já está na carteira", "já está na sua carteira");
    return falhas;
  }
  // Último rendimento × 12 abaixo de 90% do DY de 12 meses
  const caindo = (l) => l.ult12 != null && l.dy != null && l.dy > 0 && l.ult12 < 0.9 * l.dy;

  // Avisos de cada linha (chips). ctx.posicoes: Map(papel -> { q, valor }), ctx.patrimonio.
  function avisos(l, f, ctx) {
    const out = [];
    if (l.classe === "fiis") {
      if (caindo(l)) out.push({ k: "caindo", txt: "rendimento caindo", cls: "warn", dica: `Último rendimento × 12 dá ${fmt(l.ult12, 1)}%, menos de 90% do DY de 12 meses (${fmt(l.dy, 1)}%)` });
      if (l.cotMes != null && l.cotMes < 0) out.push({ k: "cotistas", txt: "perdendo cotistas", cls: "warn", dica: `${fmt(-l.cotMes, 0)} cotistas a menos no último informe da CVM` });
      if (l.pvp != null && (l.pvp < 0.5 || l.pvp > 2.5)) out.push({ k: "pvp", txt: "P/VP fora da curva", cls: "err", dica: "P/VP abaixo de 0,5 ou acima de 2,5: conferir desdobro ou valor patrimonial no informe" });
      if (l.rmx != null && l.rmd != null && l.rmd > 0 && l.rmx > 2 * l.rmd) out.push({ k: "extra", txt: "rendimento extraordinário", cls: "warn", dica: "Um mês dos últimos 12 pagou mais que o dobro da mediana: o DY 12m pode estar inflado por ele" });
    }
    if (l.var1a != null && l.var1a <= -15 && l.dy != null) out.push({ k: "queda", txt: "DY puxado por queda", cls: "warn", dica: `O preço caiu ${fmt(-l.var1a, 0)}% em 12 meses; parte do DY vem da queda da cota` });
    const p = ctx && ctx.posicoes && ctx.posicoes.get(l.t);
    if (ctx && ctx.patrimonio > 0 && f && f.aporte > 0) {
      const atual = p ? p.valor : 0;
      const dep = (atual + f.aporte) / (ctx.patrimonio + f.aporte);
      if (dep > 0.2) out.push({ k: "concentra", txt: "passaria de 20%", cls: "warn", dica: `Com mais ${fmtMi(f.aporte)} aqui, o papel seria ${fmt(dep * 100, 0)}% da carteira` });
    }
    if (p) out.push({ k: "tenho", txt: "tenho " + fmt(p.q, Number.isInteger(p.q) ? 0 : 2) + (ctx.patrimonio > 0 ? " · " + fmt((p.valor / ctx.patrimonio) * 100, 1) + "%" : ""), cls: "ok", dica: "Quantidade na sua carteira e o peso dela no patrimônio" });
    return out;
  }
  // Por mês, ao último rendimento (FII) ou à média dos dividendos de 12 meses (ações)
  function naMeta(l, aporte) {
    if (!(aporte > 0) || !(l.preco > 0)) return null;
    const porCota = l.classe === "fiis" ? l.rend : l.div12 != null ? l.div12 / 12 : null;
    return porCota != null && porCota > 0 ? (aporte * porCota) / l.preco : null;
  }
  function ordenar(l, ordem) {
    const v = (x) => (ordem === "cotistas" ? x.cotMes : ordem === "dy" ? x.dy : x.liq);
    return l.slice().sort((a, b) => {
      const va = v(a), vb = v(b);
      if (va == null && vb == null) return (b.liq || 0) - (a.liq || 0);
      if (va == null) return 1; if (vb == null) return -1;
      return vb - va || (b.liq || 0) - (a.liq || 0);
    });
  }
  // Roda o filtro numa classe. ctx: { posicoes: Map, patrimonio }. Devolve { total, passam: [{ ...l, avisos, naMeta }], falha: Map(t -> falhas) }
  function aplicar(linhas, f, ctx) {
    const passam = [], falha = new Map();
    for (const l of linhas) {
      const fs = avaliar(l, f, ctx);
      if (fs.length) { falha.set(l.t, fs); continue; }
      passam.push({ ...l, avisos: avisos(l, f, ctx), naMeta: naMeta(l, f.aporte) });
    }
    return { total: linhas.length, passam: ordenar(passam, f.ordem), falha };
  }
  // Mapa da carteira para o ctx, a partir de posicoes do /api/carteira (ou de calcular)
  function ctxCarteira(posicoes, patrimonio) {
    const m = new Map();
    for (const p of posicoes || []) if (p && p.q > 0) m.set(p.t, { q: p.q, valor: p.valor || 0, classe: p.classe });
    return { posicoes: m, patrimonio: patrimonio || 0 };
  }
  const CLASSE_CART = { fiis: "fii", acoes: "acao", eua: null };
  // Sua carteira contra o filtro: os da classe do filtro, quantos passam e o motivo de quem não passa.
  function contraFiltro(linhas, f, ctx, posicoes) {
    const cls = CLASSE_CART[f.classe];
    const meus = (posicoes || []).filter((p) => p.q > 0 && p.classe === cls);
    const porT = new Map(linhas.map((l) => [l.t, l]));
    const passam = [], naoPassam = [];
    const c2 = { ...ctx, ignorarMinhas: true };
    for (const p of meus) {
      const l = porT.get(p.t);
      if (!l) { naoPassam.push({ t: p.t, motivo: "fora das cotações do Lookout", valor: p.valor }); continue; }
      const fs = avaliar(l, f, c2);
      if (fs.length) naoPassam.push({ t: p.t, motivo: fs[0].curto, falhas: fs, valor: p.valor }); else passam.push({ t: p.t, valor: p.valor });
    }
    naoPassam.sort((a, b) => (b.valor || 0) - (a.valor || 0));
    const outras = (posicoes || []).filter((p) => p.q > 0 && p.classe !== cls).length;
    return { n: meus.length, passam, naoPassam, outras };
  }

  // ---------- notícias ----------
  // Papéis citados numa notícia: campo "ativos" ou códigos da B3 no título (como a página faz na Bolsa)
  const RE_PAPEL = /\b(?:[A-Z]{4}|[A-Z]\d[A-Z]{2})(?:3|4|5|6|11|31|32|33|34|35|39)\b/g;
  const PAPEL_BR = /^[A-Z][A-Z0-9]{3}\d{1,2}$/;
  function papeisDaNoticia(i) {
    const titulo = String((i && i.titulo) || "");
    const l = Array.isArray(i && i.ativos) && i.ativos.length ? i.ativos.map((a) => String(a).trim().toUpperCase()).filter((a) => PAPEL_BR.test(a) || /^[A-Z]{1,5}$/.test(a)) : titulo.match(RE_PAPEL) || [];
    return [...new Set(l)];
  }

  raiz.RadarFiltro = {
    CLASSES, NOME_CLASSE, ORDENS, PADRAO_CLASSE, FABRICA, MAX_FILTROS, NOME_MAX,
    novoFiltro, padraoPrefs, validarFiltro, validarPrefs, respostaPrefs, filtroPadrao,
    linhasFii, linhasAcoes, linhasEua, avaliar, avisos, naMeta, ordenar, aplicar, ctxCarteira, contraFiltro, caindo,
    papeisDaNoticia, fmt, fmtMi,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
