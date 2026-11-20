/* ArchLandscape (pedido de 19/11): regras puras das duas abas, Tools (o Landscape de antes) e Cloud (serviços de nuvem
 * por categoria e provedor), as mesmas na página, no Worker e nos testes.
 *
 * Script clássico (<script src="/arch.js">), como o landscape.js: a página usa window.Arch, e o Worker (src/cloud.js,
 * src/arch.js) e os testes em Node importam pelo efeito e leem globalThis.Arch. Sem import nem export.
 *
 * Hashes: #arch/tools, #arch/tools/<id>, #arch/tools/comparar/<id>,<id>[/profunda], #arch/cloud[?filtros],
 *   #arch/languages e #arch/other, com /<id>, /comparar/<id>,<id>[/profunda] e /profundas embaixo (as abas extras de
 *   Landscape.ABAS, pedido de 19/11, 23h02 e 23h09),
 *   #arch/cloud/<id>, #arch/cloud/comparar/<id>,<id>[/profunda], #arch/<aba>/profundas[/<id>], #arch/stacks[/<id>].
 *   Os antigos #tech/landscape[/<id>] abrem a aba Tools (lerHash marca antigo: true e a página troca o endereço).
 *
 * Serviço de nuvem (collection `cloud`, id `<provedor>--<slug>`): veja validarServico.
 * Característica guardada: { valor, fonte (URL), em (ISO), por: "semente" | "admin" | "curadoria" | "dossie" }.
 * Sem valor, a tela mostra "não conferido", nunca "não tem".
 */
(function (raiz) {
  "use strict";

  const DIA = 86_400_000;
  const MAX_COMPARAR = 4;
  const CONTEXTO_MAX = 600;
  const VALIDADE_DIAS = 30;
  const MARKDOWN_MAX = 60_000;
  const ID_SERV = /^[a-z0-9-]{1,30}--[a-z0-9.-]{1,80}$/;
  const ID_PROV = /^[a-z0-9-]{1,30}$/;
  const ID_CAT = /^[a-z0-9-]{1,40}$/;
  const ID_DOSSIE = /^d[0-9a-f]{16}$/;
  const ID_STACK = /^s[0-9a-f]{12}$/; /* o mesmo de Stacks.ID_STACK (public/stacks.js) */
  const POR = ["semente", "admin", "curadoria", "dossie"];
  const ABAS = ["tools", "cloud"];
  /* As abas do endereço: Tools, Cloud e, depois, as abas extras de Landscape.ABAS (Languages, Other Tools), que usam a
     máquina de Tools (a mesma collection `landscape`, com `aba` no doc). Lidas da tabela na hora (o landscape.js pode
     carregar depois deste arquivo). ABAS continua sendo a lista das abas de pedido de comparação profunda: as extras
     pedem com "tools". */
  const tabelaLs = () => (raiz.Landscape && Array.isArray(raiz.Landscape.ABAS) ? raiz.Landscape.ABAS : [{ id: "tools", rotulo: "Tools", hash: "tools" }]);
  const abasHash = () => { const l = tabelaLs().map((a) => a.hash); return [l[0], "cloud", ...l.slice(1)]; };
  const rotuloAba = (aba) => (aba === "cloud" ? "Cloud" : (tabelaLs().find((a) => a.hash === aba) || tabelaLs()[0]).rotulo);
  /* aba do endereço -> id da aba do doc da tecnologia ("tools", "linguagens", "outras"), e o contrário */
  const abaDoc = (aba) => (tabelaLs().find((a) => a.hash === aba) || tabelaLs()[0]).id;
  const abaHashDe = (doc) => {
    const id = raiz.Landscape ? raiz.Landscape.abaDe(doc) : "tools";
    return (tabelaLs().find((a) => a.id === id) || tabelaLs()[0]).hash;
  };
  /* aba do endereço é de tecnologias (Tools ou uma extra)? */
  const ehAbaTec = (aba) => aba !== "cloud" && tabelaLs().some((a) => a.hash === aba);
  /* aba do endereço -> aba do pedido de comparação profunda (arch-dossies só conhece tools e cloud) */
  const abaDossie = (aba) => (aba === "cloud" ? "cloud" : "tools");
  /* Voltar do detalhe, da comparação e das comparações profundas: a grade da aba de onde a pessoa veio, que é a aba que
     está no endereço (Cloud com os filtros). Devolve { estado, hash, rotulo } ("← Other Tools"). */
  function voltarPara(e) {
    const aba = e && abasHash().includes(e.aba) ? e.aba : "tools";
    const estado = { aba, tela: "grade", id: null, ids: [], profunda: false, filtros: aba === "cloud" && e && e.filtros ? e.filtros : FILTROS_VAZIOS() };
    return { estado, hash: escreverHash(estado), rotulo: "← " + rotuloAba(aba) };
  }

  /* ---------- texto ---------- */
  const semAcento = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const limpo = (s, max) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, max);
  const slug = (t) => semAcento(t).replace(/[^a-z0-9.]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 80);
  const temPalavra = (texto, termo) => !!termo && new RegExp("(^|[^\\p{L}\\p{N}])" + escRe(semAcento(termo)) + "($|[^\\p{L}\\p{N}])", "u").test(semAcento(texto));
  function urlOk(txt) {
    const s = String(txt == null ? "" : txt).trim();
    if (!s) return "";
    if (s.length > 400) return null;
    let u;
    try { u = new URL(s); } catch (e) { return null; }
    if (u.protocol !== "https:" || u.username || u.password) return null;
    return u.toString();
  }
  const isoOk = (v) => { const t = Date.parse(v || ""); return typeof v === "string" && Number.isFinite(t) ? new Date(t).toISOString() : null; };
  /* Preço em número não entra (pedido de 19/11): R$, US$, $ seguido de dígito, € e £ com dígito */
  const PRECO_RE = /R\$|US\$|\$\s?\d|€\s?\d|£\s?\d|\d\s?(€|£)/;
  const temPreco = (s) => PRECO_RE.test(String(s == null ? "" : s));

  /* ---------- características (Tools) e capacidades (Cloud) ---------- */
  /* Tipos: "sn" (sim/não), "snp" (sim/não/parcial), "texto" (curto), "lista" (itens) e "num" (número, com a unidade `u`). */
  const sn = (k, r) => ({ k, r, tipo: "sn" }), snp = (k, r) => ({ k, r, tipo: "snp" }), tx = (k, r) => ({ k, r, tipo: "texto" });
  const ls = (k, r) => ({ k, r, tipo: "lista" }), nu = (k, r, u) => ({ k, r, tipo: "num", u });
  /* Tools: comuns a toda subcategoria e as chaves de cada uma */
  const COMUNS = [
    { k: "maturidade", r: "Maturidade" }, { k: "implantacao", r: "Implantação" }, { k: "lock_in", r: "Dependência do fornecedor" },
    { k: "limites", r: "Limites" }, { k: "conformidade", r: "Conformidade" }, { k: "on_premises", r: "Roda fora da nuvem do provedor" },
  ];
  const ATRIBUTOS = {
    "execucao-duravel": [tx("linguagens", "Linguagens"), tx("armazenamento", "Onde guarda o estado"), tx("implantacao", "Implantação"), sn("versionamento", "Versionamento de fluxos"), sn("compensacao", "Compensação (sagas)")],
    "web-scraping": [tx("linguagens", "Linguagens"), sn("renderiza_js", "Renderiza JavaScript"), tx("saida", "Formatos de saída"), tx("implantacao", "Implantação")],
  };
  /* Cloud (pedido de 19/11, 15h17): a matriz de capacidades de cada subcategoria, numa tabela só e nesta ordem (é a
     ordem das linhas da comparação). Só capacidade e característica: nada de preço. Depois das próprias, as comuns. */
  const COMUNS_CLOUD = [
    sn("regioes_br", "Região no Brasil (São Paulo)"), tx("sla", "SLA publicado"), ls("certificacoes", "Certificações citadas"),
    sn("terraform", "Terraform (provider oficial)"), tx("limites", "Limites que costumam pegar"), tx("on_premises", "Roda fora da nuvem do provedor"),
  ];
  const CAPACIDADES = {
    vms: [sn("arm", "Máquinas ARM"), sn("gpu", "Opção com GPU"), nu("vcpu_max", "vCPUs por máquina (máximo)", "vCPU"), tx("memoria_max", "Memória por máquina (máximo)"),
      sn("bare_metal", "Bare metal"), sn("spot", "Máquinas interruptíveis (spot)"), sn("autoescala", "Grupo com escala automática"), tx("cobranca_min", "Menor fração cobrada")],
    conteineres: [sn("escala_zero", "Escala até zero"), tx("tempo_max", "Tempo máximo por requisição"), nu("vcpu_max", "vCPUs por instância (máximo)", "vCPU"), tx("memoria_max", "Memória por instância (máximo)"),
      sn("gpu", "GPU"), sn("jobs", "Jobs que rodam até terminar"), tx("concorrencia", "Requisições simultâneas por instância"), tx("cobranca_min", "Menor fração cobrada")],
    kubernetes: [sn("autopilot", "Modo sem gerenciar nós"), nu("nos_max", "Nós por cluster (máximo)", "nós"), sn("multi_zona", "Plano de controle em várias zonas"), sn("windows", "Nós Windows"),
      sn("arm", "Nós ARM"), sn("gpu", "Nós com GPU"), sn("atualizacao_auto", "Atualização automática"), tx("suporte_versao", "Suporte de cada versão")],
    funcoes: [tx("tempo_max", "Tempo máximo de execução"), nu("memoria_max", "Memória máxima", "MB"), ls("linguagens", "Linguagens"), tx("cold_start", "Partida a frio"),
      tx("concorrencia", "Concorrência"), ls("gatilhos", "Gatilhos"), sn("conteiner", "Imagem de contêiner própria"), sn("gpu", "GPU"), sn("borda", "Roda na borda")],
    paas: [ls("linguagens", "Linguagens"), sn("conteiner", "Publica imagem de contêiner"), sn("git_deploy", "Deploy pelo Git"), sn("escala_zero", "Escala até zero"),
      sn("autoescala", "Escala automática"), sn("dominio_proprio", "Domínio próprio com TLS"), sn("workers", "Processos em segundo plano"), sn("cron", "Tarefas agendadas")],
    objetos: [sn("api_s3", "API compatível com S3"), ls("classes", "Classes de armazenamento"), sn("versionamento", "Versionamento"), sn("replicacao", "Replicação entre regiões"),
      sn("worm", "Bloqueio de objeto (WORM)"), tx("consistencia", "Consistência"), tx("tamanho_max", "Tamanho máximo de objeto"), sn("eventos", "Eventos e notificações"), sn("cmk", "Criptografia com chave do cliente")],
    blocos: [ls("tipos", "Tipos de disco"), tx("tamanho_max", "Tamanho máximo do volume"), tx("iops_max", "IOPS por volume (máximo)"), sn("snapshots", "Snapshots"),
      sn("multi_attach", "Anexar em várias máquinas"), sn("redimensionar", "Aumentar sem desligar"), sn("criptografia", "Criptografia em repouso"), sn("replicacao", "Cópia para outra região")],
    arquivos: [ls("protocolos", "Protocolos"), tx("tamanho_max", "Tamanho máximo"), sn("escala_auto", "Cresce sozinho"), ls("desempenho", "Níveis de desempenho"),
      sn("snapshots", "Snapshots ou backup"), sn("multi_zona", "Redundância entre zonas"), sn("replicacao", "Replicação entre regiões"), sn("criptografia", "Criptografia em repouso")],
    relacional: [ls("motores", "Motores"), sn("replica_leitura", "Réplica de leitura"), sn("multi_regiao", "Multirregião"), sn("serverless", "Serverless ou escala a zero"),
      sn("pitr", "Restauração para um ponto no tempo"), tx("tamanho_max", "Tamanho máximo"), sn("pooler", "Pool de conexões gerenciado"), tx("extensoes", "Extensões")],
    "postgres-serverless": [sn("escala_zero", "Escala até zero"), sn("branching", "Branches de banco"), tx("compativel", "Compatibilidade"), sn("pitr", "Restauração para um ponto no tempo"),
      sn("pooler", "Pool de conexões gerenciado"), sn("replica_leitura", "Réplica de leitura"), tx("tamanho_max", "Tamanho máximo"), tx("extensoes", "Extensões")],
    nosql: [ls("modelo_dados", "Modelo de dados"), sn("serverless", "Opção serverless"), sn("multi_regiao", "Multirregião"), tx("consistencia", "Consistência"),
      tx("item_max", "Tamanho máximo de item"), sn("transacoes", "Transações"), sn("ttl", "Expiração automática (TTL)"), sn("streams", "Fluxo de mudanças")],
    cache: [ls("motores", "Motores"), sn("serverless", "Opção serverless"), sn("api_http", "API por HTTP"), sn("cluster", "Modo cluster"),
      sn("replicacao", "Réplicas com failover"), sn("persistencia", "Persistência em disco"), sn("multi_regiao", "Replicação entre regiões"), tx("memoria_max", "Tamanho máximo")],
    analitico: [sn("serverless", "Serverless"), ls("formatos", "Formatos abertos"), sn("separacao", "Computação separada do armazenamento"), sn("streaming", "Ingestão em fluxo"),
      sn("federado", "Consulta dados externos"), sn("ml", "ML dentro do banco"), sn("compartilhamento", "Compartilhamento de dados"), tx("sql", "SQL")],
    cdn: [sn("pops_br", "Pontos de presença no Brasil"), sn("computacao_borda", "Código na borda"), sn("waf_incluso", "WAF no mesmo produto"), sn("http3", "HTTP/3"),
      sn("shield", "Camada de proteção da origem"), sn("tls_gerenciado", "Certificado TLS gerenciado"), sn("websockets", "WebSockets"), sn("purga_tag", "Purga por etiqueta")],
    dns: [sn("anycast", "Anycast"), sn("dnssec", "DNSSEC"), ls("roteamento", "Roteamento"), sn("saude", "Checagem de saúde"),
      sn("privado", "Zonas privadas"), sn("alias", "Registro no topo da zona apontando para nome"), ls("registros", "Tipos de registro"), sn("importar", "Importa arquivo de zona")],
    balanceador: [ls("camadas", "Camadas"), sn("global", "Global"), sn("tls", "Termina TLS"), sn("http3", "HTTP/3"),
      sn("websockets", "WebSockets"), sn("saude", "Checagem de saúde"), sn("sessao", "Sessão fixa"), sn("waf_integrado", "WAF integrado")],
    vpn: [tx("tipo", "Tipo"), sn("site_a_site", "Site a site"), sn("ponto_a_site", "Ponto a site"), sn("bgp", "Rotas por BGP"),
      sn("ha", "Túneis redundantes"), tx("banda", "Banda por túnel"), sn("dedicada", "Conexão dedicada"), sn("sem_porta", "Sem porta de entrada aberta")],
    filas: [sn("fifo", "Ordem garantida (FIFO)"), sn("exatamente_uma", "Exatamente uma vez"), tx("retencao", "Retenção máxima"), tx("msg_max", "Tamanho máximo de mensagem"),
      sn("dlq", "Fila de mensagens mortas"), sn("atraso", "Entrega com atraso"), ls("protocolo", "Protocolo"), tx("visibilidade", "Tempo de visibilidade máximo")],
    eventos: [sn("kafka", "API compatível com Kafka"), tx("retencao", "Retenção máxima"), tx("msg_max", "Tamanho máximo de evento"), sn("ordem", "Ordem por chave ou partição"),
      sn("replay", "Reler eventos"), sn("filtro", "Filtro por conteúdo"), sn("esquema", "Registro de esquemas"), sn("exatamente_uma", "Exatamente uma vez")],
    workflows: [tx("definicao", "Como se define o fluxo"), sn("duravel", "Execução durável"), tx("duracao_max", "Duração máxima de uma execução"), sn("espera", "Espera por evento ou callback"),
      sn("paralelo", "Ramos em paralelo"), sn("retentativa", "Nova tentativa por passo"), sn("visual", "Editor visual"), tx("limite_historico", "Limite de passos ou histórico")],
    "gateway-api": [ls("protocolos", "Protocolos"), sn("limite_taxa", "Limite de taxa"), ls("auth", "Autenticação"), sn("cache", "Cache de respostas"),
      sn("transformacao", "Transformação de requisição"), sn("portal", "Portal do desenvolvedor"), sn("openapi", "Importa OpenAPI"), tx("timeout", "Tempo máximo de integração")],
    iam: [sn("sso", "SSO"), sn("oidc", "OIDC"), sn("saml", "SAML"), sn("mfa", "MFA"),
      sn("scim", "Provisionamento SCIM"), tx("politicas", "Modelo de política"), sn("carga", "Identidade para cargas de trabalho"), sn("usuarios_finais", "Login de usuários finais")],
    segredos: [sn("hsm", "HSM"), sn("rotacao", "Rotação automática"), sn("versoes", "Versões"), tx("segredo_max", "Tamanho máximo do segredo"),
      sn("replicacao", "Réplica entre regiões"), tx("fips", "Validação FIPS 140"), sn("chaves", "Chaves de criptografia"), sn("certificados", "Certificados")],
    waf: [sn("ddos_incluso", "DDoS incluso"), sn("bots", "Gestão de bots"), sn("regras_gerenciadas", "Regras gerenciadas"), sn("owasp", "Regras para o OWASP Top 10"),
      sn("limite_taxa", "Limite de taxa"), sn("regras_proprias", "Regras próprias"), sn("geo", "Bloqueio por país"), sn("api", "Proteção de API")],
    "logs-metricas": [sn("opentelemetry", "OpenTelemetry"), tx("retencao", "Retenção padrão"), tx("consulta", "Linguagem de consulta"), sn("alertas", "Alertas"),
      sn("paineis", "Painéis"), sn("prometheus", "Métricas Prometheus"), sn("exportar", "Exporta para armazenamento"), sn("metricas_proprias", "Métricas próprias")],
    rastreamento: [sn("opentelemetry", "OpenTelemetry"), sn("amostragem", "Amostragem configurável"), tx("retencao", "Retenção"), sn("mapa", "Mapa de serviços"),
      ls("linguagens", "SDKs"), sn("ligacao_logs", "Ligação com logs"), sn("alertas", "Alertas"), sn("w3c", "W3C Trace Context")],
    "modelos-api": [ls("modelos", "Famílias de modelos"), sn("terceiros", "Modelos de terceiros"), sn("proprios", "Modelos do próprio provedor"), sn("ajuste_fino", "Ajuste fino"),
      sn("embeddings", "Embeddings"), sn("guardrails", "Guardrails"), sn("agentes", "Agentes"), sn("rag", "Base de conhecimento (RAG)")],
    gpu: [ls("gpus", "Aceleradores"), sn("acelerador_proprio", "Acelerador próprio do provedor"), sn("treino_distribuido", "Treino distribuído"), sn("notebooks", "Notebooks gerenciados"),
      sn("inferencia", "Publicação para inferência"), sn("spot", "Capacidade interruptível"), sn("pipelines", "Pipelines de ML"), tx("cobranca_min", "Menor fração cobrada")],
    vetorial: [sn("serverless", "Serverless"), ls("indices", "Índices"), tx("dimensoes_max", "Dimensões (máximo)"), ls("metricas", "Métricas de distância"),
      sn("filtro", "Filtro por metadados"), sn("hibrida", "Busca híbrida"), tx("vetores_max", "Vetores por índice (máximo)"), sn("embeddings", "Gera embeddings sozinho")],
    "ci-cd": [tx("runners", "Onde roda"), sn("yaml", "Definição em YAML"), sn("conteiner", "Build em contêiner"), sn("cache", "Cache entre builds"),
      sn("segredos", "Segredos"), sn("paralelo", "Builds em paralelo"), tx("tempo_max", "Duração máxima de build"), ls("gatilhos", "Gatilhos")],
    registro: [sn("oci", "Formato OCI"), sn("varredura", "Varredura de vulnerabilidades"), sn("replicacao", "Replicação entre regiões"), sn("imutavel", "Tags imutáveis"),
      sn("ciclo", "Regras de ciclo de vida"), ls("formatos", "Outros formatos"), sn("assinatura", "Assinatura de imagens"), sn("privado", "Acesso por rede privada")],
    iac: [ls("linguagem", "Linguagem"), sn("estado_gerenciado", "Estado gerenciado"), sn("previa", "Prévia das mudanças"), sn("deriva", "Detecção de desvio"),
      sn("modulos", "Módulos reutilizáveis"), sn("rollback", "Reverte em falha"), sn("multi_conta", "Várias contas ou projetos"), sn("importar", "Importa recursos existentes")],
  };
  const ehCloud = (sub) => Object.prototype.hasOwnProperty.call(CAPACIDADES, sub);
  /* As chaves de uma subcategoria: as dela e, depois, as comuns (sem repetir). Cloud usa a matriz; Tools, a tabela de antes. */
  function chavesDe(sub) {
    if (ehCloud(sub)) {
      const vistas = new Set(CAPACIDADES[sub].map((a) => a.k));
      return CAPACIDADES[sub].concat(COMUNS_CLOUD.filter((c) => !vistas.has(c.k)));
    }
    const proprias = ATRIBUTOS[sub] || [];
    const vistas = new Set(proprias.map((a) => a.k));
    return proprias.concat(COMUNS.filter((c) => !vistas.has(c.k)).map((c) => ({ ...c, tipo: "texto" })));
  }
  /* Registro de característica: aceita o registro inteiro ou só o valor; valor vazio é null */
  const vazio = (v) => v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);
  function carac(x) {
    if (x == null) return null;
    if (typeof x === "object" && !Array.isArray(x)) {
      const v = x.valor;
      if (vazio(v)) return null;
      return { valor: typeof v === "string" ? v.trim() : v, fonte: typeof x.fonte === "string" ? x.fonte : "", em: x.em || null, por: POR.includes(x.por) ? x.por : "semente" };
    }
    if (vazio(x)) return null;
    return { valor: typeof x === "string" ? x.trim() : x, fonte: "", em: null, por: "semente" };
  }
  const numBR = (n) => { const s = String(n).split("."); return s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (s[1] ? "," + s[1] : ""); };
  /* Texto para a tela: sim, não, parcial, a lista separada por vírgula, o número com a unidade ou o texto; sem valor,
     "não conferido" (nunca "não tem"). `def` é a linha da tabela (para a unidade). */
  function textoCarac(x, def) {
    const c = carac(x);
    if (!c) return "não conferido";
    const v = c.valor;
    if (v === true || v === "sim") return "sim";
    if (v === false || v === "nao" || v === "não") return "não";
    if (v === "parcial") return "parcial";
    if (Array.isArray(v)) return v.join(", ");
    if (typeof v === "number") return numBR(v) + (def && def.u ? " " + def.u : "");
    return String(v);
  }
  /* Um registro vindo do Admin, da semente, da curadoria ou do dossiê: { carac } ou { erro }.
     exigeFonte: o valor gravado pelo Admin precisa de fonte https (Cloud). */
  function validarCarac(x, { por = "admin", agora = Date.now(), tipo = "texto", exigeFonte = false } = {}) {
    const bruto = x && typeof x === "object" && !Array.isArray(x) ? x : { valor: x };
    let v = bruto.valor;
    if (vazio(v)) return { carac: null };
    if (typeof v === "boolean") v = v ? "sim" : "nao";
    if (tipo === "lista") {
      const itens = (Array.isArray(v) ? v : String(v).split(/[,;\n]/)).map((i) => limpo(i, 80)).filter(Boolean);
      if (itens.some((i) => typeof i !== "string")) return { erro: "Valor de característica inválido." };
      if (itens.length > 24) return { erro: "Até 24 itens." };
      if (!itens.length) return { carac: null };
      v = [...new Set(itens)];
      if (v.some(temPreco)) return { erro: "Preço em número não entra nas características." };
    } else if (tipo === "num") {
      const n = typeof v === "number" ? v : Number(String(v).trim().replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
      if (!Number.isFinite(n) || n < 0) return { erro: "Use um número." };
      v = n;
    } else {
      if (typeof v !== "string" && typeof v !== "number") return { erro: "Valor de característica inválido." };
      v = limpo(v, 200);
      if (!v) return { carac: null };
      if (tipo === "sn" && v === "não") v = "nao";
      if (tipo === "sn" && !["sim", "nao"].includes(v)) return { erro: "Use sim ou não." };
      if (tipo === "snp" && !["sim", "nao", "parcial"].includes(v)) return { erro: "Use sim, não ou parcial." };
      if (temPreco(v)) return { erro: "Preço em número não entra nas características." };
    }
    const fonte = urlOk(bruto.fonte);
    if (fonte === null) return { erro: "A fonte precisa ser um endereço https." };
    const em = bruto.em ? isoOk(bruto.em) : new Date(agora).toISOString();
    if (!em) return { erro: "Data da característica inválida." };
    const p = bruto.por && POR.includes(bruto.por) ? bruto.por : por;
    if (exigeFonte && p === "admin" && !fonte) return { erro: "Informe a fonte (https) de onde veio o valor." };
    return { carac: { valor: v, fonte, em, por: p } };
  }
  /* Objeto de atributos de uma subcategoria: só as chaves da tabela; vazio sai */
  function validarAtributos(obj, sub, opcoes = {}) {
    if (obj == null) return { atributos: {} };
    if (typeof obj !== "object" || Array.isArray(obj)) return { erro: "Atributos precisam ser um objeto." };
    const chaves = new Map(chavesDe(sub).map((a) => [a.k, a]));
    const out = {};
    for (const [k, x] of Object.entries(obj)) {
      const a = chaves.get(k);
      if (!a) return { erro: `Característica desconhecida para essa subcategoria: ${String(k).slice(0, 40)}` };
      const r = validarCarac(x, { ...opcoes, tipo: a.tipo });
      if (r.erro) return { erro: a.r + ": " + r.erro };
      if (r.carac) out[k] = r.carac;
    }
    return { atributos: out };
  }
  /* Só as chaves que a tabela de hoje conhece (doc antigo pode ter chave que saiu, como saida_gratis) */
  const soConhecidas = (obj, sub) => { const ks = new Set(chavesDe(sub).map((a) => a.k)); return Object.fromEntries(Object.entries(obj && typeof obj === "object" ? obj : {}).filter(([k]) => ks.has(k))); };
  /* Quantas capacidades têm fonte e a data mais recente entre elas ("Conferido em") */
  function conferidoDe(s) {
    let n = 0, em = "";
    for (const a of chavesDe(s && s.subcategoria)) {
      const c = carac(s && s.atributos && s.atributos[a.k]);
      if (c && c.fonte) { n++; if (c.em && String(c.em) > em) em = String(c.em); }
    }
    return { n, total: chavesDe(s && s.subcategoria).length, em: em || null };
  }

  /* ---------- provedores e categorias ---------- */
  function validarProvedores(b) {
    if (!b || typeof b !== "object" || !Array.isArray(b.provedores)) return { erro: "Mande { provedores: [...] }." };
    if (b.provedores.length > 60) return { erro: "Até 60 provedores." };
    const ids = new Set(), out = [];
    for (const p of b.provedores) {
      if (!p || typeof p !== "object") return { erro: "Provedor inválido." };
      const id = String(p.id || "");
      if (!ID_PROV.test(id)) return { erro: `Id de provedor inválido: ${id.slice(0, 30)}` };
      if (ids.has(id)) return { erro: `Provedor repetido: ${id}` };
      ids.add(id);
      const nome = limpo(p.nome, 60);
      if (!nome) return { erro: `Provedor sem nome: ${id}` };
      const sigla = String(p.sigla || "").trim();
      if (!/^[A-Za-z0-9]{1,4}$/.test(sigla)) return { erro: `Sigla de ${nome}: até 4 letras ou números.` };
      const cor = String(p.cor || "").trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(cor)) return { erro: `Cor de ${nome}: use #rrggbb.` };
      if (p.tipo !== "grande" && p.tipo !== "alternativa") return { erro: `Tipo de ${nome}: grande ou alternativa.` };
      const site = urlOk(p.site), status = urlOk(p.status), novidades = urlOk(p.novidades);
      if (site === null || status === null || novidades === null) return { erro: `Endereços de ${nome} precisam ser https.` };
      const pais = String(p.pais || "").toUpperCase();
      if (pais && !/^[A-Z]{2}$/.test(pais)) return { erro: `País de ${nome}: código ISO de duas letras.` };
      const icone = p.icone ? urlIcone(p.icone) : "";
      if (p.icone && !icone) return { erro: `Ícone de ${nome} precisa ser um endereço http(s).` };
      out.push({ id, nome, sigla, cor: cor.toLowerCase(), tipo: p.tipo, site, status, pais, ...(novidades ? { novidades } : {}), ...(icone ? { icone } : {}) });
    }
    return { provedores: out };
  }
  function validarCategorias(b) {
    if (!b || typeof b !== "object" || !Array.isArray(b.categorias)) return { erro: "Mande { categorias: [...] }." };
    if (b.categorias.length > 30) return { erro: "Até 30 categorias." };
    const ids = new Set(), subsTodas = new Set(), out = [];
    for (const c of b.categorias) {
      if (!c || typeof c !== "object") return { erro: "Categoria inválida." };
      const nome = limpo(c.nome, 60);
      if (!nome) return { erro: "Toda categoria precisa de nome." };
      const id = c.id ? String(c.id) : slug(nome).replace(/\./g, "-");
      if (!ID_CAT.test(id)) return { erro: `Id de categoria inválido: ${id.slice(0, 40)}` };
      if (ids.has(id)) return { erro: `Categoria repetida: ${nome}` };
      ids.add(id);
      const subs = Array.isArray(c.subcategorias) ? c.subcategorias : [];
      if (subs.length > 30) return { erro: `Até 30 subcategorias em ${nome}.` };
      const so = [];
      for (const s of subs) {
        const sn0 = limpo(s && s.nome, 60);
        if (!sn0) return { erro: `Subcategoria sem nome em ${nome}.` };
        const sid = s.id ? String(s.id) : slug(sn0).replace(/\./g, "-");
        if (!ID_CAT.test(sid)) return { erro: `Id de subcategoria inválido: ${sid.slice(0, 40)}` };
        /* a subcategoria é a chave da comparação: o mesmo id não pode aparecer em duas categorias */
        if (subsTodas.has(sid)) return { erro: `Subcategoria repetida: ${sn0}` };
        subsTodas.add(sid);
        so.push({ id: sid, nome: sn0 });
      }
      out.push({ id, nome, subcategorias: so });
    }
    return { categorias: out };
  }
  const nomeSub = (cats, sid) => { for (const c of cats || []) for (const s of c.subcategorias || []) if (s.id === sid) return s.nome; return ""; };
  const catDaSub = (cats, sid) => (cats || []).find((c) => (c.subcategorias || []).some((s) => s.id === sid)) || null;

  /* ---------- serviço ---------- */
  const idServico = (provedor, nome) => provedor + "--" + slug(nome);
  /* Sem link de preços (pedido de 19/11, 15h17): `links.precos` de doc antigo é aceito na leitura e não volta a ser gravado */
  const LINKS = ["produto", "docs", "status"];
  /* Corpo do Admin (ou da semente) -> { servico } ou { erro }. ctx: { provedores, categorias, agora, por } */
  function validarServico(b, ctx = {}) {
    if (!b || typeof b !== "object" || Array.isArray(b)) return { erro: "corpo" };
    const provs = ctx.provedores || [], cats = ctx.categorias || [];
    const prov = provs.find((p) => p.id === b.provedor);
    if (!prov) return { erro: "Escolha um provedor que existe." };
    const nome = limpo(b.nome, 80);
    if (!nome) return { erro: "O serviço precisa de nome." };
    const cat = (cats || []).find((c) => c.id === b.categoria);
    if (!cat || !(cat.subcategorias || []).some((s) => s.id === b.subcategoria)) return { erro: "Escolha categoria e subcategoria que existem." };
    const apelidos = (Array.isArray(b.apelidos) ? b.apelidos : String(b.apelidos || "").split(",")).map((a) => limpo(a, 60)).filter(Boolean);
    if (apelidos.length > 8) return { erro: "Até 8 apelidos." };
    const resumo = limpo(b.resumo, 320), cobranca = limpo(b.cobranca, 320), gratis = limpo(b.gratis, 200);
    const destaques = (Array.isArray(b.destaques) ? b.destaques : []).map((d) => limpo(d, 140)).filter(Boolean);
    if (destaques.length > 4) return { erro: "Até 4 destaques." };
    for (const t of [nome, resumo, cobranca, gratis, ...destaques, ...apelidos]) if (temPreco(t)) return { erro: "Valor em dinheiro não entra no catálogo." };
    const links = {};
    for (const k of LINKS) { const u = urlOk(b.links && b.links[k]); if (u === null) return { erro: `O link de ${k} precisa ser https.` }; links[k] = u; }
    const fontes = (Array.isArray(b.fontes) ? b.fontes : []).map((u) => urlOk(u));
    if (fontes.some((u) => u === null)) return { erro: "As fontes precisam ser endereços https." };
    if (fontes.length > 12) return { erro: "Até 12 fontes." };
    const at = validarAtributos(b.atributos, b.subcategoria, { por: ctx.por || "admin", agora: ctx.agora, exigeFonte: true });
    if (at.erro) return { erro: at.erro };
    /* preco_ref (de docs antigos): aceito na leitura, não pedido e não gravado */
    const roteiro = [];
    for (const r of Array.isArray(b.roteiro) ? b.roteiro.slice(0, 10) : []) {
      const titulo = limpo(r && r.titulo, 160), fonte = urlOk(r && r.fonte);
      if (!titulo || !fonte) return { erro: "Cada item de O que vem por aí precisa de título e fonte https." };
      roteiro.push({ titulo, estado: limpo(r.estado, 30), quando: limpo(r.quando, 40), fonte, em: isoOk(r.em) || new Date(ctx.agora || Date.now()).toISOString() });
    }
    const conferido = b.conferido ? isoOk(b.conferido) : null;
    /* opções de uso (a mesma tabela de Tools, Landscape.USOS): serviço de nuvem é "nuvem" por definição */
    const USO_IDS = ["nuvem", "self-hosted", "local", "biblioteca"];
    const usoIn = Array.isArray(b.uso) ? b.uso : ["nuvem"];
    if (usoIn.some((u) => !USO_IDS.includes(u))) return { erro: "Opção de uso desconhecida." };
    const uso = USO_IDS.filter((u) => usoIn.includes(u));
    const uso_nota = limpo(b.uso_nota, 240);
    const icone = b.icone ? urlIcone(b.icone) : "";
    if (b.icone && !icone) return { erro: "O ícone precisa ser um endereço http(s)." };
    return { servico: { provedor: prov.id, nome, apelidos: [...new Set(apelidos)], categoria: cat.id, subcategoria: b.subcategoria, resumo, cobranca, gratis, destaques,
      atributos: at.atributos, links, fontes: [...new Set(fontes.filter(Boolean))], roteiro, conferido, uso: uso.length ? uso : ["nuvem"], ...(uso_nota ? { uso_nota } : {}), ...(icone ? { icone } : {}) } };
  }

  /* ---------- grade: filtros e agrupamento ---------- */
  const provDe = (provs, id) => (provs || []).find((p) => p.id === id) || null;
  const ordemProv = (provs) => new Map((provs || []).map((p, i) => [p.id, i]));
  /* f: { provs: [ids], alt: bool, gratis: bool, cat: id, q: texto }. Tudo junto (E); vários provedores valem juntos (OU). */
  function filtrarCloud(lista, f = {}, provs = []) {
    const q = semAcento(f.q || "").trim();
    const ps = new Set(Array.isArray(f.provs) ? f.provs : []);
    return (Array.isArray(lista) ? lista : []).filter((s) => {
      if (!s) return false;
      const p = provDe(provs, s.provedor);
      if (ps.size && !ps.has(s.provedor)) return false;
      if (f.alt && (!p || p.tipo !== "alternativa")) return false;
      if (f.gratis && !String(s.gratis || "").trim()) return false;
      if (f.cat && s.categoria !== f.cat) return false;
      if (q) {
        const alvo = semAcento([s.nome, ...(s.apelidos || []), p ? p.nome : "", p ? p.sigla : "", s.provedor].join(" "));
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
  }
  const porProvENome = (provs) => { const o = ordemProv(provs); return (a, b) => (o.get(a.provedor) ?? 999) - (o.get(b.provedor) ?? 999) || String(a.nome).localeCompare(String(b.nome), "pt-BR", { sensitivity: "base" }); };
  /* Categoria: [{ id, nome, subs: [{ id, nome, itens }] }] na ordem da meta, só o que tem item.
     Provedor: [{ prov, cats: [{ id, nome, itens }] }] na ordem dos provedores, só quem tem item. */
  function agrupar(lista, por, cats = [], provs = []) {
    const l = (Array.isArray(lista) ? lista : []).slice().sort(porProvENome(provs));
    if (por === "provedor") {
      return (provs || []).map((p) => ({ prov: p, cats: (cats || []).map((c) => ({ id: c.id, nome: c.nome, itens: l.filter((s) => s.provedor === p.id && s.categoria === c.id) })).filter((c) => c.itens.length) }))
        .filter((g) => g.cats.length);
    }
    return (cats || []).map((c) => ({ id: c.id, nome: c.nome, subs: (c.subcategorias || []).map((s) => ({ id: s.id, nome: s.nome, itens: l.filter((x) => x.categoria === c.id && x.subcategoria === s.id) })).filter((s) => s.itens.length) }))
      .filter((c) => c.subs.length);
  }
  /* Os concorrentes na mesma subcategoria: outros provedores primeiro, depois alternativas do mesmo provedor */
  function equivalentes(s, todos, provs = []) {
    if (!s) return [];
    const o = ordemProv(provs);
    return (Array.isArray(todos) ? todos : []).filter((x) => x && x.id !== s.id && x.subcategoria === s.subcategoria)
      .sort((a, b) => (a.provedor === s.provedor) - (b.provedor === s.provedor) || (o.get(a.provedor) ?? 999) - (o.get(b.provedor) ?? 999) || String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  }

  /* ---------- comparar ----------
     Regra do dono: só concorrentes ou alternativas (mesma subcategoria, provedor diferente ou não), de 2 a 4.
     Devolve { pode, motivo, candidatos, subcategoria }. candidatos: ids que ainda dá para marcar. */
  const MOTIVOS = { nada: "Marque dois serviços da mesma categoria", um: "Marque mais um para comparar", sem: "Nenhum concorrente cadastrado para comparar",
    misturado: "Só dá para comparar serviços da mesma subcategoria", muitos: "Até 4 serviços por comparação", falta: "Serviço não encontrado" };
  function podeComparar(selecionados, todos) {
    const lista = Array.isArray(todos) ? todos : [];
    const por = new Map(lista.map((s) => [s.id, s]));
    const ids = [...new Set((Array.isArray(selecionados) ? selecionados : []).map(String))];
    if (!ids.length) return { pode: false, motivo: MOTIVOS.nada, candidatos: lista.map((s) => s.id), subcategoria: "" };
    const falta = ids.find((id) => !por.has(id));
    if (falta) return { pode: false, motivo: MOTIVOS.falta + ": " + falta.slice(0, 80), candidatos: [], subcategoria: "" };
    const subs = new Set(ids.map((id) => por.get(id).subcategoria));
    if (subs.size > 1) return { pode: false, motivo: MOTIVOS.misturado, candidatos: [], subcategoria: "" };
    const sub = [...subs][0];
    const mesma = lista.filter((s) => s.subcategoria === sub);
    const candidatos = ids.length >= MAX_COMPARAR ? [] : mesma.filter((s) => !ids.includes(s.id)).map((s) => s.id);
    if (ids.length > MAX_COMPARAR) return { pode: false, motivo: MOTIVOS.muitos, candidatos: [], subcategoria: sub };
    if (ids.length === 1) return { pode: false, motivo: mesma.length < 2 ? MOTIVOS.sem : MOTIVOS.um, candidatos, subcategoria: sub };
    return { pode: true, motivo: "", candidatos, subcategoria: sub };
  }
  /* Dá para marcar este? { ok, motivo } (motivo com o nome da subcategoria, para o title e o leitor de tela) */
  function marcavel(id, selecionados, todos, cats = []) {
    const sel = Array.isArray(selecionados) ? selecionados : [];
    if (sel.includes(id)) return { ok: true, motivo: "" };
    if (!sel.length) return { ok: true, motivo: "" };
    const r = podeComparar(sel, todos);
    if (r.candidatos.includes(id)) return { ok: true, motivo: "" };
    if (sel.length >= MAX_COMPARAR) return { ok: false, motivo: MOTIVOS.muitos };
    return { ok: false, motivo: "Só dá para comparar com serviços de " + (nomeSub(cats, r.subcategoria) || r.subcategoria) };
  }
  /* Conjunto de alternativas: os mesmos ids em qualquer ordem são o mesmo conjunto */
  const conjunto = (ids) => [...new Set((Array.isArray(ids) ? ids : String(ids || "").split(",")).map((x) => String(x).trim()).filter(Boolean))].sort().join(",");

  /* ---------- hash ---------- */
  const FILTROS_VAZIOS = () => ({ provs: [], alt: false, gratis: false, cat: "", q: "", por: "categoria" });
  function lerFiltros(q) {
    const f = FILTROS_VAZIOS();
    let ps;
    try { ps = new URLSearchParams(q || ""); } catch (e) { return f; }
    f.provs = (ps.get("p") || "").split(",").filter((x) => ID_PROV.test(x)).slice(0, 30);
    f.alt = ps.get("alt") === "1"; f.gratis = ps.get("gratis") === "1";
    const c = ps.get("cat") || ""; f.cat = ID_CAT.test(c) ? c : "";
    f.q = limpo(ps.get("q") || "", 60);
    f.por = ps.get("por") === "provedor" ? "provedor" : "categoria";
    return f;
  }
  function escreverFiltros(f) {
    if (!f) return "";
    const ps = [];
    if (f.provs && f.provs.length) ps.push("p=" + f.provs.join(","));
    if (f.alt) ps.push("alt=1");
    if (f.gratis) ps.push("gratis=1");
    if (f.cat) ps.push("cat=" + encodeURIComponent(f.cat));
    if (f.q) ps.push("q=" + encodeURIComponent(f.q));
    if (f.por === "provedor") ps.push("por=provedor");
    return ps.length ? "?" + ps.join("&") : "";
  }
  /* "#arch/cloud/comparar/a,b" -> { aba, tela, id, ids, profunda, filtros, antigo }. null quando não é do ArchLandscape. */
  function lerHash(hash) {
    let h = String(hash || "").replace(/^#/, "");
    const iq = h.indexOf("?");
    const q = iq >= 0 ? h.slice(iq + 1) : "";
    if (iq >= 0) h = h.slice(0, iq);
    const p = h.split("/").map((x) => { try { return decodeURIComponent(x); } catch (e) { return ""; } });
    let antigo = false, aba, resto;
    if (p[0] === "tech" && p[1] === "landscape") { antigo = true; aba = "tools"; resto = p.slice(2); }
    else if (p[0] === "arch" && p[1] === "stacks") {
      /* aba Stacks (pedido de 19/11, 15h22): #arch/stacks (lista) e #arch/stacks/<id> (a stack); id fora do formato, a lista */
      const id = ID_STACK.test(p[2] || "") ? p[2] : null;
      return { aba: "stacks", tela: id ? "stack" : "lista", id, ids: [], profunda: false, filtros: FILTROS_VAZIOS(), antigo: p.length > (id ? 3 : 2) && !!p.slice(id ? 3 : 2).join("") };
    }
    else if (p[0] === "arch") { const hs = abasHash(); aba = hs.includes(p[1]) ? p[1] : "tools"; resto = p.slice(2); antigo = !hs.includes(p[1]) && p[1] !== undefined && p[1] !== ""; }
    else return null;
    const out = { aba, tela: "grade", id: null, ids: [], profunda: false, filtros: aba === "cloud" ? lerFiltros(q) : FILTROS_VAZIOS(), antigo };
    const idOk = (x) => ID_SERV.test(x) && x.length <= 160;
    if (resto[0] === "comparar") {
      out.tela = "comparar";
      out.ids = String(resto[1] || "").split(",").filter(Boolean).slice(0, 8);
      out.profunda = resto[2] === "profunda";
    } else if (resto[0] === "profundas") {
      out.tela = "profundas";
      if (resto[1] && ID_DOSSIE.test(resto[1])) { out.tela = "profunda"; out.id = resto[1]; }
    } else if (resto[0] && idOk(resto[0])) { out.tela = "detalhe"; out.id = resto[0]; }
    return out;
  }
  function escreverHash(e) {
    if (e && e.aba === "stacks") return "#arch/stacks" + (e.tela === "stack" && e.id && ID_STACK.test(e.id) ? "/" + e.id : "");
    const aba = e && abasHash().includes(e.aba) ? e.aba : "tools";
    let h = "#arch/" + aba;
    if (e.tela === "detalhe" && e.id) h += "/" + encodeURIComponent(e.id);
    else if (e.tela === "comparar") h += "/comparar/" + (e.ids || []).map(encodeURIComponent).join(",") + (e.profunda ? "/profunda" : "");
    else if (e.tela === "profundas") h += "/profundas";
    else if (e.tela === "profunda" && e.id) h += "/profundas/" + e.id;
    else if (aba === "cloud") h += escreverFiltros(e.filtros);
    return h;
  }

  /* ---------- comparação ---------- */
  const normal = (t) => semAcento(String(t == null ? "" : t)).replace(/\s+/g, " ").trim();
  /* Linha: diferente quando há valor e os textos não são todos iguais (célula vazia conta como diferente) */
  function linha(k, rotulo, celulas, extra = {}) {
    const vals = celulas.map((c) => (c == null ? "" : String(c)));
    const cheias = vals.filter((v) => v && v !== "–" && v !== "não conferido");
    if (!cheias.length) return null;
    const diferente = new Set(vals.map(normal)).size > 1;
    return { k, rotulo, celulas: vals, diferente, ...extra };
  }
  const dataBR = (iso) => { const t = Date.parse(iso || ""); if (!Number.isFinite(t)) return ""; const d = new Date(t); return String(d.getUTCDate()).padStart(2, "0") + "/" + String(d.getUTCMonth() + 1).padStart(2, "0") + "/" + d.getUTCFullYear(); };
  /* Última versão e ritmo (Tools): releases que o Landscape guarda (até 10, mais recente primeiro) */
  function ultimaVersao(releases) {
    const l = (Array.isArray(releases) ? releases : []).filter((r) => r && (r.tag || r.nome));
    const r = l.find((x) => !x.pre) || l[0];
    return r ? { tag: r.tag || r.nome, data: r.data || null } : null;
  }
  function ritmo(releases, agora = Date.now()) {
    const l = (Array.isArray(releases) ? releases : []).filter((r) => r && Number.isFinite(Date.parse(r.data || "")));
    const n = l.filter((r) => agora - Date.parse(r.data) <= 365 * DIA).length;
    return { n, mais: n >= 10 && l.length >= 10 };
  }
  const textoRitmo = (r) => (!r ? "" : r.mais ? "10 ou mais nos últimos 12 meses" : r.n === 1 ? "1 nos últimos 12 meses" : r.n + " nos últimos 12 meses");
  /* servs: docs completos (com id). ctx: { aba, provs, cats, novidades: { id: [itens] }, roteiro: { id: [itens] }, agora }.
     Só fatos: nada de prós e contras, nota ou vencedor. */
  function montarComparacao(servs, ctx = {}) {
    const aba = ctx.aba && ctx.aba !== "cloud" && ehAbaTec(ctx.aba) ? "tools" : "cloud";
    const l = Array.isArray(servs) ? servs : [];
    const provs = ctx.provs || [];
    const colunas = l.map((s) => {
      const p = aba === "cloud" ? provDe(provs, s.provedor) : null;
      return { id: s.id, nome: s.nome || s.repo || s.id, provedor: p ? { id: p.id, nome: p.nome, sigla: p.sigla, cor: p.cor } : null, repo: s.repo || "" };
    });
    const linhas = [];
    const add = (x) => { if (x) linhas.push(x); };
    const sub = l[0] ? l[0].subcategoria : "";
    if (aba === "cloud") {
      add(linha("provedor", "Provedor", l.map((s) => { const p = provDe(provs, s.provedor); return p ? p.nome : s.provedor; })));
      add(linha("resumo", "O que é", l.map((s) => s.resumo || "")));
      add(linha("cobranca", "Como cobra", l.map((s) => s.cobranca || "")));
      add(linha("gratis", "Plano grátis", l.map((s) => s.gratis || "")));
    } else {
      add(linha("descricao", "O que é", l.map((s) => (s.gh && s.gh.descricao) || s.descricao || "")));
      add(linha("modelo", "Modelo", l.map((s) => (raiz.Landscape && raiz.Landscape.modeloDe(s) ? raiz.Landscape.modeloDe(s).rotulo : ""))));
      add(linha("licenca", "Licença", l.map((s) => (s.gh && s.gh.licenca) || (s.leve && s.leve.licenca) || "")));
      add(linha("linguagem", "Linguagem", l.map((s) => (s.gh && s.gh.linguagem) || (s.leve && s.leve.linguagem) || "")));
      add(linha("estrelas", "Estrelas no GitHub", l.map((s) => { const n = (s.gh && s.gh.estrelas) ?? (s.leve && s.leve.estrelas); return n == null ? "" : String(n); })));
      add(linha("versao", "Última versão", l.map((s) => { const v = ultimaVersao(s.releases); return v ? v.tag + (v.data ? " (" + dataBR(v.data) + ")" : "") : ""; })));
      add(linha("ritmo", "Ritmo", l.map((s) => (Array.isArray(s.releases) && s.releases.length ? textoRitmo(ritmo(s.releases, ctx.agora)) : ""))));
    }
    /* opções de uso (Landscape.resumoDeUso: "Só na nuvem", "Nuvem ou self-hosted"...) */
    add(linha("uso", "Opções de uso", l.map((s) => (raiz.Landscape ? raiz.Landscape.resumoDeUso(s) : ""))));
    /* Cloud: a matriz da subcategoria, na ordem da tabela. Linha em que ninguém tem valor vem com vazia: true (a tela
       esconde atrás de "Mostrar não conferidas"); cada célula leva a fonte e a data, quando tem. */
    let resumoCaps = null;
    if (aba === "cloud") {
      let n = 0, total = 0;
      for (const a of chavesDe(sub)) {
        const cs = l.map((s) => carac(s.atributos && s.atributos[a.k]));
        total += cs.length; n += cs.filter((c) => c && c.fonte).length;
        const cel = cs.map((c) => (c ? textoCarac(c, a) : ""));
        const cheias = cel.filter(Boolean).length;
        linhas.push({ k: "at:" + a.k, rotulo: a.r, celulas: cel, diferente: cheias > 0 && new Set(cel.map(normal)).size > 1, carac: true, vazia: !cheias,
          fontes: cs.map((c) => (c && c.fonte ? { fonte: c.fonte, em: c.em || null } : null)) });
      }
      resumoCaps = { conferidas: n, total };
    } else for (const a of chavesDe(sub)) add(linha("at:" + a.k, a.r, l.map((s) => { const c = carac(s.atributos && s.atributos[a.k]); return c ? textoCarac(c, a) : ""; }), { carac: true }));
    if (aba === "cloud") add(linha("destaques", "Destaques", l.map((s) => (s.destaques || []).join("; "))));
    if (ctx.novidades) add(linha("novidade", "Última novidade", l.map((s) => { const n = (ctx.novidades[s.id] || [])[0]; return n ? n.titulo + (n.publicado ? " (" + dataBR(n.publicado) + ")" : "") : ""; })));
    if (ctx.roteiro) add(linha("roteiro", "O que vem por aí", l.map((s) => (ctx.roteiro[s.id] || []).slice(0, 3).map((r) => r.titulo + (r.quando ? " (" + r.quando + ")" : "")).join("; "))));
    if (aba === "cloud") add(linha("conferido", "Conferido", l.map((s) => { const c = conferidoDe(s); return c.em ? "em " + dataBR(c.em) : "ainda não conferido"; })));
    /* links ficam à parte (a tela mostra como botões; o Markdown, como lista de fontes) */
    const links = l.map((s) => (aba === "cloud" ? { produto: (s.links || {}).produto || "", docs: (s.links || {}).docs || "", status: (s.links || {}).status || "" } : { repositorio: s.repo ? "https://github.com/" + s.repo : "", site: s.site || (s.gh && s.gh.site) || "" }));
    return { aba, subcategoria: sub, colunas, linhas, links, ...(resumoCaps ? { resumoCaps } : {}) };
  }
  /* Markdown para um ADR: seção "Opções consideradas" (tabela) e as fontes com data. Só fatos e fontes. */
  const celulaMd = (t) => String(t == null ? "" : t).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim() || "–";
  function markdownAdr(comp, { agora = Date.now(), titulo = "", fontes = [] } = {}) {
    if (!comp || !comp.colunas || !comp.colunas.length) return "";
    const nomes = comp.colunas.map((c) => c.nome + (c.provedor ? " (" + c.provedor.nome + ")" : ""));
    const out = ["## Opções consideradas", ""];
    if (titulo) out.push(titulo, "");
    out.push("| | " + nomes.map(celulaMd).join(" | ") + " |", "|---|" + nomes.map(() => "---").join("|") + "|");
    for (const l of comp.linhas) if (!l.vazia) out.push("| " + celulaMd(l.rotulo) + " | " + l.celulas.map((c) => celulaMd(c || (l.carac ? "não conferido" : ""))).join(" | ") + " |");
    const rc = comp.resumoCaps;
    out.push("", "Montado pelo Lookout (ArchLandscape) em " + dataBR(new Date(agora).toISOString()) + ", com o que estava guardado e o que as fontes oficiais publicavam" + (rc ? " (" + rc.conferidas + " de " + rc.total + " capacidades conferidas)" : "") + ". Sem avaliação: só fatos e fontes.", "", "### Fontes", "");
    const vistas = new Set();
    const rot = { produto: "página do produto", docs: "documentação", status: "status", repositorio: "repositório", site: "site" };
    comp.links.forEach((lk, i) => { for (const [k, u] of Object.entries(lk || {})) if (u && rot[k] && !vistas.has(u)) { vistas.add(u); out.push(`- ${comp.colunas[i].nome}, ${rot[k]}: ${u} (consultado em ${dataBR(new Date(agora).toISOString())})`); } });
    /* as fontes de cada capacidade, uma vez por endereço, com a data em que foi conferida */
    for (const l of comp.linhas) (l.fontes || []).forEach((f, i) => { if (f && f.fonte && !vistas.has(f.fonte)) { vistas.add(f.fonte); out.push(`- ${comp.colunas[i].nome}, ${l.rotulo.toLowerCase()}: ${f.fonte}${f.em ? " (conferido em " + dataBR(f.em) + ")" : ""}`); } });
    for (const f of fontes || []) if (f && f.url && !vistas.has(f.url)) { vistas.add(f.url); out.push(`- ${celulaMd(f.titulo || f.url)}: ${f.url}${f.em ? " (" + dataBR(f.em) + ")" : ""}`); }
    return out.join("\n") + "\n";
  }

  /* ---------- citação e novidades ---------- */
  /* Palavras que sozinhas não dizem de quem é o serviço */
  const GENERICAS = new Set(("cloud functions function storage compute engine database databases db cache queue queues dns cdn load balancer balancing balanceador " +
    "monitor monitoring logging logs metrics trace tracing registry container containers kubernetes service services app apps platform workers pages " +
    "run build deploy key vault secrets secret manager identity access firewall waf shield gateway api apis files file blob object objects block disk disks " +
    "sql postgres postgresql mysql redis memorystore streams stream events event bus workflows workflow tasks scheduler ai ml vector search " +
    "kv d1 r2 queues images stream email cron jobs virtual machines machine vm vms instances network networking private link spaces volumes " +
    "data analytics warehouse lake insights studio hub center console cli sdk iam sso connect").split(/\s+/));
  /* Nome distinto: tem alguma palavra fora da lista e pelo menos 5 letras no total (S3, R2, D1 e "Cloud Run" não são) */
  function nomeDistinto(nome) {
    const s = semAcento(nome).replace(/[^a-z0-9 ]+/g, " ").trim();
    if (s.replace(/\s/g, "").length < 5) return false;
    return s.split(/\s+/).some((w) => !GENERICAS.has(w) && w.length >= 3);
  }
  /* Termos do provedor que contam como "junto do nome": nome, sigla e id (aws, gcp, oci) */
  const termosProv = (p) => (p ? [p.nome, p.sigla, p.id, ...(p.id === "gcp" ? ["Google Cloud", "Google"] : p.id === "azure" ? ["Microsoft"] : p.id === "oci" ? ["Oracle"] : p.id === "aws" ? ["Amazon"] : [])] : []).filter((t) => t && String(t).length >= 2);
  /* O texto cita o serviço? Nome ou apelido distinto sozinho; genérico só com o provedor junto. noFeed: o texto já é do
     feed do próprio provedor, então o provedor está implícito (o nome genérico continua precisando ser palavra inteira). */
  function citaServico(serv, prov, texto, { noFeed = false } = {}) {
    const t = String(texto || "");
    const nomes = [serv.nome, ...(serv.apelidos || [])].filter(Boolean);
    const comProv = noFeed || termosProv(prov).some((x) => temPalavra(t, x));
    for (const n of nomes) {
      if (!temPalavra(t, n)) continue;
      if (nomeDistinto(n) || comProv) return true;
    }
    return false;
  }
  /* Termos para o instr() do SELECT que procura citações (o filtro final é citaServico) */
  const termosBusca = (serv) => [...new Set([serv.nome, ...(serv.apelidos || [])].filter(Boolean).map((n) => semAcento(n)).filter((n) => n.length >= 2))].slice(0, 6);
  /* O que vem por aí: título ou tipo do item com preview, beta, coming soon, announcing ou em breve */
  function anuncio(item) {
    const t = semAcento(((item && item.titulo) || "") + " " + ((item && item.tipo) || ""));
    if (/\b(preview|beta)\b/.test(t)) return "preview";
    if (/\b(coming soon|announcing|em breve)\b/.test(t)) return "anunciado";
    return "";
  }
  /* Itens do feed do provedor que falam do serviço, mais recentes primeiro, até `max` */
  function novidadesDoServico(itens, serv, prov, max = 15) {
    return (Array.isArray(itens) ? itens : []).filter((i) => i && i.titulo && citaServico(serv, prov, i.titulo + " " + (i.tipo || ""), { noFeed: true }))
      .sort((a, b) => String(b.publicado || "").localeCompare(String(a.publicado || ""))).slice(0, max)
      .map((i) => { const a = anuncio(i); return { titulo: i.titulo, url: i.url, publicado: i.publicado || null, ...(i.tipo ? { tipo: i.tipo } : {}), ...(a ? { anuncio: a } : {}) }; });
  }

  /* Os cinco grandes do filtro "Só alternativas aos cinco grandes" (a regra continua sendo o tipo do provedor) */
  const GRANDES = ["aws", "gcp", "azure", "oci", "cloudflare"];

  /* ---------- roteiro da comparação profunda ----------
     O texto que o site grava no pedido (campo `roteiro` do doc em arch-dossies) para a tarefa que escreve a análise.
     Pede a saída no formato de `estrutura` (veja estruturaOk), com o Markdown curto como reserva.
     servs: [{ id, nome, provedor }] (Cloud) ou [{ id, nome, repo }] (Tools). Sem preço, sem valor em dinheiro. */
  function roteiroProfunda(servs, { aba = "cloud", provs = [], subNome = "", sub = "", contexto = "" } = {}) {
    const l = Array.isArray(servs) ? servs : [];
    const nomes = l.map((s) => {
      if (aba === "cloud") { const p = provDe(provs, s.provedor); return `- ${s.nome} (${p ? p.nome : s.provedor}), id ${s.id}`; }
      return `- ${s.nome || s.repo || s.id}${s.repo ? " (github.com/" + s.repo + ")" : ""}, id ${s.id}`;
    });
    const caps = chavesDe(sub).map((a) => a.r);
    const out = [
      `Comparação profunda de ${aba === "cloud" ? "serviços de nuvem" : "tecnologias"}${subNome ? " na subcategoria " + subNome : ""}, para um ADR.`, "",
      "Opções (use estes ids, nesta ordem, nas colunas):", ...nomes, "",
      "Para cada opção, com base na documentação oficial e anotando cada fonte (URL e data em que foi lida) na lista `fontes` do doc:",
      "1. Capacidades: " + (caps.length ? caps.join("; ") : "as que pesam na decisão") + ". Quando a documentação dá número e unidade, traga o número.",
      "2. Limites e cotas que costumam pegar em produção, dizendo quais dá para aumentar por pedido.",
      "3. Maturidade: desde quando existe, o que está em disponibilidade geral, o que ainda está em preview ou beta e o ritmo das mudanças.",
      "4. Dependência do fornecedor: APIs e formatos abertos ou próprios, o que muda para sair e para onde dá para ir.",
      "5. Operação: o que fica com o time (atualização, backup, escala, observabilidade, incidentes) e o que o provedor assume.",
      "6. Encaixe por cenário: em que situação cada opção encaixa e em qual não encaixa, com o motivo.",
      "",
      "Formato: grave o campo `estrutura` (JSON). A tela desenha a comparação lado a lado a partir dele, então parágrafo longo não serve: cada texto é uma frase curta.",
      "- v: 1",
      "- itens: [{ id, nome }], as opções acima na mesma ordem, com nome curto.",
      "- resumo: de 3 a 6 pontos { texto (até 220 caracteres), fontes }.",
      "- porItem: [{ id, fortes, fracos }], até 5 de cada, cada um { texto (até 140), fontes }.",
      "- grupos: [{ titulo, linhas }], com os títulos " + TITULOS_GRUPOS.map((t) => "\"" + t + "\"").join(", ") + ".",
      "  Cada linha: { rotulo (até 60), difere (true quando as opções não são iguais nesse ponto), nota (até 200, opcional), celulas }.",
      "  Uma célula por opção: { id, marca, texto (até 160), fontes }. marca: \"sim\", \"nao\", \"parcial\", \"nc\" (não conferido) ou \"\" quando a linha não é de sim ou não.",
      "- cenarios: [{ cenario (até 120), perde (até 200, opcional: o que se perde nesse cenário), celulas: [{ id, encaixe, porque (até 200), fontes }] }]. encaixe: \"forte\", \"medio\", \"fraco\" ou \"nc\".",
      "- naoConferido: o que não deu para conferir, em frases de até 200.",
      "- fontes, em todo lugar: números a partir de 1 que apontam para a lista `fontes` do doc ([{ titulo, url, em }]), na mesma ordem.",
      "Grave a estrutura inteira de uma vez, com todos os campos. Grave também `markdown` com o mesmo conteúdo em texto curto: ele só aparece quando a estrutura não pode ser usada.",
      "",
      "Não inclua preço, custo estimado nem qualquer valor em dinheiro. Não eleja vencedora: descreva os fatos e as consequências.",
      "Escreva em português do Brasil.",
    ];
    const ctx = limpo(contexto, CONTEXTO_MAX);
    if (ctx) out.push("", "Contexto da decisão: " + ctx);
    return out.join("\n");
  }

  /* ---------- comparação profunda (collection arch-dossies) ----------
     Uma análise pronta vale 30 dias a partir de prontoEm (ou até expiraEm, quando a tarefa gravou). */
  function expiraDe(doc) {
    if (!doc) return null;
    const e = isoOk(doc.expiraEm);
    if (e) return e;
    const p = Date.parse(doc.prontoEm || "");
    return Number.isFinite(p) ? new Date(p + VALIDADE_DIAS * DIA).toISOString() : null;
  }
  /* pendente, pronta, vencida ou falhou (relógio injetado) */
  function estadoDaAnalise(doc, agora = Date.now()) {
    if (!doc || typeof doc !== "object") return "falhou";
    if (doc.estado === "pendente") return "pendente";
    if (doc.estado === "pronto") { const e = expiraDe(doc); return e && agora < Date.parse(e) ? "pronta" : "vencida"; }
    return "falhou";
  }
  /* Para a aba Profunda de um conjunto: { pronta, pendente, vencida, falhou } (o mais recente de cada; docs: [{ id, data }]) */
  function analisesDoConjunto(docs, aba, ids, agora = Date.now()) {
    const k = conjunto(ids);
    const out = { pronta: null, pendente: null, vencida: null, falhou: null };
    const l = (Array.isArray(docs) ? docs : []).filter((d) => d && d.data && d.data.aba === aba && conjunto(d.data.ids) === k)
      .sort((a, b) => String(b.data.criado || "").localeCompare(String(a.data.criado || "")));
    for (const d of l) { const e = estadoDaAnalise(d.data, agora); if (!out[e]) out[e] = d; }
    return out;
  }

  /* ---------- estrutura da comparação profunda (pedido de 19/11, 20h13) ----------
     A tarefa grava `estrutura` no doc; o site valida ao ler e nunca confia. estruturaOk devolve a estrutura saneada:
     corta os tamanhos, descarta célula e item de id desconhecido, marca inválida vira "", número de fonte fora da lista
     some, texto com preço sai, e limita a 12 grupos, 40 linhas por grupo e 12 cenários. null quando não dá para usar
     (não é objeto, v diferente de 1, menos de dois itens conhecidos ou nada para mostrar). As células de cada linha
     voltam na ordem de `itens`, uma por item; a que faltou vem vazia (a tela mostra "não conferido"). */
  const TITULOS_GRUPOS = ["Capacidades", "Limites", "Opções de uso e operação", "Maturidade e ritmo", "Dependência do fornecedor"];
  const MARCAS = ["sim", "nao", "parcial", "nc"];
  const ENCAIXES = ["forte", "medio", "fraco", "nc"];
  const ROT_MARCA = { sim: "Sim", nao: "Não", parcial: "Parcial", nc: "Não conferido" };
  const ROT_ENCAIXE = { forte: "Forte", medio: "Médio", fraco: "Fraco", nc: "Não conferido" };
  const E_LIM = { grupos: 12, linhas: 40, cenarios: 12, resumo: 6, pontos: 5, fontesPorTexto: 8, naoConferido: 20 };
  const lista = (x, max = 200) => (Array.isArray(x) ? x.slice(0, max) : []);
  const obj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
  function estruturaOk(e, ids, nFontes) {
    if (!obj(e) || e.v !== 1) return null;
    const pode = new Set(lista(ids, 20).map(String));
    const n = Math.max(0, Math.min(500, Math.floor(Number(nFontes) || 0)));
    const txt = (s, max) => { const t = typeof s === "string" || typeof s === "number" ? limpo(s, max) : ""; return t && !temPreco(t) ? t : ""; };
    const fts = (l) => [...new Set(lista(l, 40).map(Number).filter((x) => Number.isInteger(x) && x >= 1 && x <= n))].slice(0, E_LIM.fontesPorTexto);
    const itens = [], vistos = new Set();
    for (const it of lista(e.itens, 20)) {
      const id = obj(it) ? String(it.id == null ? "" : it.id) : "";
      if (!pode.has(id) || vistos.has(id)) continue;
      vistos.add(id); itens.push({ id, nome: txt(it.nome, 80) || id });
    }
    if (itens.length < 2) return null;
    const ordem = itens.map((i) => i.id);
    /* por id, só os conhecidos, o primeiro de cada; devolve na ordem dos itens */
    const porId = (l, fn, vazio) => {
      const m = new Map();
      for (const c of lista(l, 40)) { if (!obj(c)) continue; const id = String(c.id == null ? "" : c.id); if (vistos.has(id) && !m.has(id)) m.set(id, fn(c, id)); }
      return ordem.map((id) => m.get(id) || vazio(id));
    };
    const ponto = (p, max) => (typeof p === "string" ? { texto: txt(p, max), fontes: [] } : obj(p) ? { texto: txt(p.texto, max), fontes: fts(p.fontes) } : { texto: "", fontes: [] });
    const pontos = (l, max, lim) => lista(l, 60).map((p) => ponto(p, max)).filter((p) => p.texto).slice(0, lim);
    const resumo = pontos(e.resumo, 220, E_LIM.resumo);
    const porItem = porId(e.porItem, (x, id) => ({ id, fortes: pontos(x.fortes, 140, E_LIM.pontos), fracos: pontos(x.fracos, 140, E_LIM.pontos) }), (id) => ({ id, fortes: [], fracos: [] }));
    const grupos = lista(e.grupos, 60).filter(obj).map((g) => ({
      titulo: txt(g.titulo, 60),
      linhas: lista(g.linhas, 200).filter(obj).map((l) => {
        const nota = txt(l.nota, 200);
        return { rotulo: txt(l.rotulo, 60), difere: l.difere === true, ...(nota ? { nota } : {}),
          celulas: porId(l.celulas, (c, id) => ({ id, marca: MARCAS.includes(c.marca) ? c.marca : "", texto: txt(c.texto, 160), fontes: fts(c.fontes) }), (id) => ({ id, marca: "", texto: "", fontes: [] })) };
      }).filter((l) => l.rotulo).slice(0, E_LIM.linhas),
    })).filter((g) => g.titulo && g.linhas.length).slice(0, E_LIM.grupos);
    const cenarios = lista(e.cenarios, 60).filter(obj).map((c) => {
      const perde = txt(c.perde, 200);
      return { cenario: txt(c.cenario, 120), ...(perde ? { perde } : {}),
        celulas: porId(c.celulas, (x, id) => ({ id, encaixe: ENCAIXES.includes(x.encaixe) ? x.encaixe : "", porque: txt(x.porque, 200), fontes: fts(x.fontes) }), (id) => ({ id, encaixe: "", porque: "", fontes: [] })) };
    }).filter((c) => c.cenario).slice(0, E_LIM.cenarios);
    const naoConferido = lista(e.naoConferido, 60).map((t) => txt(obj(t) ? t.texto : t, 200)).filter(Boolean).slice(0, E_LIM.naoConferido);
    if (!resumo.length && !grupos.length && !cenarios.length && !porItem.some((p) => p.fortes.length || p.fracos.length)) return null;
    return { v: 1, itens, resumo, porItem, grupos, cenarios, naoConferido };
  }
  /* Célula sem nada a dizer: marca "nc", ou sem marca e sem texto */
  const celulaNc = (c) => !c || c.marca === "nc" || (!c.marca && !c.texto);
  const linhaNc = (l) => !!l && (l.celulas || []).every(celulaNc);
  /* "Só o que difere" começa ligado quando a matriz inteira tem mais de 12 linhas */
  const soDifereInicial = (e) => !!e && (e.grupos || []).reduce((k, g) => k + g.linhas.length, 0) > 12;
  /* As linhas que a tela mostra: sem as não conferidas (a não ser com mostrarNc) e, com soDifere, só as que diferem */
  const linhasVisiveis = (linhas, { soDifere = false, mostrarNc = false } = {}) => (Array.isArray(linhas) ? linhas : []).filter((l) => (mostrarNc || !linhaNc(l)) && (!soDifere || l.difere));
  /* Markdown da estrutura, para "Ver em texto" e "Copiar para ADR": resumo, fortes e fracos, uma tabela por grupo, a de
     cenários, o não conferido e as fontes numeradas. Passa pela validação antes (texto com preço não entra). */
  function markdownDaEstrutura(estrutura, fontes, titulo) {
    const fl = Array.isArray(fontes) ? fontes : [];
    const e = estruturaOk(estrutura, obj(estrutura) ? lista(estrutura.itens, 20).map((i) => (obj(i) ? i.id : "")) : [], fl.length);
    if (!e) return "";
    const refs = (l) => (l && l.length ? " " + l.map((k) => "[" + k + "]").join("") : "");
    const nomes = e.itens.map((i) => i.nome);
    const cab = (primeira) => ["|" + (primeira ? " " + celulaMd(primeira) + " " : " ") + "| " + nomes.map(celulaMd).join(" | ") + " |", "|---|" + nomes.map(() => "---").join("|") + "|"];
    const out = ["## " + (limpo(titulo, 200) || "Comparação profunda"), "", "Opções: " + nomes.join(", ") + ".", ""];
    if (e.resumo.length) out.push("### Resumo", "", ...e.resumo.map((p) => "- " + p.texto + refs(p.fontes)), "");
    if (e.porItem.some((p) => p.fortes.length || p.fracos.length)) {
      out.push("### Pontos fortes e fracos", "");
      e.porItem.forEach((p, i) => {
        out.push("#### " + nomes[i], "");
        out.push(...(p.fortes.length ? p.fortes.map((f) => "- Forte: " + f.texto + refs(f.fontes)) : ["- Forte: nada listado"]));
        out.push(...(p.fracos.length ? p.fracos.map((f) => "- Fraco: " + f.texto + refs(f.fontes)) : ["- Fraco: nada listado"]), "");
      });
    }
    const cel = (c) => { const m = c.marca ? ROT_MARCA[c.marca] : ""; const t = [m, c.texto].filter(Boolean).join(": ") || "não conferido"; return celulaMd(t + refs(c.fontes)); };
    for (const g of e.grupos) {
      out.push("### " + g.titulo, "", ...cab(""));
      for (const l of g.linhas) out.push("| " + celulaMd(l.rotulo + (l.difere ? " (difere)" : "")) + " | " + l.celulas.map(cel).join(" | ") + " |");
      const notas = g.linhas.filter((l) => l.nota);
      out.push("", ...notas.map((l) => "- " + l.rotulo + ": " + l.nota), ...(notas.length ? [""] : []));
    }
    if (e.cenarios.length) {
      out.push("### Encaixe por cenário", "", ...cab("Cenário"));
      for (const c of e.cenarios) out.push("| " + celulaMd(c.cenario) + " | " + c.celulas.map((x) => celulaMd([x.encaixe ? ROT_ENCAIXE[x.encaixe] : "", x.porque].filter(Boolean).join(": ") + refs(x.fontes) || "não conferido")).join(" | ") + " |");
      const perdas = e.cenarios.filter((c) => c.perde);
      out.push("", ...perdas.map((c) => "- " + c.cenario + ". O que se perde: " + c.perde), ...(perdas.length ? [""] : []));
    }
    if (e.naoConferido.length) out.push("### Não conferido", "", ...e.naoConferido.map((t) => "- " + t), "");
    if (fl.length) {
      out.push("### Fontes", "");
      fl.forEach((f, i) => { const u = urlOk(f && f.url); out.push(`${i + 1}. ${celulaMd((f && f.titulo) || u || "fonte")}${u ? ": " + u : ""}${f && f.em && dataBR(f.em) ? " (lida em " + dataBR(f.em) + ")" : ""}`); });
      out.push("");
    }
    out.push("Análise gerada por IA a partir das fontes listadas. Confira antes de decidir.");
    return out.join("\n") + "\n";
  }

  /* ---------- quando a análise sai (pedido de 19/11, 20h13) ----------
     A tarefa "Lookout: comparações profundas" roda todo dia das 7h às 23h, no minuto 37 (horário de São Paulo, sem
     horário de verão). proximaRodada(agora) -> { em (ISO), hora ("HH:MM"), quando: "hoje" | "amanha" | "", texto }. */
  const RODADA = { de: 7, ate: 23, minuto: 37 };
  function partesSP(t) {
    const d = new Date(t);
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
      return { dia: p.year + "-" + p.month + "-" + p.day, h: Number(p.hour) % 24, m: Number(p.minute), s: Number(p.second), ms: d.getUTCMilliseconds() };
    } catch (e) {
      const x = new Date(d.getTime() - 3 * 3600_000);
      return { dia: x.toISOString().slice(0, 10), h: x.getUTCHours(), m: x.getUTCMinutes(), s: x.getUTCSeconds(), ms: x.getUTCMilliseconds() };
    }
  }
  const dois = (n) => String(n).padStart(2, "0");
  /* "HH:MM" em São Paulo */
  const horaSP = (iso) => { const t = typeof iso === "number" ? iso : Date.parse(iso || ""); if (!Number.isFinite(t)) return ""; const p = partesSP(t); return dois(p.h) + ":" + dois(p.m); };
  function proximaRodada(agora = Date.now()) {
    const p = partesSP(agora);
    const desde = ((p.h * 60 + p.m) * 60 + p.s) * 1000 + p.ms;
    let h, quando;
    if (p.h < RODADA.de) { h = RODADA.de; quando = "hoje"; }
    else if (p.m < RODADA.minuto && p.h <= RODADA.ate) { h = p.h; quando = ""; }
    else if (p.h + 1 <= RODADA.ate) { h = p.h + 1; quando = ""; }
    else { h = RODADA.de; quando = "amanha"; }
    const alvo = (h * 60 + RODADA.minuto) * 60_000 + (quando === "amanha" ? DIA : 0);
    const hora = dois(h) + ":" + dois(RODADA.minuto);
    const texto = quando === "amanha" ? "amanhã às " + h + "h" + RODADA.minuto : quando === "hoje" ? "hoje às " + h + "h" + RODADA.minuto : "às " + hora;
    return { em: new Date(agora - desde + alvo).toISOString(), hora, quando, texto };
  }
  /* "Pedido feito às 14:05." (ou "em 18/11 às 22:10" quando não foi hoje) e "A próxima rodada é às 14:37." */
  function textoPendente(pedidoEm, agora = Date.now()) {
    const t = Date.parse(pedidoEm || "");
    const r = proximaRodada(agora);
    const prox = "A próxima rodada é " + r.texto + ".";
    if (!Number.isFinite(t)) return prox;
    const p = partesSP(t), hoje = partesSP(agora).dia === p.dia;
    return "Pedido feito " + (hoje ? "" : "em " + p.dia.slice(8, 10) + "/" + p.dia.slice(5, 7) + " ") + "às " + horaSP(t) + ". " + prox;
  }

  /* ---------- ícone (regra do dono: sempre tentar um ícone; sem nenhum, o logotipo do Lookout esmaecido) ----------
     Devolve as URLs a tentar, na ordem: (a) `icone` que o Admin informou; (b) Tools: avatar da organização no GitHub
     (Landscape.marcaOk; pessoa nunca); (c) o ícone do site oficial pela rota /icone/<dominio> do próprio Worker.
     Lista vazia: a tela mostra o logotipo esmaecido ("Sem ícone"). Cloud usa o provedor do serviço. */
  const urlIcone = (u) => { const s = String(u == null ? "" : u).trim(); if (!s || s.length > 400) return ""; try { const x = new URL(s); return (x.protocol === "https:" || x.protocol === "http:") && !x.username && !x.password ? x.toString() : ""; } catch (e) { return ""; } };
  function dominioDe(u) {
    try { const x = new URL(String(u || "")); if (x.protocol !== "https:" && x.protocol !== "http:") return ""; const h = x.hostname.toLowerCase(); return /^[a-z0-9.-]{1,200}$/.test(h) && h.includes(".") && !/^\d+(\.\d+){3}$/.test(h) ? h : ""; } catch (e) { return ""; }
  }
  const rotaIcone = (site) => { const d = dominioDe(site); return d ? "/icone/" + d : ""; };
  function iconeDe(doc, provedor) {
    const out = [];
    const por = (u) => { if (u && !out.includes(u)) out.push(u); };
    const d = doc && typeof doc === "object" ? doc : {};
    por(urlIcone(d.icone));
    if (d.repo || d.gh || d.leve) {
      const L = raiz.Landscape, l = d.leve || {};
      const url = (d.gh && d.gh.marca) || l.marca, tipo = (d.gh && d.gh.dono && d.gh.dono.tipo) || l.dono;
      if (L && L.marcaOk(url, tipo)) por(url);
      por(rotaIcone(d.site || (d.gh && d.gh.site) || ""));
    } else {
      const p = provedor || null;
      if (p) { por(urlIcone(p.icone)); por(rotaIcone(p.site)); }
      else por(rotaIcone(d.links && d.links.produto));
    }
    return out;
  }

  /* Nome curto do cartão de Cloud (pedido de 19/11, 16h49): o provedor já aparece no ícone, então o prefixo com o nome
     dele sai do título ("Amazon EC2" vira "EC2", "Azure Blob Storage" vira "Blob Storage"). Só prefixo inteiro, seguido
     de espaço, e só quando sobra nome de verdade; "Cloud Run" do Google fica como está. O nome completo segue no title,
     no detalhe e na comparação. */
  const PREFIXOS_PROV = {
    aws: ["Amazon Web Services", "Amazon", "AWS"], gcp: ["Google Cloud", "Google"], azure: ["Microsoft Azure", "Microsoft", "Azure"],
    oci: ["Oracle Cloud Infrastructure", "Oracle Cloud", "Oracle", "OCI"], cloudflare: ["Cloudflare"], hetzner: ["Hetzner"], digitalocean: ["DigitalOcean"],
    vultr: ["Vultr"], akamai: ["Akamai", "Linode"], ovhcloud: ["OVHcloud", "OVH"], scaleway: ["Scaleway"], backblaze: ["Backblaze"], wasabi: ["Wasabi"],
    flyio: ["Fly.io", "Fly"], railway: ["Railway"], render: ["Render"], supabase: ["Supabase"], neon: ["Neon"], upstash: ["Upstash"],
  };
  function nomeCurto(nome, prov) {
    const n = String(nome || "").trim();
    const p = prov && typeof prov === "object" ? prov : { id: prov };
    const lista = (PREFIXOS_PROV[p.id] || []).concat(p.nome ? [p.nome] : []).sort((x, y) => y.length - x.length);
    for (const pre of lista) {
      if (n.length > pre.length + 1 && n.slice(0, pre.length).toLowerCase() === pre.toLowerCase() && n[pre.length] === " ") {
        const resto = n.slice(pre.length + 1).trim();
        if (resto.replace(/[^\p{L}\p{N}]/gu, "").length >= 2) return resto;
      }
    }
    return n;
  }

  /* Cores do provedor (pedido de 19/11, 16h50): até três, para a faixa lateral do cartão e o contorno do chip de filtro.
     Vale `cores` do doc do provedor quando houver (lista de hexadecimais); senão a tabela abaixo; senão a `cor` única. */
  const CORES_PROV = {
    aws: ["#232F3E", "#FF9900"], gcp: ["#4285F4", "#EA4335", "#FBBC04"], azure: ["#0078D4", "#50E6FF"], oci: ["#C74634"],
    cloudflare: ["#F38020", "#FAAE40"], akamai: ["#0096D6", "#FF9933"], ovhcloud: ["#000E9C", "#59D2EF"], supabase: ["#3ECF8E", "#1C1C1C"],
  };
  const HEX = /^#[0-9a-f]{6}$/i;
  function coresDe(prov) {
    const p = prov && typeof prov === "object" ? prov : {};
    const doDoc = Array.isArray(p.cores) ? p.cores.filter((c) => typeof c === "string" && HEX.test(c)).slice(0, 3) : [];
    if (doDoc.length) return doDoc;
    if (CORES_PROV[p.id]) return CORES_PROV[p.id].slice();
    return [HEX.test(p.cor || "") ? p.cor : "#888888"];
  }
  // Faixa em blocos iguais, sem degradê: "to right" para o contorno do chip, "to bottom" para a lateral do cartão
  function faixaCores(cores, direcao) {
    const l = (cores && cores.length ? cores : ["#888888"]).slice(0, 3), n = l.length;
    const partes = l.map((c, i) => `${c} ${Math.round((i * 100) / n)}% ${Math.round(((i + 1) * 100) / n)}%`);
    return `linear-gradient(${direcao === "baixo" ? "to bottom" : "to right"}, ${partes.join(", ")})`;
  }

  raiz.Arch = { DIA, nomeCurto, CORES_PROV, coresDe, faixaCores, MAX_COMPARAR, CONTEXTO_MAX, VALIDADE_DIAS, MARKDOWN_MAX, ID_SERV, ID_PROV, ID_CAT, ID_DOSSIE, POR, ABAS, abasHash, rotuloAba, abaDoc, abaHashDe, ehAbaTec, abaDossie, voltarPara, MOTIVOS, COMUNS, ATRIBUTOS, LINKS,
    COMUNS_CLOUD, CAPACIDADES, ehCloud, soConhecidas, conferidoDe, roteiroProfunda, GRANDES,
    semAcento, slug, urlOk, isoOk, temPreco, temPalavra, chavesDe, carac, textoCarac, validarCarac, validarAtributos, validarProvedores, validarCategorias,
    nomeSub, catDaSub, idServico, validarServico, provDe, filtrarCloud, agrupar, equivalentes, podeComparar, marcavel, conjunto,
    FILTROS_VAZIOS, lerFiltros, escreverFiltros, lerHash, escreverHash, linha, dataBR, ultimaVersao, ritmo, textoRitmo, montarComparacao, markdownAdr,
    GENERICAS, nomeDistinto, termosProv, citaServico, termosBusca, anuncio, novidadesDoServico, expiraDe, estadoDaAnalise, analisesDoConjunto, urlIcone, dominioDe, rotaIcone, iconeDe,
    TITULOS_GRUPOS, MARCAS, ENCAIXES, ROT_MARCA, ROT_ENCAIXE, E_LIM, estruturaOk, celulaNc, linhaNc, soDifereInicial, linhasVisiveis, markdownDaEstrutura,
    RODADA, horaSP, proximaRodada, textoPendente };
})(typeof globalThis !== "undefined" ? globalThis : this);
