// Admin em menu com submenus (pedido de 20/11, 14h29): Admin.rota, Admin.inicial e o caminho de cada tela.
import test from "node:test";
import assert from "node:assert/strict";
import "../public/admin-menu.js";

const A = globalThis.Admin;

test("menu na ordem do pedido, com os submenus de cada um", () => {
  assert.deepEqual(A.MENU.map((m) => m.nome), ["Pessoas", "Curadoria", "Conteúdo", "Custos", "Health Checks"]);
  assert.deepEqual(A.menuDe("pessoas").subs.map((s) => s.nome), ["Convidar", "Grupos e seções", "Na lista"]);
  assert.deepEqual(A.menuDe("curadoria").subs.map((s) => s.nome), ["Rodadas", "Instruções", "Pedidos"]);
  assert.deepEqual(A.menuDe("custos").subs.map((s) => s.nome), ["Custos e consumo"]);
  assert.deepEqual(A.menuDe("health").subs.map((s) => s.nome), ["Resumo", "Tarefas agendadas", "Worker e cron", "Fontes", "Dados externos", "Banco e espelho", "Configuração", "Integridade"]);
  assert.deepEqual(A.subDe(A.menuDe("health"), "fontes").telas.map((t) => t.id), ["rendimento", "sondar"]);
  // cada tela tem título e uma frase
  for (const m of A.MENU) for (const s of m.subs) { assert.ok(s.titulo && s.frase, m.id + "/" + s.id); for (const t of s.telas || []) assert.ok(t.nome && t.frase); }
});

test("Admin.rota: endereços válidos", () => {
  const r = A.rota("#health/fontes/sondar");
  assert.deepEqual({ menu: r.menu, submenu: r.submenu, tela: r.tela, param: r.param, valido: r.valido, vazio: r.vazio, hash: r.hash },
    { menu: "health", submenu: "fontes", tela: "sondar", param: "", valido: true, vazio: false, hash: "#health/fontes/sondar" });
  assert.equal(A.rota("#pessoas/lista").submenu, "lista");
  assert.equal(A.rota("#pessoas/lista").valido, true);
  assert.equal(A.rota("curadoria/pedidos").submenu, "pedidos"); // sem o #
  // só o menu: primeiro submenu dele (o avatar do site leva a /admin#health)
  const h = A.rota("#health");
  assert.equal(h.menu, "health"); assert.equal(h.submenu, "resumo"); assert.equal(h.valido, true); assert.equal(h.hash, "#health/resumo");
  assert.equal(A.rota("#custos").hash, "#custos/consumo");
  // instruções de uma seção
  const i = A.rota("#curadoria/instrucoes/saude");
  assert.equal(i.param, "saude"); assert.equal(i.valido, true); assert.equal(i.hash, "#curadoria/instrucoes/saude");
  // barra no fim não atrapalha
  assert.equal(A.rota("#health/fontes/").hash, "#health/fontes");
  assert.equal(A.rota("#health/fontes/").valido, true);
});

test("Admin.rota: vazio, antigo ou desconhecido cai na primeira tela, sem erro", () => {
  for (const h of ["", "#", null, undefined]) {
    const r = A.rota(h);
    assert.equal(r.vazio, true); assert.equal(r.valido, false);
    assert.equal(r.hash, "#pessoas/convidar");
  }
  // hashes do /admin antigo e lixo
  for (const h of ["#instrucoes/tech", "#fontes-card", "#xyz", "#%E0%A4%A", "#<script>", "#" + "a".repeat(5000)]) {
    const r = A.rota(h);
    assert.equal(r.valido, false, h.slice(0, 20)); assert.equal(r.vazio, false);
    assert.equal(r.menu, "pessoas"); assert.equal(r.submenu, "convidar");
  }
  // menu conhecido, submenu ou tela desconhecida: o primeiro submenu daquele menu (ou o próprio submenu)
  assert.equal(A.rota("#health/naoexiste").hash, "#health/resumo");
  assert.equal(A.rota("#health/naoexiste").valido, false);
  assert.equal(A.rota("#health/fontes/outra").hash, "#health/fontes");
  assert.equal(A.rota("#health/fontes/outra").valido, false);
  assert.equal(A.rota("#curadoria/instrucoes/carteira").hash, "#curadoria/instrucoes");
  assert.equal(A.rota("#curadoria/instrucoes/carteira").valido, false);
  assert.equal(A.rota("#pessoas/lista/extra").hash, "#pessoas/lista");
  assert.equal(A.rota("#health/resumo/sondar").valido, false);
});

test("Admin.inicial: com problema abre o Resumo; tudo em dia, Pessoas › Convidar", () => {
  assert.equal(A.inicial(2).hash, "#health/resumo");
  assert.equal(A.inicial(0).hash, "#pessoas/convidar");
  assert.equal(A.inicial(undefined).hash, "#pessoas/convidar");
});

test("caminho clicável e tela", () => {
  assert.deepEqual(A.caminho(A.rota("#health/fontes/sondar")), [
    { nome: "Health Checks", hash: "#health" }, { nome: "Fontes", hash: "#health/fontes" }, { nome: "Sondar feeds", hash: "#health/fontes/sondar" }]);
  assert.deepEqual(A.caminho(A.rota("#pessoas/grupos")).map((c) => c.nome), ["Pessoas", "Grupos e seções"]);
  assert.equal(A.tela(A.rota("#health/fontes/rendimento")).titulo, "Rendimento das fontes");
  assert.equal(A.tela(A.rota("#pessoas/convidar")).titulo, "Convidar alguém");
  assert.deepEqual(A.caminho({ menu: "x", submenu: "y" }), []);
});
