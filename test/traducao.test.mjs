// Tradução das notícias (pedido de 13/11): idioma, proteção do que não se traduz, orçamento e pausa, fila, gravação só
// nos campos _pt e com a chave explícita, Landscape mantendo a tradução quando o texto não muda, sem env.AI nada
// acontece, preferência e contagem de subrequests do cron. D1 em SQLite do Node; o AI é sempre falso (nunca o real).
import test from "node:test";
import assert from "node:assert/strict";
import { cronTraducao, montarFila, sqlFila, lerEstado, classificarErro, traduzirTexto, resumoAdmin, MODELO, TETO_DIA, POR_MINUTO, LIMITE_SUBREQ, RESERVA_SUBREQ } from "../src/traducao.js";
import { rodadaLandscape, rotaLandscape, listaLeve } from "../src/landscape.js";
import { envContado } from "../src/traducao.js";
import { d1Falso, espelhoFalso } from "./d1-falso.mjs";
import "../public/traducao.js";

const T = globalThis.Traducao;
const DIA = 86_400_000, MIN = 60_000;
const AGORA = Date.parse("2026-11-13T15:00:00Z");
const iso = (t) => new Date(t).toISOString();

// AI falso: "traduz" trocando palavras de um dicionário e devolve os marcadores como vieram. Anota cada chamada.
const DIC = { "Why": "Por que", "we": "nós", "moved": "mudamos", "our": "nossa", "stack": "pilha", "to": "para", "the": "o", "is": "é", "a": "um", "new": "novo",
  "We": "Nós", "replaced": "trocamos", "with": "com", "this": "isto", "release": "versão", "notes": "notas", "Faster": "Mais rápidas", "queries": "consultas",
  "fancy": "caprichada", "monitoring": "monitoramento", "tool": "ferramenta", "self-hosted": "auto-hospedada", "A": "Uma", "of": "de", "for": "para", "and": "e" };
function aiFalso({ falhaCom = null, comer = false, depois = 1 } = {}) {
  const chamadas = [];
  return {
    chamadas,
    run: async (modelo, entrada) => {
      chamadas.push({ modelo, ...entrada });
      if (falhaCom && chamadas.length >= depois) throw new Error(falhaCom);
      let t = entrada.text.split(/(\s+)/).map((w) => DIC[w] ?? w).join("");
      if (comer) t = t.replace(/\{0\}/, "");
      return { translated_text: "[pt] " + t };
    },
  };
}
function base(extra = {}) {
  const env = { DB: d1Falso(), ...extra };
  const put = (c, id, data, coletado = iso(AGORA - 3600_000)) => env.DB.db.prepare("INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES (?, ?, ?, ?, ?)").run(c, id, JSON.stringify(data), coletado, "2026-11-13T10:00:00.000Z");
  const get = (c, id) => { const r = env.DB.db.prepare("SELECT data, atualizado FROM docs WHERE collection = ? AND id = ?").get(c, id); return r ? { ...JSON.parse(r.data), _atualizado: r.atualizado } : null; };
  return { env, put, get };
}

// ---------- idioma ----------
test("precisaTraduzir: português não, inglês e espanhol sim, misto pelo que pesa mais, nome próprio e código não", () => {
  const sim = ["Why we moved our stack to OpenObserve", "Show HN: Orca, run a fleet of coding agents with your own subscription",
    "We replaced a self-managed Elasticsearch cluster with this last spring.", "Licensing matters here. Read the license before you build a product on top of it.",
    "Nvidia stock falls 5% after earnings", "A fancy self-hosted monitoring tool",
    "El gobierno anunció hoy un nuevo plan para la economía", "La empresa dice que los precios bajan este año"];
  const nao = ["OpenObserve chega à 0.70 com pipelines e SLOs", "Dashboard trava com mais de 50 painéis", "Suporte a SSO com OIDC na edição aberta",
    "Trocamos o Elastic pelo OpenObserve: seis meses depois", "Correções e melhorias.", "Lula prometeu reformar o Judiciário",
    "Claude Code ganha suporte a MCP e roda no VS Code", /* misto: pt com nomes em inglês */
    "OpenObserve", "Uptime Kuma", "v0.70.0", "2.0.2", "`npm install scrapling`", "https://github.com/openobserve/openobserve", "@louislam", "#rust", "AGPL-3.0", "Nice.", "", "   ", null];
  for (const t of sim) assert.equal(T.precisaTraduzir(t), true, "traduz: " + t);
  for (const t of nao) assert.equal(T.precisaTraduzir(t), false, "não traduz: " + t);
  assert.equal(T.idioma("El gobierno anunció hoy un nuevo plan"), "es");
  assert.equal(T.idioma("Why we moved our stack"), "en");
  // misto inglês com nome em português e vice-versa: ganha a língua das palavras comuns
  assert.equal(T.idioma("How Nubank built its data platform on Rust"), "en");
  assert.equal(T.idioma("Como o Shopify usa o React Native no app"), "pt");
  // a dica do feed decide o empate e o que não tem palavra comum o bastante
  assert.equal(T.precisaTraduzir("Stack de dados"), false);
  assert.equal(T.idioma("Gurias Coloradas recebem o Bragantino", { pais: "BR" }), "pt");
  assert.equal(T.idioma("Data stack trends", { pais: "US" }), "en", "sem palavra comum, a dica do país vale");
  assert.equal(T.idioma("Data stack trends"), "", "sem palavra comum e sem dica: não dá para dizer, e não gasta");
});

// ---------- proteção ----------
test("proteger e restaurar: nomes, crases, URLs, menções, hashtags, versões e siglas voltam intactos; marcador perdido descarta", () => {
  const txt = "Show HN: Claude Code v2.1.3 adds `--json` to the CLI, see https://x.dev/a?b=1 by @dev_1 #rust on Node.js and gpt-4o with OpenObserve";
  const p = T.proteger(txt, ["OpenObserve"]);
  for (const x of ["Claude Code", "v2.1.3", "`--json`", "CLI", "https://x.dev/a?b=1", "@dev_1", "#rust", "Node.js", "gpt-4o", "OpenObserve", "HN"]) assert.ok(p.pedacos.includes(x), "protegeu " + x);
  assert.ok(!/Claude|https|@dev|#rust|v2\.1/.test(p.texto), "nada disso vai para o modelo");
  // o modelo mexe no resto, mas devolve os marcadores (até com espaço dentro)
  const traduzido = p.texto.replace("adds", "adiciona").replace("see", "veja").replace("{4}", "{ 4 }");
  const volta = T.restaurar(traduzido, p.pedacos);
  for (const x of p.pedacos) assert.ok(volta.includes(x), "voltou " + x);
  assert.ok(volta.includes("adiciona") && volta.includes("veja"));
  // sumiu um, repetiu um ou apareceu um que não existia: null (fica o original)
  assert.equal(T.restaurar(traduzido.replace("{0}", ""), p.pedacos), null);
  assert.equal(T.restaurar(traduzido + " {1}", p.pedacos), null);
  assert.equal(T.restaurar(traduzido + " {99}", p.pedacos), null);
  // marcador que já vinha no texto também volta igual
  const q = T.proteger("Use {0} in the template", []);
  assert.equal(T.restaurar(q.texto, q.pedacos), "Use {0} in the template");
  assert.equal(T.saidaOk("abc def ghi jkl mno", ""), false);
  assert.equal(T.saidaOk("Why we moved our stack", "Why we moved our stack"), false, "devolveu igual: não traduziu");
});

test("vista e busca: português no lugar do original quando ligada, original guardado; desligada mostra o original", () => {
  const i = { titulo: "Why we moved", titulo_pt: "Por que mudamos", resumo: "Texto", url: "u" };
  const v = T.vista(i, true);
  assert.equal(v.titulo, "Por que mudamos"); assert.equal(v._orig.titulo, "Why we moved"); assert.equal(v.resumo, "Texto"); assert.equal(v._trad, true);
  assert.equal(T.vista(i, false), i);
  assert.equal(T.vista({ titulo: "Só original" }, true).titulo, "Só original");
  assert.ok(T.textoBusca(i).includes("Why we moved") && T.textoBusca(i).includes("Por que mudamos"));
  assert.ok(T.textoBusca(v).includes("Why we moved"), "a vista ainda acha pelo original");
});

test("preferência: ligada por padrão, só desliga com mostrar: false; validação recusa o resto", () => {
  assert.deepEqual(T.respostaPrefs(null), { mostrar: true, salvo: false });
  assert.deepEqual(T.respostaPrefs({ mostrar: false }), { mostrar: false, salvo: true });
  assert.deepEqual(T.validarPrefs({ mostrar: false }), { prefs: { mostrar: false } });
  assert.ok(T.validarPrefs({ mostrar: "não" }).erro);
  assert.ok(T.validarPrefs({ mostrar: true, outro: 1 }).erro);
  assert.ok(T.validarPrefs([]).erro);
});

// ---------- sem AI ----------
test("sem env.AI a etapa não faz nada e não quebra (nem lê o banco)", async () => {
  const { env } = base();
  const antes = env.DB.log.length;
  assert.deepEqual(await cronTraducao(env, { agora: AGORA }), { desligada: true });
  assert.deepEqual(await cronTraducao({ DB: env.DB, AI: {} }, { agora: AGORA }), { desligada: true });
  assert.equal(env.DB.log.length, antes);
  assert.deepEqual(await cronTraducao(undefined), { desligada: true });
});

// ---------- fila ----------
test("fila: Landscape, depois itens do mais novo ao mais velho, depois fóruns; títulos antes dos textos longos; nada com mais de 3 dias", () => {
  const ls = [{ id: "a--b", data: JSON.stringify({ nome: "Bê", repo: "a/b", gh: { descricao: "A fancy self-hosted monitoring tool" }, sobre: "This is the README intro for the tool.", releases: [{ tag: "v1.0.0", nome: "v1.0.0", notas: "Faster queries for the dashboard" }] }) }];
  const linhas = [
    { c: "items", id: "i1", coletado: iso(AGORA - 2 * 3600_000), data: JSON.stringify({ titulo: "Why we moved our stack to Rust", resumo: "Resumo já em português com o que importa.", publicado: iso(AGORA - 2 * 3600_000) }) },
    { c: "items-negocios", id: "i2", coletado: iso(AGORA - 1 * 3600_000), data: JSON.stringify({ titulo: "Stripe raises a new round", resumo: "The company is now worth more than before.", publicado: iso(AGORA - 3600_000) }) },
    { c: "items", id: "i3", coletado: iso(AGORA - 3600_000), data: JSON.stringify({ titulo: "Old story about the cloud", publicado: iso(AGORA - 4 * DIA) }) },
    { c: "items", id: "i4", coletado: iso(AGORA - 3600_000), data: JSON.stringify({ titulo: "Notícia já em português sobre a nuvem", publicado: iso(AGORA - 3600_000) }) },
    { c: "foruns-tech", id: "r1", coletado: iso(AGORA - 600_000), data: JSON.stringify({ titulo: "What is the best way to learn Kubernetes?", resumo: "" }) },
  ];
  const f = montarFila({ linhas, landscape: ls, agora: AGORA });
  const ordem = f.tarefas.map((t) => (t.tipo === "ls" ? "ls:" + t.chave : t.c + ":" + t.id + ":" + t.campo));
  assert.deepEqual(ordem.slice(0, 4), ["ls:gh.descricao", "items-negocios:i2:titulo", "items:i1:titulo", "foruns-tech:r1:titulo"], "títulos: landscape, itens do mais novo, fóruns");
  assert.deepEqual(ordem.slice(4), ["ls:sobre", "ls:rel:v1.0.0:notas", "items-negocios:i2:resumo"], "longos depois, na mesma prioridade");
  assert.ok(!ordem.some((x) => x.includes(":i3:")), "publicado há 4 dias fica de fora");
  const velho = f.marcas.find((m) => m.id === "i3");
  assert.deepEqual(velho.patch.trad.velho, true);
  const pt = f.marcas.find((m) => m.id === "i4");
  assert.equal(pt.patch.trad.ok, true); assert.equal(pt.patch.trad.igual, true); assert.equal(pt.patch.trad.f.titulo, "igual");
  const i1 = f.marcas.find((m) => m.id === "i1");
  assert.equal(i1.patch.trad.f.resumo, "igual"); assert.equal(i1.patch.trad.ok, undefined, "título ainda pendente");
  // SQL: só items/foruns/destaques e o corte de 3 dias, com a chave da collection em cada parte
  const { sql, args } = sqlFila(AGORA);
  assert.ok(!/favs\/|listas\/|prefs\/|carteira\/|leitura\/|data\/users|sombra/.test(sql + args.join(" ")));
  assert.ok(args.includes(iso(AGORA - 3 * DIA)));
});

// ---------- cron: gravação, orçamento e pausa ----------
test("cron: grava só os campos _pt e o trad, um UPDATE por doc com collection e id, atualizado novo para o espelho", async () => {
  const ai = aiFalso();
  const { env, put, get } = base({ AI: ai });
  put("items", "i1", { titulo: "Why we moved our stack to Rust", resumo: "Resumo já em português, com o que importa.", url: "https://x/1", fonte: "Blog", publicado: iso(AGORA - 3600_000) });
  put("foruns-tech", "r1", { titulo: "We replaced the old stack with this", resumo: "", url: "https://reddit.com/r/x", sub: "devops" }, iso(AGORA - 600_000));
  put("items", "i2", { titulo: "Notícia em português sobre a nuvem", url: "https://x/2", publicado: iso(AGORA - 3600_000) });
  put("prefs/p@x.dev", "painel", { titulo: "Why we moved" });
  put("favs/p@x.dev", "f1", { titulo: "Why we moved our stack" });
  env.DB.log.length = 0;
  const r = await cronTraducao(env, { agora: AGORA });
  assert.equal(r.traduzidos, 2);
  assert.ok(ai.chamadas.every((c) => c.modelo === MODELO && c.target_lang === "pt" && c.source_lang === "en"));
  const i1 = get("items", "i1");
  assert.equal(i1.titulo, "Why we moved our stack to Rust", "original intacto");
  assert.equal(i1.titulo_pt, "[pt] Por que nós mudamos nossa pilha para Rust");
  assert.equal(i1.resumo_pt, undefined);
  assert.equal(i1.trad.m, MODELO); assert.equal(i1.trad.ok, true); assert.equal(i1.trad.f.titulo, "pt"); assert.equal(i1.trad.f.resumo, "igual");
  assert.notEqual(i1._atualizado, "2026-11-13T10:00:00.000Z", "atualizado muda: o espelho enxerga");
  assert.equal(get("foruns-tech", "r1").titulo_pt, "[pt] Nós trocamos o old pilha com isto");
  const i2 = get("items", "i2");
  assert.equal(i2.titulo_pt, undefined); assert.equal(i2.trad.igual, true); assert.equal(i2.trad.ok, true);
  assert.equal(get("prefs/p@x.dev", "painel").titulo_pt, undefined, "prefs/ não é tocado");
  assert.equal(get("favs/p@x.dev", "f1").titulo_pt, undefined, "favs/ não é tocado");
  const escritas = env.DB.log.filter((s) => /^\s*(UPDATE|DELETE|INSERT|DROP)/i.test(s));
  assert.ok(escritas.length >= 3);
  for (const s of escritas) {
    assert.ok(!/DROP/i.test(s));
    if (/^\s*UPDATE/i.test(s)) assert.match(s, /WHERE collection = \?3 AND id = \?4$/, "UPDATE só com a chave explícita");
    if (/^\s*INSERT/i.test(s)) assert.match(s, /'_sistema', 'traducao-estado'/);
  }
  // rodada seguinte: nada pendente, não chama o AI de novo e espera 5 min para olhar
  const antes = ai.chamadas.length;
  await cronTraducao(env, { agora: AGORA + MIN });
  assert.equal(ai.chamadas.length, antes);
  const est = await lerEstado(env, AGORA + MIN);
  assert.equal(est.fila, 0); assert.ok(Date.parse(est.vazioAte) > AGORA + MIN);
});

test("cron: no máximo 8 chamadas por minuto e dentro dos subrequests que sobram na invocação", async () => {
  const ai = aiFalso();
  const { env, put } = base({ AI: ai });
  for (let k = 0; k < 20; k++) put("foruns-tech", "r" + k, { titulo: `Why we moved our stack number ${k} to the cloud`, url: "https://reddit.com/" + k }, iso(AGORA - (k + 1) * MIN));
  await cronTraducao(env, { agora: AGORA });
  assert.equal(ai.chamadas.length, POR_MINUTO);
  // invocação que já gastou quase tudo: cabe menos
  const ai2 = aiFalso();
  const r = await cronTraducao({ ...env, AI: ai2 }, { agora: AGORA + MIN, gastos: LIMITE_SUBREQ - RESERVA_SUBREQ - 9 });
  assert.equal(ai2.chamadas.length, 2, "(9 - 5 fixos) / 2 por chamada");
  assert.equal(r.chamadas, 2);
  const ai3 = aiFalso();
  assert.equal((await cronTraducao({ ...env, AI: ai3 }, { agora: AGORA + 2 * MIN, gastos: LIMITE_SUBREQ })).semFolga, true);
  assert.equal(ai3.chamadas.length, 0);
});

test("orçamento: neurons estimados (caracteres/4, entrada e saída), teto de 8.000 no dia, zera na virada UTC; longos só abaixo de 75%", async () => {
  assert.equal(T.neurons("a".repeat(400), "b".repeat(400)), Math.round(200 * 31050 / 1e6 * 1000) / 1000);
  const ai = aiFalso();
  const { env, put, get } = base({ AI: ai });
  put("items", "i1", { titulo: "Why we moved our stack to Rust", resumo: "The company is now worth more than it was a year ago, after the round.", publicado: iso(AGORA - 3600_000) });
  put("_sistema", "traducao-estado", { dia: "2026-11-13", neurons: TETO_DIA * 0.8, traduzidos: 10 });
  await cronTraducao(env, { agora: AGORA });
  const i1 = get("items", "i1");
  assert.ok(i1.titulo_pt && !i1.resumo_pt, "acima de 75% do teto: só o título");
  assert.equal(i1.trad.ok, undefined, "resumo continua na fila");
  env.DB.db.prepare("UPDATE docs SET data = ? WHERE collection = '_sistema' AND id = 'traducao-estado'").run(JSON.stringify({ dia: "2026-11-13", neurons: TETO_DIA }));
  const n = ai.chamadas.length;
  const r = await cronTraducao(env, { agora: AGORA + MIN });
  assert.equal(ai.chamadas.length, n, "no teto não chama");
  assert.equal(r.pausa.tipo, "teto"); assert.equal(r.pausa.ate, "2026-11-14T00:00:00.000Z");
  // virada do dia: zera e volta a traduzir
  const r2 = await cronTraducao(env, { agora: Date.parse("2026-11-14T00:01:00Z") });
  assert.equal(r2.pausa, undefined);
  const est = await lerEstado(env, Date.parse("2026-11-14T00:01:00Z"));
  assert.equal(est.dia, "2026-11-14"); assert.ok(est.neurons < 10); assert.equal(est.ontem.dia, "2026-11-13");
});

test("pausa: 429 e 3040 param 10 min; cota (3036) para até 00:00 UTC; outro erro conta falha e tenta de novo até 3 vezes", async () => {
  assert.equal(classificarErro(new Error("AiError: 3040: Capacity temporarily exceeded, please try again.")), "limite");
  assert.equal(classificarErro({ message: "HTTP 429 Too Many Requests" }), "limite");
  assert.equal(classificarErro(new Error("3036: You have used up your daily free allocation of 10,000 neurons.")), "cota");
  assert.equal(classificarErro(new Error("5006: input error")), "falha");
  const doc = { titulo: "Why we moved our stack to Rust", publicado: iso(AGORA - 3600_000) };
  for (const [erro, ate] of [["3040: Capacity temporarily exceeded", iso(AGORA + 10 * MIN)], ["429 Too Many Requests", iso(AGORA + 10 * MIN)], ["3036: You have used up your daily free allocation", "2026-11-14T00:00:00.000Z"]]) {
    const ai = aiFalso({ falhaCom: erro });
    const { env, put, get } = base({ AI: ai });
    put("items", "i1", doc);
    const r = await cronTraducao(env, { agora: AGORA });
    assert.equal(r.pausa.ate, ate, erro);
    assert.equal(ai.chamadas.length, 1, "parou na primeira");
    assert.equal(get("items", "i1").titulo_pt, undefined);
    const r2 = await cronTraducao(env, { agora: AGORA + 5 * MIN });
    assert.ok(r2.pausa, "ainda em pausa"); assert.equal(ai.chamadas.length, 1);
  }
  const ai = aiFalso({ falhaCom: "5006: erro qualquer" });
  const { env, put, get } = base({ AI: ai });
  put("items", "i1", doc);
  for (let k = 0; k < 5; k++) await cronTraducao(env, { agora: AGORA + k * MIN });
  assert.equal(ai.chamadas.length, 3, "três tentativas e para");
  assert.equal(get("items", "i1").trad.f.titulo, "x3"); assert.equal(get("items", "i1").trad.ok, true);
  assert.equal(get("items", "i1").titulo_pt, undefined, "fica o original");
});

test("marcador que não volta: tradução descartada, original fica", async () => {
  const ai = aiFalso({ comer: true });
  const { env, put, get } = base({ AI: ai });
  put("items", "i1", { titulo: "Why we moved our stack to OpenObserve", publicado: iso(AGORA - 3600_000) });
  const r = await cronTraducao(env, { agora: AGORA });
  assert.equal(r.traduzidos, 0);
  assert.equal(get("items", "i1").titulo_pt, undefined);
  assert.equal(get("items", "i1").trad.f.titulo, "x1");
  assert.equal((await lerEstado(env, AGORA)).descartadas, 1);
  // traduzirTexto direto: o mesmo
  assert.deepEqual(Object.keys(await traduzirTexto({ AI: ai }, "Why we moved to OpenObserve", "en")), ["descartada", "neurons"]);
});

test("destaques: só passam pela checagem; o que vier em inglês entra na fila e grava itens[k].titulo_pt", async () => {
  const ai = aiFalso();
  const { env, put, get } = base({ AI: ai });
  put("destaques", "d2026-11-13", { data: "2026-11-13", itens: [
    { titulo: "Anthropic e Theorem usam o Claude para provar bibliotecas", porque: "Mostra a verificação formal ficando viável.", url: "https://a/1" },
    { titulo: "Why we moved our stack to Rust", porque: "Mostra o custo caindo.", url: "https://a/2" }] }, "");
  put("destaques-politica", "d2026-11-13", { data: "2026-11-13", itens: [{ titulo: "Lula prometeu reformar o Judiciário", porque: "Muda o STF.", url: "https://b/1" }] }, "");
  await cronTraducao(env, { agora: AGORA });
  const d = get("destaques", "d2026-11-13");
  assert.equal(ai.chamadas.length, 1);
  assert.equal(d.itens[0].titulo_pt, undefined);
  assert.equal(d.itens[1].titulo_pt, "[pt] Por que nós mudamos nossa pilha para Rust");
  assert.equal(d.itens[1].titulo, "Why we moved our stack to Rust");
  assert.equal(d.trad.ok, true);
  assert.equal(get("destaques-politica", "d2026-11-13").trad.ok, true, "em português: só a marca");
});

// ---------- Landscape ----------
const docLs = () => ({
  repo: "a/b", nome: "Bê", categoria: "x", subcategoria: "y",
  gh: { descricao: "A fancy self-hosted monitoring tool", estrelas: 10 },
  sobre: "This is a new tool for the team.",
  releases: [{ tag: "v1.0.0", nome: "", notas: "Faster queries for the dashboard and the new alerts" }],
  hn: { historias: [{ id: "1", titulo: "Why we moved our stack to Bê", pontos: 10, comentarios: 2 }],
    comentarios: [{ historia: { id: "1", titulo: "Why we moved our stack to Bê", pontos: 10, comentarios: 2 }, itens: [{ id: "91", autor: "x", trecho: "We replaced the old tool with this.", respostas: 1 }] }] },
  gh_destaques: [{ numero: 7, titulo: "A new release of the tool", url: "https://github.com/a/b/issues/7" }],
});
test("Landscape: traduz os textos do doc da tecnologia e grava cada _pt ao lado do original", async () => {
  const ai = aiFalso();
  const { env, put, get } = base({ AI: ai });
  put("landscape", "a--b", docLs(), "");
  for (let k = 0; k < 3; k++) await cronTraducao(env, { agora: AGORA + k * MIN });
  const d = get("landscape", "a--b");
  assert.equal(d.gh.descricao, "A fancy self-hosted monitoring tool");
  assert.equal(d.gh.descricao_pt, "[pt] Uma caprichada auto-hospedada monitoramento ferramenta");
  assert.equal(d.gh.estrelas, 10, "o resto do gh fica");
  assert.ok(d.sobre_pt && d.releases[0].notas_pt && d.hn.historias[0].titulo_pt && d.hn.comentarios[0].historia.titulo_pt && d.hn.comentarios[0].itens[0].trecho_pt && d.gh_destaques[0].titulo_pt);
  assert.ok(d.hn.historias[0].titulo_pt.includes("Bê"), "nome da tecnologia protegido");
  // a rota do detalhe leva o português; a lista leve leva a descrição em português
  const dep = espelhoFalso();
  const det = await (await rotaLandscape(new Request("https://x/"), env, { email: "a@x", admin: false, secoes: null }, "a--b", dep)).json();
  assert.equal(det.tec.gh.descricao_pt, d.gh.descricao_pt);
  assert.equal((await listaLeve(env, dep))[0].descricao_pt, d.gh.descricao_pt);
});

test("Landscape: o cron de coleta mantém a tradução quando o original não muda e tira quando muda (a fila refaz)", async () => {
  const antigo = docLs();
  antigo.gh.descricao_pt = "Uma ferramenta"; antigo.sobre_pt = "Isto é novo";
  antigo.releases[0].notas_pt = "Consultas mais rápidas";
  antigo.hn.historias[0].titulo_pt = "Por que mudamos";
  antigo.hn.comentarios[0].itens[0].trecho_pt = "Trocamos";
  antigo.gh_destaques[0].titulo_pt = "Uma versão nova";
  // o que a coleta regrava: descrição igual, sobre mudou, releases com uma nova, histórias novas (mesmo id), issues iguais
  const patch = {
    gh: { ...antigo.gh, estrelas: 11 },
    sobre: "This tool changed its README.",
    releases: [{ tag: "v1.1.0", nome: "", notas: "New thing" }, { tag: "v1.0.0", nome: "", notas: "Faster queries for the dashboard and the new alerts" }],
    hn: { historias: [{ id: "1", titulo: "Why we moved our stack to Bê", pontos: 12, comentarios: 3 }, { id: "2", titulo: "Other", pontos: 1 }], comentarios: antigo.hn.comentarios },
    gh_destaques: [{ numero: 7, titulo: "A new release of the tool, renamed", url: "https://github.com/a/b/issues/7" }],
  };
  T.manterLandscape(antigo, patch);
  assert.equal(patch.gh.descricao_pt, "Uma ferramenta", "descrição igual: fica");
  assert.equal(patch.sobre_pt, null, "sobre mudou: null apaga no json_patch");
  assert.equal(patch.releases[1].notas_pt, "Consultas mais rápidas"); assert.equal(patch.releases[0].notas_pt, undefined);
  assert.equal(patch.hn.historias[0].titulo_pt, "Por que mudamos"); assert.equal(patch.hn.historias[1].titulo_pt, undefined);
  assert.equal(patch.hn.comentarios[0].itens[0].trecho_pt, "Trocamos");
  assert.equal(patch.gh_destaques[0].titulo_pt, undefined, "título da issue mudou: sai");
  const p2 = { gh: { ...antigo.gh, descricao: "Outra descrição em inglês do projeto" } };
  T.manterLandscape(antigo, p2);
  assert.equal(p2.gh.descricao_pt, null, "descrição mudou: o descricao_pt herdado do ...ant sai");

  // ponta a ponta: rodada do Landscape com a mesma resposta do GitHub não apaga a tradução; com descrição nova, apaga
  const { env, put, get } = base();
  const doc = docLs(); doc.gh.descricao_pt = "Uma ferramenta caprichada"; doc.releases[0].notas_pt = "Consultas mais rápidas";
  put("landscape", "a--b", doc, "");
  const est = { porId: { "a--b": { marcas: { repo: iso(AGORA - 7 * 3600_000), commit: iso(AGORA), releases: iso(AGORA - 4 * 3600_000), readme: iso(AGORA), linguagens: iso(AGORA), contrib: iso(AGORA), prs: iso(AGORA), issues: iso(AGORA), hn: iso(AGORA), comentarios: iso(AGORA) }, tent: {}, feed: false } }, pausa: {} };
  put("_sistema", "landscape-estado", est, "");
  const resp = (desc) => (url) => {
    const u = String(url);
    const h = { "content-type": "application/json", "x-ratelimit-remaining": "4000", "x-ratelimit-limit": "5000", "x-ratelimit-reset": String(Math.floor(AGORA / 1000) + 3000) };
    if (/\/releases/.test(u)) return new Response(JSON.stringify([{ tag_name: "v1.0.0", name: "", body: "Faster queries for the dashboard and the new alerts", published_at: iso(AGORA - DIA), html_url: "https://github.com/a/b/releases/tag/v1.0.0" }]), { headers: h });
    return new Response(JSON.stringify({ full_name: "a/b", description: desc, stargazers_count: 12, owner: { login: "a", id: 1, type: "User" }, html_url: "https://github.com/a/b" }), { headers: h });
  };
  const f0 = globalThis.fetch;
  try {
    globalThis.fetch = resp("A fancy self-hosted monitoring tool");
    await rodadaLandscape({ ...env, GITHUB_TOKEN: "t" }, { agora: AGORA });
    let d = get("landscape", "a--b");
    assert.equal(d.gh.estrelas, 12, "a rodada gravou");
    assert.equal(d.gh.descricao_pt, "Uma ferramenta caprichada", "mesma descrição: tradução fica");
    assert.equal(d.releases[0].notas_pt, "Consultas mais rápidas", "mesmas notas: fica");
    globalThis.fetch = resp("A totally different description for the tool");
    const e2 = JSON.parse(env.DB.db.prepare("SELECT data FROM docs WHERE collection = '_sistema' AND id = 'landscape-estado'").get().data);
    e2.porId["a--b"].marcas.repo = iso(AGORA - 7 * 3600_000);
    env.DB.db.prepare("UPDATE docs SET data = ? WHERE collection = '_sistema' AND id = 'landscape-estado'").run(JSON.stringify(e2));
    await rodadaLandscape({ ...env, GITHUB_TOKEN: "t" }, { agora: AGORA + MIN });
    d = get("landscape", "a--b");
    assert.equal(d.gh.descricao, "A totally different description for the tool");
    assert.equal(d.gh.descricao_pt, undefined, "descrição nova: tradução sai e volta para a fila");
  } finally { globalThis.fetch = f0; }
  const fila = montarFila({ linhas: [], landscape: [{ id: "a--b", data: JSON.stringify(get("landscape", "a--b")) }], agora: AGORA });
  assert.ok(fila.tarefas.some((t) => t.chave === "gh.descricao"), "descrição nova entra na fila");
  assert.ok(!fila.tarefas.some((t) => t.chave === "rel:v1.0.0:notas"), "notas já traduzidas não");
});

test("aplicarLandscape: só grava onde o original ainda é o que foi traduzido", () => {
  const doc = docLs();
  const { patch, n } = T.aplicarLandscape(doc, [{ chave: "gh.descricao", origem: "A fancy self-hosted monitoring tool", pt: "Uma ferramenta" }, { chave: "sobre", origem: "texto antigo", pt: "x" }]);
  assert.equal(n, 1);
  assert.deepEqual(Object.keys(patch), ["gh"]);
  assert.deepEqual(patch.gh, { descricao_pt: "Uma ferramenta" });
  assert.equal(doc.gh.descricao_pt, undefined, "não mexe no doc de entrada");
});

// ---------- admin e cron ----------
test("Admin: resumo do estado com traduzidos, fila, neurons, pausa e motivo", () => {
  const r = resumoAdmin({ dia: "2026-11-13", neurons: 123.4, traduzidos: 40, fila: 12, pausa: { ate: iso(AGORA + MIN), motivo: "Workers AI pediu para esperar (429 ou 3040)" } }, { agora: AGORA });
  assert.equal(r.traduzidos, 40); assert.equal(r.fila, 12); assert.equal(r.neurons, 123); assert.equal(r.teto, TETO_DIA); assert.ok(r.pausa.motivo);
  const ontem = resumoAdmin({ dia: "2026-11-12", neurons: 5000, traduzidos: 9 }, { agora: AGORA });
  assert.equal(ontem.traduzidos, 0, "outro dia: zera");
});

test("contagem de subrequests do cron: cada first/all/run/batch do D1 conta uma vez, e o batch aceita os comandos embrulhados", async () => {
  const db = d1Falso();
  const conta = { d1: 0, fetch: 0 };
  const env = envContado({ DB: db, X: 1 }, conta);
  assert.equal(env.X, 1);
  const st = env.DB.prepare("INSERT INTO docs (collection, id, data) VALUES (?, ?, ?)");
  await env.DB.batch([st.bind("c", "1", "{}"), st.bind("c", "2", "{}")]);
  await env.DB.prepare("SELECT count(*) AS n FROM docs WHERE collection = ?").bind("c").first();
  await env.DB.prepare("SELECT id FROM docs").all();
  await env.DB.prepare("UPDATE docs SET data = '{}' WHERE collection = 'c' AND id = '1'").run();
  assert.equal(conta.d1, 4);
  assert.equal(db.db.prepare("SELECT count(*) AS n FROM docs WHERE collection = 'c'").get().n, 2);
});
