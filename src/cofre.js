// Cofre da carteira: AES-GCM de 256 bits com a chave do secret CARTEIRA_KEY (base64 de 32 bytes).
//
// O que vai para o banco é { iv, dados, z } no campo `data`: iv aleatório de 12 bytes por documento, dados em base64
// (texto cifrado + tag do GCM) e z: 1 quando o JSON foi comprimido com gzip antes de cifrar (o extrato de alguns anos
// passa de 200 KB em JSON e cai para uns 30 KB comprimido). `atualizado` fica fora, na coluna de sempre.
//
// Sem o secret, chaveDe devolve null e a rota responde 503 "carteira desligada". A chave importada fica guardada no
// isolate (uma importação por valor do secret). Só WebCrypto: roda igual no Worker e no Node (crypto.webcrypto).
// Não importa nada do Worker, para o teste rodar no Node.

const sutil = () => globalThis.crypto.subtle;

function deB64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function paraB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

let cache = { txt: null, chave: null };
export async function chaveDe(env) {
  const txt = String((env && env.CARTEIRA_KEY) || "").trim();
  if (!txt) return null;
  if (cache.txt === txt) return cache.chave;
  let bruta;
  try { bruta = deB64(txt); } catch { throw new Error("CARTEIRA_KEY não é base64"); }
  if (bruta.length !== 32) throw new Error("CARTEIRA_KEY precisa ter 32 bytes (openssl rand -base64 32)");
  const chave = await sutil().importKey("raw", bruta, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  cache = { txt, chave };
  return chave;
}
export const cofreLigado = (env) => !!String((env && env.CARTEIRA_KEY) || "").trim();

async function passar(bytes, fluxo) {
  const s = new Blob([bytes]).stream().pipeThrough(fluxo);
  return new Uint8Array(await new Response(s).arrayBuffer());
}

// Objeto -> texto para a coluna data.
export async function cifrar(env, obj) {
  const chave = await chaveDe(env);
  if (!chave) throw new Error("carteira desligada");
  const claro = new TextEncoder().encode(JSON.stringify(obj));
  const z = typeof CompressionStream !== "undefined";
  const entrada = z ? await passar(claro, new CompressionStream("gzip")) : claro;
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const cifra = new Uint8Array(await sutil().encrypt({ name: "AES-GCM", iv }, chave, entrada));
  return JSON.stringify({ iv: paraB64(iv), dados: paraB64(cifra), ...(z ? { z: 1 } : {}) });
}

// Texto da coluna data -> objeto. Lança se a chave for outra ou o texto tiver sido mexido (a tag do GCM não bate).
export async function decifrar(env, txt) {
  const chave = await chaveDe(env);
  if (!chave) throw new Error("carteira desligada");
  const { iv, dados, z } = typeof txt === "string" ? JSON.parse(txt) : txt;
  if (!iv || !dados) throw new Error("documento da carteira sem iv ou dados");
  const claro = new Uint8Array(await sutil().decrypt({ name: "AES-GCM", iv: deB64(iv) }, chave, deB64(dados)));
  const bytes = z ? await passar(claro, new DecompressionStream("gzip")) : claro;
  return JSON.parse(new TextDecoder().decode(bytes));
}
