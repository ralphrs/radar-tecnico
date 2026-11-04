# Curadoria Tech: atual (items) x sombra (sombra-items)

Janela: rodadas com `coletado >= 2026-10-31T18:00Z`, lidas do D1 em 01/11 por volta das 15h40 UTC. Só SELECT, nada foi alterado.

Atual = Opus, prompt antigo, busca na web. Sombra = Sonnet, candidatos RSS + busca.

## 1. Volume

| | Atual | Sombra |
|---|---|---|
| Rodadas | 2 | 4 |
| Itens | 34 | 59 |
| Média por rodada | 17,0 | 14,8 |
| Itens por rodada | 20 / 14 | 27 / 24 / 5 / 3 |

Rodadas da atual: 31/10 21:49 e 01/11 09:37. Sombra: 31/10 20:26 e 22:22, 01/11 10:22 e 14:32.

A média da sombra engana. As duas primeiras rodadas vieram cheias porque a fila de RSS estava acumulada (a de 22:22 tem idade mediana de 11,9 dias, três posts da Netflix de 14/10). Depois de esvaziar a fila caiu para 5 e 3. Ainda não dá para saber o volume de regime; precisa de mais uns dois dias de rodadas.

## 2. Mistura

### Tema

| Tema | Atual | Sombra |
|---|---|---|
| plataformas | 8 (24%) | 8 (14%) |
| ia | 5 | 10 |
| seguranca | 3 | 9 |
| seguranca-ia | 3 | 3 |
| infra | 3 | 7 |
| startups | 4 | 4 |
| carreira | 3 | 1 |
| arquitetura | 2 | 5 |
| dados | 1 | 5 |
| programacao | 1 | 4 |
| legado | 1 | 1 |
| eip | 0 | 2 |

A atual puxa muito para pagamentos e fintech (The Paypers sozinho deu 5 itens, Finsiders 3). A sombra espalha mais e traz bem mais engenharia de verdade: arquitetura, dados, programação, posts de engenharia da Netflix, Uber, Shopify, AWS.

### Tipo

| Tipo | Atual | Sombra |
|---|---|---|
| noticia | 18 | 24 |
| artigo | 11 | 22 |
| release | 2 | 9 |
| podcast | 1 | 2 |
| whitepaper | 1 | 2 |
| video | 1 | 0 |

Whitepapers: atual tem 1 (ENISA Threat Landscape 2026); sombra tem 2 (Thoughtworks Radar vol. 34 e o paper do IEEE sobre stablecoins para agentes). A sombra tem bem mais "release" (9), quase tudo blog de fornecedor (AWS, Stripe, Grafana, Kotlin). Release de fornecedor tende a ser o item mais fraco do feed.

### País e fontes brasileiras

A atual **não grava o campo `pais`** em nenhum dos 34 itens. Ela coloca o país no título ("EUA:", "Nigéria:", "Holanda:", "Índia:"), o que deixa o título longo e impede filtro.

Sombra: US 37, BR 5, GB 4, IN 4, CA 2, NL 1, sem país 6 (Kubernetes, Kotlin x2, Architecture Weekly, Simon Willison x2).

| Fontes brasileiras | Atual | Sombra |
|---|---|---|
| Itens | 5 de 34 (15%) | 5 de 59 (8%) |
| Quais | Finsiders Brasil 3, Let's Money 1, Código Fonte TV 1 | Tecnoblog 3, Mobile Time 1, Let's Money 1 |

A sombra tem menos Brasil em proporção, e o Brasil que aparece é Tecnoblog (consumo/notícia geral). A atual traz mercado brasileiro de pagamentos (Pix na Black Friday, IPO da Elo, ações de PicPay e Inter), que tem mais a ver com o trabalho do Admin. O Finsiders não aparece na sombra; vale conferir se está na lista de RSS.

## 3. Sobreposição

- URLs iguais: **0**.
- Títulos parecidos (normalizados, sem acento, Jaccard de palavras): nenhum par acima de 0,12.
- Mesmo fato com fonte diferente: **1**, o ataque na Polymarket (atual via The Paypers, sombra via The Hacker News).
- Marc Brooker aparece nas duas, mas com posts diferentes.

As duas curadorias praticamente não se cruzam. Isso tem dois lados. Juntas cobrem muito mais coisa. Separadas, cada uma deixa passar coisa que a outra pegou. A atual não trouxe GPT-6.1 Terra, S-1 do IPO da Anthropic, roubo de US$ 6,3 bi na Binance, GitLab explorado contra o Alpine, falha no PHP. A sombra não trouxe o caso da Accenture no Pentágono, Northflank, Chainalysis, o fim do mainframe no Citizens, o OpenTelemetry formado na CNCF.

## 4. Qualidade do texto

Amostra de 10 itens aleatórios de cada (seed fixa), mais leitura corrida do resto.

| | Atual | Sombra |
|---|---|---|
| Tamanho médio do resumo | 434 caracteres, 2,8 frases | 256 caracteres, 2,0 frases |
| Resumos com algum número | 23 de 34 (68%) | 29 de 59 (49%) |
| Travessão como aparte | 0 | 0 |
| "Não é X, é Y" no resumo | 0 | 0 |
| Fecho com lição de moral | frequente ("Para quem...", 6 casos; "o recado é", "vale o trabalho") | frequente ("Mostra...", "É um caso real de...", "Serve para...", "Interessa a...") |

Nenhuma das duas tem travessão. As duas têm o mesmo vício: a última frase vira um "por que isso importa" genérico. Na atual a frase é mais longa e às vezes boa; na sombra é curta e quase sempre vazia.

### Atual, bons

- **Polymarket suspende negociações internacionais após script de monitoramento da DebugBear ser adulterado...** Diz quem é a DebugBear, quanto tempo durou (cerca de uma hora), o valor (US$ 2,71 milhões, estimativa da GoPlus) e fecha com CSP e SRI, que é concreto.
- **EUA: Citizens Financial desliga o último mainframe...** 700 aplicações migradas, 600 eliminadas, 78% menos incidentes, deploy de meses para 36 minutos, US$ 45 milhões por ano. Resumo denso e útil para quem mexe com core bancário.
- **Holanda: EPI começa a levar o Wero ao e-commerce com 11 bancos...** Nomeia os bancos, dá as datas de assinaturas (2T 2027) e proteção ao comprador (jan/2028).

### Atual, fracos

- **Índia: Tech Mahindra e Mastercard embutem cartões virtuais...** Nenhum número, só a descrição do press release, e fecha com "É o modelo de pagamento embutido no sistema de gestão chegando ao B2B global", frase de efeito sem conteúdo.
- **Black Friday 2026: Pix vira o meio principal para 42% dos compradores...** Os números são bons, mas o título induz a achar que o Pix lidera, e o próprio resumo mostra o cartão na frente (46% contra 42%), e o fecho "o recado é que regra rígida demais também custa venda legítima" é moral pronta.
- **Memorando de engenheiro da Amazon diz que trabalho que a IA não melhora é achado, não falha, e Corey Quinn aponta as contradições.** Título de 130 caracteres e difícil de ler de primeira. Esse padrão de título-resumo com vírgula e "e fulano diz" se repete muito na atual.

### Sombra, bons

- **Stablecoins como base monetária para agentes de IA: arquiteturas, incentivos e regulação.** Autores, arquitetura em cinco camadas, o que é o mandato pré-registrado, x402, e o ranking com USDC 0,90 e USDe 0,28. Melhor resumo das duas amostras.
- **Pendrive Lenovo vendido como criptografado AES-256 tinha só um cartão SD sem criptografia.** Modelo exato (ThinkPlus FU100), o achado, e o desdobramento das chaves fixas em outras marcas. Curto e direto.
- **Extensão falsa do Claude Code afetou até 5 mil usuários do Cursor.** Número, vetor (roubo de dados, acesso por SSH) e o enquadramento como supply chain. Faz o serviço em duas frases.

### Sombra, fracos

- **Stripe lança novidades para fintechs movimentarem dinheiro e se expandirem globalmente.** "Três atualizações, entre elas a gestão simplificada de payouts". Não conta quais são as outras duas. É o press release em resumo de uma linha.
- **Netflix mostra como o armazenamento em camadas do TimeSeries evoluiu...** A segunda frase é "É um caso real de decisão entre manter pipeline de streaming e consultar o armazenamento nativo", que repete o título. Nenhum número, nenhuma decisão concreta.
- **Oito certificados intermediários da eMudhra têm chaves fracas e foram comprometidos.** Não diz o que o leitor precisa fazer nem se navegadores já revogaram; "o que muda a lista de confiança de quem valida cadeias TLS" soa traduzido.

Outros fracos fora da amostra: "Architecting for uncertainty, parte 5" (o resumo diz só que "este texto trata do papel do DevOps"), "Kotlin 2.5.0-Beta2 e vencedores do Shipaton" (lista de itens do roundup sem nada além).

Resumo da comparação: a atual escreve resumos mais ricos e mais numéricos, com títulos longos demais. A sombra escreve títulos melhores e resumos rasos, principalmente em release e post de engenharia, que é justamente onde ela tem mais volume.

## 5. Frescor

Idade = `coletado` menos `publicado`. A atual grava só a data (sem hora), então a idade dela tem erro de até um dia. Um item da sombra tem `publicado` = "2026-05" e ficou fora da conta.

| | Atual | Sombra |
|---|---|---|
| Mediana | 3,4 dias | 3,9 dias |
| Média | 61,8 dias | 22,8 dias |
| Média só dos itens com até 10 dias | 2,7 dias | 3,6 dias |
| Publicados há 24 h ou menos | 3 (9%) | 7 (12%) |
| Mais de 10 dias | 11 (32%) | 18 (31%) |
| Mais de 30 dias | 10 | 3 |

O tipo de atraso é diferente. Os itens velhos da atual são de meses atrás: três posts do Marc Brooker (um de novembro de 2025), ArchiMate de janeiro, TikTok/Compose de março, Citizens de junho. A busca na web devolve conteúdo atemporal e o prompt deixa passar. Os velhos da sombra são quase todos de 11 a 21 dias, fila de RSS acumulada da rodada de 22:22, e somem quando a fila zera (rodadas de 01/11 com mediana de 0,4 e 0,6 dia). Em regime, a sombra deve ser mais fresca.

## 6. Custo

| | Atual (meta/status) | Sombra (meta/status-sombra) |
|---|---|---|
| Última rodada | 01/11 09:37 | 01/11 14:32 |
| Novos na última | 14 | 3 |
| Buscas | não registra | 8 |
| candidatosLidos | não registra | 15 |

O `meta/status` da atual só tem `ultimaRodada` e `novosNaUltima`. Não há contagem de buscas, então não dá para comparar custo por rodada com os dados do banco. Os dois status guardam só a última rodada, sem histórico.

Na sombra, a última rodada fez 8 buscas para ler 15 candidatos e aprovar 3. É mais busca do que as outras abas que usam o mesmo esquema: Política fez 4 buscas com 110 candidatos, Negócios 5 com 86, Investimentos 3 com 16. Com só 15 candidatos de RSS, a sombra compensou com busca. Se isso se repetir, a economia esperada com Sonnet + RSS diminui. Ainda assim, Sonnet com 8 buscas tende a sair bem mais barato que Opus fazendo a curadoria inteira por busca na web, mas isso é estimativa, não medição.

## O que eu faria

Não trocaria ainda. Deixaria a sombra rodando mais 3 ou 4 dias e mexeria em quatro coisas antes de decidir:

1. **Gravar buscas na atual** (`buscas` no `meta/status`) e passar a guardar histórico por rodada nas duas. Sem isso a decisão de custo é no chute.
2. **Endurecer o resumo da sombra.** Exigir pelo menos um fato concreto (número, nome, data, versão) por resumo e proibir a frase final genérica ("Mostra...", "É um caso real de...", "Serve para..."). Para release de fornecedor, pedir a lista do que foi lançado ou descartar o item.
3. **Reforçar o Brasil na sombra.** Confirmar se Finsiders Brasil e outras fontes de pagamentos brasileiras estão no RSS. Hoje a sombra perde exatamente a parte do feed mais ligada ao trabalho do Admin.
4. **Na atual, se ela continuar**, gravar `pais` e tirar o país do título, e barrar `publicado` com mais de 30 dias que não seja whitepaper.

Depois disso, a troca faz sentido se a sombra mantiver: resumos com número em pelo menos 2 de cada 3 itens, 8 a 15 itens por dia, e Brasil perto dos 15% da atual.

Riscos de trocar agora:

- **Resumo mais raso.** O leitor perde o "por quê" concreto que a atual entrega bem.
- **Feed com cara de agregador de blog de fornecedor.** 9 releases em 59 itens, contra 2 em 34.
- **Menos Brasil e menos fintech brasileira**, que hoje é um diferencial do radar.
- **Cobertura diferente, sem sobreposição.** Nos dois dias, a troca teria tirado do feed Accenture/Pentágono, Northflank, Chainalysis e Citizens. A sombra compensa com notícias grandes que a atual perdeu, mas o perfil do feed muda.
- **Volume incerto.** Os 59 itens vêm de uma fila acumulada; em regime a sombra deu 5 e 3 por rodada, o que pode deixar a aba Tech magra.
- **Custo pode não cair tanto quanto se espera** se a sombra seguir fazendo 8 buscas por rodada para compensar RSS fraco.

Opção intermediária, se quiser trocar logo: manter a sombra como base (RSS, Sonnet, mais fresca, mais engenharia) e uma rodada diária curta com Opus só para Brasil/fintech e para revisar os resumos rasos da sombra.
