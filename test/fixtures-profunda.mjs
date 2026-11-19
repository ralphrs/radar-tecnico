// Dados de teste da comparação profunda em colunas (pedido de 19/11, 20h13): a `estrutura` que a tarefa grava, para os
// testes e para os prints. Textos inventados no formato pedido; não são conferência de verdade dos serviços.
const C = (id, marca, texto, fontes = []) => ({ id, marca, texto, fontes });

// Objetos: Amazon S3 × Cloudflare R2 (2 itens) e, com o Backblaze B2, 3 itens
export const IDS2 = ["aws--amazon-s3", "cloudflare--r2"];
export const IDS3 = ["aws--amazon-s3", "cloudflare--r2", "backblaze--backblaze-b2"];

export const FONTES = [
  { titulo: "Amazon S3, guia do usuário", url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html", em: "2026-11-19T12:00:00Z" },
  { titulo: "Amazon S3, cotas", url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/BucketRestrictions.html", em: "2026-11-19T12:00:00Z" },
  { titulo: "Cloudflare R2, visão geral", url: "https://developers.cloudflare.com/r2/", em: "2026-11-19T12:00:00Z" },
  { titulo: "Cloudflare R2, API compatível com S3", url: "https://developers.cloudflare.com/r2/api/s3/api/", em: "2026-11-19T12:00:00Z" },
  { titulo: "Cloudflare R2, limites", url: "https://developers.cloudflare.com/r2/platform/limits/", em: "2026-11-19T12:00:00Z" },
  { titulo: "Backblaze B2, documentação", url: "https://www.backblaze.com/docs/cloud-storage", em: "2026-11-19T12:00:00Z" },
  { titulo: "Backblaze B2, API compatível com S3", url: "https://www.backblaze.com/docs/cloud-storage-s3-compatible-api", em: "2026-11-19T12:00:00Z" },
];

function base(ids) {
  const tres = ids.length === 3;
  const nomes = { "aws--amazon-s3": "Amazon S3", "cloudflare--r2": "R2", "backblaze--backblaze-b2": "Backblaze B2" };
  const linha = (rotulo, difere, cels, nota) => ({ rotulo, difere, ...(nota ? { nota } : {}), celulas: cels.filter((c) => ids.includes(c.id)) });
  const s3 = "aws--amazon-s3", r2 = "cloudflare--r2", b2 = "backblaze--backblaze-b2";
  return {
    v: 1,
    itens: ids.map((id) => ({ id, nome: nomes[id] })),
    resumo: tres ? [
      { texto: "Os três guardam objetos com API compatível com S3; a diferença está nas classes de armazenamento e no que cada um oferece em volta.", fontes: [1, 4, 7] },
      { texto: "O S3 tem mais classes, inclusive arquivamento, e mais integrações com o resto da AWS.", fontes: [1] },
      { texto: "O R2 roda junto do Workers e não tem região para escolher: a Cloudflare decide onde o bucket fica.", fontes: [3] },
      { texto: "O B2 tem uma classe só e bloqueio de objeto só por bucket.", fontes: [6] },
      { texto: "Só o S3 tem região em São Paulo; R2 e B2 ficam fora do Brasil.", fontes: [1, 3, 6] },
    ] : [
      { texto: "Os dois guardam objetos com a mesma API; a diferença está nas classes de armazenamento e no que cada um oferece em volta.", fontes: [1, 4] },
      { texto: "O S3 tem mais classes, inclusive arquivamento, e mais integrações com o resto da AWS.", fontes: [1] },
      { texto: "O R2 roda junto do Workers e não tem região para escolher: a Cloudflare decide onde o bucket fica.", fontes: [3] },
      { texto: "Só o S3 tem região em São Paulo.", fontes: [1, 3] },
    ],
    porItem: [
      { id: s3, fortes: [{ texto: "Várias classes, do acesso frequente ao arquivamento", fontes: [1] }, { texto: "Região em São Paulo", fontes: [1] }, { texto: "Eventos para Lambda, SQS e EventBridge", fontes: [1] }],
        fracos: [{ texto: "Muitas opções de configuração para acertar", fontes: [1] }, { texto: "Recursos próprios (S3 Select, Object Lambda) prendem ao fornecedor", fontes: [1] }] },
      { id: r2, fortes: [{ texto: "Integração direta com o Workers", fontes: [3] }, { texto: "API compatível com S3 cobre o uso comum", fontes: [4] }],
        fracos: [{ texto: "Sem escolha de região; só jurisdição", fontes: [3] }, { texto: "Parte da API do S3 ainda não existe", fontes: [4] }, { texto: "Classe de acesso raro ainda em beta", fontes: [3] }] },
      { id: b2, fortes: [{ texto: "API compatível com S3 e API própria", fontes: [7] }, { texto: "Bloqueio de objeto (WORM)", fontes: [6] }],
        fracos: [{ texto: "Uma classe só, sem arquivamento", fontes: [6] }, { texto: "Menos regiões", fontes: [6] }] },
    ].filter((p) => ids.includes(p.id)),
    grupos: [
      { titulo: "Capacidades", linhas: [
        linha("API compatível com S3", tres, [C(s3, "sim", "É a própria API", [1]), C(r2, "sim", "Cobre as operações comuns", [4]), C(b2, "parcial", "Cobre a maior parte; ACL não", [7])]),
        linha("Classes de armazenamento", true, [C(s3, "sim", "Padrão, acesso raro, uma zona, Glacier", [1]), C(r2, "parcial", "Padrão e acesso raro (beta)", [3]), C(b2, "nao", "Uma classe só", [6])], "Mudar de classe muda a latência de leitura."),
        linha("Versionamento", false, [C(s3, "sim", "", [1]), C(r2, "sim", "", [3]), C(b2, "sim", "", [6])]),
        linha("Bloqueio de objeto (WORM)", true, [C(s3, "sim", "Por objeto e por bucket", [1]), C(r2, "sim", "Por regra no bucket", [3]), C(b2, "sim", "Só por bucket", [6])]),
        linha("Eventos e notificações", true, [C(s3, "sim", "Lambda, SQS, SNS, EventBridge", [1]), C(r2, "sim", "Para Queues", [3]), C(b2, "parcial", "Webhook em preview", [6])]),
        linha("Criptografia com chave do cliente", true, [C(s3, "sim", "SSE-C e KMS", [1]), C(r2, "sim", "SSE-C", [3]), C(b2, "sim", "SSE-C", [6])]),
      ] },
      { titulo: "Limites", linhas: [
        linha("Tamanho máximo de objeto", tres, [C(s3, "", "5 TB", [2]), C(r2, "", "5 TB", [5]), C(b2, "", "10 TB", [6])]),
        linha("Buckets por conta", true, [C(s3, "", "10.000 (dá para pedir mais)", [2]), C(r2, "", "1.000.000", [5]), C(b2, "", "1.000", [6])]),
        linha("Partes por upload", false, [C(s3, "", "10.000", [2]), C(r2, "", "10.000", [5]), C(b2, "", "10.000", [6])]),
      ] },
      { titulo: "Opções de uso e operação", linhas: [
        linha("Região no Brasil (São Paulo)", true, [C(s3, "sim", "sa-east-1", [1]), C(r2, "nao", "Só jurisdição (UE, FedRAMP)", [3]), C(b2, "nao", "EUA, Canadá e UE", [6])]),
        linha("Terraform (provider oficial)", false, [C(s3, "sim", "", [1]), C(r2, "sim", "", [3]), C(b2, "sim", "", [6])]),
        linha("Replicação entre regiões", true, [C(s3, "sim", "CRR gerenciada", [1]), C(r2, "nao", "", [3]), C(b2, "sim", "Cloud Replication", [6])]),
        linha("Roda fora da nuvem do provedor", false, [C(s3, "nc", ""), C(r2, "nc", ""), C(b2, "nc", "")]),
      ] },
      { titulo: "Maturidade e ritmo", linhas: [
        linha("Em disponibilidade geral desde", true, [C(s3, "", "2006", [1]), C(r2, "", "2022", [3]), C(b2, "", "2015", [6])]),
        linha("Recursos em preview ou beta", true, [C(s3, "", "Poucos, em geral por região", [1]), C(r2, "", "Acesso raro e catálogo de dados", [3]), C(b2, "", "Notificações de evento", [6])]),
      ] },
      { titulo: "Dependência do fornecedor", linhas: [
        linha("Formato e API abertos", false, [C(s3, "sim", "A API virou padrão de fato", [1]), C(r2, "sim", "Mesma API", [4]), C(b2, "sim", "Mesma API", [7])]),
        linha("Para sair", true, [C(s3, "", "Copiar os objetos; recursos próprios precisam de troca", [1]), C(r2, "", "Copiar os objetos; o Super Slurper ajuda a entrar", [3]), C(b2, "", "Copiar os objetos", [6])], "Em todos, a cópia de saída leva tempo proporcional ao volume."),
        linha("Dependência de outros serviços", true, [C(s3, "parcial", "Eventos e IAM são da AWS", [1]), C(r2, "parcial", "Eventos passam pelo Workers e Queues", [3]), C(b2, "nao", "", [6])]),
      ] },
    ].map((g) => ({ ...g, linhas: g.linhas.slice(0, tres ? 40 : g.titulo === "Capacidades" ? 4 : 2) })),
    cenarios: [
      { cenario: "Backup de muitos TB com leitura rara", perde: "Arquivamento com recuperação em horas, que só o S3 tem.", celulas: [
        { id: s3, encaixe: "forte", porque: "Classes de arquivamento feitas para isso", fontes: [1] },
        { id: r2, encaixe: "medio", porque: "Acesso raro ainda em beta", fontes: [3] },
        { id: b2, encaixe: "forte", porque: "Classe única, simples de operar", fontes: [6] }] },
      { cenario: "Arquivos servidos direto para o navegador pelo Workers", celulas: [
        { id: s3, encaixe: "fraco", porque: "Passa por outra rede; precisa de CDN na frente", fontes: [1] },
        { id: r2, encaixe: "forte", porque: "Leitura direta do Workers, na mesma rede", fontes: [3] },
        { id: b2, encaixe: "medio", porque: "Funciona com CDN parceira", fontes: [6] }] },
      { cenario: "Dados que precisam ficar no Brasil", perde: "Integração nativa com o Workers.", celulas: [
        { id: s3, encaixe: "forte", porque: "Região sa-east-1", fontes: [1] },
        { id: r2, encaixe: "fraco", porque: "Sem região no Brasil", fontes: [3] },
        { id: b2, encaixe: "fraco", porque: "Sem região no Brasil", fontes: [6] }] },
      { cenario: "Pipeline que reage a cada arquivo novo", celulas: [
        { id: s3, encaixe: "forte", porque: "Eventos para Lambda, SQS e EventBridge", fontes: [1] },
        { id: r2, encaixe: "medio", porque: "Eventos via Queues", fontes: [3] },
        { id: b2, encaixe: "nc", porque: "" }] },
    ].map((c) => ({ ...c, celulas: c.celulas.filter((x) => ids.includes(x.id)) })),
    naoConferido: tres ? ["Desempenho de leitura em São Paulo para o R2 e o B2.", "Limite de requisições por segundo por prefixo no B2."] : ["Desempenho de leitura em São Paulo para o R2."],
  };
}
export const estrutura2 = () => base(IDS2);
export const estrutura3 = () => base(IDS3);
export const fontes2 = () => FONTES.slice(0, 5);
export const fontes3 = () => FONTES.slice();
