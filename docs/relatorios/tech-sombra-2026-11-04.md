# Curadoria Tech: atual (items) x sombra (sombra-items), segunda rodada

Janela: tudo com `coletado >= 2026-11-01T15:40Z`, ou seja, desde o corte do primeiro relatório. Lido do D1 em 04/11 por volta das 14h UTC, só SELECT.

Atual = Opus, prompt antigo, busca na web. Sombra = Sonnet, candidatos RSS + busca. O prompt da sombra foi endurecido em 01/11 à tarde (fato concreto obrigatório no resumo, no máximo 2 releases por rodada, prioridade a fintech brasileira). A rodada da sombra de 01/11 16:22 ainda é do prompt antigo; a de 22:22 em diante já é do novo.

## 1. Volume

| | Atual | Sombra |
|---|---|---|
| Rodadas | 8 | 9 |
| Itens | 157 | 96 |
| Média por rodada | 19,6 | 10,7 |
| Itens por rodada | 15 / 22 / 17 / 24 / 17 / 17 / 30 / 15 | 3 / 3 / 10 / 11 / 15 / 13 / 15 / 13 / 13 |
| Dias cheios (02 e 03/11) | 63 e 64 | 36 e 41 |

As duas rodam três vezes por dia agora (atual às 9h36, 15h36 e 21h36 UTC; sombra às 10h23, 16h23 e 22h23).

A dúvida do primeiro relatório, se a sombra ficaria magra depois de esvaziar a fila de RSS, se resolveu: ela estabilizou entre 10 e 15 por rodada, bem regular. O problema virou outro. A meta era 8 a 15 itens por dia, e a sombra está entregando 36 a 41. Por rodada ela bate a meta; por dia, passa do dobro.

A atual foi na direção oposta do que se esperava. Com três rodadas por dia e uma rodada de 30 itens em 03/11 à noite, ela entrega 63 itens por dia. É mais do que qualquer pessoa lê numa aba.

## 2. Mistura

### Tema

| Tema | Atual | Sombra |
|---|---|---|
| ia | 33 (21%) | 22 (23%) |
| plataformas | 22 | 23 |
| seguranca | 15 | 13 |
| seguranca-ia | 12 | 12 |
| startups | 13 | 6 |
| programacao | 12 | 3 |
| infra | 10 | 8 |
| dados | 10 | 2 |
| arquitetura | 7 | 1 |
| legado | 5 | 4 |
| carreira | 4 | 1 |
| eip | 3 | 1 |
| eventos | 5 | 0 |
| setup | 3 | 0 |
| docs | 2 | 0 |
| aliexpress | 1 | 0 |

Inverteu em relação ao primeiro relatório. Agora é a atual que traz engenharia de verdade (Netflix, Architecture Weekly, Oskar Dudycz, ByteByteGo, Mercado Livre, Nubank) e a sombra que concentra em notícia de pagamentos e IA: `plataformas` + `ia` + as duas de segurança somam 70 dos 96 itens. Arquitetura, dados e programação juntos dão 6 itens na sombra. A prioridade a fintech que entrou no prompt puxou a mistura inteira para o PYMNTS e o Finextra.

A atual inventou quatro temas que não existem na taxonomia: `eventos` (DevFest Rio, Brasília e Recife, re:Invent, Singapore FinTech Festival), `setup` (teclado Keychron, mouse Logitech, monitor Dell), `docs` e `aliexpress` (um kit de e-paper da Seeed). São 11 itens. Os eventos ainda são defensáveis; teclado e monitor por preço em dólar não têm o que fazer num radar de engenharia.

### Tipo

| Tipo | Atual | Sombra |
|---|---|---|
| noticia | 64 | 67 |
| artigo | 55 | 16 |
| release | 23 (15%) | 10 (10%) |
| podcast | 8 | 1 |
| whitepaper | 4 | 1 |
| video | 3 | 1 |

A sombra virou quase só notícia: 67 de 96, contra 16 artigos. No primeiro relatório era metade a metade. O teto de 2 releases por rodada segurou o total (10 em 96, era 9 em 59), mas foi furado uma vez, na rodada de 02/11 22:22, que saiu com 3.

A atual ficou mais pesada em release do que antes: 23, com 6 numa só rodada. Boa parte é changelog (GitHub, Chrome, Astro, Swift, Android).

### País e fontes brasileiras

A atual **continua sem gravar `pais`** em nenhum dos 157 itens. O país segue no título: "EUA:" 5 vezes, "Índia:", "Nigéria:", "China:", "Europa:" 2 cada, mais Canadá, Reino Unido, Paquistão, Tailândia, Nova Zelândia, Hong Kong, Turquia, Global. Vinte títulos começam assim.

Sombra: US 50, GB 18, CA 9, BR 8, SG 6, IN 3, NL 1, sem país 1 (psqlodbc).

| Fontes brasileiras | Atual | Sombra |
|---|---|---|
| Itens | 16 de 157 (10%) | 8 de 96 (8%) |
| Quais | Let's Money 6, Finsiders 3, GDG 3, Startups 2, Mercado Livre 1, Bloomberg Línea 1 | Let's Money 5, Finsiders 2, Tecnoblog 1 |
| Contando assunto brasileiro em fonte de fora | 20 (13%) | 10 (10%) |

Nas duas o Brasil caiu em proporção. Na atual, de 15% para 10%, porque o volume total cresceu mais do que o Brasil. Na sombra ficou nos 8% do primeiro relatório, mesmo com a prioridade a fintech BR no prompt. O Finsiders agora aparece na sombra (2 itens, os 4 candidatos que o feed trouxe viraram 2 publicados), então o RSS está certo. O problema é que as fontes brasileiras do RSS produzem pouco: Finsiders 11 novos em quatro dias, Let's Money 27, Nubank 3 (nenhum publicado), Mercado Livre e iFood zero. Já o Tecnoblog trouxe 34 candidatos e só 1 passou, e o Mobile Time 12 e nenhum passou.

Pelo lado do assunto, a sombra pegou Mercado Bitcoin (duas vezes, Tecnoblog e The Record), os advogados de Parauapebas via Tom's Hardware, QI Tech, PicPay, Bloquo, Pix Brasil-China, Goldman via Let's Money. A atual pegou tudo isso menos Mercado Bitcoin, e ainda Creditas, Avenue, Coinbase no BC, Resolução Conjunta 18, Consignado CLT, Nubank no Aurora, Mercado Livre saindo do Grails, Cash App via Bloomberg Línea, Airbnb com Pix.

## 3. Sobreposição

Mudou muito. No primeiro relatório as duas não se cruzavam; agora se cruzam bastante.

- URLs iguais: **14** (uv.lock do Simon Willison, VOLTA, Red Hat RCE, Zero Wire, DNS da Cloudflare, Postman, pull_request_target, Thunes/UnionPay, HugoHub, PicPay, QI Tech, Bloquo, Adi Polak na InfoQ, Anthropic e RSI).
- Mesmo fato com fonte diferente: **12** (Goldman Sachs, Anthropic IPO/receita, Devin, Casap, Finsiders 3T26, Pando da OpenAI, extensão falsa do Claude Code, CrowdStrike/Fiddler, OPay, Parauapebas, Trigger.dev, Mastercard/OpenAI).
- Total: 26 dos 96 itens da sombra (27%) também estão na atual.

Nos destaques a coisa é ainda mais parecida: pull_request_target, Postman, FlashProve e Binance aparecem nos destaques das duas no mesmo dia ou no dia seguinte.

Isso aconteceu porque a atual passou a trazer URLs que são de feeds da lista RSS (GitHub Changelog, Cloudflare, InfoQ, The New Stack, Let's Money). Não dá para saber pelo banco se a atual agora lê os candidatos ou se a busca na web simplesmente cai nos mesmos lugares. De todo modo, o argumento "juntas cobrem muito mais" ficou mais fraco.

Duplicata interna, que o leitor vê como repetição na mesma aba:

- Sombra: 4 pares. Mercado Bitcoin (Tecnoblog e The Record), OKX Card (Finextra e PYMNTS), CLICX/Thought Machine (Fintech News Singapore e Finextra), Goldman Sachs (Let's Money e Finextra). O filtro `repetido` dos candidatos compara só a URL, então o mesmo fato em dois sites passa.
- Atual: 1 par. VOLTA (Cisco Talos e The Hacker News).

## 4. Qualidade do texto

Amostra de 10 itens aleatórios de cada (seed 42) e leitura corrida do resto, principalmente dos 53 resumos da sombra sem nenhum número.

| | Atual | Sombra |
|---|---|---|
| Tamanho médio do resumo | 470 caracteres, 3,0 frases | 262 caracteres, 1,9 frase |
| Tamanho médio do título | 108 caracteres (110 acima de 100, 29 acima de 120) | 77 caracteres (6 acima de 100, nenhum acima de 120) |
| Resumos com algum número | 127 de 157 (81%) | 43 de 96 (45%) |
| Travessão como aparte | 0 | 0 |
| "Não é X, é Y" | 0 | 0 |
| Última frase genérica ("Para quem...", "É um caso...", "É mais um...", "Serve de...", "O caso mostra...") | 37 de 157 (24%) | 21 de 96 (22%) |

O endurecimento do prompt não pegou no ponto principal. A regra era "fato concreto obrigatório", e a proporção de resumo com número **caiu**: 49% no primeiro relatório, 45% agora, e piorando por rodada (80% na de 02/11 10:23, 18% na de 16:32, depois 40%, 38%, 40%, 54%, 31%). O modelo entende "fato concreto" como nome de empresa, e nome de empresa todo resumo já tinha. O fecho com lição de moral diminuiu um pouco, mas "O caso mostra..." e "É mais um exemplo de..." continuam em um a cada cinco.

A atual, ao contrário, ficou mais numérica (68% antes, 81% agora), e os títulos cresceram de novo: 70% passam de 100 caracteres.

### Atual, bons

- **Oskar Dudycz mostra como now() no Postgres travou a tomada de um lock distribuído no Emmett, e quando usar clock_timestamp().** Explica o bug (now() devolve o início da transação, retries na mesma transação viam o mesmo horário), a correção e por que os testes não pegaram. É o tipo de post que o leitor guarda.
- **Netflix cria o modo single-tenant do Titus.** Diz o que cgroups não isolam (cache L3, banda de memória, softirq), o que foi descartado (microVM, gVisor), quem usa (Flink, telemetria) e o custo (boot lento, desperdício de dimensionamento).
- **PicPay diz pagar 2% do que pagava por token.** As três alavancas (escolha de modelo por tarefa, cache de contexto, modelo que reescreve o prompt), 4.500 funcionários, 60% mais código por pessoa, e a ressalva de que os números são da própria empresa.

### Atual, fracos

- **Hong Kong: DCS DeCard vira emissora Mastercard e lança cartão corporativo com gestão de despesas.** Press release traduzido: nenhum número, nenhum cliente, "planeja somar gestão de tesouraria e novos mercados".
- **DevFest Brasília 2026 acontece em 5 de dezembro no CEUB de Taguatinga.** Resumo de página de inscrição, com coffee break e certificado. Tema `eventos` inventado. Três DevFests no mesmo fim de semana de coleta.
- **Mercado Livre migra API crítica de pagamentos de Grails 2 para Spring Boot.** O texto é bom, mas é de setembro de 2024, 769 dias antes da coleta. Mesmo vício do primeiro relatório: a busca devolve conteúdo atemporal e o prompt deixa passar. São 35 itens com mais de 30 dias, 25 deles artigos.

### Sombra, bons

- **FMI: como a IA agêntica vai remodelar os pagamentos.** Autores, data, as três camadas (intenção, autorização, liquidação), as cinco funções analisadas e a recomendação final. Veio de uma busca, e é o melhor resumo das duas amostras.
- **Como a Cloudflare reduziu pela metade o atraso de build de DNS e cortou 85% da memória.** Duas frases, o problema (rebuild de zona inteira com dezenas de milhões de registros), a solução (planejador que escolhe o menor build seguro) e os dois números. Mesma URL que a atual, com um terço do tamanho e sem perder nada que importe.
- **Google alerta que LLMjacking já custa até US$ 1 milhão.** Número, vetor, e a consequência prática (tratar chave de API de modelo como credencial de nuvem, com limite de gasto).

### Sombra, fracos

- **Como funciona o novo modelo Nemotron da Nvidia.** "A ByteByteGo destrincha o Nemotron e as técnicas usadas na construção dele. Serve de leitura rápida para entender as escolhas." Não diz uma técnica sequer. É o caso típico do resumo que descreve que o texto existe.
- **Google lança Gemini 4 Carbon e passa o Claude Opus 5.5 por pouco.** Uma frase: "lidera rankings de inteligência e é o frontier com menor chance de alucinar". Sem benchmark, sem número, sem preço. Para um lançamento de modelo de fronteira, é pouco.
- **Agentes de IA podem controlar 5% dos pagamentos transfronteiriços.** O 5% está lá, mas a segunda frase ("a discussão gira em torno de quem terá o controle dessa camada") só repete o título. O PYMNTS entrou 17 vezes na sombra e boa parte tem esse perfil de análise sem fato.

Fora da amostra, na mesma linha: "Chainalysis revela vazamento após ataque conduzido por agentes de IA" (não diz o que vazou), "Trail of Bits usa Codex para backport" (não diz quantos patches nem em qual kernel), "Shopify cria o Overexposed" (sem número de endpoints achados), "Pragmatic Engineer: uma história de duas eras" (resumo diz que é um ensaio vencedor de um desafio, e só).

Resumo da comparação: a atual escreve mais e melhor por item, mas escreve demais, com título longo e tema inventado. A sombra escreve título bom e resumo que muitas vezes não passa da primeira linha da matéria. O endurecimento do prompt não mudou isso.

## 5. Frescor

Idade = `coletado` menos `publicado`. A atual grava só a data, erro de até um dia. Os 5 itens de `eventos` da atual têm `publicado` no futuro (data do evento) e ficaram fora da conta.

| | Atual | Sombra |
|---|---|---|
| Mediana | 2,4 dias | 0,3 dia |
| Média | 44,1 dias | 4,7 dias |
| Média só dos itens com até 10 dias | 1,8 dia | 0,6 dia |
| Publicados há 24 h ou menos | 58 (37%) | 92 (96%) |
| Mais de 10 dias | 46 (29%) | 2 |
| Mais de 30 dias | 35 (22%) | 2 (Zapier de março, FMI de abril, os dois vindos de busca) |

Aqui a sombra ganhou com folga, e era o esperado assim que a fila de RSS zerou. Praticamente tudo que ela publica saiu nas últimas 24 horas. A atual continua trazendo um quinto do feed com mais de um mês: Mercado Livre de 2024, Gregor Hohpe de setembro de 2025, Kevin London de outubro de 2025, Grab de janeiro, Architecture Weekly de janeiro e fevereiro, Chrome de março. Alguns são bons textos, mas o leitor não tem como saber que é arquivo, porque o cartão não mostra a idade.

## 6. Custo

| | Atual (meta/status) | Sombra (meta/status-sombra) |
|---|---|---|
| Última rodada | 04/11 09:37 | 04/11 10:23 |
| Novos na última | 15 | 13 |
| Buscas | **continua sem registrar** | 6 (eram 8) |
| candidatosLidos | não registra | 118 |

A recomendação 1 do primeiro relatório (gravar `buscas` na atual) não foi feita. Os dois status seguem guardando só a última rodada, sem histórico. Portanto ainda não dá para comparar custo com dado do banco.

O que dá para medir é o rendimento das buscas da sombra: dos 96 itens, só **2** vieram de fora do RSS (Zapier e a nota do FMI). Os outros 94 estão na tabela de candidatos. Seis buscas por rodada, nove rodadas, 54 buscas, dois itens. As buscas estão servindo para quase nada e são a parte cara da rodada da sombra. Política, Negócios e Investimentos fazem 3 a 4 buscas com o dobro ou o triplo de candidatos.

### Candidatos do radar tech no período

| Status / motivo | Quantidade |
|---|---|
| descartado / raso | 482 |
| publicado | 92 |
| descartado / fora-do-tema | 69 |
| novo (ainda não lido) | 50 |
| descartado / repetido | 33 |
| descartado / promocional | 29 |
| Total | 755 |

Taxa de aproveitamento: 92 de 705 lidos, 13%. A rodada de 03/11 22:23 leu 194 candidatos e aprovou 13; a de 04/11 10:23 leu 118 e aprovou 13. O "raso" sozinho é 64% de tudo que entra, o que diz mais da lista de feeds do que do curador:

- Cinco subreddits (r/antiai, r/databricks, r/opensource, r/MiniPCs, r/hermesagent) geraram 141 candidatos e zero publicados, e os cinco estão tomando HTTP 429 do Reddit.
- Tom's Hardware 59 candidatos, 2 publicados. Ars Technica 23 e 0. Hackaday 25 e 0. Mobile Time 12 e 0. Tecnoblog 34 e 1.
- Feeds quebrados: ACM Queue, BleepingComputer, FinTech Futures e CNX Software com 403, Uber Engineering com 404, Netflix com 429. Dos quatro com 403, o FinTech Futures e o BleepingComputer são os que fariam falta.

Cada candidato lido custa token de Sonnet. Tirar os subreddits, Hackaday, Ars e Tom's Hardware corta uns 250 candidatos sem perder um item publicado.

## 7. Os critérios do primeiro relatório

| Critério | Meta | Sombra | Atual (referência) |
|---|---|---|---|
| Resumo com número | 2 de 3 (67%) | 45%, caindo | 81% |
| Volume | 8 a 15 por dia | 36 a 41 por dia (10 a 15 por rodada) | 63 por dia |
| Brasil | perto de 15% | 8% (10% por assunto) | 10% (13% por assunto) |

Nenhum dos três foi atingido. O volume por rodada bate, mas são três rodadas por dia. O Brasil não mexeu. O resumo piorou no critério que o prompt novo deveria resolver.

Do lado da atual, nenhuma das recomendações do primeiro relatório foi aplicada (`buscas`, `pais`, corte de item velho), e ela ainda cresceu em volume e ganhou tema inventado.

## O que eu faria

**Não trocaria agora**, e desta vez os dados bastam para decidir. Com três dias de regime, a sombra mostrou duas coisas: a parte estrutural funciona (fresca, regular, título curto, 27% de sobreposição com a atual provando que o RSS pega o que importa) e a parte de texto não funciona (metade dos resumos sem um fato, PYMNTS e Finextra ocupando o feed com análise sem número). Trocar hoje é trocar um feed inchado e velho por um feed magro e raso.

O que mudaria antes de decidir de novo, em ordem:

1. **Levar a regra do fato concreto para o código.** Se o resumo não tiver dígito, versão ou data, o item volta para o modelo com a instrução de incluir um, e se voltar sem, é descartado como `raso`. O prompt sozinho não deu conta, e a tendência por rodada é de piora.
2. **Cortar busca da sombra para 2 por rodada**, reservadas a fintech brasileira e a whitepaper. Seis buscas renderam 2 itens em 96. É a única alavanca de custo que dá para puxar sem medir.
3. **Limpar a lista de feeds**: fora os cinco subreddits, Hackaday, Ars, Tom's Hardware; consertar ou substituir os feeds com 403 (BleepingComputer e FinTech Futures primeiro). Isso derruba o "raso" e o custo de leitura.
4. **Trocar o filtro de repetido**: comparar título normalizado com os itens publicados nos últimos 3 dias, não só URL. Quatro pares duplicados em 96 é visível para quem lê.
5. **Brasil**: a lista de RSS brasileira é fraca por natureza (Finsiders rende 11 posts em quatro dias). Em vez de "prioridade a fintech BR" no prompt, uma das duas buscas reservadas deveria ser obrigatoriamente brasileira, todo dia, com Finsiders, Let's Money, Startups, Bloomberg Línea e Mobile Time como alvos.
6. **Teto de 10 itens por rodada** na sombra, com relevância 1 só entrando se sobrar vaga. Resolve o critério de volume sem mexer no agendamento.
7. **Na atual, enquanto ela for a produção**: teto de 15 por rodada, barrar `publicado` com mais de 30 dias que não seja whitepaper, barrar tema fora da taxonomia, e gravar `buscas` e `pais`. Nada disso foi feito desde 01/11.

Depois disso, mais dois dias de sombra e a decisão fica fácil: se o resumo com número passar de 65% com o teto e as buscas cortadas, troca.

Riscos de trocar agora:

- **Resumo raso vira o padrão da aba Tech.** Hoje 55% dos resumos da sombra não têm um número. O leitor perde o que a atual faz de melhor.
- **A aba vira um feed de pagamentos.** 70 de 96 itens em quatro temas; arquitetura, dados e programação somam 6. A prioridade a fintech no prompt engoliu a engenharia que a sombra trazia no primeiro relatório.
- **Duplicata visível.** Sem filtro por fato, o mesmo assunto aparece duas vezes na mesma aba.
- **Brasil em 8%**, com tendência de ficar aí enquanto depender de RSS.
- **Custo pouco previsível.** Com 118 a 194 candidatos lidos por rodada e 6 buscas, a conta de Sonnet pode não ser tão menor que a de Opus quanto se imagina, e ainda não há medição nenhuma do lado da atual.

Riscos de não trocar:

- **A atual está inchando.** 63 itens por dia, 22% com mais de 30 dias, teclado e monitor no feed. Sem teto e sem corte de idade ela fica pior a cada rodada.
- **Custo de Opus com busca em três rodadas por dia**, sem nenhum número para acompanhar.

Opção intermediária, se a pressão de custo for grande: sombra como base com os ajustes 1 a 6, e uma rodada diária da atual (Opus) limitada a 8 itens e só com Brasil, fintech e artigo de engenharia com mais de 10 dias que valha o arquivo. É o jeito de ficar com o frescor e o título da sombra sem abrir mão do resumo denso e do Brasil da atual. Mas essa opção só faz sentido depois que o ajuste 1 estiver no código; senão a parte da sombra continua rasa e a rodada de Opus vira a aba inteira.
