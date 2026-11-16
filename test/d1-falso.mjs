// D1 de mentira para os testes: a mesma API que o Worker usa (prepare, bind, first, all, run, batch) em cima do
// SQLite do próprio Node (node:sqlite), com o schema.sql do repositório.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

export function d1Falso({ schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8") } = {}) {
  const db = new DatabaseSync(":memory:");
  if (schema) db.exec(schema);
  const log = [];
  // O D1 de verdade recusa SELECT composto com mais de 5 termos ("too many terms in compound SELECT"); o SQLite do
  // Node aceita 500. Conta os UNION, EXCEPT e INTERSECT fora de parênteses e de texto entre aspas, e recusa igual.
  const conferirComposto = (sql) => {
    let nivel = 0, termos = 1, i = 0;
    while (i < sql.length) {
      const ch = sql[i];
      if (ch === "'" || ch === '"') { const f = sql.indexOf(ch, i + 1); i = f < 0 ? sql.length : f + 1; continue; }
      if (ch === "(") nivel++; else if (ch === ")") nivel--;
      else if (nivel === 0 && /^(UNION|EXCEPT|INTERSECT)\b/i.test(sql.slice(i, i + 10)) && (i === 0 || /\W/.test(sql[i - 1]))) termos++;
      i++;
    }
    if (termos > 5) throw new Error("too many terms in compound SELECT: SQLITE_ERROR");
  };
  const stmt = (sql, args = []) => ({
    sql, args,
    bind: (...a) => stmt(sql, a),
    first() { log.push(sql); return Promise.resolve(db.prepare(sql).get(...args) ?? null); },
    all() { log.push(sql); return Promise.resolve({ results: db.prepare(sql).all(...args) }); },
    run() { log.push(sql); const r = db.prepare(sql).run(...args); return Promise.resolve({ meta: { changes: Number(r.changes) } }); },
  });
  return {
    db, log,
    prepare: (sql) => { conferirComposto(sql); return stmt(sql); },
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
