# Coleta e curadoria

Como as notícias chegam ao Lookout, desde 31/10/2026.

## Divisão de trabalho

| Etapa | Quem faz | Custo em tokens |
|---|---|---|
| Ler os feeds RSS e Atom das fontes | Cron do Worker, a cada minuto, alguns feeds por vez (`src/coleta.js`) | zero |
| Descartar o que já existe (mesmo id ou mesma url) | Worker | zero |
| Guardar o que é novo em `candidatos` (feeds comuns) | Worker | zero |
| Guardar os posts de subreddit em `foruns-<radar>`, sem curadoria | Worker | zero |
| Escolher, classificar, escrever título e resumo, montar destaques | Tarefa agendada do Claude | baixo |
| Buscar o que não tem feed (whitepapers, conteúdo antigo dos temas acumulativos, eventos, placares) | Tarefa agendada, no máximo 10 buscas por rodada | baixo |
| Apagar o que passou do prazo (inclusive `foruns-*` com mais de 3 dias) | Cron do Worker, uma vez por hora (minuto 7) | zero |

## Feeds

- A lista fica em `src/feeds.js`: `[radar, fonte, país, url]`. O país alimenta a bandeira ao lado da fonte.
- Cada feed é lido no máximo a cada 90 minutos. Feed com erro espera mais (dobra a cada erro, até 16 vezes).
- Para ver a saúde dos feeds:

```sql
SELECT fonte, url, erros_seguidos, erro, itens_ultima, novos_total, ultimo_ok
FROM feeds_estado ORDER BY erros_seguidos DESC, fonte;
```

Feed com `erros_seguidos` alto: corrija a URL em `src/feeds.js` ou tire da lista.

## Subreddits

- Em `src/feeds.js` com um quinto campo, `"reddit"`, e a URL `https://www.reddit.com/r/<sub>/top/.rss?t=day` (Atom dos mais votados do dia; até 04/11/2026 era `/new/.rss`, que tem o mesmo formato). Hoje são 38 (04/11/2026): tech (r/opensource, r/databricks, r/MiniPCs, r/hermesagent, r/antiai, r/programming, r/netsec, r/MachineLearning, r/LocalLLaMA, r/devops, r/kubernetes, r/dataengineering, r/softwarearchitecture, r/ExperiencedDevs, r/brdev), negocios (r/fintech, r/FintechStartups, r/smallbusiness, r/TheFinanceCareer, r/startups, r/Entrepreneur, r/SaaS, r/payments, r/empreendedorismo), investimentos (r/investimentos, r/farialimabets, r/dividends, r/investing, r/stocks, r/ValueInvesting), politica, que na tela é Notícias e Política (r/EspacoPolitica, r/worldnews, r/geopolitics, r/brasil), e esportes (r/futebol, r/soccer, r/brasileirao, r/SCInternacional). A fonte é `r/<sub>`. Com isso as cinco seções têm o bloco "Nos fóruns" e o widget Fóruns · <seção>.
- **Ritmo:** fila própria, fora dos 6 por minuto. No máximo 1 subreddit por minuto de cron, cada um relido a cada 120 min, do que está há mais tempo sem leitura para o mais recente. Só nas chamadas ao Reddit o user-agent é `Lookout/1.0 (agregador pessoal de noticias; +https://lookout.ralph-renato.workers.dev)`. A sonda do admin segue o mesmo ritmo: URL do Reddit vai uma por minuto e só nos minutos em que a coleta não leu subreddit.
- **Conta do ritmo com 38:** 1 leitura por minuto dá 120 leituras a cada 120 min, então cada subreddit volta na hora certa e sobram 82 vagas; uma volta completa leva 38 min. Se o recuo por 429 ficar frequente (vários subreddits com `erro = 'HTTP 429'` em `feeds_estado`), subir `REDDIT.INTERVALO_MIN` para 180.
- **429:** fica em `feeds_estado` (`erro = 'HTTP 429'`, `erros_seguidos` + 1) e a espera desse subreddit dobra a cada erro seguido (240 min, 480, 960, até 24 h); os outros subreddits ficam para o minuto seguinte. As constantes estão em `REDDIT`, em `src/coleta.js`.
- **403:** conta em `feeds_estado.seguidos_403`. Na terceira seguida o `erro` vira `bloqueado: HTTP 403 3 vezes seguidas` e o card "Rendimento das fontes" mostra "bloqueado". O feed segue sendo tentado uma vez a cada 24 h; uma resposta boa zera a contagem e tira a marca.
- Subreddit sem post novo responde um `<feed>` sem `<entry>`: conta como leitura boa, com zero itens.
- A troca de URL criou linhas novas em `feeds_estado` (a chave é a URL): a espera por 429 recomeça do zero nas URLs novas e as linhas de `/new/` ficam lá paradas; o card do admin não mostra mais o erro delas.

## Nos fóruns (posts de subreddit)

Post de fórum não é notícia: em 24 h a curadoria descartou todos os que chegaram (raso ou fora do tema), gastando token. Desde 04/11/2026 eles **não entram em `candidatos`**. Cada post lido vai só para a collection `foruns-<radar>` (`foruns-tech`, `foruns-negocios`, `foruns-investimentos`, `foruns-politica` e `foruns-esportes`), que a página mostra no bloco "Nos fóruns" e no widget Fóruns · <seção> (`docs/LOOKOUT.md`).

- Doc: id = id do post no Reddit (o `<id>` sem `t3_`, ou o trecho `/comments/<id>/` da URL). `data` = `{ titulo, url, linkExterno, sub, autor, publicado, resumo, coletado }`: `titulo` como veio (flair fica), `url` o post, `linkExterno` o link original sem utm quando o post só aponta para fora (vazio no resto), `sub` o subreddit da URL do post, `autor` só o nome de usuário (sem `/u/` nem link), `publicado` o `published` do Atom, `resumo` o texto do post sem HTML, até 300 caracteres, `coletado` a hora da gravação (também na coluna `coletado`). Sem votos nem comentários: o Atom não traz e nada é inventado.
- Dedupe pelo id: `INSERT ... ON CONFLICT(collection, id) DO NOTHING`. Releituras do top do dia não reescrevem o doc. `feeds_estado.novos_total` dos subreddits conta os posts novos no fórum.
- Limpeza (`limpar()`, minuto 7): `foruns-*` com mais de 3 dias pelo `coletado` (`REDDIT.DIAS_FORUM`), por lista de ids, em lotes de 90. Sem a trava dos 60 das collections de itens: é uma collection de passagem.
- Vai para o espelho de São Paulo (`COLECOES_ESPELHO`), entra em `LISTAS` do `/api/q` e em `SECAO_DA_COLECAO` (seção do radar).
- Admin, "Rendimento das fontes": cada subreddit aparece uma vez, com status e erro do feed e a coluna "No fórum" (posts dele em `foruns-*` agora); as colunas da curadoria ficam como "não passa pela curadoria". Candidatos `reddit` de antes de 04/11 continuam na tabela até a limpeza de 10 dias, sem aparecer no card.

```sql
SELECT collection, json_extract(data, '$.sub') AS sub, count(*) AS posts, max(coletado) AS ultimo
FROM docs WHERE collection LIKE 'foruns-%' GROUP BY collection, sub ORDER BY collection, posts DESC;
```

```sql
SELECT fonte, erro, erros_seguidos, seguidos_403, ultima_checagem, ultimo_ok, novos_total
FROM feeds_estado WHERE url LIKE 'https://www.reddit.com/%' ORDER BY fonte;
```

## Candidatos

- Tabela `candidatos`: id (mesmo esquema dos itens: "i" + 16 hex do SHA-256 da url), radar, url limpa (sem utm), título, fonte, país, data, trecho de até 280 caracteres, `tipo` e `link_externo`.
- Até 04/11/2026, candidato com `tipo = 'reddit'` era um post de subreddit (hoje eles vão para `foruns-<radar>`, acima; os antigos saem com a limpeza de 10 dias): `url` é o link do post (`https://www.reddit.com/r/<sub>/comments/...`), `titulo` o título como veio (prefixo de flair entre colchetes, como "[P]", fica: a curadoria decide), `fonte` "r/<sub>", `publicado` o `published` do Atom (ou `updated`), `trecho` o texto do post sem HTML, até 600 caracteres. Post sem texto que aponta para fora traz o link original em `link_externo`, para a curadoria citar a fonte de verdade; imagem e vídeo do próprio Reddit não contam como link externo. Os candidatos novos têm `tipo` e `link_externo` vazios. O Atom do Reddit não marca post fixado e o /new/ não lista os fixados; se alguma marca aparecer, o post fica de fora.
- As colunas `tipo`, `link_externo` (candidatos) e `seguidos_403` (feeds_estado) entram por `ALTER TABLE ... ADD COLUMN` feito pela própria coleta quando faltam (`garantirColunas`), uma conferência por isolate.
- A tarefa reserva um lote (`lote` = horário da rodada) dos candidatos com `status = 'novo'`, escolhe e, no fim, marca cada um como `publicado` ou `descartado` com `motivo` (repetido, promocional, fora-do-tema, antigo, raso). O site só mostra o que virou item.
- Candidatos com mais de 10 dias são apagados.

## Limpeza por idade

Feita por `limpar()` em `src/coleta.js`, com as mesmas regras que as tarefas usavam:

- Tech: temas acumulativos nunca saem por idade. Nos outros: notícia 30 dias, release, vídeo, podcast e review 3 meses, whitepaper 12 meses, artigo 2 anos. Evento ou lançamento com data futura fica.
- Política: notícia 30 dias, análise, vídeo e podcast 3 meses, oficial 12 meses.
- Esportes: notícia e resultado 30 dias, análise, vídeo e podcast 3 meses.
- Destaques: 7 dias.
- Nos fóruns (`foruns-*`): 3 dias, sem trava.
- Trava: se uma collection tiver mais de 60 itens vencidos de uma vez, nada é apagado nela e o motivo fica em `_sistema/limpeza`.

## Fase de teste do Tech

A tarefa "Radar Técnico: curadoria nova (teste)" roda às 7h22, 13h22 e 19h22 (Sonnet) e grava em `sombra-items`, `sombra-destaques` e `meta/status-sombra`, que não aparecem no site. A tarefa antiga continua gravando em `items` até a comparação ser aprovada.
