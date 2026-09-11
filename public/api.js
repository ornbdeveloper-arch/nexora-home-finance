// Toda comunicação com o backend fica aqui. Use uma URL de API própria se separar os hosts.
const API_URL = '/api';
export async function request(path = '/state', method = 'GET', data) {
  const response = await fetch(API_URL + path, {
    method,
    headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a operação.');
  return result;
}
