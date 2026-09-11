# Validação do Nexora

## Validação multiusuário — 11/09/2026

- Autenticação obrigatória em todas as rotas `/api`; token ausente e inválido retornam 401.
- Teste A → B → A confirmou isolamento dos lançamentos por `user_id` derivado do token validado.
- Criação inicial, CRUD completo, backup e restauração foram exercitados em um Supabase simulado localmente.
- Duas gravações concorrentes foram preservadas por atualização condicional e repetição limitada.
- O refresh token é tentado uma vez; a requisição original é repetida uma vez e falhas limpam a sessão.
- Logout apaga os três itens de sessão e a interface financeira da memória.
- `auth-config` expõe somente URL e publishable key; a secret key permanece no servidor.
- `/auth.js` é servido como JavaScript. Todos os IDs usados no login existem no HTML.
- Modal sem sessão abre automaticamente e continua aberto ao pressionar Esc.
- Supabase real consultado sem alterar dados: tabela respondeu com `user_id`, `data` e `updated_at`; os 2 estados existentes passaram por `validateBackup()`; consulta anônima retornou zero linhas; cadastro público confirmado como desabilitado.
- Seis testes automatizados aprovados e nenhum erro ou aviso no console na tela de login.

Os testes multiusuário não acessam o projeto Supabase real nem alteram dados existentes. As credenciais de duas pessoas devem ser usadas manualmente apenas após criar os usuários no painel.

Verificação realizada em 11/09/2026. Sem publicação externa e sem dados financeiros reais.

## Resultado

- **5 testes automatizados aprovados**, com `npm test`.
- API: cadastro, edição, exclusão, categorias, orçamento, backup e restauração.
- Persistência verificada depois de encerrar e iniciar um servidor de teste.
- Valores em centavos; pendências separadas de efetivados; saldo acumulado separado do resultado do mês.
- Datas impossíveis, centavos fracionários, referências inválidas, registros duplicados e escrita de outra origem rejeitados nos testes.
- No navegador: cadastro de despesa pendente de R$ 125,50, edição para R$ 150,75, efetivação e recarga da página com o valor preservado.
- No navegador: criação de orçamento de R$ 200,00, mostrando corretamente R$ 49,25 disponíveis, e criação de categoria.
- Filtro de pendências da demonstração retorna 4 registros, dos quais 3 são despesas e 1 é receita.
- Campo de valor rejeita `12,345` e mantém o formulário aberto com mensagem explicativa.
- Integração opcional de consulta WebMCP: resumo correto e parâmetro inesperado rejeitado, sem alterar dados.
- Layout verificado em desktop e celular (390 px). Corrigidas quebra excessiva de nomes e largura do gráfico. A página não ultrapassa a largura da tela; a tabela completa de Lançamentos possui rolagem horizontal interna no celular.
- Nenhum erro ou aviso de console na consulta final da sessão mobile.

Os testes de interface usaram outro servidor, na porta 3001, com armazenamento separado em `test-results/ui`. Esse servidor foi encerrado. Os testes automatizados usam diretórios temporários. A base pessoal da porta 3000 permanece vazia; a demonstração não grava dados.

## Capturas

Os prints foram obtidos do navegador real. Os painéis preenchidos usam o modo demonstração, identificado por uma faixa. O formulário usa um registro de teste na base isolada.

| Arquivo em `screenshots/` | Tela |
| --- | --- |
| `01-visao-geral-desktop.png` | Visão geral completa |
| `02-lancamentos-desktop.png` | Lançamentos filtrados por pendências |
| `03-orcamentos-desktop.png` | Orçamentos, incluindo categoria acima do limite |
| `04-categorias-desktop.png` | Categorias |
| `05-backup-desktop.png` | Exportação e restauração |
| `06-novo-lancamento-desktop.png` | Formulário de edição do registro de teste |
| `07-visao-geral-mobile.png` | Visão geral completa em celular |
| `08-mobile-primeira-tela.png` | Primeira tela em celular |
| `09-lancamentos-mobile.png` | Lançamentos em celular |

## Escopo da verificação

Esta validação não é uma auditoria de segurança ou de compatibilidade com todos os navegadores. Downloads CSV/JSON e seletor de restauração foram implementados; backup e restauração foram exercitados via API, sem teste completo do seletor de arquivos do navegador. Publicação, autenticação e banco externo ficam para a próxima etapa, após a escolha dos provedores.
