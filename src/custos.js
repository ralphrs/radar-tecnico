// Custos e consumo da infraestrutura, para o admin.
//
// Cloudflare: o uso real (requisições do Worker, linhas lidas e gravadas no D1, tamanho do banco) vem da API
// GraphQL de analytics, que pede um token. Configure no painel do Worker:
//   CF_API_TOKEN (secret): token com "Account Analytics: Read" e "D1: Read";
//   CF_ACCOUNT_ID (variável, opcional): se faltar, usamos a primeira conta que o token enxerga.
// Sem o token, mostramos só o que dá para medir daqui: tamanho aproximado dos dados e rodadas de curadoria.
//
// Os limites e preços abaixo são os publicados pela Cloudflare (Workers e D1, out/2026). Se mudarem, ajuste aqui.
//
// Espelho em São Paulo (Durable Object com SQLite, src/espelho.js): as linhas lidas e gravadas nele têm os mesmos
// valores do D1 (25 bi lidas e 50 mi gravadas por mês incluídas), mas numa cota separada, não somada à do D1.
// Além delas o DO cobra requisições (cada chamada RPC conta uma) e duração enquanto está ativo, em pago.espelho.
// Com o token, o card mostra as requisições do mês (durableObjectsInvocationsAdaptiveGroups) e o armazenamento
// (durableObjectsStorageGroups). As requisições saem filtradas pelo script "news" quando a API aceita a dimensão
// scriptName; se recusar, vem o total da conta (hoje o espelho é o único DO). O armazenamento é o da conta toda.

export const PLANOS = {
  gratis: { workersReqDia: 100_000, d1LidasDia: 5_000_000, d1GravadasDia: 100_000, d1Bytes: 5e9 },
  pago: {
    mensal: 5, workersReqMes: 10_000_000, porMilhaoReq: 0.3,
    d1LidasMes: 25e9, porMilhaoLidas: 0.001, d1GravadasMes: 50e6, porMilhaoGravadas: 1, d1Bytes: 5e9, porGBMes: 0.75,
    espelho: {
      reqMes: 1e6, porMilhaoReq: 0.15, duracaoGBsMes: 400_000, porMilhaoGBs: 12.5,
      lidasMes: 25e9, porMilhaoLidas: 0.001, gravadasMes: 50e6, porMilhaoGravadas: 1, bytes: 5e9, porGBMes: 0.2,
    },
  },
};

async function gql(env, conta, query, vars) {
  const r = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { authorization: "Bearer " + env.CF_API_TOKEN, "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { conta, ...vars } }),
    signal: AbortSignal.timeout(10000),
  });
  const j = await r.json();
  if (j.errors && j.errors.length) throw new Error(j.errors.map((e) => e.message).join("; "));
  return j.data.viewer.accounts[0] || {};
}
async function contaId(env) {
  if (env.CF_ACCOUNT_ID) return env.CF_ACCOUNT_ID;
  const r = await fetch("https://api.cloudflare.com/client/v4/accounts?per_page=1", { headers: { authorization: "Bearer " + env.CF_API_TOKEN }, signal: AbortSignal.timeout(8000) });
  const j = await r.json();
  if (!j.success || !j.result || !j.result.length) throw new Error("o token não enxerga nenhuma conta");
  return j.result[0].id;
}

// Cada consulta separada: se uma falhar (campo renomeado, permissão faltando), as outras continuam.
async function cloudflare(env) {
  const conta = await contaId(env);
  const hoje = new Date();
  const ini = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const fim = hoje.toISOString().slice(0, 10);
  const out = { inicio: ini, fim, erros: [] };
  const tenta = async (nome, fn) => { try { out[nome] = await fn(); } catch (e) { out.erros.push(nome + ": " + String(e.message || e).slice(0, 200)); } };
  await Promise.all([
    tenta("workers", async () => {
      const a = await gql(env, conta, `query($conta: String!, $ini: Date!, $fim: Date!) { viewer { accounts(filter: { accountTag: $conta }) {
        workersInvocationsAdaptive(limit: 2000, filter: { date_geq: $ini, date_leq: $fim }) { sum { requests errors subrequests } dimensions { date scriptName } } } } }`, { ini, fim });
      return (a.workersInvocationsAdaptive || []).map((x) => ({ dia: x.dimensions.date, script: x.dimensions.scriptName, req: x.sum.requests, erros: x.sum.errors, sub: x.sum.subrequests }));
    }),
    tenta("d1", async () => {
      const a = await gql(env, conta, `query($conta: String!, $ini: Date!, $fim: Date!) { viewer { accounts(filter: { accountTag: $conta }) {
        d1AnalyticsAdaptiveGroups(limit: 2000, filter: { date_geq: $ini, date_leq: $fim }) { sum { readQueries writeQueries rowsRead rowsWritten } dimensions { date databaseId } } } } }`, { ini, fim });
      return (a.d1AnalyticsAdaptiveGroups || []).map((x) => ({ dia: x.dimensions.date, db: x.dimensions.databaseId, lidas: x.sum.rowsRead, gravadas: x.sum.rowsWritten, consultas: x.sum.readQueries + x.sum.writeQueries }));
    }),
    tenta("espelho", async () => {
      const q = (comScript) => gql(env, conta, `query($conta: String!, $ini: Date!, $fim: Date!) { viewer { accounts(filter: { accountTag: $conta }) {
        durableObjectsInvocationsAdaptiveGroups(limit: 2000, filter: { date_geq: $ini, date_leq: $fim }) { sum { requests } dimensions { date${comScript ? " scriptName" : ""} } } } } }`, { ini, fim });
      let a, porScript = true;
      try { a = await q(true); } catch (e) { a = await q(false); porScript = false; }
      const linhas = (a.durableObjectsInvocationsAdaptiveGroups || []).filter((x) => !porScript || !x.dimensions.scriptName || x.dimensions.scriptName === (env.WORKER_NOME || "news"));
      const s = await gql(env, conta, `query($conta: String!, $ini: Date!, $fim: Date!) { viewer { accounts(filter: { accountTag: $conta }) {
        durableObjectsStorageGroups(limit: 100, filter: { date_geq: $ini, date_leq: $fim }, orderBy: [date_DESC]) { max { storedBytes } dimensions { date } } } } }`, { ini, fim });
      const st = s.durableObjectsStorageGroups || [];
      return {
        req: linhas.map((x) => ({ dia: x.dimensions.date, req: x.sum.requests })),
        bytes: st.length ? st[0].max.storedBytes : 0,
        porScript,
      };
    }),
    tenta("d1Tamanho", async () => {
      const a = await gql(env, conta, `query($conta: String!, $ini: Date!, $fim: Date!) { viewer { accounts(filter: { accountTag: $conta }) {
        d1StorageAdaptiveGroups(limit: 100, filter: { date_geq: $ini, date_leq: $fim }, orderBy: [date_DESC]) { max { databaseSizeBytes } dimensions { date databaseId } } } } }`, { ini, fim });
      const porDb = {};
      for (const x of a.d1StorageAdaptiveGroups || []) if (!porDb[x.dimensions.databaseId]) porDb[x.dimensions.databaseId] = x.max.databaseSizeBytes;
      return Object.values(porDb).reduce((s, v) => s + v, 0);
    }),
  ]);
  return out;
}

// O que se mede sem token: tamanho dos dados guardados e quantas rodadas de curadoria gravaram itens no mês.
async function local(env) {
  const ini = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const [tam, cand, rod] = await Promise.all([
    env.DB.prepare("SELECT collection, count(*) AS n, sum(length(data)) AS bytes FROM docs GROUP BY collection ORDER BY bytes DESC").all(),
    env.DB.prepare("SELECT count(*) AS n, sum(length(titulo) + length(coalesce(trecho, '')) + length(url)) AS bytes FROM candidatos").first(),
    env.DB.prepare("SELECT collection, count(DISTINCT coletado) AS rodadas, count(*) AS itens FROM docs WHERE (collection LIKE 'items%' OR collection = 'sombra-items') AND coletado >= ?1 GROUP BY collection").bind(ini).all(),
  ]);
  return { colecoes: tam.results, candidatos: cand, rodadasMes: rod.results };
}

// Fichas de papel (src/papel.js): quantas existem e as buscas novas de hoje (página e cron), de _sistema/papel-contagem.
async function papel(env) {
  const [n, c] = await Promise.all([
    env.DB.prepare("SELECT count(*) AS n FROM docs WHERE collection = 'hist'").first(),
    env.DB.prepare("SELECT data FROM docs WHERE collection = '_sistema' AND id = 'papel-contagem'").first(),
  ]);
  let cont = {};
  try { cont = c ? JSON.parse(c.data) : {}; } catch {}
  const hoje = new Date().toISOString().slice(0, 10);
  const doDia = cont.dia === hoje ? cont : { buscas: 0, cron: 0 };
  return { hist: n?.n || 0, buscasHoje: doDia.buscas || 0, cronHoje: doDia.cron || 0, tokens: { brapi: !!env.BRAPI_TOKEN, finnhub: !!env.FINNHUB_TOKEN } };
}

export async function adminCustos(env) {
  const out = { planos: PLANOS, local: await local(env), configurado: !!env.CF_API_TOKEN, gerado: new Date().toISOString() };
  try { out.papel = await papel(env); } catch (e) { out.papel = { erro: String(e.message || e) }; }
  if (env.CF_API_TOKEN) { try { out.cloudflare = await cloudflare(env); } catch (e) { out.erroCloudflare = String(e.message || e); } }
  return out;
}
