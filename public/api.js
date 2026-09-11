import { getAccessToken } from './auth.js';

// Toda comunicação com o backend fica aqui.
// Depois, quando o frontend estiver na Vercel, trocaremos esta URL pela API do Render.
const API_URL = '/api';

export async function request(path = '/state', method = 'GET', data) {
  const token = getAccessToken();

  const headers = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (data !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(API_URL + path, {
    method,
    headers,
    body: data === undefined ? undefined : JSON.stringify(data)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error || 'Não foi possível concluir a operação.'
    );
  }

  return result;
}