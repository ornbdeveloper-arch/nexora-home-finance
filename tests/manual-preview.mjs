// Prévia local isolada para revisão visual. Execute: node tests/manual-preview.mjs
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { emptyState } from '../server/domain.js';

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const state = emptyState();
const month = new Date().toISOString().slice(0, 7);
const date = day => `${month}-${String(day).padStart(2, '0')}`;
state.cards.push({ id: 'card-preview', name: 'Cartão principal', closingDay: 10, dueDay: 20 });
state.transactions.push({ id: 'income-preview', description: 'Salário de exemplo', amount: 400000, type: 'income', status: 'paid', date: date(5), category: 'salario', notes: '' });
state.transactions.push({ id: 'credit-preview', description: 'Compra de exemplo', amount: 18000, type: 'expense', status: 'pending', date: date(20), dueDate: date(20), purchaseDate: date(11), paymentMethod: 'credit', cardId: 'card-preview', category: 'alimentacao', notes: '' });
state.goals.push({ id: 'goal-preview', name: 'Reserva de exemplo', targetAmount: 100000, currentAmount: 20000, targetDate: '2027-12-01' });
let updatedAt = new Date().toISOString();
const mock = createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'apikey, authorization, content-type');
  response.setHeader('Content-Type', 'application/json');
  if (request.method === 'OPTIONS') { response.writeHead(204); return response.end(); }
  const url = new URL(request.url, 'http://localhost');
  const reply = (status, value) => { response.writeHead(status); response.end(JSON.stringify(value)); };
  if (url.pathname === '/auth/v1/token') return reply(200, { access_token: 'preview-token', refresh_token: 'preview-refresh', user: { id: userId } });
  if (url.pathname === '/auth/v1/user') return reply(200, { id: userId, email: 'preview@example.test', user_metadata: { full_name: 'Prévia local' } });
  if (url.pathname !== '/rest/v1/nexora_state') return reply(404, {});
  if (request.method === 'GET') return reply(200, [{ data: state, updated_at: updatedAt }]);
  const chunks = []; for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString());
  if (request.method === 'PATCH') { Object.assign(state, body.data); updatedAt = body.updated_at; return reply(200, [{ data: state }]); }
  return reply(204, {});
});
mock.listen(0, '127.0.0.1'); await once(mock, 'listening');
const child = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, HOST: '127.0.0.1', PORT: '3001', SUPABASE_URL: `http://127.0.0.1:${mock.address().port}`, SUPABASE_SECRET_KEY: 'sb_secret_preview', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_preview' }, stdio: 'inherit' });
process.on('SIGINT', () => { child.kill(); mock.close(); process.exit(0); });
child.on('exit', () => { mock.close(); process.exit(0); });
