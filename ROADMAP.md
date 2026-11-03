# Roadmap

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
- [ ] Ficha com os fundamentos completos: falta o Ralph colar o `FINNHUB_TOKEN` (EUA) e o `BRAPI_TOKEN` (B3); conferir na `_sistema/sonda-brapi-quote` os campos que a brapi mandou de verdade
- [ ] Token da brapi como secret do Worker (o Ralph cria a conta e cola no painel); hoje só o Ibovespa depende dele

## Depois: React com SSR
- [ ] Reescrever a página em React, componente por componente, mantendo a API atual (`/api/*`)
- [ ] Renderizar no servidor (SSR) no próprio Worker, para a primeira tela já vir com as notícias
- [ ] Build automático no Workers Builds a cada push
- [ ] Trocar a versão atual pela nova só depois de conferir celular e desktop

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
