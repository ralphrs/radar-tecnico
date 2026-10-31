# Roadmap

## Agora
- [x] Lookout no Cloudflare Workers com D1, histórico importado e coletas espelhadas
- [x] Login pelo Cloudflare Access, lista de convidados e convites por WhatsApp ou e-mail
- [x] Favoritos por pessoa, sincronizados entre aparelhos

## Agora: coleta mais barata
- [x] Coleta por RSS no cron do Worker, tabela de candidatos e limpeza automática (docs/coleta.md)
- [ ] Tech com curadoria nova em teste lado a lado; trocar depois da comparação
- [ ] Política e Esportes no modelo novo; parar de gravar no artifact
- [ ] Abas Negócios e Investimentos, já no modelo novo (plano abaixo)

## Próximo: Negócios e Investimentos
Ordem das abas: Tech, Negócios, Investimentos, Política, Esportes.

Negócios (só notícias, curadoria Sonnet 3x/dia sobre candidatos do RSS)
- [ ] Startups e IA como mercado saem de Tech; rodada, aquisição, IPO e resultado de fintech também vêm para cá (produto e infra ficam em Tech)
- [ ] Temas: startups e VC, fusões e aquisições, big techs, IA como negócio, fintechs e bancos, varejo e consumo digital, trabalho em tech, regulação e antitruste, América Latina, China e Ásia
- [ ] Feeds: NeoFeed, Brazil Journal, Startups, Crunchbase News, Rest of World e Inc42 passam para negocios; novos: Pipeline, Exame, Bloomberg Línea, Reuters, CNBC, Fortune, Business Insider, Sifted, KrASIA, TechNode, Wamda, ECO, Il Sole 24 Ore
- [ ] Copiar para Negócios os itens atuais de startups e ia/mercado (lista de ids); tirar de Tech só depois de aprovado
- [ ] Teste paralelo e troca

Investimentos
- [ ] Notícias: bolsa e empresas, FIIs, renda fixa e juros, macro, cripto, regulação, IR; só fatos, sem recomendação de compra ou venda
- [ ] Painel de mercado: Ibovespa, IFIX, dólar, Selic, CDI, IPCA 12m, BTC
- [ ] Cotações no cron do Worker, sem tokens: ações e FIIs a cada 30 min no pregão (brapi grátis, 1 ticker por chamada, ~500 chamadas/dia), cripto a cada 30 min, BCB SGS e AwesomeAPI 1x/dia, Tesouro 1x/dia; botão "Atualizar agora" limitado a 1 vez a cada 5 min
- [ ] Listas de acompanhamento por pessoa, bem simples: nome da lista e tickers (sem quantidade nem preço médio), para espelhar o que cada um tem na própria instituição
- [ ] Token da brapi como secret do Worker (o Ralph cria a conta e cola no painel)

## Depois: React com SSR
- [ ] Reescrever a página em React, componente por componente, mantendo a API atual (`/api/*`)
- [ ] Renderizar no servidor (SSR) no próprio Worker, para a primeira tela já vir com as notícias
- [ ] Build automático no Workers Builds a cada push
- [ ] Trocar a versão atual pela nova só depois de conferir celular e desktop

## Depois
- [ ] Domínio próprio
- [ ] Marcar como lido, esconder fonte, atalhos de teclado
