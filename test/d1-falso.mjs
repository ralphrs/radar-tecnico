// D1 de mentira para os testes: a mesma API que o Worker usa (prepare, bind, first, all, run, batch) em cima do
// SQLite do próprio Node (node:sqlite), com o schema.sql do repositório.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

export function d1Falso({ schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8") } = {}) {
  const db = new DatabaseSync(":memory:");
  if (schema) db.exec(schema);
  const log = [];
  const stmt = (sql, args = []) => ({
    sql, args,
    bind: (...a) => stmt(sql, a),
    first() { log.push(sql); return Promise.resolve(db.prepare(sql).get(...args) ?? null); },
    all() { log.push(sql); return Promise.resolve({ results: db.prepare(sql).all(...args) }); },
    run() { log.push(sql); const r = db.prepare(sql).run(...args); return Promise.resolve({ meta: { changes: Number(r.changes) } }); },
  });
  return {
    db, log,
    prepare: (sql) => stmt(sql),
    async batch(lista) {
      db.exec("BEGIN");
      try { const out = []; for (const s of lista) out.push(await s.run()); db.exec("COMMIT"); return out; }
      catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}

// Espelho de mentira: só anota o que o write-through mandaria.
export function espelhoFalso() {
  const gravados = [], removidos = [];
  return {
    gravados, removidos,
    gravarNoEspelho: (env, docs) => gravados.push(...docs),
    removerDoEspelho: (env, chaves) => removidos.push(...chaves),
    lerLinhas: async (env, sql, args) => (await env.DB.prepare(sql).bind(...args).all()).results,
    lerLinha: async (env, c, id) => env.DB.prepare("SELECT id, data FROM docs WHERE collection = ? AND id = ?").bind(c, id).first(),
  };
}
