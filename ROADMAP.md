# Roadmap

## Definition of done (vale para toda tarefa)
- Navegação: de qualquer página ou estado (admin, lista, ficha, carteira, esportes, convite, erro) dá para voltar ao Início pelo logotipo e pelo botão Voltar do navegador; nenhuma tela é beco sem saída
- Dois temas e celular conferidos com print
- Texto em pt-BR natural, sem "ticker", sem recomendação, sem o nome do dono
- `npm test` e `node --check` passando; mudou o cálculo da carteira, sobe a versão dos dados de teste e gera correção

## Agora
- [x] Lookout no Cloudflare Workers com D1, histórico importado e coletas espelhadas
- [x] Login pelo Cloudflare Access, lista de convidados e convites por WhatsApp ou e-mail
- [x] Favoritos por pessoa, sincronizados entre aparelhos
- [x] Grupos de acesso por seção: o admin cria grupos, marca as seções de cada um e põe os convidados; a API recusa seção não liberada (01/11)
- [x] Custos no admin: Workers e D1 contra os limites do plano, tamanho das collections e rodadas de curadoria do mês (01/11)
- [x] Plano Workers Paid (US$ 5/mês) desde 01/11; o card de custos já conta a mensalidade e o excedente

## Agora: coleta mais barata
- [x] Coleta por RSS no cron do Worker, tabela de candidatos e limpeza automática (docs/coleta.md)
- [x] Estado dos candidatos: publicado ou descartado, com motivo (repetido, promocional, fora do tema, antigo, raso) (01/11)
- [x] Rendimento das fontes no admin: lidos, publicados, descartados por motivo e feeds com erro, nos últimos 10 dias (01/11)
- [x] Sonda de feeds no admin: cola as URLs, o cron testa 4 por minuto com o mesmo parser da coleta (01/11)
- [x] Subreddits como fonte de candidatos (Tech, Negócios, Notícias e Política): um por minuto, cada um a cada 2 h, 429 dobra a espera, 403 três vezes marca bloqueado; texto do post e link externo no candidato (03/11)
- [x] Reddit vira "Nos fóruns": a curadoria descartava todos os posts do Reddit (raso ou fora do tema). Os subreddits passam a ler os mais votados do dia (`/top/.rss?t=day`) e os posts vão só para `foruns-<radar>`, sem curadoria e sem passar por `candidatos`; bloco "Nos fóruns" na lateral de cada seção com subreddit (depois do feed no celular), widget Fóruns · <seção> no Início, limpeza de 3 dias e "No fórum" no Rendimento das fontes (04/11)
- [x] Índice na URL dos itens: a coleta varria a tabela inteira a cada feed e estourou o limite diário de leituras do D1 (01/11)
- [x] Cache de borda de 3 min nas leituras da API, para poupar o D1 (01/11)
- [x] Espelho de leitura em São Paulo: Durable Object com SQLite copia do D1 o que a página lê, a cada minuto; Worker sem Smart Placement, D1 só nas gravações e no fallback (02/11)
- [x] Espelho, acabamento: favoritos e listas lidos do espelho com write-through na gravação, uma sincronia de cada vez (trava de 60 s), desempate fixo na ordem do /api/q, log de leitura amostrado (1 em 20) com os fallbacks contados no card, custo do DO no card Custos (03/11)
- [ ] Tech com curadoria nova em teste lado a lado; trocar depois da comparação (relatório em docs/relatorios/tech-sombra-2026-11-01.md)
- [x] Notícias e Política (antes Política) e Esportes no modelo novo, só no D1 (Sonnet 3x/dia); filtro Nacional/Internacional
- [x] Abas Negócios e Investimentos, já no modelo novo (plano abaixo)

## Próximos passos
- [ ] Decidir a troca da curadoria Tech com base no relatório de 01/11. Critérios: pelo menos um fato concreto por resumo, fontes brasileiras perto do que a atual traz, e custo por rodada medido (hoje a atual não grava buscas)
- [ ] Fontes novas de Investimentos a partir do que a sonda aprovar
- [x] Mandato, gestão, prazo, administrador, início e público-alvo dos FIIs, do informe mensal da CVM: chips e "Sobre o fundo" no diálogo, filtro Mandato na Bolsa e coluna na tabela a partir de 1200 px (03/11). No informe de 2026 o mandato veio vazio; aparece quando a CVM mandar ou pelo ano anterior
- [ ] Próximo nos FIIs: vacância e imóveis, a partir do informe trimestral da CVM
- [x] ~~Site abrir direto na Bolsa~~: substituído pelo painel inicial (03/11)
- [x] Início: painel de widgets configurável (resumos de cada seção, mercado, pregão, FIIs, EUA, listas, favoritos e "Hoje no Lookout"), com ordem, largura e o que aparece salvos na conta em `prefs/<email>`, arrastar e soltar no desktop e o site abrindo nele (03/11)
- [x] Minha carteira: importação dos extratos da B3 no navegador, posições, preço médio, proventos, meta com projeção, rentabilidade por cotas, IR para conferir, widgets "seu" no Início, tudo cifrado com `CARTEIRA_KEY` em `carteira/<email>` (03/11)
- [ ] Carteira: comparação com IFIX, CDI e Ibovespa (falta guardar a série histórica dos índices), datas com e de pagamento dos rendimentos, Tesouro e renda fixa, lista de bens e direitos para a declaração, exportar CSV
- [x] Radar de dividendos (visão Radar de Investimentos): filtros salvos por pessoa, quem passa hoje com avisos e "Na meta", carteira contra o filtro, Leitura do dia gerada no Worker por templates às 7h40, widgets Meu radar, Leitura do dia e Carteira contra o filtro, e o bloco "onde o aporte rende mais" na Meta (03/11)
- [ ] Radar: "anos seguidos pagando" (brapi) e "anos seguidos aumentando" (Finnhub) pedem guardar o histórico de dividendos por ano nas fichas; P/L e DY das ações dependem de a ficha ter sido aberta (vale buscar as do universo no cron quando os tokens entrarem); data com e de pagamento na Leitura do dia quando houver fonte
- [ ] Busca com IA só quando o acervo de Tech passar de 3 mil itens ou a busca atual deixar de dar conta

## Próximo: Negócios e Investimentos
Ordem das abas: Tech, Negócios, Investimentos, Política, Esportes.

Negócios (só notícias, curadoria Sonnet 3x/dia sobre candidatos do RSS)
- [ ] Startups e IA como mercado saem de Tech; rodada, aquisição, IPO e resultado de fintech também vêm para cá (produto e infra ficam em Tech)
- [x] Temas: startups e VC, fusões e aquisições, big techs, IA como negócio, fintechs e bancos, varejo e consumo digital, trabalho em tech, regulação e antitruste, América Latina, China e Ásia
- [x] Feeds: NeoFeed, Brazil Journal, Startups, Crunchbase News, Rest of World e Inc42 passam para negocios; novos: Pipeline, Exame, Bloomberg Línea, Reuters, CNBC, Fortune, Business Insider, Sifted, KrASIA, TechNode, Wamda, ECO, Il Sole 24 Ore
- [x] Copiar para Negócios os itens atuais de startups e ia/mercado (lista de ids); tirar de Tech só depois de aprovado
- [x] Aba no site e curadoria Sonnet 3x/dia (7h41, 13h41, 19h41), gravando direto em items-negocios (aba nova, sem nada para comparar)
- [ ] Tirar startups e ia/mercado das tarefas de Tech depois de aprovado

Investimentos
- [x] Notícias: bolsa e empresas, FIIs, renda fixa e juros, macro, cripto, regulação, IR; só fatos, sem recomendação de compra ou venda
- [x] Painel de mercado: Ibovespa, IFIX, dólar, Selic, CDI, IPCA 12m, BTC (IFIX ainda fora; o Ibovespa só entra com o token da brapi)
- [x] Cotações no cron do Worker, sem tokens: ações e FIIs a cada 30 min no pregão (brapi grátis, 1 papel por chamada, ~500 chamadas/dia), cripto a cada 30 min, BCB SGS e AwesomeAPI 1x/dia, Tesouro 1x/dia; botão "Atualizar agora" limitado a 1 vez a cada 5 min. No fim as tabelas da B3 vêm da rota de lista da brapi, que responde sem token e traz tudo numa chamada por tipo; moedas caem para PTAX, CoinGecko e Mercado Bitcoin quando a AwesomeAPI recusa. Tesouro ainda não entrou
- [x] Tabelas de ações, FIIs e ETFs da B3, ordenáveis e com filtro
- [x] FIIs com dados do informe mensal da CVM: DY, rendimento, P/VP, cotistas e segmento (01/11)
- [x] Detalhe do papel, com gráfico e link para o Investidor10 (01/11)
- [x] Duas visões: Bolsa (principal) e Notícias, com letreiro de índices fixo (01/11)
- [x] Listas de acompanhamento por pessoa, bem simples: nome da lista e papéis (sem quantidade nem preço médio), para espelhar o que cada um tem na própria instituição (01/11)
- [x] Listas automáticas da carteira (FIIs, Ações, BDRs, ETFs, Subscrições), travadas, com "Copiar para lista minha"; mover e copiar papel entre listas pelo menu, botão direito, toque longo ou arrastando no desktop (03/11)
- [x] Ficha do papel para ações da B3, BDRs e ações dos EUA: faixas do dia e de 52 semanas, gráfico de 1 ano (1M · 3M · 1A), estatísticas, perfil, listagem cruzada BDR e EUA, cache de 24 h em `hist` e renovação no cron do que foi aberto na semana (03/11)
- [ ] Ficha com os fundamentos completos: falta o Admin colar o `FINNHUB_TOKEN` (EUA) e o `BRAPI_TOKEN` (B3); conferir na `_sistema/sonda-brapi-quote` os campos que a brapi mandou de verdade
- [ ] Token da brapi como secret do Worker (o Admin cria a conta e cola no painel); hoje só o Ibovespa depende dele

## Depois: front em SSR com backend (a grande mudança)
Por que: hoje o `public/index.html` é um arquivo só, com toda a lógica e as chamadas à API no navegador. Com SSR e um backend na frente, a primeira tela chega pronta, as regras ficam no servidor, o navegador recebe só o que pode ver e os segredos e filtros por usuário param de depender do JS do cliente.

Objetivos de segurança
- Toda leitura por usuário (listas, carteira, prefs, leitura) resolvida no servidor com a identidade do Access; o HTML já vem filtrado
- API interna não exposta: o navegador fala só com o backend (BFF), que fala com D1/espelho; `/api/*` público some ou vira só o que precisa ser público
- Sem lógica de permissão no cliente; sem chave ou token em HTML/JS
- Cabeçalhos: CSP sem inline, sem eval; cookies e sessão do Access conferidos a cada pedido

Fases (uma por vez, cada uma no ar antes da próxima)
- [ ] 0. Inventário: listar telas, widgets, chamadas `/api/*` e o que cada uma lê por usuário; medir o tamanho e o tempo da primeira tela hoje (base de comparação)
- [ ] 1. Camada backend (BFF) no Worker: rotas por tela que montam o JSON pronto; a página atual passa a consumir essas rotas (sem mexer no visual)
- [ ] 2. Shell SSR no Worker: layout, cabeçalho, navegação e Início renderizados no servidor; o resto ainda hidrata como hoje
- [ ] 3. Componente por componente: cada widget migra para o framework, com os mesmos testes de tela (dois temas, celular, navegação sem beco)
- [ ] 4. Cutover: `public/index.html` sai; `/api/*` restrito; medir de novo e comparar com a fase 0

Decisão pendente: framework
- Candidatos que rodam dentro do Worker, com assets: React Router 7 (modo framework, adaptador Cloudflare), Astro em SSR (adaptador Cloudflare, ilhas), Hono + hono/jsx (SSR mínimo, sem build além do esbuild do wrangler), SvelteKit ou Nuxt (Vue) com adaptador Cloudflare
- Critérios: tamanho do JS que chega ao navegador, build no Workers Builds sem passo extra, Durable Object e D1 pelo `env` sem gambiarra, facilidade de migrar um widget por vez, testes com `node --test`
- Decidir na fase 0, com um protótipo de uma tela (o Início) em dois candidatos

Quando: passos 5 a 10 da "Fila em ordem (04/11)". Primeira página na stack nova é a Administração 2.0; o Início fica para o fim, quando os widgets já tiverem migrado. O deploy segue pelo Workers Builds a cada push, e a versão nova só substitui a atual depois de conferir celular e desktop.

## Depois
- [ ] Domínio próprio
- [ ] Marcar como lido, esconder fonte, atalhos de teclado

## Pedidos de 03/11
Tabelas e sidebars (pacote 1, feito em 03/11):
- [x] Ordenar sem perder a rolagem horizontal; paginação (25/50/100) no lugar de "Ver todos"; filtro por coluna (texto, faixa numérica e datas, com chips); ordenação por várias colunas (Shift+clique, prioridade no cabeçalho, painel "Ordenar"); estado salvo por tabela em localStorage e em `/api/prefs/tabelas`. Um helper só (`public/tabela.js`) para Cotações da Bolsa e dos EUA, Radar e as tabelas da carteira (docs/LOOKOUT.md, "Tabelas")
- [x] Minhas listas ordenáveis pelo cabeçalho (Papel, Preço, Dia, DY 12m, P/VP), ordem salva na lista (manual) ou em `/api/prefs/tabelas` (automática); ordem personalizada por arrastar continua como padrão
- [x] Sidebars recolhíveis por um ícone na própria sidebar, estado salvo por pessoa (`/api/prefs/layout`)
- [x] Bolsa: FIIs, FI-Infra e Fiagro separados pelo `sub` da brapi (FIP-IE junto com FI-Infra); DY e último rendimento deles pela ficha, com o Yahoo (`events=div`), marcados "via Yahoo"; carteira com as classes e listas automáticas novas

Listas e Personalizar (pacote 2, feito em 03/11):
- [x] Listas por regra: na criação, um layout de regras sobre os dados que já existem (P/VP, DY, liquidez, cotistas, segmento, mandato, classe, carteira...); a lista se realimenta a cada atualização e guarda histórico de quem entrou e saiu, com data e motivo
- [x] Comparações com a carteira importada, para cada papel que tu tem: preço atual × preço médio, resultado em R$ e %, quanto falta para empatar, DY sobre custo × DY atual, posição contra os parâmetros da regra
- [x] Sugestões: o Lookout pode sugerir papéis que passam na regra e ajustes na regra (sempre como fato e conta, nunca como recomendação)
- [x] Lista de listas: tela própria (também pelo menu do perfil) com todas as listas, ligar/desligar sem excluir (lista desligada some da Bolsa e do Início, mas fica guardada), ordem e contagem

## Pedidos de 03/11, tarde
- [x] Listas (pacote 2): campo Descrição (texto longo, editável; lista criada pelo Claude vem com motivo, critérios, decisões, exclusões e data); linha verde ou vermelha pelo resultado da posição na carteira (sem carteira, pela variação do dia); página própria por lista (`#lista/<id>`) com descrição, histórico de entradas e saídas e a tabela de comparações por papel (atual × preço médio, resultado em R$ e %, quanto falta para empatar, DY sobre custo × atual, P/VP, liquidez, quantidade e valor, situação contra a regra)
- [x] Início, Personalizar (pacote 2): arrastar dentro do painel; tamanho por widget só onde o catálogo permitir (1, 2 ou 3 colunas; 1×2 e 2×2), responsivo (3/2/1 colunas) com pré-visualização
- [ ] Renda fixa e Tesouro: importar o relatório "Posição" da Área do Investidor (CDB, LCI/LCA, CRI, Tesouro), classes novas na carteira, preço do Tesouro pela API pública 1x/dia, CDB/LCI/LCA atualizados pela curva (CDI/IPCA + taxa), IR estimado e isenção, vencimentos na agenda

## Pedidos de 04/11
- [x] Esportes: rodada, próximos jogos e tabela por competição configurável, pela ESPN (endpoints públicos) e pelo Globo Esporte no Gauchão quando a ESPN não tiver; `meta/esportes-<liga>`, cron a cada 15 min com jogo perto e 1x/hora sem, tabela 2x/dia, times 1x/dia; cartões acima do feed com Rodada, Próximos e Tabela com zonas coloridas; "Meus esportes" (`#esportes/config`, menu da conta) com competições, ordem e times; widgets de rodada, tabela e próximo jogo no Início (docs/LOOKOUT.md, "Esportes")
- [x] Esportes conferido em produção (04/11, 15h14): Brasileirão com 9 próximos, 3 últimos e tabela de 20; Libertadores com tabela de 32 (mata-mata sem rodada); scoreboard da ESPN só aceita um dia por chamada, corrigido em c607db4
- [x] Esportes: RSS do ge conferidos pela sonda (Libertadores, Copa do Brasil, RS, Gauchão e o geral `/rss/ge/`) em `src/feeds.js`; a página do Gauchão no ge deu 404, então o ge não serve de reserva (04/11)
- [ ] Esportes: NBA, NFL e F1 (o módulo já aceita `<esporte>/<liga>` da ESPN; falta pôr em `LIGAS` e na tela)
- [x] Minhas listas: colunas Qtd e Valor e linha colorida pelo resultado da posição na lateral e no widget do Início, para quem tem o papel na carteira
- [x] Nos fóruns em todas as seções: 28 subreddits novos (38 no total), Investimentos e Esportes com bloco e widget (docs/coleta.md)
- [x] "Trocar de conta" no menu da conta (página e admin)
- [x] Internacional aparece como "Inter" no selo de clube e no título do grupo, para não confundir com o filtro Nacional/Internacional

## Fila em ordem (04/11)
A grande mudança (SSR com backend) entra no meio da fila, não no fim: as telas novas e grandes (Administração 2.0, sessão responsiva) saem já na stack nova, para não fazer duas vezes. O que é pequeno ou é mais dado do que tela (simulador, renda fixa) sai antes, no HTML de hoje, porque a API continua a mesma.
- [x] 0. Campos com formato pelo tipo (moeda, percentual, número, data, mês/ano, papel), um helper para toda a página; valor cru por baixo, formata ao sair do campo (`public/campo.js`, docs/LOOKOUT.md, Campos) (04/11)
- [x] 1. Modo de edição do Início: grade quadriculada, redimensionar com os limites de cada card, arrastar para cima e para baixo, tirar card, grupos por tipo; Personalizar vira o catálogo "Adicionar card" e o doc do painel passa a grupos (04/11)
- [x] Logotipo do admin leva ao Início (04/11)
- [ ] 2. Troca de nome news → lookout (em andamento, sub-itens abaixo)
- [x] 3. Simulador de reinvestimento (mês/ano alvo, só proventos, cenários); memória de cálculo gravada na carteira, comparar e excluir; com o tempo, análise sob demanda do desvio (previsto × real por mês, causas: rendimento por cota, cotação no reinvestimento, aportes, composição); nada automático, nada de alerta (04/11): aba Simulações na Minha carteira, até 12 por pessoa com a memória de cálculo cifrada, fechamento mensal no GET e no cron do dia 1, Analisar com previsto × real, decomposição em rendimento, aportes, reinvestimento e cotação e resíduo e parecer por template; widget Minhas simulações (docs/LOOKOUT.md, "Simulador de reinvestimento"). Por papel e parecer por IA ficaram para depois
- [ ] 4. Ajustes da curadoria Tech (relatório de 04/11), decisão 2 dias depois
- [ ] 5. SSR, fase 0: inventário de telas, widgets e chamadas `/api/*`; medir a primeira tela de hoje; protótipo do Início em dois candidatos e decisão do framework
- [ ] 6. SSR, fase 1: camada backend (BFF) no Worker, a página de hoje passa a consumir as rotas novas sem mudar o visual
- [ ] 7. Administração 2.0, já na stack nova (piloto do SSR: página menor, só o Admin vê, erro não chega aos convidados): menos texto e mais visual; convites por grupo e por canal (WhatsApp, e-mail, link) com funil enviado → abriu → entrou → ativo e reenvio para quem não entrou; métricas por pessoa (último acesso, dias ativos, seções e widgets mais usados); ideia: métricas de uso (Cloudflare Web Analytics sem cookie, GA4 com consentimento, ou contadores internos em `uso/<email>`)
- [ ] 8. Renda fixa e Tesouro pelo relatório "Posição" (importação e cálculo contra o BFF; tela simples, migra junto no passo 9)
- [ ] 9. SSR, fases 2 e 3: shell renderizado no servidor e widget por widget na stack nova; a sessão de telas grandes, tablet e celular acontece aqui, widget a widget, não como passo separado
- [ ] 10. SSR, fase 4: cutover, `public/index.html` sai, `/api/*` restrito, medir e comparar com a fase 0
- [ ] 11. Job mensal de exportação dos extratos pelo Chrome
- [ ] 12. Esportes: NBA, NFL e F1; conferir sondas da ESPN e do ge em produção
- [ ] Troca de nome news → lookout (passo a passo em docs/cloudflare.md, "Troca de nome do Worker")
  - [x] Repositório todo em `lookout`: wrangler, custos, user-agent, docs, admin (04/11)
  - [ ] Worker `lookout` criado no Workers Builds, 8 secrets colados (CARTEIRA_KEY a mesma), Access ligado com AUD novo
  - [ ] Conferir no ar: login, Início, admin, custos, cron gravando, espelho cheio; depois apagar o `news`
  - [ ] Renomear o repositório no GitHub para `lookout`; conferir o Workers Builds, `git remote set-url` nas máquinas, trocar `ralphrs/radar-tecnico` nos docs e README
  - [ ] Domínio próprio (depende do nome da empresa): custom domain `lookout.<domínio>`; só então mandar o link para o Gabriel
