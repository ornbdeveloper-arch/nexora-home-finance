const SUPABASE_URL = 'https://blrmgwssvzmbrjyrkeww.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_J6M8d5eImEf6foju0YsN5w_AggbLKfc';

const ACCESS_TOKEN_KEY = 'nexora_access_token';
const REFRESH_TOKEN_KEY = 'nexora_refresh_token';

function authHeaders() {
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    'Content-Type': 'application/json'
  };
}

function saveSession(session) {
  localStorage.setItem(ACCESS_TOKEN_KEY, session.access_token);
  localStorage.setItem(REFRESH_TOKEN_KEY, session.refresh_token);
}

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function isAuthenticated() {
  return Boolean(getAccessToken());
}

export async function login(email, password) {
  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        email,
        password
      })
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error('E-mail ou senha inválidos.');
  }

  saveSession(result);

  return result.user;
}

export async function refreshSession() {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

  if (!refreshToken) {
    throw new Error('Sessão inexistente.');
  }

  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        refresh_token: refreshToken
      })
    }
  );

  const result = await response.json();

  if (!response.ok) {
    logout();
    throw new Error('Sessão expirada.');
  }

  saveSession(result);

  return result;
}

export function logout() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}