// ArchLandscape, aba Cloud e comparação (pedido de 19/11): semente, validação, rotas públicas e de Admin (404), notas por
// pessoa e conta apagada, filtros, agrupamento, equivalentes, citação com nome genérico, comparar (podeComparar, hash
// inválido, montagem, Markdown do ADR), novidades na hora com cache, milestones, ícone, comparação profunda e rotinas.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { d1Falso, espelhoFalso } from "./d1-falso.mjs";
import "../public/landscape.js";
import "../public/arch.js";
import { PROVEDORES, CATEGORIAS, SERVICOS, SEMENTE_EM } from "../src/cloud-semente.js";
import { semearCloud, rotaCloud, rotaAdminCloud, listaLeve, lerFeedProvedor, citacoesServico, CACHE_FEED_MS, FEEDS_CLOUD, CLOUD_PARA_SONDAR, SQL_LEVE } from "../src/cloud.js";
import { rotaDossies, limparDossies, SQL_PENDENTES, SQL_FECHAR, MAX_PENDENTES, MAX_POR_DIA } from "../src/arch.js";
import { rotaRoteiro, lerMilestones, semearLandscape } from "../src/landscape.js";
import { rotaIcone, iconeDaPagina, dominiosPermitidos, MAX_ICONE } from "../src/icone.js";
import { relatorio, estadoDossies } from "../src/rotinas.js";

register("data:text/javascript," + encodeURIComponent(
  'export async function resolve(s, c, n) { if (s === "cloudflare:workers") return { url: "data:text/javascript,export class DurableObject {}", shortCircuit: true }; return n(s, c); }'));
const { default: worker } = await import("../src/index.js");
const { PREFIXOS_PESSOAIS, COLECOES_ESPELHO } = await import("../src/espelho.js");

const A = globalThis.Arch;
const L = globalThis.Landscape;
const DIA = 86_400_000, HORA = 3_600_000;
const AGORA = Date.parse("2026-11-19T15:00:00Z");
const ADMIN = { email: "admin@teste.dev", admin: true, secoes: null };
const CONVIDADO = { email: "convidado@teste.dev", admin: false, secoes: ["tech"] };
const req = (metodo, corpo, url = "https://x/api") => new Request(url, { method: metodo, headers: { "content-type": "application/json" }, body: corpo == null || metodo === "GET" ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo) });
const corpoDe = async (p) => { const r = await p; return { status: r.status, j: await r.json() }; };
const docDe = (env, c, id) => { const r = env.DB.db.prepare("SELECT data FROM docs WHERE collection = ? AND id = ?").get(c, id); return r ? JSON.parse(r.data) : null; };
async function semeado() { const env = { DB: d1Falso() }; await semearCloud(env, AGORA); return { env, dep: espelhoFalso() }; }
async function comFetch(f, fn) { const o = globalThis.fetch; globalThis.fetch = f; try { return await fn(); } finally { globalThis.fetch = o; } }
const leve = SERVICOS.map((s) => ({ id: s.id, ...s.doc }));
const ctxSemente = { provedores: PROVEDORES, categorias: CATEGORIAS, agora: AGORA };

// ---------- semente ----------
test("semente: de 120 a 180 serviços, ids únicos, provedor e subcategoria que existem, sem URL repetida, sem preço em número", () => {
  assert.ok(SERVICOS.length >= 120 && SERVICOS.length <= 180, String(SERVICOS.length));
  assert.equal(new Set(SERVICOS.map((s) => s.id)).size, SERVICOS.length, "ids únicos");
  assert.ok(A.validarProvedores({ provedores: PROVEDORES }).provedores, "provedores válidos");
  assert.ok(A.validarCategorias({ categorias: CATEGORIAS }).categorias, "categorias válidas");
  const provs = new Set(PROVEDORES.map((p) => p.id));
  const subs = new Map(CATEGORIAS.flatMap((c) => c.subcategorias.map((s) => [s.id, c.id])));
  const urls = [];
  for (const { id, doc } of SERVICOS) {
    assert.ok(provs.has(doc.provedor), id + " provedor");
    assert.equal(subs.get(doc.subcategoria), doc.categoria, id + " subcategoria da categoria");
    assert.ok(A.ID_SERV.test(id) && id.startsWith(doc.provedor + "--"), id);
    assert.equal(doc.conferido, null, id + " ainda não conferido");
    assert.deepEqual(doc.preco_ref, { texto: "", fonte: "", em: null });
    assert.ok(doc.uso.includes("nuvem"), id + " é nuvem por definição");
    for (const t of [doc.nome, doc.resumo, doc.cobranca, doc.gratis, ...doc.destaques, ...doc.apelidos, ...Object.values(doc.atributos).map((a) => a.valor)])
      assert.ok(!/R\$|US\$|\$\s?\d/.test(String(t)), id + ": preço em número em " + t);
    for (const t of [doc.resumo, doc.cobranca]) assert.ok(!/\b(melhor|recomendad|barat)/i.test(t) && !/ — /.test(t), id + ": " + t);
    for (const u of Object.values(doc.links).filter(Boolean)) urls.push(u);
    for (const a of Object.values(doc.atributos)) { assert.equal(a.por, "semente"); assert.equal(a.fonte, doc.links.produto); assert.equal(a.em, SEMENTE_EM); }
    const v = A.validarServico(doc, ctxSemente);
    assert.ok(v.servico, id + ": " + v.erro);
  }
  assert.equal(new Set(urls).size, urls.length, "nenhuma URL repetida");
  // todas as subcategorias têm serviço; os grandes aparecem nas de computação, objetos, Postgres, cache, CDN e DNS onde têm
  for (const s of subs.keys()) assert.ok(SERVICOS.some((x) => x.doc.subcategoria === s), "subcategoria vazia: " + s);
  for (const s of ["vms", "objetos", "funcoes", "paas", "cdn", "dns", "relacional", "cache"])
    assert.ok(SERVICOS.some((x) => x.doc.subcategoria === s && PROVEDORES.find((p) => p.id === x.doc.provedor).tipo === "alternativa"), "alternativa em " + s);
  for (const p of ["aws", "gcp", "azure", "oci", "cloudflare"]) assert.ok(SERVICOS.filter((x) => x.doc.provedor === p).length >= 15, p);
  for (const p of PROVEDORES) assert.ok(/^[A-Za-z0-9]{1,4}$/.test(p.sigla) && /^#[0-9a-f]{6}$/.test(p.cor), p.id);
});

test("semente entra uma vez pelo cron, com INSERT OR IGNORE, sem passar por cima do Admin", async () => {
  const env = { DB: d1Falso() };
  assert.equal(await semearCloud(env, AGORA), SERVICOS.length);
  assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM docs WHERE collection = 'cloud'").get().n, SERVICOS.length);
  env.DB.db.prepare("UPDATE docs SET data = json_set(data, '$.resumo', 'editado') WHERE collection = 'cloud' AND id = 'aws--amazon-s3'").run();
  env.DB.db.prepare("DELETE FROM docs WHERE collection = 'cloud' AND id = 'cloudflare--r2'").run();
  assert.equal(await semearCloud(env, AGORA + DIA), 0, "a marca segura");
  env.DB.db.prepare("DELETE FROM docs WHERE collection = '_sistema' AND id = 'cloud-semente'").run();
  await semearCloud(env, AGORA + 2 * DIA);
  assert.equal(docDe(env, "cloud", "aws--amazon-s3").resumo, "editado", "não passa por cima");
  assert.ok(env.DB.log.every((s) => !/^\s*(DROP|UPDATE docs SET data = \?)/i.test(s) || /WHERE collection = 'cloud' AND id = \?/.test(s)));
  assert.ok(COLECOES_ESPELHO.includes("cloud") && PREFIXOS_PESSOAIS.includes("cloud-notas/"));
  // a semente vem junto com a do Landscape, no mesmo cron
  const env2 = { DB: d1Falso() };
  const { cronLandscape } = await import("../src/landscape.js");
  const r = await comFetch(async () => new Response("", { status: 503 }), () => cronLandscape(env2, AGORA));
  assert.equal(r.cloud, SERVICOS.length);
});

// ---------- validação ----------
test("validação de serviço, provedor e categoria (característica com e sem fonte, não conferido)", () => {
  const base = { provedor: "aws", nome: "Amazon S3 Express", categoria: "armazenamento", subcategoria: "objetos", resumo: "x", cobranca: "por GB", links: { produto: "https://aws.amazon.com/s3/x" } };
  assert.ok(A.validarServico(base, ctxSemente).servico);
  assert.equal(A.idServico("aws", "Amazon S3 Express"), "aws--amazon-s3-express");
  for (const [b, msg] of [[{ ...base, provedor: "ibm" }, /provedor/], [{ ...base, subcategoria: "vms" }, /categoria/], [{ ...base, nome: "" }, /nome/],
    [{ ...base, resumo: "a partir de US$ 5" }, /Preço/], [{ ...base, cobranca: "$0,02 por GB" }, /Preço/], [{ ...base, links: { produto: "http://x.com" } }, /https/],
    [{ ...base, destaques: ["a", "b", "c", "d", "e"] }, /4/], [{ ...base, atributos: { motores: "x" } }, /desconhecida/], [{ ...base, atributos: { api_s3: "talvez" } }, /sim ou não/],
    [{ ...base, preco_ref: { texto: "tabela", fonte: "", em: "" } }, /referência/], [{ ...base, uso: ["on-prem"] }, /uso/]])
    assert.match(A.validarServico(b, ctxSemente).erro || "", msg, JSON.stringify(b).slice(0, 80));
  const c = A.validarServico({ ...base, atributos: { api_s3: { valor: "sim", fonte: "https://docs.aws.amazon.com/s3" }, classes: "Standard", on_premises: "" } }, { ...ctxSemente, por: "admin" }).servico.atributos;
  assert.equal(c.api_s3.fonte, "https://docs.aws.amazon.com/s3"); assert.equal(c.api_s3.por, "admin"); assert.equal(c.api_s3.em, new Date(AGORA).toISOString());
  assert.equal(c.classes.fonte, "", "sem fonte vale, com a data"); assert.ok(!("on_premises" in c), "vazio sai");
  assert.equal(A.textoCarac(c.api_s3), "sim"); assert.equal(A.textoCarac(null), "não conferido"); assert.equal(A.textoCarac({ valor: "" }), "não conferido");
  assert.equal(A.textoCarac({ valor: "nao" }), "não"); assert.equal(A.textoCarac("parcial"), "parcial");
  assert.ok(A.validarCarac({ valor: "x", fonte: "ftp://a" }).erro);
  assert.ok(A.chavesDe("objetos").some((k) => k.k === "on_premises") && A.chavesDe("web-scraping").some((k) => k.k === "renderiza_js"), "comuns e Tools");
  // provedores e categorias
  assert.match(A.validarProvedores({ provedores: [{ ...PROVEDORES[0], sigla: "AMAZON" }] }).erro, /Sigla/);
  assert.match(A.validarProvedores({ provedores: [{ ...PROVEDORES[0], cor: "laranja" }] }).erro, /Cor/);
  assert.match(A.validarProvedores({ provedores: [PROVEDORES[0], PROVEDORES[0]] }).erro, /repetido/);
  assert.match(A.validarProvedores({ provedores: [{ ...PROVEDORES[0], tipo: "barata" }] }).erro, /Tipo/);
  assert.match(A.validarProvedores({ provedores: [{ ...PROVEDORES[0], icone: "javascript:1" }] }).erro, /Ícone/);
  assert.match(A.validarCategorias({ categorias: [{ nome: "A", subcategorias: [{ id: "x", nome: "X" }] }, { nome: "B", subcategorias: [{ id: "x", nome: "Y" }] }] }).erro, /repetida/, "subcategoria é a chave do comparar");
});

// ---------- rotas ----------
test("rotas públicas: lista leve, detalhe com equivalentes e citações, 404 e 400", async () => {
  const { env, dep } = await semeado();
  const g = await corpoDe(await rotaCloud(req("GET"), env, CONVIDADO, "", dep));
  assert.equal(g.status, 200);
  assert.equal(g.j.servicos.length, SERVICOS.length);
  assert.ok(g.j.servicos.every((s) => !("cobranca" in s) && !("atributos" in s)), "lista leve");
  assert.equal(g.j.provedores.length, PROVEDORES.length); assert.equal(g.j.admin, false);
  const d = await corpoDe(await rotaCloud(req("GET"), env, CONVIDADO, "aws--amazon-s3", dep));
  assert.equal(d.status, 200); assert.equal(d.j.servico.nome, "Amazon S3"); assert.equal(d.j.provedor.id, "aws");
  assert.ok(d.j.equivalentes.length >= 5 && d.j.equivalentes.every((e) => e.subcategoria === "objetos" && e.id !== "aws--amazon-s3"));
  assert.ok(!("por" in d.j.servico));
  assert.equal((await rotaCloud(req("GET"), env, CONVIDADO, "aws--nao-existe", dep)).status, 404);
  assert.equal((await rotaCloud(req("GET"), env, CONVIDADO, "AWS S3", dep)).status, 400);
  assert.equal((await rotaCloud(req("PUT", {}), env, CONVIDADO, "aws--amazon-s3", dep)).status, 405);
  assert.ok(/^SELECT id, data FROM docs WHERE 0 UNION ALL/.test(SQL_LEVE), "o espelho aceita");
  // comparar: ids válidos da mesma subcategoria; o resto volta com o motivo
  const c = await corpoDe(await rotaCloud(req("GET", null, "https://x/api/cloud/comparar?ids=aws--amazon-s3,cloudflare--r2"), env, CONVIDADO, "comparar", dep));
  assert.equal(c.status, 200); assert.deepEqual(c.j.servicos.map((s) => s.id), ["aws--amazon-s3", "cloudflare--r2"]);
  const ruim = await corpoDe(await rotaCloud(req("GET", null, "https://x/api/cloud/comparar?ids=aws--amazon-s3,aws--amazon-ec2"), env, CONVIDADO, "comparar", dep));
  assert.equal(ruim.status, 400); assert.match(ruim.j.motivo, /mesma subcategoria/);
});

test("rotas de Admin: 404 para quem não é Admin; adicionar, editar (conferido hoje), recusar e tirar", async () => {
  const { env, dep } = await semeado();
  for (const [m, alvo, id] of [["GET", "", ""], ["POST", "", ""], ["PUT", "", "aws--amazon-s3"], ["DELETE", "", "aws--amazon-s3"], ["PUT", "provedores", ""], ["PUT", "categorias", ""], ["POST", "sonda", ""]])
    assert.equal((await rotaAdminCloud(req(m, {}), env, CONVIDADO, alvo, id, dep)).status, 404, m + alvo);
  const novo = { provedor: "hetzner", nome: "Storage Box", categoria: "armazenamento", subcategoria: "arquivos", resumo: "Espaço de armazenamento acessível por SFTP, SMB e outros.", cobranca: "por plano mensal", links: { produto: "https://www.hetzner.com/storage/storage-box/" } };
  const a = await corpoDe(await rotaAdminCloud(req("POST", novo), env, ADMIN, "", "", dep, { agora: AGORA }));
  assert.equal(a.status, 200, JSON.stringify(a.j)); assert.equal(a.j.id, "hetzner--storage-box");
  assert.equal(docDe(env, "cloud", "hetzner--storage-box").por, "admin");
  assert.equal((await rotaAdminCloud(req("POST", novo), env, ADMIN, "", "", dep)).status, 409, "repetido");
  assert.equal((await rotaAdminCloud(req("POST", { ...novo, nome: "X", cobranca: "R$ 10 por mês" }), env, ADMIN, "", "", dep)).status, 400);
  const e = await corpoDe(await rotaAdminCloud(req("PUT", { gratis: "Até 10 GB.", conferirHoje: true, atributos: { protocolos: "SFTP, SMB" } }), env, ADMIN, "", "hetzner--storage-box", dep, { agora: AGORA + HORA }));
  assert.equal(e.status, 200, JSON.stringify(e.j));
  const doc = docDe(env, "cloud", "hetzner--storage-box");
  assert.equal(doc.gratis, "Até 10 GB."); assert.equal(doc.conferido, new Date(AGORA + HORA).toISOString()); assert.equal(doc.atributos.protocolos.valor, "SFTP, SMB");
  assert.equal(doc.resumo, novo.resumo, "o resto fica"); assert.equal(doc.adicionado, new Date(AGORA).toISOString());
  assert.ok(env.DB.log.some((s) => /UPDATE docs SET data = \?, atualizado = \? WHERE collection = 'cloud' AND id = \?/.test(s)), "com a chave");
  assert.ok(dep.gravados.some((g) => g.id === "hetzner--storage-box"), "write-through");
  // provedor com serviço não sai; subcategoria com serviço também não
  const sem = PROVEDORES.filter((p) => p.id !== "wasabi");
  assert.equal((await rotaAdminCloud(req("PUT", { provedores: sem }), env, ADMIN, "provedores", "", dep)).status, 409);
  const p2 = await corpoDe(await rotaAdminCloud(req("PUT", { provedores: PROVEDORES.map((p) => (p.id === "wasabi" ? { ...p, nome: "Wasabi Technologies" } : p)) }), env, ADMIN, "provedores", "", dep));
  assert.equal(p2.status, 200); assert.equal(docDe(env, "meta", "cloud-provedores").provedores.find((p) => p.id === "wasabi").nome, "Wasabi Technologies");
  const cats = CATEGORIAS.map((c) => (c.id === "armazenamento" ? { ...c, subcategorias: c.subcategorias.filter((s) => s.id !== "arquivos") } : c));
  assert.equal((await rotaAdminCloud(req("PUT", { categorias: cats }), env, ADMIN, "categorias", "", dep)).status, 409);
  assert.equal((await rotaAdminCloud(req("DELETE"), env, ADMIN, "", "hetzner--storage-box", dep)).status, 200);
  assert.equal(docDe(env, "cloud", "hetzner--storage-box"), null);
  assert.ok(dep.removidos.some((r) => r.id === "hetzner--storage-box"));
  assert.ok(env.DB.log.filter((s) => /^DELETE/i.test(s)).every((s) => /AND id = \?/.test(s)), "DELETE só com a chave");
});

test("notas por pessoa (cloud-notas/<email>) e conta apagada levando as notas", async () => {
  const { env, dep } = await semeado();
  const outro = { email: "outro@teste.dev", admin: false, secoes: ["tech"] };
  const put = (q, b) => corpoDe(rotaCloud(req("PUT", b), env, q, "cloudflare--r2/notas", dep));
  assert.equal((await corpoDe(await rotaCloud(req("PUT", { situacao: "avaliando", nota: "ver saída" }), env, CONVIDADO, "cloudflare--r2/notas", dep))).status, 200);
  await rotaCloud(req("PUT", { situacao: "uso" }), env, outro, "cloudflare--r2/notas", dep);
  const minha = await corpoDe(await rotaCloud(req("GET"), env, CONVIDADO, "cloudflare--r2/notas", dep));
  assert.equal(minha.j.notas.nota, "ver saída"); assert.equal(minha.j.notas.situacao, "avaliando");
  assert.equal((await corpoDe(await rotaCloud(req("GET"), env, outro, "cloudflare--r2/notas", dep))).j.notas.situacao, "uso", "cada um vê as suas");
  assert.equal((await rotaCloud(req("PUT", { situacao: "talvez" }), env, CONVIDADO, "cloudflare--r2/notas", dep)).status, 400);
  assert.ok(docDe(env, "cloud-notas/" + CONVIDADO.email, "notas"));
  void put;
  // conta apagada pelo Worker: as notas saem junto
  env.DB.db.prepare("INSERT INTO usuarios (email, nome) VALUES (?, ?)").run(CONVIDADO.email, "C");
  const r = await worker.fetch(new Request("https://lookout.test/api/admin/usuarios/" + encodeURIComponent(CONVIDADO.email), { method: "DELETE", headers: { "X-Requested-With": "XMLHttpRequest" } }), { ...env, DEV_EMAIL: "admin@x.com", ADMIN_EMAIL: "admin@x.com" }, { waitUntil() {} });
  assert.equal(r.status, 200);
  assert.equal(docDe(env, "cloud-notas/" + CONVIDADO.email, "notas"), null);
  assert.ok(docDe(env, "cloud-notas/" + outro.email, "notas"), "a do outro fica");
});

test("Worker: /api/cloud exige a seção Tech; Admin de Cloud e dossiês dão 404 para quem não é Admin", async () => {
  const { env } = await semeado();
  env.DB.db.prepare("INSERT INTO usuarios (email, nome) VALUES ('c@x.com', 'C')").run();
  const chamar = (m, c, email, corpo) => worker.fetch(new Request("https://lookout.test" + c, { method: m, headers: { "X-Requested-With": "XMLHttpRequest", "content-type": "application/json" }, body: corpo && m !== "GET" ? JSON.stringify(corpo) : undefined }), { ...env, DEV_EMAIL: email, ADMIN_EMAIL: "admin@x.com" }, { waitUntil() {} });
  assert.equal((await chamar("GET", "/api/cloud", "admin@x.com")).status, 200);
  for (const [m, c] of [["GET", "/api/admin/cloud"], ["POST", "/api/admin/cloud"], ["PUT", "/api/admin/cloud-provedores"], ["GET", "/api/admin/arch/dossies"], ["POST", "/api/admin/arch/dossies"], ["DELETE", "/api/admin/arch/dossies/d0123456789abcdef"]])
    assert.equal((await chamar(m, c, "c@x.com", {})).status, 404, m + " " + c);
  assert.equal((await chamar("GET", "/api/admin/cloud", "admin@x.com")).status, 200);
});

// ---------- grade ----------
test("agrupamento por categoria e por provedor; filtros combinados; equivalentes", () => {
  const cat = A.agrupar(leve, "categoria", CATEGORIAS, PROVEDORES);
  assert.deepEqual(cat.map((c) => c.id), CATEGORIAS.map((c) => c.id), "na ordem da meta");
  const obj = cat.find((c) => c.id === "armazenamento").subs.find((s) => s.id === "objetos");
  assert.equal(obj.itens[0].provedor, "aws", "grandes primeiro, na ordem dos provedores");
  assert.equal(cat.reduce((n, c) => n + c.subs.reduce((m, s) => m + s.itens.length, 0), 0), leve.length);
  const prov = A.agrupar(leve, "provedor", CATEGORIAS, PROVEDORES);
  assert.equal(prov[0].prov.id, "aws");
  assert.ok(prov.every((g) => g.cats.every((c) => c.itens.every((s) => s.provedor === g.prov.id && s.categoria === c.id))));
  assert.equal(prov.reduce((n, g) => n + g.cats.reduce((m, c) => m + c.itens.length, 0), 0), leve.length);
  assert.deepEqual(A.agrupar([], "categoria", CATEGORIAS, PROVEDORES), []);
  const f = (x) => A.filtrarCloud(leve, x, PROVEDORES).map((s) => s.id);
  assert.ok(f({ alt: true }).every((id) => PROVEDORES.find((p) => id.startsWith(p.id + "--")).tipo === "alternativa"));
  assert.ok(f({ alt: true, cat: "armazenamento" }).includes("backblaze--backblaze-b2") && !f({ alt: true, cat: "armazenamento" }).includes("aws--amazon-s3"));
  assert.deepEqual(f({ provs: ["cloudflare"], q: "r2" }), ["cloudflare--r2"]);
  assert.ok(f({ q: "s3" }).includes("aws--amazon-s3"), "busca pelo apelido");
  assert.ok(f({ q: "hetzner" }).length >= 3, "busca pelo provedor");
  assert.ok(f({ gratis: true }).every((id) => leve.find((s) => s.id === id).gratis));
  assert.deepEqual(f({ provs: ["aws", "gcp"], cat: "armazenamento", q: "storage" }).sort(), f({ provs: ["aws", "gcp"], cat: "armazenamento" }).filter((id) => /storage|s3/.test(id) ? A.semAcento(JSON.stringify(leve.find((s) => s.id === id))).includes("storage") : false).sort());
  const r2 = leve.find((s) => s.id === "cloudflare--r2");
  const eq = A.equivalentes(r2, leve, PROVEDORES);
  assert.ok(eq.length >= 5 && eq.every((x) => x.subcategoria === "objetos" && x.id !== r2.id));
  assert.equal(eq[0].provedor, "aws", "outros provedores na ordem");
  const ec2 = leve.find((s) => s.id === "aws--amazon-ec2");
  assert.ok(!A.equivalentes(ec2, leve, PROVEDORES).some((x) => x.subcategoria !== "vms"));
});

// ---------- citação ----------
test("citação: nome distinto sozinho; nome genérico só com o provedor junto", () => {
  const p = (id) => PROVEDORES.find((x) => x.id === id);
  const s = (id) => leve.find((x) => x.id === id);
  assert.ok(A.citaServico(s("aws--amazon-dynamodb"), p("aws"), "DynamoDB ganha tabelas globais com consistência forte"));
  assert.ok(!A.nomeDistinto("Azure Functions".replace("Azure ", "")), "Functions é genérico");
  assert.ok(A.citaServico(s("azure--azure-functions"), p("azure"), "Azure Functions agora suporta Python 3.13"));
  const gcs = s("gcp--cloud-storage");
  assert.ok(!A.citaServico(gcs, p("gcp"), "Cloud Storage prices are going up everywhere"), "genérico sem o provedor não casa");
  assert.ok(A.citaServico(gcs, p("gcp"), "Google anuncia mudança no Cloud Storage"), "com o provedor casa");
  assert.ok(!A.citaServico(s("cloudflare--r2"), p("cloudflare"), "R2-D2 aparece no trailer"), "sigla curta sem o provedor não casa");
  assert.ok(A.citaServico(s("cloudflare--r2"), p("cloudflare"), "Cloudflare R2 ganha bucket com localização"), "apelido com o provedor");
  assert.ok(A.citaServico(s("cloudflare--r2"), p("cloudflare"), "R2 ganha bucket com localização", { noFeed: true }), "no feed do próprio provedor");
  assert.ok(!A.citaServico(s("aws--amazon-s3"), p("aws"), "S3 drivers for Linux"), "S3 sozinho é curto demais");
  assert.ok(A.termosBusca(s("aws--amazon-s3")).includes("s3"));
});

test("citações: o SELECT composto respeita os 5 termos do D1 e o filtro final de nome genérico", async () => {
  const { env, dep } = await semeado();
  const pôr = (c, id, d) => env.DB.db.prepare("INSERT INTO docs (collection, id, data, coletado) VALUES (?, ?, ?, ?)").run(c, id, JSON.stringify(d), d.coletado);
  const em = new Date(AGORA - DIA).toISOString();
  pôr("items", "a", { titulo: "Google amplia o Cloud Storage com nova classe", url: "https://x.com/a", resumo: "", coletado: em });
  pôr("items", "b", { titulo: "Cloud Storage em alta entre startups", url: "https://x.com/b", resumo: "", coletado: em });
  pôr("items-negocios", "c", { titulo: "Empresa troca Cloud Storage do Google por R2", url: "https://x.com/c", resumo: "", coletado: em });
  const serv = leve.find((s) => s.id === "gcp--cloud-storage");
  const l = await citacoesServico(env, dep, serv, PROVEDORES.find((p) => p.id === "gcp"), { agora: AGORA });
  assert.deepEqual(l.map((x) => x.url).sort(), ["https://x.com/a", "https://x.com/c"]);
});

// ---------- comparar ----------
test("podeComparar: nada, um só, sem concorrente, subcategorias diferentes, 2 a 4 válidos e o quinto recusado", () => {
  const n = A.podeComparar([], leve);
  assert.equal(n.pode, false); assert.equal(n.motivo, "Marque dois serviços da mesma categoria"); assert.equal(n.candidatos.length, leve.length);
  const um = A.podeComparar(["aws--amazon-s3"], leve);
  assert.equal(um.pode, false); assert.equal(um.motivo, "Marque mais um para comparar"); assert.equal(um.subcategoria, "objetos");
  assert.ok(um.candidatos.length >= 5 && um.candidatos.every((id) => leve.find((s) => s.id === id).subcategoria === "objetos"));
  const sozinho = [...leve, { id: "aws--unico", provedor: "aws", nome: "Único", subcategoria: "nova", categoria: "x" }];
  const sem = A.podeComparar(["aws--unico"], sozinho);
  assert.equal(sem.pode, false); assert.equal(sem.motivo, "Nenhum concorrente cadastrado para comparar"); assert.deepEqual(sem.candidatos, []);
  assert.match(A.podeComparar(["aws--amazon-s3", "aws--amazon-ec2"], leve).motivo, /mesma subcategoria/);
  const objs = leve.filter((s) => s.subcategoria === "objetos").map((s) => s.id);
  for (const k of [2, 3, 4]) assert.equal(A.podeComparar(objs.slice(0, k), leve).pode, true, k + " valem");
  assert.deepEqual(A.podeComparar(objs.slice(0, 4), leve).candidatos, [], "com 4, nenhum mais marcável");
  const cinco = A.podeComparar(objs.slice(0, 5), leve);
  assert.equal(cinco.pode, false); assert.equal(cinco.motivo, "Até 4 serviços por comparação");
  assert.match(A.podeComparar(["aws--amazon-s3", "aws--nao-existe"], leve).motivo, /não encontrado/);
  // marcável: depois do primeiro, só a mesma subcategoria; o motivo diz qual
  assert.deepEqual(A.marcavel("aws--amazon-ec2", ["aws--amazon-s3"], leve, CATEGORIAS), { ok: false, motivo: "Só dá para comparar com serviços de Objetos" });
  assert.equal(A.marcavel("cloudflare--r2", ["aws--amazon-s3"], leve, CATEGORIAS).ok, true);
  assert.equal(A.marcavel(objs[4], objs.slice(0, 4), leve, CATEGORIAS).ok, false, "o quinto não");
  assert.equal(A.marcavel("aws--amazon-ec2", [], leve, CATEGORIAS).ok, true, "sem nada marcado, tudo libera");
});

test("hash de comparação inválido não abre a tabela: volta para a grade com o motivo", () => {
  // a regra que a página usa (arch-ui.js, telaComparar): lerHash + podeComparar
  const abre = (h) => { const e = A.lerHash(h); const p = A.podeComparar(e.ids, leve); return p.pode ? "tabela" : "grade: " + p.motivo; };
  assert.equal(abre("#arch/cloud/comparar/aws--amazon-s3,cloudflare--r2"), "tabela");
  assert.match(abre("#arch/cloud/comparar/aws--amazon-s3,aws--amazon-ec2"), /^grade: Só dá para comparar/);
  assert.match(abre("#arch/cloud/comparar/aws--amazon-s3"), /^grade: Marque mais um/);
  assert.match(abre("#arch/cloud/comparar/"), /^grade: Marque dois/);
  assert.match(abre("#arch/cloud/comparar/aws--amazon-s3,aws--sumiu"), /^grade: Serviço não encontrado/);
  assert.equal(A.conjunto(["b", "a", "b"]), "a,b"); assert.equal(A.conjunto("cloudflare--r2,aws--amazon-s3"), A.conjunto(["aws--amazon-s3", "cloudflare--r2"]), "identidade do conjunto sem ordem");
});

test("montagem da comparação: linha vazia some, diferença marcada; Markdown do ADR só com fatos e fontes", () => {
  const ids = ["aws--amazon-s3", "cloudflare--r2", "backblaze--backblaze-b2", "wasabi--wasabi-hot-cloud-storage"];
  const servs = ids.map((id) => leve.find((s) => s.id === id));
  const novidades = { "cloudflare--r2": [{ titulo: "R2 ganha classe de acesso raro", publicado: "2026-11-10T00:00:00Z", url: "https://developers.cloudflare.com/changelog/r2" }] };
  const roteiro = { "aws--amazon-s3": [{ titulo: "S3 Tables em preview", quando: "", fonte: "https://aws.amazon.com/x" }] };
  const c = A.montarComparacao(servs, { aba: "cloud", provs: PROVEDORES, novidades, roteiro, agora: AGORA });
  assert.equal(c.colunas.length, 4); assert.equal(c.colunas[1].provedor.nome, "Cloudflare");
  const k = c.linhas.map((l) => l.k);
  assert.ok(!k.includes("preco_ref"), "ninguém tem preço de referência: a linha some");
  assert.ok(!k.includes("at:blocos") && !k.includes("at:conformidade"), "atributo sem valor em todos some");
  assert.ok(k.includes("at:api_s3") && k.includes("at:saida_gratis") && k.includes("novidade") && k.includes("roteiro"));
  const api = c.linhas.find((l) => l.k === "at:api_s3"), saida = c.linhas.find((l) => l.k === "at:saida_gratis");
  assert.equal(api.diferente, false, "todos sim: sem destaque"); assert.equal(saida.diferente, true, "valores diferentes: destaque");
  assert.deepEqual(saida.celulas, ["não", "sim", "parcial", "parcial"]);
  assert.equal(c.linhas.find((l) => l.k === "conferido").celulas[0], "ainda não conferido");
  const um = A.linha("x", "X", ["", "", ""]); assert.equal(um, null);
  const md = A.markdownAdr(c, { agora: AGORA });
  assert.match(md, /^## Opções consideradas\n/);
  assert.match(md, /\| \| Amazon S3 \(Amazon Web Services\) \| R2 \(Cloudflare\) \|/);
  assert.match(md, /\| API compatível com S3 \| sim \| sim \| sim \| sim \|/);
  assert.match(md, /\| Última novidade \| – \| R2 ganha classe de acesso raro \(10\/11\/2026\) \|/);
  assert.match(md, /### Fontes\n\n- Amazon S3, página do produto: https:\/\/aws\.amazon\.com\/s3\/ \(consultado em 19\/11\/2026\)/);
  assert.ok(!/\b(prós|contras|recomend|vencedor|melhor)\b/i.test(md), "sem avaliação");
  const tab = md.split("\n").filter((x) => x.startsWith("|"));
  assert.ok(tab.every((x) => x.split(/(?<!\\)\|/).length === 7), "tabela bem formada: 4 opções mais o rótulo");
  assert.equal(A.markdownAdr({ colunas: [] }), "");
  // Tools: última versão e ritmo
  const rel = (n, dias) => Array.from({ length: n }, (_, i) => ({ tag: "v" + (n - i), data: new Date(AGORA - (i * dias + 1) * DIA).toISOString() }));
  const t = A.montarComparacao([{ id: "a--a", repo: "a/a", nome: "A", subcategoria: "web-scraping", releases: rel(10, 20), gh: { estrelas: 10, licenca: "MIT" }, uso: ["biblioteca"] },
    { id: "b--b", repo: "b/b", nome: "B", subcategoria: "web-scraping", releases: rel(3, 200), gh: { estrelas: 20, licenca: "MIT" }, uso: ["nuvem", "self-hosted"] }], { aba: "tools", agora: AGORA });
  assert.deepEqual(t.linhas.find((l) => l.k === "ritmo").celulas, ["10 ou mais nos últimos 12 meses", "2 nos últimos 12 meses"]);
  assert.match(t.linhas.find((l) => l.k === "versao").celulas[0], /^v10 \(/);
  assert.equal(t.linhas.find((l) => l.k === "licenca").diferente, false);
  assert.deepEqual(t.linhas.find((l) => l.k === "uso").celulas, ["Biblioteca", "Nuvem ou self-hosted"]);
  assert.match(A.markdownAdr(t, { agora: AGORA }), /\| Opções de uso \| Biblioteca \| Nuvem ou self-hosted \|/);
  assert.match(A.markdownAdr(t, { agora: AGORA }), /- A, repositório: https:\/\/github\.com\/a\/a/);
});

// ---------- novidades ----------
const rss = (itens) => `<?xml version="1.0"?><rss><channel>${itens.map((i) => `<item><title>${i.t}</title><link>${i.u}</link><pubDate>${i.d}</pubDate>${i.c ? `<category>${i.c}</category>` : ""}</item>`).join("")}</channel></rss>`;
test("novidade casa com o serviço; regra de preview e anúncio", () => {
  const p = PROVEDORES.find((x) => x.id === "aws");
  const s3 = leve.find((s) => s.id === "aws--amazon-s3"), lambda = leve.find((s) => s.id === "aws--aws-lambda");
  const itens = [{ titulo: "Amazon S3 now supports conditional writes", url: "https://a/1", publicado: "2026-11-01T00:00:00Z" },
    { titulo: "Announcing S3 Tables in more regions", url: "https://a/2", publicado: "2026-11-05T00:00:00Z" },
    { titulo: "AWS Lambda adds Node.js 24 (preview)", url: "https://a/3", publicado: "2026-11-03T00:00:00Z" },
    { titulo: "Amazon EC2 new instances", url: "https://a/4", publicado: "2026-11-04T00:00:00Z", tipo: "coming soon" }];
  const n = A.novidadesDoServico(itens, s3, p);
  assert.deepEqual(n.map((x) => x.url), ["https://a/2", "https://a/1"], "mais recente primeiro; só as do serviço");
  assert.equal(n[0].anuncio, "anunciado"); assert.ok(!("anuncio" in n[1]));
  assert.equal(A.novidadesDoServico(itens, lambda, p)[0].anuncio, "preview");
  for (const [t, a] of [["X em beta", "preview"], ["Coming soon: Y", "anunciado"], ["Recurso em breve", "anunciado"], ["Preview pública", "preview"], ["Novo painel", ""], ["Betamax", ""]])
    assert.equal(A.anuncio({ titulo: t }), a, t);
  assert.equal(A.anuncio({ titulo: "Novo", tipo: "Announcing" }), "anunciado", "pelo tipo");
  assert.equal(A.novidadesDoServico(Array.from({ length: 40 }, (_, i) => ({ titulo: "Amazon S3 " + i, url: "https://a/" + i, publicado: "2026-11-01" })), s3, p).length, 15);
});

test("cache de 12 h: feed sem confirmação não sai para a rede; confirmado lê uma vez; cache velho é usado quando a rede falha", async () => {
  const { env, dep } = await semeado();
  let pedidos = 0;
  const ok = async () => { pedidos++; return new Response(rss([{ t: "Amazon S3 adds X", u: "https://aws.amazon.com/new/1", d: "Mon, 16 Nov 2026 10:00:00 GMT", c: "general:products/amazon-s3" }, { t: "Announcing EC2 Y", u: "https://aws.amazon.com/new/2", d: "Tue, 17 Nov 2026 10:00:00 GMT" }]), { status: 200, headers: { "content-type": "application/rss+xml" } }); };
  // sem sonda: só o link, nenhum pedido
  const r0 = await comFetch(ok, () => corpoDe(rotaCloud(req("GET"), env, CONVIDADO, "aws--amazon-s3/novidades", dep, { agora: AGORA })));
  assert.equal(pedidos, 0); assert.equal(r0.j.temFeed, false); assert.equal(r0.j.link, "https://aws.amazon.com/new/");
  assert.deepEqual(CLOUD_PARA_SONDAR.sort(), Object.keys(FEEDS_CLOUD).sort());
  // a sonda do Admin confirma
  const s = await comFetch(ok, () => corpoDe(rotaAdminCloud(req("POST", {}), env, ADMIN, "sonda", "", dep, { agora: AGORA })));
  assert.equal(s.status, 200); assert.equal(s.j.porProvedor.aws.ok, true);
  pedidos = 0;
  const r1 = await comFetch(ok, () => corpoDe(rotaCloud(req("GET"), env, CONVIDADO, "aws--amazon-s3/novidades", dep, { agora: AGORA + 13 * HORA })));
  assert.equal(pedidos, 1); assert.equal(r1.j.de, "rede"); assert.deepEqual(r1.j.itens.map((i) => i.titulo), ["Amazon S3 adds X"]); assert.equal(r1.j.itens[0].tipo, "amazon-s3");
  const r2 = await comFetch(ok, () => corpoDe(rotaCloud(req("GET"), env, CONVIDADO, "aws--aws-lambda/novidades", dep, { agora: AGORA + 14 * HORA })));
  assert.equal(pedidos, 1, "segunda leitura (outro serviço do mesmo provedor) não sai para a rede"); assert.equal(r2.j.de, "cache");
  const cache = docDe(env, "_sistema", "cloud-feed-aws");
  assert.ok(cache.itens.length <= 300 && cache.lido);
  // depois de 12 h a rede falha: usa o cache velho, com a data, sem erro
  const falha = async () => { pedidos++; throw new Error("timeout"); };
  const r3 = await comFetch(falha, () => corpoDe(rotaCloud(req("GET"), env, CONVIDADO, "aws--amazon-s3/novidades", dep, { agora: AGORA + 26 * HORA })));
  assert.equal(r3.status, 200); assert.equal(r3.j.de, "cache"); assert.equal(r3.j.itens.length, 1); assert.equal(r3.j.lido, cache.lido);
  assert.equal(pedidos, 2);
  // e a falha também conta como a leitura das 12 h
  await comFetch(falha, () => rotaCloud(req("GET"), env, CONVIDADO, "aws--amazon-s3/novidades", dep, { agora: AGORA + 27 * HORA }));
  assert.equal(pedidos, 2);
  // comparação: uma leitura por provedor, no máximo 4
  const ids = ["aws--amazon-s3", "cloudflare--r2", "backblaze--backblaze-b2", "wasabi--wasabi-hot-cloud-storage"];
  env.DB.db.prepare("UPDATE docs SET data = json_set(data, '$.porProvedor.cloudflare.ok', json('true')) WHERE collection = '_sistema' AND id = 'cloud-feeds-sonda'").run();
  pedidos = 0;
  const cmp = await comFetch(ok, () => corpoDe(rotaCloud(req("GET", null, "https://x/api/cloud/novidades?ids=" + ids.join(",")), env, CONVIDADO, "novidades", dep, { agora: AGORA + 40 * HORA })));
  assert.equal(cmp.status, 200); assert.ok(pedidos <= 4); assert.deepEqual(Object.keys(cmp.j.porId).sort(), ids.slice().sort());
  assert.ok(CACHE_FEED_MS === 12 * HORA);
});

// ---------- milestones (Tools) ----------
test("o que vem por aí em Tools: milestones com e sem token, cache de 24 h, roteiro manual", async () => {
  const env = { DB: d1Falso() };
  const dep = espelhoFalso();
  await semearLandscape(env, AGORA);
  env.DB.db.prepare("UPDATE docs SET data = json_set(data, '$.roteiro', json(?)) WHERE collection = 'landscape' AND id = 'signoz--signoz'").run(JSON.stringify([{ titulo: "Versão 1.0", estado: "planejado", quando: "2027", fonte: "https://signoz.io/roadmap", em: "2026-11-01T00:00:00Z" }]));
  let pedidos = 0;
  const gh = async (u) => { pedidos++; assert.match(String(u), /\/repos\/SigNoz\/signoz\/milestones\?state=open/); return new Response(JSON.stringify([{ title: "v0.80", state: "open", due_on: "2026-12-15T08:00:00Z", html_url: "https://github.com/SigNoz/signoz/milestone/80", open_issues: 4, closed_issues: 10 }]), { status: 200, headers: { "content-type": "application/json" } }); };
  const sem = await comFetch(gh, async () => corpoDe(await rotaRoteiro(req("GET"), env, "signoz--signoz", dep, { agora: AGORA })));
  assert.equal(pedidos, 0); assert.equal(sem.j.semToken, true); assert.equal(sem.j.link, "https://github.com/SigNoz/signoz/milestones"); assert.equal(sem.j.itens[0].titulo, "Versão 1.0");
  const env2 = { ...env, GITHUB_TOKEN: "t" };
  const com = await comFetch(gh, async () => corpoDe(await rotaRoteiro(req("GET"), env2, "signoz--signoz", dep, { agora: AGORA })));
  assert.equal(pedidos, 1); assert.deepEqual(com.j.itens.map((i) => i.titulo), ["Versão 1.0", "v0.80"]); assert.equal(com.j.itens[1].quando, "2026-12-15");
  await comFetch(gh, () => rotaRoteiro(req("GET"), env2, "signoz--signoz", dep, { agora: AGORA + 23 * HORA }));
  assert.equal(pedidos, 1, "um pedido por tecnologia por dia");
  await comFetch(gh, () => rotaRoteiro(req("GET"), env2, "signoz--signoz", dep, { agora: AGORA + 25 * HORA }));
  assert.equal(pedidos, 2);
  assert.deepEqual(lerMilestones([{ title: "x", state: "closed" }, null, { title: "y", state: "open" }]).map((m) => m.titulo), ["y"]);
  assert.equal((await rotaRoteiro(req("GET"), env2, "x--nao", dep)).status, 404);
});

// ---------- ícone ----------
test("ícone: ordem das tentativas (icone, organização, site), pessoa sem avatar, sem nada = lista vazia", () => {
  const org = { repo: "SigNoz/signoz", site: "https://signoz.io", gh: { marca: "https://avatars.githubusercontent.com/u/76905799?s=96", dono: { tipo: "Organization" } } };
  assert.deepEqual(A.iconeDe(org), ["https://avatars.githubusercontent.com/u/76905799?s=96", "/icone/signoz.io"]);
  assert.deepEqual(A.iconeDe({ ...org, icone: "https://signoz.io/logo.png" }), ["https://signoz.io/logo.png", "https://avatars.githubusercontent.com/u/76905799?s=96", "/icone/signoz.io"]);
  const pessoa = { repo: "louislam/uptime-kuma", gh: { marca: "https://avatars.githubusercontent.com/u/1336778?s=96", dono: { tipo: "User" }, site: "https://uptime.kuma.pet" } };
  assert.deepEqual(A.iconeDe(pessoa), ["/icone/uptime.kuma.pet"], "pessoa: nunca o avatar");
  assert.deepEqual(A.iconeDe({ repo: "a/b", leve: {} }), [], "sem nada: o logotipo esmaecido");
  assert.deepEqual(A.iconeDe({ repo: "a/b", icone: "javascript:alert(1)" }), [], "ícone que não é http(s) não entra");
  const aws = PROVEDORES.find((p) => p.id === "aws");
  assert.deepEqual(A.iconeDe(leve[0], aws), ["/icone/aws.amazon.com"], "Cloud: o ícone do provedor");
  assert.deepEqual(A.iconeDe(leve[0], { ...aws, icone: "https://x.dev/aws.svg" }), ["https://x.dev/aws.svg", "/icone/aws.amazon.com"]);
  assert.deepEqual(A.iconeDe({ links: {} }, { id: "x", site: "" }), []);
  assert.equal(A.dominioDe("http://10.0.0.1/"), "", "IP não"); assert.equal(A.dominioDe("https://WWW.Exemplo.dev/x"), "www.exemplo.dev");
});

test("rota do ícone: domínio fora da lista dá 404; só imagem, até 200 KB; SVG com CSP; falha vira 404 com cache de 1 dia", async () => {
  const { env, dep } = await semeado();
  await semearLandscape(env, AGORA);
  const doms = await dominiosPermitidos(env, dep);
  assert.ok(doms.has("aws.amazon.com") && doms.has("www.cloudflare.com") && doms.has("neon.tech"), "sites dos provedores");
  assert.ok(doms.has("workers.cloudflare.com"), "links.produto dos serviços");
  const cacheFalso = () => { const m = new Map(); return { m, match: async (r) => m.get(r.url)?.clone() || undefined, put: async (r, x) => { m.set(r.url, x); } }; };
  let pedidos = [];
  const f = (mapa) => async (u) => { pedidos.push(String(u)); const x = mapa[String(u)]; return x ? x() : new Response("", { status: 404 }); };
  const r404 = await rotaIcone(req("GET"), env, "evil.example", { ...dep, cache: null, fetcher: f({}) });
  assert.equal(r404.status, 404); assert.equal(pedidos.length, 0, "fora da lista não sai para a rede");
  const png = new Uint8Array([137, 80, 78, 71]);
  const c1 = cacheFalso();
  const ok = await rotaIcone(req("GET"), env, "neon.tech", { ...dep, cache: c1, fetcher: f({ "https://neon.tech/favicon.ico": () => new Response(png, { headers: { "content-type": "image/png" } }) }) });
  assert.equal(ok.status, 200); assert.equal(ok.headers.get("content-type"), "image/png"); assert.equal(ok.headers.get("x-content-type-options"), "nosniff");
  assert.match(ok.headers.get("cache-control"), /max-age=604800/);
  pedidos = [];
  const deNovo = await rotaIcone(req("GET"), env, "neon.tech", { ...dep, cache: c1, fetcher: f({}) });
  assert.equal(deNovo.status, 200); assert.equal(pedidos.length, 0, "do cache");
  // favicon que é HTML: tenta o <link rel="icon"> da página
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>';
  const s = await rotaIcone(req("GET"), env, "supabase.com", { ...dep, cache: null, fetcher: f({
    "https://supabase.com/favicon.ico": () => new Response("<html>", { headers: { "content-type": "text/html" } }),
    "https://supabase.com/": () => new Response('<html><head><link rel="icon" type="image/svg+xml" href="/favicon/favicon.svg"></head></html>', { headers: { "content-type": "text/html" } }),
    "https://supabase.com/favicon/favicon.svg": () => new Response(svg, { headers: { "content-type": "image/svg+xml" } }) }) });
  assert.equal(s.status, 200); assert.equal(s.headers.get("content-security-policy"), "default-src 'none'");
  // grande demais e tipo errado: 404 com cache de 1 dia
  const c2 = cacheFalso();
  const g = await rotaIcone(req("GET"), env, "render.com", { ...dep, cache: c2, fetcher: f({ "https://render.com/favicon.ico": () => new Response(new Uint8Array(MAX_ICONE + 1), { headers: { "content-type": "image/x-icon" } }) }) });
  assert.equal(g.status, 404); assert.match(g.headers.get("cache-control"), /max-age=86400/);
  assert.ok(c2.m.size === 1, "a falha também fica no cache");
  const t = await rotaIcone(req("GET"), env, "railway.com", { ...dep, cache: null, fetcher: f({ "https://railway.com/favicon.ico": () => new Response("x", { headers: { "content-type": "application/javascript" } }) }) });
  assert.equal(t.status, 404);
  assert.equal(iconeDaPagina('<link rel="shortcut icon" href="https://cdn.x.com/i.png">', "https://x.com/"), "https://cdn.x.com/i.png");
  assert.equal(iconeDaPagina('<link rel="mask-icon" href="/m.svg"><link rel="apple-touch-icon" href="/a.png">', "https://x.com/"), "https://x.com/a.png");
  assert.equal(iconeDaPagina('<link rel="icon" href="data:image/png;base64,AA">', "https://x.com/"), "");
});

// ---------- comparação profunda ----------
test("estadoDaAnalise: pendente, pronta, vencida e falhou; expiraEm ausente cai no cálculo por prontoEm", () => {
  const pronto = { estado: "pronto", prontoEm: new Date(AGORA).toISOString() };
  assert.equal(A.estadoDaAnalise({ estado: "pendente" }, AGORA), "pendente");
  assert.equal(A.estadoDaAnalise(pronto, AGORA + 29 * DIA), "pronta");
  assert.equal(A.estadoDaAnalise(pronto, AGORA + 30 * DIA), "vencida", "no dia 31 venceu");
  assert.equal(A.expiraDe(pronto), new Date(AGORA + 30 * DIA).toISOString());
  assert.equal(A.estadoDaAnalise({ ...pronto, expiraEm: new Date(AGORA + 5 * DIA).toISOString() }, AGORA + 6 * DIA), "vencida", "expiraEm da tarefa vale");
  assert.equal(A.estadoDaAnalise({ estado: "falhou" }, AGORA), "falhou"); assert.equal(A.estadoDaAnalise(null, AGORA), "falhou");
});

test("dossiês: contrato, travas, existente dentro da validade, novo no dia 31, ordem dos ids e as duas consultas da tarefa", async () => {
  const { env, dep } = await semeado();
  const ids = ["cloudflare--r2", "aws--amazon-s3"];
  const post = (b, q = ADMIN, agora = AGORA) => corpoDe(rotaDossies(req("POST", b), env, q, "", dep, { agora }));
  assert.equal((await rotaDossies(req("POST", { aba: "cloud", ids }), env, CONVIDADO, "", dep)).status, 404, "só o Admin");
  assert.equal((await post({ aba: "cloud", ids: ["aws--amazon-s3", "aws--amazon-ec2"] })).status, 400, "subcategorias diferentes");
  assert.equal((await post({ aba: "cloud", ids: ["aws--amazon-s3"] })).status, 400, "um só");
  assert.equal((await post({ aba: "cloud", ids, contexto: "x".repeat(601) })).status, 400);
  const a = await post({ aba: "cloud", ids, contexto: "  Backup de 20 TB  com leitura rara. " });
  assert.equal(a.status, 201, JSON.stringify(a.j)); assert.equal(a.j.existente, false);
  const d = a.j.dossie;
  assert.match(d.id, /^d[0-9a-f]{16}$/);
  const guardado = docDe(env, "arch-dossies", d.id);
  assert.deepEqual(Object.keys(guardado).sort(), ["aba", "contexto", "criado", "estado", "expiraEm", "fontes", "forcado", "ids", "markdown", "pedidoEm", "por", "prontoEm", "resposta", "subcategoria"].sort());
  assert.equal(guardado.estado, "pendente"); assert.equal(guardado.subcategoria, "objetos"); assert.equal(guardado.contexto, "Backup de 20 TB com leitura rara."); assert.equal(guardado.por, ADMIN.email);
  // mesmo conjunto em outra ordem, pendente: devolve o que existe
  const b = await post({ aba: "cloud", ids: ids.slice().reverse() });
  assert.equal(b.status, 200); assert.equal(b.j.existente, true); assert.equal(b.j.dossie.id, d.id);
  // a tarefa lê e fecha com as consultas do contrato, como estão
  const pend = env.DB.db.prepare(SQL_PENDENTES).all();
  assert.deepEqual(pend.map((r) => r.id), [d.id]);
  const prontoEm = new Date(AGORA + HORA).toISOString();
  env.DB.db.prepare(SQL_FECHAR).run(JSON.stringify({ estado: "pronto", prontoEm, markdown: "# Análise\n\nTexto de teste.", fontes: [{ titulo: "R2", url: "https://developers.cloudflare.com/r2/", em: prontoEm }] }), d.id);
  assert.equal(env.DB.db.prepare(SQL_PENDENTES).all().length, 0);
  // pronta e válida: o mesmo pedido devolve a análise guardada, sem pedido novo e sem gastar a trava
  const antes = env.DB.db.prepare("SELECT count(*) AS n FROM docs WHERE collection = 'arch-dossies'").get().n;
  const c = await post({ aba: "cloud", ids }, ADMIN, AGORA + 29 * DIA);
  assert.equal(c.status, 200); assert.equal(c.j.existente, true); assert.equal(c.j.dossie.situacao, "pronta"); assert.match(c.j.dossie.markdown, /Texto de teste/);
  assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM docs WHERE collection = 'arch-dossies'").get().n, antes);
  // forçar dentro da validade ("Atualizar análise"): o mesmo doc volta a pendente, com o markdown antigo guardado
  const f = await post({ aba: "cloud", ids: ids.slice().reverse(), forcar: true }, ADMIN, AGORA + 2 * DIA);
  assert.equal(f.status, 200); assert.equal(f.j.existente, false); assert.equal(f.j.dossie.id, d.id, "sobrescreve o mesmo id");
  let g = docDe(env, "arch-dossies", d.id);
  assert.equal(g.estado, "pendente"); assert.equal(g.forcado, true); assert.equal(g.pedidoEm, new Date(AGORA + 2 * DIA).toISOString());
  assert.match(g.markdown, /Texto de teste/, "a análise antiga segue até a nova chegar");
  assert.equal(env.DB.db.prepare("SELECT count(*) AS n FROM docs WHERE collection = 'arch-dossies'").get().n, antes, "nada de duplicar");
  // forçar com o pedido já pendente não duplica nem muda nada
  const f2 = await post({ aba: "cloud", ids, forcar: true }, ADMIN, AGORA + 2 * DIA + HORA);
  assert.equal(f2.j.existente, true); assert.equal(docDe(env, "arch-dossies", d.id).pedidoEm, new Date(AGORA + 2 * DIA).toISOString());
  // a tarefa fecha: a nova sobrescreve o mesmo doc
  const pronto2 = new Date(AGORA + 3 * DIA).toISOString();
  env.DB.db.prepare(SQL_FECHAR).run(JSON.stringify({ estado: "pronto", prontoEm: pronto2, expiraEm: null, markdown: "# Nova\n\nSegunda versão.", forcado: false }), d.id);
  g = docDe(env, "arch-dossies", d.id);
  assert.match(g.markdown, /Segunda versão/); assert.equal(A.estadoDaAnalise(g, AGORA + 4 * DIA), "pronta");
  // vencida: abrir pede de novo, uma vez só (o mesmo doc volta a pendente; abrir de novo devolve o pendente)
  const venc = AGORA + 3 * DIA + 30 * DIA + 1;
  const v1 = await post({ aba: "cloud", ids }, ADMIN, venc);
  assert.equal(v1.status, 200); assert.equal(v1.j.renovado, true); assert.equal(v1.j.dossie.id, d.id);
  const v2 = await post({ aba: "cloud", ids }, ADMIN, venc + HORA);
  assert.equal(v2.j.existente, true); assert.equal(v2.j.dossie.id, d.id);
  g = docDe(env, "arch-dossies", d.id);
  assert.equal(g.estado, "pendente"); assert.equal(g.forcado, false); assert.match(g.markdown, /Segunda versão/, "o markdown vencido fica visível");
  assert.equal(env.DB.db.prepare(SQL_PENDENTES).all().length, 1, "um pedido só");
  const aba = await corpoDe(rotaDossies(req("GET", null, "https://x/api/admin/arch/dossies?aba=cloud&ids=" + ids.join(",")), env, ADMIN, "", dep, { agora: venc + HORA }));
  assert.equal(aba.j.pendente.id, d.id); assert.match(aba.j.pendente.markdown, /Segunda versão/); assert.equal(aba.j.pronta, null);
  // lista e um por id
  const l = await corpoDe(rotaDossies(req("GET"), env, ADMIN, "", dep, { agora: venc }));
  assert.equal(l.j.dossies.length, 1); assert.ok(l.j.dossies.every((x) => !("markdown" in x)));
  assert.equal((await corpoDe(rotaDossies(req("GET"), env, ADMIN, d.id, dep, { agora: AGORA }))).j.dossie.expiraEm, new Date(AGORA + 3 * DIA + 30 * DIA).toISOString());
  assert.equal((await rotaDossies(req("GET"), env, ADMIN, "dzz", dep)).status, 400);
  // travas: no máximo 3 pendentes (já há 1)
  const conj = [["aws--amazon-ec2", "gcp--compute-engine"], ["aws--aws-lambda", "cloudflare--cloudflare-workers"], ["aws--amazon-rds", "gcp--cloud-sql"]];
  assert.equal((await post({ aba: "cloud", ids: conj[0] }, ADMIN, venc)).status, 201);
  assert.equal((await post({ aba: "cloud", ids: conj[1] }, ADMIN, venc)).status, 201);
  const t = await post({ aba: "cloud", ids: conj[2] }, ADMIN, venc);
  assert.equal(t.status, 429); assert.match(t.j.erro, new RegExp(String(MAX_PENDENTES)));
  assert.equal((await rotaDossies(req("DELETE"), env, ADMIN, d.id, dep)).status, 200);
  assert.equal(docDe(env, "arch-dossies", d.id), null);
  // 10 por dia
  const env3 = (await semeado()).env;
  for (let i = 0; i < MAX_POR_DIA; i++) env3.DB.db.prepare("INSERT INTO docs (collection, id, data) VALUES ('arch-dossies', ?, ?)").run("d" + String(i).padStart(16, "0"), JSON.stringify({ aba: "cloud", ids: ["x--" + i, "y--" + i], estado: "falhou", criado: new Date(AGORA - HORA).toISOString() }));
  const dez = await corpoDe(rotaDossies(req("POST", { aba: "cloud", ids }), env3, ADMIN, "", dep, { agora: AGORA }));
  assert.equal(dez.status, 429); assert.match(dez.j.erro, /10 pedidos por dia/);
});

test("dossiês: limpeza de 180 dias por lista de ids; linha nova no relatório das rotinas", async () => {
  const env = { DB: d1Falso() };
  const pôr = (id, criado, estado = "pronto") => env.DB.db.prepare("INSERT INTO docs (collection, id, data) VALUES ('arch-dossies', ?, ?)").run(id, JSON.stringify({ aba: "cloud", ids: ["a--a", "b--b"], estado, criado }));
  pôr("d0000000000000001", new Date(AGORA - 181 * DIA).toISOString());
  pôr("d0000000000000002", new Date(AGORA - 179 * DIA).toISOString());
  assert.deepEqual(await limparDossies(env, AGORA), ["d0000000000000001"]);
  assert.deepEqual(env.DB.db.prepare("SELECT id FROM docs WHERE collection = 'arch-dossies'").all().map((r) => r.id), ["d0000000000000002"]);
  assert.ok(env.DB.log.some((s) => /DELETE FROM docs WHERE collection = 'arch-dossies' AND id IN \(\?1\)/.test(s)));
  // relatório: pendente há mais de 2 h é atrasado, mais de 6 h é parado
  assert.equal(estadoDossies({ pendentes: 1, maisAntigo: new Date(AGORA - HORA).toISOString() }, AGORA).estado, "em dia");
  assert.equal(estadoDossies({ pendentes: 1, maisAntigo: new Date(AGORA - 3 * HORA).toISOString() }, AGORA).estado, "atrasada");
  assert.equal(estadoDossies({ pendentes: 1, maisAntigo: new Date(AGORA - 7 * HORA).toISOString() }, AGORA).estado, "parada");
  pôr("d0000000000000003", new Date(AGORA - 3 * HORA).toISOString(), "pendente");
  const r = await relatorio(env, { agora: AGORA });
  const linha = r.curadorias.find((l) => l.id === "dossies");
  assert.equal(linha.nome, "Dossiês de ArchLandscape"); assert.equal(linha.estado, "atrasada"); assert.equal(linha.pendentes, 1);
});
