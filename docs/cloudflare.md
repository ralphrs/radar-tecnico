# Configuração no Cloudflare

Passo a passo para colocar o Lookout no ar, com o que deu errado no caminho e como resolver.

## Visão geral

| Peça | Nome | Observação |
|---|---|---|
| Worker | `news` | Deploy automático a cada push em `main` (Workers Builds) |
| Endereço | `news.ralph-renato.workers.dev` | Protegido pelo Cloudflare Access |
| Banco D1 | `lookout` (`b83811df-f894-41b0-8d3b-4323faf1e1ff`) | Já referenciado no `wrangler.jsonc` |
| Zero Trust | equipe `bitter-mountain-e37c`, plano Zero Trust Free | Gratuito até 50 usuários |

O nome do Worker no painel precisa ser igual ao `name` do `wrangler.jsonc`. Se forem diferentes, o deploy pelo Workers Builds falha.

## 1. Criar o Worker a partir do repositório

1. Workers & Pages → **Create** → **Import a repository** → `ralphrs/radar-tecnico`.
2. **Project name**: `news` (igual ao `wrangler.jsonc`).
3. **Build command**: vazio. **Deploy command**: `npx wrangler deploy`. **Preview command**: `npx wrangler preview`.
4. **Deploy**.

Depois do primeiro deploy, o cron do Worker começa a importar o histórico de `public/seed/`, uma parte por minuto (24 partes, uns 25 minutos). Para acompanhar:

```sql
SELECT collection, count(*) FROM docs GROUP BY collection;
SELECT data FROM docs WHERE collection = '_sistema' AND id = 'seed';
```

## 2. Ligar o Cloudflare Access no Worker

**Pré-requisito:** o Zero Trust precisa estar ativado na conta (painel → Zero Trust). Sem isso, o botão do passo abaixo pode não aparecer ou não fazer nada. Na nossa conta ele já está ativo (equipe `bitter-mountain-e37c`, plano Zero Trust Free).

1. Workers & Pages → `news` → aba **Domains** (em painéis mais antigos: **Settings → Domains & Routes**).
2. Na linha do `workers.dev`, clique em **Enable Cloudflare Access**. Em algumas versões do painel o botão se chama **Protect this Worker behind Access**.
3. Clique em **Manage Cloudflare Access** para abrir a aplicação criada.

**Como saber se funcionou:** ao ativar, o Cloudflare cria sozinho uma aplicação no Access e uma política reutilizável chamada `news - Production`. Se em Zero Trust → Access controls → Applications não houver nenhuma aplicação, a ativação não concluiu: confira o pré-requisito do Zero Trust e clique de novo no botão.

Observações:
- O botão protege só o `workers.dev` e as Preview URLs. Um domínio próprio precisa de uma aplicação separada em Zero Trust → Access controls → Applications, com o hostname do domínio.
- As Preview URLs de todos os Workers da conta dividem uma única política ("Cloudflare Workers Preview URLs").

## 3. Política: deixar qualquer pessoa fazer login

Na política `news - Production`, troque a regra **Include** (que vem com o e-mail do dono da conta) por **Everyone** e salve.

Isso não abre o site: o Access só garante que a pessoa provou quem é. Quem decide quem entra é o Worker, pela lista de convidados do `/admin` (tabela `usuarios` no D1). Quem faz login sem estar na lista vê a tela "Este espaço é só para convidados". Assim existe uma lista só, gerenciada pela página.

## 4. Métodos de login

- **Código por e-mail (One-time PIN):** funciona sem configurar nada.
- **Google:** Zero Trust → Settings → Authentication → **Add new** → Google. Exige criar uma credencial OAuth no Google Cloud.

## 5. Variáveis do Worker

Workers & Pages → `news` → Settings → **Variables and Secrets** → Add (tipo Text), depois **Deploy**:

| Nome | Valor |
|---|---|
| `ADMIN_EMAIL` | e-mail do administrador; entra sempre e vê o `/admin` |
| `ACCESS_TEAM_DOMAIN` | `bitter-mountain-e37c.cloudflareaccess.com` |
| `ACCESS_AUD` | o **Application Audience (AUD) Tag** da aplicação do Access (passo 2) |

O `wrangler.jsonc` usa `keep_vars: true`, então os deploys seguintes não apagam essas variáveis. O e-mail fica fora do repositório de propósito.

Enquanto `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD` não estiverem preenchidas, o site responde "Falta ligar o login" e não abre para ninguém.

## Validação do token (já implementada)

A documentação do Cloudflare recomenda validar no Worker o JWT que o Access envia no cabeçalho `Cf-Access-Jwt-Assertion`; sem isso, alguém poderia chamar o Worker sem passar pelo login. O Lookout já faz isso em `src/auth.js`, sem a biblioteca `jose`, usando a Web Crypto do próprio Worker: confere a assinatura RS256 com as chaves públicas em `https://<equipe>.cloudflareaccess.com/cdn-cgi/access/certs`, o `aud`, o emissor e a validade. Token ausente ou inválido é recusado.

## Problemas já vistos

| Sintoma | Causa | Solução |
|---|---|---|
| Deploy falha logo no começo | Project name diferente do `name` do `wrangler.jsonc` | Deixar os dois iguais (`news`) |
| "Enable Cloudflare Access" não cria nada; Access sem aplicações e sem políticas | Zero Trust ainda não ativado, ou o clique não concluiu | Ativar o Zero Trust e clicar de novo; conferir se surgiu a política `news - Production` |
| Site mostra "Falta ligar o login" | Faltam `ACCESS_TEAM_DOMAIN` ou `ACCESS_AUD` | Passo 5 |
| Pessoa faz login e vê "só para convidados" | E-mail não está na lista | Adicionar em `/admin` |
| Convidado não consegue nem chegar à tela de login do Lookout | Política do Access ainda restrita a e-mails específicos | Passo 3 (Include: Everyone) |
