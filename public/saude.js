/* Radar de Saúde (pedido de 20/11): regras puras, as mesmas na página, no Worker (src/saude.js), na coleta e nos testes.
 *
 * Script clássico (<script src="/saude.js">), como o oficina.js: a página usa window.Saude; o Worker e os testes
 * importam pelo efeito e leem globalThis.Saude. Sem import nem export, nem nada do navegador ou do Worker.
 *
 * Banco (D1, com espelho):
 * - saude-produtos/<id> (id em kebab-case sem acento): { nome, apelidos, tipo, resumo, marcas: [{ id, nome, tipo, nota }],
 *   situacaoBrasil: { texto, fonte, em }, ativo, adicionado, por: "admin" | "semente", atualizado }
 * - items-saude, destaques-saude, meta/status-saude: a máquina dos outros radares. Item com produto, marcas, tema, tipo,
 *   pais, idioma e confianca, além dos campos comuns.
 * Só o Admin e a semente gravam os produtos; a curadoria mexe só em situacaoBrasil (src/saude.js, sqlSituacao).
 *
 * Regra de ouro: nada de fato de saúde vindo de memória. Resumo, tipo e situação no Brasil vêm do Admin ou da
 * curadoria, sempre com fonte; vazio aparece como "Ainda não levantado".
 */
(function (raiz) {
  "use strict";

  const ID_OK = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const ID_MAX = 60;
  /* "produtos" é o endereço da tela do Admin (#saude/produtos): não pode ser id de produto */
  const IDS_RESERVADOS = ["produtos"];
  const CORPO_MAX = 16_000;
  const MAX_PRODUTOS = 30, MAX_APELIDOS = 12, MAX_MARCAS = 20;
  const APELIDO_CURTO = 4;   // termo com menos letras que isso só vale em feed do próprio assunto

  const TEMAS = [
    { id: "pesquisa", nome: "Pesquisa e estudos", curto: "Pesquisa" },
    { id: "regulacao", nome: "Regulação e legalização", curto: "Regulação" },
    { id: "golpes", nome: "Golpes e fraudes", curto: "Golpes" },
    { id: "mercado", nome: "Fabricantes, lojas e marcas", curto: "Mercado" },
    { id: "relatos", nome: "Relatos de usuários", curto: "Relatos" },
    { id: "seguranca", nome: "Segurança e efeitos adversos", curto: "Segurança" },
  ];
  const TIPOS = [
    { id: "noticia", nome: "Notícia", varios: "Notícias" }, { id: "estudo", nome: "Estudo", varios: "Estudos" },
    { id: "alerta", nome: "Alerta", varios: "Alertas" }, { id: "comunicado", nome: "Comunicado", varios: "Comunicados" },
    { id: "relato", nome: "Relato", varios: "Relatos" }, { id: "video", nome: "Vídeo", varios: "Vídeos" },
    { id: "analise", nome: "Análise", varios: "Análises" },
  ];
  /* selo de cada item: o texto escrito é o que vale (a cor só acompanha) */
  const CONFIANCAS = [
    { id: "oficial", nome: "Oficial", selo: "fonte oficial", explica: "agência reguladora, fabricante ou registro de ensaio" },
    { id: "imprensa", nome: "Imprensa", selo: "imprensa", explica: "veículo de imprensa" },
    { id: "cientifica", nome: "Científica", selo: "publicação científica", explica: "periódico ou preprint" },
    { id: "comunidade", nome: "Comunidade", selo: "relato de usuário, não verificado", explica: "Reddit ou fórum" },
  ];
  const PAISES = [{ id: "todos", nome: "Todos" }, { id: "brasil", nome: "Brasil" }, { id: "fora", nome: "Fora do Brasil" }];
  const TIPOS_MARCA = [
    { id: "loja", nome: "Loja" }, { id: "marca", nome: "Marca" }, { id: "fabricante", nome: "Fabricante" }, { id: "laboratorio", nome: "Laboratório" },
  ];
  /* destaque discreto: faixa lateral e o rótulo escrito, nunca só cor */
  const DESTACA = { tema: ["golpes"], tipo: ["alerta"] };

  const semAcento = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "");
  const limpo = (s) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  const slug = (t) => semAcento(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, ID_MAX).replace(/-$/, "");
  const ehObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  const diaOk = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T12:00:00Z")) && new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s;
  const isoOk = (s) => typeof s === "string" && s.length <= 40 && /^\d{4}-\d{2}-\d{2}/.test(s) && !isNaN(Date.parse(s));
  function urlHttps(u) {
    if (typeof u !== "string" || u.length > 500) return null;
    let x; try { x = new URL(u.trim()); } catch (e) { return null; }
    if (x.protocol !== "https:" || !x.hostname || x.username || x.password) return null;
    return x.toString();
  }
  const hostDe = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch (e) { return ""; } };
  const idOk = (id) => typeof id === "string" && id.length <= ID_MAX && ID_OK.test(id);

  /* ---------- cita o produto? (coleta) ----------
     Comparação sem acento e sem caixa, por palavra inteira: o texto e cada termo viram palavras de [a-z0-9] e o termo
     precisa aparecer como sequência de palavras inteiras ("reta" não conta dentro de "secretaria"). Termo com menos de
     4 letras só vale quando o feed é do próprio assunto (op.assunto = id do produto do feed). Produto pausado
     (ativo false) não conta. Devolve o id do primeiro produto da lista que aparece, ou null. */
  const palavras = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const letras = (s) => palavras(s).replace(/ /g, "").length;
  function termosDe(p) {
    const l = [p && p.nome, ...((p && Array.isArray(p.apelidos)) ? p.apelidos : [])].map(palavras).filter(Boolean);
    return [...new Set(l)];
  }
  function citaProduto(texto, produtos, op = {}) {
    const alvo = " " + palavras(texto) + " ";
    if (alvo.trim() === "") return null;
    for (const p of produtos || []) {
      if (!p || !p.id || p.ativo === false) continue;
      for (const t of termosDe(p)) {
        if (letras(t) < APELIDO_CURTO && op.assunto !== p.id) continue;
        if (alvo.includes(" " + t + " ")) return p.id;
      }
    }
    return null;
  }

  /* ---------- validação dos produtos (rotas do Admin) ---------- */
  function texto(v, rot, max, obrigatorio) {
    if (v === null || v === undefined || v === "") return obrigatorio ? { erro: `Preencha ${rot}.` } : { v: null };
    if (typeof v !== "string") return { erro: `${cap(rot)}: texto inválido.` };
    const t = limpo(v);
    if (!t) return obrigatorio ? { erro: `Preencha ${rot}.` } : { v: null };
    if (t.length > max) return { erro: `${cap(rot)} guarda até ${max} caracteres (veio com ${t.length}).` };
    return { v: t };
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function validarApelidos(v) {
    if (v === null || v === undefined) return { v: [] };
    if (!Array.isArray(v)) return { erro: "Apelidos: mande uma lista." };
    const l = [];
    for (const x of v) {
      if (typeof x !== "string") return { erro: "Apelidos: cada um é um texto." };
      const t = limpo(x);
      if (!t) continue;
      if (t.length > 60) return { erro: `O apelido "${t.slice(0, 30)}…" passa de 60 caracteres.` };
      if (!l.some((y) => palavras(y) === palavras(t))) l.push(t);
    }
    if (l.length > MAX_APELIDOS) return { erro: `Até ${MAX_APELIDOS} apelidos por produto (vieram ${l.length}).` };
    return { v: l };
  }
  function validarMarcas(v) {
    if (v === null || v === undefined) return { v: [] };
    if (!Array.isArray(v)) return { erro: "Marcas: mande uma lista." };
    const l = [], ids = new Set();
    for (let i = 0; i < v.length; i++) {
      const m = v[i];
      if (!ehObj(m)) return { erro: `Marca ${i + 1}: valor inválido.` };
      const n = texto(m.nome, "o nome da marca", 60, true);
      if (n.erro) return { erro: `Marca ${i + 1}: ${n.erro}` };
      const id = m.id == null || m.id === "" ? slug(n.v) : String(m.id);
      if (!idOk(id)) return { erro: `Marca ${n.v}: o id usa só letras minúsculas sem acento, números e hífen.` };
      if (ids.has(id)) return { erro: `A marca ${n.v} aparece duas vezes.` };
      if (!TIPOS_MARCA.some((t) => t.id === m.tipo)) return { erro: `Marca ${n.v}: escolha o tipo (${TIPOS_MARCA.map((t) => t.nome.toLowerCase()).join(", ")}).` };
      const nota = texto(m.nota, "a nota da marca", 160, false);
      if (nota.erro) return { erro: `Marca ${n.v}: ${nota.erro}` };
      ids.add(id);
      l.push({ id, nome: n.v, tipo: m.tipo, ...(nota.v ? { nota: nota.v } : {}) });
    }
    if (l.length > MAX_MARCAS) return { erro: `Até ${MAX_MARCAS} marcas por produto (vieram ${l.length}).` };
    return { v: l };
  }
  /* situacaoBrasil: { texto (até 300), fonte (https), em (AAAA-MM-DD) }; sem fonte não entra */
  function validarSituacao(v) {
    if (!ehObj(v)) return { erro: "Situação no Brasil: valor inválido." };
    const t = texto(v.texto, "o texto da situação no Brasil", 300, true);
    if (t.erro) return t;
    const fonte = urlHttps(v.fonte);
    if (!fonte) return { erro: "Situação no Brasil: informe a fonte (https). Sem fonte não entra." };
    if (!diaOk(v.em)) return { erro: "Situação no Brasil: a data vai como AAAA-MM-DD." };
    return { v: { texto: t.v, fonte, em: v.em } };
  }
  /* Corpo do POST (completo) ou do PUT (parcial). Campos fora do esquema saem; situacaoBrasil não vem do Admin (é da
     curadoria, sempre com fonte). Devolve { doc } ou { erro }. */
  const CAMPOS = ["nome", "apelidos", "tipo", "resumo", "marcas", "ativo"];
  function validarProduto(b, { parcial = false } = {}) {
    if (!ehObj(b)) return { erro: "Corpo inválido." };
    const doc = {};
    const tem = (k) => !parcial || k in b;
    if (tem("nome")) { const x = texto(b.nome, "o nome", 80, true); if (x.erro) return x; doc.nome = x.v; }
    if (tem("apelidos")) { const x = validarApelidos(b.apelidos); if (x.erro) return x; doc.apelidos = x.v; }
    if (tem("tipo")) { const x = texto(b.tipo, "o tipo", 60, false); if (x.erro) return x; doc.tipo = x.v; }
    if (tem("resumo")) { const x = texto(b.resumo, "o resumo", 240, false); if (x.erro) return x; doc.resumo = x.v; }
    if (tem("marcas")) { const x = validarMarcas(b.marcas); if (x.erro) return x; doc.marcas = x.v; }
    if (tem("ativo")) {
      if (b.ativo === undefined && !parcial) doc.ativo = true;
      else if (typeof b.ativo !== "boolean") return { erro: "Ativo é sim ou não (true ou false)." };
      else doc.ativo = b.ativo;
    }
    return { doc };
  }
  function idNovo(b, nome) {
    const id = b && b.id != null && b.id !== "" ? String(b.id) : slug(nome || "");
    if (!idOk(id)) return { erro: "O id usa só letras minúsculas sem acento, números e hífen." };
    if (IDS_RESERVADOS.includes(id)) return { erro: `"${id}" é reservado. Escolha outro id.` };
    return { id };
  }
  /* Doc lido do banco, conferido campo a campo (a curadoria grava direto: o site nunca confia). O que não passa some. */
  function saneado(id, d) {
    if (!idOk(id) || !ehObj(d)) return null;
    const nome = texto(d.nome, "o nome", 80, true);
    const out = { id, nome: nome.erro ? id : nome.v };
    const ap = validarApelidos(d.apelidos); out.apelidos = ap.erro ? [] : ap.v;
    const tp = texto(d.tipo, "o tipo", 60, false); if (!tp.erro && tp.v) out.tipo = tp.v;
    const rs = texto(d.resumo, "o resumo", 240, false); if (!rs.erro && rs.v) out.resumo = rs.v;
    // marca que não passa sai sozinha; as outras ficam
    out.marcas = [];
    for (const m of Array.isArray(d.marcas) ? d.marcas : []) {
      const x = validarMarcas([m]);
      if (!x.erro && x.v[0] && !out.marcas.some((y) => y.id === x.v[0].id) && out.marcas.length < MAX_MARCAS) out.marcas.push(x.v[0]);
    }
    if (d.situacaoBrasil) { const s = validarSituacao(d.situacaoBrasil); if (!s.erro) out.situacaoBrasil = s.v; }
    out.ativo = d.ativo !== false;
    for (const k of ["adicionado", "atualizado"]) if (isoOk(d[k])) out[k] = d[k];
    if (d.por === "admin" || d.por === "semente") out.por = d.por;
    return out;
  }
  const ordenarProdutos = (l) => (l || []).slice().sort((a, b) => (b.ativo !== false) - (a.ativo !== false) || String(a.nome).localeCompare(String(b.nome), "pt-BR", { sensitivity: "base" }));

  /* ---------- filtros do feed (puros) ----------
     f: { produto, marca, temas: [], tipo, confianca, pais: "todos" | "brasil" | "fora", q }. Vazio ou "todos" não filtra.
     País: "brasil" é o item com pais "BR"; "fora" é todo o resto, inclusive sem país. */
  const FILTROS_VAZIOS = () => ({ produto: "", marca: "", temas: [], tipo: "todos", confianca: "todos", pais: "todos", q: "" });
  const passaProduto = (i, id) => !id || (i && i.produto) === id;
  const passaMarca = (i, id) => !id || (Array.isArray(i && i.marcas) && i.marcas.includes(id));
  const passaTemas = (i, l) => !l || !l.length || l.includes(i && i.tema);
  const passaTipo = (i, t) => !t || t === "todos" || (i && i.tipo) === t;
  const passaConfianca = (i, c) => !c || c === "todos" || (i && i.confianca) === c;
  const ehBrasil = (i) => String((i && i.pais) || "").toUpperCase() === "BR";
  const passaPais = (i, p) => !p || p === "todos" || (p === "brasil" ? ehBrasil(i) : !ehBrasil(i));
  function textoBusca(i) {
    return semAcento([i.titulo, i.resumo, i.titulo_pt, i.resumo_pt, i.fonte].filter((x) => typeof x === "string").join(" | ")).toLowerCase();
  }
  const passaBusca = (i, q) => { const t = semAcento(q || "").toLowerCase().trim(); return !t || t.split(/\s+/).every((p) => textoBusca(i).includes(p)); };
  function passa(i, f = {}, fora = "") {
    return (fora === "produto" || passaProduto(i, f.produto)) && (fora === "marca" || passaMarca(i, f.marca)) && (fora === "temas" || passaTemas(i, f.temas))
      && (fora === "tipo" || passaTipo(i, f.tipo)) && (fora === "confianca" || passaConfianca(i, f.confianca)) && (fora === "pais" || passaPais(i, f.pais))
      && (fora === "q" || passaBusca(i, f.q));
  }
  const filtrar = (lista, f = {}) => (lista || []).filter((i) => passa(i, f));
  /* contagem dos chips: cada grupo conta com todos os outros filtros, menos o dele */
  function contar(lista, f, campo) {
    const fora = { produto: "produto", marca: "marca", tema: "temas", tipo: "tipo", confianca: "confianca", pais: "pais" }[campo];
    const base = (lista || []).filter((i) => passa(i, f, fora));
    const m = { todos: base.length };
    for (const i of base) {
      if (campo === "marca") { for (const x of Array.isArray(i.marcas) ? i.marcas : []) m[x] = (m[x] || 0) + 1; continue; }
      const v = campo === "pais" ? (ehBrasil(i) ? "brasil" : "fora") : i[campo];
      if (v) m[v] = (m[v] || 0) + 1;
    }
    return m;
  }
  /* filtros lidos do localStorage: só o que existe nas listas fica */
  function filtrosOk(s, produtos) {
    const f = FILTROS_VAZIOS();
    if (!ehObj(s)) return f;
    const ps = produtos || null;
    if (idOk(s.produto) && (!ps || ps.some((p) => p.id === s.produto))) f.produto = s.produto;
    if (f.produto && idOk(s.marca)) { const p = ps && ps.find((x) => x.id === f.produto); if (!ps || (p && (p.marcas || []).some((m) => m.id === s.marca))) f.marca = s.marca; }
    if (Array.isArray(s.temas)) f.temas = s.temas.filter((t) => TEMAS.some((x) => x.id === t));
    if (TIPOS.some((t) => t.id === s.tipo)) f.tipo = s.tipo;
    if (CONFIANCAS.some((c) => c.id === s.confianca)) f.confianca = s.confianca;
    if (PAISES.some((p) => p.id === s.pais)) f.pais = s.pais;
    if (typeof s.q === "string") f.q = limpo(s.q).slice(0, 120);
    return f;
  }
  const destaca = (i) => ({ golpe: DESTACA.tema.includes(i && i.tema), alerta: DESTACA.tipo.includes(i && i.tipo) });
  const confiancaDe = (id) => CONFIANCAS.find((c) => c.id === id) || null;
  const temaDe = (id) => TEMAS.find((t) => t.id === id) || null;
  const tipoDe = (id) => TIPOS.find((t) => t.id === id) || null;
  const tipoMarcaDe = (id) => TIPOS_MARCA.find((t) => t.id === id) || null;

  /* ---------- hash ----------
     "#saude" → feed com todos; "#saude/<produto>" → feed do produto; "#saude/produtos" → tela do Admin */
  function lerHash(h) {
    const p = String(h || "").replace(/^#/, "").split("/");
    if (p[0] !== "saude") return null;
    if (p[1] === "produtos" && !p[2]) return { tela: "produtos", produto: null };
    let id = null;
    if (p[1]) { try { id = decodeURIComponent(p[1]); } catch (e) { id = null; } if (!idOk(id) || IDS_RESERVADOS.includes(id)) id = null; }
    return { tela: "feed", produto: id };
  }
  function escreverHash(e) {
    if (e && e.tela === "produtos") return "#saude/produtos";
    return "#saude" + (e && e.produto && idOk(e.produto) ? "/" + encodeURIComponent(e.produto) : "");
  }

  raiz.Saude = { ID_OK, ID_MAX, IDS_RESERVADOS, CORPO_MAX, MAX_PRODUTOS, MAX_APELIDOS, MAX_MARCAS, APELIDO_CURTO,
    TEMAS, TIPOS, CONFIANCAS, PAISES, TIPOS_MARCA, DESTACA, CAMPOS,
    semAcento, limpo, slug, urlHttps, hostDe, idOk, diaOk, isoOk, palavras, termosDe, citaProduto,
    validarProduto, validarApelidos, validarMarcas, validarSituacao, idNovo, saneado, ordenarProdutos,
    FILTROS_VAZIOS, passaProduto, passaMarca, passaTemas, passaTipo, passaConfianca, passaPais, passaBusca, passa, filtrar, contar, filtrosOk,
    destaca, confiancaDe, temaDe, tipoDe, tipoMarcaDe, lerHash, escreverHash };
})(typeof globalThis !== "undefined" ? globalThis : this);
