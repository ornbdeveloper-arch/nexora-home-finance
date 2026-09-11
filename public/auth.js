const ACCESS = 'nexora_access_token';
const REFRESH = 'nexora_refresh_token';
const USER = 'nexora_user_id';
let generation = 0;
let refreshPending = null;
let config = null;

export const getAccessToken = () => localStorage.getItem(ACCESS);
export const getUserId = () => localStorage.getItem(USER);
export const isAuthenticated = () => Boolean(getAccessToken() && getUserId());
export const getSessionVersion = () => `${generation}:${getUserId() || ''}`;
export function assertSession(version) {
  if (version !== getSessionVersion()) throw Object.assign(new Error('A sessão foi alterada.'), { stale: true });
}
async function getConfig() {
  if (!config) {
    const response = await fetch('/auth-config', { cache: 'no-store' });
    if (!response.ok) throw new Error('Não foi possível carregar a configuração de login.');
    config = await response.json();
  }
  return config;
}
async function tokenRequest(grant, body) {
  const { supabaseUrl, publishableKey } = await getConfig();
  let response;
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=${grant}`, {
      method: 'POST', headers: { apikey: publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000)
    });
  } catch { throw new Error('Não foi possível conectar ao login. Tente novamente.'); }
  let result;
  try { result = await response.json(); } catch { throw new Error('Resposta inválida do serviço de login.'); }
  if (!response.ok) throw new Error(grant === 'password' ? 'Não foi possível entrar. Confira e-mail e senha.' : 'Sessão expirada. Entre novamente.');
  if (!result.access_token || !result.refresh_token || !result.user?.id) throw new Error('Sessão recebida incompleta.');
  return result;
}
function saveSession(session) {
  try {
    localStorage.setItem(ACCESS, session.access_token);
    localStorage.setItem(REFRESH, session.refresh_token);
    localStorage.setItem(USER, session.user.id);
  } catch { logout(); throw new Error('Permita o armazenamento deste site para entrar.'); }
}
export function logout() {
  generation++;
  refreshPending = null;
  localStorage.removeItem(USER);
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
  window.dispatchEvent(new Event('nexora:logout'));
}
export async function login(email, password) {
  const version = getSessionVersion();
  const result = await tokenRequest('password', { email: String(email).trim(), password });
  assertSession(version);
  generation++;
  saveSession(result);
  return result.user;
}
export function refreshSession() {
  if (refreshPending) return refreshPending;
  const version = getSessionVersion();
  const refreshToken = localStorage.getItem(REFRESH);
  const userId = getUserId();
  const pending = (async () => {
    try {
      if (!refreshToken || !userId) throw new Error('Sessão inexistente.');
      const result = await tokenRequest('refresh_token', { refresh_token: refreshToken });
      assertSession(version);
      if (result.user.id !== userId) throw new Error('Usuário da sessão inválido.');
      saveSession(result);
      return result;
    } catch (error) {
      if (version === getSessionVersion()) logout();
      throw error;
    }
  })();
  refreshPending = pending;
  pending.finally(() => { if (refreshPending === pending) refreshPending = null; }).catch(() => {});
  return pending;
}
window.addEventListener('storage', event => {
  if (event.key === USER || event.key === null) {
    generation++;
    refreshPending = null;
    window.dispatchEvent(new Event('nexora:session-change'));
  }
});
