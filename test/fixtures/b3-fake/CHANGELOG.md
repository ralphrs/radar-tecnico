# Extratos falsos da B3: histórico do roteiro

A versão fica em `VERSAO` e vai para o `manifesto.json` de cada geração. Regra em docs/dados-de-teste.md:

- **patch** (1.0.x): muda só texto (README, comentários). As linhas são as mesmas; não precisa reimportar nada.
- **minor** (1.x.0): o roteiro só acrescenta linhas (cenário novo, evento novo, papel novo). A correção resolve:
  `--diff <manifesto da última importação>` e importar os `correcao-*.xlsx`.
- **major** (x.0.0): alguma linha já gerada muda ou some (preço, quantidade, data, semente, faixa do passeio de
  preço). A correção não tira linhas: na conta de teste, apagar a carteira (digitar APAGAR) e importar a pasta nova.

Em cada entrada: o que mudou, quais cenários e o que fazer na conta de teste.

## 1.0.0 (04/11/2026)

Primeira versão. 14 cenários, de jan/2020 até `--ate`, semente 2020.

- Papéis: PETR4, VALE3, MGLU3, ITSA4, B3SA3, BBAS3, BBSE3, XPTO3 (inventado), KNIP11 (com KNIP12 e KNIP13),
  VILG11, XPML11, TRXF11 (com TRXF12), BOVA11, IVVB11, AAPL34, NVDC34, IFRA11 e KNCA11.
- Na conta de teste: importar a pasta inteira.
