# Dados de teste da Minha carteira

A conta de teste (`ralph.viviane@gmail.com`) usa extratos falsos da B3, gerados por `test/fixtures/b3-fake/gerar.mjs`. São planilhas no formato que a Área do Investidor exporta (Negociação, Movimentação e Proventos recebidos), com papéis reais e números inventados. Nada vem da carteira do Admin: os papéis dele (a lista FII-Core-2026-11 e MXRF11, KNSC11, CPTS11 e GARE11) ficaram de fora.

## O que tem

- `test/fixtures/b3-fake/cenarios.mjs`: o roteiro. Um cenário por situação que a carteira precisa tratar (fracionário, encerrada com lucro e com prejuízo, grupamento, bonificação, desdobro, subscrição exercida, não exercida e cedida, fração e leilão, amortização, empréstimo, transferência entre corretoras, ETF, BDR, FI-Infra, Fiagro, linhas ignoradas, compra repetida no mesmo dia, aportes recentes e papel sem cotação). No fim, `ESPERADO` diz o que a tela tem de mostrar.
- `gerar.mjs`: executa o roteiro e grava as planilhas. Preço é um passeio aleatório mensal com semente fixa, dentro de uma faixa por papel; não segue a cotação histórica.
- `xlsx.py`: escreve e lê os .xlsx com openpyxl. O repositório não tem biblioteca de planilha e não vale pôr uma só para isso; o Node chama o Python.
- `VERSAO` e `CHANGELOG.md`: versão do roteiro e o que mudou em cada uma.
- `test/b3-fake.test.mjs`: gera, lê de volta como a página lê e passa por `src/carteira.js`. Entra no `npm test`. Sem python3 com openpyxl, os testes que mexem em planilha são pulados.

## Gerar

```
npm run b3-fake -- --saida /caminho/da/pasta --ate 2026-11-04
```

- `--saida`: pasta de destino (é criada se não existir).
- `--ate`: data final, AAAA-MM-DD. Sem ela, hoje. Nada depois dessa data entra no extrato.
- `--semente`: padrão 2020. Outra semente muda preços, quantidades sorteadas e proventos.

Sai na pasta:

- `negociacao-AAAA-MM-DD-12-00-00.xlsx` e `movimentacao-AAAA-MM-DD-12-00-00.xlsx`, o período inteiro;
- `proventos-recebidos-AAAA-01-01-a-AAAA-12-31.xlsx`, um por ano (a B3 limita o período desse relatório), o último até `--ate`;
- `README.md`, o roteiro em linguagem simples e o que esperar na tela: posições abertas com quantidade, PM e custo, encerradas com o resultado, totais de proventos e os alertas daquela data. Os números saem do próprio `src/carteira.js`, com a cotação de 04/11/2026 guardada em `cenarios.mjs`; na conta de teste o patrimônio vai bater só com a cotação do dia;
- `manifesto.json`: versão, semente, data final, linhas por arquivo e um hash por linha (o hash da chave de deduplicação de `src/carteira.js`; linha ignorada usa a linha inteira).

Mesma versão, mesma semente e mesma data final geram os mesmos arquivos, byte a byte.

## Importar na conta de teste

1. Entrar no Lookout com `ralph.viviane@gmail.com` ("Trocar de conta" no menu, se estiver logado com outra). A conta precisa ter Investimentos liberado no admin.
2. Menu da conta → Importar extratos e soltar todos os .xlsx da pasta de uma vez.
3. Conferir a prévia com o README: o número de linhas novas e as 5 ignoradas da Movimentação (Tesouro e CDB).
4. Importar. A Minha carteira tem de mostrar as 16 posições abertas e as 2 encerradas do README.

Importar de novo os mesmos arquivos dá 0 linhas novas.

## Correções

Para avançar a data sem duplicar nada, gere só a diferença contra o manifesto da última importação:

```
npm run b3-fake -- --saida /caminho/correcao --ate 2026-12-15 --diff /caminho/da/pasta/manifesto.json
```

Saem `correcao-AAAA-MM-DD-negociacao.xlsx`, `correcao-AAAA-MM-DD-movimentacao.xlsx` e `correcao-AAAA-MM-DD-proventos-recebidos.xlsx` (só os tipos que tiverem linha nova), com o mesmo cabeçalho dos extratos, e `correcao-AAAA-MM-DD-manifesto.json`, o manifesto completo desta geração. Importe os .xlsx por cima do que já está na conta. Na próxima correção, use esse manifesto novo no `--diff`.

A diferença é por multiconjunto, igual à deduplicação da importação: linha que já estava não volta, e as duas compras iguais do mesmo dia continuam sendo duas. Mesmo importando a pasta inteira de novo em vez da correção, a deduplicação segura; a correção existe para a prévia mostrar só o que é novo.

A correção só acrescenta. Se o terminal avisar "linhas do manifesto anterior que não existem mais", alguma linha já importada mudou: a conta de teste precisa ser apagada (Minha carteira, digitar APAGAR) e a pasta nova importada inteira.

As datas do roteiro são fixas no calendário (os aportes de 2026 caem nos dias 2 e 16 de cada mês), então mudar `--ate` só acrescenta linhas. O que o README promete de empréstimo e alerta de rendimento menor vale com `--ate` entre 13/10/2026 e 12/12/2026; fora disso esses dois mudam e o resto fica.

## Versão do roteiro

A versão está em `test/fixtures/b3-fake/VERSAO` e vai no manifesto.

- **patch** (1.0.1): só texto. As linhas são as mesmas e nada muda na conta de teste.
- **minor** (1.1.0): cenário novo ou evento novo, sem mexer nas linhas que já existiam. Gerar a correção e importar.
- **major** (2.0.0): alguma linha já gerada muda ou some (preço, quantidade, data, faixa do passeio de preço, semente padrão). Apagar a carteira da conta de teste e importar a pasta nova.

Mudou um cenário: suba a versão, anote no `CHANGELOG.md` o que mudou e o que fazer na conta de teste, ajuste `ESPERADO` em `cenarios.mjs` se a tela muda, e rode `npm test`.
