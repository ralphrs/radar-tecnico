import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import { cifrar, decifrar } from "../src/cofre.js";

const chave = () => Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString("base64");

test("cifra e decifra; IV diferente a cada chamada", async () => {
  const env = { CARTEIRA_KEY: chave() };
  const obj = { neg: [["2025-01-02", "C", "ABCD3", 100, 10, "XP", "i"]] };
  const a = await cifrar(env, obj), b = await cifrar(env, obj);
  assert.ok(!a.includes("ABCD3"));
  assert.notEqual(JSON.parse(a).iv, JSON.parse(b).iv);
  assert.deepEqual(await decifrar(env, a), obj);
});

test("chave errada falha; sem chave a carteira fica desligada", async () => {
  const txt = await cifrar({ CARTEIRA_KEY: chave() }, { x: 1 });
  await assert.rejects(decifrar({ CARTEIRA_KEY: chave() }, txt));
  await assert.rejects(cifrar({}, { x: 1 }), /desligada/);
  await assert.rejects(cifrar({ CARTEIRA_KEY: "curta" }, { x: 1 }));
});
