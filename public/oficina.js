/* Radar de Oficina (pedido de 19/11): regras puras das abas Ferramentas, Insumos e Madeiras, as mesmas na página,
 * no Worker (src/oficina.js) e nos testes.
 *
 * Script clássico (<script src="/oficina.js">), como o landscape.js: a página usa window.Oficina; o Worker e os testes
 * importam pelo efeito e leem globalThis.Oficina. Sem import nem export, nem nada do navegador ou do Worker.
 *
 * Banco (D1, com espelho):
 * - meta/oficina-categorias e meta/oficina-insumos-categorias:
 *     { categorias: [{ id, nome, indicadaPara?, icone?, subcategorias: [{ id, nome, indicadaPara?, icone? }] }], atualizado }
 * - oficina-ferramentas/<id>, oficina-insumos/<id>, oficina-madeiras/<id>: um doc por item (campos em CAMPOS, abaixo).
 * Só o Admin, a semente e a tarefa de levantamento gravam. Coletas, curadorias, tradução e limpeza não tocam aqui.
 *
 * Regra de ouro: nada sem fonte. A semente traz só o que é seguro afirmar (nome, taxonomia, uma frase); detalhes,
 * marcas, preços e notas de raridade e preço vêm da tarefa agendada, sempre com fonte. Vazio aparece como
 * "Ainda não levantado" (ou "não levantado" nas notas), nunca inventado.
 */
(function (raiz) {
  "use strict";

  const DIA = 86_400_000;
  const ID_OK = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const ID_MAX = 60;
  const ID_CAT = /^[a-z0-9-]{1,40}$/;
  const CORPO_MAX = 24_000;
  const INDICADA_MAX = 160;
  const MAX_CATEGORIAS = 40, MAX_SUBCATEGORIAS = 40;
  const MAX_ITENS = { ferramentas: 400, insumos: 300, madeiras: 200 };
  const PRECO_DESATUALIZADO_DIAS = 21;   // a tela marca "desatualizado"
  const PRECO_VENCE_DIAS = 7;            // a tarefa refaz a pesquisa uma vez por semana

  const OFICIOS = [
    { id: "marcenaria", nome: "Marcenaria", curto: "Marc." },
    { id: "carpintaria", nome: "Carpintaria", curto: "Carp." },
    { id: "serralheria", nome: "Serralheria", curto: "Serr." },
  ];
  const TIPOS = [
    { id: "manual", nome: "Manual" }, { id: "eletrica", nome: "Elétrica" }, { id: "bateria", nome: "A bateria" },
    { id: "estacionaria", nome: "Estacionária" }, { id: "pneumatica", nome: "Pneumática" }, { id: "medicao", nome: "Medição" },
    { id: "fixacao", nome: "Fixação" }, { id: "consumivel", nome: "Consumível" }, { id: "epi", nome: "EPI" },
  ];
  const NIVEIS = [
    { id: "essencial", nome: "Essencial", explica: "costuma entrar logo no começo da oficina" },
    { id: "intermediaria", nome: "Intermediária", explica: "entra quando os projetos crescem" },
    { id: "avancada", nome: "Avançada", explica: "para quem já tem a oficina montada ou trabalha com isso" },
  ];
  const FAIXAS_MARCA = [
    { id: "entrada", nome: "Entrada" }, { id: "intermediaria", nome: "Intermediária" }, { id: "profissional", nome: "Profissional" },
  ];
  /* Lojas: a busca pública de cada uma, sem parâmetro de afiliado. `hosts`: domínios aceitos no campo `busca`. */
  const LOJAS = [
    { id: "aliexpress", nome: "AliExpress", hosts: ["aliexpress.com", "pt.aliexpress.com", "www.aliexpress.com", "pt.aliexpress.com.br", "aliexpress.com.br"],
      busca: (q) => "https://pt.aliexpress.com/wholesale?SearchText=" + encodeURIComponent(q) },
    { id: "shopee", nome: "Shopee", hosts: ["shopee.com.br"], busca: (q) => "https://shopee.com.br/search?keyword=" + encodeURIComponent(q) },
    { id: "mercadolivre", nome: "Mercado Livre", hosts: ["lista.mercadolivre.com.br", "www.mercadolivre.com.br", "mercadolivre.com.br"],
      busca: (q) => "https://lista.mercadolivre.com.br/" + encodeURIComponent(semAcento(q).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) },
    { id: "amazon", nome: "Amazon", hosts: ["www.amazon.com.br", "amazon.com.br"], busca: (q) => "https://www.amazon.com.br/s?k=" + encodeURIComponent(q) },
  ];
  /* Parâmetros que denunciam afiliado ou rastreio: saem da URL de busca gravada */
  const PARAMS_AFILIADO = /^(tag|aff.*|ref|ref_|linkcode|ascsubtag|creative.*|camp|utm_.*|matt_.*|clickid|mkt_.*|sk|pd_rd_.*|pf_rd_.*|spm|scm|gclid|fbclid)$/i;

  /* Madeiras */
  const GRUPOS_MADEIRA = [
    { id: "nativa-brasil", nome: "Nativas do Brasil" }, { id: "exotica-plantada", nome: "Plantadas (exóticas)" },
    { id: "importada", nome: "Importadas" }, { id: "painel-e-engenheirada", nome: "Painéis e engenheiradas" },
  ];
  const TIPOS_MADEIRA = [{ id: "folhosa", nome: "Folhosa" }, { id: "conifera", nome: "Conífera" }, { id: "painel", nome: "Painel" }];
  const NOTAS = [
    { id: "dureza", nome: "Dureza", baixa: "macia", alta: "muito dura" },
    { id: "durabilidade", nome: "Durabilidade", baixa: "pouco durável", alta: "muito durável" },
    { id: "raridade", nome: "Raridade", baixa: "fácil de achar", alta: "muito rara" },
    { id: "preco", nome: "Preço", baixa: "barata", alta: "muito cara" },
  ];
  const LBF_EM_N = 4.448222;
  /* Dureza pela faixa do Janka, em newtons (uma tabela só; testada). Nota n quando janka >= min da linha. */
  const JANKA_FAIXAS = [
    { nota: 1, min: 0, rotulo: "abaixo de 3.000 N (macia: balsa, pinus, cedro-rosa)" },
    { nota: 2, min: 3000, rotulo: "de 3.000 a 4.999 N" },
    { nota: 3, min: 5000, rotulo: "de 5.000 a 7.499 N" },
    { nota: 4, min: 7500, rotulo: "de 7.500 a 10.999 N" },
    { nota: 5, min: 11000, rotulo: "11.000 N ou mais (muito dura: ipê, cumaru, jatobá)" },
  ];
  /* Durabilidade natural pela classe da fonte: EN 350 (classe 1 = muito durável ... 5 = não durável) ou o texto do IPT */
  const DURAB_TEXTO = [
    [/n[aã]o dur[aá]vel|perec[ií]vel|muito pouco dur[aá]vel/i, 1],
    [/pouco dur[aá]vel|baixa durabilidade/i, 2],
    [/moderadamente dur[aá]vel|m[eé]dia durabilidade|durabilidade moderada/i, 3],
    [/muito dur[aá]vel|alta durabilidade|alt[ií]ssima durabilidade/i, 5],
    [/dur[aá]vel/i, 4],
  ];

  const semAcento = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "");
  const limpo = (s) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  const slug = (t) => semAcento(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, ID_MAX).replace(/-$/, "");
  const ehObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  const isoOk = (s) => typeof s === "string" && s.length <= 40 && /^\d{4}-\d{2}-\d{2}/.test(s) && !isNaN(Date.parse(s));
  function urlHttps(u) {
    if (typeof u !== "string" || u.length > 500) return null;
    let x; try { x = new URL(u.trim()); } catch (e) { return null; }
    if (x.protocol !== "https:" || !x.hostname || x.username || x.password) return null;
    return x.toString();
  }
  const hostDe = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch (e) { return ""; } };

  /* ---------- lojas ---------- */
  const lojaPorId = (id) => LOJAS.find((l) => l.id === id) || null;
  /* URL de busca montada pelo site a partir do nome (sem afiliado) */
  function urlBusca(loja, nome) {
    const l = lojaPorId(loja);
    const q = limpo(nome).slice(0, 80);
    return l && q ? l.busca(q) : "";
  }
  /* A busca gravada pela tarefa: https, domínio da loja, sem parâmetro de afiliado (sai na validação) */
  function buscaLimpa(loja, u) {
    const l = lojaPorId(loja), ok = urlHttps(u);
    if (!l || !ok) return null;
    const x = new URL(ok);
    if (!l.hosts.includes(x.hostname.toLowerCase())) return null;
    for (const k of [...x.searchParams.keys()]) if (PARAMS_AFILIADO.test(k)) x.searchParams.delete(k);
    return x.toString();
  }
  /* "de R$ X a R$ Y" */
  const reais = (v) => "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: Number(v) % 1 ? 2 : 0, maximumFractionDigits: 2 });
  function faixaTexto(p) {
    if (!p || typeof p.min !== "number") return "";
    return p.max != null && p.max !== p.min ? `de ${reais(p.min)} a ${reais(p.max)}` : reais(p.min);
  }
  /* A data da pesquisa de uma loja: o `em` dela ou, sem ele, o precosEm do item (data do banco) */
  const emDaLoja = (p, item) => (p && isoOk(p.em) ? p.em : item && isoOk(item.precosEm) ? item.precosEm : null);
  /* Estado do preço: { tem, em, dias, desatualizado } com relógio injetado */
  function estadoPreco(p, item, agora = Date.now()) {
    if (!p || typeof p.min !== "number") return { tem: false, em: null, dias: null, desatualizado: false };
    const em = emDaLoja(p, item);
    const dias = em ? Math.floor((agora - Date.parse(em)) / DIA) : null;
    return { tem: true, em, dias, desatualizado: dias == null || dias > PRECO_DESATUALIZADO_DIAS };
  }
  /* Linhas da tela de preços: uma por loja, na ordem de LOJAS */
  function linhasPreco(item, agora = Date.now()) {
    const precos = ehObj(item && item.precos) ? item.precos : {};
    return LOJAS.map((l) => {
      const p = ehObj(precos[l.id]) ? precos[l.id] : null;
      const est = estadoPreco(p, item, agora);
      return { loja: l.id, nome: l.nome, ...est, faixa: est.tem ? faixaTexto(p) : "", obs: p && p.obs ? p.obs : "",
        busca: (p && buscaLimpa(l.id, p.busca)) || urlBusca(l.id, item && item.nome), montada: !(p && buscaLimpa(l.id, p.busca)) };
    });
  }
  /* Resumo para a lista leve: menor e maior valor entre as lojas, quantas lojas e a data mais antiga */
  function resumoPreco(precos, precosEm) {
    if (!ehObj(precos)) return null;
    let min = null, max = null, n = 0, em = null;
    for (const l of LOJAS) {
      const p = precos[l.id];
      if (!ehObj(p) || typeof p.min !== "number") continue;
      n++;
      min = min == null ? p.min : Math.min(min, p.min);
      const mx = typeof p.max === "number" ? p.max : p.min;
      max = max == null ? mx : Math.max(max, mx);
      const e = isoOk(p.em) ? p.em : isoOk(precosEm) ? precosEm : null;
      if (e && (!em || e < em)) em = e;
    }
    return n ? { min, max, lojas: n, em } : null;
  }

  /* ---------- madeiras: notas ---------- */
  function jankaEmN(d) {
    if (!ehObj(d) || typeof d.janka !== "number" || !(d.janka > 0)) return null;
    return d.unidade === "lbf" ? d.janka * LBF_EM_N : d.janka;
  }
  function notaDureza(janka, unidade = "N") {
    if (typeof janka !== "number" || !(janka > 0)) return null;
    const n = unidade === "lbf" ? janka * LBF_EM_N : janka;
    let nota = null;
    for (const f of JANKA_FAIXAS) if (n >= f.min) nota = f.nota;
    return nota;
  }
  function notaDurabilidade(classe) {
    const t = limpo(classe);
    if (!t) return null;
    const m = /classe\s*([1-5])\b/i.exec(t) || /^([1-5])$/.exec(t);
    if (m) return 6 - Number(m[1]);
    for (const [re, n] of DURAB_TEXTO) if (re.test(t)) return n;
    return null;
  }
  /* A nota que a tela mostra: dureza e durabilidade pela regra quando o dado bruto existe; raridade e preço só com fonte.
     Devolve { nota: 1..5 | null, dado (texto do que sustenta), fonte, regra: true quando veio da tabela } */
  function notaDe(m, campo) {
    const d = m && ehObj(m[campo]) ? m[campo] : null;
    const vazio = { nota: null, dado: "", fonte: "", regra: false };
    if (!d) return vazio;
    const fonte = urlHttps(d.fonte) || "";
    if (campo === "dureza") {
      const n = jankaEmN(d);
      if (n != null) {
        const lbf = n / LBF_EM_N;
        return { nota: notaDureza(n, "N"), dado: `Janka ${Math.round(n).toLocaleString("pt-BR")} N (${Math.round(lbf).toLocaleString("pt-BR")} lbf)`, fonte, regra: true, jankaN: Math.round(n), jankaLbf: Math.round(lbf) };
      }
      return fonte && notaOk(d.nota) ? { nota: d.nota, dado: "", fonte, regra: false } : vazio;
    }
    if (campo === "durabilidade") {
      const n = notaDurabilidade(d.classe);
      if (n != null) return { nota: n, dado: limpo(d.classe), fonte, regra: true };
      return fonte && notaOk(d.nota) ? { nota: d.nota, dado: limpo(d.classe), fonte, regra: false } : vazio;
    }
    if (!fonte || !notaOk(d.nota)) return { ...vazio, dado: limpo(campo === "preco" ? d.faixa : d.motivo) };
    if (campo === "raridade") return { nota: d.nota, dado: [limpo(d.motivo), limpo(d.status)].filter(Boolean).join(" · "), fonte, regra: false, status: limpo(d.status) };
    if (campo === "preco") return { nota: d.nota, dado: limpo(d.faixa), fonte, regra: false, em: isoOk(d.em) ? d.em : null };
    return vazio;
  }
  const notaOk = (n) => Number.isInteger(n) && n >= 1 && n <= 5;
  const notasDe = (m) => Object.fromEntries(NOTAS.map((x) => [x.id, notaDe(m, x.id)]));
  /* Protegida: status com CITES, IUCN em perigo ou lista oficial, ou legalidade que fala em proteção */
  function protegida(m) {
    const st = limpo(m && m.raridade && m.raridade.status) + " " + limpo(m && m.legalidade);
    return /CITES|amea[cç]ad|em perigo|vulner[aá]vel|criticamente|proibid|protegid/i.test(st) || /\b(IUCN|UICN)\b[^.;]*\b(EN|CR|VU)\b/.test(st);
  }
  /* Bandeira: emoji montado pelo código ISO de 2 letras */
  function bandeira(cc) {
    const c = String(cc || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(c)) return "";
    return String.fromCodePoint(...[...c].map((x) => 0x1f1e6 + x.charCodeAt(0) - 65));
  }
  /* até 5 bandeiras; o resto vira "+N" */
  function bandeirasDe(origem, max = 5) {
    const l = (Array.isArray(origem) ? origem : []).map((x) => String(x || "").toUpperCase()).filter((x, i, a) => /^[A-Z]{2}$/.test(x) && a.indexOf(x) === i);
    return { mostrar: l.slice(0, max), mais: Math.max(0, l.length - max), todos: l };
  }

  /* ---------- esquema dos campos (validação no Worker e formulário do Admin) ----------
     tipo: texto (max), area (max), sel (opcoes), multi (opcoes), lista (de textos: max por item, n itens),
     objs (lista de objetos com `campos`), precos (por loja), nota (objeto de nota da madeira), num, iso, url, paises */
  const op = (l) => l.map((x) => x.id);
  const C_FONTE = { k: "fonte", rotulo: "Fonte (https)", tipo: "url" };
  const CAMPOS_COMUNS = [
    { k: "nome", rotulo: "Nome", tipo: "texto", max: 80, obrigatorio: true },
    { k: "apelidos", rotulo: "Apelidos (um por linha)", tipo: "lista", max: 60, n: 10 },
    { k: "categoria", rotulo: "Categoria", tipo: "cat", obrigatorio: true },
    { k: "subcategoria", rotulo: "Subcategoria", tipo: "sub", obrigatorio: true },
    { k: "oficios", rotulo: "Ofícios", tipo: "multi", opcoes: op(OFICIOS), min: 1 },
    { k: "icone", rotulo: "Ícone (id do desenho)", tipo: "texto", max: 40, padrao: /^[a-z0-9-]{1,40}$/ },
    { k: "resumo", rotulo: "Resumo", tipo: "area", max: 240 },
  ];
  const C_CURIOS = { k: "curiosidades", rotulo: "Curiosidades", tipo: "objs", n: 10, campos: [{ k: "texto", rotulo: "Texto", tipo: "area", max: 300, obrigatorio: true }, { ...C_FONTE, obrigatorio: true }] };
  const C_TUTORIAIS = { k: "tutoriais", rotulo: "Tutoriais", tipo: "objs", n: 20, campos: [
    { k: "titulo", rotulo: "Título", tipo: "texto", max: 160, obrigatorio: true }, { k: "url", rotulo: "Endereço (https)", tipo: "url", obrigatorio: true },
    { k: "fonte", rotulo: "Fonte ou canal", tipo: "texto", max: 80 }, { k: "idioma", rotulo: "Idioma (pt, en, es...)", tipo: "texto", max: 5, padrao: /^[a-z]{2}(-[a-z]{2})?$/i },
    { k: "tipo", rotulo: "Tipo", tipo: "sel", opcoes: ["video", "artigo"], obrigatorio: true }, { k: "duracao", rotulo: "Duração (ex.: 12:30)", tipo: "texto", max: 20 }] };
  const C_MARCAS = { k: "marcas", rotulo: "Marcas de referência", tipo: "objs", n: 20, campos: [
    { k: "nome", rotulo: "Marca", tipo: "texto", max: 60, obrigatorio: true }, { k: "faixa", rotulo: "Faixa", tipo: "sel", opcoes: op(FAIXAS_MARCA), obrigatorio: true },
    { k: "nota", rotulo: "Nota", tipo: "area", max: 160 }, { ...C_FONTE, obrigatorio: true }] };
  const C_PRECOS = { k: "precos", rotulo: "Preços por loja", tipo: "precos" };
  const C_FONTES = { k: "fontes", rotulo: "Fontes", tipo: "objs", n: 20, campos: [{ k: "titulo", rotulo: "Título", tipo: "texto", max: 160, obrigatorio: true }, { k: "url", rotulo: "Endereço (https)", tipo: "url", obrigatorio: true }, { k: "em", rotulo: "Data (AAAA-MM-DD)", tipo: "iso" }] };
  const C_PASSOS = (k, rotulo) => ({ k, rotulo, tipo: "objs", n: 15, campos: [{ k: "passo", rotulo: "Passo", tipo: "num", min: 1, max: 99, inteiro: true }, { k: "texto", rotulo: "Texto", tipo: "area", max: 300, obrigatorio: true }] });
  const CAMPOS = {
    ferramentas: [
      ...CAMPOS_COMUNS,
      { k: "tipo", rotulo: "Tipo", tipo: "sel", opcoes: op(TIPOS), obrigatorio: true },
      { k: "nivel", rotulo: "Nível", tipo: "sel", opcoes: op(NIVEIS), obrigatorio: true },
      { k: "paraQueServe", rotulo: "Para que serve (um por linha)", tipo: "lista", max: 240, n: 12 },
      C_PASSOS("comoUsar", "Como usar"),
      { k: "seguranca", rotulo: "Segurança e EPI (um por linha)", tipo: "lista", max: 240, n: 12 },
      C_CURIOS, C_TUTORIAIS, C_MARCAS, C_PRECOS, C_FONTES,
    ],
    insumos: [
      ...CAMPOS_COMUNS,
      { k: "unidade", rotulo: "Unidade do preço (kg, litro, caixa com 100...)", tipo: "texto", max: 40 },
      { k: "tipos", rotulo: "Tipos e variações", tipo: "objs", n: 12, campos: [{ k: "nome", rotulo: "Nome", tipo: "texto", max: 60, obrigatorio: true }, { k: "quandoUsar", rotulo: "Quando usar", tipo: "area", max: 200 }] },
      { k: "comoEscolher", rotulo: "Como escolher (um por linha)", tipo: "lista", max: 240, n: 10 },
      C_PASSOS("comoAplicar", "Como aplicar"),
      { k: "compatibilidade", rotulo: "Compatibilidade (um por linha)", tipo: "lista", max: 240, n: 10 },
      { k: "rendimento", rotulo: "Rendimento", tipo: "area", max: 240 },
      { k: "validadeEArmazenagem", rotulo: "Validade e armazenagem", tipo: "area", max: 240 },
      { k: "seguranca", rotulo: "Segurança (um por linha)", tipo: "lista", max: 240, n: 12 },
      C_CURIOS, C_TUTORIAIS, C_MARCAS, C_PRECOS, C_FONTES,
    ],
    madeiras: [
      { k: "nome", rotulo: "Nome", tipo: "texto", max: 80, obrigatorio: true },
      { k: "nomesPopulares", rotulo: "Nomes populares (um por linha)", tipo: "lista", max: 60, n: 12 },
      { k: "nomeCientifico", rotulo: "Nome científico", tipo: "texto", max: 120 },
      { k: "familia", rotulo: "Família", tipo: "texto", max: 60 },
      { k: "grupo", rotulo: "Grupo", tipo: "sel", opcoes: op(GRUPOS_MADEIRA), obrigatorio: true },
      { k: "tipo", rotulo: "Tipo", tipo: "sel", opcoes: op(TIPOS_MADEIRA), obrigatorio: true },
      { k: "origem", rotulo: "Países de origem (códigos ISO, ex.: BR, PY)", tipo: "paises", n: 30 },
      { k: "origemNota", rotulo: "Nota de origem", tipo: "texto", max: 160 },
      { k: "dureza", rotulo: "Dureza (Janka)", tipo: "nota", campos: [{ k: "janka", rotulo: "Janka", tipo: "num", min: 1, max: 40000 }, { k: "unidade", rotulo: "Unidade", tipo: "sel", opcoes: ["N", "lbf"] }, { k: "nota", rotulo: "Nota (1 a 5, só sem Janka)", tipo: "num", min: 1, max: 5, inteiro: true }, C_FONTE] },
      { k: "durabilidade", rotulo: "Durabilidade natural", tipo: "nota", campos: [{ k: "classe", rotulo: "Classe (texto da fonte)", tipo: "texto", max: 120 }, { k: "nota", rotulo: "Nota (1 a 5)", tipo: "num", min: 1, max: 5, inteiro: true }, C_FONTE] },
      { k: "raridade", rotulo: "Raridade", tipo: "nota", campos: [{ k: "nota", rotulo: "Nota (1 a 5)", tipo: "num", min: 1, max: 5, inteiro: true }, { k: "motivo", rotulo: "Motivo", tipo: "texto", max: 160 }, { k: "status", rotulo: "Status (IUCN, CITES ou lista oficial)", tipo: "texto", max: 120 }, C_FONTE] },
      { k: "preco", rotulo: "Preço", tipo: "nota", campos: [{ k: "nota", rotulo: "Nota (1 a 5)", tipo: "num", min: 1, max: 5, inteiro: true }, { k: "faixa", rotulo: "Faixa (ex.: R$ X a R$ Y por m³)", tipo: "texto", max: 120 }, { k: "em", rotulo: "Data (AAAA-MM-DD)", tipo: "iso" }, C_FONTE] },
      { k: "densidade", rotulo: "Densidade", tipo: "nota", campos: [{ k: "valor", rotulo: "kg/m³", tipo: "num", min: 50, max: 1500 }, { k: "unidade", rotulo: "Unidade", tipo: "sel", opcoes: ["kg/m³"] }, C_FONTE] },
      { k: "cor", rotulo: "Cor", tipo: "texto", max: 120 },
      { k: "veio", rotulo: "Veio e textura", tipo: "texto", max: 160 },
      { k: "trabalhabilidade", rotulo: "Trabalhabilidade", tipo: "area", max: 300 },
      { k: "usos", rotulo: "Usos (um por linha)", tipo: "lista", max: 160, n: 15 },
      { k: "acabamentoIndicado", rotulo: "Acabamento indicado (um por linha)", tipo: "lista", max: 160, n: 10 },
      { k: "cuidados", rotulo: "Cuidados (um por linha)", tipo: "lista", max: 200, n: 10 },
      { k: "legalidade", rotulo: "Legalidade", tipo: "area", max: 240 },
      { k: "alternativas", rotulo: "Alternativas (ids de outras madeiras, um por linha)", tipo: "lista", max: 60, n: 10, padrao: ID_OK },
      C_CURIOS, C_FONTES,
    ],
  };
  /* campos de detalhe (os que a tarefa levanta): vazios = "Ainda não levantado" */
  const DETALHES = {
    ferramentas: ["paraQueServe", "comoUsar", "seguranca", "curiosidades", "tutoriais", "marcas", "precos", "fontes"],
    insumos: ["tipos", "comoEscolher", "comoAplicar", "compatibilidade", "rendimento", "validadeEArmazenagem", "seguranca", "curiosidades", "tutoriais", "marcas", "precos", "fontes"],
    madeiras: ["origem", "origemNota", "dureza", "durabilidade", "raridade", "preco", "densidade", "cor", "veio", "trabalhabilidade", "usos", "acabamentoIndicado", "cuidados", "legalidade", "alternativas", "curiosidades", "fontes"],
  };
  const COLECAO = { ferramentas: "oficina-ferramentas", insumos: "oficina-insumos", madeiras: "oficina-madeiras" };
  const META_CATS = { ferramentas: "oficina-categorias", insumos: "oficina-insumos-categorias" };
  const NOME_KIND = { ferramentas: { um: "ferramenta", varios: "ferramentas", o: "a" }, insumos: { um: "insumo", varios: "insumos", o: "o" }, madeiras: { um: "madeira", varios: "madeiras", o: "a" } };

  /* valida um campo; devolve { v } (valor limpo; null apaga no patch) ou { erro } */
  function validarCampo(c, v, ctx) {
    const r = c.rotulo.replace(/ \(.*\)$/, "");
    // no PUT parcial só chegam os campos enviados: obrigatório vazio também é recusado (não dá para apagar o nome)
    if (v === null || v === undefined || v === "") return c.obrigatorio ? { erro: `Preencha ${r.toLowerCase()}.` } : { v: null };
    switch (c.tipo) {
      case "texto": case "area": {
        if (typeof v !== "string") return { erro: `${r}: texto inválido.` };
        const t = c.tipo === "area" ? String(v).replace(/\r/g, "").replace(/[ \t]+/g, " ").trim() : limpo(v);
        if (!t) return c.obrigatorio ? { erro: `Preencha ${r.toLowerCase()}.` } : { v: null };
        if (t.length > c.max) return { erro: `${r} guarda até ${c.max} caracteres (veio com ${t.length}).` };
        if (c.padrao && !c.padrao.test(t)) return { erro: `${r}: formato inválido.` };
        return { v: t };
      }
      case "cat": case "sub": {
        if (typeof v !== "string" || !ID_CAT.test(v)) return { erro: `${r}: escolha uma da lista.` };
        return { v };
      }
      case "sel": return c.opcoes.includes(v) ? { v } : { erro: `${r}: valor fora da lista (${c.opcoes.join(", ")}).` };
      case "multi": {
        if (!Array.isArray(v)) return { erro: `${r}: lista inválida.` };
        const l = [...new Set(v)];
        if (l.some((x) => !c.opcoes.includes(x))) return { erro: `${r}: valor fora da lista (${c.opcoes.join(", ")}).` };
        if (c.min && l.length < c.min) return { erro: `Escolha ao menos um em ${r.toLowerCase()}.` };
        return { v: c.opcoes.filter((x) => l.includes(x)) };
      }
      case "lista": {
        if (!Array.isArray(v)) return { erro: `${r}: lista inválida.` };
        const l = [];
        for (const x of v) {
          if (typeof x !== "string") return { erro: `${r}: cada linha é um texto.` };
          const t = limpo(x);
          if (!t) continue;
          if (t.length > c.max) return { erro: `${r}: cada linha guarda até ${c.max} caracteres.` };
          if (c.padrao && !c.padrao.test(t)) return { erro: `${r}: "${t.slice(0, 40)}" fora do formato.` };
          if (!l.includes(t)) l.push(t);
        }
        if (l.length > c.n) return { erro: `${r}: até ${c.n} linhas.` };
        return { v: l };
      }
      case "paises": {
        if (!Array.isArray(v)) return { erro: `${r}: lista inválida.` };
        const l = [...new Set(v.map((x) => String(x || "").trim().toUpperCase()).filter(Boolean))];
        if (l.some((x) => !/^[A-Z]{2}$/.test(x))) return { erro: `${r}: use o código de duas letras (BR, PY, US).` };
        if (l.length > c.n) return { erro: `${r}: até ${c.n} países.` };
        return { v: l };
      }
      case "num": {
        const n = typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : v;
        if (typeof n !== "number" || !isFinite(n)) return { erro: `${r}: número inválido.` };
        if ((c.min != null && n < c.min) || (c.max != null && n > c.max)) return { erro: `${r}: de ${c.min} a ${c.max}.` };
        if (c.inteiro && !Number.isInteger(n)) return { erro: `${r}: número inteiro.` };
        return { v: n };
      }
      case "iso": return isoOk(v) ? { v: String(v).slice(0, 40) } : { erro: `${r}: data inválida (AAAA-MM-DD).` };
      case "url": { const u = urlHttps(v); return u ? { v: u } : { erro: `${r}: só endereço https.` }; }
      case "objs": {
        if (!Array.isArray(v)) return { erro: `${r}: lista inválida.` };
        if (v.length > c.n) return { erro: `${r}: até ${c.n} itens.` };
        const l = [];
        for (let i = 0; i < v.length; i++) {
          const o = v[i];
          if (!ehObj(o)) return { erro: `${r}: item ${i + 1} inválido.` };
          if (c.campos.every((sc) => o[sc.k] === undefined || o[sc.k] === null || o[sc.k] === "")) continue;
          const out = {};
          for (const sc of c.campos) {
            const x = validarCampo(sc, o[sc.k], { parcial: false });
            if (x.erro) return { erro: `${r}, item ${i + 1}: ${x.erro}` };
            if (x.v !== null) out[sc.k] = x.v;
          }
          l.push(out);
        }
        if (c.k === "comoUsar" || c.k === "comoAplicar") l.forEach((x, i) => { if (!x.passo) x.passo = i + 1; });
        return { v: l };
      }
      case "nota": {
        if (!ehObj(v)) return { erro: `${r}: valor inválido.` };
        const out = {};
        for (const sc of c.campos) {
          const x = validarCampo({ ...sc, obrigatorio: false }, v[sc.k], { parcial: false });
          if (x.erro) return { erro: `${r}: ${x.erro}` };
          if (x.v !== null) out[sc.k] = x.v;
        }
        if (!Object.keys(out).length) return { v: null };
        if (!out.fonte) return { erro: `${r}: informe a fonte (https). Nota sem fonte não entra.` };
        if (c.k === "dureza" && out.janka != null && !out.unidade) out.unidade = "N";
        return { v: out };
      }
      case "precos": {
        if (!ehObj(v)) return { erro: `${r}: valor inválido.` };
        const out = {};
        for (const [k, p] of Object.entries(v)) {
          const l = lojaPorId(k);
          if (!l) return { erro: `Loja desconhecida: ${String(k).slice(0, 30)}.` };
          if (p === null) { out[k] = null; continue; }
          if (!ehObj(p)) return { erro: `${l.nome}: valor inválido.` };
          const min = Number(p.min), max = p.max == null || p.max === "" ? min : Number(p.max);
          if (!isFinite(min) || min < 0 || !isFinite(max) || max < 0) return { erro: `${l.nome}: informe a faixa em reais (mínimo e máximo).` };
          if (max < min) return { erro: `${l.nome}: o máximo é menor que o mínimo.` };
          if (max > 1_000_000) return { erro: `${l.nome}: valor alto demais.` };
          if (p.moeda != null && p.moeda !== "BRL") return { erro: `${l.nome}: a moeda é sempre BRL.` };
          const busca = buscaLimpa(k, p.busca);
          if (!busca) return { erro: `${l.nome}: a busca precisa ser um endereço https da própria loja.` };
          const o = { min, max, moeda: "BRL", busca };
          if (p.em != null && p.em !== "") { if (!isoOk(p.em)) return { erro: `${l.nome}: data inválida.` }; o.em = String(p.em); }
          if (p.obs != null && p.obs !== "") { const t = limpo(p.obs); if (t.length > 120) return { erro: `${l.nome}: a observação guarda até 120 caracteres.` }; if (t) o.obs = t; }
          out[k] = o;
        }
        return { v: out };
      }
    }
    return { erro: `${r}: campo desconhecido.` };
  }
  /* Valida o corpo de POST (completo) ou PUT (parcial). Campos fora do esquema saem. Categoria e subcategoria são
     conferidas contra as categorias da aba (Ferramentas e Insumos). Devolve { doc } ou { erro }. */
  function validarItem(kind, b, { categorias = [], parcial = false, atual = null } = {}) {
    if (!CAMPOS[kind]) return { erro: "Aba desconhecida." };
    if (!ehObj(b)) return { erro: "Corpo inválido." };
    const doc = {};
    for (const c of CAMPOS[kind]) {
      if (parcial && !(c.k in b)) continue;
      const x = validarCampo(c, b[c.k], { parcial });
      if (x.erro) return { erro: x.erro };
      doc[c.k] = x.v;
    }
    if (kind !== "madeiras") {
      const cat = "categoria" in doc ? doc.categoria : atual && atual.categoria;
      const sub = "subcategoria" in doc ? doc.subcategoria : atual && atual.subcategoria;
      if ("categoria" in doc || "subcategoria" in doc) {
        const c = categorias.find((x) => x.id === cat);
        if (!c) return { erro: "Categoria desconhecida. Escolha uma da lista ou crie em Organizar categorias." };
        if (!(c.subcategorias || []).some((s) => s.id === sub)) return { erro: `A subcategoria não existe em ${c.nome}.` };
      }
      if (!parcial && (!doc.oficios || !doc.oficios.length)) return { erro: "Escolha ao menos um ofício." };
    }
    return { doc };
  }

  /* ---------- categorias ---------- */
  function validarCategorias(cats) {
    if (!Array.isArray(cats)) return { erro: "Lista de categorias inválida." };
    if (cats.length > MAX_CATEGORIAS) return { erro: `Até ${MAX_CATEGORIAS} categorias.` };
    const out = [], ids = new Set();
    for (const c of cats) {
      if (!ehObj(c)) return { erro: "Categoria inválida." };
      const nome = limpo(c.nome).slice(0, 61);
      if (!nome) return { erro: "Toda categoria precisa de nome." };
      if (nome.length > 60) return { erro: `O nome "${nome.slice(0, 30)}…" passa de 60 caracteres.` };
      const id = c.id ? String(c.id) : slug(nome).slice(0, 40);
      if (!ID_CAT.test(id) || ids.has(id)) return { erro: `Id de categoria inválido ou repetido: ${String(id).slice(0, 40)}.` };
      ids.add(id);
      const ind = indicadaOk(c.indicadaPara, nome);
      if (ind.erro) return ind;
      const subs = Array.isArray(c.subcategorias) ? c.subcategorias : [];
      if (subs.length > MAX_SUBCATEGORIAS) return { erro: `${nome}: até ${MAX_SUBCATEGORIAS} subcategorias.` };
      const so = [], sids = new Set();
      for (const s of subs) {
        if (!ehObj(s)) return { erro: `${nome}: subcategoria inválida.` };
        const sn = limpo(s.nome);
        if (!sn) return { erro: `${nome}: toda subcategoria precisa de nome.` };
        if (sn.length > 60) return { erro: `${nome}: o nome "${sn.slice(0, 30)}…" passa de 60 caracteres.` };
        const sid = s.id ? String(s.id) : slug(sn).slice(0, 40);
        if (!ID_CAT.test(sid) || sids.has(sid)) return { erro: `${nome}: id de subcategoria inválido ou repetido (${String(sid).slice(0, 40)}).` };
        sids.add(sid);
        const si = indicadaOk(s.indicadaPara, sn);
        if (si.erro) return si;
        so.push({ id: sid, nome: sn, ...(si.v ? { indicadaPara: si.v } : {}), ...(s.icone && /^[a-z0-9-]{1,40}$/.test(s.icone) ? { icone: s.icone } : {}) });
      }
      out.push({ id, nome, ...(ind.v ? { indicadaPara: ind.v } : {}), ...(c.icone && /^[a-z0-9-]{1,40}$/.test(c.icone) ? { icone: c.icone } : {}), subcategorias: so });
    }
    return { categorias: out };
  }
  function indicadaOk(v, nome) {
    if (v == null || v === "") return { v: "" };
    if (typeof v !== "string") return { erro: `${nome}: "Geralmente indicada para" é um texto.` };
    const t = limpo(v);
    if (t.length > INDICADA_MAX) return { erro: `${nome}: "Geralmente indicada para" guarda até ${INDICADA_MAX} caracteres (veio com ${t.length}).` };
    return { v: t };
  }
  const catDe = (cats, id) => (cats || []).find((c) => c.id === id) || null;
  const subDe = (cats, cid, sid) => { const c = catDe(cats, cid); return c ? (c.subcategorias || []).find((s) => s.id === sid) || null : null; };
  /* frase "Geralmente indicada para": a da subcategoria, senão a da categoria */
  const indicadaDe = (cats, cid, sid) => { const s = subDe(cats, cid, sid); if (s && s.indicadaPara) return s.indicadaPara; const c = catDe(cats, cid); return (c && c.indicadaPara) || ""; };
  /* ícone de um item: o dele, senão o da subcategoria, senão o da categoria */
  function iconeDe(item, cats, existe = () => true) {
    const s = subDe(cats, item && item.categoria, item && item.subcategoria), c = catDe(cats, item && item.categoria);
    for (const x of [item && item.icone, s && s.icone, c && c.icone]) if (x && existe(x)) return x;
    return "";
  }

  /* ---------- filtros e agrupamento (Ferramentas e Insumos) ---------- */
  const FILTROS_VAZIOS = () => ({ q: "", oficios: [], tipos: [], niveis: [], comPreco: false, por: "categoria" });
  function casaBusca(item, q) {
    const t = semAcento(q).toLowerCase().trim();
    if (!t) return true;
    const alvo = semAcento([item.nome, ...(item.apelidos || []), ...(item.nomesPopulares || []), item.nomeCientifico || ""].join(" | ")).toLowerCase();
    return t.split(/\s+/).every((p) => alvo.includes(p));
  }
  function filtrar(lista, f = {}) {
    const ofs = f.oficios || [], tps = f.tipos || [], nvs = f.niveis || [];
    return (lista || []).filter((x) => (!ofs.length || (x.oficios || []).some((o) => ofs.includes(o)))
      && (!tps.length || tps.includes(x.tipo)) && (!nvs.length || nvs.includes(x.nivel))
      && (!f.comPreco || !!x.preco) && casaBusca(x, f.q || ""));
  }
  const porNome = (a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR", { sensitivity: "base", numeric: true });
  /* por categoria: [{ id, nome, indicadaPara, subs: [{ id, nome, indicadaPara, itens }] }], na ordem das categorias;
     item de categoria que não existe vai para "Sem categoria" no fim */
  function agruparPorCategoria(lista, cats) {
    const out = [];
    const usados = new Set();
    for (const c of cats || []) {
      const subs = [];
      for (const s of c.subcategorias || []) {
        const itens = lista.filter((x) => x.categoria === c.id && x.subcategoria === s.id).sort(porNome);
        itens.forEach((x) => usados.add(x.id));
        if (itens.length) subs.push({ id: s.id, nome: s.nome, indicadaPara: s.indicadaPara || "", itens });
      }
      if (subs.length) out.push({ id: c.id, nome: c.nome, indicadaPara: c.indicadaPara || "", subs });
    }
    const resto = lista.filter((x) => !usados.has(x.id)).sort(porNome);
    if (resto.length) out.push({ id: "", nome: "Sem categoria", indicadaPara: "", subs: [{ id: "", nome: "Outras", indicadaPara: "", itens: resto }] });
    return out;
  }
  /* por ofício: um bloco por ofício (o item que serve a dois aparece nos dois), com as categorias dentro */
  function agruparPorOficio(lista, cats) {
    return OFICIOS.map((o) => {
      const l = lista.filter((x) => (x.oficios || []).includes(o.id));
      const cs = agruparPorCategoria(l, cats).map((c) => ({ id: c.id, nome: c.nome, itens: c.subs.flatMap((s) => s.itens) }));
      return { id: o.id, nome: o.nome, n: l.length, cats: cs };
    }).filter((g) => g.n);
  }
  function contar(lista, campo, valores) {
    const m = Object.fromEntries(valores.map((v) => [v, 0]));
    for (const x of lista || []) { const v = x[campo]; if (Array.isArray(v)) v.forEach((y) => { if (y in m) m[y]++; }); else if (v in m) m[v]++; }
    return m;
  }
  /* parecidas: mesma subcategoria, sem o próprio item */
  const parecidas = (lista, item, n = 12) => (lista || []).filter((x) => x.id !== item.id && x.categoria === item.categoria && x.subcategoria === item.subcategoria).sort(porNome).slice(0, n);
  /* campo de detalhe vazio? (lista vazia, objeto sem chave, texto vazio) */
  function vazio(v) {
    if (v == null || v === "") return true;
    if (Array.isArray(v)) return !v.length;
    if (ehObj(v)) return !Object.values(v).some((x) => x != null && x !== "");
    return false;
  }
  const temDetalhes = (kind, item) => !!(item && (item.detalhesEm || DETALHES[kind].some((k) => !vazio(item[k]))));

  /* ---------- madeiras: filtros, ordem e comparar ---------- */
  const FILTROS_MADEIRA = () => ({ q: "", grupos: [], tipos: [], pais: "", faixas: {}, ordem: "nome" });
  function filtrarMadeiras(lista, f = {}) {
    const gs = f.grupos || [], ts = f.tipos || [], fx = f.faixas || {};
    return (lista || []).filter((m) => {
      if (gs.length && !gs.includes(m.grupo)) return false;
      if (ts.length && !ts.includes(m.tipo)) return false;
      if (f.pais && !(m.origem || []).includes(f.pais)) return false;
      for (const n of NOTAS) {
        const r = fx[n.id];
        if (!r || (r.min == null && r.max == null) || (Number(r.min) <= 1 && Number(r.max) >= 5)) continue;
        const v = (m.notas && m.notas[n.id] && m.notas[n.id].nota) ?? null;
        if (v == null) return false;
        if (r.min != null && v < r.min) return false;
        if (r.max != null && v > r.max) return false;
      }
      return casaBusca(m, f.q || "");
    });
  }
  /* ordem: nome, ou uma nota (maior primeiro; sem nota no fim; empate pelo nome) */
  function ordenarMadeiras(lista, ordem = "nome") {
    const l = (lista || []).slice();
    if (!NOTAS.some((n) => n.id === ordem)) return l.sort(porNome);
    const v = (m) => (m.notas && m.notas[ordem] && m.notas[ordem].nota) ?? null;
    return l.sort((a, b) => (v(a) == null) - (v(b) == null) || (v(b) || 0) - (v(a) || 0) || porNome(a, b));
  }
  function podeComparar(sel, todos) {
    const ids = [...new Set(sel || [])].filter((id) => (todos || []).some((m) => m.id === id));
    if (ids.length < 2) return { pode: false, motivo: ids.length ? "Marque mais uma para comparar." : "Marque de 2 a 4 madeiras para comparar.", ids };
    if (ids.length > 4) return { pode: false, motivo: "Compare no máximo 4 madeiras de cada vez.", ids: ids.slice(0, 4) };
    return { pode: true, motivo: "", ids };
  }
  /* países presentes na lista (para o filtro), em ordem de quantidade */
  function paisesDe(lista) {
    const m = new Map();
    for (const x of lista || []) for (const p of x.origem || []) m.set(p, (m.get(p) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id, n]) => ({ id, n }));
  }

  /* ---------- hash ---------- */
  const ABAS = [
    { id: "conteudos", nome: "Conteúdos", hash: "" }, { id: "ferramentas", nome: "Ferramentas", hash: "ferramentas" },
    { id: "insumos", nome: "Insumos", hash: "insumos" }, { id: "madeiras", nome: "Madeiras", hash: "madeiras" },
  ];
  /* "#oficina/ferramentas/serrote" → { aba, id, comparar } */
  function lerHash(h) {
    const p = String(h || "").replace(/^#/, "").split("/");
    if (p[0] !== "oficina") return null;
    const aba = ABAS.find((a) => a.hash && a.hash === p[1]);
    if (!aba) return { aba: "conteudos", id: null, comparar: [] };
    let id = null, comparar = [];
    if (aba.id === "madeiras" && p[2] === "comparar") comparar = String(p[3] || "").split(",").map((x) => { try { return decodeURIComponent(x); } catch (e) { return ""; } }).filter((x) => ID_OK.test(x)).slice(0, 4);
    else if (p[2]) { try { id = decodeURIComponent(p[2]); } catch (e) { id = null; } if (!ID_OK.test(id || "") || id.length > ID_MAX) id = null; }
    return { aba: aba.id, id, comparar };
  }
  function escreverHash(e) {
    const aba = ABAS.find((a) => a.id === (e && e.aba)) || ABAS[0];
    if (!aba.hash) return "#oficina";
    if (e.comparar && e.comparar.length) return "#oficina/" + aba.hash + "/comparar/" + e.comparar.map(encodeURIComponent).join(",");
    return "#oficina/" + aba.hash + (e.id ? "/" + encodeURIComponent(e.id) : "");
  }

  raiz.Oficina = { DIA, ID_OK, ID_MAX, ID_CAT, CORPO_MAX, INDICADA_MAX, MAX_ITENS, PRECO_DESATUALIZADO_DIAS, PRECO_VENCE_DIAS,
    OFICIOS, TIPOS, NIVEIS, FAIXAS_MARCA, LOJAS, GRUPOS_MADEIRA, TIPOS_MADEIRA, NOTAS, JANKA_FAIXAS, LBF_EM_N,
    CAMPOS, DETALHES, COLECAO, META_CATS, NOME_KIND, ABAS,
    semAcento, limpo, slug, urlHttps, hostDe, isoOk, lojaPorId, urlBusca, buscaLimpa, faixaTexto, reais, emDaLoja, estadoPreco, linhasPreco, resumoPreco,
    notaDureza, notaDurabilidade, notaDe, notasDe, protegida, bandeira, bandeirasDe,
    validarCampo, validarItem, validarCategorias, catDe, subDe, indicadaDe, iconeDe,
    FILTROS_VAZIOS, filtrar, casaBusca, agruparPorCategoria, agruparPorOficio, contar, parecidas, vazio, temDetalhes,
    FILTROS_MADEIRA, filtrarMadeiras, ordenarMadeiras, podeComparar, paisesDe, lerHash, escreverHash };
})(typeof globalThis !== "undefined" ? globalThis : this);
