// Painel inicial (aba Início): catálogo de widgets, ordem padrão e conferência do que a pessoa salva.
//
// O doc fica em prefs/<email>, id "painel": { widgets: [{ id, formato }], atualizado }. formato é "colunas x linhas"
// ("1x1", "2x1", "3x1", "1x2", "2x2") e precisa estar nos `formatos` do widget. Doc antigo com { tamanho: 1|2 } vira
// "1x1" ou "2x1" na leitura (e no PUT, se a página antiga mandar). A ordem do array é a ordem da grade; widget fora
// do array está oculto.
//
// Este arquivo não importa nada do Worker (nem grupos.js, que puxa o espelho e "cloudflare:workers"),
// para os testes rodarem no Node. As seções seguem a mesma lista e a mesma regra de grupos.js.

const SECOES = ["tech", "negocios", "investimentos", "politica", "esportes"];
const NOME_SECAO = { tech: "Tech", negocios: "Negócios", investimentos: "Investimentos", politica: "Notícias", esportes: "Esportes" };
const liberada = (secoes, s) => !s || secoes == null || secoes.includes(s);

export const FORMATOS = ["1x1", "2x1", "3x1", "1x2", "2x2"];
// Formatos que fazem sentido em cada widget; o primeiro é o padrão (o de antes, quando havia tamanho 2).
const FORMATOS_DE = {
  hoje: ["1x1"], mercado: ["1x1", "1x2"], pregao: ["2x1", "3x1", "2x2"], fiis: ["1x1", "2x1"], eua: ["1x1", "2x1"],
  listas: ["1x1", "1x2", "2x1"], favoritos: ["1x1", "1x2"], destaques: ["1x1", "1x2"], ultimas: ["1x1", "1x2"],
  "carteira-meta": ["2x1", "3x1"], "carteira-patrimonio": ["1x1", "2x1"], "carteira-proventos-mes": ["1x1"],
  "carteira-pagamentos": ["1x1", "1x2"], "carteira-agenda": ["1x1", "1x2"], "carteira-rentabilidade": ["1x1", "2x1"],
  "carteira-alertas": ["1x1", "1x2"], "radar-meu": ["1x1", "2x1", "2x2"], "leitura-dia": ["1x1", "1x2", "2x1"],
  "carteira-contra-filtro": ["1x1"],
};
export const formatosDe = (id) => FORMATOS_DE[id] || FORMATOS_DE[String(id).replace(/-.*$/, "")] || ["1x1"];
// Formato antigo (tamanho 1 ou 2) para o novo, sempre dentro do que o widget aceita
export function migrarFormato(id, w) {
  const ok = formatosDe(id);
  if (w && typeof w.formato === "string" && ok.includes(w.formato)) return w.formato;
  const quer = w && w.tamanho === 2 ? "2x1" : "1x1";
  return ok.includes(quer) ? quer : ok[0];
}

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
  // Minha carteira (src/carteira.js): pessoais, leem /api/carteira uma vez só para todos; aparecem para quem importou
  // os extratos (a página esconde enquanto a carteira estiver vazia). Fora do padrão: a pessoa fixa pelo alfinete.
  { id: "carteira-meta", titulo: "Minha meta", tamanho: 2, secao: "investimentos", pessoal: true },
  { id: "carteira-patrimonio", titulo: "Patrimônio", tamanho: 1, secao: "investimentos", pessoal: true },
  { id: "carteira-proventos-mes", titulo: "Proventos do mês", tamanho: 1, secao: "investimentos", pessoal: true },
  { id: "carteira-pagamentos", titulo: "Próximos pagamentos", tamanho: 1, secao: "investimentos", pessoal: true },
  { id: "carteira-agenda", titulo: "Agenda da carteira", tamanho: 1, secao: "investimentos", pessoal: true },
  { id: "carteira-rentabilidade", titulo: "Rentabilidade", tamanho: 1, secao: "investimentos", pessoal: true },
  { id: "carteira-alertas", titulo: "Alertas da carteira", tamanho: 1, secao: "investimentos", pessoal: true },
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
export const padraoDe = (secoes) => PADRAO.map((id) => POR_ID.get(id)).filter((w) => liberada(secoes, w.secao)).map((w) => ({ id: w.id, formato: formatosDe(w.id)[0] }));

// Confere o corpo de um PUT. Devolve { widgets } ou { erro }.
export function validarPainel(b, secoes) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return { erro: "corpo" };
  const lista = b.widgets;
  if (!Array.isArray(lista)) return { erro: "widgets" };
  if (lista.length > MAX_WIDGETS) return { erro: `O painel guarda até ${MAX_WIDGETS} widgets.` };
  const vistos = new Set(), widgets = [];
  for (const w of lista) {
    if (!w || typeof w !== "object") return { erro: "widget" };
    const id = typeof w.id === "string" ? w.id : "";
    const def = POR_ID.get(id);
    if (!def) return { erro: `Widget desconhecido: ${String(w.id).slice(0, 40)}` };
    if (!liberada(secoes, def.secao)) return { erro: `Widget de seção não liberada: ${id}` };
    let formato;
    if (w.formato !== undefined) {
      if (!formatosDe(id).includes(w.formato)) return { erro: `Formato inválido em ${id}: use ${formatosDe(id).join(", ")}.` };
      formato = w.formato;
    } else if (w.tamanho === 1 || w.tamanho === 2) formato = migrarFormato(id, w);
    else return { erro: `Formato inválido em ${id}: use ${formatosDe(id).join(", ")}.` };
    if (vistos.has(id)) return { erro: `${id} aparece duas vezes.` };
    vistos.add(id);
    widgets.push({ id, formato });
  }
  return { widgets };
}

// Resposta do GET (e do PUT): a grade da pessoa já filtrada pelas seções de hoje e o catálogo que ela pode usar.
// Um widget salvo de seção que a pessoa perdeu some da resposta e volta sozinho se a seção for liberada de novo.
export function respostaPainel(salvo, secoes) {
  const ok = (w) => w && POR_ID.has(w.id) && liberada(secoes, POR_ID.get(w.id).secao);
  const vistos = new Set();
  const widgets = salvo && Array.isArray(salvo.widgets)
    ? salvo.widgets.filter((w) => ok(w) && !vistos.has(w.id) && vistos.add(w.id)).map((w) => ({ id: w.id, formato: migrarFormato(w.id, w) }))
    : padraoDe(secoes);
  return {
    widgets,
    padrao: !salvo,
    atualizado: (salvo && salvo.atualizado) || null,
    catalogo: catalogoDe(secoes).map(({ id, titulo, secao, pessoal }) => ({ id, titulo, formatos: formatosDe(id), secao, ...(pessoal ? { pessoal: true } : {}) })),
  };
}
