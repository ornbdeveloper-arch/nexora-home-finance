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
