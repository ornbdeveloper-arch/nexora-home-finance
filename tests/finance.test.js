import test from 'node:test';
import assert from 'node:assert/strict';
import { toCents, totals } from '../public/finance.js';
import { emptyState, validateBackup, validateTransaction, validDate } from '../server/domain.js';

test('dinheiro é convertido para centavos sem formatos ambíguos', () => {
  assert.equal(toCents('0,10') + toCents('0,20'), 30);
  assert.equal(toCents('1250.50'), 125050);
  for (const value of ['1.234,56', '0', '-5', '12,345', '1e3', 'NaN', '1000000000.01']) assert.throws(() => toCents(value));
});
test('resumo separa pendências, resultado mensal e saldo acumulado', () => {
  const rows = [
    { date:'2026-08-01', amount:100000, type:'income', status:'paid' },
    { date:'2026-09-01', amount:50000, type:'income', status:'paid' },
    { date:'2026-09-02', amount:10000, type:'expense', status:'paid' },
    { date:'2026-09-03', amount:20000, type:'expense', status:'pending' },
    { date:'2026-09-04', amount:30000, type:'income', status:'pending' },
    { date:'2026-10-01', amount:90000, type:'income', status:'paid' }
  ];
  assert.deepEqual(totals(rows, '2026-09'), { income:50000,expense:10000,payable:20000,receivable:30000,balance:140000,result:40000 });
});
test('datas impossíveis e anos bissextos são validados', () => {
  assert.equal(validDate('2024-02-29'), true);
  for (const value of ['2025-02-29','2026-02-30','2026-13-01','2026-00-00','xyz',null]) assert.equal(validDate(value), false);
});
test('backup rejeita registros duplicados e referências inexistentes', () => {
  const data = emptyState();
  const row = { id:'test',description:'Compra',amount:1230,type:'expense',status:'paid',date:'2026-09-11',category:'outros',notes:'' };
  data.transactions = [row]; assert.equal(validateBackup(data).transactions[0].amount, 1230);
  assert.throws(() => validateBackup({ ...data, transactions:[row,row] }));
  assert.throws(() => validateTransaction({ ...row, category:'inexistente' }, data.categories));
  assert.throws(() => validateTransaction({ ...row, amount:0.1 }, data.categories));
});
