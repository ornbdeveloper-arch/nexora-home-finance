import test from 'node:test';
import assert from 'node:assert/strict';
import { toCents, totals, cardDueDate, projectedBalance, reservedForGoals } from '../public/finance.js';
import { emptyState, validateBackup, validateTransaction, validateCard, validateInstallment, validateRecurringExpense, validateGoal, validDate } from '../server/domain.js';

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
test('compra no crédito conserva compra e vencimento separados, inclusive no backup', () => {
  const state = emptyState();
  const row = { id: 'compra', description: 'Mercado', amount: 25000, type: 'expense', category: 'alimentacao', notes: '', purchaseDate: '2026-09-12', paymentMethod: 'credit', date: '2026-10-12', status: 'pending' };
  state.transactions.push(row);
  assert.deepEqual(validateBackup(state).transactions[0], { ...row, dueDate: row.date, cardId: '' });
  assert.equal(totals(state.transactions, '2026-09').payable, 0);
  assert.equal(totals(state.transactions, '2026-10').payable, 25000);
  assert.throws(() => validateTransaction({ ...row, purchaseDate: '2026-11-01' }, state.categories));
});
test('fechamento e vencimento do cartão determinam a fatura', () => {
  const card = validateCard({ name: 'Principal', closingDay: 10, dueDay: 20 });
  assert.equal(cardDueDate('2026-09-10', card), '2026-09-20');
  assert.equal(cardDueDate('2026-09-11', card), '2026-10-20');
  assert.equal(cardDueDate('2026-12-31', card), '2027-01-20');
  assert.equal(cardDueDate('2026-09-10', { closingDay: 20, dueDay: 5 }), '2026-10-05');
  assert.throws(() => validateCard({ name: 'Inválido', closingDay: 31, dueDay: 5 }));
});
test('pagamento real preserva vencimento, projeção e reserva informativa', () => {
  const state = emptyState();
  const card = { id: 'card-1', name: 'Principal', closingDay: 10, dueDay: 20 };
  state.cards.push(card);
  const row = { id: 'tx-1', description: 'Compra', amount: 15000, type: 'expense', category: 'outros', notes: '', paymentMethod: 'credit', cardId: card.id, purchaseDate: '2026-09-11', dueDate: '2026-10-20', date: '2026-10-15', status: 'paid' };
  state.transactions.push(row);
  assert.equal(validateBackup(state).transactions[0].dueDate, '2026-10-20');
  assert.equal(projectedBalance([{ date: '2026-09-01', amount: 50000, type: 'income', status: 'paid' }, { date: '2026-09-20', amount: 10000, type: 'expense', status: 'pending' }], '2026-09-12', '2026-09-30', 5000), 35000);
  assert.equal(reservedForGoals([{ currentAmount: 10000 }, { currentAmount: 5000 }]), 15000);
  assert.throws(() => validateTransaction({ ...row, cardId: 'missing' }, state.categories, state.cards));
});
test('débito e Pix são pagos na data da compra e lançamentos antigos continuam válidos', () => {
  const categories = emptyState().categories;
  const row = { description: 'Padaria', amount: 1200, type: 'expense', category: 'alimentacao', notes: '', date: '2026-09-12', status: 'paid' };
  assert.equal(validateTransaction(row, categories).purchaseDate, row.date);
  for (const paymentMethod of ['debit', 'pix']) {
    assert.equal(validateTransaction({ ...row, paymentMethod, purchaseDate: row.date }, categories).paymentMethod, paymentMethod);
    assert.throws(() => validateTransaction({ ...row, paymentMethod, purchaseDate: '2026-09-11' }, categories));
    assert.throws(() => validateTransaction({ ...row, paymentMethod, status: 'pending' }, categories));
  }
});
test('parcelamentos exigem valor, prazo, vencimento e categoria válidos', () => {
  const state = emptyState();
  const item = validateInstallment({ description:'Notebook',totalAmount:600000,installmentCount:12,startMonth:'2026-09',dueDay:10,category:'outros' }, state.categories);
  assert.equal(item.installmentCount, 12);
  assert.throws(() => validateInstallment({ ...item, installmentCount:1 }, state.categories));
  assert.throws(() => validateInstallment({ ...item, dueDay:31 }, state.categories));
});
test('recorrências e metas validam período, pagamentos e progresso', () => {
  const state = emptyState();
  assert.equal(validateRecurringExpense({ description:'Internet',amount:12000,startMonth:'2026-09',endMonth:'',dueDay:10,category:'outros',paidMonths:['2026-09'] }, state.categories).paidMonths[0], '2026-09');
  assert.throws(() => validateRecurringExpense({ description:'Internet',amount:12000,startMonth:'2026-09',endMonth:'2026-08',dueDay:10,category:'outros' }, state.categories));
  assert.equal(validateGoal({ name:'Reserva',targetAmount:100000,currentAmount:25000,targetDate:'2027-09-01' }).currentAmount, 25000);
  assert.throws(() => validateGoal({ name:'Reserva',targetAmount:0,currentAmount:0,targetDate:'2027-09-01' }));
});
