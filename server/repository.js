import { emptyState, validateBackup, requireValue } from './domain.js';

// Sem cache financeiro: cada leitura consulta o estado persistido do usuário.
export function createRepository({ url, secretKey, fetchImpl = fetch }) {
  const endpoint = `${url}/rest/v1/nexora_state`;
  const headers = { apikey: secretKey, 'Content-Type': 'application/json' };
  function checkUser(userId) {
    requireValue(typeof userId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId), 'Usuário inválido.');
  }
  async function call(query, options = {}) {
    let response;
    try {
      response = await fetchImpl(endpoint + '?' + query, {
        ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(15000)
      });
    } catch { throw Object.assign(new Error('Banco temporariamente indisponível. Tente novamente.'), { status: 503 }); }
    if (!response.ok) throw Object.assign(new Error('Não foi possível acessar seus dados. Verifique a configuração do banco.'), { status: 503 });
    return response.status === 204 ? null : response.json();
  }
  async function load(userId) {
    checkUser(userId);
    const query = new URLSearchParams({ user_id: 'eq.' + userId, select: 'data,updated_at' });
    let rows = await call(query);
    if (!Array.isArray(rows)) throw new Error('Resposta inválida do banco.');
    if (!rows.length) {
      // Dois primeiros acessos não podem sobrescrever um registro já criado.
      await call('on_conflict=user_id', {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({ user_id: userId, data: validateBackup(emptyState()), updated_at: new Date().toISOString() })
      });
      rows = await call(query);
    }
    if (rows.length !== 1 || !Number.isFinite(Date.parse(rows[0].updated_at))) throw new Error('Estrutura de nexora_state incompatível.');
    return { data: validateBackup(rows[0].data), version: rows[0].updated_at };
  }
  async function readState(userId) { return (await load(userId)).data; }
  async function saveState(userId, next, expectedVersion) {
    checkUser(userId);
    const validated = validateBackup(next);
    const version = expectedVersion ?? (await load(userId)).version;
    // Atualização condicional evita perda de gravações entre instâncias/abas.
    const updatedAt = new Date(Math.max(Date.now(), Date.parse(version) + 1)).toISOString();
    const query = new URLSearchParams({ user_id: 'eq.' + userId, updated_at: 'eq.' + version, select: 'data' });
    const rows = await call(query, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ data: validated, updated_at: updatedAt })
    });
    if (!Array.isArray(rows) || !rows.length) throw Object.assign(new Error('Os dados mudaram durante o salvamento. Tente novamente.'), { status: 409 });
    return validateBackup(rows[0].data);
  }
  async function updateState(userId, change) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await load(userId);
      const next = change(current.data);
      try { return await saveState(userId, next, current.version); }
      catch (error) { if (error.status !== 409 || attempt === 4) throw error; }
    }
  }
  return { readState, saveState, updateState };
}
