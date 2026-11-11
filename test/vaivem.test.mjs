// Escudos e Vai e vem (pedido de 11/11): escudoDe com o catálogo, apelidos e homônimos (public/esportes.js),
// agrupamento das negociações, etapas, filtros, "Mostrar escudos" em Meus esportes, o widget do Início e o CSP
// das páginas (src/seguranca.js). Sem rede: o catálogo sai de montarCatalogo com o endpoint de times de exemplo.
import test from "node:test";
import assert from "node:assert/strict";
import { montarCatalogo, lerTimesEspn, timesDoDoc } from "../src/esportes.js";
import { catalogoDe, formatosDe, validarPainel } from "../src/painel.js";
import { CSP, comSeguranca } from "../src/seguranca.js";
import "../public/esportes.js";
import "../public/inicio-grade.js";
import { timesEspn, ESCUDO } from "./fixtures-esportes.mjs";

const E = globalThis.Esportes;
const DIA = 86_400_000;
const AGORA = Date.parse("2026-11-11T15:00:00Z");
const iso = (dias) => new Date(AGORA - dias * DIA).toISOString();

// catálogo de exemplo: as ligas nacionais pelo endpoint de times e a Libertadores com um "Barcelona" do Equador
const fontes = ["bra.1", "bra.2", "ita.1", "mex.1", "esp.1", "usa.1"].map((liga) => ({ liga, times: lerTimesEspn(timesEspn(liga)) }));
fontes.unshift({ liga: "conmebol.libertadores", times: [{ id: "4815", nome: "Barcelona SC", sigla: "BSC", escudo: ESCUDO(4815) }, { id: "1936", nome: "Internacional", sigla: "INT", escudo: ESCUDO(1936) }] });
const CAT = montarCatalogo(fontes);

test("catálogo: um time por id da ESPN, país pela liga nacional, sem escudo ou com escudo de fora não entra", () => {
  assert.equal(CAT.times["1936"].liga, "bra.1", "a liga nacional vale mais que a copa");
  assert.equal(CAT.times["1936"].pais, "BR");
  assert.equal(CAT.times["4815"].pais, "", "time só da Libertadores: sem país");
  assert.ok(!CAT.times["9999"] && !CAT.times["9998"]);
  assert.deepEqual(CAT.mapa["inter"], ["110"], "o shortDisplayName também entra no mapa");
  assert.deepEqual(CAT.mapa["barcelona"].sort(), ["4815", "83"], "Barcelona SC vira barcelona (sc sai): homônimo");
  // docs das ligas também alimentam: tabela e jogos, com o escudo do mapa do doc
  const ts = timesDoDoc({ escudos: { "1": ESCUDO(1) }, tabela: [{ id: "1", time: "Time Um", sigla: "UM" }], rodada: { jogos: [{ ids: ["1", "2"], mandante: "Time Um", visitante: "Time Dois", siglas: ["UM", "DOI"] }] } });
  assert.deepEqual(ts, [{ id: "1", nome: "Time Um", sigla: "UM", curto: "", escudo: ESCUDO(1) }, { id: "2", nome: "Time Dois", sigla: "DOI", curto: "", escudo: "" }]);
});

test("escudoDe: nome exato, apelido, homônimo desempatado pelo país, sem certeza = null", () => {
  // exato (sem acento, sem caixa, sem fc/sc/clube)
  assert.equal(E.escudoDe("Grêmio", CAT), ESCUDO(6273));
  assert.equal(E.escudoDe("GREMIO FC", CAT, "BR"), ESCUDO(6273));
  assert.equal(E.escudoDe("Palmeiras", CAT, "BR"), ESCUDO(2029));
  // apelidos
  assert.equal(E.escudoDe("Atlético Mineiro", CAT), ESCUDO(7632));
  assert.equal(E.escudoDe("Galo", CAT), ESCUDO(7632));
  assert.equal(E.escudoDe("Inter de Milão", CAT), ESCUDO(110));
  assert.equal(E.escudoDe("Internazionale", CAT, "IT"), ESCUDO(110));
  assert.equal(E.escudoDe("Milan", CAT), ESCUDO(103));
  // Inter e Internacional: Porto Alegre quando o país é BR, nunca a Inter de Milão
  assert.equal(E.escudoDe("Inter", CAT, "BR"), ESCUDO(1936));
  assert.equal(E.escudoDe("Internacional", CAT, "BR"), ESCUDO(1936));
  assert.equal(E.escudoDe("Sport Club Internacional", CAT), ESCUDO(1936));
  assert.equal(E.escudoDe("Inter", CAT, "IT"), ESCUDO(110));
  assert.equal(E.escudoDe("Inter", CAT, "US"), ESCUDO(20232));
  assert.equal(E.escudoDe("Inter", CAT), null, "Inter sem país: não chuta");
  assert.equal(E.escudoDe("Internacional", CAT, "IT"), null, "país que não bate");
  // América depende do país
  assert.equal(E.escudoDe("América", CAT, "MX"), ESCUDO(227));
  assert.equal(E.escudoDe("América", CAT, "BR"), ESCUDO(6154));
  assert.equal(E.escudoDe("América", CAT), null);
  assert.equal(E.escudoDe("América-MG", CAT), ESCUDO(6154));
  // homônimo: Barcelona da Espanha e do Equador
  assert.equal(E.escudoDe("Barcelona", CAT, "ES"), ESCUDO(83));
  assert.equal(E.escudoDe("Barcelona", CAT, "EC"), null, "o do Equador só está na Libertadores, sem país: não chuta");
  assert.equal(E.escudoDe("Barcelona", CAT), null);
  assert.equal(E.escudoDe("Barça", CAT), ESCUDO(83));
  // sem certeza ou sem catálogo
  assert.equal(E.escudoDe("Time Que Não Existe", CAT, "BR"), null);
  assert.equal(E.escudoDe("", CAT), null);
  assert.equal(E.escudoDe("Grêmio", null), null);
  assert.equal(E.escudoDe("Grêmio", { mapa: "x" }), null);
  // Inglaterra chega de vários jeitos
  assert.equal(E.paisNorm("EN"), "GB");
  assert.equal(E.paisNorm("uk"), "GB");
  // catálogo com URL estragada: escudoDe confere de novo
  assert.equal(E.escudoDe("X", { times: { "1": { escudo: "https://exemplo.dev/x.png", pais: "" } }, mapa: { x: ["1"] } }), null);
});

// itens como a curadoria grava (medido em produção de 04 a 11/11)
const tr = (jogador, origem, destino, status, extra = {}) => ({ jogador, posicao: "Atacante", idade: 24, nacionalidade: "BR", origem, destino, status, valor: "não divulgado", fontes: 1, ...extra });
const INTER = { clube: "Internacional", pais: "BR", sigla: "INT", cor: "#e30613" }, GREMIO = { clube: "Grêmio", pais: "BR", sigla: "GRE", cor: "#0d80bf" };
const BENFICA = { clube: "Benfica", pais: "PT", sigla: "BEN", cor: "#e2001a" }, PSG = { clube: "PSG", pais: "FR", sigla: "PSG", cor: "#004170" };
const itens = [
  { url: "https://exemplo.dev/1", titulo: "Inter sonda atacante do Benfica", fonte: "ge", tema: "mercado", subtema: "brasil", publicado: iso(6), transferencia: tr("Fulano da Silva", BENFICA, INTER, "interesse") },
  { url: "https://exemplo.dev/2", titulo: "Inter faz proposta por Fulano", fonte: "GZH", tema: "inter", subtema: "elenco", clube: "Internacional", publicado: iso(2), transferencia: tr("Fulano da Silva", BENFICA, { clube: "Inter", pais: "BR", sigla: "INT", cor: "#e30613" }, "Proposta", { valor: "€ 8 milhões" }) },
  { url: "https://exemplo.dev/3", titulo: "Benfica recusa a primeira oferta", fonte: "ge", tema: "mercado", publicado: iso(1), transferencia: { ...tr("Fulano da Silva", BENFICA, INTER, "recusada"), valor: "", foto: "https://exemplo.dev/rosto.jpg", imagem: "x" } },
  // mesma URL repetida: conta uma vez
  { url: "https://exemplo.dev/3", titulo: "Benfica recusa a primeira oferta", fonte: "ge", tema: "mercado", publicado: iso(1), transferencia: tr("Fulano da Silva", BENFICA, INTER, "recusada") },
  { url: "https://exemplo.dev/4", titulo: "Grêmio acerta com zagueiro", fonte: "Correio do Povo", tema: "brasileirao", subtema: "clubes", publicado: iso(0.5), transferencia: tr("Beltrano Souza", { clube: "Juventude", pais: "BR" }, GREMIO, "acordo", { posicao: "Zagueiro" }) },
  { url: "https://exemplo.dev/5", titulo: "PSG anuncia meia", fonte: "L'Équipe", tema: "internacional", subtema: "europa", publicado: iso(3), transferencia: tr("Ciclano Pereira", { clube: "Lyon", pais: "FR" }, PSG, "fechado", { nacionalidade: "FR", valor: "€ 40 milhões" }) },
  // sem destino: agrupa pelo jogador + origem
  { url: "https://exemplo.dev/6", titulo: "Atacante pode deixar o Grêmio", fonte: "ge", tema: "mercado", publicado: iso(10), transferencia: tr("Jogador Antigo", GREMIO, null, "rumor") },
  { url: "https://exemplo.dev/7", titulo: "Atacante do Grêmio na mira de árabes", fonte: "ge", tema: "mercado", publicado: iso(9), transferencia: tr("Jogador Antigo", GREMIO, undefined, "rumor") },
  // status que ninguém conhece
  { url: "https://exemplo.dev/8", titulo: "Lateral em pauta", fonte: "UOL", tema: "mercado", publicado: iso(0.2), transferencia: tr("Lateral Novo", INTER, { clube: "Flamengo", pais: "BR" }, "conversas avançadas") },
  // sem transferência: notícia comum
  { url: "https://exemplo.dev/9", titulo: "Mercado da bola esquenta", fonte: "ge", tema: "mercado", publicado: iso(1) },
];

test("agrupamento: jogador + destino, de qualquer tema; estado mais recente, linha do tempo e veículos distintos", () => {
  const ns = E.agruparNegociacoes(itens, AGORA);
  assert.equal(ns.length, 5, "Fulano (3 notícias), Beltrano, Ciclano, Jogador Antigo (2) e Lateral");
  const f = ns.find((n) => n.t.jogador === "Fulano da Silva");
  assert.deepEqual(f.itens.map((i) => i.url), ["https://exemplo.dev/3", "https://exemplo.dev/2", "https://exemplo.dev/1"], "da mais nova para a mais velha, sem repetir URL");
  assert.equal(f.etapa, "recusada", "o estado mais recente");
  assert.equal(f.fontes, 2, "ge e GZH");
  assert.equal(f.t.valor, "€ 8 milhões", "o valor que a mais nova não trouxe vem da anterior");
  assert.equal(f.brasil, true);
  assert.ok(!/foto|imagem|rosto/.test(JSON.stringify(ns.map((n) => n.t))), "nenhum gancho de foto passa para o card");
  assert.ok(!("foto" in E.transferenciaLimpa(itens[2].transferencia)));
  const antigo = ns.find((n) => n.t.jogador === "Jogador Antigo");
  assert.equal(antigo.itens.length, 2, "sem destino: jogador + origem");
  assert.equal(antigo.fontes, 1);
  assert.equal(antigo.antigo, true, "rumor de 1 fonte há mais de 7 dias");
  assert.equal(ns.find((n) => n.t.jogador === "Lateral Novo").etapa, "aberto", "status desconhecido vira em aberto");
  assert.equal(E.chaveNegociacao({ jogador: "Fulano da Silva", destino: { clube: "Inter", pais: "BR" } }), E.chaveNegociacao({ jogador: "FULANO DA SILVA", destino: { clube: "Sport Club Internacional", pais: "BR" } }));
  assert.notEqual(E.chaveClube("Inter", "BR"), E.chaveClube("Inter", "IT"));
  assert.deepEqual(E.agruparNegociacoes(null), []);
  assert.deepEqual(E.agruparNegociacoes([{ titulo: "sem transferência" }, { transferencia: { posicao: "Goleiro" } }, null]), []);
});

test("etapas: ordem estável, sinônimos, mais avançada primeiro e depois a mais recente", () => {
  assert.deepEqual(E.ETAPAS.map((e) => e.id), ["rumor", "interesse", "proposta", "acerto", "oficial"]);
  assert.deepEqual(E.DESFECHOS.map((e) => e.id), ["recusada", "renovou", "fica", "melou"]);
  assert.equal(E.ETAPA.acerto.nome, "Acordo encaminhado");
  assert.equal(E.ETAPA.aberto.nome, "Em aberto");
  for (const [de, para] of [["Rumor", "rumor"], ["negociacao", "proposta"], ["fechado", "oficial"], ["acordo", "acerto"], ["não rolou", "melou"], ["ficou", "fica"], ["renovado", "renovou"], ["", "aberto"], [null, "aberto"], ["qualquer coisa", "aberto"]])
    assert.equal(E.etapaDe(de), para, String(de));
  const ns = E.agruparNegociacoes(itens, AGORA);
  assert.deepEqual(ns.map((n) => n.etapa), ["oficial", "acerto", "recusada", "rumor", "aberto"]);
  // mesma etapa: a mais recente antes
  const dois = E.ordenarNegociacoes([{ peso: 4, atualizado: iso(3) }, { peso: 4, atualizado: iso(1) }, { peso: 6, atualizado: iso(9) }]);
  assert.deepEqual(dois.map((n) => n.atualizado), [iso(9), iso(1), iso(3)]);
});

test("filtros: Meu time (Inter por padrão, pelo id da ESPN ou pelo nome), Brasil, Fora e etapa", () => {
  const ns = E.agruparNegociacoes(itens, AGORA);
  const nomes = (l) => l.map((n) => n.t.jogador).sort();
  const inter = [{ liga: "bra.1", id: "", nome: "Internacional" }];
  assert.deepEqual(nomes(E.filtrarNegociacoes(ns, { quem: "meu", times: inter })), ["Fulano da Silva", "Lateral Novo"]);
  // pelo id da ESPN, com o catálogo: o time salvo como "Inter" acha o "Internacional" do item
  assert.deepEqual(nomes(E.filtrarNegociacoes(ns, { quem: "meu", times: [{ liga: "bra.1", id: "1936", nome: "Inter" }], catalogo: CAT })), ["Fulano da Silva", "Lateral Novo"]);
  assert.deepEqual(nomes(E.filtrarNegociacoes(ns, { quem: "meu", times: [{ liga: "bra.1", id: "6273", nome: "Grêmio" }] })), ["Beltrano Souza", "Jogador Antigo"]);
  // a Inter de Milão não é o Inter
  assert.deepEqual(nomes(E.filtrarNegociacoes(ns, { quem: "meu", times: [{ liga: "ita.1", id: "110", nome: "Internazionale" }] })), []);
  assert.deepEqual(nomes(E.filtrarNegociacoes(ns, { quem: "brasil" })), ["Beltrano Souza", "Fulano da Silva", "Jogador Antigo", "Lateral Novo"]);
  assert.deepEqual(nomes(E.filtrarNegociacoes(ns, { quem: "fora" })), ["Ciclano Pereira"]);
  assert.deepEqual(nomes(E.filtrarNegociacoes(ns, { etapa: "proposta" })), ["Beltrano Souza", "Ciclano Pereira"], "proposta, acerto ou oficial");
  assert.deepEqual(nomes(E.filtrarNegociacoes(ns, { etapa: "oficial" })), ["Ciclano Pereira"]);
  assert.deepEqual(nomes(E.filtrarNegociacoes(ns, { quem: "brasil", etapa: "proposta" })), ["Beltrano Souza"]);
  assert.equal(E.filtrarNegociacoes(ns).length, ns.length, "Tudo e Tudo");
  assert.deepEqual(E.QUEM_VV, ["tudo", "meu", "brasil", "fora"]);
  assert.deepEqual(E.ETAPA_VV, ["tudo", "proposta", "oficial"]);
});

test("Meus esportes: Mostrar escudos ligado por padrão, salvo com o resto", () => {
  assert.equal(E.padraoPrefs().escudos, true);
  assert.equal(E.validarPrefs({ competicoes: ["bra.1"] }).prefs.escudos, true);
  assert.equal(E.validarPrefs({ competicoes: ["bra.1"], escudos: false }).prefs.escudos, false);
  assert.equal(E.validarPrefs({ competicoes: ["bra.1"], escudos: "não" }).erro, "escudos");
  assert.equal(E.respostaPrefs({ competicoes: ["bra.1"], times: [], ordem: [], escudos: false }).escudos, false);
  assert.equal(E.respostaPrefs({ competicoes: ["bra.1"], times: [], ordem: [] }).escudos, true, "salvo antes de 11/11: ligado");
  assert.equal(E.respostaPrefs(null).escudos, true);
});

test("Início: widget Vai e vem (1x1 e 2x1), só para quem tem Esportes", () => {
  assert.ok(catalogoDe(null).some((w) => w.id === "esportes-vaivem" && w.titulo === "Vai e vem" && w.secao === "esportes"));
  assert.equal(globalThis.InicioGrade.grupoDe("esportes-vaivem"), "esportes");
  assert.deepEqual(formatosDe("esportes-vaivem"), ["1x1", "2x1"]);
  assert.ok(!catalogoDe(["tech"]).some((w) => w.id === "esportes-vaivem"));
  assert.equal(validarPainel({ widgets: [{ id: "esportes-vaivem", formato: "2x1" }] }, null).widgets.length, 1);
  assert.match(validarPainel({ widgets: [{ id: "esportes-vaivem", formato: "1x2" }] }, null).erro, /Formato/);
});

test("CSP: img-src só daqui, de data:, da pasta de escudos da ESPN e da foto da conta; nada de *", async () => {
  assert.equal(CSP, "img-src 'self' data: https://a.espncdn.com/i/teamlogos/ https://lh3.googleusercontent.com");
  assert.ok(!CSP.includes("*"));
  assert.ok(!/headshots/.test(CSP));
  const html = comSeguranca(new Response("<!doctype html><p>oi</p>", { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }));
  assert.equal(html.headers.get("content-security-policy"), CSP);
  assert.equal(html.headers.get("cache-control"), "no-store", "os outros cabeçalhos ficam");
  assert.equal(html.status, 200);
  assert.equal(await html.text(), "<!doctype html><p>oi</p>");
  const js = comSeguranca(new Response("{}", { headers: { "content-type": "application/json" } }));
  assert.equal(js.headers.get("content-security-policy"), null, "JSON da API não precisa");
  assert.equal(comSeguranca(null), null);
});
