// Só para `wrangler dev` nos testes, nunca para deploy: o mesmo Worker com o fetch trocado.
// O reddit.com responde o Atom de test/fixtures-reddit.mjs e conta os pedidos; o resto responde 503 (sem rede de verdade).
// GET /__falso devolve os pedidos que chegaram ao "Reddit". Uso: npx wrangler dev test/dev-falso.js --local --test-scheduled
import worker from "../src/index.js";
import { atomReddit } from "./fixtures-reddit.mjs";
export { Espelho } from "../src/espelho.js";

const pedidos = [];
const original = globalThis.fetch;
globalThis.fetch = async (url, op) => {
  const u = String(url && url.url ? url.url : url);
  let host = "";
  try { host = new URL(u).hostname; } catch {}
  if (/(^|\.)reddit\.com$/.test(host)) {
    pedidos.push({ url: u, ua: op && op.headers ? op.headers["user-agent"] : "", em: new Date().toISOString() });
    return new Response(atomReddit(), { status: 200, headers: { "content-type": "application/atom+xml" } });
  }
  if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)) return original(url, op);
  return new Response("sem rede no teste", { status: 503 });
};

export default {
  fetch(request, env, ctx) {
    if (new URL(request.url).pathname === "/__falso") return Response.json({ pedidos });
    return worker.fetch(request, env, ctx);
  },
  scheduled: (e, env, ctx) => worker.scheduled(e, env, ctx),
};
