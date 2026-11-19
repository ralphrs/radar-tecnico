/* ArchLandscape (pedido de 19/11): as telas da aba Cloud (grade, filtros, detalhe, Admin), as de comparar das duas
 * abas (Rápida e Profunda) e as comparações profundas. Também os pedaços que a aba Tools usa (ícone com o logotipo
 * esmaecido, "Como dá para usar", "O que vem por aí" e os botões de comparar).
 *
 * Script clássico, carregado antes do script principal de index.html: aqui só há declarações. As funções usam, na
 * hora em que rodam, o que o script principal define (el, $, apiLs, esqueleto, fmtRel, archAtual, irArch, archEst,
 * escreverHash, renderLandscape, lsLista, lsCats, lsDet, carregarDetalhe, mdEl, LS). Regras puras em public/arch.js.
 */
var AC = {
  dados: null, erro: "", carregando: false, det: new Map(), detErro: new Map(), notas: new Map(), nov: new Map(),
  sel: [], aviso: "", rolagem: 0, mostrarNc: false, daGrade: false, filtros: null, cmp: new Map(), cmpErro: new Map(), novCmp: new Map(),
  prof: new Map(), profLista: null, profDoc: new Map(), rotTools: new Map(), copiado: "", aba: "rapida", folha: null, pedidos: new Set(),
};
const ARCH = () => window.Arch;

/* ---------- pedaços comuns ---------- */
/* Ícone: tenta as URLs em ordem (onerror passa para a próxima); o logotipo do Lookout esmaecido fica embaixo, do mesmo
   tamanho, enquanto carrega e quando nada vem. Sem deslocar o layout. */
function iconeEl(urls, tam, rotulo) {
  const px = tam === "g" ? 56 : tam === "p" ? 24 : tam === "m" ? 20 : 36;
  const caixa = el("span", { class: "ic" + (tam ? " ic-" + tam : ""), style: `width:${px}px;height:${px}px` });
  const logo = document.querySelector(".marca svg, header svg");
  const vazio = el("span", { class: "ic-vazio", title: "Sem ícone", role: "img", "aria-label": "Sem ícone" });
  if (logo) { const c = logo.cloneNode(true); c.removeAttribute("id"); c.setAttribute("aria-hidden", "true"); vazio.append(c); }
  caixa.append(vazio);
  const lista = (urls || []).filter(Boolean);
  if (!lista.length) return caixa;
  let k = 0;
  const img = el("img", { class: "ic-img", alt: rotulo ? "" : "", width: String(px), height: String(px), loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" });
  img.addEventListener("load", () => { if (img.naturalWidth > 1) { caixa.classList.add("ok"); vazio.removeAttribute("role"); vazio.removeAttribute("aria-label"); vazio.removeAttribute("title"); } else proxima(); });
  const proxima = () => { k++; if (k < lista.length) img.src = lista[k]; else { img.remove(); caixa.classList.remove("ok"); } };
  img.addEventListener("error", proxima);
  img.src = lista[0];
  caixa.append(img);
  return caixa;
}
/* Provedor: ícone e nome por extenso; a cor fica como detalhe (a faixa) */
function provEl(p, tam) {
  if (!p) return el("span", { class: "ac-prov" }, "provedor desconhecido");
  return el("span", { class: "ac-prov", style: "--pc:" + p.cor }, iconeEl(ARCH().iconeDe({}, p), tam || "m"), el("span", { class: "ac-prov-nome" }, p.nome));
}
const dataBR = (iso) => { const d = new Date(iso || ""); return isNaN(d) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }); };
const linkFora = (href, txt, cls) => el("a", { class: cls || "dd-btn dd-btn--outline", href, target: "_blank", rel: "noopener" }, txt);
function avisoEl(txt, erro) { return txt ? el("p", { class: "ls-aviso" + (erro ? " erro" : ""), role: "status" }, txt) : null; }
/* Markdown seguro: títulos, listas, tabelas simples, **negrito**, `código` e links http(s), tudo por nós de texto */
function mdSeguro(txt) {
  const box = el("div", { class: "ac-md" });
  const inline = (s) => {
    const out = [], re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g; let i = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > i) out.push(s.slice(i, m.index));
      if (m[1]) out.push(el("strong", {}, m[1])); else if (m[2]) out.push(el("code", {}, m[2])); else out.push(el("a", { href: m[4], target: "_blank", rel: "noopener" }, m[3]));
      i = m.index + m[0].length;
    }
    if (i < s.length) out.push(s.slice(i));
    return out;
  };
  const linhas = String(txt || "").replace(/\r/g, "").split("\n");
  let ul = null, ol = null, par = [], tab = null;
  const fechar = () => { if (par.length) { box.append(el("p", {}, ...inline(par.join(" ")))); par = []; } ul = null; ol = null; tab = null; };
  for (const l of linhas) {
    const t = l.trim();
    if (!t) { fechar(); continue; }
    let m;
    if ((m = /^(#{1,4})\s+(.*)$/.exec(t))) { fechar(); box.append(el("h" + Math.min(6, m[1].length + 2), {}, ...inline(m[2]))); continue; }
    if (/^\|.*\|$/.test(t)) {
      if (/^\|[\s:|-]+\|$/.test(t)) continue;
      if (!tab) { fechar(); tab = el("table", { class: "ac-md-tab" }); box.append(el("div", { class: "ac-rola" }, tab)); }
      const tr = el("tr");
      t.slice(1, -1).split(/(?<!\\)\|/).forEach((c) => tr.append(el(tab.rows.length ? "td" : "th", {}, ...inline(c.trim().replace(/\\\|/g, "|")))));
      tab.append(tr); continue;
    }
    if ((m = /^[-*]\s+(.*)$/.exec(t))) { if (par.length) fechar(); if (!ul) { ul = el("ul"); box.append(ul); } ul.append(el("li", {}, ...inline(m[1]))); continue; }
    if ((m = /^\d+[.)]\s+(.*)$/.exec(t))) { if (par.length) fechar(); if (!ol) { ol = el("ol"); box.append(ol); } ol.append(el("li", {}, ...inline(m[1]))); continue; }
    if (ul || ol || tab) fechar();
    par.push(t);
  }
  fechar();
  return box;
}
/* Copiar: navigator.clipboard dentro do clique; sem ele (ou se recusar), o texto fica num campo selecionado */
function botaoCopiar(rotulo, texto, id) {
  const b = el("button", { class: "dd-btn dd-btn--outline", type: "button", id }, rotulo);
  const caixa = el("div", { class: "ac-copiado", hidden: "" });
  b.addEventListener("click", () => {
    const t = typeof texto === "function" ? texto() : texto;
    const mostrar = (ok) => {
      caixa.hidden = false; caixa.textContent = "";
      const ta = el("textarea", { class: "dd-input", readonly: "", rows: "10", "aria-label": "Texto copiado" });
      ta.value = t;
      caixa.append(el("p", { class: "ls-aviso", role: "status" }, ok ? "Copiado. O texto está aqui embaixo também." : "Não deu para copiar sozinho: o texto está selecionado, é só copiar."), ta);
      if (!ok) { ta.focus(); ta.select(); }
    };
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => mostrar(true), () => mostrar(false)); else mostrar(false); }
    catch (e) { mostrar(false); }
  });
  return [b, caixa];
}

/* ---------- comparar (as duas abas) ---------- */
/* Botão "Comparar": sempre visível; esmaecido e desligado (disabled e aria-disabled) quando não dá, com o motivo ao lado */
function barraComparar(aba, selecionados, todos, aoLimpar, cats) {
  const r = ARCH().podeComparar(selecionados, todos);
  const pode = r.pode;
  const id = "ac-comparar-" + aba;
  const b = el("button", { class: "dd-btn dd-btn--primary ac-comparar", type: "button", id, "aria-describedby": id + "-motivo" }, pode ? `Comparar (${selecionados.length})` : "Comparar");
  if (!pode) { b.disabled = true; b.setAttribute("aria-disabled", "true"); }
  b.addEventListener("click", () => { if (!ARCH().podeComparar(selecionados, todos).pode) return; abrirComparar(aba, selecionados); });
  const motivo = el("span", { class: "ac-motivo", id: id + "-motivo" }, pode ? "" : r.motivo);
  const out = el("div", { class: "ac-barra-cmp" }, b, motivo);
  if (aoLimpar && selecionados.length) {
    const chip = el("button", { class: "chip ac-recorte", type: "button", id: "ac-recorte", "aria-label": "Limpar a seleção para comparar" }, "Comparando: " + (ARCH().nomeSub(cats || [], r.subcategoria || (todos.find((s) => s.id === selecionados[0]) || {}).subcategoria) || "seleção"), el("span", { "aria-hidden": "true" }, " ✕"));
    chip.addEventListener("click", aoLimpar);
    out.prepend(chip);
  }
  return out;
}
function botaoCompararCom(aba, atual, outro, nome) {
  const b = el("button", { class: "dd-btn dd-btn--ghost ac-cmp-um", type: "button", "aria-label": `Comparar com ${nome}` }, "Comparar");
  b.addEventListener("click", () => abrirComparar(aba, [atual, outro]));
  return b;
}
function abrirComparar(aba, ids) { AC.aba = "rapida"; irArch({ aba, tela: "comparar", ids: ids.slice(), profunda: false }); }

/* ---------- dados de Cloud ---------- */
async function carregarCloud(forcar) {
  if (AC.carregando || (AC.dados && !forcar)) return;
  AC.carregando = true;
  try { AC.dados = await apiLs("GET", "/api/cloud"); AC.erro = ""; if (typeof wDados !== "undefined") wDados.delete("arch-cloud"); }
  catch (e) { if (!AC.dados) AC.erro = e.message; }
  AC.carregando = false;
  if (emLandscape()) renderLandscape();
}
const umaVez = (chave, fn) => { if (AC.pedidos.has(chave)) return; AC.pedidos.add(chave); Promise.resolve().then(fn).finally(() => setTimeout(() => AC.pedidos.delete(chave), 60000)); };
const reDesenhar = () => { if (emLandscape()) renderLandscape(); };
function cloudEstadoGrade() { return { aba: "cloud", tela: "grade", filtros: AC.filtros || ARCH().FILTROS_VAZIOS() }; }
function cloudVoltarRolagem() { const y = AC.rolagem; requestAnimationFrame(() => window.scrollTo({ top: y })); }
const provs = () => (AC.dados && AC.dados.provedores) || [];
const catsCloud = () => (AC.dados && AC.dados.categorias) || [];
const servs = () => (AC.dados && AC.dados.servicos) || [];

/* ---------- roteador das telas ---------- */
function renderArchUi(box, est) {
  if (est.tela === "profundas" || est.tela === "profunda") return telaProfundas(box, est);
  if (est.tela === "comparar") return telaComparar(box, est);
  if (est.aba !== "cloud") return;
  if (!AC.dados && !AC.erro) carregarCloud();
  if (AC.erro && !AC.dados) {
    const b = el("button", { class: "dd-btn dd-btn--link", type: "button" }, "Tentar de novo");
    b.addEventListener("click", () => { AC.erro = ""; carregarCloud(true); reDesenhar(); });
    box.append(el("p", { class: "ls-vazio" }, "Não deu para carregar os serviços agora. ", b)); return;
  }
  if (!AC.dados) { box.append(cabCloud(), esqueleto(6)); return; }
  if (est.tela === "detalhe" && est.id) return telaDetalheCloud(box, est.id);
  AC.filtros = est.filtros;
  telaGradeCloud(box, est);
}
function cabCloud() {
  return el("div", { class: "ls-cab" }, el("div", {}, el("h2", {}, "Cloud"), el("p", {}, "serviços de nuvem por categoria, com o provedor de cada um")));
}

/* ---------- grade ---------- */
function telaGradeCloud(box, est) {
  const A = ARCH(), f = est.filtros;
  const mudar = (patch, foco) => {
    archEst = { ...archAtual(), filtros: { ...f, ...patch } };
    AC.filtros = archEst.filtros;
    escreverHash(false); renderLandscape();
    if (foco) { const x = $(foco); if (x) { x.focus(); if (x.setSelectionRange && typeof x.value === "string") { const n = x.value.length; try { x.setSelectionRange(n, n); } catch (e) {} } } }
  };
  const cab = cabCloud();
  const acoes = el("div", { class: "ls-acoes" });
  const agrupar = el("div", { class: "seg", role: "group", "aria-label": "Agrupar por" });
  [["categoria", "Categoria"], ["provedor", "Provedor"]].forEach(([k, t]) => { const b = el("button", { type: "button", id: "ac-por-" + k, "aria-pressed": String(f.por === k) }, t); b.addEventListener("click", () => mudar({ por: k })); agrupar.append(b); });
  acoes.append(el("span", { class: "rotulo ac-rot" }, "Agrupar por"), agrupar);
  if (AC.dados.admin) {
    const add = el("button", { class: "dd-btn dd-btn--outline", type: "button", id: "ac-adicionar" }, "Adicionar serviço");
    add.addEventListener("click", () => abrirFolhaCloud("servico", null));
    const org = el("button", { class: "dd-btn dd-btn--ghost", type: "button", id: "ac-organizar" }, "Provedores e categorias");
    org.addEventListener("click", () => abrirFolhaCloud("organizar", null));
    const prof = el("a", { class: "dd-btn dd-btn--ghost", href: "#arch/cloud/profundas", id: "ac-ver-profundas" }, "Comparações profundas");
    prof.addEventListener("click", (e) => { e.preventDefault(); irArch({ aba: "cloud", tela: "profundas" }); });
    acoes.append(add, org, prof);
  }
  cab.append(acoes);
  box.append(cab);
  if (AC.aviso) { box.append(avisoEl(AC.aviso, true)); AC.aviso = ""; }
  // filtros
  const busca = el("input", { class: "dd-input", id: "ac-busca", type: "search", placeholder: "Buscar por nome, apelido ou provedor", "aria-label": "Buscar serviço", value: f.q, autocomplete: "off" });
  let tBusca = 0;
  busca.addEventListener("input", () => { clearTimeout(tBusca); tBusca = setTimeout(() => mudar({ q: busca.value.trim() }, "ac-busca"), 250); });
  const cat = selectLs("ac-cat", "Categoria", [["", "Todas as categorias"], ...catsCloud().map((c) => [c.id, c.nome])], f.cat, (v) => mudar({ cat: v }));
  const chipLiga = (id, on, txt, titulo, fn) => { const b = el("button", { class: "chip", type: "button", id, "aria-pressed": String(on), title: titulo || "" }, txt); b.addEventListener("click", () => fn(!on)); return b; };
  box.append(el("div", { class: "ls-ferr" }, busca, cat,
    chipLiga("ac-alt", f.alt, "Só alternativas aos cinco grandes", "Provedores fora de AWS, Google Cloud, Azure, Oracle e Cloudflare", (v) => mudar({ alt: v }, "ac-alt")),
    chipLiga("ac-gratis", f.gratis, "Tem plano grátis", "", (v) => mudar({ gratis: v }, "ac-gratis"))));
  if (f.alt) box.append(el("p", { class: "ls-aviso", id: "ac-alt-nota" }, "Só provedores fora de AWS, Google Cloud, Azure, Oracle e Cloudflare."));
  const chips = el("div", { class: "chips ac-provs", role: "group", "aria-label": "Filtrar por provedor" });
  const baseSemProv = A.filtrarCloud(servs(), { ...f, provs: [] }, provs());
  for (const p of provs()) {
    const n = baseSemProv.filter((s) => s.provedor === p.id).length;
    if (!servs().some((s) => s.provedor === p.id)) continue;
    const on = f.provs.includes(p.id);
    const b = el("button", { class: "chip ac-chip-prov", type: "button", id: "ac-p-" + p.id, "aria-pressed": String(on), style: estiloProv(p) }, iconeEl(A.iconeDe({}, p), "m"), el("span", { class: "lg" }, p.nome), el("span", { class: "k" }, String(n)));
    b.addEventListener("click", () => mudar({ provs: on ? f.provs.filter((x) => x !== p.id) : f.provs.concat(p.id) }, "ac-p-" + p.id));
    chips.append(b);
  }
  box.append(el("div", { class: "ls-ferr" }, chips));
  // comparar: o recorte, o botão e o motivo
  AC.sel = AC.sel.filter((id) => servs().some((s) => s.id === id));
  const limpar = () => { AC.sel = []; renderLandscape(); };
  box.append(barraComparar("cloud", AC.sel, servs(), limpar, catsCloud()));
  // conteúdo
  const l = A.filtrarCloud(servs(), f, provs());
  const conteudo = el("div", { id: "ac-conteudo", class: AC.sel.length ? "ac-recortando" : "" });
  box.append(conteudo);
  if (!servs().length) { conteudo.append(el("p", { class: "ls-vazio" }, "Nenhum serviço no catálogo ainda.")); return; }
  if (!l.length) { conteudo.append(el("p", { class: "ls-vazio" }, "Nenhum serviço com esses filtros.")); return; }
  conteudo.append(el("p", { class: "ls-aviso ac-conta" }, `${l.length} ${l.length === 1 ? "serviço" : "serviços"}`));
  const grupos = A.agrupar(l, f.por, catsCloud(), provs());
  const cats = el("div", { class: "ls-cats-col" });
  if (f.por === "provedor") {
    for (const g of grupos) {
      const n = g.cats.reduce((k, c) => k + c.itens.length, 0);
      cats.append(el("section", { class: "ls-cat ac-bloco-prov", "aria-label": g.prov.nome, style: "--pc:" + g.prov.cor }, el("h3", {}, provEl(g.prov, "p"), el("span", { class: "k" }, String(n))),
        ...g.cats.map((c) => el("div", { class: "ls-sub" }, el("h4", {}, c.nome), el("div", { class: "ac-grade" }, ...c.itens.map((x) => cartaoCloud(x, true)))))));
    }
  } else {
    for (const c of grupos) {
      const n = c.subs.reduce((k, s) => k + s.itens.length, 0);
      cats.append(el("section", { class: "ls-cat", "aria-label": c.nome }, el("h3", {}, c.nome, el("span", { class: "k" }, String(n))),
        ...c.subs.map((s) => el("div", { class: "ls-sub ac-sub" }, el("h4", {}, s.nome), el("div", { class: "ac-grade" }, ...s.itens.map((x) => cartaoCloud(x, !!f.q)))))));
    }
  }
  conteudo.append(el("div", { class: "ls-cats ac-cats" }, cats));
  larguraDoCartao(conteudo);
}
/* O nome do serviço cabe sempre em uma linha (pedido de 19/11, 16h48): a largura mínima do cartão é a do maior nome do
   catálogo inteiro, medida uma vez no navegador com o cartão de verdade, e vale para todos (variável --ac-w). */
let acLargura = { chave: "", px: 0 };
function larguraDoCartao(conteudo, depois) {
  // a grade é montada fora da página: a medida só existe depois de entrar no documento
  if (!conteudo.isConnected) { if (!depois) requestAnimationFrame(() => larguraDoCartao(conteudo, true)); return; }
  const todos = servs();
  const chave = todos.length + "|" + todos.reduce((k, s) => k + s.nome.length, 0);
  if (acLargura.chave !== chave || !acLargura.px) {
    const A = ARCH(), curto = (s) => A.nomeCurto(s.nome, A.provDe(provs(), s.provedor) || s.provedor).length;
    const maiores = todos.slice().sort((x, y) => curto(y) - curto(x)).slice(0, 6);
    const prova = el("div", { style: "position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;display:flex;flex-direction:column;align-items:flex-start", "aria-hidden": "true" },
      ...maiores.map((s) => { const c = cartaoCloud(s, false); c.removeAttribute("id"); c.style.width = "max-content"; c.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id")); return c; }));
    conteudo.append(prova);
    let px = 0;
    for (const c of prova.children) px = Math.max(px, Math.ceil(c.getBoundingClientRect().width));
    prova.remove();
    if (px > 0) acLargura = { chave, px: px + 2 };
  }
  if (acLargura.px) conteudo.style.setProperty("--ac-w", acLargura.px + "px");
}
/* Cartão compacto (pedido de 19/11, 16h31): o ícone do provedor (o nome dele só na dica: title, aria-label e um balão
   que abre no passar do mouse, no foco do teclado e no toque), o nome do serviço (sempre em uma linha, inteiro no title), a
   subcategoria numa linha pequena quando a grade não está agrupada por ela (por provedor ou com busca) e a caixa
   Comparar sem texto ao lado. O resumo fica no detalhe. */
// Cor do provedor (até três): --pc é a principal, --pgh a faixa do contorno do chip e --pgv a da lateral do cartão
function estiloProv(p) {
  const A = ARCH(), cores = A.coresDe(p || {});
  return `--pc:${cores[0]};--pgh:${A.faixaCores(cores, "direita")};--pgv:${A.faixaCores(cores, "baixo")}`;
}
function cartaoCloud(s, comSub) {
  const A = ARCH();
  const p = A.provDe(provs(), s.provedor);
  const m = A.marcavel(s.id, AC.sel, servs(), catsCloud());
  const marcado = AC.sel.includes(s.id);
  const cx = el("input", { type: "checkbox", id: "ac-x-" + s.id, "aria-label": "Comparar " + s.nome + (m.ok ? "" : ". " + m.motivo) });
  cx.checked = marcado;
  if (!m.ok) { cx.disabled = true; cx.title = m.motivo; }
  cx.addEventListener("change", () => {
    if (cx.checked) { if (A.marcavel(s.id, AC.sel, servs(), catsCloud()).ok) AC.sel = AC.sel.concat(s.id); }
    else AC.sel = AC.sel.filter((x) => x !== s.id);
    const y = window.scrollY; renderLandscape(); window.scrollTo({ top: y }); const n = $("ac-x-" + s.id); if (n) n.focus();
  });
  const a = el("a", { class: "ac-nome", href: "#arch/cloud/" + encodeURIComponent(s.id), title: s.nome, "aria-label": s.nome }, A.nomeCurto(s.nome, p || s.provedor));
  a.addEventListener("click", (e) => abrirServico(s.id, e));
  const fora = AC.sel.length && !marcado && !m.ok;
  const sub = comSub ? nomeSubCloud(s) : "";
  return el("article", { class: "ac-card" + (marcado ? " marcado" : "") + (fora ? " fora" : ""), id: "ac-c-" + s.id, style: estiloProv(p) },
    dicaProvedor(p), el("div", { class: "ac-meio" }, a, sub ? el("span", { class: "ac-sub-lin", title: sub }, sub) : null),
    el("label", { class: "ac-cx", title: m.ok ? "Comparar" : m.motivo }, cx));
}
const nomeSubCloud = (s) => { for (const c of catsCloud()) for (const x of c.subcategorias || c.subs || []) if (x.id === s.subcategoria && (!s.categoria || c.id === s.categoria)) return x.nome; return ""; };
/* ícone do provedor com o nome numa dica: botão de verdade (foco e toque), sem texto escrito; sem ícone, o logotipo do
   Lookout esmaecido com a mesma dica */
function dicaProvedor(p) {
  const nome = p ? p.nome : "Provedor desconhecido";
  const b = el("button", { type: "button", class: "ac-dica", title: nome, "aria-label": "Provedor: " + nome, "data-dica": nome }, iconeEl(p ? ARCH().iconeDe({}, p) : [], "m"));
  b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); const ab = !b.classList.contains("aberta"); document.querySelectorAll(".ac-dica.aberta").forEach((x) => x.classList.remove("aberta")); b.classList.toggle("aberta", ab); });
  b.addEventListener("blur", () => b.classList.remove("aberta"));
  return b;
}
function abrirServico(id, e) {
  if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) return;
  if (e) e.preventDefault();
  const est = archAtual();
  AC.daGrade = est.tela === "grade";
  if (AC.daGrade) AC.rolagem = window.scrollY;
  irArch({ aba: "cloud", tela: "detalhe", id });
}

/* ---------- detalhe ---------- */
async function carregarServico(id) {
  try { const j = await apiLs("GET", "/api/cloud/" + encodeURIComponent(id)); AC.det.set(id, j); AC.detErro.delete(id); }
  catch (e) { AC.detErro.set(id, e.status === 404 ? "Esse serviço não está mais no catálogo." : e.message); }
  reDesenhar();
}
function voltarParaGrade(aba) {
  return (e) => {
    if (e) e.preventDefault();
    if (aba === "cloud" && AC.daGrade && history.length > 1) { history.back(); return; }
    irArch(aba === "cloud" ? cloudEstadoGrade() : { aba, tela: "grade" });
  };
}
function telaDetalheCloud(box, id) {
  const A = ARCH();
  const volta = el("a", { class: "dd-btn dd-btn--link ls-volta", href: A.escreverHash(cloudEstadoGrade()), id: "ac-voltar" }, "← Cloud");
  volta.addEventListener("click", voltarParaGrade("cloud"));
  box.append(volta);
  const d = AC.det.get(id);
  if (!d) {
    const erro = AC.detErro.get(id);
    if (erro) { box.append(el("p", { class: "ls-vazio" }, erro)); return; }
    umaVez("d:" + id, () => carregarServico(id));
    const leve = servs().find((x) => x.id === id);
    box.append(el("div", { class: "ls-topo" }, iconeEl([], "g"), el("div", {}, el("h2", {}, leve ? leve.nome : id))), esqueleto(6));
    return;
  }
  const s = d.servico, p = d.provedor;
  document.title = s.nome + " · ArchLandscape · Lookout";
  const cat = (catsCloud().find((c) => c.id === s.categoria) || {}).nome || s.categoria;
  const sub = A.nomeSub(catsCloud(), s.subcategoria);
  const lk = s.links || {};
  const botoes = el("div", { class: "ls-botoes" }, lk.produto ? linkFora(lk.produto, "Produto") : null, lk.docs ? linkFora(lk.docs, "Documentação") : null,
    (lk.status || (p && p.status)) ? linkFora(lk.status || p.status, "Status") : null);
  const conf = A.conferidoDe(s);
  const topo = el("div", { class: "ls-topo ac-topo", style: "--pc:" + (p ? p.cor : "#888") }, iconeEl(A.iconeDe(s, p), "g"),
    el("div", {}, el("div", { class: "ac-de" }, provEl(p, "p"), p && p.tipo === "alternativa" ? el("span", { class: "dd-badge b-noticia" }, "alternativa") : null), el("h2", {}, s.nome),
      s.apelidos && s.apelidos.length ? el("span", { class: "ls-repo" }, "também chamado de " + s.apelidos.join(", ")) : null),
    el("div", { class: "ls-chips" }, el("span", { class: "dd-badge b-clube" }, cat + (sub ? " › " + sub : "")), s.gratis ? el("span", { class: "dd-badge b-novo" }, "plano grátis") : null,
      el("span", { class: "dd-badge " + (conf.em ? "b-release" : "b-review"), id: "ac-conferido" }, conf.em ? "conferido em " + dataBR(conf.em) : "ainda não conferido")),
    s.resumo ? el("p", { class: "ls-desc" }, s.resumo) : null, botoes);
  box.append(topo);
  if (d.admin) box.append(acoesAdminServico(s));
  const blocos = el("div", { class: "ls-blocos" });
  // como cobra (modelo de cobrança, sem valor) e plano grátis
  blocos.append(blocoCapacidades(s));
  blocos.append(el("section", { class: "ls-bloco" }, el("h3", {}, "Como cobra"), el("p", {}, s.cobranca || "não conferido"),
    el("h4", {}, "Plano grátis"), el("p", {}, s.gratis || "não conferido")));
  if (s.destaques && s.destaques.length) blocos.append(el("section", { class: "ls-bloco" }, el("h3", {}, "Destaques"), el("ul", { class: "ac-lista" }, ...s.destaques.map((x) => el("li", {}, x)))));
  blocos.append(blocoUso(s), blocoEquivalentes(d), blocoNovidadesCloud(s), blocoNoticiasCloud(d.noticias, false), blocoNoticiasCloud(d.foruns, true), blocoNotasCloud(s));
  box.append(blocos);
}
/* Capacidades: a matriz da subcategoria (Arch.chavesDe), na ordem da tabela, com a fonte e a data de cada valor */
function fonteCapEl(c) {
  if (!c || !c.fonte) return null;
  const d = ARCH().dominioDe(c.fonte);
  return el("small", { class: "ac-fonte" }, linkFora(c.fonte, d ? "fonte: " + d.replace(/^www\./, "") : "fonte", "ac-link"), c.em ? " · " + dataBR(c.em) : "");
}
function blocoCapacidades(s) {
  const A = ARCH();
  const chaves = A.chavesDe(s.subcategoria);
  const conf = A.conferidoDe(s);
  const dl = el("dl", { class: "ac-carac ac-caps" });
  for (const k of chaves) {
    const c = A.carac(s.atributos && s.atributos[k.k]);
    dl.append(el("dt", {}, k.r), el("dd", { class: c ? "" : "nc" }, el("span", {}, A.textoCarac(c, k)), fonteCapEl(c)));
  }
  return el("section", { class: "ls-bloco ac-bloco-caps", "aria-labelledby": "ac-h-car", id: "ac-capacidades" },
    el("h3", { id: "ac-h-car" }, "Capacidades", el("small", {}, conf.n + " de " + conf.total + " conferidas")),
    conf.em ? el("p", { class: "ls-pe", id: "ac-caps-conferido" }, "Conferido em " + dataBR(conf.em) + ", na documentação oficial de cada linha.") : el("p", { class: "ls-aviso" }, "Nenhuma capacidade conferida ainda."),
    dl);
}
/* Como dá para usar (Tools e Cloud): as etiquetas, as três respostas e a nota */
function blocoUso(t) {
  const u = LS.usoDe(t);
  const sec = el("section", { class: "ls-bloco", "aria-labelledby": "ls-h-uso", id: "ls-uso" }, el("h3", { id: "ls-h-uso" }, "Como dá para usar", LS.resumoDeUso(t) ? el("small", {}, LS.resumoDeUso(t)) : null));
  sec.append(u.length ? el("div", { class: "ls-chips" }, ...LS.USOS.filter((x) => u.includes(x.id)).map((x) => el("span", { class: "dd-badge b-clube", title: x.explicacao }, x.rotulo))) : el("p", { class: "ls-aviso" }, "Opções de uso ainda não conferidas."));
  const onp = window.Arch.carac(t.atributos && t.atributos.on_premises);
  /* Cloud: "nuvem" é a definição; sem a característica on_premises, fora da nuvem fica "não conferido", não "não" */
  const resp = (q) => (t.provedor && q.id !== "nuvem" && q.resposta === "não" && !onp ? "não conferido" : q.resposta);
  sec.append(el("dl", { class: "ac-carac" }, ...LS.perguntasDeUso(t).flatMap((q) => [el("dt", {}, q.pergunta), el("dd", { class: resp(q) === "não conferido" ? "nc" : "" }, resp(q))])));
  if (onp) sec.append(el("p", {}, "Fora da nuvem do provedor: " + onp.valor));
  if (t.uso_nota) sec.append(el("p", { class: "ls-aviso" }, t.uso_nota));
  return sec;
}
function blocoEquivalentes(d) {
  const A = ARCH(), s = d.servico;
  const eq = d.equivalentes || [];
  const sec = el("section", { class: "ls-bloco", "aria-labelledby": "ac-h-eq", id: "ac-equivalentes" }, el("h3", { id: "ac-h-eq" }, "O mesmo em outros provedores", el("small", {}, A.nomeSub(catsCloud(), s.subcategoria))));
  if (!eq.length) sec.append(el("p", { class: "ls-aviso" }, "Nenhum concorrente cadastrado"));
  else sec.append(el("ul", { class: "ls-lista ac-eq" }, ...eq.map((x) => {
    const a = el("a", { href: "#arch/cloud/" + encodeURIComponent(x.id) }, x.nome);
    a.addEventListener("click", (e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); AC.daGrade = false; irArch({ aba: "cloud", tela: "detalhe", id: x.id }); });
    return el("li", {}, el("div", { class: "ls-rel" }, provEl(A.provDe(provs(), x.provedor), "p"), a), botaoCompararCom("cloud", s.id, x.id, x.nome));
  })));
  /* o botão geral compara este com os primeiros concorrentes (até 4 no total); sem concorrente, esmaecido */
  sec.append(barraComparar("cloud", [s.id, ...eq.slice(0, 3).map((x) => x.id)], [s, ...eq]));
  return sec;
}
function blocoNovidadesCloud(s) {
  const sec = el("section", { class: "ls-bloco", "aria-labelledby": "ac-h-nov", id: "ac-novidades", "aria-busy": "true" }, el("h3", { id: "ac-h-nov" }, "Novidades"));
  const n = AC.nov.get(s.id);
  if (!n) { umaVez("n:" + s.id, async () => { try { AC.nov.set(s.id, await apiLs("GET", "/api/cloud/" + encodeURIComponent(s.id) + "/novidades")); } catch (e) { AC.nov.set(s.id, { itens: [], erro: true }); } reDesenhar(); }); sec.append(esqueleto(3)); return el("div", { class: "ac-dois" }, sec); }
  sec.removeAttribute("aria-busy");
  const link = n.link ? linkFora(n.link, "Novidades no site do provedor", "ac-link") : null;
  if (n.itens && n.itens.length) {
    sec.append(el("ul", { class: "ls-lista" }, ...n.itens.map((i) => el("li", {}, el("a", { href: i.url, target: "_blank", rel: "noopener" }, i.titulo), el("div", { class: "n" }, el("span", {}, dataBR(i.publicado)), i.tipo ? el("span", {}, i.tipo) : null, i.anuncio ? el("span", { class: "dd-badge b-review" }, i.anuncio) : null)))));
    sec.append(el("p", { class: "ls-pe" }, "feed oficial · " + (n.lido ? "lido " + fmtRel(n.lido) : "") + (n.de === "cache" ? " (guardado)" : ""), " · ", link));
  } else sec.append(el("p", { class: "ls-aviso" }, n.temFeed ? "Nada sobre este serviço no feed do provedor agora. " : "O feed de novidades deste provedor ainda não foi confirmado. ", link));
  const vem = el("section", { class: "ls-bloco", "aria-labelledby": "ac-h-vem", id: "ac-vem" }, el("h3", { id: "ac-h-vem" }, "O que vem por aí"));
  if (n.roteiro && n.roteiro.length) vem.append(el("ul", { class: "ls-lista" }, ...n.roteiro.map((r) => el("li", {}, r.fonte ? el("a", { href: r.fonte, target: "_blank", rel: "noopener" }, r.titulo) : r.titulo, el("div", { class: "n" }, r.estado ? el("span", { class: "dd-badge b-review" }, r.estado) : null, r.quando ? el("span", {}, r.quando) : null, r.em ? el("span", {}, "visto em " + dataBR(r.em)) : null)))));
  else vem.append(el("p", { class: "ls-aviso" }, "Nada anunciado nas fontes que o Lookout lê."));
  vem.append(el("p", { class: "ls-pe" }, "Planos mudam: confira na fonte."));
  return el("div", { class: "ac-dois" }, sec, vem);
}
function blocoNoticiasCloud(lista, forum) {
  const id = forum ? "ac-h-for" : "ac-h-not";
  const sec = el("section", { class: "ls-bloco", "aria-labelledby": id }, el("h3", { id }, forum ? "Nos fóruns" : "Notícias", el("small", {}, forum ? "últimos 7 dias" : "o que o Lookout publicou")));
  if (!lista || !lista.length) { sec.append(el("p", { class: "ls-aviso" }, forum ? "Nenhum post citando este serviço nos fóruns que o Lookout lê." : "Nenhuma notícia do Lookout cita este serviço ainda.")); return sec; }
  sec.append(el("ul", { class: "ls-lista" }, ...lista.map((n) => el("li", {}, el("a", { href: n.url, target: "_blank", rel: "noopener" }, (typeof trLigada !== "undefined" && trLigada && n.titulo_pt) || n.titulo), el("div", { class: "n" }, n.fonte ? el("span", {}, n.fonte) : n.sub ? el("span", {}, "r/" + n.sub) : null, el("span", {}, fmtRel(n.coletado || n.publicado)))))));
  return sec;
}
function blocoNotasCloud(s) {
  const sec = el("section", { class: "ls-bloco", "aria-labelledby": "ac-h-notas" }, el("h3", { id: "ac-h-notas" }, "Minhas notas", el("small", {}, "só você vê")));
  const n = AC.notas.get(s.id);
  if (n === undefined) { umaVez("nt:" + s.id, async () => { try { AC.notas.set(s.id, (await apiLs("GET", "/api/cloud/" + encodeURIComponent(s.id) + "/notas")).notas || {}); } catch (e) { AC.notas.set(s.id, {}); } reDesenhar(); }); sec.append(esqueleto(2)); return sec; }
  const sit = selectLs("ac-n-sit", "Situação", [["", "Sem situação"], ...LS.SITUACOES.map((x) => [x.id, x.nome])], n.situacao || "", () => {});
  const nota = el("textarea", { class: "dd-input", id: "ac-n-nota", maxlength: "2000", placeholder: "o que você achou, onde usaria", "aria-label": "Nota" }); nota.value = n.nota || "";
  const link = el("input", { class: "dd-input", id: "ac-n-link", type: "url", placeholder: "https:// (opcional)", value: n.link || "", "aria-label": "Link" });
  const msg = el("span", { class: "ls-aviso", role: "status" });
  const salvar = el("button", { class: "dd-btn dd-btn--outline", type: "button", id: "ac-n-salvar" }, "Salvar nota");
  salvar.addEventListener("click", async () => {
    salvar.disabled = true; msg.textContent = "";
    try { const j = await apiLs("PUT", "/api/cloud/" + encodeURIComponent(s.id) + "/notas", { situacao: sit.value, nota: nota.value, link: link.value.trim() }); AC.notas.set(s.id, j.notas || {}); msg.textContent = "Salvo."; }
    catch (e) { msg.textContent = e.message; msg.classList.add("erro"); }
    salvar.disabled = false;
  });
  sec.append(el("div", { class: "ls-nota-form" }, el("div", { class: "linha" }, sit), nota, link, el("div", { class: "linha" }, salvar, msg)));
  return sec;
}

/* ---------- Tools: o que vem por aí (milestones, sob demanda) ---------- */
function blocoRoteiroTools(t) {
  const sec = el("section", { class: "ls-bloco", "aria-labelledby": "ls-h-vem", id: "ls-vem" }, el("h3", { id: "ls-h-vem" }, "O que vem por aí", el("small", {}, "milestones abertos")));
  const r = AC.rotTools.get(t.id);
  if (!r) { umaVez("r:" + t.id, async () => { try { AC.rotTools.set(t.id, await apiLs("GET", "/api/landscape/" + encodeURIComponent(t.id) + "/roteiro")); } catch (e) { AC.rotTools.set(t.id, { itens: [], link: "https://github.com/" + t.repo + "/milestones" }); } if (lsId === t.id) renderLandscape(); }); sec.append(esqueleto(2)); return sec; }
  if (r.itens && r.itens.length) sec.append(el("ul", { class: "ls-lista" }, ...r.itens.map((i) => el("li", {}, i.fonte ? el("a", { href: i.fonte, target: "_blank", rel: "noopener" }, i.titulo) : i.titulo,
    el("div", { class: "n" }, el("span", {}, i.manual ? "anotado" : "milestone"), i.quando ? el("span", {}, "previsto para " + i.quando) : null, i.abertas != null ? el("span", {}, `${i.abertas} abertas · ${i.fechadas || 0} fechadas`) : null, i.em ? el("span", {}, "visto em " + dataBR(i.em)) : null)))));
  else sec.append(el("p", { class: "ls-aviso" }, r.semToken ? "Sem o token do GitHub, os milestones ficam no site: " : "Nenhum milestone aberto. ", linkFora(r.link, "Milestones no GitHub", "ac-link")));
  sec.append(el("p", { class: "ls-pe" }, "Planos mudam: confira na fonte."));
  return sec;
}

/* ---------- tela de comparação (as duas abas) ---------- */
function carregarComparacao(aba, ids) {
  const k = aba + ":" + ARCH().conjunto(ids);
  if (aba === "cloud") {
    umaVez("c:" + k, async () => { try { AC.cmp.set(k, await apiLs("GET", "/api/cloud/comparar?ids=" + ids.map(encodeURIComponent).join(","))); } catch (e) { AC.cmpErro.set(k, e.message); } reDesenhar(); });
    umaVez("cn:" + k, async () => { try { AC.novCmp.set(k, (await apiLs("GET", "/api/cloud/novidades?ids=" + ids.map(encodeURIComponent).join(","))).porId || {}); } catch (e) { AC.novCmp.set(k, {}); } reDesenhar(); });
  } else {
    for (const id of ids) if (!lsDet.get(id)) umaVez("td:" + id, () => carregarDetalhe(id).then(reDesenhar));
    umaVez("tr:" + k, async () => {
      const out = {};
      for (const id of ids) { try { out[id] = (await apiLs("GET", "/api/landscape/" + encodeURIComponent(id) + "/roteiro")).itens || []; } catch (e) { out[id] = []; } }
      AC.novCmp.set(k, out); reDesenhar();
    });
  }
  if (lsAdmin || (AC.dados && AC.dados.admin)) carregarProfunda(aba, ids);
}
function carregarProfunda(aba, ids, forcar) {
  const k = aba + ":" + ARCH().conjunto(ids);
  if (forcar) { AC.pedidos.delete("p:" + k); AC.prof.delete(k); }
  umaVez("p:" + k, async () => { try { AC.prof.set(k, await apiLs("GET", "/api/admin/arch/dossies?aba=" + aba + "&ids=" + ids.map(encodeURIComponent).join(","))); } catch (e) { AC.prof.set(k, { erro: e.message }); } reDesenhar(); });
}
function telaComparar(box, est) {
  const A = ARCH(), aba = est.aba, ids = est.ids || [];
  // o catálogo da aba, para a regra (mesma subcategoria, 2 a 4, ids que existem)
  const catalogo = aba === "cloud" ? (AC.dados ? servs() : null) : lsLista;
  if (!catalogo) { if (aba === "cloud") carregarCloud(); else carregarLandscape(); box.append(esqueleto(6)); return; }
  const pode = A.podeComparar(ids, catalogo);
  if (!pode.pode) {
    // hash inválido: volta para a grade, com o aviso do motivo
    AC.aviso = "Não dá para abrir essa comparação: " + pode.motivo + ".";
    archEst = aba === "cloud" ? cloudEstadoGrade() : { aba, tela: "grade" }; lsId = null;
    escreverHash(false);
    if (aba === "cloud") { box.textContent = ""; box.append(archAbasEl()); renderArchUi(box, archEst); }
    else { setTimeout(() => { if (typeof lsAviso !== "undefined") lsAviso = AC.aviso; AC.aviso = ""; renderLandscape(); }, 0); }
    return;
  }
  const k = aba + ":" + A.conjunto(ids);
  const voltar = el("a", { class: "dd-btn dd-btn--link ls-volta", href: aba === "cloud" ? A.escreverHash(cloudEstadoGrade()) : "#arch/tools", id: "ac-cmp-voltar" }, aba === "cloud" ? "← Cloud" : "← Tools");
  voltar.addEventListener("click", (e) => { e.preventDefault(); if (history.length > 1) history.back(); else irArch(aba === "cloud" ? cloudEstadoGrade() : { aba, tela: "grade" }); });
  const sub = aba === "cloud" ? A.nomeSub(catsCloud(), pode.subcategoria) : (typeof nomeCat === "function" ? nomeCat((lsLista.find((t) => t.id === ids[0]) || {}).categoria, pode.subcategoria).s : pode.subcategoria);
  document.title = "Comparar " + sub + " · ArchLandscape · Lookout";
  carregarComparacao(aba, ids);
  const prof = AC.prof.get(k);
  const pronta = prof && prof.pronta;
  const abas = el("div", { class: "seg ac-abas-cmp", role: "group", "aria-label": "Tipo de comparação" });
  [["rapida", "Rápida"], ["profunda", "Profunda"]].forEach(([t, n]) => {
    const on = (est.profunda ? "profunda" : "rapida") === t;
    const b = el("button", { type: "button", id: "ac-cmp-" + t, "aria-pressed": String(on) }, n);
    b.addEventListener("click", () => { if (on) return; archEst = { ...archAtual(), profunda: t === "profunda" }; escreverHash(false); renderLandscape(); });
    abas.append(b);
  });
  box.append(voltar, el("div", { class: "ls-cab" }, el("div", {}, el("h2", {}, "Comparar " + sub), el("p", {}, ids.length + " " + (aba === "cloud" ? "serviços" : "tecnologias") + " da mesma subcategoria")),
    el("div", { class: "ls-acoes" }, abas, pronta ? el("span", { class: "dd-badge b-release", id: "ac-selo-profunda" }, "análise profunda pronta") : null)));
  if (est.profunda) return abaProfunda(box, aba, ids, pode.subcategoria, k);
  // Rápida: a tabela com o que o Lookout tem agora
  let docs;
  if (aba === "cloud") {
    const c = AC.cmp.get(k);
    if (!c) { const e = AC.cmpErro.get(k); box.append(e ? el("p", { class: "ls-vazio" }, e) : esqueleto(8)); return; }
    docs = ids.map((id) => c.servicos.find((s) => s.id === id)).filter(Boolean);
  } else {
    docs = ids.map((id) => (lsDet.get(id) ? { ...lsDet.get(id).tec, id } : null));
    if (docs.some((x) => !x)) { box.append(esqueleto(8)); return; }
  }
  const extra = AC.novCmp.get(k);
  const comp = A.montarComparacao(docs, aba === "cloud"
    ? { aba, provs: provs(), novidades: extra ? Object.fromEntries(Object.entries(extra).map(([id, x]) => [id, x.itens || []])) : null, roteiro: extra ? Object.fromEntries(Object.entries(extra).map(([id, x]) => [id, x.roteiro || []])) : null }
    : { aba, roteiro: extra || null });
  const tab = el("table", { class: "ac-tab", id: "ac-tab" });
  const cab = el("tr", {}, el("th", { scope: "col", class: "ac-tab-rot" }, el("span", { class: "ls-sr" }, "Característica")));
  comp.colunas.forEach((c, i) => {
    const d = docs[i];
    const ic = aba === "cloud" ? provEl(A.provDe(provs(), d.provedor), "p") : el("span", { class: "ac-prov" }, marcaEl(d, "p"), el("span", { class: "ac-prov-nome" }, d.repo));
    const a = el("a", { href: "#arch/" + aba + "/" + encodeURIComponent(c.id) }, c.nome);
    cab.append(el("th", { scope: "col", style: c.provedor ? "--pc:" + c.provedor.cor : "" }, ic, a));
  });
  tab.append(el("thead", {}, cab));
  const corpo = el("tbody");
  // Cloud: a matriz da subcategoria; linha em que ninguém tem valor fica atrás de "Mostrar não conferidas"
  const vazias = comp.linhas.filter((l) => l.vazia).length;
  const celula = (c, i, l) => {
    const f = l.fontes && l.fontes[i];
    if (!c) return el("td", { class: "nc" }, l.carac ? "não conferido" : "–");
    return el("td", {}, el("span", {}, c), f ? fonteCapEl(f) : null);
  };
  for (const l of comp.linhas) {
    if (l.vazia && !AC.mostrarNc) continue;
    corpo.append(el("tr", { class: (l.diferente ? "dif" : "") + (l.vazia ? " vazia" : "") }, el("th", { scope: "row" }, l.rotulo, l.diferente ? el("span", { class: "ls-sr" }, " (valores diferentes)") : null), ...l.celulas.map((c, i) => celula(c, i, l))));
  }
  const rot = { produto: "Produto", docs: "Docs", status: "Status", repositorio: "Repositório", site: "Site" };
  corpo.append(el("tr", {}, el("th", { scope: "row" }, "Links"), ...comp.links.map((lk) => el("td", {}, ...Object.entries(lk).filter(([kk, u]) => u && rot[kk]).map(([kk, u]) => el("span", { class: "ac-lk" }, linkFora(u, rot[kk], "ac-link")))))));
  tab.append(corpo);
  if (comp.resumoCaps) {
    const rc = comp.resumoCaps;
    const tg = el("button", { class: "chip", type: "button", id: "ac-mostrar-nc", "aria-pressed": String(!!AC.mostrarNc) }, AC.mostrarNc ? "Esconder não conferidas" : "Mostrar não conferidas" + (vazias ? " (" + vazias + ")" : ""));
    if (!vazias) { tg.disabled = true; tg.setAttribute("aria-disabled", "true"); }
    tg.addEventListener("click", () => { AC.mostrarNc = !AC.mostrarNc; reDesenhar(); const n = $("ac-mostrar-nc"); if (n) n.focus(); });
    box.append(el("div", { class: "ac-resumo-caps", id: "ac-resumo-caps" }, el("p", {}, el("strong", {}, rc.conferidas + " de " + rc.total), " capacidades conferidas"), tg));
  }
  box.append(el("div", { class: "ac-rola ac-rola-tab", tabindex: "0", role: "region", "aria-label": "Tabela de comparação" }, tab));
  box.append(el("p", { class: "ls-pe" }, "Só fatos guardados e fontes oficiais: sem nota, sem vencedor e sem preço. Células com fundo diferente têm valores diferentes. ", extra ? "" : "Novidades ainda carregando."));
  const [copiar, caixa] = botaoCopiar("Copiar para ADR", () => A.markdownAdr(comp, {}), "ac-copiar-adr");
  box.append(el("div", { class: "ls-acoes" }, copiar), caixa);
}
/* Profunda: o dossiê (collection arch-dossies) com outro nome na tela. Um doc por conjunto de alternativas.
   Pronta vale 30 dias (Arch.estadoDaAnalise). Vencida: a página pede de novo sozinha ao abrir (o mesmo doc volta a
   pendente e a análise antiga continua na tela). Dentro da validade, "Atualizar análise" pede de novo (forcar), com
   confirmação na própria página. */
function abaProfunda(box, aba, ids, sub, k) {
  box.append(el("p", { class: "ac-aviso-ia", role: "note" }, "Análise gerada por IA a partir das fontes listadas. Confira antes de decidir."));
  const admin = aba === "cloud" ? AC.dados && AC.dados.admin : lsAdmin;
  if (!admin) { box.append(el("p", { class: "ls-aviso" }, "A comparação profunda é pedida e lida pelo Admin do Lookout.")); return; }
  const p = AC.prof.get(k);
  if (!p) { box.append(esqueleto(5)); return; }
  if (p.erro) { box.append(avisoEl(p.erro, true)); return; }
  const pedir = async (corpo) => { await apiLs("POST", "/api/admin/arch/dossies", { aba, ids, ...corpo }); AC.profLista = null; carregarProfunda(aba, ids, true); };
  const quando = (iso) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  // vencida: pede de novo sozinha, uma vez (a rota devolve o pendente se já houver)
  if (p.vencida && !p.pendente && !p.pronta) umaVez("pv:" + k, () => pedir({}).catch((e) => { AC.prof.set(k, { ...p, erroRenovar: e.message }); reDesenhar(); }));
  const conteudo = (d) => {
    const c = el("div", { class: "ac-analise" }, mdSeguro(d.markdown || ""));
    if (d.fontes && d.fontes.length) c.append(el("h4", {}, "Fontes"), el("ul", { class: "ac-lista" }, ...d.fontes.map((f) => el("li", {}, linkFora(f.url, f.titulo || f.url, "ac-link"), f.em ? " · " + dataBR(f.em) : ""))));
    const [cp, cx] = botaoCopiar("Copiar Markdown", d.markdown || "", "ac-copiar-md-" + d.id);
    c.append(el("div", { class: "ls-acoes" }, cp), cx);
    return c;
  };
  // botão "Atualizar análise": confirmação dentro da página; pendente, esmaecido com a hora do pedido
  const atualizar = (d, pendente) => {
    const linha = el("div", { class: "ls-acoes ac-atualizar", id: "ac-atualizar-linha" });
    const b = el("button", { class: "dd-btn dd-btn--outline", type: "button", id: "ac-atualizar" }, "Atualizar análise");
    if (pendente) { b.disabled = true; b.setAttribute("aria-disabled", "true"); linha.append(b, el("span", { class: "ac-motivo" }, "Pedido em " + quando(d.pedidoEm || d.criado))); return linha; }
    b.addEventListener("click", () => {
      linha.textContent = "";
      const msg = el("span", { class: "ls-aviso", role: "status" });
      const sim = el("button", { class: "dd-btn dd-btn--primary", type: "button", id: "ac-atualizar-sim" }, "Atualizar");
      const nao = el("button", { class: "dd-btn dd-btn--ghost", type: "button", id: "ac-atualizar-nao" }, "Cancelar");
      sim.addEventListener("click", async () => { sim.disabled = true; try { await pedir({ forcar: true }); } catch (e) { msg.textContent = e.message; sim.disabled = false; } });
      nao.addEventListener("click", () => reDesenhar());
      linha.append(el("span", { role: "alertdialog", "aria-label": "Confirmar", class: "ac-confirma" }, "Pedir uma análise nova? A atual fica na tela até a nova chegar.", " "), sim, nao, msg);
      sim.focus();
    });
    linha.append(b);
    return linha;
  };
  const pend = p.pendente;
  if (p.pronta || (pend && pend.markdown) || p.vencida) {
    const d = p.pronta || pend || p.vencida;
    const sec = el("section", { class: "ls-bloco", id: p.pronta ? "ac-prof-pronta" : "ac-prof-pendente" }, el("h3", {}, "Comparação profunda", el("span", { class: "dd-badge " + (p.pronta ? "b-release" : "b-review") }, p.pronta ? "pronta" : "pendente")));
    sec.append(atualizar(d, !!pend || !p.pronta));
    const venceu = pend && Date.parse(pend.expiraEm || "") <= Date.now();
    if (p.pronta) sec.append(el("p", { class: "ls-pe" }, "gerada em " + dataBR(d.prontoEm) + " · vale até " + dataBR(d.expiraEm)));
    else if (venceu || p.vencida) sec.append(el("p", { class: "ls-aviso", id: "ac-prof-vencida" }, "Análise de " + dataBR(d.prontoEm) + ", vencida. Uma nova já foi pedida."));
    else sec.append(el("p", { class: "ls-aviso" }, "Análise de " + dataBR(d.prontoEm) + ". Uma atualização foi pedida: o plantão confere de hora em hora, das 7h às 23h."));
    if (p.erroRenovar) sec.append(avisoEl("Não deu para pedir a análise nova: " + p.erroRenovar, true));
    sec.append(conteudo(d));
    box.append(sec);
    return;
  }
  if (pend) {
    box.append(el("section", { class: "ls-bloco", id: "ac-prof-pendente" }, el("h3", {}, "Comparação profunda", el("span", { class: "dd-badge b-review" }, "pendente")),
      el("p", {}, "Pedido gravado. O plantão confere de hora em hora, das 7h às 23h."), el("p", { class: "ls-pe" }, "pedido em " + quando(pend.pedidoEm || pend.criado) + (pend.contexto ? " · contexto: " + pend.contexto : ""))));
    return;
  }
  // nunca pedida (ou falhou): o pedido
  const sec = el("section", { class: "ls-bloco", id: "ac-prof-pedir" }, el("h3", {}, "Gerar comparação profunda"));
  if (p.falhou) sec.append(avisoEl("O último pedido não deu certo" + (p.falhou.resposta ? ": " + p.falhou.resposta : "."), true));
  const ctx = el("textarea", { class: "dd-input", id: "ac-contexto", maxlength: String(ARCH().CONTEXTO_MAX), rows: "4", placeholder: "o problema, as restrições, o que pesa na decisão" });
  const conta = el("span", { class: "ls-pe", "aria-live": "polite" }, "0 de " + ARCH().CONTEXTO_MAX);
  ctx.addEventListener("input", () => { conta.textContent = ctx.value.length + " de " + ARCH().CONTEXTO_MAX; });
  const msg = el("p", { class: "ls-aviso", role: "status" });
  const b = el("button", { class: "dd-btn dd-btn--primary", type: "button", id: "ac-gerar" }, "Gerar comparação profunda");
  b.addEventListener("click", async () => { b.disabled = true; msg.textContent = ""; try { await pedir({ contexto: ctx.value }); } catch (e) { msg.textContent = e.message; msg.classList.add("erro"); b.disabled = false; } });
  // o roteiro que vai no pedido (o mesmo que a rota grava): capacidades, limites, maturidade, dependência, operação e cenários, sem preço
  const cat = aba === "cloud" ? servs() : (lsLista || []);
  const subNome = aba === "cloud" ? ARCH().nomeSub(catsCloud(), sub) : sub;
  const roteiro = () => ARCH().roteiroProfunda(ids.map((id) => cat.find((x) => x.id === id)).filter(Boolean), { aba, provs: provs(), sub, subNome, contexto: ctx.value });
  const pre = el("pre", { class: "ac-roteiro", id: "ac-roteiro" }, roteiro());
  ctx.addEventListener("input", () => { pre.textContent = roteiro(); });
  sec.append(el("label", { class: "rotulo", for: "ac-contexto" }, "Contexto da decisão (opcional)"), ctx, conta,
    el("details", { class: "ac-roteiro-caixa" }, el("summary", {}, "O que vai ser pedido à IA"), pre),
    el("p", { class: "ls-aviso" }, "A análise fica pronta em algumas horas e vale 30 dias; depois disso, uma nova é pedida sozinha quando a comparação é aberta."), el("div", { class: "ls-acoes" }, b), msg);
  box.append(sec);
}

/* ---------- lista "Comparações profundas" ---------- */
function telaProfundas(box, est) {
  const aba = est.aba;
  const volta = el("a", { class: "dd-btn dd-btn--link ls-volta", href: est.tela === "profunda" ? "#arch/" + aba + "/profundas" : aba === "cloud" ? ARCH().escreverHash(cloudEstadoGrade()) : "#arch/tools", id: "ac-prof-voltar" }, est.tela === "profunda" ? "← Comparações profundas" : aba === "cloud" ? "← Cloud" : "← Tools");
  volta.addEventListener("click", (e) => { e.preventDefault(); if (history.length > 1) history.back(); else irArch(est.tela === "profunda" ? { aba, tela: "profundas" } : aba === "cloud" ? cloudEstadoGrade() : { aba, tela: "grade" }); });
  box.append(volta);
  if (!AC.dados) carregarCloud();
  if (!lsLista) carregarLandscape();
  const nome = (a, id) => { const l = a === "cloud" ? servs() : lsLista || []; const x = l.find((y) => y.id === id); return x ? x.nome : id; };
  if (est.tela === "profunda") {
    const d = AC.profDoc.get(est.id);
    if (!d) { umaVez("pd:" + est.id, async () => { try { AC.profDoc.set(est.id, (await apiLs("GET", "/api/admin/arch/dossies/" + est.id)).dossie); } catch (e) { AC.profDoc.set(est.id, { erro: e.status === 404 ? "Essa comparação profunda não existe mais." : e.message }); } reDesenhar(); }); box.append(esqueleto(6)); return; }
    if (d.erro) { box.append(el("p", { class: "ls-vazio" }, d.erro)); return; }
    document.title = "Comparação profunda · ArchLandscape · Lookout";
    box.append(el("div", { class: "ls-cab" }, el("div", {}, el("h2", {}, d.ids.map((id) => nome(d.aba, id)).join(" × ")), el("p", {}, (d.aba === "cloud" ? "Cloud" : "Tools") + " · " + estadoTexto(d)))));
    box.append(el("p", { class: "ac-aviso-ia", role: "note" }, "Análise gerada por IA a partir das fontes listadas. Confira antes de decidir."));
    if (d.situacao === "pendente") { box.append(el("p", {}, "Pedido gravado. O plantão confere de hora em hora, das 7h às 23h.")); return; }
    if (d.situacao === "falhou") { box.append(avisoEl("Não deu certo" + (d.resposta ? ": " + d.resposta : "."), true)); return; }
    box.append(el("p", { class: "ls-pe" }, "gerada em " + dataBR(d.prontoEm) + (d.situacao === "vencida" ? " · vencida em " : " · vale até ") + dataBR(d.expiraEm)), mdSeguro(d.markdown));
    if (d.fontes && d.fontes.length) box.append(el("h4", {}, "Fontes"), el("ul", { class: "ac-lista" }, ...d.fontes.map((f) => el("li", {}, linkFora(f.url, f.titulo || f.url, "ac-link"), f.em ? " · " + dataBR(f.em) : ""))));
    const [cp, cx] = botaoCopiar("Copiar Markdown", d.markdown || "", "ac-copiar-md");
    const abrir = el("a", { class: "dd-btn dd-btn--ghost", href: ARCH().escreverHash({ aba: d.aba, tela: "comparar", ids: d.ids, profunda: false }) }, "Abrir a comparação");
    box.append(el("div", { class: "ls-acoes" }, cp, abrir), cx);
    return;
  }
  document.title = "Comparações profundas · ArchLandscape · Lookout";
  box.append(el("div", { class: "ls-cab" }, el("div", {}, el("h2", {}, "Comparações profundas"), el("p", {}, "análises pedidas para ADR, das duas abas"))));
  if (!AC.profLista) { umaVez("pl", async () => { try { AC.profLista = (await apiLs("GET", "/api/admin/arch/dossies")).dossies || []; } catch (e) { AC.profLista = { erro: e.status === 404 ? "Só o Admin vê as comparações profundas." : e.message }; } reDesenhar(); }); box.append(esqueleto(4)); return; }
  if (AC.profLista.erro) { box.append(el("p", { class: "ls-vazio" }, AC.profLista.erro)); return; }
  if (!AC.profLista.length) { box.append(el("p", { class: "ls-vazio" }, "Nenhuma comparação profunda pedida ainda. Abra uma comparação e use a aba Profunda.")); return; }
  box.append(el("ul", { class: "ls-lista ac-prof-lista" }, ...AC.profLista.map((d) => {
    const a = el("a", { href: "#arch/" + d.aba + "/profundas/" + d.id }, d.ids.map((id) => nome(d.aba, id)).join(" × "));
    a.addEventListener("click", (e) => { e.preventDefault(); irArch({ aba: d.aba, tela: "profunda", id: d.id }); });
    return el("li", {}, a, el("div", { class: "n" }, el("span", { class: "dd-badge " + (d.situacao === "pronta" ? "b-release" : d.situacao === "vencida" ? "b-video" : "b-review") }, d.situacao), el("span", {}, d.aba === "cloud" ? "Cloud" : "Tools"), el("span", {}, "pedida em " + dataBR(d.criado)), d.prontoEm ? el("span", {}, "pronta em " + dataBR(d.prontoEm)) : null));
  })));
}
const estadoTexto = (d) => (d.situacao === "pronta" ? "pronta, vale até " + dataBR(d.expiraEm) : d.situacao === "vencida" ? "vencida em " + dataBR(d.expiraEm) : d.situacao === "pendente" ? "pendente desde " + dataBR(d.criado) : "não deu certo");

/* ---------- Admin de Cloud (folha lateral, como a do Landscape) ---------- */
function acoesAdminServico(s) {
  const msg = el("span", { class: "ls-aviso", role: "status" });
  const ed = el("button", { class: "dd-btn dd-btn--outline", type: "button", id: "ac-editar" }, "Editar");
  ed.addEventListener("click", () => abrirFolhaCloud("servico", s));
  const conf = el("button", { class: "dd-btn dd-btn--ghost", type: "button", id: "ac-conferir" }, "Marcar conferido hoje");
  conf.addEventListener("click", async () => { conf.disabled = true; try { const j = await apiLs("PUT", "/api/admin/cloud/" + encodeURIComponent(s.id), { conferirHoje: true }); AC.det.delete(s.id); AC.dados = null; carregarServico(s.id); carregarCloud(true); msg.textContent = "Conferido em " + dataBR(j.servico.conferido) + "."; } catch (e) { msg.textContent = e.message; conf.disabled = false; } });
  const tirar = el("button", { class: "dd-btn dd-btn--ghost", type: "button", id: "ac-tirar" }, "Tirar do catálogo");
  tirar.addEventListener("click", async () => {
    if (tirar.dataset.confirma !== "1") { tirar.dataset.confirma = "1"; tirar.textContent = "Tirar mesmo? Clique de novo"; return; }
    try { await apiLs("DELETE", "/api/admin/cloud/" + encodeURIComponent(s.id)); AC.dados = null; AC.det.delete(s.id); AC.aviso = s.nome + " saiu do catálogo."; irArch(cloudEstadoGrade(), false); carregarCloud(true); } catch (e) { msg.textContent = e.message; }
  });
  return el("div", { class: "ls-acoes ac-admin" }, ed, conf, tirar, msg);
}
function folhaCloud() {
  let f = $("ac-folha");
  if (f) return f;
  const veu = el("div", { class: "veu ls-veu", id: "ac-veu", hidden: "" });
  f = el("div", { class: "pers rd-folha ls-folha", id: "ac-folha", role: "dialog", "aria-modal": "true", "aria-labelledby": "ac-folha-titulo", tabindex: "-1", hidden: "" },
    el("div", { class: "painel-topo" }, el("h2", { id: "ac-folha-titulo" }, ""), el("button", { class: "dd-btn dd-btn--ghost alvo", type: "button", id: "ac-folha-fechar" }, "Fechar")),
    el("div", { class: "painel-corpo", id: "ac-folha-corpo" }), el("div", { class: "painel-pe", id: "ac-folha-pe" }));
  const lsv = $("ls-veu");
  if (lsv) veu.className = lsv.className;
  document.body.append(veu, f);
  veu.addEventListener("click", fecharFolhaCloud);
  $("ac-folha-fechar").addEventListener("click", fecharFolhaCloud);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !f.hidden) { e.preventDefault(); fecharFolhaCloud(); } });
  return f;
}
function fecharFolhaCloud() {
  const f = $("ac-folha");
  if (!f || f.hidden) return;
  f.hidden = true; $("ac-veu").hidden = true;
  document.documentElement.classList.remove("trava");
  if (AC.folha && AC.folha.abridor && AC.folha.abridor.isConnected) AC.folha.abridor.focus({ preventScroll: true });
  AC.folha = null;
}
function abrirFolhaCloud(modo, s) {
  const f = folhaCloud();
  AC.folha = { modo, s, abridor: document.activeElement };
  f.hidden = false; $("ac-veu").hidden = false; document.documentElement.classList.add("trava");
  desenharFolhaCloud();
  f.focus({ preventScroll: true });
}
function desenharFolhaCloud() {
  const A = ARCH(), F = AC.folha;
  const corpo = $("ac-folha-corpo"), pe = $("ac-folha-pe");
  corpo.textContent = ""; pe.textContent = "";
  const erro = el("p", { class: "ls-aviso erro", role: "alert" });
  if (F.modo === "organizar") {
    $("ac-folha-titulo").textContent = "Provedores e categorias";
    const tp = el("textarea", { class: "dd-input ac-json", id: "ac-f-provs", rows: "14", spellcheck: "false" }); tp.value = JSON.stringify(provs(), null, 1);
    const tc = el("textarea", { class: "dd-input ac-json", id: "ac-f-cats", rows: "14", spellcheck: "false" }); tc.value = JSON.stringify(catsCloud(), null, 1);
    corpo.append(el("p", { class: "dica" }, "Cada provedor: id, nome, sigla (até 4), cor (#rrggbb), tipo (grande ou alternativa), site, status, pais, novidades e ícone opcionais. Provedor ou subcategoria com serviço dentro não sai."),
      el("label", { class: "rotulo", for: "ac-f-provs" }, "Provedores"), tp, el("label", { class: "rotulo", for: "ac-f-cats" }, "Categorias e subcategorias"), tc, erro);
    const ok = el("button", { class: "dd-btn dd-btn--primary", type: "button", id: "ac-f-salvar" }, "Salvar");
    ok.addEventListener("click", async () => {
      erro.textContent = ""; let bp, bc;
      try { bp = JSON.parse(tp.value); bc = JSON.parse(tc.value); } catch (e) { erro.textContent = "O texto não é JSON válido."; return; }
      try { await apiLs("PUT", "/api/admin/cloud-provedores", { provedores: bp }); await apiLs("PUT", "/api/admin/cloud-categorias", { categorias: bc }); AC.dados = null; fecharFolhaCloud(); carregarCloud(true); }
      catch (e) { erro.textContent = e.message; }
    });
    pe.append(ok); return;
  }
  const s = F.s, ed = !!s;
  $("ac-folha-titulo").textContent = ed ? "Editar " + s.nome : "Adicionar serviço";
  const campo = (id, rot, valor, attrs = {}) => { const i = el(attrs.area ? "textarea" : "input", { class: "dd-input", id, ...attrs, area: null }); i.removeAttribute("area"); i.value = valor || ""; return [el("label", { class: "rotulo", for: id }, rot), i]; };
  const prov = el("select", { class: "dd-input", id: "ac-f-prov" }, ...provs().map((p) => el("option", { value: p.id }, p.nome)));
  prov.value = ed ? s.provedor : (provs()[0] || {}).id; if (ed) prov.disabled = true;
  const sub = el("select", { class: "dd-input", id: "ac-f-sub" }, ...catsCloud().map((c) => el("optgroup", { label: c.nome }, ...c.subcategorias.map((x) => el("option", { value: c.id + "|" + x.id }, x.nome)))));
  sub.value = ed ? s.categoria + "|" + s.subcategoria : "";
  const [lNome, nome] = campo("ac-f-nome", "Nome (como o provedor chama)", ed ? s.nome : "", { maxlength: "80" }); if (ed) nome.disabled = true;
  const [lAp, ap] = campo("ac-f-apelidos", "Apelidos (separados por vírgula)", ed ? (s.apelidos || []).join(", ") : "");
  const [lRes, res] = campo("ac-f-resumo", "O que é (1 a 2 frases)", ed ? s.resumo : "", { area: true, rows: "2", maxlength: "320" });
  const [lCob, cob] = campo("ac-f-cobranca", "Como cobra (em palavras, sem número)", ed ? s.cobranca : "", { area: true, rows: "2", maxlength: "320" });
  const [lGr, gr] = campo("ac-f-gratis", "Plano grátis (vazio se não for fato estável)", ed ? s.gratis : "", { maxlength: "200" });
  const [lDes, des] = campo("ac-f-destaques", "Destaques (um por linha, até 4)", ed ? (s.destaques || []).join("\n") : "", { area: true, rows: "3" });
  const lk = (ed && s.links) || {};
  const links = A.LINKS.map((k) => campo("ac-f-l-" + k, { produto: "Página do produto", docs: "Documentação", status: "Status" }[k], lk[k], { type: "url", placeholder: "https://" }));
  const [lIc, ic] = campo("ac-f-icone", "Ícone (opcional; vazio usa o do provedor)", ed ? s.icone : "", { type: "url", placeholder: "https://" });
  const usoAtual = new Set(ed ? LS.usoDe(s) : ["nuvem"]);
  const usoCx = LS.USOS.map((u) => { const c = el("input", { type: "checkbox", id: "ac-f-uso-" + u.id, value: u.id }); c.checked = usoAtual.has(u.id); return el("label", { class: "ls-f-cx", title: u.explicacao }, c, " " + u.rotulo); });
  const [lUn, un] = campo("ac-f-uso-nota", "Nota sobre o uso", ed ? s.uso_nota : "", { maxlength: "240" });
  const conf = el("input", { type: "checkbox", id: "ac-f-conferir" });
  const atBox = el("div", { class: "ac-f-at" });
  // Capacidades: uma linha por rótulo da matriz, com o campo do tipo (sim/não, número com a unidade, lista ou texto) e a fonte
  const origDe = (sid, k) => A.carac(ed && s.subcategoria === sid && s.atributos ? s.atributos[k] : null);
  const pintarAt = () => {
    atBox.textContent = "";
    const [, sid] = String(sub.value || "|").split("|");
    for (const k of A.chavesDe(sid)) {
      const c = origDe(sid, k.k);
      const id = "ac-f-at-" + k.k;
      let v;
      if (k.tipo === "sn" || k.tipo === "snp") {
        v = el("select", { class: "dd-input", id }, el("option", { value: "" }, "não conferido"), el("option", { value: "sim" }, "sim"), el("option", { value: "nao" }, "não"), k.tipo === "snp" ? el("option", { value: "parcial" }, "parcial") : null);
        v.value = c ? (c.valor === "não" ? "nao" : String(c.valor)) : "";
      } else if (k.tipo === "num") {
        v = el("input", { class: "dd-input", id, type: "number", min: "0", step: "any", inputmode: "decimal", value: c ? String(c.valor) : "" });
      } else {
        v = el("input", { class: "dd-input", id, value: c ? (Array.isArray(c.valor) ? c.valor.join(", ") : String(c.valor)) : "", placeholder: k.tipo === "lista" ? "itens separados por vírgula" : "" });
      }
      const fo = el("input", { class: "dd-input", id: "ac-f-atf-" + k.k, type: "url", value: c ? c.fonte || "" : "", placeholder: "fonte https:// (obrigatória)", "aria-label": "Fonte de " + k.r });
      const campoV = k.tipo === "num" && k.u ? el("span", { class: "ac-f-num" }, v, el("span", { class: "ac-f-un" }, k.u)) : v;
      atBox.append(el("div", { class: "ac-f-at-l" }, el("label", { class: "rotulo", for: id }, k.r), campoV, fo, c && c.em ? el("small", { class: "ls-pe" }, (c.por === "admin" ? "gravado pelo Admin" : "conferido") + " em " + dataBR(c.em)) : null));
    }
  };
  sub.addEventListener("change", pintarAt); pintarAt();
  corpo.append(el("div", { class: "ls-form" }, el("label", { class: "rotulo", for: "ac-f-prov" }, "Provedor"), prov, el("label", { class: "rotulo", for: "ac-f-sub" }, "Categoria e subcategoria"), sub,
    lNome, nome, lAp, ap, lRes, res, lCob, cob, lGr, gr, lDes, des, ...links.flat(), lIc, ic,
    el("fieldset", { class: "ls-f-uso" }, el("legend", { class: "rotulo" }, "Opções de uso"), ...usoCx, lUn, un),
    el("fieldset", { class: "ls-f-uso" }, el("legend", { class: "rotulo" }, "Capacidades (vazio fica \"não conferido\"; valor novo pede a fonte)"), atBox),
    el("label", { class: "ls-f-cx" }, conf, " Marcar conferido hoje"), erro));
  const ok = el("button", { class: "dd-btn dd-btn--primary", type: "button", id: "ac-f-salvar" }, ed ? "Salvar" : "Adicionar");
  ok.addEventListener("click", async () => {
    erro.textContent = "";
    const [cid, sid] = String(sub.value || "|").split("|");
    const atributos = {}, semFonte = [];
    for (const k of A.chavesDe(sid)) {
      const v = String($("ac-f-at-" + k.k).value || "").trim(), fo = $("ac-f-atf-" + k.k).value.trim();
      if (!v) { atributos[k.k] = null; continue; }
      const valor = k.tipo === "lista" ? v.split(",").map((x) => x.trim()).filter(Boolean) : k.tipo === "num" ? Number(v.replace(",", ".")) : v;
      const orig = origDe(sid, k.k);
      // o que não mudou volta como estava (mesma data e mesma origem); o que mudou é do Admin, com a fonte
      if (orig && A.textoCarac(orig, k) === A.textoCarac({ valor }, k) && (orig.fonte || "") === fo) atributos[k.k] = { valor: orig.valor, fonte: orig.fonte, em: orig.em, por: orig.por };
      else { if (!fo) semFonte.push(k.r); atributos[k.k] = { valor, fonte: fo, por: "admin" }; }
    }
    if (semFonte.length) { erro.textContent = "Falta a fonte (https) de: " + semFonte.join(", ") + "."; return; }
    const b = { provedor: prov.value, nome: nome.value.trim(), apelidos: ap.value.split(",").map((x) => x.trim()).filter(Boolean), categoria: cid, subcategoria: sid, resumo: res.value, cobranca: cob.value, gratis: gr.value,
      destaques: des.value.split("\n").map((x) => x.trim()).filter(Boolean), links: Object.fromEntries(A.LINKS.map((k) => [k, $("ac-f-l-" + k).value.trim()])), icone: ic.value.trim(),
      uso: LS.USOS.filter((u) => $("ac-f-uso-" + u.id).checked).map((u) => u.id), uso_nota: un.value, atributos, conferirHoje: conf.checked };
    if (!ed) for (const k of Object.keys(atributos)) if (!atributos[k]) delete atributos[k];
    ok.disabled = true;
    try {
      const j = ed ? await apiLs("PUT", "/api/admin/cloud/" + encodeURIComponent(s.id), b) : await apiLs("POST", "/api/admin/cloud", b);
      fecharFolhaCloud(); AC.dados = null; AC.det.delete(j.id); carregarCloud(true);
      if (!ed) irArch({ aba: "cloud", tela: "detalhe", id: j.id }); else carregarServico(j.id);
    } catch (e) { erro.textContent = e.message; ok.disabled = false; }
  });
  pe.append(ok);
}

/* ---------- widget do Início (arch-cloud): contagem por provedor e atalho ---------- */
function corpoArchCloud(d, fm) {
  if (!d || !d.servicos) return [el("p", { class: "wdg-vazio" }, "Nenhum serviço no catálogo ainda.")];
  const n = new Map();
  for (const s of d.servicos) n.set(s.provedor, (n.get(s.provedor) || 0) + 1);
  const l = (d.provedores || []).filter((p) => n.has(p.id)).sort((a, b) => n.get(b.id) - n.get(a.id)).slice(0, fm && fm.c > 1 ? 10 : 6);
  return [el("ul", { class: "wdg-lista wdg-ac" }, ...l.map((p) => el("li", {}, el("a", { href: ARCH().escreverHash({ aba: "cloud", tela: "grade", filtros: { ...ARCH().FILTROS_VAZIOS(), provs: [p.id] } }) }, provEl(p, "p")), el("span", { class: "n" }, n.get(p.id) + " serviços")))),
    el("p", { class: "wdg-pe" }, el("a", { href: "#arch/cloud" }, d.servicos.length + " serviços de " + n.size + " provedores · abrir Cloud"))];
}
