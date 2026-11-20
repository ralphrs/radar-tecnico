/* Radar de Oficina: ícones desenhados para as ferramentas, os insumos e as madeiras (pedido de 19/11).
 *
 * Desenho próprio, em linha, no traço dos ícones do site (viewBox 24, traço 1,75, pontas redondas, currentColor).
 * Nada copiado de biblioteca de ícones nem de marca. Um ícone por tipo de ferramenta; item sem ícone próprio usa o da
 * subcategoria (Oficina.iconeDe). Script clássico: a página usa window.OficinaIcones; o Worker e os testes leem
 * globalThis.OficinaIcones (só para conferir que todo ícone citado existe).
 */
(function (raiz) {
  "use strict";
  /* id: [nome, conteúdo SVG (só path, rect, circle, line, polyline, ellipse)] */
  const ICONES = {
    // medição e marcação
    trena: ["Trena", '<rect x="3" y="7" width="12" height="12" rx="3"/><circle cx="9" cy="13" r="2.5"/><path d="M15 16h6v3h-6"/><path d="M18 16v1.5"/>'],
    esquadro: ["Esquadro", '<path d="M4 3h4v13h13v4H4z"/><path d="M8 7h2M8 10h2M8 13h2M11 16v-2M14 16v-2M17 16v-2"/>'],
    paquimetro: ["Paquímetro", '<path d="M3 6h18v4H3z"/><path d="M5 10v9l3-3v-6"/><path d="M14 10v8l-3-3v-5"/><path d="M8 6v2M11 6v2M17 6v2"/>'],
    nivel: ["Nível", '<rect x="2" y="9" width="20" height="6" rx="1.5"/><rect x="9" y="10.5" width="6" height="3" rx="1.5"/><circle cx="12" cy="12" r=".6"/>'],
    lapis: ["Lápis de marcação", '<path d="M4 20l1.5-5L16 4.5l3.5 3.5L9 18.5z"/><path d="M14 6.5l3.5 3.5M5.5 15l3.5 3.5"/>'],
    // serras manuais
    serrote: ["Serrote", '<path d="M4 6h3l14 9-1 3H4z"/><path d="M4 6v12"/><path d="M7 18l1-1.4 1 1.4 1-1.4 1 1.4 1-1.4 1 1.4 1-1.4 1 1.4 1-1.4 1 1.4 1-1.4 1 1.4"/>'],
    "serra-costa": ["Serra de costas", '<path d="M3 8h17v3H3z"/><path d="M3 11h17v6H5"/><path d="M3 8v4c0 1 1 2 2 2"/><path d="M20 8v9"/>'],
    "arco-serra": ["Arco de serra", '<path d="M4 16V7h16v9"/><path d="M4 16h16"/><path d="M2 16h3M19 16h3"/><path d="M6 16l1-1 1 1 1-1 1 1 1-1 1 1 1-1 1 1 1-1 1 1"/>'],
    // serras elétricas e de bancada
    "serra-circular": ["Serra circular", '<circle cx="12" cy="13" r="6.5"/><circle cx="12" cy="13" r="1.5"/><path d="M12 3.5v3M18.5 6.5l-2 2M21.5 13h-3M5.5 6.5l2 2M2.5 13h3"/>'],
    "tico-tico": ["Serra tico-tico", '<path d="M5 5h11a3 3 0 0 1 3 3v3H8z"/><path d="M8 11v4h9v-4"/><path d="M12 15v6"/><path d="M11 17.5l1 .5-1 .5 1 .5"/>'],
    "serra-bancada": ["Serra de bancada", '<path d="M2 14h20"/><path d="M4 14v6M20 14v6"/><path d="M7 14a5 5 0 0 1 10 0"/><path d="M12 9v1.5M15.5 10.5l-1 1M8.5 10.5l1 1"/>'],
    "serra-esquadria": ["Serra de esquadria", '<path d="M3 20h18"/><path d="M5 20l2-4h10l2 4"/><circle cx="12" cy="10" r="5"/><path d="M12 10l6-6"/><circle cx="12" cy="10" r="1"/>'],
    "serra-fita": ["Serra de fita", '<path d="M6 21V4a1 1 0 0 1 1-1h7a5 5 0 0 1 5 5v13"/><path d="M3 13h14"/><path d="M10 3v18"/><path d="M14 21h7"/>'],
    // plainas
    plaina: ["Plaina manual", '<path d="M3 17h18l-2-5H8l-3 5"/><path d="M10 12V8a2 2 0 0 1 4 0v4"/><path d="M15 12l3-4"/><circle cx="18.5" cy="7.5" r="1.5"/>'],
    "plaina-eletrica": ["Plaina elétrica", '<path d="M3 17h18v-3H3z"/><path d="M6 14V9h9l3 5"/><path d="M8 9V6h4"/><path d="M5 20h4"/>'],
    desengrossadeira: ["Desengrossadeira", '<rect x="3" y="5" width="18" height="10" rx="1.5"/><path d="M3 18h18"/><path d="M7 15v3M17 15v3"/><circle cx="12" cy="10" r="2"/>'],
    // formões e entalhe
    formao: ["Formão", '<path d="M10 3h4v8h-4z"/><path d="M10.5 11h3l1 9h-5z"/><path d="M9.5 20h5"/>'],
    goiva: ["Goiva", '<path d="M10 3h4v7h-4z"/><path d="M11 10h2v6"/><path d="M8 16a4 4 0 0 0 8 0z"/>'],
    // furação e fixação
    furadeira: ["Furadeira", '<path d="M4 6h11a2 2 0 0 1 2 2v1H4z"/><path d="M17 7.5h4"/><path d="M8 9l-1 9h4l1-9"/><path d="M6 18h7"/>'],
    parafusadeira: ["Parafusadeira", '<path d="M3 6h11l2 2v2H3z"/><path d="M16 9h3"/><path d="M19 9l2 0"/><path d="M6 10l-1 7h5l1-7"/><rect x="4" y="17" width="7" height="3" rx="1"/>'],
    broca: ["Broca", '<path d="M10 3h4v5h-4z"/><path d="M10 8l4 2-4 2 4 2-4 2 2 4 2-4"/>'],
    "serra-copo": ["Serra-copo", '<path d="M5 9h14v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M5 19l1 1.5 1-1.5 1 1.5 1-1.5 1 1.5 1-1.5 1 1.5 1-1.5 1 1.5 1-1.5 1 1.5 1-1.5"/><path d="M12 3v6"/>'],
    "furadeira-bancada": ["Furadeira de bancada", '<path d="M6 21h12"/><path d="M8 21V4"/><path d="M8 5h9v6H8"/><path d="M14 11v3"/><path d="M8 16h9"/>'],
    // fresagem
    tupia: ["Tupia", '<path d="M6 4h12v9H6z"/><path d="M4 13h16v3H4z"/><path d="M12 16v4"/><path d="M10 7h4"/>'],
    fresa: ["Fresa", '<path d="M10.5 3h3v9h-3z"/><path d="M8 12h8l-1 4h-6z"/><path d="M9 16l3 5 3-5"/>'],
    // lixamento e acabamento
    "lixadeira-orbital": ["Lixadeira orbital", '<path d="M5 15h14v4H5z"/><path d="M7 15l1-6h8l1 6"/><path d="M10 9V5h4v4"/>'],
    "lixadeira-cinta": ["Lixadeira de cinta", '<rect x="3" y="13" width="18" height="6" rx="3"/><path d="M7 13V9h8l2 4"/><path d="M10 9V6h4"/>'],
    lixa: ["Lixa", '<path d="M4 6h16v12H4z"/><path d="M7 9h.01M10 11h.01M13 9h.01M16 12h.01M8 14h.01M12 15h.01M15 15h.01"/>'],
    raspilha: ["Raspilha", '<path d="M4 7h16v10H4z"/><path d="M4 17c3-2 13-2 16 0"/>'],
    pistola: ["Pistola de pintura", '<path d="M8 4h8v5H8z"/><path d="M4 11h13v3H4z"/><path d="M2 12.5h2"/><path d="M13 14l1 6h3l-1-6"/>'],
    pincel: ["Pincel e rolo", '<path d="M9 3h6v7H9z"/><path d="M8 10h8v3H8z"/><path d="M9 13l-1 8h8l-1-8"/>'],
    lata: ["Verniz, óleo e tinta", '<path d="M5 7h14v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><ellipse cx="12" cy="7" rx="7" ry="2"/><path d="M8 13h8"/>'],
    // fixação e aperto
    sargento: ["Sargento", '<path d="M5 3v18"/><path d="M5 4h7v3"/><path d="M5 19h7v-3"/><path d="M12 7v9"/><path d="M12 11h7"/>'],
    "grampo-c": ["Grampo C", '<path d="M16 5H8a4 4 0 0 0-4 4v6a4 4 0 0 0 4 4h4"/><path d="M16 3v6"/><path d="M14 19h4"/><path d="M16 19v-6"/>'],
    morsa: ["Morsa", '<path d="M3 20h18"/><path d="M5 20v-6h6v6"/><path d="M13 20v-6h6"/><path d="M5 14V9h4v5"/><path d="M19 17h3"/>'],
    // bancadas e apoio
    bancada: ["Bancada", '<path d="M2 8h20v3H2z"/><path d="M4 11v9M20 11v9"/><path d="M4 16h16"/>'],
    cavalete: ["Cavalete", '<path d="M3 6h18"/><path d="M6 6l-3 14M9 6l3 14M15 6l-3 14M18 6l3 14"/>'],
    gabarito: ["Gabarito", '<path d="M4 4h16v16H4z"/><path d="M4 9h11v11"/><circle cx="17.5" cy="6.5" r="1"/><circle cx="6.5" cy="6.5" r="1"/>'],
    // colas, ferragens e consumíveis
    cola: ["Cola", '<path d="M8 10h8v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1z"/><path d="M10 10V7h4v3"/><path d="M12 7V3"/><path d="M10 15h4"/>'],
    parafuso: ["Parafuso", '<path d="M8 3h8l-1 3H9z"/><path d="M10 6v12l2 3 2-3V6"/><path d="M10 9l4 1.5M10 12l4 1.5M10 15l4 1.5"/>'],
    prego: ["Prego", '<path d="M7 3h10"/><path d="M11 3v15l1 3 1-3V3"/>'],
    dobradica: ["Dobradiça e ferragem", '<path d="M4 5h7v14H4z"/><path d="M13 5h7v14h-7z"/><path d="M11 8h2M11 12h2M11 16h2"/><circle cx="7.5" cy="8" r=".6"/><circle cx="16.5" cy="16" r=".6"/>'],
    chapa: ["Chapa e painel", '<path d="M3 8l9-4 9 4-9 4z"/><path d="M3 8v4l9 4 9-4V8"/>'],
    madeira: ["Madeira", '<ellipse cx="6" cy="12" rx="3" ry="6"/><path d="M6 6h12c1.7 0 3 2.7 3 6s-1.3 6-3 6H6"/><ellipse cx="6" cy="12" rx="1.2" ry="2.5"/>'],
    // torno
    torno: ["Torno", '<path d="M2 18h20"/><path d="M4 18v-7h4v7"/><path d="M17 18v-6h3v6"/><path d="M8 13h9"/><path d="M11 13c0-2 3-2 3 0"/>'],
    // carpintaria de obra
    martelo: ["Martelo", '<path d="M4 7h9v4H4z"/><path d="M13 8h3l3-2"/><path d="M9 11v10"/>'],
    pregador: ["Pregador", '<path d="M3 6h14a2 2 0 0 1 2 2v3H3z"/><path d="M5 11v6h4"/><path d="M14 11l1 9h4l-1-9"/>'],
    // corte de metal
    esmerilhadeira: ["Esmerilhadeira", '<path d="M3 9h12v4H3z"/><path d="M15 10h4"/><circle cx="8" cy="16" r="4"/><path d="M8 13v.01"/>'],
    policorte: ["Policorte", '<path d="M3 20h18"/><path d="M6 20v-4h12v4"/><circle cx="12" cy="9" r="5"/><path d="M12 9l7-5"/>'],
    disco: ["Disco de corte e desbaste", '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 4v2M20 12h-2M12 20v-2M4 12h2"/>'],
    plasma: ["Corte a plasma", '<path d="M4 20l7-7"/><path d="M9 11l4 4 6-6-4-4z"/><path d="M19 9l2 2"/><path d="M17 3l1 2M21 7l-2 1"/>'],
    tesoura: ["Tesoura de chapa", '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M8 15L16 3M16 15L8 3"/>'],
    // solda
    "solda-inversora": ["Máquina de solda", '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="8" cy="12" r="2"/><path d="M13 10h5M13 14h5"/><path d="M8 3v3M16 3v3"/>'],
    "tocha-mig": ["Tocha MIG/TIG", '<path d="M3 19c3-1 4-3 6-5"/><path d="M9 14l4-4 4 4-4 4z"/><path d="M17 14l4 1"/>'],
    eletrodo: ["Eletrodo e porta-eletrodo", '<path d="M4 20l6-6"/><path d="M8 12l4 4 3-3-4-4z"/><path d="M14 10l7-7"/>'],
    macarico: ["Maçarico e oxicorte", '<path d="M3 21l8-8"/><path d="M11 13l6-6"/><path d="M17 7l3-1-1 3z"/><path d="M8 13l3 3"/><circle cx="5" cy="15" r="1"/>'],
    "mascara-solda": ["Máscara de solda", '<path d="M5 9a7 7 0 0 1 14 0v6c0 3-3 6-7 6s-7-3-7-6z"/><rect x="8" y="10" width="8" height="4" rx="1"/>'],
    // dobra e conformação
    dobradeira: ["Dobradeira e calandra", '<path d="M3 15h10l8-8"/><path d="M3 19h18"/><path d="M5 15v4M19 15v4"/>'],
    bigorna: ["Bigorna", '<path d="M3 7h13l5 2H16v3a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3v-1H5z"/><path d="M8 20h8l-2-5h-4z"/>'],
    // rosca e manutenção
    macho: ["Macho e cossinete", '<path d="M9 3h6v4H9z"/><path d="M10 7v12l2 2 2-2V7"/><path d="M10 10l4 1M10 13l4 1M10 16l4 1"/>'],
    lima: ["Lima e grosa", '<path d="M10 3h4l1 13h-6z"/><path d="M11 16v5h2v-5"/><path d="M10.5 6l3 1M10.5 9l3 1M10.5 12l3 1"/>'],
    escova: ["Escova de aço", '<path d="M4 9h12v4H4z"/><path d="M5 13v4M7 13v4M9 13v4M11 13v4M13 13v4M15 13v4"/><path d="M16 11h5"/>'],
    "pedra-afiar": ["Pedra de afiar", '<path d="M3 13l4-4h14l-4 4z"/><path d="M3 13v4h14v-4"/><path d="M17 17l4-4V9"/>'],
    compressor: ["Compressor", '<ellipse cx="9" cy="14" rx="6" ry="4"/><path d="M15 14h3v-6h-4v3"/><circle cx="6" cy="20" r="1"/><circle cx="12" cy="20" r="1"/>'],
    // segurança e pó
    oculos: ["Óculos de proteção", '<path d="M2 10h20"/><path d="M3 10v3a3 3 0 0 0 3 3h2l2-3h4l2 3h2a3 3 0 0 0 3-3v-3"/>'],
    luva: ["Luva", '<path d="M7 21v-8L5 9a1.4 1.4 0 0 1 2.5-1.2L9 10V4.5a1.3 1.3 0 0 1 2.6 0V9V3.5a1.3 1.3 0 0 1 2.6 0V9V4.5a1.3 1.3 0 0 1 2.6 0V14l-1 7z"/>'],
    abafador: ["Protetor auricular", '<path d="M5 13a7 7 0 0 1 14 0"/><rect x="3" y="12" width="4" height="7" rx="2"/><rect x="17" y="12" width="4" height="7" rx="2"/>'],
    respirador: ["Respirador", '<path d="M5 10c0-3 3-5 7-5s7 2 7 5v3c0 3-3 6-7 6s-7-3-7-6z"/><circle cx="8.5" cy="13" r="2"/><circle cx="15.5" cy="13" r="2"/><path d="M3 9l2 1M21 9l-2 1"/>'],
    "coletor-po": ["Coletor de pó", '<path d="M6 21h12"/><path d="M7 21V9h10v12"/><path d="M8 9c0-3 2-5 4-5s4 2 4 5"/><path d="M17 12h4v-4"/>'],
    metal: ["Tubo, perfil e barra de metal", '<path d="M3 8h14v8H3z"/><path d="M17 8l4-2v8l-4 2"/><path d="M3 8l4-2h14"/><path d="M5 10h10v4H5z"/>'],
  };
  const svgSimbolo = (id) => `<symbol id="oi-${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICONES[id][1]}</symbol>`;
  /* a folha inteira, posta uma vez na página (escondida) para os <use href="#oi-..."> */
  const folha = () => `<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false">${Object.keys(ICONES).map(svgSimbolo).join("")}</svg>`;
  const existe = (id) => Object.prototype.hasOwnProperty.call(ICONES, id);
  const nomeDe = (id) => (existe(id) ? ICONES[id][0] : "");
  raiz.OficinaIcones = { ICONES, ids: Object.keys(ICONES), existe, nomeDe, folha };
})(typeof globalThis !== "undefined" ? globalThis : this);
