CREATE TABLE IF NOT EXISTS docs (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  coletado TEXT NOT NULL DEFAULT '',
  atualizado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (collection, id)
);
CREATE INDEX IF NOT EXISTS docs_col_coletado ON docs (collection, coletado DESC);
CREATE TABLE IF NOT EXISTS usuarios (
  email TEXT PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT '',
  criado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ultimo_acesso TEXT NOT NULL DEFAULT ''
);
