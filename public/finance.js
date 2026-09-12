// Valores monetários são inteiros em centavos. Ex.: R$ 12,30 = 1230.
export const money = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export function toCents(value) {
  const normalized = String(value).trim().replace(',', '.');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(normalized)) throw new Error('Use um valor como 1250,50, sem separador de milhar.');
  const [whole, fraction = ''] = normalized.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (amount <= 0 || amount > 100000000000) throw new Error('Informe um valor positivo de até R$ 1 bilhão.');
  return amount;
}
export const sum = rows => rows.reduce((total, row) => total + row.amount, 0);
export function cardDueDate(purchaseDate, card) {
  const [year, month, day] = purchaseDate.split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > new Date(year, month, 0).getDate() || !Number.isInteger(card.closingDay) || card.closingDay < 1 || card.closingDay > 28 || !Number.isInteger(card.dueDay) || card.dueDay < 1 || card.dueDay > 28) throw new Error('Data da compra ou configuração do cartão inválida.');
  const closingMonth = new Date(year, month - 1 + (day > card.closingDay ? 1 : 0), 1);
  const dueMonth = new Date(closingMonth.getFullYear(), closingMonth.getMonth() + (card.dueDay <= card.closingDay ? 1 : 0), card.dueDay);
  return `${dueMonth.getFullYear()}-${String(dueMonth.getMonth() + 1).padStart(2, '0')}-${String(dueMonth.getDate()).padStart(2, '0')}`;
}
export const reservedForGoals = goals => goals.reduce((total, goal) => total + goal.currentAmount, 0);
export function projectedBalance(rows, asOf, endDate, extraCommitments = 0) {
  const current = rows.filter(t => t.status === 'paid' && t.date <= asOf).reduce((total, t) => total + (t.type === 'income' ? t.amount : -t.amount), 0);
  const futurePaid = rows.filter(t => t.status === 'paid' && t.date > asOf && t.date <= endDate).reduce((total, t) => total + (t.type === 'income' ? t.amount : -t.amount), 0);
  const planned = rows.filter(t => t.status === 'pending' && t.date <= endDate).reduce((total, t) => total + (t.type === 'income' ? t.amount : -t.amount), 0);
  return current + futurePaid + planned - extraCommitments;
}
export function totals(rows, month) {
  const monthly = rows.filter(t => t.date.startsWith(month));
  const income = sum(monthly.filter(t => t.type === 'income' && t.status === 'paid'));
  const expense = sum(monthly.filter(t => t.type === 'expense' && t.status === 'paid'));
  const payable = sum(monthly.filter(t => t.type === 'expense' && t.status === 'pending'));
  const receivable = sum(monthly.filter(t => t.type === 'income' && t.status === 'pending'));
  const end = month + '-31';
  const balance = rows.filter(t => t.status === 'paid' && t.date <= end).reduce((total, t) => total + (t.type === 'income' ? t.amount : -t.amount), 0);
  return { income, expense, payable, receivable, balance, result: income - expense };
}
