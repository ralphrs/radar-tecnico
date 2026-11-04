/* Campos com formato pelo tipo: moeda, percentual, número, inteiro, data, mês/ano e papel.
 *
 * Script clássico (<script src="/campo.js">), carregado antes da página e do tabela.js. A página usa window.Campo e
 * window.Fmt; os testes em Node importam pelo efeito (import "../public/campo.js") e leem globalThis.Campo.
 *
 * Campo.ligar(input, { tipo, casas, min, max, moeda: "BRL" | "USD", obrigatorio, msgApos })
 *   Formata ao abrir e ao sair do campo; ao focar mostra o valor limpo (sem R$, sem % e sem ponto de milhar, vírgula
 *   decimal mantida). Enter confirma, ↑/↓ somam ou tiram 1 (Shift: 10) nos numéricos, colar aceita qualquer formato.
 *   Valor inválido marca aria-invalid e mostra uma mensagem curta embaixo, sem travar a digitação.
 * Campo.valor(input): número cru (null se vazio ou inválido), ISO "AAAA-MM-DD" na data, "AAAA-MM" no mês/ano e a
 *   string em caixa alta no papel. Nada de "R$" ou "%" vai para o servidor.
 * Funções puras (sem DOM, testadas no Node): Campo.ler(tipo, texto, op) -> { valor, erro }, Campo.formatar(tipo, valor,
 *   op), Campo.limpo(tipo, valor, op), Campo.mascara(tipo, texto).
 * Fmt: as funções de formatar número da página (Fmt.num, Fmt.moeda, Fmt.pct, Fmt.data, Fmt.mes).
 */
(function (raiz) {
  "use strict";

  /* ---------- formatar (o mesmo toLocaleString que a página já usava em fmtNum) ---------- */
  const num = (v, casas) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const simbolo = (moeda) => (moeda === "USD" ? "US$ " : "R$ ");
  const Fmt = {
    num,
    moeda: (v, casas = 2, moeda = "BRL") => (v < 0 ? "-" : "") + simbolo(moeda) + num(Math.abs(v), casas),
    pct: (v, casas = 1) => num(v, casas) + " %",
    data: (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || "") ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : ""),
    mes: (ym) => (/^\d{4}-\d{2}$/.test(ym || "") ? ym.slice(5, 7) + "/" + ym.slice(0, 4) : ""),
  };

  const NUMERICOS = ["moeda", "percentual", "numero", "inteiro"];
  const CASAS = { moeda: 2, percentual: 1, numero: 2, inteiro: 0 };
  const casasDe = (tipo, op) => (tipo === "inteiro" ? 0 : op && Number.isInteger(op.casas) ? op.casas : CASAS[tipo]);
  const ERRO = { numero: "Use um número", inteiro: "Use um número inteiro", data: "Data inválida", mesano: "Use mês e ano, como 03/2027", papel: "Use o código do papel, como PETR4" };

  /* "R$ 2.000,50", "2000,5", "2.000", "11.9", "11,9%", "2k", "1,5m", "1,5 mi", "2 mil" -> número; null se vazio */
  function lerNumero(texto) {
    let s = String(texto == null ? "" : texto).trim().toLowerCase().replace(/\s+/g, "");
    if (!s) return { valor: null };
    s = s.replace(/^(r\$|us\$|\$)/, "").replace(/(r\$|us\$)$/, "").replace(/%$/, "");
    let mult = 1;
    const suf = /(k|mil|mi|m|bi|b)$/.exec(s);
    if (suf) { mult = { k: 1e3, mil: 1e3, m: 1e6, mi: 1e6, b: 1e9, bi: 1e9 }[suf[1]]; s = s.slice(0, -suf[1].length); }
    s = s.replace(/^\+/, "").replace(/^[−–]/, "-");
    if (!/^-?[\d.,]+$/.test(s) || !/\d/.test(s)) return { valor: null, erro: true };
    let n;
    if (s.includes(",")) {
      /* vírgula decimal: os pontos são milhar */
      if (s.indexOf(",") !== s.lastIndexOf(",")) return { valor: null, erro: true };
      const [int, dec] = s.split(",");
      if (int.includes(".") && !/^-?\d{1,3}(\.\d{3})+$/.test(int)) return { valor: null, erro: true };
      n = Number(int.replace(/\./g, "") + "." + dec);
    } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) n = Number(s.replace(/\./g, "")); /* 2.000 e 1.500.000 */
    else if ((s.match(/\./g) || []).length > 1) return { valor: null, erro: true };
    else n = Number(s); /* 11.9 */
    if (!Number.isFinite(n)) return { valor: null, erro: true };
    return { valor: Math.round(n * mult * 1e8) / 1e8 };
  }

  const bissexto = (a) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
  const diasNoMes = (a, m) => [31, bissexto(a) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  const ano4 = (a) => (String(a).length <= 2 ? 2000 + Number(a) : Number(a));
  const p2 = (n) => String(n).padStart(2, "0");

  /* Lê o texto de um campo. Devolve { valor } (valor null quando vazio) ou { valor: null, erro: "mensagem" }. */
  function ler(tipo, texto, op = {}) {
    const t = String(texto == null ? "" : texto).trim();
    if (!t) return op.obrigatorio ? { valor: null, erro: "Preencha este campo" } : { valor: null };
    if (NUMERICOS.includes(tipo)) {
      const r = lerNumero(t);
      if (r.erro || r.valor == null) return { valor: null, erro: ERRO[tipo === "inteiro" ? "inteiro" : "numero"] };
      if (tipo === "inteiro" && !Number.isInteger(r.valor)) return { valor: null, erro: ERRO.inteiro };
      return { valor: r.valor };
    }
    if (tipo === "data") {
      let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t), a, me, d;
      if (m) [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
      else if ((m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/.exec(t))) [d, me, a] = [Number(m[1]), Number(m[2]), ano4(m[3])];
      else if ((m = /^(\d{2})(\d{2})(\d{4})$/.exec(t))) [d, me, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
      else return { valor: null, erro: ERRO.data };
      if (me < 1 || me > 12 || d < 1 || d > diasNoMes(a, me) || a < 1900 || a > 2200) return { valor: null, erro: ERRO.data };
      return { valor: `${a}-${p2(me)}-${p2(d)}` };
    }
    if (tipo === "mesano") {
      let m = /^(\d{4})-(\d{1,2})$/.exec(t), a, me;
      if (m) [a, me] = [Number(m[1]), Number(m[2])];
      else if ((m = /^(\d{1,2})[/.\-](\d{2}|\d{4})$/.exec(t))) [me, a] = [Number(m[1]), ano4(m[2])];
      else if ((m = /^(\d{2})(\d{4})$/.exec(t))) [me, a] = [Number(m[1]), Number(m[2])];
      else return { valor: null, erro: ERRO.mesano };
      if (me < 1 || me > 12 || a < 1900 || a > 2200) return { valor: null, erro: ERRO.mesano };
      return { valor: `${a}-${p2(me)}` };
    }
    if (tipo === "papel") {
      const p = mascara("papel", t);
      return /^[A-Z0-9]{1,6}(\.[A-Z])?$/.test(p) ? { valor: p } : { valor: null, erro: ERRO.papel };
    }
    return { valor: t };
  }

  /* Como o valor aparece com o campo fechado */
  function formatar(tipo, v, op = {}) {
    if (v == null || v === "") return "";
    const c = casasDe(tipo, op);
    if (tipo === "moeda") return Fmt.moeda(v, c, op.moeda);
    if (tipo === "percentual") return Fmt.pct(v, c);
    if (tipo === "numero" || tipo === "inteiro") return num(v, c);
    if (tipo === "data") return Fmt.data(v);
    if (tipo === "mesano") return Fmt.mes(v);
    return String(v);
  }
  /* Como o valor aparece para editar: sem símbolo e sem milhar; casas só quando há fração */
  function limpo(tipo, v, op = {}) {
    if (v == null || v === "") return "";
    if (NUMERICOS.includes(tipo)) {
      if (Number.isInteger(v)) return String(v);
      return Number(v).toFixed(Math.max(casasDe(tipo, op), 1)).replace(/(\.\d*?[1-9])0+$/, "$1").replace(".", ",");
    }
    return formatar(tipo, v, op);
  }
  /* Máscara enquanto digita (data, mês/ano e papel); os numéricos ficam como a pessoa escreve */
  function mascara(tipo, texto) {
    const t = String(texto == null ? "" : texto);
    if (tipo === "papel") {
      const s = t.toUpperCase().normalize("NFD").replace(/[^A-Z0-9.]/g, "");
      const [base, ...resto] = s.split(".");
      const cls = base.slice(0, 6);
      return resto.length ? cls + "." + resto.join("").slice(0, 1) : cls;
    }
    if (tipo === "data") {
      if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(t.trim())) { const r = ler("data", t); return r.valor ? Fmt.data(r.valor) : t; }
      if (/[^\d/]/.test(t)) return t; /* deixa o que não é data para a mensagem de erro */
      const d = t.replace(/\D/g, "").slice(0, 8);
      return d.length > 4 ? d.slice(0, 2) + "/" + d.slice(2, 4) + "/" + d.slice(4) : d.length > 2 ? d.slice(0, 2) + "/" + d.slice(2) : d;
    }
    if (tipo === "mesano") {
      if (/^\d{4}-\d{1,2}$/.test(t.trim())) { const r = ler("mesano", t); return r.valor ? Fmt.mes(r.valor) : t; }
      if (/[^\d/]/.test(t)) return t;
      const d = t.replace(/\D/g, "").slice(0, 6);
      return d.length > 2 ? d.slice(0, 2) + "/" + d.slice(2) : d;
    }
    return t;
  }
  /* min e max: devolve o valor dentro dos limites e o aviso, se mudou */
  function limitar(tipo, v, op = {}) {
    if (v == null || !NUMERICOS.includes(tipo)) return { valor: v };
    if (op.min != null && v < op.min) return { valor: op.min, aviso: "O mínimo é " + formatar(tipo, op.min, op) };
    if (op.max != null && v > op.max) return { valor: op.max, aviso: "O máximo é " + formatar(tipo, op.max, op) };
    return { valor: v };
  }
  /* ↑/↓: soma o passo e respeita os limites */
  function passo(tipo, v, d, op = {}) {
    const n = Math.round(((v == null ? 0 : v) + d) * 1e8) / 1e8;
    return limitar(tipo, tipo === "inteiro" ? Math.round(n) : n, op).valor;
  }

  const Campo = { ler, formatar, limpo, mascara, limitar, passo, NUMERICOS };
  raiz.Fmt = Fmt;
  raiz.Campo = Campo;
  if (typeof document === "undefined") return;

  /* ---------- navegador ---------- */
  const OPS = new WeakMap();
  /* Rascunho por id: quando a página redesenha o bloco enquanto a pessoa digita, o campo novo volta com o texto dela */
  const rascunhos = new Map();
  /* Texto inválido por id: o campo redesenhado volta com ele e com a mensagem, em vez de sumir com o que a pessoa escreveu */
  const invalidos = new Map();
  let seq = 0;
  const nativoData = (() => { try { const i = document.createElement("input"); i.type = "date"; return i.type === "date"; } catch (e) { return false; } })();
  const toque = () => { try { return window.matchMedia("(pointer: coarse)").matches; } catch (e) { return false; } };

  function msgDe(input, op) {
    if (op.msg && op.msg.isConnected) return op.msg;
    const id = (input.id || "campo-" + ++seq) + "-msg";
    let m = document.getElementById(id);
    if (!m) {
      m = document.createElement("small");
      m.className = "campo-msg"; m.id = id; m.hidden = true; m.setAttribute("aria-live", "polite");
      const apos = op.msgApos || (input.parentElement && input.parentElement.classList.contains("campo") ? input.parentElement : input);
      if (apos.parentNode) apos.after(m);
    }
    const ds = (input.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
    if (!ds.includes(id)) input.setAttribute("aria-describedby", [...ds, id].join(" "));
    op.msg = m;
    return m;
  }
  function avisar(input, op, txt, invalido) {
    if (!input.isConnected) return;
    const m = msgDe(input, op);
    if (!m) return;
    m.textContent = txt || ""; m.hidden = !txt;
    m.classList.toggle("erro", !!invalido);
    if (invalido) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
  }
  function lerCampo(input, op) {
    if (op.nativo) return input.value ? { valor: input.value } : op.obrigatorio ? { valor: null, erro: "Preencha este campo" } : { valor: null };
    return ler(op.tipo, input.value, op);
  }
  /* Sai do campo (blur ou Enter): confere, limita e mostra formatado */
  function confirmar(input, op) {
    const r = lerCampo(input, op);
    if (input.id) { if (r.erro) invalidos.set(input.id, { txt: input.value, erro: r.erro, em: Date.now() }); else invalidos.delete(input.id); }
    if (r.erro) { avisar(input, op, r.erro, true); return; }
    const l = limitar(op.tipo, r.valor, op);
    if (!op.nativo) input.value = formatar(op.tipo, l.valor, op);
    avisar(input, op, l.aviso, false);
    if (l.aviso) input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function ligar(input, opcoes = {}) {
    if (!input || OPS.has(input)) return input;
    const op = { ...opcoes, tipo: opcoes.tipo || "numero" };
    OPS.set(input, op);
    input.setAttribute("autocomplete", "off");
    if (op.tipo === "data" && nativoData && toque()) { op.nativo = true; input.type = "date"; }
    else if (input.type !== "search") input.type = "text";
    input.setAttribute("inputmode", op.nativo ? "none" : op.tipo === "inteiro" || op.tipo === "data" || op.tipo === "mesano" ? "numeric" : NUMERICOS.includes(op.tipo) ? "decimal" : "text");
    if (op.nativo) input.removeAttribute("inputmode");
    if (op.tipo === "papel") { input.setAttribute("autocapitalize", "characters"); input.setAttribute("spellcheck", "false"); input.setAttribute("maxlength", "8"); }
    if (op.tipo === "data") input.setAttribute("maxlength", "10");
    if (op.tipo === "mesano") input.setAttribute("maxlength", "7");
    if (op.tipo === "data" && !op.nativo && !input.placeholder) input.placeholder = "dd/mm/aaaa";
    if (op.tipo === "mesano" && !input.placeholder) input.placeholder = "mm/aaaa";
    /* ao abrir: o valor que veio, já formatado */
    if (input.value) {
      const r = ler(op.tipo, input.value, op);
      if (!r.erro) input.value = op.nativo ? r.valor || "" : formatar(op.tipo, r.valor, op);
    }
    const chave = input.id;
    const inv = chave && invalidos.get(chave);
    if (inv && Date.now() - inv.em < 60000) {
      input.value = inv.txt;
      /* a mensagem precisa do campo já na página */
      let n = 0;
      const mostrar = () => { if (input.isConnected) { if (lerCampo(input, op).erro) avisar(input, op, inv.erro, true); } else if (++n < 10) requestAnimationFrame(mostrar); };
      requestAnimationFrame(mostrar);
    }
    input.addEventListener("focus", () => {
      if (op.nativo) return;
      const ras = chave && rascunhos.get(chave);
      if (ras && Date.now() - ras.em < 3000) { input.value = ras.txt; return; }
      const r = ler(op.tipo, input.value, op);
      if (!r.erro) input.value = limpo(op.tipo, r.valor, op);
    });
    input.addEventListener("input", () => {
      if (!op.nativo && op.tipo !== "papel" && NUMERICOS.includes(op.tipo) === false) {
        const pos = input.selectionStart, antes = input.value, m = mascara(op.tipo, antes);
        if (m !== antes) { input.value = m; if (pos != null && document.activeElement === input) { const p = Math.min(m.length, pos + (m.length - antes.length)); try { input.setSelectionRange(p, p); } catch (e) {} } }
      }
      if (op.tipo === "papel") {
        const pos = input.selectionStart, antes = input.value, m = mascara("papel", antes);
        if (m !== antes) { input.value = m; if (pos != null) { const p = Math.min(m.length, Math.max(0, pos - (antes.length - m.length))); try { input.setSelectionRange(p, p); } catch (e) {} } }
      }
      if (chave) { rascunhos.set(chave, { txt: input.value, em: Date.now() }); if (!lerCampo(input, op).erro) invalidos.delete(chave); }
      /* enquanto digita, só tira a mensagem quando ficou válido */
      if (input.getAttribute("aria-invalid") === "true" && !lerCampo(input, op).erro) avisar(input, op, "", false);
    });
    input.addEventListener("blur", () => {
      if (!input.isConnected) return; /* o bloco foi redesenhado: o rascunho fica para o campo novo */
      if (chave) rascunhos.delete(chave);
      confirmar(input, op);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { confirmar(input, op); if (document.activeElement === input && !op.nativo) { const r = ler(op.tipo, input.value, op); if (!r.erro) input.value = limpo(op.tipo, r.valor, op); } return; }
      if ((e.key === "ArrowUp" || e.key === "ArrowDown") && NUMERICOS.includes(op.tipo) && !e.altKey && !e.ctrlKey && !e.metaKey) {
        const r = ler(op.tipo, input.value, op);
        if (r.erro) return;
        e.preventDefault();
        const v = passo(op.tipo, r.valor, (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1), op);
        input.value = limpo(op.tipo, v, op);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    return input;
  }
  /* Valor cru do campo: número, ISO ou papel; null se vazio ou inválido */
  function valor(input) {
    if (!input) return null;
    const op = OPS.get(input);
    if (!op) return input.value;
    const r = lerCampo(input, op);
    return r.erro ? null : limitar(op.tipo, r.valor, op).valor;
  }
  /* Troca o valor por código (vem cru) */
  function definir(input, v) {
    const op = OPS.get(input);
    if (!op) { input.value = v == null ? "" : String(v); return; }
    input.value = op.nativo ? v || "" : document.activeElement === input ? limpo(op.tipo, v, op) : formatar(op.tipo, v, op);
    avisar(input, op, "", false);
  }
  const invalido = (input) => { const op = OPS.get(input); return !!(op && lerCampo(input, op).erro); };
  Object.assign(Campo, { ligar, valor, definir, invalido });
})(typeof window !== "undefined" ? window : globalThis);
