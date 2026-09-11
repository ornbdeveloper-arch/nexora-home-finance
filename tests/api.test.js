import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const ids = {
  a: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  b: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
};

async function mockSupabase() {
  const rows = new Map();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const reply = (status, value) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(value === undefined ? undefined : JSON.stringify(value));
    };
    if (url.pathname === '/auth/v1/user') {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (token === 'token-a') return reply(200, { id: ids.a, email: 'ana@example.com', user_metadata: { full_name: 'Ana Silva', internal_role: 'admin' } });
      if (token === 'token-b') return reply(200, { id: ids.b, email: 'bruno@example.com', user_metadata: {} });
      return reply(401, { error: 'invalid token' });
    }
    if (url.pathname !== '/rest/v1/nexora_state' || request.headers.apikey !== 'sb_secret_test') return reply(403, {});
    const userFilter = url.searchParams.get('user_id');
    const userId = userFilter?.replace('eq.', '');
    if (request.method === 'GET') {
      const row = rows.get(userId);
      return reply(200, row ? [{ data: structuredClone(row.data), updated_at: row.updated_at }] : []);
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (request.method === 'POST') {
      if (!rows.has(body.user_id)) rows.set(body.user_id, structuredClone(body));
      response.writeHead(204); return response.end();
    }
    if (request.method === 'PATCH') {
      const expected = url.searchParams.get('updated_at')?.replace('eq.', '');
      const row = rows.get(userId);
      if (!row || row.updated_at !== expected) return reply(200, []);
      rows.set(userId, { user_id: userId, data: structuredClone(body.data), updated_at: body.updated_at });
      return reply(200, [{ data: structuredClone(body.data) }]);
    }
    return reply(405, {});
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, rows, url: 'http://127.0.0.1:' + server.address().port };
}

async function startApp(supabaseUrl) {
  const child = spawn(process.execPath, ['server/server.js'], {
    env: {
      ...process.env,
      PORT: '0',
      SUPABASE_URL: supabaseUrl,
      SUPABASE_SECRET_KEY: 'sb_secret_test',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const output = await new Promise((resolve, reject) => {
    child.stdout.once('data', chunk => resolve(chunk.toString()));
    child.once('error', reject);
    child.once('exit', code => reject(new Error('Servidor saiu: ' + code)));
  });
  return { child, url: output.match(/http:\/\/[^\s]+/)[0] };
}

test('API exige autenticação e isola todo o CRUD por usuário', async () => {
  const supabase = await mockSupabase();
  const app = await startApp(supabase.url);
  const closeApp = async () => {
    if (app.child.exitCode !== null) return;
    const closed = once(app.child, 'exit');
    app.child.kill();
    await closed;
  };
  try {
    const api = async (path, token, method = 'GET', body, headers = {}) => {
      const response = await fetch(app.url + '/api' + path, {
        method,
        headers: {
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...headers
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      return { status: response.status, data: await response.json() };
    };
    assert.equal((await api('/state')).status, 401);
    assert.equal((await api('/state', 'expired')).status, 401);
    assert.equal((await api('/transactions', undefined, 'POST', {})).status, 401);
    assert.deepEqual((await api('/me', 'token-a')).data, { id: ids.a, name: 'Ana Silva', email: 'ana@example.com' });
    assert.deepEqual((await api('/me', 'token-b')).data, { id: ids.b, name: 'bruno@example.com', email: 'bruno@example.com' });

    let a = (await api('/state', 'token-a')).data;
    let b = (await api('/state', 'token-b')).data;
    assert.equal(a.transactions.length, 0);
    assert.equal(b.transactions.length, 0);
    assert.equal(a.categories.length, 9);
    const transaction = {
      description: 'Teste usuário A', amount: 1250, type: 'expense',
      status: 'pending', date: '2026-09-11', category: 'alimentacao', notes: ''
    };
    a = (await api('/transactions', 'token-a', 'POST', transaction)).data;
    assert.equal(a.transactions[0].description, 'Teste usuário A');
    assert.equal((await api('/state', 'token-b')).data.transactions.length, 0);

    b = (await api('/transactions', 'token-b', 'POST', { ...transaction, description: 'Teste usuário B' })).data;
    assert.equal(b.transactions[0].description, 'Teste usuário B');
    assert.deepEqual((await api('/state', 'token-a')).data.transactions.map(item => item.description), ['Teste usuário A']);

    const aId = a.transactions[0].id;
    a = (await api('/transactions/' + aId, 'token-a', 'PUT', { ...transaction, amount: 1500, status: 'paid' })).data;
    assert.equal(a.transactions[0].amount, 1500);
    assert.equal(a.transactions[0].status, 'paid');
    a = (await api('/budgets', 'token-a', 'PUT', { month: '2026-09', category: 'alimentacao', amount: 50000 })).data;
    assert.equal(a.budgets.length, 1);
    a = (await api('/budgets', 'token-a', 'PUT', { month: '2026-09', category: 'alimentacao', amount: 60000 })).data;
    assert.equal(a.budgets[0].amount, 60000);
    a = (await api('/budgets', 'token-a', 'DELETE', { month: '2026-09', category: 'alimentacao' })).data;
    assert.equal(a.budgets.length, 0);
    a = (await api('/categories', 'token-a', 'POST', { name: 'Pets', color: '#112233' })).data;
    assert.equal(a.categories.at(-1).name, 'Pets');

    const backup = (await api('/backup', 'token-a')).data;
    a = (await api('/transactions/' + aId, 'token-a', 'DELETE', {})).data;
    assert.equal(a.transactions.length, 0);
    a = (await api('/restore', 'token-a', 'POST', backup)).data;
    assert.equal(a.transactions[0].description, 'Teste usuário A');
    assert.equal((await api('/state', 'token-b')).data.transactions[0].description, 'Teste usuário B');

    assert.equal((await api('/state?user_id=eq.' + ids.b, 'token-a')).status, 400);
    assert.equal((await api('/transactions', 'token-a', 'POST', { ...transaction, user_id: ids.b })).status, 400);
    assert.equal((await api('/transactions/' + b.transactions[0].id, 'token-a', 'DELETE', {})).status, 404);

    const concurrent = await Promise.all([
      api('/transactions', 'token-a', 'POST', { ...transaction, description: 'Concorrente 1' }),
      api('/transactions', 'token-a', 'POST', { ...transaction, description: 'Concorrente 2' })
    ]);
    assert.deepEqual(concurrent.map(result => result.status), [200, 200]);
    const names = (await api('/state', 'token-a')).data.transactions.map(item => item.description);
    assert(names.includes('Concorrente 1') && names.includes('Concorrente 2'));

    const config = await (await fetch(app.url + '/auth-config')).json();
    assert.deepEqual(config, { supabaseUrl: supabase.url, publishableKey: 'sb_publishable_test' });
    assert.equal(JSON.stringify(config).includes('sb_secret'), false);
    assert.match((await fetch(app.url + '/auth.js')).headers.get('content-type'), /^text\/javascript/);
    assert.equal((await fetch(app.url + '/auth.js')).status, 200);
  } finally {
    await closeApp();
    supabase.server.close();
    await once(supabase.server, 'close');
  }
});
