// Cabeçalho de segurança das páginas HTML (11/11/2026). Toda resposta do Worker passa por comSeguranca (src/index.js);
// só as de text/html ganham o cabeçalho.
//
// Por enquanto só img-src: a página carrega imagem apenas daqui ('self'), de data: (a foto da conta pode vir assim do
// Access), da pasta de escudos da ESPN (https://a.espncdn.com/i/teamlogos/, Esportes, sempre por link; o caminho no
// CSP deixa de fora as fotos de atleta que a mesma origem serve em /i/headshots/) e da foto da conta Google no menu da
// conta (https://lh3.googleusercontent.com). Nenhuma outra origem e nada de "*". Foto de jogador, de técnico ou de
// qualquer pessoa em Esportes não entra: nem o CSP deixa, nem o código de Esportes monta <img> fora de
// Esportes.escudoOk. script-src e o resto ficam para a fase do SSR (ROADMAP.md).
// Landscape (12/11): https://avatars.githubusercontent.com/u/ é a marca de organização dona do repositório, sempre por
// link e só pelo id numérico (Landscape.marcaOk em public/landscape.js). Avatar de pessoa (dono User, autor de issue
// ou de comentário) o código não monta; o caminho /u/ no CSP deixa de fora o resto da origem.
export const CSP = "img-src 'self' data: https://a.espncdn.com/i/teamlogos/ https://lh3.googleusercontent.com https://avatars.githubusercontent.com/u/";

export function comSeguranca(r) {
  if (!r || !r.headers || !/text\/html/i.test(r.headers.get("content-type") || "")) return r;
  const n = new Response(r.body, r);
  n.headers.set("content-security-policy", CSP);
  return n;
}
