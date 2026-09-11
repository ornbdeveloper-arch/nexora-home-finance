import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { readState, saveState } from './repository.js';
import {
  requireValue,
  validateTransaction,
  validateBudget,
  validateBackup
} from './domain.js';

const publicDirectory = fileURLToPath(
  new URL('../public/', import.meta.url)
);

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';

const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const allowedUserId = process.env.NEXORA_ALLOWED_USER_ID;
const frontendOrigin = process.env.FRONTEND_ORIGIN;

requireValue(
  supabaseUrl,
  'SUPABASE_URL não configurada.'
);

requireValue(
  supabasePublishableKey,
  'SUPABASE_PUBLISHABLE_KEY não configurada.'
);

requireValue(
  allowedUserId,
  'NEXORA_ALLOWED_USER_ID não configurado.'
);

requireValue(
  frontendOrigin,
  'FRONTEND_ORIGIN não configurada.'
);

async function requireAuthenticatedUser(request) {
  const authorization = request.headers.authorization;

  requireValue(
    typeof authorization === 'string' &&
      authorization.startsWith('Bearer '),
    'Autenticação necessária.'
  );

  const token = authorization
    .slice('Bearer '.length)
    .trim();

  requireValue(
    token.length > 0,
    'Autenticação necessária.'
  );

  const authResponse = await fetch(
    `${supabaseUrl}/auth/v1/user`,
    {
      headers: {
        apikey: supabasePublishableKey,
        Authorization: `Bearer ${token}`
      }
    }
  );

  requireValue(
    authResponse.ok,
    'Sessão inválida ou expirada.'
  );

  const user = await authResponse.json();

  requireValue(
    user.id === allowedUserId,
    'Usuário não autorizado.'
  );

  return user;
}

const assets = {
  '/': ['index.html', 'text/html'],
  '/index.html': ['index.html', 'text/html'],
  '/styles.css': ['styles.css', 'text/css'],
  '/app.js': ['app.js', 'text/javascript'],
  '/api.js': ['api.js', 'text/javascript'],
  '/auth.js': ['auth.js', 'text/javascript'],
  '/finance.js': ['finance.js', 'text/javascript'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml']
};

function json(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });

  response.end(JSON.stringify(value));
}

async function body(request) {
  requireValue(
    request.headers['content-type']
      ?.split(';')[0] === 'application/json',
    'Envie JSON.'
  );

  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;

    requireValue(
      size <= 15 * 1024 * 1024,
      'Arquivo muito grande (máximo 15 MB).'
    );

    chunks.push(chunk);
  }

  try {
    return JSON.parse(
      Buffer.concat(chunks).toString('utf8')
    );
  } catch {
    requireValue(false, 'JSON inválido.');
  }
}

const server = createServer(
  async (request, response) => {
    response.setHeader(
      'X-Content-Type-Options',
      'nosniff'
    );

    response.setHeader(
      'Referrer-Policy',
      'no-referrer'
    );

    /*
     * CORS.
     *
     * Só a origem configurada em FRONTEND_ORIGIN
     * poderá acessar a API pelo navegador.
     */
    response.setHeader(
      'Access-Control-Allow-Origin',
      frontendOrigin
    );

    response.setHeader(
      'Vary',
      'Origin'
    );

    response.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type'
    );

    response.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS'
    );

    /*
     * Esta CSP vale para os arquivos servidos pelo
     * próprio backend durante o desenvolvimento local.
     *
     * Quando o frontend estiver na Vercel, teremos
     * uma CSP própria lá.
     */
    response.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "connect-src 'self' https://*.supabase.co",
        "frame-ancestors 'none'",
        "base-uri 'none'",
        "form-action 'self'"
      ].join('; ')
    );

    try {
      const url = new URL(
        request.url,
        'http://localhost'
      );

      /*
       * Preflight CORS.
       */
      if (request.method === 'OPTIONS') {
        if (request.headers.origin) {
          requireValue(
            request.headers.origin === frontendOrigin,
            'Origem não permitida.'
          );
        }

        response.writeHead(204);
        return response.end();
      }

      /*
       * Arquivos públicos.
       */
      if (!url.pathname.startsWith('/api/')) {
        const asset = assets[url.pathname];

        if (
          !asset ||
          !['GET', 'HEAD'].includes(request.method)
        ) {
          return json(
            response,
            404,
            {
              error: 'Página não encontrada.'
            }
          );
        }

        const content = await readFile(
          publicDirectory + asset[0]
        );

        response.writeHead(200, {
          'Content-Type':
            asset[1] + '; charset=utf-8',
          'Cache-Control': 'no-cache'
        });

        return response.end(
          request.method === 'HEAD'
            ? undefined
            : content
        );
      }

      /*
       * Todas as rotas /api/*
       * exigem usuário autenticado.
       */
      await requireAuthenticatedUser(request);

      /*
       * A origem também precisa ser exatamente
       * a que configuramos.
       */
      if (request.headers.origin) {
        requireValue(
          request.headers.origin === frontendOrigin,
          'Origem não permitida.'
        );
      }

      /*
       * GET /api/state
       */
      if (
        request.method === 'GET' &&
        url.pathname === '/api/state'
      ) {
        return json(
          response,
          200,
          readState()
        );
      }

      /*
       * GET /api/backup
       */
      if (
        request.method === 'GET' &&
        url.pathname === '/api/backup'
      ) {
        response.setHeader(
          'Content-Disposition',
          'attachment; filename="nexora-backup.json"'
        );

        return json(
          response,
          200,
          readState()
        );
      }

      /*
       * Daqui em diante são operações
       * que recebem JSON.
       */
      const value = await body(request);
      const state = readState();

      const transactionId =
        url.pathname.match(
          /^\/api\/transactions\/([a-zA-Z0-9-]+)$/
        )?.[1];

      /*
       * Criar lançamento.
       */
      if (
        url.pathname === '/api/transactions' &&
        request.method === 'POST'
      ) {
        state.transactions.push({
          id: randomUUID(),
          ...validateTransaction(
            value,
            state.categories
          )
        });
      }

      /*
       * Editar ou excluir lançamento.
       */
      else if (
        transactionId &&
        ['PUT', 'DELETE'].includes(
          request.method
        )
      ) {
        const index =
          state.transactions.findIndex(
            transaction =>
              transaction.id === transactionId
          );

        requireValue(
          index !== -1,
          'Lançamento não encontrado.'
        );

        if (request.method === 'DELETE') {
          state.transactions.splice(index, 1);
        } else {
          state.transactions[index] = {
            id: transactionId,
            ...validateTransaction(
              value,
              state.categories
            )
          };
        }
      }

      /*
       * Criar ou atualizar orçamento.
       */
      else if (
        url.pathname === '/api/budgets' &&
        request.method === 'PUT'
      ) {
        const budget = validateBudget(
          value,
          state.categories
        );

        state.budgets =
          state.budgets.filter(
            item =>
              item.month !== budget.month ||
              item.category !== budget.category
          );

        state.budgets.push(budget);
      }

      /*
       * Excluir orçamento.
       */
      else if (
        url.pathname === '/api/budgets' &&
        request.method === 'DELETE'
      ) {
        state.budgets =
          state.budgets.filter(
            item =>
              item.month !== value.month ||
              item.category !== value.category
          );
      }

      /*
       * Criar categoria.
       */
      else if (
        url.pathname === '/api/categories' &&
        request.method === 'POST'
      ) {
        requireValue(
          typeof value.name === 'string' &&
            value.name.trim().length > 0 &&
            value.name.trim().length <= 40,
          'Nome inválido.'
        );

        requireValue(
          !state.categories.some(
            category =>
              category.name.toLowerCase() ===
              value.name
                .trim()
                .toLowerCase()
          ),
          'Essa categoria já existe.'
        );

        requireValue(
          /^#[a-fA-F0-9]{6}$/.test(
            value.color
          ),
          'Cor inválida.'
        );

        state.categories.push({
          id: randomUUID(),
          name: value.name.trim(),
          color: value.color
        });
      }

      /*
       * Restaurar backup.
       */
      else if (
        url.pathname === '/api/restore' &&
        request.method === 'POST'
      ) {
        return json(
          response,
          200,
          await saveState(
            validateBackup(value)
          )
        );
      }

      /*
       * Qualquer operação não reconhecida.
       */
      else {
        return json(
          response,
          404,
          {
            error: 'Operação não encontrada.'
          }
        );
      }

      /*
       * Salva o novo estado no Supabase.
       */
      return json(
        response,
        200,
        await saveState(state)
      );
    } catch (error) {
      if (!error.status) {
        console.error(error);
      }

      return json(
        response,
        error.status || 500,
        {
          error: error.status
            ? error.message
            : 'Não foi possível concluir. Verifique o servidor e tente novamente.'
        }
      );
    }
  }
);

server.listen(
  port,
  host,
  () => {
    console.log(
      `Nexora: http://${host}:${server.address().port}`
    );
  }
);