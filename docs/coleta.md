# Coleta e curadoria

Como as notícias chegam ao Lookout, desde 31/10/2026.

## Divisão de trabalho

| Etapa | Quem faz | Custo em tokens |
|---|---|---|
| Ler os feeds RSS e Atom das fontes | Cron do Worker, a cada minuto, alguns feeds por vez (`src/coleta.js`) | zero |
| Descartar o que já existe (mesmo id ou mesma url) | Worker | zero |
| Guardar o que é novo em `candidatos` | Worker | zero |
| Escolher, classificar, escrever título e resumo, montar destaques | Tarefa agendada do Claude | baixo |
| Buscar o que não tem feed (whitepapers, conteúdo antigo dos temas acumulativos, eventos, placares) | Tarefa agendada, no máximo 10 buscas por rodada | baixo |
| Apagar o que passou do prazo | Cron do Worker, uma vez por hora (minuto 7) | zero |

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

- Em `src/feeds.js` com um quinto campo, `"reddit"`, e a URL `https://www.reddit.com/r/<sub>/new/.rss` (Atom). Hoje: tech (r/opensource, r/databricks, r/MiniPCs, r/hermesagent, r/antiai), negocios (r/fintech, r/FintechStartups, r/smallbusiness, r/TheFinanceCareer) e politica, que na tela é Notícias e Política (r/EspacoPolitica). A fonte é `r/<sub>`.
- **Ritmo:** fila própria, fora dos 6 por minuto. No máximo 1 subreddit por minuto de cron, cada um relido a cada 120 min, do que está há mais tempo sem leitura para o mais recente. Só nas chamadas ao Reddit o user-agent é `Lookout/1.0 (agregador pessoal de noticias; +https://news.ralph-renato.workers.dev)`. A sonda do admin segue o mesmo ritmo: URL do Reddit vai uma por minuto e só nos minutos em que a coleta não leu subreddit.
- **429:** fica em `feeds_estado` (`erro = 'HTTP 429'`, `erros_seguidos` + 1) e a espera desse subreddit dobra a cada erro seguido (240 min, 480, 960, até 24 h); os outros subreddits ficam para o minuto seguinte. As constantes estão em `REDDIT`, em `src/coleta.js`.
- **403:** conta em `feeds_estado.seguidos_403`. Na terceira seguida o `erro` vira `bloqueado: HTTP 403 3 vezes seguidas` e o card "Rendimento das fontes" mostra "bloqueado". O feed segue sendo tentado uma vez a cada 24 h; uma resposta boa zera a contagem e tira a marca.
- Subreddit sem post novo responde um `<feed>` sem `<entry>`: conta como leitura boa, com zero itens.

```sql
SELECT fonte, erro, erros_seguidos, seguidos_403, ultima_checagem, ultimo_ok, novos_total
FROM feeds_estado WHERE url LIKE 'https://www.reddit.com/%' ORDER BY fonte;
```

## Candidatos

- Tabela `candidatos`: id (mesmo esquema dos itens: "i" + 16 hex do SHA-256 da url), radar, url limpa (sem utm), título, fonte, país, data, trecho de até 280 caracteres, `tipo` e `link_externo`.
- Candidato com `tipo = 'reddit'` é um post de subreddit: `url` é o link do post (`https://www.reddit.com/r/<sub>/comments/...`), `titulo` o título como veio (prefixo de flair entre colchetes, como "[P]", fica: a curadoria decide), `fonte` "r/<sub>", `publicado` o `published` do Atom (ou `updated`), `trecho` o texto do post sem HTML, até 600 caracteres. Post sem texto que aponta para fora traz o link original em `link_externo`, para a curadoria citar a fonte de verdade; imagem e vídeo do próprio Reddit não contam como link externo. Nos outros candidatos `tipo` e `link_externo` ficam vazios. O Atom do Reddit não marca post fixado e o /new/ não lista os fixados; se alguma marca aparecer, o post fica de fora.
- As colunas `tipo`, `link_externo` (candidatos) e `seguidos_403` (feeds_estado) entram por `ALTER TABLE ... ADD COLUMN` feito pela própria coleta quando faltam (`garantirColunas`), uma conferência por isolate.
- A tarefa reserva um lote (`lote` = horário da rodada) dos candidatos com `status = 'novo'`, escolhe e, no fim, marca cada um como `publicado` ou `descartado` com `motivo` (repetido, promocional, fora-do-tema, antigo, raso). O site só mostra o que virou item.
- Candidatos com mais de 10 dias são apagados.

## Limpeza por idade

Feita por `limpar()` em `src/coleta.js`, com as mesmas regras que as tarefas usavam:

- Tech: temas acumulativos nunca saem por idade. Nos outros: notícia 30 dias, release, vídeo, podcast e review 3 meses, whitepaper 12 meses, artigo 2 anos. Evento ou lançamento com data futura fica.
- Política: notícia 30 dias, análise, vídeo e podcast 3 meses, oficial 12 meses.
- Esportes: notícia e resultado 30 dias, análise, vídeo e podcast 3 meses.
- Destaques: 7 dias.
- Trava: se uma collection tiver mais de 60 itens vencidos de uma vez, nada é apagado nela e o motivo fica em `_sistema/limpeza`.

## Fase de teste do Tech

A tarefa "Radar Técnico: curadoria nova (teste)" roda às 7h22, 13h22 e 19h22 (Sonnet) e grava em `sombra-items`, `sombra-destaques` e `meta/status-sombra`, que não aparecem no site. A tarefa antiga continua gravando em `items` até a comparação ser aprovada.
