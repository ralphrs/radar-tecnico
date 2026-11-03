# Lookout: estado atual (03/11/2026)

Feed pessoal de notícias do Ralph, aberto só para convidados. Um Worker da Cloudflare (`news`, código em `src/`) serve a página, a API e o admin, e guarda tudo num banco D1 (`lookout`). As leituras da página saem de um espelho do D1 em São Paulo (veja "Banco e espelho"). O login é pelo Cloudflare Access; o Worker confere o token em cada requisição e, sem configuração, não deixa ninguém entrar.

Abas: Início, Tech, Negócios, Investimentos, Notícias e Política, Esportes. O site abre no Início (painel de widgets, veja abaixo). Investimentos tem três visões: Bolsa (a principal), EUA e Notícias.

## Como as notícias entram

1. O cron do Worker roda a cada minuto e lê 6 feeds por vez (`src/coleta.js`, lista em `src/feeds.js`). Cada feed é lido no máximo a cada 90 min. Os subreddits (tipo `reddit`) têm fila à parte: um por minuto, cada um a cada 120 min (detalhes em `docs/coleta.md`). O que já existe (mesmo id ou mesma URL) é ignorado; o resto vai para a tabela `candidatos` com status `novo`.
2. Tarefas agendadas do Claude fazem a curadoria: reservam um lote, escolhem, escrevem título e resumo, gravam em `items-*` e `destaques-*` e marcam cada candidato como `publicado` ou `descartado` com motivo. Podem fazer algumas buscas na web para o que não tem feed. Sonnet nas abas novas; o Tech atual ainda é Opus com busca.
3. Só o que está nas collections de itens aparece no site. No minuto 7 de cada hora o Worker apaga o que venceu (regras em `docs/coleta.md`).

Detalhes da coleta e da limpeza: `docs/coleta.md`. Comparação das duas curadorias de Tech: `docs/relatorios/tech-sombra-2026-11-01.md`.

## O que roda sem IA

| O quê | Fonte | Quando |
|---|---|---|
| Moedas e cripto (`meta/mercado`) | AwesomeAPI; se recusar, PTAX do BC, CoinGecko e por último Mercado Bitcoin | a cada 30 min |
| Selic, CDI, IPCA 12m (`meta/mercado`) | Banco Central, SGS | duas vezes por dia |
| Ibovespa (`meta/mercado`) | brapi, só com o secret `BRAPI_TOKEN` | a cada 30 min no pregão |
| Tabelas de ações, FIIs e ETFs (`meta/b3`) | brapi, rota de lista, sem token | a cada 30 min no pregão e às 21h35 UTC |
| Dados dos FIIs (`meta/fii`) | informe mensal da CVM (dados abertos) | 10h12 e 10h17 UTC, em duas etapas |

O botão "Atualizar agora" do painel consulta no máximo uma vez a cada 5 min, para todo mundo.

## Banco

Tabela `docs(collection, id, data)` para quase tudo:

- Itens: `items` (Tech), `items-negocios`, `items-investimentos`, `items-politica`, `items-esportes`. Destaques no mesmo padrão (`destaques`, `destaques-negocios`...).
- Teste do Tech: `sombra-items`, `sombra-destaques`, fora do site.
- Por pessoa: `favs/<email>`, `listas/<email>`, `prefs/<email>` (o painel do Início, doc `painel`, e doc `radar`, os filtros do Radar), `carteira/<email>` (Minha carteira, cifrada) e `leitura/<email>` (Leitura do dia, cifrada).
- `meta`: `status`, `status-negocios`, `status-investimentos`, `status-politica`, `status-esportes`, `status-sombra` (última rodada de cada curadoria), `mercado`, `b3`, `fii`, `fii-resumo`, `fii-cvm-ant`.
- `hist`: ficha de cada papel aberto (`US:NVDA`, `BR:PETR4`, `BR:NVDC34`), veja "Ficha do papel".
- `_sistema`: `seed`, `limpeza`, `b3-erro`, `cvm-etapa`, `cvm-erro`, `sonda-feeds`, `papel-contagem`, `sonda-brapi-quote`.

Outras tabelas: `candidatos`, `feeds_estado` (saúde de cada feed), `usuarios`, `grupos`, `usuario_grupo`. Esquema em `schema.sql`.

## Banco e espelho

O D1 fica no leste dos EUA e não existe D1 na América do Sul. Antes o Worker rodava com Smart Placement perto do banco, e quem abria a página no Brasil fazia a viagem longa em toda requisição. Agora o Worker roda na borda, perto de quem acessa, e as leituras saem de um espelho em São Paulo: um Durable Object com SQLite (`Espelho`, em `src/espelho.js`, uma instância só, criada com `locationHint: "sam"`).

- **Fonte da verdade continua o D1.** Coletas, crons de mercado, admin e curadorias gravam só nele, do mesmo jeito de antes. O espelho é só leitura.
- **O que vai para o espelho:** as collections de itens e destaques, `meta`, `hist`, `_sistema`, `favs/<email>`, `listas/<email>` e `prefs/<email>`, mais cópias inteiras de `usuarios`, `grupos` e `usuario_grupo`. No admin, favoritos, listas e painéis aparecem somados, sem o e-mail de ninguém.
- **Favoritos, listas e painel do Início:** a leitura sai do espelho como o resto (D1 de reserva). A gravação vai ao D1 com `await` e, só depois que deu certo, a mesma linha vai ao espelho em `ctx.waitUntil` (write-through), para a pessoa ver a mudança na leitura seguinte sem esperar o cron. Apagar faz o mesmo com `remover`, inclusive quando o admin exclui um convidado. Se o write-through falhar, só vai para o log; a comparação do minuto seguinte conserta. Na sincronia, o D1 é lido por faixa da chave (`collection >= 'favs/' AND collection < 'favs0'`), que usa o índice; um `LIKE` varreria a tabela.
- **Corrida com o write-through:** como o D1 grava antes, o espelho nunca recebe uma linha que o D1 não tem. Sobra o caso do cron ter lido a lista do D1 um instante antes da gravação e comparar depois do write-through: o doc novo pareceria sobrando. Para isso o `comparar` recebe a hora da leitura (com 2 s de folga) e não apaga o que foi atualizado depois dela.
- **Sincronia:** no fim de cada cron (a cada minuto), o Worker lê do D1 a chave e uma marca de cada doc (`atualizado`, `coletado` e o tamanho do texto), compara com o espelho e copia só o que mudou, em lotes de 90. O que sumiu do D1 sai do espelho. Também sincroniza logo depois do botão "Atualizar agora" do mercado e, só a parte de pessoas, depois de qualquer mudança em convidados, grupos ou membros no admin.
- **Trava de segurança:** se o D1 devolver a lista vazia, ou se a sincronia fosse apagar mais da metade do espelho (com 20 docs ou mais), ela para e grava o erro. O espelho fica como estava e segue servindo.
- **Uma sincronia de cada vez:** o `comparar` marca no DO que uma sincronia começou e recusa outra (`{ ocupado: true }`) enquanto essa não chamar `concluir`, por até 60 s. A que foi recusada sai em silêncio e o DO conta em `estado.pulada`. Assim o cron e o botão "Sincronizar agora" do admin não brigam. Se uma sincronia morrer no meio, a trava vence sozinha em 60 s.
- **Ordem igual nos dois lados:** o `/api/q` ordena por `<campo> <dir>, coletado DESC, id DESC` (por `coletado` é só `coletado <dir>, id DESC`). O mesmo SQL roda no espelho e no D1, então a paginação por "mais antigos" não pula nem repete item quando há empate. No espelho há índices compostos `(collection, <campo>, coletado, id)`; com direção DESC a ordenação inteira sai do índice, em ASC o índice serve a primeira coluna e só os empates são ordenados à parte. No D1 só existe o `docs_col_coletado`, como antes.
- **Fallback:** se o espelho der erro, passar de 2 s ou ainda não tiver terminado a primeira carga, a leitura vai ao D1. As gravações vão sempre ao D1.
- **Caches:** os de antes continuam (memória do isolate por 30 s e 60 s, borda por 3 min). Uma mudança no D1 leva até 1 min para chegar ao espelho e depois os mesmos 3 min e meio de cache de antes.
- **Desligar sem deploy:** a variável `ESPELHO_ATIVO` (padrão `"1"` no `wrangler.jsonc`). Com `"0"` no painel (Workers & Pages → `news` → Variables and Secrets), todas as leituras voltam ao D1. O próximo deploy devolve o valor do `wrangler.jsonc`, então para deixar desligado de vez troque lá também.
- **Se o espelho corromper:** no admin, card "Espelho em São Paulo", botão "Zerar e recarregar" (é um `POST /api/admin/espelho` com `{ "zerar": true }`). Ele esvazia o DO e recarrega tudo do D1 na mesma hora; enquanto a carga não termina, as leituras vão ao D1. Se a carga passar de 25 s, continua no cron seguinte.
- **Medição:** cada vez que o admin abre, o Worker que o atendeu faz a mesma consulta no espelho e no D1 e guarda os dois tempos (as duas últimas medições ficam no card).
- **Logs das leituras:** cada `console.log` vira um evento de observabilidade, e a cota é de 20 mi por mês. Por isso a leitura que deu certo no espelho é amostrada: sai 1 em cada 20 por isolate, como `{"leitura": "espelho", "rotulo", "ms", "amostra": 20}`. Quando a leitura cai no D1 sai sempre, com o motivo em `fallback` (`timeout`, `erro` ou `vazio`). Esses fallbacks também são somados no isolate e mandados ao DO no máximo a cada 10 s; o card do espelho mostra a contagem de hoje por motivo e o total de ontem (janela simples por dia, em UTC). É aproximado: se o isolate morrer antes de mandar, a contagem dele se perde. Com `ESPELHO_ATIVO=0` a leitura no D1 é o caminho normal e entra na mesma amostragem.

Custo: o DO entra no Workers Paid com cota própria, não somada à do D1. Linhas lidas e gravadas têm os mesmos valores do D1 (25 bi e 50 mi por mês incluídos). Além disso conta requisições (1 mi por mês incluído; cada chamada RPC é uma) e duração enquanto está ativo (400 mil GB-s por mês). A sincronia faz duas chamadas por minuto quando nada mudou, umas 90 mil por mês; o resto são leituras da página que não estavam em cache. Com o `CF_API_TOKEN`, o card Custos do admin mostra as requisições do DO no mês (`durableObjectsInvocationsAdaptiveGroups`, projetadas para o mês inteiro, contra 1 mi), o armazenamento (`durableObjectsStorageGroups`, contra 5 GB, da conta toda) e o excedente em US$, já somado ao custo estimado. Sem o token aparece "sem token".

## Ficha do papel

Ações da B3, BDRs e ações dos EUA abrem uma ficha no diálogo do papel (`abrirAtivo`, maior e com rolagem interna): preço grande com a variação do dia, pregão aberto ou fechado com a hora do dado, faixas do dia e de 52 semanas, gráfico de 1 ano com 1M · 3M · 1A, estatísticas em quatro blocos (pregão, retorno, tamanho, múltiplos e dividendos), "Sobre a empresa", a listagem cruzada (BDR e papel americano) e as notícias do feed. FIIs e ETFs ficam como eram e ganham só as faixas e o gráfico. Nada de sinal técnico, preço-alvo, preço justo nem média móvel: só fato e número.

Dados (`src/papel.js`), um doc por papel em `hist`, id `US:NVDA` ou `BR:PETR4`:

| O quê | Fonte | Precisa de token |
|---|---|---|
| Preço, fechamento anterior, abertura, faixa do dia e de 52 semanas, volume, volume médio de 3 meses, variação em 1 mês, 3 meses, no ano e em 1 ano, série diária de 1 ano, nome e bolsa | Yahoo Finance, gráfico v8 (`range=1y&interval=1d`), query2 e depois query1, mesmo fetch de `src/eua.js`; na B3 o símbolo leva `.SA` | não |
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

Layout: sem colunas laterais, a barra de abas fica no topo do centro em qualquer largura. Cabeçalho com saudação (primeiro nome de `/api/me`), data por extenso e "atualizado há X" do dado mais novo da grade, mais o botão Personalizar. A grade é `repeat(auto-fill, minmax(min(100%, 320px), 1fr))` com `gap: 16px` e `align-items: start` (3 colunas em 1440 px, 2 em 1000 px, 1 no celular); widget de tamanho 2 ocupa duas colunas a partir de 700 px. Cada card tem título que leva à seção, subtítulo, corpo compacto, rodapé "Ver tudo →", esqueleto enquanto carrega e "Nada por aqui ainda." quando vem vazio.

Catálogo (`WIDGETS` em `src/painel.js`, o servidor valida contra ele; a página tem uma cópia para a primeira pintura):

| Id | Título | Tamanho | Fonte | Mostra | Leva a |
|---|---|---|---|---|---|
| `hoje` | Hoje no Lookout | 1 | `/api/painel/hoje` | notícias novas nas últimas 24 h por seção, em barras, e a última coleta | cada linha, a sua seção |
| `mercado` | Mercado | 1 | `meta/mercado` | cotações do letreiro em 2 colunas; Selic, CDI e IPCA numa linha embaixo | `#investimentos` |
| `pregao` | Pregão | 2 | `meta/b3` | maiores altas, baixas e mais negociadas (ações, 5 cada); papel abre o diálogo | `#investimentos` (classe Ações) |
| `fiis` | FIIs | 1 | `meta/b3` + `meta/fii-resumo` | maior DY (líquidos) e mais descontados, 4 cada | `#investimentos` (classe FIIs) |
| `eua` | EUA | 1 | `meta/eua` | S&P 500, Nasdaq e Dow; 4 maiores altas e 4 baixas | `#investimentos/eua` |
| `listas` | Minhas listas | 1 | `/api/listas` | cada lista com até 4 papéis, preço e variação; "Editar" leva à Bolsa | `#investimentos` |
| `favoritos` | Favoritos | 1 | `/api/favs` (a assinatura que a página já tem) | os 5 mais recentes, com a seção | seção do mais recente, já filtrando favoritos |
| `destaques-<secao>` | Destaques · Tech (etc.) | 1 | `/api/q?c=<destaques>&order=data&dir=desc&limit=1` | até 3 destaques do dia, título e 1 linha | a seção (Investimentos: `#investimentos/noticias`) |
| `ultimas-<secao>` | Últimas · Tech (etc.) | 1 | `/api/q?c=<items>&limit=5` | 5 mais recentes, fonte e "há X" | a seção (Investimentos: `#investimentos/noticias`) |

Seções: tech, negocios, investimentos, politica, esportes (na tela, Notícias é a aba de política). Widget de seção não liberada para a pessoa não aparece na grade, na lista de personalizar, no `/api/me` nem na rota. Padrão para quem nunca personalizou: hoje, mercado, destaques-tech, destaques-negocios, destaques-investimentos, destaques-politica, pregao, eua, listas, favoritos, destaques-esportes, ultimas-tech.

Rota `/api/prefs/painel`:

- `GET`: `{ widgets, padrao, atualizado, catalogo }`. `widgets` é a grade salva, filtrada pelas seções de hoje (ou o padrão, com `padrao: true`); `catalogo` traz `id`, `titulo`, `tamanho` e `secao` do que a pessoa pode usar.
- `PUT` (só `application/json`, até 4 KB): `{ widgets: [{ id, tamanho }] }`. Recusa com 400 id fora do catálogo, widget de seção não liberada, tamanho diferente de 1 ou 2, id repetido e mais de 40 itens.
- Doc em `prefs/<email>`, id `painel`: `{ widgets: [{ id, tamanho: 1|2 }], atualizado }`. A ordem do array é a ordem da grade; o que não está nele fica oculto. Gravação no D1 e write-through no espelho, como favoritos e listas; leitura pelo espelho. Excluir um convidado no admin apaga `prefs/<email>` junto. A limpeza da coleta não toca em `prefs/`.
- A página guarda uma cópia em `localStorage` (`radar-painel`) para a primeira pintura; a resposta do servidor manda.

Rota `/api/painel/hoje`: `{ corte, secoes: [{ secao, n, ultimaRodada, novosNaUltima }] }`, só das seções liberadas. Uma consulta só (os `meta/status*` e a contagem por collection com `coletado >= corte`, num `UNION ALL` que começa por `SELECT id, data FROM docs`, o formato que o espelho aceita). O corte anda de 10 em 10 min para a resposta ficar no cache de memória e de borda, com ETag como o resto.

Personalizar: painel lateral no desktop e folha de baixo no celular, com todos os widgets disponíveis (mostrar, setas para a ordem, largura 1 ou 2 e "Restaurar padrão"). A grade muda na hora e o `PUT` sai ao fechar. No desktop (ponteiro fino, 900 px ou mais) dá para arrastar pela alça do cabeçalho de cada card e soltar antes ou depois de outro; uma barra roxa mostra onde vai cair, e a ordem é gravada logo depois.

Dados: cada widget faz no máximo uma leitura, todas em paralelo, pelas mesmas rotas da página (cache de memória e de borda, ETag). Os `meta/*` (mercado, b3, eua) ficam numa cópia em memória por 2 min, usada pelo Início e por Investimentos, nos dois sentidos; os ciclos de atualização pedem o doc de novo. A cada 2 min o Início atualiza só os cards que estão na tela (IntersectionObserver), e ao voltar para a aba atualiza os da tela com mais de 1 min.

## Minhas listas

Na visão Bolsa (trilho direito a partir de 1200 px, abaixo da tabela antes disso) e no widget do Início. Collection `listas/<email>`, código em `src/listas.js` (rota) e na página (`listaEl`, `renderListas`).

- **Manuais:** nome e até 60 papéis (B3, BDR, EUA), até 30 listas. Criar, renomear, "+ papel", tirar (×) e excluir.
- **Automáticas da carteira:** ids fixos `carteira-fiis`, `carteira-acoes`, `carteira-bdrs`, `carteira-etfs` e `carteira-subscricoes`, nomes "Carteira · FIIs" etc., `auto: true` e `classe`. Papéis = posições abertas da classe (quantidade > 0), na ordem de valor, até 60. Só existem as classes com papel. A sincronia (`sincronizarListasCarteira`) roda depois de `POST /api/carteira/importar` sem `simular` (também quando nada de novo entrou, para trazer de volta uma automática que a pessoa apagou), de `DELETE /api/carteira/importacoes/<id>` e de `DELETE /api/carteira`; lê do D1, regrava só a lista que mudou e apaga por lista de ids a classe que ficou sem papel. Apagar a carteira apaga todas. Quem não tem carteira não tem automática. Elas não contam no limite de 30.
- **Travadas:** a página não mostra "+ papel", renomear nem × nelas; mostra o selo "da carteira" e "Copiar para lista minha" (cria uma manual, "FIIs (cópia)", "FIIs (cópia 2)" se já existir). `PUT` numa automática responde 400 `lista automática`. `DELETE` é aceito, a tela avisa que ela volta na próxima importação.
- **Mover e copiar:** em papel de lista manual, menu com "Mover para…" e "Copiar para…" (⋯, botão direito no desktop, toque longo de 500 ms no celular, que abre como folha de baixo). De lista automática, só "Copiar para…". Os destinos são só as manuais. No desktop (mouse e 900 px ou mais), arrastar a linha para outra lista manual move (de uma automática, copia), com a barra de destino como no Início. `POST /api/listas/mover` `{ de, para, papel, copiar }` confere dono (as duas em `listas/<email>`), papel presente na origem, destino não automático, sem duplicar e limite de 60; grava as duas num batch do D1 e manda as duas ao espelho (write-through).
- Ordem na tela: automáticas primeiro (FIIs, Ações, BDRs, ETFs, Subscrições), depois as manuais na ordem em que foram criadas.

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

**Widgets no Início.** `carteira-meta` (tamanho 2), `carteira-patrimonio`, `carteira-proventos-mes`, `carteira-pagamentos`, `carteira-agenda`, `carteira-rentabilidade` e `carteira-alertas`, todos `pessoal: true` no catálogo de `src/painel.js`, fora do padrão. Leem `/api/carteira` uma vez só (a mesma leitura das telas, 1 min na memória da página), levam a marca "seu" e só aparecem para quem importou extratos. No Personalizar ficam no grupo "Minha carteira". Cada bloco da carteira com widget equivalente tem o alfinete, que liga e desliga o widget em `/api/prefs/painel` (entra no topo da grade).

**Limites.** 20 mil linhas e 40 arquivos por chamada, 15 MB por arquivo na página, doc cifrado até 1,8 MB (um extrato de seis anos dá uns 250 KB de JSON, bem menos depois do gzip), 200 importações no histórico.

**Testes.** `npm test` roda `test/carteira.test.mjs` (linhas sintéticas em `test/fixtures-carteira.mjs`), `test/cofre.test.mjs` e `test/radar.test.mjs` (filtro, avisos, No mês, Na meta, filtros salvos e templates da Leitura, com os FIIs inventados de `test/fixtures-radar.mjs`).

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

## API

`/api/me` (com `widgets`, os ids que a pessoa pode pôr no Início), `/api/q` (lista de uma collection), `/api/doc` (um documento), `/api/favs`, `/api/listas` e `POST /api/listas/mover` (veja "Minhas listas"), `/api/prefs/painel`, `/api/painel/hoje`, `/api/papel`, `/api/carteira` (veja "Minha carteira"), `/api/prefs/radar`, `/api/radar/fundamentos`, `/api/leitura` e `POST /api/leitura/gerar` (veja "Radar de dividendos" e "Leitura do dia"), `POST /api/mercado/atualizar`. A página só lê as collections de itens, destaques e `meta`, e a API confere a seção de cada pessoa antes de responder. As leituras de lista ficam 30 s na memória e 3 min no cache de borda.

Admin (só `ADMIN_EMAIL`), na página `/admin`: convidados (`/api/admin/usuarios`), grupos e seções (`/api/admin/grupos`, `/api/admin/membros/<email>`), rendimento das fontes nos últimos 10 dias (`/api/admin/fontes`), custos (`/api/admin/custos`), sonda de feeds (`/api/admin/sonda`), espelho em São Paulo (`/api/admin/espelho`) e recarga manual da CVM (`POST /api/admin/cvm`). Sem grupos criados, todo convidado vê tudo.

## Segredos

Ficam no painel da Cloudflare (Workers & Pages → `news` → Variables and Secrets), nunca no repositório: `ADMIN_EMAIL`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `BRAPI_TOKEN`, `FINNHUB_TOKEN` (cotações e ficha dos EUA), `CF_API_TOKEN` e `CF_ACCOUNT_ID` (estes dois para o card de custos) e `CARTEIRA_KEY` (cifra da Minha carteira). O `wrangler.jsonc` usa `keep_vars: true`, então deploy não apaga nada. Para rodar local, `DEV_EMAIL` vai no `.dev.vars`, que o git ignora.

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
