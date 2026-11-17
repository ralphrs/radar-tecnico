/* Notícias lidas (17/11): a regra da ordem num arquivo só, sem nada do navegador.
 *
 * A página carrega como script clássico (<script src="/lidas.js">) e usa window.Lidas; os testes em Node importam pelo
 * efeito (import "../public/lidas.js") e leem globalThis.Lidas, como public/radar-filtro.js.
 *
 * O que faz: ordena a lista do feed pela ordem escolhida (data, relevância, entrada) e põe as lidas depois de todas as
 * não lidas, sem mexer na ordem de cada bloco. O id da marca é o mesmo dos favoritos na conta: no Tech só o id do doc,
 * nas outras seções "<collection>:<id>" (a barra vira dois-pontos, como em data/users). Nos fóruns, "foruns-<seção>:<id>".
 */
(function (raiz) {
  "use strict";

  const ID_MAX = 200;
  const MODOS = ["data", "relevancia", "entrada"];

  /* Release futuro não passa na frente do que já saiu: ordena pela data de coleta até a data prevista chegar */
  const chave = (i, agora) => { const p = i.publicado || ""; return p && p <= agora ? p : (i.coletado || p); };
  const comparar = (a, b, agora) => String(chave(b, agora)).localeCompare(String(chave(a, agora)));

  /* A ordem escolhida, sem olhar as lidas. sort do JS é estável: empate fica como veio. */
  function ordenar(lista, modo, agora) {
    const t = agora || new Date().toISOString();
    const por = (a, b) => comparar(a, b, t);
    if (modo === "relevancia") return lista.slice().sort((a, b) => (Number(b.relevancia) || 0) - (Number(a.relevancia) || 0) || por(a, b));
    if (modo === "entrada") return lista.slice().sort((a, b) => String(b.coletado || "").localeCompare(String(a.coletado || "")) || por(a, b));
    return lista.slice().sort(por);
  }

  /* Divide mantendo a ordem de cada lado */
  function separar(lista, ehLida) {
    const naoLidas = [], lidas = [];
    for (const i of lista) (ehLida && ehLida(i) ? lidas : naoLidas).push(i);
    return { naoLidas, lidas };
  }

  /* A ordem escolhida com as lidas no fim. Sem ehLida, só a ordem. */
  function ordenarComLidas(lista, modo, ehLida, agora) {
    const o = ordenar(lista, modo, agora);
    if (!ehLida) return o;
    const { naoLidas, lidas } = separar(o, ehLida);
    return naoLidas.concat(lidas);
  }

  /* id da marca a partir da collection e do id do doc (o mesmo que os favoritos gravam na conta) */
  const idDe = (col, docId) => (col === "items" ? String(docId) : col + ":" + docId);
  const idOk = (id) => typeof id === "string" && id.length > 0 && id.length <= ID_MAX;

  raiz.Lidas = { ID_MAX, MODOS, chave, comparar, ordenar, separar, ordenarComLidas, idDe, idOk };
})(typeof globalThis !== "undefined" ? globalThis : this);
