# Lookout: estado atual (03/11/2026)

Feed pessoal de notícias do Ralph, aberto só para convidados. Um Worker da Cloudflare (`news`, código em `src/`) serve a página, a API e o admin, e guarda tudo num banco D1 (`lookout`). As leituras da página saem de um espelho do D1 em São Paulo (veja "Banco e espelho"). O login é pelo Cloudflare Access; o Worker confere o token em cada requisição e, sem configuração, não deixa ninguém entrar.

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
- `meta`: `status`, `status-negocios`, `status-investimentos`, `status-politica`, `status-esportes`, `status-sombra` (última rodada de cada curadoria), `mercado`, `b3`, `fii`, `fii-resumo`, `fii-cvm-ant`.
- `_sistema`: `seed`, `limpeza`, `b3-erro`, `cvm-etapa`, `cvm-erro`, `sonda-feeds`.

Outras tabelas: `candidatos`, `feeds_estado` (saúde de cada feed), `usuarios`, `grupos`, `usuario_grupo`. Esquema em `schema.sql`.

## Banco e espelho

O D1 fica no leste dos EUA e não existe D1 na América do Sul. Antes o Worker rodava com Smart Placement perto do banco, e quem abria a página no Brasil fazia a viagem longa em toda requisição. Agora o Worker roda na borda, perto de quem acessa, e as leituras saem de um espelho em São Paulo: um Durable Object com SQLite (`Espelho`, em `src/espelho.js`, uma instância só, criada com `locationHint: "sam"`).

- **Fonte da verdade continua o D1.** Coletas, crons de mercado, admin e curadorias gravam só nele, do mesmo jeito de antes. O espelho é só leitura.
- **O que vai para o espelho:** as collections de itens e destaques, `meta`, `_sistema`, `favs/<email>` e `listas/<email>`, mais cópias inteiras de `usuarios`, `grupos` e `usuario_grupo`. No admin, favoritos e listas aparecem somados, sem o e-mail de ninguém.
- **Favoritos e listas:** a leitura sai do espelho como o resto (D1 de reserva). A gravação vai ao D1 com `await` e, só depois que deu certo, a mesma linha vai ao espelho em `ctx.waitUntil` (write-through), para a pessoa ver a mudança na leitura seguinte sem esperar o cron. Apagar faz o mesmo com `remover`, inclusive quando o admin exclui um convidado. Se o write-through falhar, só vai para o log; a comparação do minuto seguinte conserta. Na sincronia, o D1 é lido por faixa da chave (`collection >= 'favs/' AND collection < 'favs0'`), que usa o índice; um `LIKE` varreria a tabela.
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

## FIIs

Os dados dos fundos vêm do informe mensal da CVM (`src/cvm.js`), em duas etapas no cron: o ano anterior vai para `meta/fii-cvm-ant` e o ano corrente monta `meta/fii` (completo, com histórico, lido no diálogo do papel) e `meta/fii-resumo` (sem histórico, lido na tabela e nos filtros). O cabeçalho do CSV geral fica em `_sistema/cvm-etapa.cabecalhoGeral` para conferir no admin.

Campos de cada fundo em `meta/fii` (nomes curtos para o doc não inchar): `n` nome, `s` segmento, `a` administrador, `c` CNPJ, `ref`, `vp`, `cot`, `pl`, `cotas` e `h` (histórico mensal). Do cadastro vêm também:

- `m`, mandato, em rótulo curto: Renda, Papel (Títulos e Valores Mobiliários), Híbrido, Desenvolvimento para Renda, Desenvolvimento para Venda. O que não estiver no mapa sai em Title Case, do jeito que veio. No informe de 2026 o mandato veio vazio para todos os fundos; quando falta, o ano anterior completa (`fii-cvm-ant.cad`).
- `g`, gestão: Ativa ou Passiva. A CVM manda "Definida" para a passiva.
- `pz`, prazo: "Indeterminado", "Determinado (até AAAA-MM-DD)" quando há `Data_Prazo_Duracao`, ou só "Determinado".
- `ini`, início do funcionamento (AAAA-MM-DD), `pub`, público-alvo, e `site`, só quando começa com http.

`m`, `g` e `a` existem sempre (vazios quando faltam); `pz`, `ini`, `pub` e `site` só entram quando vieram. Campo vazio no informe mais recente é completado pelo anterior do mesmo ano e, depois, pelo ano anterior. `meta/fii-resumo` leva `m` e `g` quando existem. O administrador fica cru no banco; a página arruma a caixa ("BTG Pactual Servicos Financeiros S.A.").

Na página, o diálogo de um FII mostra chips de mandato, gestão, segmento e prazo e o bloco "Sobre o fundo" (administrador, início em "mar/2019", público-alvo, prazo, CNPJ e link do site). Na Bolsa, com FIIs, o filtro Mandato fica abaixo de Segmento, com contagem e várias escolhas, e vale para o Pregão e a tabela; fica salvo em `radar-bolsa-filtros` junto com os outros. Enquanto nenhum fundo tiver mandato, o grupo mostra só um aviso e um filtro salvo antes não esconde nada. A tabela ganha a coluna Mandato a partir de 1200 px; abaixo disso o mandato fica no diálogo. Como os outros filtros da coluna esquerda, o de Mandato só existe a partir de 900 px.

## API

`/api/me`, `/api/q` (lista de uma collection), `/api/doc` (um documento), `/api/favs`, `/api/listas`, `POST /api/mercado/atualizar`. A página só lê as collections de itens, destaques e `meta`, e a API confere a seção de cada pessoa antes de responder. As leituras de lista ficam 30 s na memória e 3 min no cache de borda.

Admin (só `ADMIN_EMAIL`), na página `/admin`: convidados (`/api/admin/usuarios`), grupos e seções (`/api/admin/grupos`, `/api/admin/membros/<email>`), rendimento das fontes nos últimos 10 dias (`/api/admin/fontes`), custos (`/api/admin/custos`), sonda de feeds (`/api/admin/sonda`), espelho em São Paulo (`/api/admin/espelho`) e recarga manual da CVM (`POST /api/admin/cvm`). Sem grupos criados, todo convidado vê tudo.

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
