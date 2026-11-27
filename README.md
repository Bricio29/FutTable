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

1. No SQL Editor do Supabase, aplique uma vez cada migração pendente, nesta ordem.

   | Ordem | Arquivo |
   | --- | --- |
   | 1 | [Liga inicial](supabase/migrations/202611270001_league.sql) |
   | 2 | [Gestão de clubes](supabase/migrations/202611270002_manage_teams.sql) |
   | 3 | [Jogadores e sorteio de partidas](supabase/migrations/202611270003_players_draws.sql) |
   | 4 | [Sorteio de clubes](supabase/migrations/202611270004_club_draws.sql) |
   | 5 | [Gerenciamento de ligas](supabase/migrations/202611270005_leagues.sql) |

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

## Gerenciar suas ligas

Cada conta começa com uma liga privada chamada **Minha liga**. Na aba **Ligas**, você pode dar um nome a ela, criar outra liga ou abrir uma anterior. O lápis ao lado do nome na **Visão geral** abre a edição da liga atual.

Uma liga nova começa sem clubes, jogadores ou partidas. Você pode usar o mesmo clube em campeonatos diferentes. Ao trocar de liga, os resultados e os sorteios continuam salvos no campeonato de origem. Na atualização de uma instalação existente, os registros anteriores ficam em **Minha liga**. A última liga aberta é lembrada no mesmo navegador, por conta.

## Montar uma rodada com os jogadores

1. Se os jogadores já escolheram suas equipes, use **Clubes → Cadastrar clube**. Selecione um clube pelo nome e pelo escudo, digite o nome ou apelido do jogador e salve. Para criar seu próprio time, escolha **Personalizado**. Para distribuir as equipes por sorteio, clique em **Sortear clubes**, informe a quantidade de jogadores (2 a 50), preencha os nomes e escolha um clube do catálogo por pessoa. O botão **Completar com clubes aleatórios** preenche as vagas que faltam e permite revisar a seleção. Ao confirmar, o sistema embaralha os clubes escolhidos e salva cada vínculo na liga.
2. Em **Partidas**, confira os jogadores e clubes em **Selecionar quem vai jogar** e clique em **Sortear rodada**. Ao vir do sorteio de clubes, o grupo sorteado já está selecionado. Se a quantidade for ímpar, o sorteio indica quem folga. Você pode montar várias rodadas e alternar entre elas em **Exibir rodada**.
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
4. No SQL Editor do Studio, aplique as migrações pendentes na ordem descrita em [Ativar as contas e o banco](#ativar-as-contas-e-o-banco). Se o banco já tem as três primeiras, execute a quarta e a quinta e faça o deploy do app FutTable no Easypanel. A Vercel encaminha as chamadas `/api` conforme o `vercel.json`.

[Template do Supabase para Easypanel](https://easypanel.io/templates/supabase) · [Chaves de cliente no Supabase auto-hospedado](https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys)

## Validação

Execute `npm test` para verificar o catálogo, a classificação, os placares e as rotas da API. Em um banco de teste com as cinco migrações aplicadas, execute os testes de [isolamento por conta](server/rls.test.sql), [sorteio de partidas](server/draws.test.sql), [sorteio de clubes](server/club-draws.test.sql) e [gerenciamento de ligas](server/leagues.test.sql). Cada arquivo desfaz os dados que criou.
