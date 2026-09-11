# Nexora — finanças pessoais

Uma aplicação financeira multiusuário escrita em **HTML, CSS e JavaScript**, sem React, frameworks ou dependências externas. Usa Supabase para autenticação e banco de dados e roda como um Web Service no Render.

## Executar

Requisito: **Node.js 22 ou mais recente**. Copie `.env.example` para `.env`, preencha as chaves do seu projeto Supabase e execute:

```sh
npm run dev
```

Abra **http://127.0.0.1:3000**. Não precisa executar `npm install`. O comando `npm start` é usado no Render, onde as variáveis são definidas no painel. Nunca envie `.env` ao Git. Não abra `index.html` diretamente.

## Usar

1. Escolha o mês e clique em **Novo lançamento**.
2. Informe receita ou despesa, descrição, valor, data e categoria. Valores aceitam `1250,50` ou `1250.50`, sem separador de milhar.
3. Use **Efetivado** para dinheiro que já entrou/saiu, e **Pendente** para previsões e contas a pagar/receber. A data representa a movimentação ou o vencimento; ao efetivar um pagamento em outra data, edite também a data.
4. Em **Lançamentos**, busque, filtre, edite, exclua ou marque uma pendência como efetivada.
5. Em **Orçamentos**, defina limites por categoria para o mês. Eles consideram despesas pagas **e pendentes**.
6. Em **Dados e backup**, exporte CSV, baixe um backup JSON ou restaure uma cópia. No celular, o acesso está no rodapé do quadro de últimos lançamentos da Visão geral.

O saldo acumulado soma receitas menos despesas efetivadas até o último dia do mês selecionado. Não é um saldo consultado em banco. Para começar com um saldo que já possui, registre uma receita chamada “Saldo inicial” (ou despesa, se negativo), datada antes do mês que deseja acompanhar.

O gráfico mostra seis meses e considera apenas efetivados. Os percentuais são arredondados e podem não somar exatamente 100%. O CSV traz o tipo separado e valores positivos.

**Demonstração:** exemplos fictícios apenas na memória da página, separados dos seus dados. A edição fica bloqueada nesse modo. Recarregar a página ou clicar em “Voltar aos meus dados” retorna aos registros reais. O aplicativo começa vazio.

## Como estudar o projeto

Leia os arquivos nesta ordem:

| Arquivo | O que ensina |
| --- | --- |
| `public/index.html` | HTML semântico, navegação, campos e modais nativos |
| `public/styles.css` | Cores, flexbox, grid e responsividade |
| `public/finance.js` | Funções puras; cálculos em centavos evitam erros decimais |
| `public/app.js` | Estado da interface, renderização, eventos e formulários |
| `public/api.js` | `fetch`, JSON, requisições e erros |
| `server/server.js` | HTTP e rotas, usando módulos nativos do Node |
| `server/domain.js` | Validação e regras de negócio |
| `server/repository.js` | Persistência individual por usuário no Supabase |
| `public/auth.js` | Login, sessão, renovação de token e logout |
| `tests/` | Testes de cálculos e integração com a API |

O caminho de um cadastro: formulário → `app.js` → `api.js` → rota HTTP → validação → repositório → resposta JSON → atualização da tela.

`app.js` tem quatro blocos comentados: estado, renderização, alterações e eventos. Textos do usuário passam por escape antes de entrar no HTML. A validação ocorre no formulário e no servidor.

## Supabase e isolamento entre usuários

Execute [supabase/schema.sql](supabase/schema.sql) uma vez no SQL Editor do projeto. A tabela usa `user_id` como chave primária e referência a `auth.users`. O navegador autentica somente com a publishable key. A secret key permanece no servidor, que valida o token antes de toda rota `/api` e usa o `user.id` validado para ler e gravar.

Os dados financeiros não ficam no `localStorage`; somente access token, refresh token e UID da sessão são guardados ali. Cada linha financeira pertence a um usuário. O repositório não mantém cache compartilhado e usa atualização condicional para evitar que requisições concorrentes apaguem alterações umas das outras.

O cadastro público deve permanecer desabilitado no Supabase. Crie usuários manualmente em Authentication > Users. A aplicação oferece apenas login e logout.

## Render

Crie um Web Service com o comando `npm start`. Configure no painel `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY` e `FRONTEND_ORIGIN` (a URL HTTPS exata do serviço, sem barra final). O Render fornece `PORT`; o código usa `0.0.0.0` automaticamente quando `RENDER` está presente. `NEXORA_ALLOWED_USER_ID` não é usado.

Não coloque a secret key em arquivos públicos nem em variáveis com prefixos de frontend. Como frontend e API são servidos juntos, `API_URL` continua relativo como `/api`.

## API

`amount` é inteiro em **centavos**; datas são `YYYY-MM-DD`; meses, `YYYY-MM`. O estado tem `version`, `transactions`, `categories` e `budgets`.

| Método e rota | Função |
| --- | --- |
| `GET /api/me` | Ler nome e e-mail do usuário autenticado |
| `GET /api/state` | Ler dados |
| `POST /api/transactions` | Criar lançamento |
| `PUT /api/transactions/:id` | Editar lançamento |
| `DELETE /api/transactions/:id` | Excluir (corpo JSON `{}`) |
| `PUT /api/budgets` | Criar/atualizar limite por mês e categoria |
| `DELETE /api/budgets` | Remover limite |
| `POST /api/categories` | Adicionar categoria |
| `GET /api/backup` | Exportar estado |
| `POST /api/restore` | Validar e substituir estado |

O nome exibido vem de `user_metadata.full_name`, `name` ou `display_name` no usuário do Supabase. Se nenhum desses campos estiver preenchido, a interface mostra o e-mail.

Exemplo:

```json
{
  "description": "Supermercado",
  "amount": 12550,
  "type": "expense",
  "category": "alimentacao",
  "date": "2026-09-11",
  "status": "paid",
  "notes": "Compras da semana"
}
```

## Verificação

```sh
npm test
```

Os testes da API usam pasta temporária e porta livre; não alteram seus dados. Prints e registro da validação manual ficam em `docs/`.
