# Lookout: auditoria de desempenho (02/11/2026)

Só leitura. Nada no projeto foi alterado. As medições usaram o `wrangler dev --local` com o D1 local (3.303 itens reais no Tech) e um proxy de teste na frente dele, que trocava as leituras de Investimentos por dados de exemplo e contava as chamadas de `render()` na cópia do HTML em trânsito.

## Como foi medido

- Chromium (Playwright), cache frio, Slow 4G emulado via CDP (1,6 Mbps de descida, 750 kbps de subida, 150 ms de latência) e CPU 4x mais lenta. Mediana de 3 aberturas por caso.
- "Pronta" = o feed (ou a tabela de cotações, na Bolsa) aparece e a rede fica 3 s parada.
- Tech: dados reais do D1 local. O cliente pede `limit=1000` e o servidor devolve 500 itens (452 KB brutos, 155 KB gzip).
- Investimentos: 500 itens (os do Tech com temas trocados, mesmo tamanho), `meta/b3` com 120 ações, 205 FIIs e 45 ETFs (47 KB brutos, 8,6 KB gzip), `meta/fii` com 452 fundos e 13 meses de histórico (387 KB brutos, 125 KB gzip). Os dois juntos dão uns 434 KB, perto dos 445 KB citados.
- Google Fonts está bloqueado neste ambiente. Servi o CSS e os woff2 reais do fontsource (mesmas famílias, subconjunto latin) num servidor local com HTTPS. Por isso o teste **não** inclui o DNS + TCP + TLS até fonts.googleapis.com e fonts.gstatic.com, que em 4G custa uns 3 RTTs a mais por domínio. Na vida real o primeiro render fica pior do que o medido aqui.
- `/cdn-cgi/access/get-identity` dá 404 localmente (não há Access). Em produção é mais uma requisição pequena.
- Versão medida: o `index.html` de 02/11 por volta das 15h30 (208.772 bytes). Durante a auditoria o arquivo continuou sendo editado (visão EUA, `lerEua()`); os números de linha abaixo são do arquivo como estava no fim da auditoria (2.845 linhas, 221.230 bytes).

## Números medidos

### Arquivos estáticos

| Arquivo | Bruto | gzip | CSS inline | JS inline | Fontes externas |
|---|---|---|---|---|---|
| public/index.html (versão medida) | 208.772 B (204 KB) | 58.596 B (57 KB) | 54,5 KB | 143,8 KB (12 KB só da tabela `PAIS_FONTE`) | 1 CSS do Google Fonts, 4 famílias |
| public/index.html (cópia atual, em edição) | 221.230 B | 62.468 B | | | |
| public/admin.html | 44.136 B (43 KB) | 14.293 B (14 KB) | 9,5 KB | 28,8 KB | nenhuma |

Fontes (index.html:5-7): Inter 400/500/600, JetBrains Mono 400/500, Space Grotesk 600/700 e DotGothic16, num único `<link rel="stylesheet">` para fonts.googleapis.com. Esse CSS **bloqueia o render** (é folha de estilo no `<head>`, de outro domínio). Os arquivos já vêm com `display=swap`, então o texto não some enquanto a fonte carrega. Há `preconnect` para os dois domínios. Arquivos baixados na abertura: Inter 47 KB, JetBrains Mono 40 KB, Space Grotesk 22 KB e, só em Investimentos (a fita), DotGothic16 10 KB. Total de 109 a 119 KB, mais que o próprio HTML.

### Abertura (Slow 4G + CPU 4x, cache frio, mediana de 3)

| Tela | Aba | Requisições | Transferido | FCP | Feed/tabela na tela | load | Long tasks (qtd / maior / soma acima de 50 ms) | `render()` completos | `renderFeed` | Nós no DOM |
|---|---|---|---|---|---|---|---|---|---|---|
| 1440 | Tech | 12 | 325 KB | 568 ms | 2.635 ms | 1.400 ms | 7 / 286 ms / 497 ms | 3 | 4 | 1.264 |
| 1440 | Investimentos Bolsa | 17 | 470 KB | 592 ms | 1.466 ms (tabela) | 1.804 ms | 9 / 273 ms / 748 ms | 3 | 4 | 1.481 |
| 1440 | Investimentos Notícias | 16 | 345 KB | 564 ms | 2.592 ms | 1.606 ms | 7 / 301 ms / 663 ms | 3 | 4 | 1.073 |
| 390 | Tech | 12 | 325 KB | 576 ms | 2.613 ms | 1.441 ms | 6 / 355 ms / 544 ms | 3 | 4 | 1.264 |
| 390 | Investimentos Bolsa | 17 | 470 KB | 548 ms | 1.402 ms (tabela) | 1.753 ms | 8 / 277 ms / 638 ms | 3 | 4 | 1.481 |
| 390 | Investimentos Notícias | 16 | 345 KB | 564 ms | 2.588 ms | 1.605 ms | 6 / 287 ms / 492 ms | 3 | 4 | 1.073 |

Além dos 3 `render()` completos, a abertura chama `renderLateral` 5 vezes e, na Bolsa, `renderCotacoes` e `renderRankings` 5 vezes cada (3 dentro de `render()`, 1 quando chega o `meta/b3`, 1 quando chega o `meta/fii`). No Tech, `renderCotacoes`, `renderRankings` e `renderMercado` também rodam 3 vezes cada, só para sair logo no começo.

De onde vêm os 3 renders: o primeiro, vazio, no fim do script (index.html:2814); o segundo em `juntar()` quando chega o feed (2371); o terceiro quando chegam os favoritos (2497), mesmo que nada tenha mudado.

Linha do tempo da abertura do Tech em 1440 (ms desde o início da navegação):

| Requisição | Começa | Termina |
|---|---|---|
| `/` (HTML) | 0 | 460 |
| CSS do Google Fonts | 216 | 396 |
| `/api/me` (1ª, `window.lookoutEu`) | 441 | 604 |
| 3 fontes (Inter, Space Grotesk, JetBrains Mono) | 457 | 1.107 a 1.436 |
| `/api/me` (2ª, a IIFE do fim do script) | 812 | 995 |
| `/api/q?c=items&limit=1000` | **1.030** | 2.149 |
| status, destaques, favs | 1.034 a 1.049 | ~1.240 |

O feed só começa a descer em 1,03 s porque a IIFE espera a segunda `/api/me` terminar. A primeira já tinha voltado em 0,6 s. As fontes disputam a banda com o feed no mesmo intervalo.

Na Bolsa, o `meta/fii` (125 KB gzip) sai em 0,74 s e só termina em 2,64 s, disputando banda com o feed (154 KB, que nem aparece na visão Bolsa a não ser no trilho "Notícias de hoje") e com as fontes.

### Depois de aberta

| Cenário | Resultado |
|---|---|
| Digitar "kubernetes" na busca lateral do Tech (10 teclas, 1440) | 10 `render()` completos, média 160 ms, maior 403 ms. Eventos de teclado lentos: 39, maior 528 ms (INP acima de 500 ms é "ruim") |
| Digitar 4 letras no filtro da tabela da Bolsa | 4 `renderCotacoes`, média 66 ms, maior 219 ms. Evento mais lento 328 ms |
| Um ciclo de polling no Tech (o que roda a cada 2 min e ao voltar para a aba) | 4 requisições, 157 KB, 2 `render()` (~200 ms cada), 3 `renderFeed`, 4 `renderLateral` |
| Um ciclo de polling em Investimentos | 4 requisições e 156,5 KB do feed + 2 requisições e 9,1 KB de `meta/mercado` e `meta/b3` (que re-renderizam cotações, rankings, listas e a fita, mesmo sem mudança) |
| Projeção por hora, com uma aba aberta | 30 ciclos, ~4,6 MB e ~60 `render()` completos. Continua em aba escondida, porque o `setInterval` do adaptador não olha `document.hidden` |
| "Ver mais" em todos os temas do Tech | 10 cliques, cada um com `render()` completo de 1.075 ms em média e 1.865 ms no pior. Maior long task: 2.666 ms. DOM vai de 1.264 para 7.668 nós (500 itens) |
| Recarregar a página com cache | HTML volta 304 (0,2 KB) e fontes vêm do cache, mas a API toda desce de novo: 155 KB (`no-store`, sem ETag) |
| Rolagem (60 passos de 120 px) | Handlers de scroll custam 0,2 a 0,5 ms por quadro. Quadro p95: 27 a 35 ms com 5 itens por tema, 58 a 65 ms com tudo expandido |

Quebra de um `render()` (CPU 4x, 1440):

| Estado | Tempo até o quadro | `renderFeed` | dentro dele, `medirFeed` |
|---|---|---|---|
| Inicial (5 por tema) | 278 a 376 ms | 145 a 199 ms | 115 a 163 ms |
| Todos os temas expandidos | 2.115 a 2.306 ms | 1.493 a 1.763 ms | 1.186 a 1.369 ms |
| Expandido, sem `medirFeed` | 1.218 a 1.681 ms | 188 a 313 ms | |
| Expandido, `content-visibility: auto` nos itens, sem `medirFeed` | **393 a 561 ms** | 201 a 318 ms | |
| Expandido, `content-visibility: auto` mantendo `medirFeed` | 2.614 a 3.304 ms (piora) | | 2.346 a 2.612 ms |

O gargalo não é JavaScript, é layout. `medirFeed` lê `scrollHeight` de cada resumo logo depois de o feed inteiro ser recriado, o que força o layout da página toda na hora. Tirar só ele adia o layout para o quadro seguinte; o ganho real vem de tirar ele **e** deixar o navegador pular o layout do que está fora da tela.

## As 10 maiores oportunidades (ganho esperado ÷ esforço)

### 1. Polling: perguntar só o status e parar quando a aba está escondida

- Onde: index.html:711-732 (`INTERVALO`, `assinar`, listener de `visibilitychange`) e index.html:2760-2781 (`ligarRadar`).
- Hoje: a cada 2 minutos, e toda vez que a aba volta ao foco, o feed inteiro (500 itens, 155 KB gzip), o status, os destaques e os favoritos descem de novo, e cada resposta dispara `render()` ou `renderFeed`, mudando algo ou não. O `setInterval` roda mesmo com a aba escondida. As coletas rodam poucas vezes por dia, então quase todo ciclo traz exatamente o mesmo conteúdo.
- O que fazer: no ciclo, ler só `meta/status*` (0,3 KB). Buscar o feed apenas quando `ultimaRodada` mudar (ou, melhor ainda, só os itens novos com `wf=coletado&wo=>&wv=<mais recente>`). Pular o ciclo quando `document.hidden`. No `visibilitychange`, só disparar se o último ciclo tiver mais de 2 min. Comparar favoritos e destaques antes de renderizar.
- Ganho estimado: de 157 KB e 2 renders completos (~400 ms de CPU num celular médio) por ciclo para ~0,3 KB e zero render quando nada mudou. Uns 4,5 MB por hora a menos por aba aberta, e bem menos leituras no D1 e no cache de borda.
- Esforço: baixo (umas 20 a 30 linhas no adaptador e em `ligarRadar`).

### 2. Tirar o `medirFeed` do caminho e ligar `content-visibility` nos itens

- Onde: index.html:2315-2322 (`medirFeed`), chamado no fim de `renderFeed` (index.html:2324-2369) e no `resize`/`fonts.ready`.
- Hoje: depois de recriar o feed, mede todos os resumos e os títulos de seção, forçando layout síncrono da página. É 75% a 80% do custo de cada `render()`.
- O que fazer: deixar o "ler mais" decidido por CSS (`line-clamp` sempre ligado e o botão visível) ou medir só os resumos que entram na tela, com `IntersectionObserver`. A altura dos `h2` grudados pode virar valor fixo no CSS ou ser medida uma vez. Junto disso, `#feed li.item { content-visibility: auto; contain-intrinsic-size: auto 110px; }`. As duas coisas precisam ir juntas: só o `content-visibility` com o `medirFeed` atual fica **mais lento** (medido).
- Ganho medido: com tudo expandido, de 2,1-2,3 s para 0,4-0,56 s por render. No estado inicial, uns 115 a 160 ms a menos em cada um dos 3 renders da abertura e em cada tecla da busca.
- Esforço: baixo a médio.

### 3. Busca: esperar o usuário parar de digitar e não redesenhar a página toda

- Onde: index.html:2750 e 2752 (`#busca` e `#busca-nav` chamam `render()` a cada tecla), index.html:1250 (`#cot-busca` chama `renderCotacoes()` a cada tecla e recria o próprio campo).
- Hoje: cada tecla refaz cabeçalho, abas, fita, rankings, cotações, chips, navegação, feed e lateral. 160 ms por tecla em média, eventos de até 528 ms.
- O que fazer: debounce de 150 a 200 ms e, na busca, chamar só o que depende dela (`renderFeed`, contadores de tipo, tema, escopo e `renderContador`). Na tabela, atualizar só o `<tbody>` e o rodapé, sem recriar o `<input>`.
- Ganho estimado: 10 renders viram 1 ou 2 ao digitar uma palavra; INP de ~530 ms para abaixo de 200 ms (somado ao item 2, bem abaixo).
- Esforço: baixo.

### 4. Começar a baixar o feed sem esperar a segunda `/api/me`

- Onde: index.html:2822 (a IIFE faz `await fetch("/api/me")` antes de `ligarRadar()`) e index.html:785 (`window.lookoutEu` já pediu a mesma coisa).
- Hoje: duas chamadas iguais a `/api/me`, e o feed só sai depois da segunda (1,03 s na linha do tempo).
- O que fazer: reaproveitar `window.lookoutEu` e disparar a leitura do radar salvo em paralelo, conferindo as seções quando a resposta chegar (o servidor já bloqueia seção não liberada com 403).
- Ganho estimado: feed começa uns 0,5 s antes; em Slow 4G a lista aparece por volta de 2,0 s em vez de 2,6 s. Uma requisição a menos.
- Esforço: baixo.

### 5. Separar o mercado do `render()` geral

- Onde: index.html:2451-2454 (`render()` chama `renderMercado`, `renderRankings`, `renderCotacoes` e `renderNavBolsa` toda vez) e index.html:1893 (`renderMercado` recria a fita).
- Hoje: qualquer render (tecla, favorito, polling do feed) recria a fita de cotações, o que reinicia a animação do letreiro do começo, e reconstrói rankings e tabela na Bolsa. No Tech essas funções rodam só para sair, mas rodam.
- O que fazer: chamar essas funções só quando `painelMercado`, `b3`, `fiiCvm` ou a visão mudarem.
- Ganho estimado: a fita para de pular; 60 a 120 ms a menos por render em Investimentos.
- Esforço: baixo.

### 6. ETag e 304 nas leituras da API

- Onde: src/index.js:17 (`json()` sempre com `cache-control: no-store`) e src/index.js:72-89 (`comCache`).
- Hoje: o navegador não pode reaproveitar nada; toda recarga e todo polling baixam o corpo inteiro. No acerto de memória, `json(c.dados)` faz `JSON.stringify` de 450 KB de novo a cada requisição (linha 74); no acerto de borda, faz `r.json()` e depois `stringify` (linha 80).
- O que fazer: guardar no cache a string pronta e um hash dela; responder `ETag` com `cache-control: private, no-cache` e devolver 304 quando vier `If-None-Match` igual. Servir a string guardada direto, sem parse/stringify.
- Ganho estimado: recarga com cache de 155 KB para ~0,3 KB quando o feed não mudou; menos CPU por requisição no Worker. Combina com o item 1 (que resolve o polling no cliente) e cobre recargas e outras abas.
- Esforço: baixo a médio.

### 7. Polling de mercado só quando o dado mudou

- Onde: index.html:2842 (`lerMercado(); lerB3(); lerEua();` a cada 2 min) e index.html:1143-1147 (`lerB3` sempre re-renderiza rankings, cotações, navegação e listas).
- Hoje: 9,1 KB e uma long task de ~140 ms a cada 2 min, mesmo de madrugada e no fim de semana, quando o `b3` não muda (o cron grava a cada 30 min no pregão). Agora soma também o `meta/eua`.
- O que fazer: comparar `atualizado` antes de renderizar; fora do pregão, espaçar para 15 a 30 min. Com o item 6, isso vira 304.
- Ganho estimado: quase zero de rede e CPU na maior parte do dia.
- Esforço: baixo.

### 8. Fontes: hospedar no próprio site e cortar as que pouco aparecem

- Onde: index.html:5-7 (link do Google Fonts), index.html:20-22 (`--font-display`, `--font-mono`), index.html:275 (`.fita-item` com DotGothic16).
- Hoje: um CSS bloqueante de outro domínio, mais conexões para fonts.gstatic.com, e 109 a 119 KB de fontes descendo junto com o feed. A JetBrains Mono (40 KB) só aparece em texto de 11 a 12 px (status, contadores) e a DotGothic16 só na fita.
- O que fazer: trocar a JetBrains Mono por `ui-monospace` do sistema; servir Inter e Space Grotesk em woff2 do próprio Worker, com `font-display: swap` e `Cache-Control: max-age=31536000, immutable`; manter a DotGothic16 só se for marca da fita (ou carregar com `media`/JS depois da abertura).
- Ganho estimado: 50 KB a menos (JetBrains Mono e DotGothic16), uma folha de estilo bloqueante a menos e duas conexões TLS a terceiros a menos. Em 4G real isso costuma valer 300 a 500 ms no primeiro render, o que o teste local não captura.
- Esforço: baixo.

### 9. Corrigir `JANELA = 1000` contra o teto de 500 e carregar o feed em duas etapas

- Onde: index.html:982 (`JANELA = 1000`), index.html:2770 e 2391 (`podeMais = ... >= JANELA`), src/index.js:103 (limite máximo de 500).
- Hoje: o cliente pede 1.000, o servidor manda 500, e `podeMais` nunca fica verdadeiro. O botão "Carregar mais antigos" não aparece, e 2.803 dos 3.303 itens do Tech ficam inalcançáveis. É um bug funcional, não só de desempenho. E a abertura baixa 500 itens (155 KB) para mostrar 5 por tema.
- O que fazer: alinhar os dois números. Melhor: primeira página com uns 150 a 200 itens (cerca de 60 KB gzip) para o primeiro render e o restante logo depois, em segundo plano, para as contagens dos chips fecharem; "mais antigos" continua sob demanda.
- Ganho estimado: download que segura o feed cai uns 60% (155 KB para ~60 KB); em Slow 4G a lista aparece uns 0,5 s antes. As contagens ficam provisórias por um ou dois segundos.
- Esforço: médio.

### 10. `meta/fii`: não baixar o histórico inteiro na abertura da Bolsa

- Onde: index.html:1156-1160 (`lerFii`), disparado por `renderRankings` (index.html:1305) e `renderCotacoes` (1241) na abertura; src/cvm.js:157-160 grava o documento.
- Hoje: os ~387 KB brutos (125 KB gzip) descem logo ao abrir a Bolsa, disputam banda com o `b3`, o feed e as fontes, e na chegada refazem rankings, cotações, navegação e listas. Correção do que foi suposto no pedido: o `meta/fii` é lido **uma vez** (fica em `fiiCvm`); o que volta a cada 2 min é o `meta/b3` (8,6 KB gzip), e agora o `meta/eua`.
- O que fazer: gerar no cron um resumo por fundo (DY 12m, último rendimento, P/VP, cotistas, segmento), uns 30 a 40 KB, para tabela e rankings; deixar o histórico `h` para quando um papel for aberto. Enquanto isso não existe, ao menos adiar `lerFii` para depois da tabela aparecer (`requestIdleCallback`).
- Ganho estimado: 90 a 110 KB gzip a menos na abertura da Bolsa e um ciclo completo de re-render a menos.
- Esforço: médio (mexe no cron e no cliente).

## Outros pontos verificados

- **Cache-Control dos assets.** `env.ASSETS.fetch` (src/index.js:287 e 350) devolve o que o Workers Static Assets põe por padrão: `public, max-age=0, must-revalidate` com `ETag`. O HTML volta 304 numa recarga (0,2 KB), então está razoável para uma página com login. O Worker não acrescenta cabeçalho nenhum. Os ícones poderiam ter `max-age` de um dia, ganho pequeno. Com `run_worker_first: true` cada asset passa pelo Worker e pela verificação do JWT; `crypto.subtle.importKey` roda a cada requisição (src/auth.js:67) e daria para guardar a chave importada por `kid`.
- **Lista grande montada de uma vez.** Sim: tudo o que está carregado (500 itens) é recriado a cada render, e com os temas expandidos são 7.668 nós no DOM. O `/api/q` usa limite (padrão 100, teto 500, src/index.js:103).
- **`localStorage` em loop.** Não. Só é lido na inicialização e em `aplicarRadar`; gravado quando um filtro muda.
- **ResizeObserver e scroll.** Baratos (0,2 a 0,5 ms por quadro, medido). Os três `ResizeObserver` (index.html:2574-2580) escrevem variáveis CSS no `<html>`, o que recalcula estilo da página, mas só disparam quando o cabeçalho, a barra ou a fita mudam de altura.
- **Imagens sem dimensão.** Só existe a foto do avatar (criada com `new Image()` no menu da conta), dentro de um círculo com tamanho fixo no CSS. Não há risco de CLS por imagem.
- **JS inline de 144 KB.** Como é inline, o V8 não guarda cache de compilação entre visitas. Separar em `app.[hash].js` com cache imutável ajudaria quem volta sempre, mas o ganho é moderado perto dos itens acima. A tabela `PAIS_FONTE` (12 KB) poderia ir para o servidor, gravada como `pais` no item na coleta.
- **`setInterval` de 60 s** (index.html:2841) refaz o status e a lateral a cada minuto para atualizar o "há X min". É leve, mas poderia mexer só no texto.
- **Carrossel de destaques** (index.html:1408, a cada 7 s): sai cedo quando não está na Bolsa larga. Sem custo relevante.
- **Banco.** Existe índice `docs_col_coletado (collection, coletado DESC)`, que atende a consulta do feed. A de destaques ordena por `json_extract(data, '$.data')` sem índice, mas a collection é minúscula.

## O que só dá para decidir com as métricas da Cloudflare

- **Latência real Brasil até o Worker.** Com `placement: smart` o Worker roda perto do D1, no leste dos EUA, então cada chamada à API atravessa o continente. O TTFB real por país diz se vale servir o HTML e as respostas cacheadas mais perto do usuário, ou se o teste de 150 ms de latência está otimista.
- **Taxa de acerto do cache** por camada (memória do isolate de 30 s, `caches.default` de 3 min, D1) e por rota. Isso diz se o cache de borda está segurando as leituras e se o item 6 muda algo no servidor ou só no cliente.
- **Tempo de CPU do Worker** (p50 e p99) em `/api/q` e `/api/doc?id=fii`, para saber quanto pesam o `JSON.stringify` repetido e a verificação do JWT.
- **D1:** linhas lidas e consultas por minuto, separando o cron de minuto a minuto (coleta, mercado, b3, CVM, sonda) das leituras da página. Mostra se o polling de 2 min de cada aba aberta pesa na conta ou disputa com o cron.
- **Volume por rota e por usuário:** quantas abas ficam abertas o dia todo. É o que decide a prioridade real do item 1.
- **Tamanho real dos documentos em produção:** `items-investimentos` (aqui simulei 500 itens), `meta/fii`, `meta/b3`, `meta/eua`, e se a borda entrega brotli ou gzip.
- **Web Vitals reais** (Web Analytics ou RUM): LCP e INP nos aparelhos de quem usa, para confirmar se o celular sofre como no teste com CPU 4x.
- **Tempo de resposta do `/cdn-cgi/access/get-identity`** e do próprio Access antes do Worker, que somam na abertura e aqui não existem.
