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
- [x] Índice na URL dos itens: a coleta varria a tabela inteira a cada feed e estourou o limite diário de leituras do D1 (01/11)
- [x] Cache de borda de 3 min nas leituras da API, para poupar o D1 (01/11)
- [x] Espelho de leitura em São Paulo: Durable Object com SQLite copia do D1 o que a página lê, a cada minuto; Worker sem Smart Placement, D1 só nas gravações e no fallback (02/11)
- [ ] Tech com curadoria nova em teste lado a lado; trocar depois da comparação (relatório em docs/relatorios/tech-sombra-2026-11-01.md)
- [x] Notícias e Política (antes Política) e Esportes no modelo novo, só no D1 (Sonnet 3x/dia); filtro Nacional/Internacional
- [x] Abas Negócios e Investimentos, já no modelo novo (plano abaixo)

## Próximos passos
- [ ] Decidir a troca da curadoria Tech com base no relatório de 01/11. Critérios: pelo menos um fato concreto por resumo, fontes brasileiras perto do que a atual traz, e custo por rodada medido (hoje a atual não grava buscas)
- [ ] Fontes novas de Investimentos a partir do que a sonda aprovar
- [ ] Mandato dos FIIs: confirmar o nome da coluna no CSV da CVM (o cabeçalho fica registrado no admin) antes de mostrar
- [ ] Vacância e imóveis dos FIIs a partir do informe trimestral da CVM
- [ ] Site abrir direto na Bolsa (decisão do Ralph)
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
- [x] Cotações no cron do Worker, sem tokens: ações e FIIs a cada 30 min no pregão (brapi grátis, 1 ticker por chamada, ~500 chamadas/dia), cripto a cada 30 min, BCB SGS e AwesomeAPI 1x/dia, Tesouro 1x/dia; botão "Atualizar agora" limitado a 1 vez a cada 5 min. No fim as tabelas da B3 vêm da rota de lista da brapi, que responde sem token e traz tudo numa chamada por tipo; moedas caem para PTAX, CoinGecko e Mercado Bitcoin quando a AwesomeAPI recusa. Tesouro ainda não entrou
- [x] Tabelas de ações, FIIs e ETFs da B3, ordenáveis e com filtro
- [x] FIIs com dados do informe mensal da CVM: DY, rendimento, P/VP, cotistas e segmento (01/11)
- [x] Detalhe do papel, com gráfico e link para o Investidor10 (01/11)
- [x] Duas visões: Bolsa (principal) e Notícias, com letreiro de índices fixo (01/11)
- [x] Listas de acompanhamento por pessoa, bem simples: nome da lista e tickers (sem quantidade nem preço médio), para espelhar o que cada um tem na própria instituição (01/11)
- [ ] Token da brapi como secret do Worker (o Ralph cria a conta e cola no painel); hoje só o Ibovespa depende dele

## Depois: React com SSR
- [ ] Reescrever a página em React, componente por componente, mantendo a API atual (`/api/*`)
- [ ] Renderizar no servidor (SSR) no próprio Worker, para a primeira tela já vir com as notícias
- [ ] Build automático no Workers Builds a cada push
- [ ] Trocar a versão atual pela nova só depois de conferir celular e desktop

## Depois
- [ ] Domínio próprio
- [ ] Marcar como lido, esconder fonte, atalhos de teclado
