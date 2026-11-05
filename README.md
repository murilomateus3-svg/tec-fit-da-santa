# Tec Fit da Santa — versão PostgreSQL / Render

Portal público de alimentação e bem-estar com catálogo de produtos, informações nutricionais, receitas, avaliações e páginas de produtos acessadas por QR Code. O painel administrativo exige login.

## O que mudou nesta versão
- Banco de dados migrado de SQLite para PostgreSQL (`pg`).
- Sessões de login armazenadas no PostgreSQL (`connect-pg-simple`), inclusive após reinicializações do serviço.
- Arquivo `render.yaml` para configurar o serviço web e o banco PostgreSQL no Render.
- O site público continua aberto; apenas o painel administrativo exige autenticação.
- Administrador cria e remove contas de funcionários. Funcionários não gerenciam contas.

## Testar localmente
Requisitos: Node.js 20 ou superior e PostgreSQL.

1. Crie um banco PostgreSQL chamado `tecfitdasanta`.
2. Abra esta pasta no VS Code e rode `npm install`.
3. Copie `.env.example` para `.env` e ajuste `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`.
4. Rode `npm start` e abra `http://localhost:3000`.

O banco cria as tabelas e os dados demonstrativos automaticamente na primeira inicialização. Não use as credenciais de exemplo em produção.

## Publicar no GitHub e Render
1. Crie um repositório no GitHub e envie o conteúdo desta pasta (não envie o arquivo `.env`).
2. No Render, escolha **New → Blueprint** e conecte o repositório.
3. O Render lerá `render.yaml` para criar o serviço web e o PostgreSQL. Confira os planos e a disponibilidade exibidos na sua conta antes de confirmar.
4. Preencha `ADMIN_EMAIL` e `ADMIN_PASSWORD` quando solicitado. Use uma senha exclusiva com pelo menos 12 caracteres. `SESSION_SECRET` é gerado pelo Render.
5. Depois da publicação, copie a URL `https://...onrender.com` e configure o valor de `PUBLIC_URL` nas variáveis do serviço. Isso faz os QR Codes apontarem para o endereço público correto.
6. Faça um novo deploy se o Render não aplicar a variável automaticamente.

## Acesso e funcionalidades
- Página pública: `/`
- Painel: `/admin`
- Página pública de produto/QR: `/produto/ID`
- Avaliações enviadas pelo público ficam pendentes até aprovação.
- O painel permite gerenciar produtos, preços/ofertas, receitas, avaliações e cartazes de gôndola.

## Observações importantes
- Serviços gratuitos podem ter limites, suspender após inatividade ou sofrer alterações de disponibilidade. Verifique os planos atuais do Render antes de usar em produção.
- Antes de lançar para clientes, configure domínio/HTTPS, backups do PostgreSQL, política de privacidade e revise os dados e textos nutricionais.
- Imagens externas dependem de conexão com a internet.

## Estrutura
- `src/server.js`: servidor Express, API, autenticação e PostgreSQL.
- `public/`: páginas, estilos e scripts do site e do painel.
- `render.yaml`: configuração de publicação no Render.
- `.env.example`: modelo das variáveis locais.
