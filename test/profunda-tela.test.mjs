// Tela da comparação profunda (pedido de 19/11, 20h13), rodada de verdade: public/arch-ui.js num contexto do Node com um
// DOM mínimo (só o que a tela usa). Confere a análise em colunas, o filtro "Só o que difere", o doc antigo em Markdown,
// a tela de pendente (texto novo, releitura a cada minuto, sem o aviso de IA) e que nada vira HTML.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import "../public/landscape.js";
import "../public/arch.js";
import { IDS2, IDS3, estrutura2, estrutura3, fontes2, fontes3 } from "./fixtures-profunda.mjs";

const A = globalThis.Arch;

// ---------- DOM mínimo ----------
class Texto { constructor(t) { this.nodeType = 3; this.data = String(t); this.parentNode = null; } get textContent() { return this.data; } }
class No {
  constructor(tag) { this.nodeType = 1; this.tagName = String(tag).toUpperCase(); this.attrs = {}; this.childNodes = []; this.ouvintes = {}; this.style = { cssText: "", setProperty() {} }; this.className = ""; this.parentNode = null; this.hidden = false; this.disabled = false; }
  get id() { return this.attrs.id || ""; } set id(v) { this.attrs.id = String(v); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === "hidden") this.hidden = true; }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; if (k === "hidden") this.hidden = false; }
  get classList() { const n = this; const l = () => n.className.split(/\s+/).filter(Boolean); return { contains: (c) => l().includes(c), add: (...c) => { n.className = [...new Set([...l(), ...c])].join(" "); }, remove: (...c) => { n.className = l().filter((x) => !c.includes(x)).join(" "); }, toggle: (c, on) => { const tem = l().includes(c); const quer = on === undefined ? !tem : on; if (quer && !tem) n.className += " " + c; if (!quer && tem) n.className = l().filter((x) => x !== c).join(" "); return quer; } }; }
  append(...k) { for (const x of k) { if (x == null) continue; const n = typeof x === "object" ? x : new Texto(x); if (n.fragmento) { this.append(...n.childNodes.splice(0)); continue; } if (n.parentNode) n.parentNode.childNodes = n.parentNode.childNodes.filter((c) => c !== n); n.parentNode = this; this.childNodes.push(n); } }
  prepend(...k) { const antes = this.childNodes.splice(0); this.append(...k); this.childNodes.push(...antes); }
  replaceChildren(...k) { this.childNodes = []; this.append(...k); }
  remove() { if (this.parentNode) this.parentNode.childNodes = this.parentNode.childNodes.filter((c) => c !== this); this.parentNode = null; }
  get children() { return this.childNodes.filter((c) => c.nodeType === 1); }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(""); }
  set textContent(v) { this.childNodes = []; if (v !== "" && v != null) this.append(String(v)); }
  get innerText() { return this.textContent; }
  get rows() { return this.childNodes.filter((c) => c.tagName === "TR"); }
  get isConnected() { return false; }
  addEventListener(t, f) { (this.ouvintes[t] = this.ouvintes[t] || []).push(f); }
  dispara(t) { for (const f of this.ouvintes[t] || []) f({ preventDefault() {}, stopPropagation() {}, target: this }); }
  click() { this.dispara("click"); }
  focus() {} select() {} scrollIntoView() {}
  get offsetHeight() { return 0; } get offsetWidth() { return 0; }
  getBoundingClientRect() { return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; }
  cloneNode() { return new No(this.tagName); }
  casa(sel) {
    return sel.split(",").some((s) => {
      s = s.trim();
      const m = /^([a-z0-9]*)((?:[.#][\w-]+|\[[^\]]+\])*)$/i.exec(s);
      if (!m) return false;
      if (m[1] && this.tagName !== m[1].toUpperCase()) return false;
      for (const p of m[2].match(/[.#][\w-]+|\[[^\]]+\]/g) || []) {
        if (p[0] === "." && !this.classList.contains(p.slice(1))) return false;
        if (p[0] === "#" && this.id !== p.slice(1)) return false;
        if (p[0] === "[") { const [k, v] = p.slice(1, -1).split("="); if (!(k in this.attrs)) return false; if (v !== undefined && this.attrs[k] !== v.replace(/^["']|["']$/g, "")) return false; }
      }
      return true;
    });
  }
  /* seletor simples ou descendente ("a .b [role=c]"), com vírgula entre alternativas */
  casaCadeia(sel, raiz) {
    return sel.split(",").some((alt) => {
      const partes = alt.trim().split(/\s+/);
      if (!this.casa(partes[partes.length - 1])) return false;
      let n = this.parentNode, k = partes.length - 2;
      while (k >= 0 && n && n !== raiz) { if (n.casa(partes[k])) k--; n = n.parentNode; }
      return k < 0;
    });
  }
  querySelectorAll(sel) { const out = []; const ir = (n) => { for (const c of n.children) { if (c.casaCadeia(sel, this)) out.push(c); ir(c); } }; ir(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
const doc = {
  body: new No("body"),
  createElement: (t) => new No(t),
  createDocumentFragment: () => { const f = new No("#frag"); f.fragmento = true; return f; },
  querySelector: (s) => doc.body.querySelector(s),
  querySelectorAll: (s) => doc.body.querySelectorAll(s),
  getElementById: (id) => doc.body.querySelector("#" + id),
  addEventListener() {}, visibilityState: "visible", title: "", documentElement: { style: { setProperty() {} }, classList: { add() {}, remove() {} } },
};

// ---------- o contexto da página ----------
const timers = [];
const estado = { est: null };
const ctx = {
  document: doc, console, URL, Date, Math, JSON, Promise, Map, Set, Object, Array, String, Number, Boolean, RegExp, Error, Intl, encodeURIComponent, decodeURIComponent, parseFloat,
  navigator: {}, history: { state: null, length: 2, pushState() {}, replaceState() {}, back() {} }, location: { hash: "" },
  setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout: () => {}, requestAnimationFrame: () => 0, getComputedStyle: () => ({ position: "static", top: "0px" }),
  addEventListener() {},
  Arch: A, Landscape: globalThis.Landscape,
  lsLista: [], lsAdmin: true, lsDet: new Map(),
  esqueleto: () => new No("div"), fmtRel: () => "", carregarLandscape() {}, carregarDetalhe: async () => {}, marcaEl: () => new No("span"), selectLs: () => new No("select"),
  apiLs: async () => { throw new Error("sem rede no teste"); },
  archAtual: () => estado.est, irArch() {}, escreverHash() {}, renderLandscape() {}, emLandscape: () => true, archAbasEl: () => new No("div"),
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("../public/index.html", import.meta.url), "utf8").match(/const el = \(tag, attrs = \{\}, \.\.\.kids\) => \{[\s\S]*?\n\};/)[0].replace("const el", "var el") + "\nvar $ = (id) => document.getElementById(id);", ctx);
vm.runInContext(readFileSync(new URL("../public/arch-ui.js", import.meta.url), "utf8"), ctx);
ctx.AC.dados = { admin: true, servicos: [{ id: "aws--amazon-s3", nome: "Amazon S3", provedor: "aws", subcategoria: "objetos" }, { id: "cloudflare--r2", nome: "R2", provedor: "cloudflare", subcategoria: "objetos" }, { id: "backblaze--backblaze-b2", nome: "Backblaze B2", provedor: "backblaze", subcategoria: "objetos" }],
  provedores: [{ id: "aws", nome: "AWS", cor: "#ff9900" }, { id: "cloudflare", nome: "Cloudflare", cor: "#f38020" }, { id: "backblaze", nome: "Backblaze", cor: "#e21e29" }], categorias: [] };

const doDoc = (id, ids, extra) => ({ id, aba: "cloud", ids: ids.slice().sort(), estado: "pronto", situacao: "pronta", criado: "2026-11-19T15:00:00Z", pedidoEm: "2026-11-19T15:00:00Z", prontoEm: "2026-11-19T16:00:00Z", expiraEm: "2026-12-19T16:00:00Z", markdown: "", fontes: [], ...extra });
function telaDoc(d) {
  ctx.AC.profDoc.set(d.id, d);
  estado.est = { aba: "cloud", tela: "profunda", id: d.id, ids: [] };
  const box = new No("div");
  ctx.telaProfundas(box, estado.est);
  doc.body.replaceChildren(box);
  return box;
}
const texto = (n) => n.textContent.replace(/\s+/g, " ");

test("análise estruturada: colunas na ordem dos itens, índice, selos com texto, fontes numeradas", () => {
  const e = A.estruturaOk(estrutura3(), IDS3, 7);
  const box = telaDoc(doDoc("d00000000000000a3", IDS3, { estrutura: e, fontes: fontes3() }));
  const pf = box.querySelector(".pf");
  assert.ok(pf, "desenha em colunas");
  assert.equal(pf.attrs["data-itens"], "3");
  assert.ok(pf.classList.contains("pf-nn"));
  const cols = box.querySelectorAll(".pf-col").map((c) => c.attrs.title);
  assert.deepEqual(cols, ["Amazon S3 (AWS)", "R2 (Cloudflare)", "Backblaze B2 (Backblaze)"]);
  assert.deepEqual(box.querySelectorAll(".pf-indice .chip").map((c) => c.textContent), ["Resumo", "Fortes e fracos", ...A.TITULOS_GRUPOS, "Cenários", "Não conferido", "Fontes"]);
  assert.equal(box.querySelectorAll("#pf-resumo li").length, 5, "resumo em lista");
  assert.equal(box.querySelectorAll(".pf-card").length, 3);
  assert.ok(box.querySelectorAll(".pf-pontos li").every((li) => li.textContent.length > 2), "ponto sempre com texto, não só o símbolo");
  assert.equal(box.querySelectorAll("#pf-fontes li").length, 7);
  assert.equal(box.querySelector("#pf-f-1").attrs.tabindex, "-1");
  // todo selo tem texto
  const selos = box.querySelectorAll(".pf-selo");
  assert.ok(selos.length > 20);
  assert.ok(selos.every((s) => ["Sim", "Não", "Parcial", "Não conferido", "Forte", "Médio", "Fraco"].includes(s.textContent)));
  // os números das fontes são botões com o nome da fonte para leitor de tela
  const ref = box.querySelector(".pf-ref");
  assert.equal(ref.tagName, "BUTTON"); assert.match(ref.attrs["aria-label"], /^Fonte \d+: /);
  // cenários: o que se perde embaixo da linha
  assert.match(texto(box.querySelector("#pf-cenarios")), /O que se perde: Arquivamento com recuperação em horas/);
  // o aviso de IA está na tela junto da análise
  assert.ok(box.querySelector("#ac-aviso-ia"));
  // nada de juízo nem preço no que a tela escreve
  assert.ok(!/\b(melhor|recomendad|vencedor)/i.test(texto(box)));
  assert.ok(!/R\$|US\$/.test(texto(box)));
});

test("filtro \"Só o que difere\": ligado de saída com mais de 12 linhas, esconde as iguais e marca as que diferem", () => {
  const e = A.estruturaOk(estrutura3(), IDS3, 7);
  const box = telaDoc(doDoc("d00000000000000b3", IDS3, { estrutura: e, fontes: fontes3() }));
  const so = box.querySelector("#pf-so-difere");
  assert.equal(so.attrs["aria-pressed"], "true");
  const linhas = (b) => b.querySelectorAll(".pf-tab [role=rowgroup] .pf-tr").filter((r) => !r.classList.contains("pf-tr-nota") && r.querySelector(".pf-rot")).length;
  const todas = e.grupos.flatMap((g) => g.linhas);
  const dif = todas.filter((l) => l.difere).length;
  assert.equal(linhas(box.querySelector("#pf-g-0")) + linhas(box.querySelector("#pf-g-1")) + linhas(box.querySelector("#pf-g-2")) + linhas(box.querySelector("#pf-g-3")) + linhas(box.querySelector("#pf-g-4")), dif);
  assert.ok(box.querySelectorAll(".pf-tr.dif").length >= dif);
  assert.ok(box.querySelectorAll(".pf-tr.dif .pf-difere").every((x) => x.textContent === "difere"), "o rótulo \"difere\" com texto");
  // desligado: as iguais voltam (menos a não conferida, atrás de "Mostrar não conferidas")
  ctx.AC.pf.get("d00000000000000b3").soDifere = false;
  const box2 = telaDoc(doDoc("d00000000000000b3", IDS3, { estrutura: e, fontes: fontes3() }));
  assert.equal(box2.querySelector("#pf-so-difere").attrs["aria-pressed"], "false");
  const n2 = [0, 1, 2, 3, 4].reduce((k, i) => k + linhas(box2.querySelector("#pf-g-" + i)), 0);
  assert.equal(n2, todas.length - todas.filter(A.linhaNc).length);
  assert.match(box2.querySelector("#pf-mostrar-nc").textContent, /Mostrar não conferidas1/);
  // com 2 itens e 12 linhas, começa desligado
  const box3 = telaDoc(doDoc("d00000000000000c2", IDS2, { estrutura: A.estruturaOk(estrutura2(), IDS2, 5), fontes: fontes2() }));
  assert.equal(box3.querySelector("#pf-so-difere").attrs["aria-pressed"], "false");
  assert.ok(box3.querySelector(".pf").classList.contains("pf-n2"));
});

test("\"Ver em texto\" mostra o Markdown gerado da estrutura; \"Copiar para ADR\" usa o mesmo texto", () => {
  const e = A.estruturaOk(estrutura2(), IDS2, 5);
  const d = doDoc("d00000000000000d2", IDS2, { estrutura: e, fontes: fontes2() });
  let box = telaDoc(d);
  assert.ok(box.querySelector("#pf-copiar-adr"));
  ctx.AC.pf.get(d.id).texto = true;
  box = telaDoc(d);
  assert.ok(!box.querySelector(".pf-cols"), "sem colunas no modo texto");
  const t = box.querySelector("#pf-texto");
  assert.ok(t.querySelector("table"), "as tabelas do Markdown");
  assert.match(texto(t), /Comparação profunda: Amazon S3 × R2/);
  assert.equal(box.querySelector("#pf-ver-texto").textContent, "Ver lado a lado");
});

test("doc antigo, só com Markdown, continua renderizando como antes", () => {
  const box = telaDoc(doDoc("d00000000000000e1", IDS2, { markdown: "## Leitura\n\nTexto <b>antigo</b> com **negrito**.\n\n| | A | B |\n|---|---|---|\n| x | 1 | 2 |", fontes: [{ titulo: "R2", url: "https://developers.cloudflare.com/r2/", em: "2026-11-19T12:00:00Z" }, { titulo: "Ruim", url: "javascript:alert(1)" }] }));
  assert.ok(!box.querySelector(".pf"), "sem estrutura, sem colunas");
  const md = box.querySelector("#ac-analise-md");
  assert.ok(md.querySelector("table")); assert.ok(md.querySelector("strong"));
  assert.match(texto(md), /Texto <b>antigo<\/b> com negrito/, "tag vira texto");
  assert.ok(box.querySelector("#ac-copiar-md"));
  const links = md.querySelectorAll("a").map((a) => a.attrs.href);
  assert.deepEqual(links, ["https://developers.cloudflare.com/r2/"], "só https vira link");
  assert.ok(box.querySelector("#ac-aviso-ia"));
});

test("pendente: hora do pedido, próxima rodada no minuto 37, a tarefa nova, releitura a cada 60 s e sem o aviso de IA", () => {
  timers.length = 0;
  const pedido = new Date(Date.now() - 2 * 60_000).toISOString();
  const box = telaDoc(doDoc("d00000000000000f1", IDS2, { estado: "pendente", situacao: "pendente", prontoEm: null, expiraEm: null, pedidoEm: pedido }));
  const t = texto(box);
  assert.match(t, new RegExp("Pedido feito às " + A.horaSP(pedido) + "\\. A próxima rodada é (às \\d\\d:37|hoje às 7h37|amanhã às 7h37)\\."));
  assert.match(t, /Quem atende é a tarefa “Lookout: comparações profundas”, todo dia das 7h às 23h, no minuto 37\. A análise costuma ficar pronta de 5 a 15 minutos depois/);
  assert.doesNotMatch(t, /plantão/i);
  assert.ok(!box.querySelector("#ac-aviso-ia"), "sem análise na tela, sem o aviso de IA");
  assert.ok(box.querySelector("#ac-prof-abrir"), "não é beco sem saída");
  assert.deepEqual(timers.map((x) => x.ms), [60000], "relê em 60 s");
  assert.equal(ctx.AC.vigia.chave, "d:d00000000000000f1");
  // ficou pronta: a mesma tela desenha a análise e para de reler
  const box2 = telaDoc(doDoc("d00000000000000f1", IDS2, { estrutura: A.estruturaOk(estrutura2(), IDS2, 5), fontes: fontes2() }));
  assert.ok(box2.querySelector(".pf")); assert.equal(ctx.AC.vigia, null);
  // na aba Profunda da comparação, o mesmo texto (e nenhum aviso de IA)
  ctx.AC.prof.set("cloud:" + A.conjunto(IDS2), { pendente: doDoc("d00000000000000f2", IDS2, { estado: "pendente", situacao: "pendente", prontoEm: null, pedidoEm: pedido }), pronta: null, vencida: null, falhou: null });
  estado.est = { aba: "cloud", tela: "comparar", ids: IDS2, profunda: true };
  const b3 = new No("div");
  ctx.abaProfunda(b3, "cloud", IDS2, "objetos", "cloud:" + A.conjunto(IDS2));
  assert.match(texto(b3), /Pedido feito às .* A próxima rodada é/);
  assert.ok(!b3.querySelector("#ac-aviso-ia"));
  assert.ok(b3.querySelector("#ac-prof-ver-rapida"));
  assert.equal(ctx.AC.vigia.chave, "c:cloud:" + A.conjunto(IDS2));
});

test("o código da tela não usa HTML cru nem fala do plantão na profunda", () => {
  const ui = readFileSync(new URL("../public/arch-ui.js", import.meta.url), "utf8");
  assert.doesNotMatch(ui, /innerHTML|insertAdjacentHTML|outerHTML|[{,]\s*html:/);
  assert.doesNotMatch(ui, /plantão/i);
});
