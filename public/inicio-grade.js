/* Grade do Início em grupos: regras puras, as mesmas na página e no Worker (src/painel.js importa pelo efeito).
 *
 * Script clássico (<script src="/inicio-grade.js">): window.InicioGrade no navegador, globalThis.InicioGrade no Node.
 * Doc prefs/<email>, id "painel": { grupos: [{ id, nome, recolhido, widgets: [{ id, formato }] }], atualizado }.
 * O doc antigo ({ widgets: [...] }, lista plana) vira um grupo por tipo de widget, na ordem em que foi salvo.
 * formato é "colunas x linhas" ("1x1", "2x1", "3x1", "1x2", "2x2"); cada widget aceita só alguns (FORMATOS_DE).
 */
(function (raiz) {
  "use strict";

  const FORMATOS = ["1x1", "2x1", "3x1", "1x2", "2x2"];
  /* Formatos que fazem sentido em cada widget; o primeiro é o padrão */
  const FORMATOS_DE = {
    hoje: ["1x1"], mercado: ["1x1", "1x2"], pregao: ["2x1", "3x1", "2x2"], fiis: ["1x1", "2x1"], eua: ["1x1", "2x1"],
    listas: ["1x1", "1x2", "2x1"], favoritos: ["1x1", "1x2"], destaques: ["1x1", "1x2"], ultimas: ["1x1", "1x2"],
    "carteira-meta": ["2x1", "3x1"], "carteira-patrimonio": ["1x1", "2x1"], "carteira-proventos-mes": ["1x1"],
    "carteira-pagamentos": ["1x1", "1x2"], "carteira-agenda": ["1x1", "1x2"], "carteira-rentabilidade": ["1x1", "2x1"],
    "carteira-alertas": ["1x1", "1x2"], "carteira-simulacoes": ["1x1", "2x1"], "carteira-reinvestir": ["1x1", "2x1"], "radar-meu": ["1x1", "2x1", "2x2"], "leitura-dia": ["1x1", "1x2", "2x1"],
    "carteira-contra-filtro": ["1x1"], foruns: ["1x1", "1x2"],
    "esportes-rodada": ["1x1", "2x1"], "esportes-tabela": ["1x1", "1x2"], "esportes-meu-time": ["1x1"],
  };
  const tipoEsportes = (id) => { const m = /^esportes-(rodada|tabela)-/.exec(String(id)); return m ? "esportes-" + m[1] : null; };
  const formatosDe = (id) => FORMATOS_DE[id] || FORMATOS_DE[tipoEsportes(id)] || FORMATOS_DE[String(id).replace(/-.*$/, "")] || ["1x1"];
  const cr = (f) => { const [c, r] = String(f || "1x1").split("x").map(Number); return { c: c || 1, r: r || 1 }; };

  /* Grupos padrão, na ordem em que aparecem para quem nunca mexeu */
  const GRUPOS = [
    { id: "noticias", nome: "Notícias" }, { id: "mercado", nome: "Mercado" }, { id: "carteira", nome: "Minha carteira" },
    { id: "analises", nome: "Análises" }, { id: "foruns", nome: "Fóruns" }, { id: "esportes", nome: "Esportes" },
  ];
  const NOME_GRUPO = Object.fromEntries(GRUPOS.map((g) => [g.id, g.nome]));
  /* Grupo padrão de cada widget (o catálogo manda o mesmo valor em `grupo`) */
  function grupoDe(id) {
    id = String(id);
    if (id.startsWith("esportes-") || id === "destaques-esportes" || id === "ultimas-esportes") return "esportes";
    if (id.startsWith("foruns-")) return "foruns";
    if (id === "radar-meu" || id === "leitura-dia" || id === "carteira-contra-filtro") return "analises";
    if (id.startsWith("carteira-")) return "carteira";
    if (id === "mercado" || id === "pregao" || id === "fiis" || id === "eua" || id === "listas") return "mercado";
    return "noticias";
  }

  const ID_GRUPO = /^[a-z0-9-]{1,30}$/;
  const NOME_MAX = 30, MAX_GRUPOS = 12;
  const nomeOk = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, NOME_MAX);

  /* Lista plana ({ id, formato }) -> grupos pelo grupo padrão de cada widget, na ordem em que apareceram */
  function agrupar(lista) {
    const por = new Map();
    for (const w of lista || []) {
      const g = grupoDe(w.id);
      if (!por.has(g)) por.set(g, { id: g, nome: NOME_GRUPO[g], recolhido: false, widgets: [] });
      por.get(g).widgets.push(w);
    }
    return [...por.values()];
  }
  /* Grupos a partir do doc salvo, novo ou antigo. Não confere o catálogo: isso é com quem chama. */
  function migrar(salvo) {
    if (!salvo || typeof salvo !== "object") return null;
    if (Array.isArray(salvo.grupos)) {
      return salvo.grupos.filter((g) => g && typeof g === "object").map((g) => ({
        id: String(g.id || ""), nome: nomeOk(g.nome) || NOME_GRUPO[g.id] || "Grupo", recolhido: !!g.recolhido,
        widgets: (Array.isArray(g.widgets) ? g.widgets : []).filter((w) => w && typeof w.id === "string").map((w) => ({ id: w.id, formato: formatoDe(w.id, w) })),
      }));
    }
    if (Array.isArray(salvo.widgets)) return agrupar(salvo.widgets.filter((w) => w && typeof w.id === "string").map((w) => ({ id: w.id, formato: formatoDe(w.id, w) })));
    return null;
  }
  /* formato salvo, ou o do tamanho antigo (1 ou 2), sempre dentro do que o widget aceita */
  function formatoDe(id, w) {
    const ok = formatosDe(id);
    if (w && typeof w.formato === "string" && ok.includes(w.formato)) return w.formato;
    const quer = w && w.tamanho === 2 ? "2x1" : "1x1";
    return ok.includes(quer) ? quer : ok[0];
  }
  const plano = (grupos) => (grupos || []).flatMap((g) => g.widgets);

  /* Confere grupos vindos da página. existe(id) e liberado(id) vêm de quem chama (catálogo e seções).
     Devolve { grupos } (sem os grupos vazios) ou { erro }. */
  function validar(grupos, { existe = () => true, liberado = () => true, maxWidgets = 40 } = {}) {
    if (!Array.isArray(grupos)) return { erro: "grupos" };
    if (grupos.length > MAX_GRUPOS) return { erro: `O Início guarda até ${MAX_GRUPOS} grupos.` };
    const idsG = new Set(), idsW = new Set(), out = [];
    let total = 0;
    for (const g of grupos) {
      if (!g || typeof g !== "object" || Array.isArray(g)) return { erro: "grupo" };
      const id = typeof g.id === "string" ? g.id : "";
      if (!ID_GRUPO.test(id)) return { erro: "id de grupo: " + String(g.id).slice(0, 30) };
      if (idsG.has(id)) return { erro: `O grupo ${id} aparece duas vezes.` };
      idsG.add(id);
      if (g.nome !== undefined && typeof g.nome !== "string") return { erro: `Nome do grupo ${id}` };
      const nome = nomeOk(g.nome) || NOME_GRUPO[id];
      if (!nome) return { erro: `Dê um nome ao grupo ${id}.` };
      if (g.recolhido !== undefined && typeof g.recolhido !== "boolean") return { erro: `recolhido em ${id}: use true ou false.` };
      if (!Array.isArray(g.widgets)) return { erro: `widgets do grupo ${id}` };
      const ws = [];
      for (const w of g.widgets) {
        if (!w || typeof w !== "object") return { erro: "widget" };
        const wid = typeof w.id === "string" ? w.id : "";
        if (!existe(wid)) return { erro: `Widget desconhecido: ${String(w.id).slice(0, 40)}` };
        if (!liberado(wid)) return { erro: `Widget de seção não liberada: ${wid}` };
        if (!formatosDe(wid).includes(w.formato)) return { erro: `Formato inválido em ${wid}: use ${formatosDe(wid).join(", ")}.` };
        if (idsW.has(wid)) return { erro: `${wid} aparece duas vezes.` };
        idsW.add(wid);
        ws.push({ id: wid, formato: w.formato });
      }
      total += ws.length;
      if (total > maxWidgets) return { erro: `O painel guarda até ${maxWidgets} widgets.` };
      if (ws.length) out.push({ id, nome, recolhido: !!g.recolhido, widgets: ws });
    }
    return { grupos: out };
  }

  /* Encaixe do redimensionar: o formato permitido mais perto da célula onde a alça foi solta.
     c e r são colunas e linhas pedidas (podem ter fração); colunas é quantas a tela tem agora. */
  function encaixe(formatos, c, r, { colunas = 3, atual } = {}) {
    const lista = (formatos && formatos.length ? formatos : ["1x1"]);
    const cabe = lista.filter((f) => cr(f).c <= colunas);
    const base = cabe.length ? cabe : lista;
    let melhor = null, dm = Infinity;
    for (const f of base) {
      const x = cr(f), d = (x.c - c) ** 2 + (x.r - r) ** 2;
      const empata = Math.abs(d - dm) < 1e-9;
      if (d < dm - 1e-9 || (empata && (f === atual || (melhor !== atual && x.c * x.r < cr(melhor).c * cr(melhor).r)))) { melhor = f; dm = d; }
    }
    return melhor;
  }
  /* Shift+setas: o próximo formato na direção (dc, dr), ou o mesmo se não houver */
  function passoFormato(formatos, atual, dc, dr, { colunas = 3 } = {}) {
    const a = cr(atual);
    const cand = (formatos || []).filter((f) => f !== atual && cr(f).c <= colunas).filter((f) => {
      const x = cr(f);
      return dc ? Math.sign(x.c - a.c) === Math.sign(dc) && x.r === a.r : Math.sign(x.r - a.r) === Math.sign(dr) && x.c === a.c;
    });
    if (!cand.length) {
      /* sem um formato na mesma linha (ou coluna), aceita o mais perto na direção pedida */
      const solto = (formatos || []).filter((f) => f !== atual && cr(f).c <= colunas && (dc ? Math.sign(cr(f).c - a.c) === Math.sign(dc) : Math.sign(cr(f).r - a.r) === Math.sign(dr)));
      if (!solto.length) return atual;
      return encaixe(solto, a.c + dc, a.r + dr, { colunas });
    }
    return encaixe(cand, a.c + dc, a.r + dr, { colunas });
  }
  /* Células que um card pode ocupar a partir do canto dele: { permitidas: Set("c,r"), proibidas: Set("c,r") } até 3x2 */
  function celulas(formatos, colunas = 3) {
    const permitidas = new Set(), proibidas = new Set();
    for (const f of formatos || []) { const x = cr(f); if (x.c > colunas) continue; for (let i = 1; i <= x.c; i++) for (let j = 1; j <= x.r; j++) permitidas.add(i + "," + j); }
    for (let i = 1; i <= Math.min(3, colunas); i++) for (let j = 1; j <= 2; j++) if (!permitidas.has(i + "," + j)) proibidas.add(i + "," + j);
    return { permitidas, proibidas };
  }

  /* Move o widget id para o grupo g, antes do widget "antes" (ou no fim). Devolve grupos novos. */
  function mover(grupos, id, g, antes) {
    let w = null;
    const out = grupos.map((x) => ({ ...x, widgets: x.widgets.filter((y) => (y.id === id ? ((w = y), false) : true)) }));
    if (!w) return grupos;
    const alvo = out.find((x) => x.id === g);
    if (!alvo) return grupos;
    const k = antes ? alvo.widgets.findIndex((y) => y.id === antes) : -1;
    if (k < 0) alvo.widgets.push(w); else alvo.widgets.splice(k, 0, w);
    return out;
  }
  /* Setas do teclado: um passo para trás ou para a frente, passando para o grupo vizinho na ponta */
  function passo(grupos, id, d) {
    const gi = grupos.findIndex((g) => g.widgets.some((w) => w.id === id));
    if (gi < 0) return grupos;
    const ws = grupos[gi].widgets, k = ws.findIndex((w) => w.id === id), n = k + d;
    if (n >= 0 && n < ws.length) {
      const out = grupos.map((g) => ({ ...g, widgets: [...g.widgets] }));
      const l = out[gi].widgets; [l[k], l[n]] = [l[n], l[k]];
      return out;
    }
    const vg = gi + d;
    if (vg < 0 || vg >= grupos.length) return grupos;
    const destino = grupos[vg];
    return mover(grupos, id, destino.id, d > 0 ? (destino.widgets[0] || {}).id : null);
  }
  /* Id para um grupo novo, sem repetir */
  function novoId(grupos, base = "grupo") {
    const ids = new Set((grupos || []).map((g) => g.id));
    for (let i = 1; i < 100; i++) { const id = `${base}-${i}`; if (!ids.has(id)) return id; }
    return base + "-" + Date.now().toString(36);
  }

  raiz.InicioGrade = { FORMATOS, FORMATOS_DE, GRUPOS, NOME_GRUPO, MAX_GRUPOS, NOME_MAX, formatosDe, formatoDe, cr, grupoDe, agrupar, migrar, plano, validar, encaixe, passoFormato, celulas, mover, passo, novoId };
})(typeof window !== "undefined" ? window : globalThis);
