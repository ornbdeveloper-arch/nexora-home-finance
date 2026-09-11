import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createRepository } from './repository.js';
import { requireValue, validateTransaction, validateBudget, validateInstallment, validateRecurringExpense, validateGoal, validateBackup } from './domain.js';

const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const frontendOrigin = process.env.FRONTEND_ORIGIN;
if (!supabaseUrl || !secretKey || !publishableKey) throw new Error('Configure SUPABASE_URL, SUPABASE_SECRET_KEY e SUPABASE_PUBLISHABLE_KEY no ambiente.');
if (!publishableKey.startsWith('sb_publishable_')) throw new Error('SUPABASE_PUBLISHABLE_KEY deve ser uma publishable key, nunca uma secret key.');
if (!secretKey.startsWith('sb_secret_')) throw new Error('SUPABASE_SECRET_KEY deve ser uma secret key do backend.');
const supabaseOrigin = new URL(supabaseUrl).origin;
if (supabaseUrl !== supabaseOrigin || !/^https?:\/\//.test(supabaseUrl)) throw new Error('SUPABASE_URL deve ser uma origem HTTP(S) válida.');
if (frontendOrigin && new URL(frontendOrigin).origin !== frontendOrigin) throw new Error('FRONTEND_ORIGIN deve conter somente a origem, sem barra final.');
const repository = createRepository({ url: supabaseUrl, secretKey });

const fail = (status, message) => Object.assign(new Error(message), { status });
async function requireAuthenticatedUser(request) {
  const match = request.headers.authorization?.match(/^Bearer\s+(\S+)$/i);
  if (!match) throw fail(401, 'Autenticação necessária.');
  let response;
  try {
    response = await fetch(supabaseUrl + '/auth/v1/user', {
      headers: { apikey: publishableKey, Authorization: 'Bearer ' + match[1] },
      signal: AbortSignal.timeout(10000)
    });
  } catch { throw fail(503, 'Autenticação temporariamente indisponível.'); }
  if ([401, 403].includes(response.status)) throw fail(401, 'Sessão inválida ou expirada.');
  if (!response.ok) throw fail(503, 'Não foi possível validar a sessão.');
  const user = await response.json();
  if (typeof user.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)) throw fail(401, 'Usuário inválido.');
  return user;
}
function publicUser(user) {
  const metadata = user.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata : {};
  const name = [metadata.full_name, metadata.name, metadata.display_name]
    .find(value => typeof value === 'string' && value.trim())?.trim().slice(0, 80);
  const email = typeof user.email === 'string' ? user.email.trim().slice(0, 254) : '';
  return { id: user.id, name: name || email || 'Usuário Nexora', email, isAdmin: user.app_metadata?.role === 'admin' };
}
function requireAdmin(user) { if (user.app_metadata?.role !== 'admin') throw fail(403, 'Acesso exclusivo do administrador.'); }
async function adminCall(path, options = {}) {
  let response;
  try {
    response = await fetch(supabaseUrl + '/auth/v1/admin' + path, {
      ...options,
      headers: { apikey: secretKey, Authorization: 'Bearer ' + secretKey, 'Content-Type': 'application/json', ...options.headers },
      signal: AbortSignal.timeout(15000)
    });
  } catch { throw fail(503, 'Administração de usuários temporariamente indisponível.'); }
  let result = {};
  try { result = await response.json(); } catch { /* respostas vazias são permitidas */ }
  if (!response.ok) throw fail(response.status === 422 ? 400 : response.status, result.msg || result.message || result.error || 'Não foi possível administrar o usuário.');
  return result;
}
const cleanAdminUser = user => ({ id: user.id, email: user.email || '', name: publicUser(user).name, createdAt: user.created_at || '', lastSignInAt: user.last_sign_in_at || '', isAdmin: user.app_metadata?.role === 'admin', blocked: Boolean(user.banned_until && Date.parse(user.banned_until) > Date.now()) });
const assets = {
  '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'],
  '/styles.css': ['styles.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'],
  '/api.js': ['api.js', 'text/javascript'], '/auth.js': ['auth.js', 'text/javascript'],
  '/finance.js': ['finance.js', 'text/javascript'], '/favicon.svg': ['favicon.svg', 'image/svg+xml']
};
function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}
async function body(request) {
  requireValue(request.headers['content-type']?.split(';')[0] === 'application/json', 'Envie JSON.');
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; requireValue(size <= 15 * 1024 * 1024, 'Arquivo muito grande (máximo 15 MB).'); chunks.push(chunk); }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail(400, 'JSON inválido.'); }
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 'Envie um objeto JSON.');
  requireValue(!Object.hasOwn(value, 'user_id') && !Object.hasOwn(value, 'userId'), 'O usuário é definido pela sessão, não pelo corpo da requisição.');
  return value;
}
const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' " + supabaseOrigin + "; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    const url = new URL(request.url, 'http://localhost');
    const allowedOrigin = frontendOrigin || 'http://' + request.headers.host;
    if (request.headers.origin) {
      if (request.headers.origin !== allowedOrigin) throw fail(403, 'Origem não permitida.');
      response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      response.setHeader('Vary', 'Origin');
    }
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      response.writeHead(204); return response.end();
    }
    // Somente os dois campos públicos são enviados ao navegador.
    if (url.pathname === '/auth-config' && request.method === 'GET') return json(response, 200, { supabaseUrl, publishableKey });
    if (!url.pathname.startsWith('/api/')) {
      const asset = assets[url.pathname];
      if (!asset || !['GET', 'HEAD'].includes(request.method)) return json(response, 404, { error: 'Página não encontrada.' });
      const content = await readFile(publicDirectory + asset[0]);
      response.writeHead(200, { 'Content-Type': asset[1] + '; charset=utf-8' });
      return response.end(request.method === 'HEAD' ? undefined : content);
    }
    const user = await requireAuthenticatedUser(request);
    requireValue(!url.searchParams.has('user_id') && !url.searchParams.has('userId'), 'O usuário é definido pela sessão.');
    if (request.method === 'GET' && url.pathname === '/api/me') return json(response, 200, publicUser(user));
    if (request.method === 'GET' && url.pathname === '/api/admin/users') {
      requireAdmin(user);
      const result = await adminCall('/users?page=1&per_page=1000');
      return json(response, 200, (result.users || []).map(cleanAdminUser));
    }
    if (request.method === 'GET' && ['/api/state', '/api/backup'].includes(url.pathname)) {
      if (url.pathname === '/api/backup') response.setHeader('Content-Disposition', 'attachment; filename="nexora-backup.json"');
      return json(response, 200, await repository.readState(user.id));
    }
    const value = await body(request);
    if (url.pathname === '/api/admin/users' && request.method === 'POST') {
      requireAdmin(user);
      requireValue(typeof value.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) && value.email.length <= 254, 'E-mail inválido.');
      requireValue(typeof value.name === 'string' && value.name.trim().length > 0 && value.name.trim().length <= 80, 'Nome inválido.');
      requireValue(typeof value.password === 'string' && value.password.length >= 8 && value.password.length <= 128, 'A senha temporária deve ter entre 8 e 128 caracteres.');
      const created = await adminCall('/users', { method: 'POST', body: JSON.stringify({ email: value.email.trim().toLowerCase(), password: value.password, email_confirm: true, user_metadata: { full_name: value.name.trim() } }) });
      return json(response, 201, cleanAdminUser(created));
    }
    const adminId = url.pathname.match(/^\/api\/admin\/users\/([0-9a-f-]{36})$/i)?.[1];
    if (adminId && request.method === 'PUT') {
      requireAdmin(user);
      requireValue(typeof value.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) && value.email.length <= 254, 'E-mail inválido.');
      requireValue(typeof value.name === 'string' && value.name.trim().length > 0 && value.name.trim().length <= 80, 'Nome inválido.');
      requireValue(value.password === '' || (typeof value.password === 'string' && value.password.length >= 8 && value.password.length <= 128), 'A nova senha deve ter entre 8 e 128 caracteres.');
      const fields = { email: value.email.trim().toLowerCase(), email_confirm: true, user_metadata: { full_name: value.name.trim() } };
      if (value.password) fields.password = value.password;
      const updated = await adminCall('/users/' + adminId, { method: 'PUT', body: JSON.stringify(fields) });
      return json(response, 200, cleanAdminUser(updated));
    }
    const adminAction = url.pathname.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/block$/i)?.[1];
    if (adminAction && request.method === 'POST') {
      requireAdmin(user); requireValue(adminAction !== user.id, 'Você não pode bloquear sua própria conta.'); requireValue(typeof value.blocked === 'boolean', 'Situação inválida.');
      const updated = await adminCall('/users/' + adminAction, { method: 'PUT', body: JSON.stringify({ ban_duration: value.blocked ? '876000h' : 'none' }) });
      return json(response, 200, cleanAdminUser(updated));
    }
    if (adminId && request.method === 'DELETE') {
      requireAdmin(user); requireValue(adminId !== user.id, 'Você não pode excluir sua própria conta.');
      await adminCall('/users/' + adminId, { method: 'DELETE' }); return json(response, 200, { deleted: true });
    }
    const id = url.pathname.match(/^\/api\/transactions\/([a-zA-Z0-9-]+)$/)?.[1];
    const installmentId = url.pathname.match(/^\/api\/installments\/([a-zA-Z0-9-]+)$/)?.[1];
    const categoryId = url.pathname.match(/^\/api\/categories\/([a-zA-Z0-9-]+)$/)?.[1];
    const recurringId = url.pathname.match(/^\/api\/recurring-expenses\/([a-zA-Z0-9-]+)$/)?.[1];
    const goalId = url.pathname.match(/^\/api\/goals\/([a-zA-Z0-9-]+)$/)?.[1];
    const newId = randomUUID();
    const saved = await repository.updateState(user.id, state => {
      if (url.pathname === '/api/transactions' && request.method === 'POST') {
        state.transactions.push({ id: newId, ...validateTransaction(value, state.categories) });
      } else if (id && ['PUT', 'DELETE'].includes(request.method)) {
        const index = state.transactions.findIndex(t => t.id === id);
        if (index === -1) throw fail(404, 'Lançamento não encontrado.');
        if (request.method === 'DELETE') state.transactions.splice(index, 1);
        else state.transactions[index] = { id, ...validateTransaction(value, state.categories) };
      } else if (url.pathname === '/api/budgets' && request.method === 'PUT') {
        const budget = validateBudget(value, state.categories);
        state.budgets = state.budgets.filter(b => b.month !== budget.month || b.category !== budget.category);
        state.budgets.push(budget);
      } else if (url.pathname === '/api/budgets' && request.method === 'DELETE') {
        requireValue(typeof value.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value.month) && state.categories.some(c => c.id === value.category), 'Orçamento inválido.');
        state.budgets = state.budgets.filter(b => b.month !== value.month || b.category !== value.category);
      } else if (url.pathname === '/api/categories' && request.method === 'POST') {
        requireValue(typeof value.name === 'string' && value.name.trim().length > 0 && value.name.trim().length <= 40, 'Nome inválido.');
        requireValue(!state.categories.some(c => c.name.toLowerCase() === value.name.trim().toLowerCase()), 'Essa categoria já existe.');
        requireValue(typeof value.color === 'string' && /^#[a-fA-F0-9]{6}$/.test(value.color), 'Cor inválida.');
        state.categories.push({ id: newId, name: value.name.trim(), color: value.color });
      } else if (categoryId && request.method === 'DELETE') {
        requireValue(categoryId !== 'outros', 'A categoria Outros é necessária e não pode ser removida.');
        requireValue(state.categories.some(category => category.id === categoryId), 'Categoria não encontrada.');
        state.transactions = state.transactions.map(item => item.category === categoryId ? { ...item, category: 'outros' } : item);
        state.installments = state.installments.map(item => item.category === categoryId ? { ...item, category: 'outros' } : item);
        state.recurringExpenses = state.recurringExpenses.map(item => item.category === categoryId ? { ...item, category: 'outros' } : item);
        state.budgets = state.budgets.filter(item => item.category !== categoryId);
        state.categories = state.categories.filter(category => category.id !== categoryId);
      } else if (url.pathname === '/api/installments' && request.method === 'POST') {
        state.installments.push({ id: newId, ...validateInstallment(value, state.categories) });
      } else if (installmentId && ['PUT', 'DELETE'].includes(request.method)) {
        const index = state.installments.findIndex(item => item.id === installmentId);
        if (index === -1) throw fail(404, 'Compra parcelada não encontrada.');
        if (request.method === 'DELETE') state.installments.splice(index, 1);
        else state.installments[index] = { id: installmentId, ...validateInstallment(value, state.categories) };
      } else if (url.pathname === '/api/recurring-expenses' && request.method === 'POST') {
        state.recurringExpenses.push({ id: newId, ...validateRecurringExpense(value, state.categories) });
      } else if (recurringId && ['PUT', 'DELETE'].includes(request.method)) {
        const index = state.recurringExpenses.findIndex(item => item.id === recurringId);
        if (index === -1) throw fail(404, 'Despesa recorrente não encontrada.');
        if (request.method === 'DELETE') state.recurringExpenses.splice(index, 1);
        else state.recurringExpenses[index] = { id: recurringId, ...validateRecurringExpense(value, state.categories) };
      } else if (url.pathname === '/api/goals' && request.method === 'POST') {
        state.goals.push({ id: newId, ...validateGoal(value) });
      } else if (goalId && ['PUT', 'DELETE'].includes(request.method)) {
        const index = state.goals.findIndex(item => item.id === goalId);
        if (index === -1) throw fail(404, 'Meta não encontrada.');
        if (request.method === 'DELETE') state.goals.splice(index, 1);
        else state.goals[index] = { id: goalId, ...validateGoal(value) };
      } else if (url.pathname === '/api/restore' && request.method === 'POST') return validateBackup(value);
      else throw fail(404, 'Operação não encontrada.');
      return state;
    });
    json(response, 200, saved);
  } catch (error) {
    if (!error.status) console.error('Falha interna ao processar requisição.');
    json(response, error.status || 500, { error: error.status ? error.message : 'Não foi possível concluir a operação.' });
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? 'A porta ' + port + ' já está em uso. Encerre a execução anterior ou escolha outra PORT.' : 'Não foi possível iniciar o servidor.');
  process.exitCode = 1;
});
server.listen(port, host, () => console.log('Nexora: http://' + host + ':' + server.address().port));
