# Nexora — finanças pessoais

Uma aplicação pessoal para substituir o controle financeiro em planilha. Escrita em **HTML, CSS e JavaScript**, sem React, frameworks, bibliotecas externas, serviços de nuvem ou etapa de compilação.

## Executar

Requisito: **Node.js 22 ou mais recente**. No terminal desta pasta:

```sh
npm start
```

Abra **http://127.0.0.1:3000**. Não precisa executar `npm install`: são usados apenas recursos nativos. Deixe o terminal aberto durante o uso. Para parar, pressione `Ctrl+C`. Execute `npm start` novamente quando quiser voltar. Não abra `index.html` diretamente: a interface precisa conversar com o servidor.

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
| `server/repository.js` | Persistência isolada; ponto de troca pelo futuro banco |
| `tests/` | Testes de cálculos e integração com a API |

O caminho de um cadastro: formulário → `app.js` → `api.js` → rota HTTP → validação → repositório → resposta JSON → atualização da tela.

`app.js` tem quatro blocos comentados: estado, renderização, alterações e eventos. Textos do usuário passam por escape antes de entrar no HTML. A validação ocorre no formulário e no servidor.

## Dados e limites

O armazenamento inicial é **um arquivo JSON no servidor**, não um banco definitivo. `data/finance.json` é criado no primeiro salvamento. A escrita usa arquivo temporário e substituição; `data/finance.json.previous` guarda a versão imediatamente anterior. Essa proteção adicional **não substitui backups periódicos**. Não usamos `localStorage` para os dados financeiros.

Somente **um processo Node** deve escrever nessa pasta. Não serve para múltiplas instâncias concorrentes, disco efêmero de funções serverless ou uso multiusuário. Não há conexão bancária, recorrências, parcelamentos, contas separadas, autenticação ou criptografia do arquivo. Esta versão é para uso pessoal local.

Não edite o JSON enquanto o servidor estiver aberto: ele mantém o estado em memória. Se o arquivo estiver inválido na inicialização, o servidor falha sem apagar seus dados. Guarde uma cópia do arquivo problemático antes de recuperá-lo de um backup.

## Hospedagem e banco serão escolhidos depois

Nenhuma integração com Vercel, Supabase, Render ou outro provedor foi adicionada. O frontend é estático e a API usa HTTP/JSON. `PORT`, `HOST` e `DATA_DIR` são variáveis de ambiente opcionais; o Node não carrega `.env` automaticamente.

Antes de publicar:

- Adicione autenticação, autorização e HTTPS para proteger os dados financeiros.
- Substitua `server/repository.js` por um adaptador do banco escolhido e migre pelo backup JSON, ou use servidor único com disco persistente.
- Para separar domínios, ajuste `API_URL` em `public/api.js`, `connect-src`, CORS e a validação de origem para uma lista explícita de domínios. Hoje frontend e API compartilham endereço.
- O servidor inicia em `127.0.0.1`. `HOST=0.0.0.0` abre acesso de rede e só deve ser configurado após proteger a aplicação.

Portabilidade significa separar responsabilidades: um host de funções exige adaptar a entrada HTTP e usar armazenamento externo. Nada foi publicado e nenhum serviço foi criado.

## API

`amount` é inteiro em **centavos**; datas são `YYYY-MM-DD`; meses, `YYYY-MM`. O estado tem `version`, `transactions`, `categories` e `budgets`.

| Método e rota | Função |
| --- | --- |
| `GET /api/state` | Ler dados |
| `POST /api/transactions` | Criar lançamento |
| `PUT /api/transactions/:id` | Editar lançamento |
| `DELETE /api/transactions/:id` | Excluir (corpo JSON `{}`) |
| `PUT /api/budgets` | Criar/atualizar limite por mês e categoria |
| `DELETE /api/budgets` | Remover limite |
| `POST /api/categories` | Adicionar categoria |
| `GET /api/backup` | Exportar estado |
| `POST /api/restore` | Validar e substituir estado |

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
