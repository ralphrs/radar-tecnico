// Espelho de leitura em São Paulo.
//
// O D1 fica no leste dos EUA (não há D1 na América do Sul). Para a página não atravessar o continente a cada
// leitura, guardamos uma cópia do que ela lê num Durable Object com SQLite, criado com locationHint "sam".
// O D1 continua sendo a fonte da verdade: coletas, crons, admin e curadorias gravam só nele, e o cron copia
// as mudanças para cá a cada minuto. Se o espelho falhar, demorar ou ainda estiver vazio, a leitura vai ao D1.
//
// O que fica aqui:
// - docs: as collections que a página lê (itens, destaques e meta) e _sistema;
// - usuarios, grupos e usuario_grupo, inteiras, para conferir convite e seções;
// - estado: última sincronia, duração, linhas, erro e as últimas medições de tempo.
// favs/, listas/ e o resto do D1 não vêm para cá.

import { DurableObject } from "cloudflare:workers";
import { calcularSecoes } from "./grupos.js";

export const COLECOES_ESPELHO = [
  "items", "destaques", "items-politica", "destaques-politica", "items-esportes", "destaques-esportes",
  "items-negocios", "destaques-negocios", "items-investimentos", "destaques-investimentos", "meta", "_sistema",
];

const LOTE = 90;              // ids por consulta ao D1, como na limpeza (coleta.js)
const LOTES_POR_IDA = 8;      // consultas por batch do D1
const ORCAMENTO_MS = 25_000;  // a carga para aqui e continua na próxima rodada
const TIMEOUT_MS = 2_000;     // leitura no espelho que passar disso vai ao D1
const MINIMO_PARA_TRAVA = 20; // abaixo disso a trava dos 50% não vale (senão um espelho quase vazio nunca encolhe)

// Marca de versão de cada linha, calculada igual dos dois lados. Só o `atualizado` não basta: quem grava
// com ON CONFLICT DO UPDATE sem mexer nele (meta/status das curadorias, por exemplo) passaria despercebido.
// coletado e o tamanho do texto pegam esses casos. Nulo vira string vazia.
const MARCA_SQL = "coalesce(atualizado, '') || '|' || coalesce(coletado, '') || '|' || length(data)";

export class Espelho extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS docs (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, coletado TEXT NOT NULL DEFAULT '', atualizado TEXT NOT NULL DEFAULT '', PRIMARY KEY (collection, id));
      CREATE INDEX IF NOT EXISTS docs_col_coletado ON docs (collection, coletado DESC);
      CREATE INDEX IF NOT EXISTS docs_col_data ON docs (collection, json_extract(data, '$.data'));
      CREATE INDEX IF NOT EXISTS docs_col_publicado ON docs (collection, json_extract(data, '$.publicado'));
      CREATE TABLE IF NOT EXISTS usuarios (email TEXT PRIMARY KEY, nome TEXT NOT NULL DEFAULT '', ultimo_acesso TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS grupos (id TEXT PRIMARY KEY, nome TEXT NOT NULL, secoes TEXT NOT NULL DEFAULT '[]', padrao INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS usuario_grupo (email TEXT NOT NULL, grupo TEXT NOT NULL, PRIMARY KEY (email, grupo));
      CREATE TABLE IF NOT EXISTS estado (chave TEXT PRIMARY KEY, valor TEXT);
    `);
  }

  lerEstado() {
    const out = {};
    for (const r of this.sql.exec("SELECT chave, valor FROM estado")) {
      try { out[r.chave] = JSON.parse(r.valor); } catch { out[r.chave] = r.valor; }
    }
    return out;
  }
  gravarEstado(parcial) {
    for (const [k, v] of Object.entries(parcial)) {
      if (v === undefined) continue;
      if (v === null) this.sql.exec("DELETE FROM estado WHERE chave = ?", k);
      else this.sql.exec("INSERT INTO estado (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", k, JSON.stringify(v));
    }
  }
  // Pronto depois da primeira sincronia completa. Antes disso as leituras ficam no D1.
  pronto() {
    return !!this.sql.exec("SELECT 1 FROM estado WHERE chave = 'ultima_sincronia'").toArray().length;
  }

  // ---------- leituras (chamadas pelo Worker a cada requisição que não está em cache) ----------

  consultar(sql, args) {
    if (typeof sql !== "string" || !sql.startsWith("SELECT id, data FROM docs") || sql.includes(";")) throw new Error("consulta recusada");
    if (!this.pronto()) return { pronto: false };
    return { pronto: true, linhas: this.sql.exec(sql, ...(args || [])).toArray() };
  }

  doc(c, id) {
    if (!this.pronto()) return { pronto: false };
    const r = this.sql.exec("SELECT id, data FROM docs WHERE collection = ? AND id = ?", c, id).toArray();
    return { pronto: true, linha: r[0] || null };
  }

  convidado(email) {
    if (!this.pronto()) return { pronto: false };
    const u = this.sql.exec("SELECT email, nome, ultimo_acesso FROM usuarios WHERE email = ?", email).toArray()[0] || null;
    const grupos = this.sql.exec("SELECT id, secoes, padrao FROM grupos").toArray();
    const meus = grupos.length ? this.sql.exec("SELECT grupo FROM usuario_grupo WHERE email = ?", email).toArray().map((m) => m.grupo) : [];
    return { pronto: true, usuario: u, secoes: calcularSecoes(grupos, meus) };
  }

  // ---------- sincronia (chamada só pelo sincronizarEspelho, abaixo) ----------

  // lista: [[collection, id, marca], ...] vinda do D1.
  comparar(lista) {
    const meu = new Map();
    for (const r of this.sql.exec(`SELECT collection, id, ${MARCA_SQL} AS marca FROM docs`)) meu.set(r.collection + "\u0000" + r.id, r.marca);
    const total = meu.size;
    const faltam = [];
    for (const [c, id, marca] of lista) {
      const k = c + "\u0000" + id;
      if (meu.get(k) !== marca) faltam.push({ collection: c, id });
      meu.delete(k);
    }
    const sobram = [...meu.keys()].map((k) => { const [collection, id] = k.split("\u0000"); return { collection, id }; });
    return { faltam, sobram, total };
  }

  aplicar(docs) {
    let n = 0;
    this.ctx.storage.transactionSync(() => {
      for (const d of docs) {
        this.sql.exec(
          "INSERT INTO docs (collection, id, data, coletado, atualizado) VALUES (?, ?, ?, ?, ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, coletado = excluded.coletado, atualizado = excluded.atualizado",
          d.collection, d.id, d.data, d.coletado ?? "", d.atualizado ?? ""
        );
        n++;
      }
    });
    return n;
  }

  remover(chaves) {
    this.ctx.storage.transactionSync(() => {
      for (const k of chaves) this.sql.exec("DELETE FROM docs WHERE collection = ? AND id = ?", k.collection, k.id);
    });
    return chaves.length;
  }

  // Troca usuarios, grupos e usuario_grupo pelas cópias do D1 e grava o estado, numa ida só.
  // Se as tabelas não mudaram desde a última vez (mesma assinatura), não reescreve nada.
  concluir({ tabelas, assinatura, estado }) {
    let trocou = false;
    this.ctx.storage.transactionSync(() => {
      if (tabelas && assinatura !== this.lerEstado().assinatura_pessoas) {
        this.sql.exec("DELETE FROM usuarios");
        this.sql.exec("DELETE FROM grupos");
        this.sql.exec("DELETE FROM usuario_grupo");
        for (const u of tabelas.usuarios) this.sql.exec("INSERT INTO usuarios (email, nome, ultimo_acesso) VALUES (?, ?, ?)", u.email, u.nome ?? "", u.ultimo_acesso ?? "");
        for (const g of tabelas.grupos) this.sql.exec("INSERT INTO grupos (id, nome, secoes, padrao) VALUES (?, ?, ?, ?)", g.id, g.nome ?? "", g.secoes ?? "[]", g.padrao ? 1 : 0);
        for (const m of tabelas.usuario_grupo) this.sql.exec("INSERT OR IGNORE INTO usuario_grupo (email, grupo) VALUES (?, ?)", m.email, m.grupo);
        this.gravarEstado({ assinatura_pessoas: assinatura });
        trocou = true;
      }
      if (estado) this.gravarEstado(estado);
    });
    return { trocou };
  }

  estado() {
    const e = this.lerEstado();
    const n = this.sql.exec("SELECT count(*) AS n FROM docs").one().n;
    const porColecao = this.sql.exec("SELECT collection, count(*) AS n FROM docs GROUP BY collection ORDER BY n DESC").toArray();
    const pessoas = this.sql.exec("SELECT (SELECT count(*) FROM usuarios) AS usuarios, (SELECT count(*) FROM grupos) AS grupos").one();
    delete e.assinatura_pessoas;
    return { ...e, pronto: !!e.ultima_sincronia, docs: n, porColecao, ...pessoas };
  }

  // Guarda as duas últimas medições de tempo feitas pelo admin (espelho contra D1).
  medir(m) {
    const ant = this.lerEstado().medicoes || [];
    this.gravarEstado({ medicoes: [m, ...ant].slice(0, 2) });
  }

  // Esvazia o espelho. A próxima sincronia recarrega tudo do D1; até lá as leituras vão ao D1.
  zerar() {
    this.ctx.storage.transactionSync(() => {
      for (const t of ["docs", "usuarios", "grupos", "usuario_grupo", "estado"]) this.sql.exec(`DELETE FROM ${t}`);
    });
    return { ok: true };
  }
}

// ---------- lado do Worker ----------

export function stubEspelho(env) {
  return env.ESPELHO.get(env.ESPELHO.idFromName("lookout"), { locationHint: "sam" });
}

export const espelhoLigado = (env) => !!env.ESPELHO && String(env.ESPELHO_ATIVO ?? "1") !== "0";

// Chama o espelho com limite de 2 s. Devolve o resultado, ou null quando é para ler do D1 (desligado, vazio,
// lento ou com erro). Loga o tempo para comparar com o D1.
export async function doEspelho(env, rotulo, chamar) {
  if (!espelhoLigado(env)) return null;
  const t0 = Date.now();
  let timer;
  try {
    const r = await Promise.race([
      chamar(stubEspelho(env)),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("passou de " + TIMEOUT_MS + " ms")), TIMEOUT_MS); }),
    ]);
    if (!r || !r.pronto) { console.log(JSON.stringify({ leitura: "espelho", rotulo, ms: Date.now() - t0, pronto: false })); return null; }
    console.log(JSON.stringify({ leitura: "espelho", rotulo, ms: Date.now() - t0 }));
    return r;
  } catch (e) {
    console.error(JSON.stringify({ leitura: "espelho", rotulo, ms: Date.now() - t0, erro: String(e && e.message || e) }));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Convidado e seções de uma vez. null quando é para ler do D1.
export async function convidadoNoEspelho(env, email) {
  const r = await doEspelho(env, "convidado", (s) => s.convidado(email));
  return r ? { usuario: r.usuario, secoes: r.secoes } : null;
}

// Assinatura curta das três tabelas de pessoas (FNV-1a), para não reescrever no espelho o que não mudou.
function assinar(txt) {
  let h = 0x811c9dc5;
  for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return txt.length.toString(36) + "-" + (h >>> 0).toString(36);
}

async function lerPessoas(env) {
  const [u, g, m] = await env.DB.batch([
    env.DB.prepare("SELECT email, nome, ultimo_acesso FROM usuarios ORDER BY email"),
    env.DB.prepare("SELECT id, nome, secoes, padrao FROM grupos ORDER BY id"),
    env.DB.prepare("SELECT email, grupo FROM usuario_grupo ORDER BY email, grupo"),
  ]);
  const tabelas = { usuarios: u.results, grupos: g.results, usuario_grupo: m.results };
  return { tabelas, assinatura: assinar(JSON.stringify(tabelas)) };
}

// Copia do D1 para o espelho o que mudou. Chamada no fim de cada cron, depois do botão de atualizar o mercado
// e das rotas do admin que mexem em convidados e grupos (essas só com soPessoas, que pula os docs).
// Nunca lança: erro vai para estado.erro e para o log.
export async function sincronizarEspelho(env, { soPessoas = false } = {}) {
  if (!env.ESPELHO) return { ok: false, erro: "sem binding ESPELHO" };
  const t0 = Date.now();
  const stub = stubEspelho(env);
  const res = { ok: true, aplicados: 0, removidos: 0, pendentes: 0, pessoas: false };
  try {
    if (!soPessoas) {
      // 1. O que o D1 tem, só chave e marca
      const marcas = COLECOES_ESPELHO.map((_, k) => `?${k + 1}`).join(",");
      const { results } = await env.DB.prepare(`SELECT collection, id, ${MARCA_SQL} AS marca FROM docs WHERE collection IN (${marcas})`).bind(...COLECOES_ESPELHO).all();
      if (!results.length) throw new Error("o D1 devolveu a lista vazia; nada foi apagado");
      const { faltam, sobram, total } = await stub.comparar(results.map((r) => [r.collection, r.id, r.marca]));
      if (total >= MINIMO_PARA_TRAVA && sobram.length > total / 2)
        throw new Error(`a sincronia apagaria ${sobram.length} de ${total} docs do espelho; parei por segurança`);

      // 2. Busca o que falta em lotes de 90 por collection e grava no espelho, até o orçamento de tempo
      const porColecao = new Map();
      for (const f of faltam) { if (!porColecao.has(f.collection)) porColecao.set(f.collection, []); porColecao.get(f.collection).push(f.id); }
      const lotes = [];
      for (const [c, ids] of porColecao) for (let k = 0; k < ids.length; k += LOTE) lotes.push([c, ids.slice(k, k + LOTE)]);
      let feitos = 0;
      for (let k = 0; k < lotes.length; k += LOTES_POR_IDA) {
        if (Date.now() - t0 > ORCAMENTO_MS) break;
        const ida = lotes.slice(k, k + LOTES_POR_IDA);
        const respostas = await env.DB.batch(ida.map(([c, ids]) =>
          env.DB.prepare(`SELECT collection, id, data, coletado, atualizado FROM docs WHERE collection = ?1 AND id IN (${ids.map((_, j) => `?${j + 2}`).join(",")})`).bind(c, ...ids)));
        const docs = respostas.flatMap((r) => r.results);
        if (docs.length) res.aplicados += await stub.aplicar(docs);
        feitos += ida.reduce((s, [, ids]) => s + ids.length, 0);
      }
      res.pendentes = faltam.length - feitos;
      if (sobram.length) {
        for (let k = 0; k < sobram.length; k += 500) res.removidos += await stub.remover(sobram.slice(k, k + 500));
      }
      res.linhas = results.length;
    }

    // 3. Pessoas e grupos inteiros; se a leitura falhar, o espelho fica com a cópia anterior
    let pessoas = null;
    try { pessoas = await lerPessoas(env); } catch (e) { res.erroPessoas = String(e.message || e); }

    // 4. Estado. ultima_sincronia só anda quando a carga dos docs terminou; enquanto houver pendentes,
    // a primeira carga não conta como pronta e as leituras seguem no D1.
    const agora = new Date().toISOString();
    const estado = { duracao_ms: Date.now() - t0, erro: res.erroPessoas ? "pessoas: " + res.erroPessoas : null, ultima_tentativa: agora };
    if (!soPessoas) {
      Object.assign(estado, { linhas: res.linhas, pendentes: res.pendentes, ultimos: { aplicados: res.aplicados, removidos: res.removidos } });
      if (!res.pendentes && pessoas) estado.ultima_sincronia = agora;
    }
    const c = await stub.concluir({ tabelas: pessoas?.tabelas, assinatura: pessoas?.assinatura, estado });
    res.pessoas = c.trocou;
    res.duracao_ms = estado.duracao_ms;
    if (!soPessoas && (res.aplicados || res.removidos || res.pendentes)) console.log("espelho", JSON.stringify(res));
    return res;
  } catch (e) {
    const erro = String(e && e.message || e).slice(0, 300);
    console.error("espelho", erro);
    try { await stub.concluir({ estado: { erro, ultima_tentativa: new Date().toISOString(), duracao_ms: Date.now() - t0 } }); } catch (e2) {}
    return { ...res, ok: false, erro };
  }
}

// /api/admin/espelho
// GET: estado do espelho e uma medição na hora (a mesma leitura no espelho e no D1, a partir do Worker que atendeu o admin).
// POST { zerar?: true }: sincroniza agora; com zerar, esvazia antes e recarrega do zero.
export async function adminEspelho(request, env) {
  const resposta = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  if (!env.ESPELHO) return resposta({ erro: "O binding ESPELHO não está configurado." }, 500);
  const stub = stubEspelho(env);
  if (request.method === "POST") {
    let b = {};
    try { b = await request.json(); } catch {}
    if (b.zerar) await stub.zerar();
    const r = await sincronizarEspelho(env);
    return resposta({ ok: r.ok, sincronia: r, estado: await stub.estado(), ativo: espelhoLigado(env) });
  }
  if (request.method !== "GET") return resposta({ erro: "metodo" }, 405);
  const sql = "SELECT id, data FROM docs WHERE collection = ? ORDER BY coletado DESC LIMIT ?";
  const args = ["items", 20];
  const medir = async (fn) => { const t = Date.now(); try { await fn(); return Date.now() - t; } catch (e) { return null; } };
  const espelhoMs = await medir(() => stub.consultar(sql, args));
  const d1Ms = await medir(() => env.DB.prepare(sql).bind(...args).all());
  const medicao = { quando: new Date().toISOString(), espelho: espelhoMs, d1: d1Ms, colo: request.cf?.colo || "" };
  console.log(JSON.stringify({ medicao }));
  try { await stub.medir(medicao); } catch (e) {}
  return resposta({ estado: await stub.estado(), ativo: espelhoLigado(env), medicao });
}
