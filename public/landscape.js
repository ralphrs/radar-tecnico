/* Landscape (Tech): regras puras das tecnologias que o Lookout acompanha, as mesmas na página, no Worker e nos testes.
 *
 * Script clássico (<script src="/landscape.js">), como o esportes.js e o tabela.js: a página usa window.Landscape, e o
 * Worker (src/landscape.js) e os testes em Node importam pelo efeito e leem globalThis.Landscape.
 * Sem import nem export, nem nada do navegador ou do Worker.
 *
 * Tecnologia (collection `landscape`, id `owner--repo` em minúsculas): { repo: "Owner/Repo", nome, categoria, subcategoria,
 *   site, feed, adicionado, por, gh: {...}, releases: [...], sobre, hn: { historias, comentarios }, gh_destaques: [...],
 *   serie: [[AAAA-MM-DD, estrelas], ...], leve: {...}, em: { <parte>: iso }, atualizado, erro? }
 * Categorias (meta/landscape-categorias): { categorias: [{ id, nome, subcategorias: [{ id, nome }] }], atualizado }
 * Notas do Admin (landscape/<email>, id `notas`): { porId: { <id>: { situacao, nota, link, atualizado } }, atualizado }
 *
 * Imagens: a marca do cartão é o avatar do dono no GitHub só quando o dono é uma organização (marcaOk). Pessoa (User)
 * fica com o monograma desenhado em CSS. Comentários e issues mostram só o nome de usuário, nunca avatar.
 */
(function (raiz) {
  "use strict";

  const DIA = 86_400_000;
  const MAX_TECNOLOGIAS = 300;
  const CORPO_MAX = 8000;
  const SERIE_MAX = 400;
  const TRECHO_MAX = 280;
  const SOBRE_MAX = 1200;
  const NOME_MAX = 60;
  const NOTA_MAX = 2000;
  const URL_MAX = 300;
  const MAX_CATEGORIAS = 30, MAX_SUBCATEGORIAS = 30;
  const ID_OK = /^[a-z0-9._-]+--[a-z0-9._-]+$/;
  const ID_CAT = /^[a-z0-9-]{1,40}$/;
  /* login do GitHub: letras, números e hífen simples, sem começar nem terminar com hífen, até 39 */
  const DONO_OK = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
  const REPO_OK = /^[A-Za-z0-9._-]{1,100}$/;
  /* primeiro trecho do caminho que é página do próprio GitHub, não um dono */
  const RESERVADOS = new Set(["orgs", "settings", "topics", "marketplace", "sponsors", "features", "about", "explore", "trending", "collections", "login", "join",
    "notifications", "issues", "pulls", "search", "new", "organizations", "enterprise", "pricing", "apps", "site", "security", "customer-stories", "readme", "codespaces"]);

  const SITUACOES = [
    { id: "avaliando", nome: "Avaliando" }, { id: "testando", nome: "Testando" }, { id: "uso", nome: "Uso" }, { id: "descartei", nome: "Descartei" },
  ];

  /* ---------- ids e URLs ---------- */
  const idDe = (repo) => String(repo || "").toLowerCase().replace("/", "--");
  /* o "--" não aparece em login do GitHub, então o primeiro "--" separa dono e repositório */
  const repoDoId = (id) => { const i = String(id || "").indexOf("--"); return i > 0 ? id.slice(0, i) + "/" + id.slice(i + 2) : ""; };

  /* URL do GitHub -> { repo: "Owner/Repo", id } ou { erro }. Aceita com ou sem barra no fim, .git e caminho extra
     (/tree/main, /issues/12, ?tab=readme). Recusa outro site, gist, página do GitHub que não é repositório e nome estranho. */
  function lerUrlRepo(txt) {
    let s = String(txt == null ? "" : txt).trim();
    if (!s) return { erro: "URL vazia." };
    if (s.length > URL_MAX) return { erro: "URL longa demais." };
    if (/^(www\.)?github\.com\//i.test(s)) s = "https://" + s;
    let u;
    try { u = new URL(s); } catch (e) { return { erro: "Não é uma URL." }; }
    if (u.protocol !== "https:" && u.protocol !== "http:") return { erro: "Use o endereço https://github.com/dono/repositorio." };
    if (u.username || u.password || (u.port && u.port !== "443")) return { erro: "Use o endereço https://github.com/dono/repositorio." };
    const host = u.hostname.toLowerCase();
    if (host !== "github.com" && host !== "www.github.com") return { erro: "Só repositórios do GitHub (github.com)." };
    const partes = u.pathname.split("/").filter(Boolean);
    if (partes.length < 2) return { erro: "Falta o repositório: https://github.com/dono/repositorio." };
    const dono = partes[0];
    let nome = partes[1].replace(/\.git$/i, "");
    if (RESERVADOS.has(dono.toLowerCase())) return { erro: "Esse endereço é uma página do GitHub, não um repositório." };
    if (!DONO_OK.test(dono)) return { erro: "Nome de dono inválido." };
    if (!REPO_OK.test(nome) || nome === "." || nome === "..") return { erro: "Nome de repositório inválido." };
    const repo = dono + "/" + nome;
    return { repo, id: idDe(repo) };
  }
  /* Várias URLs, uma por linha (ou uma lista). Linha vazia é ignorada; repetida conta uma vez. */
  function lerUrls(entrada, max = 50) {
    const linhas = (Array.isArray(entrada) ? entrada : String(entrada == null ? "" : entrada).split(/\r?\n/)).map((x) => String(x == null ? "" : x).trim()).filter(Boolean);
    const validas = [], recusadas = [], vistos = new Set();
    if (linhas.length > max) return { validas, recusadas, erro: `Até ${max} URLs por vez.` };
    for (const linha of linhas) {
      const r = lerUrlRepo(linha);
      if (r.erro) { recusadas.push({ linha: linha.slice(0, 120), erro: r.erro }); continue; }
      if (vistos.has(r.id)) continue;
      vistos.add(r.id);
      validas.push({ ...r, linha: linha.slice(0, 120) });
    }
    return { validas, recusadas };
  }
  /* site e feed: http(s), sem usuário na URL, até 300 caracteres. "" vale (sem site). Devolve a URL ou null se não serve. */
  function urlOk(txt, { soHttps = false } = {}) {
    const s = String(txt == null ? "" : txt).trim();
    if (!s) return "";
    if (s.length > URL_MAX) return null;
    let u;
    try { u = new URL(s); } catch (e) { return null; }
    if (u.protocol !== "https:" && (soHttps || u.protocol !== "http:")) return null;
    if (u.username || u.password) return null;
    return u.toString();
  }

  /* ---------- imagens ---------- */
  /* Avatar do dono só para organização, montado pelo id numérico (nunca a URL que veio, nunca copiado) */
  function marcaDe(dono) {
    if (!dono || dono.tipo !== "Organization") return "";
    const id = String(dono.id == null ? "" : dono.id);
    return /^\d{1,12}$/.test(id) ? `https://avatars.githubusercontent.com/u/${id}?s=96` : "";
  }
  /* A URL serve de marca? Só https://avatars.githubusercontent.com/u/<id>?s=96 e só de organização. */
  function marcaOk(url, tipo) {
    if (tipo !== "Organization") return false;
    return typeof url === "string" && /^https:\/\/avatars\.githubusercontent\.com\/u\/\d{1,12}\?s=96$/.test(url);
  }
  /* Monograma: iniciais do projeto sobre uma cor tirada do nome (a página pinta em CSS) */
  function monograma(nome) {
    const s = String(nome || "?").trim();
    const partes = s.replace(/([a-z])([A-Z])/g, "$1 $2").split(/[\s\-_.\/]+/).filter(Boolean);
    let ini = partes.length > 1 ? partes[0][0] + partes[1][0] : (partes[0] || "?").slice(0, 2);
    ini = ini.toUpperCase();
    let h = 0;
    for (const c of s.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
    return { iniciais: ini, matiz: h };
  }

  /* ---------- números e datas ---------- */
  const fmt1 = (n) => { const t = (Math.round(n * 10) / 10).toFixed(1).replace(".", ","); return t.endsWith(",0") ? t.slice(0, -2) : t; };
  /* 950, 12,4 mil, 121 mil, 1,2 mi */
  function formatoCurto(n) {
    if (n == null || !Number.isFinite(Number(n))) return "–";
    n = Number(n);
    const s = n < 0 ? "-" : "", a = Math.abs(n);
    if (a < 1000) return s + String(Math.round(a));
    if (a < 100_000) return s + fmt1(a / 1000) + " mil";
    if (a < 999_500) return s + Math.round(a / 1000) + " mil";
    return s + fmt1(a / 1_000_000) + " mi";
  }
  /* Data em São Paulo, AAAA-MM-DD */
  function diaSP(quando) {
    const d = new Date(quando == null ? Date.now() : quando);
    if (isNaN(d)) return "";
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }
    catch (e) { return new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10); }
  }
  const idadeDias = (iso, agora = Date.now()) => { const t = Date.parse(iso || ""); return Number.isFinite(t) ? (agora - t) / DIA : Infinity; };
  /* Ponto de atividade: verde com commit nos últimos 30 dias, âmbar de 30 a 180, cinza depois (ou sem dado) */
  function atividade(iso, agora = Date.now()) {
    const d = idadeDias(iso, agora);
    return d <= 30 ? "verde" : d <= 180 ? "ambar" : "cinza";
  }
  const ehNova = (adicionado, agora = Date.now()) => idadeDias(adicionado, agora) < 14;
  const releaseRecente = (rel, agora = Date.now()) => !!(rel && idadeDias(rel.data, agora) < 7);

  /* ---------- série de estrelas ---------- */
  /* Um ponto por dia: o do mesmo dia é trocado. Ordenada, no máximo 400 pontos (saem os mais velhos). */
  function somarPonto(serie, dia, estrelas) {
    const n = Number(estrelas);
    const ok = (Array.isArray(serie) ? serie : []).filter((p) => Array.isArray(p) && /^\d{4}-\d{2}-\d{2}$/.test(p[0]) && Number.isFinite(Number(p[1])));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dia)) || !Number.isFinite(n)) return ok.slice(-SERIE_MAX);
    const out = ok.filter((p) => p[0] !== dia).concat([[dia, n]]);
    out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return out.slice(-SERIE_MAX);
  }
  const menosDias = (dia, n) => new Date(Date.parse(dia + "T12:00:00Z") - n * DIA).toISOString().slice(0, 10);
  /* Ganho em `dias`: o último ponto menos o ponto mais recente que tem pelo menos `dias` de idade. Sem ponto tão velho: null. */
  function ganho(serie, dias) {
    const s = Array.isArray(serie) ? serie : [];
    if (s.length < 2) return null;
    const ult = s[s.length - 1];
    const corte = menosDias(ult[0], dias);
    let ref = null;
    for (const p of s) { if (p[0] <= corte) ref = p; else break; }
    return ref ? Number(ult[1]) - Number(ref[1]) : null;
  }

  /* ---------- texto ---------- */
  const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©", reg: "®", trade: "™", middot: "·", bull: "•" };
  function entidades(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch (er) { return m; } }
      return ENT[e.toLowerCase()] != null ? ENT[e.toLowerCase()] : m;
    });
  }
  /* HTML (comentário do HN, notas de release) em texto puro: parágrafos separados por linha em branco */
  function textoPuro(html) {
    let s = String(html == null ? "" : html);
    s = s.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ");
    s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?(p|div|li|ul|ol|pre|blockquote|h[1-6]|tr|table)\b[^>]*>/gi, "\n\n");
    s = s.replace(/<[^>]+>/g, "");
    s = entidades(s);
    return s.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n\n");
  }
  /* Trecho curto: até `max` caracteres, cortado no fim de uma frase; sem frase que caiba, na última palavra, com "…" */
  function trecho(txt, max = TRECHO_MAX) {
    const s = String(txt == null ? "" : txt).replace(/\s+/g, " ").trim();
    if (s.length <= max) return s;
    const cabe = s.slice(0, max + 1);
    let fim = -1;
    const re = /[.!?…](?=["'”’)\]]?(\s|$))/g;
    let m;
    while ((m = re.exec(cabe))) { if (m.index + 1 <= max) fim = m.index + 1; }
    if (fim >= Math.floor(max * 0.4)) {
      let f = fim;
      while (f < s.length && /["'”’)\]]/.test(s[f]) && f < max) f++;
      return s.slice(0, f).trim();
    }
    const corte = s.slice(0, max).replace(/\s+\S*$/, "");
    return (corte || s.slice(0, max - 1)).replace(/[\s,;:–-]+$/, "") + "…";
  }
  /* README em texto puro: os primeiros parágrafos de prosa até o primeiro título depois deles, até ~1.200 caracteres.
     Fora: imagens, badges, HTML, blocos de código, tabelas, listas, citações e títulos. Nada de HTML do README passa. */
  function textoDoReadme(md, max = SOBRE_MAX) {
    let s = String(md == null ? "" : md).replace(/\r/g, "");
    s = s.replace(/<!--[\s\S]*?-->/g, "\n");
    /* título em HTML: o conteúdo vira uma linha só (imagem e link dentro dele somem), para sair inteiro como título */
    s = s.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (m, n, dentro) => "\n\n# " + dentro.replace(/<(picture|svg)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() + "\n\n");
    s = s.replace(/^(```|~~~)[^\n]*\n[\s\S]*?\n\1[^\n]*$/gm, "\n");
    s = s.replace(/<(picture|svg|video|table|details|script|style|object|iframe)\b[\s\S]*?<\/\1>/gi, "\n\n");
    s = s.replace(/<img\b[^>]*>/gi, " ");
    s = s.replace(/<h[1-6]\b[^>]*>/gi, "\n\n# ").replace(/<\/h[1-6]>/gi, "\n\n");
    s = s.replace(/<br\s*\/?>/gi, " ");
    s = s.replace(/<\/?(p|div|ul|ol|li|section|center|blockquote|hr)\b[^>]*>/gi, "\n\n");
    s = s.replace(/<[^>]+>/g, "");
    s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/!\[[^\]]*\]\[[^\]]*\]/g, " ");
    s = s.replace(/\[\s*\]\([^)]*\)/g, " ");
    s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1");
    s = s.replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, "");
    s = s.replace(/<(https?:\/\/[^>\s]+)>/g, "$1");
    s = entidades(s);
    const blocos = s.split(/\n\s*\n/);
    const paras = [];
    let total = 0;
    for (const b0 of blocos) {
      const linhas = b0.split("\n").map((l) => l.trim()).filter(Boolean);
      if (!linhas.length) continue;
      const titulo = /^#{1,6}(\s|$)/.test(linhas[0]) || (linhas.length === 2 && /^(=+|-+)$/.test(linhas[1]));
      if (titulo) { if (paras.length) break; continue; }
      if (linhas.every((l) => /^>/.test(l))) continue;
      if (linhas.some((l) => /^\|.*\|$/.test(l) || /^[-|: ]{3,}$/.test(l))) continue;
      if (linhas.filter((l) => /^([-*+]|\d+[.)])\s/.test(l)).length >= Math.ceil(linhas.length / 2)) continue;
      let p = linhas.join(" ").replace(/\s+/g, " ").trim();
      p = p.replace(/(\*\*|__)(.+?)\1/g, "$2").replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s).,;:!?]|$)/g, "$1$2").replace(/`([^`]*)`/g, "$1").trim();
      const letras = (p.match(/\p{L}/gu) || []).length;
      const palavras = p.split(/\s+/).filter((w) => /\p{L}{2,}/u.test(w)).length;
      if (p.length < 40 || palavras < 5 || letras < p.length * 0.5) continue;
      /* linha de navegação ("Quick Start • How It Works • ...", idiomas): três separadores ou mais */
      if (p.split(/\s[·•|]\s/).length >= 3) continue;
      if (total + p.length > max) { const r = trecho(p, Math.max(0, max - total)); if (r.length > 40) paras.push(r); break; }
      paras.push(p);
      total += p.length + 2;
    }
    return paras.join("\n\n");
  }

  /* ---------- Hacker News ---------- */
  const semAcento = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  /* o nome conta sozinho quando é distinto: 5 letras ou mais, ou com hífen, ponto ou número (orca sozinho não basta) */
  const nomeDistinto = (n) => { const s = String(n || "").trim(); return s.length >= 5 || /[-._0-9]/.test(s); };
  const temPalavra = (texto, termo) => !!termo && new RegExp("(^|[^\\p{L}\\p{N}])" + escRe(semAcento(termo)) + "($|[^\\p{L}\\p{N}])", "u").test(semAcento(texto));
  const hostDe = (url) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch (e) { return ""; } };
  const apontaRepo = (url, repo) => !!repo && new RegExp("github\\.com/" + escRe(repo.toLowerCase()) + "($|[^a-z0-9._-])").test(String(url || "").toLowerCase());
  /* A história fala desta tecnologia? Link para o repositório ou para o site, ou o nome (distinto) no título. */
  function cita(tec, { titulo = "", url = "", texto = "" } = {}) {
    const repo = String(tec.repo || ""), nomeRepo = repo.split("/")[1] || "";
    if (apontaRepo(url, repo) || apontaRepo(texto, repo)) return true;
    const site = hostDe(tec.site || (tec.gh && tec.gh.site) || "");
    if (site && site !== "github.com" && (hostDe(url) === site || hostDe(url).endsWith("." + site))) return true;
    const alvo = titulo + " " + texto;
    if (nomeDistinto(tec.nome) && temPalavra(alvo, tec.nome)) return true;
    if (nomeRepo && semAcento(nomeRepo) !== semAcento(tec.nome) && nomeDistinto(nomeRepo) && temPalavra(alvo, nomeRepo)) return true;
    return false;
  }
  /* Comentários de primeiro nível de uma história (resposta de items/<id> do Algolia): os que têm mais respostas, que é o
     sinal de relevância que o HN expõe (comentário não tem pontos na API). Trecho de até 280 caracteres, texto puro. */
  function escolherComentarios(item, n = 5) {
    const filhos = item && Array.isArray(item.children) ? item.children : [];
    const conta = (c) => { let k = 0; for (const f of (c && c.children) || []) k += 1 + conta(f); return k; };
    return filhos
      .filter((c) => c && (c.type === "comment" || c.type == null) && c.author && c.text)
      .map((c) => ({ c, filhos: Array.isArray(c.children) ? c.children.filter((f) => f && f.text).length : 0, todos: conta(c) }))
      .sort((a, b) => b.filhos - a.filhos || b.todos - a.todos || (a.c.created_at_i || 0) - (b.c.created_at_i || 0))
      .slice(0, n)
      .map(({ c, filhos }) => ({ id: String(c.id), autor: String(c.author).slice(0, 40), data: c.created_at || null, respostas: filhos,
        trecho: trecho(textoPuro(c.text)), url: "https://news.ycombinator.com/item?id=" + encodeURIComponent(c.id) }));
  }

  /* ---------- categorias ---------- */
  const slug = (t) => semAcento(t).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const nomeLimpo = (s, max = NOME_MAX) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, max);
  /* { categorias: [{ id?, nome, subcategorias: [{ id?, nome }] }] } -> { categorias } ou { erro }. id que falta sai do nome. */
  function validarCategorias(b) {
    if (!b || typeof b !== "object" || !Array.isArray(b.categorias)) return { erro: "Mande { categorias: [...] }." };
    if (b.categorias.length > MAX_CATEGORIAS) return { erro: `Até ${MAX_CATEGORIAS} categorias.` };
    const ids = new Set(), out = [];
    for (const c of b.categorias) {
      if (!c || typeof c !== "object") return { erro: "Categoria inválida." };
      const nome = nomeLimpo(c.nome);
      if (!nome) return { erro: "Toda categoria precisa de nome." };
      const id = c.id == null || c.id === "" ? slug(nome) : String(c.id);
      if (!ID_CAT.test(id)) return { erro: `Id de categoria inválido: ${String(c.id).slice(0, 40)}` };
      if (ids.has(id)) return { erro: `Categoria repetida: ${nome}` };
      ids.add(id);
      const subs = Array.isArray(c.subcategorias) ? c.subcategorias : [];
      if (subs.length > MAX_SUBCATEGORIAS) return { erro: `Até ${MAX_SUBCATEGORIAS} subcategorias em ${nome}.` };
      const sids = new Set(), so = [];
      for (const s of subs) {
        if (!s || typeof s !== "object") return { erro: "Subcategoria inválida." };
        const sn = nomeLimpo(s.nome);
        if (!sn) return { erro: `Subcategoria sem nome em ${nome}.` };
        const sid = s.id == null || s.id === "" ? slug(sn) : String(s.id);
        if (!ID_CAT.test(sid)) return { erro: `Id de subcategoria inválido: ${String(s.id).slice(0, 40)}` };
        if (sids.has(sid)) return { erro: `Subcategoria repetida em ${nome}: ${sn}` };
        sids.add(sid);
        so.push({ id: sid, nome: sn });
      }
      out.push({ id, nome, subcategorias: so });
    }
    return { categorias: out };
  }
  const acharCategoria = (cats, cid, sid) => {
    const c = (Array.isArray(cats) ? cats : []).find((x) => x.id === cid);
    const s = c && (c.subcategorias || []).find((x) => x.id === sid);
    return c && s ? { categoria: c, subcategoria: s } : null;
  };

  /* ---------- notas do Admin ---------- */
  function validarNotas(b) {
    if (!b || typeof b !== "object" || Array.isArray(b)) return { erro: "corpo" };
    const situacao = b.situacao == null ? "" : String(b.situacao);
    if (situacao && !SITUACOES.some((s) => s.id === situacao)) return { erro: "Situação desconhecida." };
    const nota = b.nota == null ? "" : String(b.nota);
    if (nota.length > NOTA_MAX) return { erro: `A nota guarda até ${NOTA_MAX} caracteres.` };
    const link = urlOk(b.link, { soHttps: true });
    if (link === null) return { erro: "O link precisa começar com https://." };
    return { notas: { situacao, nota: nota.trim(), link } };
  }

  /* ---------- resumo leve (grade, tabela e widget) ---------- */
  /* O que vai em doc.leve, calculado pelo cron a cada gravação. Sem gh ainda: coletando. */
  function leveDe(doc, agora = Date.now()) {
    const gh = (doc && doc.gh) || null;
    const rels = (doc && Array.isArray(doc.releases) ? doc.releases : []).filter((r) => !r.pre);
    const rel = rels[0] || (doc && Array.isArray(doc.releases) ? doc.releases[0] : null) || null;
    const hist = doc && doc.hn && Array.isArray(doc.hn.historias) ? doc.hn.historias : [];
    const recente = hist.filter((h) => idadeDias(h.data, agora) <= 7).sort((a, b) => (b.pontos || 0) - (a.pontos || 0))[0] || null;
    const serie = doc && Array.isArray(doc.serie) ? doc.serie : [];
    const issues = gh && gh.issuesEPrs != null ? Math.max(0, gh.issuesEPrs - (gh.prs || 0)) : null;
    return {
      coletando: !gh,
      estrelas: gh ? gh.estrelas : null,
      ganho7: ganho(serie, 7), ganho30: ganho(serie, 30),
      release: rel ? { tag: rel.tag, data: rel.data } : null,
      commit: gh ? gh.ultimoCommit || gh.push || null : null,
      linguagem: gh ? gh.linguagem || "" : "",
      licenca: gh ? gh.licenca || "" : "",
      issues: gh && gh.prs != null ? issues : gh ? gh.issuesEPrs : null,
      arquivado: !!(gh && gh.arquivado),
      marca: gh && marcaOk(gh.marca, gh.dono && gh.dono.tipo) ? gh.marca : "",
      dono: gh && gh.dono ? gh.dono.tipo || "" : "",
      hn: recente ? { id: recente.id, titulo: recente.titulo, pontos: recente.pontos, data: recente.data } : null,
    };
  }
  /* Widget do Início: release nos últimos 7 dias, salto de estrelas (mais de 5% em 7 dias) e história do HN com mais de
     100 pontos na última semana. Mais recente primeiro. */
  function novidades(lista, agora = Date.now(), n = 5) {
    const out = [];
    for (const t of Array.isArray(lista) ? lista : []) {
      const l = t && t.leve;
      if (!l || l.coletando) continue;
      if (l.release && idadeDias(l.release.data, agora) <= 7) out.push({ id: t.id, nome: t.nome, tipo: "release", data: l.release.data, texto: "lançou " + l.release.tag });
      const base = l.estrelas != null && l.ganho7 != null ? l.estrelas - l.ganho7 : null;
      if (base && base > 0 && l.ganho7 / base > 0.05) out.push({ id: t.id, nome: t.nome, tipo: "estrelas", data: new Date(agora).toISOString(), texto: `+${formatoCurto(l.ganho7)} estrelas em 7 dias (+${fmt1((l.ganho7 / base) * 100)}%)` });
      if (l.hn && (l.hn.pontos || 0) > 100 && idadeDias(l.hn.data, agora) <= 7) out.push({ id: t.id, nome: t.nome, tipo: "hn", data: l.hn.data, texto: `no Hacker News com ${l.hn.pontos} pontos: ${l.hn.titulo}` });
    }
    out.sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
    return out.slice(0, n);
  }

  raiz.Landscape = { DIA, MAX_TECNOLOGIAS, CORPO_MAX, SERIE_MAX, TRECHO_MAX, SOBRE_MAX, NOME_MAX, NOTA_MAX, URL_MAX, ID_OK, ID_CAT, SITUACOES,
    idDe, repoDoId, lerUrlRepo, lerUrls, urlOk, marcaDe, marcaOk, monograma, formatoCurto, diaSP, idadeDias, atividade, ehNova, releaseRecente,
    somarPonto, ganho, entidades, textoPuro, trecho, textoDoReadme, cita, temPalavra, nomeDistinto, escolherComentarios,
    slug, nomeLimpo, validarCategorias, acharCategoria, validarNotas, leveDe, novidades, semAcento };
})(typeof globalThis !== "undefined" ? globalThis : this);
