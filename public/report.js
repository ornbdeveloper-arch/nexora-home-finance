// Uma linha por registro financeiro; recorrências sem fim não são multiplicadas infinitamente.
export function reportRecords(state) {
  const categories = new Map(state.categories.map(item => [item.id, item.name]));
  const category = id => categories.get(id) || 'Outros';
  return [
    ...state.transactions.map(item => ({ id: item.id, kind: 'transaction', label: item.description, detail: item.type === 'income' ? 'Receita' : 'Despesa', category: category(item.category), date: item.date, amount: item.amount, status: item.status, direction: item.type })),
    ...state.installments.map(item => ({ id: item.id, kind: 'installment', label: item.description, detail: `${item.installmentCount} parcelas`, category: category(item.category), date: `${item.startMonth}-01`, amount: item.totalAmount, status: 'planned', direction: 'expense' })),
    ...state.recurringExpenses.map(item => ({ id: item.id, kind: 'recurring', label: item.description, detail: 'Valor mensal', category: category(item.category), date: `${item.startMonth}-01`, amount: item.amount, status: 'planned', direction: 'expense' })),
    ...state.budgets.map(item => ({ id: `${item.month}:${item.category}`, kind: 'budget', label: `Limite de ${category(item.category)}`, detail: 'Orçamento mensal', category: category(item.category), date: `${item.month}-01`, amount: item.amount, status: 'planned', direction: 'neutral' })),
    ...state.goals.map(item => ({ id: item.id, kind: 'goal', label: item.name, detail: 'Meta financeira', category: 'Metas', date: item.targetDate, amount: item.targetAmount, savedAmount: item.currentAmount, status: 'planned', direction: 'neutral' })),
    ...state.cards.map(item => ({ id: item.id, kind: 'card', label: item.name, detail: `Fecha dia ${item.closingDay} · vence dia ${item.dueDay}`, category: 'Cartões', date: '', amount: null, status: 'active', direction: 'neutral' }))
  ];
}
export function filterReport(records, { search = '', kind = '', from = '', to = '' } = {}) {
  const query = search.trim().toLocaleLowerCase('pt-BR');
  return records.filter(item => (!kind || item.kind === kind) && (!from || item.date >= from) && (!to || item.date <= to) && (!query || `${item.label} ${item.detail} ${item.category}`.toLocaleLowerCase('pt-BR').includes(query)))
    .sort((a, b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label, 'pt-BR'));
}
export function reportTotals(records) {
  const transactions = records.filter(item => item.kind === 'transaction');
  const sum = rows => rows.reduce((total, item) => total + item.amount, 0);
  return {
    income: sum(transactions.filter(item => item.direction === 'income' && item.status === 'paid')),
    expense: sum(transactions.filter(item => item.direction === 'expense' && item.status === 'paid')),
    receivable: sum(transactions.filter(item => item.direction === 'income' && item.status === 'pending')),
    payable: sum(transactions.filter(item => item.direction === 'expense' && item.status === 'pending')),
    installments: sum(records.filter(item => item.kind === 'installment')),
    recurringMonthly: sum(records.filter(item => item.kind === 'recurring')),
    goalsSaved: records.filter(item => item.kind === 'goal').reduce((total, item) => total + item.savedAmount, 0)
  };
}
export function reportTrend(records) {
  const months = new Map();
  for (const item of records) {
    if (item.kind !== 'transaction') continue;
    const key = item.date.slice(0, 7);
    const point = months.get(key) || { month: key, income: 0, expense: 0, pending: 0 };
    if (item.status === 'pending') point.pending += item.direction === 'income' ? item.amount : -item.amount;
    else point[item.direction] += item.amount;
    months.set(key, point);
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}
