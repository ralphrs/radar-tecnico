const { X, box, dia, ar, lbl, loopLbl, lane, fig } = require('./svg.cjs');
const VB = h => `0 0 1022 ${h}`;
const D = {};

D.pedido = () => {
  const y1 = 50, y2 = 180;
  const b = [
    box(X[0], y1, 1, 'Navegador', 'abre o Lookout', { k: 'k-in' }),
    box(X[1], y1, 2, 'Cloudflare Access', 'login pelo Google'),
    box(X[2], y1, 3, 'Worker na borda', 'confere o token'),
    box(X[3], y1, 4, 'Espelho em SP', 'Durable Object, SQLite'),
    box(X[4], y1, 5, 'Página e dados', 'só as seções liberadas', { k: 'k-ok' }),
    box(X[1], y2, 6, 'Sem login', 'não passa daqui', { k: 'k-bad' }),
    box(X[2], y2, 7, 'Cache de borda', '3 min nas leituras', { k: 'k-ev' }),
    box(X[3], y2, 8, 'D1', 'fonte da verdade', { k: 'k-in' }),
    ar('M166,82 H222'), ar('M376,82 H432'), ar('M586,82 H642'), ar('M796,82 H852'),
    ar('M301,114 V176'), lbl(301, 152, 'sem token', 'fl-no'),
    ar('M511,114 V176', 'ev'), lbl(511, 152, 'guarda a resposta'),
    ar('M721,114 V176'), lbl(721, 152, 'erro ou mais de 2 s', 'fl-no'),
    ar('M796,212 H931 V118'), lbl(870, 212, 'reserva'),
  ].join('');
  return fig('Pedido-Ate-A-Pagina', 'Como um pedido chega à página', VB(264), b,
    'O caminho normal é 1 → 2 → 3 → 4 → 5. O D1 só entra na leitura quando o espelho falha, demora ou ainda não terminou a primeira carga.',
    [['Navegador', 'A pessoa abre o endereço do Lookout, no celular ou no desktop.'],
     ['Cloudflare Access', 'Pede o login pelo Google antes de qualquer coisa.'],
     ['Worker na borda', 'Roda perto de quem acessa e confere em toda requisição o token do Access, a lista de convidados e as seções liberadas para cada pessoa. Sem configuração, não deixa ninguém entrar.'],
     ['Espelho em São Paulo', 'Um Durable Object com SQLite que copia do D1, a cada minuto, o que a página lê.'],
     ['Página e dados', 'O Worker devolve a página e o JSON de cada seção. A API recusa seção não liberada.'],
     ['Sem login', 'Sem token válido, o pedido para no Access.'],
     ['Cache de borda', 'As leituras da API ficam 3 min no cache de borda e 30 a 60 s na memória do isolate, para poupar o banco.'],
     ['D1', 'Banco principal, no leste dos EUA. Recebe todas as gravações e serve de reserva para a leitura.']],
    'Pedido do navegador passa pelo Cloudflare Access, chega ao Worker na borda, lê do espelho em São Paulo e volta como página. Sem login, para no Access. O cache de borda guarda as leituras por 3 minutos. Se o espelho falhar, a leitura vai ao D1.', 880);
};

D.fila = () => {
  const yA = 50, yB = 192, yC = 334;
  const b = [
    lane(4, 8, 1014, 126, 'No HTML de hoje · sem dependência entre si'),
    lane(4, 150, 1014, 126, 'Stack nova · uma fase por vez'),
    lane(4, 292, 1014, 126, 'Fora do caminho do SSR'),
    box(X[0], yA, 0, 'Campos por tipo', 'feito em 04/11', { k: 'k-ok' }),
    box(X[1], yA, 1, 'Modo de edição', 'feito em 04/11', { k: 'k-ok' }),
    box(X[2], yA, 2, 'Troca de nome', 'em andamento', { k: 'k-ev' }),
    box(X[3], yA, 3, 'Simulador', 'dado, pouca tela'),
    box(X[4], yA, 4, 'Curadoria Tech', 'ajustes e decisão'),
    box(X[0], yB, 5, 'SSR, fase 0', 'inventário e framework'),
    box(X[1], yB, 6, 'SSR, fase 1', 'BFF no Worker'),
    box(X[2], yB, 7, 'Administração 2.0', 'piloto da stack nova', { k: 'k-idea' }),
    box(X[3], yB, 9, 'SSR, fases 2 e 3', 'shell e widgets'),
    box(X[4], yB, 10, 'Cutover', 'index.html sai'),
    box(X[0], yC, 11, 'Job de extratos', 'mensal, pelo Chrome'),
    box(X[3], yC, 8, 'Renda fixa', 'relatório Posição'),
    box(X[4], yC, 12, 'Esportes', 'NBA, NFL e F1'),
    ar('M166,224 H222'), ar('M376,224 H432'), ar('M586,224 H642'), ar('M796,224 H852'),
    ar('M301,256 V366 H642'), lbl(470, 366, 'usa as rotas do BFF'),
    ar('M721,334 V260'), lbl(721, 300, 'migra junto'),
  ].join('');
  return fig('Fila-Dependencias', 'A fila de 04/11 e o que depende do quê', VB(434), b,
    'Só a faixa do meio tem dependência dura: cada fase do SSR entra no ar antes da próxima. A renda fixa usa o BFF da fase 1 e a tela dela migra junto nas fases 2 e 3. O simulador não depende de nada.',
    [['Campos por tipo', 'Moeda, percentual, número, data, mês/ano e papel com um helper só.'],
     ['Modo de edição do Início', 'Grade quadriculada, redimensionar, arrastar, tirar card e grupos por tipo.'],
     ['Troca de nome', 'news → lookout. Repositório pronto; faltam os passos no painel.'],
     ['Simulador de reinvestimento', 'Cenários com memória de cálculo na carteira. Usa a API de hoje.'],
     ['Curadoria Tech', 'Ajustes pelo relatório de 04/11 e decisão dois dias depois.'],
     ['SSR, fase 0', 'Inventário de telas, widgets e chamadas, medição da primeira tela e escolha do framework.'],
     ['SSR, fase 1', 'Camada backend (BFF) no Worker. A página de hoje passa a usar as rotas novas sem mudar o visual.'],
     ['Administração 2.0', 'Primeira página feita na stack nova.'],
     ['SSR, fases 2 e 3', 'Shell renderizado no servidor e widget por widget; a sessão responsiva acontece aqui.'],
     ['Cutover', 'public/index.html sai, /api/* fica restrito, medir e comparar com a fase 0.'],
     ['Job mensal de extratos', 'Exportação dos extratos pelo Chrome, uma vez por mês.'],
     ['Renda fixa e Tesouro', 'Importação e cálculo contra o BFF, tela simples.'],
     ['Esportes', 'NBA, NFL e F1, mais a conferência das sondas em produção.']],
    'Diagrama da fila em três faixas. No HTML de hoje: passos 0 a 4, sem dependência entre si. Stack nova: SSR fase 0, fase 1, Administração 2.0, fases 2 e 3 e cutover, em sequência. Fora do caminho do SSR: job de extratos, renda fixa e esportes. A renda fixa depende da fase 1 e migra junto nas fases 2 e 3.', 880);
};

D.troca = () => {
  const y1 = 40, y2 = 180, y3 = 300;
  const b = [
    box(X[0], y1, 1, 'Push em main', 'name: "lookout"', { k: 'k-ok', mono: true }),
    box(X[1], y1, 2, 'Projeto lookout', 'no Workers Builds'),
    box(X[2], y1, 3, 'Colar 7 secrets', 'o AUD fica para o 4'),
    box(X[3], y1, 4, 'Access + AUD', 'ACCESS_AUD', { mono: true }),
    box(X[4], y1, 5, 'Conferir no ar', 'login, Início, cron', { k: 'k-in' }),
    box(X[0], y2, 6, 'Apagar o news', 'só depois do 5', { k: 'k-bad' }),
    box(X[1], y2, 7, 'Domínio próprio', 'lookout.<domínio>', { k: 'k-ev', mono: true }),
    box(X[2], y2, 8, 'Renomear o repo', 'GitHub → lookout'),
    box(X[1], y3, 9, 'Link para o Gabriel', 'só com o domínio', { k: 'k-ok' }),
    ar('M166,72 H222'), ar('M376,72 H432'), ar('M586,72 H642'), ar('M796,72 H852'),
    ar('M931,104 V142 H91 V176'), lbl(510, 142, 'tudo certo no endereço novo'),
    ar('M166,212 H222'), ar('M376,212 H432'),
    ar('M301,244 V296', 'ev'), lbl(301, 272, 'quando houver nome'),
  ].join('');
  return fig('Troca-De-Nome', 'Os 8 passos da troca news → lookout', VB(384), b,
    'Renomear não existe no painel da Cloudflare: o lookout é um Worker novo com o mesmo código. O passo 1 já foi feito em 04/11; do 2 ao 8 é trabalho no painel e no GitHub.',
    [['Push em main', 'Com "name": "lookout" no wrangler.jsonc. O build do news passa a falhar por nome diferente, e o news segue servindo a última versão até ser apagado.'],
     ['Projeto lookout', 'Workers & Pages → Create → Import a repository, nome do projeto lookout, deploy com npx wrangler deploy. O primeiro deploy sobe sem secrets e a página diz "Falta ligar o login". É o esperado.'],
     ['Colar 7 secrets', 'ADMIN_EMAIL, ACCESS_TEAM_DOMAIN, BRAPI_TOKEN, FINNHUB_TOKEN, CARTEIRA_KEY, CF_API_TOKEN e CF_ACCOUNT_ID. A CARTEIRA_KEY tem de ser a mesma do news.'],
     ['Access + AUD', 'Enable Cloudflare Access no workers.dev, repetir a configuração da aplicação (Everyone, só Google, página de login) e colar o Application Audience como ACCESS_AUD, o oitavo secret. Depois, Deploy.'],
     ['Conferir no ar', 'Login, Início, admin e card de custos. No D1, a consulta da meta tem de mostrar gravação recente do cron.'],
     ['Apagar o news', 'Enquanto os dois existem, os dois crons gravam no mesmo D1. Apagar leva junto o espelho antigo e a aplicação news do Access.'],
     ['Domínio próprio', 'Add custom domain com lookout.&lt;domínio&gt;. O Access ganha mais um hostname na mesma aplicação e o ACCESS_AUD não muda.'],
     ['Renomear o repositório', 'Conferir o repositório ligado no Workers Builds, trocar o remote nas máquinas e o nome antigo nos docs e no README.'],
     ['Link para o Gabriel', 'Sai só quando o endereço definitivo existir.']],
    'Oito passos da troca de nome: push em main, projeto lookout no Workers Builds, sete secrets, Access e AUD, conferir no ar, apagar o news, domínio próprio e renomear o repositório. O link para o Gabriel só sai depois do domínio.', 880);
};

D.base = () => {
  const y1 = 40, y2 = 200;
  const b = [
    box(X[0], y1, 1, 'Página pede', '/api/q, /api/doc', { k: 'k-in', mono: true }),
    box(X[1], y1, 2, 'Worker na borda', 'perto de quem lê'),
    box(X[2], y1, 3, 'Cache de borda', '3 min', { k: 'k-ev' }),
    box(X[3], y1, 4, 'Espelho em SP', 'DO com SQLite'),
    box(X[4], y1, 5, 'Resposta', 'sem a viagem longa', { k: 'k-ok' }),
    box(X[0], y2, 6, 'Gravações', 'coleta, cron, admin', { k: 'k-in' }),
    box(X[2], y2, 7, 'D1', 'fonte da verdade'),
    box(X[3], y2, 8, 'Sincronia', 'a cada minuto', { k: 'k-ev' }),
    ar('M166,72 H222'), ar('M376,72 H432'), ar('M586,72 H642'), ar('M796,72 H852'),
    ar('M330,104 V218 H432'), lbl(330, 165, 'fallback', 'fl-no'),
    ar('M166,246 H432'), lbl(250, 246, 'grava sempre'),
    ar('M586,232 H642'),
    ar('M770,200 V108', 'ev'), lbl(770, 152, 'copia o que mudou'),
    ar('M520,200 V180 H676 V108', 'ev'), lbl(598, 180, 'write-through'),
  ].join('');
  return fig('Leitura-E-Gravacao', 'Leitura pelo espelho, gravação no D1', VB(284), b,
    'Em cima, a leitura; embaixo, a gravação. O espelho só recebe o que o D1 já gravou, pela sincronia do cron ou pelo write-through de favoritos, listas e painel.',
    [['Página pede', 'Listas de collection pelo /api/q e documentos pelo /api/doc.'],
     ['Worker na borda', 'Sem Smart Placement desde 02/11. Atende perto de quem acessa.'],
     ['Cache de borda', 'Leituras ficam 3 min na borda, além do cache de 30 a 60 s na memória do isolate.'],
     ['Espelho em São Paulo', 'Uma instância só, criada com locationHint "sam". Responde com o mesmo SQL do D1, então a paginação não pula nem repete item.'],
     ['Resposta', 'Uma mudança no D1 leva até 1 min para chegar ao espelho e depois os mesmos 3 min e meio de cache.'],
     ['Gravações', 'Coletas, crons de mercado, admin, curadorias e as gravações por pessoa vão ao D1.'],
     ['D1', 'Continua a fonte da verdade. Também serve a leitura quando o espelho dá erro, passa de 2 s ou está vazio.'],
     ['Sincronia', 'No fim de cada cron, compara a chave e uma marca de cada doc e copia só o que mudou, em lotes de 90.']],
    'Leitura: a página pede, o Worker na borda passa pelo cache de 3 minutos e lê do espelho em São Paulo. Se o espelho falhar, lê do D1. Gravação: tudo vai ao D1; a sincronia de cada minuto e o write-through levam ao espelho o que mudou.', 880);
};

D.noticias = () => {
  const y1 = 50, y2 = 200;
  const b = [
    box(X[0], y1, 1, 'Feeds RSS e Atom', '6 por minuto', { k: 'k-in' }),
    box(X[1], y1, 2, 'Cron do Worker', 'já existe? ignora'),
    box(X[2], y1, 3, 'candidatos', 'status: novo', { mono: true }),
    dia(721, 82, 4, 'Curadoria', 'Sonnet, 3x por dia'),
    box(X[4], y1, 5, 'Publicado', 'items-*, destaques-*', { k: 'k-ok', mono: true }),
    box(X[0], y2, 6, 'Subreddits', 'mais votados do dia', { k: 'k-in' }),
    box(X[1], y2, 7, 'Nos fóruns', 'foruns-<radar>', { k: 'k-ok', mono: true }),
    box(X[2], y2, 8, 'Limpeza', 'minuto 7, cada hora', { k: 'k-ev' }),
    box(X[4], y2, 9, 'Descartado', 'com motivo', { k: 'k-bad' }),
    ar('M166,82 H222'), ar('M376,82 H432'), ar('M586,82 H637'),
    ar('M801,82 H852'), lbl(826, 76, 'sim', 'fl-yes'),
    ar('M721,137 V232 H852'), lbl(721, 188, 'não', 'fl-no'),
    ar('M166,232 H222'), ar('M376,232 H432'), lbl(404, 222, '3 dias'),
  ].join('');
  return fig('Coleta-E-Curadoria', 'Do feed ao que aparece no site', VB(284), b,
    'A coleta não gasta token: quem lê os feeds é o cron do Worker. Token só entra na curadoria. Os posts do Reddit vão por fora, sem curadoria.',
    [['Feeds RSS e Atom', 'A lista fica em src/feeds.js. Cada feed é lido no máximo a cada 90 min; feed com erro espera mais, dobrando até 16 vezes.'],
     ['Cron do Worker', 'Roda a cada minuto. O que já existe, pelo mesmo id ou pela mesma URL, é ignorado.'],
     ['candidatos', 'O resto entra na tabela com status novo.'],
     ['Curadoria', 'Tarefas agendadas reservam um lote, escolhem, escrevem título e resumo e podem fazer algumas buscas na web.'],
     ['Publicado', 'Vai para items-* e destaques-*. Só o que está nessas collections aparece no site.'],
     ['Subreddits', 'Fila própria: um por minuto, cada um relido a cada 120 min, lendo os mais votados do dia.'],
     ['Nos fóruns', 'Bloco na lateral de cada seção e widget Fóruns no Início.'],
     ['Limpeza', 'No minuto 7 de cada hora o Worker apaga o que venceu, inclusive os posts de fórum com mais de 3 dias.'],
     ['Descartado', 'Fica marcado com o motivo: repetido, promocional, fora do tema, antigo ou raso.']],
    'Feeds RSS são lidos pelo cron e viram candidatos. A curadoria decide: publicado vai para as collections de itens, o resto é descartado com motivo. Subreddits vão direto para Nos fóruns e saem na limpeza depois de 3 dias.', 880);
};

D.simulador = () => {
  const y1 = 40, y2 = 190;
  const b = [
    box(X[0], y1, 1, 'Criar cenário', 'mês/ano alvo', { k: 'k-in' }),
    box(X[1], y1, 2, 'Guardado cifrado', 'carteira/<email>', { mono: true }),
    box(X[2], y1, 3, 'Cron mensal', 'grava o real do mês', { k: 'k-ev' }),
    box(X[3], y1, 4, 'Botão Analisar', 'a pessoa pede', { k: 'k-in' }),
    box(X[4], y1, 5, 'Decomposição', 'cinco causas'),
    box(X[2], y2, 6, 'Alerta automático', 'não existe', { k: 'k-bad' }),
    box(X[3], y2, 7, 'Parecer por IA', 'desligado', { k: 'k-bad k-opt' }),
    box(X[4], y2, 8, 'Parecer em texto', 'templates fixos', { k: 'k-ok' }),
    ar('M166,72 H222'), ar('M376,72 H432'), ar('M586,72 H642'), ar('M796,72 H852'),
    ar('M931,104 V186'),
    ar('M721,104 V186', 'ev'), lbl(721, 150, 'nesta versão, não', 'fl-no'),
    ar('M511,104 V186', 'ev'), lbl(511, 150, 'nunca', 'fl-no'),
  ].join('');
  return fig('Simulador-Ciclo', 'Do cenário ao parecer', VB(274), b,
    'O cron só guarda números. Ninguém recebe análise sem pedir: o desvio é explicado quando a pessoa clica em Analisar.',
    [['Criar cenário', 'Mês e ano alvo, com só proventos (sem aporte) ou com aporte mensal.'],
     ['Guardado cifrado', 'O cenário e a memória de cálculo vão para carteira/&lt;email&gt;, com a mesma cifra da Minha carteira.'],
     ['Cron mensal', 'Grava, para cada mês, o previsto e o real: proventos, cotas, aportes, rendimento por cota, cotação e eventos.'],
     ['Botão Analisar', 'Na aba Simulações da Minha carteira. Também há Ver e Excluir.'],
     ['Decomposição', 'O desvio é dividido em rendimento por cota, cotação no reinvestimento, aportes, composição e resíduo.'],
     ['Alerta automático', 'Fica de fora de propósito. Nada de aviso nem de notificação sobre desvio.'],
     ['Parecer por IA', 'Desligado nesta versão.'],
     ['Parecer em texto', 'Frases montadas por templates a partir da decomposição, no mesmo espírito da Leitura do dia.']],
    'Ciclo do simulador: criar cenário, guardar cifrado na carteira, cron mensal grava o real, a pessoa clica em Analisar, o desvio é decomposto em cinco causas e sai um parecer em texto fixo. Alerta automático não existe e o parecer por IA está desligado nesta versão.', 880);
};

D.funil = () => {
  const y1 = 50, y2 = 200;
  const b = [
    box(X[0], y1, 1, 'Convite', 'grupo e canal', { k: 'k-in' }),
    box(X[1], y1, 2, 'Enviado', 'WhatsApp, e-mail, link'),
    box(X[2], y1, 3, 'Abriu', 'código do canal', { mono: false }),
    dia(721, 82, 4, 'Entrou?', 'login no Access'),
    box(X[4], y1, 5, 'Ativo', 'usa o Lookout', { k: 'k-ok' }),
    box(X[3], y2, 6, 'Não entrou', 'aparece na lista', { k: 'k-bad' }),
    box(X[2], y2, 7, 'Reenvio', 'mesmo canal ou outro', { k: 'k-ev' }),
    ar('M166,82 H222'), ar('M376,82 H432'), ar('M586,82 H637'),
    ar('M801,82 H852'), lbl(826, 76, 'sim', 'fl-yes'),
    ar('M721,137 V196'), lbl(721, 168, 'não', 'fl-no'),
    ar('M646,232 H590'),
    ar('M436,232 H301 V118', 'loop'), loopLbl(301, 172, '↻ reenvio'),
  ].join('');
  return fig('Funil-Convite', 'O funil de convite da Administração 2.0', VB(284), b,
    'Cada etapa vira um número no admin. Quem não entrou fica visível e pode receber o convite de novo, pelo mesmo canal ou por outro.',
    [['Convite', 'Criado por grupo e por canal.'],
     ['Enviado', 'Por WhatsApp, por e-mail ou como link copiado.'],
     ['Abriu', 'Cada canal leva um código de convite próprio, para saber por onde a pessoa veio.'],
     ['Entrou?', 'Fez o login no Access pela primeira vez.'],
     ['Ativo', 'Voltou a usar. O admin novo vai mostrar último acesso e dias ativos em 30 dias.'],
     ['Não entrou', 'Lista de quem nunca entrou.'],
     ['Reenvio', 'Para quem não entrou, de volta ao passo 2.']],
    'Funil de convite: convite por grupo e canal, enviado, abriu, entrou. Quem entrou e usa fica ativo. Quem não entrou aparece na lista e recebe reenvio, que volta para a etapa de envio.', 880);
};

D.ssr = () => {
  const yA = 52, yB = 204;
  const b = [
    lane(4, 8, 1014, 128, 'Hoje'),
    lane(4, 160, 1014, 128, 'Depois do cutover'),
    box(X[0], yA, 1, 'Navegador', 'index.html único', { k: 'k-in' }),
    box(X[1], yA, 2, 'JS no navegador', 'lógica e permissão', { k: 'k-bad' }),
    box(X[2], yA, 3, '/api/* aberto', 'a página chama direto', { mono: false }),
    box(X[3], yA, 4, 'Espelho ou D1', 'lê por collection'),
    box(X[4], yA, 5, 'JSON por seção', 'a página monta', { k: 'k-bad' }),
    box(X[0], yB, 6, 'Navegador', 'pede a tela', { k: 'k-in' }),
    box(X[1], yB, 7, 'BFF + SSR', 'identidade do Access'),
    box(X[2], yB, 8, 'Rotas por tela', 'JSON pronto'),
    box(X[3], yB, 9, 'Espelho ou D1', 'mesma fonte'),
    box(X[4], yB, 10, 'HTML filtrado', 'só o que pode ver', { k: 'k-ok' }),
    ar('M166,84 H222'), ar('M376,84 H432'), ar('M586,84 H642'), ar('M796,84 H852'),
    ar('M166,236 H222'), ar('M376,236 H432'), ar('M586,236 H642'), ar('M796,236 H852'),
  ].join('');
  return fig('Hoje-E-Depois', 'Onde as regras moram, hoje e depois', VB(296), b,
    'O banco e o espelho continuam os mesmos. Muda quem fala com eles: hoje é a página, depois é só o backend no Worker.',
    [['Navegador', 'Recebe o public/index.html, um arquivo só com toda a lógica.'],
     ['JS no navegador', 'Faz as chamadas e monta as telas. Parte das regras de tela depende desse código.'],
     ['/api/* aberto', 'A página chama a API direto. A API confere a seção, mas a superfície é grande.'],
     ['Espelho ou D1', 'Leitura como hoje: espelho em São Paulo com o D1 de reserva.'],
     ['JSON por seção', 'A página recebe os dados e decide o que mostrar.'],
     ['Navegador', 'Pede uma tela e recebe a primeira já pronta.'],
     ['BFF + SSR', 'O Worker resolve toda leitura por usuário com a identidade do Access, conferida a cada pedido.'],
     ['Rotas por tela', 'Cada tela tem uma rota que monta o JSON pronto. /api/* público some ou vira só o que precisa ser público.'],
     ['Espelho ou D1', 'A mesma fonte, agora só o backend fala com ela.'],
     ['HTML filtrado', 'Sem chave ou token no HTML e no JS, sem lógica de permissão no cliente, CSP sem inline e sem eval.']],
    'Hoje: o navegador recebe um index.html único, o JS chama a API aberta, que lê do espelho ou D1, e a página monta o JSON. Depois: o navegador pede a tela ao BFF com SSR no Worker, que usa a identidade do Access, monta rotas por tela, lê do espelho ou D1 e devolve HTML já filtrado.', 880);
};

D.teste = () => {
  const y1 = 50, y2 = 190;
  const b = [
    box(X[0], y1, 1, 'Roteiro', 'cenarios.mjs', { k: 'k-in', mono: true }),
    box(X[1], y1, 2, 'Gerador', 'npm run b3-fake', { mono: true }),
    box(X[2], y1, 3, 'Planilhas .xlsx', 'README e manifesto', { k: 'k-ok' }),
    box(X[3], y1, 4, 'Importar', 'na conta de teste'),
    box(X[4], y1, 5, 'Conferir', 'contra o README', { k: 'k-ok' }),
    box(X[0], y2, 6, 'Mudou o cálculo', 'sobe a versão', { k: 'k-ev' }),
    box(X[1], y2, 7, 'Correção', '--diff manifesto', { mono: true }),
    box(X[2], y2, 8, 'Importa por cima', 'só linhas novas'),
    ar('M166,82 H222'), ar('M376,82 H432'), ar('M586,82 H642'), ar('M796,82 H852'),
    ar('M166,222 H222'), ar('M376,222 H432'),
    ar('M586,222 H721 V118'), lbl(660, 222, 'prévia'),
  ].join('');
  return fig('Dados-De-Teste', 'Gerar, importar, conferir e corrigir', VB(274), b,
    'Mesma versão, mesma semente e mesma data final geram os mesmos arquivos, byte a byte. A correção só acrescenta linhas.',
    [['Roteiro', 'Um cenário por situação que a carteira precisa tratar, e o ESPERADO com o que a tela tem de mostrar.'],
     ['Gerador', 'gerar.mjs roda o roteiro; o preço é um passeio aleatório mensal com semente fixa.'],
     ['Planilhas', 'Negociação, Movimentação e Proventos recebidos no formato da Área do Investidor, mais README e manifesto.json.'],
     ['Importar', 'Pelo menu da conta, soltando todos os .xlsx de uma vez, só na conta de teste.'],
     ['Conferir', 'Prévia e resultado contra o README: linhas novas, ignoradas, posições abertas e encerradas.'],
     ['Mudou o cálculo', 'Sobe a versão do roteiro, anota no CHANGELOG e ajusta o ESPERADO.'],
     ['Correção', 'Gera só a diferença contra o manifesto da última importação.'],
     ['Importa por cima', 'A prévia mostra só o que é novo; a deduplicação segura o resto.']],
    'Roteiro, gerador e planilhas falsas da B3, importadas na conta de teste e conferidas contra o README. Quando o cálculo muda, sobe a versão e sai uma correção por diff, importada por cima.', 880);
};

module.exports = D;
