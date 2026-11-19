// ArchLandscape (pedido de 19/11): abas Tools e Cloud, hashes (inclusive os antigos do Landscape), regras puras de
// Cloud (filtros, agrupamento, equivalentes, comparar, citação, novidades), características, ícone e análise profunda.
import test from "node:test";
import assert from "node:assert/strict";
import "../public/landscape.js";
import "../public/arch.js";

const A = globalThis.Arch;
const L = globalThis.Landscape;

test("hash: abas Tools e Cloud, detalhe, comparar, profundas e ida e volta", () => {
  assert.deepEqual(A.lerHash("#arch/tools").aba, "tools");
  assert.equal(A.lerHash("#arch/tools").tela, "grade");
  assert.equal(A.lerHash("#arch/cloud").aba, "cloud");
  const d = A.lerHash("#arch/tools/signoz--signoz");
  assert.equal(d.tela, "detalhe"); assert.equal(d.id, "signoz--signoz");
  const c = A.lerHash("#arch/cloud/comparar/aws--amazon-s3,cloudflare--r2/profunda");
  assert.equal(c.tela, "comparar"); assert.deepEqual(c.ids, ["aws--amazon-s3", "cloudflare--r2"]); assert.equal(c.profunda, true);
  assert.equal(A.lerHash("#arch/cloud/profundas").tela, "profundas");
  assert.equal(A.lerHash("#arch/cloud/profundas/d0123456789abcdef").tela, "profunda");
  assert.equal(A.lerHash("#arch/cloud/profundas/x").tela, "profundas", "id fora do formato: a lista");
  for (const h of ["#arch/tools", "#arch/tools/signoz--signoz", "#arch/cloud", "#arch/cloud/aws--amazon-s3", "#arch/cloud/comparar/a--b,c--d", "#arch/tools/comparar/a--b,c--d/profunda", "#arch/cloud/profundas", "#arch/tools/profundas/d0123456789abcdef"])
    assert.equal(A.escreverHash(A.lerHash(h)), h, "ida e volta: " + h);
  assert.equal(A.lerHash("#tech"), null); assert.equal(A.lerHash("#inicio"), null); assert.equal(A.lerHash(""), null);
});

test("hash antigo do Landscape abre a aba Tools, marcado para trocar o endereço", () => {
  const g = A.lerHash("#tech/landscape");
  assert.equal(g.aba, "tools"); assert.equal(g.tela, "grade"); assert.equal(g.antigo, true);
  assert.equal(A.escreverHash(g), "#arch/tools");
  const d = A.lerHash("#tech/landscape/louislam--uptime-kuma");
  assert.equal(d.tela, "detalhe"); assert.equal(d.antigo, true);
  assert.equal(A.escreverHash(d), "#arch/tools/louislam--uptime-kuma");
  assert.equal(A.lerHash("#arch/tools").antigo, false);
  assert.equal(A.lerHash("#arch").antigo, false); assert.equal(A.escreverHash(A.lerHash("#arch")), "#arch/tools");
  assert.equal(A.lerHash("#arch/xyz").antigo, true, "aba desconhecida: vai para Tools e troca o endereço");
});

test("hash de Cloud guarda os filtros (para o Voltar)", () => {
  const f = { provs: ["aws", "hetzner"], alt: true, gratis: true, cat: "armazenamento", q: "s3 compat", por: "provedor" };
  const h = A.escreverHash({ aba: "cloud", tela: "grade", filtros: f });
  assert.equal(h, "#arch/cloud?p=aws,hetzner&alt=1&gratis=1&cat=armazenamento&q=s3%20compat&por=provedor");
  assert.deepEqual(A.lerHash(h).filtros, f);
  assert.deepEqual(A.lerHash("#arch/cloud?p=AWS,../x&cat=<b>&por=zzz").filtros, A.FILTROS_VAZIOS(), "lixo vira filtro vazio");
});

test("nome curto do cartão de Cloud: sai o prefixo do provedor, fica o resto", () => {
  assert.equal(A.nomeCurto("Amazon EC2", "aws"), "EC2");
  assert.equal(A.nomeCurto("AWS Lambda", { id: "aws", nome: "Amazon Web Services" }), "Lambda");
  assert.equal(A.nomeCurto("Azure Blob Storage", "azure"), "Blob Storage");
  assert.equal(A.nomeCurto("Microsoft Entra ID", "azure"), "Entra ID");
  assert.equal(A.nomeCurto("Google Kubernetes Engine", "gcp"), "Kubernetes Engine");
  assert.equal(A.nomeCurto("Cloud Run", "gcp"), "Cloud Run");
  assert.equal(A.nomeCurto("OCI Object Storage", "oci"), "Object Storage");
  assert.equal(A.nomeCurto("Cloudflare Workers", "cloudflare"), "Workers");
  assert.equal(A.nomeCurto("Fly.io Apps", "flyio"), "Apps");
  assert.equal(A.nomeCurto("Linode Compute Instances", "akamai"), "Compute Instances");
  assert.equal(A.nomeCurto("Railway", "railway"), "Railway");
  assert.equal(A.nomeCurto("R2", "cloudflare"), "R2");
  assert.equal(A.nomeCurto("Amazonas Algo", "aws"), "Amazonas Algo");
});

test("cores do provedor: até três, do doc, da tabela ou a cor única; faixa em blocos iguais", () => {
  assert.deepEqual(A.coresDe({ id: "gcp", cor: "#4285F4" }), ["#4285F4", "#EA4335", "#FBBC04"]);
  assert.deepEqual(A.coresDe({ id: "hetzner", cor: "#D50C2D" }), ["#D50C2D"]);
  assert.deepEqual(A.coresDe({ id: "gcp", cores: ["#111111", "nada", "#222222", "#333333", "#444444"] }), ["#111111", "#222222", "#333333"]);
  assert.deepEqual(A.coresDe(null), ["#888888"]);
  assert.equal(A.faixaCores(["#111111", "#222222"], "direita"), "linear-gradient(to right, #111111 0% 50%, #222222 50% 100%)");
  assert.match(A.faixaCores(["#111111", "#222222", "#333333"], "baixo"), /^linear-gradient\(to bottom, #111111 0% 33%, #222222 33% 67%, #333333 67% 100%\)$/);
});

// ---------- comparação profunda em colunas (pedido de 19/11, 20h13) ----------
import { IDS2, IDS3, estrutura2, estrutura3, fontes2, fontes3 } from "./fixtures-profunda.mjs";

test("estruturaOk: a válida passa inteira, na ordem dos itens, uma célula por item", () => {
  const e = A.estruturaOk(estrutura3(), IDS3, fontes3().length);
  assert.ok(e);
  assert.deepEqual(e.itens.map((i) => i.id), IDS3);
  assert.equal(e.resumo.length, 5);
  assert.deepEqual(e.porItem.map((p) => p.id), IDS3);
  assert.deepEqual(e.grupos.map((g) => g.titulo), A.TITULOS_GRUPOS);
  for (const g of e.grupos) for (const l of g.linhas) assert.deepEqual(l.celulas.map((c) => c.id), IDS3, l.rotulo);
  for (const c of e.cenarios) assert.deepEqual(c.celulas.map((x) => x.id), IDS3);
  assert.equal(e.grupos[0].linhas[1].nota, "Mudar de classe muda a latência de leitura.");
  assert.ok(!("nota" in e.grupos[0].linhas[0]), "nota só quando tem");
  assert.equal(e.cenarios[0].perde, "Arquivamento com recuperação em horas, que só o S3 tem.");
  // ordem de `itens` vale, mesmo que os ids do pedido venham ordenados de outro jeito
  const inv = estrutura2(); inv.itens.reverse();
  const e2 = A.estruturaOk(inv, IDS2.slice().sort(), fontes2().length);
  assert.deepEqual(e2.itens.map((i) => i.id), IDS2.slice().reverse());
  assert.deepEqual(e2.grupos[0].linhas[0].celulas.map((c) => c.id), IDS2.slice().reverse(), "células seguem a ordem das colunas");
});

test("estruturaOk: corta os tamanhos e os limites de quantidade", () => {
  const e = estrutura2();
  e.resumo = Array.from({ length: 9 }, (_, i) => ({ texto: "ponto " + i + " " + "x".repeat(300), fontes: [1] }));
  e.porItem[0].fortes = Array.from({ length: 8 }, () => ({ texto: "y".repeat(200) }));
  e.grupos = Array.from({ length: 15 }, (_, g) => ({ titulo: "Grupo " + g + " " + "t".repeat(80), linhas: Array.from({ length: 45 }, (_, k) => ({ rotulo: "r".repeat(90) + k, difere: "sim", nota: "n".repeat(250), celulas: IDS2.map((id) => ({ id, marca: "sim", texto: "c".repeat(200) })) })) }));
  e.cenarios = Array.from({ length: 14 }, (_, k) => ({ cenario: "c".repeat(150) + k, perde: "p".repeat(250), celulas: IDS2.map((id) => ({ id, encaixe: "forte", porque: "q".repeat(250) })) }));
  e.itens[0].nome = "N".repeat(120);
  const s = A.estruturaOk(e, IDS2, 5);
  assert.equal(s.resumo.length, 6); assert.equal(s.resumo[0].texto.length, 220);
  assert.equal(s.porItem[0].fortes.length, 5); assert.equal(s.porItem[0].fortes[0].texto.length, 140);
  assert.equal(s.grupos.length, 12); assert.equal(s.grupos[0].titulo.length, 60);
  assert.equal(s.grupos[0].linhas.length, 40); assert.equal(s.grupos[0].linhas[0].rotulo.length, 60);
  assert.equal(s.grupos[0].linhas[0].nota.length, 200); assert.equal(s.grupos[0].linhas[0].celulas[0].texto.length, 160);
  assert.equal(s.grupos[0].linhas[0].difere, false, "difere só com true de verdade");
  assert.equal(s.cenarios.length, 12); assert.equal(s.cenarios[0].cenario.length, 120); assert.equal(s.cenarios[0].perde.length, 200); assert.equal(s.cenarios[0].celulas[0].porque.length, 200);
  assert.equal(s.itens[0].nome.length, 80);
});

test("estruturaOk: id desconhecido, marca inválida, fonte fora da lista e texto com preço", () => {
  const e = estrutura2();
  e.itens.push({ id: "gcp--cloud-storage", nome: "Intrusa" }, { id: "aws--amazon-s3", nome: "Repetida" });
  const l = e.grupos[0].linhas[0];
  l.celulas = [{ id: "gcp--cloud-storage", marca: "sim", texto: "não é do pedido" }, { id: "cloudflare--r2", marca: "talvez", texto: "Cobre o comum", fontes: [4, 99, 0, -1, 2.5, "3", 4] }];
  e.cenarios[0].celulas[0].encaixe = "excelente";
  e.porItem.push({ id: "gcp--cloud-storage", fortes: [{ texto: "intrusa" }], fracos: [] });
  e.grupos[1].linhas[0].celulas[0].texto = "Custa US$ 0,023 por GB";
  e.resumo.push({ texto: "Sai por R$ 0,10 o GB", fontes: [1] });
  const s = A.estruturaOk(e, IDS2, 5);
  assert.deepEqual(s.itens.map((i) => i.id), IDS2, "só os ids do pedido, sem repetir");
  assert.equal(s.itens[0].nome, "Amazon S3", "o primeiro de cada id vale");
  const c = s.grupos[0].linhas[0].celulas;
  assert.deepEqual(c.map((x) => x.id), IDS2);
  assert.deepEqual(c[0], { id: "aws--amazon-s3", marca: "", texto: "", fontes: [] }, "faltou: célula vazia");
  assert.equal(c[1].marca, "", "marca inválida vira vazia");
  assert.deepEqual(c[1].fontes, [4, 3], "fonte fora da lista some e não repete");
  assert.equal(s.cenarios[0].celulas[0].encaixe, "");
  assert.equal(s.porItem.length, 2);
  assert.equal(s.grupos[1].linhas[0].celulas[0].texto, "", "texto com preço sai");
  assert.ok(!s.resumo.some((p) => /R\$/.test(p.texto)));
  assert.ok(!JSON.stringify(s).includes("Intrusa"));
});

test("estruturaOk: lixo vira null", () => {
  for (const x of [null, undefined, "texto", 3, [], { v: 2, itens: [] }, { itens: estrutura2().itens }, { v: 1, itens: [{ id: "aws--amazon-s3", nome: "S3" }], resumo: [{ texto: "a" }] },
    { v: 1, itens: [{ id: "x--a" }, { id: "y--b" }], resumo: [{ texto: "a" }] }, { v: 1, itens: estrutura2().itens }])
    assert.equal(A.estruturaOk(x, IDS2, 5), null, JSON.stringify(x));
  assert.equal(A.estruturaOk({ ...estrutura2(), v: "1" }, IDS2, 5), null, "v precisa ser o número 1");
  // nada de HTML: o texto passa como texto (a tela põe em nó de texto); objetos no lugar de texto saem
  const e = estrutura2(); e.resumo = [{ texto: { html: "<b>x</b>" } }, { texto: "<img src=x onerror=alert(1)>", fontes: [1] }];
  const s = A.estruturaOk(e, IDS2, 5);
  assert.deepEqual(s.resumo.map((p) => p.texto), ["<img src=x onerror=alert(1)>"]);
});

test("markdownDaEstrutura: tabelas por grupo e de cenários, fontes numeradas, sem preço", () => {
  const e = estrutura3();
  e.grupos[1].linhas[0].celulas[2].texto = "10 TB, US$ 6 por TB";
  const md = A.markdownDaEstrutura(e, fontes3(), "Comparação profunda: S3 × R2 × B2");
  assert.match(md, /^## Comparação profunda: S3 × R2 × B2\n/);
  assert.match(md, /^### Resumo$/m);
  assert.match(md, /^### Pontos fortes e fracos$/m);
  assert.match(md, /^\| \| Amazon S3 \| R2 \| Backblaze B2 \|$/m);
  assert.match(md, /^\|---\|---\|---\|---\|$/m);
  assert.match(md, /^\| Classes de armazenamento \(difere\) \| Sim: Padrão, acesso raro, uma zona, Glacier \[1\] \| Parcial: Padrão e acesso raro \(beta\) \[3\] \| Não: Uma classe só \[6\] \|$/m);
  assert.match(md, /^\| Roda fora da nuvem do provedor \| Não conferido \| Não conferido \| Não conferido \|$/m);
  assert.match(md, /^\| Cenário \| Amazon S3 \| R2 \| Backblaze B2 \|$/m);
  assert.match(md, /O que se perde: Arquivamento/);
  assert.match(md, /^### Não conferido$/m);
  assert.match(md, /^1\. Amazon S3, guia do usuário: https:\/\/docs\.aws\.amazon\.com\/AmazonS3\/latest\/userguide\/Welcome\.html \(lida em 19\/11\/2026\)$/m);
  assert.match(md, /^7\. Backblaze B2, API compatível com S3: /m);
  for (const g of A.TITULOS_GRUPOS) assert.match(md, new RegExp("^### " + g + "$", "m"));
  assert.ok(!/US\$|R\$|€\s?\d/.test(md), "sem preço");
  assert.ok(!/\b(melhor|recomendad|vencedor)/i.test(md), "sem juízo");
  // pipe no texto não quebra a tabela
  const p = estrutura2(); p.grupos[0].linhas[0].celulas[0].texto = "a | b";
  assert.match(A.markdownDaEstrutura(p, fontes2(), ""), /a \\\| b/);
  assert.equal(A.markdownDaEstrutura({ v: 9 }, [], ""), "");
});

test("filtros da matriz: \"Só o que difere\" (ligado com mais de 12 linhas) e \"Mostrar não conferidas\"", () => {
  const e3 = A.estruturaOk(estrutura3(), IDS3, 7), e2 = A.estruturaOk(estrutura2(), IDS2, 5);
  assert.equal(e3.grupos.reduce((k, g) => k + g.linhas.length, 0), 18);
  assert.equal(A.soDifereInicial(e3), true);
  assert.equal(e2.grupos.reduce((k, g) => k + g.linhas.length, 0), 12);
  assert.equal(A.soDifereInicial(e2), false, "12 linhas: começa desligado");
  const op = e3.grupos[2].linhas;
  assert.equal(op.length, 4);
  assert.deepEqual(A.linhasVisiveis(op, {}).map((l) => l.rotulo), ["Região no Brasil (São Paulo)", "Terraform (provider oficial)", "Replicação entre regiões"], "a não conferida fica escondida");
  assert.deepEqual(A.linhasVisiveis(op, { mostrarNc: true }).map((l) => l.rotulo).length, 4);
  assert.deepEqual(A.linhasVisiveis(op, { soDifere: true }).map((l) => l.rotulo), ["Região no Brasil (São Paulo)", "Replicação entre regiões"]);
  assert.ok(A.linhaNc(op[3])); assert.ok(!A.linhaNc(op[0]));
  assert.ok(A.celulaNc({ marca: "", texto: "" })); assert.ok(A.celulaNc({ marca: "nc", texto: "algo" })); assert.ok(!A.celulaNc({ marca: "", texto: "5 TB" }));
});

test("proximaRodada: minuto 37, das 7h às 23h de São Paulo; fora da janela, 7h37", () => {
  const sp = (h, m, s = 0) => Date.parse(`2026-11-19T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}-03:00`);
  const r = (h, m, s) => A.proximaRodada(sp(h, m, s));
  assert.deepEqual([r(14, 5).hora, r(14, 5).texto, r(14, 5).em], ["14:37", "às 14:37", new Date(sp(14, 37)).toISOString()]);
  assert.equal(r(14, 36, 59).hora, "14:37");
  assert.equal(r(14, 37).hora, "15:37", "no minuto 37 a rodada já começou");
  assert.equal(r(7, 0).texto, "às 07:37");
  assert.deepEqual([r(23, 10).hora, r(23, 10).quando], ["23:37", ""]);
  assert.deepEqual([r(23, 40).texto, r(23, 40).quando, r(23, 40).em], ["amanhã às 7h37", "amanha", new Date(sp(7, 37) + 86_400_000).toISOString()]);
  assert.deepEqual([r(3, 0).texto, r(3, 0).em], ["hoje às 7h37", new Date(sp(7, 37)).toISOString()]);
  assert.equal(r(6, 59).texto, "hoje às 7h37");
  assert.equal(r(22, 50).texto, "às 23:37");
  // o texto da tela de pendente
  assert.equal(A.textoPendente(new Date(sp(14, 5)).toISOString(), sp(14, 6)), "Pedido feito às 14:05. A próxima rodada é às 14:37.");
  assert.equal(A.textoPendente(new Date(sp(23, 50) - 86_400_000).toISOString(), sp(9, 0)), "Pedido feito em 18/11 às 23:50. A próxima rodada é às 09:37.");
  assert.equal(A.horaSP("2026-11-19T17:05:00Z"), "14:05");
});

test("roteiro da profunda pede a estrutura, frase curta e nada de parágrafo longo", () => {
  const r = A.roteiroProfunda([{ id: "aws--amazon-s3", nome: "Amazon S3", provedor: "aws" }, { id: "cloudflare--r2", nome: "R2", provedor: "cloudflare" }], { aba: "cloud", provs: [{ id: "aws", nome: "AWS" }, { id: "cloudflare", nome: "Cloudflare" }], sub: "objetos", subNome: "Objetos" });
  for (const t of [/`estrutura`/, /parágrafo longo não serve/, /itens: \[\{ id, nome \}\]/, /resumo: de 3 a 6 pontos/, /porItem/, /difere/, /"sim", "nao", "parcial", "nc"/, /cenarios/, /"forte", "medio", "fraco" ou "nc"/, /naoConferido/, /a partir de 1/, /"Capacidades", "Limites", "Opções de uso e operação", "Maturidade e ritmo", "Dependência do fornecedor"/, /Não inclua preço/, /id aws--amazon-s3/])
    assert.match(r, t);
  assert.ok(!/\b(melhor|recomendad|barat|oportunidade)/i.test(r));
});
