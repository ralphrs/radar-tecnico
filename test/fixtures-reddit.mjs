// Atom do Reddit escrito à mão no formato de /r/<sub>/top/.rss?t=day, o mesmo de /new/ (o proxy dos testes não chega ao reddit.com).
// Quatro posts: um com texto (e flair no título), um só com link externo, um fixado e uma imagem do próprio Reddit.
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// HTML do post como o Reddit monta (o Atom leva esse HTML escapado dentro de <content type="html">)
const rodape = (link, comentarios) => ` &#32; submitted by &#32; <a href="https://www.reddit.com/user/alguem"> /u/alguem </a> <br/> <span><a href="${link}">[link]</a></span> &#32; <span><a href="${comentarios}">[comments]</a></span>`;
const TEXTO_LONGO = "Estamos migrando o pipeline de dados para Unity Catalog e queremos saber como vocês lidam com permissões por schema. " .repeat(8);
export const POSTS = {
  texto: "https://www.reddit.com/r/databricks/comments/1abc01/p_unity_catalog_permissoes/",
  link: "https://www.reddit.com/r/databricks/comments/1abc02/databricks_lanca_algo/",
  fixado: "https://www.reddit.com/r/databricks/comments/1abc03/regras_do_sub/",
  imagem: "https://www.reddit.com/r/databricks/comments/1abc04/meu_setup/",
};
export const EXTERNO = "https://www.databricks.com/blog/anuncio?utm_source=reddit";
function entrada({ id, titulo, url, conteudo, data, extra = "" }) {
  return `<entry><author><name>/u/alguem</name><uri>https://www.reddit.com/user/alguem</uri></author>${extra}<category term="databricks" label="r/databricks"/><content type="html">${esc(conteudo)}</content><id>t3_${id}</id><link href="${url}" /><updated>${data}</updated><published>${data}</published><title>${titulo}</title></entry>`;
}
export function atomReddit(agora = new Date()) {
  const d = (min) => new Date(agora.getTime() - min * 60000).toISOString().replace(/\.\d+Z$/, "+00:00");
  return `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><category term="databricks" label="r/databricks"/><updated>${d(0)}</updated><icon>https://www.redditstatic.com/icon.png/</icon><id>/r/databricks/top/.rss?t=day</id><link rel="self" href="https://www.reddit.com/r/databricks/top/.rss?t=day" type="application/atom+xml" /><link rel="alternate" href="https://www.reddit.com/r/databricks/top/?t=day" type="text/html" /><subtitle>Comunidade</subtitle><title>top scoring links : databricks</title>`
    + entrada({ id: "1abc01", titulo: "[P] Unity Catalog: permissões por schema &amp; grupos", url: POSTS.texto, data: d(10),
      conteudo: `<!-- SC_OFF --><div class="md"><p>${TEXTO_LONGO}</p><p>Alguém usa &quot;grants&quot; por tabela?</p></div><!-- SC_ON -->` + rodape(POSTS.texto, POSTS.texto) })
    + entrada({ id: "1abc02", titulo: "Databricks lança algo novo", url: POSTS.link, data: d(20),
      conteudo: `<table> <tr><td> <a href="${POSTS.link}"> <img src="https://b.thumbs.redditmedia.com/x.jpg" alt="x" /> </a> </td><td>` + rodape(EXTERNO.replace(/&/g, "&amp;"), POSTS.link) + "</td></tr></table>" })
    + entrada({ id: "1abc03", titulo: "Regras do sub", url: POSTS.fixado, data: d(30), extra: "<stickied>true</stickied>",
      conteudo: `<!-- SC_OFF --><div class="md"><p>Leia antes de postar.</p></div><!-- SC_ON -->` + rodape(POSTS.fixado, POSTS.fixado) })
    + entrada({ id: "1abc04", titulo: "Meu setup", url: POSTS.imagem, data: d(40),
      conteudo: rodape("https://i.redd.it/abc123.jpeg", POSTS.imagem) })
    + `</feed>`;
}
