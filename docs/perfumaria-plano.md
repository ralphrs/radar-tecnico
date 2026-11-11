# Perfumaria: plano da seção (11/11/2026)

Plano, ainda sem código. Seção nova do Lookout sobre perfumaria designer, árabe e de nicho, nacional e internacional. **Só o Admin vê** enquanto estiver em construção.

## 1. O que a seção entrega

| Parte | O que tem |
|---|---|
| **Novidades** | notícias do mercado: marcas, perfumistas, reformulações, descontinuados, chegada de marca ao Brasil |
| **Lançamentos** | calendário do que saiu e do que vem, por mês, com marca, família, concentração e onde já está à venda |
| **Resenhas** | resenhas de blogs e veículos, resumidas em texto próprio, com link para a original |
| **Marcas** | todas as marcas, de A a Z, com filtro por tipo (designer, árabe, nicho, nacional), país e faixa de preço; página da marca com as linhas e os perfumes |
| **Perfume** (a ficha) | o "estilo Fragrantica, mais moderno": ver item 3 |
| **Preços** | subseção da ficha e página própria de comparação: ver item 4 |
| **Quem falou** | vídeos e posts de criadores sobre o perfume: ver item 5 |
| **Meu acervo** | o que o Admin tem, quer e já testou, com nota e anotações (liga com a coleção que já existe) |

Navegação: `#perfumaria`, `#perfumaria/lancamentos`, `#perfumaria/marcas`, `#perfumaria/marca/<id>`, `#perfumaria/perfume/<id>`, `#perfumaria/precos`. Logotipo e Voltar funcionam em todas; nenhuma tela sem saída.

## 2. Só o Admin vê

O Lookout já tem grupos de acesso por seção. Entra a seção `perfumaria` num grupo novo `admin`, que só o `ADMIN_EMAIL` tem. Três travas, não uma:
- a seção não aparece no menu de quem não tem;
- as rotas `/api/perfumaria/*` devolvem 404 para quem não é do grupo (não 403: nem confirma que existe);
- as collections `perfumes`, `perfumaria-*` ficam fora do espelho público de leitura por seção.
Abrir para convidados depois é ligar a seção num grupo.

## 3. A ficha do perfume

Topo: nome, marca, ano, perfumista, concentração (EDT, EDP, extrait), gênero declarado, tamanho(s), tipo (designer, árabe, nicho, nacional).

Blocos, cada um com a origem do dado e a data:
- **Pirâmide**: saída, coração e fundo, com as notas em chips agrupados por família (cítrico, floral, madeira, âmbar, gourmand...).
- **Acordes**: barras horizontais com o peso de cada acorde.
- **Desempenho**: fixação e projeção em escala simples, e estações e ocasião (dia, noite, trabalho, calor, frio).
- **Parecidos e "inspirado em"**: importante nos árabes; relação marcada como "inspirado em" (dito pela marca ou pela imprensa) ou "lembra" (dito em resenha), sempre com a fonte.
- **Flankers e versões**: a linha inteira, com o que muda em cada um.
- **Preços**: menor preço por tamanho, por mL, e o histórico (item 4).
- **Quem falou**: vídeos e posts (item 5).
- **Resenhas**: resumo próprio de 2 a 3 frases de cada resenha, com link.
- **Minhas notas**: tenho, quero, testei, nota de 0 a 10, quando uso, anotação livre.

O que deixa "mais moderno": tudo numa coluna de leitura no celular, comparação lado a lado de até 3 perfumes, busca por nota ("tem oud e baunilha, sem patchouli"), e filtros que a Fragrantica não tem: preço por mL, disponível no Brasil, disponível no Paraguai.

## 4. Preços

Por perfume e tamanho: loja, país, preço na moeda original, preço em reais (câmbio do próprio Lookout), preço por mL, data da coleta, link.

Três grupos de loja, mostrados separados porque não são comparáveis sem conta:
- **Brasil**: varejo oficial e marketplaces.
- **Paraguai**: lojas de Ciudad del Este (preço em dólar; a ficha mostra o valor em reais e lembra a cota de US$ 500 por terra e o imposto acima dela).
- **Fora**: lojas internacionais que entregam no Brasil (com a conta de imposto de importação estimada, marcada como estimativa).

Histórico: um ponto por dia por loja, gráfico de 90 dias, menor preço já visto. Sem alerta automático nesta versão (regra do projeto: nada dispara sozinho sem pedido).

## 5. Quem falou (YouTube, Instagram e outros)

- **YouTube**: dá para fazer direito pela API oficial (YouTube Data API v3, gratuita, com chave do Admin). Busca por "<perfume> <marca> resenha|review", guarda canal, título, data, duração, visualizações e link. A busca custa 100 unidades de uma cota diária de 10 mil, ou seja, perto de 100 buscas por dia: roda sob demanda ao abrir a ficha (com cache de 7 dias) e em lote pequeno à noite para os perfumes do acervo.
- **Instagram e TikTok**: não têm API pública de busca por assunto. O caminho honesto é uma lista de criadores que o Admin escolhe e a curadoria, quando roda para um perfume, procurar na web o que esses criadores publicaram sobre ele. Cobertura parcial, e a ficha diz isso.
- **Lista de criadores** (`perfumaria-criadores`): nome, plataforma, idioma, foco (árabes, nicho, designer, custo-benefício), link do canal. Começa com os canais que o Admin já segue; a seção sugere novos pelos que mais aparecem nas buscas.
- Na ficha: só texto e link (canal, título, data, visualizações). **Sem foto de pessoa e sem miniatura de vídeo com rosto.**

## 6. Fontes

### Catálogo (notas, acordes, perfumista, ano)
| Fonte | Como usar | Observação |
|---|---|---|
| Site oficial da marca | fonte primária de notas, concentração e tamanhos | melhor dado; cada marca tem um formato |
| Fragrantica (.com e .com.br) | **link de saída** na ficha e leitura pontual pela curadoria, uma página por vez | não copiar em massa: os textos, votos e fotos são deles; raspagem automática é coisa que esses sites costumam proibir nos termos (conferir antes) |
| Parfumo, Basenotes | idem: referência e link | mesma ressalva |
| Fragella API, FragDB | APIs e bases prontas de perfumes | apareceram na pesquisa; ver preço, licença e de onde vem o dado antes de depender |
| Wikidata | marca, país, grupo dono, ano de fundação | aberto |

Fato (nota, ano, perfumista, concentração) pode ser guardado; texto de resenha, descrição de marketing, voto de usuário e foto não são copiados. A ficha sempre mostra de onde veio cada dado.

### Notícias, lançamentos e resenhas (entram como feeds, igual às outras seções)
- Internacionais: Now Smell This (tem página só de lançamentos), CaFleureBon, Basenotes (destaques), Fragrantica News, The Perfume Society, Persolaise, Kafkaesque, Perfumer & Flavorist, Cosmetics Business, WWD Beauty, Beauty Packaging.
- Brasil: Fragrantica Brasil, cobertura de beleza de Forbes, Exame, Mercado & Consumo e Meio & Mensagem, blogs e canais nacionais que o Admin indicar.
- Marcas árabes: páginas de novidades de Lattafa, Afnan, Armaf, Rasasi, Al Haramain, Ajmal, Swiss Arabian, Arabian Oud.
- Nacionais: O Boticário, Natura, Eudora, Granado, Phebo, L'Occitane au Brésil e as casas de nicho brasileiras.
- A sonda de feeds (a mesma que já existe) testa cada endereço antes de entrar; só fica o que responder com itens.

### Preços
- Brasil: Mercado Livre (tem API oficial de busca), Amazon, Sephora, Beleza na Web, Época Cosméticos, The Beauty Box, Renner, lojas de decants; comparadores Buscapé e Zoom.
- Paraguai: Compras Paraguai (comparador), e as lojas direto: Nissei, Cellshop, Shopping China, Monalisa, Mega Eletrônicos, Roma Shopping.
- Fora: FragranceNet, FragranceX, Notino, Jomashop, MaxAroma.
- Regra: API oficial quando existir; onde não existir, só coleta se os termos do site deixarem, com intervalo longo e identificação honesta; onde não deixarem, a ficha mostra o link de busca na loja em vez do preço.

## 7. Como fica por dentro

- Collections no D1 (com espelho): `perfumes` (ficha), `perfumaria-marcas`, `perfumaria-precos` (um doc por perfume com a série por loja), `perfumaria-videos`, `perfumaria-criadores`, `items-perfumaria` e `destaques-perfumaria` (notícias, como as outras seções), `perfumaria/<email>` (acervo e notas do Admin, cifrado como a carteira).
- Coleta sem IA no cron: feeds, API do YouTube, API do Mercado Livre, câmbio.
- Curadoria (tarefa agendada, 2 vezes por dia): escolhe e resume notícias, lançamentos e resenhas; monta ou completa a ficha de um perfume quando ele aparece numa notícia ou quando o Admin pede.
- "Adicionar perfume" na tela: o Admin digita nome e marca, a ficha nasce vazia e a curadoria completa na rodada seguinte (ou na hora, por um botão).

## 8. Imagens

- Frasco: imagem **por link** do site oficial da marca ou da loja que vende, nunca copiada para o repositório. Quando não houver, um frasco desenhado em CSS na cor do acorde principal.
- Logotipo de marca: só o nome em texto nesta versão.
- Pessoas (criadores, perfumistas): sem foto.

## 9. Fases

1. **Base e acesso**: seção só do Admin, collections, "Adicionar perfume", ficha com pirâmide, acordes e minhas notas. Entrada manual e pela curadoria. Carga inicial: o acervo do Admin.
2. **Novidades, lançamentos e resenhas**: feeds pela sonda, curadoria, calendário de lançamentos, página de marcas.
3. **Preços**: Mercado Livre pela API, depois Paraguai e varejo conforme os termos de cada um; histórico e comparação.
4. **Quem falou**: YouTube pela API, lista de criadores, Instagram e TikTok pela curadoria.
5. **Descoberta**: busca por nota, comparação lado a lado, parecidos, widget no Início.

A seção nasce depois da fase 1 do SSR ou já na stack nova? Sugestão: fases 1 e 2 no HTML de hoje (é mais dado do que tela), ficha e comparação já como telas novas quando o SSR chegar.

## 10. O que o Admin precisa decidir ou fornecer

- Chave da YouTube Data API (console do Google Cloud; gratuita).
- Lista inicial de criadores que segue e das lojas em que compra.
- O acervo (pode ser uma planilha: marca, perfume, tamanho, tenho/quero).
- Se o frasco aparece por link de imagem da marca ou só desenhado.
- Se vale assinar uma API de catálogo paga ou ficar na montagem pela curadoria, perfume a perfume.

## 11. Riscos

- **Termos de uso**: Fragrantica, Parfumo e comparadores de preço não foram feitos para leitura por robô. O plano não depende de copiar nenhum deles; depende de fontes primárias, APIs oficiais e curadoria com link. Onde a tentação for raspar, a resposta é link de saída.
- **Catálogo incompleto no começo**: sem base pronta, a ficha cresce conforme o uso. Aceitável para uso pessoal; ruim se abrir para convidados cedo.
- **Preço do Paraguai**: muda todo dia e depende de câmbio; sem coleta permitida, vira link de busca.
- **Instagram e TikTok**: cobertura sempre parcial.
