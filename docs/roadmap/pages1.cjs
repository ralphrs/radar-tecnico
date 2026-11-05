const { P, PILL, card, dec, step, cb, tiles, tbl, ul, C, h2, prose, rule, note } = require('./ui.cjs');
const D = require('./diagrams.cjs');
const pages = [];

/* 1 */
pages.push({
  id: 'comecar', nm: 'Começar por aqui', group: 'Começo', st: 'ok',
  lede: ['O Lookout é o radar pessoal de notícias e de mercado do Admin, aberto só para convidados. Roda num Worker da Cloudflare, guarda tudo num banco D1 e serve as leituras de um espelho em São Paulo. As notícias chegam pela coleta automática e passam por uma curadoria; cotações, tabelas da B3, carteira, listas e esportes saem de crons sem IA.'],
  pstat: [P('plain mono', 'estado de 04/11/2026'), PILL.feito(), P('info', 'troca de nome em andamento'), P('warn', 'SSR na fila')],
  body: [
    h2('comecar-ler', 'Como ler esta página'),
    prose(
      'Cada item do trilho à esquerda é uma página. O endereço muda junto (por exemplo, <code>#fila</code>), então dá para mandar o link de uma página direto e o botão Voltar do navegador funciona. No celular o trilho fica atrás do botão de menu, no topo.',
      'As primeiras quatro páginas são o mapa: o que é o Lookout, a fila em ordem, as regras que valem para qualquer tarefa e o que só o Admin pode fazer. Depois vêm a troca de nome, a base técnica, cada área do produto e as mudanças grandes.',
      '<ul><li>Os <b>diagramas</b> são numerados. O número na caixa é o mesmo da lista que vem logo abaixo do desenho. No celular eles rolam para o lado.</li><li>Os <b>cartões de decisão</b> trazem o que foi decidido e o porquê, sempre nessa ordem.</li><li>Os <b>blocos de exemplo</b> mostram comandos, consultas e formatos de dado como estão nas fontes.</li></ul>'
    ),
    `<div class="cards">${[
      card('Estados', `<div class="pills">${PILL.feito()}${PILL.andamento()}${PILL.fila()}${PILL.admin()}${PILL.ideia()}${PILL.desligado()}</div><p>Verde já está no ar. Azul está sendo feito agora. Laranja está na fila ou espera alguma ação. Roxo é ideia ou decisão registrada. Vermelho ficou de fora de propósito.</p>`),
      card('De onde vem cada coisa', `<p>Tudo aqui sai do ${C('ROADMAP.md')}, de ${C('docs/LOOKOUT.md')}, de ${C('docs/cloudflare.md')}, de ${C('docs/coleta.md')} e de ${C('docs/dados-de-teste.md')}, no estado de 04/11. Onde a fonte não detalha, a página também não detalha.</p>`),
    ].join('')}</div>`,

    h2('comecar-pilares', 'Os pilares'),
    `<div class="cards">${[
      card('Worker, D1 e espelho', `<p>Um Worker só (${C('lookout')}, código em ${C('src/')}) serve a página, a API e o admin. O D1 é a fonte da verdade. As leituras saem de um Durable Object com SQLite em São Paulo, copiado do D1 a cada minuto.</p>`, { k: 'ok', pills: [PILL.feito('02/11')] }),
      card('Cloudflare Access', `<p>Login pelo Google, só para quem está na lista de convidados. O Worker confere o token em cada requisição e, sem configuração, não deixa ninguém entrar. Grupos de acesso dizem que seções cada convidado vê.</p>`, { k: 'ok', pills: [PILL.feito('01/11')] }),
      card('Coleta por cron', `<p>O cron do Worker roda a cada minuto: lê os feeds, os subreddits, as cotações, as tabelas da B3, o informe da CVM e os placares da ESPN. Nada disso gasta token.</p>`, { k: 'ok', pills: [PILL.feito()] }),
      card('Curadoria', `<p>Tarefas agendadas do Claude escolhem o que entra, escrevem título e resumo e marcam cada candidato como publicado ou descartado, com motivo. Sonnet 3 vezes por dia nas abas novas; o Tech atual ainda é Opus com busca.</p>`, { k: 'info', pills: [P('info', 'Tech em comparação')] }),
    ].join('')}</div>`,

    h2('comecar-no-ar', 'O que já está no ar'),
    tiles([
      ['Seções', '6', 'Início, Tech, Negócios, Investimentos, Notícias e Política, Esportes'],
      ['Tipos de widget', '23', '10 gerais, 7 da carteira, 3 do radar, 3 de esportes'],
      ['Módulos do Worker', '21', 'arquivos em src/, mais 5 scripts em public/'],
      ['Visões de Investimentos', '4', 'Bolsa, EUA, Radar e Notícias'],
      ['Subreddits', '38', 'em Nos fóruns, nas cinco seções'],
      ['Cron', '1 min', 'coleta, mercado, espelho e esportes'],
      ['Itens feitos', '57', 'marcados no ROADMAP.md em 04/11'],
      ['Plano', 'US$ 5', 'Workers Paid por mês, desde 01/11'],
    ]),
    prose('Os números de widget contam tipos do catálogo: um tipo como "Destaques" aparece uma vez por seção. Os 23 somam os do catálogo geral (Hoje no Lookout, Mercado, Pregão, FIIs, EUA, Minhas listas, Favoritos, Destaques, Últimas e Fóruns), os 7 da Minha carteira, os 3 do Radar de dividendos e os 3 de Esportes.'),

    h2('comecar-pedido', 'Como um pedido chega à página'),
    D.pedido(),
    dec('As leituras saem do espelho em São Paulo; as gravações vão sempre ao D1.',
      'O D1 fica no leste dos EUA e não existe D1 na América do Sul. Com o Worker na borda e o espelho perto de quem lê, a viagem longa só acontece numa gravação ou quando a leitura cai no fallback.', [PILL.feito('02/11')]),
  ],
});

/* 2 */
pages.push({
  id: 'fila', nm: 'A fila em ordem', group: 'Começo', st: 'info',
  lede: ['A fila de 04/11 tem treze passos, de 0 a 12. Os dois primeiros já saíram. A grande mudança, o front em SSR com backend, entra no meio da fila e não no fim, porque as telas grandes e novas devem nascer já na stack nova.'],
  pstat: [P('ok', '2 feitos'), P('info', '1 em andamento'), P('warn', '10 na fila')],
  body: [
    h2('fila-regra', 'A regra que ordena'),
    rule('Regra', 'O que é pequeno ou é mais dado do que tela sai antes, no HTML de hoje, porque a API continua a mesma. Tela grande e nova (Administração 2.0, sessão responsiva) só sai na stack nova, para não fazer o trabalho duas vezes.'),
    prose('Por isso o simulador e a renda fixa ficam fora do caminho do SSR: são, na maior parte, cálculo e dado. Já a Administração 2.0 é uma tela nova inteira e vira o piloto da stack nova.'),
    D.fila(),

    h2('fila-passos', 'Os passos'),
    `<ol class="steps">${[
      step(0, 'Campos com formato pelo tipo', 'Moeda, percentual, número, data, mês/ano e papel com um helper para a página toda (' + C('public/campo.js') + '). O valor cru fica por baixo e o campo formata ao sair.', PILL.feito('04/11'), 'é pequeno, mexe só na página de hoje e qualquer tela que vier depois já usa o mesmo helper.', 'ok'),
      step(1, 'Modo de edição do Início', 'Grade quadriculada, redimensionar com os limites de cada card, arrastar para cima e para baixo, tirar card e grupos por tipo. O Personalizar virou o catálogo "Adicionar card".', PILL.feito('04/11'), 'fechou o pedido de 03/11 sobre o Personalizar sem esperar a stack nova.', 'ok'),
      step('·', 'Logotipo do admin leva ao Início', 'Ajuste pequeno de navegação, sem número na fila.', PILL.feito('04/11'), 'cumpre a regra de não ter beco sem saída.', 'ok'),
      step(2, 'Troca de nome news → lookout', 'O repositório já está todo em ' + C('lookout') + '. Falta criar o Worker novo no painel, colar os secrets, ligar o Access, conferir, apagar o news e renomear o repositório.', PILL.andamento(), 'já está pela metade: o repositório foi trocado em 04/11 e o resto é painel.', 'info'),
      step(3, 'Simulador de reinvestimento', 'Mês/ano alvo, só proventos ou com aporte, cenários com memória de cálculo gravada na carteira, comparar e excluir. Com o tempo, análise do desvio sob demanda.', PILL.fila(3), 'é mais dado do que tela e usa a API de hoje.'),
      step(4, 'Ajustes da curadoria Tech', 'Ajustes a partir do relatório de 04/11. A decisão sai dois dias depois.', PILL.fila(4), 'depende só do relatório e do tempo de comparação.'),
      step(5, 'SSR, fase 0', 'Inventário de telas, widgets e chamadas ' + C('/api/*') + ', medição da primeira tela de hoje, protótipo do Início em dois candidatos e decisão do framework.', PILL.fila(5), 'sem a medição de hoje não há com o que comparar no cutover.'),
      step(6, 'SSR, fase 1', 'Camada backend (BFF) no Worker. A página de hoje passa a consumir as rotas novas sem mudar o visual.', PILL.fila(6), 'é a base de tudo o que vem depois na stack nova, inclusive da renda fixa.'),
      step(7, 'Administração 2.0', 'Menos texto e mais visual, convites por grupo e por canal com funil, métricas por pessoa e a ideia de métricas de uso.', PILL.fila(7), 'é o piloto do SSR: página menor, só o Admin vê, e um erro não chega aos convidados.'),
      step(8, 'Renda fixa e Tesouro', 'Pelo relatório "Posição" da Área do Investidor: importação e cálculo contra o BFF, com tela simples.', PILL.fila(8), 'o cálculo pode vir antes da tela; a tela migra junto no passo 9.'),
      step(9, 'SSR, fases 2 e 3', 'Shell renderizado no servidor e widget por widget na stack nova.', PILL.fila(9), 'a sessão de telas grandes, tablet e celular acontece aqui, widget a widget, e não como um passo separado.'),
      step(10, 'SSR, fase 4: cutover', C('public/index.html') + ' sai, ' + C('/api/*') + ' fica restrito, e a medição volta para comparar com a fase 0.', PILL.fila(10), 'só depois de todos os widgets migrados.'),
      step(11, 'Job mensal de exportação dos extratos pelo Chrome', 'Exportar os extratos da B3 uma vez por mês, sem passo manual.', PILL.fila(11), 'não depende do SSR e a importação manual já funciona enquanto isso.'),
      step(12, 'Esportes: futebol, NBA, tênis e padel', 'NBA (04/11) e tênis (05/11) na lista e na tela; padel só com notícias; NFL retirada em 05/11 e F1 fora, por decisão do dono. Falta conferir as sondas da ESPN e do ge em produção.', PILL.fila(12), 'o módulo já aceita outras ligas da ESPN; é acréscimo, sem pressa.'),
    ].join('')}</ol>`,

    h2('fila-decisoes', 'Decisões da ordem'),
    dec('O SSR entra no meio da fila, entre o simulador e a renda fixa.',
      'As telas novas e grandes saem já na stack nova, para não fazer duas vezes. O que é pequeno ou é mais dado do que tela sai antes, no HTML de hoje, porque a API continua a mesma.', [P('idea', 'registrada em 04/11')]),
    dec('A primeira página na stack nova é a Administração 2.0. O Início fica para o fim.',
      'O admin é menor e só o Admin vê, então um erro do piloto não chega aos convidados. O Início depende dos widgets, que migram um por um antes dele.'),
  ],
});

/* 3 */
pages.push({
  id: 'regras', nm: 'Regras que valem sempre', group: 'Começo', st: 'ok',
  lede: ['Duas listas valem para qualquer tarefa: o Definition of done do ROADMAP.md, que diz quando algo está pronto, e as regras fixas, que dizem o que nunca se faz com os dados.'],
  pstat: [P('plain', 'vale para toda tarefa')],
  body: [
    h2('regras-dod', 'Definition of done'),
    `<div class="cards">${[
      card('Navegação sem beco sem saída', `<p>De qualquer página ou estado (admin, lista, ficha, carteira, esportes, convite, erro) dá para voltar ao Início pelo logotipo e pelo botão Voltar do navegador.</p>`, { k: 'ok' }),
      card('Dois temas e celular, com print', `<p>Tema claro, tema escuro e celular conferidos com print antes de dar a tarefa por encerrada.</p>`, { k: 'ok' }),
      card('Texto em pt-BR natural', `<p>Ação, FII ou BDR é sempre "papel", nunca o termo em inglês. Sem recomendação de compra ou venda e sem o nome do dono. Quando for preciso falar dele, é "o Admin".</p>`, { k: 'ok' }),
      card('Testes passando', `<p>${C('npm test')} e ${C('node --check')} passando antes de subir.</p>`, { k: 'ok' }),
      card('Versão dos dados de teste', `<p>Mudou o cálculo da carteira, sobe a versão do roteiro dos dados de teste e gera a correção.</p>`, { k: 'ok' }),
    ].join('')}</div>`,
    cb('Conferencia-Antes-De-Subir', 'o mínimo antes de cada push', `<span class="c"># testes do projeto, inclusive os da carteira e dos dados de teste</span>
npm test

<span class="c"># sintaxe de cada arquivo alterado</span>
node --check src/<span class="hl">&lt;arquivo&gt;</span>.js`),

    h2('regras-fixas', 'Regras fixas'),
    `<div class="cards">${[
      card('Coletores não tocam dado por pessoa', `<p>Coleta e curadoria nunca mexem em favoritos, listas, prefs, carteira ou leitura (${C('favs/')}, ${C('listas/')}, ${C('prefs/')}, ${C('carteira/')}, ${C('leitura/')}). Ninguém abre ${C('carteira/')} fora da rota da própria pessoa.</p>`, { k: 'bad' }),
      card('D1 sem DROP', `<p>Nunca ${C('DROP')}. ${C('UPDATE')} e ${C('DELETE')} só com lista explícita de ids.</p>`, { k: 'bad' }),
      card('Importação idempotente', `<p>Importar de novo os mesmos arquivos dá zero linhas novas. A deduplicação é por multiconjunto: duas compras iguais no mesmo dia continuam sendo duas.</p>`, { k: 'ok' }),
      card('Segredos só no painel', `<p>Ficam em Workers &amp; Pages → ${C('lookout')} → Variables and Secrets, nunca no repositório. O ${C('wrangler.jsonc')} usa ${C('keep_vars: true')}, então um deploy não apaga nada.</p>`, { k: 'warn' }),
      card('Extratos reais fora do repositório', `<p>Os arquivos da B3 de verdade nunca entram no repositório. Na importação, o arquivo nem sai do navegador.</p>`, { k: 'warn' }),
      card('Dados falsos só na conta de teste', `<p>Os extratos gerados pelo ${C('b3-fake')} são importados só na conta de teste, nunca numa conta real.</p>`, { k: 'warn' }),
      card('Sem escudo e sem foto', `<p>Esportes mostra o nome do time e, onde falta espaço, a sigla de 3 letras. Nada de escudo de clube nem foto de jogador.</p>`, { k: 'warn' }),
      card('O prompt roda só o que lista', `<p>Cada tarefa agendada só executa os comandos que o próprio prompt lista.</p>`),
    ].join('')}</div>`,

    h2('regras-decisoes', 'Por que essas regras'),
    dec('Nada de recomendação de compra ou venda, em nenhum lugar do Lookout.',
      'O Lookout mostra fatos e contas: P/VP, DY, resultado da posição, quem entrou e saiu de um filtro. Até as sugestões das listas por regra saem como fato e conta. A Leitura do dia fecha sempre com "Só fatos. Nada aqui é recomendação."'),
    dec('UPDATE e DELETE só com lista explícita de ids.',
      'Um comando sem lista pode apagar dado de convidado. Com a lista na mão, o estrago possível fica do tamanho da lista e dá para conferir antes.'),
  ],
});

/* 4 */
pages.push({
  id: 'admin-pendente', nm: 'Depende do Admin', group: 'Começo', st: 'warn',
  lede: ['Algumas coisas só andam com uma ação do Admin: colar um token no painel, escolher um nome, decidir entre duas opções. Esta página junta tudo o que está parado por isso.'],
  pstat: [P('warn', '9 pendências'), P('plain', 'nenhuma pede código novo')],
  body: [
    h2('admin-pendente-tokens', 'Tokens a colar'),
    `<div class="cards">${[
      card(`${C('BRAPI_TOKEN')}`, `<p>O Admin cria a conta na brapi e cola o token como secret do Worker. Hoje só o Ibovespa do painel de mercado depende dele.</p>${ul(['Fundamentos completos da ficha das ações da B3', 'Conferir na ' + C('_sistema/sonda-brapi-quote') + ' os campos que a brapi mandou de verdade', 'Buscar no cron as fichas do universo, para o Radar ter P/L e DY de todas as ações'])}`, { k: 'warn', pills: [PILL.admin()] }),
      card(`${C('FINNHUB_TOKEN')}`, `<p>Cotações e ficha completa dos EUA.</p>${ul(['Fundamentos dos papéis dos EUA na ficha', '"Anos seguidos aumentando" no Radar, que também pede guardar o histórico de dividendos por ano'])}`, { k: 'warn', pills: [PILL.admin()] }),
    ].join('')}</div>`,

    h2('admin-pendente-nome', 'Nome e domínio'),
    `<div class="cards">${[
      card('Nome da empresa e domínio', `<p>Em escolha, em outra sessão. Sem o domínio não há custom domain ${C('lookout.<domínio>')} e o link para o Gabriel não sai.</p>`, { k: 'warn', pills: [PILL.admin(), P('plain', 'outra sessão')] }),
      card('Passos no painel da troca de nome', `<p>Do passo 2 ao 8 da troca: projeto ${C('lookout')} no Workers Builds, secrets, Access com AUD novo, conferir no ar, apagar o ${C('news')}, domínio e renomear o repositório. Detalhe na página <a href="#troca-de-nome">Troca de nome</a>.</p>`, { k: 'warn', pills: [PILL.admin(), PILL.andamento()] }),
    ].join('')}</div>`,

    h2('admin-pendente-decisoes', 'Decisões e ajustes'),
    `<div class="cards">${[
      card('Curadoria Tech', `<p>Decidir a troca pela curadoria nova com base no relatório de 04/11, dois dias depois dos ajustes. Critérios: pelo menos um fato concreto por resumo, fontes brasileiras perto do que a atual traz e custo por rodada medido.</p>`, { k: 'warn', pills: [PILL.admin(), PILL.fila(4)] }),
      card(`Access Bypass para ${C('/convite*')}`, `<p>Criar no Access a regra de Bypass para os caminhos ${C('/convite*')}.</p>`, { k: 'warn', pills: [PILL.admin()] }),
      card('Definir Minha meta', `<p>Na conta do Admin: Minha carteira → Minha meta, com alvo, aporte, yield e reinvestir.</p>`, { k: 'warn', pills: [PILL.admin()] }),
      card('Saudação do Início', `<p>Hoje o cabeçalho do Início cumprimenta pelo primeiro nome que vem de ${C('/api/me')}. Falta decidir se fica com ou sem o primeiro nome.</p>`, { k: 'warn', pills: [PILL.admin()] }),
      card('RSS do ge e fontes novas', `<p>O Admin põe em ${C('src/feeds.js')} os RSS do ge que a sonda achar respondendo 200 com itens, e as fontes de Investimentos que a sonda de feeds aprovar.</p>`, { k: 'warn', pills: [PILL.admin()] }),
    ].join('')}</div>`,

    dec('Nada que dependa de segredo é feito por agente.',
      'Os segredos ficam só no painel da Cloudflare. O repositório não guarda nenhum, e o deploy com keep_vars não apaga o que foi colado. Por isso token, AUD e chave da carteira ficam com o Admin.'),
  ],
});

/* 5 */
pages.push({
  id: 'troca-de-nome', nm: 'Troca de nome news → lookout', group: 'Em andamento', st: 'info',
  lede: ['O Worker nasceu como news e passou a se chamar lookout. Renomear não existe no painel da Cloudflare: na prática é um Worker novo com o mesmo código, o mesmo banco e um Access novo. O repositório já foi todo trocado em 04/11; o resto é painel.'],
  pstat: [PILL.andamento(), P('ok', 'repositório pronto em 04/11'), PILL.admin()],
  body: [
    h2('troca-de-nome-muda', 'O que muda e o que não muda'),
    `<div class="cols">${[
      card('Não muda', ul(['O D1 (' + C('lookout') + ', mesmo id no ' + C('wrangler.jsonc') + ')', 'O cron', 'O repositório, até o passo 8']), { k: 'ok' }),
      card('Muda', ul(['O endereço no ' + C('workers.dev'), 'O espelho: Durable Object novo, nasce vazio e se enche em 1 minuto', 'Os secrets: ficam no Worker antigo e precisam ser colados de novo', 'A aplicação do Access: é por hostname, então nasce outra, com ' + C('ACCESS_AUD') + ' novo']), { k: 'warn' }),
    ].join('')}</div>`,
    note('Atenção.', `A ${C('CARTEIRA_KEY')} tem de ser a mesma do news. Com outra chave, as carteiras já gravadas ficam ilegíveis.`),

    h2('troca-de-nome-passos', 'Os 8 passos'),
    D.troca(),
    cb('Conferir-Cron', 'passo 5 · no D1, gravação recente vinda do cron', `<span class="k">SELECT</span> id <span class="k">FROM</span> docs
<span class="k">WHERE</span> collection=<span class="hl">'meta'</span>
<span class="k">ORDER BY</span> rowid <span class="k">DESC</span> <span class="k">LIMIT</span> 5;`),

    h2('troca-de-nome-estado', 'Estado dos sub-itens'),
    `<ol class="steps">${[
      step('1', 'Repositório todo em lookout', 'wrangler, custos, user-agent, docs e admin.', PILL.feito('04/11'), 'é a parte que não depende do painel.', 'ok'),
      step('2', 'Worker lookout no Workers Builds', 'Criado, com os secrets colados (a CARTEIRA_KEY a mesma) e o Access ligado com AUD novo.', PILL.admin(), 'depende do Admin no painel.'),
      step('3', 'Conferir no ar e apagar o news', 'Login, Início, admin, custos, cron gravando e espelho cheio. Depois, apagar o news.', PILL.pendente(), 'apagar antes de conferir deixaria todo mundo sem página.'),
      step('4', 'Renomear o repositório no GitHub', 'Conferir o Workers Builds, ' + C('git remote set-url') + ' nas máquinas e trocar o nome antigo nos docs e no README.', PILL.pendente(), 'o GitHub redireciona o endereço antigo, mas o Workers Builds pode precisar ser religado.'),
      step('5', 'Domínio próprio', 'Custom domain ' + C('lookout.<domínio>') + '; só então mandar o link para o Gabriel.', P('warn', 'depende do nome da empresa'), 'o nome ainda está em escolha.'),
    ].join('')}</ol>`,

    h2('troca-de-nome-decisoes', 'Decisões'),
    dec('Renomear hoje, domínio depois.',
      'O nome do Worker não depende de nada de fora. O domínio depende do nome da empresa, que ainda está em escolha. Quando ele chegar, entra como mais um hostname na mesma aplicação do Access e o ACCESS_AUD não muda, então nada do que for feito agora precisa ser refeito.', [P('idea', 'registrada em 04/11')]),
    dec('O link para o Gabriel só sai depois do domínio.',
      'Assim ele recebe o endereço definitivo uma vez só, sem passar pelo workers.dev e sem precisar trocar depois.'),
    dec('Apagar o news só depois de conferir o lookout no ar.',
      'Enquanto os dois existem, os dois crons gravam no mesmo D1. A importação é idempotente, então não duplica nada, mas o gasto dobra. E apagar o news leva junto o espelho antigo e a aplicação news do Access, que deixam de fazer falta só quando o novo está de pé.'),
  ],
});

/* 6 */
pages.push({
  id: 'base', nm: 'Base e infraestrutura', group: 'O que existe', st: 'ok',
  lede: ['Um Worker, um banco D1 como fonte da verdade e um espelho de leitura em São Paulo. Por cima, cache de borda, cron a cada minuto e um card de custos no admin que acompanha tudo contra os limites do plano.'],
  pstat: [PILL.feito(), P('plain mono', 'Workers Paid · US$ 5/mês')],
  body: [
    h2('base-pecas', 'As peças'),
    `<div class="cards">${[
      card('Worker', `<p>Serve a página, a API e o admin. Roda na borda, perto de quem acessa, sem Smart Placement. O deploy sai pelo Workers Builds a cada push.</p>`, { k: 'ok' }),
      card('D1, a fonte da verdade', `<p>Coletas, crons de mercado, admin e curadorias gravam só nele. Quase tudo mora na tabela ${C('docs(collection, id, data)')}; à parte ficam ${C('candidatos')}, ${C('feeds_estado')}, ${C('usuarios')}, ${C('grupos')} e ${C('usuario_grupo')}.</p>`, { k: 'ok' }),
      card('Espelho em São Paulo', `<p>Durable Object com SQLite (${C('src/espelho.js')}), uma instância criada com ${C('locationHint: "sam"')}. Copia as collections de itens, destaques, ${C('foruns-*')}, ${C('meta')}, ${C('hist')}, ${C('_sistema')}, os dados por pessoa e as tabelas de usuários e grupos.</p>`, { k: 'ok', pills: [PILL.feito('02/11')] }),
      card('Sincronia 1x por minuto', `<p>No fim de cada cron, compara chave e marca de cada doc e copia só o que mudou, em lotes de 90. Uma sincronia de cada vez, com trava de 60 s.</p>`, { k: 'ok', pills: [PILL.feito('03/11')] }),
      card('Write-through', `<p>Favoritos, listas e painel do Início gravam no D1 com ${C('await')} e, só depois de dar certo, a mesma linha vai ao espelho. A pessoa vê a mudança na leitura seguinte.</p>`, { k: 'ok', pills: [PILL.feito('03/11')] }),
      card('Fallback para o D1', `<p>Se o espelho der erro, passar de 2 s ou não tiver terminado a primeira carga, a leitura vai ao D1. As gravações vão sempre ao D1.</p>`, { k: 'ok' }),
      card('Cache de borda', `<p>3 min nas leituras da API, mais 30 a 60 s na memória do isolate. Entrou em 01/11 para poupar o D1.</p>`, { k: 'ok', pills: [PILL.feito('01/11')] }),
      card('Cron a cada minuto', `<p>Coleta, cotações, B3, CVM, esportes, Leitura do dia, limpeza no minuto 7 de cada hora e, no fim, a sincronia do espelho.</p>`, { k: 'ok' }),
      card('Custos no admin', `<p>Workers e D1 contra os limites do plano, tamanho das collections, rodadas de curadoria do mês e o custo do Durable Object. Conta a mensalidade e o excedente.</p>`, { k: 'ok', pills: [PILL.feito('01/11')] }),
    ].join('')}</div>`,

    h2('base-fluxo', 'Leitura e gravação'),
    D.base(),

    h2('base-seguranca', 'Travas e alavancas'),
    tbl(['O quê', 'Como funciona'], [
      ['Trava de segurança', 'Se o D1 devolver lista vazia, ou se a sincronia fosse apagar mais da metade do espelho (com 20 docs ou mais), ela para e grava o erro. O espelho segue servindo como estava.'],
      ['Uma sincronia de cada vez', 'O DO recusa outra sincronia por até 60 s enquanto a atual não termina. Assim o cron e o botão "Sincronizar agora" do admin não brigam.'],
      ['Ordem igual nos dois lados', 'O /api/q usa o mesmo SQL no espelho e no D1, com desempate fixo, e a paginação não pula nem repete item.'],
      [{ v: 'ESPELHO_ATIVO', m: true }, 'Com "0" no painel, todas as leituras voltam ao D1 sem deploy. O deploy seguinte devolve o valor do wrangler.jsonc.'],
      ['Zerar e recarregar', 'Botão no card "Espelho em São Paulo" do admin. Esvazia o DO e recarrega tudo do D1; enquanto isso, a leitura vai ao D1.'],
      ['Logs amostrados', 'Leitura boa no espelho sai 1 em cada 20 por isolate. Fallback sai sempre, com o motivo, e o card mostra a contagem do dia.'],
    ]),
    cb('Collections-Do-D1', 'o que mora na tabela docs', `<span class="c"># itens e destaques por seção</span>
<span class="k">items</span>, items-negocios, items-investimentos, items-politica, items-esportes
<span class="k">destaques</span>, destaques-negocios, ...

<span class="c"># por pessoa (nunca tocados por coletor)</span>
<span class="hl">favs/&lt;email&gt;  listas/&lt;email&gt;  prefs/&lt;email&gt;  carteira/&lt;email&gt;  leitura/&lt;email&gt;</span>

<span class="c"># estado e mercado</span>
<span class="k">meta</span>: status-*, mercado, b3, fii, fii-resumo, esportes-&lt;liga&gt;
<span class="k">hist</span>: ficha de cada papel aberto (BR:PETR4, US:NVDA, ...)
<span class="k">_sistema</span>: seed, limpeza, sondas e erros`),

    h2('base-decisoes', 'Decisões'),
    dec('Worker na borda sem Smart Placement, com as leituras no espelho.',
      'Antes o Worker rodava perto do banco nos EUA e quem abria a página no Brasil fazia a viagem longa em toda requisição. Com o espelho em São Paulo, a viagem longa ficou só para gravação e fallback.', [PILL.feito('02/11')]),
    dec('Índice na URL dos itens e cache de borda antes de qualquer outra otimização.',
      'A coleta varria a tabela inteira a cada feed e estourou o limite diário de leituras do D1 em 01/11. O índice resolveu a varredura e o cache de 3 min tirou do banco as leituras repetidas da página.', [PILL.feito('01/11')]),
  ],
});

/* 7 */
pages.push({
  id: 'noticias', nm: 'Notícias e curadoria', group: 'O que existe', st: 'info',
  lede: ['Cinco seções de notícia: Tech, Negócios, Investimentos, Notícias e Política, e Esportes. O Worker lê os feeds e os subreddits sem gastar token; a curadoria escolhe, resume e descarta com motivo. O Tech ainda está em comparação entre a curadoria atual e a nova.'],
  pstat: [PILL.feito(), P('info', 'Tech em comparação'), PILL.fila(4)],
  body: [
    h2('noticias-secoes', 'As seções'),
    tbl(['Seção', 'Curadoria', 'Observação'], [
      ['Tech', 'Opus com busca (atual) e curadoria nova em teste lado a lado', 'A nova grava em sombra-*, fora do site, até a decisão'],
      ['Negócios', 'Sonnet 3x por dia (7h41, 13h41, 19h41)', 'Startups, fusões, big techs, IA como negócio, fintechs, varejo, regulação, América Latina, China e Ásia'],
      ['Investimentos', 'Sonnet 3x por dia', 'Só fatos, sem recomendação de compra ou venda'],
      ['Notícias e Política', 'Sonnet 3x por dia', 'Filtro Nacional/Internacional'],
      ['Esportes', 'Sonnet 3x por dia', 'Mais rodada, próximos e tabela pela ESPN (veja Esportes)'],
    ]),

    h2('noticias-fluxo', 'Do feed ao site'),
    D.noticias(),

    h2('noticias-admin', 'O que o admin mostra'),
    `<div class="cards">${[
      card('Candidatos e motivos', `<p>Cada candidato termina publicado ou descartado, com o motivo: repetido, promocional, fora do tema, antigo ou raso.</p>`, { k: 'ok', pills: [PILL.feito('01/11')] }),
      card('Rendimento das fontes', `<p>Lidos, publicados, descartados por motivo e feeds com erro, nos últimos 10 dias. Inclui a coluna "No fórum" e marca "bloqueado" no subreddit que levou 403 três vezes seguidas.</p>`, { k: 'ok', pills: [PILL.feito('01/11')] }),
      card('Sonda de feeds', `<p>Cola as URLs e o cron testa 4 por minuto com o mesmo parser da coleta. URL do Reddit vai uma por minuto, nos minutos em que a coleta não leu subreddit.</p>`, { k: 'ok', pills: [PILL.feito('01/11')] }),
      card('Nos fóruns', `<p>38 subreddits nas cinco seções, lidos pelos mais votados do dia. Bloco na lateral de cada seção (depois do feed no celular) e widget Fóruns no Início.</p>`, { k: 'ok', pills: [PILL.feito('04/11')] }),
    ].join('')}</div>`,
    cb('Saude-Dos-Feeds', 'consulta de docs/coleta.md para ver a saúde dos feeds', `<span class="k">SELECT</span> fonte, url, <span class="hl">erros_seguidos</span>, erro, itens_ultima, novos_total, ultimo_ok
<span class="k">FROM</span> feeds_estado
<span class="k">ORDER BY</span> erros_seguidos <span class="k">DESC</span>, fonte;`),

    h2('noticias-pendente', 'Pendências'),
    `<div class="cards">${[
      card('Decisão da curadoria Tech', `<p>Ajustes pelo relatório de 04/11 e decisão dois dias depois. Critérios: pelo menos um fato concreto por resumo, fontes brasileiras perto do que a atual traz e custo por rodada medido (a atual não grava buscas).</p>`, { k: 'warn', pills: [PILL.fila(4), PILL.admin()] }),
      card('Startups e IA como mercado saem de Tech', `<p>Já foram copiadas para Negócios. Sair das tarefas de Tech só depois de aprovado.</p>`, { k: 'warn', pills: [PILL.pendente()] }),
      card('Fontes novas de Investimentos', `<p>A partir do que a sonda aprovar.</p>`, { k: 'warn', pills: [PILL.pendente()] }),
    ].join('')}</div>`,

    h2('noticias-decisoes', 'Decisões'),
    dec('Os posts do Reddit vão direto para Nos fóruns, sem curadoria.',
      'A curadoria descartava todos os posts do Reddit, como rasos ou fora do tema. Separados em foruns-&lt;radar&gt;, com limpeza de 3 dias, eles aparecem como o que são: conversa de fórum, ao lado das notícias.', [PILL.feito('04/11')]),
    dec('O Tech troca de curadoria só depois da comparação lado a lado.',
      'Trocar sem comparar seria apostar. Com as duas rodando ao mesmo tempo e a nova gravando fora do site, os critérios do relatório decidem.'),
  ],
});

/* 8 */
pages.push({
  id: 'mercado', nm: 'Investimentos e mercado', group: 'O que existe', st: 'ok',
  lede: ['A aba Investimentos tem quatro visões: Bolsa, que é a principal, EUA, Radar e Notícias, com um letreiro de índices fixo no topo. Os números saem de crons do Worker, sem IA e quase todos sem token.'],
  pstat: [PILL.feito(), P('warn', 'tokens pendentes')],
  body: [
    h2('mercado-painel', 'Painel de mercado'),
    prose('Ibovespa, IFIX, dólar, Selic, CDI, IPCA 12 meses e BTC. O IFIX ainda está fora e o Ibovespa só entra com o token da brapi. O botão "Atualizar agora" consulta no máximo uma vez a cada 5 minutos, para todo mundo.'),
    tbl(['O quê', 'Fonte', 'Quando'], [
      ['Moedas e cripto', 'AwesomeAPI; se recusar, PTAX do BC, CoinGecko e por último Mercado Bitcoin', 'a cada 30 min'],
      ['Selic, CDI, IPCA 12m', 'Banco Central, SGS', 'duas vezes por dia'],
      ['Ibovespa', 'brapi, só com o secret BRAPI_TOKEN', 'a cada 30 min no pregão'],
      ['Tabelas de ações, FIIs, FI-Infra, Fiagro, ETFs e BDRs', 'brapi, rota de lista, sem token', 'a cada 30 min no pregão e às 21h35 UTC'],
      ['Dados dos FIIs', 'informe mensal da CVM (dados abertos)', '10h12 e 10h17 UTC, em duas etapas'],
    ]),

    h2('mercado-bolsa', 'Bolsa, ficha e FIIs'),
    `<div class="cards">${[
      card('Tabelas da B3', `<p>Ações, FIIs, FI-Infra, Fiagro, ETFs e BDRs, ordenáveis e com filtro. FIIs, FI-Infra e Fiagro separados pelo ${C('sub')} da brapi, com FIP-IE junto de FI-Infra.</p>`, { k: 'ok', pills: [PILL.feito('03/11')] }),
      card('Ficha do papel', `<p>Para ações da B3, BDRs e ações dos EUA: faixas do dia e de 52 semanas, gráfico de 1 ano (1M · 3M · 1A), estatísticas, perfil e listagem cruzada BDR e EUA. Cache de 24 h em ${C('hist')}, renovado no cron para o que foi aberto na semana.</p>`, { k: 'ok', pills: [PILL.feito('03/11')] }),
      card('FIIs com o informe da CVM', `<p>DY, rendimento, P/VP, cotistas e segmento (01/11). Depois, mandato, gestão, prazo, administrador, início e público-alvo, com chips, "Sobre o fundo" no diálogo e filtro Mandato.</p>`, { k: 'ok', pills: [PILL.feito('03/11')] }),
      card('EUA', `<p>Visão própria com S&amp;P 500, Nasdaq e Dow, e o widget com as maiores altas e baixas.</p>`, { k: 'ok' }),
    ].join('')}</div>`,
    note('No informe de 2026', 'o mandato veio vazio. Ele aparece quando a CVM mandar ou pelo informe do ano anterior.'),

    h2('mercado-pendente', 'Pendências'),
    `<div class="cards">${[
      card('Vacância e imóveis dos FIIs', `<p>A partir do informe trimestral da CVM.</p>`, { k: 'warn', pills: [PILL.pendente()] }),
      card('Tokens da brapi e da Finnhub', `<p>Ficha com fundamentos completos, Ibovespa no painel e fundamentos do universo no cron. Veja <a href="#admin-pendente">Depende do Admin</a>.</p>`, { k: 'warn', pills: [PILL.admin()] }),
      card('Histórico de dividendos por ano', `<p>"Anos seguidos pagando" (brapi) e "anos seguidos aumentando" (Finnhub) pedem guardar esse histórico nas fichas.</p>`, { k: 'warn', pills: [PILL.pendente()] }),
      card('Tesouro', `<p>O preço do Tesouro ainda não entrou no cron. Vem com a renda fixa, pela API pública 1x por dia.</p>`, { k: 'warn', pills: [PILL.fila(8)] }),
    ].join('')}</div>`,

    h2('mercado-decisoes', 'Decisões'),
    dec('As tabelas da B3 vêm da rota de lista da brapi, sem token.',
      'Ela responde sem token e traz tudo numa chamada por tipo. Antes, a brapi grátis respondia um papel por chamada, umas 500 chamadas por dia.'),
    dec('"Atualizar agora" no máximo uma vez a cada 5 minutos, para todo mundo.',
      'O limite vale para todo mundo, então vários convidados apertando ao mesmo tempo geram uma consulta só, e o resultado aparece para todos.'),
  ],
});

/* 9 */
pages.push({
  id: 'carteira', nm: 'Minha carteira', group: 'O que existe', st: 'ok',
  lede: ['Pessoal, para quem tem Investimentos liberado. A pessoa solta os extratos da B3 no navegador e o Lookout calcula posições, preço médio, proventos, meta, rentabilidade e IR para conferência. Tudo fica cifrado e nenhuma rota de admin lê a carteira de ninguém.'],
  pstat: [PILL.feito('03/11'), P('warn', '5 pendências')],
  body: [
    h2('carteira-importacao', 'Importação e cifra'),
    `<div class="cards">${[
      card('Importação no navegador', `<p>Negociação, Movimentação e Proventos recebidos, vários de uma vez. A página lê a planilha, reconhece o tipo pelo cabeçalho, corta o "Produto" no código do papel e manda só as linhas, com o SHA-256 do arquivo. O arquivo em si nunca vai ao servidor.</p>`, { k: 'ok' }),
      card('O que não entra', `<p>Nome, CPF, conta, CNPJ, ISIN, a linha "Produto" inteira e a razão social da corretora, que vira sigla. Tesouro Direto e CDB ficam de fora e contam como ignorados.</p>`, { k: 'ok' }),
      card(`Cifra com ${C('CARTEIRA_KEY')}`, `<p>AES-GCM 256, com o JSON comprimido e um IV aleatório por documento, em ${C('carteira/<email>')}. Sem o secret, as rotas respondem 503 e a página mostra o aviso.</p>`, { k: 'ok' }),
      card('Prévia antes de importar', `<p>Primeiro uma simulação, só com a contagem de linhas novas, repetidas e ignoradas. Depois, de verdade. Reimportar o mesmo arquivo dá zero novas.</p>`, { k: 'ok' }),
    ].join('')}</div>`,

    h2('carteira-calculo', 'O que a carteira calcula'),
    tbl(['Bloco', 'O que mostra'], [
      ['Posições', 'Quantidade pela Movimentação, por papel e corretora, com fracionário somado no lote; classe de cada papel'],
      ['Preço médio', 'Média ponderada das compras; venda baixa a quantidade sem mudar o PM; bonificação, desdobro e grupamento mantêm o custo'],
      ['Proventos', 'Do extrato de proventos, completados pela Movimentação onde nenhum arquivo cobriu; yield sobre o custo por papel e da carteira'],
      ['Meta', 'Renda mês a mês com aporte e reinvestimento, data no ritmo atual, marcos e trajetória realizada e projetada'],
      ['Rentabilidade por cotas', 'TWR mês a mês em 12 meses, no ano e desde o início'],
      ['IR para conferir', 'Vendas em ações no mês, lucro em FII, JCP no ano e prejuízo acumulado, sem day trade nem custos'],
      ['Alertas', 'Rendimento pago menor que o anterior nos últimos 45 dias, direito de subscrição em carteira e outros avisos de estado'],
    ]),
    cb('Doc-Meta-Carteira', 'carteira/&lt;email&gt;, doc meta (antes da cifra)', `{ <span class="k">"alvo"</span>: ..., <span class="k">"aporte"</span>: ..., <span class="k">"yield"</span>: <span class="c">fração, ou null para usar o da carteira</span>, <span class="k">"reinvestir"</span>: ..., <span class="k">"atualizado"</span>: ... }`),
    prose(`Os widgets ${C('carteira-meta')}, ${C('carteira-patrimonio')}, ${C('carteira-proventos-mes')}, ${C('carteira-pagamentos')}, ${C('carteira-agenda')}, ${C('carteira-rentabilidade')} e ${C('carteira-alertas')} levam a marca "seu" no Início e só aparecem para quem importou extratos.`),

    h2('carteira-pendente', 'Pendências'),
    `<div class="cards">${[
      card('IFIX, CDI e Ibovespa', `<p>Comparação da rentabilidade com os índices. Falta guardar a série histórica deles; hoje aparece "em breve".</p>`, { k: 'warn', pills: [PILL.pendente()] }),
      card('Datas com e de pagamento', `<p>Dos rendimentos. A CVM não dá data de pagamento.</p>`, { k: 'warn', pills: [PILL.pendente()] }),
      card('Renda fixa e Tesouro', `<p>Pelo relatório "Posição" da Área do Investidor: CDB, LCI/LCA, CRI e Tesouro, curva por CDI ou IPCA mais taxa, IR estimado e vencimentos na agenda.</p>`, { k: 'warn', pills: [PILL.fila(8)] }),
      card('Bens e direitos', `<p>Lista para a declaração.</p>`, { k: 'warn', pills: [PILL.pendente()] }),
      card('Exportar CSV', `<p>Sair com os dados da carteira em CSV.</p>`, { k: 'warn', pills: [PILL.pendente()] }),
    ].join('')}</div>`,

    h2('carteira-decisoes', 'Decisões'),
    dec('O aviso "Nada aqui é recomendação" fica só no rodapé de Investimentos.',
      'Menos texto repetido. A frase continua valendo para a carteira inteira, e a Leitura do dia segue fechando com ela.', [P('idea', 'decisão de 04/11')]),
    dec('O arquivo da B3 nunca sai do navegador.',
      'O servidor só precisa das linhas, já sem nome, CPF ou conta. Guardar menos é a forma mais simples de não vazar.'),
  ],
});

module.exports = pages;
