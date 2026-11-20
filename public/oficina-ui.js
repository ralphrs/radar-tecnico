/* Radar de Oficina (pedido de 19/11): as telas das abas Ferramentas, Insumos e Madeiras (grade, filtros, detalhe,
 * comparar madeiras) e a folha do Admin (adicionar, editar, organizar categorias). A aba Conteúdos é o feed comum.
 *
 * Script clássico, carregado antes do script principal de index.html: aqui só há declarações. As funções usam, na
 * hora em que rodam, o que o script principal define (el, $, radar, inicio, render, escreverHash, esqueleto, apiLs,
 * dataBR, linkFora). Regras puras em public/oficina.js; ícones desenhados em public/oficina-icones.js.
 * Texto vindo do banco entra sempre como nó de texto; link só quando é https.
 */
var OF = {
  visao: "conteudos", id: null, comparar: [],
  dados: { ferramentas: null, insumos: null, madeiras: null }, erro: {}, det: new Map(), detErro: new Map(), pedidos: new Set(),
  filtros: null, rolagem: {}, daGrade: false, sel: [], aviso: "", confirmaTirar: false, folha: null,
};
const OFI = () => window.Oficina;
const OFIC = () => window.OficinaIcones;
(function () {
  const O = window.Oficina;
  OF.filtros = { ferramentas: O.FILTROS_VAZIOS(), insumos: O.FILTROS_VAZIOS(), madeiras: O.FILTROS_MADEIRA() };
  try { const s = JSON.parse(localStorage.getItem("radar-oficina") || "null"); if (s && typeof s === "object") for (const k of ["ferramentas", "insumos", "madeiras"]) if (s[k] && typeof s[k] === "object") OF.filtros[k] = { ...OF.filtros[k], ...s[k], q: "" }; } catch (e) {}
})();
const ofGuardar = () => { try { localStorage.setItem("radar-oficina", JSON.stringify(OF.filtros)); } catch (e) {} };
const KIND_TXT = { ferramentas: { titulo: "Ferramentas", sub: "ferramentas de marcenaria, carpintaria e serralheria, por categoria", um: "ferramenta", varios: "ferramentas", add: "Adicionar ferramenta", nenhum: "Nenhuma ferramenta cadastrada ainda." },
  insumos: { titulo: "Insumos", sub: "o que se gasta e se repõe na oficina, por tipo", um: "insumo", varios: "insumos", add: "Adicionar insumo", nenhum: "Nenhum insumo cadastrado ainda." },
  madeiras: { titulo: "Madeiras", sub: "espécies e painéis, com origem e notas de dureza, durabilidade, raridade e preço", um: "madeira", varios: "madeiras", add: "Adicionar madeira" } };
const NAO_LEVANTADO = "Ainda não levantado";

/* ---------- ligação com o script principal ---------- */
function oficinaDoHash() {
  const a = OFI().lerHash(location.hash);
  const v = a ? a.aba : "conteudos", id = a ? a.id : null, cmp = a ? a.comparar : [];
  const mudou = v !== OF.visao || id !== OF.id || cmp.join(",") !== OF.comparar.join(",");
  OF.visao = v; OF.id = id; OF.comparar = cmp;
  return mudou;
}
function oficinaInicio() { OF.visao = "conteudos"; OF.id = null; OF.comparar = []; }
const hashOficina = () => OFI().escreverHash({ aba: OF.visao, id: OF.id, comparar: OF.comparar });
const emOficinaCat = () => !inicio && radar === "oficina" && OF.visao !== "conteudos";
function marcarAbasOficina() {
  for (const a of OFI().ABAS) { const b = document.getElementById("ofi-aba-" + a.id); if (b) b.setAttribute("aria-pressed", String(!inicio && radar === "oficina" && OF.visao === a.id)); }
}
function ligarAbasOficina() {
  if (!document.getElementById("oi-folha") && OFIC()) { const d = document.createElement("div"); d.id = "oi-folha"; d.innerHTML = OFIC().folha(); document.body.prepend(d.firstChild); }
  for (const a of OFI().ABAS) {
    const b = document.getElementById("ofi-aba-" + a.id);
    if (b) b.addEventListener("click", () => { if (OF.visao === a.id && !OF.id && !OF.comparar.length) return; irOficina({ visao: a.id }); });
  }
}
/* troca de aba ou de tela: entrada nova no histórico (o Voltar volta para onde estava) */
function irOficina(e, push = true) {
  if (radar !== "oficina" || inicio) return;
  OF.visao = e.visao || OF.visao; OF.id = e.id || null; OF.comparar = e.comparar || [];
  OF.confirmaTirar = false; fecharFolhaOf();
  escreverHash(push);
  render(); window.scrollTo({ top: 0 });
}
function oficinaHashMudou() {
  const antes = OF.id || OF.comparar.length, visAntes = OF.visao, y = window.scrollY;
  if (!oficinaDoHash()) return;
  if (!antes && (OF.id || OF.comparar.length)) OF.rolagem[OF.visao] = y;
  OF.confirmaTirar = false; fecharFolhaOf(); render();
  if (antes && !OF.id && !OF.comparar.length && visAntes === OF.visao) ofVoltarRolagem(); else window.scrollTo({ top: 0 });
}
function ofVoltarRolagem() {
  const y = OF.rolagem[OF.visao] || 0;
  requestAnimationFrame(() => window.scrollTo({ top: y }));
  setTimeout(() => { if (emOficinaCat() && !OF.id && Math.abs(window.scrollY - y) > 2) window.scrollTo({ top: y }); }, 80);
}

/* ---------- dados ---------- */
async function ofCarregar(kind, forcar) {
  if (OF.pedidos.has("l:" + kind) || (OF.dados[kind] && !forcar)) return;
  OF.pedidos.add("l:" + kind);
  try { OF.dados[kind] = await apiLs("GET", "/api/oficina/" + kind); OF.erro[kind] = ""; }
  catch (e) { if (!OF.dados[kind]) OF.erro[kind] = e.status === 403 ? "Esta seção não está liberada para você." : e.message; }
  OF.pedidos.delete("l:" + kind);
  if (emOficinaCat()) renderOficina();
}
async function ofCarregarDet(kind, id) {
  const k = kind + "/" + id;
  if (OF.pedidos.has("d:" + k)) return;
  OF.pedidos.add("d:" + k);
  try { const j = await apiLs("GET", "/api/oficina/" + kind + "/" + encodeURIComponent(id)); OF.det.set(k, j); OF.detErro.delete(k); }
  catch (e) { OF.detErro.set(k, e.status === 404 ? `Esse item não está mais na aba ${KIND_TXT[kind].titulo}.` : e.message); }
  OF.pedidos.delete("d:" + k);
  if (emOficinaCat() && OF.id === id) renderOficina();
}
const ofItens = (kind) => (OF.dados[kind] && OF.dados[kind].itens) || [];
const ofCats = (kind) => (OF.dados[kind] && OF.dados[kind].categorias) || [];

/* ---------- pedaços ---------- */
/* ícone desenhado (public/oficina-icones.js) pelo <use>; sem ícone, o da subcategoria (Oficina.iconeDe) */
function ofIcone(id, tam, rotulo) {
  const ok = id && OFIC() && OFIC().existe(id);
  const px = tam === "g" ? 48 : tam === "p" ? 18 : 28;
  const caixa = el("span", { class: "ofi-ic" + (tam ? " ofi-ic-" + tam : ""), ...(rotulo ? { role: "img", "aria-label": rotulo, title: rotulo } : { "aria-hidden": "true" }) });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(px)); svg.setAttribute("height", String(px)); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
  const use = document.createElementNS(svg.namespaceURI, "use");
  use.setAttribute("href", "#oi-" + (ok ? id : "bancada"));
  svg.append(use); caixa.append(svg);
  return caixa;
}
const iconeDoItem = (kind, x) => OFI().iconeDe(x, ofCats(kind), (id) => OFIC().existe(id)) || (kind === "madeiras" ? "madeira" : "bancada");
const nomeOficio = (id) => (OFI().OFICIOS.find((o) => o.id === id) || {}).nome || id;
const nomeTipo = (id) => (OFI().TIPOS.find((o) => o.id === id) || {}).nome || id;
const nomeNivel = (id) => (OFI().NIVEIS.find((o) => o.id === id) || {}).nome || id;
/* marca pequena do ofício no cartão: a inicial com o nome inteiro no title e no leitor de tela */
function marcasOficio(ofs) {
  const l = (ofs || []).filter((o) => OFI().OFICIOS.some((x) => x.id === o));
  if (!l.length) return null;
  return el("span", { class: "ofi-ofs", title: l.map(nomeOficio).join(", "), role: "img", "aria-label": "Ofícios: " + l.map(nomeOficio).join(", ") },
    ...l.map((o) => el("span", { class: "ofi-of of-" + o, "aria-hidden": "true" }, nomeOficio(o).charAt(0))));
}
const vazioBloco = () => el("p", { class: "ofi-vazio" }, NAO_LEVANTADO);
const linkFonte = (u, txt) => { const ok = OFI().urlHttps(u); return ok ? el("a", { class: "ofi-fonte", href: ok, target: "_blank", rel: "noopener" }, txt || "fonte: " + OFI().hostDe(ok).replace(/^www\./, "")) : null; };
function bloco(titulo, corpo, cls) { return el("section", { class: "ls-bloco ofi-bloco" + (cls ? " " + cls : "") }, el("h3", {}, titulo), ...(Array.isArray(corpo) ? corpo : [corpo])); }
const listaTextos = (l) => (l && l.length ? el("ul", { class: "ofi-lista" }, ...l.map((t) => el("li", {}, t))) : vazioBloco());
function passosEl(l) {
  if (!l || !l.length) return vazioBloco();
  return el("ol", { class: "ofi-passos" }, ...l.slice().sort((a, b) => (a.passo || 0) - (b.passo || 0)).map((p) => el("li", {}, p.texto)));
}
function avisoOf(txt, erro) { return txt ? el("p", { class: "ls-aviso" + (erro ? " erro" : ""), role: "status" }, txt) : null; }
const chipOf = (id, on, txt, k, fn, titulo) => { const b = el("button", { class: "chip", type: "button", id, "aria-pressed": String(on), ...(titulo ? { title: titulo } : {}) }, txt, k != null ? el("span", { class: "k" }, String(k)) : null); b.addEventListener("click", fn); return b; };

/* ---------- render ---------- */
function renderOficina() {
  const real = $("oficina");
  if (!real) return;
  const on = emOficinaCat();
  real.hidden = !on;
  if (!on) { if (!inicio && radar === "oficina") document.title = "Radar de Oficina · Lookout"; return; }
  const box = document.createElement("div");
  const kind = OF.visao;
  if (!OF.dados[kind] && !OF.erro[kind]) ofCarregar(kind);
  if (OF.erro[kind] && !OF.dados[kind]) {
    const b = el("button", { class: "dd-btn dd-btn--link", type: "button" }, "Tentar de novo");
    b.addEventListener("click", () => { OF.erro[kind] = ""; ofCarregar(kind, true); renderOficina(); });
    box.append(cabOf(kind), el("p", { class: "ls-vazio" }, `Não deu para carregar ${KIND_TXT[kind].varios} agora. ${OF.erro[kind]} `, b));
  } else if (!OF.dados[kind]) box.append(cabOf(kind), esqueleto(6));
  else if (kind === "madeiras" && OF.comparar.length) telaCompararMadeiras(box);
  else if (OF.id) telaDetalheOf(box, kind, OF.id);
  else if (kind === "madeiras") telaGradeMadeiras(box);
  else telaGradeCatalogo(box, kind);
  real.replaceChildren(...box.childNodes);
  if (kind !== "madeiras" && !OF.id) larguraCartaoOf(real.querySelector(".ofi-conteudo"), kind);
}
function cabOf(kind) {
  document.title = KIND_TXT[kind].titulo + " · Radar de Oficina · Lookout";
  return el("div", { class: "ls-cab" }, el("div", {}, el("h2", {}, KIND_TXT[kind].titulo), el("p", {}, KIND_TXT[kind].sub)));
}
function acoesAdmin(kind) {
  const d = OF.dados[kind];
  if (!d || !d.admin) return null;
  const add = el("button", { class: "dd-btn dd-btn--outline", type: "button", id: "ofi-adicionar" }, KIND_TXT[kind].add);
  add.addEventListener("click", () => abrirFolhaOf(kind, "item", null));
  const org = kind !== "madeiras" ? el("button", { class: "dd-btn dd-btn--ghost", type: "button", id: "ofi-organizar" }, "Organizar categorias") : null;
  if (org) org.addEventListener("click", () => abrirFolhaOf(kind, "categorias", null));
  return el("div", { class: "ls-acoes" }, add, org);
}
function estadoAdmin(kind) {
  const d = OF.dados[kind];
  if (!d || !d.admin || !d.estado) return null;
  const e = d.estado;
  const partes = [`${e.comDetalhes} de ${e.total} com detalhes levantados`];
  if (kind === "madeiras") partes.push(`${e.comNotas} com alguma nota`);
  else partes.push(`${e.precoEmDia} com preço em dia`, `${e.precoVencido} com preço vencido`, `${e.semPreco} sem preço pesquisado`);
  return el("p", { class: "ofi-estado", id: "ofi-estado" }, el("b", {}, "Levantamento: "), partes.join(" · "), ".");
}

/* ---------- grade de Ferramentas e Insumos ---------- */
function telaGradeCatalogo(box, kind) {
  const O = OFI(), f = OF.filtros[kind], todos = ofItens(kind), cats = ofCats(kind);
  const mudar = (patch, foco) => {
    Object.assign(f, patch); ofGuardar(); renderOficina();
    if (foco) { const x = $(foco); if (x) { x.focus({ preventScroll: true }); if (x.setSelectionRange && typeof x.value === "string") { const n = x.value.length; try { x.setSelectionRange(n, n); } catch (e) {} } } }
  };
  const cab = cabOf(kind);
  const ac = acoesAdmin(kind); if (ac) cab.append(ac);
  box.append(cab);
  const est = estadoAdmin(kind); if (est) box.append(est);
  if (OF.aviso) { box.append(avisoOf(OF.aviso)); OF.aviso = ""; }
  // filtros
  const busca = el("input", { class: "dd-input", id: "ofi-busca", type: "search", placeholder: "Buscar por nome ou apelido", "aria-label": `Buscar ${KIND_TXT[kind].um}`, value: f.q, autocomplete: "off" });
  let t = 0;
  busca.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => mudar({ q: busca.value.trim() }, "ofi-busca"), 250); });
  const agrupar = el("div", { class: "seg", role: "group", "aria-label": "Agrupar por" });
  [["categoria", "Categoria"], ["oficio", "Ofício"]].forEach(([k, txt]) => { const b = el("button", { type: "button", id: "ofi-por-" + k, "aria-pressed": String(f.por === k) }, txt); b.addEventListener("click", () => mudar({ por: k })); agrupar.append(b); });
  box.append(el("div", { class: "ls-ferr" }, busca, el("span", { class: "rotulo ac-rot" }, "Agrupar por"), agrupar));
  const base = (patch) => O.filtrar(todos, { ...f, ...patch });
  const grupoChips = (rotulo, id, lista, campo, chave) => {
    const b0 = base({ [chave]: [] }), cont = O.contar(b0, campo, lista.map((x) => x.id));
    const g = el("div", { class: "chips ofi-chips", role: "group", "aria-label": rotulo }, el("span", { class: "rotulo ofi-rot" }, rotulo));
    for (const x of lista) {
      if (!todos.some((i) => (Array.isArray(i[campo]) ? i[campo].includes(x.id) : i[campo] === x.id))) continue;
      const on = f[chave].includes(x.id);
      g.append(chipOf(id + x.id, on, x.nome, cont[x.id], () => mudar({ [chave]: on ? f[chave].filter((y) => y !== x.id) : f[chave].concat(x.id) }, id + x.id)));
    }
    return g;
  };
  box.append(grupoChips("Ofício", "ofi-of-", O.OFICIOS, "oficios", "oficios"));
  if (kind === "ferramentas") { box.append(grupoChips("Tipo", "ofi-tp-", O.TIPOS, "tipo", "tipos")); box.append(grupoChips("Nível", "ofi-nv-", O.NIVEIS, "nivel", "niveis")); }
  const comPreco = base({ comPreco: true }).length;
  const limpar = el("button", { class: "dd-btn dd-btn--link", type: "button", id: "ofi-limpar" }, "Limpar filtros");
  limpar.addEventListener("click", () => mudar({ ...O.FILTROS_VAZIOS(), por: f.por }));
  const temFiltro = f.q || f.oficios.length || f.tipos.length || f.niveis.length || f.comPreco;
  box.append(el("div", { class: "chips ofi-chips" }, chipOf("ofi-preco", f.comPreco, "Com preço levantado", comPreco, () => mudar({ comPreco: !f.comPreco }, "ofi-preco")), temFiltro ? limpar : null));
  // conteúdo
  const l = O.filtrar(todos, f);
  const conteudo = el("div", { class: "ofi-conteudo" });
  box.append(conteudo);
  if (!todos.length) { conteudo.append(el("p", { class: "ls-vazio" }, KIND_TXT[kind].nenhum)); return; }
  if (!l.length) { conteudo.append(el("p", { class: "ls-vazio" }, "Nada com esses filtros. ", limpar.cloneNode(true))); conteudo.lastChild.lastChild.addEventListener("click", () => mudar({ ...O.FILTROS_VAZIOS(), por: f.por })); return; }
  conteudo.append(el("p", { class: "ls-aviso ac-conta" }, `${l.length} ${l.length === 1 ? KIND_TXT[kind].um : KIND_TXT[kind].varios}`));
  const col = el("div", { class: "ls-cats-col" });
  if (f.por === "oficio") {
    for (const g of O.agruparPorOficio(l, cats))
      col.append(el("section", { class: "ls-cat ofi-cat", "aria-label": g.nome }, el("h3", {}, g.nome, el("span", { class: "k" }, String(g.n))),
        ...g.cats.map((c) => el("div", { class: "ls-sub ac-sub" }, el("h4", {}, c.nome), el("div", { class: "ac-grade" }, ...c.itens.map((x) => cartaoOf(kind, x, true)))))));
  } else {
    for (const c of O.agruparPorCategoria(l, cats)) {
      const n = c.subs.reduce((k, s) => k + s.itens.length, 0);
      col.append(el("section", { class: "ls-cat ofi-cat", "aria-label": c.nome }, el("h3", {}, c.nome, el("span", { class: "k" }, String(n))),
        c.indicadaPara ? el("p", { class: "ofi-ind ofi-ind-cat" }, c.indicadaPara) : null,
        ...c.subs.map((s) => el("div", { class: "ls-sub ac-sub" }, el("h4", {}, s.nome), s.indicadaPara ? el("p", { class: "ofi-ind" }, s.indicadaPara) : null,
          el("div", { class: "ac-grade" }, ...s.itens.map((x) => cartaoOf(kind, x, !!f.q)))))));
    }
  }
  conteudo.append(el("div", { class: "ls-cats ac-cats ofi-cats" }, col));
}
function cartaoOf(kind, x, comSub) {
  const a = el("a", { class: "ac-nome", href: OFI().escreverHash({ aba: kind, id: x.id }), title: x.nome }, x.nome);
  a.addEventListener("click", (e) => abrirItemOf(kind, x.id, e));
  const sub = comSub ? (OFI().subDe(ofCats(kind), x.categoria, x.subcategoria) || {}).nome : "";
  return el("article", { class: "ac-card ofi-card", id: "ofi-c-" + x.id },
    ofIcone(iconeDoItem(kind, x), "", ""), el("div", { class: "ac-meio" }, a, sub ? el("span", { class: "ac-sub-lin", title: sub }, sub) : null),
    marcasOficio(x.oficios));
}
/* o nome cabe em uma linha: a largura mínima do cartão é a do maior nome da aba, medida uma vez (como em Cloud) */
const ofLargura = {};
function larguraCartaoOf(conteudo, kind, depois) {
  if (!conteudo) return;
  if (!conteudo.isConnected) { if (!depois) requestAnimationFrame(() => larguraCartaoOf(conteudo, kind, true)); return; }
  const todos = ofItens(kind), chave = todos.length + "|" + todos.reduce((k, s) => k + s.nome.length, 0);
  if (!ofLargura[kind] || ofLargura[kind].chave !== chave) {
    const maiores = todos.slice().sort((a, b) => b.nome.length - a.nome.length).slice(0, 6);
    const prova = el("div", { style: "position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;display:flex;flex-direction:column;align-items:flex-start", "aria-hidden": "true" },
      ...maiores.map((x) => { const c = cartaoOf(kind, x, false); c.removeAttribute("id"); c.style.width = "max-content"; return c; }));
    conteudo.append(prova);
    let px = 0;
    for (const c of prova.children) px = Math.max(px, Math.ceil(c.getBoundingClientRect().width));
    prova.remove();
    if (px > 0) ofLargura[kind] = { chave, px: px + 2 };
  }
  if (ofLargura[kind]) conteudo.style.setProperty("--ac-w", ofLargura[kind].px + "px");
}
function abrirItemOf(kind, id, e) {
  if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) return;
  if (e) e.preventDefault();
  OF.daGrade = !OF.id && !OF.comparar.length;
  if (OF.daGrade) OF.rolagem[kind] = window.scrollY;
  irOficina({ visao: kind, id });
}
function voltarOf(kind) {
  return (e) => {
    if (e) e.preventDefault();
    if (OF.daGrade && history.length > 1) { OF.daGrade = false; history.back(); return; }
    irOficina({ visao: kind });
    ofVoltarRolagem();
  };
}

/* ---------- detalhe de Ferramenta e Insumo ---------- */
function telaDetalheOf(box, kind, id) {
  const volta = el("a", { class: "dd-btn dd-btn--link ls-volta", href: OFI().escreverHash({ aba: kind }), id: "ofi-voltar" }, "← " + KIND_TXT[kind].titulo);
  volta.addEventListener("click", voltarOf(kind));
  box.append(volta);
  const k = kind + "/" + id, d = OF.det.get(k);
  if (!d) {
    const erro = OF.detErro.get(k);
    if (erro) { box.append(el("p", { class: "ls-vazio" }, erro)); return; }
    ofCarregarDet(kind, id);
    const leve = ofItens(kind).find((x) => x.id === id);
    box.append(el("div", { class: "ls-topo" }, ofIcone(leve ? iconeDoItem(kind, leve) : "", "g"), el("div", {}, el("h2", {}, leve ? leve.nome : id))), esqueleto(6));
    return;
  }
  if (kind === "madeiras") return telaDetalheMadeira(box, d);
  const O = OFI(), x = d.item, cats = d.categorias || ofCats(kind);
  document.title = x.nome + " · " + KIND_TXT[kind].titulo + " · Lookout";
  const cat = O.catDe(cats, x.categoria), sub = O.subDe(cats, x.categoria, x.subcategoria);
  const ind = O.indicadaDe(cats, x.categoria, x.subcategoria);
  const chips = el("div", { class: "ls-chips" },
    el("span", { class: "dd-badge b-clube" }, (cat ? cat.nome : "Sem categoria") + (sub ? " › " + sub.nome : "")),
    ...(x.oficios || []).map((o) => el("span", { class: "dd-badge ofi-b-of of-" + o }, nomeOficio(o))),
    x.tipo ? el("span", { class: "dd-badge b-noticia" }, nomeTipo(x.tipo)) : null,
    x.nivel ? el("span", { class: "dd-badge b-release", title: (O.NIVEIS.find((n) => n.id === x.nivel) || {}).explica || "" }, "nível: " + nomeNivel(x.nivel).toLowerCase()) : null,
    x.unidade ? el("span", { class: "dd-badge b-review" }, "vendido por " + x.unidade) : null);
  const topo = el("div", { class: "ls-topo ofi-topo-det" }, ofIcone(iconeDoItem(kind, x), "g"),
    el("div", {}, el("h2", {}, x.nome), x.apelidos && x.apelidos.length ? el("span", { class: "ls-repo" }, "também chamad" + (KIND_TXT[kind].um === "ferramenta" ? "a" : "o") + " de " + x.apelidos.join(", ")) : null),
    chips, x.resumo ? el("p", { class: "ls-desc" }, x.resumo) : null,
    ind ? el("p", { class: "ofi-ind-det", id: "ofi-indicada" }, el("b", {}, "Geralmente indicad" + (kind === "insumos" ? "o" : "a") + " para: "), ind) : null,
    el("p", { class: "ofi-levantado" }, x.detalhesEm ? "Detalhes levantados em " + dataBR(x.detalhesEm) + "." : "Os detalhes desta " + (kind === "insumos" ? "página" : "ferramenta") + " ainda não foram levantados pela tarefa agendada."));
  box.append(topo);
  if (d.admin) box.append(acoesAdminItem(kind, x));
  const B = el("div", { class: "ls-blocos ofi-blocos" });
  if (kind === "ferramentas") {
    B.append(bloco("Para que serve", listaTextos(x.paraQueServe)));
    B.append(bloco("Como usar", passosEl(x.comoUsar)));
    B.append(bloco("Segurança", [listaTextos(x.seguranca)]));
  } else {
    B.append(bloco("Tipos e variações", x.tipos && x.tipos.length ? el("dl", { class: "ofi-dl" }, ...x.tipos.flatMap((t) => [el("dt", {}, t.nome), el("dd", {}, t.quandoUsar || "")])) : vazioBloco()));
    B.append(bloco("Como escolher", listaTextos(x.comoEscolher)));
    B.append(bloco("Como aplicar", passosEl(x.comoAplicar)));
    B.append(bloco("Segurança", listaTextos(x.seguranca)));
    B.append(bloco("Compatibilidade", listaTextos(x.compatibilidade)));
    B.append(bloco("Rendimento, validade e armazenagem", [el("h4", {}, "Rendimento"), x.rendimento ? el("p", {}, x.rendimento) : vazioBloco(), el("h4", {}, "Validade e armazenagem"), x.validadeEArmazenagem ? el("p", {}, x.validadeEArmazenagem) : vazioBloco()]));
  }
  B.append(bloco("Curiosidades", x.curiosidades && x.curiosidades.length ? el("ul", { class: "ofi-lista" }, ...x.curiosidades.map((c) => el("li", {}, c.texto, " ", linkFonte(c.fonte)))) : vazioBloco()));
  B.append(blocoTutoriais(x.tutoriais));
  B.append(blocoMarcas(x.marcas));
  B.append(blocoPrecos(x));
  B.append(bloco("Parecidas", d.parecidas && d.parecidas.length ? el("div", { class: "ac-grade ofi-parecidas" }, ...d.parecidas.map((p) => cartaoOf(kind, p, false))) : el("p", { class: "ofi-vazio" }, "Nenhuma outra nesta subcategoria."), "largo"));
  B.append(blocoFontes(x.fontes));
  box.append(B);
}
function blocoTutoriais(l) {
  if (!l || !l.length) return bloco("Tutoriais", vazioBloco());
  const linha = (t) => { const u = OFI().urlHttps(t.url); return el("li", {}, u ? el("a", { href: u, target: "_blank", rel: "noopener" }, t.titulo) : t.titulo,
    el("span", { class: "ofi-meta" }, [t.fonte, t.idioma ? t.idioma.toUpperCase() : "", t.duracao].filter(Boolean).join(" · "))); };
  const vid = l.filter((t) => t.tipo === "video"), art = l.filter((t) => t.tipo !== "video");
  return bloco("Tutoriais", [el("h4", {}, "Vídeos"), vid.length ? el("ul", { class: "ofi-lista ofi-tut" }, ...vid.map(linha)) : el("p", { class: "ofi-vazio" }, "Nenhum vídeo levantado."),
    el("h4", {}, "Artigos"), art.length ? el("ul", { class: "ofi-lista ofi-tut" }, ...art.map(linha)) : el("p", { class: "ofi-vazio" }, "Nenhum artigo levantado.")]);
}
function blocoMarcas(l) {
  if (!l || !l.length) return bloco("Marcas de referência", vazioBloco());
  const partes = [];
  for (const fx of OFI().FAIXAS_MARCA) {
    const m = l.filter((x) => x.faixa === fx.id);
    if (!m.length) continue;
    partes.push(el("h4", {}, fx.nome), el("ul", { class: "ofi-lista" }, ...m.map((x) => el("li", {}, el("b", {}, x.nome), x.nota ? " · " + x.nota : "", " ", linkFonte(x.fonte)))));
  }
  return bloco("Marcas de referência", partes);
}
function blocoPrecos(x) {
  const linhas = OFI().linhasPreco(x, Date.now());
  const tab = el("ul", { class: "ofi-precos" });
  for (const p of linhas) {
    const ver = el("a", { class: "dd-btn dd-btn--outline ofi-ver", href: p.busca, target: "_blank", rel: "noopener", "aria-label": "Ver " + x.nome + " na " + p.nome }, "Ver na loja");
    tab.append(el("li", { class: "ofi-preco" + (p.desatualizado && p.tem ? " velho" : "") }, el("b", { class: "ofi-loja" }, p.nome),
      el("span", { class: "ofi-faixa" }, p.tem ? p.faixa + (x.unidade ? " por " + x.unidade : "") : "sem pesquisa ainda"),
      el("span", { class: "ofi-quando" }, p.tem ? (p.em ? "pesquisado em " + dataBR(p.em) : "sem data") : "busca montada pelo site", p.tem && p.desatualizado ? el("span", { class: "dd-badge b-video ofi-desat" }, "desatualizado") : null),
      p.obs ? el("span", { class: "ofi-obs" }, p.obs) : null, ver));
  }
  return bloco("Preços", [tab, el("p", { class: "ofi-aviso-preco" }, "Faixa pesquisada na data indicada. O preço muda; confira na loja.")], "largo");
}
function blocoFontes(l) {
  return bloco("Fontes", l && l.length ? el("ol", { class: "ofi-lista ofi-fontes" }, ...l.map((f) => { const u = OFI().urlHttps(f.url); return el("li", {}, u ? el("a", { href: u, target: "_blank", rel: "noopener" }, f.titulo) : f.titulo, f.em ? el("span", { class: "ofi-meta" }, dataBR(f.em)) : null); })) : vazioBloco(), "largo");
}
function acoesAdminItem(kind, x) {
  const ed = el("button", { class: "dd-btn dd-btn--outline", type: "button", id: "ofi-editar" }, "Editar");
  ed.addEventListener("click", () => abrirFolhaOf(kind, "item", x));
  const box = el("div", { class: "ls-acoes ofi-acoes-det" }, ed);
  if (!OF.confirmaTirar) {
    const t = el("button", { class: "dd-btn dd-btn--ghost", type: "button", id: "ofi-tirar" }, "Tirar");
    t.addEventListener("click", () => { OF.confirmaTirar = true; renderOficina(); const b = $("ofi-tirar-sim"); if (b) b.focus(); });
    box.append(t);
  } else {
    const sim = el("button", { class: "dd-btn dd-btn--primary", type: "button", id: "ofi-tirar-sim" }, "Tirar de vez");
    const nao = el("button", { class: "dd-btn dd-btn--ghost", type: "button" }, "Manter");
    nao.addEventListener("click", () => { OF.confirmaTirar = false; renderOficina(); });
    sim.addEventListener("click", async () => {
      try { await apiLs("DELETE", "/api/admin/oficina/" + kind + "/" + encodeURIComponent(x.id)); OF.aviso = `${x.nome} saiu da aba ${KIND_TXT[kind].titulo}.`; OF.det.delete(kind + "/" + x.id); OF.dados[kind] = null; OF.confirmaTirar = false; irOficina({ visao: kind }, false); }
      catch (e) { OF.confirmaTirar = false; OF.aviso = e.message; renderOficina(); }
    });
    box.append(el("span", { class: "ofi-confirma", role: "alert" }, `Tirar ${x.nome}? Não dá para desfazer.`), sim, nao);
  }
  return box;
}

/* ---------- Madeiras ---------- */
const nomePais = (() => { let n = null; try { n = new Intl.DisplayNames(["pt-BR"], { type: "region" }); } catch (e) {} return (cc) => (n && n.of(cc)) || cc; })();
function bandeirasEl(origem, max = 5) {
  const O = OFI(), b = O.bandeirasDe(origem, max);
  if (!b.todos.length) return el("span", { class: "ofi-band-vazio" }, "origem não levantada");
  const caixa = el("span", { class: "ofi-bands" });
  for (const cc of b.mostrar) caixa.append(el("span", { class: "ofi-band", role: "img", title: nomePais(cc), "aria-label": nomePais(cc) }, O.bandeira(cc)));
  if (b.mais) caixa.append(el("span", { class: "ofi-band-mais", title: b.todos.slice(max).map(nomePais).join(", "), "aria-label": "e mais " + b.mais + " países: " + b.todos.slice(max).map(nomePais).join(", ") }, "+" + b.mais));
  return caixa;
}
/* medidor de 5 pontos com rótulo escrito; preço com cifrões; vazio esmaecido com "não levantado" */
function medidorEl(nota, n, grande) {
  const O = OFI(), v = n && n.nota;
  const simb = nota.id === "preco" ? "$" : "●";
  const pontos = el("span", { class: "ofi-pontos", "aria-hidden": "true" }, ...[1, 2, 3, 4, 5].map((i) => el("span", { class: i <= (v || 0) ? "on" : "" }, simb)));
  const txt = v ? `${v} de 5` : "não levantado";
  const nivel = v ? (v <= 2 ? nota.baixa : v >= 4 ? nota.alta : "médio") : "";
  return el("div", { class: "ofi-medidor" + (v ? "" : " sem-nota") + (grande ? " g" : ""), role: "img", "aria-label": `${nota.nome}: ${txt}${nivel ? ", " + nivel : ""}` },
    el("span", { class: "ofi-med-rot" }, nota.nome), pontos, el("span", { class: "ofi-med-val" }, v ? String(v) : "não levantado"));
}
function telaGradeMadeiras(box) {
  const O = OFI(), f = OF.filtros.madeiras, todos = ofItens("madeiras");
  const mudar = (patch, foco) => {
    Object.assign(f, patch); ofGuardar(); renderOficina();
    if (foco) { const x = $(foco); if (x) { x.focus({ preventScroll: true }); if (x.setSelectionRange && typeof x.value === "string") { const n = x.value.length; try { x.setSelectionRange(n, n); } catch (e) {} } } }
  };
  const cab = cabOf("madeiras");
  const ac = acoesAdmin("madeiras"); if (ac) cab.append(ac);
  box.append(cab);
  const est = estadoAdmin("madeiras"); if (est) box.append(est);
  if (OF.aviso) { box.append(avisoOf(OF.aviso)); OF.aviso = ""; }
  const busca = el("input", { class: "dd-input", id: "ofi-busca", type: "search", placeholder: "Nome popular ou científico", "aria-label": "Buscar madeira", value: f.q, autocomplete: "off" });
  let t = 0;
  busca.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => mudar({ q: busca.value.trim() }, "ofi-busca"), 250); });
  const paises = O.paisesDe(todos);
  const sel = (id, rot, ops, v, fn) => { const s = el("select", { class: "dd-input", id, "aria-label": rot }); for (const [k, txt] of ops) { const o = el("option", { value: k }, txt); if (k === v) o.selected = true; s.append(o); } s.addEventListener("change", () => fn(s.value)); return s; };
  const pais = sel("ofi-pais", "País de origem", [["", "Todos os países"], ...paises.map((p) => [p.id, O.bandeira(p.id) + " " + nomePais(p.id) + " (" + p.n + ")"])], f.pais, (v) => mudar({ pais: v }, "ofi-pais"));
  const ordem = sel("ofi-ordem", "Ordenar por", [["nome", "Ordenar por nome"], ...O.NOTAS.map((n) => [n.id, "Ordenar por " + n.nome.toLowerCase()])], f.ordem, (v) => mudar({ ordem: v }, "ofi-ordem"));
  box.append(el("div", { class: "ls-ferr" }, busca, pais, ordem));
  const gChips = (rot, id, lista, chave) => {
    const g = el("div", { class: "chips ofi-chips", role: "group", "aria-label": rot }, el("span", { class: "rotulo ofi-rot" }, rot));
    const b0 = O.filtrarMadeiras(todos, { ...f, [chave]: [] });
    for (const x of lista) { const on = f[chave].includes(x.id); g.append(chipOf(id + x.id, on, x.nome, b0.filter((m) => m[chave === "grupos" ? "grupo" : "tipo"] === x.id).length, () => mudar({ [chave]: on ? f[chave].filter((y) => y !== x.id) : f[chave].concat(x.id) }, id + x.id))); }
    return g;
  };
  box.append(gChips("Grupo", "ofi-gr-", O.GRUPOS_MADEIRA, "grupos"), gChips("Tipo", "ofi-tm-", O.TIPOS_MADEIRA, "tipos"));
  // faixas das quatro notas
  const fx = el("div", { class: "ofi-faixas", role: "group", "aria-label": "Faixas das notas" });
  for (const n of O.NOTAS) {
    const r = (f.faixas || {})[n.id] || {};
    const op = [["", "qualquer"], ...[1, 2, 3, 4, 5].map((i) => [String(i), String(i)])];
    const set = (k) => (v) => { const nf = { ...(f.faixas || {}) }; nf[n.id] = { ...(nf[n.id] || {}), [k]: v === "" ? null : Number(v) }; mudar({ faixas: nf }, `ofi-fx-${n.id}-${k}`); };
    fx.append(el("div", { class: "ofi-faixa" }, el("span", { class: "rotulo" }, n.nome),
      el("span", { class: "ofi-fx-de", "aria-hidden": "true" }, "de"), sel(`ofi-fx-${n.id}-min`, n.nome + ": nota mínima", op.map(([k, txt]) => [k, k ? txt : "–"]), r.min != null ? String(r.min) : "", set("min")),
      el("span", { class: "ofi-fx-de", "aria-hidden": "true" }, "até"), sel(`ofi-fx-${n.id}-max`, n.nome + ": nota máxima", op.map(([k, txt]) => [k, k ? txt : "–"]), r.max != null ? String(r.max) : "", set("max"))));
  }
  box.append(fx);
  box.append(el("p", { class: "ofi-nota-escala" }, "Notas de 1 a 5. Dureza pela faixa do Janka; durabilidade pela classe da fonte; raridade e preço com o motivo e a fonte. Sem fonte, a nota fica vazia."));
  // comparar
  OF.sel = OF.sel.filter((id) => todos.some((m) => m.id === id));
  const pc = O.podeComparar(OF.sel, todos);
  const bc = el("button", { class: "dd-btn dd-btn--primary", type: "button", id: "ofi-comparar", title: pc.pode ? "" : pc.motivo }, pc.pode ? `Comparar (${OF.sel.length})` : "Comparar");
  if (!pc.pode) { bc.disabled = true; bc.setAttribute("aria-disabled", "true"); }
  bc.addEventListener("click", () => { if (O.podeComparar(OF.sel, todos).pode) { OF.daGrade = true; OF.rolagem.madeiras = window.scrollY; irOficina({ visao: "madeiras", comparar: OF.sel.slice(0, 4) }); } });
  const lx = OF.sel.length ? el("button", { class: "dd-btn dd-btn--ghost", type: "button", id: "ofi-cmp-limpar" }, "Limpar") : null;
  if (lx) lx.addEventListener("click", () => { OF.sel = []; renderOficina(); });
  box.append(el("div", { class: "ofi-cmp-barra" }, bc, el("span", { class: "ls-aviso", id: "ofi-cmp-motivo" }, pc.pode ? "" : pc.motivo), lx));
  const l = O.ordenarMadeiras(O.filtrarMadeiras(todos, f), f.ordem);
  if (!todos.length) { box.append(el("p", { class: "ls-vazio" }, "Nenhuma madeira cadastrada ainda.")); return; }
  if (!l.length) { box.append(el("p", { class: "ls-vazio" }, "Nenhuma madeira com esses filtros.")); return; }
  box.append(el("p", { class: "ls-aviso ac-conta" }, `${l.length} ${l.length === 1 ? "madeira" : "madeiras"}`));
  box.append(el("div", { class: "ofi-mad-grade" }, ...l.map(cartaoMadeira)));
}
function cartaoMadeira(m) {
  const O = OFI(), marcado = OF.sel.includes(m.id);
  const cx = el("input", { type: "checkbox", id: "ofi-x-" + m.id, "aria-label": "Comparar " + m.nome });
  cx.checked = marcado;
  if (!marcado && OF.sel.length >= 4) { cx.disabled = true; cx.title = "Compare no máximo 4 madeiras de cada vez."; }
  cx.addEventListener("change", () => { OF.sel = cx.checked ? OF.sel.concat(m.id) : OF.sel.filter((x) => x !== m.id); const y = window.scrollY; renderOficina(); window.scrollTo({ top: y }); const n = $("ofi-x-" + m.id); if (n) n.focus({ preventScroll: true }); });
  const a = el("a", { class: "ofi-mad-nome", href: O.escreverHash({ aba: "madeiras", id: m.id }) }, m.nome);
  a.addEventListener("click", (e) => abrirItemOf("madeiras", m.id, e));
  const grupo = (O.GRUPOS_MADEIRA.find((g) => g.id === m.grupo) || {}).nome || "";
  return el("article", { class: "ofi-mad" + (marcado ? " marcado" : ""), id: "ofi-m-" + m.id },
    el("div", { class: "ofi-mad-topo" }, el("div", { class: "ofi-mad-tit" }, a, m.nomeCientifico ? el("i", { class: "ofi-cient" }, m.nomeCientifico) : el("span", { class: "ofi-cient" }, grupo)),
      el("label", { class: "ac-cx", title: "Comparar" }, cx)),
    el("div", { class: "ofi-mad-band" }, bandeirasEl(m.origem), m.protegida ? el("span", { class: "dd-badge b-video", title: "Espécie protegida: confira a legalidade" }, "protegida") : null),
    el("div", { class: "ofi-medidores" }, ...O.NOTAS.map((n) => medidorEl(n, m.notas && m.notas[n.id]))));
}
function telaDetalheMadeira(box, d) {
  const O = OFI(), m = d.item;
  document.title = m.nome + " · Madeiras · Lookout";
  const grupo = (O.GRUPOS_MADEIRA.find((g) => g.id === m.grupo) || {}).nome || "";
  const tipo = (O.TIPOS_MADEIRA.find((g) => g.id === m.tipo) || {}).nome || "";
  const origem = (m.origem || []);
  box.append(el("div", { class: "ls-topo ofi-topo-det" }, ofIcone("madeira", "g"),
    el("div", {}, el("h2", {}, m.nome), m.nomeCientifico ? el("i", { class: "ofi-cient g" }, m.nomeCientifico) : null,
      m.nomesPopulares && m.nomesPopulares.length ? el("span", { class: "ls-repo" }, "também chamada de " + m.nomesPopulares.join(", ")) : null),
    el("div", { class: "ls-chips" }, grupo ? el("span", { class: "dd-badge b-clube" }, grupo) : null, tipo ? el("span", { class: "dd-badge b-noticia" }, tipo) : null, m.familia ? el("span", { class: "dd-badge b-review" }, "família " + m.familia) : null),
    el("div", { class: "ofi-origem" }, el("b", {}, "Onde ocorre: "), origem.length ? el("span", { class: "ofi-bands g" }, ...origem.map((cc) => el("span", { class: "ofi-band-n" }, el("span", { class: "ofi-band", role: "img", "aria-label": nomePais(cc), title: nomePais(cc) }, O.bandeira(cc)), " " + nomePais(cc)))) : el("span", { class: "ofi-vazio" }, NAO_LEVANTADO),
      m.origemNota ? el("p", { class: "ofi-meta" }, m.origemNota) : null)));
  if (m.protegida || (m.legalidade && /protegid|proibid|CITES|DOF|amea/i.test(m.legalidade)))
    box.append(el("p", { class: "ofi-legal", role: "note" }, el("b", {}, "Legalidade: "), m.legalidade || "Espécie com restrição de conservação. Confira a origem legal antes de comprar."));
  if (d.admin) box.append(acoesAdminItem("madeiras", m));
  const notas = m.notas || O.notasDe(m);
  const B = el("div", { class: "ls-blocos ofi-blocos" });
  B.append(bloco("Notas", el("div", { class: "ofi-notas-g" }, ...O.NOTAS.map((n) => {
    const x = notas[n.id] || {};
    const extra = n.id === "dureza" && x.jankaN ? `Janka ${x.jankaN.toLocaleString("pt-BR")} N (${x.jankaLbf.toLocaleString("pt-BR")} lbf)` : n.id === "preco" && x.dado ? x.dado + (x.em ? ", em " + dataBR(x.em) : "") : x.dado;
    return el("div", { class: "ofi-nota-g" }, medidorEl(n, x, true), extra ? el("p", { class: "ofi-nota-dado" }, extra) : el("p", { class: "ofi-nota-dado ofi-vazio" }, x.nota ? "" : "não levantado"), x.fonte ? linkFonte(x.fonte) : null);
  })), "largo"));
  const ficha = [["Densidade", m.densidade && m.densidade.valor ? m.densidade.valor.toLocaleString("pt-BR") + " kg/m³" : ""], ["Cor", m.cor], ["Veio e textura", m.veio], ["Trabalhabilidade", m.trabalhabilidade]];
  B.append(bloco("Ficha", el("dl", { class: "ofi-dl" }, ...ficha.flatMap(([k, v]) => [el("dt", {}, k), el("dd", { class: v ? "" : "ofi-vazio" }, v || NAO_LEVANTADO)]))));
  B.append(bloco("Usos", listaTextos(m.usos)));
  B.append(bloco("Acabamento indicado", listaTextos(m.acabamentoIndicado)));
  B.append(bloco("Cuidados", listaTextos(m.cuidados)));
  B.append(bloco("Legalidade", m.legalidade ? el("p", {}, m.legalidade) : vazioBloco()));
  B.append(bloco("Alternativas", d.alternativas && d.alternativas.length ? el("ul", { class: "ofi-lista" }, ...d.alternativas.map((a) => { const l = el("a", { href: O.escreverHash({ aba: "madeiras", id: a.id }) }, a.nome); l.addEventListener("click", (e) => abrirItemOf("madeiras", a.id, e)); return el("li", {}, l, a.nomeCientifico ? el("i", { class: "ofi-meta" }, " " + a.nomeCientifico) : null); })) : vazioBloco()));
  B.append(bloco("Curiosidades", m.curiosidades && m.curiosidades.length ? el("ul", { class: "ofi-lista" }, ...m.curiosidades.map((c) => el("li", {}, c.texto, " ", linkFonte(c.fonte)))) : vazioBloco()));
  B.append(blocoFontes(m.fontes));
  box.append(B);
}
function telaCompararMadeiras(box) {
  const O = OFI(), todos = ofItens("madeiras");
  const volta = el("a", { class: "dd-btn dd-btn--link ls-volta", href: O.escreverHash({ aba: "madeiras" }), id: "ofi-voltar" }, "← Madeiras");
  volta.addEventListener("click", voltarOf("madeiras"));
  box.append(volta);
  const pc = O.podeComparar(OF.comparar, todos);
  if (!pc.pode) { box.append(el("p", { class: "ls-vazio" }, pc.motivo + " Volte à grade e marque as madeiras.")); return; }
  const ms = pc.ids.map((id) => todos.find((m) => m.id === id));
  document.title = "Comparar madeiras · Lookout";
  box.append(el("div", { class: "ls-cab" }, el("div", {}, el("h2", {}, "Comparar madeiras"), el("p", {}, ms.map((m) => m.nome).join(", ")))));
  const linhas = [
    ...O.NOTAS.map((n) => [n.nome, (m) => { const x = m.notas[n.id] || {}; return el("div", {}, medidorEl(n, x), x.dado ? el("small", { class: "ofi-meta" }, x.dado) : null); }]),
    ["Nome científico", (m) => (m.nomeCientifico ? el("i", {}, m.nomeCientifico) : "")],
    ["Grupo", (m) => (O.GRUPOS_MADEIRA.find((g) => g.id === m.grupo) || {}).nome || ""],
    ["Tipo", (m) => (O.TIPOS_MADEIRA.find((g) => g.id === m.tipo) || {}).nome || ""],
    ["Origem", (m) => bandeirasEl(m.origem)],
    ["Densidade", (m) => (m.densidade ? m.densidade.toLocaleString("pt-BR") + " kg/m³" : el("span", { class: "ofi-vazio" }, "não levantado"))],
  ];
  const tab = el("div", { class: "ofi-cmp", role: "table", "aria-label": "Comparação de madeiras", style: `--n:${ms.length}` },
    el("div", { class: "ofi-cmp-l", role: "row" }, el("span", { role: "columnheader", class: "ofi-cmp-rot" }, ""), ...ms.map((m) => { const a = el("a", { href: O.escreverHash({ aba: "madeiras", id: m.id }) }, m.nome); a.addEventListener("click", (e) => abrirItemOf("madeiras", m.id, e)); return el("span", { role: "columnheader" }, a); })),
    ...linhas.map(([rot, fn]) => el("div", { class: "ofi-cmp-l", role: "row" }, el("span", { role: "rowheader", class: "ofi-cmp-rot" }, rot), ...ms.map((m) => { const v = fn(m); return el("span", { role: "cell" }, v || el("span", { class: "ofi-vazio" }, "não levantado")); }))));
  box.append(el("div", { class: "ofi-cmp-rolo" }, tab));
}

/* ---------- folha do Admin: adicionar, editar, organizar categorias ---------- */
function folhaOfEl() {
  let f = document.getElementById("ofi-folha");
  if (f) return f;
  const veu = el("div", { class: "pers-veu", id: "ofi-veu", hidden: "" });
  veu.addEventListener("click", fecharFolhaOf);
  f = el("div", { class: "pers rd-folha ls-folha ofi-folha", id: "ofi-folha", role: "dialog", "aria-modal": "true", "aria-labelledby": "ofi-folha-titulo", tabindex: "-1", hidden: "" },
    el("div", { class: "painel-topo" }, el("h2", { id: "ofi-folha-titulo" }, ""), (() => { const b = el("button", { class: "dd-btn dd-btn--ghost alvo", type: "button", id: "ofi-folha-fechar" }, "Fechar"); b.addEventListener("click", fecharFolhaOf); return b; })()),
    el("div", { class: "painel-corpo", id: "ofi-folha-corpo" }), el("div", { class: "painel-pe", id: "ofi-folha-pe" }));
  f.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharFolhaOf(); });
  document.body.append(veu, f);
  return f;
}
function abrirFolhaOf(kind, modo, item) {
  const f = folhaOfEl();
  OF.folha = { kind, modo, item, erro: "", salvando: false, abridor: document.activeElement,
    cats: modo === "categorias" ? JSON.parse(JSON.stringify(ofCats(kind))) : null, valores: modo === "item" ? valoresIniciais(kind, item) : null };
  const html = document.documentElement, sb = window.innerWidth - html.clientWidth;
  if (sb > 0) html.style.paddingRight = sb + "px";
  html.classList.add("trava");
  $("ofi-veu").hidden = false; f.hidden = false;
  desenharFolhaOf();
  f.focus({ preventScroll: true });
}
function fecharFolhaOf() {
  const f = document.getElementById("ofi-folha");
  if (!f || f.hidden) return;
  const ab = OF.folha && OF.folha.abridor;
  OF.folha = null; f.hidden = true; $("ofi-veu").hidden = true;
  document.documentElement.classList.remove("trava"); document.documentElement.style.paddingRight = "";
  if (ab && ab.isConnected) ab.focus({ preventScroll: true });
}
function valoresIniciais(kind, item) {
  const v = {};
  for (const c of OFI().CAMPOS[kind]) {
    const x = item ? item[c.k] : undefined;
    if (c.tipo === "objs") v[c.k] = Array.isArray(x) ? x.map((o) => ({ ...o })) : [];
    else if (c.tipo === "precos") v[c.k] = x && typeof x === "object" ? JSON.parse(JSON.stringify(x)) : {};
    else if (c.tipo === "nota") v[c.k] = x && typeof x === "object" ? { ...x } : {};
    else if (c.tipo === "lista" || c.tipo === "multi" || c.tipo === "paises") v[c.k] = Array.isArray(x) ? x.slice() : [];
    else v[c.k] = x == null ? "" : x;
  }
  if (!item && kind !== "madeiras") { v.oficios = []; }
  return v;
}
function desenharFolhaOf() {
  const F = OF.folha; if (!F) return;
  const corpo = $("ofi-folha-corpo"), pe = $("ofi-folha-pe");
  corpo.textContent = ""; pe.textContent = "";
  $("ofi-folha-titulo").textContent = F.modo === "categorias" ? "Organizar categorias" : F.item ? "Editar " + F.item.nome : KIND_TXT[F.kind].add;
  if (F.erro) corpo.append(el("p", { class: "ls-aviso erro", role: "alert", id: "ofi-folha-erro" }, F.erro));
  if (F.modo === "categorias") formCategorias(corpo); else formItem(corpo);
  const ok = el("button", { class: "dd-btn dd-btn--primary", type: "button", id: "ofi-salvar" }, F.salvando ? "Salvando…" : "Salvar");
  if (F.salvando) ok.disabled = true;
  ok.addEventListener("click", salvarFolhaOf);
  const cancelar = el("button", { class: "dd-btn dd-btn--outline", type: "button" }, "Cancelar");
  cancelar.addEventListener("click", fecharFolhaOf);
  pe.append(cancelar, ok);
}
let ofCampoN = 0;
function campoRot(rotulo, ctrl, dica) { const id = ctrl.id || ("ofi-f-" + (++ofCampoN)); ctrl.id = id; return el("div", { class: "ofi-campo" }, el("label", { class: "rotulo", for: id }, rotulo), ctrl, dica ? el("small", { class: "ofi-dica" }, dica) : null); }
function inputEl(c, valor, onv) {
  const O = OFI();
  if (c.tipo === "area") { const t = el("textarea", { class: "dd-input", rows: "3", maxlength: String(c.max) }); t.value = valor || ""; t.addEventListener("input", () => onv(t.value)); return t; }
  if (c.tipo === "sel") { const s = el("select", { class: "dd-input" }); s.append(el("option", { value: "" }, "Escolha")); for (const o of c.opcoes) { const op = el("option", { value: o }, rotuloOpcao(c.k, o)); if (o === valor) op.selected = true; s.append(op); } s.addEventListener("change", () => onv(s.value)); return s; }
  if (c.tipo === "num") { const i = el("input", { class: "dd-input", type: "number", step: c.inteiro ? "1" : "any", ...(c.min != null ? { min: String(c.min) } : {}), ...(c.max != null ? { max: String(c.max) } : {}) }); i.value = valor == null ? "" : String(valor); i.addEventListener("input", () => onv(i.value === "" ? "" : Number(i.value))); return i; }
  const i = el("input", { class: "dd-input", type: c.tipo === "url" ? "url" : "text", ...(c.max ? { maxlength: String(c.max) } : {}), ...(c.tipo === "iso" ? { placeholder: "AAAA-MM-DD" } : {}) });
  i.value = valor || ""; i.addEventListener("input", () => onv(i.value)); return i;
}
function rotuloOpcao(k, o) {
  const O = OFI();
  const tab = { tipo: [...O.TIPOS, ...O.TIPOS_MADEIRA], nivel: O.NIVEIS, faixa: O.FAIXAS_MARCA, grupo: O.GRUPOS_MADEIRA };
  const x = (tab[k] || []).find((y) => y.id === o);
  return x ? x.nome : o === "video" ? "Vídeo" : o === "artigo" ? "Artigo" : o;
}
function formItem(corpo) {
  const F = OF.folha, O = OFI(), V = F.valores, cats = ofCats(F.kind);
  for (const c of O.CAMPOS[F.kind]) {
    const set = (v) => { V[c.k] = v; };
    if (c.tipo === "cat" || c.tipo === "sub") {
      if (c.tipo === "sub") continue;
      const sc = el("select", { class: "dd-input", id: "ofi-f-cat" }), ss = el("select", { class: "dd-input", id: "ofi-f-sub" });
      const encherSub = () => { ss.textContent = ""; ss.append(el("option", { value: "" }, "Escolha")); const c0 = O.catDe(cats, V.categoria); for (const s of (c0 && c0.subcategorias) || []) { const op = el("option", { value: s.id }, s.nome); if (s.id === V.subcategoria) op.selected = true; ss.append(op); } };
      sc.append(el("option", { value: "" }, "Escolha"));
      for (const x of cats) { const op = el("option", { value: x.id }, x.nome); if (x.id === V.categoria) op.selected = true; sc.append(op); }
      sc.addEventListener("change", () => { V.categoria = sc.value; V.subcategoria = ""; encherSub(); });
      ss.addEventListener("change", () => { V.subcategoria = ss.value; });
      encherSub();
      corpo.append(el("div", { class: "ofi-f-dupla" }, campoRot("Categoria", sc), campoRot("Subcategoria", ss)));
      continue;
    }
    if (c.tipo === "multi") {
      const g = el("fieldset", { class: "ofi-campo ofi-multi" }, el("legend", { class: "rotulo" }, c.rotulo));
      for (const o of c.opcoes) { const cb = el("input", { type: "checkbox", value: o }); cb.checked = V[c.k].includes(o); cb.addEventListener("change", () => { V[c.k] = cb.checked ? V[c.k].concat(o) : V[c.k].filter((x) => x !== o); }); g.append(el("label", {}, cb, " " + nomeOficio(o))); }
      corpo.append(g); continue;
    }
    if (c.tipo === "lista" || c.tipo === "paises") {
      const t = el("textarea", { class: "dd-input", rows: c.tipo === "paises" ? "1" : "3" });
      t.value = (V[c.k] || []).join(c.tipo === "paises" ? ", " : "\n");
      t.addEventListener("input", () => { V[c.k] = t.value.split(c.tipo === "paises" ? /[,\s]+/ : /\n/).map((x) => x.trim()).filter(Boolean); });
      corpo.append(campoRot(c.rotulo, t, c.max ? `até ${c.n} linhas de ${c.max} caracteres` : "")); continue;
    }
    if (c.tipo === "objs") { corpo.append(campoObjs(c, V)); continue; }
    if (c.tipo === "nota") {
      const g = el("fieldset", { class: "ofi-campo ofi-grupo" }, el("legend", { class: "rotulo" }, c.rotulo));
      for (const sc of c.campos) g.append(campoRot(sc.rotulo, inputEl(sc, V[c.k][sc.k], (v) => { V[c.k][sc.k] = v; })));
      corpo.append(g); continue;
    }
    if (c.tipo === "precos") { corpo.append(campoPrecos(V)); continue; }
    const ctrl = inputEl(c, V[c.k], set);
    corpo.append(campoRot(c.rotulo, ctrl, c.max && c.tipo !== "sel" ? `até ${c.max} caracteres` : ""));
  }
}
function campoObjs(c, V) {
  const g = el("fieldset", { class: "ofi-campo ofi-grupo" }, el("legend", { class: "rotulo" }, c.rotulo));
  V[c.k].forEach((o, i) => {
    const linha = el("div", { class: "ofi-obj" });
    for (const sc of c.campos) linha.append(campoRot(sc.rotulo, inputEl(sc, o[sc.k], (v) => { o[sc.k] = v; })));
    const rm = el("button", { class: "dd-btn dd-btn--ghost ofi-rm", type: "button", "aria-label": "Tirar o item " + (i + 1) + " de " + c.rotulo }, "Tirar");
    rm.addEventListener("click", () => { V[c.k].splice(i, 1); desenharFolhaOf(); });
    linha.append(rm); g.append(linha);
  });
  if (V[c.k].length < c.n) { const add = el("button", { class: "dd-btn dd-btn--outline", type: "button" }, "Adicionar"); add.addEventListener("click", () => { V[c.k].push({}); desenharFolhaOf(); }); g.append(add); }
  return g;
}
function campoPrecos(V) {
  const O = OFI(), g = el("fieldset", { class: "ofi-campo ofi-grupo" }, el("legend", { class: "rotulo" }, "Preços por loja (em reais)"));
  for (const l of O.LOJAS) {
    const p = V.precos[l.id] || (V.precos[l.id] = null);
    const atual = () => V.precos[l.id] || (V.precos[l.id] = { moeda: "BRL" });
    const linha = el("div", { class: "ofi-obj" }, el("b", {}, l.nome));
    for (const [k, rot, tipo] of [["min", "Mínimo", "num"], ["max", "Máximo", "num"], ["busca", "Busca (https da loja)", "url"], ["em", "Data (AAAA-MM-DD)", "iso"], ["obs", "Observação", "texto"]])
      linha.append(campoRot(rot, inputEl({ k, tipo, max: k === "obs" ? 120 : undefined, min: 0 }, p ? p[k] : "", (v) => { atual()[k] = v; })));
    const rm = el("button", { class: "dd-btn dd-btn--ghost ofi-rm", type: "button" }, "Sem preço nesta loja");
    rm.addEventListener("click", () => { V.precos[l.id] = null; desenharFolhaOf(); });
    linha.append(rm); g.append(linha);
  }
  return g;
}
function formCategorias(corpo) {
  const F = OF.folha, cats = F.cats;
  const mover = (l, i, d) => { const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; desenharFolhaOf(); };
  corpo.append(el("p", { class: "ofi-dica" }, "\"Geralmente indicada para\" aparece embaixo do nome na grade e no detalhe; até 160 caracteres. Categoria ou subcategoria com item dentro não sai."));
  const indInput = (o, rot) => { const i = el("input", { class: "dd-input", type: "text", maxlength: "160", placeholder: "Geralmente indicada para…" }); i.value = o.indicadaPara || ""; const n = el("small", { class: "ofi-dica" }, `${i.value.length}/160`); i.addEventListener("input", () => { o.indicadaPara = i.value; n.textContent = `${i.value.length}/160`; }); return campoRot(rot, i, null).appendChild(n) && i.parentElement; };
  cats.forEach((c, i) => {
    const nome = el("input", { class: "dd-input", type: "text", maxlength: "60" }); nome.value = c.nome; nome.addEventListener("input", () => { c.nome = nome.value; });
    const up = el("button", { class: "dd-btn dd-btn--ghost", type: "button", "aria-label": "Subir " + c.nome }, "↑"); up.addEventListener("click", () => mover(cats, i, -1));
    const dn = el("button", { class: "dd-btn dd-btn--ghost", type: "button", "aria-label": "Descer " + c.nome }, "↓"); dn.addEventListener("click", () => mover(cats, i, 1));
    const rm = el("button", { class: "dd-btn dd-btn--ghost", type: "button", "aria-label": "Tirar " + c.nome }, "Tirar"); rm.addEventListener("click", () => { cats.splice(i, 1); desenharFolhaOf(); });
    const g = el("fieldset", { class: "ofi-campo ofi-grupo ofi-cat-ed" }, el("legend", { class: "rotulo" }, "Categoria"), campoRot("Nome", nome), indInput(c, "Geralmente indicada para (categoria)"), el("div", { class: "ofi-botoes" }, up, dn, rm));
    (c.subcategorias || []).forEach((s, j) => {
      const sn = el("input", { class: "dd-input", type: "text", maxlength: "60" }); sn.value = s.nome; sn.addEventListener("input", () => { s.nome = sn.value; });
      const su = el("button", { class: "dd-btn dd-btn--ghost", type: "button", "aria-label": "Subir " + s.nome }, "↑"); su.addEventListener("click", () => mover(c.subcategorias, j, -1));
      const sd = el("button", { class: "dd-btn dd-btn--ghost", type: "button", "aria-label": "Descer " + s.nome }, "↓"); sd.addEventListener("click", () => mover(c.subcategorias, j, 1));
      const sr = el("button", { class: "dd-btn dd-btn--ghost", type: "button", "aria-label": "Tirar " + s.nome }, "Tirar"); sr.addEventListener("click", () => { c.subcategorias.splice(j, 1); desenharFolhaOf(); });
      g.append(el("div", { class: "ofi-obj ofi-sub-ed" }, campoRot("Subcategoria", sn), indInput(s, "Geralmente indicada para"), el("div", { class: "ofi-botoes" }, su, sd, sr)));
    });
    const add = el("button", { class: "dd-btn dd-btn--outline", type: "button" }, "Nova subcategoria"); add.addEventListener("click", () => { c.subcategorias = (c.subcategorias || []).concat({ nome: "Nova subcategoria" }); desenharFolhaOf(); });
    g.append(add);
    corpo.append(g);
  });
  const nova = el("button", { class: "dd-btn dd-btn--outline", type: "button", id: "ofi-nova-cat" }, "Nova categoria");
  nova.addEventListener("click", () => { cats.push({ nome: "Nova categoria", subcategorias: [{ nome: "Geral" }] }); desenharFolhaOf(); });
  corpo.append(nova);
}
function corpoDoItem(F) {
  const O = OFI(), b = {};
  for (const c of O.CAMPOS[F.kind]) {
    let v = F.valores[c.k];
    if (c.tipo === "precos") { const p = {}; for (const [k, x] of Object.entries(v || {})) { if (x && (x.min !== "" && x.min != null)) p[k] = { ...x, moeda: "BRL" }; else if (F.item && F.item.precos && F.item.precos[k]) p[k] = null; } v = p; }
    if (c.tipo === "nota") { const n = Object.fromEntries(Object.entries(v || {}).filter(([, x]) => x !== "" && x != null)); v = Object.keys(n).length ? n : null; }
    if (c.tipo === "objs") v = (v || []).filter((o) => Object.values(o).some((x) => x !== "" && x != null));
    if (F.item) { const antes = JSON.stringify(F.item[c.k] == null ? (c.tipo === "objs" || c.tipo === "lista" || c.tipo === "multi" || c.tipo === "paises" ? [] : c.tipo === "precos" ? {} : c.tipo === "nota" ? null : "") : F.item[c.k]); if (JSON.stringify(v) === antes) continue; }
    b[c.k] = v === "" ? null : v;
  }
  return b;
}
async function salvarFolhaOf() {
  const F = OF.folha; if (!F || F.salvando) return;
  F.salvando = true; F.erro = ""; desenharFolhaOf();
  try {
    if (F.modo === "categorias") {
      await apiLs("PUT", "/api/admin/oficina/" + (F.kind === "insumos" ? "insumos-categorias" : "categorias"), { categorias: F.cats.map((c) => ({ ...c, nome: String(c.nome || "").trim(), subcategorias: (c.subcategorias || []).map((s) => ({ ...s, nome: String(s.nome || "").trim() })) })) });
      OF.aviso = "Categorias salvas.";
    } else if (F.item) {
      const corpo = corpoDoItem(F);
      if (!Object.keys(corpo).length) { F.salvando = false; F.erro = "Nada mudou."; desenharFolhaOf(); return; }
      await apiLs("PUT", "/api/admin/oficina/" + F.kind + "/" + encodeURIComponent(F.item.id), corpo);
      OF.det.delete(F.kind + "/" + F.item.id);
    } else {
      const r = await apiLs("POST", "/api/admin/oficina/" + F.kind, corpoDoItem(F));
      OF.aviso = "Pronto: " + (F.valores.nome || "item") + " entrou.";
      if (r && r.id) { const kind = F.kind; OF.dados[kind] = null; fecharFolhaOf(); irOficina({ visao: kind, id: r.id }); return; }
    }
    const kind = F.kind; OF.dados[kind] = null; fecharFolhaOf(); ofCarregar(kind, true); renderOficina();
  } catch (e) { if (OF.folha) { OF.folha.salvando = false; OF.folha.erro = e.message; desenharFolhaOf(); const x = $("ofi-folha-erro"); if (x) x.scrollIntoView({ block: "nearest" }); } }
}
