// Feeds RSS e Atom que o cron do Worker lê. Cada linha: [radar, fonte, país, url] ou, para subreddit, [radar, fonte, país, url, "reddit"].
// A fonte é o nome que vai para o item (o mesmo padrão de NOMES DE FONTE das tarefas).
// Feed que falha muitas vezes seguidas aparece em feeds_estado com erros_seguidos alto: corrija a URL ou tire daqui.
// Fora em 31/10/2026: ACM Queue, BleepingComputer, CNX Software, FinTech Futures e Matinal bloqueiam o Worker (HTTP 403);
// Uber Engineering e CNN Brasil Política sumiram (HTTP 404); Record não publica itens reconhecíveis. A busca da curadoria cobre essas fontes.
// Fora também: Lance!, Correio do Povo, Di Marzio e KrASIA (404); InfoMoney Negócios e LABS (sem itens reconhecíveis).
// Investimentos fora: Clube FII (404), E-Investidor e Portal do Bitcoin (403).
// Cripto (17/11/2026): Livecoins, CoinDesk e Cointelegraph já estavam aqui. Nenhum feed novo de cripto entrou, porque o
// proxy do ambiente de desenvolvimento recusa todos os sites candidatos (o leitor da coleta não chegou a ler nenhum).
// A lista para a sonda de produção (admin › Sondar feeds) é CRIPTO_PARA_SONDAR, logo abaixo de FEEDS.
// Fora em 01/11/2026: feeds de FII de InfoMoney, Money Times e Suno (404) e de Seu Dinheiro (sem itens reconhecíveis).
// Transfermarkt não tem RSS e bloqueia robôs: o mercado vem das buscas da curadoria de Esportes.
// Oficina: os feeds entram aqui depois de sondados em produção (admin › Sondar feeds), no formato
// ["oficina", fonte, país, url]. Nenhum endereço foi inventado: a lista nasce vazia e OFICINA_PARA_SONDAR traz só os
// nomes das fontes candidatas, para quem revisa achar o feed de cada uma e colar na sonda.
export const FEEDS_OFICINA = [];
export const OFICINA_PARA_SONDAR = [
  // marcenaria e carpintaria (o melhor do mundo, sem preferência de país; título e resumo em português pela curadoria)
  "Paul Sellers", "Woodworking for Mere Mortals", "Stumpy Nubs", "Fine Woodworking", "Popular Woodworking", "The Wood Whisperer",
  "Matthias Wandel", "Pask Makes", "Ishitani Furniture", "This Old House", "Essential Craftsman",
  // serralheria, solda e usinagem
  "Fireball Tool", "Weld.com", "This Old Tony",
  // Brasil: canais e sites de marcenaria e serralheria a levantar (quem revisa completa esta linha com os nomes)
];

// Saúde (pedido de 20/11): o mesmo jeito da Oficina. FEEDS_SAUDE nasce vazia e só recebe feed sondado em produção, como
// ["saude", fonte, país, url] ou, para subreddit, ["saude", fonte, país, url, "reddit"]. O sexto campo, opcional, é o id
// do produto (saude-produtos) quando o feed inteiro é do próprio assunto: só aí apelido com menos de 4 letras vale na
// coleta (src/saude.js, citaProduto). Na Saúde o post de subreddit vira candidato (a curadoria escolhe e classifica como
// relato), e não vai para "Nos fóruns". Nenhum endereço de feed nem nome de subreddit foi inventado:
// SAUDE_PARA_SONDAR traz só os nomes das fontes candidatas, para quem revisa achar o feed de cada uma.
export const FEEDS_SAUDE = [];
export const SAUDE_PARA_SONDAR = [
  // agências e registros
  "Anvisa (notícias e alertas)", "FDA (comunicados e alertas de falsificação)", "EMA", "ClinicalTrials.gov",
  // fabricante
  "Eli Lilly (comunicados)",
  // periódicos
  "NEJM", "The Lancet",
  // imprensa de saúde e indústria
  "STAT News", "Fierce Pharma", "Endpoints News", "Reuters Health",
  // comunidade
  "subreddits sobre retatrutida e peptídeos, a levantar",
];

export const FEEDS = [
  // Tech: engenharia e arquitetura
  ["tech", "InfoQ", "CA", "https://feed.infoq.com/"],
  ["tech", "The New Stack", "US", "https://thenewstack.io/feed/"],
  ["tech", "Martin Fowler", "US", "https://martinfowler.com/feed.atom"],
  ["tech", "Simon Willison", "US", "https://simonwillison.net/atom/everything/"],
  ["tech", "ByteByteGo", "US", "https://blog.bytebytego.com/feed"],
  ["tech", "The Pragmatic Engineer", "NL", "https://newsletter.pragmaticengineer.com/feed"],
  ["tech", "Marc Brooker", "US", "https://brooker.co.za/blog/rss.xml"],
  ["tech", "Murat Demirbas", "US", "https://muratbuffalo.blogspot.com/feeds/posts/default"],
  ["tech", "Julia Evans", "CA", "https://jvns.ca/atom.xml"],
  ["tech", "Charity Majors", "US", "https://charity.wtf/feed/"],
  ["tech", "Architecture Weekly", "PL", "https://www.architecture-weekly.com/feed"],
  ["tech", "Microservices.io", "US", "https://microservices.io/feed.xml"],
  ["tech", "The Architect Elevator", "", "https://architectelevator.com/feed.xml"],
  ["tech", "Stack Overflow", "US", "https://stackoverflow.blog/feed/"],
  // Tech: blogs de engenharia
  ["tech", "Netflix", "US", "https://netflixtechblog.com/feed"],
  ["tech", "Spotify", "SE", "https://engineering.atspotify.com/feed/"],
  ["tech", "Airbnb", "US", "https://medium.com/feed/airbnb-engineering"],
  ["tech", "Stripe", "US", "https://stripe.com/blog/feed.rss"],
  ["tech", "Meta", "US", "https://engineering.fb.com/feed/"],
  ["tech", "Google Research", "US", "https://research.google/blog/rss/"],
  ["tech", "AWS Architecture Blog", "US", "https://aws.amazon.com/blogs/architecture/feed/"],
  ["tech", "AWS News Blog", "US", "https://aws.amazon.com/blogs/aws/feed/"],
  ["tech", "All Things Distributed", "US", "https://www.allthingsdistributed.com/atom.xml"],
  ["tech", "Cloudflare", "US", "https://blog.cloudflare.com/rss/"],
  ["tech", "Slack", "US", "https://slack.engineering/feed/"],
  ["tech", "Dropbox", "US", "https://dropbox.tech/feed"],
  ["tech", "Pinterest", "US", "https://medium.com/feed/pinterest-engineering"],
  ["tech", "Lyft", "US", "https://eng.lyft.com/feed"],
  ["tech", "Etsy", "US", "https://www.etsy.com/codeascraft/rss"],
  ["tech", "GitHub", "US", "https://github.blog/engineering/feed/"],
  ["tech", "GitHub Changelog", "US", "https://github.blog/changelog/feed/"],
  ["tech", "Grafana Labs", "US", "https://grafana.com/blog/index.xml"],
  ["tech", "Zalando", "DE", "https://engineering.zalando.com/atom.xml"],
  ["tech", "Grab", "SG", "https://engineering.grab.com/feed.xml"],
  ["tech", "Mercado Livre", "AR", "https://medium.com/feed/mercadolibre-tech"],
  ["tech", "iFood", "BR", "https://medium.com/feed/ifood-tech"],
  ["tech", "Nubank", "BR", "https://building.nubank.com/feed/"],
  ["tech", "Amazon Science", "US", "https://www.amazon.science/index.rss"],
  ["tech", "Microsoft Research", "US", "https://www.microsoft.com/en-us/research/feed/"],
  // Tech: IA
  ["tech", "OpenAI", "US", "https://openai.com/news/rss.xml"],
  ["tech", "Hugging Face", "US", "https://huggingface.co/blog/feed.xml"],
  ["tech", "Latent Space", "US", "https://www.latent.space/feed"],
  ["tech", "Interconnects", "US", "https://www.interconnects.ai/feed"],
  ["tech", "MIT Technology Review", "US", "https://www.technologyreview.com/feed/"],
  ["tech", "TechCrunch", "US", "https://techcrunch.com/category/artificial-intelligence/feed/"],
  ["tech", "Ars Technica", "US", "https://feeds.arstechnica.com/arstechnica/index"],
  // Tech: segurança
  ["tech", "The Hacker News", "IN", "https://feeds.feedburner.com/TheHackersNews"],
  ["tech", "Krebs on Security", "US", "https://krebsonsecurity.com/feed/"],
  ["tech", "Schneier on Security", "US", "https://www.schneier.com/feed/atom/"],
  ["tech", "The Record", "US", "https://therecord.media/feed"],
  ["tech", "SecurityWeek", "US", "https://www.securityweek.com/feed/"],
  ["tech", "Trail of Bits", "US", "https://blog.trailofbits.com/feed/"],
  ["tech", "Project Zero", "US", "https://googleprojectzero.blogspot.com/feeds/posts/default"],
  ["tech", "The Register", "GB", "https://www.theregister.com/headlines.atom"],
  // Tech: linguagens e plataformas
  ["tech", "Kubernetes", "US", "https://kubernetes.io/feed.xml"],
  ["tech", "The Go Blog", "US", "https://go.dev/blog/feed.atom"],
  ["tech", "PostgreSQL", "", "https://www.postgresql.org/news.rss"],
  ["tech", "Rust", "", "https://blog.rust-lang.org/feed.xml"],
  ["tech", "React", "US", "https://react.dev/rss.xml"],
  ["tech", "Android Developers", "US", "https://android-developers.googleblog.com/feeds/posts/default"],
  ["tech", "Kotlin", "", "https://blog.jetbrains.com/kotlin/feed/"],
  // Tech: fintech e pagamentos
  ["tech", "Payments Dive", "US", "https://www.paymentsdive.com/feeds/news/"],
  ["tech", "Finextra", "GB", "https://www.finextra.com/rss/headlines.aspx"],
  ["tech", "Fintech News Singapore", "SG", "https://fintechnews.sg/feed/"],
  ["tech", "Fintech Business Weekly", "US", "https://fintechbusinessweekly.substack.com/feed"],
  ["tech", "PYMNTS", "US", "https://www.pymnts.com/feed/"],
  ["tech", "TechCrunch", "US", "https://techcrunch.com/category/fintech/feed/"],
  ["tech", "Finsiders Brasil", "BR", "https://finsidersbrasil.com.br/feed/"],
  ["tech", "Let's Money", "BR", "https://letsmoney.com.br/feed/"],
  ["tech", "Mobile Time", "BR", "https://www.mobiletime.com.br/feed/"],
  ["tech", "Tecnoblog", "BR", "https://tecnoblog.net/feed/"],
  // Tech: podcasts
  ["tech", "Software Engineering Daily", "US", "https://softwareengineeringdaily.com/feed/podcast/"],
  ["tech", "The Changelog", "US", "https://changelog.com/feed"],
  // Tech: setup e gadgets
  ["tech", "Hackaday", "US", "https://hackaday.com/blog/feed/"],
  ["tech", "Tom's Hardware", "US", "https://www.tomshardware.com/feeds/all"],

  // Negócios: vieram de Tech
  ["negocios", "Crunchbase News", "US", "https://news.crunchbase.com/feed/"],
  ["negocios", "Rest of World", "US", "https://restofworld.org/feed/latest/"],
  ["negocios", "Inc42", "IN", "https://inc42.com/feed/"],
  ["negocios", "Startups", "BR", "https://startups.com.br/feed/"],
  ["negocios", "NeoFeed", "BR", "https://neofeed.com.br/feed/"],
  ["negocios", "Brazil Journal", "BR", "https://braziljournal.com/feed/"],
  // Negócios: Brasil
  ["negocios", "Exame", "BR", "https://exame.com/feed/"],
  ["negocios", "Startupi", "BR", "https://startupi.com.br/feed/"],
  ["negocios", "g1", "BR", "https://g1.globo.com/rss/g1/economia/"],
  ["negocios", "Folha", "BR", "https://feeds.folha.uol.com.br/mercado/rss091.xml"],
  // Negócios: mundo
  ["negocios", "TechCrunch", "US", "https://techcrunch.com/category/startups/feed/"],
  ["negocios", "TechCrunch", "US", "https://techcrunch.com/category/venture/feed/"],
  ["negocios", "CNBC", "US", "https://www.cnbc.com/id/19854910/device/rss/rss.html"],
  ["negocios", "Fortune", "US", "https://fortune.com/feed/"],
  ["negocios", "Business Insider", "US", "https://feeds.businessinsider.com/custom/all"],
  ["negocios", "Axios", "US", "https://api.axios.com/feed/"],
  ["negocios", "Stratechery", "US", "https://stratechery.com/feed/"],
  ["negocios", "Sifted", "GB", "https://sifted.eu/feed"],
  ["negocios", "TechNode", "CN", "https://technode.com/feed/"],
  ["negocios", "Wamda", "AE", "https://www.wamda.com/feed"],
  ["negocios", "ECO", "PT", "https://eco.sapo.pt/feed/"],
  ["negocios", "Il Sole 24 Ore", "IT", "https://www.ilsole24ore.com/rss/tecnologia.xml"],

  // Investimentos
  ["investimentos", "Money Times", "BR", "https://www.moneytimes.com.br/feed/"],
  ["investimentos", "Seu Dinheiro", "BR", "https://www.seudinheiro.com/feed/"],
  ["investimentos", "Suno", "BR", "https://www.suno.com.br/noticias/feed/"],
  ["investimentos", "InfoMoney", "BR", "https://www.infomoney.com.br/feed/"],
  ["investimentos", "FIIs", "BR", "https://fiis.com.br/feed/"],
  ["investimentos", "Livecoins", "BR", "https://livecoins.com.br/feed/"],
  ["investimentos", "CoinDesk", "US", "https://www.coindesk.com/arc/outboundfeeds/rss/"],
  // Cripto: confirmados pela sonda de produção em 17/11/2026 (respondem e têm item recente)
  ["investimentos", "Money Times", "BR", "https://www.moneytimes.com.br/criptomoedas/feed/"],
  ["investimentos", "BeInCrypto Brasil", "BR", "https://br.beincrypto.com/feed/"],
  ["investimentos", "The Block", "US", "https://www.theblock.co/rss.xml"],
  ["investimentos", "Decrypt", "US", "https://decrypt.co/feed"],
  ["investimentos", "Bitcoin Magazine", "US", "https://bitcoinmagazine.com/feed"],
  ["investimentos", "The Defiant", "US", "https://thedefiant.io/feed"],
  ["investimentos", "Bitcoin.com News", "", "https://news.bitcoin.com/feed/"],
  ["investimentos", "Coin Center", "US", "https://www.coincenter.org/feed/"],
  ["investimentos", "Cointelegraph", "US", "https://cointelegraph.com/rss"],
  ["investimentos", "CNBC", "US", "https://www.cnbc.com/id/15839069/device/rss/rss.html"],
  // Sondados em 01/11/2026 pelo próprio Worker (admin › Sondar feeds): respondem RSS com itens recentes.
  ["investimentos", "Valor", "BR", "https://valor.globo.com/rss/valor/"],
  ["investimentos", "Exame Invest", "BR", "https://exame.com/invest/feed/"],
  ["investimentos", "CVM", "BR", "https://www.gov.br/cvm/pt-br/assuntos/noticias/RSS"],
  ["investimentos", "Funds Explorer", "BR", "https://www.fundsexplorer.com.br/feed/"],
  ["investimentos", "Agência Brasil", "BR", "https://agenciabrasil.ebc.com.br/rss/economia/feed.xml"],
  // Mercado americano, sondados em 02/11/2026 (todos com itens do dia). Ficaram de fora: Yahoo Finance (404),
  // CNBC Markets (último item de 21/10; a CNBC já entra acima) e WSJ Markets (parado em 2025).
  ["investimentos", "MarketWatch", "US", "https://feeds.content.dowjones.io/public/rss/mw_topstories"],
  ["investimentos", "Investing.com", "US", "https://www.investing.com/rss/news_25.rss"],
  ["investimentos", "Seeking Alpha", "US", "https://seekingalpha.com/market_currents.xml"],
  ["investimentos", "Financial Times", "GB", "https://www.ft.com/markets?format=rss"],

  // Política: fontes oficiais
  ["politica", "Agência Brasil", "BR", "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml"],
  ["politica", "Agência Senado", "BR", "https://www12.senado.leg.br/noticias/feed/todasnoticias/RSS"],
  ["politica", "Agência Câmara", "BR", "https://www.camara.leg.br/noticias/rss/ultimas-noticias"],
  ["politica", "STF", "BR", "https://noticias.stf.jus.br/feed/"],
  ["politica", "Planalto", "BR", "https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/noticias/RSS"],
  // Política: imprensa
  ["politica", "Poder360", "BR", "https://www.poder360.com.br/feed/"],
  ["politica", "g1", "BR", "https://g1.globo.com/rss/g1/politica/"],
  ["politica", "g1", "BR", "https://g1.globo.com/rss/g1/rs/rio-grande-do-sul/"],
  ["politica", "Folha", "BR", "https://feeds.folha.uol.com.br/poder/rss091.xml"],
  ["politica", "BBC News Brasil", "GB", "https://feeds.bbci.co.uk/portuguese/rss.xml"],
  ["politica", "JOTA", "BR", "https://www.jota.info/feed"],
  ["politica", "Congresso em Foco", "BR", "https://www.congressoemfoco.com.br/feed/"],
  ["politica", "Agência Pública", "BR", "https://apublica.org/feed/"],
  ["politica", "Sul21", "BR", "https://sul21.com.br/feed/"],

  // Notícias: Brasil
  ["politica", "g1", "BR", "https://g1.globo.com/rss/g1/brasil/"],
  ["politica", "Folha", "BR", "https://feeds.folha.uol.com.br/cotidiano/rss091.xml"],
  // Notícias: mundo
  ["politica", "g1", "BR", "https://g1.globo.com/rss/g1/mundo/"],
  ["politica", "Folha", "BR", "https://feeds.folha.uol.com.br/mundo/rss091.xml"],
  ["politica", "DW Brasil", "DE", "https://rss.dw.com/rdf/rss-br-all"],
  ["politica", "RFI Brasil", "FR", "https://www.rfi.fr/br/rss"],
  ["politica", "Euronews", "FR", "https://pt.euronews.com/rss"],
  ["politica", "The Guardian", "GB", "https://www.theguardian.com/world/rss"],
  ["politica", "Al Jazeera", "QA", "https://www.aljazeera.com/xml/rss/all.xml"],
  ["politica", "NPR", "US", "https://feeds.npr.org/1004/rss.xml"],
  ["politica", "Público", "PT", "https://feeds.feedburner.com/PublicoRSS"],

  // Esportes
  ["esportes", "ge", "BR", "https://ge.globo.com/rss/ge/futebol/futebol-internacional/"],
  ["esportes", "The Guardian", "GB", "https://www.theguardian.com/football/rss"],
  ["esportes", "ESPN", "US", "https://www.espn.com/espn/rss/soccer/news"],
  ["esportes", "ge", "BR", "https://ge.globo.com/rss/ge/futebol/times/internacional/"],
  ["esportes", "ge", "BR", "https://ge.globo.com/rss/ge/futebol/brasileirao-serie-a/"],
  ["esportes", "ge", "BR", "https://ge.globo.com/rss/ge/futebol/"],
  // conferidos pela sonda de esportes em 04/11/2026 (200 e com itens); o do Gauchão responde vazio fora da temporada
  ["esportes", "ge", "BR", "https://ge.globo.com/rss/ge/futebol/libertadores/"],
  ["esportes", "ge", "BR", "https://ge.globo.com/rss/ge/futebol/copa-do-brasil/"],
  ["esportes", "ge", "BR", "https://ge.globo.com/rss/ge/rs/"],
  ["esportes", "ge", "BR", "https://ge.globo.com/rss/ge/futebol/campeonato-gaucho/"],
  ["esportes", "ge", "BR", "https://ge.globo.com/rss/ge/"],
  ["esportes", "UOL Esporte", "BR", "https://rss.uol.com.br/feed/esporte.xml"],
  ["esportes", "Trivela", "BR", "https://trivela.com.br/feed/"],
  ["esportes", "Gazeta Esportiva", "BR", "https://www.gazetaesportiva.com/feed/"],
  ["esportes", "BBC Sport", "GB", "https://feeds.bbci.co.uk/sport/football/rss.xml"],
  ["esportes", "Gazzetta dello Sport", "IT", "https://www.gazzetta.it/rss/home.xml"],
  // Padel (05/11/2026): só notícias, porque resultados ainda não têm fonte pública. Conferido com itens no WebFetch:
  // The Joy of Padel (podcast em inglês com jogadores do circuito, episódio novo em 04/11/2026). Os candidatos que não
  // deram para abrir daqui (FIP, The Padel Paper, Padel Alto, Padel World Press, Padel Addict, Super Padel, Padel Clube)
  // estão na sonda de esportes (SONDA_RSS em src/esportes.js).
  ["esportes", "The Joy of Padel", "", "https://feeds.megaphone.fm/thejoyofpadel"],

  // Reddit: Atom de /top/?t=day (os mais votados do dia) de cada subreddit, lido no ritmo próprio (src/coleta.js): no
  // máximo 1 por minuto de cron, cada um a cada 120 min, user-agent do Lookout. Até 04/11/2026 era /new/ (o Atom é o mesmo).
  // A sonda de 03/11/2026 deu 200 com 25 posts, mas 4 pedidos no mesmo minuto deram 429. Cada post vai só para
  // foruns-<radar> (bloco "Nos fóruns" da página): não vira candidato nem passa pela curadoria.
  ["tech", "r/opensource", "", "https://www.reddit.com/r/opensource/top/.rss?t=day", "reddit"],
  ["tech", "r/databricks", "", "https://www.reddit.com/r/databricks/top/.rss?t=day", "reddit"],
  ["tech", "r/MiniPCs", "", "https://www.reddit.com/r/MiniPCs/top/.rss?t=day", "reddit"],
  ["tech", "r/hermesagent", "", "https://www.reddit.com/r/hermesagent/top/.rss?t=day", "reddit"],
  ["tech", "r/antiai", "", "https://www.reddit.com/r/antiai/top/.rss?t=day", "reddit"],
  ["negocios", "r/fintech", "", "https://www.reddit.com/r/fintech/top/.rss?t=day", "reddit"],
  ["negocios", "r/FintechStartups", "", "https://www.reddit.com/r/FintechStartups/top/.rss?t=day", "reddit"],
  ["negocios", "r/smallbusiness", "", "https://www.reddit.com/r/smallbusiness/top/.rss?t=day", "reddit"],
  ["negocios", "r/TheFinanceCareer", "", "https://www.reddit.com/r/TheFinanceCareer/top/.rss?t=day", "reddit"],
  ["politica", "r/EspacoPolitica", "BR", "https://www.reddit.com/r/EspacoPolitica/top/.rss?t=day", "reddit"],
  // Acrescentados em 04/11/2026: 38 subreddits no total (44 desde 17/11). Com 1 leitura por minuto e cada um relido a
  // cada 120 min, cabem até 120; se o recuo por 429 ficar frequente, subir REDDIT.INTERVALO_MIN para 180 (src/coleta.js, docs/coleta.md).
  ["tech", "r/programming", "", "https://www.reddit.com/r/programming/top/.rss?t=day", "reddit"],
  ["tech", "r/netsec", "", "https://www.reddit.com/r/netsec/top/.rss?t=day", "reddit"],
  ["tech", "r/MachineLearning", "", "https://www.reddit.com/r/MachineLearning/top/.rss?t=day", "reddit"],
  ["tech", "r/LocalLLaMA", "", "https://www.reddit.com/r/LocalLLaMA/top/.rss?t=day", "reddit"],
  ["tech", "r/devops", "", "https://www.reddit.com/r/devops/top/.rss?t=day", "reddit"],
  ["tech", "r/kubernetes", "", "https://www.reddit.com/r/kubernetes/top/.rss?t=day", "reddit"],
  ["tech", "r/dataengineering", "", "https://www.reddit.com/r/dataengineering/top/.rss?t=day", "reddit"],
  ["tech", "r/softwarearchitecture", "", "https://www.reddit.com/r/softwarearchitecture/top/.rss?t=day", "reddit"],
  ["tech", "r/ExperiencedDevs", "", "https://www.reddit.com/r/ExperiencedDevs/top/.rss?t=day", "reddit"],
  ["tech", "r/brdev", "BR", "https://www.reddit.com/r/brdev/top/.rss?t=day", "reddit"],
  ["negocios", "r/startups", "", "https://www.reddit.com/r/startups/top/.rss?t=day", "reddit"],
  ["negocios", "r/Entrepreneur", "", "https://www.reddit.com/r/Entrepreneur/top/.rss?t=day", "reddit"],
  ["negocios", "r/SaaS", "", "https://www.reddit.com/r/SaaS/top/.rss?t=day", "reddit"],
  ["negocios", "r/payments", "", "https://www.reddit.com/r/payments/top/.rss?t=day", "reddit"],
  ["negocios", "r/empreendedorismo", "BR", "https://www.reddit.com/r/empreendedorismo/top/.rss?t=day", "reddit"],
  ["investimentos", "r/investimentos", "BR", "https://www.reddit.com/r/investimentos/top/.rss?t=day", "reddit"],
  ["investimentos", "r/farialimabets", "BR", "https://www.reddit.com/r/farialimabets/top/.rss?t=day", "reddit"],
  ["investimentos", "r/dividends", "", "https://www.reddit.com/r/dividends/top/.rss?t=day", "reddit"],
  ["investimentos", "r/investing", "", "https://www.reddit.com/r/investing/top/.rss?t=day", "reddit"],
  ["investimentos", "r/stocks", "", "https://www.reddit.com/r/stocks/top/.rss?t=day", "reddit"],
  ["investimentos", "r/ValueInvesting", "", "https://www.reddit.com/r/ValueInvesting/top/.rss?t=day", "reddit"],
  // Cripto (17/11/2026), lidos daqui com pegar + lerReddit (src/coleta.js), todos com posts do dia: 44 subreddits no
  // total, então a volta completa leva 44 min e cada um continua relido a cada 120 min (cabem até 120).
  // r/CriptomoedasBrasil não existe (404); r/criptomoedas responde, mas com 2 posts no dia fica de fora.
  ["investimentos", "r/BitcoinBrasil", "BR", "https://www.reddit.com/r/BitcoinBrasil/top/.rss?t=day", "reddit"],
  ["investimentos", "r/CryptoCurrency", "", "https://www.reddit.com/r/CryptoCurrency/top/.rss?t=day", "reddit"],
  ["investimentos", "r/Bitcoin", "", "https://www.reddit.com/r/Bitcoin/top/.rss?t=day", "reddit"],
  ["investimentos", "r/ethereum", "", "https://www.reddit.com/r/ethereum/top/.rss?t=day", "reddit"],
  ["investimentos", "r/defi", "", "https://www.reddit.com/r/defi/top/.rss?t=day", "reddit"],
  ["investimentos", "r/CryptoMarkets", "", "https://www.reddit.com/r/CryptoMarkets/top/.rss?t=day", "reddit"],
  ["politica", "r/worldnews", "", "https://www.reddit.com/r/worldnews/top/.rss?t=day", "reddit"],
  ["politica", "r/geopolitics", "", "https://www.reddit.com/r/geopolitics/top/.rss?t=day", "reddit"],
  ["politica", "r/brasil", "BR", "https://www.reddit.com/r/brasil/top/.rss?t=day", "reddit"],
  ["esportes", "r/futebol", "BR", "https://www.reddit.com/r/futebol/top/.rss?t=day", "reddit"],
  ["esportes", "r/soccer", "", "https://www.reddit.com/r/soccer/top/.rss?t=day", "reddit"],
  ["esportes", "r/brasileirao", "BR", "https://www.reddit.com/r/brasileirao/top/.rss?t=day", "reddit"],
  ["esportes", "r/SCInternacional", "BR", "https://www.reddit.com/r/SCInternacional/top/.rss?t=day", "reddit"],
  // Oficina (marcenaria, carpintaria e serralheria, pedido de 19/11): FEEDS_OFICINA, logo abaixo, ainda vazia.
  ...FEEDS_OFICINA,
  // Saúde (pedido de 20/11): FEEDS_SAUDE, logo acima, ainda vazia.
  ...FEEDS_SAUDE,
];

// Feeds de cripto que não deram para ler daqui (o proxy recusa o site): colar em admin › Sondar feeds e, os que
// responderem com itens recentes, passar para FEEDS como ["investimentos", fonte, país, url]. País como na lista acima.
// Portal do Bitcoin dava 403 em /feed/: vão dois caminhos alternativos do WordPress. Nenhum é casa de análise com
// recomendação de compra nem site de afiliados.
// Resultado da sonda em 17/11/2026: entraram em FEEDS Money Times, BeInCrypto Brasil, The Block, Decrypt, Bitcoin Magazine,
// The Defiant, Bitcoin.com News e Coin Center. Ficaram de fora: Cointelegraph Brasil (410), InfoMoney e Exame de cripto (404),
// Portal do Bitcoin (403 nos dois caminhos), CryptoSlate (429), e os parados: CriptoFácil (último item de set/2026),
// Blockworks (jan/2026) e DL News (out/2026).
export const CRIPTO_PARA_SONDAR = [
  ["CriptoFácil", "BR", "https://www.criptofacil.com/feed/"],
  ["Cointelegraph Brasil", "BR", "https://br.cointelegraph.com/rss"],
  ["Portal do Bitcoin", "BR", "https://portaldobitcoin.uol.com.br/feed/atom/"],
  ["Portal do Bitcoin", "BR", "https://portaldobitcoin.uol.com.br/?feed=rss2"],
  ["InfoMoney", "BR", "https://www.infomoney.com.br/mercados/criptomoedas/feed/"],
  ["Exame", "BR", "https://exame.com/future-of-money/feed/"],
  ["Blockworks", "US", "https://blockworks.co/feed"],
  ["DL News", "GB", "https://www.dlnews.com/arc/outboundfeeds/rss/"],
  ["CryptoSlate", "GB", "https://cryptoslate.com/feed/"],
];

// Seções com pelo menos um subreddit: são as que têm o bloco "Nos fóruns" e o widget foruns-<secao> no Início.
// Saúde fica de fora: lá o post de subreddit vai para a curadoria (candidatos), não para foruns-saude.
export const SEM_FORUM = ["saude"];
export const SECOES_COM_FORUM = [...new Set(FEEDS.filter((f) => f[4] === "reddit" && !SEM_FORUM.includes(f[0])).map((f) => f[0]))];
