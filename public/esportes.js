/* Esportes: competições que o Lookout conhece, zonas da tabela, validação de "Meus esportes" e a hora no fuso de quem vê.
 *
 * Script clássico (<script src="/esportes.js">), como o tabela.js e o radar-filtro.js: a página usa window.Esportes, e o
 * Worker (src/esportes.js, src/painel.js) e os testes em Node importam pelo efeito e leem globalThis.Esportes.
 * Sem import nem export, nem nada do navegador ou do Worker.
 *
 * Competição (LIGAS): { id, nome, curto, esporte, caminho, pais, fonte, reserva?, zonas: [{ de, ate, id }], colunas,
 *   rodada?, porSeed?, raioRodada?, diasExtras?, semTabela?, tenis? }
 *   id é o slug da ESPN (bra.1, conmebol.libertadores, nba, atp, wta); caminho é o "<esporte>/<liga>" da URL dela.
 *   colunas: as da tabela além de Pos e Time, na ordem (futebol: J, Pts, SG, V, E, D, GP, GC; NBA: V, D, %, GB).
 *   rodada: como a tela chama o conjunto de jogos atual ("rodada" no futebol, "jogos" na NBA e no tênis).
 *   porSeed: a posição e a zona saem do playoffSeed da standings (NBA), não do rank.
 *   tenis: partidas de jogador contra jogador, por torneio, sem tabela (ATP e WTA); o cron lê o formato de tênis da ESPN.
 *   raioRodada: dias em volta do jogo de referência que contam como a mesma rodada quando não há número (padrão 2).
 *   diasExtras: quantos dias do calendário além de hoje o cron busca (padrão 5).
 *   fonte "espn"; reserva "ge" quando a página do Globo Esporte entra se a ESPN não tiver a competição.
 *   zonas: faixas de posição da tabela. Mexer aqui muda a cor das linhas e a legenda, sem tocar no resto.
 *   Faixas de 2026; quando o regulamento mudar, é só trocar os números.
 * "Meus esportes" (prefs/<email>, id "esportes"): { competicoes: [ids ligados], times: [{ liga, id, nome }],
 *   jogadores: [{ liga, nome }], ordem: [ids], escudos: true | false }
 *   escudos: o interruptor "Mostrar escudos" (11/11); desligado, a página mostra o chip de sigla no lugar do escudo.
 * Escudos e Vai e vem (11/11): escudoOk (só https://a.espncdn.com/), escudoDe e timeDoCatalogo (o catálogo
 *   meta/esportes-escudos, apelidos e o país do item para desempatar homônimos), etapas das negociações e o agrupamento
 *   de itens com `transferencia` (agruparNegociacoes), filtros da aba (filtrarNegociacoes). Foto de pessoa: nenhuma.
 *   ordem guarda a posição de todas, ligadas ou não, para a competição voltar ao mesmo lugar quando for religada.
 *   jogadores: os de tênis que a pessoa acompanha, pelo nome digitado (a página procura o nome nas partidas da liga).
 */
(function (raiz) {
  "use strict";

  const Z = (de, ate, id) => ({ de, ate, id });
  const ZONAS_NOME = {
    libertadores: "Libertadores", "pre-libertadores": "Pré-Libertadores", "sul-americana": "Sul-Americana", rebaixamento: "Rebaixamento",
    champions: "Champions League", europa: "Liga Europa", conference: "Conference League", "playoff-rebaixamento": "Playoff de rebaixamento",
    oitavas: "Oitavas", playoff: "Playoff", classifica: "Classifica", "quartas": "Quartas de final",
    playoffs: "Playoffs", "play-in": "Play-in",
  };
  /* cor de cada zona: um token do design system (a página mistura com o fundo do card) */
  const ZONAS_COR = {
    libertadores: "var(--ok)", "pre-libertadores": "var(--info)", "sul-americana": "var(--brand-end)", rebaixamento: "var(--err)",
    champions: "var(--ok)", europa: "var(--brand-end)", conference: "var(--info)", "playoff-rebaixamento": "var(--warn)",
    oitavas: "var(--ok)", playoff: "var(--info)", classifica: "var(--ok)", quartas: "var(--ok)",
    playoffs: "var(--ok)", "play-in": "var(--info)",
  };
  /* Colunas da tabela além de Pos e Time. Os ids são os campos da linha em meta/esportes-<liga>. */
  const COLS_FUTEBOL = ["j", "pts", "sg", "v", "e", "d", "gp", "gc"];

  const tenis = (id, nome, curto) => ({ id, nome, curto, esporte: "tenis", caminho: "tennis/" + id, pais: "", fonte: "espn", zonas: [], colunas: [], rodada: "jogos", semTabela: true, tenis: true });
  const futebol = (id, nome, curto, pais, zonas, extra) => ({ id, nome, curto, esporte: "futebol", caminho: "soccer/" + id, pais, fonte: "espn", zonas, colunas: COLS_FUTEBOL, rodada: "rodada", ...(extra || {}) });
  const LISTA = [
    futebol("bra.1", "Brasileirão Série A", "Brasileirão", "BR", [Z(1, 6, "libertadores"), Z(7, 8, "pre-libertadores"), Z(9, 14, "sul-americana"), Z(17, 20, "rebaixamento")]),
    futebol("conmebol.libertadores", "Copa Libertadores", "Libertadores", "", [Z(1, 2, "classifica"), Z(3, 3, "sul-americana")], { grupos: true }),
    futebol("bra.copa_do_brasil", "Copa do Brasil", "Copa do Brasil", "BR", [], { semTabela: true }),
    futebol("bra.camp.gaucho", "Campeonato Gaúcho", "Gauchão", "BR", [Z(1, 8, "quartas"), Z(11, 12, "rebaixamento")]),
    futebol("conmebol.sudamericana", "Copa Sul-Americana", "Sul-Americana", "", [Z(1, 1, "oitavas"), Z(2, 2, "playoff")], { grupos: true }),
    futebol("eng.1", "Premier League", "Premier League", "GB", [Z(1, 4, "champions"), Z(5, 5, "europa"), Z(18, 20, "rebaixamento")]),
    futebol("uefa.champions", "Champions League", "Champions", "", [Z(1, 8, "oitavas"), Z(9, 24, "playoff")]),
    futebol("esp.1", "La Liga", "La Liga", "ES", [Z(1, 4, "champions"), Z(5, 5, "europa"), Z(18, 20, "rebaixamento")]),
    futebol("ita.1", "Serie A italiana", "Serie A", "IT", [Z(1, 4, "champions"), Z(5, 5, "europa"), Z(18, 20, "rebaixamento")]),
    futebol("ger.1", "Bundesliga", "Bundesliga", "DE", [Z(1, 4, "champions"), Z(5, 5, "europa"), Z(16, 16, "playoff-rebaixamento"), Z(17, 18, "rebaixamento")]),
    futebol("fra.1", "Ligue 1", "Ligue 1", "FR", [Z(1, 3, "champions"), Z(4, 4, "europa"), Z(16, 16, "playoff-rebaixamento"), Z(17, 18, "rebaixamento")]),
    /* NBA: tabela por conferência (Leste e Oeste, cada uma um grupo), posição pelo playoffSeed; sem empate nem gols.
       Joga quase todo dia: a "rodada" é a noite de jogos (12 h em volta do jogo de referência), ontem e amanhã no cron. */
    { id: "nba", nome: "NBA", curto: "NBA", esporte: "basquete", caminho: "basketball/nba", pais: "US", fonte: "espn",
      zonas: [Z(1, 6, "playoffs"), Z(7, 10, "play-in")], colunas: ["v", "d", "pct", "gb"], rodada: "jogos", grupos: true, porSeed: true, raioRodada: 0.5, diasExtras: 2 },
    /* Tênis: ATP e WTA pela ESPN, sem tabela. Cada evento do scoreboard é um torneio, com as chaves (groupings) e as
       partidas dentro; só as de simples entram. Abas Jogos, Próximos e Torneios. */
    tenis("atp", "ATP", "ATP"),
    tenis("wta", "WTA", "WTA"),
  ];
  const LIGAS = Object.fromEntries(LISTA.map((l) => [l.id, l]));
  const ORDEM_LIGAS = LISTA.map((l) => l.id);
  /* Grupos da tela "Meus esportes": futebol, basquete (NBA), tênis e padel. Padel ainda sem fonte pública de resultados:
     o grupo aparece só com a nota. NFL saiu em 05/11/2026 e F1 ficou de fora, por decisão do dono. */
  const porEsporte = (e) => ORDEM_LIGAS.filter((id) => LIGAS[id].esporte === e);
  const ESPORTES = [
    { id: "futebol", nome: "Futebol", ligas: porEsporte("futebol") },
    { id: "basquete", nome: "Basquete", ligas: porEsporte("basquete") },
    { id: "tenis", nome: "Tênis", ligas: porEsporte("tenis") },
    { id: "padel", nome: "Padel", ligas: [], nota: "Resultados de padel ainda sem fonte pública; por enquanto só notícias." },
  ];
  /* Competições que já existiram e saíram: tiradas em silêncio do que estava salvo, para a pessoa não perder o resto */
  const RETIRADAS = new Set(["nfl"]);
  /* Sempre coletadas, mesmo que ninguém tenha ligado */
  const SEMPRE = ["bra.1", "conmebol.libertadores"];
  const PADRAO = ["bra.1", "conmebol.libertadores", "bra.copa_do_brasil"];
  const MAX_TIMES = 10, MAX_JOGADORES = 10, NOME_MAX = 40;
  const ID_TIME_OK = /^[A-Za-z0-9-]{1,40}$/;

  const slugLiga = (id) => String(id || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  function zonaDe(liga, pos) {
    const l = LIGAS[liga];
    const p = Number(pos);
    if (!l || !Number.isInteger(p)) return "";
    const z = l.zonas.find((x) => p >= x.de && p <= x.ate);
    return z ? z.id : "";
  }
  /* Colunas da tabela (além de Pos e Time) e o nome do conjunto de jogos atual */
  const colunasDe = (liga) => (LIGAS[liga] && LIGAS[liga].colunas) || COLS_FUTEBOL;
  const rodadaDe = (liga) => (LIGAS[liga] && LIGAS[liga].rodada) || "rodada";
  /* Abas do cartão: no futebol e na NBA, a rodada (ou "Jogos"), Próximos e Tabela; no tênis, Jogos, Próximos e Torneios */
  const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const abasDe = (liga) => (LIGAS[liga] && LIGAS[liga].tenis
    ? [["rodada", "Jogos"], ["proximos", "Próximos"], ["torneios", "Torneios"]]
    : [["rodada", maiuscula(rodadaDe(liga))], ["proximos", "Próximos"], ["tabela", "Tabela"]]);
  /* Período de um jogo de basquete em andamento: "4º quarto · 5:32", "intervalo", "prorrogação · 2:10",
     "fim do 1º quarto". `nome` é o status.type.name da ESPN; period e displayClock vêm do status. */
  function periodo(period, relogio, nome) {
    const n = String(nome || "");
    if (/HALFTIME/i.test(n)) return "intervalo";
    const p = Number(period);
    if (!Number.isInteger(p) || p < 1) return "";
    const qual = p <= 4 ? p + "º quarto" : p === 5 ? "prorrogação" : (p - 4) + "ª prorrogação";
    if (/END_PERIOD/i.test(n)) return (p <= 4 ? "fim do " : "fim da ") + qual;
    const r = String(relogio == null ? "" : relogio).trim();
    return r && !/^0+([:.]0+)*$/.test(r) ? qual + " · " + r : qual;
  }
  /* Nome de grupo da standings em português, curto para caber no celular: as conferências da NBA ("Eastern Conference"
     vira "Leste"). O resto fica como veio. */
  function nomeGrupo(nome, sigla) {
    const n = String(nome || "").trim(), s = String(sigla || "").trim();
    const m = /^(Eastern|Western) Conference$/i.exec(n);
    if (m) return /^e/i.test(m[1]) ? "Leste" : "Oeste";
    return n || s;
  }

  /* ---- Tênis ---- */
  /* Rodada de um torneio em português: "Round 2" vira "2ª rodada", "Quarterfinal" vira "quartas de final".
     O que não reconhece fica como veio. */
  function rodadaTenis(t) {
    const s = String(t == null ? "" : t).replace(/\s+/g, " ").trim();
    if (!s) return "";
    let m;
    if (/^(the )?finals?$/i.test(s)) return "final";
    if (/^semi-?finals?$/i.test(s)) return "semifinal";
    if (/^quarter-?finals?$/i.test(s)) return "quartas de final";
    if (/^round of 16$/i.test(s)) return "oitavas de final";
    if ((m = /^round of (\d+)$/i.exec(s))) return "rodada de " + m[1];
    if ((m = /^(?:round (\d+)|(\d+)(?:st|nd|rd|th) round)$/i.exec(s))) return (m[1] || m[2]) + "ª rodada";
    if ((m = /^qualifying(?: round)?(?: (\d+))?$/i.exec(s)) || (m = /^(\d+)(?:st|nd|rd|th) round qualifying$/i.exec(s))) return "qualificatório" + (m[1] ? " · " + m[1] + "ª rodada" : "");
    if (/round robin|group stage/i.test(s)) return "fase de grupos";
    return s;
  }
  /* Placar por sets: [[6, 4], [3, 6], [7, 6]] vira "6-4 3-6 7-6"; set sem número fica de fora */
  const placarSets = (sets) => (Array.isArray(sets) ? sets : []).filter((x) => Array.isArray(x) && (x[0] != null || x[1] != null)).map((x) => (x[0] ?? 0) + "-" + (x[1] ?? 0)).join(" ");
  /* Busca de jogador pelo nome digitado: sem acento e sem caixa, o nome digitado inteiro dentro do nome do jogador
     ("sinner" acha "Jannik Sinner"; "j. sinner" acha o curto "J. Sinner") */
  const semAcentoE = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  function ladoDoJogador(p, nome) {
    const q = semAcentoE(nome);
    if (q.length < 2 || !p) return -1;
    for (const k of [0, 1]) {
      const a = semAcentoE(p.jogadores && p.jogadores[k]), b = semAcentoE(p.curtos && p.curtos[k]);
      if ((a && a.includes(q)) || (b && b.includes(q))) return k;
    }
    return -1;
  }
  /* Legenda: as zonas da competição, na ordem da tabela */
  const legendaDe = (liga) => ((LIGAS[liga] && LIGAS[liga].zonas) || []).map((z) => ({ id: z.id, nome: ZONAS_NOME[z.id] || z.id, cor: ZONAS_COR[z.id] || "var(--muted-foreground)", faixa: z.de === z.ate ? z.de + "º" : z.de + "º a " + z.ate + "º" }));

  /* ---- Escudos (11/11) ----
     Só a URL do escudo que a própria ESPN manda (team.logo no scoreboard, team.logos[0].href na standings e no endpoint
     de times), e só de https://a.espncdn.com/i/teamlogos/. Qualquer outra origem (ou outra pasta da ESPN, como a das
     fotos de atleta) é descartada na leitura e de novo na página.
     Nada de foto de pessoa (jogador, técnico ou quem for): o Vai e vem usa um avatar de iniciais. */
  /* só a pasta de escudos (i/teamlogos/): a mesma origem também serve fotos de atleta (i/headshots/), e essas não entram */
  const ESCUDO_OK = /^https:\/\/a\.espncdn\.com\/i\/teamlogos\/[A-Za-z0-9_./-]+\.(png|svg|jpe?g|webp|gif)(\?[A-Za-z0-9_.=&%-]*)?$/i;
  function escudoOk(u) {
    const s = typeof u === "string" ? u.trim() : "";
    return s.length <= 300 && ESCUDO_OK.test(s) && !s.includes("..") && !s.includes("//", 8) ? s : "";
  }
  /* País de cada liga (ISO2), para desempatar clubes com o mesmo nome. Copas continentais ficam sem país. */
  const PAIS_LIGA = { "bra.2": "BR", "arg.1": "AR", "por.1": "PT", "ned.1": "NL", "usa.1": "US", "ksa.1": "SA", "mex.1": "MX" };
  LISTA.forEach((l) => { if (l.esporte === "futebol" && l.pais) PAIS_LIGA[l.id] = l.pais; });
  /* Ligas de onde saem as negociações do Vai e vem: o cron pede o endpoint de times delas 1 vez por semana */
  const LIGAS_ESCUDOS = ["bra.1", "bra.2", "arg.1", "eng.1", "esp.1", "ita.1", "ger.1", "fra.1", "por.1", "ned.1", "usa.1", "ksa.1", "mex.1"];
  /* Inglaterra chega como GB, EN, ENG ou UK; tudo vira GB */
  const paisNorm = (p) => { const s = String(p || "").trim().toUpperCase(); return ["EN", "ENG", "UK", "GB-ENG"].includes(s) ? "GB" : /^[A-Z]{2}$/.test(s) ? s : ""; };
  /* Nome de clube normalizado: sem acento, minúsculas, sem pontuação e sem fc, cf, sc, ec, clube, club, de, do, da */
  const PALAVRAS_FORA = new Set(["fc", "cf", "sc", "ec", "clube", "club", "de", "do", "da"]);
  function normClube(nome) {
    return String(nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ")
      .split(" ").filter((w) => w && !PALAVRAS_FORA.has(w)).join(" ");
  }
  /* Apelidos: os nomes como a imprensa escreve (já normalizados) e os nomes como a ESPN escreve (alvos). Com `pais`,
     o apelido só vale para clube daquele país; um apelido que só existe com país ("Inter", "América", "Atlético")
     não resolve nada quando o país do item falta ou é outro. */
  /* paisAlvo: o país do clube que o apelido sem ambiguidade aponta ("Barça" é o da Espanha, mesmo sem país no item) */
  const A = (nomes, alvos, pais, paisAlvo) => ({ nomes: nomes.map(normClube), alvos: alvos.map(normClube), pais: pais || "", paisAlvo: paisAlvo || pais || "" });
  const APELIDOS = [
    /* nomes que só fazem sentido com o país: "Inter" no Brasil é o Internacional, na Itália é a Internazionale */
    A(["Inter", "Colorado"], ["Internacional"], "BR"),
    A(["Inter"], ["Internazionale", "Inter Milan"], "IT"),
    A(["Inter"], ["Inter Miami CF", "Inter Miami"], "US"),
    A(["Atlético"], ["Atlético Madrid", "Atletico de Madrid"], "ES"),
    A(["América"], ["América", "Club América"], "MX"),
    A(["América"], ["América-MG", "América Mineiro"], "BR"),
    A(["Sporting"], ["Sporting CP"], "PT"),
    A(["Racing", "Racing Club"], ["Racing Club"], "AR"),
    A(["River", "River Plate"], ["River Plate"], "AR"),
    A(["Estudiantes"], ["Estudiantes de La Plata"], "AR"),
    A(["Barcelona"], ["Barcelona"], "ES"),
    A(["Forest"], ["Nottingham Forest"], "GB"),
    A(["OM"], ["Marseille"], "FR"),
    A(["OL"], ["Lyon"], "FR"),
    A(["Al-Ittihad", "Al Ittihad"], ["Al Ittihad"], "SA"),
    /* sem ambiguidade: valem com ou sem país */
    A(["Sport Club Internacional", "Internacional de Porto Alegre", "Inter de Porto Alegre"], ["Internacional"]),
    A(["Inter de Milão", "Inter Milão", "Inter Milan", "Internazionale Milano", "Internazionale"], ["Internazionale", "Inter Milan"]),
    A(["Atlético-MG", "Atlético Mineiro", "Clube Atlético Mineiro", "Galo"], ["Atlético-MG", "Atletico Mineiro"]),
    A(["Athletico-PR", "Athletico Paranaense", "Athletico", "Atlético-PR", "Atlético Paranaense"], ["Athletico-PR", "Athletico Paranaense"]),
    A(["Atlético-GO", "Atlético Goianiense"], ["Atlético-GO", "Atletico Goianiense"]),
    A(["Atlético de Madrid", "Atlético Madrid", "Atlético de Madri", "Atleti"], ["Atlético Madrid", "Atletico de Madrid"]),
    A(["América-MG", "América Mineiro"], ["América-MG", "América Mineiro"]),
    A(["PSG", "Paris Saint-Germain", "Paris SG"], ["Paris Saint-Germain"]),
    A(["Man United", "Man Utd", "Manchester United"], ["Manchester United"]),
    A(["Man City", "Manchester City"], ["Manchester City"]),
    A(["Bayern", "Bayern de Munique", "Bayern Munique", "Bayern Munich", "Bayern München", "FC Bayern"], ["Bayern Munich"]),
    A(["Sporting CP", "Sporting Lisboa", "Sporting de Lisboa", "Sporting Portugal"], ["Sporting CP"]),
    A(["Racing de Avellaneda"], ["Racing Club"]),
    A(["Estudiantes de La Plata"], ["Estudiantes de La Plata"]),
    A(["Barça"], ["Barcelona"], "", "ES"),
    A(["Juve", "Juventus"], ["Juventus"]),
    A(["Milan", "AC Milan"], ["AC Milan"]),
    A(["Roma", "AS Roma"], ["AS Roma"]),
    A(["Napoli", "Nápoles", "SSC Napoli"], ["Napoli"]),
    A(["Tottenham", "Spurs", "Tottenham Hotspur"], ["Tottenham Hotspur"]),
    A(["Newcastle", "Newcastle United"], ["Newcastle United"]),
    A(["West Ham", "West Ham United"], ["West Ham United"]),
    A(["Wolves", "Wolverhampton"], ["Wolverhampton Wanderers"]),
    A(["Brighton"], ["Brighton & Hove Albion"]),
    A(["Leverkusen", "Bayer Leverkusen"], ["Bayer Leverkusen"]),
    A(["Dortmund", "Borussia Dortmund", "BVB"], ["Borussia Dortmund"]),
    A(["Leipzig", "RB Leipzig"], ["RB Leipzig"]),
    A(["Olympique de Marseille"], ["Marseille"]),
    A(["Olympique Lyonnais"], ["Lyon"]),
    A(["SL Benfica"], ["Benfica"]),
    A(["Ajax", "Ajax Amsterdam"], ["AFC Ajax", "Ajax Amsterdam", "Ajax"]),
    A(["PSV"], ["PSV Eindhoven", "PSV"]),
    A(["Vasco"], ["Vasco da Gama"]),
    A(["Bragantino", "RB Bragantino", "Red Bull Bragantino"], ["Red Bull Bragantino", "Bragantino"]),
    A(["Boca", "Boca Juniors"], ["Boca Juniors"]),
    A(["Al-Hilal"], ["Al Hilal"]),
    A(["Al-Nassr"], ["Al Nassr"]),
  ];
  /* Clube do catálogo (meta/esportes-escudos: { times: { <id ESPN>: { nome, sigla, escudo, liga, pais } },
     mapa: { <nome normalizado>: [ids] } }) pelo nome como veio da notícia. O país do item desempata homônimos.
     Sem certeza (nada achado, mais de um candidato, país que não bate): null. Nunca chuta. */
  function timeDoCatalogo(nome, catalogo, pais) {
    const k = normClube(nome);
    if (!k || !catalogo || typeof catalogo !== "object" || !catalogo.mapa || !catalogo.times) return null;
    const P = paisNorm(pais);
    const tentar = (chaves, pais = P) => {
      const ids = [...new Set(chaves.flatMap((c) => (Array.isArray(catalogo.mapa[c]) ? catalogo.mapa[c] : [])))]
        .filter((id) => catalogo.times[id] && (!pais || paisNorm(catalogo.times[id].pais) === pais));
      return ids.length === 1 ? { id: ids[0], ...catalogo.times[ids[0]] } : null;
    };
    const comPais = APELIDOS.filter((a) => a.pais && a.nomes.includes(k));
    if (comPais.length) {
      const doPais = comPais.find((a) => a.pais === P);
      if (doPais) return tentar(doPais.alvos);
      /* "Inter" sem país, ou de um país sem apelido: só o nome exato com o país certo serve */
      if (!P) return null;
    }
    const exato = tentar([k]);
    if (exato) return exato;
    const geral = APELIDOS.find((a) => !a.pais && a.nomes.includes(k));
    return geral ? tentar(geral.alvos, P || geral.paisAlvo) : null;
  }
  /* URL do escudo de um clube pelo nome (ou null). O chip de sigla com a cor continua sendo o reserva. */
  function escudoDe(nome, catalogo, pais) {
    const t = timeDoCatalogo(nome, catalogo, pais);
    return t ? escudoOk(t.escudo) || null : null;
  }
  /* Chave estável de um clube para comparar e agrupar sem o catálogo: o primeiro alvo do apelido (respeitando o país)
     ou o nome normalizado. "Inter" e "Internacional" do Brasil viram a mesma chave. */
  function chaveClube(nome, pais) {
    const k = normClube(nome), P = paisNorm(pais);
    if (!k) return "";
    const a = APELIDOS.find((x) => x.nomes.includes(k) && x.pais && x.pais === P) || APELIDOS.find((x) => x.nomes.includes(k) && !x.pais);
    return a ? a.alvos[0] : k;
  }

  /* ---- Vai e vem (11/11): uma negociação por card ----
     Etapas em ordem e desfechos, com rótulo estável. O status gravado pela curadoria passa por etapaDe; o que ela
     mandar fora daqui vira "em aberto". A cor fica na página. */
  const ETAPAS = [
    { id: "rumor", nome: "Rumor" }, { id: "interesse", nome: "Interesse" }, { id: "proposta", nome: "Proposta" },
    { id: "acerto", nome: "Acordo encaminhado" }, { id: "oficial", nome: "Oficial" },
  ];
  const DESFECHOS = [{ id: "recusada", nome: "Proposta recusada" }, { id: "renovou", nome: "Renovou" }, { id: "fica", nome: "Fica" }, { id: "melou", nome: "Não rolou" }];
  const ETAPA = Object.fromEntries([...ETAPAS.map((e, i) => [e.id, { ...e, passo: i }]), ...DESFECHOS.map((e) => [e.id, { ...e, passo: null, desfecho: true }]), ["aberto", { id: "aberto", nome: "Em aberto", passo: null }]]);
  /* Grafias que a curadoria já usou (ou pode usar) para a mesma etapa */
  const SINONIMOS = {
    boato: "rumor", especulacao: "rumor", sondagem: "interesse", interessado: "interesse", consulta: "interesse",
    negociacao: "proposta", negociando: "proposta", "em-negociacao": "proposta", oferta: "proposta",
    acordo: "acerto", "acordo-encaminhado": "acerto", "falta-assinar": "acerto", encaminhado: "acerto", "acerto-verbal": "acerto",
    fechado: "oficial", fechada: "oficial", anunciado: "oficial", confirmado: "oficial", assinado: "oficial", concluido: "oficial",
    recusado: "recusada", rejeitada: "recusada", rejeitado: "recusada", recusou: "recusada",
    renovado: "renovou", renovacao: "renovou", permanece: "fica", ficou: "fica", "nao-rolou": "melou", desistiu: "melou", cancelado: "melou", cancelada: "melou", travou: "melou",
  };
  function etapaDe(status) {
    const s = String(status || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/[\s_]+/g, "-");
    return ETAPA[s] ? s : SINONIMOS[s] || "aberto";
  }
  /* Ordem de "mais avançada primeiro": oficial, acerto, proposta, os desfechos, interesse, rumor, em aberto */
  const PESO_ETAPA = { oficial: 6, acerto: 5, proposta: 4, recusada: 3, renovou: 3, fica: 3, melou: 3, interesse: 2, rumor: 1, aberto: 0 };
  /* Só os campos que o card usa: o que mais vier no objeto (foto, link de imagem, o que for) fica de fora */
  const txtT = (v, max) => (v == null ? "" : String(v)).replace(/\s+/g, " ").trim().slice(0, max);
  const clubeT = (c) => (c && typeof c === "object" && txtT(c.clube, 60) ? { clube: txtT(c.clube, 60), pais: paisNorm(c.pais), sigla: txtT(c.sigla, 4).toUpperCase(), cor: /^#[0-9a-f]{3,8}$/i.test(String(c.cor || "")) ? String(c.cor) : "" } : null);
  function transferenciaLimpa(t) {
    if (!t || typeof t !== "object") return null;
    const idade = Number(t.idade);
    const out = { jogador: txtT(t.jogador, 60), posicao: txtT(t.posicao, 30), idade: Number.isInteger(idade) && idade > 10 && idade < 60 ? idade : null,
      nacionalidade: paisNorm(t.nacionalidade), origem: clubeT(t.origem), destino: clubeT(t.destino), status: txtT(t.status, 30), valor: txtT(t.valor, 40),
      fontes: Number.isInteger(Number(t.fontes)) && Number(t.fontes) > 0 ? Number(t.fontes) : null, atualizado: txtT(t.atualizado, 30) };
    return out.jogador || out.destino ? out : null;
  }
  const ehNegociacao = (i) => !!(i && transferenciaLimpa(i.transferencia));
  const quandoItem = (i, t) => Date.parse((t && t.atualizado) || i.publicado || i.coletado || "") || 0;
  const fonteNorm = (f) => String(f || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/^(www\.)/, "").replace(/[^a-z0-9]+/g, " ").trim();
  /* Chave da negociação: jogador + clube de destino; sem destino, jogador + origem */
  function chaveNegociacao(t) {
    const j = normClube(t.jogador);
    if (!j) return "";
    if (t.destino) return j + "|para:" + chaveClube(t.destino.clube, t.destino.pais);
    return j + "|de:" + (t.origem ? chaveClube(t.origem.clube, t.origem.pais) : "");
  }
  const DIA = 86_400_000;
  /* Itens com `transferencia` (de qualquer tema) viram negociações: { chave, t, etapa, peso, atualizado, fontes, itens,
     brasil, antigo }. t é a transferência mais recente com os campos que faltam completados pelas mais velhas.
     itens: as notícias do grupo, da mais nova para a mais velha. fontes: veículos distintos. antigo: rumor de 1 fonte
     sem novidade há mais de 7 dias. */
  function agruparNegociacoes(itens, agora = Date.now()) {
    const grupos = new Map();
    for (const i of Array.isArray(itens) ? itens : []) {
      if (!i || typeof i !== "object") continue;
      const t = transferenciaLimpa(i.transferencia);
      if (!t) continue;
      const k = chaveNegociacao(t) || "url:" + (i.url || i.titulo || Math.random());
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push({ i, t, quando: quandoItem(i, t) });
    }
    const out = [];
    for (const [chave, lista] of grupos) {
      const vistos = new Set();
      const ls = lista.filter((x) => { const u = x.i.url || x.i.titulo; if (u && vistos.has(u)) return false; if (u) vistos.add(u); return true; }).sort((a, b) => b.quando - a.quando);
      const t = { ...ls[0].t };
      for (const x of ls.slice(1)) for (const c of ["posicao", "idade", "nacionalidade", "origem", "destino", "valor"]) if (!t[c] && x.t[c]) t[c] = x.t[c];
      const etapa = etapaDe(ls[0].t.status);
      const fs = new Set(ls.map((x) => fonteNorm(x.i.fonte)).filter(Boolean));
      const fontes = fs.size || Math.max(1, ...ls.map((x) => x.t.fontes || 1));
      const atualizado = ls[0].quando;
      const paises = [t.origem && t.origem.pais, t.destino && t.destino.pais].filter(Boolean);
      const brasil = paises.length ? paises.includes("BR") : ls.some((x) => x.i.subtema === "brasil" || x.i.subtema === "inter");
      out.push({ chave, t, etapa, peso: PESO_ETAPA[etapa] ?? 0, atualizado: atualizado ? new Date(atualizado).toISOString() : "", fontes,
        itens: ls.map((x) => x.i), brasil, antigo: etapa === "rumor" && fontes <= 1 && !!atualizado && agora - atualizado > 7 * DIA });
    }
    return ordenarNegociacoes(out);
  }
  const ordenarNegociacoes = (ns) => ns.slice().sort((a, b) => b.peso - a.peso || String(b.atualizado).localeCompare(String(a.atualizado)));
  /* A negociação mexe com algum destes times ({ liga, id, nome } de Meus esportes)? Pelo id da ESPN via catálogo, quando
     dá; senão pela chave do nome (com apelidos e o país da liga do time). */
  function negociacaoDoTime(n, times, catalogo) {
    const clubes = [n.t.origem, n.t.destino].filter(Boolean);
    const clubeItem = n.itens.map((i) => i.clube).find(Boolean);
    return (times || []).some((tm) => {
      const pais = PAIS_LIGA[tm.liga] || "";
      const k = chaveClube(tm.nome, pais);
      return clubes.some((c) => {
        const doCat = catalogo ? timeDoCatalogo(c.clube, catalogo, c.pais) : null;
        if (doCat && tm.id && doCat.id === String(tm.id)) return true;
        return (!c.pais || !pais || c.pais === pais) && chaveClube(c.clube, c.pais || pais) === k;
      }) || (!!clubeItem && chaveClube(clubeItem, pais) === k);
    });
  }
  /* Filtros da aba: quem ("tudo", "meu", "brasil", "fora") e etapa ("tudo", "proposta": proposta ou mais, "oficial") */
  const QUEM_VV = ["tudo", "meu", "brasil", "fora"], ETAPA_VV = ["tudo", "proposta", "oficial"];
  function filtrarNegociacoes(ns, { quem = "tudo", etapa = "tudo", times = [], catalogo = null } = {}) {
    return (ns || []).filter((n) => {
      if (quem === "meu" && !negociacaoDoTime(n, times, catalogo)) return false;
      if (quem === "brasil" && !n.brasil) return false;
      if (quem === "fora" && n.brasil) return false;
      if (etapa === "proposta" && !["proposta", "acerto", "oficial"].includes(n.etapa)) return false;
      if (etapa === "oficial" && n.etapa !== "oficial") return false;
      return true;
    });
  }

  const padraoPrefs = () => ({ competicoes: PADRAO.slice(), times: [], jogadores: [], ordem: ORDEM_LIGAS.slice(), escudos: true });
  /* Ordem completa: a salva (só ids conhecidos, sem repetir) e, no fim, as competições novas que ainda não estavam lá */
  function ordemCompleta(o) {
    const vistos = new Set(), out = [];
    for (const id of Array.isArray(o) ? o : []) if (LIGAS[id] && !vistos.has(id)) { vistos.add(id); out.push(id); }
    for (const id of ORDEM_LIGAS) if (!vistos.has(id)) out.push(id);
    return out;
  }
  /* Competições ligadas na ordem da pessoa */
  const ligadas = (p) => { const on = new Set((p && p.competicoes) || []); return ordemCompleta(p && p.ordem).filter((id) => on.has(id)); };

  // Confere o corpo do PUT. Devolve { prefs } ou { erro }.
  function validarPrefs(b) {
    if (!b || typeof b !== "object" || Array.isArray(b)) return { erro: "corpo" };
    for (const k of Object.keys(b)) if (!["competicoes", "times", "jogadores", "ordem", "escudos"].includes(k)) return { erro: "campo " + String(k).slice(0, 20) };
    if (b.escudos !== undefined && typeof b.escudos !== "boolean") return { erro: "escudos" };
    if (!Array.isArray(b.competicoes)) return { erro: "Mande a lista de competições." };
    const comp = [];
    for (const id of b.competicoes) {
      if (typeof id !== "string" || !LIGAS[id]) return { erro: "Competição desconhecida: " + String(id).slice(0, 40) };
      if (!comp.includes(id)) comp.push(id);
    }
    let ordem = ORDEM_LIGAS.slice();
    if (b.ordem !== undefined) {
      if (!Array.isArray(b.ordem)) return { erro: "ordem" };
      for (const id of b.ordem) if (typeof id !== "string" || !LIGAS[id]) return { erro: "Competição desconhecida na ordem: " + String(id).slice(0, 40) };
      ordem = ordemCompleta(b.ordem);
    }
    const times = [];
    if (b.times !== undefined) {
      if (!Array.isArray(b.times)) return { erro: "times" };
      if (b.times.length > MAX_TIMES) return { erro: `Dá para acompanhar até ${MAX_TIMES} times.` };
      for (const t of b.times) {
        if (!t || typeof t !== "object") return { erro: "time" };
        const liga = t.liga, id = String(t.id ?? ""), nome = String(t.nome ?? "").replace(/\s+/g, " ").trim();
        if (!LIGAS[liga]) return { erro: "Competição desconhecida no time: " + String(liga).slice(0, 40) };
        if (!ID_TIME_OK.test(id)) return { erro: "id de time: " + id.slice(0, 40) };
        if (!nome || nome.length > NOME_MAX) return { erro: "Nome do time vazio ou com mais de " + NOME_MAX + " letras." };
        if (!times.some((x) => x.liga === liga && x.id === id)) times.push({ liga, id, nome });
      }
    }
    const jogadores = [];
    if (b.jogadores !== undefined) {
      if (!Array.isArray(b.jogadores)) return { erro: "jogadores" };
      if (b.jogadores.length > MAX_JOGADORES) return { erro: `Dá para acompanhar até ${MAX_JOGADORES} jogadores.` };
      for (const x of b.jogadores) {
        if (!x || typeof x !== "object") return { erro: "jogador" };
        const liga = x.liga, nome = String(x.nome ?? "").replace(/\s+/g, " ").trim();
        if (!LIGAS[liga] || !LIGAS[liga].tenis) return { erro: "Jogador só de ATP ou WTA: " + String(liga).slice(0, 40) };
        if (nome.length < 2 || nome.length > NOME_MAX) return { erro: "Nome do jogador com menos de 2 ou mais de " + NOME_MAX + " letras." };
        if (!jogadores.some((y) => y.liga === liga && semAcentoE(y.nome) === semAcentoE(nome))) jogadores.push({ liga, nome });
      }
    }
    /* escudos: o interruptor "Mostrar escudos" (ligado quando não vem) */
    return { prefs: { competicoes: comp, times, jogadores, ordem, escudos: b.escudos !== false } };
  }
  /* O salvo sem as competições que saíram (RETIRADAS): a pessoa que tinha a NFL ligada fica com o resto */
  function semRetiradas(salvo) {
    if (!salvo || typeof salvo !== "object") return salvo;
    const fora = (id) => typeof id === "string" && RETIRADAS.has(id);
    const lista = (v) => (Array.isArray(v) ? v.filter((id) => !fora(id)) : v);
    return { ...salvo, competicoes: lista(salvo.competicoes), ordem: lista(salvo.ordem), times: Array.isArray(salvo.times) ? salvo.times.filter((t) => !(t && fora(t.liga))) : salvo.times };
  }
  // Resposta do GET: o salvo conferido (o que estiver estragado vira o padrão) e o catálogo para a tela.
  function respostaPrefs(salvo) {
    let p = null;
    if (salvo) { const s = semRetiradas(salvo); const v = validarPrefs({ competicoes: s.competicoes, times: s.times, jogadores: s.jogadores, ordem: s.ordem, ...(typeof s.escudos === "boolean" ? { escudos: s.escudos } : {}) }); p = v.prefs || null; }
    const base = p || padraoPrefs();
    return {
      ...base, padrao: !p, atualizado: (salvo && salvo.atualizado) || null,
      esportes: ESPORTES.map((e) => ({ id: e.id, nome: e.nome, ligas: e.ligas.map((id) => ({ id, nome: LIGAS[id].nome, curto: LIGAS[id].curto, pais: LIGAS[id].pais })), ...(e.nota ? { nota: e.nota } : {}) })),
    };
  }

  /* Hora de um jogo no fuso de quem vê: "qua., 05/11 · 21:30" (fuso padrão America/Sao_Paulo) */
  function fusoLocal() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo"; } catch (e) { return "America/Sao_Paulo"; }
  }
  function partesData(iso, fuso) {
    const d = new Date(iso);
    if (!iso || isNaN(d)) return null;
    try {
      const f = new Intl.DateTimeFormat("pt-BR", { timeZone: fuso || fusoLocal(), weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
      const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
      const dia = new Intl.DateTimeFormat("en-CA", { timeZone: fuso || fusoLocal(), year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
      return { semana: String(p.weekday || "").replace(".", ""), ddmm: p.day + "/" + p.month, hora: p.hour + ":" + p.minute, dia };
    } catch (e) { return null; }
  }
  /* "hoje", "amanhã", "ontem" ou "qua 05/11" */
  function rotuloDia(iso, fuso, agora = new Date()) {
    const p = partesData(iso, fuso);
    if (!p) return "";
    const fmt = (d) => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: fuso || fusoLocal(), year: "numeric", month: "2-digit", day: "2-digit" }).format(d); } catch (e) { return ""; } };
    const hoje = fmt(agora), amanha = fmt(new Date(agora.getTime() + 86400000)), ontem = fmt(new Date(agora.getTime() - 86400000));
    if (p.dia === hoje) return "hoje";
    if (p.dia === amanha) return "amanhã";
    if (p.dia === ontem) return "ontem";
    return p.semana + " " + p.ddmm;
  }

  /* ==== Time do coração, times seguidos, campeonato em andamento e faixa de jogos (pedidos de 19/11) ==== */
  const DIA_MS = 86_400_000;
  /* Chave do time: o id da ESPN no futebol (o mesmo em todas as competições); fora do futebol, o esporte na frente
     ("basquete-13"), porque os ids da NBA (1 a 30) podem coincidir com ids de clubes. */
  function chaveTime(liga, id) {
    const l = LIGAS[liga], s = String(id == null ? "" : id).trim();
    if (!s) return "";
    return !l || l.esporte === "futebol" ? s : l.esporte + "-" + s;
  }
  /* Todos os jogos que um doc de competição traz (agenda dos dias buscados, rodada, próximos, últimos e a agenda dos
     times), um por id, em ordem de data. A agenda (`agenda.jogos`) é a mais nova; o resto completa. */
  function jogosDoDoc(doc) {
    if (!doc || typeof doc !== "object") return [];
    const porId = new Map();
    const pega = (lista) => { for (const j of Array.isArray(lista) ? lista : []) { if (!j || typeof j !== "object" || !j.data) continue; const k = j.id || j.data + "|" + (j.mandante || "") + "|" + (j.visitante || ""); if (!porId.has(k)) porId.set(k, j); } };
    pega(doc.agenda && doc.agenda.jogos);
    pega(doc.rodada && doc.rodada.jogos);
    pega(doc.proximos); pega(doc.ultimos);
    for (const t of Object.values(doc.times && typeof doc.times === "object" ? doc.times : {})) if (t) { pega(t.proximos); pega(t.ultimos); }
    return [...porId.values()].sort((a, b) => String(a.data).localeCompare(String(b.data)));
  }
  /* Dia do calendário ("2026-11-19" ou "20261119") ao meio-dia de São Paulo, em ms */
  const msDoDia = (d) => { const s = String(d || "").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"); const t = Date.parse(s.slice(0, 10) + "T12:00:00-03:00"); return isNaN(t) ? NaN : t; };
  /* Em andamento (pedido de 19/11): há jogo da competição nos últimos 10 dias ou nos próximos 21 (jogos guardados ou
     dias do calendário da ESPN, `diasJogo`), jogo ao vivo, ou a fonte marca a temporada como em curso (`temporadaJanela`
     da ESPN, fora da pré-temporada e das férias; no tênis, um torneio com início e fim em volta de agora).
     Devolve { andamento, ultimo, proximo }: a data do último jogo e a do próximo (ou do início previsto) que se conhecem. */
  function situacaoCampeonato(doc, agora = Date.now()) {
    const out = { andamento: false, ultimo: null, proximo: null };
    if (!doc || typeof doc !== "object") return out;
    const t = Number(agora), de = t - 10 * DIA_MS, ate = t + 21 * DIA_MS;
    const datas = [];
    for (const j of jogosDoDoc(doc)) {
      const x = Date.parse(j.data);
      if (isNaN(x)) continue;
      if (j.estado === "in") out.andamento = true;
      datas.push([x, j.estado]);
    }
    for (const d of Array.isArray(doc.diasJogo) ? doc.diasJogo : []) { const x = msDoDia(d); if (!isNaN(x)) datas.push([x, ""]); }
    for (const tr of Array.isArray(doc.torneios) ? doc.torneios : []) {
      const a = Date.parse(tr && tr.inicio), b = Date.parse(tr && tr.fim);
      if (!isNaN(a)) datas.push([a, ""]);
      if (!isNaN(b)) datas.push([b, ""]);
      if (!isNaN(a) && a <= t && (isNaN(b) ? t - a < 14 * DIA_MS : t <= b + DIA_MS)) out.andamento = true;
      if (tr && tr.aoVivo) out.andamento = true;
    }
    for (const [x, estado] of datas) {
      if (x >= de && x <= ate) out.andamento = true;
      if (x <= t || estado === "post") { if (out.ultimo === null || x > out.ultimo) out.ultimo = x; }
      else if (out.proximo === null || x < out.proximo) out.proximo = x;
    }
    const jan = doc.temporadaJanela;
    if (jan && typeof jan === "object") {
      const a = Date.parse(jan.inicio), b = Date.parse(jan.fim), tipo = Number(jan.tipo);
      if (!isNaN(a) && !isNaN(b) && a <= t && t <= b && tipo !== 1 && tipo !== 4) out.andamento = true;
      if (!isNaN(a) && a > t && (out.proximo === null || a < out.proximo)) out.proximo = a;
    }
    return { andamento: out.andamento, ultimo: out.ultimo === null ? null : new Date(out.ultimo).toISOString(), proximo: out.proximo === null ? null : new Date(out.proximo).toISOString() };
  }
  const emAndamento = (doc, agora = Date.now()) => situacaoCampeonato(doc, agora).andamento;

  /* Dia em São Paulo (AAAA-MM-DD) */
  const diaEmSP = (ms) => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms)); } catch (e) { return ""; } };
  /* Rótulo do dia nos cartões da faixa, no fuso de São Paulo: "Hoje", "Amanhã", "Ontem" ou "Sáb 21/11" */
  function rotuloDiaCartao(iso, agora = Date.now()) {
    const t = Date.parse(iso);
    if (isNaN(t)) return "";
    const d = diaEmSP(t), a = Number(agora);
    if (d === diaEmSP(a)) return "Hoje";
    if (d === diaEmSP(a + DIA_MS)) return "Amanhã";
    if (d === diaEmSP(a - DIA_MS)) return "Ontem";
    const p = partesData(iso, "America/Sao_Paulo");
    return p ? p.semana.charAt(0).toUpperCase() + p.semana.slice(1) + " " + p.ddmm : "";
  }
  /* Faixa de jogos acima da tabela (pedido de 19/11, 15h30). `jogos`: os da competição (jogosDoDoc); `coracao`: o id
     da ESPN do time do coração (ou null). Devolve { fixo, lista }:
     - lista: os jogos de hoje em São Paulo (qualquer estado; o ao vivo que começou ontem também conta como de hoje) e
       depois os dos próximos 7 dias que ainda não acabaram, em ordem de data;
     - fixo: o jogo do coração nesta competição: o de hoje; senão o próximo (marcado para depois de agora, sem limite
       de dias); senão o último resultado. Sem time ou sem jogo dele, null. O fixo não se repete na lista. */
  function jogosDoCabecalho(jogos, campeonato, coracao, agora = Date.now()) {
    const t = Number(agora), hoje = diaEmSP(t), limite = diaEmSP(t + 7 * DIA_MS);
    const js = (Array.isArray(jogos) ? jogos : []).filter((j) => j && typeof j === "object" && !isNaN(Date.parse(j.data)));
    const dia = (j) => diaEmSP(Date.parse(j.data));
    const ehHoje = (j) => j.estado === "in" || dia(j) === hoje;
    const porData = (a, b) => Date.parse(a.data) - Date.parse(b.data);
    const deHoje = js.filter(ehHoje).sort(porData);
    const semana = js.filter((j) => !ehHoje(j) && j.estado !== "post" && dia(j) > hoje && dia(j) <= limite).sort(porData);
    let fixo = null;
    const c = coracao == null ? "" : String(coracao);
    if (c) {
      const dele = js.filter((j) => Array.isArray(j.ids) && j.ids.map(String).includes(c));
      fixo = dele.filter(ehHoje).sort(porData)[0]
        || dele.filter((j) => j.estado === "pre" && Date.parse(j.data) > t).sort(porData)[0]
        || dele.filter((j) => j.estado === "post").sort((a, b) => porData(b, a))[0] || null;
    }
    const igual = (a, b) => !!a && !!b && (a === b || (!!a.id && a.id === b.id));
    const lista = [...deHoje, ...semana].filter((j) => !igual(j, fixo));
    return { fixo, lista };
  }

  /* ---- Meus times: prefs/<email>, id "esportes-times": { coracao, seguidos, perguntado, v } ----
     coracao: a chave do time (chaveTime) ou null; seguidos: até MAX_SEGUIDOS chaves, o do coração sempre entre elas e
     primeiro; perguntado: quando a pessoa respondeu (Salvar ou "Não torço para nenhum time"); v: versão do formato.
     `conhecidos`: os times que o Lookout conhece (Map ou lista de { chave }), os das tabelas e jogos coletados. */
  const MAX_SEGUIDOS = 10, V_TIMES = 1;
  const CHAVE_OK = /^[A-Za-z0-9-]{1,40}$/;
  function temConhecido(conhecidos, k) {
    if (!conhecidos) return false;
    if (conhecidos instanceof Map) return conhecidos.has(k);
    if (Array.isArray(conhecidos)) return conhecidos.some((x) => x && x.chave === k);
    return Object.prototype.hasOwnProperty.call(conhecidos, k);
  }
  function validarTimes(b, conhecidos) {
    if (!b || typeof b !== "object" || Array.isArray(b)) return { erro: "corpo" };
    for (const k of Object.keys(b)) if (!["coracao", "seguidos"].includes(k)) return { erro: "campo " + String(k).slice(0, 20) };
    const coracao = b.coracao === undefined || b.coracao === null || b.coracao === "" ? null : b.coracao;
    if (coracao !== null && (typeof coracao !== "string" || !CHAVE_OK.test(coracao))) return { erro: "Time do coração inválido." };
    if (coracao !== null && !temConhecido(conhecidos, coracao)) return { erro: "Não achei esse time nas tabelas coletadas." };
    const lista = b.seguidos === undefined ? [] : b.seguidos;
    if (!Array.isArray(lista)) return { erro: "seguidos" };
    const seguidos = coracao ? [coracao] : [];
    for (const k of lista) {
      if (typeof k !== "string" || !CHAVE_OK.test(k)) return { erro: "Time seguido inválido." };
      if (!temConhecido(conhecidos, k)) return { erro: "Não achei um dos times nas tabelas coletadas." };
      if (!seguidos.includes(k)) seguidos.push(k);
    }
    if (seguidos.length > MAX_SEGUIDOS) return { erro: `Dá para seguir até ${MAX_SEGUIDOS} times.` };
    return { times: { coracao, seguidos } };
  }
  /* O salvo conferido para o GET. Time que sumiu das tabelas continua (a coleta pode só não ter passado por ele);
     id estragado sai. Quem nunca respondeu: tudo vazio e perguntado null. */
  function respostaTimes(salvo) {
    const ok = (k) => typeof k === "string" && CHAVE_OK.test(k);
    const s = salvo && typeof salvo === "object" ? salvo : null;
    const coracao = s && ok(s.coracao) ? s.coracao : null;
    const seguidos = [];
    if (coracao) seguidos.push(coracao);
    for (const k of s && Array.isArray(s.seguidos) ? s.seguidos : []) if (ok(k) && !seguidos.includes(k) && seguidos.length < MAX_SEGUIDOS) seguidos.push(k);
    const perguntado = s && typeof s.perguntado === "string" && !isNaN(Date.parse(s.perguntado)) ? s.perguntado : null;
    return { coracao, seguidos, perguntado, v: V_TIMES, atualizado: (s && s.atualizado) || null };
  }
  /* Abre o cartão "Qual é o seu time do coração?"? Sim quando a pessoa não tem time do coração, nunca respondeu
     (Salvar ou "Não torço para nenhum time" gravam `perguntado`) e não tocou em "Agora não" nesta visita a Esportes.
     prefs ainda não lido (undefined): não, para o cartão não piscar. */
  function devePerguntar(prefs, { agoraNao = false } = {}) {
    if (!prefs || typeof prefs !== "object") return false;
    if (prefs.coracao) return false;
    if (prefs.perguntado) return false;
    return !agoraNao;
  }

  /* ---- Notícia x time (pedido de 19/11) ----
     Regra, nesta ordem:
     1. Campo da curadoria: `clube` do item (ou origem/destino da `transferencia`) com o mesmo clube, pela chave do nome
        com os apelidos (chaveClube). O tema "inter" é do Internacional.
     2. Texto (título e resumo, original e tradução): os nomes do time, o nome curto e os apelidos dele (APELIDOS),
        procurando sempre a expressão mais longa primeiro, para "Inter Miami" e "Inter de Milão" não virarem "Inter".
        Uma expressão só conta se apontar para um time só: "Inter" sozinho vale o Internacional quando o item é do Brasil
        (temas inter, gauchao, brasileirao, copadobrasil; subtema brasil ou inter; ou abrangência nacional), a Internazionale
        quando é da Itália e nada quando o país do item não se sabe. `outros` (os times conhecidos) entra para desempatar
        nomes repetidos ("Spurs" é o Tottenham e o San Antonio).
     3. Nome que também é palavra comum ("internacional", "vitória", "sport", "santos", "juventude"...) só conta escrito
        com maiúscula, fora do começo de frase e sem "dos"/"das" antes ("Lucas dos Santos" não é o Santos). */
  const TEMAS_BR = new Set(["inter", "gauchao", "brasileirao", "copadobrasil"]);
  const TEMA_CLUBE = { inter: { nome: "Internacional", pais: "BR" } };
  const PALAVRAS_COMUNS = new Set(["internacional", "nacional", "vitoria", "sport", "santos", "juventude", "cruzeiro", "fortaleza", "remo", "operario", "guarani", "bahia", "ceara", "goias", "america", "atletico", "athletico", "botafogo", "independiente", "real", "united", "city", "jazz", "magic", "kings", "heat"]);
  const FRASES_FORA = ["magic johnson", "sport tv", "sportv", "copa america", "mundial clubes", "liga nacional", "futebol internacional", "mercado internacional", "cenario internacional", "torneio internacional", "festival jazz"];
  function paisDoItem(i) {
    if (!i || typeof i !== "object") return "";
    if (TEMAS_BR.has(i.tema) || i.subtema === "brasil" || i.subtema === "inter") return "BR";
    if (i.tema === "internacional" || i.subtema === "internacional" || i.escopo === "internacional") return "";
    return i.escopo === "nacional" ? "BR" : "";
  }
  const semAc = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  /* palavras do texto: { n: normalizada, o: original, ini: começo de frase, ant: a anterior normalizada } */
  function palavras(texto) {
    const out = [];
    const re = /[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*|[.!?:;|\n]/gu;
    let ini = true, ant = "", m;
    while ((m = re.exec(String(texto || "")))) {
      const w = m[0];
      if (/^[.!?:;|\n]$/.test(w)) { ini = true; continue; }
      for (const parte of w.split(/[-']/)) {
        const n = semAc(parte).toLowerCase();
        if (!n) continue;
        out.push({ n, o: parte, ini, ant });
        ini = false; ant = n;
      }
    }
    return out;
  }
  /* tabela de expressões: frase normalizada (sem fc, de, do, da...) → [{ alvo, pais }] */
  function tabelaFrases(time, outros) {
    const t = new Map();
    const pôr = (frase, alvo, pais) => { const f = normClube(frase); if (!f || !alvo) return; if (!t.has(f)) t.set(f, []); const l = t.get(f); if (!l.some((x) => x.alvo === alvo && x.pais === pais)) l.push({ alvo, pais: pais || "" }); };
    for (const a of APELIDOS) for (const n of a.nomes) pôr(n, a.alvos[0], a.pais);
    for (const a of APELIDOS) for (const n of a.alvos) pôr(n, a.alvos[0], a.pais && a.alvos.length === 1 && a.nomes.includes(n) ? a.pais : "");
    /* nome próprio que também é apelido dependente de país ("Inter" da Internazionale): vale só no país do time */
    const comPais = new Set(APELIDOS.filter((a) => a.pais).flatMap((a) => a.nomes));
    const proprio = (frase, alvo, p) => { const f = normClube(frase); if (!comPais.has(f)) pôr(frase, alvo, ""); else if (p) pôr(frase, alvo, p); };
    const daqui = (x) => { const p = paisNorm(x.pais); const alvo = chaveClube(x.nome, p); proprio(x.nome, alvo, p); if (x.curto) proprio(x.curto, alvo, p); return alvo; };
    for (const x of Array.isArray(outros) ? outros : []) if (x && x.nome && x !== time) daqui(x);
    const alvo = daqui(time);
    for (const f of FRASES_FORA) pôr(f, "~fora", "");
    return { t, alvo };
  }
  function citaNoTexto(texto, time, pais, frases) {
    const ws = palavras(texto).filter((w) => !PALAVRAS_FORA.has(w.n));
    const { t, alvo } = frases;
    const maxLen = 5;
    for (let i = 0; i < ws.length;) {
      let achou = null, len = 0;
      for (let k = Math.min(maxLen, ws.length - i); k >= 1; k--) {
        const f = ws.slice(i, i + k).map((w) => w.n).join(" ");
        if (t.has(f)) { achou = f; len = k; break; }
      }
      if (!achou) { i++; continue; }
      const cands = new Set(t.get(achou).filter((x) => !x.pais || x.pais === pais).map((x) => x.alvo));
      const w0 = ws[i];
      const comum = len === 1 && PALAVRAS_COMUNS.has(achou);
      const vale = !comum || (/^\p{Lu}/u.test(w0.o) && !w0.ini && w0.ant !== "dos" && w0.ant !== "das");
      if (vale && cands.size === 1 && cands.has(alvo)) return true;
      i += len;
    }
    return false;
  }
  /* time: { nome, curto?, pais? } (pais: ISO2 da liga nacional dele). outros: os times conhecidos, para desempate. */
  function noticiaDoTime(item, time, outros, _frases) {
    if (!item || typeof item !== "object" || !time || !time.nome) return false;
    const pais = paisDoItem(item);
    const pTime = paisNorm(time.pais);
    const alvo = chaveClube(time.nome, pTime);
    const mesmo = (nome, p) => { const q = paisNorm(p) || pais || pTime; return !!nome && (!paisNorm(p) || !pTime || paisNorm(p) === pTime) && chaveClube(nome, q) === alvo; };
    if (item.clube && mesmo(item.clube, "")) return true;
    const tc = TEMA_CLUBE[item.tema];
    if (tc && (!pTime || pTime === tc.pais) && chaveClube(tc.nome, tc.pais) === alvo) return true;
    const tr = item.transferencia && typeof item.transferencia === "object" ? item.transferencia : null;
    if (tr) for (const c of [tr.origem, tr.destino]) if (c && typeof c === "object" && mesmo(c.clube, c.pais)) return true;
    const frases = _frases || tabelaFrases(time, outros);
    const texto = [item.titulo_pt, item.titulo, item.resumo_pt, item.resumo].filter(Boolean).join(" | ");
    return citaNoTexto(texto, time, pais, frases);
  }
  /* Notícias que citam algum dos times (o filtro "Meus times"). As tabelas de expressões saem uma vez por time. */
  /* Ícone da notícia (pedido de 19/11, 17h03): o escudo do time ou a bandeira da delegação a que a notícia se refere.
     Ordem: o campo `clube` da curadoria; o destino e a origem da `transferencia`; depois o título (original e
     tradução), em trechos de 3, 2 e 1 palavras. Palavra sozinha que também é palavra comum ("Santos", "Vitória",
     "Real") não vale pelo título. Seleção ou delegação: bandeira do país quando o `clube` é um país ou quando o título
     traz "seleção", "delegação" ou "time" seguido do país. Nunca foto de pessoa. Devolve
     { tipo: "time", nome, sigla, escudo } | { tipo: "pais", nome, bandeira } | null. */
  const PAISES_ICONE = [
    ["BR", "Brasil", ["brasil", "brasileira", "brasileiro", "selecao brasileira", "canarinho"]], ["AR", "Argentina", ["argentina", "argentino"]],
    ["UY", "Uruguai", ["uruguai", "uruguaia", "uruguaio"]], ["CL", "Chile", ["chile", "chilena", "chileno"]], ["CO", "Colômbia", ["colombia", "colombiana", "colombiano"]],
    ["PY", "Paraguai", ["paraguai", "paraguaia", "paraguaio"]], ["PE", "Peru", ["peru", "peruana", "peruano"]], ["EC", "Equador", ["equador", "equatoriana", "equatoriano"]],
    ["BO", "Bolívia", ["bolivia", "boliviana", "boliviano"]], ["VE", "Venezuela", ["venezuela", "venezuelana"]], ["MX", "México", ["mexico", "mexicana", "mexicano"]],
    ["US", "Estados Unidos", ["estados unidos", "eua", "americana", "norte americana"]], ["CA", "Canadá", ["canada", "canadense"]],
    ["PT", "Portugal", ["portugal", "portuguesa"]], ["ES", "Espanha", ["espanha", "espanhola"]], ["FR", "França", ["franca", "francesa"]], ["DE", "Alemanha", ["alemanha", "alema"]],
    ["IT", "Itália", ["italia", "italiana"]], ["GB", "Inglaterra", ["inglaterra", "inglesa"]], ["NL", "Holanda", ["holanda", "holandesa", "paises baixos"]],
    ["BE", "Bélgica", ["belgica", "belga"]], ["HR", "Croácia", ["croacia", "croata"]], ["MA", "Marrocos", ["marrocos", "marroquina"]], ["JP", "Japão", ["japao", "japonesa"]],
    ["KR", "Coreia do Sul", ["coreia do sul", "sul coreana"]], ["AU", "Austrália", ["australia", "australiana"]], ["SN", "Senegal", ["senegal", "senegalesa"]],
    ["NG", "Nigéria", ["nigeria", "nigeriana"]], ["CN", "China", ["china", "chinesa"]], ["SA", "Arábia Saudita", ["arabia saudita", "saudita"]],
  ];
  const bandeira = (iso) => String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  const PAIS_POR_NOME = new Map(PAISES_ICONE.flatMap(([iso, nome, ns]) => ns.map((n) => [n, { tipo: "pais", nome, iso, bandeira: bandeira(iso) }])));
  const MARCA_DELEGACAO = new Set(["selecao", "delegacao", "time", "equipe", "comitiva"]);
  function paisDoNome(nome) {
    const k = semAc(nome).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/^(selecao|delegacao) (d[aeo]s? )?/, "");
    return PAIS_POR_NOME.get(k) || null;
  }
  function iconeDaNoticia(item, catalogo) {
    if (!item || typeof item !== "object") return null;
    const pais = paisDoItem(item);
    const time = (nome, p) => {
      const t = timeDoCatalogo(nome, catalogo, p === undefined ? pais : p);
      return t ? { tipo: "time", id: t.id, nome: t.nome || String(nome), sigla: t.sigla || "", escudo: escudoOk(t.escudo) || "" } : null;
    };
    const tr = item.transferencia && typeof item.transferencia === "object" ? item.transferencia : null;
    const dados = [item.clube && { n: item.clube }, tr && tr.destino && { n: tr.destino.clube, p: tr.destino.pais }, tr && tr.origem && { n: tr.origem.clube, p: tr.origem.pais }].filter((x) => x && x.n);
    for (const d of dados) {
      const t = time(d.n, d.p ? d.p : undefined) || time(d.n);
      if (t) return t;
      const ps = paisDoNome(d.n);
      if (ps) return ps;
    }
    for (const texto of [item.titulo, item.titulo_pt, item._orig && item._orig.titulo]) {
      if (!texto) continue;
      const ws = palavras(texto);
      for (let i = 0; i < ws.length; i++) {
        if (MARCA_DELEGACAO.has(ws[i].n)) {
          for (let j = i + 1; j <= Math.min(i + 3, ws.length - 1); j++) {
            const ps = PAIS_POR_NOME.get(ws[j].n) || (ws[j + 1] ? PAIS_POR_NOME.get(ws[j].n + " " + ws[j + 1].n) : null);
            if (ps) return ps;
          }
        }
      }
      for (const tam of [3, 2, 1]) {
        for (let i = 0; i + tam <= ws.length; i++) {
          const parte = ws.slice(i, i + tam);
          const frase = parte.map((w) => w.n).join(" ");
          if (FRASES_FORA.includes(frase)) continue;
          if (tam > 1 && (normClube(frase).split(" ").length < tam || !parte.some((w) => /^\p{Lu}/u.test(w.o)))) continue;
          if (tam === 1) {
            const w = parte[0];
            if (w.n.length < 4 || PALAVRAS_COMUNS.has(w.n) || !/^\p{Lu}/u.test(w.o) || PAIS_POR_NOME.has(w.n)) continue;
          }
          const t = time(frase);
          if (t) return t;
        }
      }
    }
    return null;
  }

  function filtrarMeusTimes(itens, times, outros) {
    const ts = (Array.isArray(times) ? times : []).filter((x) => x && x.nome).map((x) => ({ x, f: tabelaFrases(x, outros) }));
    if (!ts.length) return [];
    return (Array.isArray(itens) ? itens : []).filter((i) => ts.some(({ x, f }) => noticiaDoTime(i, x, outros, f)));
  }

  raiz.Esportes = { LIGAS, ORDEM_LIGAS, ESPORTES, SEMPRE, PADRAO, MAX_TIMES, MAX_JOGADORES, ZONAS_NOME, ZONAS_COR, slugLiga, zonaDe, legendaDe, colunasDe, rodadaDe, abasDe, periodo, nomeGrupo,
    rodadaTenis, placarSets, ladoDoJogador, semRetiradas, padraoPrefs, ordemCompleta, ligadas, validarPrefs, respostaPrefs, fusoLocal, partesData, rotuloDia,
    escudoOk, PAIS_LIGA, LIGAS_ESCUDOS, paisNorm, normClube, APELIDOS, timeDoCatalogo, escudoDe, chaveClube,
    ETAPAS, DESFECHOS, ETAPA, etapaDe, PESO_ETAPA, transferenciaLimpa, ehNegociacao, chaveNegociacao, agruparNegociacoes, ordenarNegociacoes, negociacaoDoTime, filtrarNegociacoes, QUEM_VV, ETAPA_VV,
    chaveTime, jogosDoDoc, situacaoCampeonato, emAndamento, rotuloDiaCartao, jogosDoCabecalho, MAX_SEGUIDOS, V_TIMES, validarTimes, respostaTimes, devePerguntar,
    paisDoItem, noticiaDoTime, filtrarMeusTimes, iconeDaNoticia, paisDoNome, frasesDoTime: tabelaFrases, PALAVRAS_COMUNS };
})(typeof globalThis !== "undefined" ? globalThis : this);
