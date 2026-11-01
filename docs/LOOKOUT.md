# Lookout: estado atual (01/11/2026)

Feed pessoal de notícias do Ralph, aberto só para convidados. Um Worker da Cloudflare (`news`, código em `src/`) serve a página, a API e o admin, e guarda tudo num banco D1 (`lookout`). O login é pelo Cloudflare Access; o Worker confere o token em cada requisição e, sem configuração, não deixa ninguém entrar.

Abas: Tech, Negócios, Investimentos, Notícias e Política, Esportes. Investimentos tem duas visões, Bolsa (a principal) e Notícias.

## Como as notícias entram

1. O cron do Worker roda a cada minuto e lê 6 feeds por vez (`src/coleta.js`, lista em `src/feeds.js`). Cada feed é lido no máximo a cada 90 min. O que já existe (mesmo id ou mesma URL) é ignorado; o resto vai para a tabela `candidatos` com status `novo`.
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
- Por pessoa: `favs/<email>` e `listas/<email>`.
- `meta`: `status`, `status-negocios`, `status-investimentos`, `status-politica`, `status-esportes`, `status-sombra` (última rodada de cada curadoria), `mercado`, `b3`, `fii`, `fii-cvm-ant`.
- `_sistema`: `seed`, `limpeza`, `b3-erro`, `cvm-etapa`, `cvm-erro`, `sonda-feeds`.

Outras tabelas: `candidatos`, `feeds_estado` (saúde de cada feed), `usuarios`, `grupos`, `usuario_grupo`. Esquema em `schema.sql`.

## API

`/api/me`, `/api/q` (lista de uma collection), `/api/doc` (um documento), `/api/favs`, `/api/listas`, `POST /api/mercado/atualizar`. A página só lê as collections de itens, destaques e `meta`, e a API confere a seção de cada pessoa antes de responder. As leituras de lista ficam 30 s na memória e 3 min no cache de borda.

Admin (só `ADMIN_EMAIL`), na página `/admin`: convidados (`/api/admin/usuarios`), grupos e seções (`/api/admin/grupos`, `/api/admin/membros/<email>`), rendimento das fontes nos últimos 10 dias (`/api/admin/fontes`), custos (`/api/admin/custos`), sonda de feeds (`/api/admin/sonda`) e recarga manual da CVM (`POST /api/admin/cvm`). Sem grupos criados, todo convidado vê tudo.

## Segredos

Ficam no painel da Cloudflare (Workers & Pages → `news` → Variables and Secrets), nunca no repositório: `ADMIN_EMAIL`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `BRAPI_TOKEN`, `CF_API_TOKEN` e `CF_ACCOUNT_ID` (estes dois para o card de custos). O `wrangler.jsonc` usa `keep_vars: true`, então deploy não apaga nada. Para rodar local, `DEV_EMAIL` vai no `.dev.vars`, que o git ignora.

## Regras para agentes

- Nunca `DROP`.
- `UPDATE` e `DELETE` só com lista explícita de ids.
- Coletores e curadoria não tocam em `favs/` nem em `listas/`.
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
