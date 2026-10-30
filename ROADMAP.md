# Roadmap

## Agora
- [x] Lookout no Cloudflare Workers com D1, histórico importado e coletas espelhadas
- [x] Login pelo Cloudflare Access, lista de convidados e convites por WhatsApp ou e-mail
- [x] Favoritos por pessoa, sincronizados entre aparelhos

## Próximo passo: React com SSR
- [ ] Reescrever a página em React, componente por componente, mantendo a API atual (`/api/*`)
- [ ] Renderizar no servidor (SSR) no próprio Worker, para a primeira tela já vir com as notícias
- [ ] Build automático no Workers Builds a cada push
- [ ] Trocar a versão atual pela nova só depois de conferir celular e desktop

## Depois
- [ ] Desligar o artifact e deixar o D1 como única fonte (as coletas passam a gravar só no Lookout)
- [ ] Domínio próprio
- [ ] Marcar como lido, esconder fonte, atalhos de teclado
