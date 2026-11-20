/* Radar de Saúde (pedido de 20/11): o topo da seção (chips dos produtos, faixa do produto com a situação no Brasil,
 * filtro de confiança), os pedaços do item do feed (selo de confiança, produto, destaque de golpe e alerta) e a tela
 * do Admin "Produtos acompanhados" (#saude/produtos). O feed é o comum; tema, tipo, país (no lugar do "Onde") e busca
 * são os filtros de sempre, e produto, marca e confiança entram por passaSaudeExtra.
 *
 * Script clássico, carregado antes do script principal de index.html: aqui só há declarações. As funções usam, na hora
 * em que rodam, o que o script principal define (el, $, radar, inicio, render, escreverHash, esqueleto, apiLs, itens,
 * temasSel, tipo, escopo, busca). Regras puras em public/saude.js (window.Saude).
 * Texto vindo do banco entra sempre como nó de texto; link só quando é https.
 */
var SA = {
  tela: "feed", produto: "", marca: "", confianca: "todos",
  dados: null, erro: "", pedindo: false, aviso: "", rodar: "",
  edit: {}, erros: {}, confirma: "", salvando: "", novo: null, daFeed: false,
};
const SAU = () => window.Saude;
const SAU_LS = "radar-saude";
const NAO_LEVANTADO_SAU = "Ainda não levantado";
const diaBR = (s) => (/^\d{4}-\d{2}-\d{2}/.test(String(s || "")) ? String(s).slice(8, 10) + "/" + String(s).slice(5, 7) + "/" + String(s).slice(0, 4) : "");

/* ---------- estado, hash e localStorage ---------- */
function saudeLerSalvo() { try { return JSON.parse(localStorage.getItem(SAU_LS) || "null"); } catch (e) { return null; } }
/* tudo o que filtra o feed da Saúde fica junto em radar-saude (produto, marca, temas, tipo, confiança, país, busca) */
function saudeGuardar() {
  if (radar !== "saude" || inicio) return;
  const s = { produto: SA.produto, marca: SA.marca, temas: [...temasSel], tipo, confianca: SA.confianca, pais: escopo, q: busca };
  try { localStorage.setItem(SAU_LS, JSON.stringify(s)); } catch (e) {}
}
/* chamada no fim de aplicarRadar: o que estava salvo volta (o produto, só quando o endereço não pediu outro) */
function saudeAplicarSalvo(comProduto) {
  const f = SAU().filtrosOk(saudeLerSalvo(), SA.dados ? SA.dados.produtos : null);
  if (comProduto) { SA.produto = f.produto; SA.marca = f.marca; }
  SA.confianca = f.confianca;
  temasSel = new Set(f.temas.filter((t) => TEMA[t]));
  tipo = TIPOS.some((t) => t.id === f.tipo) ? f.tipo : "todos";
  escopo = f.pais; busca = f.q;
}
function saudeDoHash() {
  const a = SAU().lerHash(location.hash);
  const tela = a ? a.tela : "feed", produto = a && a.produto ? a.produto : "";
  const mudou = tela !== SA.tela || (tela === "feed" && produto !== SA.produto);
  SA.tela = tela;
  if (tela === "feed") { if (produto !== SA.produto) SA.marca = ""; SA.produto = produto; }
  return mudou;
}
function saudeInicio() { SA.tela = "feed"; const f = SAU().filtrosOk(saudeLerSalvo(), null); SA.produto = f.produto; SA.marca = f.marca; }
const hashSaude = () => SAU().escreverHash({ tela: SA.tela, produto: SA.produto });
const emSaude = () => !inicio && radar === "saude";
const emSaudeProdutos = () => emSaude() && SA.tela === "produtos";
function saudeHashMudou() {
  const antes = SA.tela;
  if (!saudeDoHash()) return;
  if (antes !== SA.tela) SA.aviso = "";
  SA.confirma = ""; render(); window.scrollTo({ top: 0 });
}
/* troca de produto ou de tela: entrada nova no histórico (o Voltar volta para onde estava) */
function irSaude(e, push = true) {
  if (!emSaude()) return;
  if (e.tela && e.tela !== SA.tela) SA.aviso = "";
  if (e.tela) SA.tela = e.tela;
  if ("produto" in e) { if (e.produto !== SA.produto) SA.marca = ""; SA.produto = e.produto || ""; }
  if ("marca" in e) SA.marca = e.marca || "";
  SA.confirma = "";
  escreverHash(push);
  render();
}

/* ---------- dados ---------- */
async function saudeCarregar(forcar) {
  if (SA.pedindo || (SA.dados && !forcar)) return;
  SA.pedindo = true;
  try { SA.dados = await apiLs("GET", "/api/saude/produtos"); SA.erro = ""; }
  catch (e) { if (!SA.dados) SA.erro = e.status === 403 ? "Esta seção não está liberada para você." : e.message; }
  SA.pedindo = false;
  /* produto do endereço que não está mais no radar: volta para Todos (sem entrada nova no histórico) */
  if (SA.dados && SA.produto && !saudeAtivos().some((p) => p.id === SA.produto)) { SA.produto = ""; SA.marca = ""; if (emSaude() && SA.tela === "feed") escreverHash(false); }
  if (SA.dados && SA.marca && !(saudeProduto() && saudeProduto().marcas.some((m) => m.id === SA.marca))) SA.marca = "";
  /* a tela de produtos é só do Admin */
  if (SA.dados && !SA.dados.admin && SA.tela === "produtos") { SA.tela = "feed"; if (emSaude()) escreverHash(false); }
  if (emSaude()) render();
}
const saudeTodos = () => (SA.dados && SA.dados.produtos) || [];
const saudeAtivos = () => saudeTodos().filter((p) => p.ativo !== false);
const saudeProduto = () => saudeTodos().find((p) => p.id === SA.produto) || null;
const saudeAdmin = () => !!(SA.dados && SA.dados.admin);
const nomeProdutoSau = (id) => (saudeTodos().find((p) => p.id === id) || {}).nome || "";
const nomeMarcaSau = (pid, mid) => { const p = saudeTodos().find((x) => x.id === pid); return ((p && p.marcas.find((m) => m.id === mid)) || {}).nome || ""; };

/* ---------- filtros que só a Saúde tem (o resto é o de sempre) ---------- */
/* fora: o grupo que não entra (a contagem de cada grupo de chips usa todos os outros filtros) */
function passaSaudeCom(i, fora = "") {
  const S = SAU();
  return (fora === "produto" || S.passaProduto(i, SA.produto)) && (fora === "marca" || S.passaMarca(i, SA.marca))
    && (fora === "confianca" || SA.confianca === "todos" || (confiancaItem(i) || {}).id === SA.confianca);
}
const passaSaudeExtra = (i) => !emSaude() || passaSaudeCom(i);
const saudeFiltrosAtivos = () => (emSaude() ? (SA.marca ? 1 : 0) + (SA.confianca !== "todos" ? 1 : 0) : 0);
function saudeLimpar() { SA.marca = ""; SA.confianca = "todos"; }

/* ---------- pedaços do item do feed ---------- */
const itemDaSaude = (i) => emSaude() || String((i && i._col) || "").includes("saude");
/* confiança: a gravada; sem ela, relato ou post do Reddit contam como comunidade (o selo nunca falta nesses) */
function confiancaItem(i) {
  const c = SAU().confiancaDe(i.confianca);
  if (c) return c;
  if (i.tipo === "relato" || /(^|\.)reddit\.com$/.test(SAU().hostDe(i.url || ""))) return SAU().confiancaDe("comunidade");
  return null;
}
function saudeTags(i) {
  if (!itemDaSaude(i)) return [];
  const out = [];
  const d = SAU().destaca(i);
  if (d.golpe) out.push(el("span", { class: "dd-badge sau-b-golpe" }, "golpe ou fraude"));
  const c = confiancaItem(i);
  if (c) out.push(el("span", { class: "dd-badge sau-conf sau-conf-" + c.id, title: c.explica }, c.selo));
  if (i.produto && !SA.produto && nomeProdutoSau(i.produto)) out.push(el("span", { class: "dd-badge sau-b-prod" }, nomeProdutoSau(i.produto)));
  for (const m of Array.isArray(i.marcas) ? i.marcas.slice(0, 3) : []) { const n = nomeMarcaSau(i.produto, m); if (n) out.push(el("span", { class: "dd-badge sau-b-marca" }, n)); }
  return out;
}
function saudeClasse(i) {
  if (!itemDaSaude(i)) return "";
  const d = SAU().destaca(i);
  return d.golpe || d.alerta ? " sau-destaque" : "";
}

/* ---------- feed vazio ---------- */
function saudeVazio() {
  const box = el("div", { class: "vazio", id: "feed-vazio" }, el("strong", {}, "Nada por aqui ainda."), "A curadoria roda três vezes ao dia.");
  if (saudeAdmin()) {
    const rodar = el("button", { class: "dd-btn dd-btn--outline", type: "button", id: "sau-rodar" }, SA.rodar === "pedido" ? "Rodada pedida" : "Rodar agora");
    if (SA.rodar === "pedido" || SA.rodar === "pedindo") rodar.disabled = true;
    rodar.addEventListener("click", saudeRodarAgora);
    const prods = el("a", { class: "dd-btn dd-btn--ghost", href: "#saude/produtos", id: "sau-ir-produtos" }, "Produtos acompanhados");
    prods.addEventListener("click", (e) => { e.preventDefault(); SA.daFeed = true; irSaude({ tela: "produtos" }); });
    box.append(el("div", { class: "sau-vazio-acoes" }, rodar, prods));
    if (SA.rodar && SA.rodar !== "pedindo" && SA.rodar !== "pedido") box.append(el("p", { class: "ls-aviso erro", role: "alert" }, SA.rodar));
    if (SA.rodar === "pedido") box.append(el("p", { class: "ls-aviso", role: "status" }, "Pedido gravado. O plantão confere de hora em hora, das 7h às 23h."));
  }
  return box;
}
async function saudeRodarAgora() {
  if (SA.rodar === "pedindo" || SA.rodar === "pedido") return;
  SA.rodar = "pedindo"; renderFeed();
  try { await apiLs("POST", "/api/admin/pedidos", { secao: "saude", agora: true }); SA.rodar = "pedido"; }
  catch (e) { SA.rodar = e.message || "Não deu para pedir a rodada agora."; }
  renderFeed();
  const b = $("sau-rodar"); if (b) b.focus({ preventScroll: true });
}

/* ---------- topo da seção ---------- */
function renderSaude() {
  const topo = $("saude-topo"), tela = $("saude-produtos");
  if (!topo || !tela) return;
  const on = emSaude();
  topo.hidden = !on || SA.tela === "produtos";
  tela.hidden = !emSaudeProdutos();
  if (!on) { topo.textContent = ""; tela.textContent = ""; return; }
  if (!SA.dados && !SA.erro) saudeCarregar();
  saudeGuardar();
  if (SA.tela === "produtos") { renderSaudeProdutos(tela); return; }
  document.title = (saudeProduto() ? saudeProduto().nome + " · " : "") + "Radar de Saúde · Lookout";
  const box = document.createDocumentFragment();
  const cab = el("div", { class: "sau-cab" },
    el("div", { class: "sau-tit" }, el("p", { class: "ofi-sub" }, R().subtitulo), el("p", { class: "sau-aviso", id: "sau-aviso" }, "Radar de notícias. Não é orientação médica.")));
  if (saudeAdmin()) {
    const b = el("a", { class: "dd-btn dd-btn--outline", href: "#saude/produtos", id: "sau-produtos" }, "Produtos acompanhados");
    b.addEventListener("click", (e) => { e.preventDefault(); SA.daFeed = true; irSaude({ tela: "produtos" }); });
    cab.append(b);
  }
  box.append(cab);
  if (SA.erro && !SA.dados) {
    const b = el("button", { class: "dd-btn dd-btn--link", type: "button" }, "Tentar de novo");
    b.addEventListener("click", () => { SA.erro = ""; saudeCarregar(true); renderSaude(); });
    box.append(el("p", { class: "ls-aviso erro" }, "Não deu para carregar os produtos agora. " + SA.erro + " ", b));
  }
  // chips dos produtos ativos, com "Todos"
  const base = (fora) => fonteItens().filter((i) => passaBusca(i) && passaRel(i) && passaEscopo(i) && passaTipo(i, tipo) && passaTema(i) && passaSaudeCom(i, fora));
  const ativos = saudeAtivos();
  if (ativos.length) {
    const bp = base("produto"), contP = {}; bp.forEach((i) => { contP[i.produto] = (contP[i.produto] || 0) + 1; });
    const g = el("div", { class: "chips sau-prods", role: "group", "aria-label": "Produto" });
    const chip = (id, nome, n) => {
      const b = el("button", { class: "chip", type: "button", id: "sau-p-" + (id || "todos"), "aria-pressed": String(SA.produto === id) }, nome, el("span", { class: "k" }, String(n)));
      b.addEventListener("click", () => { if (SA.produto !== id) { irSaude({ produto: id }); const x = $("sau-p-" + (id || "todos")); if (x) x.focus({ preventScroll: true }); } });
      return b;
    };
    g.append(chip("", "Todos", bp.length));
    for (const p of ativos) g.append(chip(p.id, p.nome, contP[p.id] || 0));
    box.append(g);
  } else if (SA.dados) {
    box.append(el("p", { class: "ls-aviso" }, saudeAdmin() ? "Nenhum produto ativo. Adicione ou reative um em Produtos acompanhados." : "Nenhum produto acompanhado por enquanto."));
  }
  const p = saudeProduto();
  if (p && p.ativo !== false) box.append(faixaProduto(p, base("marca")));
  // confiança
  const bc = base("confianca"), contC = {}; bc.forEach((i) => { const c = confiancaItem(i); if (c) contC[c.id] = (contC[c.id] || 0) + 1; });
  const gc = el("div", { class: "chips sau-conf-chips", role: "group", "aria-label": "Confiança da fonte" }, el("span", { class: "rotulo ofi-rot" }, "Fonte"));
  for (const c of [{ id: "todos", nome: "Todas" }, ...SAU().CONFIANCAS]) {
    const n = c.id === "todos" ? bc.length : contC[c.id] || 0;
    const b = el("button", { class: "chip", type: "button", id: "sau-c-" + c.id, "aria-pressed": String(SA.confianca === c.id), ...(c.explica ? { title: c.explica } : {}) }, c.nome, el("span", { class: "k" }, String(n)));
    b.addEventListener("click", () => { SA.confianca = c.id; render(); const x = $("sau-c-" + c.id); if (x) x.focus({ preventScroll: true }); });
    gc.append(b);
  }
  box.append(gc);
  topo.replaceChildren(box);
}
function faixaProduto(p, baseMarca) {
  const marcas = p.marcas || [];
  const cont = {}; baseMarca.forEach((i) => (Array.isArray(i.marcas) ? i.marcas : []).forEach((m) => { cont[m] = (cont[m] || 0) + 1; }));
  const tit = el("div", { class: "sau-faixa-tit" }, el("h2", { id: "sau-faixa-nome" }, p.nome), p.tipo ? el("span", { class: "dd-badge b-noticia" }, p.tipo) : null);
  const ap = p.apelidos && p.apelidos.length ? el("p", { class: "sau-apelidos" }, "Também aparece como " + p.apelidos.join(", ") + ".") : null;
  const resumo = p.resumo ? el("p", { class: "sau-resumo" }, p.resumo) : null;
  let gm = null;
  if (marcas.length) {
    gm = el("div", { class: "chips sau-marcas", role: "group", "aria-label": "Marcas e lojas acompanhadas" }, el("span", { class: "rotulo ofi-rot" }, "Marcas"));
    for (const m of marcas) {
      const on = SA.marca === m.id;
      const t = SAU().tipoMarcaDe(m.tipo);
      const b = el("button", { class: "chip", type: "button", id: "sau-m-" + m.id, "aria-pressed": String(on), title: (t ? t.nome : "") + (m.nota ? ": " + m.nota : "") }, m.nome, el("span", { class: "k" }, String(cont[m.id] || 0)));
      b.addEventListener("click", () => { SA.marca = on ? "" : m.id; render(); const x = $("sau-m-" + m.id); if (x) x.focus({ preventScroll: true }); });
      gm.append(b);
    }
  }
  const s = p.situacaoBrasil;
  const sit = el("div", { class: "sau-situacao", id: "sau-situacao" }, el("h3", {}, "Situação no Brasil"),
    s ? el("p", {}, s.texto) : el("p", { class: "ofi-vazio" }, NAO_LEVANTADO_SAU),
    s ? el("p", { class: "sau-sit-pe" }, "Levantado em " + diaBR(s.em) + " · ", linkSau(s.fonte, "fonte: " + SAU().hostDe(s.fonte))) : null);
  return el("section", { class: "sau-faixa", "aria-labelledby": "sau-faixa-nome" }, el("div", { class: "sau-faixa-info" }, tit, ap, resumo, gm), sit);
}
const linkSau = (u, txt) => { const ok = SAU().urlHttps(u); return ok ? el("a", { href: ok, target: "_blank", rel: "noopener" }, txt) : null; };

/* ---------- tela do Admin: Produtos acompanhados (#saude/produtos) ---------- */
const OPCOES_TIPO_MARCA = () => SAU().TIPOS_MARCA;
function editDe(p) {
  if (!SA.edit[p.id]) SA.edit[p.id] = { nome: p.nome, apelidos: (p.apelidos || []).join("\n"), tipo: p.tipo || "", resumo: p.resumo || "", marcas: (p.marcas || []).map((m) => ({ ...m })), nova: { nome: "", tipo: "", nota: "" } };
  return SA.edit[p.id];
}
const linhas = (t) => String(t || "").split("\n").map((x) => x.trim()).filter(Boolean);
let sauCampoN = 0;
function campoSau(rotulo, ctrl, dica) { if (!ctrl.id) ctrl.id = "sau-f-" + (++sauCampoN); return el("div", { class: "ofi-campo" }, el("label", { class: "rotulo", for: ctrl.id }, rotulo), ctrl, dica ? el("small", { class: "ofi-dica" }, dica) : null); }
function entrada(tipoCampo, valor, onv, op = {}) {
  const i = tipoCampo === "area" ? el("textarea", { class: "dd-input", rows: String(op.linhas || 3), ...(op.max ? { maxlength: String(op.max) } : {}) }) : el("input", { class: "dd-input", type: "text", ...(op.max ? { maxlength: String(op.max) } : {}) });
  if (op.id) i.id = op.id;
  if (op.placeholder) i.placeholder = op.placeholder;
  i.value = valor || "";
  i.addEventListener("input", () => onv(i.value));
  return i;
}
function selTipoMarca(valor, onv, id) {
  const s = el("select", { class: "dd-input", id });
  s.append(el("option", { value: "" }, "Escolha"));
  for (const t of OPCOES_TIPO_MARCA()) { const o = el("option", { value: t.id }, t.nome); if (t.id === valor) o.selected = true; s.append(o); }
  s.addEventListener("change", () => onv(s.value));
  return s;
}
function renderSaudeProdutos(tela) {
  document.title = "Produtos acompanhados · Radar de Saúde · Lookout";
  const foco = document.activeElement && document.activeElement.id;
  const box = document.createDocumentFragment();
  const volta = el("a", { class: "dd-btn dd-btn--link ls-volta", href: "#saude" + (SA.produto ? "/" + encodeURIComponent(SA.produto) : ""), id: "sau-voltar" }, "← Radar de Saúde");
  volta.addEventListener("click", (e) => {
    e.preventDefault();
    if (SA.daFeed && history.length > 1) { SA.daFeed = false; history.back(); return; }
    irSaude({ tela: "feed" });
  });
  box.append(volta);
  if (!SA.dados) { box.append(SA.erro ? el("p", { class: "ls-vazio" }, SA.erro) : esqueleto(4)); tela.replaceChildren(box); return; }
  const todos = saudeTodos();
  box.append(el("div", { class: "ls-cab" }, el("div", {}, el("h2", {}, "Produtos acompanhados"),
    el("p", {}, `${todos.length} de ${SAU().MAX_PRODUTOS}. A coleta e a curadoria procuram cada produto ativo pelo nome, pelos apelidos e pelas marcas. Pausado sai da coleta e dos chips, mas fica guardado.`))));
  /* o aviso fica até a próxima ação (saudeSalvar, adicionar, remover) */
  if (SA.aviso) box.append(el("p", { class: "ls-aviso", role: "status", id: "sau-aviso-admin" }, SA.aviso));
  box.append(formNovo(todos.length >= SAU().MAX_PRODUTOS));
  const lista = el("div", { class: "sau-lista" });
  if (!todos.length) lista.append(el("p", { class: "ls-vazio" }, "Nenhum produto ainda. Adicione o primeiro acima."));
  for (const p of todos) lista.append(cartaoProduto(p));
  box.append(lista);
  tela.replaceChildren(box);
  if (foco && $(foco)) $(foco).focus({ preventScroll: true });
}
function formNovo(cheio) {
  if (!SA.novo) SA.novo = { nome: "", apelidos: "", tipo: "", resumo: "" };
  const N = SA.novo;
  const f = el("fieldset", { class: "ofi-grupo sau-novo" }, el("legend", { class: "rotulo" }, "Adicionar produto"));
  if (SA.erros.novo) f.append(el("p", { class: "ls-aviso erro", role: "alert", id: "sau-novo-erro" }, SA.erros.novo));
  f.append(el("div", { class: "ofi-f-dupla" },
    campoSau("Nome", entrada("texto", N.nome, (v) => { N.nome = v; }, { max: 80, id: "sau-novo-nome" })),
    campoSau("Tipo (texto livre)", entrada("texto", N.tipo, (v) => { N.tipo = v; }, { max: 60, id: "sau-novo-tipo", placeholder: "medicamento em estudo, suplemento…" }))));
  f.append(campoSau("Apelidos e outras grafias (um por linha)", entrada("area", N.apelidos, (v) => { N.apelidos = v; }, { id: "sau-novo-apelidos" }), `até ${SAU().MAX_APELIDOS}, cada um com até 60 caracteres`));
  f.append(campoSau("Resumo", entrada("area", N.resumo, (v) => { N.resumo = v; }, { max: 240, linhas: 2, id: "sau-novo-resumo" }), "até 240 caracteres; deixe vazio se não tiver fonte"));
  const ok = el("button", { class: "dd-btn dd-btn--primary", type: "button", id: "sau-novo-salvar" }, SA.salvando === "novo" ? "Adicionando…" : "Adicionar produto");
  if (cheio || SA.salvando === "novo") ok.disabled = true;
  if (cheio) ok.title = `O radar acompanha até ${SAU().MAX_PRODUTOS} produtos.`;
  ok.addEventListener("click", async () => {
    SA.salvando = "novo"; SA.erros.novo = ""; SA.aviso = ""; render();
    try {
      const r = await apiLs("POST", "/api/admin/saude/produtos", { nome: N.nome, apelidos: linhas(N.apelidos), tipo: N.tipo, resumo: N.resumo });
      SA.aviso = `Pronto: ${(r.produto && r.produto.nome) || N.nome} entrou no radar.`; SA.novo = null;
      await saudeRecarregar();
    } catch (e) { SA.erros.novo = e.message; }
    SA.salvando = ""; render();
    const x = $(SA.erros.novo ? "sau-novo-erro" : "sau-novo-nome"); if (x) x.focus({ preventScroll: !!SA.erros.novo });
  });
  f.append(el("div", { class: "ls-acoes" }, ok));
  return f;
}
async function saudeRecarregar() { const d = SA.dados; SA.dados = null; SA.pedindo = false; await saudeCarregar(true); if (!SA.dados) SA.dados = d; }
function cartaoProduto(p) {
  const E = editDe(p), pid = p.id;
  const f = el("article", { class: "sau-prod" + (p.ativo === false ? " pausado" : ""), id: "sau-prod-" + pid, "aria-labelledby": "sau-prod-t-" + pid });
  f.append(el("div", { class: "sau-prod-topo" }, el("h3", { id: "sau-prod-t-" + pid }, p.nome),
    el("span", { class: "dd-badge " + (p.ativo === false ? "b-review" : "b-curso") }, p.ativo === false ? "pausado" : "ativo"),
    el("span", { class: "ofi-meta" }, "id " + pid)));
  if (SA.erros[pid]) f.append(el("p", { class: "ls-aviso erro", role: "alert", id: "sau-erro-" + pid }, SA.erros[pid]));
  f.append(el("div", { class: "ofi-f-dupla" },
    campoSau("Nome", entrada("texto", E.nome, (v) => { E.nome = v; }, { max: 80, id: "sau-nome-" + pid })),
    campoSau("Tipo (texto livre)", entrada("texto", E.tipo, (v) => { E.tipo = v; }, { max: 60, id: "sau-tipo-" + pid }))));
  f.append(campoSau("Apelidos e outras grafias (um por linha)", entrada("area", E.apelidos, (v) => { E.apelidos = v; }, { id: "sau-apelidos-" + pid, linhas: Math.min(SAU().MAX_APELIDOS, Math.max(3, linhas(E.apelidos).length + 1)) }), `até ${SAU().MAX_APELIDOS}; com menos de 4 letras, só contam em feed do próprio assunto`));
  f.append(campoSau("Resumo", entrada("area", E.resumo, (v) => { E.resumo = v; }, { max: 240, linhas: 2, id: "sau-resumo-" + pid })));
  // marcas
  const gm = el("fieldset", { class: "ofi-grupo sau-marcas-ed" }, el("legend", { class: "rotulo" }, `Marcas e lojas (${E.marcas.length} de ${SAU().MAX_MARCAS})`));
  if (!E.marcas.length) gm.append(el("p", { class: "ofi-vazio" }, "Nenhuma marca ligada a este produto."));
  E.marcas.forEach((m, k) => {
    const rm = el("button", { class: "dd-btn dd-btn--ghost ofi-rm", type: "button", id: `sau-rm-${pid}-${m.id || k}`, "aria-label": "Tirar " + (m.nome || "marca") + " de " + p.nome }, "Tirar");
    rm.addEventListener("click", () => { E.marcas.splice(k, 1); render(); const x = $("sau-m-add-" + pid); if (x) x.focus({ preventScroll: true }); });
    gm.append(el("div", { class: "ofi-obj sau-marca-l" },
      campoSau("Nome", entrada("texto", m.nome, (v) => { m.nome = v; }, { max: 60, id: `sau-mn-${pid}-${k}` })),
      campoSau("Tipo", selTipoMarca(m.tipo, (v) => { m.tipo = v; }, `sau-mt-${pid}-${k}`)),
      campoSau("Nota", entrada("texto", m.nota, (v) => { m.nota = v; }, { max: 160, id: `sau-mo-${pid}-${k}` })), rm));
  });
  if (E.marcas.length < SAU().MAX_MARCAS) {
    const add = el("button", { class: "dd-btn dd-btn--outline", type: "button", id: "sau-m-add-" + pid }, "Pôr marca ou loja");
    add.addEventListener("click", () => { E.marcas.push({ nome: "", tipo: "", nota: "" }); render(); const x = $(`sau-mn-${pid}-${E.marcas.length - 1}`); if (x) x.focus(); });
    gm.append(add);
  }
  f.append(gm);
  // situação no Brasil (só leitura: quem preenche é a curadoria, sempre com fonte)
  const s = p.situacaoBrasil;
  f.append(el("div", { class: "sau-situacao" }, el("h4", {}, "Situação no Brasil"), s ? el("p", {}, s.texto) : el("p", { class: "ofi-vazio" }, NAO_LEVANTADO_SAU),
    s ? el("p", { class: "sau-sit-pe" }, "Levantado em " + diaBR(s.em) + " · ", linkSau(s.fonte, "fonte: " + SAU().hostDe(s.fonte))) : el("p", { class: "ofi-dica" }, "A curadoria preenche, sempre com a fonte.")));
  // ações
  const salvando = SA.salvando === pid;
  const salvar = el("button", { class: "dd-btn dd-btn--primary", type: "button", id: "sau-salvar-" + pid }, salvando ? "Salvando…" : "Salvar");
  if (salvando) salvar.disabled = true;
  salvar.addEventListener("click", () => saudeSalvar(p, { nome: E.nome, apelidos: linhas(E.apelidos), tipo: E.tipo, resumo: E.resumo, marcas: E.marcas.filter((m) => m.nome || m.tipo || m.nota).map((m) => ({ ...(m.id ? { id: m.id } : {}), nome: m.nome, tipo: m.tipo, nota: m.nota || "" })) }, "Alterações salvas em " + p.nome + "."));
  const pausar = el("button", { class: "dd-btn dd-btn--outline", type: "button", id: "sau-pausar-" + pid }, p.ativo === false ? "Reativar" : "Pausar");
  pausar.addEventListener("click", () => saudeSalvar(p, { ativo: p.ativo === false }, p.ativo === false ? p.nome + " voltou para a coleta." : p.nome + " está pausado: sai da coleta e dos chips."));
  const acoes = el("div", { class: "ls-acoes sau-acoes" }, salvar, pausar);
  if (SA.confirma !== pid) {
    const rem = el("button", { class: "dd-btn dd-btn--ghost", type: "button", id: "sau-remover-" + pid }, "Remover");
    rem.addEventListener("click", () => { SA.confirma = pid; render(); const b = $("sau-remover-sim-" + pid); if (b) b.focus(); });
    acoes.append(rem);
  } else {
    const sim = el("button", { class: "dd-btn dd-btn--primary", type: "button", id: "sau-remover-sim-" + pid }, "Remover de vez");
    const nao = el("button", { class: "dd-btn dd-btn--ghost", type: "button", id: "sau-remover-nao-" + pid }, "Manter");
    nao.addEventListener("click", () => { SA.confirma = ""; render(); const b = $("sau-remover-" + pid); if (b) b.focus(); });
    sim.addEventListener("click", async () => {
      SA.aviso = "";
      try { await apiLs("DELETE", "/api/admin/saude/produtos/" + encodeURIComponent(pid)); SA.aviso = p.nome + " saiu do radar. As notícias que já entraram ficam até a limpeza por idade."; delete SA.edit[pid]; if (SA.produto === pid) { SA.produto = ""; SA.marca = ""; } await saudeRecarregar(); }
      catch (e) { SA.erros[pid] = e.message; }
      SA.confirma = ""; render();
    });
    acoes.append(el("span", { class: "ofi-confirma", role: "alert" }, `Remover ${p.nome}? Não dá para desfazer.`), sim, nao);
  }
  f.append(acoes);
  return f;
}
async function saudeSalvar(p, corpo, msg) {
  SA.salvando = p.id; SA.erros[p.id] = ""; SA.aviso = ""; render();
  try {
    await apiLs("PUT", "/api/admin/saude/produtos/" + encodeURIComponent(p.id), corpo);
    SA.aviso = msg; delete SA.edit[p.id];
    await saudeRecarregar();
  } catch (e) { SA.erros[p.id] = e.message; }
  SA.salvando = ""; render();
  const x = $(SA.erros[p.id] ? "sau-erro-" + p.id : "sau-salvar-" + p.id); if (x) x.focus({ preventScroll: true });
}
