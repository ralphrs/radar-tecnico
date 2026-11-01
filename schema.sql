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

-- Coleta por RSS: o cron do Worker lê os feeds de src/feeds.js e guarda aqui o que é novo.
-- A tarefa de curadoria reserva um lote de candidatos "novo", escolhe e resume, e marca cada um como
-- "publicado" (virou item) ou "descartado" (com motivo). Só o que está em items-* aparece no site.
CREATE TABLE IF NOT EXISTS candidatos (
  id TEXT PRIMARY KEY,            -- "i" + 16 primeiros hex do SHA-256 da URL (o mesmo id dos itens)
  radar TEXT NOT NULL,            -- tech | politica | esportes
  url TEXT NOT NULL,
  titulo TEXT NOT NULL,
  fonte TEXT NOT NULL,
  pais TEXT NOT NULL DEFAULT '',
  publicado TEXT NOT NULL DEFAULT '',
  trecho TEXT NOT NULL DEFAULT '',
  feed TEXT NOT NULL,
  visto TEXT NOT NULL,            -- quando o Worker achou
  status TEXT NOT NULL DEFAULT 'novo', -- novo | publicado | descartado (lido = rodadas antigas)
  lote TEXT,                      -- rodada que reservou o candidato
  motivo TEXT                     -- motivo do descarte: repetido | promocional | fora-do-tema | antigo | raso
);
CREATE INDEX IF NOT EXISTS idx_candidatos_lote ON candidatos (lote);
CREATE INDEX IF NOT EXISTS idx_candidatos_radar ON candidatos (radar, status, visto);

CREATE TABLE IF NOT EXISTS feeds_estado (
  url TEXT PRIMARY KEY,
  radar TEXT NOT NULL,
  fonte TEXT NOT NULL,
  ultima_checagem TEXT NOT NULL DEFAULT '',
  ultimo_ok TEXT NOT NULL DEFAULT '',
  erro TEXT NOT NULL DEFAULT '',
  erros_seguidos INTEGER NOT NULL DEFAULT 0,
  itens_ultima INTEGER NOT NULL DEFAULT 0,
  novos_total INTEGER NOT NULL DEFAULT 0
);

-- Seções por grupo (src/grupos.js). Sem grupos, todo convidado vê tudo.
CREATE TABLE IF NOT EXISTS grupos (id TEXT PRIMARY KEY, nome TEXT NOT NULL, secoes TEXT NOT NULL DEFAULT '[]', padrao INTEGER NOT NULL DEFAULT 0, criado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS usuario_grupo (email TEXT NOT NULL, grupo TEXT NOT NULL, PRIMARY KEY (email, grupo));
