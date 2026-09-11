import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readState, saveState } from './repository.js';
import { requireValue, validateTransaction, validateBudget, validateBackup } from './domain.js';

const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const assets = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/styles.css': ['styles.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'], '/api.js': ['api.js', 'text/javascript'], '/finance.js': ['finance.js', 'text/javascript'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
function json(response, status, value) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); }
async function body(request) {
  requireValue(request.headers['content-type']?.split(';')[0] === 'application/json', 'Envie JSON.');
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; requireValue(size <= 15 * 1024 * 1024, 'Arquivo muito grande (máximo 15 MB).'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { requireValue(false, 'JSON inválido.'); }
}
const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    const url = new URL(request.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) {
      const asset = assets[url.pathname];
      if (!asset || !['GET', 'HEAD'].includes(request.method)) return json(response, 404, { error: 'Página não encontrada.' });
      const content = await readFile(publicDirectory + asset[0]);
      response.writeHead(200, { 'Content-Type': asset[1] + '; charset=utf-8', 'Cache-Control': 'no-cache' });
      return response.end(request.method === 'HEAD' ? undefined : content);
    }
    if (request.method === 'GET' && url.pathname === '/api/state') return json(response, 200, readState());
    if (request.method === 'GET' && url.pathname === '/api/backup') {
      response.setHeader('Content-Disposition', 'attachment; filename="nexora-backup.json"');
      return json(response, 200, readState());
    }
    // Bloqueia escrita originada de outros sites. Autenticação deverá ser adicionada antes de publicar.
    if (request.headers.origin) requireValue(request.headers.origin === `http://${request.headers.host}` || request.headers.origin === `https://${request.headers.host}`, 'Origem não permitida.');
    requireValue(request.headers['sec-fetch-site'] !== 'cross-site', 'Origem não permitida.');
    const value = await body(request);
    const state = readState();
    const transactionId = url.pathname.match(/^\/api\/transactions\/([a-zA-Z0-9-]+)$/)?.[1];
    if (url.pathname === '/api/transactions' && request.method === 'POST') {
      state.transactions.push({ id: randomUUID(), ...validateTransaction(value, state.categories) });
    } else if (transactionId && ['PUT', 'DELETE'].includes(request.method)) {
      const index = state.transactions.findIndex(t => t.id === transactionId);
      requireValue(index !== -1, 'Lançamento não encontrado.');
      if (request.method === 'DELETE') state.transactions.splice(index, 1);
      else state.transactions[index] = { id: transactionId, ...validateTransaction(value, state.categories) };
    } else if (url.pathname === '/api/budgets' && request.method === 'PUT') {
      const budget = validateBudget(value, state.categories);
      state.budgets = state.budgets.filter(b => b.month !== budget.month || b.category !== budget.category);
      state.budgets.push(budget);
    } else if (url.pathname === '/api/budgets' && request.method === 'DELETE') {
      state.budgets = state.budgets.filter(b => b.month !== value.month || b.category !== value.category);
    } else if (url.pathname === '/api/categories' && request.method === 'POST') {
      requireValue(typeof value.name === 'string' && value.name.trim().length > 0 && value.name.trim().length <= 40, 'Nome inválido.');
      requireValue(!state.categories.some(c => c.name.toLowerCase() === value.name.trim().toLowerCase()), 'Essa categoria já existe.');
      requireValue(/^#[a-fA-F0-9]{6}$/.test(value.color), 'Cor inválida.');
      state.categories.push({ id: randomUUID(), name: value.name.trim(), color: value.color });
    } else if (url.pathname === '/api/restore' && request.method === 'POST') {
      return json(response, 200, saveState(validateBackup(value)));
    } else return json(response, 404, { error: 'Operação não encontrada.' });
    json(response, 200, saveState(state));
  } catch (error) {
    if (!error.status) console.error(error);
    json(response, error.status || 500, { error: error.status ? error.message : 'Não foi possível concluir. Verifique o servidor e tente novamente.' });
  }
});
server.listen(port, host, () => console.log(`Nexora: http://${host}:${server.address().port}`));
