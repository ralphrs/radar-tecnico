# Lookout

Radar pessoal de notícias (Tech, Política e Esportes) rodando no Cloudflare Workers, com banco D1 e login pelo Cloudflare Access.

Configuração no Cloudflare (Worker, Access, variáveis e problemas já vistos): [docs/cloudflare.md](docs/cloudflare.md).

## Como funciona

- `public/index.html` é a página. Ela conversa com a API do Worker por um adaptador que imita o banco do artifact antigo, então o código da página é o mesmo.
- `src/index.js` é o Worker: confere quem está logado, serve a página, a API (`/api/q`, `/api/doc`, `/api/favs`, `/api/me`) e a área de convidados (`/admin`).
- `src/auth.js` valida o token do Cloudflare Access (`Cf-Access-Jwt-Assertion`). Sem configuração, o site não abre para ninguém.
- As coletas agendadas (no Claude) gravam no banco do artifact e repetem as mesmas mudanças no D1.
- `public/seed/` tem o histórico exportado do artifact. O cron do Worker importa uma parte por minuto até terminar; depois disso o cron não faz nada.

## Banco D1

Nome `lookout`, id `b83811df-f894-41b0-8d3b-4323faf1e1ff`. Esquema em `schema.sql`:

- `docs(collection, id, data, coletado, atualizado)`: itens, destaques e status de cada radar; favoritos em `favs/<email>`; controle interno em `_sistema`.
- `usuarios(email, nome, criado, ultimo_acesso)`: lista de convidados.

## Variáveis (no painel do Cloudflare, não no repositório)

| Variável | Exemplo |
|---|---|
| `ADMIN_EMAIL` | o seu e-mail; entra sempre e vê a página de convidados |
| `ACCESS_TEAM_DOMAIN` | `suaequipe.cloudflareaccess.com` |
| `ACCESS_AUD` | o "Application Audience (AUD) Tag" da aplicação no Access |

O `wrangler.jsonc` usa `keep_vars: true`, então um deploy não apaga essas variáveis.

## Rodar localmente

```
npm install
npx wrangler d1 execute lookout --local --file schema.sql
printf 'DEV_EMAIL=voce@exemplo.com\nADMIN_EMAIL=voce@exemplo.com\n' > .dev.vars
npx wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"   # importa uma parte do histórico por chamada
```

`DEV_EMAIL` só existe no `.dev.vars` (ignorado pelo git) e pula a checagem do Access.

## Regerar o histórico

```
python3 scripts/montar-seed.py <pasta-com-a-exportacao>
```
