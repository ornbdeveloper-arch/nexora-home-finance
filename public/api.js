import { getAccessToken, getSessionVersion, assertSession, refreshSession, logout } from './auth.js';

const API_URL = '/api';
export async function request(path = '/state', method = 'GET', data) {
  const version = getSessionVersion();
  async function send() {
    assertSession(version);
    const token = getAccessToken();
    if (!token) {
      logout();
      throw Object.assign(new Error('Entre para acessar suas finanças.'), { status: 401 });
    }
    const response = await fetch(API_URL + path, {
      method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(data === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
    assertSession(version);
    return { response, token };
  }

  let { response, token } = await send();
  if (response.status === 401) {
    if (getAccessToken() === token) await refreshSession();
    assertSession(version);
    ({ response } = await send());
  }
  if (response.status === 401) {
    logout();
    throw Object.assign(new Error('Sessão expirada. Entre novamente.'), { status: 401 });
  }

  let result;
  try { result = await response.json(); }
  catch { throw new Error('Resposta inválida do servidor. Tente novamente.'); }
  assertSession(version);
  if (!response.ok) {
    throw Object.assign(new Error(result.error || 'Não foi possível concluir a operação.'), { status: response.status });
  }
  return result;
}
