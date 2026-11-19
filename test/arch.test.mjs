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
