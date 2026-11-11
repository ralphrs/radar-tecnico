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

  raiz.Esportes = { LIGAS, ORDEM_LIGAS, ESPORTES, SEMPRE, PADRAO, MAX_TIMES, MAX_JOGADORES, ZONAS_NOME, ZONAS_COR, slugLiga, zonaDe, legendaDe, colunasDe, rodadaDe, abasDe, periodo, nomeGrupo,
    rodadaTenis, placarSets, ladoDoJogador, semRetiradas, padraoPrefs, ordemCompleta, ligadas, validarPrefs, respostaPrefs, fusoLocal, partesData, rotuloDia,
    escudoOk, PAIS_LIGA, LIGAS_ESCUDOS, paisNorm, normClube, APELIDOS, timeDoCatalogo, escudoDe, chaveClube,
    ETAPAS, DESFECHOS, ETAPA, etapaDe, PESO_ETAPA, transferenciaLimpa, ehNegociacao, chaveNegociacao, agruparNegociacoes, ordenarNegociacoes, negociacaoDoTime, filtrarNegociacoes, QUEM_VV, ETAPA_VV };
})(typeof globalThis !== "undefined" ? globalThis : this);
