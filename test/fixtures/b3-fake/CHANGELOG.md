# Extratos falsos da B3: histórico do roteiro

A versão fica em `VERSAO` e vai para o `manifesto.json` de cada geração. Regra em docs/dados-de-teste.md:

- **patch** (1.0.x): muda só texto (README, comentários). As linhas são as mesmas; não precisa reimportar nada.
- **minor** (1.x.0): o roteiro só acrescenta linhas (cenário novo, evento novo, papel novo). A correção resolve:
  `--diff <manifesto da última importação>` e importar os `correcao-*.xlsx`.
- **major** (x.0.0): alguma linha já gerada muda ou some (preço, quantidade, data, semente, faixa do passeio de
  preço). A correção não tira linhas: na conta de teste, apagar a carteira (digitar APAGAR) e importar a pasta nova.

Em cada entrada: o que mudou, quais cenários e o que fazer na conta de teste.

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
