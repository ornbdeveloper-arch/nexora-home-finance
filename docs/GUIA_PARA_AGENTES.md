# Nexora Home Finance — contexto para agentes de IA

## Objetivo e produto

Nexora é uma aplicação web de finanças pessoais, em português do Brasil, para vários usuários. Cada pessoa registra receitas e despesas, acompanha o saldo de caixa, contas pendentes, limites mensais, compras parceladas, despesas recorrentes e metas. Há uma demonstração temporária com dados fictícios. Administradores podem gerenciar contas. A interface também oferece backup JSON, restauração e exportação CSV.

O produto distingue **compra** de **pagamento** em despesas comuns. `purchaseDate` indica quando a compra aconteceu; `date` indica quando o dinheiro saiu ou está previsto sair; `dueDate` preserva o vencimento original após a efetivação. `paymentMethod` pode ser `credit`, `debit`, `pix` ou vazio para registros sem meio informado. `cardId` vincula uma compra no crédito a um cartão cadastrado. Uma compra no crédito pode ser feita em setembro e ficar pendente para outubro, em um único lançamento. Débito e Pix são efetivados na data da compra. Parcelamentos continuam sendo uma entidade separada, usada apenas para compromissos divididos em duas ou mais parcelas.

## Tecnologias e execução

- Frontend: HTML, CSS e módulos JavaScript nativos, sem framework ou build.
- Backend: servidor HTTP com módulos nativos do Node.js 22+, sem dependências npm externas.
- Identidade e dados: Supabase Auth e uma linha JSONB por usuário na tabela `public.nexora_state`.
- Hospedagem prevista: Render Web Service. `npm run dev` carrega `.env`; `npm start` serve produção; `npm test` executa `node --test`.
- O frontend é servido pelo mesmo servidor da API. Não abra `public/index.html` diretamente.

Veja `.env.example` para variáveis exigidas. A publishable key vai ao navegador; a secret key fica somente no backend. Execute `supabase/schema.sql` no projeto Supabase antes de usar a aplicação.

## Arquitetura e fluxo

`public/index.html` contém a estrutura da interface e os diálogos. `public/styles.css` controla tema claro/escuro e responsividade. `public/app.js` mantém o estado visual, renderiza páginas, recebe eventos e chama `public/api.js`. `public/finance.js` contém cálculos puros em centavos. `public/auth.js` cuida do login, tokens e sessão.

`server/server.js` serve os arquivos públicos, autentica chamadas `/api`, implementa rotas e aplica alterações ao estado. `server/domain.js` valida entradas, backup e regras de negócio. `server/repository.js` carrega e salva o JSONB do usuário, sem cache financeiro compartilhado e com atualização condicional para evitar perda de alterações concorrentes. `supabase/schema.sql` cria a tabela, habilita RLS e revoga acesso direto de `anon` e `authenticated`.

Fluxo de uma alteração: formulário → `app.js` → `api.js` → autenticação e rota em `server.js` → validação em `domain.js` → persistência em `repository.js` → estado atualizado → renderização. A API rejeita campos inesperados sensíveis, como `user_id`, e usa o ID obtido do token validado. A administração exige `app_metadata.role === 'admin'` também no servidor. O cadastro público deve permanecer desabilitado no Supabase.

## Modelo e regras financeiras

O estado persistido tem `version: 1`, `transactions`, `categories`, `budgets`, `installments`, `recurringExpenses`, `goals` e `cards`. Valores monetários são inteiros em centavos; datas são `YYYY-MM-DD`; meses são `YYYY-MM`. A restauração valida cada item e referências entre categorias, cartões e registros. Não altere o formato sem cuidar dos backups antigos.

Uma transação tem `id`, `description`, `amount`, `type` (`income` ou `expense`), `status` (`paid` ou `pending`), `date`, `dueDate`, `category`, `notes`, `purchaseDate`, `paymentMethod` e `cardId`. Registros antigos sem esses campos novos são aceitos; na validação, compra e vencimento assumem `date`, e meio/cartão ficam vazios. Para receita, o meio de pagamento fica vazio. Para despesa, `purchaseDate` não pode ser posterior a `date`. Débito e Pix exigem `paid` e datas iguais. Crédito pode ter pagamento futuro e status pendente. Cada cartão tem `id`, `name`, `closingDay` e `dueDay`, com dias de 1 a 28. O cálculo do vencimento ocorre no frontend e é uma sugestão editável; a data salva na transação não muda automaticamente quando a configuração do cartão muda.

O mês exibido, os lançamentos mensais, contas a pagar e orçamentos usam `date`, isto é, o mês do pagamento/vencimento. A tela de Lançamentos também oferece visão por `purchaseDate` para despesas e filtro por meio de pagamento. O saldo e o fluxo de caixa somam somente transações `paid`; pendentes aparecem em contas a pagar/receber. Orçamentos incluem despesas pagas e pendentes, além de parcelas e recorrências. O saldo acumulado não consulta conta bancária: é a soma das transações efetivadas até o fim do mês selecionado. A projeção soma pendências e compromissos até o fim do mês. O valor reservado nas metas reduz apenas o disponível estimado, sem alterar o saldo. Parcelamentos e recorrências aparecem como compromissos próprios; não são transações comuns e não devem ser duplicados no caixa por acidente.

## Telas e operações

Visão geral mostra cartões de saldo, receitas, despesas e contas a pagar, projeção até o fim do mês, gráficos de seis meses, últimos lançamentos e próximos vencimentos. Lançamentos permite busca, filtros, visão por compra ou pagamento, edição, exclusão, efetivação com data real e CSV. Cartões mantém fechamento, vencimento e próxima fatura pendente. Agenda lista vencimentos pendentes dos próximos 30 dias e atrasados. Orçamentos mantém limites por mês e categoria e inclui simulador de compra à vista ou parcelada. Parcelamentos controla parcelas pagas por mês e também despesas recorrentes. Metas acompanha alvo, valor guardado e prazo. Categorias personaliza classificação. Dados e backup exporta/restaura JSON e exporta CSV. Usuários aparece apenas para administradores.

As rotas estão listadas em `README.md`; os testes de domínio e API ficam em `tests/`. Ao mudar transações, revisar conjuntamente formulário, validação, resumo, listagem, CSV e restauração. Os textos inseridos pelo usuário devem continuar escapados antes de entrar em HTML. Mantenha compatibilidade com registros persistidos e backups `version: 1`.
