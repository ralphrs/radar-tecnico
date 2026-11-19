// Semente da aba Cloud do ArchLandscape (pedido de 19/11): provedores, categorias e serviços.
//
// Só conhecimento estável: o nome do serviço como o provedor chama, o que é, de quem é, como cobra em palavras e a página
// oficial. Nada de preço (pedido de 19/11, 15h17: "Nem quero preços"). Na dúvida sobre um fato, o campo fica vazio.
// Capacidades (atributos): só as conferidas na documentação oficial, com a URL e a data, em src/cloud-capacidades.js;
// o que não deu para conferir fica de fora e a tela mostra "não conferido". Todos com conferido: null (conferência humana).
// Entra pelo cron (src/cloud.js, semearCloud): a primeira vez com INSERT OR IGNORE; versão nova (SEMENTE_EM) chega aos
// docs que já existem só nas capacidades, campo a campo, sem passar por cima do que o Admin gravou.
import { CAPS, CONFERIDO_EM } from "./cloud-capacidades.js";

// 12h00: a primeira; 18h00: as capacidades conferidas (pedido de 19/11, 15h17)
export const SEMENTE_EM = "2026-11-19T18:00:00.000Z";

export const PROVEDORES = [
  { id: "aws", nome: "Amazon Web Services", sigla: "AWS", cor: "#ff9900", tipo: "grande", site: "https://aws.amazon.com/", status: "https://health.aws.amazon.com/health/status", pais: "US", novidades: "https://aws.amazon.com/new/" },
  { id: "gcp", nome: "Google Cloud", sigla: "GCP", cor: "#4285f4", tipo: "grande", site: "https://cloud.google.com/", status: "https://status.cloud.google.com/", pais: "US", novidades: "https://cloud.google.com/release-notes" },
  { id: "azure", nome: "Microsoft Azure", sigla: "AZ", cor: "#0078d4", tipo: "grande", site: "https://azure.microsoft.com/", status: "https://azure.status.microsoft/", pais: "US", novidades: "https://azure.microsoft.com/updates/" },
  { id: "oci", nome: "Oracle Cloud", sigla: "OCI", cor: "#c74634", tipo: "grande", site: "https://www.oracle.com/cloud/", status: "https://ocistatus.oraclecloud.com/", pais: "US", novidades: "https://docs.oracle.com/en-us/iaas/releasenotes/" },
  { id: "cloudflare", nome: "Cloudflare", sigla: "CF", cor: "#f38020", tipo: "grande", site: "https://www.cloudflare.com/", status: "https://www.cloudflarestatus.com/", pais: "US", novidades: "https://developers.cloudflare.com/changelog/" },
  { id: "hetzner", nome: "Hetzner", sigla: "HZ", cor: "#d50c2d", tipo: "alternativa", site: "https://www.hetzner.com/", status: "https://status.hetzner.com/", pais: "DE" },
  { id: "digitalocean", nome: "DigitalOcean", sigla: "DO", cor: "#0080ff", tipo: "alternativa", site: "https://www.digitalocean.com/", status: "https://status.digitalocean.com/", pais: "US", novidades: "https://docs.digitalocean.com/release-notes/" },
  { id: "vultr", nome: "Vultr", sigla: "VU", cor: "#007bfc", tipo: "alternativa", site: "https://www.vultr.com/", status: "https://status.vultr.com/", pais: "US" },
  { id: "akamai", nome: "Akamai (Linode)", sigla: "LIN", cor: "#0096d6", tipo: "alternativa", site: "https://www.linode.com/", status: "https://status.linode.com/", pais: "US" },
  { id: "ovhcloud", nome: "OVHcloud", sigla: "OVH", cor: "#123f6d", tipo: "alternativa", site: "https://www.ovhcloud.com/", status: "https://www.status-ovhcloud.com/", pais: "FR" },
  { id: "scaleway", nome: "Scaleway", sigla: "SCW", cor: "#4f0599", tipo: "alternativa", site: "https://www.scaleway.com/", status: "https://status.scaleway.com/", pais: "FR" },
  { id: "backblaze", nome: "Backblaze", sigla: "B2", cor: "#e21e29", tipo: "alternativa", site: "https://www.backblaze.com/", status: "https://status.backblaze.com/", pais: "US" },
  { id: "wasabi", nome: "Wasabi", sigla: "WAS", cor: "#01a537", tipo: "alternativa", site: "https://wasabi.com/", status: "https://status.wasabi.com/", pais: "US" },
  { id: "flyio", nome: "Fly.io", sigla: "FLY", cor: "#7b3be2", tipo: "alternativa", site: "https://fly.io/", status: "https://status.flyio.net/", pais: "US" },
  { id: "railway", nome: "Railway", sigla: "RW", cor: "#5b37c9", tipo: "alternativa", site: "https://railway.com/", status: "https://status.railway.com/", pais: "US", novidades: "https://railway.com/changelog" },
  { id: "render", nome: "Render", sigla: "RND", cor: "#2a9d7c", tipo: "alternativa", site: "https://render.com/", status: "https://status.render.com/", pais: "US", novidades: "https://render.com/changelog" },
  { id: "supabase", nome: "Supabase", sigla: "SB", cor: "#2fa06e", tipo: "alternativa", site: "https://supabase.com/", status: "https://status.supabase.com/", pais: "US", novidades: "https://supabase.com/changelog" },
  { id: "neon", nome: "Neon", sigla: "NEON", cor: "#00a87a", tipo: "alternativa", site: "https://neon.tech/", status: "https://neonstatus.com/", pais: "US", novidades: "https://neon.tech/docs/changelog" },
  { id: "upstash", nome: "Upstash", sigla: "UP", cor: "#00a37a", tipo: "alternativa", site: "https://upstash.com/", status: "https://status.upstash.com/", pais: "US" },
];

export const CATEGORIAS = [
  { id: "computacao", nome: "Computação", subcategorias: [
    { id: "vms", nome: "Máquinas virtuais" }, { id: "conteineres", nome: "Contêineres gerenciados" }, { id: "kubernetes", nome: "Kubernetes gerenciado" },
    { id: "funcoes", nome: "Funções serverless" }, { id: "paas", nome: "Plataforma de aplicações" }] },
  { id: "armazenamento", nome: "Armazenamento", subcategorias: [{ id: "objetos", nome: "Objetos" }, { id: "blocos", nome: "Blocos" }, { id: "arquivos", nome: "Arquivos" }] },
  { id: "bancos", nome: "Bancos de dados", subcategorias: [
    { id: "relacional", nome: "Relacional gerenciado" }, { id: "postgres-serverless", nome: "Postgres serverless" }, { id: "nosql", nome: "NoSQL documento e chave-valor" },
    { id: "cache", nome: "Cache em memória" }, { id: "analitico", nome: "Analítico" }] },
  { id: "rede", nome: "Rede e entrega", subcategorias: [{ id: "cdn", nome: "CDN" }, { id: "dns", nome: "DNS" }, { id: "balanceador", nome: "Balanceador" }, { id: "vpn", nome: "Rede privada e VPN" }] },
  { id: "integracao", nome: "Integração e mensageria", subcategorias: [
    { id: "filas", nome: "Filas" }, { id: "eventos", nome: "Eventos e streaming" }, { id: "workflows", nome: "Orquestração de workflows" }, { id: "gateway-api", nome: "Gateway de API" }] },
  { id: "seguranca", nome: "Segurança e identidade", subcategorias: [{ id: "iam", nome: "Identidade e acesso" }, { id: "segredos", nome: "Segredos e chaves" }, { id: "waf", nome: "WAF e proteção DDoS" }] },
  { id: "observabilidade", nome: "Observabilidade", subcategorias: [{ id: "logs-metricas", nome: "Logs e métricas" }, { id: "rastreamento", nome: "Rastreamento" }] },
  { id: "ia", nome: "IA", subcategorias: [{ id: "modelos-api", nome: "Modelos por API" }, { id: "gpu", nome: "GPU e treino" }, { id: "vetorial", nome: "Busca vetorial" }] },
  { id: "dev", nome: "Ferramentas de desenvolvedor", subcategorias: [{ id: "ci-cd", nome: "CI/CD" }, { id: "registro", nome: "Registro de contêineres" }, { id: "iac", nome: "Infraestrutura como código" }] },
];

// Linha: [provedor, subcategoria, nome, apelidos, resumo, cobranca, página do produto, extras?]
// extras: { gratis, destaques, atributos, docs, precos, uso }
const C = {
  vm: "por segundo ou hora de máquina ligada, pelo tamanho escolhido, mais disco e saída de dados",
  vmh: "por hora de servidor, com teto mensal, mais tráfego acima da franquia",
  ct: "por vCPU e memória usadas enquanto o contêiner roda",
  k8s: "pelo plano de controle do cluster e pelas máquinas dos nós",
  k8sn: "pelas máquinas dos nós; o plano de controle depende do plano escolhido",
  fn: "por número de execuções e pelo tempo de execução com a memória alocada",
  paas: "por instância ou recurso usado, pelo tamanho do plano",
  obj: "por GB guardado, por requisição e por GB de saída",
  obj0: "por GB guardado e por operação, sem cobrança de saída de dados",
  blk: "por GB provisionado por mês, e por desempenho em alguns tipos",
  arq: "por GB guardado ou provisionado e pelo desempenho escolhido",
  rel: "por hora da instância, pelo armazenamento e pelos backups",
  pgs: "por tempo de computação ativo e por GB guardado",
  nosql: "por leitura e gravação (ou capacidade reservada) e por GB guardado",
  cache: "por hora do nó ou, no modo serverless, por dado guardado e processado",
  ana: "por dados lidos nas consultas ou por capacidade reservada, mais o armazenamento",
  cdn: "por GB entregue e por requisição, com variação por região",
  dns: "por zona hospedada e por milhão de consultas",
  lb: "por hora do balanceador e pelo tráfego processado",
  vpn: "por hora de conexão ou de gateway e pelo tráfego",
  fila: "por milhão de requisições ou operações",
  ev: "por eventos publicados ou por capacidade de streaming",
  wf: "por transições de estado ou passos executados",
  gw: "por milhão de chamadas e pelo tráfego",
  iam: "sem cobrança para o controle de acesso; recursos de identidade para usuários finais cobram por usuário ativo",
  seg: "por segredo ou chave guardada por mês e por milhão de operações",
  waf: "por regra e por milhão de requisições inspecionadas, ou pelo plano",
  log: "por GB de logs ingeridos e guardados e por métricas",
  tr: "por traços ou spans gravados e consultados",
  ia: "por tokens de entrada e de saída, pelo modelo escolhido",
  gpu: "por hora de máquina com GPU, pelo tipo de GPU",
  vet: "por armazenamento dos vetores e pelas consultas",
  ci: "por minuto de build, pelo tamanho da máquina",
  reg: "por GB guardado e pela saída de dados",
  iac: "sem cobrança pelo serviço; paga-se pelo que ele cria",
};
const sim = "sim", nao = "nao";

const LINHAS = [
  // ---------- Computação: máquinas virtuais ----------
  ["aws", "vms", "Amazon EC2", ["EC2"], "Máquinas virtuais em muitos tamanhos e famílias, com Linux ou Windows, em todas as regiões da AWS.", C.vm, "https://aws.amazon.com/ec2/", {}],
  ["gcp", "vms", "Compute Engine", ["GCE", "Google Compute Engine"], "Máquinas virtuais do Google Cloud, com tipos predefinidos ou sob medida.", C.vm, "https://cloud.google.com/products/compute", {}],
  ["azure", "vms", "Azure Virtual Machines", ["Azure VMs"], "Máquinas virtuais Linux e Windows na Azure, com conjuntos de escala.", C.vm, "https://azure.microsoft.com/products/virtual-machines/", {}],
  ["oci", "vms", "OCI Compute", ["Oracle Compute"], "Instâncias virtuais e bare metal da Oracle Cloud, com formas de CPU e memória ajustáveis.", C.vm, "https://www.oracle.com/cloud/compute/", {}],
  ["hetzner", "vms", "Hetzner Cloud Servers", ["Hetzner Cloud", "CX", "CAX"], "Servidores virtuais na Alemanha, na Finlândia, nos Estados Unidos e em Singapura, com x86 e ARM.", C.vmh, "https://www.hetzner.com/cloud/", {}],
  ["digitalocean", "vms", "DigitalOcean Droplets", ["Droplets"], "Máquinas virtuais Linux com planos fixos de CPU, memória e transferência.", C.vmh, "https://www.digitalocean.com/products/droplets", {}],
  ["vultr", "vms", "Vultr Cloud Compute", ["Vultr Instances"], "Máquinas virtuais em muitas cidades, inclusive São Paulo, com planos fixos.", C.vmh, "https://www.vultr.com/products/cloud-compute/", {}],
  ["akamai", "vms", "Linode Compute Instances", ["Linode", "Akamai Cloud Compute"], "Máquinas virtuais da Linode, hoje parte da Akamai, com planos compartilhados e dedicados.", C.vmh, "https://www.linode.com/products/shared/", {}],
  ["ovhcloud", "vms", "OVHcloud Public Cloud Instances", ["OVH Public Cloud"], "Instâncias virtuais da nuvem pública da OVHcloud, sobre OpenStack.", "por hora ou por mês, pelo modelo de instância", "https://www.ovhcloud.com/en/public-cloud/compute/", {}],
  ["scaleway", "vms", "Scaleway Instances", ["Scaleway Virtual Instances"], "Máquinas virtuais da Scaleway em data centers da Europa.", C.vmh, "https://www.scaleway.com/en/virtual-instances/", {}],
  ["flyio", "vms", "Fly Machines", ["Fly.io Machines"], "Microvms Firecracker que ligam rápido e rodam perto do usuário, controladas por API.", "por segundo de máquina ligada, pelo tamanho, mais volumes e saída", "https://fly.io/docs/machines/", {}],

  // ---------- contêineres gerenciados ----------
  ["aws", "conteineres", "AWS Fargate", ["Fargate"], "Execução de contêineres sem gerenciar servidores, usada pelo ECS e pelo EKS.", C.ct, "https://aws.amazon.com/fargate/", {}],
  ["gcp", "conteineres", "Cloud Run", ["Google Cloud Run"], "Roda contêineres sem servidor, por requisição ou como job, com escala até zero.", C.ct, "https://cloud.google.com/run", {}],
  ["azure", "conteineres", "Azure Container Apps", ["Container Apps"], "Contêineres sem gerenciar cluster, com escala por eventos e até zero.", C.ct, "https://azure.microsoft.com/products/container-apps/", {}],
  ["cloudflare", "conteineres", "Cloudflare Containers", [], "Contêineres que rodam na rede da Cloudflare, chamados a partir de um Worker.", "por tempo de execução, pela memória e CPU", "https://developers.cloudflare.com/containers/"],

  // ---------- Kubernetes ----------
  ["aws", "kubernetes", "Amazon EKS", ["EKS", "Elastic Kubernetes Service"], "Kubernetes gerenciado da AWS, com nós em EC2 ou Fargate.", C.k8s, "https://aws.amazon.com/eks/", {}],
  ["gcp", "kubernetes", "Google Kubernetes Engine", ["GKE"], "Kubernetes gerenciado do Google, com o modo Autopilot que cuida dos nós.", C.k8s, "https://cloud.google.com/kubernetes-engine", {}],
  ["azure", "kubernetes", "Azure Kubernetes Service", ["AKS"], "Kubernetes gerenciado da Azure.", C.k8sn, "https://azure.microsoft.com/products/kubernetes-service/", {}],
  ["oci", "kubernetes", "OCI Kubernetes Engine", ["OKE", "Container Engine for Kubernetes"], "Kubernetes gerenciado da Oracle Cloud.", C.k8sn, "https://www.oracle.com/cloud/cloud-native/kubernetes-engine/", {}],
  ["digitalocean", "kubernetes", "DigitalOcean Kubernetes", ["DOKS"], "Kubernetes gerenciado da DigitalOcean.", C.k8sn, "https://www.digitalocean.com/products/kubernetes"],
  ["scaleway", "kubernetes", "Scaleway Kapsule", ["Kapsule"], "Kubernetes gerenciado da Scaleway.", C.k8sn, "https://www.scaleway.com/en/kubernetes-kapsule/"],

  // ---------- funções serverless ----------
  ["aws", "funcoes", "AWS Lambda", ["Lambda"], "Funções que rodam por evento ou requisição, sem servidor.", C.fn, "https://aws.amazon.com/lambda/", {}],
  ["gcp", "funcoes", "Cloud Run functions", ["Cloud Functions", "Google Cloud Functions"], "Funções por evento ou HTTP do Google Cloud, hoje parte do Cloud Run.", C.fn, "https://cloud.google.com/functions", {}],
  ["azure", "funcoes", "Azure Functions", [], "Funções por evento da Azure, em planos de consumo ou dedicados.", C.fn, "https://azure.microsoft.com/products/functions/", {}],
  ["oci", "funcoes", "OCI Functions", ["Oracle Functions"], "Funções sem servidor da Oracle Cloud, baseadas no projeto Fn.", C.fn, "https://www.oracle.com/cloud/cloud-native/functions/", {}],
  ["cloudflare", "funcoes", "Cloudflare Workers", ["Workers"], "Código JavaScript, TypeScript, Python ou WebAssembly que roda na rede da Cloudflare, perto do usuário.", "por requisição e por tempo de CPU", "https://workers.cloudflare.com/", { uso: ["local"] }],
  ["supabase", "funcoes", "Supabase Edge Functions", ["Edge Functions"], "Funções TypeScript em Deno, distribuídas e integradas ao resto do Supabase.", "por número de execuções, dentro da cota do plano", "https://supabase.com/edge-functions", {}],
  ["akamai", "funcoes", "Akamai EdgeWorkers", ["EdgeWorkers"], "JavaScript que roda nos servidores de borda da Akamai.", "por requisição, pelo nível contratado", "https://www.akamai.com/products/serverless-computing-edgeworkers", {}],

  // ---------- plataforma de aplicações ----------
  ["aws", "paas", "AWS App Runner", ["App Runner"], "Publica aplicações web a partir do código ou de uma imagem, com escala automática.", "por vCPU e memória ativas e provisionadas", "https://aws.amazon.com/apprunner/"],
  ["gcp", "paas", "App Engine", ["Google App Engine", "GAE"], "Plataforma de aplicações do Google Cloud, nos ambientes padrão e flexível.", "por hora de instância, pelo tipo", "https://cloud.google.com/appengine"],
  ["azure", "paas", "Azure App Service", ["App Service", "Web Apps"], "Hospedagem gerenciada de aplicações web e APIs na Azure.", "pelo plano de serviço, por hora", "https://azure.microsoft.com/products/app-service/"],
  ["cloudflare", "paas", "Cloudflare Pages", ["Pages"], "Publica sites estáticos e full stack a partir do Git, servidos pela rede da Cloudflare.", "por plano; builds e funções contam nos limites", "https://pages.cloudflare.com/", {}],
  ["digitalocean", "paas", "DigitalOcean App Platform", ["App Platform"], "Publica aplicações e sites a partir do Git ou de imagem, na DigitalOcean.", C.paas, "https://www.digitalocean.com/products/app-platform", {}],
  ["flyio", "paas", "Fly.io Apps", ["fly launch", "Fly Launch"], "Publica aplicações em contêiner em várias regiões, sobre as Fly Machines.", "pelas máquinas, volumes e saída usados", "https://fly.io/docs/apps/", {}],
  ["railway", "paas", "Railway", [], "Plataforma que publica serviços, bancos e jobs a partir do Git ou de imagem.", "pelo uso de CPU, memória, disco e saída, dentro do plano", "https://railway.com/", {}],
  ["render", "paas", "Render Web Services", ["Render"], "Publica serviços web, workers e cron jobs a partir do Git ou de imagem.", "por instância, pelo tamanho, cobrada proporcionalmente", "https://render.com/docs/web-services", {}],
  ["oci", "paas", "OCI Container Engine for Apps", [], "", "", "", null],

  // ---------- Armazenamento: objetos ----------
  ["aws", "objetos", "Amazon S3", ["S3", "AWS S3", "Simple Storage Service"], "Armazenamento de objetos da AWS, em várias classes de acesso e custo.", C.obj, "https://aws.amazon.com/s3/", { destaques: ["a API que virou referência de armazenamento de objetos", "classes para acesso frequente, raro e arquivamento"] }],
  ["gcp", "objetos", "Cloud Storage", ["Google Cloud Storage", "GCS"], "Armazenamento de objetos do Google Cloud, em buckets regionais, duplos ou multirregionais.", C.obj, "https://cloud.google.com/storage", {}],
  ["azure", "objetos", "Azure Blob Storage", ["Blob Storage"], "Armazenamento de objetos da Azure, com camadas quente, fria e de arquivo.", C.obj, "https://azure.microsoft.com/products/storage/blobs/", {}],
  ["oci", "objetos", "OCI Object Storage", ["Oracle Object Storage"], "Armazenamento de objetos da Oracle Cloud, com camadas padrão, acesso raro e arquivo.", C.obj, "https://www.oracle.com/cloud/storage/object-storage/", {}],
  ["cloudflare", "objetos", "R2", ["Cloudflare R2"], "Armazenamento de objetos da Cloudflare com API compatível com S3.", C.obj0, "https://www.cloudflare.com/developer-platform/products/r2/", { destaques: ["sem cobrança de saída de dados", "API compatível com S3"] }],
  ["backblaze", "objetos", "Backblaze B2", ["B2", "B2 Cloud Storage"], "Armazenamento de objetos da Backblaze com API própria e compatível com S3.", "por GB guardado; saída sem cobrança até um limite ligado ao volume guardado", "https://www.backblaze.com/cloud-storage", {}],
  ["wasabi", "objetos", "Wasabi Hot Cloud Storage", ["Wasabi"], "Armazenamento de objetos compatível com S3, com uma classe só.", "por GB guardado, com prazo mínimo de retenção; sem cobrança por saída ou requisição dentro da política de uso", "https://wasabi.com/cloud-object-storage", {}],
  ["digitalocean", "objetos", "DigitalOcean Spaces", ["Spaces"], "Armazenamento de objetos compatível com S3, com CDN embutida.", "por assinatura mensal com franquia, mais excedente de espaço e saída", "https://www.digitalocean.com/products/spaces", {}],
  ["hetzner", "objetos", "Hetzner Object Storage", [], "Armazenamento de objetos compatível com S3, na Alemanha e na Finlândia.", "por GB guardado e por tráfego acima da franquia", "https://www.hetzner.com/storage/object-storage/", {}],
  ["ovhcloud", "objetos", "OVHcloud Object Storage", [], "Armazenamento de objetos compatível com S3 da OVHcloud.", C.obj, "https://www.ovhcloud.com/en/public-cloud/object-storage/", {}],
  ["scaleway", "objetos", "Scaleway Object Storage", [], "Armazenamento de objetos compatível com S3 da Scaleway.", C.obj, "https://www.scaleway.com/en/object-storage/", {}],
  ["supabase", "objetos", "Supabase Storage", [], "Armazenamento de arquivos e objetos integrado à autenticação e às regras do Supabase.", "por GB guardado e de saída, dentro da cota do plano", "https://supabase.com/storage", {}],

  // ---------- blocos ----------
  ["aws", "blocos", "Amazon EBS", ["EBS", "Elastic Block Store"], "Discos em bloco para instâncias EC2, em SSD e HDD.", C.blk, "https://aws.amazon.com/ebs/", {}],
  ["gcp", "blocos", "Persistent Disk", ["Google Persistent Disk", "Hyperdisk"], "Discos em bloco do Compute Engine, inclusive os da linha Hyperdisk.", C.blk, "https://cloud.google.com/persistent-disk", {}],
  ["azure", "blocos", "Azure Managed Disks", ["Managed Disks"], "Discos gerenciados para máquinas virtuais da Azure.", C.blk, "https://azure.microsoft.com/products/storage/disks/", {}],
  ["oci", "blocos", "OCI Block Volume", [], "Volumes em bloco da Oracle Cloud com níveis de desempenho ajustáveis.", C.blk, "https://www.oracle.com/cloud/storage/block-volumes/", {}],
  ["digitalocean", "blocos", "DigitalOcean Volumes", ["Block Storage"], "Volumes em bloco para Droplets.", "por GB por mês", "https://www.digitalocean.com/products/block-storage", {}],

  // ---------- arquivos ----------
  ["aws", "arquivos", "Amazon EFS", ["EFS", "Elastic File System"], "Sistema de arquivos NFS gerenciado que cresce sozinho.", C.arq, "https://aws.amazon.com/efs/", {}],
  ["gcp", "arquivos", "Filestore", ["Google Filestore"], "Sistema de arquivos NFS gerenciado do Google Cloud.", C.arq, "https://cloud.google.com/filestore", {}],
  ["azure", "arquivos", "Azure Files", [], "Compartilhamentos de arquivos gerenciados por SMB e NFS.", C.arq, "https://azure.microsoft.com/products/storage/files/", {}],
  ["oci", "arquivos", "OCI File Storage", [], "Sistema de arquivos NFS gerenciado da Oracle Cloud.", C.arq, "https://www.oracle.com/cloud/storage/file-storage/", {}],

  // ---------- Bancos: relacional ----------
  ["aws", "relacional", "Amazon RDS", ["RDS", "Relational Database Service"], "Bancos relacionais gerenciados: PostgreSQL, MySQL, MariaDB, SQL Server, Oracle e Db2.", C.rel, "https://aws.amazon.com/rds/", {}],
  ["aws", "relacional", "Amazon Aurora", ["Aurora"], "Banco relacional da AWS compatível com PostgreSQL e MySQL, com armazenamento distribuído.", C.rel, "https://aws.amazon.com/rds/aurora/", {}],
  ["gcp", "relacional", "Cloud SQL", ["Google Cloud SQL"], "Bancos relacionais gerenciados: PostgreSQL, MySQL e SQL Server.", C.rel, "https://cloud.google.com/sql", {}],
  ["gcp", "relacional", "AlloyDB for PostgreSQL", ["AlloyDB"], "Banco compatível com PostgreSQL do Google, feito para carga transacional e analítica.", C.rel, "https://cloud.google.com/alloydb", { uso: ["self-hosted"] }],
  ["azure", "relacional", "Azure SQL Database", ["Azure SQL"], "SQL Server gerenciado na Azure, com opção serverless.", C.rel, "https://azure.microsoft.com/products/azure-sql/database/", {}],
  ["azure", "relacional", "Azure Database for PostgreSQL", [], "PostgreSQL gerenciado na Azure, no modo servidor flexível.", C.rel, "https://azure.microsoft.com/products/postgresql/", {}],
  ["oci", "relacional", "Oracle Autonomous Database", ["Autonomous Database", "ADB"], "Banco Oracle gerenciado que cuida sozinho de ajuste, backup e atualização.", "por OCPU ou ECPU usada e por armazenamento", "https://www.oracle.com/autonomous-database/", {}],
  ["cloudflare", "relacional", "D1", ["Cloudflare D1"], "Banco SQL sem servidor da Cloudflare, sobre SQLite, feito para os Workers.", "por linhas lidas e gravadas e por GB guardado", "https://developers.cloudflare.com/d1/", {}],
  ["digitalocean", "relacional", "DigitalOcean Managed Databases", ["DO Managed Databases"], "PostgreSQL, MySQL e outros bancos gerenciados da DigitalOcean.", "por nó do cluster, pelo tamanho", "https://www.digitalocean.com/products/managed-databases", {}],
  ["scaleway", "relacional", "Scaleway Managed Databases", [], "PostgreSQL e MySQL gerenciados da Scaleway.", "por hora do nó e por armazenamento", "https://www.scaleway.com/en/database/", {}],
  ["supabase", "relacional", "Supabase Database", ["Supabase Postgres"], "PostgreSQL dedicado por projeto, com API, autenticação e tempo real em volta.", "pelo plano e pelo tamanho da instância de computação", "https://supabase.com/database", { uso: ["self-hosted", "local"] }],

  // ---------- Postgres serverless ----------
  ["neon", "postgres-serverless", "Neon Postgres", ["Neon"], "PostgreSQL sem servidor com computação separada do armazenamento.", C.pgs, "https://neon.tech/", { destaques: ["branches de banco para desenvolvimento", "escala até zero"] }],
  ["aws", "postgres-serverless", "Aurora Serverless v2", ["Aurora Serverless"], "Modo do Aurora que ajusta a capacidade de computação conforme a carga.", "por unidades de capacidade usadas por hora e por armazenamento", "https://aws.amazon.com/rds/aurora/serverless/", {}],
  ["cloudflare", "postgres-serverless", "Hyperdrive", ["Cloudflare Hyperdrive"], "Acelera o acesso de Workers a um PostgreSQL ou MySQL que já existe, com pool de conexões e cache.", "incluído nos planos dos Workers, com limites", "https://developers.cloudflare.com/hyperdrive/", {}],

  // ---------- NoSQL ----------
  ["aws", "nosql", "Amazon DynamoDB", ["DynamoDB"], "Banco chave-valor e documento sem servidor da AWS.", C.nosql, "https://aws.amazon.com/dynamodb/", {}],
  ["gcp", "nosql", "Firestore", ["Cloud Firestore"], "Banco de documentos sem servidor do Google, usado também pelo Firebase.", C.nosql, "https://cloud.google.com/firestore", {}],
  ["azure", "nosql", "Azure Cosmos DB", ["Cosmos DB"], "Banco distribuído da Azure com APIs de documento, chave-valor, MongoDB e Cassandra.", "por unidades de requisição (provisionadas ou serverless) e por GB guardado", "https://azure.microsoft.com/products/cosmos-db/", {}],
  ["oci", "nosql", "Oracle NoSQL Database Cloud Service", ["OCI NoSQL"], "Banco chave-valor e documento gerenciado da Oracle Cloud.", C.nosql, "https://www.oracle.com/database/nosql/", {}],
  ["cloudflare", "nosql", "Workers KV", ["Cloudflare KV", "KV"], "Armazenamento chave-valor global da Cloudflare, feito para muita leitura.", "por leituras, gravações e GB guardado", "https://developers.cloudflare.com/kv/", {}],
  ["cloudflare", "nosql", "Durable Objects", ["Cloudflare Durable Objects"], "Objetos com estado e armazenamento próprio, cada um num lugar, chamados pelos Workers.", "por requisição, por tempo ativo e pelo armazenamento", "https://developers.cloudflare.com/durable-objects/", {}],

  // ---------- cache ----------
  ["aws", "cache", "Amazon ElastiCache", ["ElastiCache"], "Cache em memória gerenciado com Valkey, Redis OSS e Memcached.", C.cache, "https://aws.amazon.com/elasticache/", {}],
  ["gcp", "cache", "Memorystore", ["Google Memorystore"], "Cache em memória gerenciado do Google com Valkey, Redis e Memcached.", C.cache, "https://cloud.google.com/memorystore", {}],
  ["azure", "cache", "Azure Cache for Redis", ["Azure Redis"], "Redis gerenciado na Azure.", C.cache, "https://azure.microsoft.com/products/cache/", {}],
  ["oci", "cache", "OCI Cache", ["OCI Cache with Redis"], "Cache em memória gerenciado da Oracle Cloud.", C.cache, "https://www.oracle.com/cloud/cache/"],
  ["upstash", "cache", "Upstash Redis (cache)", ["Upstash"], "Redis sem servidor usado como cache, acessível por HTTP de qualquer runtime.", "por comando executado ou por plano fixo", "https://upstash.com/", {}],

  // ---------- analítico ----------
  ["aws", "analitico", "Amazon Redshift", ["Redshift"], "Data warehouse da AWS, com clusters provisionados ou modo serverless.", C.ana, "https://aws.amazon.com/redshift/", {}],
  ["gcp", "analitico", "BigQuery", ["Google BigQuery"], "Data warehouse sem servidor do Google, com SQL padrão.", C.ana, "https://cloud.google.com/bigquery", {}],
  ["azure", "analitico", "Azure Synapse Analytics", ["Synapse"], "Serviço de analytics da Azure com pools SQL e Spark.", C.ana, "https://azure.microsoft.com/products/synapse-analytics/"],
  ["oci", "analitico", "Autonomous Data Warehouse", ["ADW"], "A versão do Autonomous Database da Oracle feita para análise.", "por OCPU ou ECPU usada e por armazenamento", "https://www.oracle.com/autonomous-database/autonomous-data-warehouse/"],

  // ---------- Rede: CDN ----------
  ["aws", "cdn", "Amazon CloudFront", ["CloudFront"], "CDN da AWS, integrada ao S3, ao balanceador e ao AWS WAF.", C.cdn, "https://aws.amazon.com/cloudfront/", {}],
  ["gcp", "cdn", "Cloud CDN", ["Google Cloud CDN"], "CDN do Google Cloud ligada ao balanceador de carga externo.", C.cdn, "https://cloud.google.com/cdn", {}],
  ["azure", "cdn", "Azure Front Door", ["Front Door"], "CDN e balanceador global da Azure, com WAF.", "por plano, por GB entregue e por requisição", "https://azure.microsoft.com/products/frontdoor/", {}],
  ["oci", "cdn", "OCI CDN", [], "", "", "", null],
  ["cloudflare", "cdn", "Cloudflare CDN", ["Cloudflare Cache"], "CDN da Cloudflare, que vem com o proxy de qualquer domínio na rede dela.", "pelo plano do domínio; o tráfego da CDN não é cobrado por GB nos planos comuns", "https://www.cloudflare.com/application-services/products/cdn/", {}],
  ["akamai", "cdn", "Akamai CDN", ["Akamai Ion"], "CDN da Akamai, uma das primeiras do mercado.", "por contrato, pelo volume entregue", "https://www.akamai.com/solutions/content-delivery-network", {}],
  ["backblaze", "cdn", "Backblaze B2 com CDN parceira", [], "", "", "", null],

  // ---------- DNS ----------
  ["aws", "dns", "Amazon Route 53", ["Route 53", "Route53"], "DNS gerenciado da AWS, com roteamento por latência, peso e saúde.", C.dns, "https://aws.amazon.com/route53/", {}],
  ["gcp", "dns", "Cloud DNS", ["Google Cloud DNS"], "DNS gerenciado do Google Cloud.", C.dns, "https://cloud.google.com/dns", {}],
  ["azure", "dns", "Azure DNS", [], "DNS gerenciado da Azure.", C.dns, "https://azure.microsoft.com/products/dns/", {}],
  ["oci", "dns", "OCI DNS", ["Oracle DNS"], "DNS gerenciado da Oracle Cloud.", C.dns, "https://www.oracle.com/cloud/networking/dns/"],
  ["cloudflare", "dns", "Cloudflare DNS", [], "DNS autoritativo da Cloudflare, incluído em todos os planos.", "incluído no plano do domínio, inclusive no grátis", "https://www.cloudflare.com/application-services/products/dns/", { gratis: "Incluído no plano grátis." }],
  ["hetzner", "dns", "Hetzner DNS", [], "DNS gerenciado da Hetzner para os domínios dos clientes.", "sem cobrança à parte para clientes", "https://www.hetzner.com/dns-console/"],
  ["digitalocean", "dns", "DigitalOcean DNS", [], "DNS gerenciado da DigitalOcean.", "sem cobrança à parte", "https://docs.digitalocean.com/products/networking/dns/"],

  // ---------- balanceador ----------
  ["aws", "balanceador", "Elastic Load Balancing", ["ELB", "ALB", "NLB"], "Balanceadores da AWS: de aplicação, de rede e de gateway.", C.lb, "https://aws.amazon.com/elasticloadbalancing/", {}],
  ["gcp", "balanceador", "Cloud Load Balancing", ["Google Cloud Load Balancing"], "Balanceadores do Google Cloud, globais ou regionais.", C.lb, "https://cloud.google.com/load-balancing", {}],
  ["azure", "balanceador", "Azure Load Balancer", [], "Balanceador de camada 4 da Azure.", C.lb, "https://azure.microsoft.com/products/load-balancer/", {}],
  ["oci", "balanceador", "OCI Load Balancer", [], "Balanceadores de carga de aplicação e de rede da Oracle Cloud.", C.lb, "https://www.oracle.com/cloud/networking/load-balancing/"],
  ["cloudflare", "balanceador", "Cloudflare Load Balancing", [], "Balanceamento global na borda da Cloudflare, com checagem de saúde das origens.", "por assinatura, pelo número de origens e checagens", "https://www.cloudflare.com/application-services/products/load-balancing/", {}],
  ["hetzner", "balanceador", "Hetzner Load Balancer", [], "Balanceador para os servidores da Hetzner Cloud.", "por hora, com teto mensal, pelo tipo", "https://www.hetzner.com/cloud/load-balancer/"],

  // ---------- rede privada e VPN ----------
  ["aws", "vpn", "Amazon VPC", ["VPC"], "Rede virtual isolada na AWS, com sub-redes, rotas e regras.", "sem cobrança pela VPC; NAT, VPN e endpoints cobram por hora e tráfego", "https://aws.amazon.com/vpc/", {}],
  ["gcp", "vpn", "Cloud VPN", ["Google Cloud VPN"], "VPN IPsec para ligar redes à VPC do Google Cloud.", C.vpn, "https://cloud.google.com/network-connectivity/docs/vpn", {}],
  ["azure", "vpn", "Azure VPN Gateway", ["VPN Gateway"], "Gateway de VPN da Azure, site a site e ponto a site.", C.vpn, "https://azure.microsoft.com/products/vpn-gateway/", {}],
  ["oci", "vpn", "OCI Site-to-Site VPN", [], "VPN IPsec da Oracle Cloud.", "", "https://www.oracle.com/cloud/networking/site-to-site-vpn/", {}],
  ["cloudflare", "vpn", "Cloudflare Tunnel", ["cloudflared", "Argo Tunnel"], "Liga um serviço interno à rede da Cloudflare sem abrir porta de entrada.", "incluído nos planos", "https://www.cloudflare.com/products/tunnel/", {}],

  // ---------- Integração: filas ----------
  ["aws", "filas", "Amazon SQS", ["SQS", "Simple Queue Service"], "Filas de mensagens gerenciadas da AWS, padrão ou FIFO.", C.fila, "https://aws.amazon.com/sqs/", {}],
  ["gcp", "filas", "Cloud Tasks", ["Google Cloud Tasks"], "Fila de tarefas que chama serviços HTTP com nova tentativa e agendamento.", "por milhão de operações", "https://cloud.google.com/tasks", {}],
  ["azure", "filas", "Azure Service Bus", ["Service Bus"], "Mensageria corporativa da Azure com filas e tópicos.", "por operações ou pela unidade do nível Premium", "https://azure.microsoft.com/products/service-bus/", {}],
  ["oci", "filas", "OCI Queue", [], "Filas de mensagens gerenciadas da Oracle Cloud.", C.fila, "https://www.oracle.com/cloud/queue/"],
  ["cloudflare", "filas", "Cloudflare Queues", ["Queues"], "Filas de mensagens entre Workers, com nova tentativa e fila de mortas.", "por operação (gravação, leitura e exclusão)", "https://developers.cloudflare.com/queues/", {}],
  ["upstash", "filas", "QStash", ["Upstash QStash"], "Fila e agendador de mensagens por HTTP, feito para ambientes sem servidor.", "por mensagem, ou por plano fixo", "https://upstash.com/docs/qstash/overall/getstarted", {}],

  // ---------- eventos e streaming ----------
  ["aws", "eventos", "Amazon EventBridge", ["EventBridge"], "Barramento de eventos da AWS, com regras, agendamentos e pipes.", "por milhão de eventos publicados", "https://aws.amazon.com/eventbridge/"],
  ["gcp", "eventos", "Pub/Sub", ["Google Pub/Sub", "Cloud Pub/Sub"], "Mensageria de publicação e assinatura do Google Cloud.", "por volume de dados publicados e entregues", "https://cloud.google.com/pubsub"],
  ["azure", "eventos", "Azure Event Hubs", ["Event Hubs"], "Ingestão de eventos em grande volume, com endpoint compatível com Kafka.", "por unidade de capacidade e por eventos", "https://azure.microsoft.com/products/event-hubs/", {}],
  ["oci", "eventos", "OCI Streaming", [], "Streaming gerenciado da Oracle Cloud com API compatível com Kafka.", C.ev, "https://www.oracle.com/cloud/cloud-native/streaming/", {}],
  ["upstash", "eventos", "Upstash Kafka", [], "", "", "", null],

  // ---------- workflows ----------
  ["aws", "workflows", "AWS Step Functions", ["Step Functions"], "Orquestração de fluxos com máquinas de estado, ligando serviços da AWS.", C.wf, "https://aws.amazon.com/step-functions/", {}],
  ["gcp", "workflows", "Workflows", ["Google Cloud Workflows"], "Orquestração de chamadas a serviços e APIs do Google Cloud em YAML ou JSON.", "por passo executado", "https://cloud.google.com/workflows", {}],
  ["azure", "workflows", "Azure Logic Apps", ["Logic Apps"], "Fluxos de integração com conectores prontos, desenhados no portal ou em código.", "por execução de ação ou pelo plano padrão", "https://azure.microsoft.com/products/logic-apps/"],
  ["cloudflare", "workflows", "Cloudflare Workflows", [], "Fluxos duráveis com passos e nova tentativa, escritos em código nos Workers.", "pelo uso dos Workers e do armazenamento do estado", "https://developers.cloudflare.com/workflows/", {}],

  // ---------- gateway de API ----------
  ["aws", "gateway-api", "Amazon API Gateway", ["API Gateway"], "Publicação de APIs REST, HTTP e WebSocket na AWS.", C.gw, "https://aws.amazon.com/api-gateway/", {}],
  ["gcp", "gateway-api", "Apigee", ["Google Apigee"], "Gestão de APIs do Google: gateway, políticas, portal e análise.", "por chamadas e pelo plano", "https://cloud.google.com/apigee", { uso: ["self-hosted"] }],
  ["azure", "gateway-api", "Azure API Management", ["APIM"], "Gestão de APIs da Azure: gateway, políticas e portal do desenvolvedor.", "pelo nível escolhido ou por chamada no modo de consumo", "https://azure.microsoft.com/products/api-management/", { uso: ["self-hosted"] }],
  ["oci", "gateway-api", "OCI API Gateway", [], "Gateway de APIs da Oracle Cloud.", C.gw, "https://www.oracle.com/cloud/cloud-native/api-gateway/"],
  ["cloudflare", "gateway-api", "Cloudflare API Shield", ["API Shield"], "Proteção e gestão de APIs na borda da Cloudflare: esquema, mTLS e limite de taxa.", "pelo plano Enterprise ou como complemento", "https://www.cloudflare.com/application-services/products/api-gateway/", {}],

  // ---------- Segurança: identidade ----------
  ["aws", "iam", "AWS IAM", ["IAM", "Identity and Access Management"], "Usuários, papéis e políticas de acesso aos recursos da AWS.", C.iam, "https://aws.amazon.com/iam/"],
  ["gcp", "iam", "Cloud IAM", ["Google Cloud IAM"], "Papéis e permissões nos recursos do Google Cloud.", C.iam, "https://cloud.google.com/iam"],
  ["azure", "iam", "Microsoft Entra ID", ["Entra ID", "Azure Active Directory", "Azure AD"], "Diretório e identidade da Microsoft, para funcionários e aplicações.", "por usuário, pelo plano", "https://www.microsoft.com/security/business/identity-access/microsoft-entra-id", {}],
  ["oci", "iam", "OCI Identity and Access Management", ["OCI IAM"], "Usuários, grupos, políticas e domínios de identidade da Oracle Cloud.", C.iam, "https://www.oracle.com/security/cloud-security/identity-cloud/"],
  ["cloudflare", "iam", "Cloudflare Access", ["Access"], "Acesso Zero Trust a aplicações internas, com login pelo provedor de identidade da empresa.", "por usuário, no plano Zero Trust", "https://www.cloudflare.com/zero-trust/products/access/", {}],
  ["supabase", "iam", "Supabase Auth", [], "Cadastro e login de usuários integrado às regras de acesso do Postgres.", "por usuário ativo por mês, dentro da cota do plano", "https://supabase.com/auth", {}],

  // ---------- segredos e chaves ----------
  ["aws", "segredos", "AWS Secrets Manager", ["Secrets Manager"], "Guarda e gira segredos como senhas de banco e chaves de API.", C.seg, "https://aws.amazon.com/secrets-manager/", {}],
  ["gcp", "segredos", "Secret Manager", ["Google Secret Manager"], "Guarda segredos com versões e controle de acesso.", C.seg, "https://cloud.google.com/security/products/secret-manager"],
  ["azure", "segredos", "Azure Key Vault", ["Key Vault"], "Segredos, chaves e certificados gerenciados na Azure.", C.seg, "https://azure.microsoft.com/products/key-vault/", {}],
  ["oci", "segredos", "OCI Vault", [], "Chaves e segredos gerenciados da Oracle Cloud.", C.seg, "https://www.oracle.com/security/cloud-security/key-management/", {}],

  // ---------- WAF e DDoS ----------
  ["aws", "waf", "AWS WAF", [], "Firewall de aplicação web para CloudFront, balanceador e API Gateway.", C.waf, "https://aws.amazon.com/waf/", {}],
  ["gcp", "waf", "Cloud Armor", ["Google Cloud Armor"], "WAF e proteção contra DDoS no balanceador do Google Cloud.", C.waf, "https://cloud.google.com/security/products/armor", {}],
  ["azure", "waf", "Azure Web Application Firewall", ["Azure WAF"], "WAF da Azure, no Front Door ou no Application Gateway.", C.waf, "https://azure.microsoft.com/products/web-application-firewall/"],
  ["oci", "waf", "OCI Web Application Firewall", ["OCI WAF"], "WAF da Oracle Cloud.", C.waf, "https://www.oracle.com/security/cloud-security/web-application-firewall/"],
  ["cloudflare", "waf", "Cloudflare WAF", [], "Firewall de aplicação web na borda da Cloudflare, com regras gerenciadas.", "pelo plano do domínio; regras avançadas nos planos pagos", "https://www.cloudflare.com/application-services/products/waf/", {}],

  // ---------- Observabilidade ----------
  ["aws", "logs-metricas", "Amazon CloudWatch", ["CloudWatch"], "Logs, métricas, alarmes e painéis dos recursos da AWS.", C.log, "https://aws.amazon.com/cloudwatch/"],
  ["gcp", "logs-metricas", "Cloud Logging", ["Google Cloud Logging", "Stackdriver Logging"], "Logs centralizados do Google Cloud.", "por GB ingerido acima da cota e pela retenção estendida", "https://cloud.google.com/logging"],
  ["azure", "logs-metricas", "Azure Monitor", ["Log Analytics", "Application Insights"], "Logs, métricas e alertas da Azure, com Log Analytics e Application Insights.", C.log, "https://azure.microsoft.com/products/monitor/"],
  ["oci", "logs-metricas", "OCI Logging", [], "Logs centralizados da Oracle Cloud.", "por GB guardado acima da cota", "https://www.oracle.com/cloud/cloud-native/logging/"],
  ["cloudflare", "logs-metricas", "Workers Logs", ["Workers Observability"], "Logs e métricas dos Workers no painel da Cloudflare.", "por milhão de eventos de log, dentro dos limites do plano", "https://developers.cloudflare.com/workers/observability/logs/workers-logs/"],
  ["aws", "rastreamento", "AWS X-Ray", ["X-Ray"], "Rastreamento distribuído de requisições entre serviços.", C.tr, "https://aws.amazon.com/xray/", {}],
  ["gcp", "rastreamento", "Cloud Trace", ["Google Cloud Trace"], "Rastreamento distribuído do Google Cloud.", "por spans ingeridos acima da cota", "https://cloud.google.com/trace", {}],
  ["azure", "rastreamento", "Application Insights", ["Azure Application Insights"], "Monitoramento de aplicações da Azure, com rastreamento distribuído.", "por GB de dados ingeridos no Log Analytics", "https://learn.microsoft.com/azure/azure-monitor/app/app-insights-overview", {}],
  ["oci", "rastreamento", "OCI Application Performance Monitoring", ["OCI APM"], "Monitoramento de desempenho e rastreamento da Oracle Cloud.", "por eventos de rastreamento por hora", "https://www.oracle.com/manageability/application-performance-monitoring/"],

  // ---------- IA ----------
  ["aws", "modelos-api", "Amazon Bedrock", ["Bedrock"], "Acesso por API a modelos de várias empresas, com agentes e bases de conhecimento.", C.ia, "https://aws.amazon.com/bedrock/", {}],
  ["gcp", "modelos-api", "Vertex AI", ["Google Vertex AI"], "Plataforma de IA do Google com acesso aos modelos Gemini e de outros fornecedores.", C.ia, "https://cloud.google.com/vertex-ai", {}],
  ["azure", "modelos-api", "Azure AI Foundry", ["Azure OpenAI", "Azure AI Studio"], "Acesso a modelos da OpenAI e de outros fornecedores pela Azure.", C.ia, "https://azure.microsoft.com/products/ai-foundry/", {}],
  ["oci", "modelos-api", "OCI Generative AI", [], "Modelos de linguagem por API na Oracle Cloud.", C.ia, "https://www.oracle.com/artificial-intelligence/generative-ai/generative-ai-service/"],
  ["cloudflare", "modelos-api", "Workers AI", ["Cloudflare Workers AI"], "Modelos abertos rodando em GPUs da rede da Cloudflare, chamados por API ou pelos Workers.", "por neurônios (unidade própria de uso)", "https://developers.cloudflare.com/workers-ai/", {}],
  ["aws", "gpu", "Amazon SageMaker AI", ["SageMaker"], "Treino, ajuste e publicação de modelos de aprendizado de máquina na AWS.", "por hora das instâncias usadas em cada etapa", "https://aws.amazon.com/sagemaker/"],
  ["gcp", "gpu", "Cloud TPU", ["TPU"], "Aceleradores TPU do Google para treino e inferência.", "por hora de chip, pela versão da TPU", "https://cloud.google.com/tpu", {}],
  ["azure", "gpu", "Azure Machine Learning", ["Azure ML"], "Treino e publicação de modelos na Azure.", "pelas máquinas usadas", "https://azure.microsoft.com/products/machine-learning/"],
  ["oci", "gpu", "OCI AI Infrastructure", ["OCI GPU"], "Instâncias bare metal com GPU da Oracle Cloud para treino.", C.gpu, "https://www.oracle.com/ai-infrastructure/"],
  ["digitalocean", "gpu", "DigitalOcean GPU Droplets", ["GPU Droplets"], "Máquinas virtuais com GPU da DigitalOcean.", C.gpu, "https://www.digitalocean.com/products/gpu-droplets"],
  ["cloudflare", "vetorial", "Vectorize", ["Cloudflare Vectorize"], "Banco vetorial da Cloudflare, usado com os Workers e o Workers AI.", "por dimensões guardadas e consultadas", "https://developers.cloudflare.com/vectorize/", {}],
  ["gcp", "vetorial", "Vertex AI Vector Search", ["Vector Search", "Matching Engine"], "Busca vetorial gerenciada do Vertex AI.", "por hora dos nós de índice e pela construção do índice", "https://cloud.google.com/vertex-ai/docs/vector-search/overview"],
  ["azure", "vetorial", "Azure AI Search", ["Azure Cognitive Search"], "Busca textual e vetorial gerenciada da Azure.", "por unidade de busca, pelo nível", "https://azure.microsoft.com/products/ai-services/ai-search/"],
  ["oci", "vetorial", "Oracle AI Vector Search", ["AI Vector Search"], "Busca vetorial dentro do Oracle Database 23ai.", "pelo banco onde roda", "https://www.oracle.com/database/ai-vector-search/"],
  ["upstash", "vetorial", "Upstash Vector", [], "Banco vetorial sem servidor da Upstash, com API por HTTP.", "por consulta e gravação, ou por plano fixo", "https://upstash.com/docs/vector/overall/getstarted", {}],
  ["supabase", "vetorial", "Supabase Vector", ["pgvector"], "Vetores no Postgres do Supabase com a extensão pgvector.", "pelo banco do projeto", "https://supabase.com/modules/vector", {}],

  // ---------- Ferramentas de desenvolvedor ----------
  ["aws", "ci-cd", "AWS CodeBuild", ["CodeBuild"], "Builds e testes gerenciados na AWS.", C.ci, "https://aws.amazon.com/codebuild/", {}],
  ["gcp", "ci-cd", "Cloud Build", ["Google Cloud Build"], "Builds em contêiner do Google Cloud.", C.ci, "https://cloud.google.com/build", {}],
  ["azure", "ci-cd", "Azure Pipelines", ["Azure DevOps Pipelines"], "Pipelines de CI/CD do Azure DevOps, com agentes hospedados ou próprios.", "por job paralelo", "https://azure.microsoft.com/products/devops/pipelines/", {}],
  ["oci", "ci-cd", "OCI DevOps", [], "Builds e entregas contínuas na Oracle Cloud.", "pelos recursos de computação usados nos builds", "https://www.oracle.com/devops/devops-service/"],
  ["aws", "registro", "Amazon ECR", ["ECR", "Elastic Container Registry"], "Registro de imagens de contêiner da AWS.", C.reg, "https://aws.amazon.com/ecr/", {}],
  ["gcp", "registro", "Artifact Registry", ["Google Artifact Registry"], "Registro de imagens e pacotes do Google Cloud.", C.reg, "https://cloud.google.com/artifact-registry", {}],
  ["azure", "registro", "Azure Container Registry", ["ACR"], "Registro de imagens de contêiner da Azure.", "pelo nível por dia, mais armazenamento acima da franquia", "https://azure.microsoft.com/products/container-registry/", {}],
  ["oci", "registro", "OCI Container Registry", ["OCIR"], "Registro de imagens de contêiner da Oracle Cloud.", "pelo armazenamento usado", "https://www.oracle.com/cloud/cloud-native/container-registry/", {}],
  ["aws", "iac", "AWS CloudFormation", ["CloudFormation"], "Infraestrutura como código da AWS, em modelos JSON ou YAML.", C.iac, "https://aws.amazon.com/cloudformation/", {}],
  ["gcp", "iac", "Infrastructure Manager", ["Google Infrastructure Manager"], "Execução gerenciada de Terraform no Google Cloud.", "pelo tempo de execução das implantações", "https://cloud.google.com/infrastructure-manager/docs", {}],
  ["azure", "iac", "Azure Resource Manager", ["ARM", "Bicep", "ARM templates"], "Infraestrutura como código da Azure, com modelos ARM e a linguagem Bicep.", C.iac, "https://azure.microsoft.com/get-started/azure-portal/resource-manager/", {}],
  ["oci", "iac", "OCI Resource Manager", [], "Execução gerenciada de Terraform na Oracle Cloud.", C.iac, "https://www.oracle.com/devops/resource-manager/", {}],
];

// Linhas sem página oficial conhecida (marcadas com null nos extras) ficam de fora: na dúvida, não entra.
const subParaCat = new Map(CATEGORIAS.flatMap((c) => c.subcategorias.map((s) => [s.id, c.id])));
const slug = (t) => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 80);
// CAPS[id][chave] = [valor, fonte]: o valor como a tabela do tipo pede (sim/nao, texto, lista, número) e a URL oficial lida
const registro = (v, fonte) => ({ valor: v, fonte, em: CONFERIDO_EM, por: "semente" });

export const SERVICOS = LINHAS.filter((l) => l[6] && l[7] !== null).map(([provedor, sub, nome, apelidos, resumo, cobranca, produto, x = {}]) => {
  const id = provedor + "--" + slug(nome);
  const atributos = {};
  for (const [k, [v, fonte]] of Object.entries(CAPS[id] || {})) atributos[k] = registro(v, fonte);
  return {
    id,
    doc: {
      provedor, nome, apelidos: apelidos || [], categoria: subParaCat.get(sub), subcategoria: sub, resumo, cobranca, gratis: (x && x.gratis) || "", destaques: (x && x.destaques) || [],
      atributos, links: { produto, docs: (x && x.docs) || "", status: "" }, roteiro: [],
      uso: ["nuvem", ...(((x && x.uso) || []).filter((u) => u !== "nuvem"))], conferido: null, fontes: [produto], adicionado: SEMENTE_EM, por: "semente", atualizado: SEMENTE_EM,
    },
  };
});
