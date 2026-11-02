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
  ROXO34: "BR", XPBR31: "BR", INBR32: "BR", PAGS34: "BR", STOC31: "BR",
};

export const paisBdr = (t) => PAIS_BDR[String(t || "").toUpperCase()] || "US";
