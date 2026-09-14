import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../server/domain.js';
import { reportRecords, filterReport, reportTotals, reportTrend } from '../public/report.js';

test('painel completo inclui todos os tipos sem filtro e não multiplica recorrências', () => {
  const state = emptyState();
  state.transactions.push(
    { id:'income',description:'Salário',amount:500000,type:'income',status:'paid',date:'2026-08-05',category:'salario',notes:'' },
    { id:'expense',description:'Mercado',amount:10000,type:'expense',status:'paid',date:'2026-09-10',category:'alimentacao',notes:'' },
    { id:'pending',description:'Internet',amount:12000,type:'expense',status:'pending',date:'2026-09-15',category:'moradia',notes:'' }
  );
  state.installments.push({ id:'installment',description:'Notebook',totalAmount:120000,installmentCount:12,startMonth:'2026-09',dueDay:10,category:'educacao',paidInstallments:[] });
  state.recurringExpenses.push({ id:'recurring',description:'Aluguel',amount:150000,startMonth:'2026-01',endMonth:'',dueDay:5,category:'moradia',paidMonths:[] });
  state.budgets.push({ month:'2026-09',category:'alimentacao',amount:30000 });
  state.goals.push({ id:'goal',name:'Reserva',targetAmount:1000000,currentAmount:200000,targetDate:'2027-01-01' });
  state.cards.push({ id:'card',name:'Cartão principal',closingDay:10,dueDay:20 });
  const all = reportRecords(state);
  assert.equal(all.length, 8);
  assert.equal(filterReport(all).length, 8);
  assert.deepEqual(reportTotals(all), { income:500000,expense:10000,receivable:0,payable:12000,installments:120000,recurringMonthly:150000,goalsSaved:200000 });
  assert.deepEqual(reportTrend(all), [
    { month:'2026-08',income:500000,expense:0,pending:0 },
    { month:'2026-09',income:0,expense:10000,pending:-12000 }
  ]);
  assert.deepEqual(filterReport(all,{kind:'goal'}).map(item=>item.label),['Reserva']);
  assert.deepEqual(filterReport(all,{from:'2026-09-01',to:'2026-09-30'}).map(item=>item.label).sort(),['Internet','Limite de Alimentação','Mercado','Notebook'].sort());
  assert.deepEqual(filterReport(all,{search:'notebook'}).map(item=>item.kind),['installment']);
});
