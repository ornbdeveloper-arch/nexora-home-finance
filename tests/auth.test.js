import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test('login, refresh único, repetição da API e logout limpam a sessão', async () => {
  globalThis.localStorage = new MemoryStorage();
  globalThis.window = new EventTarget();
  let apiCalls = 0;
  let refreshCalls = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (url === '/auth-config') return Response.json({ supabaseUrl: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' });
    if (String(url).includes('grant_type=password')) return Response.json({ access_token: 'expired', refresh_token: 'refresh-1', user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } });
    if (String(url).includes('grant_type=refresh_token')) {
      refreshCalls++;
      return Response.json({ access_token: 'fresh', refresh_token: 'refresh-2', user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } });
    }
    if (url === '/api/state') {
      apiCalls++;
      assert.match(options.headers.Authorization, /^Bearer /);
      if (options.headers.Authorization === 'Bearer expired') return Response.json({ error: 'expirado' }, { status: 401 });
      return Response.json({ version: 1, transactions: [], budgets: [], categories: [] });
    }
    throw new Error('URL inesperada: ' + url);
  };
  const auth = await import('../public/auth.js');
  const { request } = await import('../public/api.js');
  await auth.login('pessoa@example.com', 'senha-nao-armazenada');
  const state = await request();
  assert.equal(state.version, 1);
  assert.equal(apiCalls, 2);
  assert.equal(refreshCalls, 1);
  assert.equal(auth.getAccessToken(), 'fresh');
  assert.equal([...localStorage.values.values()].includes('senha-nao-armazenada'), false);
  auth.logout();
  assert.equal(auth.getAccessToken(), null);
  assert.equal(auth.getUserId(), null);
  assert.equal(localStorage.getItem('nexora_refresh_token'), null);
});
