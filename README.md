# FutTable

Painel de campeonatos de futebol em pontos corridos, com interface em React, API em Node.js e persistência no PostgreSQL do Supabase.

## Rodar no computador

Use Node.js 22.13 ou superior. Na pasta do projeto, execute

```sh
npm ci
npm run dev
```

Abra `http://localhost:5173`. O comando inicia a interface e a API. A demonstração traz oito clubes e 16 partidas. Você pode cadastrar um clube, registrar ou corrigir o placar de uma partida e acompanhar a tabela. As alterações da demonstração ficam no navegador.

## Ativar as contas e o banco

1. Em um projeto Supabase, abra o SQL Editor e execute o arquivo [202611270001_league.sql](supabase/migrations/202611270001_league.sql) uma vez. Ele cria as tabelas, as regras de acesso por conta e a consulta da liga.
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

4. Reinicie `npm run dev`, abra **Entrar** e escolha **Criar conta**. Se a confirmação estiver ativa, abra o link recebido por e-mail. Para atender usuários fora da equipe do projeto, configure um provedor SMTP no Supabase. [Configuração de e-mail do Supabase](https://supabase.com/docs/guides/auth/auth-smtp)

Cada conta começa com uma liga privada vazia. Cadastre dois clubes e registre a primeira partida. A liga de demonstração continua disponível ao sair. O banco aplica políticas de acesso por linha e verifica se ambos os clubes de cada partida pertencem à mesma conta. [Políticas de acesso do PostgreSQL no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)

## Regras da classificação

Vitórias valem três pontos e empates valem um. A tabela ordena por pontos, saldo de gols e gols marcados. Em caso de igualdade, usa o nome do clube. A coluna **Últimos 5** mostra a sequência da partida mais antiga à mais recente.

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
3. Em **Environment**, defina `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` para o projeto em que aplicou a migração. Com as duas variáveis vazias, o app abre em demonstração local.
4. Em **Domains**, encaminhe o domínio HTTPS para a porta interna `3001` e faça o deploy. Registre esse endereço no Supabase conforme a seção **Ativar as contas e o banco**.

## Validação

Execute `npm test` para verificar pontuação, desempates, validação de placares e comportamento da API. Para conferir o isolamento no banco, execute [rls.test.sql](server/rls.test.sql) no SQL Editor de um projeto de teste com a migração aplicada. O teste cria duas contas temporárias e desfaz as operações ao final.
