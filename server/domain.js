// Regras de negócio compartilhadas pelas rotas e pelos testes.
export const defaultCategories = [
  { id: 'salario', name: 'Salário', color: '#17876b' },
  { id: 'freelance', name: 'Freelance', color: '#5277cf' },
  { id: 'moradia', name: 'Moradia', color: '#397a69' },
  { id: 'alimentacao', name: 'Alimentação', color: '#e1a34b' },
  { id: 'transporte', name: 'Transporte', color: '#6387cb' },
  { id: 'saude', name: 'Saúde', color: '#b97ab2' },
  { id: 'lazer', name: 'Lazer', color: '#d47c62' },
  { id: 'educacao', name: 'Educação', color: '#779853' },
  { id: 'outros', name: 'Outros', color: '#80908c' }
];
export const emptyState = () => ({ version: 1, transactions: [], budgets: [], installments: [], recurringExpenses: [], goals: [], cards: [], categories: structuredClone(defaultCategories) });
export function requireValue(condition, message) {
  if (!condition) { const error = new Error(message); error.status = 400; throw error; }
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '9999-12-31') return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validateTransaction(value, categories, cards = []) {
  requireValue(value && typeof value === 'object', 'Lançamento inválido.');
  requireValue(typeof value.description === 'string' && value.description.trim().length > 0 && value.description.trim().length <= 120, 'Informe uma descrição de até 120 caracteres.');
  requireValue(Number.isSafeInteger(value.amount) && value.amount > 0 && value.amount <= 100000000000, 'Informe um valor positivo de até R$ 1 bilhão.');
  requireValue(['income', 'expense'].includes(value.type), 'Tipo inválido.');
  requireValue(['paid', 'pending'].includes(value.status), 'Situação inválida.');
  requireValue(validDate(value.date), 'Data inválida.');
  requireValue(categories.some(c => c.id === value.category), 'Categoria não encontrada.');
  requireValue(typeof value.notes === 'string' && value.notes.length <= 500, 'Observação inválida.');
  const paymentMethod = value.paymentMethod || '';
  const purchaseDate = value.purchaseDate || value.date;
  const cardId = value.cardId || '';
  const dueDate = value.dueDate || value.date;
  requireValue(['', 'credit', 'debit', 'pix'].includes(paymentMethod), 'Meio de pagamento inválido.');
  requireValue(validDate(purchaseDate), 'Data da compra inválida.');
  requireValue(value.type === 'expense' || paymentMethod === '', 'Meio de pagamento só se aplica a despesas.');
  requireValue(value.type === 'income' || purchaseDate <= value.date, 'A compra não pode ocorrer após o pagamento ou vencimento.');
  requireValue(!['debit', 'pix'].includes(paymentMethod) || (value.status === 'paid' && purchaseDate === value.date), 'Débito e Pix devem ser efetivados na data da compra.');
  requireValue(!cardId || (paymentMethod === 'credit' && cards.some(card => card.id === cardId)), 'Cartão não encontrado.');
  requireValue(validDate(dueDate) && (value.status !== 'pending' || dueDate === value.date), 'Vencimento inválido.');
  requireValue(value.status !== 'paid' || dueDate >= purchaseDate, 'O vencimento não pode ser anterior à compra.');
  return { description: value.description.trim(), amount: value.amount, type: value.type, status: value.status, date: value.date, dueDate, purchaseDate, paymentMethod, cardId, category: value.category, notes: value.notes.trim() };
}
export function validateCard(value) {
  requireValue(value && typeof value.name === 'string' && value.name.trim().length > 0 && value.name.trim().length <= 60, 'Informe um nome para o cartão (até 60 caracteres).');
  requireValue(Number.isSafeInteger(value.closingDay) && value.closingDay >= 1 && value.closingDay <= 28, 'O fechamento deve ser entre os dias 1 e 28.');
  requireValue(Number.isSafeInteger(value.dueDay) && value.dueDay >= 1 && value.dueDay <= 28, 'O vencimento deve ser entre os dias 1 e 28.');
  return { name: value.name.trim(), closingDay: value.closingDay, dueDay: value.dueDay };
}
export function validateBudget(value, categories) {
  requireValue(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value.month), 'Mês inválido.');
  requireValue(categories.some(c => c.id === value.category), 'Categoria inválida.');
  requireValue(Number.isSafeInteger(value.amount) && value.amount > 0 && value.amount <= 100000000000, 'Limite inválido.');
  return { month: value.month, category: value.category, amount: value.amount };
}
export function validateInstallment(value, categories) {
  requireValue(value && typeof value === 'object', 'Compra parcelada inválida.');
  requireValue(typeof value.description === 'string' && value.description.trim().length > 0 && value.description.trim().length <= 120, 'Informe uma descrição de até 120 caracteres.');
  requireValue(Number.isSafeInteger(value.totalAmount) && value.totalAmount > 0 && value.totalAmount <= 100000000000, 'Informe o valor total da compra.');
  requireValue(Number.isSafeInteger(value.installmentCount) && value.installmentCount >= 2 && value.installmentCount <= 120, 'Escolha entre 2 e 120 parcelas.');
  requireValue(typeof value.startMonth === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value.startMonth), 'Mês inicial inválido.');
  requireValue(Number.isSafeInteger(value.dueDay) && value.dueDay >= 1 && value.dueDay <= 28, 'O vencimento deve ficar entre os dias 1 e 28.');
  requireValue(categories.some(c => c.id === value.category), 'Categoria inválida.');
  const paidInstallments = value.paidInstallments || [];
  requireValue(Array.isArray(paidInstallments) && paidInstallments.every(number => Number.isSafeInteger(number) && number >= 1 && number <= value.installmentCount) && new Set(paidInstallments).size === paidInstallments.length, 'Parcelas pagas inválidas.');
  return { description: value.description.trim(), totalAmount: value.totalAmount, installmentCount: value.installmentCount, startMonth: value.startMonth, dueDay: value.dueDay, category: value.category, paidInstallments: [...paidInstallments].sort((a, b) => a - b) };
}
export function validateRecurringExpense(value, categories) {
  requireValue(value && typeof value === 'object', 'Despesa recorrente inválida.');
  requireValue(typeof value.description === 'string' && value.description.trim().length > 0 && value.description.trim().length <= 120, 'Informe uma descrição de até 120 caracteres.');
  requireValue(Number.isSafeInteger(value.amount) && value.amount > 0 && value.amount <= 100000000000, 'Informe um valor mensal válido.');
  requireValue(typeof value.startMonth === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value.startMonth), 'Mês inicial inválido.');
  requireValue(value.endMonth === '' || value.endMonth === null || (typeof value.endMonth === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value.endMonth) && value.endMonth >= value.startMonth), 'Mês final inválido.');
  requireValue(Number.isSafeInteger(value.dueDay) && value.dueDay >= 1 && value.dueDay <= 28, 'O vencimento deve ficar entre os dias 1 e 28.');
  requireValue(categories.some(c => c.id === value.category), 'Categoria inválida.');
  const paidMonths = value.paidMonths || [];
  requireValue(Array.isArray(paidMonths) && paidMonths.every(item => typeof item === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(item)) && new Set(paidMonths).size === paidMonths.length, 'Meses pagos inválidos.');
  return { description: value.description.trim(), amount: value.amount, startMonth: value.startMonth, endMonth: value.endMonth || '', dueDay: value.dueDay, category: value.category, paidMonths: [...paidMonths].sort() };
}
export function validateGoal(value) {
  requireValue(value && typeof value === 'object', 'Meta inválida.');
  requireValue(typeof value.name === 'string' && value.name.trim().length > 0 && value.name.trim().length <= 100, 'Informe um nome de até 100 caracteres.');
  requireValue(Number.isSafeInteger(value.targetAmount) && value.targetAmount > 0 && value.targetAmount <= 100000000000, 'Informe um valor-alvo válido.');
  requireValue(Number.isSafeInteger(value.currentAmount) && value.currentAmount >= 0 && value.currentAmount <= 100000000000, 'Informe quanto já foi guardado.');
  requireValue(validDate(value.targetDate), 'Prazo inválido.');
  return { name: value.name.trim(), targetAmount: value.targetAmount, currentAmount: value.currentAmount, targetDate: value.targetDate };
}
export function validateBackup(value) {
  requireValue(value?.version === 1 && Array.isArray(value.transactions) && Array.isArray(value.categories) && Array.isArray(value.budgets), 'Arquivo de backup incompatível.');
  requireValue(value.transactions.length <= 50000 && value.categories.length > 0 && value.categories.length <= 100 && value.budgets.length <= 10000, 'Backup excede os limites permitidos.');
  const ids = new Set();
  const categories = value.categories.map(c => {
    requireValue(c && typeof c.id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(c.id) && !ids.has(c.id), 'Identificador de categoria inválido ou duplicado.');
    requireValue(typeof c.name === 'string' && c.name.trim().length > 0 && c.name.length <= 40 && /^#[a-fA-F0-9]{6}$/.test(c.color), 'Categoria inválida.');
    ids.add(c.id); return { id: c.id, name: c.name.trim(), color: c.color };
  });
  ids.clear();
  const transactions = value.transactions.map(t => {
    requireValue(t && typeof t.id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(t.id) && !ids.has(t.id), 'Identificador de lançamento inválido ou duplicado.');
    ids.add(t.id); return t;
  });
  ids.clear();
  const budgets = value.budgets.map(b => { const result = validateBudget(b, categories); const key = b.month + b.category; requireValue(!ids.has(key), 'Orçamento duplicado.'); ids.add(key); return result; });
  ids.clear();
  const installments = (value.installments || []).map(item => {
    requireValue(item && typeof item.id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(item.id) && !ids.has(item.id), 'Identificador de parcelamento inválido ou duplicado.');
    ids.add(item.id); return { id: item.id, ...validateInstallment(item, categories) };
  });
  ids.clear();
  const recurringExpenses = (value.recurringExpenses || []).map(item => {
    requireValue(item && typeof item.id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(item.id) && !ids.has(item.id), 'Identificador de recorrência inválido ou duplicado.');
    ids.add(item.id); return { id: item.id, ...validateRecurringExpense(item, categories) };
  });
  ids.clear();
  const goals = (value.goals || []).map(item => {
    requireValue(item && typeof item.id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(item.id) && !ids.has(item.id), 'Identificador de meta inválido ou duplicado.');
    ids.add(item.id); return { id: item.id, ...validateGoal(item) };
  });
  ids.clear();
  const cards = (value.cards || []).map(item => {
    requireValue(item && typeof item.id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(item.id) && !ids.has(item.id), 'Identificador de cartão inválido ou duplicado.');
    ids.add(item.id); return { id: item.id, ...validateCard(item) };
  });
  requireValue(new Set(cards.map(card => card.name.toLocaleLowerCase('pt-BR'))).size === cards.length, 'Nomes de cartões duplicados.');
  const checkedTransactions = transactions.map(t => ({ id: t.id, ...validateTransaction(t, categories, cards) }));
  requireValue(installments.length <= 10000 && recurringExpenses.length <= 10000 && goals.length <= 1000 && cards.length <= 100, 'Backup excede os limites permitidos.');
  return { version: 1, categories, transactions: checkedTransactions, budgets, installments, recurringExpenses, goals, cards };
}
