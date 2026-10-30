// Confere o token que o Cloudflare Access põe em cada requisição (cabeçalho Cf-Access-Jwt-Assertion).
// Sem ACCESS_TEAM_DOMAIN e ACCESS_AUD configurados, ninguém entra: o site falha fechado.

let chaves = null;
let chavesEm = 0;

function b64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function buscarChaves(equipe) {
  if (chaves && Date.now() - chavesEm < 3600_000) return chaves;
  const r = await fetch(`https://${equipe}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error("certs " + r.status);
  const { keys } = await r.json();
  chaves = keys;
  chavesEm = Date.now();
  return keys;
}

function dominioEquipe(env) {
  let d = (env.ACCESS_TEAM_DOMAIN || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (d && !d.includes(".")) d += ".cloudflareaccess.com";
  return d;
}

export function accessConfigurado(env) {
  return !!(dominioEquipe(env) && (env.ACCESS_AUD || "").trim());
}

// Devolve o e-mail de quem fez login, ou null.
export async function emailDoAccess(request, env) {
  if (env.DEV_EMAIL) return env.DEV_EMAIL.toLowerCase(); // só no wrangler dev, via .dev.vars
  const equipe = dominioEquipe(env);
  const aud = (env.ACCESS_AUD || "").trim();
  if (!equipe || !aud) return null;
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  let cab, corpo;
  try {
    cab = JSON.parse(new TextDecoder().decode(b64url(partes[0])));
    corpo = JSON.parse(new TextDecoder().decode(b64url(partes[1])));
  } catch {
    return null;
  }
  if (cab.alg !== "RS256") return null;
  const agora = Math.floor(Date.now() / 1000);
  if (!corpo.exp || corpo.exp < agora) return null;
  if (corpo.nbf && corpo.nbf > agora + 60) return null;
  const auds = Array.isArray(corpo.aud) ? corpo.aud : [corpo.aud];
  if (!auds.includes(aud)) return null;
  if (corpo.iss && corpo.iss !== `https://${equipe}`) return null;

  let keys;
  try { keys = await buscarChaves(equipe); } catch { return null; }
  let jwk = keys.find((k) => k.kid === cab.kid);
  if (!jwk) {
    chaves = null; // a chave pode ter girado
    try { keys = await buscarChaves(equipe); } catch { return null; }
    jwk = keys.find((k) => k.kid === cab.kid);
    if (!jwk) return null;
  }
  const chave = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", chave, b64url(partes[2]), new TextEncoder().encode(partes[0] + "." + partes[1]));
  if (!ok || !corpo.email) return null;
  return String(corpo.email).toLowerCase();
}
