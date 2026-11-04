// Só para `wrangler dev` nos testes de Esportes, nunca para deploy: o mesmo Worker com o fetch trocado.
// ESPN e ge respondem os exemplos de test/fixtures-esportes.mjs (o Gauchão dá 400 na ESPN e vem do ge); o resto, 503.
// O scheduled roda com a hora puxada para o minuto terminado em 4, quando o cron confere as competições.
// GET /__falso devolve as URLs pedidas. Uso: npx wrangler dev test/dev-esportes.js --local --test-scheduled
import worker from "../src/index.js";
import { scoreboardBra, scoreboardLib, standingsBra, standingsLib, scheduleInter, htmlGe } from "./fixtures-esportes.mjs";
export { Espelho } from "../src/espelho.js";

const pedidos = [];
const original = globalThis.fetch;
globalThis.fetch = async (url, op) => {
  const u = String(url && url.url ? url.url : url);
  if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)) return original(url, op);
  const js = (o) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
  if (/espn\.com|globo\.com/.test(u)) pedidos.push(u);
  if (u.includes("ge.globo.com/futebol/campeonato-gaucho")) return new Response(htmlGe(), { status: 200, headers: { "content-type": "text/html" } });
  const m = /sports\/soccer\/([a-z0-9._]+)\//.exec(u);
  const liga = m && m[1];
  if (liga === "bra.camp.gaucho") return new Response('{"code":400}', { status: 400 });
  if (u.includes("/teams/1936/schedule")) return js(scheduleInter());
  if (liga && u.includes("/scoreboard")) return js(liga === "bra.1" ? scoreboardBra() : liga === "conmebol.libertadores" ? scoreboardLib() : { events: [] });
  if (liga && u.includes("/standings")) return js(liga === "bra.1" ? standingsBra() : liga === "conmebol.libertadores" ? standingsLib() : { children: [] });
  return new Response("sem rede no teste", { status: 503 });
};

export default {
  fetch(request, env, ctx) {
    if (new URL(request.url).pathname === "/__falso") return Response.json({ pedidos });
    return worker.fetch(request, env, ctx);
  },
  scheduled(e, env, ctx) {
    const d = new Date(e.scheduledTime || Date.now());
    d.setUTCMinutes(d.getUTCMinutes() - (d.getUTCMinutes() % 10) + 4);
    return worker.scheduled({ ...e, scheduledTime: d.getTime() }, env, ctx);
  },
};
