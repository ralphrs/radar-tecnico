/* Tradução das notícias (pedido de 13/11): regras puras, as mesmas na página, no Worker e nos testes.
 *
 * Script clássico (<script src="/traducao.js">), como o landscape.js: a página usa window.Traducao, e o Worker
 * (src/traducao.js, src/landscape.js) e os testes em Node importam pelo efeito e leem globalThis.Traducao.
 * Sem import nem export, nem nada do navegador ou do Worker.
 *
 * O que fica aqui:
 * - idioma(texto, dica) e precisaTraduzir(texto, dica): a heurística de idioma (palavras funcionais do português contra as
 *   do inglês e do espanhol, acentos, terminações; a dica de idioma ou país do feed pesa quando existe);
 * - proteger(texto, nomes) e restaurar(traduzido, pedacos): o que não se traduz (nomes de tecnologia, empresa e produto,
 *   trechos entre crases, URLs, @menções, hashtags, versões, siglas) vira {0}, {1}... antes e volta depois. Se um
 *   marcador não voltar, restaurar devolve null e a tradução daquele texto é descartada (fica o original);
 * - vista(item, ligada): o item com o português no lugar do original (para a tela), guardando o original em _orig;
 * - os textos do Landscape (textosLandscape), a gravação neles (aplicarLandscape) e a regra que segura a tradução quando
 *   o cron de coleta regrava o doc com o mesmo texto (manterLandscape);
 * - a preferência "Mostrar notícias traduzidas" (validarPrefs, respostaPrefs) e a conta de neurons (neurons).
 *
 * Campos: a tradução fica ao lado do original, nunca por cima: titulo_pt, resumo_pt, porque_pt (o nome do campo + "_pt").
 */
(function (raiz) {
  "use strict";

  const SUF = "_pt";
  const NEURONS_POR_M = 31050; /* m2m100-1.2b: neurons por milhão de tokens, de entrada e de saída (doc de 20/10/2026) */

  /* ---------- idioma ---------- */
  const lista = (s) => new Set(s.split(/\s+/).filter(Boolean));
  /* só português (peso 2) */
  const PT = lista("os do dos da das na nas num numa um uma uns umas é são foi foram com não nao ao aos à às pelo pela pelos pelas seu sua seus suas " +
    "mais também já após até isso isto esse essa esses essas ele ela eles elas onde sem novo nova novos novas estão tem têm vai vão pode podem " +
    "depois ainda muito muita muitos muitas só mas ou e em quer faz fazer há sobe cai ganha perde contra deve devem será serão vem vêm " +
    "agora hoje ontem anos ano mês dia semana bilhões milhões governo segundo nesta neste nessa nesse pra");
  /* português e espanhol (peso 1 para os dois) */
  const PT_ES = lista("o de que para por como se sobre entre este esta está ser porque desde quando mil");
  /* só espanhol (peso 2) */
  const ES = lista("el los las del y es con pero más muy sus su al lo según tras nuevo nueva hoy años también ha han hay cuando donde ya sin " +
    "tiene tienen puede pueden hasta qué cómo una un unos unas fue fueron esto eso gobierno millones dice");
  /* inglês (peso 2) */
  const EN = lista("the and of to is are was were for with on at by from how why what when who which new you your we our it its this that these " +
    "those be been has have had will can could should would not an or after into over about just now than more most vs in if but their they " +
    "there here all any up out get got make use using via without while does did i my don't doesn't isn't can't won't it's what's " +
    "let's i'm we're you're they're show ask tell launch launches released announces says adds new open source free");
  const PALAVRA = /[\p{L}][\p{L}'’-]*/gu;
  const PAIS_PT = new Set(["BR", "PT", "AO", "MZ"]);
  const PAIS_ES = new Set(["ES", "MX", "AR", "CO", "CL", "PE", "UY", "PY", "BO", "EC", "VE"]);
  const PAIS_EN = new Set(["US", "GB", "UK", "CA", "AU", "NZ", "IE", "IN", "SG"]);

  /* Pontos de cada idioma. Texto de nome próprio, número, versão ou código fica sem palavra comum e sai com tudo zero. */
  function pontos(texto, dica) {
    const p = { pt: 0, en: 0, es: 0, palavras: 0 };
    const limpo = proteger(String(texto || ""), []).texto.replace(/\{\d+\}/g, " ");
    const ws = (limpo.match(PALAVRA) || []).map((w) => w.toLowerCase().replace(/’/g, "'"));
    for (const w of ws) {
      if (w.length >= 2 || /^[aeoéàyí]$/.test(w)) p.palavras++;
      if (PT.has(w)) p.pt += 2;
      if (PT_ES.has(w)) { p.pt += 1; p.es += 1; }
      if (ES.has(w)) p.es += 2;
      if (EN.has(w)) p.en += 2;
      if (/(ção|ções|ão|ões|ãe|ães|inho|inha|mente)$/.test(w)) p.pt += 1;
      if (/^[a-z]{3,}(ing|tion|tions|ness|ed|ly)$/.test(w) && !PT.has(w)) p.en += 0.5;
      if (/'(s|t|re|ll|ve|d|m)$/.test(w)) p.en += 1;
    }
    if (/[ãõç]/i.test(limpo)) p.pt += 3;
    else if (/[âêô]/i.test(limpo)) p.pt += 1;
    if (/[ñ¿¡]/.test(limpo)) p.es += 3;
    const d = dica && typeof dica === "object" ? dica : {};
    const lang = String(d.idioma || d.lang || "").toLowerCase().slice(0, 2);
    const pais = String(d.pais || "").toUpperCase();
    if (lang === "pt" || PAIS_PT.has(pais)) p.pt += 1.5;
    else if (lang === "es" || PAIS_ES.has(pais)) p.es += 1.5;
    else if (lang === "en" || PAIS_EN.has(pais)) p.en += 1;
    return p;
  }
  /* "pt", "en", "es" ou "" (sem como dizer: nome próprio, código, uma palavra só) */
  function idioma(texto, dica) {
    const p = pontos(texto, dica);
    if (p.palavras < 2) return "";
    const outro = Math.max(p.en, p.es);
    if (p.pt >= outro && p.pt > 0) return "pt";
    if (outro <= 0) return "";
    return p.es > p.en ? "es" : "en";
  }
  /* Falso para vazio, para o que já está em português (empate fica com o português, para não gastar), para o que é só nome
     próprio, número, versão ou código, e quando não dá para dizer o idioma. Inglês e espanhol traduzem. */
  const precisaTraduzir = (texto, dica) => { const l = idioma(texto, dica); return l === "en" || l === "es"; };

  /* ---------- o que não se traduz ---------- */
  /* Nomes de tecnologia, empresa e produto mais comuns nas fontes do Lookout. O Worker junta os nomes do Landscape. */
  const NOMES = ["Hacker News", "Claude Code", "VS Code", "Visual Studio", "Google Cloud", "Cloudflare Workers", "Workers AI", "GitHub Actions", "Uptime Kuma",
    "Product Hunt", "Stack Overflow", "Hugging Face", "App Store", "Play Store", "Apple Intelligence", "Windows Server", "SQL Server",
    "GitHub", "GitLab", "Bitbucket", "Kubernetes", "Docker", "Podman", "Linux", "Ubuntu", "Debian", "Fedora", "Windows", "macOS", "iOS", "iPadOS", "Android",
    "Google", "Alphabet", "Microsoft", "Apple", "Amazon", "Meta", "OpenAI", "Anthropic", "Claude", "ChatGPT", "Gemini", "Llama", "Mistral", "DeepSeek", "Qwen",
    "Copilot", "Cursor", "Nvidia", "NVIDIA", "Intel", "Qualcomm", "Samsung", "Huawei", "Xiaomi", "TikTok", "ByteDance", "Alibaba", "Tencent", "Baidu",
    "Cloudflare", "Vercel", "Netlify", "Supabase", "Firebase", "Heroku", "Fastly", "Akamai", "Azure", "Oracle", "Salesforce", "Shopify", "Stripe",
    "Netflix", "Spotify", "Uber", "Airbnb", "Tesla", "SpaceX", "Starlink", "Twitter", "LinkedIn", "Reddit", "YouTube", "WhatsApp", "Instagram", "Facebook",
    "Telegram", "Signal", "Discord", "Slack", "Notion", "Figma", "Jira", "Confluence", "Atlassian", "Datadog", "Splunk", "Grafana", "Prometheus", "Loki",
    "OpenTelemetry", "Elasticsearch", "Kibana", "Kafka", "Redis", "Valkey", "PostgreSQL", "Postgres", "MySQL", "MariaDB", "SQLite", "MongoDB", "Cassandra",
    "DuckDB", "ClickHouse", "Snowflake", "Databricks", "Terraform", "OpenTofu", "Ansible", "Pulumi", "Jenkins", "Rust", "Python", "JavaScript", "TypeScript",
    "Java", "Kotlin", "Swift", "Golang", "Ruby", "Rails", "PHP", "Laravel", "Django", "Flask", "FastAPI", "React", "Vue", "Angular", "Svelte", "SvelteKit",
    "Astro", "Next.js", "Nuxt", "Node.js", "Deno", "Bun", "WebAssembly", "Wasm", "Electron", "Tauri", "Flutter", "Playwright", "Puppeteer", "Selenium",
    "Woodpecker", "OpenObserve", "SigNoz", "Scrapling", "Orca", "Pix", "Nubank", "Itaú", "Bradesco", "Petrobras", "Vale", "Embraer", "Mercado Livre", "iFood"];
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let reNomesPadrao = null;
  const reDosNomes = (nomes) => {
    const l = [...new Set(nomes.filter((n) => typeof n === "string" && n.trim().length >= 2).map((n) => n.trim()))].sort((a, b) => b.length - a.length);
    return l.length ? new RegExp("(?<![\\p{L}\\p{N}_])(?:" + l.map(escRe).join("|") + ")(?![\\p{L}\\p{N}_])", "gu") : null;
  };
  /* Cada regra troca o trecho por {n}; a ordem importa (crase antes de URL, URL antes de versão...). */
  const REGRAS = [
    /\{\d+\}/g,                                     /* marcador que já vinha no texto: volta igual */
    /`[^`\n]{1,200}`/g,                             /* código entre crases */
    /\bhttps?:\/\/[^\s<>"')\]]+/gi,                 /* URLs */
    /\bwww\.[^\s<>"')\]]+/gi,
    /(?<![\p{L}\p{N}_])@[A-Za-z0-9_][A-Za-z0-9_.-]{0,38}/gu, /* @menções */
    /(?<![\p{L}\p{N}_&])#[\p{L}\p{N}_]{2,50}/gu,    /* hashtags */
    /(?<![\p{L}\p{N}_.])v?\d+(?:\.\d+){1,3}(?:-[A-Za-z0-9.]+)?(?![\p{L}\p{N}_])/gu, /* versões: 2.0.2, v0.70.0, 1.18-rc1 */
  ];
  const REGRAS_DEPOIS = [
    /(?<![\p{L}\p{N}_])[A-Za-z][a-z0-9]*[A-Z][A-Za-z0-9]*(?:\.[a-z]{2,4})?(?![\p{L}\p{N}_])/gu, /* CamelCase: OpenObserve, iPhone, TypeScript */
    /(?<![\p{L}\p{N}_])[A-Za-z][\w-]*\.(?:js|ts|io|ai|dev|py|rs|go|sh|md|json|yaml|yml|toml)(?![\p{L}\p{N}_])/gu, /* Node.js, config.yaml */
    /(?<![\p{L}\p{N}_])[a-z0-9]+(?:_[a-z0-9]+)+(?![\p{L}\p{N}_])/g, /* snake_case */
    /(?<![\p{L}\p{N}_])(?=[A-Za-z-]*\d)(?=[\w-]*[A-Za-z])[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*(?![\p{L}\p{N}_])/gu, /* gpt-4o, k8s, S3, H100 */
    /(?<![\p{L}\p{N}_])[A-Z][A-Z0-9&]{1,}(?:s)?(?![\p{L}\p{N}_])/gu, /* siglas: API, SSO, OIDC, PRs, AT&T */
    /(?<![\p{L}\p{N}_])[a-z0-9]+(?:-[a-z0-9]+)*\/[A-Za-z0-9._-]+(?![\p{L}\p{N}_])/g, /* dono/repositório */
  ];
  /* { texto, pedacos }: o texto com {0}, {1}... no lugar do que não se traduz, e os pedaços na ordem dos números. */
  function proteger(texto, nomes) {
    const pedacos = [];
    let s = String(texto == null ? "" : texto);
    const trocar = (re) => { if (!re) return; s = s.replace(re, (m) => { pedacos.push(m); return "{" + (pedacos.length - 1) + "}"; }); };
    for (const re of REGRAS) trocar(re);
    if (!reNomesPadrao) reNomesPadrao = reDosNomes(NOMES);
    if (Array.isArray(nomes) && nomes.length) trocar(reDosNomes(nomes));
    trocar(reNomesPadrao);
    for (const re of REGRAS_DEPOIS) trocar(re);
    return { texto: s, pedacos };
  }
  /* Devolve o texto traduzido com os pedaços de volta, ou null quando algum marcador sumiu, repetiu ou apareceu do nada. */
  function restaurar(traduzido, pedacos) {
    let s = String(traduzido == null ? "" : traduzido);
    const n = (pedacos || []).length;
    const achados = [...s.matchAll(/\{\s*(\d+)\s*\}/g)].map((m) => Number(m[1]));
    if (achados.length !== n) return null;
    const vistos = new Set(achados);
    if (vistos.size !== n) return null;
    for (let k = 0; k < n; k++) if (!vistos.has(k)) return null;
    s = s.replace(/\{\s*(\d+)\s*\}/g, (m, k) => pedacos[Number(k)]);
    return s;
  }
  /* Saída do modelo que não serve: vazia, igual à entrada (não traduziu) ou com tamanho fora do razoável */
  function saidaOk(entrada, saida) {
    const a = String(entrada || "").trim(), b = String(saida || "").trim();
    if (!b) return false;
    if (b === a && a.length > 12) return false;
    const r = b.length / Math.max(1, a.length);
    return r > 0.3 && r < 3.5;
  }

  /* ---------- custo ---------- */
  /* tokens ≈ caracteres / 4, entrada + saída; neurons com três casas */
  const tokens = (s) => Math.ceil(String(s || "").length / 4);
  const neurons = (entrada, saida) => Math.round(((tokens(entrada) + tokens(saida)) * NEURONS_POR_M) / 1e6 * 1000) / 1000;

  /* ---------- tela ---------- */
  const CAMPOS = ["titulo", "resumo", "porque"];
  /* Tem tradução para mostrar? */
  const temPt = (i, campos = CAMPOS) => !!i && typeof i === "object" && campos.some((c) => typeof i[c + SUF] === "string" && i[c + SUF].trim() && i[c]);
  /* O item como a tela mostra: com a preferência ligada e tradução gravada, o português no lugar do original; o original
     fica em _orig (para "ver original" e para a busca). Sem tradução ou com a preferência desligada, o próprio item. */
  function vista(i, ligada, campos = CAMPOS) {
    if (!ligada || !i || i._trad || !temPt(i, campos)) return i;
    const v = { ...i, _orig: {}, _trad: true };
    for (const c of campos) {
      const pt = i[c + SUF];
      if (typeof pt === "string" && pt.trim() && i[c]) { v._orig[c] = i[c]; v[c] = pt; }
    }
    return v;
  }
  /* Texto para a busca: original e tradução juntos */
  const textoBusca = (i, campos = ["titulo", "resumo", "fonte"]) =>
    campos.flatMap((c) => [i && i[c], i && i[c + SUF], i && i._orig && i._orig[c]]).filter((x) => typeof x === "string" && x).join(" ");

  /* ---------- preferência (prefs/<email>, id "traducao") ---------- */
  function validarPrefs(b) {
    if (!b || typeof b !== "object" || Array.isArray(b)) return { erro: "corpo" };
    for (const k of Object.keys(b)) if (k !== "mostrar") return { erro: "campo " + String(k).slice(0, 20) };
    if (typeof b.mostrar !== "boolean") return { erro: "Use true ou false em mostrar." };
    return { prefs: { mostrar: b.mostrar } };
  }
  /* Ligada por padrão: só desliga quem salvou mostrar: false */
  const respostaPrefs = (salvo) => ({ mostrar: !(salvo && salvo.mostrar === false), salvo: !!salvo });

  /* ---------- Landscape ---------- */
  /* Os textos de uma tecnologia que a tela mostra, cada um com uma chave estável e o português que já houver:
     { chave, texto, pt, curto } (curto: título; longo: resumo, notas, trecho, sobre). */
  function textosLandscape(doc) {
    const out = [];
    if (!doc || typeof doc !== "object") return out;
    const add = (chave, obj, campo, curto) => { if (obj && typeof obj[campo] === "string" && obj[campo].trim()) out.push({ chave, texto: obj[campo], pt: typeof obj[campo + SUF] === "string" ? obj[campo + SUF] : "", curto }); };
    if (doc.gh) add("gh.descricao", doc.gh, "descricao", true);
    add("sobre", doc, "sobre", false);
    for (const r of Array.isArray(doc.releases) ? doc.releases : []) {
      if (!r || !r.tag) continue;
      if (r.nome && r.nome !== r.tag) add("rel:" + r.tag + ":nome", r, "nome", true);
      add("rel:" + r.tag + ":notas", r, "notas", false);
    }
    const hn = doc.hn || {};
    for (const h of Array.isArray(hn.historias) ? hn.historias : []) if (h && h.id) add("hn:" + h.id, h, "titulo", true);
    for (const g of Array.isArray(hn.comentarios) ? hn.comentarios : []) {
      if (!g || !g.historia) continue;
      add("hg:" + g.historia.id, g.historia, "titulo", true);
      for (const c of Array.isArray(g.itens) ? g.itens : []) if (c && c.id) add("cm:" + c.id, c, "trecho", false);
    }
    for (const i of Array.isArray(doc.gh_destaques) ? doc.gh_destaques : []) if (i) add("is:" + (i.url || i.numero), i, "titulo", true);
    for (const b of Array.isArray(doc.blog) ? doc.blog : []) if (b && b.url) add("bl:" + b.url, b, "titulo", true);
    /* a mesma chave duas vezes (história repetida em dois grupos) fica uma */
    const vistos = new Set();
    return out.filter((x) => (vistos.has(x.chave) ? false : vistos.add(x.chave)));
  }
  const copia = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  /* Põe as traduções no doc (cópia) e devolve o patch para o json_patch: só as chaves que mudaram, com os arrays inteiros
     (json_patch troca array, não mescla). Cada tradução só entra se o texto original daquela chave ainda é o mesmo que foi
     traduzido (o cron de coleta pode ter regravado no meio). traducoes: [{ chave, origem, pt }]. */
  function aplicarLandscape(doc, traducoes) {
    const d = copia(doc) || {};
    const por = new Map((traducoes || []).filter((t) => t && t.chave && typeof t.pt === "string").map((t) => [t.chave, t]));
    const patch = {};
    let n = 0;
    const pega = (chave, obj, campo) => {
      const t = por.get(chave);
      if (!t || !obj || obj[campo] !== t.origem) return false;
      obj[campo + SUF] = t.pt; n++; return true;
    };
    if (d.gh && pega("gh.descricao", d.gh, "descricao")) patch.gh = { descricao_pt: d.gh.descricao_pt };
    if (pega("sobre", d, "sobre")) patch.sobre_pt = d.sobre_pt;
    let mudou = false;
    for (const r of Array.isArray(d.releases) ? d.releases : []) if (r && r.tag) { if (pega("rel:" + r.tag + ":nome", r, "nome")) mudou = true; if (pega("rel:" + r.tag + ":notas", r, "notas")) mudou = true; }
    if (mudou) patch.releases = d.releases;
    const hn = d.hn || {};
    let mh = false, mc = false;
    for (const h of Array.isArray(hn.historias) ? hn.historias : []) if (h && h.id && pega("hn:" + h.id, h, "titulo")) mh = true;
    for (const g of Array.isArray(hn.comentarios) ? hn.comentarios : []) {
      if (!g || !g.historia) continue;
      if (pega("hg:" + g.historia.id, g.historia, "titulo")) mc = true;
      for (const c of Array.isArray(g.itens) ? g.itens : []) if (c && c.id && pega("cm:" + c.id, c, "trecho")) mc = true;
    }
    if (mh || mc) patch.hn = { ...(mh ? { historias: hn.historias } : {}), ...(mc ? { comentarios: hn.comentarios } : {}) };
    let mi = false;
    for (const i of Array.isArray(d.gh_destaques) ? d.gh_destaques : []) if (i && pega("is:" + (i.url || i.numero), i, "titulo")) mi = true;
    if (mi) patch.gh_destaques = d.gh_destaques;
    let mb = false;
    for (const b of Array.isArray(d.blog) ? d.blog : []) if (b && b.url && pega("bl:" + b.url, b, "titulo")) mb = true;
    if (mb) patch.blog = d.blog;
    return { patch, doc: d, n };
  }
  /* O cron do Landscape regrava gh, releases, sobre, hn, gh_destaques e blog a cada coleta. Antes de gravar, esta regra põe
     de volta no patch o português de cada texto que não mudou e tira o de quem mudou (null apaga no json_patch), para a
     fila traduzir de novo. antigo: o doc como estava no banco antes da rodada. Devolve o patch (o mesmo objeto, mexido). */
  function manterLandscape(antigo, patch) {
    if (!patch || typeof patch !== "object" || !antigo || typeof antigo !== "object") return patch;
    const igual = (novo, velho, campo) => {
      if (!novo || typeof novo[campo] !== "string") return;
      if (velho && velho[campo] === novo[campo] && typeof velho[campo + SUF] === "string") novo[campo + SUF] = velho[campo + SUF];
      else if (novo[campo + SUF] !== undefined && !(velho && velho[campo] === novo[campo])) delete novo[campo + SUF];
    };
    if (patch.gh && typeof patch.gh === "object" && "descricao" in patch.gh) {
      const v = antigo.gh || {};
      if (v.descricao === patch.gh.descricao && typeof v.descricao_pt === "string") patch.gh.descricao_pt = v.descricao_pt;
      else if (v.descricao_pt !== undefined || patch.gh.descricao_pt !== undefined) patch.gh.descricao_pt = null;
    }
    if ("sobre" in patch) {
      if (antigo.sobre === patch.sobre && typeof antigo.sobre_pt === "string") patch.sobre_pt = antigo.sobre_pt;
      else if (antigo.sobre_pt !== undefined) patch.sobre_pt = null;
    }
    const porChave = (l, k) => new Map((Array.isArray(l) ? l : []).filter(Boolean).map((x) => [k(x), x]));
    if (Array.isArray(patch.releases)) {
      const m = porChave(antigo.releases, (r) => r.tag);
      for (const r of patch.releases) { if (!r) continue; const v = m.get(r.tag); igual(r, v, "nome"); igual(r, v, "notas"); }
    }
    if (patch.hn && typeof patch.hn === "object") {
      const vh = antigo.hn || {};
      if (Array.isArray(patch.hn.historias)) { const m = porChave(vh.historias, (h) => h.id); for (const h of patch.hn.historias) if (h) igual(h, m.get(h.id), "titulo"); }
      if (Array.isArray(patch.hn.comentarios)) {
        const mg = porChave(vh.comentarios, (g) => g.historia && g.historia.id);
        for (const g of patch.hn.comentarios) {
          if (!g || !g.historia) continue;
          const vg = mg.get(g.historia.id);
          igual(g.historia, vg && vg.historia, "titulo");
          const mc = porChave(vg && vg.itens, (c) => c.id);
          for (const c of Array.isArray(g.itens) ? g.itens : []) if (c) igual(c, mc.get(c.id), "trecho");
        }
      }
    }
    if (Array.isArray(patch.gh_destaques)) { const m = porChave(antigo.gh_destaques, (i) => i.url || i.numero); for (const i of patch.gh_destaques) if (i) igual(i, m.get(i.url || i.numero), "titulo"); }
    if (Array.isArray(patch.blog)) { const m = porChave(antigo.blog, (b) => b.url); for (const b of patch.blog) if (b) igual(b, m.get(b.url), "titulo"); }
    return patch;
  }

  /* Destaques do dia (destaques*, doc por dia com itens[]): mesma ideia, por url */
  function textosDestaque(doc) {
    const out = [];
    for (const i of doc && Array.isArray(doc.itens) ? doc.itens : []) {
      if (!i || !i.url) continue;
      for (const [campo, curto] of [["titulo", true], ["porque", false]]) if (typeof i[campo] === "string" && i[campo].trim()) out.push({ chave: campo + ":" + i.url, texto: i[campo], pt: typeof i[campo + SUF] === "string" ? i[campo + SUF] : "", curto });
    }
    return out;
  }
  function aplicarDestaque(doc, traducoes) {
    const d = copia(doc) || {};
    const por = new Map((traducoes || []).map((t) => [t.chave, t]));
    let n = 0;
    for (const i of Array.isArray(d.itens) ? d.itens : []) {
      if (!i || !i.url) continue;
      for (const campo of ["titulo", "porque"]) { const t = por.get(campo + ":" + i.url); if (t && i[campo] === t.origem) { i[campo + SUF] = t.pt; n++; } }
    }
    return { patch: n ? { itens: d.itens } : {}, doc: d, n };
  }

  raiz.Traducao = { SUF, NEURONS_POR_M, NOMES, CAMPOS, pontos, idioma, precisaTraduzir, proteger, restaurar, saidaOk, tokens, neurons, temPt, vista, textoBusca,
    validarPrefs, respostaPrefs, textosLandscape, aplicarLandscape, manterLandscape, textosDestaque, aplicarDestaque };
})(typeof globalThis !== "undefined" ? globalThis : this);
