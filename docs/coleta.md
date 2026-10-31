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

## Candidatos

- Tabela `candidatos`: id (mesmo esquema dos itens: "i" + 16 hex do SHA-256 da url), radar, url limpa (sem utm), título, fonte, país, data, trecho de até 280 caracteres.
- A tarefa lê os candidatos com `status = 'novo'`, escolhe e, no fim, marca todos os que avaliou como `lido`.
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
