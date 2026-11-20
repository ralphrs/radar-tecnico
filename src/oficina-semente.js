// Semente do Radar de Oficina (pedido de 19/11): a taxonomia e, de cada item, só o que é seguro afirmar sem fonte.
//
// Ferramentas e insumos: nome, apelidos, categoria, subcategoria, ofícios, tipo (ferramentas), nível (ferramentas), ícone
// e uma frase dizendo o que é. Madeiras: nome, nomes populares, nome científico, família, grupo e tipo. Tudo o mais nasce
// vazio (detalhes, marcas, preços, origem, notas): quem preenche é a tarefa de levantamento, com fonte.
// "Geralmente indicada para" (indicadaPara) só onde é conhecimento básico do ofício; na dúvida, fica vazio.
//
// Gravada uma vez pelo cron (semearOficina, src/oficina.js), com INSERT OR IGNORE e a marca _sistema/oficina-semente.
// Versão nova (SEMENTE_VERSAO): entram só os itens com `desde` maior que a versão da marca e as categorias e
// subcategorias que faltam; nada que o Admin editou é sobrescrito, e item que ele tirou não volta.
//
// Ferramentas de "Colas, ferragens e consumíveis" moraram aqui na primeira versão do pedido; foram para a aba Insumos
// (são o que se gasta e se repõe). Em Ferramentas ficou só o que é ferramenta.

export const SEMENTE_VERSAO = 1;
const of = (s) => [s.includes("m") && "marcenaria", s.includes("c") && "carpintaria", s.includes("s") && "serralheria"].filter(Boolean);
const NIVEL = { e: "essencial", i: "intermediaria", a: "avancada" };
const slug = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60).replace(/-$/, "");
const lista = (s) => (s ? s.split(";").map((x) => x.trim()).filter(Boolean) : []);

// ---------- Ferramentas ----------
// [id, nome, indicadaPara, icone, [linhas]]; linha: [nome, apelidos "a;b", ofícios "mcs", tipo, nível e|i|a, ícone ("" = o da subcategoria), resumo]
const FERR = [
  ["medicao", "Medição e marcação", "Medir, traçar e conferir esquadro e nível antes de cortar.", "trena", [
    ["medir", "Medir", "", "trena", [
      ["Trena", "trena de bolso", "mcs", "medicao", "e", "", "Fita métrica de aço que recolhe sozinha numa caixa, para medir peças e vãos."],
      ["Metro articulado", "metro de carpinteiro;metro dobrável", "mc", "medicao", "e", "", "Régua dobrável em segmentos, usada para medir e traçar na obra."],
      ["Régua de aço", "escala de aço", "mcs", "medicao", "e", "", "Régua metálica graduada e rígida, que mede e guia o lápis ou o riscador."],
      ["Paquímetro", "paquímetro universal", "mcs", "medicao", "i", "paquimetro", "Instrumento de bico fixo e bico móvel que mede espessuras, diâmetros e profundidades."],
      ["Trena a laser", "medidor a laser", "mc", "medicao", "i", "", "Aparelho que mede distâncias com um feixe de laser, útil em cômodos e vãos grandes."],
      ["Medidor de umidade de madeira", "higrômetro de madeira", "mc", "medicao", "i", "madeira", "Aparelho que indica o teor de umidade da madeira, para saber se ela está seca para trabalhar."],
    ]],
    ["esquadros", "Esquadros e ângulos", "Conferir e traçar 90 e 45 graus e copiar ângulos.", "esquadro", [
      ["Esquadro de aço", "", "mcs", "medicao", "e", "", "Esquadro de 90 graus em aço para conferir e traçar ângulos retos."],
      ["Esquadro combinado", "esquadro de combinação", "mcs", "medicao", "e", "", "Régua com cabeça deslizante que marca 90 e 45 graus e serve de profundímetro."],
      ["Esquadro de carpinteiro de obra", "esquadro de telhado", "c", "medicao", "e", "", "Esquadro grande em L com escalas, usado para traçar cortes de caibros e escadas."],
      ["Esquadro triangular", "speed square;esquadro de velocidade", "c", "medicao", "e", "", "Esquadro triangular de alumínio que marca ângulos de telhado e guia a serra circular."],
      ["Falsa-esquadria", "suta", "mc", "medicao", "i", "", "Esquadro de lâmina regulável que copia e transfere ângulos quaisquer."],
      ["Transferidor de ângulo", "goniômetro", "mcs", "medicao", "i", "", "Instrumento para medir e marcar ângulos em graus."],
      ["Esquadro magnético de solda", "ímã de solda", "s", "medicao", "e", "", "Suporte com ímã que segura tubos e chapas em 45 ou 90 graus enquanto se solda."],
    ]],
    ["marcar", "Marcar e traçar", "Riscar linhas e pontos de corte e furo.", "lapis", [
      ["Lápis de carpinteiro", "", "mc", "manual", "e", "", "Lápis de grafite achatado que não rola e marca bem em madeira bruta."],
      ["Riscador", "riscador de aço;punção de traçar", "ms", "manual", "e", "", "Haste de ponta endurecida que risca uma linha fina na madeira ou no metal."],
      ["Graminho", "gramil", "m", "manual", "i", "", "Régua com ponta riscadora que traça linhas paralelas à borda da peça."],
      ["Compasso de pontas", "", "ms", "manual", "i", "", "Compasso de pontas secas para traçar círculos e transferir medidas."],
      ["Punção de centro", "puncionador", "s", "manual", "e", "", "Ponteiro de aço que, com uma batida, marca o ponto exato para a broca começar."],
      ["Giz de linha", "batedor de linha;cordão de marcação", "c", "manual", "e", "", "Carretel com cordão e pó colorido que, esticado e batido, marca uma linha reta longa."],
    ]],
    ["nivel", "Nível e prumo", "Conferir horizontal e vertical na montagem.", "nivel", [
      ["Nível de bolha", "", "mcs", "medicao", "e", "", "Régua com ampolas de líquido que mostram se a superfície está em nível ou em prumo."],
      ["Nível a laser", "nível laser de linhas", "mc", "medicao", "i", "", "Aparelho que projeta linhas de laser niveladas e aprumadas na parede ou no piso."],
      ["Prumo de face", "fio de prumo", "c", "medicao", "e", "", "Peso preso a um fio que mostra a vertical exata."],
      ["Nível de mangueira", "", "c", "medicao", "e", "", "Mangueira transparente com água que transfere a mesma altura entre dois pontos distantes."],
      ["Nível magnético", "nível de serralheiro", "s", "medicao", "e", "", "Nível com ímã na base, que fica preso a tubos e perfis de aço."],
    ]],
  ]],
  ["serras-manuais", "Serras manuais", "", "serrote", [
    ["serrotes", "Serrotes", "Cortar tábuas a mão, na obra ou na bancada.", "serrote", [
      ["Serrote de corte transversal", "serrote de cortar fibra", "mc", "manual", "e", "", "Serrote de dentes afiados como faca, para cortar a madeira atravessando as fibras."],
      ["Serrote de corte longitudinal", "serrote de rasgar", "m", "manual", "i", "", "Serrote de dentes em formato de formão, feito para cortar ao longo das fibras."],
      ["Serrote universal", "serrote de dente travado", "mc", "manual", "e", "", "Serrote de dentes temperados para corte geral em madeira e chapas."],
      ["Serrote de ponta", "serrote de punção", "mc", "manual", "e", "", "Serrote de lâmina estreita e pontuda para cortes internos a partir de um furo."],
    ]],
    ["serras-costas", "Serras de costas e japonesas", "Cortes finos e precisos em encaixes.", "serra-costa", [
      ["Serra de costas", "serra de espiga", "m", "manual", "i", "", "Serra de lâmina fina reforçada no dorso, para cortes precisos em encaixes."],
      ["Serra japonesa ryoba", "ryoba", "m", "manual", "i", "", "Serra japonesa que corta no puxar, com dentes transversais de um lado e longitudinais do outro."],
      ["Serra japonesa dozuki", "dozuki", "m", "manual", "i", "", "Serra japonesa de costas, de lâmina muito fina, para encaixes de precisão."],
      ["Serra de rente", "serra flexível", "m", "manual", "i", "", "Serra de lâmina flexível e sem trava, que corta cavilhas rente à superfície."],
      ["Caixa de meia-esquadria", "serra com caixa de meia-esquadria", "mc", "manual", "e", "", "Caixa com guias que mantém o serrote em 45 e 90 graus."],
    ]],
    ["arcos", "Arcos de serra", "Cortar metal e recortar curvas a mão.", "arco-serra", [
      ["Arco de serra", "serra de arco", "s", "manual", "e", "", "Arco que tensiona uma lâmina de dentes finos para cortar metal, tubos e plástico."],
      ["Serra de recortes", "arco de marchetaria", "m", "manual", "i", "", "Arco fundo com lâmina fina para recortar curvas em madeira fina."],
      ["Serra de arco para madeira", "serra de cortar lenha", "c", "manual", "e", "", "Arco com lâmina de dentes grandes para cortar toras e galhos."],
    ]],
  ]],
  ["serras-eletricas", "Serras elétricas e de bancada", "", "serra-circular", [
    ["serras-portateis", "Serras portáteis", "Cortes na peça ou na obra, levando a máquina até o material.", "serra-circular", [
      ["Serra circular", "serra circular manual", "mc", "eletrica", "e", "", "Serra portátil de disco dentado para cortes retos em tábuas e chapas."],
      ["Serra circular a bateria", "", "mc", "bateria", "i", "", "Serra circular sem fio, alimentada por bateria."],
      ["Serra de trilho", "serra de mergulho;track saw", "m", "eletrica", "a", "", "Serra circular que corre num trilho e mergulha no material, para cortes limpos em chapas."],
      ["Serra tico-tico", "serra de recorte", "mcs", "eletrica", "e", "tico-tico", "Serra de lâmina curta que sobe e desce, para recortes retos e curvos."],
      ["Serra sabre", "serra reciprocante", "cs", "eletrica", "i", "tico-tico", "Serra de lâmina longa em vaivém, usada em demolição, poda e cortes brutos."],
      ["Multiferramenta oscilante", "multicortadora", "mc", "eletrica", "i", "tico-tico", "Máquina de lâmina oscilante que corta rente, raspa e lixa em cantos apertados."],
      ["Serra mármore", "", "c", "eletrica", "i", "", "Serra portátil de disco diamantado para cortar pisos, pedras e alvenaria."],
    ]],
    ["serras-bancada", "Serras de bancada", "Cortes repetidos e no esquadro, com a peça indo até a máquina.", "serra-bancada", [
      ["Serra de bancada", "serra circular de mesa", "m", "estacionaria", "i", "", "Serra com disco que sai de uma mesa, para cortes longos com guia paralela."],
      ["Serra esquadrejadeira", "esquadrejadeira", "m", "estacionaria", "a", "", "Serra de mesa com carro deslizante, feita para esquadrejar chapas grandes."],
      ["Serra de esquadria", "serra de meia-esquadria;serra de destopo", "mc", "eletrica", "e", "serra-esquadria", "Serra de disco em braço basculante para cortar peças em ângulo e no esquadro."],
      ["Serra de esquadria telescópica", "", "mc", "eletrica", "i", "serra-esquadria", "Serra de esquadria com braço em trilhos, para cortar peças mais largas."],
      ["Serra de fita", "serra fita de marcenaria", "m", "estacionaria", "a", "serra-fita", "Serra com lâmina em laço contínuo, que faz curvas e desdobra tábuas."],
      ["Serra de recorte de bancada", "serra tico-tico de bancada", "m", "estacionaria", "i", "serra-fita", "Máquina de lâmina fina em vaivém para recortes delicados."],
    ]],
  ]],
  ["plainas", "Plainas e desbaste", "", "plaina", [
    ["plainas-manuais", "Plainas manuais", "Aplainar, alisar e acertar a madeira sem pó nem barulho.", "plaina", [
      ["Plaina nº 4", "plaina de alisar", "m", "manual", "e", "", "Plaina manual média, usada para alisar e acertar superfícies."],
      ["Plaina nº 5", "plaina de uso geral;jack plane", "m", "manual", "i", "", "Plaina de corpo médio-longo, boa para desbaste e acerto geral."],
      ["Garlopa", "plaina nº 7;plaina de juntar", "m", "manual", "a", "", "Plaina longa que endireita bordas e faces compridas."],
      ["Plaina de bloco", "plaina de topo", "m", "manual", "e", "", "Plaina pequena de ângulo baixo, usada com uma mão em topos e chanfros."],
      ["Plaina de rebaixo", "", "m", "manual", "a", "", "Plaina com lâmina que vai até a borda, para abrir e acertar rebaixos."],
      ["Plaina de fundo", "guilherme;router plane", "m", "manual", "a", "", "Plaina que acerta o fundo de rasgos e rebaixos na mesma profundidade."],
      ["Raspadeira de raio", "spokeshave", "m", "manual", "i", "", "Ferramenta de dois cabos para modelar curvas, cabos e pernas."],
    ]],
    ["plainas-eletricas", "Plainas elétricas", "Desbastar e ajustar portas e peças na obra.", "plaina-eletrica", [
      ["Plaina elétrica", "", "mc", "eletrica", "e", "", "Plaina portátil de cilindro rotativo para desbastar e ajustar portas e peças."],
      ["Plaina elétrica a bateria", "", "mc", "bateria", "i", "", "Plaina portátil sem fio."],
    ]],
    ["desbaste", "Desempeno e desengrosso", "Deixar tábuas brutas retas, no esquadro e na espessura.", "desengrossadeira", [
      ["Desempenadeira", "", "m", "estacionaria", "a", "", "Máquina que aplaina uma face e um canto da tábua, deixando tudo reto e no esquadro."],
      ["Desengrossadeira", "plaina desengrossadeira", "m", "estacionaria", "a", "", "Máquina que aplaina a tábua na espessura desejada, paralela à face já reta."],
      ["Lixadeira de tambor", "lixadeira de cilindro", "m", "estacionaria", "a", "lixadeira-cinta", "Máquina com rolo de lixa que calibra a espessura de tampos e painéis."],
    ]],
  ]],
  ["formoes", "Formões, goivas e entalhe", "", "formao", [
    ["formoes", "Formões", "Limpar encaixes, abrir mortiças e acertar peças.", "formao", [
      ["Formão de bancada", "formão chanfrado", "mc", "manual", "e", "", "Lâmina de aço com cabo, usada para desbastar, limpar encaixes e ajustar peças."],
      ["Formão de mortiça", "bedame;formão de encaixe", "m", "manual", "i", "", "Formão grosso e reforçado para abrir mortiças a golpes de macete."],
      ["Formão de canto", "formão de esquina", "m", "manual", "a", "", "Formão em L que limpa cantos internos de encaixes."],
      ["Formão japonês", "nomi", "m", "manual", "a", "", "Formão de lâmina laminada, com aço muito duro na face de corte."],
      ["Macete de madeira", "maço", "mc", "manual", "e", "martelo", "Martelo de madeira usado para bater no formão sem estragar o cabo."],
    ]],
    ["goivas", "Goivas e entalhe", "Escavar, entalhar e esculpir.", "goiva", [
      ["Goiva", "goiva de entalhe", "m", "manual", "i", "", "Formão de lâmina curva para escavar e entalhar."],
      ["Jogo de goivas de entalhe", "", "m", "manual", "a", "", "Conjunto de goivas e formões de vários perfis para escultura em madeira."],
      ["Faca de entalhe", "canivete de entalhe", "m", "manual", "i", "", "Faca de lâmina curta e firme para entalhe a mão e peças pequenas."],
      ["Enxó", "", "mc", "manual", "a", "", "Ferramenta de lâmina transversal ao cabo, usada para desbastar e escavar."],
      ["Machadinha", "machado de mão", "c", "manual", "i", "martelo", "Machado pequeno para rachar, desbastar e falquejar."],
    ]],
    ["raspadores", "Raspadores e grosas", "Alisar sem lixa e desbastar formas.", "raspilha", [
      ["Raspilha", "cartão raspador;raspador de cartão", "m", "manual", "e", "", "Chapa fina de aço com rebarba que raspa a madeira e deixa a superfície lisa."],
      ["Brunidor", "polidor de rebarba", "m", "manual", "i", "", "Haste de aço duro que forma a rebarba de corte da raspilha."],
      ["Grosa", "grosa de madeira", "mc", "manual", "e", "lima", "Lima de dentes grandes e salientes para desbaste rápido em madeira."],
    ]],
  ]],
  ["furacao", "Furação e fixação", "", "furadeira", [
    ["furadeiras", "Furadeiras", "Furar madeira, metal e alvenaria.", "furadeira", [
      ["Furadeira de impacto", "furadeira", "mcs", "eletrica", "e", "", "Furadeira elétrica com função de impacto para furar madeira, metal e alvenaria."],
      ["Martelete", "martelete rompedor", "c", "eletrica", "i", "", "Máquina de impacto forte para furar e romper concreto."],
      ["Guia de furação", "guia para furadeira", "m", "manual", "i", "gabarito", "Suporte que mantém a furadeira no esquadro para furos retos."],
    ]],
    ["parafusadeiras", "Parafusadeiras e chaves", "Apertar e soltar parafusos.", "parafusadeira", [
      ["Parafusadeira e furadeira a bateria", "parafusadeira", "mcs", "bateria", "e", "", "Máquina sem fio com embreagem que fura e aperta parafusos."],
      ["Parafusadeira de impacto", "chave de impacto", "cs", "bateria", "i", "", "Parafusadeira com golpes rotativos para parafusos longos e grossos."],
      ["Chaves de fenda e Phillips", "jogo de chaves", "mcs", "manual", "e", "parafuso", "Chaves manuais para apertar e soltar parafusos."],
      ["Jogo de bits", "pontas de parafusadeira", "mcs", "consumivel", "e", "parafuso", "Pontas intercambiáveis nos formatos Phillips, Pozidriv, Torx e fenda."],
      ["Parafusadeira com alimentador", "parafusadeira de fita", "c", "eletrica", "a", "", "Parafusadeira com fita de parafusos que acelera a fixação de decks e forros."],
    ]],
    ["gabaritos-uniao", "Gabaritos de união", "Furar no lugar certo para unir peças.", "gabarito", [
      ["Gabarito de cavilha", "cavilhador", "m", "manual", "i", "", "Guia que faz os furos das cavilhas alinhados nas duas peças."],
      ["Gabarito de furo oblíquo", "pocket hole", "m", "manual", "i", "", "Guia que fura em ângulo para unir peças com parafuso escondido."],
      ["Rebitadeira", "rebitador manual", "s", "fixacao", "e", "pregador", "Alicate que fixa rebites de repuxo em chapas e perfis."],
      ["Grampeador manual", "grampeador de tapeceiro", "m", "fixacao", "e", "pregador", "Grampeador de mão para fixar tecido, tela e chapas finas."],
    ]],
    ["brocas", "Brocas", "Cada broca para um material: madeira, metal ou alvenaria.", "broca", [
      ["Broca para madeira", "broca de três pontas", "mc", "consumivel", "e", "", "Broca com ponta de centro e esporas que corta furos limpos em madeira."],
      ["Broca chata", "broca espada", "mc", "consumivel", "e", "", "Broca plana e barata para furos largos em madeira."],
      ["Broca Forstner", "", "m", "consumivel", "i", "", "Broca de fundo plano para furos limpos e cegos, como os da dobradiça de caneco."],
      ["Broca escalonada", "broca degrau", "s", "consumivel", "i", "", "Broca cônica em degraus que abre furos de vários diâmetros em chapa fina."],
      ["Broca HSS", "broca de aço rápido", "ms", "consumivel", "e", "", "Broca de aço rápido para furar aço, alumínio e madeira."],
      ["Broca de vídia", "broca para concreto", "c", "consumivel", "e", "", "Broca com pastilha de metal duro para furar tijolo e concreto."],
      ["Escareador", "broca escareadora", "mc", "consumivel", "e", "serra-copo", "Broca que abre o rebaixo para a cabeça do parafuso ficar faceada."],
    ]],
    ["serras-copo", "Serras-copo", "Furos redondos grandes.", "serra-copo", [
      ["Serra-copo bimetálica", "", "mcs", "consumivel", "i", "", "Copo dentado que abre furos redondos grandes em madeira e chapa fina."],
      ["Serra-copo diamantada", "", "c", "consumivel", "a", "", "Copo de borda diamantada para furar porcelanato e cerâmica."],
    ]],
  ]],
  ["fresagem", "Fresagem", "", "tupia", [
    ["tupias", "Tupias", "Perfis, rasgos, rebaixos e bordas.", "tupia", [
      ["Tupia de coluna", "tupia manual", "m", "eletrica", "i", "", "Máquina de motor vertical e base de mergulho, que fresa perfis, rasgos e rebaixos."],
      ["Tupia laminadora", "refiladora;tupia de acabamento", "m", "eletrica", "e", "", "Tupia compacta, usada para refilar fórmica e fita e arredondar bordas."],
      ["Mesa de tupia", "", "m", "estacionaria", "a", "bancada", "Mesa onde a tupia fica presa de cabeça para baixo, para fresar peças com guia."],
      ["Fresadora de lamelo", "biscoiteira", "m", "eletrica", "a", "", "Máquina que abre fendas para lamelos de junção."],
    ]],
    ["fresas", "Fresas", "", "fresa", [
      ["Fresa reta", "", "m", "consumivel", "e", "", "Fresa cilíndrica para rasgos, rebaixos e trabalhos com gabarito."],
      ["Fresa de arredondar", "fresa boleada", "m", "consumivel", "e", "", "Fresa com rolamento que arredonda bordas."],
      ["Fresa de chanfro", "", "m", "consumivel", "e", "", "Fresa com rolamento que chanfra bordas em 45 graus."],
      ["Fresa copiadora", "fresa de rolamento", "m", "consumivel", "i", "", "Fresa reta com rolamento que copia o gabarito."],
      ["Fresa rabo de andorinha", "", "m", "consumivel", "a", "", "Fresa em cone invertido para encaixes rabo de andorinha."],
      ["Fresa de perfil", "fresa de moldura", "m", "consumivel", "i", "", "Fresa com perfil decorativo para molduras e bordas."],
    ]],
    ["guias-tupia", "Guias e gabaritos de tupia", "Repetir o mesmo corte com a tupia.", "gabarito", [
      ["Gabarito de rabo de andorinha", "", "m", "manual", "a", "", "Guia que, com a tupia, corta encaixes rabo de andorinha em série."],
      ["Bucha copiadora", "anel copiador", "m", "consumivel", "i", "", "Anel preso à base da tupia que segue o gabarito."],
      ["Compasso de tupia", "guia circular", "m", "manual", "i", "", "Haste que gira a tupia em torno de um ponto para fresar círculos."],
      ["Guia paralela de tupia", "", "m", "manual", "e", "", "Guia que mantém a fresa a uma distância fixa da borda."],
    ]],
  ]],
  ["lixamento", "Lixamento e acabamento", "", "lixadeira-orbital", [
    ["lixadeiras", "Lixadeiras", "Lixar entre um acabamento e outro e preparar a peça.", "lixadeira-orbital", [
      ["Lixadeira orbital", "lixadeira de palma", "m", "eletrica", "e", "", "Lixadeira de base retangular que vibra em pequenas órbitas para lixar plano."],
      ["Lixadeira roto-orbital", "lixadeira excêntrica", "m", "eletrica", "e", "", "Lixadeira de disco que gira e oscila ao mesmo tempo, rápida e sem marcas."],
      ["Lixadeira de cinta", "lixadeira de esteira", "mc", "eletrica", "i", "lixadeira-cinta", "Lixadeira com cinta contínua para desbaste rápido."],
      ["Lixadeira de detalhe", "lixadeira delta", "m", "eletrica", "e", "", "Lixadeira de base triangular para cantos e frestas."],
      ["Lixadeira de disco e cinta", "lixadeira de bancada", "m", "estacionaria", "i", "lixadeira-cinta", "Máquina fixa com disco e cinta para acertar peças pequenas e ângulos."],
      ["Lixadeira de fuso", "lixadeira de eixo oscilante", "m", "estacionaria", "a", "lixadeira-cinta", "Máquina com rolo de lixa que sobe e desce para lixar curvas internas."],
    ]],
    ["lixar-a-mao", "Lixar a mão", "", "lixa", [
      ["Taco de lixar", "bloco de lixa", "mc", "manual", "e", "", "Bloco que mantém a lixa plana para lixar a mão."],
    ]],
    ["aplicacao", "Aplicação de acabamento", "Aplicar verniz, tinta, óleo e selante.", "pistola", [
      ["Pistola de pintura elétrica", "pistola HVLP elétrica", "mcs", "eletrica", "i", "", "Pistola com turbina própria que pulveriza verniz e tinta."],
      ["Pistola de pintura pneumática", "pistola de gravidade", "mcs", "pneumatica", "a", "", "Pistola ligada ao compressor que pulveriza acabamento de forma uniforme."],
      ["Trincha", "pincel largo", "mcs", "manual", "e", "pincel", "Pincel largo para aplicar verniz, tinta e seladora."],
      ["Rolo de espuma", "", "mcs", "manual", "e", "pincel", "Rolo de espuma fina para tinta e verniz em superfícies planas."],
      ["Aplicador de silicone", "pistola de calafetar", "mc", "manual", "e", "", "Aplicador de tubos de silicone, selante e cola PU."],
      ["Soprador térmico", "pistola de ar quente", "mcs", "eletrica", "i", "", "Aparelho que sopra ar muito quente para remover tinta, aplicar fita de borda e dobrar plástico."],
    ]],
  ]],
  ["aperto", "Fixação e aperto", "", "sargento", [
    ["grampos", "Grampos e sargentos", "Segurar peças na colagem, na montagem e na solda.", "sargento", [
      ["Sargento", "grampo F", "mcs", "fixacao", "e", "", "Grampo de barra com mordente móvel e rosca, para prender peças na colagem."],
      ["Grampo rápido", "grampo de gatilho", "mc", "fixacao", "e", "", "Grampo de uma mão que aperta por gatilho."],
      ["Sargento paralelo", "grampo de mordentes paralelos", "m", "fixacao", "i", "", "Grampo longo de mordentes paralelos para colar tampos e portas."],
      ["Grampo C", "grampo tipo C", "s", "fixacao", "e", "grampo-c", "Grampo em forma de C com rosca, muito usado na serralheria e na solda."],
      ["Alicate de pressão", "grampo de pressão;grampo de solda", "s", "fixacao", "e", "grampo-c", "Alicate que trava na pressão e segura peças para soldar."],
      ["Grampo de canto", "grampo de 90 graus", "ms", "fixacao", "i", "grampo-c", "Grampo que segura duas peças em ângulo reto para colar ou soldar."],
      ["Cinta de aperto", "grampo de cinta", "m", "fixacao", "i", "", "Cinta com catraca que aperta molduras e peças de várias faces."],
      ["Grampo de bancada", "holdfast", "m", "fixacao", "a", "", "Grampo de ferro que trava num furo da bancada com uma batida."],
    ]],
    ["morsas", "Morsas", "Prender a peça com firmeza para serrar, limar e furar.", "morsa", [
      ["Morsa de marceneiro", "", "m", "fixacao", "i", "", "Morsa de mordentes largos, presa à bancada, para prender madeira."],
      ["Morsa de bancada de serralheiro", "torno de bancada", "s", "fixacao", "e", "", "Morsa de ferro fundido com mordentes de aço, para prender metal."],
      ["Morsa de máquina", "morsa de furadeira", "ms", "fixacao", "i", "", "Morsa baixa que prende a peça na mesa da furadeira de bancada."],
      ["Morsa para tubos", "", "s", "fixacao", "a", "", "Morsa de mordentes em V que prende tubos redondos."],
    ]],
    ["prensas", "Prensas", "", "grampo-c", [
      ["Prensa de colagem", "", "m", "fixacao", "a", "", "Estrutura com fusos para colar painéis e lâminas sob pressão."],
      ["Prensa hidráulica", "", "s", "estacionaria", "a", "", "Prensa de macaco hidráulico para encaixar, dobrar e extrair peças."],
    ]],
  ]],
  ["bancadas", "Bancadas, gabaritos e apoio", "", "bancada", [
    ["bancadas", "Bancadas e mesas", "Base firme para trabalhar.", "bancada", [
      ["Bancada de marceneiro", "", "mc", "fixacao", "i", "", "Mesa robusta e pesada com morsas e furos para prender peças."],
      ["Bancada dobrável", "mesa de trabalho portátil", "mc", "fixacao", "e", "", "Bancada leve que dobra e vai para a obra."],
      ["Mesa de solda", "", "s", "fixacao", "i", "", "Mesa de aço grossa onde se monta e solda, com furos para grampos."],
      ["Mesa multifuncional furada", "mesa MFT", "m", "fixacao", "a", "", "Mesa com tampo furado em grade para prender e cortar com trilho."],
    ]],
    ["apoio", "Apoio de peças", "", "cavalete", [
      ["Cavalete", "cavalete de serra", "mcs", "fixacao", "e", "", "Apoio de quatro pés para cortar e montar peças longas."],
      ["Suporte de rolos", "roletes de apoio", "mcs", "fixacao", "i", "", "Suporte de altura regulável com rolos para sustentar peças compridas na máquina."],
    ]],
    ["gabaritos", "Gabaritos e acessórios de segurança", "Cortar com repetição e manter as mãos longe da lâmina.", "gabarito", [
      ["Empurrador de peça", "push stick", "m", "manual", "e", "", "Bastão ou bloco que empurra a peça na serra sem a mão chegar perto do disco."],
      ["Pente de pressão", "featherboard", "m", "manual", "i", "", "Pente flexível que segura a peça contra a guia da máquina."],
      ["Trenó de corte", "sled de serra de bancada", "m", "manual", "i", "", "Plataforma que corre nos trilhos da serra de bancada para cortes no esquadro."],
      ["Guia paralela para serra circular", "", "mc", "manual", "e", "", "Guia que mantém a serra circular a uma distância fixa da borda."],
    ]],
  ]],
  ["torno", "Torno e tornearia", "", "torno", [
    ["tornos", "Tornos", "", "torno", [
      ["Torno de madeira", "", "m", "estacionaria", "a", "", "Máquina que gira a peça para ser modelada com goivas e formões de torno."],
      ["Mini torno de madeira", "torno de canetas", "m", "estacionaria", "i", "", "Torno pequeno para canetas e peças pequenas."],
      ["Torno mecânico", "", "s", "estacionaria", "a", "", "Máquina que gira a peça de metal para usinar diâmetros, faces e roscas."],
      ["Placa de castanhas", "placa de torno", "ms", "fixacao", "a", "", "Placa que prende a peça no eixo do torno."],
    ]],
    ["ferramentas-torno", "Ferramentas de torno", "", "goiva", [
      ["Goiva de desbaste", "roughing gouge", "m", "manual", "a", "", "Goiva larga para desbastar o bloco até ficar redondo."],
      ["Goiva de perfil", "spindle gouge", "m", "manual", "a", "", "Goiva de ponta arredondada para detalhes e contas."],
      ["Goiva de tigela", "bowl gouge", "m", "manual", "a", "", "Goiva de canal profundo para tornear tigelas."],
      ["Formão oblíquo de torno", "skew", "m", "manual", "a", "formao", "Formão de lâmina oblíqua para alisar e cortar contas."],
      ["Bedame de torno", "parting tool", "m", "manual", "a", "formao", "Lâmina estreita para separar a peça e marcar diâmetros."],
      ["Ferramenta de pastilha", "ferramenta de metal duro", "ms", "manual", "a", "formao", "Ferramenta com pastilha de metal duro trocável, para tornear sem afiar."],
    ]],
  ]],
  ["carpintaria-obra", "Carpintaria de obra", "", "martelo", [
    ["martelos", "Martelos e alavancas", "", "martelo", [
      ["Martelo de unha", "", "mc", "manual", "e", "", "Martelo com uma face para bater e unha para arrancar pregos."],
      ["Martelo de carpinteiro", "martelo de enquadramento", "c", "manual", "i", "", "Martelo pesado de cabo longo para pregar estruturas."],
      ["Martelo de bola", "martelo de pena", "s", "manual", "e", "", "Martelo com face plana e bola, usado no metal para rebites e conformação."],
      ["Marreta", "", "cs", "manual", "e", "", "Martelo pesado para golpes fortes."],
      ["Martelo de borracha", "", "mc", "manual", "e", "", "Martelo de cabeça de borracha para encaixar peças sem marcar."],
      ["Pé de cabra", "alavanca", "cs", "manual", "e", "", "Barra de aço com pontas curvas para arrancar pregos e desmontar."],
      ["Repuxador de pregos", "punção de pregos", "mc", "manual", "e", "prego", "Punção que afunda a cabeça do prego abaixo da superfície."],
    ]],
    ["pregadores", "Pregadores e grampeadores", "Pregar rápido e sem marcar a peça.", "pregador", [
      ["Pinador pneumático", "pinador", "m", "pneumatica", "i", "", "Pregador a ar que crava pinos finos sem cabeça em molduras e acabamento."],
      ["Pregador de estrutura", "pregador pneumático de estrutura", "c", "pneumatica", "a", "", "Pregador a ar para pregos grandes em estruturas de madeira."],
      ["Grampeador pneumático", "", "m", "pneumatica", "i", "", "Grampeador a ar para fundos de móveis, estofados e telas."],
      ["Pregador a bateria", "", "c", "bateria", "a", "", "Pregador sem fio e sem compressor."],
    ]],
    ["estruturas", "Telhado, deck e escada", "", "esquadro", [
      ["Gabarito de escada", "gabarito de degrau", "c", "manual", "a", "gabarito", "Guias que transferem a medida do espelho e do piso do degrau para a longarina."],
      ["Serrote de poda", "", "c", "manual", "e", "serrote", "Serrote de dentes grandes para galhos e madeira verde."],
    ]],
  ]],
  ["corte-metal", "Corte de metal", "", "esmerilhadeira", [
    ["esmerilhadeiras", "Esmerilhadeiras e retíficas", "Cortar, desbastar e lixar metal com disco abrasivo.", "esmerilhadeira", [
      ["Esmerilhadeira angular", "lixadeira angular", "cs", "eletrica", "e", "", "Máquina de disco abrasivo que corta, desbasta e lixa metal."],
      ["Esmerilhadeira angular de 7 polegadas", "esmerilhadeira grande", "s", "eletrica", "i", "", "Esmerilhadeira de disco maior para cortes fundos e desbaste pesado."],
      ["Esmeril de bancada", "moto esmeril", "mcs", "estacionaria", "e", "pedra-afiar", "Motor com dois rebolos para afiar e desbastar peças."],
      ["Retífica reta", "micro retífica", "ms", "eletrica", "i", "", "Máquina pequena de alta rotação para pontas montadas, gravação e desbaste fino."],
    ]],
    ["policortes", "Policortes e serras de metal", "Cortar tubos e perfis no esquadro ou em ângulo.", "policorte", [
      ["Policorte", "serra policorte;cortadeira de disco", "s", "estacionaria", "e", "", "Máquina de disco abrasivo grande para cortar tubos e perfis."],
      ["Serra fita para metal", "serra fita horizontal", "s", "estacionaria", "a", "serra-fita", "Serra de fita que corta barras e tubos devagar, frio e no esquadro."],
      ["Serra de disco frio", "serra circular para metal", "s", "estacionaria", "a", "", "Serra de disco dentado que corta aço a frio, sem chuva de faíscas."],
      ["Cortador de tubos", "corta-tubos", "s", "manual", "i", "tesoura", "Ferramenta de roldana que corta tubos girando em volta deles."],
    ]],
    ["plasma-oxicorte", "Plasma e oxicorte", "Cortar chapa grossa e recortes em aço.", "plasma", [
      ["Cortador plasma", "corte a plasma", "s", "eletrica", "a", "", "Máquina que corta chapa de metal com um jato de gás ionizado em altíssima temperatura."],
      ["Conjunto de oxicorte", "maçarico de corte", "s", "manual", "a", "macarico", "Maçarico de oxigênio e acetileno que corta aço carbono grosso."],
    ]],
    ["tesouras", "Tesouras e cortadores", "Cortar chapa fina, arame e vergalhão.", "tesoura", [
      ["Tesoura de chapa", "tesoura de funileiro;tesoura aviação", "s", "manual", "e", "", "Tesoura de alavanca para cortar chapa fina de aço e alumínio."],
      ["Tesoura elétrica de chapa", "cortador de chapa", "s", "eletrica", "a", "", "Máquina que corta chapa fina em linhas retas e curvas."],
      ["Corta-vergalhão", "tesoura de vergalhão;corta-pino", "cs", "manual", "i", "", "Alicate de alavanca longa para cortar vergalhão, arame e pinos."],
      ["Alicate universal", "", "mcs", "manual", "e", "", "Alicate de corte e aperto de uso geral."],
    ]],
  ]],
  ["solda", "Solda", "", "solda-inversora", [
    ["eletrodo-revestido", "Eletrodo revestido", "Soldar aço carbono com equipamento simples, inclusive ao ar livre.", "solda-inversora", [
      ["Inversora de solda", "máquina de solda inversora;solda inversora", "s", "eletrica", "e", "", "Fonte de solda eletrônica e leve para soldar com eletrodo revestido."],
      ["Transformador de solda", "", "s", "eletrica", "i", "", "Fonte de solda de transformador, pesada e robusta."],
      ["Porta-eletrodo", "", "s", "fixacao", "e", "eletrodo", "Alicate isolado que segura o eletrodo e leva a corrente."],
      ["Garra negativa", "garra obra;terra de solda", "s", "fixacao", "e", "eletrodo", "Garra que fecha o circuito de solda na peça."],
    ]],
    ["mig-mag", "MIG/MAG", "Produção em aço com arame contínuo, rápida e com pouca escória.", "tocha-mig", [
      ["Máquina MIG/MAG", "", "s", "eletrica", "i", "solda-inversora", "Máquina que solda com arame contínuo e gás de proteção."],
      ["Máquina de arame tubular", "MIG sem gás", "s", "eletrica", "i", "solda-inversora", "Máquina de arame tubular que dispensa o cilindro de gás."],
      ["Tocha MIG", "", "s", "fixacao", "i", "", "Tocha que leva o arame, o gás e a corrente até a poça de fusão."],
      ["Regulador de gás", "regulador com fluxômetro", "s", "fixacao", "i", "", "Regulador que reduz a pressão do cilindro e mostra a vazão do gás."],
    ]],
    ["tig", "TIG", "Soldas finas e limpas em inox, alumínio e chapas finas.", "tocha-mig", [
      ["Máquina TIG", "", "s", "eletrica", "a", "solda-inversora", "Máquina de solda com eletrodo de tungstênio e gás argônio."],
      ["Tocha TIG", "", "s", "fixacao", "a", "", "Tocha com eletrodo de tungstênio e bocal de cerâmica."],
      ["Afiador de tungstênio", "", "s", "eletrica", "a", "pedra-afiar", "Aparelho que afia o eletrodo de tungstênio no ângulo certo."],
    ]],
    ["oxigas", "Oxigás e maçaricos", "Aquecer, brasar e soldar a chama.", "macarico", [
      ["Conjunto oxiacetileno", "solda oxigás", "s", "manual", "a", "", "Cilindros, reguladores e maçarico de oxigênio e acetileno para soldar, aquecer e cortar."],
      ["Maçarico portátil", "maçarico de cartucho", "cs", "manual", "i", "", "Maçarico pequeno a gás para aquecer, soldar com estanho e brasar."],
    ]],
    ["acessorios-solda", "Acessórios de solda", "", "eletrodo", [
      ["Martelo picador", "", "s", "manual", "e", "martelo", "Martelo de ponta e talhadeira para tirar a escória do cordão."],
      ["Alicate de MIG", "alicate de solda", "s", "manual", "i", "tesoura", "Alicate que corta arame, limpa o bocal e tira a ponta de contato."],
      ["Estufa para eletrodos", "", "s", "eletrica", "a", "solda-inversora", "Estufa que mantém eletrodos básicos secos."],
    ]],
  ]],
  ["dobra", "Dobra e conformação", "", "dobradeira", [
    ["dobradeiras", "Dobradeiras e curvadores", "Dobrar chapa, tubo e vergalhão sem amassar.", "dobradeira", [
      ["Dobradeira de chapa", "viradeira", "s", "estacionaria", "a", "", "Máquina de alavanca que dobra chapa fina em linha reta."],
      ["Curvador de tubos", "dobrador de tubos", "s", "manual", "i", "", "Ferramenta que curva tubos sem amassar."],
      ["Dobrador de vergalhão", "bancada de dobra", "cs", "manual", "i", "", "Bancada com pinos para dobrar vergalhão e barra em ângulo."],
      ["Calandra de chapa", "calandra de rolos", "s", "estacionaria", "a", "", "Máquina de três rolos que curva chapas em arco."],
      ["Calandra de perfis", "curvadora de perfis", "s", "estacionaria", "a", "", "Máquina que curva perfis, barras e tubos em arcos."],
    ]],
    ["forja", "Forja", "Aquecer e conformar o aço a martelo.", "bigorna", [
      ["Bigorna", "", "s", "fixacao", "a", "", "Bloco de aço com mesa e chifre para conformar metal a martelo."],
      ["Forja a gás", "", "s", "estacionaria", "a", "macarico", "Forno a gás que aquece o aço até a temperatura de forjar."],
      ["Tenaz", "pinça de ferreiro", "s", "manual", "a", "tesoura", "Pinça longa para segurar o metal quente."],
      ["Martelo de forja", "", "s", "manual", "a", "martelo", "Martelo pesado de cabeça cruzada ou reta para forjar."],
    ]],
  ]],
  ["furacao-metal", "Furação e rosca em metal", "", "furadeira-bancada", [
    ["maquinas-furar", "Furadeiras de bancada e magnéticas", "Furos retos e repetidos.", "furadeira-bancada", [
      ["Furadeira de bancada", "furadeira de coluna", "mcs", "estacionaria", "i", "", "Furadeira presa a uma coluna, que desce reta sobre a mesa."],
      ["Furadeira magnética", "furadeira de base magnética", "s", "eletrica", "a", "", "Furadeira com base de ímã que gruda na peça de aço para furos grandes."],
      ["Fresadora", "fresadora de metal", "s", "estacionaria", "a", "", "Máquina de usinagem que desbasta metal com fresas rotativas."],
    ]],
    ["roscas", "Machos e cossinetes", "Abrir rosca em furos e barras.", "macho", [
      ["Jogo de machos", "machos de rosca", "s", "manual", "i", "", "Ferramentas que abrem rosca interna em furos."],
      ["Desandador", "vira-macho", "s", "manual", "i", "", "Cabo que gira o macho ou o cossinete."],
      ["Jogo de cossinetes", "tarraxas", "s", "manual", "i", "", "Matrizes que abrem rosca externa em barras e parafusos."],
      ["Pente de rosca", "calibrador de rosca", "s", "medicao", "a", "", "Lâminas que identificam o passo de uma rosca."],
    ]],
    ["brocas-metal", "Brocas para metal", "", "broca", [
      ["Broca de cobalto", "", "s", "consumivel", "a", "", "Broca com cobalto para furar aço inox e aços duros."],
      ["Broca de centro", "", "s", "consumivel", "a", "", "Broca curta e rígida que faz o furo de centro antes da broca maior."],
    ]],
  ]],
  ["acabamento-metal", "Acabamento de metal", "", "escova", [
    ["lixar-polir", "Lixar e polir", "", "esmerilhadeira", [
      ["Lixadeira de tubos", "lixadeira de cinta para metal", "s", "eletrica", "a", "lixadeira-cinta", "Lixadeira de cinta que abraça tubos para lixar e polir."],
      ["Politriz", "", "ms", "eletrica", "i", "", "Máquina de baixa rotação com boinas para lixar e polir."],
      ["Escova rotativa de aço", "escova copo", "s", "consumivel", "e", "escova", "Escova de arame para esmerilhadeira que remove ferrugem, tinta e escória."],
    ]],
    ["limas", "Escovas, limas e rebarbadores", "Acertar e limpar a mão.", "lima", [
      ["Escova de aço manual", "", "s", "manual", "e", "escova", "Escova de cerdas de aço para limpar solda e ferrugem a mão."],
      ["Lima de metal", "lima bastarda", "s", "manual", "e", "", "Barra de aço temperado com dentes para desbastar e acertar metal."],
      ["Jogo de limas agulha", "limas de precisão", "ms", "manual", "i", "", "Limas finas para ajustes pequenos."],
      ["Rebarbador", "escareador manual", "s", "manual", "e", "", "Lâmina giratória que tira a rebarba de furos e bordas."],
    ]],
    ["preparo", "Preparo de superfície", "", "pistola", [
      ["Jateador de areia", "jato de areia", "s", "pneumatica", "a", "", "Aparelho que limpa metal com jato de abrasivo e ar comprimido."],
    ]],
  ]],
  ["seguranca", "Segurança e EPI", "Proteger olhos, ouvidos, pulmões, mãos e corpo em toda máquina.", "oculos", [
    ["olhos-rosto", "Olhos e rosto", "", "oculos", [
      ["Óculos de segurança", "", "mcs", "epi", "e", "", "Óculos de policarbonato que protegem contra cavacos e faíscas."],
      ["Protetor facial", "viseira", "mcs", "epi", "i", "", "Viseira que cobre o rosto inteiro, usada no torno e na esmerilhadeira."],
    ]],
    ["audicao", "Audição", "", "abafador", [
      ["Abafador de ruído", "protetor tipo concha", "mcs", "epi", "e", "", "Protetor de orelha em conchas para máquinas barulhentas."],
      ["Protetor auricular de silicone", "protetor de inserção reutilizável", "mcs", "epi", "e", "", "Protetor lavável que entra no canal do ouvido."],
    ]],
    ["respiracao", "Respiração", "", "respirador", [
      ["Respirador semifacial", "máscara com filtros", "mcs", "epi", "i", "", "Máscara de borracha com filtros trocáveis para pó, fumos e vapores."],
    ]],
    ["maos-corpo", "Mãos, pés e corpo", "", "luva", [
      ["Luva de vaqueta", "luva de raspa", "cs", "epi", "e", "", "Luva de couro para manusear chapas, madeira bruta e solda."],
      ["Luva anticorte", "", "mcs", "epi", "i", "", "Luva de fibra resistente a corte para lidar com chapas e lâminas."],
      ["Avental de raspa", "", "s", "epi", "e", "", "Avental de couro que protege o corpo das fagulhas de solda."],
      ["Botina de segurança", "botina com biqueira", "mcs", "epi", "e", "", "Calçado com biqueira que protege os pés de quedas de peças."],
      ["Extintor de incêndio", "", "mcs", "epi", "e", "compressor", "Extintor para combater princípio de incêndio na oficina."],
    ]],
    ["epi-solda", "EPI de solda", "", "mascara-solda", [
      ["Máscara de solda automática", "máscara de escurecimento automático", "s", "epi", "e", "", "Máscara com filtro que escurece sozinho quando o arco abre."],
      ["Máscara de solda convencional", "", "s", "epi", "e", "", "Máscara com vidro de tonalidade fixa."],
      ["Óculos de maçariqueiro", "", "s", "epi", "i", "oculos", "Óculos de lente escura para soldar e cortar com maçarico."],
      ["Perneira e mangote de raspa", "", "s", "epi", "i", "luva", "Proteções de couro para pernas e braços na solda."],
    ]],
  ]],
  ["po-ventilacao", "Coleta de pó e ventilação", "Tirar o pó e os fumos do ar que se respira.", "coletor-po", [
    ["coletores", "Coletores e ciclones", "", "coletor-po", [
      ["Coletor de pó", "exaustor de cavacos", "m", "estacionaria", "a", "", "Máquina que aspira cavacos e pó das máquinas por mangueira e dutos."],
      ["Separador ciclônico", "ciclone", "m", "fixacao", "i", "", "Ciclone que separa o grosso do pó antes do aspirador ou do coletor."],
      ["Filtro de ar de oficina", "purificador de ar de oficina", "m", "eletrica", "a", "", "Aparelho suspenso que filtra o pó fino que fica no ar."],
    ]],
    ["aspiradores", "Aspiradores", "", "coletor-po", [
      ["Aspirador de pó e água", "", "mc", "eletrica", "e", "", "Aspirador de oficina para pó, cavaco e água."],
      ["Aspirador com acionamento automático", "aspirador para ferramentas", "m", "eletrica", "i", "", "Aspirador que liga junto com a ferramenta e puxa o pó na origem."],
    ]],
    ["ventilacao", "Ventilação e fumos", "", "coletor-po", [
      ["Exaustor de fumos de solda", "", "s", "eletrica", "a", "", "Exaustor com braço que puxa os fumos da solda para longe de quem trabalha."],
      ["Ventilador de oficina", "", "mcs", "eletrica", "e", "", "Ventilador para renovar o ar em ambiente fechado."],
    ]],
  ]],
  ["afiacao", "Afiação e manutenção", "", "pedra-afiar", [
    ["pedras", "Pedras e afiação", "Manter formões, plainas e facas com fio.", "pedra-afiar", [
      ["Pedra d'água", "pedra japonesa", "m", "manual", "i", "", "Pedra abrasiva usada com água para afiar formões e lâminas."],
      ["Placa diamantada", "pedra de diamante", "m", "manual", "i", "", "Placa de aço com diamante que afia rápido e aplana outras pedras."],
      ["Pedra de óleo", "pedra de Arkansas", "mc", "manual", "e", "", "Pedra usada com óleo para afiar lâminas."],
      ["Assentador de couro", "strop", "m", "manual", "i", "", "Tira de couro com pasta de polir que tira a rebarba e dá o fio final."],
      ["Guia de afiação", "guia de ângulo", "m", "manual", "e", "", "Suporte com rodinha que mantém o ângulo do formão na pedra."],
      ["Afiadora refrigerada a água", "afiadora de rebolo lento", "m", "estacionaria", "a", "", "Máquina de rebolo grande e lento que afia sem esquentar o aço."],
    ]],
    ["serrotes-afiar", "Afiação de serrote", "", "lima", [
      ["Travadeira de serrote", "alicate de travar", "m", "manual", "a", "", "Alicate que entorta os dentes do serrote para o corte não prender."],
      ["Lima triangular", "lima de serrote", "mc", "manual", "i", "", "Lima de três faces para afiar dentes de serrote."],
    ]],
    ["manutencao", "Ar comprimido e manutenção", "", "compressor", [
      ["Compressor de ar", "", "mcs", "eletrica", "i", "", "Máquina que guarda ar sob pressão para pistolas, pregadores e limpeza."],
      ["Bico de ar", "pistola de ar", "mcs", "pneumatica", "e", "", "Bico que sopra ar comprimido para limpar peças e máquinas."],
      ["Jogo de chaves Allen", "chave hexagonal", "mcs", "manual", "e", "parafuso", "Chaves em L para parafusos de cabeça sextavada interna."],
    ]],
  ]],
];

// ---------- Insumos (subcategorias pelo TIPO do insumo; adendo de 19/11, 23h57) ----------
// linha: [nome, apelidos, ofícios, ícone ("" = o da subcategoria), resumo, unidade]
const INS = [
  ["colas", "Colas e adesivos", "", "cola", [
    ["pva", "PVA (cola branca)", "Madeira com madeira em ambiente interno, encaixes e colagem de painéis.", "cola", [
      ["Cola PVA comum", "cola branca;cola de madeira", "m", "", "Cola branca à base de acetato de polivinila, que seca transparente.", "kg"],
      ["Cola PVA resistente à umidade", "cola D3;cola PVA D3", "mc", "", "Cola PVA formulada para resistir mais à umidade, classificada como D3.", "kg"],
    ]],
    ["pu", "PU (poliuretano)", "Peças que pegam umidade ou áreas externas, e madeira com outros materiais.", "cola", [
      ["Cola PU", "cola de poliuretano", "mc", "", "Adesivo de poliuretano que cura com a umidade e expande um pouco ao secar.", "tubo"],
      ["Adesivo PU de montagem", "cola de montagem", "mcs", "", "Adesivo em cartucho para colar painéis, rodapés e peças em obra.", "cartucho"],
    ]],
    ["epoxi", "Epóxi", "Preencher falhas, colar materiais diferentes e peças que exigem resistência alta.", "cola", [
      ["Adesivo epóxi bicomponente", "durepóxi líquido;epóxi de duas partes", "mcs", "", "Resina e endurecedor que, misturados, curam e colam madeira, metal e pedra.", "conjunto"],
      ["Resina epóxi para preenchimento", "resina de mesa", "m", "", "Resina epóxi de cura lenta usada para preencher rachaduras e fazer tampos.", "kg"],
      ["Massa epóxi", "", "mcs", "", "Massa de modelar epóxi que endurece e pode ser lixada.", "conjunto"],
    ]],
    ["contato", "Cola de contato", "Colar laminado melamínico, couro e borracha em grandes áreas.", "cola", [
      ["Cola de contato", "cola de sapateiro", "mc", "", "Adesivo aplicado nas duas faces que cola na hora quando elas se encostam.", "litro"],
    ]],
    ["instantanea", "Instantânea (cianoacrilato)", "Reparos pequenos e colagem rápida de peças que fecham bem.", "cola", [
      ["Cola instantânea", "super cola;cianoacrilato", "mcs", "", "Cola de cianoacrilato que seca em segundos.", "frasco"],
      ["Ativador de cola instantânea", "acelerador de cianoacrilato", "m", "", "Spray que faz a cola instantânea curar na hora.", "frasco"],
    ]],
    ["quente", "Cola quente", "Fixação provisória e gabaritos rápidos.", "cola", [
      ["Bastão de cola quente", "refil de cola quente", "m", "", "Bastão de adesivo termoplástico usado na pistola de cola quente.", "kg"],
    ]],
  ]],
  ["lixas", "Lixas e abrasivos", "", "lixa", [
    ["grao-40-60", "Grão 40 a 60", "Desbaste pesado e remoção de tinta ou de marcas fundas.", "lixa", [
      ["Lixa grão 40", "", "mcs", "", "Lixa de grão bem grosso para desbaste pesado.", "folha"],
      ["Lixa grão 60", "", "mcs", "", "Lixa grossa para desbaste e remoção de acabamento velho.", "folha"],
    ]],
    ["grao-80-120", "Grão 80 a 120", "Desbaste e nivelamento antes do acabamento.", "lixa", [
      ["Lixa grão 80", "", "mcs", "", "Lixa média-grossa para nivelar e tirar marcas de máquina.", "folha"],
      ["Lixa grão 120", "", "mcs", "", "Lixa média, etapa comum antes dos grãos finos.", "folha"],
    ]],
    ["grao-150-240", "Grão 150 a 240", "Lixamento final da madeira e entre demãos de seladora.", "lixa", [
      ["Lixa grão 180", "", "m", "", "Lixa fina para o lixamento final da madeira crua.", "folha"],
      ["Lixa grão 220", "", "m", "", "Lixa fina para lixar entre demãos de seladora e verniz.", "folha"],
    ]],
    ["grao-320", "Grão 320 ou mais", "Entre demãos de verniz e polimento.", "lixa", [
      ["Lixa d'água grão 400", "lixa d'água", "ms", "", "Lixa à prova d'água, usada molhada entre demãos e no polimento.", "folha"],
      ["Lixa d'água grão 1000 ou mais", "", "ms", "", "Lixa muito fina para polir verniz e pintura.", "folha"],
    ]],
    ["discos-lixa", "Discos de lixa", "Lixadeira roto-orbital e esmerilhadeira.", "lixa", [
      ["Disco de lixa com velcro", "disco de lixa para roto-orbital", "m", "", "Disco furado que prende por velcro na base da lixadeira roto-orbital.", "caixa com 50"],
      ["Rolo de lixa em cinta", "cinta de lixa", "mc", "", "Cinta contínua de lixa para a lixadeira de cinta.", "unidade"],
    ]],
    ["nao-tecido", "Palha de aço e abrasivo não tecido", "Polir entre demãos e aplicar cera e óleo.", "lixa", [
      ["Palha de aço fina", "palha de aço 000", "m", "", "Fios finos de aço para polir e aplicar cera.", "pacote"],
      ["Abrasivo não tecido", "esponja abrasiva em manta", "ms", "", "Manta sintética abrasiva que não enferruja e não solta fios.", "folha"],
    ]],
  ]],
  ["fixadores", "Parafusos, pregos e fixadores", "", "parafuso", [
    ["chipboard", "Chipboard", "MDF, MDP e madeira macia, sem pré-furo em peças finas.", "parafuso", [
      ["Parafuso chipboard cabeça chata", "parafuso para MDF", "m", "", "Parafuso de rosca total e cabeça chata para chapas e madeira.", "caixa com 100"],
      ["Parafuso chipboard cabeça panela", "", "m", "", "Chipboard de cabeça arredondada, para fixar ferragens.", "caixa com 100"],
    ]],
    ["soberba", "Soberba para madeira", "Madeira maciça, com pré-furo em madeira dura.", "parafuso", [
      ["Parafuso soberba", "parafuso para madeira", "mc", "", "Parafuso de rosca espaçada e ponta fina para madeira.", "caixa com 100"],
      ["Parafuso sextavado soberba", "parafuso francês", "c", "", "Parafuso de cabeça sextavada para estruturas de madeira.", "caixa com 50"],
    ]],
    ["confirmat", "Confirmat e conectores", "União de chapas de MDF e MDP em móveis.", "parafuso", [
      ["Parafuso confirmat", "", "m", "", "Parafuso grosso de união de chapas, com pré-furo escalonado.", "caixa com 100"],
      ["Minifix", "conector excêntrico", "m", "dobradica", "Conector de tambor e haste que une peças de móvel desmontável.", "caixa com 100"],
    ]],
    ["autobrocante", "Autobrocante", "Fixar em chapa e perfil de aço sem furar antes.", "parafuso", [
      ["Parafuso autobrocante", "", "cs", "", "Parafuso com ponta de broca que fura e rosqueia chapa de aço.", "caixa com 100"],
    ]],
    ["maquina", "Parafuso de máquina, porca e arruela", "Uniões desmontáveis em metal e estruturas.", "parafuso", [
      ["Parafuso sextavado com porca", "", "cs", "", "Parafuso de rosca métrica com porca e arruela.", "caixa com 50"],
      ["Barra roscada", "", "cs", "metal", "Barra com rosca em todo o comprimento, cortada na medida.", "metro"],
      ["Porca de garra", "porca de cravar", "m", "", "Porca com garras cravada na madeira para receber parafuso de máquina.", "caixa com 100"],
    ]],
    ["buchas", "Buchas", "Fixar em alvenaria.", "parafuso", [
      ["Bucha de nylon", "", "c", "", "Bucha plástica que expande no furo da parede para segurar o parafuso.", "caixa com 100"],
      ["Chumbador", "parabolt", "cs", "", "Fixador de aço que expande no concreto para cargas pesadas.", "unidade"],
    ]],
    ["cavilhas", "Cavilhas e lamelos", "Alinhar e reforçar encaixes colados.", "madeira", [
      ["Cavilha de madeira", "tarugo", "m", "", "Pino de madeira canelado usado em encaixes colados.", "pacote com 100"],
      ["Lamelo", "biscoito de junção", "m", "", "Pastilha de madeira prensada que entra na fenda da fresadora de lamelo.", "caixa com 100"],
    ]],
    ["pregos", "Pregos e grampos", "", "prego", [
      ["Prego com cabeça", "", "c", "", "Prego comum de aço para estruturas e caixarias.", "kg"],
      ["Prego sem cabeça", "", "m", "", "Prego fino de cabeça mínima para acabamento.", "kg"],
      ["Pino para pinador", "", "m", "", "Pinos finos em pente para pinador pneumático.", "caixa"],
      ["Grampo para grampeador", "", "m", "", "Grampos em pente para grampeador manual ou pneumático.", "caixa"],
    ]],
    ["rebites", "Rebites", "Unir chapas finas de metal sem solda.", "pregador", [
      ["Rebite de repuxo", "rebite pop", "s", "", "Rebite que se fixa puxando o mandril pelo lado de fora.", "caixa com 100"],
    ]],
  ]],
  ["ferragens", "Ferragens", "", "dobradica", [
    ["dobradica-caneco", "Dobradiça de caneco", "Portas de armário em MDF e MDP.", "dobradica", [
      ["Dobradiça de caneco reta", "dobradiça de pressão", "m", "", "Dobradiça escondida de copo, para porta que cobre a lateral.", "unidade"],
      ["Dobradiça de caneco com amortecedor", "dobradiça slow", "m", "", "Dobradiça de caneco que fecha devagar.", "unidade"],
    ]],
    ["dobradica-comum", "Dobradiças comuns", "Portas, janelas, tampas e caixas.", "dobradica", [
      ["Dobradiça de abas", "dobradiça comum", "mc", "", "Dobradiça de duas abas e pino, aparente.", "unidade"],
      ["Dobradiça de piano", "", "m", "", "Dobradiça longa e contínua para tampas e baús.", "metro"],
      ["Dobradiça de solda", "dobradiça de portão", "s", "", "Dobradiça de aço feita para ser soldada em portões e grades.", "unidade"],
    ]],
    ["corredicas", "Corrediças", "Gavetas.", "dobradica", [
      ["Corrediça telescópica", "", "m", "", "Trilho de esferas que abre a gaveta por inteiro.", "par"],
      ["Corrediça oculta", "", "m", "", "Corrediça que fica embaixo da gaveta, com fechamento suave.", "par"],
    ]],
    ["puxadores", "Puxadores e fechaduras", "", "dobradica", [
      ["Puxador", "", "m", "", "Peça de abrir portas e gavetas, de alça, botão ou perfil.", "unidade"],
      ["Fechadura de móvel", "", "m", "", "Fechadura pequena para portas e gavetas de móvel.", "unidade"],
    ]],
    ["suportes", "Cantoneiras e suportes", "", "dobradica", [
      ["Cantoneira de reforço", "", "mc", "", "Chapa dobrada em L para reforçar cantos.", "unidade"],
      ["Mão-francesa", "", "mc", "", "Suporte em triângulo para prateleiras.", "unidade"],
      ["Suporte de prateleira", "pino de prateleira", "m", "", "Pino ou suporte que segura a prateleira dentro do móvel.", "pacote"],
    ]],
  ]],
  ["acabamentos", "Acabamentos", "", "lata", [
    ["seladora", "Seladora", "Primeira demão: fechar os poros e preparar para o verniz.", "lata", [
      ["Seladora nitrocelulose", "", "m", "", "Fundo de secagem rápida que fecha os poros da madeira.", "litro"],
      ["Seladora à base d'água", "", "m", "", "Fundo selador à base d'água, com menos cheiro.", "litro"],
    ]],
    ["verniz-pu", "Verniz PU", "Móveis internos que pedem película dura e resistente.", "lata", [
      ["Verniz PU", "verniz poliuretano", "m", "", "Verniz de poliuretano que forma película resistente a riscos.", "litro"],
      ["Verniz PU à base d'água", "", "m", "", "Verniz poliuretano diluível em água, de secagem rápida.", "litro"],
    ]],
    ["verniz-maritimo", "Verniz marítimo", "Madeira exposta ao tempo, ao sol e à chuva.", "lata", [
      ["Verniz marítimo", "verniz com filtro solar", "mc", "", "Verniz flexível com proteção contra raios UV para áreas externas.", "litro"],
    ]],
    ["oleos", "Óleos", "Acabamento que penetra e realça o veio, fácil de reaplicar.", "lata", [
      ["Óleo de linhaça", "", "m", "", "Óleo vegetal secativo que penetra na madeira.", "litro"],
      ["Óleo de tungue", "", "m", "", "Óleo vegetal secativo que forma acabamento resistente à água.", "litro"],
      ["Óleo para deck", "", "c", "", "Óleo próprio para decks e madeiras externas.", "litro"],
    ]],
    ["ceras", "Ceras", "Acabamento final suave e de manutenção.", "lata", [
      ["Cera de carnaúba", "", "m", "", "Cera vegetal dura usada para polir e proteger.", "kg"],
      ["Cera de abelha", "", "m", "", "Cera natural macia, muito usada com óleo.", "kg"],
    ]],
    ["stain", "Stain e tingidor", "Dar cor à madeira mantendo o veio aparente.", "lata", [
      ["Stain", "", "mc", "", "Produto pigmentado que tinge e protege madeira, deixando o veio aparente.", "litro"],
      ["Tingidor", "corante para madeira", "m", "", "Corante que muda a cor da madeira antes do verniz.", "litro"],
    ]],
    ["tintas", "Tintas e esmaltes", "", "lata", [
      ["Esmalte sintético", "", "mcs", "", "Tinta à base de resina alquídica para madeira e metal.", "litro"],
      ["Esmalte à base d'água", "", "m", "", "Esmalte acrílico diluível em água, de baixo odor.", "litro"],
    ]],
    ["massas", "Massas e preenchimento", "Corrigir falhas e furos antes do acabamento.", "lata", [
      ["Massa para madeira", "massa de calafetar madeira", "m", "", "Massa que preenche furos e frestas e pode ser lixada.", "kg"],
      ["Massa plástica", "", "ms", "", "Massa de poliéster de cura rápida para corrigir falhas.", "kg"],
    ]],
    ["metal-acabamento", "Fundo e proteção do metal", "Proteger o aço da ferrugem antes da pintura.", "lata", [
      ["Fundo anticorrosivo", "primer;zarcão", "s", "", "Primeira demão que protege o aço da ferrugem e prende a tinta.", "litro"],
      ["Galvanização a frio", "zinco a frio", "s", "", "Tinta rica em zinco que protege soldas e cortes em peças galvanizadas.", "litro"],
      ["Desengraxante", "", "s", "", "Produto que tira óleo e gordura do metal antes de pintar.", "litro"],
      ["Removedor de ferrugem", "convertedor de ferrugem", "s", "", "Produto que remove ou converte a ferrugem superficial.", "litro"],
    ]],
  ]],
  ["chapas", "Chapas e painéis", "", "chapa", [
    ["mdf", "MDF", "Móveis internos com acabamento pintado ou laminado e peças usinadas.", "chapa", [
      ["MDF cru", "", "m", "", "Chapa de fibra de média densidade sem revestimento.", "folha"],
      ["MDF revestido", "MDF melamínico", "m", "", "MDF com revestimento melamínico de fábrica.", "folha"],
      ["MDF resistente à umidade", "MDF RU;MDF verde", "m", "", "MDF com resina que resiste melhor à umidade, para cozinhas e banheiros.", "folha"],
    ]],
    ["mdp", "MDP", "Móveis internos retos, como portas lisas, laterais e prateleiras.", "chapa", [
      ["MDP revestido", "aglomerado", "m", "", "Chapa de partículas de madeira em camadas, revestida.", "folha"],
    ]],
    ["compensado", "Compensado", "", "chapa", [
      ["Compensado multilaminado", "", "mc", "", "Chapa de lâminas de madeira coladas com fibras cruzadas.", "folha"],
      ["Compensado naval", "", "mc", "", "Compensado colado com resina à prova d'água, para áreas úmidas.", "folha"],
      ["Compensado sarrafeado", "", "m", "", "Chapa com miolo de sarrafos e capas de lâmina.", "folha"],
      ["Compensado plastificado", "compensado para fôrma", "c", "", "Compensado com película para fôrmas de concreto.", "folha"],
    ]],
    ["osb", "OSB", "Fechamentos, bases de piso e telhado e uso estrutural.", "chapa", [
      ["OSB", "chapa OSB", "c", "", "Chapa de tiras de madeira orientadas e prensadas com resina.", "folha"],
    ]],
    ["laminados", "Laminados e lâminas", "Revestir chapas com acabamento decorativo.", "chapa", [
      ["Laminado melamínico", "fórmica", "m", "", "Lâmina decorativa de alta pressão colada sobre chapas.", "folha"],
      ["Lâmina de madeira natural", "folha de madeira", "m", "madeira", "Lâmina fina de madeira para folhear chapas.", "metro quadrado"],
    ]],
    ["fitas-borda", "Fitas de borda", "Fechar a borda aparente de chapas de MDF e MDP.", "chapa", [
      ["Fita de borda PVC", "", "m", "", "Fita plástica colada na borda das chapas.", "metro"],
      ["Fita de borda com cola", "fita termocolante", "m", "", "Fita com adesivo que cola com calor.", "metro"],
    ]],
  ]],
  ["discos", "Discos e lâminas de reposição", "", "disco", [
    ["disco-corte", "Disco de corte", "Cortar aço, inox e perfis na esmerilhadeira ou no policorte.", "disco", [
      ["Disco de corte fino", "disco de corte para inox", "s", "", "Disco abrasivo fino que corta com pouca rebarba.", "unidade"],
      ["Disco de corte para policorte", "", "s", "", "Disco abrasivo grande para policorte.", "unidade"],
    ]],
    ["disco-desbaste", "Disco de desbaste", "Rebaixar cordões de solda e desbastar metal.", "disco", [
      ["Disco de desbaste", "", "s", "", "Disco abrasivo grosso para desbastar metal.", "unidade"],
    ]],
    ["disco-flap", "Disco flap", "Desbaste leve e acabamento de solda.", "disco", [
      ["Disco flap", "", "s", "", "Disco de lâminas de lixa sobrepostas para esmerilhadeira.", "unidade"],
    ]],
    ["disco-diamantado", "Disco diamantado", "Cortar pedra, piso e concreto.", "disco", [
      ["Disco diamantado", "", "c", "", "Disco com borda diamantada para materiais de construção.", "unidade"],
    ]],
    ["laminas-serra", "Lâminas de serra", "", "serra-circular", [
      ["Disco de serra circular para madeira", "lâmina de serra circular", "mc", "", "Disco dentado de metal duro para serra circular e de bancada.", "unidade"],
      ["Lâmina de serra tico-tico", "", "mcs", "tico-tico", "Lâmina curta e trocável da serra tico-tico.", "pacote"],
      ["Lâmina de serra fita", "", "ms", "serra-fita", "Lâmina em laço da serra de fita.", "unidade"],
      ["Lâmina de serra manual para metal", "lâmina de arco de serra", "s", "arco-serra", "Lâmina de dentes finos para o arco de serra.", "unidade"],
    ]],
  ]],
  ["solda-consumiveis", "Consumíveis de solda", "", "eletrodo", [
    ["e6013", "E6013", "Solda de aço carbono em chapas finas, uso geral e posição plana.", "eletrodo", [
      ["Eletrodo E6013", "eletrodo rutílico", "s", "", "Eletrodo revestido rutílico de uso geral para aço carbono.", "kg"],
    ]],
    ["e7018", "E7018", "Soldas estruturais em aço carbono que pedem mais resistência.", "eletrodo", [
      ["Eletrodo E7018", "eletrodo básico", "s", "", "Eletrodo revestido básico, que precisa ser guardado seco.", "kg"],
    ]],
    ["arame-mig", "Arame MIG sólido", "Solda MIG/MAG em aço carbono com gás de proteção.", "tocha-mig", [
      ["Arame ER70S-6", "arame MIG cobreado", "s", "", "Arame sólido para MIG/MAG em aço carbono.", "kg"],
    ]],
    ["arame-tubular", "Arame tubular", "Solda sem gás, inclusive ao ar livre com vento.", "tocha-mig", [
      ["Arame tubular sem gás", "arame autoprotegido", "s", "", "Arame com fluxo interno que dispensa o gás de proteção.", "kg"],
    ]],
    ["tig-consumiveis", "Vareta e tungstênio", "Solda TIG.", "tocha-mig", [
      ["Vareta TIG", "vareta de adição", "s", "", "Vareta de metal de adição para a solda TIG.", "kg"],
      ["Eletrodo de tungstênio", "", "s", "", "Eletrodo não consumível da tocha TIG.", "unidade"],
    ]],
    ["gases", "Gases", "", "macarico", [
      ["Argônio", "", "s", "", "Gás inerte de proteção para TIG e MIG.", "cilindro"],
      ["Mistura argônio e CO2", "", "s", "", "Gás de proteção para MAG em aço carbono.", "cilindro"],
      ["Oxigênio e acetileno", "", "s", "", "Gases do conjunto oxigás para soldar, aquecer e cortar.", "cilindro"],
    ]],
    ["acessorios-consumiveis", "Bicos e antirrespingo", "", "tocha-mig", [
      ["Bico de contato", "ponta de contato", "s", "", "Ponta de cobre da tocha MIG por onde sai o arame.", "pacote"],
      ["Antirrespingo", "spray antirrespingo", "s", "", "Produto que evita que respingos grudem na peça e no bocal.", "frasco"],
    ]],
  ]],
  ["reposicao", "Brocas e fresas de reposição", "", "broca", [
    ["brocas-rep", "Brocas", "", "broca", [
      ["Jogo de brocas para madeira", "", "mc", "", "Brocas de três pontas em vários diâmetros.", "jogo"],
      ["Jogo de brocas HSS", "", "ms", "", "Brocas de aço rápido em vários diâmetros.", "jogo"],
      ["Jogo de brocas de vídia", "", "c", "", "Brocas para alvenaria em vários diâmetros.", "jogo"],
    ]],
    ["fresas-rep", "Fresas", "", "fresa", [
      ["Jogo de fresas para tupia", "", "m", "", "Conjunto de fresas retas e de perfil para começar.", "jogo"],
    ]],
  ]],
  ["metais", "Metais", "", "metal", [
    ["tubos", "Tubos e metalon", "Estruturas, portões, grades e móveis de aço.", "metal", [
      ["Metalon", "tubo quadrado;tubo retangular", "s", "", "Tubo de aço de seção quadrada ou retangular.", "barra de 6 m"],
      ["Tubo redondo de aço", "", "s", "", "Tubo de aço de seção redonda.", "barra de 6 m"],
      ["Tubo galvanizado", "", "s", "", "Tubo de aço com camada de zinco contra corrosão.", "barra de 6 m"],
    ]],
    ["perfis", "Perfis e cantoneiras", "Quadros, reforços, suportes e estruturas.", "metal", [
      ["Cantoneira de aço", "cantoneira L", "s", "", "Perfil de aço em L.", "barra de 6 m"],
      ["Perfil U", "", "s", "", "Perfil de aço em U para estruturas.", "barra de 6 m"],
      ["Barra chata", "", "s", "", "Barra de aço retangular e fina.", "barra de 6 m"],
      ["Barra redonda", "ferro redondo", "s", "", "Barra maciça de aço de seção redonda.", "barra de 6 m"],
    ]],
    ["chapas-aco", "Chapas de aço", "", "metal", [
      ["Chapa de aço carbono", "chapa preta", "s", "", "Chapa de aço laminado para cortar e dobrar.", "folha"],
      ["Chapa galvanizada", "", "s", "", "Chapa de aço com camada de zinco.", "folha"],
      ["Chapa expandida", "", "s", "", "Chapa cortada e esticada em malha de losangos.", "folha"],
    ]],
  ]],
  ["epi-descartavel", "EPI descartável", "", "respirador", [
    ["mascaras", "Máscaras PFF", "Pó de lixamento e de corte.", "respirador", [
      ["Máscara PFF2", "máscara N95", "mcs", "", "Peça facial filtrante descartável contra poeiras e névoas.", "caixa com 10"],
    ]],
    ["filtros", "Filtros de respirador", "", "respirador", [
      ["Filtro para pó", "filtro P2", "mcs", "", "Filtro de partículas que encaixa no respirador semifacial.", "par"],
      ["Cartucho para vapores orgânicos", "", "mcs", "", "Cartucho químico para vapores de solventes, vernizes e tintas.", "par"],
    ]],
    ["luvas", "Luvas descartáveis", "Aplicar acabamento, cola e produtos químicos.", "luva", [
      ["Luva nitrílica", "", "mcs", "", "Luva descartável resistente a óleos e solventes leves.", "caixa com 100"],
    ]],
    ["plugs", "Protetor auricular descartável", "", "abafador", [
      ["Protetor auricular de espuma", "plug de espuma", "mcs", "", "Protetor de espuma moldável que entra no ouvido.", "caixa"],
    ]],
  ]],
];

// ---------- Madeiras ----------
// [nome, nomes populares "a;b", nome científico, família, grupo, tipo]
const MAD = [
  // nativas do Brasil
  ["Ipê", "ipê-roxo;ipê-amarelo;pau-d'arco", "Handroanthus spp.", "Bignoniaceae", "nativa-brasil", "folhosa"],
  ["Cumaru", "champanhe;cumaru-ferro", "Dipteryx odorata", "Fabaceae", "nativa-brasil", "folhosa"],
  ["Jatobá", "jataí;jatobá-da-mata", "Hymenaea courbaril", "Fabaceae", "nativa-brasil", "folhosa"],
  ["Peroba-rosa", "peroba", "Aspidosperma polyneuron", "Apocynaceae", "nativa-brasil", "folhosa"],
  ["Peroba-do-campo", "ipê-peroba", "Paratecoma peroba", "Bignoniaceae", "nativa-brasil", "folhosa"],
  ["Cedro-rosa", "cedro", "Cedrela fissilis", "Meliaceae", "nativa-brasil", "folhosa"],
  ["Freijó", "louro-freijó", "Cordia goeldiana", "Boraginaceae", "nativa-brasil", "folhosa"],
  ["Imbuia", "embuia", "Ocotea porosa", "Lauraceae", "nativa-brasil", "folhosa"],
  ["Cabreúva", "bálsamo;cabreúva-vermelha", "Myroxylon peruiferum", "Fabaceae", "nativa-brasil", "folhosa"],
  ["Garapa", "grápia;amarelinho", "Apuleia leiocarpa", "Fabaceae", "nativa-brasil", "folhosa"],
  ["Tauari", "", "Couratari spp.", "Lecythidaceae", "nativa-brasil", "folhosa"],
  ["Angelim-pedra", "angelim", "Hymenolobium petraeum", "Fabaceae", "nativa-brasil", "folhosa"],
  ["Angelim-vermelho", "", "Dinizia excelsa", "Fabaceae", "nativa-brasil", "folhosa"],
  ["Maçaranduba", "", "Manilkara huberi", "Sapotaceae", "nativa-brasil", "folhosa"],
  ["Itaúba", "", "Mezilaurus itauba", "Lauraceae", "nativa-brasil", "folhosa"],
  ["Muiracatiara", "maracatiara", "Astronium lecointei", "Anacardiaceae", "nativa-brasil", "folhosa"],
  ["Roxinho", "pau-roxo;purpleheart", "Peltogyne spp.", "Fabaceae", "nativa-brasil", "folhosa"],
  ["Pau-marfim", "guatambu", "Balfourodendron riedelianum", "Rutaceae", "nativa-brasil", "folhosa"],
  ["Sucupira", "sucupira-preta", "Bowdichia nitida", "Fabaceae", "nativa-brasil", "folhosa"],
  ["Louro-pardo", "louro;freijó-pardo", "Cordia trichotoma", "Boraginaceae", "nativa-brasil", "folhosa"],
  ["Cerejeira", "amburana;cumaru-de-cheiro", "Amburana cearensis", "Fabaceae", "nativa-brasil", "folhosa"],
  ["Andiroba", "", "Carapa guianensis", "Meliaceae", "nativa-brasil", "folhosa"],
  ["Mogno", "mogno-brasileiro;aguano", "Swietenia macrophylla", "Meliaceae", "nativa-brasil", "folhosa"],
  ["Jacarandá-da-bahia", "jacarandá;pau-santo", "Dalbergia nigra", "Fabaceae", "nativa-brasil", "folhosa"],
  ["Pau-brasil", "", "Paubrasilia echinata", "Fabaceae", "nativa-brasil", "folhosa"],
  ["Cedrinho", "quarubarana", "Erisma uncinatum", "Vochysiaceae", "nativa-brasil", "folhosa"],
  ["Curupixá", "", "Micropholis venulosa", "Sapotaceae", "nativa-brasil", "folhosa"],
  ["Jequitibá-rosa", "jequitibá", "Cariniana legalis", "Lecythidaceae", "nativa-brasil", "folhosa"],
  ["Pequiá", "", "Caryocar villosum", "Caryocaraceae", "nativa-brasil", "folhosa"],
  ["Tatajuba", "", "Bagassa guianensis", "Moraceae", "nativa-brasil", "folhosa"],
  ["Pinho-do-paraná", "araucária;pinheiro-brasileiro", "Araucaria angustifolia", "Araucariaceae", "nativa-brasil", "conifera"],
  ["Angico", "angico-vermelho", "Anadenanthera colubrina", "Fabaceae", "nativa-brasil", "folhosa"],
  ["Aroeira", "aroeira-do-sertão", "Myracrodruon urundeuva", "Anacardiaceae", "nativa-brasil", "folhosa"],
  ["Pau-ferro", "jucá", "Libidibia ferrea", "Fabaceae", "nativa-brasil", "folhosa"],
  ["Canjerana", "", "Cabralea canjerana", "Meliaceae", "nativa-brasil", "folhosa"],
  ["Marupá", "", "Simarouba amara", "Simaroubaceae", "nativa-brasil", "folhosa"],
  ["Virola", "ucuúba", "Virola surinamensis", "Myristicaceae", "nativa-brasil", "folhosa"],
  ["Sapucaia", "", "Lecythis pisonis", "Lecythidaceae", "nativa-brasil", "folhosa"],
  // plantadas
  ["Pinus elliottii", "pinus;pínus", "Pinus elliottii", "Pinaceae", "exotica-plantada", "conifera"],
  ["Pinus taeda", "pinus", "Pinus taeda", "Pinaceae", "exotica-plantada", "conifera"],
  ["Eucalipto grandis", "eucalipto;eucalipto-rosa", "Eucalyptus grandis", "Myrtaceae", "exotica-plantada", "folhosa"],
  ["Eucalipto saligna", "eucalipto", "Eucalyptus saligna", "Myrtaceae", "exotica-plantada", "folhosa"],
  ["Eucalipto citriodora", "eucalipto-limão;corímbia", "Corymbia citriodora", "Myrtaceae", "exotica-plantada", "folhosa"],
  ["Teca", "", "Tectona grandis", "Lamiaceae", "exotica-plantada", "folhosa"],
  ["Mogno-africano", "khaya", "Khaya spp.", "Meliaceae", "exotica-plantada", "folhosa"],
  ["Cedro-australiano", "", "Toona ciliata", "Meliaceae", "exotica-plantada", "folhosa"],
  ["Acácia-negra", "", "Acacia mearnsii", "Fabaceae", "exotica-plantada", "folhosa"],
  ["Grevílea", "carvalho-australiano", "Grevillea robusta", "Proteaceae", "exotica-plantada", "folhosa"],
  // importadas
  ["Carvalho-europeu", "carvalho;oak", "Quercus robur", "Fagaceae", "importada", "folhosa"],
  ["Carvalho-branco-americano", "white oak", "Quercus alba", "Fagaceae", "importada", "folhosa"],
  ["Carvalho-vermelho-americano", "red oak", "Quercus rubra", "Fagaceae", "importada", "folhosa"],
  ["Nogueira-americana", "walnut;nogueira-preta", "Juglans nigra", "Juglandaceae", "importada", "folhosa"],
  ["Maple", "bordo;hard maple", "Acer saccharum", "Sapindaceae", "importada", "folhosa"],
  ["Cerejeira-americana", "cherry;cerejeira-preta", "Prunus serotina", "Rosaceae", "importada", "folhosa"],
  ["Faia", "faia-europeia;beech", "Fagus sylvatica", "Fagaceae", "importada", "folhosa"],
  ["Freixo-europeu", "freixo;ash", "Fraxinus excelsior", "Oleaceae", "importada", "folhosa"],
  ["Freixo-americano", "white ash", "Fraxinus americana", "Oleaceae", "importada", "folhosa"],
  ["Hickory", "nogueira-hickory", "Carya spp.", "Juglandaceae", "importada", "folhosa"],
  ["Ébano", "ébano-africano", "Diospyros spp.", "Ebenaceae", "importada", "folhosa"],
  ["Zebrano", "zebrawood", "Microberlinia brazzavillensis", "Fabaceae", "importada", "folhosa"],
  ["Wengê", "wenge", "Millettia laurentii", "Fabaceae", "importada", "folhosa"],
  ["Padauk", "padauk-africano", "Pterocarpus soyauxii", "Fabaceae", "importada", "folhosa"],
  ["Bubinga", "", "Guibourtia spp.", "Fabaceae", "importada", "folhosa"],
  ["Sapele", "sapelli", "Entandrophragma cylindricum", "Meliaceae", "importada", "folhosa"],
  ["Iroko", "", "Milicia excelsa", "Moraceae", "importada", "folhosa"],
  ["Meranti", "", "Shorea spp.", "Dipterocarpaceae", "importada", "folhosa"],
  ["Balsa", "pau-de-balsa", "Ochroma pyramidale", "Malvaceae", "importada", "folhosa"],
  ["Tília", "basswood;limewood", "Tilia spp.", "Malvaceae", "importada", "folhosa"],
  ["Bétula", "birch", "Betula spp.", "Betulaceae", "importada", "folhosa"],
  ["Cedro-vermelho", "western red cedar;tuia-gigante", "Thuja plicata", "Cupressaceae", "importada", "conifera"],
  ["Pinho-de-riga", "pinheiro-silvestre;pinus sylvestris", "Pinus sylvestris", "Pinaceae", "importada", "conifera"],
  ["Abeto", "abeto-vermelho;spruce", "Picea abies", "Pinaceae", "importada", "conifera"],
  ["Pinho-oregon", "douglas fir;abeto-de-douglas", "Pseudotsuga menziesii", "Pinaceae", "importada", "conifera"],
  // painéis e engenheiradas
  ["MDF", "fibra de média densidade", "", "", "painel-e-engenheirada", "painel"],
  ["HDF", "fibra de alta densidade", "", "", "painel-e-engenheirada", "painel"],
  ["MDP", "aglomerado", "", "", "painel-e-engenheirada", "painel"],
  ["Compensado", "compensado multilaminado", "", "", "painel-e-engenheirada", "painel"],
  ["Compensado naval", "", "", "", "painel-e-engenheirada", "painel"],
  ["OSB", "painel de tiras orientadas", "", "", "painel-e-engenheirada", "painel"],
  ["Madeira lamelada colada", "MLC;glulam", "", "", "painel-e-engenheirada", "painel"],
  ["CLT", "madeira lamelada cruzada", "", "", "painel-e-engenheirada", "painel"],
  ["LVL", "madeira microlaminada", "", "", "painel-e-engenheirada", "painel"],
];

// ---------- montagem ----------
function montarCatalogo(tabela, comTipo) {
  const categorias = [], itens = [];
  for (const [cid, cnome, cind, cic, subs] of tabela) {
    const cat = { id: cid, nome: cnome, ...(cind ? { indicadaPara: cind } : {}), icone: cic, subcategorias: [] };
    for (const [sid, snome, sind, sic, linhas] of subs) {
      cat.subcategorias.push({ id: sid, nome: snome, ...(sind ? { indicadaPara: sind } : {}), icone: sic });
      for (const l of linhas) {
        const [nome, ap, ofs] = l;
        const base = { nome, apelidos: lista(ap), categoria: cid, subcategoria: sid, oficios: of(ofs) };
        let doc;
        if (comTipo) {
          const [, , , tipo, nv, ic, resumo] = l;
          doc = { ...base, tipo, nivel: NIVEL[nv], icone: ic || sic, resumo,
            paraQueServe: [], comoUsar: [], seguranca: [], curiosidades: [], tutoriais: [], marcas: [], precos: {}, fontes: [] };
        } else {
          const [, , , ic, resumo, unidade] = l;
          doc = { ...base, icone: ic || sic, resumo, unidade,
            tipos: [], comoEscolher: [], comoAplicar: [], compatibilidade: [], rendimento: "", validadeEArmazenagem: "", seguranca: [],
            curiosidades: [], tutoriais: [], marcas: [], precos: {}, fontes: [] };
        }
        itens.push({ id: slug(nome), doc: { ...doc, detalhesEm: null, precosEm: null, por: "semente", desde: 1 } });
      }
    }
    categorias.push(cat);
  }
  return { categorias, itens };
}
const F = montarCatalogo(FERR, true), I = montarCatalogo(INS, false);
export const CATEGORIAS_FERRAMENTAS = F.categorias;
export const FERRAMENTAS = F.itens;
export const CATEGORIAS_INSUMOS = I.categorias;
export const INSUMOS = I.itens;
export const MADEIRAS = MAD.map(([nome, pop, cient, fam, grupo, tipo]) => ({ id: slug(nome), doc: {
  nome, nomesPopulares: lista(pop), nomeCientifico: cient, familia: fam, grupo, tipo,
  origem: [], origemNota: "", dureza: null, durabilidade: null, raridade: null, preco: null, densidade: null,
  cor: "", veio: "", trabalhabilidade: "", usos: [], acabamentoIndicado: [], cuidados: [], legalidade: "", alternativas: [],
  curiosidades: [], fontes: [], detalhesEm: null, por: "semente", desde: 1 } }));
