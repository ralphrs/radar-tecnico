// Painel inicial (aba Início): catálogo de widgets, grupos e ordem padrão, e conferência do que a pessoa salva.
//
// O doc fica em prefs/<email>, id "painel": { grupos: [{ id, nome, recolhido, widgets: [{ id, formato }] }], atualizado }.
// formato é "colunas x linhas" ("1x1", "2x1", "3x1", "1x2", "2x2") e precisa estar nos `formatos` do widget. O doc antigo,
// { widgets: [...] } em lista plana (e o { tamanho: 1|2 } de antes dele), vira um grupo por tipo de widget na leitura e
// no PUT, se a página antiga mandar. Widget fora dos grupos está oculto. As regras de grupo, formato e encaixe ficam em
// public/inicio-grade.js, o mesmo arquivo que a página carrega.
//
// Este arquivo não importa nada do Worker (nem grupos.js, que puxa o espelho e "cloudflare:workers"),
// para os testes rodarem no Node. As seções seguem a mesma lista e a mesma regra de grupos.js.
// feeds.js é só a lista de feeds: dela sai quais seções têm subreddit (widget foruns-<secao>).
import { SECOES_COM_FORUM } from "./feeds.js";
// Competições de Esportes (o mesmo arquivo que a página carrega): um widget de rodada e um de tabela por competição.
import "../public/esportes.js";
import "../public/inicio-grade.js";
const ESP = globalThis.Esportes;
const G = globalThis.InicioGrade;

const SECOES = ["tech", "negocios", "investimentos", "politica", "esportes"];
const NOME_SECAO = { tech: "Tech", negocios: "Negócios", investimentos: "Investimentos", politica: "Notícias", esportes: "Esportes" };
const liberada = (secoes, s) => !s || secoes == null || secoes.includes(s);

export const FORMATOS = G.FORMATOS;
export const formatosDe = G.formatosDe;
export const GRUPOS = G.GRUPOS;
// Formato antigo (tamanho 1 ou 2) para o novo, sempre dentro do que o widget aceita
export const migrarFormato = G.formatoDe;

// secao: a seção que a pessoa precisa ter liberada para ver o widget (null = qualquer um vê).
export const WIDGETS = [
  { id: "hoje", titulo: "Hoje no Lookout", tamanho: 1, secao: null },
  { id: "mercado", titulo: "Mercado", tamanho: 1, secao: "investimentos" },
  { id: "pregao", titulo: "Pregão", tamanho: 2, secao: "investimentos" },
  { id: "fiis", titulo: "FIIs", tamanho: 1, secao: "investimentos" },
  { id: "eua", titulo: "EUA", tamanho: 1, secao: "investimentos" },
  { id: "listas", titulo: "Minhas listas", tamanho: 1, secao: "investimentos" },
  { id: "favoritos", titulo: "Favoritos", tamanho: 1, secao: null },
  ...SECOES.map((s) => ({ id: "destaques-" + s, titulo: "Destaques · " + NOME_SECAO[s], tamanho: 1, secao: s })),
  ...SECOES.map((s) => ({ id: "ultimas-" + s, titulo: "Últimas · " + NOME_SECAO[s], tamanho: 1, secao: s })),
  // Nos fóruns: posts de subreddit das últimas 24 h, só nas seções que têm subreddit em src/feeds.js. Fora do padrão.
  ...SECOES.filter((s) => SECOES_COM_FORUM.includes(s)).map((s) => ({ id: "foruns-" + s, titulo: "Fóruns · " + NOME_SECAO[s], tamanho: 1, secao: s })),
  // Esportes (src/esportes.js): rodada e tabela de cada competição e o próximo jogo do time que a pessoa acompanha.
  // Tênis (ATP e WTA) só tem o de jogos ("ATP · jogos"): não há tabela. O catálogo traz todas; a página só oferece as
  // competições que a pessoa ligou em "Meus esportes". Fora do padrão.
  ...ESP.ORDEM_LIGAS.flatMap((l) => [
    { id: "esportes-rodada-" + l, titulo: ESP.LIGAS[l].curto + " · " + ESP.rodadaDe(l), tamanho: 1, secao: "esportes", liga: l },
    ...(ESP.LIGAS[l].tenis ? [] : [{ id: "esportes-tabela-" + l, titulo: ESP.LIGAS[l].curto + " · tabela", tamanho: 1, secao: "esportes", liga: l }]),
  ]),
  { id: "esportes-meu-time", titulo: "Meu time · próximo jogo", tamanho: 1, secao: "esportes" },
  // Vai e vem (11/11): as negociações mais avançadas dos times da pessoa, com o escudo do destino e a etapa
  { id: "esportes-vaivem", titulo: "Vai e vem", tamanho: 1, secao: "esportes" },
  // Minha carteira (src/carteira.js): pessoais, leem /api/carteira uma vez só para todos; aparecem para quem importou
  // os extratos (a página esconde enquanto a carteira estiver vazia). Fora do padrão: a pessoa fixa pelo alfinete.
  { id: "carteira-meta", titulo: "Minha meta", tamanho: 2, secao: "investimentos", pessoal: true },
  { id: "carteira-patrimonio", titulo: "Patrimônio", tamanho: 1, secao: "investimentos", pessoal: true },
  { id: "carteira-proventos-mes", titulo: "Proventos do mês", tamanho: 1, secao: "investimentos", pessoal: true },
  { id: "carteira-pagamentos", titulo: "Próximos pagamentos", tamanho: 1, secao: "investimentos", pessoal: true },
  { id: "carteira-agenda", titulo: "Agenda da carteira", tamanho: 1, secao: "investimentos", pessoal: true },
  { id: "carteira-rentabilidade", titulo: "Rentabilidade", tamanho: 1, secao: "investimentos", pessoal: true },
  { id: "carteira-alertas", titulo: "Alertas da carteira", tamanho: 1, secao: "investimentos", pessoal: true },
  { id: "carteira-simulacoes", titulo: "Minhas simulações", tamanho: 1, secao: "investimentos", pessoal: true },
  { id: "carteira-reinvestir", titulo: "Reinvestir: maior pontuação", tamanho: 1, secao: "investimentos", pessoal: true },
  // Pelos seus limites (pedido de 10/11): papéis passíveis de venda e de compra pelos limites da pessoa
  { id: "carteira-limites", titulo: "Pelos seus limites", tamanho: 1, secao: "investimentos", pessoal: true },
  // Radar de dividendos e Leitura do dia: pessoais também. A página só oferece para quem tem carteira ou filtro salvo
  // (carteira-contra-filtro, só para quem tem carteira).
  { id: "radar-meu", titulo: "Meu radar", tamanho: 1, secao: "investimentos", pessoal: true },
  { id: "leitura-dia", titulo: "Leitura do dia", tamanho: 1, secao: "investimentos", pessoal: true },
  { id: "carteira-contra-filtro", titulo: "Carteira contra o filtro", tamanho: 1, secao: "investimentos", pessoal: true },
];
const POR_ID = new Map(WIDGETS.map((w) => [w.id, w]));

// Para quem nunca personalizou. Os que a pessoa não pode ver são pulados.
export const PADRAO = ["hoje", "mercado", "destaques-tech", "destaques-negocios", "destaques-investimentos", "destaques-politica", "pregao", "eua", "listas", "favoritos", "destaques-esportes", "ultimas-tech"];
export const MAX_WIDGETS = 40;

// secoes: lista de seções liberadas, ou null quando a pessoa vê tudo (o mesmo valor de quemEntra).
export const catalogoDe = (secoes) => WIDGETS.filter((w) => liberada(secoes, w.secao));
// Padrão em grupos: os do PADRAO, cada um no grupo do seu tipo, os grupos na ordem de GRUPOS
export function padraoDe(secoes) {
  const ws = PADRAO.map((id) => POR_ID.get(id)).filter((w) => liberada(secoes, w.secao)).map((w) => ({ id: w.id, formato: formatosDe(w.id)[0] }));
  const por = new Map(G.agrupar(ws).map((g) => [g.id, g]));
  return G.GRUPOS.filter((g) => por.has(g.id)).map((g) => por.get(g.id));
}
// Doc salvo (novo ou antigo) em grupos
export const migrarPainel = (salvo) => G.migrar(salvo);

// Confere o corpo de um PUT: { grupos } (novo) ou { widgets } (página antiga, vira grupos). Devolve { grupos } ou { erro }.
export function validarPainel(b, secoes) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return { erro: "corpo" };
  let grupos = b.grupos;
  if (grupos === undefined) {
    if (!Array.isArray(b.widgets)) return { erro: "grupos" };
    if (b.widgets.length > MAX_WIDGETS) return { erro: `O painel guarda até ${MAX_WIDGETS} widgets.` };
    // lista plana: confere o formato antes de agrupar (o tamanho antigo 1 ou 2 ainda vale)
    const lista = [];
    for (const w of b.widgets) {
      if (!w || typeof w !== "object") return { erro: "widget" };
      const id = typeof w.id === "string" ? w.id : "";
      if (!POR_ID.has(id)) return { erro: `Widget desconhecido: ${String(w.id).slice(0, 40)}` };
      if (w.formato !== undefined) lista.push({ id, formato: w.formato });
      else if (w.tamanho === 1 || w.tamanho === 2) lista.push({ id, formato: migrarFormato(id, w) });
      else return { erro: `Formato inválido em ${id}: use ${formatosDe(id).join(", ")}.` };
    }
    grupos = G.agrupar(lista);
  }
  const v = G.validar(grupos, { existe: (id) => POR_ID.has(id), liberado: (id) => liberada(secoes, POR_ID.get(id).secao), maxWidgets: MAX_WIDGETS });
  return v.erro ? v : { grupos: v.grupos, widgets: G.plano(v.grupos) };
}

// Resposta do GET (e do PUT): os grupos da pessoa já filtrados pelas seções de hoje (grupo que ficou vazio sai), a
// lista plana (para quem só quer saber o que está no Início), o padrão e o catálogo que ela pode usar. Um widget salvo
// de seção que a pessoa perdeu some da resposta e volta sozinho se a seção for liberada de novo.
export function respostaPainel(salvo, secoes) {
  const ok = (w) => w && POR_ID.has(w.id) && liberada(secoes, POR_ID.get(w.id).secao);
  const vistos = new Set(), idsG = new Set();
  const salvos = G.migrar(salvo);
  const grupos = salvos
    ? salvos.filter((g) => G.validar([{ ...g, widgets: [] }]).grupos && !idsG.has(g.id) && idsG.add(g.id))
        .map((g) => ({ ...g, widgets: g.widgets.filter((w) => ok(w) && !vistos.has(w.id) && vistos.add(w.id)) }))
        .filter((g) => g.widgets.length)
    : padraoDe(secoes);
  return {
    grupos,
    widgets: G.plano(grupos),
    padrao: !salvo,
    gruposPadrao: padraoDe(secoes),
    atualizado: (salvo && salvo.atualizado) || null,
    catalogo: catalogoDe(secoes).map(({ id, titulo, secao, pessoal, liga }) => ({ id, titulo, formatos: formatosDe(id), grupo: G.grupoDe(id), secao, ...(pessoal ? { pessoal: true } : {}), ...(liga ? { liga } : {}) })),
  };
}
