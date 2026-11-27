# FutTable

Painel de campeonatos de futebol em pontos corridos, com interface em React, API em Node.js e persistência no PostgreSQL do Supabase.

## Rodar no computador

Use Node.js 22.13 ou superior. Na pasta do projeto, execute

```sh
npm ci
npm run dev
```

Abra `http://localhost:5173`. O comando inicia a interface e a API. A primeira tela é a de login. Configure o Supabase conforme as instruções abaixo para criar uma conta e acessar a liga.

## Ativar as contas e o banco

Para uma instalação própria do Supabase pelo Easypanel, siga a seção [Supabase no Easypanel](#supabase-no-easypanel). Os passos a seguir usam o painel do serviço hospedado pela Supabase.

1. No SQL Editor do Supabase, aplique as migrações pendentes em ordem. Um banco novo precisa da [migração inicial](supabase/migrations/202611270001_league.sql), da [gestão de clubes](supabase/migrations/202611270002_manage_teams.sql) e da [migração de jogadores e sorteios](supabase/migrations/202611270003_players_draws.sql). Se as duas primeiras já foram aplicadas, execute apenas a terceira.
2. Em **Authentication**, habilite o provedor **Email** e o cadastro de usuários. Para exigir confirmação, habilite **Confirm email**. Em **URL Configuration**, defina a **Site URL** e adicione `http://localhost:5173/` às **Redirect URLs** durante o desenvolvimento. Ao publicar, configure também o endereço HTTPS da aplicação. [Guia de login por senha e recuperação](https://supabase.com/docs/guides/auth/passwords)
3. Copie o modelo de ambiente e preencha as duas variáveis com a **Project URL** e a **Publishable key** (`sb_publishable_…`) do painel do projeto. A chave publicável é enviada ao navegador. O token de cada usuário identifica sua liga nas operações da API.

   ```sh
   cp .env.example .env
   ```

   ```dotenv
   SUPABASE_URL=https://seu-projeto.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_sua_chave
   PORT=3001
   ```

4. Reinicie `npm run dev` e escolha **Criar conta** na tela de login. Se a confirmação estiver ativa, abra o link recebido por e-mail. Para atender usuários fora da equipe do projeto, configure um provedor SMTP no Supabase. [Configuração de e-mail do Supabase](https://supabase.com/docs/guides/auth/auth-smtp)

Cada conta começa com uma liga privada vazia. O catálogo fica disponível para escolha desde o primeiro acesso. O banco aplica políticas de acesso por linha e verifica se ambos os clubes de cada partida pertencem à mesma conta. [Políticas de acesso do PostgreSQL no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)

## Montar uma rodada com os jogadores

1. Em **Clubes → Cadastrar clube**, procure uma das 50 equipes do catálogo e confira o escudo e a nota. Escolha a equipe, informe o nome ou apelido do jogador e salve. Para criar sua própria equipe, escolha **Personalizado**. Em um clube já cadastrado, use **Editar** para vincular o jogador ou escolher o escudo no catálogo.
2. Em **Partidas → Selecionar quem vai jogar**, marque os participantes da rodada e clique em **Sortear rodada**. Cada jogador participa uma vez com seu clube. Se a quantidade for ímpar, o sorteio indica quem folga. Você pode montar várias rodadas e alternar entre elas em **Exibir rodada**.
3. Depois de jogar, abra a rodada e escolha **Lançar placar** no confronto. Salvar o resultado atualiza a classificação, inclusive em empates por 0 a 0. O histórico do sorteio guarda os nomes dos jogadores e clubes que participaram.

## Regras da classificação

Vitórias valem três pontos e empates valem um. A tabela ordena por pontos, saldo de gols e gols marcados. Em caso de igualdade, usa o nome do clube. A coluna **Últimos 5** mostra a sequência da partida mais antiga à mais recente.

Em **Clubes**, você pode editar nome, sigla e cor. Excluir um clube também exclui suas partidas e recalcula a classificação. O sistema informa quantas partidas serão afetadas antes de confirmar.

A tela **Partidas** permite filtrar por clube, corrigir o placar ou excluir um resultado. A aplicação recalcula a classificação e as estatísticas a partir das partidas salvas.

## Produção

```sh
npm ci
npm run build
npm start
```

O processo Node serve os arquivos de `dist/` e as rotas `/api` na porta `PORT` (padrão 3001). Configure as variáveis de ambiente e o acesso HTTPS na hospedagem. O login, a recuperação de senha e a persistência em nuvem usam o mesmo projeto Supabase.

### Publicar no Easypanel

1. Crie um serviço **App** e conecte a origem GitHub ao repositório `Bricio29/FutTable`, branch `main`.
2. Selecione o método de build **Dockerfile**, com contexto na raiz do repositório (`.`) e caminho `Dockerfile`. A imagem executa os testes, compila o React e inicia o servidor Node.
3. Em **Environment**, configure a URL e a chave pública da sua instalação do Supabase. Sem essa configuração, a tela de entrada informa que o acesso está indisponível.
4. Em **Domains**, encaminhe o domínio HTTPS para a porta interna `3001` e faça o deploy. Se a interface estiver na Vercel, encaminhe as chamadas `/api/:path*` desse site para `https://DOMINIO-DO-FUTTABLE-NO-EASYPANEL/api/:path*`.

### Supabase no Easypanel

1. Em **Supabase → Environment**, localize `SUPABASE_PUBLIC_URL`. Ela deve conter a origem HTTPS pública do gateway Kong, por exemplo `https://supabase.exemplo.com`. Se o valor ainda for local, confira em **Domains** o domínio direcionado a `kong` (porta interna `8000` no template oficial). Localize também a chave pública de cliente: `SUPABASE_PUBLISHABLE_KEY` ou, nas instalações com chaves legadas, `ANON_KEY`.
2. Em **FutTable → Environment**, copie `SUPABASE_PUBLIC_URL` e a chave pública escolhida, com os mesmos nomes. A API entrega esses valores ao navegador e mantém o token do usuário nas operações da liga.
3. No serviço Supabase, configure `SITE_URL` com o endereço público da interface e inclua a raiz HTTPS da interface em `ADDITIONAL_REDIRECT_URLS`. Em uma instalação compartilhada, preserve a URL padrão e acrescente o novo endereço à lista existente, separado por vírgula. Aplique o deploy dos serviços cujas variáveis foram alteradas.
4. No SQL Editor do Studio, aplique as migrações pendentes na ordem descrita em [Ativar as contas e o banco](#ativar-as-contas-e-o-banco). Para atualizar uma liga que já possui as duas primeiras migrações, execute a [migração de jogadores e sorteios](supabase/migrations/202611270003_players_draws.sql) e faça o deploy da nova versão do app FutTable no Easypanel. A Vercel usa as mesmas rotas `/api` configuradas no `vercel.json`.

[Template do Supabase para Easypanel](https://easypanel.io/templates/supabase) · [Chaves de cliente no Supabase auto-hospedado](https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys)

## Validação

Execute `npm test` para verificar pontuação, desempates, validação de placares e comportamento da API. Para conferir isolamento por conta e sorteios, execute [rls.test.sql](server/rls.test.sql) e [draws.test.sql](server/draws.test.sql) no SQL Editor de um projeto de teste com as três migrações aplicadas. Cada teste desfaz suas operações ao final.
