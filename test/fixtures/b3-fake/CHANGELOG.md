# Extratos falsos da B3: histórico do roteiro

A versão fica em `VERSAO` e vai para o `manifesto.json` de cada geração. Regra em docs/dados-de-teste.md:

- **patch** (1.0.x): muda só texto (README, comentários). As linhas são as mesmas; não precisa reimportar nada.
- **minor** (1.x.0): o roteiro só acrescenta linhas (cenário novo, evento novo, papel novo). A correção resolve:
  `--diff <manifesto da última importação>` e importar os `correcao-*.xlsx`.
- **major** (x.0.0): alguma linha já gerada muda ou some (preço, quantidade, data, semente, faixa do passeio de
  preço). A correção não tira linhas: na conta de teste, apagar a carteira (digitar APAGAR) e importar a pasta nova.

Em cada entrada: o que mudou, quais cenários e o que fazer na conta de teste.

## 1.3.0 (10/11/2026)

Cenários 18, 19 e 20, para as posições fantasmas da carteira. Só acrescenta: nenhuma linha dos arquivos de antes muda,
e o retrato dos proventos a receber é o mesmo (os papéis novos não pagam provento). Os códigos são inventados (QZ*).

- 18, QZDT3, day trade com a venda antes: 300 compradas em 2025; em 11/03/2026, venda de 200 a R$ 5,12 listada antes da
  compra de 200 a R$ 5,18, na mesma corretora (linhas cruas, sem liquidação). Fica aberta com 300 a R$ 4,90 e
  realizado −R$ 12,00. Antes desta versão do cálculo a venda baixava a posição antiga (+R$ 44,00) e a compra subia o
  preço médio para R$ 5,09.
- 19, QZFA11 incorporado por QZFB11 (que já tinha 80): Atualização das duas no mesmo dia (150 que confirmam a custódia e
  98,64 novas), fração de 0,64, resgate das 150 a R$ 0,274 três dias úteis depois e leilão. QZFA11 em Encerradas
  ("incorporado por QZFB11"), QZFB11 com 178 cotas. Antes, QZFA11 ficava aberta para sempre, sem cotação.
- 20, QZFD11 incorporado por QZFC11, com recibo: Atualização de QZFC13 (31,57), resgate das 40 de QZFD11 a R$ 0,512,
  Atualização de QZFC11 (o recibo vira cota), fração de 0,57 e leilão. QZFC11 com 31 cotas e o custo de QZFD11 menos o
  resgate (antes, custo zero).
- O que muda na conta de teste: 20 posições abertas e 5 encerradas, patrimônio e totais com os papéis novos. Os papéis
  com dado a completar continuam 4. Nenhum número de antes em `test/b3-fake.test.mjs` mudou; o que mudou foi uma
  situação: XPTO3 (cenário 14) ganhou `parada` (sem cotação e sem linha desde 03/2022), da varredura nova de papel
  parado, que é o que se espera de um papel delistado. Nenhum cenário antigo tinha compra e venda do mesmo papel no
  mesmo dia, então a regra nova de day trade não mexeu em nenhum.
- `cenarios.mjs`: `PAPEIS` e `REF` com os códigos novos, `ESPERADO`, `ESPERADO_CONFERENCIA` (XPTO3 e os papéis novos) e
  `ESPERADO_FANTASMAS`. O teste de por lote ganhou QZFB11 na exceção da fração (a fração sai do lote incorporado), e o
  de encerradas aceita a encerrada sem venda quando ela foi incorporada.
- Na conta de teste: gerar a correção (`--diff` com o manifesto da última importação) e importar os `correcao-*.xlsx`.

## 1.2.0 (10/11/2026)

Cenários 16 e 17, para a Conferência da carteira. Só acrescenta: nenhuma linha dos arquivos de antes muda, e o
retrato dos proventos a receber é o mesmo (os papéis novos não pagam provento).

- 16, EGIE3 em três corretoras: 102 compradas no Inter (R$ 42), 1.147 compradas e vendidas na Nu Invest, portabilidade
  Inter → Rico em 14/08/2023 e 16/08/2023 (dias diferentes), bonificação de 10 + 0,2 de fração em 29/12/2025 e leilão da
  fração em 20/01/2026. Rico fica com 112 ações, custo R$ 4.276,36.
- 17, WEGE3, venda sem origem: 30 compradas em 2024 e 50 vendidas em 2025 (linhas cruas). Fica em Encerradas e dá o
  aviso de quantidade negativa, uma vez.
- O que muda na conta de teste: 17 posições abertas (EGIE3) e 3 encerradas (WEGE3), patrimônio e totais com os dois
  papéis, 4 papéis com dado a completar (EGIE3, WEGE3, ITSA4 e B3SA3) e o alerta de conferência. Os números de antes
  em `test/b3-fake.test.mjs` não mudaram; o teste de "nenhum aviso" passou a esperar o aviso de WEGE3 (`ESPERADO.avisos`)
  e o de por lote ganhou EGIE3 na exceção da fração, como B3SA3.
- `cenarios.mjs`: `REF` com a cotação inventada de EGIE3 e WEGE3, `ESPERADO` atualizado e `ESPERADO_CONFERENCIA`.
- Na conta de teste: gerar a correção (`--diff` com o manifesto da última importação) e importar os `correcao-*.xlsx`.

## 1.1.0 (10/11/2026)

Cenário 15, Proventos a Receber. Só acrescenta: nenhuma linha dos arquivos de antes muda.

- Arquivo novo `proventos-a-receber-<--ate>.xlsx`, o retrato do relatório da B3 (cabeçalho exato, quantidade em texto,
  conta inventada, linha "Total líquido"). Entram os proventos do roteiro com pagamento depois de `--ate` já
  provisionados: 20 dias antes por padrão, 60 no dividendo de PETR4, 40 no JCP de BBAS3 e 5 no rendimento de TRXF11
  (que assim fica fora do retrato do mês e dá o alerta). Um dividendo de ITSA4 em 28/04/2028 fica em "mais adiante".
- `c.prov` ganhou a opção `aviso` (dias entre a provisão e o pagamento). Ela não muda as linhas dos recebidos.
- `--diff` passa a incluir `correcao-<data>-proventos-a-receber.xlsx` com o retrato inteiro, menos quando é igual ao
  do manifesto anterior. O manifesto ganhou `retrato` (nome, data, linhas, total); `linhas` e `totais` seguem só com
  os extratos.
- Na conta de teste: gerar a correção (`--diff` com o manifesto da última importação) e importar; ou só importar o
  `proventos-a-receber-*.xlsx` da pasta nova.

## 1.0.0 (04/11/2026)

Primeira versão. 14 cenários, de jan/2020 até `--ate`, semente 2020.

- Papéis: PETR4, VALE3, MGLU3, ITSA4, B3SA3, BBAS3, BBSE3, XPTO3 (inventado), KNIP11 (com KNIP12 e KNIP13),
  VILG11, XPML11, TRXF11 (com TRXF12), BOVA11, IVVB11, AAPL34, NVDC34, IFRA11 e KNCA11.
- Na conta de teste: importar a pasta inteira.
