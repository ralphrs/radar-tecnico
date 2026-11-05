const { P, PILL, card, dec, step, cb, tiles, tbl, ul, C, h2, prose, rule, note } = require('./ui.cjs');
const D = require('./diagrams.cjs');
const pages = [];

/* 10 */
pages.push({
  id: 'simulador', nm: 'Simulador de reinvestimento', group: 'Próximas grandes', st: 'warn',
  lede: ['Passo 3 da fila. A pessoa escolhe um mês e um ano alvo e vê quanto a carteira chega a pagar de proventos, só reinvestindo o que recebe ou também com aporte mensal. O cenário fica guardado com a memória de cálculo e, com o tempo, dá para comparar o previsto com o que aconteceu.'],
  pstat: [PILL.fila(3), P('plain', 'HTML de hoje, API de hoje')],
  body: [
    h2('simulador-entrada', 'Entradas e cenários'),
    `<div class="cols">${[
      card('Só proventos', `<p>Mês/ano alvo e nenhum aporte. Tudo o que entra de provento é reinvestido.</p>`, { k: 'info' }),
      card('Com aporte mensal', `<p>Mês/ano alvo mais um aporte fixo por mês, somado ao reinvestimento dos proventos.</p>`, { k: 'info' }),
    ].join('')}</div>`,
    prose(`Cada cenário fica cifrado em ${C('carteira/<email>')}, junto com a memória de cálculo: as premissas e os números de cada mês, para a conta poder ser refeita e conferida depois. O widget da meta (${C('carteira-meta')}) já ganhou o link "Simular".`),

    h2('simulador-ciclo', 'Do cenário ao parecer'),
    D.simulador(),

    h2('simulador-ponto', 'O que o cron guarda'),
    prose('Uma vez por mês o cron grava um ponto por cenário: o que estava previsto e o que aconteceu. Só números, sem texto e sem conclusão.'),
    cb('Ponto-Mensal', 'um ponto mensal de um cenário', `{ <span class="k">"mes"</span>: "2026-12",
  <span class="k">"previsto"</span>: { <span class="k">"proventos"</span>: 1840.00, <span class="k">"cotas"</span>: { <span class="k">"KNIP11"</span>: 120 }, <span class="k">"patrimonio"</span>: 212400.00 },
  <span class="k">"real"</span>: { <span class="k">"proventos"</span>: 1702.35, <span class="k">"cotas"</span>: { <span class="k">"KNIP11"</span>: 118 }, <span class="k">"aportes"</span>: 0,
            <span class="k">"rendPorCota"</span>: { <span class="k">"KNIP11"</span>: 1.02 }, <span class="k">"cotacao"</span>: { <span class="k">"KNIP11"</span>: 98.40 },
            <span class="k">"eventos"</span>: [<span class="hl">"amortizacao:KNIP11"</span>] },
  <span class="k">"desvio"</span>: { <span class="k">"proventos"</span>: <span class="hl">-137.65</span>, <span class="k">"pct"</span>: <span class="hl">-7.5</span> } }`),

    h2('simulador-causas', 'As causas do desvio'),
    tbl(['Causa', 'O que pergunta'], [
      ['Rendimento por cota', 'O papel pagou por cota mais ou menos do que o cenário supunha?'],
      ['Cotação no reinvestimento', 'O preço na hora de reinvestir comprou mais ou menos cotas?'],
      ['Aportes', 'O aporte do mês foi o planejado?'],
      ['Composição', 'A carteira mudou de papéis ou de peso desde a criação do cenário?'],
      ['Resíduo', 'O que sobra depois das quatro causas acima, como eventos (amortização, por exemplo) e arredondamento.'],
    ]),

    h2('simulador-tela', 'Onde aparece'),
    `<div class="cards">${[
      card('Aba "Simulações"', `<p>Dentro da Minha carteira, com a lista de cenários e três ações: Ver, Analisar e Excluir.</p>`, { k: 'info', pills: [PILL.fila(3)] }),
      card('Widget "Minhas simulações"', `<p>No Início, no grupo da Minha carteira, com a marca "seu".</p>`, { k: 'info', pills: [PILL.fila(3)] }),
      card('Parecer por IA', `<p>Fora desta versão. O parecer sai de templates de texto fixo.</p>`, { k: 'bad', pills: [PILL.desligado()] }),
    ].join('')}</div>`,

    h2('simulador-decisoes', 'Decisões'),
    dec('A análise do desvio é sob demanda: só roda quando a pessoa clica em Analisar.',
      'O ROADMAP pede nada automático e nada de alerta. O cron guarda só os números; a explicação aparece quando a pessoa pede e fica no campo dos fatos e das contas, sem recomendação.', [P('idea', 'decisão registrada')]),
    dec('O parecer sai de templates de texto fixo; o parecer por IA fica desligado nesta versão.',
      'É a mesma linha da Leitura do dia, montada no Worker por templates, sem modelo de IA. Com templates, o mesmo desvio dá sempre o mesmo texto e não há custo de token por clique.'),
  ],
});

/* 11 */
pages.push({
  id: 'admin-2', nm: 'Administração 2.0', group: 'Próximas grandes', st: 'warn',
  lede: ['Passo 7 da fila e primeira página feita na stack nova. O admin de hoje tem muito texto e pouco visual. O objetivo é inverter: cards e números primeiro, convites com funil e métricas por pessoa.'],
  pstat: [PILL.fila(7), P('idea', 'piloto do SSR')],
  body: [
    h2('admin-2-hoje', 'Hoje e o objetivo'),
    `<div class="cols">${[
      card('Hoje', ul(['Convidados, grupos e seções, rendimento das fontes, custos, sonda de feeds, espelho e recarga da CVM', 'Muita explicação em texto corrido', 'Convites por WhatsApp ou e-mail, sem saber quem abriu']), { k: 'warn' }),
      card('Objetivo', ul(['Cards e números primeiro, texto só onde ajuda', 'Funil de convite por grupo e por canal', 'Métricas por pessoa e, talvez, métricas de uso']), { k: 'ok' }),
    ].join('')}</div>`,

    h2('admin-2-convites', 'Convites'),
    D.funil(),
    `<div class="cards">${[
      card('Por grupo e por canal', `<p>WhatsApp, e-mail ou link copiado. Cada canal leva um código de convite próprio, para saber por onde a pessoa veio.</p>`, { k: 'info' }),
      card('Funil', `<p>Enviado → abriu → entrou → ativo, com o número de cada etapa por grupo e por canal.</p>`, { k: 'info' }),
      card('Reenvio', `<p>Para quem não entrou, pelo mesmo canal ou por outro.</p>`, { k: 'info' }),
    ].join('')}</div>`,

    h2('admin-2-metricas', 'Métricas por pessoa'),
    tiles([
      ['Último acesso', 'data', 'por convidado'],
      ['Dias ativos', '30 dias', 'quantos dias com acesso'],
      ['Mais usados', 'seções', 'e widgets do Início'],
      ['Nunca entrou', 'lista', 'convite sem login'],
    ]),
    prose('Os números aparecem por pessoa para o Admin. Nos cards que já existem, favoritos, listas e painéis aparecem somados, sem o e-mail de ninguém; a carteira continua fora de qualquer rota de admin.'),

    h2('admin-2-analytics', 'Métricas de uso: três opções'),
    `<div class="dec"><div class="dmeta">${P('idea', 'ideia')}${P('ok', 'recomendação registrada')}</div><div class="dr"><b>Decisão</b><p>Começar pelos contadores internos e pelo Cloudflare Web Analytics. GA4 só se faltar alguma coisa.</p></div><div class="opts">
      <div class="opt pick"><h4>Contadores internos</h4><div class="pills">${P('ok', 'começar por aqui')}</div>${ul(['Em ' + C('uso/<email>'), 'Já dá para medir seção e widget pelo próprio Worker', 'Sem serviço novo'])}</div>
      <div class="opt pick"><h4>Cloudflare Web Analytics</h4><div class="pills">${P('ok', 'junto')}</div>${ul(['Sem cookie', 'Grátis', 'Só visão de página'])}</div>
      <div class="opt"><h4>GA4</h4><div class="pills">${P('warn', 'só se faltar algo')}</div>${ul(['Precisa de consentimento', 'LGPD', 'Mais pesado na página'])}</div>
    </div><div class="dr pq"><b>Por quê</b><p>Os contadores respondem o que o admin precisa (seções e widgets por pessoa) sem cookie e sem terceiro. O Web Analytics cobre as páginas de graça. O GA4 traria consentimento e peso para responder perguntas que talvez nem apareçam.</p></div></div>`,

    h2('admin-2-decisoes', 'Decisões'),
    dec('A Administração 2.0 é a primeira página feita na stack nova.',
      'É menor que as outras, só o Admin vê, e um erro no piloto não chega aos convidados. Se o framework escolhido na fase 0 tiver problema, ele aparece aqui antes de chegar ao Início.'),
  ],
});

/* 12 */
pages.push({
  id: 'ssr', nm: 'SSR com backend', group: 'Próximas grandes', st: 'warn',
  lede: ['A grande mudança. Hoje o public/index.html é um arquivo só, com toda a lógica e as chamadas à API no navegador. Com SSR e um backend na frente, a primeira tela chega pronta, as regras ficam no servidor, o navegador recebe só o que pode ver e os segredos e filtros por usuário param de depender do JS do cliente.'],
  pstat: [P('warn', 'passos 5 a 10 da fila'), P('warn', 'framework a decidir')],
  body: [
    h2('ssr-comparacao', 'Hoje e depois'),
    D.ssr(),

    h2('ssr-seguranca', 'Objetivos de segurança'),
    `<div class="cards">${[
      card('Leitura por usuário no servidor', `<p>Listas, carteira, prefs e leitura resolvidas no servidor com a identidade do Access. O HTML já vem filtrado.</p>`, { k: 'info' }),
      card('API interna fechada', `<p>O navegador fala só com o backend (BFF), que fala com o D1 e o espelho. O ${C('/api/*')} público some ou vira só o que precisa ser público.</p>`, { k: 'info' }),
      card('Nada de permissão no cliente', `<p>Sem lógica de permissão no navegador e sem chave ou token em HTML ou JS.</p>`, { k: 'info' }),
      card('Cabeçalhos e sessão', `<p>CSP sem inline e sem eval. Cookies e sessão do Access conferidos a cada pedido.</p>`, { k: 'info' }),
    ].join('')}</div>`,

    h2('ssr-fases', 'As cinco fases'),
    prose('Uma por vez, cada uma no ar antes da próxima.'),
    `<ol class="steps">${[
      step(0, 'Inventário', 'Listar telas, widgets, chamadas ' + C('/api/*') + ' e o que cada uma lê por usuário. Medir o tamanho e o tempo da primeira tela hoje, como base de comparação.', PILL.fila(5), 'sem a base de hoje não dá para saber se a mudança melhorou alguma coisa.'),
      step(1, 'Camada backend (BFF) no Worker', 'Rotas por tela que montam o JSON pronto. A página atual passa a consumir essas rotas, sem mexer no visual.', PILL.fila(6), 'troca o encanamento sem trocar a tela, então qualquer diferença visível é bug.'),
      step(2, 'Shell SSR no Worker', 'Layout, cabeçalho, navegação e Início renderizados no servidor. O resto ainda hidrata como hoje.', PILL.fila(9), 'a moldura vem primeiro e os widgets entram nela.'),
      step(3, 'Componente por componente', 'Cada widget migra para o framework, com os mesmos testes de tela: dois temas, celular e navegação sem beco.', PILL.fila(9), 'a sessão responsiva acontece aqui, widget a widget.'),
      step(4, 'Cutover', C('public/index.html') + ' sai, ' + C('/api/*') + ' fica restrito, medir de novo e comparar com a fase 0.', PILL.fila(10), 'só quando não sobra nada no HTML antigo.'),
    ].join('')}</ol>`,

    h2('ssr-framework', 'Decisão pendente: o framework'),
    tbl(['Candidato', 'Como roda no Worker'], [
      ['React Router 7', 'Modo framework, adaptador Cloudflare'],
      ['Astro em SSR', 'Adaptador Cloudflare, ilhas'],
      ['Hono + hono/jsx', 'SSR mínimo, sem build além do esbuild do wrangler'],
      ['SvelteKit ou Nuxt (Vue)', 'Adaptador Cloudflare'],
    ]),
    `<div class="cards">${[
      card('Critérios', ul(['Tamanho do JS que chega ao navegador', 'Build no Workers Builds sem passo extra', 'Durable Object e D1 pelo ' + C('env') + ' sem gambiarra', 'Facilidade de migrar um widget por vez', 'Testes com ' + C('node --test')]), { k: 'warn' }),
      card('Como decidir', `<p>Na fase 0, com um protótipo de uma tela (o Início) em dois candidatos.</p>`, { k: 'warn', pills: [PILL.fila(5)] }),
      card('Quando', `<p>Passos 5 a 10 da fila. O deploy segue pelo Workers Builds a cada push, e a versão nova só substitui a atual depois de conferir celular e desktop.</p>`, { k: 'warn' }),
    ].join('')}</div>`,

    h2('ssr-decisoes', 'Decisões'),
    dec('Uma fase por vez, cada uma no ar antes da próxima.',
      'Assim sempre existe uma versão que funciona, e um problema aparece na fase em que nasceu, com pouca coisa mudada em volta.'),
    dec('O Início migra por último.',
      'Ele junta widgets de todas as seções. Quando chegar a vez dele, os widgets já terão migrado um por um.'),
  ],
});

/* 13 */
pages.push({
  id: 'dados-de-teste', nm: 'Dados de teste', group: 'Por área', st: 'ok',
  lede: ['A conta de teste usa extratos falsos da B3, no formato que a Área do Investidor exporta, com papéis reais e números inventados. Nada vem da carteira do Admin: os papéis dele ficaram de fora do roteiro.'],
  pstat: [PILL.feito(), P('plain mono', 'roteiro 1.0.0'), P('warn', 'só na conta de teste')],
  body: [
    h2('dados-de-teste-oque', 'O que tem'),
    tiles([
      ['Cenários', '14', 'uma situação por cenário'],
      ['Semente', '2020', 'padrão do gerador'],
      ['Versão', '1.0.0', 'em VERSAO e no manifesto'],
      ['Linhas novas', '1.321', 'na primeira importação'],
      ['Ignoradas', '5', 'Tesouro e CDB'],
      ['Posições', '16 + 2', 'abertas e encerradas'],
    ]),
    prose(`O roteiro (${C('test/fixtures/b3-fake/cenarios.mjs')}) cobre fracionário, encerrada com lucro e com prejuízo, grupamento, bonificação, desdobro, subscrição exercida, não exercida e cedida, fração e leilão, amortização, empréstimo, transferência entre corretoras, ETF, BDR, FI-Infra, Fiagro, linhas ignoradas, compra repetida no mesmo dia, aportes recentes e papel sem cotação. No fim, ${C('ESPERADO')} diz o que a tela tem de mostrar.`,
      `O preço é um passeio aleatório mensal com semente fixa, dentro de uma faixa por papel; não segue a cotação histórica. Os .xlsx são escritos com openpyxl, pelo Python, porque o repositório não tem biblioteca de planilha e não vale pôr uma só para isso.`),

    h2('dados-de-teste-fluxo', 'Gerar, importar e corrigir'),
    D.teste(),
    cb('Gerar-Extratos', 'gerar e, depois, gerar só a correção', `<span class="c"># primeira geração</span>
npm run b3-fake -- --saida /caminho/da/pasta --ate <span class="hl">2026-11-04</span>

<span class="c"># correção: só a diferença contra o manifesto da última importação</span>
npm run b3-fake -- --saida /caminho/correcao --ate 2026-12-15 \\
  --diff /caminho/da/pasta/<span class="hl">manifesto.json</span>`),

    h2('dados-de-teste-versao', 'Versão do roteiro'),
    tbl(['Tipo', 'Quando', 'O que fazer na conta de teste'], [
      [{ v: 'patch 1.0.1', m: true }, 'Só texto; as linhas são as mesmas', 'Nada'],
      [{ v: 'minor 1.1.0', m: true }, 'Cenário ou evento novo, sem mexer nas linhas que existiam', 'Gerar a correção e importar'],
      [{ v: 'major 2.0.0', m: true }, 'Alguma linha já gerada muda ou some', 'Apagar a carteira da conta de teste (digitar APAGAR) e importar a pasta nova'],
    ]),
    note('Regra.', 'Mudou o cálculo da carteira, sobe a versão, anota no CHANGELOG o que mudou e o que fazer na conta de teste, ajusta o ESPERADO e roda o npm test.'),

    h2('dados-de-teste-decisoes', 'Decisões'),
    dec('Extratos falsos só na conta de teste, com papéis reais e números inventados.',
      'A tela precisa ser conferida com algo que se pareça com a B3 de verdade, sem expor carteira de ninguém. Os papéis do Admin ficaram fora do roteiro de propósito.'),
    dec('Gerador determinístico: mesma versão, semente e data dão os mesmos arquivos, byte a byte.',
      'Com isso o README promete números exatos e o teste do npm test consegue comparar. A correção por diff existe para a prévia mostrar só o que é novo.'),
  ],
});

/* 14 */
pages.push({
  id: 'inicio', nm: 'Início e interface', group: 'Por área', st: 'ok',
  lede: ['O site abre no Início, um painel de widgets por grupos. Em volta dele, uma série de peças comuns da interface: campos com formato por tipo, tabelas com um helper só, colunas laterais recolhíveis e listas por regra.'],
  pstat: [PILL.feito('04/11'), P('warn', 'responsivo nas fases 2 e 3')],
  body: [
    h2('inicio-painel', 'O painel'),
    `<div class="cards">${[
      card('Grupos', `<p>Notícias, Mercado, Minha carteira, Análises, Fóruns e Esportes por padrão. Cada grupo recolhe e abre pelo título; grupo sem card visível não aparece.</p>`, { k: 'ok' }),
      card('Grade', `<p>3 colunas a partir de 1200 px, 2 entre 700 e 1200 e 1 abaixo. Cada widget tem um formato colunas × linhas (1x1, 2x1, 3x1, 1x2, 2x2) e o corpo decide quantos itens mostra.</p>`, { k: 'ok' }),
      card('Modo de edição', `<p>Grade quadriculada, redimensionar com os limites de cada card, arrastar, tirar card. O Personalizar virou o catálogo "Adicionar card".</p>`, { k: 'ok', pills: [PILL.feito('04/11')] }),
      card('Salvo na conta', `<p>Ordem, largura e o que aparece ficam em ${C('prefs/<email>')}, doc ${C('painel')}, e valem em qualquer aparelho.</p>`, { k: 'ok' }),
    ].join('')}</div>`,

    h2('inicio-pecas', 'Peças comuns'),
    tbl(['Peça', 'Onde está', 'O que faz'], [
      ['Campos', { v: 'public/campo.js', m: true }, 'Moeda, percentual, número, inteiro, data, mês/ano e papel. Aceita "2k", "1,5 mi", "11,9%"; valor cru por baixo, formata ao sair do campo'],
      ['Tabelas', { v: 'public/tabela.js', m: true }, 'Ordenar sem perder a rolagem, paginação 25/50/100, filtro por coluna, várias colunas com Shift+clique, estado salvo por tabela'],
      ['Colunas recolhíveis', 'a partir de 900 px', 'Botão no topo de cada coluna lateral; recolhida vira uma faixa de 36 px. Estado em ' + C('/api/prefs/layout')],
      ['Listas por regra', { v: '#lista/<id>', m: true }, 'Regras sobre os dados que já existem, histórico de quem entrou e saiu, comparação com a carteira'],
      ['Menu da conta', 'avatar no cabeçalho', 'Minha carteira, Minha meta, Importar extratos, Minhas listas, Meus esportes, Aparência, Administração, Trocar de conta e Sair'],
    ]),

    h2('inicio-pendente', 'Pendência'),
    `<div class="cards">${card('Sessão responsiva', `<p>Telas grandes, tablet e celular revistos de ponta a ponta. Acontece dentro das fases 2 e 3 do SSR, widget a widget, e não como passo separado.</p>`, { k: 'warn', pills: [PILL.fila(9)] })}</div>`,

    h2('inicio-decisoes', 'Decisões'),
    dec('O site abre direto no painel inicial.',
      'Substituiu a ideia de abrir na Bolsa. Cada pessoa monta o Início com o que usa, e sair dele para uma seção cria uma entrada no histórico, então o Voltar do navegador traz o Início de volta.', [PILL.feito('03/11')]),
    dec('Enquanto o Início está aberto, nenhuma seção fica assinada.',
      'Sem polling do feed, do status nem do mercado de fundo. Cada widget lê o que precisa, e o resto espera a pessoa entrar na seção.'),
  ],
});

/* 15 */
pages.push({
  id: 'radar', nm: 'Radar e listas', group: 'Por área', st: 'ok',
  lede: ['O Radar de dividendos é a terceira visão de Investimentos: filtros salvos por pessoa, quem passa hoje, a carteira contra o filtro e a Leitura do dia. As listas guardam os papéis que cada um acompanha, à mão ou por regra.'],
  pstat: [PILL.feito('03/11'), P('warn', '3 pendências')],
  body: [
    h2('radar-dividendos', 'Radar de dividendos'),
    `<div class="cards">${[
      card('Filtros por pessoa', `<p>Critérios por classe: P/VP, DY 12m, liquidez, regularidade, segmento, mandato e mais. Salvos em ${C('prefs/<email>')}, doc ${C('radar')}.</p>`, { k: 'ok' }),
      card('Quem passa hoje', `<p>Com avisos em chips (rendimento caindo, perdendo cotistas, P/VP fora da curva, DY puxado por queda) e a coluna "Na meta".</p>`, { k: 'ok' }),
      card('Carteira contra o filtro', `<p>Quantos papéis da carteira passam, quem saiu e quem entrou hoje.</p>`, { k: 'ok' }),
      card('Leitura do dia', `<p>Até 8 fatos curtos por pessoa, montados por templates no Worker às 7h40 de São Paulo, sem IA. Fecha sempre com "Só fatos. Nada aqui é recomendação."</p>`, { k: 'ok' }),
    ].join('')}</div>`,

    h2('radar-listas', 'Listas'),
    `<div class="cards">${[
      card('Manuais', `<p>Nome e papéis, sem quantidade nem preço médio, para espelhar o que cada um tem na própria instituição. Ordem por arrastar ou pelo cabeçalho.</p>`, { k: 'ok', pills: [PILL.feito('01/11')] }),
      card('Automáticas da carteira', `<p>FIIs, Ações, BDRs, ETFs e Subscrições, travadas, com "Copiar para lista minha".</p>`, { k: 'ok', pills: [PILL.feito('03/11')] }),
      card('Por regra', `<p>A lista se realimenta a cada atualização e guarda o histórico de quem entrou e saiu, com data e motivo. Página própria em ${C('#lista/<id>')}.</p>`, { k: 'ok', pills: [PILL.feito('03/11')] }),
      card('Comparações com a carteira', `<p>Preço atual × preço médio, resultado em R$ e %, quanto falta para empatar, DY sobre custo × DY atual. Linha verde ou vermelha pelo resultado da posição.</p>`, { k: 'ok', pills: [PILL.feito('04/11')] }),
    ].join('')}</div>`,

    h2('radar-pendente', 'Pendências do ROADMAP'),
    `<div class="cards">${[
      card('Histórico de dividendos por ano', `<p>"Anos seguidos pagando" (brapi) e "anos seguidos aumentando" (Finnhub) pedem guardar esse histórico nas fichas.</p>`, { k: 'warn', pills: [PILL.pendente()] }),
      card('P/L e DY das ações', `<p>Hoje dependem de a ficha ter sido aberta. Vale buscar as do universo no cron quando os tokens entrarem.</p>`, { k: 'warn', pills: [PILL.admin()] }),
      card('Datas na Leitura do dia', `<p>Data com e de pagamento, quando houver fonte.</p>`, { k: 'warn', pills: [PILL.pendente()] }),
    ].join('')}</div>`,

    h2('radar-decisoes', 'Decisões'),
    dec('A mesma regra de filtro roda na tela e na Leitura do dia.',
      'Critérios, avisos e "Na meta" ficam em public/radar-filtro.js, um script que a página carrega e o Worker importa. Assim o que a pessoa vê na tela bate com o que a Leitura diz.'),
    dec('Sugestões das listas por regra saem sempre como fato e conta.',
      'O Lookout pode sugerir papéis que passam na regra e ajustes na regra, nunca como recomendação.'),
  ],
});

/* 16 */
pages.push({
  id: 'esportes', nm: 'Esportes', group: 'Por área', st: 'ok',
  lede: ['Rodada, próximos jogos e tabela das competições que cada pessoa liga em "Meus esportes", sem IA. Os dados vêm dos endpoints públicos da ESPN e, no Gauchão, do Globo Esporte quando a ESPN não tiver.'],
  pstat: [PILL.feito('04/11'), P('warn', 'sondas a conferir')],
  body: [
    h2('esportes-oque', 'O que existe'),
    `<div class="cards">${[
      card('ESPN por dia', `<p>Scoreboard de 3 dias antes a 10 depois, em São Paulo, mais tabela e agenda dos times. Hoje só futebol: Brasileirão, Libertadores, Copa do Brasil, Gauchão, Sul-Americana e as ligas da Europa.</p>`, { k: 'ok' }),
      card('Cartões na aba', `<p>Um por competição ligada, com Rodada, Próximos e Tabela com zonas coloridas e o "seu time" em negrito.</p>`, { k: 'ok' }),
      card('Meus esportes', `<p>Em ${C('#esportes/config')}, pelo menu da conta: competições, ordem e até 10 times.</p>`, { k: 'ok' }),
      card('Widgets', `<p>Rodada, tabela e próximo jogo do time escolhido, no Início.</p>`, { k: 'ok' }),
    ].join('')}</div>`,
    tbl(['Parte', 'Ritmo no cron'], [
      ['Rodada (scoreboard)', 'A cada 15 min com jogo ao vivo ou perto; senão 1x por hora'],
      ['Tabela', '2x por dia'],
      ['Agenda dos times', '1x por dia, só de quem está numa competição ligada'],
    ]),
    cb('Meta-Esportes', 'meta/esportes-&lt;liga&gt;, campos principais', `{ <span class="k">atualizado</span>, <span class="k">liga</span>, <span class="k">nome</span>, <span class="k">temporada</span>, <span class="k">fonte</span>: <span class="hl">"espn" | "ge"</span>,
  <span class="k">tabela</span>: [{ pos, time, sigla, id, j, v, e, d, gp, gc, sg, pts, zona }],
  <span class="k">rodada</span>: { numero, jogos: [jogo] }, <span class="k">proximos</span>: [...], <span class="k">ultimos</span>: [...] }`),

    h2('esportes-pendente', 'Pendências'),
    `<div class="cards">${[
      card('Conferir as sondas em produção', `<p>Olhar as amostras de ${C('_sistema/sonda-esportes-aNN')} do primeiro cron e ajustar os parsers da ESPN e do ge ao formato real. O ambiente de desenvolvimento não alcança a ESPN nem o ge, então os parsers foram escritos pelo formato conhecido.</p>`, { k: 'warn', pills: [PILL.fila(12)] }),
      card('NBA e tênis', `<p>NBA (04/11) e ATP e WTA (05/11) já estão em ${C('LIGAS')} e na tela; falta conferir o formato pelas amostras da sonda. NFL retirada em 05/11 e F1 fora, por decisão do dono. Padel só com notícias até haver fonte de resultados.</p>`, { k: 'warn', pills: [PILL.fila(12)] }),
      card('RSS do ge', `<p>Pôr em ${C('src/feeds.js')} os que a sonda achar com itens.</p>`, { k: 'warn', pills: [PILL.admin()] }),
    ].join('')}</div>`,

    h2('esportes-decisoes', 'Decisões'),
    dec('Sem escudo de clube e sem foto de jogador.',
      'É regra fixa do projeto. Fica o nome do time e, onde falta espaço, a sigla de 3 letras, o que já basta para ler rodada e tabela no celular.'),
    dec('O Internacional aparece como "Inter" no selo de clube e no título do grupo.',
      'Para não confundir com o filtro Nacional/Internacional do feed. O dado gravado não muda.', [PILL.feito('04/11')]),
  ],
});

/* 17 */
pages.push({
  id: 'mais-adiante', nm: 'Mais adiante', group: 'Depois', st: 'idea',
  lede: ['Coisas que estão no ROADMAP.md sem data e sem lugar fixo na fila. Algumas dependem de o acervo crescer; outras só esperam vez.'],
  pstat: [PILL.ideia()],
  body: [
    h2('mais-adiante-lista', 'Na lista'),
    `<div class="cards">${[
      card('Busca com IA', `<p>Só quando o acervo de Tech passar de 3 mil itens ou a busca atual deixar de dar conta.</p>`, { k: 'idea', pills: [PILL.ideia()] }),
      card('Marcar como lido', `<p>Junto com esconder fonte.</p>`, { k: 'idea', pills: [PILL.ideia()] }),
      card('Atalhos de teclado', `<p>Na mesma linha de marcar como lido e esconder fonte.</p>`, { k: 'idea', pills: [PILL.ideia()] }),
      card('Job mensal de exportação', `<p>Extratos da B3 exportados pelo Chrome uma vez por mês. Já tem lugar na fila, no passo 11.</p>`, { k: 'warn', pills: [PILL.fila(11)] }),
      card('Outras ligas', `<p>Esportes fica em futebol, NBA, tênis e padel (só notícias). Passo 12 da fila.</p>`, { k: 'warn', pills: [PILL.fila(12)] }),
      card('Domínio próprio', `<p>Depende do nome da empresa. Veja <a href="#troca-de-nome">Troca de nome</a>.</p>`, { k: 'warn', pills: [PILL.admin()] }),
    ].join('')}</div>`,
    dec('Busca com IA só com acervo grande.',
      'Enquanto a busca atual dá conta, ela resolve sem gastar token. O gatilho registrado é o acervo de Tech passar de 3 mil itens ou a busca atual deixar de dar conta.'),
  ],
});

/* 18 */
pages.push({
  id: 'linha-do-tempo', nm: 'Linha do tempo', group: 'Depois', st: 'ok',
  lede: ['O que entrou, dia a dia, pelas datas entre parênteses do ROADMAP.md. O dia 31/10 vem do docs/coleta.md; as fontes não registram nada com data de 30/10.'],
  pstat: [P('plain mono', '31/10 a 04/11')],
  body: [
    h2('linha-do-tempo-dias', 'Dia a dia'),
    `<ol class="tl">${[
      ['31/10', 'sáb', 'Coleta nova', ['Coleta por RSS no cron do Worker, tabela de candidatos e limpeza automática']],
      ['01/11', 'dom', 'Acesso, custos e fontes', ['Grupos de acesso por seção; a API recusa seção não liberada', 'Custos no admin e plano Workers Paid', 'Estado dos candidatos com motivo, rendimento das fontes e sonda de feeds', 'Índice na URL dos itens, depois de estourar o limite diário de leituras do D1', 'Cache de borda de 3 min nas leituras', 'FIIs com o informe mensal da CVM, detalhe do papel com gráfico, visões Bolsa e Notícias', 'Listas de acompanhamento por pessoa']],
      ['02/11', 'seg', 'Espelho', ['Espelho de leitura em São Paulo, com o Worker sem Smart Placement']],
      ['03/11', 'ter', 'O maior dia', ['Acabamento do espelho: write-through, trava de 60 s, logs amostrados e custo do DO', 'Subreddits como fonte de candidatos', 'Mandato, gestão e prazo dos FIIs', 'Início com painel de widgets, no lugar de abrir na Bolsa', 'Minha carteira e Radar de dividendos', 'Listas automáticas da carteira e ficha do papel para B3, BDR e EUA', 'Tabelas e sidebars (pacote 1); listas por regra, comparações, sugestões e lista de listas (pacote 2)', 'À tarde: descrição e página própria por lista, Personalizar com tamanhos']],
      ['04/11', 'qua', 'Fóruns, esportes e fila', ['Reddit vira "Nos fóruns", com 38 subreddits nas cinco seções', 'Esportes: rodada, próximos e tabela pela ESPN e pelo ge', 'Minhas listas com Qtd e Valor; "Trocar de conta"; "Inter" no selo', 'Passo 0: campos com formato pelo tipo', 'Passo 1: modo de edição do Início; logotipo do admin leva ao Início', 'Repositório todo em lookout; fila em ordem registrada']],
    ].map(([d, w, t, items]) => `<li><div class="d">${d}<small>${w}</small></div><div class="b"><h3>${t}</h3>${ul(items)}</div></li>`).join('')}</ol>`,
    dec('A fila em ordem foi registrada em 04/11, com o SSR no meio.',
      'As telas novas e grandes saem já na stack nova, para não fazer duas vezes. O que é pequeno ou é mais dado do que tela sai antes, no HTML de hoje.'),
  ],
});

module.exports = pages;
