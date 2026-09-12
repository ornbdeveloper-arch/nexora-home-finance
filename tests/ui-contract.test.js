import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

test('navegação e diálogos expõem IDs únicos e destinos renderizados', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const page of [...html.matchAll(/data-page="([^"]+)"/g)].map(match => match[1])) assert.match(app, new RegExp(`^  ${page}: \\[`, 'm'));
  for (const id of ['transaction-dialog', 'card-dialog', 'settle-dialog', 'goal-dialog', 'confirm-dialog']) assert(ids.includes(id));
});

test('campos visíveis de data possuem limites e formulários novos têm ações', () => {
  for (const match of html.matchAll(/<input\b[^>]*type="(date|month)"[^>]*>/g)) {
    assert.match(match[0], /\bmin="(1900-01|1900-01-01)"/);
    assert.match(match[0], /\bmax="(9999-12|9999-12-31)"/);
  }
  for (const id of ['transaction-form', 'card-form', 'settle-form']) assert.match(app, new RegExp(`\\$\\('#${id}'\\)\\.addEventListener\\('submit'`));
  for (const action of ['new-card', 'edit-card', 'delete-card', 'settle']) assert.match(app, new RegExp(`action === '${action}'`));
});
