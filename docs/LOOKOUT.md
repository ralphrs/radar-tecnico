# Lookout: estado atual (05/11/2026)

Feed pessoal de notícias do Admin, aberto só para convidados. Um Worker da Cloudflare (`lookout`, código em `src/`) serve a página, a API e o admin, e guarda tudo num banco D1 (`lookout`). As leituras da página saem de um espelho do D1 em São Paulo (veja "Banco e espelho"). O login é pelo Cloudflare Access; o Worker confere o token em cada requisição e, sem configuração, não deixa ninguém entrar.

Abas: Início, Tech, Negócios, Investimentos, Notícias e Política, Esportes. O site abre no Início (painel de widgets, veja abaixo). Investimentos tem três visões: Bolsa (a principal), EUA e Notícias.

## Como as notícias entram

1. O cron do Worker roda a cada minuto e lê 6 feeds por vez (`src/coleta.js`, lista em `src/feeds.js`). Cada feed é lido no máximo a cada 90 min. Os subreddits (tipo `reddit`) têm fila à parte: um por minuto, cada um a cada 120 min, e não viram candidatos: cada post vai direto para `foruns-<radar>` (veja "Nos fóruns"; detalhes em `docs/coleta.md`). Nos feeds comuns, o que já existe (mesmo id ou mesma URL) é ignorado; o resto vai para a tabela `candidatos` com status `novo`.
2. Tarefas agendadas do Claude fazem a curadoria: reservam um lote, escolhem, escrevem título e resumo, gravam em `items-*` e `destaques-*` e marcam cada candidato como `publicado` ou `descartado` com motivo. Podem fazer algumas buscas na web para o que não tem feed. Sonnet nas abas novas; o Tech atual ainda é Opus com busca.
3. Só o que está nas collections de itens aparece no site. No minuto 7 de cada hora o Worker apaga o que venceu (regras em `docs/coleta.md`).

Detalhes da coleta e da limpeza: `docs/coleta.md`. Comparação das duas curadorias de Tech: `docs/relatorios/tech-sombra-2026-11-01.md`.

## O que roda sem IA

| O quê | Fonte | Quando |
|---|---|---|
| Moedas e cripto (`meta/mercado`) | AwesomeAPI; se recusar, PTAX do BC, CoinGecko e por último Mercado Bitcoin | a cada 30 min |
| Selic, CDI, IPCA 12m (`meta/mercado`) | Banco Central, SGS | duas vezes por dia |
| Ibovespa (`meta/mercado`) | brapi, só com o secret `BRAPI_TOKEN` | a cada 30 min no pregão |
| Tabelas de ações, FIIs, FI-Infra, Fiagro, ETFs e BDRs (`meta/b3`) | brapi, rota de lista, sem token | a cada 30 min no pregão e às 21h35 UTC |
| Dados dos FIIs (`meta/fii`) | informe mensal da CVM (dados abertos) | 10h12 e 10h17 UTC, em duas etapas |

O botão "Atualizar agora" do painel consulta no máximo uma vez a cada 5 min, para todo mundo.

## Banco

Tabela `docs(collection, id, data)` para quase tudo:

- Itens: `items` (Tech), `items-negocios`, `items-investimentos`, `items-politica`, `items-esportes`. Destaques no mesmo padrão (`destaques`, `destaques-negocios`...).
- Teste do Tech: `sombra-items`, `sombra-destaques`, fora do site.
- Por pessoa: `favs/<email>`, `listas/<email>`, `prefs/<email>` (o painel do Início, doc `painel`; doc `radar`, os filtros do Radar; doc `tabelas`, o estado das tabelas; doc `layout`, as colunas recolhidas), `carteira/<email>` (Minha carteira, cifrada) e `leitura/<email>` (Leitura do dia, cifrada).
- `meta`: `status`, `status-negocios`, `status-investimentos`, `status-politica`, `status-esportes`, `status-sombra` (última rodada de cada curadoria), `mercado`, `b3`, `fii`, `fii-resumo`, `fii-cvm-ant`.
- `hist`: ficha de cada papel aberto (`US:NVDA`, `BR:PETR4`, `BR:NVDC34`), veja "Ficha do papel".
- `_sistema`: `seed`, `limpeza`, `b3-erro`, `cvm-etapa`, `cvm-erro`, `sonda-feeds`, `papel-contagem`, `sonda-brapi-quote`.

Outras tabelas: `candidatos`, `feeds_estado` (saúde de cada feed), `usuarios`, `grupos`, `usuario_grupo`. Esquema em `schema.sql`.

## Banco e espelho

O D1 fica no leste dos EUA e não existe D1 na América do Sul. Antes o Worker rodava com Smart Placement perto do banco, e quem abria a página no Brasil fazia a viagem longa em toda requisição. Agora o Worker roda na borda, perto de quem acessa, e as leituras saem de um espelho em São Paulo: um Durable Object com SQLite (`Espelho`, em `src/espelho.js`, uma instância só, criada com `locationHint: "sam"`).

- **Fonte da verdade continua o D1.** Coletas, crons de mercado, admin e curadorias gravam só nele, do mesmo jeito de antes. O espelho é só leitura.
- **O que vai para o espelho:** as collections de itens e destaques, `foruns-*`, `meta`, `hist`, `_sistema`, `favs/<email>`, `listas/<email>` e `prefs/<email>`, mais cópias inteiras de `usuarios`, `grupos` e `usuario_grupo`. No admin, favoritos, listas e painéis aparecem somados, sem o e-mail de ninguém.
- **Favoritos, listas e painel do Início:** a leitura sai do espelho como o resto (D1 de reserva). A gravação vai ao D1 com `await` e, só depois que deu certo, a mesma linha vai ao espelho em `ctx.waitUntil` (write-through), para a pessoa ver a mudança na leitura seguinte sem esperar o cron. Apagar faz o mesmo com `remover`, inclusive quando o admin exclui um convidado. Se o write-through falhar, só vai para o log; a comparação do minuto seguinte conserta. Na sincronia, o D1 é lido por faixa da chave (`collection >= 'favs/' AND collection < 'favs0'`), que usa o índice; um `LIKE` varreria a tabela.
- **Corrida com o write-through:** como o D1 grava antes, o espelho nunca recebe uma linha que o D1 não tem. Sobra o caso do cron ter lido a lista do D1 um instante antes da gravação e comparar depois do write-through: o doc novo pareceria sobrando. Para isso o `comparar` recebe a hora da leitura (com 2 s de folga) e não apaga o que foi atualizado depois dela.
- **Sincronia:** no fim de cada cron (a cada minuto), o Worker lê do D1 a chave e uma marca de cada doc (`atualizado`, `coletado` e o tamanho do texto), compara com o espelho e copia só o que mudou, em lotes de 90. O que sumiu do D1 sai do espelho. Também sincroniza logo depois do botão "Atualizar agora" do mercado e, só a parte de pessoas, depois de qualquer mudança em convidados, grupos ou membros no admin.
- **Trava de segurança:** se o D1 devolver a lista vazia, ou se a sincronia fosse apagar mais da metade do espelho (com 20 docs ou mais), ela para e grava o erro. O espelho fica como estava e segue servindo.
- **Uma sincronia de cada vez:** o `comparar` marca no DO que uma sincronia começou e recusa outra (`{ ocupado: true }`) enquanto essa não chamar `concluir`, por até 60 s. A que foi recusada sai em silêncio e o DO conta em `estado.pulada`. Assim o cron e o botão "Sincronizar agora" do admin não brigam. Se uma sincronia morrer no meio, a trava vence sozinha em 60 s.
- **Ordem igual nos dois lados:** o `/api/q` ordena por `<campo> <dir>, coletado DESC, id DESC` (por `coletado` é só `coletado <dir>, id DESC`). O mesmo SQL roda no espelho e no D1, então a paginação por "mais antigos" não pula nem repete item quando há empate. No espelho há índices compostos `(collection, <campo>, coletado, id)`; com direção DESC a ordenação inteira sai do índice, em ASC o índice serve a primeira coluna e só os empates são ordenados à parte. No D1 só existe o `docs_col_coletado`, como antes.
- **Fallback:** se o espelho der erro, passar de 2 s ou ainda não tiver terminado a primeira carga, a leitura vai ao D1. As gravações vão sempre ao D1.
- **Caches:** os de antes continuam (memória do isolate por 30 s e 60 s, borda por 3 min). Uma mudança no D1 leva até 1 min para chegar ao espelho e depois os mesmos 3 min e meio de cache de antes.
- **Desligar sem deploy:** a variável `ESPELHO_ATIVO` (padrão `"1"` no `wrangler.jsonc`). Com `"0"` no painel (Workers & Pages → `lookout` → Variables and Secrets), todas as leituras voltam ao D1. O próximo deploy devolve o valor do `wrangler.jsonc`, então para deixar desligado de vez troque lá também.
- **Se o espelho corromper:** no admin, card "Espelho em São Paulo", botão "Zerar e recarregar" (é um `POST /api/admin/espelho` com `{ "zerar": true }`). Ele esvazia o DO e recarrega tudo do D1 na mesma hora; enquanto a carga não termina, as leituras vão ao D1. Se a carga passar de 25 s, continua no cron seguinte.
- **Medição:** cada vez que o admin abre, o Worker que o atendeu faz a mesma consulta no espelho e no D1 e guarda os dois tempos (as duas últimas medições ficam no card).
- **Logs das leituras:** cada `console.log` vira um evento de observabilidade, e a cota é de 20 mi por mês. Por isso a leitura que deu certo no espelho é amostrada: sai 1 em cada 20 por isolate, como `{"leitura": "espelho", "rotulo", "ms", "amostra": 20}`. Quando a leitura cai no D1 sai sempre, com o motivo em `fallback` (`timeout`, `erro` ou `vazio`). Esses fallbacks também são somados no isolate e mandados ao DO no máximo a cada 10 s; o card do espelho mostra a contagem de hoje por motivo e o total de ontem (janela simples por dia, em UTC). É aproximado: se o isolate morrer antes de mandar, a contagem dele se perde. Com `ESPELHO_ATIVO=0` a leitura no D1 é o caminho normal e entra na mesma amostragem.

Custo: o DO entra no Workers Paid com cota própria, não somada à do D1. Linhas lidas e gravadas têm os mesmos valores do D1 (25 bi e 50 mi por mês incluídos). Além disso conta requisições (1 mi por mês incluído; cada chamada RPC é uma) e duração enquanto está ativo (400 mil GB-s por mês). A sincronia faz duas chamadas por minuto quando nada mudou, umas 90 mil por mês; o resto são leituras da página que não estavam em cache. Com o `CF_API_TOKEN`, o card Custos do admin mostra as requisições do DO no mês (`durableObjectsInvocationsAdaptiveGroups`, projetadas para o mês inteiro, contra 1 mi), o armazenamento (`durableObjectsStorageGroups`, contra 5 GB, da conta toda) e o excedente em US$, já somado ao custo estimado. Sem o token aparece "sem token".

## Ficha do papel

Ações da B3, BDRs e ações dos EUA abrem uma ficha no diálogo do papel (`abrirAtivo`, maior e com rolagem interna): preço grande com a variação do dia, pregão aberto ou fechado com a hora do dado, faixas do dia e de 52 semanas, gráfico de 1 ano com 1M · 3M · 1A, estatísticas em quatro blocos (pregão, retorno, tamanho, múltiplos e dividendos), "Sobre a empresa", a listagem cruzada (BDR e papel americano) e as notícias do feed. FIIs e ETFs ficam como eram e ganham só as faixas e o gráfico. Nada de sinal técnico, preço-alvo, preço justo nem média móvel: só fato e número.

Dados (`src/papel.js`), um doc por papel em `hist`, id `US:NVDA` ou `BR:PETR4`:

| O quê | Fonte | Precisa de token |
|---|---|---|
| Preço, fechamento anterior, abertura, faixa do dia e de 52 semanas, volume, volume médio de 3 meses, variação em 1 mês, 3 meses, no ano e em 1 ano, série diária de 1 ano, nome e bolsa | Yahoo Finance, gráfico v8 (`range=1y&interval=1d&events=div`, que traz também os pagamentos de proventos), query2 e depois query1, mesmo fetch de `src/eua.js`; na B3 o símbolo leva `.SA` | não |
| Setor da B3 e valor de mercado da B3 | a lista da brapi que já está em `meta/b3` | não |
| Setor e indústria dos EUA | mapa `SETOR_US` em `src/eua.js` (S&P 100 e ETFs) | não |
| LPA, P/L, valor de mercado e dividendos de 12 meses (com o yield) na B3 | brapi, `/api/quote/<PAPEL>?fundamental=true&dividends=true` | `BRAPI_TOKEN` |
| P/L, LPA, P/VP, beta, valor de mercado, ações em circulação, yield, dividendo, indústria, site e próximo balanço nos EUA | Finnhub, `/stock/metric`, `/stock/profile2` e `/calendar/earnings` | `FINNHUB_TOKEN` |

Os dois tokens são secrets do Worker (`BRAPI_TOKEN` e `FINNHUB_TOKEN`). Sem eles a ficha funciona e mostra "–" no que falta; o admin vê no `title` do "–" qual token falta. Quando o secret aparece, a próxima busca já usa, sem deploy. A primeira resposta da brapi fica resumida em `_sistema/sonda-brapi-quote`, para conferir os nomes dos campos (P/VP só entra se vier `priceToBook` ou `bookValuePerShare`).

Rota `GET /api/papel?id=US:NVDA` (seção Investimentos; id `^(US|BR):[A-Z0-9.\-]{1,10}$`):

- Lê `hist` pelo espelho, com o D1 de reserva. Com menos de 24 h, responde na hora e marca `ultimaAbertura` (no máximo a cada 6 h).
- Sem doc ou vencido: busca nas fontes, grava no D1 (`INSERT ... ON CONFLICT DO UPDATE`) e manda a linha ao espelho por write-through. Responde em até 10 s; se passar disso ou a fonte falhar, devolve o que havia (mesmo velho, com `velho: true` e `erro`) ou `{ existe: false, erro }`.
- Trava contra repetição: a busca em andamento de cada id fica num `Map` do isolate, e quem abre a mesma ficha ao mesmo tempo espera a mesma busca.
- Limite: 30 buscas novas por hora por e-mail (contador em memória do isolate); depois disso responde só o que já existe.
- `cruzado` na resposta: o outro lado da listagem (mapa `BDR_DE_US` em `src/bdr.js`, montado com os BDRs de `meta/b3`; o que não é óbvio ficou de fora, como PLTR). A página só mostra a linha "Na B3" ou "Nos EUA" se o outro papel estiver em `meta/b3` ou `meta/eua`.
- `tokens` só vai para o admin.

Cron: no minuto 23 de cada hora, renova até 30 `hist` vencidos que alguém abriu nos últimos 7 dias, em lotes de 10 com 400 ms entre eles; um 429 do Yahoo para a rodada. A limpeza do minuto 7 apaga, por lista de ids, os `hist` sem abertura há mais de 30 dias. As buscas do dia (página e cron) ficam em `_sistema/papel-contagem` e aparecem no card Custos do admin, junto com o total de fichas.

Na página, a resposta fica 10 min em memória. A ficha abre na hora com a cotação da lista e um esqueleto nos blocos; quando a resposta chega, redesenha mantendo a rolagem. Se a cotação da lista (30 min) for mais nova que a ficha (até 24 h), preço, variação, dia e os retornos usam a da lista. O gráfico é SVG próprio (linha, área e grade), com eixos, cursor e ponto em HTML por cima; mouse, toque e setas do teclado mostram data e valor. O período escolhido fica em `radar-ficha-periodo`.

Para testar local: `wrangler dev --local --var DEV_FETCH_FALSO:1` troca as fontes por uma série sintética (só vale junto com `DEV_EMAIL`), com 600 ms de atraso e a contagem de chamadas em `_dev.chamadas` na resposta.

## FI-Infra e Fiagro

A rota de lista da brapi (`type=fund`) mistura FIIs, FI-Infra, Fiagro, FIP e ETFs. `atualizarB3` (`src/mercado.js`, função `separarFundos`) separa pelo `subType`, que no `meta/b3` de produção de 03/11/2026 vinha assim: `fii` 114, `fi-infra` 19, `fi-agro` 14, `fip` 7, vazio 1 (o IBOV11) e `etf` 95.

- `fiis`: `fii`, ou sem `subType` com final 11 e com informe na CVM (chaves de `meta/fii-resumo`). O IBOV11 fica de fora.
- `fiinfra`: `fi-infra` e também `fip` (os FIP-IE, fundos de participação em infraestrutura). Nenhum dos dois entrega o informe mensal de FII.
- `fiagro`: `fi-agro` (aceita `fiagro`, caso a grafia mude).
- `etfs`: `etf`. O resto sai.

O `meta/b3` gravado antes da separação não tem `fiinfra` nem `fiagro`; a página e a carteira separam o `fiis` dele pelo `sub` até o cron regravar.

Na Bolsa, a Classe (segmentado do Pregão e coluna esquerda) fica Ações, FIIs, FI-Infra, Fiagro, ETFs e BDRs; no celular o segmentado rola de lado. FI-Infra e Fiagro têm Papel, Nome, Preço, Dia, Liquidez, DY 12m e Último rendimento, e os rankings Maiores altas, Maiores baixas e Mais negociados. DY e rendimento vêm da ficha do papel (`hist/BR:<papel>`): o gráfico do Yahoo passou a pedir `events=div`, e `montarHist` grava `ultDiv` e `ultDivData` (último pagamento) e, quando a brapi não trouxe, `dividendo12m`, `dy` e `fonteDiv: "Yahoo"`. A tabela lê da ficha aberta na página ou do resumo das fichas guardadas (`/api/radar/fundamentos`, que ganhou `ult`, `ultData` e `fonteDiv`). Sem ficha, a célula mostra "–" e um link "carregar", que abre a ficha (a ficha busca e grava) e a linha se atualiza quando ela chega. O rodapé da seção diz: "FI-Infra e Fiagro não entregam o informe mensal de FII na CVM; DY e rendimento vêm da ficha (Yahoo)."

O Radar, classe FIIs, continua só com FIIs (quem tem informe). Na carteira, `classeDe` dá `fiinfra` e `fiagro` pela mesma regra, com filtro próprio em Posições, cor própria na faixa de classes e listas automáticas `carteira-fiinfra` e `carteira-fiagro`. No IR para conferir, venda de Fiagro entra junto com FII (20% sobre o lucro); FI-Infra fica de fora (cota de fundo incentivado de infraestrutura tem alíquota zero para pessoa física).

## FIIs

Os dados dos fundos vêm do informe mensal da CVM (`src/cvm.js`), em duas etapas no cron: o ano anterior vai para `meta/fii-cvm-ant` e o ano corrente monta `meta/fii` (completo, com histórico, lido no diálogo do papel) e `meta/fii-resumo` (sem histórico, lido na tabela e nos filtros). O cabeçalho do CSV geral fica em `_sistema/cvm-etapa.cabecalhoGeral` para conferir no admin.

Campos de cada fundo em `meta/fii` (nomes curtos para o doc não inchar): `n` nome, `s` segmento, `a` administrador, `c` CNPJ, `ref`, `vp`, `cot`, `pl`, `cotas` e `h` (histórico mensal). Do cadastro vêm também:

- `m`, mandato, em rótulo curto: Renda, Papel (Títulos e Valores Mobiliários), Híbrido, Desenvolvimento para Renda, Desenvolvimento para Venda. O que não estiver no mapa sai em Title Case, do jeito que veio. No informe de 2026 o mandato veio vazio para todos os fundos; quando falta, o ano anterior completa (`fii-cvm-ant.cad`).
- `g`, gestão: Ativa ou Passiva. A CVM manda "Definida" para a passiva.
- `pz`, prazo: "Indeterminado", "Determinado (até AAAA-MM-DD)" quando há `Data_Prazo_Duracao`, ou só "Determinado".
- `ini`, início do funcionamento (AAAA-MM-DD), `pub`, público-alvo, e `site`, só quando começa com http.

`m`, `g` e `a` existem sempre (vazios quando faltam); `pz`, `ini`, `pub` e `site` só entram quando vieram. Campo vazio no informe mais recente é completado pelo anterior do mesmo ano e, depois, pelo ano anterior. `meta/fii-resumo` leva `m` e `g` quando existem. O administrador fica cru no banco; a página arruma a caixa ("BTG Pactual Servicos Financeiros S.A.").

Na página, o diálogo de um FII mostra chips de mandato, gestão, segmento e prazo e o bloco "Sobre o fundo" (administrador, início em "mar/2019", público-alvo, prazo, CNPJ e link do site). Na Bolsa, com FIIs, o filtro Mandato fica abaixo de Segmento, com contagem e várias escolhas, e vale para o Pregão e a tabela; fica salvo em `radar-bolsa-filtros` junto com os outros. Enquanto nenhum fundo tiver mandato, o grupo mostra só um aviso e um filtro salvo antes não esconde nada. A tabela ganha a coluna Mandato a partir de 1200 px; abaixo disso o mandato fica no diálogo. Como os outros filtros da coluna esquerda, o de Mandato só existe a partir de 900 px.

## Início (painel de widgets)

Primeira aba (`#inicio`). Sem hash, com `#inicio` ou com um hash desconhecido, o site abre aqui; as outras abas usam `#tech`, `#negocios`, `#investimentos` (com `/eua` e `/noticias`), `#politica` e `#esportes`. Sair do Início para uma seção cria uma entrada no histórico, então o "voltar" do navegador traz o Início de volta; o logotipo também leva ao Início. Enquanto o Início está aberto, nenhuma seção fica assinada: não há polling do feed, do status nem do mercado de fundo.

Layout: sem colunas laterais, a barra de abas fica no topo do centro em qualquer largura. Cabeçalho com saudação (primeiro nome de `/api/me`), data por extenso e "atualizado há X" do dado mais novo da grade, mais os botões Editar e Personalizar. A grade vem em grupos (Notícias, Mercado, Minha carteira, Análises, Fóruns e Esportes por padrão), cada um com o título discreto (estilo `rotulo`) que recolhe e abre o grupo; grupo sem card visível não aparece. A grade de cada grupo tem 3 colunas a partir de 1200 px, 2 entre 700 e 1200 e 1 abaixo, `grid-auto-rows: minmax(180px, auto)`, `grid-auto-flow: dense` e `gap: 16px`. Cada widget tem um formato "colunas x linhas" (`1x1`, `2x1`, `3x1`, `1x2`, `2x2`) que vira `data-c` e `data-r` no card: a largura nunca passa do número de colunas da tela (um 3x1 ocupa 2 colunas em 1000 px e 1 no celular) e a altura em linhas vale em qualquer largura. O corpo do widget recebe o formato e decide quantos itens mostra (destaques, últimas, favoritos, pagamentos, agenda e alertas dobram com 2 linhas; Pregão 2x2 mostra 10 por coluna; Meu radar com 2 colunas mostra duas colunas de papéis; Minhas listas reparte as linhas entre as listas e, com 2 colunas, põe duas lado a lado), para não sobrar card vazio. Cada card tem título que leva à seção, subtítulo, corpo compacto, rodapé "Ver tudo →", esqueleto enquanto carrega e "Nada por aqui ainda." quando vem vazio.

Catálogo (`WIDGETS` em `src/painel.js`, o servidor valida contra ele; a página tem uma cópia para a primeira pintura):

| Id | Título | Formatos | Fonte | Mostra | Leva a |
|---|---|---|---|---|---|
| `hoje` | Hoje no Lookout | 1x1 | `/api/painel/hoje` | notícias novas nas últimas 24 h por seção, em barras, e a última coleta | cada linha, a sua seção |
| `mercado` | Mercado | 1x1, 1x2 | `meta/mercado` | cotações do letreiro em 2 colunas; Selic, CDI e IPCA numa linha embaixo | `#investimentos` |
| `pregao` | Pregão | 2x1, 3x1, 2x2 | `meta/b3` | maiores altas, baixas e mais negociadas (ações, 5 cada); papel abre o diálogo | `#investimentos` (classe Ações) |
| `fiis` | FIIs | 1x1, 2x1 | `meta/b3` + `meta/fii-resumo` | maior DY (líquidos) e mais descontados, 4 cada | `#investimentos` (classe FIIs) |
| `eua` | EUA | 1x1, 2x1 | `meta/eua` | S&P 500, Nasdaq e Dow; 4 maiores altas e 4 baixas | `#investimentos/eua` |
| `listas` | Minhas listas | 1x1, 1x2, 2x1 | `/api/listas` | as listas ligadas, na ordem da lista de listas, com preço e variação; o nome abre `#lista/<id>` | `#investimentos` |
| `favoritos` | Favoritos | 1x1, 1x2 | `/api/favs` (a assinatura que a página já tem) | os 5 mais recentes, com a seção | seção do mais recente, já filtrando favoritos |
| `destaques-<secao>` | Destaques · Tech (etc.) | 1x1, 1x2 | `/api/q?c=<destaques>&order=data&dir=desc&limit=1` | até 3 destaques do dia, título e 1 linha | a seção (Investimentos: `#investimentos/noticias`) |
| `ultimas-<secao>` | Últimas · Tech (etc.) | 1x1, 1x2 | `/api/q?c=<items>&limit=10` | 5 mais recentes (10 com 2 linhas), fonte e "há X" | a seção (Investimentos: `#investimentos/noticias`) |
| `foruns-<secao>` | Fóruns · Tech (etc.) | 1x1, 1x2 | `/api/q?c=foruns-<secao>`, últimas 24 h por `publicado`, `limit=10` | 5 posts (10 com 2 linhas), "r/<sub> · há X" e o link "fonte" quando o post aponta para fora; só nas seções com subreddit, fora do padrão | a seção |

Os widgets da carteira e do radar: Minha meta 2x1/3x1, Minhas simulações 1x1/2x1, Patrimônio 1x1/2x1, Proventos do mês 1x1, Próximos pagamentos 1x1/1x2, Agenda 1x1/1x2, Rentabilidade 1x1/2x1, Alertas 1x1/1x2, Meu radar 1x1/2x1/2x2, Leitura do dia 1x1/1x2/2x1, Carteira contra o filtro 1x1. O primeiro formato de cada um é o padrão. A tabela fica em `FORMATOS_DE` de `public/inicio-grade.js`, o mesmo arquivo na página e no Worker (`src/painel.js` importa pelo efeito); o catálogo do servidor manda. Cada widget tem um grupo padrão (`grupo` no catálogo, regra em `grupoDe`): destaques, últimas, Hoje e Favoritos em `noticias`; mercado, pregão, FIIs, EUA e listas em `mercado`; `carteira-*` em `carteira`; Meu radar, Leitura do dia e Carteira contra o filtro em `analises`; `foruns-*` em `foruns`; `esportes-*`, Destaques e Últimas de Esportes em `esportes`.

Seções: tech, negocios, investimentos, politica, esportes (na tela, Notícias é a aba de política). Widget de seção não liberada para a pessoa não aparece na grade, na lista de personalizar, no `/api/me` nem na rota. Padrão para quem nunca personalizou: hoje, mercado, destaques-tech, destaques-negocios, destaques-investimentos, destaques-politica, pregao, eua, listas, favoritos, destaques-esportes, ultimas-tech.

Rota `/api/prefs/painel`:

- `GET`: `{ grupos, widgets, padrao, gruposPadrao, atualizado, catalogo }`. `grupos` é o que a pessoa salvou, filtrado pelas seções de hoje (grupo que fica vazio sai), ou o padrão com `padrao: true`; `widgets` é a mesma coisa em lista plana; `gruposPadrao` serve ao "Restaurar padrão"; `catalogo` traz `id`, `titulo`, `formatos`, `grupo` e `secao`.
- `PUT` (só `application/json`, até 8 KB): `{ grupos: [{ id, nome, recolhido, widgets: [{ id, formato }] }] }`. Recusa com 400 id de grupo fora de `[a-z0-9-]{1,30}` ou repetido, nome vazio (o id padrão empresta o nome), `recolhido` que não seja booleano, mais de 12 grupos, widget fora do catálogo ou de seção não liberada, formato fora dos `formatos` do widget, widget repetido (mesmo em grupos diferentes) e mais de 40 widgets. Nome passa de 30 caracteres é cortado. Grupo vazio some. Uma página antiga que ainda mande `{ widgets }` (com `formato` ou `tamanho`) é aceita e agrupada.
- Doc em `prefs/<email>`, id `painel`: `{ grupos: [...], atualizado }`. O doc antigo, `{ widgets: [...] }` em lista plana, vira um grupo por tipo na leitura, com os grupos na ordem em que o primeiro widget de cada um aparecia e os widgets na ordem salva; `tamanho` 1 ou 2 vira `1x1` ou `2x1`. O doc é regravado no formato novo no próximo `PUT` (nada é migrado no banco de uma vez). Widget fora dos grupos está oculto. Gravação no D1 e write-through no espelho, como favoritos e listas; leitura pelo espelho. Excluir um convidado no admin apaga `prefs/<email>` junto. A limpeza da coleta não toca em `prefs/`.
- A página guarda uma cópia em `localStorage` (`radar-painel`) para a primeira pintura; a resposta do servidor manda.

Rota `/api/painel/hoje`: `{ corte, secoes: [{ secao, n, ultimaRodada, novosNaUltima }] }`, só das seções liberadas. Uma consulta só (os `meta/status*` e a contagem por collection com `coletado >= corte`, num `UNION ALL` que começa por `SELECT id, data FROM docs`, o formato que o espelho aceita). O corte anda de 10 em 10 min para a resposta ficar no cache de memória e de borda, com ETag como o resto.

Personalizar abre o catálogo "Adicionar card" (painel lateral no desktop, folha de baixo no celular): busca pelo nome e os widgets em grupos por tipo, cada um com os formatos que aceita e o botão Adicionar (ou "No Início"). O card entra no fim do grupo do tipo dele, criando o grupo se preciso. Fora do modo de edição entra na hora e vai para a conta; editando, entra no rascunho. Os da carteira ficam travados enquanto não há extratos; os do radar e de Esportes seguem as mesmas regras de antes para aparecer. O alfinete dos blocos da carteira põe o widget no começo do grupo dele.

Modo de edição (botão Editar, `html.inicio-editando`):

- Barra fixa no topo enquanto edita: Adicionar card, Novo grupo, Restaurar padrão, Cancelar e Salvar, e o aviso "Mudanças ainda não salvas". Tudo acontece num rascunho; só o Salvar faz o `PUT`. Cancelar volta ao salvo. Sair do Início no meio descarta o rascunho, e fechar a aba com mudanças pede confirmação do navegador. Se o `PUT` falhar, o rascunho fica e a barra avisa.
- Grade quadriculada: uma célula tracejada por coluna e linha de cada grupo, desenhada pelas trilhas reais da grade (`getComputedStyle(...).gridTemplateRows` traz as linhas implícitas), refeita com `ResizeObserver`.
- Cada card ganha a alça de mover (canto de cima à esquerda), o × para tirar (canto de cima à direita) e a alça de tamanho (canto de baixo à direita). Links e conteúdo do card ficam inertes.
- Mover: arrastar a alça (eventos de ponteiro, então mouse, caneta e toque) leva o card para qualquer posição, em qualquer grupo; o card arrastado fica no lugar de destino, tracejado, e os outros abrem espaço (`grid-auto-flow: dense` continua). Soltar sobre o título ou a área vazia de um grupo põe no fim dele, e um grupo recolhido abre. Perto da borda da janela a página rola. Teclado: com o foco na alça, as setas andam um passo e passam para o grupo vizinho na ponta.
- Redimensionar: ao arrastar a alça de tamanho aparecem as células até onde o card pode ir (`celulas` em `inicio-grade.js`): as dos formatos permitidos com contorno `--primary` e fundo de 10%, as outras hachuradas, e um contorno com o formato que vale. Ao soltar, encaixa no formato permitido mais perto do ponteiro (`encaixe`: distância em colunas e linhas; no empate fica o atual, depois o de menor área; formato mais largo que a tela não conta). Card perto da borda direita mostra as células a partir de mais à esquerda, que é para onde a grade leva o card mais largo. Teclado: Shift com setas (ou setas na alça de tamanho) trocam para o próximo formato na direção (`passoFormato`).
- Tirar: o card some da grade e volta pelo catálogo.
- Grupos: alça para arrastar o título (ou setas para cima e para baixo nela), botão de recolher e o nome editável no próprio título (até 30 caracteres; vazio volta ao nome padrão). Novo grupo entra no fim, vazio, com o espaço "Arraste cards para cá". Grupo vazio some ao salvar.
- Celular: o mesmo modo, uma coluna, alças de 40 px. A alça de tamanho vira um botão com a miniatura do formato que troca para o próximo a cada toque; um texto curto avisa que o formato vale no computador. Mover por arrastar (toque) ou pelas setas.
- Fora da edição, recolher um grupo pelo título grava na hora (o `PUT` sai logo depois).

Dados: cada widget faz no máximo uma leitura, todas em paralelo, pelas mesmas rotas da página (cache de memória e de borda, ETag). Os `meta/*` (mercado, b3, eua) ficam numa cópia em memória por 2 min, usada pelo Início e por Investimentos, nos dois sentidos; os ciclos de atualização pedem o doc de novo. A cada 2 min o Início atualiza só os cards que estão na tela (IntersectionObserver), e ao voltar para a aba atualiza os da tela com mais de 1 min.

## Nos fóruns

Posts dos subreddits de `src/feeds.js` (os mais votados do dia, `/r/<sub>/top/.rss?t=day`), sem curadoria: post de fórum não é notícia, mas mostra o que o pessoal está discutindo. A coleta grava cada post em `foruns-<radar>` (id = id do post no Reddit; `data` = `{ titulo, url, linkExterno, sub, autor, publicado, resumo, coletado }`, sem votos, que o Atom não traz) e nunca em `candidatos`. Ficam 3 dias.

- **Lateral:** bloco "Nos fóruns" nas seções com subreddit (desde 04/11/2026 todas as cinco: Tech, Negócios, Investimentos, Notícias e Política, Esportes; lista e ritmo em `docs/coleta.md`). Na Bolsa vai abaixo de "Notícias de hoje"; nas outras seções, que não têm "Notícias de hoje", abaixo de "Novos nesta rodada". Até 6 posts das últimas 24 h, por `publicado` (mais novo primeiro): título (abre o Reddit em nova aba, com o resumo no `title`), "r/<sub> · há X" e "fonte" quando há `linkExterno`. "Ver mais" abre até 20 ("Ver menos" fecha). Vazio: "Nada novo nos fóruns hoje." Abaixo de 1200 px o bloco vai para depois do feed (`#foruns-centro`).
- **Dados:** `/api/q?c=foruns-<radar>&order=publicado&dir=desc&wf=publicado&wo=>=&wv=<corte>&limit=20`, com o corte de 24 h andando de 10 em 10 min (cabe no cache). Mesmo ciclo de 2 min das outras leituras. As seções com subreddit vêm em `foruns` de `/api/me`, já filtradas pelas seções da pessoa; a API recusa com 403 `foruns-*` de seção não liberada (`SECAO_DA_COLECAO` em `src/grupos.js`).
- **Widget:** `foruns-<secao>` (tabela do Início).
- **Admin:** no "Rendimento das fontes", cada subreddit aparece uma vez, sem números de curadoria, com "No fórum" (posts dele em `foruns-*` agora).

## Esportes

Rodada, próximos jogos e tabela das competições que cada pessoa liga em "Meus esportes", sem IA. Esportes cobertos (decisão do dono, 05/11/2026): futebol, basquete (NBA), tênis (ATP e WTA) e padel, este só com notícias. NFL saiu em 05/11; F1 fica de fora. Código em `src/esportes.js` (fontes, parsers, cron e sonda) e `public/esportes.js` (competições, zonas da tabela, validação de "Meus esportes" e a hora no fuso de quem vê; o mesmo arquivo roda no Worker, na página e nos testes). Sem escudo de clube e sem foto de jogador: só o nome do time (ou do jogador) e, onde falta espaço, a sigla de 3 letras ou o nome curto.

### Fontes

- **ESPN**, endpoints públicos sem chave (JSON): `site.api.espn.com/apis/site/v2/sports/<esporte>/<liga>/scoreboard?dates=AAAAMMDD` (jogos de um dia só; faixa de datas devolve HTTP 400, descoberto em produção em 04/11). A resposta traz `leagues[0].calendar` com os dias que têm jogo; o módulo busca hoje mais até 5 dias do calendário em volta (`diasExtras`), dentro de um orçamento de 30 chamadas por rodada do cron, `site.api.espn.com/apis/v2/sports/<esporte>/<liga>/standings` (reserva: `site.web.api.espn.com/.../standings?season=AAAA`) e `.../teams/<id>/schedule` (e `?fixture=true` quando o primeiro não traz jogo futuro). O módulo aceita qualquer `<esporte>/<liga>` da ESPN; `LIGAS` tem o futebol (`bra.1`, `conmebol.libertadores`, `bra.copa_do_brasil`, `bra.camp.gaucho`, `conmebol.sudamericana`, `eng.1`, `uefa.champions`, `esp.1`, `ita.1`, `ger.1`, `fra.1`), desde 04/11 `nba` (`basketball/nba`) e, desde 05/11, `atp` e `wta` (`tennis/atp`, `tennis/wta`); veja "NBA" e "Tênis" abaixo. Competição sem tabela leva `semTabela: true` (Copa do Brasil e tênis): o cron nem pede a standings e a tabela nunca conta como vencida (antes de 05/11 o doc da Copa do Brasil era regravado a cada passada à toa). A NFL entrou em 04/11 e saiu em 05/11 por decisão do dono; F1 fica de fora.
- Campos lidos: `events[].competitions[0].competitors[]` (`homeAway`, `team.displayName/abbreviation/id`, `score` como texto ou `{ value }`), `status.type.state` (`pre`, `in`, `post`), `status.displayClock` (no futebol), `status.period` com `displayClock` (NBA: "4º quarto · 5:32", "prorrogação · 2:10", "fim do 1º quarto"), `STATUS_HALFTIME` vira "intervalo", adiado e cancelado viram `detalhe: "adiado"`; `venue.fullName`. O tênis tem leitura própria (veja "Tênis"). Tabela: `children[].standings.entries[].stats` por `name` (`rank`, `points`, `gamesPlayed`, `wins`, `draws` ou `ties`, `losses`, `pointsFor`, `pointsAgainst`, `pointDifferential`); vários `children` são grupos (Libertadores) e cada linha leva `grupo`. Campo que falta vira `null` e aparece "–"; evento sem nome de time sai.
- **Globo Esporte**: reserva opcional por competição (`reserva: "ge"` em `LIGAS`), hoje sem uso: a página do Gauchão deu 404 na sonda e a ESPN cobre o Gauchão (`bra.camp.gaucho`) na temporada. Quando alguma liga voltar a usar: O parser procura o JSON embutido (`"classificacao"` com `ordem`, `nome_popular`, `sigla`, `pontos`, `jogos`, `vitorias`, `empates`, `derrotas`, `gols_pro`, `gols_contra`, `saldo_gols`; `"lista_jogos"`/`"jogos"` com `equipes.mandante/visitante`, `placar_oficial_*`, `data_realizacao`, hora sem fuso lida como de Brasília) e, sem ele, a primeira tabela do HTML com posição, nome e números. Não achou nada: `null`, o erro vai para `_sistema/esportes-erro` e o cron segue. Com a ESPN recusando (4xx), a competição fica no ge por 24 h antes de tentar a ESPN de novo.
- **Notícias do ge**: os feeds RSS que já estavam em `src/feeds.js` (futebol, Brasileirão, Inter e futebol internacional) respondem em produção (`feeds_estado` de 04/11, sem erro). Os candidatos da sonda (`/rss/ge/`, `/rss/ge/rs/`, Gauchão, Copa do Brasil, Libertadores) deram 200 com itens e foram para `src/feeds.js` em 04/11.
- **Notícias de padel**: veja "Padel" abaixo.
- **Sonda** (`_sistema/sonda-esportes`): na primeira execução do cron monta a lista (scoreboard e standings de cada liga acima; no tênis, o scoreboard sem data e o de hoje, sem standings; o schedule de um time tirado da tabela do `bra.1`, a página do Gauchão no ge e os RSS candidatos, inclusive os de padel) e anda 6 por minuto. Cada resposta vai crua, até 20 KB, para `_sistema/sonda-esportes-aNN` (`{ url, status, quando, amostra, cortado }`); o resumo (status, tempo, tamanho, tipo de conteúdo e o que o parser achou: jogos, estados, linhas, itens) fica em `resultados`. Pronta (`fim`), só volta a andar quando a lista ganha item que ainda não tem resultado (competição nova em `SONDA_LIGAS`): pede só os novos, com número de amostra novo, e marca `retomada`. Foi assim que NBA e NFL entraram na sonda que já tinha terminado em 04/11, e é assim que ATP, WTA e os RSS de padel entram agora (a NFL saiu da lista; o resultado antigo dela fica lá, sem efeito). Para rodar tudo de novo, apagar os docs da sonda pela lista de ids. O proxy do ambiente de desenvolvimento não alcança a ESPN nem o ge: os parsers foram escritos pelo formato conhecido e conferidos com JSON e HTML de exemplo (`test/fixtures-esportes.mjs`), e as amostras de produção servem para ajustar.

### Docs

`meta/esportes-<liga>` (seção Esportes: `SECAO_DO_META` em `src/grupos.js` aceita o prefixo `esportes-`; convidado sem a seção recebe 403; o espelho copia `meta` inteiro):

```
{ atualizado, liga, nome, temporada, fonte: "espn" | "ge",
  tabela: [{ pos, time, sigla, id, j, v, e, d, gp, gc, sg, pts, zona, grupo?, pct?, gb?, seed?, curto? }],
  rodada: { numero, jogos: [jogo] }, proximos: [até 20], ultimos: [até 20],
  times: { <id do time>: { nome, proximos: [até 10], ultimos: [até 10] } },
  rodadaEm, tabelaEm, timesEm, tentativas: { rodada?, tabela?, times? }, espnFalhouEm? }
jogo: { id, data (ISO), mandante, visitante, siglas: [m, v], ids: [m, v], placar: [m, v] | null, estado: "pre" | "in" | "post", minuto, estadio, detalhe, rodada?, curtos? }
```

`pct`, `gb`, `seed` e `curto` só nas competições com `porSeed` (NBA); `curtos` (o `shortDisplayName` da ESPN, "Lakers") só nos jogos dela.

Tênis (`meta/esportes-atp`, `meta/esportes-wta`): o mesmo doc, com `tabela: []`, `times: {}` e as partidas no lugar dos jogos:

```
rodada: { numero: null, jogos: [partida] }   partidas do dia (São Paulo) e as em andamento, ao vivo primeiro
proximos: [até 40], ultimos: [até 30], torneios: [{ id, nome, local, inicio, fim, rodada, aoVivo, partidas }]
partida: { id, data, torneio, torneioId, chave, rodada, jogadores: [a, b], curtos: [a, b], cabecas: [a, b], ranks: [a, b],
  sets: [[a, b], ...], vencedor: 0 | 1 | null, estado, minuto ("2º set"), quadra, detalhe ("desistência", "W.O.", "adiado", "suspenso") }
```

`rodada` é o número de rodada do jogo ao vivo ou do mais perto de agora, quando a ESPN manda; sem número, os jogos até 2 dias em volta dele. `zona` sai de `LIGAS[liga].zonas` (faixas de posição por competição; Brasileirão: Libertadores 1º a 6º, Pré-Libertadores 7º e 8º, Sul-Americana 9º a 14º, rebaixamento 17º a 20º). Mexer nas faixas muda a cor das linhas e a legenda, nada mais. Uma parte que falha deixa a anterior como estava e marca `tentativas`.

### Cron (`cronEsportes`, a cada minuto no `scheduled`)

- A sonda anda enquanto tiver pendentes.
- As competições são conferidas nos minutos terminados em 4 e 9. Ativas: as ligadas em todos os `prefs/<email>` id `esportes` (lidos pela faixa da chave, sem `LIKE`) mais Brasileirão e Libertadores sempre.
- Rodada (scoreboard): a cada 15 min quando há jogo ao vivo ou começando entre 3 h atrás e 2 h à frente; senão 1x por hora. Tabela: 2x por dia. Schedule dos times de interesse: 1x por dia, só de quem está numa competição ligada. Tentativa que falhou espera pelo menos 30 min.
- NBA: hoje, ontem e amanhã (`diasExtras: 2`). Tênis: o scoreboard sem data (torneios em andamento) e ontem, hoje e amanhã, quatro chamadas por circuito, partidas juntadas pelo id; sem standings e sem schedule. O ritmo é o do futebol (15 min com partida ao vivo ou começando, 1x por hora sem).
- Fila de chamadas com 400 ms entre uma e outra, 8 s de limite cada, 429 dobra a espera e tenta de novo uma vez (o segundo 429 para a passada), no máximo 30 chamadas por passada, competições com jogo agora primeiro. Erros por competição e parte em `_sistema/esportes-erro` (`porLiga["bra.1:rodada"]`); o cron nunca lança.

### Meus esportes

`prefs/<email>`, id `esportes`: `{ competicoes: [ids ligados], times: [{ liga, id, nome }], jogadores: [{ liga, nome }], ordem: [todas as competições] }`, por `GET`/`PUT /api/prefs/esportes` (403 sem a seção Esportes; validação em `Esportes.validarPrefs`: competição fora de `LIGAS` é recusada, até 10 times, id do time só letras, números e hífen, nome até 40; até 10 jogadores, só de `atp` ou `wta`, nome de 2 a 40 letras, sem repetir o mesmo nome sem acento na mesma liga). Quem nunca salvou: Brasileirão, Libertadores e Copa do Brasil, sem time e sem jogador. `ordem` guarda todas para a competição voltar ao mesmo lugar quando for religada. Quem tinha a NFL ligada (04/11) não perde nada: `Esportes.semRetiradas` tira a NFL (e os times dela) do salvo na leitura e no cron, e o resto vale; o próximo `PUT` já grava sem ela. Um `PUT` com `nfl` é recusado como competição desconhecida.

Tela: `#esportes/config`, aberta pelo menu da conta ("Meus esportes", só com a seção liberada) e pelo botão no topo da aba. É uma folha lateral (de baixo no celular) com os grupos Futebol, Basquete (NBA), Tênis (ATP e WTA) e Padel (sem competição, só o texto "Resultados de padel ainda sem fonte pública; por enquanto só notícias.") → competições (ligar e desligar, arrastar pela alça ou ▲▼; NBA, ATP e WTA desligadas até a pessoa marcar, e quem salvou antes entra com elas no fim da ordem), "Times que eu acompanho" (autocompletar pelos times das tabelas e jogos das competições ligadas, menos o tênis; o primeiro time é o do widget "próximo jogo") e "Jogadores de tênis que eu acompanho" (nome digitado e o circuito, ATP ou WTA; sugestões pelos nomes das partidas guardadas das ligas de tênis ligadas; Enter ou Adicionar sem sugestão marcada guarda o nome como foi digitado). Fechar volta o endereço para `#esportes`.

### Aba Esportes

Acima do feed, um cartão por competição ligada, na ordem da pessoa, com três abas (`Esportes.abasDe`; no tênis são outras, veja "Tênis"): **Rodada** (dia e hora no fuso de quem vê, mandante × visitante, placar ou "×"; "ao vivo · 67'" em vermelho), **Próximos** (os 10 próximos do time de interesse daquela competição, quando houver; senão os da competição) e **Tabela** (helper `Tabela`, id `esp-tab-<liga>`, ordenável, sem filtro; faixa de cor por zona com legenda, time de interesse em negrito com "seu time"; grupos numa coluna "Grupo"). As colunas vêm de `LIGAS[liga].colunas` (`Esportes.colunasDe`): futebol com J, Pts, SG, V, E, D, GP, GC; NBA com V, D, % e GB. Na NBA a primeira aba se chama Jogos (`Esportes.rodadaDe`), o placar tem coluna mais larga e, no celular, os times aparecem pelo nome curto ("Lakers"). Cartão recolhível; aba e recolhido ficam no `localStorage` (`radar-esportes`). Sem doc: "Sem dados desta competição ainda." Rodapé: "Dados: ESPN" ou "Dados: Globo Esporte" e "atualizado há X". A página relê a cada minuto as competições com jogo agora e a cada 5 min as outras. O filtro Nacional/Internacional do feed segue como estava; o Internacional aparece como "Inter" no selo de clube e no título do grupo (o dado gravado não muda). No celular os cartões empilham, as abas ocupam a largura e a tabela mostra Pos, Time, J, Pts e SG, com o resto na rolagem lateral.

### NBA (04/11/2026)

- **NBA** (`nba`, `basketball/nba`): tabela por conferência, cada `children` da standings é um grupo ("Leste" e "Oeste"; `Esportes.nomeGrupo` traduz os nomes da ESPN). Stats lidos: `wins`, `losses`, `winPercent` (fração; acima de 1 é dividido por 100; sem ele, calculado), `gamesBehind`, `playoffSeed`. Sem empate e sem gols: a tabela mostra V, D, % e GB. Zonas pelo seed: playoffs 1º a 6º, play-in 7º a 10º. A "rodada" é a noite de jogos: 12 h em volta do jogo de referência (`raioRodada: 0.5`).
- `porSeed`: dentro de cada grupo a ordem é a do `playoffSeed` (a ESPN não manda as linhas nessa ordem); quem não tem seed vai para o fim, pela % e pelas vitórias, e a zona sai da posição. `pos` é a posição no grupo.
- Placar como número inteiro (o `score` vem em texto). Jogo que não começou não tem placar, mesmo com `score: "0"`. Horário no fuso de quem vê, como no futebol. Sem escudo e sem foto.
- Ritmo igual ao do futebol (15 min com jogo perto, 1x/hora sem, tabela 2x/dia, times 1x/dia). Não é coletada sem alguém ligar.
- **O que foi conferido de verdade**: nada direto da ESPN. Nem o WebFetch (URL fora da lista permitida) nem o `curl` (proxy) alcançaram `site.api.espn.com` em 04/11. O parser segue o formato conhecido da API (o mesmo do futebol, que a sonda de produção confirmou) e as fixtures `scoreboardNba` e `standingsNba` de `test/fixtures-esportes.mjs` imitam esse formato; campo que falta vira `null` e aparece "–".
- **Por conferir pela sonda em produção** (amostras `scoreboard:nba` e `standings:nba`; o resumo traz `comSeed`, `nomesGrupos`, `tipoTemporada` e o `minuto` do primeiro jogo ao vivo): se a standings vem com `children` por conferência e `playoffSeed` em todas as linhas; se `winPercent` vem em fração; o `status.type.name` de fim de quarto (`STATUS_END_PERIOD`) e do intervalo; o `shortDisplayName` dos times.
- **NFL**: entrou junto em 04/11 e saiu em 05/11 por decisão do dono. Saíram `LIGAS.nfl`, as zonas de líder de divisão e wild card, a leitura de semana (`week.number`, `urlSemana`, a semana anterior) e os nomes AFC/NFC; os testes e as fixtures dela foram apagados. O `meta/esportes-nfl` que o cron tenha gravado fica no banco sem uso (pode ser apagado pelo Admin) e os widgets `esportes-*-nfl` salvos no Início somem da resposta sozinhos.

### Tênis (05/11/2026)

- **ATP e WTA** (`atp` e `wta`, caminhos `tennis/atp` e `tennis/wta`, `semTabela: true`, `tenis: true`), pelo mesmo scoreboard público da ESPN: sem data traz os torneios em andamento; com `?dates=AAAAMMDD`, um dia. Grupo "Tênis" em Meus esportes, desligados até a pessoa marcar.
- **Formato lido** (`lerTenis` e `lerPartida` em `src/esportes.js`): cada `events[]` é um torneio (`name`, `date`, `endDate`, `venue` com `address.city`/`country` ou só o nome); dentro, `groupings[]` são as chaves (`grouping.slug`/`displayName`: simples masculino, duplas...) e cada `competitions[]` é uma partida, com `competitors[]` (`order` decide quem é o primeiro; `athlete.displayName` e `shortName`; `seed` vira a cabeça de chave; `curatedRank.current` o ranking; `linescores[].value` os games de cada set; `winner`), `status.type.state` e `name` (desistência, W.O., adiado, suspenso), `status.period` (o set em andamento; sem ele, o número de sets com placar), `round.displayName` ou `notes[0].text` (a rodada, em português por `Esportes.rodadaTenis`: "Round 2" vira "2ª rodada", "Round of 16" vira "oitavas de final", "Round Robin" vira "fase de grupos") e `venue.court`. Evento sem `groupings` mas com `competitions[]` direto também é lido. Só as chaves de simples entram; duplas ficam de fora nesta versão. Campo que falta vira `null` (ou texto vazio); partida sem os dois nomes sai.
- **Tela**: abas **Jogos** (as partidas do dia e as em andamento: hora no fuso de quem vê ou "ao vivo · 2º set", os dois jogadores com a cabeça de chave entre parênteses, o vencedor em negrito, o torneio e a rodada embaixo, o placar por sets à direita, "6-4 3-6 7-6", ou "a jogar"; no celular, o nome curto "J. Sinner"), **Próximos** (as marcadas; com jogador acompanhado que tenha partida marcada, só as dele, com "Próximas partidas de Sinner") e **Torneios** (nome, cidade e país quando a ESPN mandar, período "02/11 a 08/11", "ao vivo · oitavas de final" ou "rodada atual: …"). Jogador acompanhado aparece na cor primária em todas as listas; a busca é pelo nome digitado, sem acento e sem caixa, dentro do nome completo ou do curto (`Esportes.ladoDoJogador`). Sem foto.
- **Widgets**: `esportes-rodada-atp` e `esportes-rodada-wta` ("ATP · jogos", "WTA · jogos"; 1x1 ou 2x1, as partidas do dia pelo nome curto, com o placar por sets). Sem widget de tabela.
- **Cron**: igual ao futebol (15 min com partida ao vivo ou começando nas próximas 2 h, 1x por hora sem), quatro chamadas por circuito (sem data, ontem, hoje, amanhã), sem standings e sem schedule. Falhou tudo: fica o doc anterior e o erro vai para `_sistema/esportes-erro` como `atp:rodada`.
- **O que foi conferido**: nada direto da ESPN; o ambiente de desenvolvimento não alcança a API. O parser foi escrito pelo formato descrito acima e testado com as fixtures `scoreboardAtp`, `scoreboardAtpDia` e `scoreboardWta` (jogadores reais, placares inventados), inclusive com campos faltando, ordem trocada, duplas, desistência e evento sem `groupings`. Prints com o doc gerado pelo próprio `atualizarLiga`.
- **Por conferir pela sonda em produção** (amostras `scoreboard:atp`, `scoreboard:wta`, `scoreboard-dia:atp` e `scoreboard-dia:wta`; o resumo traz `torneios`, `partidas`, `estados`, `chaves`, `comCabeca`, `comRank`, `comSets`, `semData`, `semRodada`, `primeiroTorneio` e um `exemplo` de partida lida): se os eventos vêm mesmo com `groupings` e qual o `slug` das chaves de simples; se o nome vem em `athlete.displayName` (ou em outro lugar) e o curto em `athlete.shortName`; se a cabeça de chave vem em `seed` e o ranking em `curatedRank.current`; se `linescores[].value` traz os games do set (e onde fica o tie-break); se `status.period` é o set; onde vêm a rodada (`round` ou `notes`) e a cidade do torneio; os `status.type.name` de desistência e W.O.; se o scoreboard sem data traz só os torneios ou também as partidas do dia, e se precisa mesmo das quatro chamadas.

### Padel (05/11/2026)

Sem resultados nesta versão: nem a Premier Padel nem a FIP expõem JSON público. Por enquanto o padel entra só como notícias:

- **Meus esportes**: o grupo "Padel" aparece sem competição, só com o texto "Resultados de padel ainda sem fonte pública; por enquanto só notícias."
- **Feed**: tema "Padel" (`padel`) em `TEMAS_ESPORTES` na página, com a cor primária, para o filtro de temas da aba. Quem grava o tema é a curadoria de Esportes (tarefa agendada `trig_01KPpFyECoH1eGqHKSzhg3Cq`): ela precisa saber que existe o tema `padel`, senão os itens de padel caem em outro tema.
- **Feeds**: em `src/feeds.js` só o que deu para abrir com itens em 05/11: The Joy of Padel (`https://feeds.megaphone.fm/thejoyofpadel`, podcast em inglês com jogadores do circuito, episódio de 04/11/2026). Os candidatos que o ambiente não deixou abrir estão em `SONDA_RSS` de `src/esportes.js`, para a sonda testar em produção: FIP (`padelfip.com/feed/` e `/es/feed/`), The Padel Paper, Padel Alto, Padel World Press, Padel Addict, Super Padel e Padel Clube. Os que derem 200 com itens vão para `src/feeds.js`, seção `esportes`. Vistos e deixados de fora: Humans of Padel (podcast parado desde out/2025) e o feed de padel do Ara in English (2 itens em um ano).
- Resultados ficam no `ROADMAP.md` como pendente, para quando houver fonte.

### Widgets

`esportes-rodada-<liga>` ("Brasileirão · rodada", "NBA · jogos", "ATP · jogos"; 1x1 ou 2x1: os jogos de hoje e os em andamento, mesmo que tenham começado antes da meia-noite, ou a rodada quando não há jogo hoje; NBA pelo nome curto; tênis com as partidas do dia e o placar por sets), `esportes-tabela-<liga>` ("Brasileirão · tabela", 1x1 com os 6 primeiros ou 1x2 com 14, mais a linha do time de interesse se ele estiver abaixo; com grupos, o do time de interesse, senão o primeiro, com o nome do grupo no subtítulo; futebol com J e Pts, NBA com a campanha V-D e %; o tênis não tem) e `esportes-meu-time` ("Inter · próximo jogo", com o nome do time escolhido: o jogo em andamento ou o último resultado, e o próximo jogo). Todos da seção Esportes, fora do padrão. O catálogo do servidor tem os de todas as competições; a página só mostra e oferece em Personalizar os das competições ligadas (e o "próximo jogo" só com time escolhido).

## Minhas listas

Collection `listas/<email>`, código em `src/listas.js` (modelo, regra, histórico, rota e cron) e na página (lateral `listaEl`/`renderListas`, página da lista `desenharPaginaLista`, lista de listas `desenharTodasListas`, painel `desenharPainelLista`). Aparecem na lateral da Bolsa e dos EUA (trilho direito a partir de 1200 px, abaixo da tabela antes disso), no widget do Início, na página de cada lista (`#lista/<id>`) e na lista de listas (`#listas`, também "Minhas listas" no menu da conta).

Qtd e Valor (desde 04/11/2026): na lateral, colunas Qtd e Valor (quantidade × preço atual) para o papel que está em posição aberta na carteira importada, ordenáveis pelo cabeçalho como as outras; sem carteira ou sem o papel, "–". A linha ganha fundo leve verde ou vermelho pelo resultado da posição (preço atual contra o preço médio), como na página da lista; sem o papel, pela variação do dia. A conta é `RadarFiltro.posicaoLista` e `tomLista` (`public/radar-filtro.js`), com a mesma leitura de `/api/carteira` dos widgets (1 por minuto). Na lateral o preço sai sem "R$" e a tabela rola de lado com o papel parado na primeira coluna. No widget do Início, com carteira, cada linha mostra Papel, Qtd, Valor e Dia (o preço sai para caber) com a mesma cor.

### Modelo

Doc `{ nome, papeis, criado, atualizado }` mais os campos opcionais, todos conferidos em `validarLista`:

- `descricao`: até 4.000 caracteres, markdown simples (parágrafos, linhas começando com "- " viram lista, `**negrito**`). A página monta o texto com nós de texto, nunca HTML cru. A FII-Core-2026-11, gravada direto no D1 com `descricao` em texto puro, é lida como está.
- `ativa`: `false` tira a lista da lateral, do Início e do Radar; ela continua na lista de listas e na própria página.
- `regra`: `{ classe, criterios, soCarteira, referencia? }`. `classe` é `fiis`, `acoes`, `eua`, `fiinfra`, `fiagro`, `etfs` ou `bdrs`; `criterios` tem o formato dos filtros do Radar (`public/radar-filtro.js`, `validarFiltro(b, true)`; nas quatro classes que o Radar não mostra, só DY mínimo, liquidez mínima e a ordem por liquidez ou DY); `soCarteira` deixa só os papéis que estão na carteira. Sem `referencia`, a lista é **dinâmica**: os papéis vêm da regra. Com `referencia: true`, é uma lista manual que usa a regra só para comparar (coluna Situação e Sugestões), sem mexer nos papéis.
- `fixos` e `excluidos` (dinâmicas): até 60 papéis cada; fixo sempre entra, excluído nunca (excluído ganha de fixo; o mesmo papel nos dois é recusado).
- `historico`: `[{ quando, papel, acao, motivo }]`, até 500 entradas, as mais antigas caem. `acao` é `entrou`, `saiu`, `criada` ou `regra` (mudança de regra sem papel entrando nem saindo). Só o servidor grava. Motivos: na manual, "adicionado por você", "removido por você", "movido de “X”", "copiado de “X”", "movido para “Y”"; na dinâmica, os valores de quem entrou ("P/VP 0,93, DY 13,3%"), o critério de quem saiu ("P/VP foi a 1,20, acima de 1,00", "liquidez do dia em R$ 0,8 mi, abaixo de R$ 1 mi", "ficou fora das cotações do Lookout"), "fixado por você", "excluído da regra por você", "passa na regra, mas ficou fora do limite de 60" e "regra alterada: DY 12m mínimo 10% → 9%"; nas automáticas, "importação de dd/mm".
- `posicao` (ordem de exibição), `cor` (uma de `CORES`, sem seletor na tela por enquanto), `ordem` (ordem das colunas na lateral, como antes), `auto` e `classe` nas automáticas; nas dinâmicas também `calculado`, `cortados` (quantos passaram na regra e ficaram fora do limite de 60) e `recalcManual`.

### Regra e recálculo

`materializar(regra, dados, { fixos, excluidos })` é pura: roda `RadarFiltro.aplicar` nas linhas da classe (`RadarFiltro.linhasDe` sobre `meta/b3`, `meta/fii-resumo`, `meta/eua` e as fichas guardadas em `hist`), tira quem não está na carteira quando `soCarteira`, põe os fixos primeiro, tira os excluídos e corta em 60 pela ordenação da regra. `diffDinamica` compara com os papéis de antes e escreve o histórico; `aplicarRegra` junta as duas coisas. A lista dinâmica é recalculada:

- no cron do minuto 41 (`cronListas`): todas as dinâmicas ligadas de todo mundo (`listas/%` com `regra`, pela faixa da chave primária), meta e fichas lidos uma vez só, posições de quem usa "só papéis que tenho" decifradas uma vez por pessoa; grava só as que mudaram (papéis, ordem ou cortados), em batches de 50, com write-through no espelho;
- ao abrir a página da lista (`GET /api/listas/<id>`), se o último cálculo tem mais de 1 h (aí grava mesmo sem mudança, para marcar `calculado`);
- no "Recalcular" (`POST /api/listas/<id>/recalcular`), uma vez a cada 5 min por lista (429 com `aguarde`);
- ao salvar regra, fixos ou excluídos.

Na lateral, numa lista dinâmica "+ papel" vira "+ fixar papel" (vai para `fixos`) e "×" vira "Excluir da regra" (vai para `excluidos`); não há ordem por arrastar. Mover para uma lista dinâmica põe o papel nos fixos; mover para fora de uma dinâmica põe o papel nos excluídos dela.

### Automáticas da carteira

Ids fixos `carteira-fiis`, `carteira-fiinfra`, `carteira-fiagro`, `carteira-acoes`, `carteira-bdrs`, `carteira-etfs` e `carteira-subscricoes`, nomes "Carteira · FIIs" etc., `auto: true` e `classe`. Papéis = posições abertas da classe, na ordem de valor, até 60, só das classes com papel. A sincronia (`sincronizarListasCarteira`) roda depois de importar (também quando nada de novo entrou), de desfazer uma importação e de apagar a carteira; lê do D1, regrava só a lista que mudou, guarda `descricao`, `ativa`, `posicao` e `cor` que a pessoa pôs e registra no histórico quem entrou e saiu ("importação de dd/mm"). Apagar a carteira apaga todas. Elas não contam no limite de 30. O `PUT` delas aceita só `ativa`, `descricao`, `posicao` e `cor` (o resto dá 400 `lista automática`); na tela não têm "+ papel", renomear nem ×, e têm "Copiar para lista minha".

### Página da lista (`#lista/<id>`)

Abre pelo nome da lista na lateral, no Início e na lista de listas. Roda no modo do Início, como a Minha carteira (`carteiraVista = "lista:<id>"`).

- Cabeçalho: nome (lápis para renomear, nas manuais e dinâmicas), selos (manual, por regra ou da carteira; ligada ou desligada), contagem, "Editar regra" (dinâmica), "Editar regra de referência" ou "Comparar com uma regra" (manual), "Recalcular" (dinâmica), "Ligar"/"Desligar", "Copiar para lista minha" (automática), "Exportar CSV" (separador `;`, decimal com vírgula, BOM para o Excel) e "Excluir".
- Descrição: o markdown, com "Editar" (textarea, contador de 4.000, Salvar e Cancelar; Esc cancela). Vazia: "Sem descrição. Escreva o motivo da lista, os critérios e as decisões." Com regra, abaixo a regra em frases (`RadarFiltro.fraseRegra`), os fixos e excluídos, "calculada há X" e o aviso de quantos ficaram fora do limite de 60.
- Comparações: `Tabela` com id `lista-<id>` (ordem, filtros e paginação salvos como as outras tabelas). Colunas, só as que têm dado: Papel, Nome, Classe (com segmento ou setor), Preço, Dia, DY 12m, P/VP, Liquidez, Cotistas, No mês; da carteira, para quem tem o papel: Quantidade, Preço médio, Valor, Resultado (R$), Resultado %, Para empatar (quanto o preço precisa subir até o preço médio, `RadarFiltro.paraEmpatar`), DY sobre custo (proventos de 12 meses sobre o custo, `dySobreCusto`), Proventos 12m, % da carteira; Situação ("passa" ou "não passa: critério") quando há regra; Avisos (os chips do Radar). Fundo da linha a 8% da cor `--ok` ou `--err` pelo Resultado % da posição (papel na carteira) ou pela variação do dia (fora dela), com legenda acima. No celular ficam Papel, Preço, Dia, Resultado % e Situação; o resto está na ficha do papel.
- Histórico: os 50 mais recentes, agrupados por dia ("03/11 · entrou HGBS11 (P/VP 0,83, DY 11,2%) · saiu KNIP11 (…)"), com "Ver tudo".
- Sugestões (com regra, dinâmica ou de referência): quem passa na regra e não está na lista, quem está e não passa (com o motivo) e duas variações automáticas por critério numérico ligado, uma mais folgada e uma mais apertada (`RadarFiltro.variacoes`: P/VP ±0,05, DY ±1 ponto, liquidez ×0,5 e ×1,5, P/L ±2), cada uma com quantos entrariam e sairiam e o botão "aplicar", que grava a regra nova. Rodapé "Conta aritmética, não recomendação." Nada ali diz o que fazer com o papel.
- No celular o cabeçalho empilha e Histórico e Sugestões viram acordeões fechados.

### Nova lista e editar regra

O mesmo painel (lateral no desktop, folha de baixo no celular): nome, descrição, tipo (manual ou por regra). Por regra: os mesmos campos da coluna de filtros do Radar (`camposCriterios`, a função que o Radar também usa), "só papéis que tenho", prévia ao vivo ("17 papéis passam hoje · a lista ficaria com 17 papéis", com os primeiros papéis), fixos e excluídos com autocompletar. Manual: botão "comparar com uma regra" para guardar uma regra de referência. Salvar faz `POST` (ou `PUT`), o servidor materializa e escreve o primeiro histórico ("criada com N papéis"), e a página abre `#lista/<id>`. A "Nova lista" da lateral abre o painel; uma manual criada dali fica na Bolsa com o foco no "+ papel".

### Lista de listas (`#listas`)

`Tabela` (id `listas-todas`) com nome (abre a página), tipo, papéis, ligada (interruptor), última mudança, entradas e saídas nos últimos 7 dias, primeira linha da descrição e ações (Editar, Excluir, ▲▼). Desligadas ficam esmaecidas. Sem ordenação nem filtro ativos, dá para arrastar as linhas (desktop) ou usar ▲▼ para mudar a ordem de exibição, gravada em `posicao` de cada doc por `PUT /api/listas/ordem { ids }` (só os docs que mudaram). Essa ordem vale na lateral e no widget do Início; sem `posicao`, automáticas primeiro na ordem fixa e depois as manuais por criação.

### Rotas

- `GET /api/listas`: todas as listas na ordem de exibição, com `historico` só dos últimos 7 dias, `histN` (total) e `ultimaMudanca`.
- `GET /api/listas/<id>`: a lista inteira (recalcula a dinâmica antes, se o cálculo passou de 1 h).
- `POST /api/listas`: `{ nome, papeis?, descricao?, ativa?, regra?, fixos?, excluidos?, cor? }`, até 30 listas manuais e dinâmicas.
- `PUT /api/listas/<id>`: parcial (o que não vem fica como está). Na dinâmica os `papeis` do corpo são ignorados; mudar `regra`, `fixos` ou `excluidos` recalcula e registra. `regra: null` volta a lista a manual com os papéis de agora.
- `POST /api/listas/<id>/recalcular`, `PUT /api/listas/ordem`, `POST /api/listas/mover` (`{ de, para, papel, copiar }`, grava as duas listas num batch, com histórico nas duas) e `DELETE /api/listas/<id>`.
- Tudo grava no D1 e manda ao espelho por write-through; leitura da coleção pelo espelho.

## Minha carteira

Pessoal, para quem tem Investimentos liberado. Abre pelo menu da conta (Minha carteira, Minha meta, Importar extratos), sem aba na barra de seções: `#carteira`, `#carteira/proventos`, `#carteira/meta`, `#carteira/importar` e `#carteira/mais` (rola até os blocos de baixo). Roda no modo do Início: nenhuma seção fica assinada enquanto ela está aberta. Código em `src/carteira.js` (cálculo e rota), `src/cofre.js` (cifra) e no `public/index.html`.

**Importação.** A pessoa solta os .xlsx que a Área do Investidor da B3 exporta (Negociação, Movimentação, Proventos recebidos; vários de uma vez). A página carrega o SheetJS (`xlsx` 0.18.5 da cdnjs) só nessa tela, lê a primeira planilha, reconhece o tipo pelo cabeçalho, corta o "Produto" no código do papel (o nome da empresa não sai do navegador) e manda as linhas como arrays, junto com o SHA-256 do arquivo. Primeiro com `simular: true` (só contagem, para a prévia), depois de verdade. Arquivo de cabeçalho desconhecido é ignorado com aviso. O arquivo em si nunca vai ao servidor.

**O que é gravado.** Collection `carteira/<email>`, três docs:

- `extrato`: `neg` [data, C/V, papel, quantidade, preço, corretora, imp], `mov` [data, C/D, tipo normalizado, papel, quantidade, preço unitário ou null, corretora, imp], `prov` [data, papel, tipo, quantidade, valor por cota, líquido, corretora, imp]. `imp` é o id da importação que trouxe a linha.
- `importacoes`: `{ lista: [{ id, em, novos, arquivos: [{ tipo, hash, linhas, novos, repetidos, ignorados, de, ate }] }] }` (até 200; sem nome de arquivo).
- `meta`: `{ alvo, aporte, yield, reinvestir, atualizado }`.

Não entra: nome, CPF, conta, CNPJ, ISIN, a linha "Produto" inteira, a razão social da corretora (vira sigla por mapa: XP, Rico, Clear, Modal, Nu Invest...; desconhecida vira a primeira palavra em Title Case) nem totais em dinheiro (são calculados na hora). Tesouro Direto, CDB e outros códigos fora de `^[A-Z][A-Z0-9]{3}\d{1,2}F?$` ficam de fora e contam como ignorados.

**Cifra.** AES-GCM 256 com o secret `CARTEIRA_KEY` (base64 de 32 bytes, `openssl rand -base64 32`). O JSON é comprimido com gzip e cifrado; o campo `data` guarda `{ iv, dados, z: 1 }` em base64, IV aleatório de 12 bytes por documento; `atualizado` fica fora. A chave importada fica no isolate. Sem o secret, todas as rotas respondem 503 `carteira desligada` e a página mostra o aviso. Trocar a chave deixa o que já foi gravado ilegível.

**Espelho e limpeza.** `carteira/` entra nos prefixos pessoais do espelho, igual a favs, listas e prefs, e vai cifrada como está. Gravação no D1 e write-through; leitura do GET pelo espelho (D1 de reserva). Importar, desfazer e salvar a meta leem do D1, para não somar em cima de uma cópia atrasada. A limpeza da coleta não toca em `carteira/`. Excluir o convidado no admin apaga os três docs (D1 e espelho). Nenhuma rota de admin lê a carteira; o card Custos mostra `carteira/*` só somada (docs e bytes) e o card do espelho idem. Nada vai para log (o erro loga só nome e começo da mensagem) e nada vai para cache de borda: todas as respostas saem com `cache-control: private, no-store`.

**Rotas** (login, seção investimentos, corpo `application/json` nas gravações):

- `GET /api/carteira`: `{ vazia, posicoes, proventos, resumo, meta, importacoes, cotacoes }`, calculado no Worker a partir do extrato decifrado e de `meta/b3` e `meta/fii-resumo`. Fica 60 s na memória do isolate por e-mail (limpa a cada gravação no mesmo isolate).
- `POST /api/carteira/importar`: `{ arquivos: [{ nome, tipo: negociacao|movimentacao|proventos, hash, linhas }], simular? }`. Até 20 mil linhas e 40 arquivos por chamada, 8 MB de corpo; a página divide em lotes. Responde `{ novos, repetidos, ignorados, porArquivo }`.
- `GET` e `PUT /api/carteira/meta`: `{ alvo, aporte, yield (fração, ou null para usar o da carteira), reinvestir }`; o GET (e o `meta` do GET principal) traz a projeção.
- `DELETE /api/carteira/importacoes/<id>`: tira as linhas daquela importação e o registro dela.
- `DELETE /api/carteira`: apaga extrato, importações e meta. Na tela, pede para digitar APAGAR.

**Deduplicação.** Chave = todos os campos da linha menos o `imp`. É por multiconjunto: a linha que já está k vezes e vem m vezes no arquivo entra max(0, m − k) vezes. Reimportar o mesmo arquivo dá zero novos, e duas compras iguais no mesmo dia continuam sendo duas.

**Cálculo da posição.**

- Quantidade pela Movimentação, por papel e corretora, fracionário (F) somado no lote. Somam ou tiram pelo Crédito/Débito: liquidação, transferência (inclusive sem financeiro), compra, venda, bonificação, desdobro, grupamento, direito de subscrição, subscrição exercida, recibo, atualização, fração em ativos, retirada de custódia e vencimento. "Não exercido" zera o direito. Não mexem: rendimento, dividendo, JCP, amortização, reembolso, resgate, leilão de fração, cessão de direitos (solicitada e efetivada se anulam no extrato), pedido de subscrição e tudo com " - Transferido" ou " - Cancelado". Atualização num papel fora dos recibos consome o recibo da mesma raiz (o recibo virou cota). Empréstimo não tira da posição: a última linha de empréstimo dos últimos 60 dias marca as cotas emprestadas (nos extratos reais o empréstimo vem quase sempre como Crédito, não Débito). Tipo desconhecido vai para `resumo.avisos` com a contagem e também aparece na prévia. Papel sem Movimentação usa a Negociação.
- Preço médio pela Negociação (ou pela liquidação da Movimentação, quando o papel não tem Negociação): média ponderada das compras; venda baixa a quantidade sem mudar o PM e entra no resultado realizado; posição que zera recomeça o PM. Bonificação, desdobro e grupamento mudam a quantidade e mantêm o custo. A subscrição exercida entra como compra ao preço do exercício quando a atualização transforma o recibo em cota.
- Classe: subscrição (final 1, 2, 9, 10, 12 a 15), ETF (em `etfs` do b3), FII (em `fiis` do b3 ou no informe da CVM), ação (em `acoes` do b3, inclusive units, ou final 3 a 8), BDR (final 31 a 39), outro.
- Proventos: do extrato de proventos; os períodos que nenhum arquivo de proventos cobriu (pelas datas de cada arquivo importado) são completados pelos rendimentos, dividendos, JCP e amortizações da Movimentação. "12 meses" são os 12 meses fechados antes do atual. Yield sobre o custo por papel e da carteira.
- Resumo: patrimônio (quantidade × cotação; sem cotação usa o PM e marca `semCotacao`), custo, resultado, divisão por classe (empréstimo à parte), por segmento de FII, por corretora, renda por classe e segmento, aportes mês a mês, encerradas (resultado realizado + proventos), movimentos recentes, a receber (FII da carteira sem pagamento no mês: último rendimento do `meta/fii-resumo` × quantidade, data a confirmar, descartado quando passa de 5% da cota), agenda e alertas (rendimento pago menor que o anterior nos últimos 45 dias, direito de subscrição em carteira com "prazo a confirmar", papel acima de 20% da carteira).
- Rentabilidade por cotas (TWR) mês a mês em 12 meses, no ano e desde o início. Os meses passados usam o preço da última negociação da pessoa em cada papel; o mês atual usa a cotação. A comparação com IFIX, CDI e Ibovespa fica "em breve": o Lookout não guarda série histórica desses índices.
- IR (só conferência): vendas em ações no mês, lucro em FII no mês, JCP no ano e prejuízo acumulado em ações (e FIIs), sem day trade nem custos.

**Meta.** Cada mês: renda = P × yield / 12; depois P += aporte (+ renda, se reinvestir). P inicial = renda média de 12 meses × 12 / yield (o patrimônio que, a esse yield, paga a renda de hoje); sem proventos, o custo. Mostra a data no ritmo atual, com o yield 2 pontos menor, o aporte para chegar em 10 anos (busca binária), marcos de R$ 500, 1.000, 2.500 e a meta, a trajetória (realizado: média móvel de 12 meses; projetado até a meta, limite de 40 anos) e o mês contra o plano (compras menos vendas do mês contra aporte planejado mais os proventos do mês, quando reinvestir). Abaixo dos marcos, o bloco "Onde o aporte rende mais, pelo seu filtro": os 4 papéis que passam hoje no filtro padrão do Radar com a maior renda mensal para o aporte da meta (aporte × último rendimento ÷ preço nos FIIs; média mensal dos dividendos de 12 meses nas ações), link "Abrir o radar" e o rodapé "Conta aritmética, não recomendação."

**Widgets no Início.** `carteira-meta` (tamanho 2), `carteira-simulacoes`, `carteira-patrimonio`, `carteira-proventos-mes`, `carteira-pagamentos`, `carteira-agenda`, `carteira-rentabilidade` e `carteira-alertas`, todos `pessoal: true` no catálogo de `src/painel.js`, fora do padrão. Leem `/api/carteira` uma vez só (a mesma leitura das telas, 1 min na memória da página), levam a marca "seu" e só aparecem para quem importou extratos. No Personalizar ficam no grupo "Minha carteira". Cada bloco da carteira com widget equivalente tem o alfinete, que liga e desliga o widget em `/api/prefs/painel` (entra no topo da grade).

**Limites.** 20 mil linhas e 40 arquivos por chamada, 15 MB por arquivo na página, doc cifrado até 1,8 MB (um extrato de seis anos dá uns 250 KB de JSON, bem menos depois do gzip), 200 importações no histórico.

**Testes.** `npm test` roda `test/carteira.test.mjs` (linhas sintéticas em `test/fixtures-carteira.mjs`), `test/cofre.test.mjs` e `test/radar.test.mjs` (filtro, avisos, No mês, Na meta, filtros salvos e templates da Leitura, com os FIIs inventados de `test/fixtures-radar.mjs`).

## Simulador de reinvestimento

Aba **Simulações** da Minha carteira (`#carteira/simulacoes`, e `#carteira/simulacoes/<id>` para uma simulação), ao lado de Visão geral, Proventos e Meta. A pessoa parte da carteira de hoje e pergunta: reinvestindo os proventos (e aportando X por mês) até mês/ano Y, quanto chega de renda mensal e de patrimônio? A conta é feita no Worker, na criação, e fica guardada com a memória de cálculo. Depois disso o Lookout só guarda números do que aconteceu; a comparação sai quando a pessoa clica Analisar. Nada de alerta, nada automático além de guardar os números, sem IA ("Parecer por IA: desligado nesta versão"). O simulador só lê `calcular` e a mesma conta da Meta (`serieProjetada`); o cálculo da carteira não mudou.

**Docs** (em `carteira/<email>`, cifrados com `CARTEIRA_KEY` como os outros, pelo mesmo `lerDocs`/`gravarDocs`):

- `simulacoes`: `{ v: 1, lista: [{ id, nome, criado, atualizado, cfg: { ate, aporte, reinvestir, yield }, memoria }] }`. Até 12 por pessoa, nome até 60 caracteres (vazio vira "Até mm/aaaa"), `ate` do mês que vem a 40 anos, `aporte` de 0 a 1.000.000, `yield` de 0,1% a 30% ao ano (fração; `null` = o da carteira na criação). Quando a última é excluída, o doc sai junto.
- `memoria` (congelada, nunca recalculada): `mesInicio`, `y`, `yCarteira` (proventos 12m ÷ custo na criação), `rendaHoje` (média de 12 meses), `p0`, `custo`, `patrimonio` (com a cotação do dia), `noMes` (compras menos vendas e proventos do mês de início até a criação), `posicoes` `[{ papel, classe, q, pm }]` (sem corretora) e `previsto` `[[mes, renda, patrimonio]]`, do mês de início ao `ate`.
- `mensal`: `{ v: 1, meses: { "AAAA-MM": { fechadoEm, proventos, compras, vendas, patrimonio, custo, prov12, posicoes: [{ papel, q }] } } }`, um por mês, independente de simulação, até 480 meses.

**Cálculo na criação.** `y = cfg.yield ?? prov12 / custo`; `p0 = rendaHoje > 0 ? rendaHoje × 12 / y : custo` (igual à Meta); renda de cada mês por `serieProjetada({ aporte, y, reinvestir, p0, meses })`. O patrimônio previsto é o do fim de cada mês, em valor de mercado: o patrimônio da criação mais o que a conta soma (aporte e, reinvestindo, a renda do mês). Assim dá para pôr lado a lado com o patrimônio real do fechamento. Sem proventos em 12 meses e sem yield escrito, a criação é recusada pedindo o yield.

**Fechamento mensal.** Os números do mês M são gravados no mês seguinte, com `calcular` daquele dia: proventos do mês (`resumo.meses`), compras e vendas (`fluxoMes`), patrimônio, custo e `prov12` de hoje e as quantidades de hoje. O patrimônio usa a cotação do dia do fechamento (`meta/b3`), que é a que existe; por isso o fechamento feito no dia 20 já tem o que mudou até o dia 20. Dois caminhos, os dois só para quem tem simulação:

- no `GET /api/carteira` (montar): se o mês anterior não está em `mensal.meses`, confere no D1 (a leitura veio do espelho) e grava;
- no cron (`cronSimulador`, chamado a cada minuto pelo `scheduled`): dia 1, das 6h às 6h59 em Brasília (UTC−3), percorre `SELECT collection FROM docs WHERE id = 'simulacoes' AND collection >= 'carteira/' AND collection < 'carteira0'` em ordem, 20 pessoas por minuto. A marca `_sistema/simulador-fechamento` guarda `{ mes, feitos, fim, fechadas, erros }` (quantas já passaram, sem e-mail) e roda uma vez por mês. O cron só lê e grava `carteira/<email>` e lê `meta/b3` e `meta/fii-resumo`; não toca em favs, listas, prefs nem leitura.

**Análise** (sob demanda, sem gravar). Para cada mês do `previsto` que já tem fechamento: `{ mes, previsto: { renda, patrimonio }, real: { proventos, aportes: compras − vendas, patrimonio }, desvio: { renda, pct } }`. O desvio acumulado de renda se decompõe no nível da carteira:

1. **rendimento**: (yield real 12m − y) × patrimônio previsto ÷ 12, somado nos meses. O yield real é `prov12 ÷ custo` do fechamento, levado à escala da conta (y × yield real ÷ `yCarteira`), para um yield escrito à mão não virar desvio logo no primeiro mês;
2. **capital**: (patrimônio real − patrimônio previsto) × y ÷ 12, somado. Dentro dele, **aportes** (compras menos vendas acumuladas contra o que o plano pedia, acumulado, × y ÷ 12) e **reinvestimento e cotação** (o resto);
3. **resíduo**: total − (1 + 2), o vaivém de proventos entre um mês e outro.

"O que o plano pedia" é o aporte e, quando a simulação reinveste, os proventos do mês: a mesma conta do "Este mês contra o plano" da Meta. Sem isso, quem reinveste os proventos apareceria com aporte acima do plano. `tendencia`: `acima`, `na linha` (|pct| ≤ 3) ou `abaixo`, pelo último mês fechado. `parecer`: 2 a 5 frases por template, só com números da conta (quanto ficou acima ou abaixo, de onde veio a maior parte, o que compensou, o último mês), sem recomendação.

**Rotas** (em `rotaCarteira`, login, seção investimentos, corpo `application/json` nos POST, até 2 KB, `private, no-store`; sem `CARTEIRA_KEY`, 503):

- `GET /api/carteira/simulacoes`: `{ simulacoes: [{ id, nome, criado, cfg, mesInicio, ate, rendaFinal, patrimonioFinal, mesesFechados, ultimoDesvioPct, tendencia }], max }`. O `GET /api/carteira` traz a mesma lista em `simulacoes`, para a aba e o widget lerem uma vez só.
- `POST /api/carteira/simulacoes` `{ nome, ate, aporte, reinvestir, yield }`: devolve a simulação inteira. Carteira vazia: 409 "Importe os extratos antes de simular.". 13ª, `ate` fora da faixa e números fora: 400.
- `GET /api/carteira/simulacoes/<id>`: a simulação inteira e `mensal` só com os meses dela.
- `DELETE /api/carteira/simulacoes/<id>`.
- `POST /api/carteira/simulacoes/<id>/analisar` (corpo `{}`): a análise acima.

Ids `[a-z0-9]{4,20}`. Toda gravação limpa o cache de 60 s da carteira. Apagar a carteira (APAGAR) leva `simulacoes` e `mensal` junto.

**Tela.** Lista em cards (nome, "até mês/ano", renda prevista no fim, patrimônio no fim, meses fechados e o último desvio numa pill verde, cinza ou vermelha), com Ver, Analisar e Excluir (a confirmação aparece no próprio card). Com duas ou mais, a tabela "Lado a lado". "Nova simulação" abre o formulário em card: nome, até (`Campo` mesano), aporte (moeda), reinvestir (interruptor) e yield (percentual; vazio usa o da carteira, mostrado na ajuda). Com 12, o botão some e fica o aviso. Ver: números do fim, gráfico SVG inline com a renda prevista em linha e a recebida em pontos, Analisar (parecer e as quatro barras: rendimento, aportes, reinvestimento e cotação, resíduo), tabela mês a mês pelo `public/tabela.js` (id `carteira-simulacao`) e a memória de cálculo recolhível (y, p0, aporte, a fórmula e a foto da carteira). Sem mês fechado: "A primeira comparação sai depois do fechamento de <mês>." "← Todas as simulações", o Voltar do navegador e o logotipo funcionam dentro da aba.

**Widget** `carteira-simulacoes`, "Minhas simulações" (grupo Minha carteira, 1x1 e 2x1, pessoal, marca "seu"): as 3 mais recentes com nome, "até" e o último desvio na pill (2x1 acrescenta a renda no fim); o nome abre a simulação e o rodapé, a aba.

**Testes.** `test/simulador.test.mjs`: criação e série prevista, limites (13ª, `ate` no passado, nome, yield, aporte, corpo, carteira vazia, 503), fechamento no GET (grava uma vez, não regrava), cron (fora do horário, uma vez por mês, só quem tem simulação, marca sem e-mail), decomposição fechando num caso à mão e o parecer sem palavra proibida em vários cenários.

**Para depois.** Decomposição por papel (rendimento por cota e cotação no reinvestimento de cada um, mudança de composição), parecer por IA, e o fechamento reconstruir meses que ficaram sem número (hoje um mês sem fechamento fica de fora da comparação; proventos e compras daria para tirar do extrato, o patrimônio não).

## Radar de dividendos

Terceira visão de Investimentos, `#investimentos/radar` (Bolsa | EUA | Radar | Notícias), com o letreiro fixo. Filtros na coluna esquerda (no celular, botão "Filtros" que abre uma folha de baixo, como o Personalizar); no centro, quem passa no filtro hoje e, embaixo, os cards da Leitura do dia e da carteira contra o filtro. Sem trilho direito: a tabela usa a largura dele.

**Onde está o código.** Critérios, avisos, ordenação, "Na meta" e a validação dos filtros salvos ficam em `public/radar-filtro.js`, um script sem import nem export: a página carrega com `<script src="/radar-filtro.js">` (`window.RadarFiltro`) e o Worker e os testes importam pelo efeito (`import "../public/radar-filtro.js"`, `globalThis.RadarFiltro`). Assim a tela e a Leitura do dia usam a mesma regra. O cálculo roda na página sobre o que a Bolsa já carrega: `meta/b3`, `meta/fii-resumo`, `meta/eua`, `/api/carteira` e `/api/radar/fundamentos`.

**Dados.** Nenhuma fonte nova. Para os FIIs, `resumoFii` (src/cvm.js) passou a gravar no `meta/fii-resumo` os cotistas do informe anterior (`ca`), o rendimento anterior (`ra`), quantos dos últimos 12 meses pagaram (`pg`) e o maior e a mediana desses 12 (`rmx`, `rmd`). Até o primeiro cron da CVM depois do deploy esses campos faltam: "No mês" fica "–" e a regularidade usa os meses com informe. Para ações da B3 e dos EUA, P/L, P/VP, DY, dividendo de 12 meses e variação em 1 ano vêm das fichas já guardadas em `hist` (`GET /api/radar/fundamentos`, compacto, 30 s na memória e 3 min na borda). Papel sem ficha aparece com "–" e não passa em critério que dependa desses números; a tela diz quantos têm ficha. "Anos seguidos pagando" (brapi) e "anos seguidos aumentando" (Finnhub) ficaram de fora: as fichas não guardam o histórico de dividendos por ano.

**Critérios por classe** (vazio = sem limite):

- FIIs: P/VP até (padrão 1,00; P/VP ≤ 0 não passa), DY 12m mínimo (10%), liquidez diária mínima (R$ 1 mi = volume × preço do `meta/b3`), regularidade (12 de 12 meses pagando, 10 ou mais, qualquer), "mais comprados por" (entrada de cotistas no mês ou liquidez), segmento e mandato (vários; mandato só quando o informe trouxer), "esconder o que já tenho" e "só com rendimento estável ou subindo" (último × 12 de pelo menos 90% do DY 12m).
- Ações BR: DY 12m mínimo, P/L até (P/L negativo não passa), P/VP até, liquidez mínima, setor (o da brapi), ordenar por DY ou liquidez, esconder o que já tenho.
- EUA: dividend yield mínimo, P/L até, setor, ordenar por DY ou liquidez.

**Colunas.** FIIs: Papel e segmento, Preço, P/VP, DY 12m, Último × 12 (último rendimento × 12 ÷ preço), Cotistas, No mês (cotistas do último informe menos os do anterior), Liq./dia, Na meta (aporte × último rendimento ÷ preço, por mês) e Avisos. Ações e EUA: Preço, P/L, P/VP, DY, Dividendo 12m, Liq./dia, Na meta (aporte × dividendo de 12 meses ÷ 12 ÷ preço) e Avisos. Clique na coluna ordena; clique no papel abre a ficha. Simulador "aporte de R$ X" no topo da tabela (padrão 1.000, salvo junto com o filtro). Rodapé com a explicação das colunas e "Nada aqui é recomendação: o filtro é seu, a escolha também."

**Avisos (chips).** `rendimento caindo` (último × 12 abaixo de 90% do DY 12m), `perdendo cotistas` (No mês negativo), `P/VP fora da curva` (abaixo de 0,5 ou acima de 2,5: conferir desdobro ou VP), `DY puxado por queda` (preço caiu mais de 15% em 12 meses; só aparece quando há ficha do papel com a variação de 1 ano), `rendimento extraordinário` (um dos 12 meses pagou mais que o dobro da mediana), `passaria de 20%` (o aporte simulado levaria o papel a mais de 20% da carteira) e `tenho N` (quantidade e peso na carteira, em verde). Os dois últimos só para quem tem carteira.

**Sua carteira contra o filtro.** Só com carteira: dos papéis da classe do filtro que a pessoa tem, quantos passam, e os que não passam com o primeiro critério que barrou ("P/VP 1,04", "liquidez R$ 600 mil", "pagou 10 de 12 meses"). Quantos papéis de outras classes ficam fora e a concentração (maior posição, maior classe e maior segmento de FII).

**Filtros salvos.** `GET` e `PUT /api/prefs/radar`, doc `prefs/<email>`, id `radar`: `{ filtros: [{ id, nome, classe, ...critérios, aporte }], padrao, atualizado }`, mesmo caminho do painel (D1 e write-through no espelho). Até 10 filtros, nome de 1 a 30 caracteres sem repetir, números dentro de faixas (P/VP 0,05 a 10, DY 0 a 60, P/L 0,1 a 500, liquidez até R$ 100 bi, aporte até R$ 10 mi), listas de até 40 itens; campo desconhecido é descartado. Quem nunca salvou recebe o de fábrica, "FIIs P/VP < 1 e DY > 10%" (P/VP até 1, DY 10%, R$ 1 mi, 12 de 12, por cotistas), com `salvo: false`. O filtro padrão é o do Início, da Meta e da Leitura do dia; o da tela fica no navegador (`radar-rd-atual`). "Novo filtro…" abre um painel com nome, classe e de onde começar (os critérios de agora ou os de partida da classe) e já grava.

## Leitura do dia

Até 8 fatos curtos por pessoa, montados por templates no Worker (`src/leitura.js`), sem modelo de IA. Se um dia quiser com IA, é outra tarefa agendada.

**Quem e quando.** Quem tem carteira (`carteira/<email>`, doc `extrato`) ou filtro salvo (`prefs/<email>`, doc `radar`), com Investimentos liberado. Cron às 10h40 UTC (7h40 em São Paulo, fixo em UTC), cinco pessoas por minuto até 10h49, depois do informe da CVM das 10h17. Quem já tem a do dia é pulado.

**O que entra, nesta ordem:** rendimento novo no informe da CVM dos FIIs da carteira ("GALO11: o informe de outubro na CVM indica R$ 0,083 por cota, igual ao mês anterior."; o rendimento é o estimado DY × VP, e a CVM não dá data de pagamento), quem saiu do filtro com os critérios que barraram ("HOBS11 saiu do seu filtro: P/VP foi a 1,06, acima de 1,00."), quem entrou com o que mudou ("Entrou no filtro hoje: VSLX11 (P/VP foi a 0,98)."), avisos da carteira que mudaram de estado ("VGHX11, da sua carteira, passou a ter o aviso "rendimento caindo"."), rendimentos novos dos que passam no filtro e notícias de Investimentos das últimas 24 h que citam papéis da carteira ou do filtro (título e fonte). Primeiro dia: só a contagem de quem passa. Filtro padrão trocado: entradas e saídas recomeçam. Sem mudança: uma frase dizendo isso. Fecha sempre com "Só fatos. Nada aqui é recomendação."

**Guardado.** Collection `leitura/<email>`, cifrada com `CARTEIRA_KEY` (src/cofre.js): um doc por dia (`AAAA-MM-DD`) e `estado` `{ dia, base, atual }`, o retrato (quem passa, o critério que barrou cada um, o último informe de cada FII e os avisos da carteira). Gerar de novo no mesmo dia compara com a mesma `base`. A limpeza da coleta apaga, por lista de ids, os dias com mais de 30 dias. `leitura/` entra nos prefixos pessoais do espelho; custos e espelho mostram `leitura/*` só somada; excluir o convidado apaga a collection.

**Rotas.** `GET /api/leitura?dia=AAAA-MM-DD` (padrão hoje em São Paulo; só a própria pessoa; `private, no-store`) e `POST /api/leitura/gerar` (botão "Gerar agora" na visão Radar, no máximo uma vez a cada 10 min pela coluna `atualizado` do doc do dia: 429 com `aguarde` em segundos). Sem `CARTEIRA_KEY`, 503.

**Widgets.** `radar-meu` (os 5 primeiros do filtro padrão, com `tenho` e `novo hoje`, que vem do `novos` da leitura de hoje), `leitura-dia` (as 3 primeiras frases) e `carteira-contra-filtro` (quantos passam, quem saiu e entrou hoje e a maior posição), todos pessoais, com a marca "seu", no grupo "Minha carteira" do Personalizar. Os dois primeiros só aparecem para quem tem carteira ou filtro salvo; o terceiro, só com carteira. O `carteira-meta` ganhou o link "Simular".

## Campos

Todos os campos de número, moeda, percentual, data, mês/ano e papel da página passam por `public/campo.js` (script clássico, `window.Campo`; os testes em Node importam pelo efeito). `Campo.ligar(input, { tipo, casas, min, max, moeda, obrigatorio })` e `Campo.valor(input)`.

| Tipo | Fechado | Aceita ao digitar ou colar | Valor cru |
|---|---|---|---|
| `moeda` | `R$ 2.000,00` (`US$` com `moeda: "USD"`) | `2000`, `2.000`, `2000,5`, `2k`, `1,5m`, `1,5 mi`, `2 mil`, `R$ 2.000,00` | número |
| `percentual` | `11,9 %` (casas, padrão 1) | `11.9`, `11,9`, `11,9%` | número em pontos percentuais (11,9, não 0,119) |
| `numero` | milhar com ponto e casas fixas (P/VP 2, P/L e liquidez em R$ mi 1) | os mesmos da moeda | número |
| `inteiro` | `1.234` | só inteiros | número |
| `data` | `dd/mm/aaaa`, com máscara ao digitar; no celular com tela de toque vira `type="date"` nativo | `04112026`, `4/11/26`, `2026-11-04`; confere o dia de verdade (29/02 só em ano bissexto) | `AAAA-MM-DD` |
| `mesano` | `mm/aaaa` | `032027`, `3/27`, `2027-03` | `AAAA-MM` |
| `papel` | caixa alta, só letras e números, até 6, mais `.X` para classe dos EUA (`BRK.B`) | qualquer coisa: o que não serve sai enquanto digita | texto |

Regras comuns: formata ao abrir e ao sair do campo; ao focar mostra o valor limpo (sem `R$`, sem `%`, sem ponto de milhar, vírgula decimal mantida). Enter confirma. ↑ e ↓ somam ou tiram 1 (Shift: 10) nos numéricos. Valor que não serve deixa `aria-invalid` e uma mensagem curta embaixo ("Use um número", "Data inválida"), sem travar a digitação; a mensagem sai quando o texto fica válido. `min` e `max` ajustam ao limite com aviso ("O máximo é 100,0 %"). Quando a página redesenha o bloco enquanto a pessoa digita, o campo novo volta com o texto dela (e com a mensagem, se estava inválido). Nada de `R$` ou `%` vai para o servidor: quem lê usa `Campo.valor`.

Onde está: Meta (renda e aporte em moeda, yield em percentual de 0 a 100), Radar e Nova lista por regra (`camposCriterios`: P/VP e P/L em número, DY em percentual, liquidez em R$ mi), aporte simulado do Radar (moeda, US$ nos EUA), filtros de coluna das tabelas (`public/tabela.js`: coluna com unidade `%` vira percentual, `R$` moeda, o resto número; as de data, data), "+ papel" das Minhas listas e fixos e excluídos da lista por regra (papel, com o autocompletar de antes). Texto inválido nos critérios do Radar não mexe no filtro: fica o último valor que valia. Busca, Importar, Meus esportes e o admin não mudam.

Formatação fora de campo: `window.Fmt` (`num`, `moeda`, `pct`, `data`, `mes`) no mesmo arquivo; o `fmtNum` da página é o `Fmt.num`.

## Tabelas

Toda tabela de dados da página usa o mesmo helper, `public/tabela.js` (script clássico, `window.Tabela`; os testes e o Worker importam pelo efeito e leem `globalThis.Tabela`). `Tabela.criar({ id, colunas, linhas, total, padrao, celula, aoMudar, ... })` monta barra, tabela e rodapé. Tabelas e ids: Cotações da Bolsa e dos EUA (`cot-acoes`, `cot-fiis`, `cot-fiinfra`, `cot-fiagro`, `cot-etfs`, `cot-bdrs`, `cot-usacoes`, `cot-usetfs`), "Passam no filtro hoje" do Radar (`radar-fiis`, `radar-acoes`, `radar-eua`), Posições, Encerradas e Pagamentos da carteira (`carteira-posicoes`, `carteira-encerradas`, `carteira-proventos`). Os rankings do Pregão (cards de 5) e os cards curtos da carteira ficam como eram.

- **Ordenação:** clique no cabeçalho ordena por uma coluna (texto começa de A a Z, número do maior para o menor; o segundo clique inverte, o terceiro limpa). Shift+clique junta a coluna como próximo critério; o cabeçalho mostra a seta e a prioridade (1, 2, 3). O botão "Ordenar" (o caminho no celular) abre um painel com os critérios na ordem, setas para reordenar, menor ou maior primeiro, remover e acrescentar. Até 5 critérios. A ordenação é estável; número como número, texto com `localeCompare('pt-BR')` sem diferenciar acento nem caixa, data como texto ISO, vazio sempre no fim.
- **Sem pular:** ordenar, filtrar e trocar de página redesenham só cabeçalho, corpo e rodapé; a caixa de rolagem fica. As colunas não encolhem enquanto a tabela está na tela (largura mínima guardada), então a rolagem horizontal fica onde estava; a vertical também é conferida. Quando a seção inteira é refeita (dados novos), a rolagem horizontal da tabela volta pela memória da página.
- **Filtro por coluna:** funil em cada cabeçalho. Texto (papel, nome, segmento, mandato, corretora, tipo...) abre "contém…" e até 12 valores que existem, os mais frequentes primeiro, para marcar; marcados mandam, sem nenhum vale o texto. Número abre mínimo e máximo (vírgula ou ponto). Data abre de e até. Os ativos viram chips acima da tabela ("P/VP ≤ 1", "Segmento: Logística, Papel (CRI)"), cada um com ×, e "Limpar filtros". Somam com a busca e os filtros que já existiam (coluna esquerda da Bolsa, classe e busca da carteira). A contagem "N de M" fica sempre à vista.
- **Paginação:** 25 por página (25, 50 ou 100 no rodapé), "‹ 1 2 3 … ›" com elipse e "N–M de T". Trocar de página mantém ordenação e filtros; mudar filtro, ordenação ou busca volta para a página 1. No celular os botões têm 44 px. "Ver todos" e "Carregar mais" saíram.
- **Estado salvo:** por tabela em `localStorage` (`radar-tabela-<id>`: ordenação, filtros, página, por página), que pinta primeiro, e em `/api/prefs/tabelas`, que manda: na primeira leitura da abertura, tabela que a pessoa ainda não mexeu troca para o estado da conta. `GET` devolve `{ tabelas }`; `PUT { tabelas: { <id>: estado | null } }` manda só as que mudaram (1,2 s depois da última mudança, e no `pagehide`) e o servidor junta com o salvo, cada uma com `em`, guardando as 40 mais recentes. Doc `prefs/<email>`, id `tabelas`, D1 e write-through no espelho. Conferência (`validarEstado`, a mesma na página e no Worker, regras em `src/prefs.js`): id `^[a-z0-9-]{1,80}$`, coluna `^[A-Za-z0-9_]{1,24}$`, até 5 critérios, até 20 filtros, até 12 valores de até 80 caracteres, "contém" até 60, datas AAAA-MM-DD, página 1 a 10000, por página 25, 50 ou 100.

## Menu da conta

Avatar no cabeçalho (página e `/admin`): nome e e-mail, Minha carteira, Minha meta, Importar extratos e Minhas listas (com Investimentos), Meus esportes (com Esportes), Aparência, Administração (só o Admin), **Trocar de conta** e Sair. "Trocar de conta" (ajuda: "Sai e abre o login para escolher outra conta do Google") vai para `/cdn-cgi/access/logout` e antes grava `radar-trocar=1` no `sessionStorage`. O Access não volta sozinho para o login depois do logout; ao abrir o site de novo ele pede o login e aí dá para escolher a outra conta. O `radar-trocar` fica só como marca, sem uso por enquanto.

## Colunas recolhíveis

A partir de 900 px, a coluna esquerda e a direita têm um botão no topo (chevron, `aria-label="Recolher coluna"`, e "Abrir coluna" quando recolhida). Recolhida, a coluna vira uma faixa de 36 px só com o botão e o centro passa a `minmax(0, 1fr)`, ocupando o espaço até o limite de 1360 px da página. A troca do `grid-template-columns` tem 180 ms, nada com `prefers-reduced-motion`. Vale para Tech, Negócios, Investimentos (Bolsa, EUA, Radar, Notícias), Notícias e Esportes; Início e carteira não têm colunas. O letreiro e a barra de abas não mudam. A coluna direita só existe a partir de 1200 px (e não existe no Radar), então entre 900 e 1199 px só a esquerda recolhe. Estado por lado em `localStorage` (`radar-col-esq`, `radar-col-dir`, "1" recolhida) e em `/api/prefs/layout` (`{ esq, dir }`, doc `prefs/<email>`, id `layout`; o `GET` responde `salvo: false` para quem nunca mexeu e aí vale o `localStorage`).

## API

`/api/me` (com `widgets`, os ids que a pessoa pode pôr no Início), `/api/q` (lista de uma collection), `/api/doc` (um documento), `/api/favs`, `/api/listas` com `/api/listas/<id>`, `/recalcular`, `/ordem` e `/mover` (veja "Minhas listas"), `/api/prefs/painel`, `/api/prefs/tabelas` e `/api/prefs/layout` (veja "Tabelas" e "Colunas recolhíveis"), `/api/painel/hoje`, `/api/papel`, `/api/carteira` (veja "Minha carteira"), `/api/prefs/radar`, `/api/prefs/esportes` (veja "Esportes"), `/api/radar/fundamentos`, `/api/leitura` e `POST /api/leitura/gerar` (veja "Radar de dividendos" e "Leitura do dia"), `POST /api/mercado/atualizar`. `/api/me` traz também `foruns`, as seções liberadas que têm subreddit. A página só lê as collections de itens, destaques, `foruns-*` e `meta` (com `meta/esportes-*`), e a API confere a seção de cada pessoa antes de responder. As leituras de lista ficam 30 s na memória e 3 min no cache de borda.

Admin (só `ADMIN_EMAIL`), na página `/admin`: convidados (`/api/admin/usuarios`), grupos e seções (`/api/admin/grupos`, `/api/admin/membros/<email>`), rendimento das fontes nos últimos 10 dias (`/api/admin/fontes`), custos (`/api/admin/custos`), sonda de feeds (`/api/admin/sonda`), espelho em São Paulo (`/api/admin/espelho`) e recarga manual da CVM (`POST /api/admin/cvm`). Sem grupos criados, todo convidado vê tudo.

## Segredos

Ficam no painel da Cloudflare (Workers & Pages → `lookout` → Variables and Secrets), nunca no repositório: `ADMIN_EMAIL`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `BRAPI_TOKEN`, `FINNHUB_TOKEN` (cotações e ficha dos EUA), `CF_API_TOKEN` e `CF_ACCOUNT_ID` (estes dois para o card de custos) e `CARTEIRA_KEY` (cifra da Minha carteira). O `wrangler.jsonc` usa `keep_vars: true`, então deploy não apaga nada. Para rodar local, `DEV_EMAIL` vai no `.dev.vars`, que o git ignora.

## Regras para agentes

- Nunca `DROP`.
- `UPDATE` e `DELETE` só com lista explícita de ids.
- Coletores e curadoria não tocam em `favs/`, `listas/`, `prefs/` nem `carteira/`. As listas automáticas são gravadas pela rota da carteira da própria pessoa, não por coletor. Ninguém abre `carteira/` fora da rota da própria pessoa. `hist` só é gravado pela rota `/api/papel` e pelo cron dele.
- O prompt de cada tarefa só roda os comandos que ele mesmo lista.

## Custos

Workers Paid desde 01/11: US$ 5 por mês mais o excedente. O card de custos do admin mostra o consumo contra os limites do mês. O que vai de tokens está nas tarefas de curadoria, não no Worker.

## Tarefas agendadas de curadoria

| Aba | Id |
|---|---|
| Notícias e Política | `trig_01SQNHJZG1dk3gbBx7gepRS6` |
| Negócios (7h41, 13h41, 19h41) | `trig_017VAye8tNdrAfRmR2FkDQ9a` |
| Investimentos | `trig_01SNVaC1t9GAS88XAgcALjQc` |
| Esportes | `trig_01KPpFyECoH1eGqHKSzhg3Cq` |
| Tech, teste (7h22, 13h22, 19h22, grava em `sombra-*`) | `trig_01TE7BR8k8VBN8V93YS3eCDh` |
| Tech, atual (grava em `items`) | `trig_016nWnY96rLwEWBC4ubCz8wF` |

O que está por vir fica no `ROADMAP.md`.
