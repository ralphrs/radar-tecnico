/* Landscape (Tech): regras puras das tecnologias que o Lookout acompanha, as mesmas na página, no Worker e nos testes.
 *
 * Script clássico (<script src="/landscape.js">), como o esportes.js e o tabela.js: a página usa window.Landscape, e o
 * Worker (src/landscape.js) e os testes em Node importam pelo efeito e leem globalThis.Landscape.
 * Sem import nem export, nem nada do navegador ou do Worker.
 *
 * Tecnologia (collection `landscape`, id `owner--repo` em minúsculas): { repo: "Owner/Repo", nome, categoria, subcategoria,
 *   site, feed, modelo?, aba?: "outras" | "linguagens", reavaliar?: { motivo, em, por }, adicionado, por, gh: {...}, releases: [...], sobre, hn: { historias, comentarios }, gh_destaques: [...],
 *   serie: [[AAAA-MM-DD, estrelas], ...], leve: {...}, em: { <parte>: iso }, atualizado, erro? }
 * Categorias (meta/landscape-categorias): { categorias: [{ id, nome, aba?: "outras" | "linguagens", subcategorias: [{ id, nome }] }], atualizado }
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

  /* ---------- modelo (pedido de 19/11) ----------
     O que a tecnologia é do ponto de vista de licença e de quem paga: campo `modelo` no doc, gravado só pelo Admin.
     Uma tabela só: id (fixo, é o que está no banco), rótulo, curto (cabe no cartão da grade), explicação (vai no
     title, na legenda e no detalhe) e tom (cor da etiqueta na página, sempre junto do texto). Vazio ou id que não está
     aqui: sem etiqueta. */
  const MODELOS = [
    { id: "aberto", rotulo: "Open source", curto: "Open source", explicacao: "Código aberto, sem oferta paga de quem mantém o projeto.", tom: "verde" },
    { id: "freemium", rotulo: "Freemium", curto: "Freemium", explicacao: "Dá para usar de graça até certo ponto: por conta própria, quando o código é aberto, ou num plano grátis limitado. A versão hospedada ou os recursos a mais são pagos.", tom: "azul" },
    { id: "fonte-disponivel", rotulo: "Código disponível", curto: "Cód. disponível", explicacao: "O código é público, mas a licença restringe o uso (BSL, SSPL, Elastic e parecidas).", tom: "ambar" },
    { id: "pago", rotulo: "Pago", curto: "Pago", explicacao: "Produto fechado, sem plano grátis que sirva para uso de verdade.", tom: "cinza" },
  ];
  /* Valores antigos que ainda podem estar no banco: "aberto-pago" (Open source + nuvem paga, até 19/11) virou Freemium */
  const MODELO_ANTIGO = { "aberto-pago": "freemium" };
  const NOTA_MODELO_MAX = 240;
  const modeloPorId = (v) => (typeof v === "string" && v ? MODELOS.find((m) => m.id === (MODELO_ANTIGO[v] || v)) || null : null);
  /* A entrada da tabela para o doc (ou item da lista leve), ou null */
  const modeloDe = (doc) => modeloPorId(doc && typeof doc === "object" ? doc.modelo : null);
  /* O texto que explica o modelo no detalhe: a nota da tecnologia ("Por que é freemium: ...") ou, sem nota, a explicação geral */
  function porQueModelo(doc) {
    const m = modeloDe(doc);
    if (!m) return "";
    const nota = doc && typeof doc.modelo_nota === "string" ? doc.modelo_nota.replace(/\s+/g, " ").trim() : "";
    return nota ? "Por que é " + m.rotulo.toLowerCase() + ": " + nota : m.explicacao;
  }
  /* Nota do Admin: undefined não mexe; "" ou null apaga; texto até 240 caracteres */
  function validarNotaModelo(v) {
    if (v === undefined) return { mexe: false };
    if (v === null || v === "") return { mexe: true, nota: null };
    if (typeof v !== "string") return { erro: "O porquê do modelo precisa ser texto." };
    const t = v.replace(/\s+/g, " ").trim();
    if (t.length > NOTA_MODELO_MAX) return { erro: `O porquê do modelo guarda até ${NOTA_MODELO_MAX} caracteres.` };
    return { mexe: true, nota: t || null };
  }
  /* Corpo do Admin: undefined não mexe; "" ou null tira a etiqueta (null no json_patch apaga a chave); id da tabela grava. */
  function validarModelo(v) {
    if (v === undefined) return { mexe: false };
    if (v === null || v === "") return { mexe: true, modelo: null };
    if (typeof v !== "string" || !MODELOS.some((m) => m.id === v)) return { erro: "Modelo desconhecido." };
    return { mexe: true, modelo: v };
  }
  /* ---------- opções de uso (pedido de 19/11) ----------
     Como dá para usar a tecnologia ou o serviço: campo `uso` (lista de ids desta tabela) e `uso_nota` (até 240), só do
     Admin. Valor fora da tabela é ignorado; lista vazia ou ausente é "sem informação" (a tela diz "não conferido"). */
  const USOS = [
    { id: "nuvem", rotulo: "Nuvem do fornecedor", explicacao: "Serviço hospedado e operado por quem faz." },
    { id: "self-hosted", rotulo: "Self-hosted", explicacao: "Você instala e opera no seu servidor ou data center (on-premises incluído)." },
    { id: "local", rotulo: "Roda local", explicacao: "Dá para instalar na própria máquina, para desenvolver ou testar." },
    { id: "biblioteca", rotulo: "Biblioteca", explicacao: "Entra dentro do seu aplicativo, sem serviço à parte." },
  ];
  const USO_NOTA_MAX = 240;
  /* Os ids válidos do doc, na ordem da tabela, sem repetir */
  const usoDe = (doc) => { const v = doc && typeof doc === "object" && Array.isArray(doc.uso) ? doc.uso : []; return USOS.filter((u) => v.includes(u.id)).map((u) => u.id); };
  /* Frase curta para o cartão e a comparação; "" quando não há informação */
  function resumoDeUso(doc) {
    const u = new Set(usoDe(doc));
    if (!u.size) return "";
    const n = u.has("nuvem"), sh = u.has("self-hosted"), lo = u.has("local"), bi = u.has("biblioteca");
    if (bi && n) return "Biblioteca ou nuvem";
    if (bi && !sh) return "Biblioteca";
    if (n && sh) return "Nuvem ou self-hosted";
    if (n && !lo) return "Só na nuvem";
    if (sh) return "Só self-hosted";
    if (n && lo) return "Nuvem ou local";
    if (lo) return "Roda local";
    return "";
  }
  /* As três perguntas do detalhe: "sim", "não" ou "não conferido" (sem informação nenhuma não dá para dizer "não") */
  function perguntasDeUso(doc) {
    const u = new Set(usoDe(doc));
    const r = (sim) => (!u.size ? "não conferido" : sim ? "sim" : "não");
    return [
      { id: "nuvem", pergunta: "Tem nuvem do fornecedor?", resposta: r(u.has("nuvem")) },
      { id: "self-hosted", pergunta: "Dá para hospedar por conta própria (on-premises)?", resposta: r(u.has("self-hosted")) },
      { id: "local", pergunta: "Dá para instalar na própria máquina?", resposta: r(u.has("local") || u.has("biblioteca") || u.has("self-hosted")) },
    ];
  }
  /* Corpo do Admin: undefined não mexe; lista (só ids da tabela) grava, vazia apaga; nota até 240 */
  function validarUso(v) {
    if (v === undefined) return { mexe: false };
    if (v === null || v === "") return { mexe: true, uso: null };
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) return { erro: "Uso precisa ser uma lista." };
    if (v.some((x) => !USOS.some((u) => u.id === x))) return { erro: "Opção de uso desconhecida." };
    const l = usoDe({ uso: v });
    return { mexe: true, uso: l.length ? l : null };
  }
  function validarUsoNota(v) {
    if (v === undefined) return { mexe: false };
    if (v === null || v === "") return { mexe: true, nota: null };
    if (typeof v !== "string") return { erro: "A nota de uso precisa ser texto." };
    const t = v.replace(/\s+/g, " ").trim();
    if (t.length > USO_NOTA_MAX) return { erro: `A nota de uso guarda até ${USO_NOTA_MAX} caracteres.` };
    return { mexe: true, nota: t || null };
  }
  /* Chips do filtro: os usos que aparecem na lista, na ordem da tabela, com a contagem */
  function contarUsos(lista) {
    const n = new Map();
    for (const t of Array.isArray(lista) ? lista : []) for (const u of usoDe(t)) n.set(u, (n.get(u) || 0) + 1);
    return USOS.filter((u) => n.has(u.id)).map((u) => ({ ...u, n: n.get(u.id) }));
  }

  /* ---------- para reavaliar (pedido de 19/11, 23h46) ----------
     Marca de quem revisa o landscape numa tecnologia que parece pouco promissora, para o Admin olhar de novo e decidir
     se fica. Campo `reavaliar: { motivo (até 240), em (ISO), por: "ia" | "admin" }` no doc; sem o campo, não está
     marcada. Quem revisa grava direto no banco (por: "ia"); o Admin marca e desmarca pela tela (por: "admin"). O cron de
     coleta nunca tem a chave. */
  const REAVALIAR_MAX = 240;
  const POR_REAVALIAR = ["ia", "admin"];
  /* A marca saneada do doc (ou do item da lista leve): { motivo, em, por } ou null. Valor que não é objeto conta como sem
     marca; motivo vira texto de uma linha cortado em 240; data inválida vira null; `por` fora da lista vira null. */
  function reavaliarDe(doc) {
    const r = doc && typeof doc === "object" ? doc.reavaliar : null;
    if (!r || typeof r !== "object" || Array.isArray(r)) return null;
    const motivo = typeof r.motivo === "string" ? r.motivo.replace(/\s+/g, " ").trim().slice(0, REAVALIAR_MAX) : "";
    const t = typeof r.em === "string" ? Date.parse(r.em) : NaN;
    return { motivo, em: Number.isFinite(t) ? new Date(t).toISOString() : null, por: POR_REAVALIAR.includes(r.por) ? r.por : null };
  }
  /* Corpo do Admin: undefined não mexe; null (ou "") tira a marca; { motivo } marca (motivo pode ficar vazio, até 240). */
  function validarReavaliar(v) {
    if (v === undefined) return { mexe: false };
    if (v === null || v === "") return { mexe: true, reavaliar: null };
    if (typeof v !== "object" || Array.isArray(v)) return { erro: "Para reavaliar: mande { motivo } para marcar ou null para tirar a marca." };
    if (v.motivo != null && typeof v.motivo !== "string") return { erro: "O motivo para reavaliar precisa ser texto." };
    const motivo = String(v.motivo || "").replace(/\s+/g, " ").trim();
    if (motivo.length > REAVALIAR_MAX) return { erro: `O motivo para reavaliar guarda até ${REAVALIAR_MAX} caracteres.` };
    return { mexe: true, reavaliar: { motivo } };
  }
  /* Quantas da lista estão marcadas (o chip "Para reavaliar" só aparece com 1 ou mais) */
  const contarReavaliar = (lista) => (Array.isArray(lista) ? lista : []).filter((t) => reavaliarDe(t)).length;

  /* Filtro da grade e da tabela: busca pelo nome ou repositório, linguagem, licença, categoria, modelos (vários valem
     juntos, qualquer um deles; lista vazia é todos), usos e `reavaliar` (true: só as marcadas). Não ordena. */
  function filtrar(lista, f = {}) {
    const q = semAcento(f.busca || "").trim();
    const mods = new Set(Array.isArray(f.modelos) ? f.modelos : []);
    const usos = new Set(Array.isArray(f.usos) ? f.usos : []);
    return (Array.isArray(lista) ? lista : []).filter((t) => {
      if (!t) return false;
      const l = t.leve || {};
      if (q && !semAcento((t.nome || "") + " " + (t.repo || "")).includes(q)) return false;
      if (f.ling && l.linguagem !== f.ling) return false;
      if (f.lic && l.licenca !== f.lic) return false;
      if (f.categoria && t.categoria !== f.categoria) return false;
      if (mods.size) { const m = modeloDe(t); if (!m || !mods.has(m.id)) return false; }
      if (usos.size) { const u = usoDe(t); if (!u.some((x) => usos.has(x))) return false; }
      if (f.reavaliar && !reavaliarDe(t)) return false;
      return true;
    });
  }
  /* ---------- destaques da subcategoria (adendo de 19/11, 23h18) ----------
     Na grade por subcategoria das abas de tecnologia, os 3 itens com mais estrelas (leve.estrelas; empate pelo nome)
     ganham o cartão de destaque. Só quando a subcategoria tem 4 itens ou mais (com até 3, não há "mais populares").
     Item sem estrelas coletadas não entra. Devolve os ids em ordem (1º, 2º, 3º). */
  const DESTAQUES = 3, DESTAQUE_MIN = 4;
  function destaquesDaSub(itens) {
    const l = Array.isArray(itens) ? itens.filter(Boolean) : [];
    if (l.length < DESTAQUE_MIN) return [];
    const est = (t) => { const n = t && t.leve && !t.leve.coletando ? t.leve.estrelas : null; return typeof n === "number" && Number.isFinite(n) ? n : null; };
    return l.filter((t) => est(t) != null)
      .sort((a, b) => est(b) - est(a) || String(a.nome || a.repo || "").localeCompare(String(b.nome || b.repo || ""), "pt-BR", { sensitivity: "base" }) || String(a.id).localeCompare(String(b.id)))
      .slice(0, DESTAQUES).map((t) => t.id);
  }
  /* Na tela, com busca ou filtro: o destaque vale só se restarem 4 ou mais visíveis na subcategoria, e a posição é a da
     subcategoria inteira. Devolve { destaques: [{ id, posicao }], resto: [ids na ordem de `visiveis`] }. */
  function destaquesVisiveis(todosDaSub, visiveis) {
    const vis = Array.isArray(visiveis) ? visiveis.filter(Boolean) : [];
    const rank = destaquesDaSub(todosDaSub);
    if (vis.length < DESTAQUE_MIN || !rank.length) return { destaques: [], resto: vis.map((t) => t.id) };
    const ids = new Set(vis.map((t) => t.id));
    const destaques = rank.map((id, i) => ({ id, posicao: i + 1 })).filter((d) => ids.has(d.id));
    const fora = new Set(destaques.map((d) => d.id));
    return { destaques, resto: vis.map((t) => t.id).filter((id) => !fora.has(id)) };
  }

  /* Chips do filtro: só os modelos que aparecem na lista, na ordem da tabela, com a contagem */
  function contarModelos(lista) {
    const n = new Map();
    for (const t of Array.isArray(lista) ? lista : []) { const m = modeloDe(t); if (m) n.set(m.id, (n.get(m.id) || 0) + 1); }
    return MODELOS.filter((m) => n.has(m.id)).map((m) => ({ ...m, n: n.get(m.id) }));
  }

  /* ---------- abas (pedido de 19/11, 23h02, e adendo das 23h09) ----------
     O ArchLandscape tem Tools (as tecnologias de arquitetura) e abas extras com a mesma máquina (collection `landscape`,
     coleta, detalhe, comparação): Languages (linguagens e frameworks por tipo de uso) e Other Tools (ferramentas que o
     Admin acompanha fora da arquitetura). O que separa é o campo `aba` no doc da tecnologia e em cada categoria de
     meta/landscape-categorias, com o id de uma linha desta tabela. Sem o campo, ou com valor fora dela, é "tools".
     Só o Admin grava; o cron de coleta nunca tem a chave.
     Uma tabela só: id (o que vai no banco), rótulo (o nome da aba na tela, em português desde o adendo de 19/11, 23h47; id e hash continuam os de antes), hash (#arch/<hash>), título e
     subtítulo da grade, o nome de um e de vários itens, a frase da aba vazia e `noticias` (adendo das 23h10: false em
     Other Tools, onde a tecnologia não coleta nem mostra Hacker News, comentários, blog, notícias do Lookout e fóruns). A ordem é a das abas na página, com Cloud
     logo depois de Tools. Aba nova no futuro: mais uma linha aqui. */
  const ABAS = [
    { id: "tools", rotulo: "Ferramentas", hash: "tools", subtitulo: "tecnologias que eu acompanho", um: "tecnologia", varios: "tecnologias", vazio: "Nenhuma tecnologia no landscape ainda.", adicionar: "Adicionar tecnologia", noticias: true },
    { id: "linguagens", rotulo: "Linguagens", hash: "languages", titulo: "Linguagens e frameworks", subtitulo: "linguagens e frameworks por tipo de uso", um: "item", varios: "itens", vazio: "Nenhuma linguagem ou framework aqui ainda.", adicionar: "Adicionar linguagem ou framework", noticias: true },
    { id: "outras", rotulo: "Outras ferramentas", hash: "other", subtitulo: "outras ferramentas que eu acompanho, fora da arquitetura", um: "ferramenta", varios: "ferramentas", vazio: "Nenhuma ferramenta aqui ainda.", adicionar: "Adicionar ferramenta", noticias: false },
  ];
  const ABA_IDS = ABAS.map((a) => a.id);
  /* A linha da tabela pelo id (ou pelo hash); id desconhecido é Tools */
  const abaPorId = (id) => ABAS.find((a) => a.id === id) || ABAS[0];
  const abaPorHash = (h) => ABAS.find((a) => a.hash === h) || ABAS[0];
  const abaDe = (doc) => (doc && typeof doc === "object" && typeof doc.aba === "string" && ABA_IDS.includes(doc.aba) ? doc.aba : "tools");
  const nomeAba = (id) => abaPorId(id).rotulo;
  /* A tecnologia (ou a aba) tem notícias? false só nas abas com noticias: false */
  const temNoticias = (doc) => abaPorId(abaDe(doc)).noticias !== false;
  /* As partes da coleta que são de notícia: o cron pula para quem não tem notícias */
  const PARTES_NOTICIA = ["hn", "comentarios", "blog"];
  const normAba = (id) => abaPorId(id).id;
  /* Só as da aba (tecnologias ou categorias) */
  const daAba = (lista, aba) => (Array.isArray(lista) ? lista : []).filter((x) => x && abaDe(x) === normAba(aba));
  /* Corpo do Admin: undefined não mexe; "" ou null é Tools (no json_patch vira null, que apaga a chave); id da tabela grava */
  function validarAba(v) {
    if (v === undefined) return { mexe: false };
    if (v === null || v === "") return { mexe: true, aba: "tools" };
    if (typeof v === "string" && ABA_IDS.includes(v)) return { mexe: true, aba: v };
    return { erro: "Aba desconhecida: use " + ABA_IDS.filter((x) => x !== "tools").map((x) => '"' + x + '"').join(" ou ") + ", ou deixe vazio para Ferramentas." };
  }
  /* O que vai no doc para a aba: Tools não grava o campo */
  const campoAba = (aba) => (normAba(aba) === "tools" ? {} : { aba: normAba(aba) });
  /* A categoria escolhida serve para a aba? { ok } ou { erro } com a frase da tela */
  function categoriaDaAba(cat, aba) {
    if (!cat) return { erro: "Escolha a categoria." };
    if (abaDe(cat) === normAba(aba)) return { ok: true };
    return { erro: `A categoria ${cat.nome || cat.id} é da aba ${nomeAba(abaDe(cat))}. Escolha uma categoria da aba ${nomeAba(aba)}.` };
  }

  /* ---------- ids e URLs ---------- */
  const idDe =(repo) => String(repo || "").toLowerCase().replace("/", "--");
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
      /* aba: só a de uma aba extra fica gravada; sem o campo, a categoria é de Tools */
      out.push({ id, nome, subcategorias: so, ...campoAba(abaDe(c)) });
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
      const modelo = modeloDe(t) ? modeloDe(t).id : "";
      if (l.release && idadeDias(l.release.data, agora) <= 7) out.push({ id: t.id, nome: t.nome, modelo, tipo: "release", data: l.release.data, texto: "lançou " + l.release.tag });
      const base = l.estrelas != null && l.ganho7 != null ? l.estrelas - l.ganho7 : null;
      if (base && base > 0 && l.ganho7 / base > 0.05) out.push({ id: t.id, nome: t.nome, modelo, tipo: "estrelas", data: new Date(agora).toISOString(), texto: `+${formatoCurto(l.ganho7)} estrelas em 7 dias (+${fmt1((l.ganho7 / base) * 100)}%)` });
      if (l.hn && (l.hn.pontos || 0) > 100 && idadeDias(l.hn.data, agora) <= 7) out.push({ id: t.id, nome: t.nome, modelo, tipo: "hn", data: l.hn.data, texto: `no Hacker News com ${l.hn.pontos} pontos: ${l.hn.titulo}` });
    }
    out.sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
    return out.slice(0, n);
  }

  raiz.Landscape = { DIA, MAX_TECNOLOGIAS, CORPO_MAX, SERIE_MAX, TRECHO_MAX, SOBRE_MAX, NOME_MAX, NOTA_MAX, URL_MAX, ID_OK, ID_CAT, SITUACOES,
    idDe, repoDoId, lerUrlRepo, lerUrls, urlOk, marcaDe, marcaOk, monograma, formatoCurto, diaSP, idadeDias, atividade, ehNova, releaseRecente,
    somarPonto, ganho, entidades, textoPuro, trecho, textoDoReadme, cita, temPalavra, nomeDistinto, escolherComentarios,
    slug, nomeLimpo, validarCategorias, acharCategoria, validarNotas, leveDe, novidades, semAcento,
    MODELOS, MODELO_ANTIGO, NOTA_MODELO_MAX, modeloDe, porQueModelo, validarModelo, validarNotaModelo, filtrar, contarModelos,
    USOS, USO_NOTA_MAX, usoDe, resumoDeUso, perguntasDeUso, validarUso, validarUsoNota, contarUsos,
    DESTAQUES, DESTAQUE_MIN, destaquesDaSub, destaquesVisiveis, ABAS, ABA_IDS, abaPorId, abaPorHash, abaDe, nomeAba, temNoticias, PARTES_NOTICIA, daAba, validarAba, campoAba, categoriaDaAba,
    REAVALIAR_MAX, reavaliarDe, validarReavaliar, contarReavaliar };
})(typeof globalThis !== "undefined" ? globalThis : this);
