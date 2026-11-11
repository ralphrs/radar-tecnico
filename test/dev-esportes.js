// Só para `wrangler dev` nos testes de Esportes, nunca para deploy: o mesmo Worker com o fetch trocado.
// ESPN e ge respondem os exemplos de test/fixtures-esportes.mjs (o Gauchão dá 400 na ESPN e vem do ge; ATP e WTA, os de
// tênis); o resto, 503.
// O scheduled roda com a hora puxada para o minuto terminado em 4, quando o cron confere as competições.
// GET /__falso devolve as URLs pedidas. Uso: npx wrangler dev test/dev-esportes.js --local --test-scheduled
// Escudos (11/11): o endpoint de times responde test/fixtures-esportes.mjs (timesEspn) e GET /__escudo/<id>.svg devolve
// um SVG de teste (um círculo com a sigla do time) só para ver o layout nos prints, já que o ambiente não carrega imagem
// de fora: o script dos prints desvia para cá os pedidos a https://a.espncdn.com/i/teamlogos/. Não é o escudo de verdade.
import worker from "../src/index.js";
import { scoreboardBra, scoreboardLib, standingsBra, standingsLib, scheduleInter, htmlGe, scoreboardAtp, scoreboardAtpDia, scoreboardWta, timesEspn } from "./fixtures-esportes.mjs";
export { Espelho } from "../src/espelho.js";

const pedidos = [];
const original = globalThis.fetch;
globalThis.fetch = async (url, op) => {
  const u = String(url && url.url ? url.url : url);
  if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)) return original(url, op);
  const js = (o) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
  if (/espn\.com|globo\.com/.test(u)) pedidos.push(u);
  if (u.includes("ge.globo.com/futebol/campeonato-gaucho")) return new Response(htmlGe(), { status: 200, headers: { "content-type": "text/html" } });
  if (u.includes("tennis/atp/scoreboard")) return js(u.includes("dates=") ? scoreboardAtpDia() : scoreboardAtp());
  if (u.includes("tennis/wta/scoreboard")) return js(u.includes("dates=") ? { events: [] } : scoreboardWta());
  const m = /sports\/soccer\/([a-z0-9._]+)\//.exec(u);
  const liga = m && m[1];
  if (liga === "bra.camp.gaucho") return new Response('{"code":400}', { status: 400 });
  if (u.includes("/teams/1936/schedule")) return js(scheduleInter());
  if (liga && u.endsWith("/teams")) return js(timesEspn(liga));
  if (liga && u.includes("/scoreboard")) return js(liga === "bra.1" ? scoreboardBra() : liga === "conmebol.libertadores" ? scoreboardLib() : { events: [] });
  if (liga && u.includes("/standings")) return js(liga === "bra.1" ? standingsBra() : liga === "conmebol.libertadores" ? standingsLib() : { children: [] });
  return new Response("sem rede no teste", { status: 503 });
};

// SVG de teste no lugar do escudo: círculo com a sigla (ou o id), cor tirada do id. Só para o layout dos prints.
const SIGLAS = { 1936: "INT", 6273: "GRE", 2029: "PAL", 819: "FLA", 2674: "SAN", 9967: "BAH", 7632: "CAM", 6154: "AME", 110: "INT", 103: "MIL", 227: "AME", 83: "BAR", 20232: "MIA",
  6086: "BOT", 6272: "FOR", 2022: "CRU", 2026: "SAO", 874: "COR", 3454: "VAS", 3445: "FLU", 3457: "VIT", 6079: "RBB", 6270: "JUV", 7631: "SPT", 9969: "CEA", 1929: "BEN", 437: "POR", 160: "PSG", 167: "LYO" };
function svgEscudo(id) {
  const sig = String(SIGLAS[id] || id).slice(0, 3).replace(/[^A-Z0-9]/gi, "");
  let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="M20 2 35 7v12c0 9-6 16-15 19C11 35 5 28 5 19V7z" fill="hsl(${h} 60% 42%)" stroke="#fff" stroke-width="2"/><text x="20" y="24" font-family="sans-serif" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">${sig}</text></svg>`;
}

export default {
  fetch(request, env, ctx) {
    const caminho = new URL(request.url).pathname;
    const esc = /^\/__escudo\/([A-Za-z0-9-]{1,20})\.svg$/.exec(caminho);
    if (esc) return new Response(svgEscudo(esc[1]), { headers: { "content-type": "image/svg+xml", "cache-control": "no-store" } });
    if (caminho === "/__falso") return Response.json({ pedidos });
    return worker.fetch(request, env, ctx);
  },
  scheduled(e, env, ctx) {
    const d = new Date(e.scheduledTime || Date.now());
    d.setUTCMinutes(d.getUTCMinutes() - (d.getUTCMinutes() % 10) + 4);
    return worker.scheduled({ ...e, scheduledTime: d.getTime() }, env, ctx);
  },
};
