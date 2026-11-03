// País da empresa por trás de cada BDR. A maioria dos BDRs negociados na B3 é de empresa americana,
// então o que não está aqui vale como "US". Entram só os casos de que temos certeza; na dúvida, fica de fora.
// Mercado Livre (MELI34) tem sede na Argentina e no Uruguai, mas é listada na Nasdaq: conta como US.
export const PAIS_BDR = {
  // Europa
  NESN34: "CH", ASML34: "NL", SAPP34: "DE", NVOB34: "DK",
  // Ásia
  TMCO34: "JP", SONY34: "JP", TSMC34: "TW",
  BABA34: "CN", TCEH34: "CN", BIDU34: "CN", JDCO34: "CN",
  // Empresas brasileiras listadas lá fora, com BDR aqui
  ROXO34: "BR", XPBR31: "BR", INBR32: "BR", INBR34: "BR", PAGS34: "BR", STOC31: "BR", STOC34: "BR", JBSS32: "BR", AURA33: "BR", EVEB31: "BR",
  // Outros
  NOKI34: "FI", ARNC34: "US",
};

// A brapi devolve o nome do BDR igual ao código. Nomes dos mais negociados, para a tabela e o detalhe;
// quem não está aqui fica com o código mesmo. Final 39 é BDR de ETF.
export const NOME_BDR = {
  ROXO34: "Nubank", M2ST34: "MicroStrategy", MELI34: "Mercado Livre", NVDC34: "NVIDIA", JBSS32: "JBS", INBR34: "Banco Inter", XPBR31: "XP",
  AURA33: "Aura Minerals", ITLC34: "Intel", AMZO34: "Amazon", SPCX34: "AST SpaceMobile", TSLA34: "Tesla", GOGL34: "Alphabet (Google)", NFLX34: "Netflix",
  MSFT34: "Microsoft", AAPL34: "Apple", STOC34: "Stone", AVGO34: "Broadcom", BABA34: "Alibaba", M2RV34: "Marvell", M1TA34: "Meta", TSMC34: "TSMC",
  C2OI34: "Coinbase", BKNG34: "Booking", P2AN34: "Palantir", N1VO34: "Novo Nordisk", SPGI34: "S&P Global", C2RW34: "CrowdStrike", N2ET34: "Cloudflare",
  PAGS34: "PagBank", BERK34: "Berkshire Hathaway", ORCL34: "Oracle", BSLV39: "iShares Silver", BOAC34: "Bank of America", JPMC34: "JPMorgan",
  ASML34: "ASML", CTGP34: "Citigroup", A1MD34: "AMD", U1BE34: "Uber", MOSC34: "Mosaic", BHER39: "iShares Core S&P 500 (IVV)", BAAX39: "iShares Russell 2000",
  IBIT39: "iShares Bitcoin", WALM34: "Walmart", COCA34: "Coca-Cola", BSOX39: "iShares Semiconductors (SOXX)", INTU34: "Intuit", LILY34: "Eli Lilly",
  NIKE34: "Nike", DUOL34: "Duolingo", BTLT39: "iShares 20+ Year Treasury (TLT)", QCOM34: "Qualcomm", VISA34: "Visa", VERZ34: "Verizon", P2LT34: "Palantir",
  MCDC34: "McDonald's", BSHY39: "iShares High Yield (HYG)", BIEM39: "iShares Emerging Markets", PYPL34: "PayPal", BIBB39: "iShares Biotech", EXXO34: "ExxonMobil",
  MSCD34: "Mastercard", DISB34: "Disney", JNJB34: "Johnson & Johnson", GSGI34: "Goldman Sachs", CHCM34: "Chemours", CMCS34: "Comcast", CHVX34: "Chevron",
  UPSS34: "UPS", FCXO34: "Freeport-McMoRan", CATP34: "Caterpillar", ADBE34: "Adobe", NOKI34: "Nokia", PFIZ34: "Pfizer", MRCK34: "Merck", GDXB39: "VanEck Gold Miners",
  BOEF39: "iShares EAFE", UNHH34: "UnitedHealth", BIDU34: "Baidu", IBKR34: "Interactive Brokers", UPAC34: "Universal Parks", ATTB34: "AT&T", BCSA34: "Barclays",
  ARNC34: "Arconic", EVEB31: "Embraer Eve", S2GM34: "Sea", N1OW34: "ServiceNow", BURA39: "iShares Russell 1000", G2DI33: "Gold BDR", BCPX39: "iShares Core S&P 500",
};
export const nomeBdr = (t) => NOME_BDR[String(t || "").toUpperCase()] || "";

export const paisBdr = (t) => PAIS_BDR[String(t || "").toUpperCase()] || "US";

// Listagem cruzada: papel nos EUA (como está em src/eua.js, classe com ponto) -> BDR na B3. Montado cruzando os
// 150 BDRs de meta/b3 (02/11) com NOME_BDR. Onde o código não é óbvio, fica de fora: P2AN34 e P2LT34 aparecem
// os dois como Palantir, então PLTR não entra; GOGL34 é da classe A (GOOGL), não da GOOG; os BDRs de ETF de
// S&P 500 são vários (BHER39, BIVB39, BCPX39) e nenhum entra. A ficha só mostra a linha quando o BDR está em
// meta/b3 (e o papel americano em meta/eua), então código que não estiver lá não aparece.
export const BDR_DE_US = {
  NVDA: "NVDC34", AAPL: "AAPL34", MSFT: "MSFT34", AMZN: "AMZO34", GOOGL: "GOGL34", META: "M1TA34", TSLA: "TSLA34",
  NFLX: "NFLX34", "BRK.B": "BERK34", JPM: "JPMC34", V: "VISA34", MA: "MSCD34", DIS: "DISB34", KO: "COCA34",
  PEP: "PEPB34", WMT: "WALM34", XOM: "EXXO34", JNJ: "JNJB34", PG: "PGCO34", NVO: "N1VO34", INTC: "ITLC34",
  AVGO: "AVGO34", ORCL: "ORCL34", BAC: "BOAC34", C: "CTGP34", AMD: "A1MD34", UBER: "U1BE34", LLY: "LILY34",
  NKE: "NIKE34", QCOM: "QCOM34", VZ: "VERZ34", MCD: "MCDC34", PYPL: "PYPL34", GS: "GSGI34", CMCSA: "CMCS34",
  CVX: "CHVX34", UPS: "UPSS34", CAT: "CATP34", T: "ATTB34", ADBE: "ADBE34", PFE: "PFIZ34", MRK: "MRCK34",
  UNH: "UNHH34", INTU: "INTU34", BKNG: "BKNG34", NOW: "N1OW34",
  // fora do S&P 100, mas listados nos EUA com BDR aqui
  MELI: "MELI34", MSTR: "M2ST34", TSM: "TSMC34", BABA: "BABA34", COIN: "C2OI34", SPGI: "SPGI34", CRWD: "C2RW34",
  NET: "N2ET34", NU: "ROXO34", ASML: "ASML34", MRVL: "M2RV34", SE: "S2GM34", PAGS: "PAGS34", STNE: "STOC34",
  DUOL: "DUOL34", IBKR: "IBKR34", BIDU: "BIDU34", FCX: "FCXO34", MOS: "MOSC34", NOK: "NOKI34", CC: "CHCM34", BCS: "BCSA34",
  // ETFs com um BDR só e sem dúvida
  TLT: "BTLT39", SLV: "BSLV39", IWM: "BAAX39",
};
export const US_DE_BDR = Object.fromEntries(Object.entries(BDR_DE_US).map(([us, bdr]) => [bdr, us]));
