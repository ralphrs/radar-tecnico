/* Tabela única da página: ordenação por várias colunas, filtro por coluna, paginação e estado salvo.
 *
 * Script clássico (<script src="/tabela.js">), como o radar-filtro.js: a página usa window.Tabela e os testes em Node
 * importam pelo efeito (import "../public/tabela.js") e leem globalThis.Tabela. As funções puras (ordenar, filtrar,
 * paginas, cliqueOrdem, lerEstado...) não tocam no DOM; Tabela.criar monta a tabela e só existe no navegador.
 *
 * Coluna: { id, rotulo, tipo: "texto" | "num" | "data", valor(linha), valores?(linha) (texto com vários valores, como
 *   as corretoras), cls, ordenavel (padrão true), filtravel (padrão true), dir (primeiro sentido: 1 ou -1),
 *   fmt(v) (como o número aparece no chip), unidade ("%", "R$"...) }
 * Estado: { ordem: [{ c, d }], filtros: { <col>: { q, vals } | { min, max } | { de, ate } }, pagina, porPagina }
 */
(function (raiz) {
  "use strict";

  const POR_PAGINA = [25, 50, 100];
  const MAX_ORDEM = 5, MAX_SUGESTOES = 12, MAX_VALS = 12;
  const ID_OK = /^[a-z0-9-]{1,80}$/, COL_OK = /^[A-Za-z0-9_]{1,24}$/, DATA_OK = /^\d{4}-\d{2}-\d{2}$/;
  const vazio = (v) => v === null || v === undefined || v === "" || (typeof v === "number" && !Number.isFinite(v));
  const semAcento = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const estadoVazio = (porPagina = 25) => ({ ordem: [], filtros: {}, pagina: 1, porPagina });

  /* ---------- funções puras ---------- */

  /* Compara dois valores de um tipo. Vazio sempre por último, nos dois sentidos (quem chama não inverte os vazios). */
  function comparar(a, b, tipo, d) {
    const va = vazio(a), vb = vazio(b);
    if (va || vb) return va === vb ? 0 : va ? 1 : -1;
    let r;
    if (tipo === "num") r = Number(a) - Number(b);
    else if (tipo === "data") r = String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
    else r = String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base", numeric: true });
    return r * (d < 0 ? -1 : 1);
  }
  /* Ordenação estável por vários critérios. Sem critério, a ordem que veio. */
  function ordenar(linhas, colunas, ordem) {
    const crit = (ordem || []).map((o) => ({ col: colunas.find((c) => c.id === o.c), d: o.d })).filter((o) => o.col);
    if (!crit.length) return linhas.slice();
    const vals = linhas.map((l, i) => ({ l, i, v: crit.map((o) => o.col.valor(l)) }));
    vals.sort((x, y) => {
      for (let k = 0; k < crit.length; k++) { const r = comparar(x.v[k], y.v[k], crit[k].col.tipo, crit[k].d); if (r) return r; }
      return x.i - y.i;
    });
    return vals.map((x) => x.l);
  }
  const ativo = (f) => !!f && ((f.vals && f.vals.length) || (f.q && String(f.q).trim()) || !vazio(f.min) || !vazio(f.max) || !!f.de || !!f.ate);
  const valoresTexto = (col, l) => (col.valores ? col.valores(l) || [] : [col.valor(l)]).filter((v) => !vazio(v)).map(String);
  function passa(col, f, l) {
    if (col.tipo === "num") {
      const v = col.valor(l);
      if (vazio(v)) return false;
      if (!vazio(f.min) && Number(v) < f.min) return false;
      if (!vazio(f.max) && Number(v) > f.max) return false;
      return true;
    }
    if (col.tipo === "data") {
      const v = String(col.valor(l) || "").slice(0, 10);
      if (!v) return false;
      if (f.de && v < f.de) return false;
      if (f.ate && v > f.ate) return false;
      return true;
    }
    const vs = valoresTexto(col, l);
    /* valores marcados mandam; sem nenhum marcado, vale o "contém" */
    if (f.vals && f.vals.length) return vs.some((v) => f.vals.includes(v));
    const q = semAcento(f.q || "").trim();
    return !q || vs.some((v) => semAcento(v).includes(q));
  }
  function filtrar(linhas, colunas, filtros) {
    const fs = Object.entries(filtros || {}).map(([c, f]) => [colunas.find((x) => x.id === c), f]).filter(([col, f]) => col && ativo(f));
    if (!fs.length) return linhas.slice();
    return linhas.filter((l) => fs.every(([col, f]) => passa(col, f, l)));
  }
  /* Sugestões de uma coluna de texto: os valores que existem, os mais frequentes primeiro, até 12 */
  function sugestoes(linhas, col, q, max = MAX_SUGESTOES) {
    const cont = new Map();
    for (const l of linhas) for (const v of valoresTexto(col, l)) cont.set(v, (cont.get(v) || 0) + 1);
    const qq = semAcento(q || "").trim();
    return [...cont].filter(([v]) => !qq || semAcento(v).includes(qq))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR")).slice(0, max).map(([v, n]) => ({ v, n }));
  }
  /* Números das páginas com elipse: sempre a primeira, a última e duas em volta da atual */
  function paginas(atual, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const out = [1];
    const ini = Math.max(2, Math.min(atual - 1, total - 4)), fim = Math.min(total - 1, Math.max(atual + 1, 5));
    if (ini > 2) out.push("…");
    for (let p = ini; p <= fim; p++) out.push(p);
    if (fim < total - 1) out.push("…");
    out.push(total);
    return out;
  }
  function paginar(n, pagina, porPagina) {
    const pp = POR_PAGINA.includes(porPagina) ? porPagina : 25;
    const total = Math.max(1, Math.ceil(n / pp));
    const p = Math.min(Math.max(1, Math.floor(pagina) || 1), total);
    return { pagina: p, total, ini: (p - 1) * pp, fim: Math.min(n, p * pp), porPagina: pp };
  }
  /* Clique no cabeçalho. Sem Shift: só essa coluna, no sentido padrão, depois o outro, depois limpa.
     Com Shift: entra como próximo critério; clicando de novo troca o sentido e depois sai da lista. */
  function cliqueOrdem(ordem, c, shift, dirPadrao = 1) {
    const o = (ordem || []).map((x) => ({ ...x }));
    const i = o.findIndex((x) => x.c === c);
    const ciclo = (x) => (x.d === dirPadrao ? { c, d: -dirPadrao } : null);
    if (!shift) {
      if (o.length === 1 && i === 0) { const n = ciclo(o[0]); return n ? [n] : []; }
      return [{ c, d: dirPadrao }];
    }
    if (i < 0) return o.length >= MAX_ORDEM ? o : [...o, { c, d: dirPadrao }];
    const n = ciclo(o[i]);
    if (n) o[i] = n; else o.splice(i, 1);
    return o;
  }
  const numOk = (v) => v === null || (typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e15);
  /* Confere um estado (do localStorage, do servidor ou de um PUT). Devolve { estado } ou { erro }. */
  function validarEstado(e) {
    if (!e || typeof e !== "object" || Array.isArray(e)) return { erro: "estado" };
    const out = estadoVazio();
    if (e.ordem !== undefined) {
      if (!Array.isArray(e.ordem) || e.ordem.length > MAX_ORDEM) return { erro: "ordem" };
      const vistos = new Set();
      for (const o of e.ordem) {
        if (!o || !COL_OK.test(String(o.c)) || (o.d !== 1 && o.d !== -1) || vistos.has(o.c)) return { erro: "ordem" };
        vistos.add(o.c); out.ordem.push({ c: o.c, d: o.d });
      }
    }
    if (e.filtros !== undefined) {
      if (!e.filtros || typeof e.filtros !== "object" || Array.isArray(e.filtros)) return { erro: "filtros" };
      const ks = Object.keys(e.filtros);
      if (ks.length > 20) return { erro: "filtros" };
      for (const k of ks) {
        const f = e.filtros[k];
        if (!COL_OK.test(k) || !f || typeof f !== "object" || Array.isArray(f)) return { erro: "filtro " + String(k).slice(0, 24) };
        const g = {};
        if (f.q !== undefined) { if (typeof f.q !== "string" || f.q.length > 60) return { erro: "filtro " + k }; if (f.q) g.q = f.q; }
        if (f.vals !== undefined) {
          if (!Array.isArray(f.vals) || f.vals.length > MAX_VALS || f.vals.some((v) => typeof v !== "string" || v.length > 80)) return { erro: "filtro " + k };
          if (f.vals.length) g.vals = [...new Set(f.vals)];
        }
        for (const n of ["min", "max"]) if (f[n] !== undefined) { if (!numOk(f[n])) return { erro: "filtro " + k }; if (f[n] !== null) g[n] = f[n]; }
        for (const n of ["de", "ate"]) if (f[n] !== undefined) { if (f[n] !== "" && f[n] !== null && !DATA_OK.test(String(f[n]))) return { erro: "filtro " + k }; if (f[n]) g[n] = f[n]; }
        if (ativo(g)) out.filtros[k] = g;
      }
    }
    if (e.pagina !== undefined) { if (!Number.isInteger(e.pagina) || e.pagina < 1 || e.pagina > 10000) return { erro: "pagina" }; out.pagina = e.pagina; }
    if (e.porPagina !== undefined) { if (!POR_PAGINA.includes(e.porPagina)) return { erro: "porPagina" }; out.porPagina = e.porPagina; }
    return { estado: out };
  }
  const serializar = (estado) => JSON.stringify(validarEstado(estado).estado || estadoVazio());
  /* Lê um estado salvo como texto; o que não passar na conferência vira o padrão */
  function lerEstado(txt, padrao) {
    try { const v = validarEstado(JSON.parse(txt)); if (v.estado) return v.estado; } catch (e) {}
    return padrao ? JSON.parse(JSON.stringify(padrao)) : estadoVazio();
  }
  const fmtBr = (v, c = 2) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
  const dataBr = (s) => (DATA_OK.test(s || "") ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : s);
  /* Texto do chip de um filtro ativo: "P/VP ≤ 1,00", "Segmento: Logística, Papel", "Papel contém “HG”" */
  function textoFiltro(col, f) {
    const rot = col.rotuloCurto || col.rotulo;
    if (col.tipo === "num") {
      const fm = (v) => (col.fmt ? col.fmt(v) : fmtBr(v, Math.abs(v) >= 1000 || Number.isInteger(v) ? 0 : 2)) + (col.unidade === "%" ? "%" : "");
      if (!vazio(f.min) && !vazio(f.max)) return `${rot} de ${fm(f.min)} a ${fm(f.max)}`;
      return !vazio(f.min) ? `${rot} ≥ ${fm(f.min)}` : `${rot} ≤ ${fm(f.max)}`;
    }
    if (col.tipo === "data") {
      if (f.de && f.ate) return `${rot} de ${dataBr(f.de)} a ${dataBr(f.ate)}`;
      return f.de ? `${rot} desde ${dataBr(f.de)}` : `${rot} até ${dataBr(f.ate)}`;
    }
    if (f.vals && f.vals.length) return `${rot}: ${f.vals.slice(0, 3).join(", ")}${f.vals.length > 3 ? ` e mais ${f.vals.length - 3}` : ""}`;
    return `${rot} contém “${f.q}”`;
  }
  /* "1.234,5" ou "1234.5" ou "12%" -> número */
  function numBr(t) {
    const s = String(t == null ? "" : t).replace(/[^\d,.-]/g, "");
    if (!s || s === "-") return null;
    const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : /^-?\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s);
    return Number.isFinite(n) ? n : null;
  }

  const Tabela = { POR_PAGINA, MAX_ORDEM, ID_OK, estadoVazio, comparar, ordenar, filtrar, sugestoes, paginas, paginar, cliqueOrdem, validarEstado, serializar, lerEstado, textoFiltro, numBr, ativo };
  raiz.Tabela = Tabela;
  if (typeof document === "undefined") return;

  /* ---------- navegador ---------- */

  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") n.className = v; else if (k === "html") n.innerHTML = v; else n.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids) if (k != null && k !== false) n.append(k);
    return n;
  };
  const FUNIL = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8.5V19l-4 2v-7.5z"/></svg>';
  const SETAS = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/></svg>';
  const celular = () => window.matchMedia("(max-width: 699px)").matches;

  /* ---- estado salvo: localStorage pinta primeiro, /api/prefs/tabelas manda ---- */
  const instancias = new Map(); /* id -> instância viva */
  const memoria = new Map(); /* id -> { scrollLeft } entre redesenhos completos */
  const mexidas = new Set(); /* ids mudados nesta abertura: o servidor não passa por cima */
  let servidor = null, lendo = null, pendentes = {}, tPut = 0;
  const chaveLocal = (id) => "radar-tabela-" + id;
  function lerLocal(id, padrao) {
    let txt = null;
    try { txt = localStorage.getItem(chaveLocal(id)); } catch (e) {}
    if (servidor && servidor[id] && !mexidas.has(id)) return lerEstado(JSON.stringify(servidor[id]), padrao);
    return txt ? lerEstado(txt, padrao) : JSON.parse(JSON.stringify(padrao || estadoVazio()));
  }
  function guardar(id, estado) {
    mexidas.add(id);
    const s = validarEstado(estado).estado;
    if (!s) return;
    try { localStorage.setItem(chaveLocal(id), JSON.stringify(s)); } catch (e) {}
    pendentes[id] = s;
    clearTimeout(tPut);
    tPut = setTimeout(enviar, 1200);
  }
  async function enviar() {
    const corpo = pendentes; pendentes = {};
    if (!Object.keys(corpo).length) return;
    try {
      await fetch("/api/prefs/tabelas", { method: "PUT", keepalive: true, credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json", "X-Requested-With": "XMLHttpRequest" }, body: JSON.stringify({ tabelas: corpo }) });
    } catch (e) {}
  }
  window.addEventListener("pagehide", () => { if (Object.keys(pendentes).length) { clearTimeout(tPut); enviar(); } });
  /* Uma leitura por abertura. Tabela viva que a pessoa ainda não mexeu troca para o estado do servidor. */
  function carregarServidor() {
    if (lendo) return lendo;
    lendo = (async () => {
      try {
        const r = await fetch("/api/prefs/tabelas", { credentials: "same-origin", cache: "no-store", headers: { "X-Requested-With": "XMLHttpRequest" } });
        if (!r.ok) return;
        const j = await r.json();
        servidor = j && j.tabelas && typeof j.tabelas === "object" ? j.tabelas : {};
        for (const [id, e] of Object.entries(servidor)) {
          if (mexidas.has(id)) continue;
          const v = validarEstado(e).estado; if (!v) continue;
          try { localStorage.setItem(chaveLocal(id), JSON.stringify(v)); } catch (er) {}
          const inst = instancias.get(id);
          if (inst && inst.vivo() && JSON.stringify(inst.estado) !== JSON.stringify(v)) inst.aplicar(v);
        }
        ouvintesServidor.forEach((f) => { try { f(servidor); } catch (er) {} });
      } catch (e) {}
    })();
    return lendo;
  }
  const ouvintesServidor = new Set();
  /* Estado salvo de uma tabela que não usa Tabela.criar (as Minhas listas automáticas) */
  const estadoDe = (id, padrao) => { carregarServidor(); return lerLocal(id, padrao); };
  const salvarEstado = (id, estado) => guardar(id, estado);
  /* avisa quando o estado do servidor chegar (quem já leu depois disso já recebe o do servidor em estadoDe) */
  const aoChegarServidor = (f) => { if (!servidor) ouvintesServidor.add(f); };

  /* ---- popover (funil e painel Ordenar): perto do botão no desktop, folha de baixo no celular ---- */
  let pop = null;
  function fecharPop(devolver) {
    if (!pop) return;
    const p = pop; pop = null;
    p.caixa.remove();
    if (p.veu) p.veu.remove();
    if (p.volta) p.volta.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", p.fora, true);
    window.removeEventListener("resize", p.posicionar);
    if (devolver && p.volta && p.volta.isConnected) p.volta.focus({ preventScroll: true });
    if (p.aoFechar) p.aoFechar();
  }
  function abrirPop(volta, titulo, corpo, aoFechar) {
    fecharPop(false);
    const folha = celular();
    const fechar = el("button", { type: "button", class: "dd-btn dd-btn--ghost tb-pop-x", "aria-label": "Fechar" }, "✕");
    const caixa = el("div", { class: "tb-pop" + (folha ? " folha" : ""), role: "dialog", "aria-label": titulo, tabindex: "-1" },
      el("div", { class: "tb-pop-topo" }, el("b", {}, titulo), fechar), corpo);
    const veu = folha ? el("div", { class: "tb-veu" }) : null;
    if (veu) document.body.append(veu);
    document.body.append(caixa);
    const posicionar = () => {
      if (folha) return;
      const r = volta.getBoundingClientRect();
      const w = caixa.offsetWidth, h = caixa.offsetHeight;
      const x = Math.max(8, Math.min(r.left, innerWidth - w - 8));
      const y = r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - 6 - h) : r.bottom + 6;
      caixa.style.left = x + "px"; caixa.style.top = y + "px";
    };
    posicionar();
    const fora = (e) => { if (!caixa.contains(e.target) && !volta.contains(e.target)) fecharPop(false); };
    pop = { caixa, veu, volta, fora, posicionar, aoFechar };
    volta.setAttribute("aria-expanded", "true");
    fechar.addEventListener("click", () => fecharPop(true));
    if (veu) veu.addEventListener("click", () => fecharPop(true));
    caixa.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); fecharPop(true); } });
    setTimeout(() => { document.addEventListener("pointerdown", fora, true); window.addEventListener("resize", posicionar); }, 0);
    const primeiro = caixa.querySelector("input, select, button:not(.tb-pop-x)");
    (primeiro || caixa).focus({ preventScroll: true });
    return caixa;
  }

  /* ---- cabeçalho ordenável (usado também pelas Minhas listas) ---- */
  function cabecalho(col, ordem, aoOrdenar, extra) {
    const i = (ordem || []).findIndex((o) => o.c === col.id), o = i >= 0 ? ordem[i] : null;
    const th = el("th", { scope: "col", class: (col.cls || "") + (o ? " tb-ordenado" : ""), "aria-sort": o && i === 0 ? (o.d > 0 ? "ascending" : "descending") : o ? "other" : "none" });
    if (col.ordenavel === false) { th.append(col.rotulo); if (extra) th.append(extra); return th; }
    const dica = (o ? `Ordenado ${o.d > 0 ? "do menor para o maior" : "do maior para o menor"}${ordem.length > 1 ? `, critério ${i + 1}` : ""}. ` : "") + "Clique para ordenar; Shift+clique junta como próximo critério.";
    const b = el("button", { type: "button", class: "tb-ord", "data-col": col.id, title: dica },
      el("span", {}, col.rotuloTh || col.rotulo),
      o ? el("span", { class: "tb-seta", "aria-hidden": "true" }, o.d > 0 ? "▲" : "▼") : null,
      o && ordem.length > 1 ? el("span", { class: "tb-prio", "aria-label": `prioridade ${i + 1}` }, String(i + 1)) : null);
    b.addEventListener("click", (e) => aoOrdenar(col, e.shiftKey));
    th.append(b);
    if (extra) th.append(extra);
    return th;
  }

  /* ---- a tabela ---- */
  function criar(op) {
    const { id, colunas } = op;
    const padrao = op.padrao || estadoVazio();
    let linhas = op.linhas || [], total = op.total;
    let estado = lerLocal(id, padrao);
    let visiveis = [];
    const raizEl = el("div", { class: "tb", id: "tb-" + id, "data-tabela": id });
    const barra = el("div", { class: "tb-barra" });
    const conta = el("span", { class: "tb-conta", role: "status", "aria-live": "polite" });
    const btnOrdenar = el("button", { type: "button", class: "dd-btn dd-btn--outline tb-btn-ordenar", "aria-haspopup": "dialog", "aria-expanded": "false", id: "tb-ordenar-" + id, html: SETAS + "<span>Ordenar</span>" });
    const chips = el("div", { class: "tb-chips" });
    barra.append(conta, chips, btnOrdenar);
    const caixa = el("div", { class: op.classeCaixa || "cot-caixa" });
    const tabela = el("table", { class: (op.classeTabela || "cot-tab") + " tb-tab" });
    const thead = el("thead"), tbody = el("tbody");
    tabela.append(thead, tbody); caixa.append(tabela);
    const cel = op.cel ? el("div", { class: op.classeCel || "ct-lista-cel" }) : null;
    const vazioEl = el("div", { class: "tb-vazio", hidden: true });
    const pe = el("div", { class: "tb-pe" });
    raizEl.append(barra, caixa, ...(cel ? [cel] : []), vazioEl, pe);
    caixa.addEventListener("scroll", () => { memoria.set(id, { scrollLeft: caixa.scrollLeft }); }, { passive: true });

    const mudar = (novo, { voltar = true } = {}) => {
      estado = { ...estado, ...novo };
      if (voltar) estado.pagina = 1;
      guardar(id, estado);
      pintar();
      if (op.aoMudar) op.aoMudar(estado, visiveis);
    };
    const ordenarPor = (col, shift) => mudar({ ordem: cliqueOrdem(estado.ordem, col.id, shift, col.dir || (col.tipo === "texto" ? 1 : -1)) });

    function funil(col) {
      const f = estado.filtros[col.id];
      const b = el("button", { type: "button", class: "tb-funil" + (ativo(f) ? " on" : ""), "aria-haspopup": "dialog", "aria-expanded": "false", "aria-label": `Filtrar ${col.rotulo}`, title: `Filtrar ${col.rotulo}`, "data-col": col.id, html: FUNIL });
      b.addEventListener("click", (e) => { e.stopPropagation(); if (pop && pop.volta === b) fecharPop(true); else abrirFiltro(col, b); });
      return b;
    }
    function abrirFiltro(col, volta) {
      const atual = estado.filtros[col.id] || {};
      const corpo = el("div", { class: "tb-filtro" });
      const aplicar = (f) => {
        const fs = { ...estado.filtros };
        if (f && ativo(f)) fs[col.id] = f; else delete fs[col.id];
        mudar({ filtros: fs });
      };
      /* campos com formato (public/campo.js): "%" vira percentual, "R$" moeda, o resto número; datas com máscara */
      const C = raiz.Campo;
      if (col.tipo === "num") {
        const tipo = col.unidade === "%" ? "percentual" : col.unidade === "R$" ? "moeda" : "numero";
        const un = col.unidade && tipo === "numero" ? " (" + col.unidade + ")" : "";
        const casas = tipo === "percentual" ? 1 : 2;
        const ini = (v) => (vazio(v) ? "" : String(v));
        const mn = el("input", { class: "dd-input", type: "text", inputmode: "decimal", id: `tbf-${id}-${col.id}-min`, value: ini(atual.min), placeholder: "sem limite", autocomplete: "off" });
        const mx = el("input", { class: "dd-input", type: "text", inputmode: "decimal", id: `tbf-${id}-${col.id}-max`, value: ini(atual.max), placeholder: "sem limite", autocomplete: "off" });
        if (C) [mn, mx].forEach((i) => C.ligar(i, { tipo, casas }));
        const lerUm = (i) => (C ? C.valor(i) : numBr(i.value));
        const ler = () => ({ min: lerUm(mn), max: lerUm(mx) });
        let t = 0;
        [mn, mx].forEach((i) => {
          i.addEventListener("input", () => { clearTimeout(t); if (C && C.invalido(i)) return; t = setTimeout(() => aplicar(ler()), 300); });
          i.addEventListener("keydown", (e) => { if (e.key === "Enter") { if (C && C.invalido(i)) return; clearTimeout(t); aplicar(ler()); fecharPop(true); } });
        });
        corpo.append(el("div", { class: "tb-faixa" },
          el("label", { for: mn.id }, "Mínimo" + un, mn), el("label", { for: mx.id }, "Máximo" + un, mx)));
      } else if (col.tipo === "data") {
        const de = el("input", { class: "dd-input", type: C ? "text" : "date", id: `tbf-${id}-${col.id}-de`, value: atual.de || "" });
        const ate = el("input", { class: "dd-input", type: C ? "text" : "date", id: `tbf-${id}-${col.id}-ate`, value: atual.ate || "" });
        if (C) [de, ate].forEach((i) => C.ligar(i, { tipo: "data" }));
        const lerD = (i) => (C ? C.valor(i) || "" : i.value);
        const aplicarD = () => { if (C && (C.invalido(de) || C.invalido(ate))) return; aplicar({ de: lerD(de), ate: lerD(ate) }); };
        let td = 0;
        [de, ate].forEach((i) => {
          i.addEventListener("change", aplicarD);
          /* digitando: aplica quando a data está completa (ou o campo ficou vazio) */
          i.addEventListener("input", () => { clearTimeout(td); const v = i.value.trim(); if (!v || (C && C.valor(i))) td = setTimeout(aplicarD, 300); });
          i.addEventListener("keydown", (e) => { if (e.key === "Enter") { clearTimeout(td); aplicarD(); fecharPop(true); } });
        });
        corpo.append(el("div", { class: "tb-faixa" }, el("label", { for: de.id }, "De", de), el("label", { for: ate.id }, "Até", ate)));
      } else {
        const q = el("input", { class: "dd-input", type: "search", id: `tbf-${id}-${col.id}-q`, value: atual.q || "", placeholder: "contém…", autocomplete: "off", "aria-label": `${col.rotulo} contém` });
        const lista = el("div", { class: "tb-sug", role: "group", "aria-label": "Valores" });
        let marcados = new Set(atual.vals || []);
        const desenhar = () => {
          lista.textContent = "";
          const sug = sugestoes(linhas, col, q.value);
          marcados.forEach((v) => { if (!sug.some((s) => s.v === v)) sug.unshift({ v, n: 0 }); });
          if (!sug.length) lista.append(el("p", { class: "tb-nota" }, "Nenhum valor com esse texto."));
          sug.forEach(({ v, n }, k) => {
            const cid = `tbf-${id}-${col.id}-v${k}`;
            const cb = el("input", { type: "checkbox", id: cid, checked: marcados.has(v) });
            cb.addEventListener("change", () => { if (cb.checked) marcados.add(v); else marcados.delete(v); aplicar({ q: q.value, vals: [...marcados].slice(0, MAX_VALS) }); });
            lista.append(el("label", { for: cid, class: "tb-op" }, cb, el("span", {}, v), el("small", {}, n ? String(n) : "")));
          });
        };
        let t = 0;
        q.addEventListener("input", () => { desenhar(); clearTimeout(t); t = setTimeout(() => aplicar({ q: q.value, vals: [...marcados] }), 250); });
        q.addEventListener("keydown", (e) => { if (e.key === "Enter") { clearTimeout(t); aplicar({ q: q.value, vals: [...marcados] }); fecharPop(true); } });
        desenhar();
        corpo.append(q, lista, el("p", { class: "tb-nota" }, "Marque valores para ver só eles; sem nenhum marcado, vale o texto."));
      }
      const limpar = el("button", { type: "button", class: "dd-btn dd-btn--link" }, "Limpar este filtro");
      limpar.addEventListener("click", () => { aplicar(null); fecharPop(true); });
      corpo.append(el("div", { class: "tb-pop-pe" }, limpar));
      abrirPop(volta, "Filtrar " + col.rotulo, corpo);
    }
    function abrirOrdenar() {
      const corpo = el("div", { class: "tb-ordem" });
      const desenhar = () => {
        corpo.textContent = "";
        const ord = estado.ordem;
        if (!ord.length) corpo.append(el("p", { class: "tb-nota" }, op.semOrdem || "Na ordem padrão. Escolha uma coluna para ordenar."));
        const ol = el("ol", { class: "tb-crit" });
        ord.forEach((o, i) => {
          const col = colunas.find((c) => c.id === o.c); if (!col) return;
          const mexe = (nova) => { mudar({ ordem: nova }); desenhar(); };
          const sobe = el("button", { type: "button", class: "dd-btn dd-btn--outline dd-btn--icon", "aria-label": `Subir ${col.rotulo}`, disabled: i === 0 }, "↑");
          sobe.addEventListener("click", () => { const n = ord.slice(); [n[i - 1], n[i]] = [n[i], n[i - 1]]; mexe(n); const b = corpo.querySelectorAll(".tb-crit li")[i - 1]; if (b) b.querySelector("button").focus(); });
          const desce = el("button", { type: "button", class: "dd-btn dd-btn--outline dd-btn--icon", "aria-label": `Descer ${col.rotulo}`, disabled: i === ord.length - 1 }, "↓");
          desce.addEventListener("click", () => { const n = ord.slice(); [n[i + 1], n[i]] = [n[i], n[i + 1]]; mexe(n); });
          const sentido = el("div", { class: "seg", role: "group", "aria-label": "Sentido de " + col.rotulo });
          [[1, col.tipo === "texto" ? "A–Z" : "menor"], [-1, col.tipo === "texto" ? "Z–A" : "maior"]].forEach(([d, n]) => {
            const b = el("button", { type: "button", "aria-pressed": String(o.d === d) }, n + " primeiro");
            b.addEventListener("click", () => mexe(ord.map((x, k) => (k === i ? { c: x.c, d } : x))));
            sentido.append(b);
          });
          const tirar = el("button", { type: "button", class: "dd-btn dd-btn--ghost dd-btn--icon", "aria-label": `Tirar ${col.rotulo} da ordenação` }, "×");
          tirar.addEventListener("click", () => mexe(ord.filter((_, k) => k !== i)));
          ol.append(el("li", {}, el("span", { class: "tb-crit-n" }, String(i + 1)), el("span", { class: "tb-crit-nome" }, col.rotulo), sentido, el("span", { class: "tb-crit-setas" }, sobe, desce, tirar)));
        });
        if (ord.length) corpo.append(ol);
        const resto = colunas.filter((c) => c.ordenavel !== false && !ord.some((o) => o.c === c.id));
        if (resto.length && ord.length < MAX_ORDEM) {
          const sel = el("select", { class: "dd-input", id: `tb-add-${id}`, "aria-label": ord.length ? "Acrescentar critério" : "Ordenar por" },
            el("option", { value: "" }, ord.length ? "Acrescentar critério…" : "Ordenar por…"), ...resto.map((c) => el("option", { value: c.id }, c.rotulo)));
          sel.addEventListener("change", () => { const c = colunas.find((x) => x.id === sel.value); if (!c) return; mudar({ ordem: [...ord, { c: c.id, d: c.dir || (c.tipo === "texto" ? 1 : -1) }] }); desenhar(); const s = document.getElementById(`tb-add-${id}`); if (s) s.focus(); });
          corpo.append(sel);
        }
        const ordPadrao = (padrao.ordem || []).map((o) => ({ ...o }));
        if (JSON.stringify(ord) !== JSON.stringify(ordPadrao)) {
          const lp = el("button", { type: "button", class: "dd-btn dd-btn--link" }, ordPadrao.length || op.semOrdem ? "Voltar à ordem padrão" : "Limpar ordenação");
          lp.addEventListener("click", () => { mudar({ ordem: ordPadrao }); desenhar(); });
          corpo.append(el("div", { class: "tb-pop-pe" }, lp));
        }
      };
      desenhar();
      abrirPop(btnOrdenar, "Ordenar", corpo);
    }
    btnOrdenar.addEventListener("click", () => { if (pop && pop.volta === btnOrdenar) fecharPop(true); else abrirOrdenar(); });

    /* Largura mínima de cada coluna enquanto a tabela está na tela: ao ordenar ou trocar de página as colunas não
       encolhem, a largura total não diminui e a rolagem horizontal fica exatamente onde estava. */
    const largMin = new Map();
    function pintarCabecalho() {
      thead.querySelectorAll("th[data-col]").forEach((th) => { const w = th.getBoundingClientRect().width; if (w > (largMin.get(th.dataset.col) || 0)) largMin.set(th.dataset.col, w); });
      const tr = el("tr");
      colunas.forEach((col) => {
        const th = cabecalho(col, estado.ordem, ordenarPor, col.filtravel === false ? null : funil(col));
        th.dataset.col = col.id;
        const w = largMin.get(col.id); if (w) th.style.minWidth = Math.ceil(w) + "px";
        tr.append(th);
      });
      thead.replaceChildren(tr);
    }
    function pintar() {
      /* guarda a rolagem: só o tbody, o cabeçalho e o rodapé mudam, mas a altura da página pode mudar */
      const sl = caixa.scrollLeft || (memoria.get(id) || {}).scrollLeft || 0, sy = window.scrollY;
      const filtradas = filtrar(linhas, colunas, estado.filtros);
      const ordenadas = ordenar(filtradas, colunas, estado.ordem);
      const pg = paginar(ordenadas.length, estado.pagina, estado.porPagina);
      estado.pagina = pg.pagina; estado.porPagina = pg.porPagina;
      visiveis = ordenadas.slice(pg.ini, pg.fim);
      pintarCabecalho();
      tbody.replaceChildren(...visiveis.map((l) => { const tr = el("tr", op.attrsLinha ? op.attrsLinha(l) : {}, ...colunas.map((c) => op.celula(c, l))); return tr; }));
      if (cel) cel.replaceChildren(...visiveis.map(op.cel));
      const m = total != null ? total : linhas.length;
      conta.textContent = `${ordenadas.length.toLocaleString("pt-BR")} de ${m.toLocaleString("pt-BR")}`;
      if (op.rotuloConta) conta.textContent += " " + op.rotuloConta;
      /* chips dos filtros ativos */
      chips.textContent = "";
      const ativos = Object.entries(estado.filtros).map(([c, f]) => [colunas.find((x) => x.id === c), f]).filter(([c, f]) => c && ativo(f));
      ativos.forEach(([col, f]) => {
        const t = textoFiltro(col, f);
        const b = el("button", { type: "button", class: "chip tb-chip", "aria-label": `Tirar o filtro ${t}`, title: "Tirar este filtro" }, el("span", {}, t), el("span", { "aria-hidden": "true" }, "×"));
        b.addEventListener("click", () => { const fs = { ...estado.filtros }; delete fs[col.id]; mudar({ filtros: fs }); const prox = chips.querySelector(".tb-chip"); (prox || btnOrdenar).focus({ preventScroll: true }); });
        chips.append(b);
      });
      if (ativos.length) {
        const lp = el("button", { type: "button", class: "dd-btn dd-btn--link tb-limpar" }, "Limpar filtros");
        lp.addEventListener("click", () => { mudar({ filtros: {} }); btnOrdenar.focus({ preventScroll: true }); });
        chips.append(lp);
      }
      btnOrdenar.classList.toggle("on", estado.ordem.length > 0);
      /* vazio */
      const nada = !ordenadas.length;
      caixa.hidden = nada; if (cel) cel.hidden = nada;
      vazioEl.hidden = !nada;
      vazioEl.replaceChildren(...(nada ? [op.vazio ? op.vazio(ativos.length > 0) : el("p", { class: "tb-nota" }, ativos.length ? "Nenhuma linha com esses filtros." : "Nada para mostrar.")] : []));
      /* rodapé: N–M de T, páginas e por página */
      pe.textContent = "";
      const esq = el("div", { class: "tb-pe-esq" });
      if (ordenadas.length) esq.append(el("span", { class: "tb-faixa-txt" }, `${(pg.ini + 1).toLocaleString("pt-BR")}–${pg.fim.toLocaleString("pt-BR")} de ${ordenadas.length.toLocaleString("pt-BR")}`));
      if (op.nota) esq.append(op.nota());
      pe.append(esq);
      const dir = el("div", { class: "tb-pe-dir" });
      if (pg.total > 1) {
        const nav = el("nav", { class: "tb-pag", "aria-label": "Páginas" });
        const ir = (p) => () => { mudar({ pagina: p }, { voltar: false }); const b = pe.querySelector(`[data-pag="${p}"]`) || pe.querySelector(".tb-pag button:not(:disabled)"); if (b) b.focus({ preventScroll: true }); };
        const ant = el("button", { type: "button", class: "tb-pg", "aria-label": "Página anterior", disabled: pg.pagina === 1, "data-pag": "ant" }, "‹");
        ant.addEventListener("click", ir(pg.pagina - 1)); nav.append(ant);
        paginas(pg.pagina, pg.total).forEach((p) => {
          if (p === "…") { nav.append(el("span", { class: "tb-elipse", "aria-hidden": "true" }, "…")); return; }
          const b = el("button", { type: "button", class: "tb-pg", "data-pag": String(p), "aria-label": `Página ${p}`, "aria-current": p === pg.pagina ? "page" : null }, String(p));
          b.addEventListener("click", ir(p)); nav.append(b);
        });
        const prox = el("button", { type: "button", class: "tb-pg", "aria-label": "Próxima página", disabled: pg.pagina === pg.total, "data-pag": "prox" }, "›");
        prox.addEventListener("click", ir(pg.pagina + 1)); nav.append(prox);
        dir.append(nav);
      }
      if (ordenadas.length > POR_PAGINA[0]) {
        const sel = el("select", { class: "dd-input tb-porpag", "aria-label": "Linhas por página", id: "tb-pp-" + id }, ...POR_PAGINA.map((n) => el("option", { value: String(n), selected: n === pg.porPagina }, n + " por página")));
        sel.addEventListener("change", () => { mudar({ porPagina: Number(sel.value) }); const s = document.getElementById("tb-pp-" + id); if (s) s.focus({ preventScroll: true }); });
        dir.append(sel);
      }
      pe.append(dir);
      caixa.scrollLeft = sl;
      if (Math.abs(window.scrollY - sy) > 1) window.scrollTo({ top: sy });
    }

    const inst = {
      el: raizEl, caixa, get estado() { return estado; }, get visiveis() { return visiveis; },
      vivo: () => raizEl.isConnected,
      aplicar(novo) { estado = lerEstado(JSON.stringify(novo), padrao); pintar(); if (op.aoMudar) op.aoMudar(estado, visiveis); },
      /* troca as linhas (busca ou dados novos); voltarPagina: a busca mudou e a página volta à 1 */
      atualizar(novas, { voltarPagina = false, total: t } = {}) { linhas = novas; if (t !== undefined) total = t; if (voltarPagina) { estado.pagina = 1; guardar(id, estado); } pintar(); },
      repintar: () => pintar(),
    };
    instancias.set(id, inst);
    pintar();
    /* redesenho completo (a seção inteira foi refeita): devolve a rolagem horizontal de antes */
    const m = memoria.get(id);
    if (m && m.scrollLeft) requestAnimationFrame(() => { if (raizEl.isConnected) caixa.scrollLeft = m.scrollLeft; });
    carregarServidor();
    return inst;
  }

  Object.assign(Tabela, { criar, cabecalho, carregarServidor, estadoDe, salvarEstado, aoChegarServidor, fecharPop });
})(typeof globalThis !== "undefined" ? globalThis : this);
