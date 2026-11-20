/* Admin em menu com submenus (pedido de 20/11, 14h29): "Quebre o que puder de adm em submenus de adm."
 *
 * Script clássico (<script src="/admin-menu.js">), como o landscape.js: o /admin usa window.Admin e os testes em Node
 * importam pelo efeito e leem globalThis.Admin. Sem import nem export.
 *
 * Endereço: #<menu>/<submenu>[/<mais>]. Cada submenu é uma tela; só a tela aberta carrega os dados dela.
 * - #health abre o primeiro submenu do menu (Health Checks › Resumo); #pessoas, Pessoas › Convidar.
 * - #health/fontes/rendimento e #health/fontes/sondar são telas próprias dentro de Fontes.
 * - #curadoria/instrucoes/<secao> abre o editor das instruções da seção.
 * - Hash vazio: a página escolhe (Admin.inicial): Health Checks › Resumo quando há problema, Pessoas › Convidar quando
 *   está tudo em dia. Hash antigo ou desconhecido cai na primeira tela (Pessoas › Convidar), sem erro; menu conhecido com
 *   submenu desconhecido cai no primeiro submenu daquele menu. Os dois voltam com valido: false.
 */
(function (raiz) {
  "use strict";

  const SECOES = ["tech", "negocios", "investimentos", "politica", "esportes", "oficina", "saude"];

  /* A ordem é a do pedido. `frase`: o que a tela é, numa linha. `telas`: as telas de dentro do submenu (a primeira, sem
     id, é a do próprio submenu). `grupo`: o bloco de GET /api/admin/health que a tela mostra. */
  const MENU = [
    { id: "pessoas", nome: "Pessoas", subs: [
      { id: "convidar", nome: "Convidar", titulo: "Convidar alguém", frase: "Põe um e-mail na lista de convidados e já escolhe os grupos da pessoa." },
      { id: "grupos", nome: "Grupos e seções", titulo: "Grupos e seções", frase: "Cada grupo libera algumas seções; o convidado vê a soma das seções dos grupos dele." },
      { id: "lista", nome: "Na lista", titulo: "Na lista", frase: "Quem pode entrar no Lookout, com o último acesso e os grupos de cada um." },
    ] },
    { id: "curadoria", nome: "Curadoria", subs: [
      { id: "rodadas", nome: "Rodadas", titulo: "Rodadas da curadoria", frase: "Cada seção é escrita por uma tarefa agendada, três vezes ao dia. \"Rodar agora\" pede uma rodada fora de hora." },
      { id: "instrucoes", nome: "Instruções", titulo: "Instruções", frase: "O texto que cada tarefa de curadoria lê no começo da rodada, com as versões anteriores.", param: "secao" },
      { id: "pedidos", nome: "Pedidos", titulo: "Pedidos à curadoria", frase: "Um link para incluir, um assunto para procurar ou uma fonte para olhar com mais atenção." },
    ] },
    { id: "conteudo", nome: "Conteúdo", subs: [
      { id: "arch", nome: "ArchLandscape", titulo: "ArchLandscape", frase: "Categorias das tecnologias e provedores da nuvem. A edição fica na própria seção Tech." },
      { id: "oficina", nome: "Oficina", titulo: "Oficina", frase: "Categorias de ferramentas e de insumos. A edição fica na própria seção Oficina." },
      { id: "saude", nome: "Saúde", titulo: "Saúde", frase: "Os produtos acompanhados no Radar de Saúde. A edição fica na própria seção." },
    ] },
    { id: "custos", nome: "Custos", subs: [
      { id: "consumo", nome: "Custos e consumo", titulo: "Custos e consumo", frase: "Quanto a conta da Cloudflare deve fechar no mês e quanto do plano já foi usado." },
    ] },
    { id: "health", nome: "Health Checks", subs: [
      { id: "resumo", nome: "Resumo", titulo: "Resumo", frase: "Uma linha por grupo de conferências, com o pior estado de cada um." },
      { id: "tarefas", nome: "Tarefas agendadas", titulo: "Tarefas agendadas", frase: "As tarefas do Claude que escrevem no banco, julgadas pelo último rastro que cada uma deixou.", grupo: "tarefas" },
      { id: "worker", nome: "Worker e cron", titulo: "Worker e cron", frase: "As etapas do cron de minuto em minuto: última execução, quanto levou e o último erro.", grupo: "worker" },
      { id: "fontes", nome: "Fontes", titulo: "Fontes", frase: "Feeds com erros seguidos e as listas de fontes que ainda faltam sondar.", grupo: "fontes",
        telas: [{ id: "rendimento", nome: "Rendimento das fontes", frase: "Dos links que o robô trouxe nos últimos 10 dias, quantos a curadoria publicou e quantos descartou, por quê." },
          { id: "sondar", nome: "Sondar feeds", frase: "Testa URLs de feed com o mesmo leitor da coleta antes de pôr na lista." }] },
      { id: "externos", nome: "Dados externos", titulo: "Dados externos", frase: "As fontes de fora que o Worker consulta: última resposta boa, último erro e se está na reserva.", grupo: "externos" },
      { id: "banco", nome: "Banco e espelho", titulo: "Banco e espelho", frase: "Tamanho do banco, as maiores collections e a cópia de leitura em São Paulo.", grupo: "banco" },
      { id: "config", nome: "Configuração", titulo: "Configuração", frase: "Variáveis e segredos que o Worker lê: só se existem, nunca o valor.", grupo: "config" },
      { id: "integridade", nome: "Integridade", titulo: "Integridade dos dados", frase: "Conferências baratas no banco, uma consulta cada, com até 5 ids de exemplo.", grupo: "integridade" },
    ] },
  ];
  const PRIMEIRA = { menu: MENU[0].id, submenu: MENU[0].subs[0].id };

  const menuDe = (id) => MENU.find((m) => m.id === id) || null;
  const subDe = (m, id) => (m ? m.subs.find((s) => s.id === id) || null : null);

  function escrever(r) {
    if (!r || !r.menu) return "#" + PRIMEIRA.menu + "/" + PRIMEIRA.submenu;
    return "#" + r.menu + "/" + r.submenu + (r.tela ? "/" + r.tela : "") + (r.param ? "/" + r.param : "");
  }

  /* Admin.rota("#health/fontes/sondar") → { menu: "health", submenu: "fontes", tela: "sondar", param: "", valido: true, vazio: false, hash } */
  function rota(hash) {
    const cru = String(hash == null ? "" : hash).replace(/^#/, "").trim();
    let partes = [];
    try { partes = cru.split("/").map((p) => decodeURIComponent(p)); } catch (e) { partes = ["\u0000"]; }
    const fim = (menu, submenu, valido, extra = {}) => {
      const r = { menu, submenu, tela: extra.tela || "", param: extra.param || "", valido, vazio: !cru };
      r.hash = escrever(r);
      return r;
    };
    if (!cru) return fim(PRIMEIRA.menu, PRIMEIRA.submenu, false);
    const m = menuDe(partes[0]);
    if (!m) return fim(PRIMEIRA.menu, PRIMEIRA.submenu, false);
    if (partes.length === 1 || partes[1] === "") return fim(m.id, m.subs[0].id, partes.length === 1);
    const s = subDe(m, partes[1]);
    if (!s) return fim(m.id, m.subs[0].id, false);
    const resto = partes.slice(2);
    if (resto.length && resto[resto.length - 1] === "") resto.pop(); // barra no fim não conta
    if (!resto.length) return fim(m.id, s.id, true);
    if (s.telas) {
      const t = s.telas.find((x) => x.id === resto[0]);
      return t && resto.length === 1 ? fim(m.id, s.id, true, { tela: t.id }) : fim(m.id, s.id, false);
    }
    if (s.param === "secao") return SECOES.includes(resto[0]) && resto.length === 1 ? fim(m.id, s.id, true, { param: resto[0] }) : fim(m.id, s.id, false);
    return fim(m.id, s.id, false);
  }

  /* Sem hash: Health Checks › Resumo quando algum grupo tem problema; senão, Pessoas › Convidar */
  function inicial(problemas) {
    return Number(problemas) > 0 ? rota("#health/resumo") : rota("#" + PRIMEIRA.menu + "/" + PRIMEIRA.submenu);
  }

  /* O caminho clicável da tela: [{ nome, hash }], do menu até a tela de dentro */
  function caminho(r) {
    const m = menuDe(r && r.menu), s = subDe(m, r && r.submenu);
    if (!m || !s) return [];
    const out = [{ nome: m.nome, hash: "#" + m.id }, { nome: s.nome, hash: "#" + m.id + "/" + s.id }];
    const t = s.telas && r.tela ? s.telas.find((x) => x.id === r.tela) : null;
    if (t) out.push({ nome: t.nome, hash: "#" + m.id + "/" + s.id + "/" + t.id });
    return out;
  }

  /* A tela aberta: { titulo, frase } (a de dentro, quando há) */
  function tela(r) {
    const s = subDe(menuDe(r && r.menu), r && r.submenu);
    if (!s) return null;
    const t = s.telas && r.tela ? s.telas.find((x) => x.id === r.tela) : null;
    return t ? { titulo: t.nome, frase: t.frase } : { titulo: s.titulo || s.nome, frase: s.frase };
  }

  raiz.Admin = { MENU, SECOES, PRIMEIRA, rota, inicial, caminho, tela, escrever, menuDe, subDe };
})(typeof globalThis !== "undefined" ? globalThis : this);
