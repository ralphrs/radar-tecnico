# Roadmap

## Agora
- [x] Lookout no Cloudflare Workers com D1, histórico importado e coletas espelhadas
- [x] Login pelo Cloudflare Access, lista de convidados e convites por WhatsApp ou e-mail
- [x] Favoritos por pessoa, sincronizados entre aparelhos

## Agora: coleta mais barata
- [x] Coleta por RSS no cron do Worker, tabela de candidatos e limpeza automática (docs/coleta.md)
- [ ] Tech com curadoria nova em teste lado a lado; trocar depois da comparação
- [ ] Política e Esportes no modelo novo; parar de gravar no artifact
- [ ] Abas Negócios e Investimentos, já no modelo novo

## Depois: React com SSR
- [ ] Reescrever a página em React, componente por componente, mantendo a API atual (`/api/*`)
- [ ] Renderizar no servidor (SSR) no próprio Worker, para a primeira tela já vir com as notícias
- [ ] Build automático no Workers Builds a cada push
- [ ] Trocar a versão atual pela nova só depois de conferir celular e desktop

## Depois
- [ ] Domínio próprio
- [ ] Marcar como lido, esconder fonte, atalhos de teclado
