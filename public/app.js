import { request } from './api.js';
import { login, logout, isAuthenticated } from './auth.js';
import { money, toCents, sum, totals, cardDueDate, projectedBalance, reservedForGoals } from './finance.js';
import { reportRecords, filterReport, reportTotals, reportTrend } from './report.js';

// 1. Estado da interface. Os dados reais vêm sempre do servidor.
const $ = selector => document.querySelector(selector);
const THEME_KEY = 'nexora_theme';
const initialTheme = localStorage.getItem(THEME_KEY) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.documentElement.dataset.theme = initialTheme;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
let state = null;
let realState = null;
let currentUser = null;
let adminUsers = null;
let demo = false;
let month = today().slice(0, 7);
let page = 'overview';
let filter = { search: '', type: '', status: '', category: '', paymentMethod: '', view: 'payment', page: 1 };
let reportFilter = { search: '', kind: '', from: '', to: '', page: 1 };
const titles = {
  overview: ['Visão geral', 'Um olhar completo para o seu dinheiro.'],
  complete: ['Painel completo', 'Todos os registros financeiros em um só lugar.'],
  transactions: ['Lançamentos', 'Cada entrada e saída, no seu devido lugar.'],
  cards: ['Cartões', 'Fechamento, vencimento e próximas faturas.'],
  calendar: ['Agenda', 'Entradas e saídas previstas nos próximos 30 dias.'],
  budgets: ['Orçamentos', 'Planeje seus gastos e acompanhe seus limites.'],
  installments: ['Parcelamentos', 'Acompanhe compras e dívidas que comprometem os próximos meses.'],
  goals: ['Metas', 'Transforme planos em valores e prazos que você pode acompanhar.'],
  categories: ['Categorias', 'Organize seu dinheiro de um jeito que faz sentido para você.'],
  admin: ['Usuários', 'Gerencie quem pode acessar o Nexora.'],
  settings: ['Dados e backup', 'Seus registros organizados, suas cópias em segurança.']
};
const paths = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  pie: '<path d="M21 13a9 9 0 1 1-10-10v10z"/><path d="M15 3a8 8 0 0 1 6 6h-6z"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 10h18M10 10v11"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18"/>',
  leaf: '<path d="M20 3c-11-2-18 7-13 12s15-1 13-12ZM4 21 15 10"/>',
  wallet: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 8V6c0-2 1-3 3-3h11M21 11h-6v5h6"/>',
  down: '<path d="M17 7 7 17M7 7v10h10"/>', up: '<path d="m7 17 10-10M7 7h10v10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>'
  ,users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.wallet}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
// Escape qualquer texto informado pelo usuário antes de colocá-lo no HTML.
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const category = id => state.categories.find(c => c.id === id) || { name: 'Outros', color: '#80908c' };
const monthName = value => new Date(value + '-15T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const dateLabel = value => value.split('-').reverse().join('/');
const monthly = () => state.transactions.filter(t => t.date.startsWith(month));
const viewedMonthly = () => state.transactions.filter(t => (filter.view === 'purchase' && t.type === 'expense' ? t.purchaseDate || t.date : t.date).startsWith(month));
const cardName = id => state.cards.find(card => card.id === id)?.name || 'Cartão não cadastrado';
const monthOffset = (value, offset) => { const date = new Date(value + '-15T12:00:00'); date.setMonth(date.getMonth() + offset); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; };
function installmentAt(item, targetMonth) {
  const index = (Number(targetMonth.slice(0, 4)) - Number(item.startMonth.slice(0, 4))) * 12 + Number(targetMonth.slice(5)) - Number(item.startMonth.slice(5));
  if (index < 0 || index >= item.installmentCount) return null;
  return Math.floor(item.totalAmount / item.installmentCount) + (index < item.totalAmount % item.installmentCount ? 1 : 0);
}
function installmentNumberAt(item, targetMonth) { return (Number(targetMonth.slice(0, 4)) - Number(item.startMonth.slice(0, 4))) * 12 + Number(targetMonth.slice(5)) - Number(item.startMonth.slice(5)) + 1; }
const installmentsInMonth = (targetMonth = month) => state.installments.map(item => ({ ...item, installmentNumber: installmentNumberAt(item, targetMonth), monthlyAmount: installmentAt(item, targetMonth) })).filter(item => item.monthlyAmount !== null).map(item => ({ ...item, paid: item.paidInstallments.includes(item.installmentNumber) }));
const recurringInMonth = (targetMonth = month) => state.recurringExpenses.filter(item => item.startMonth <= targetMonth && (!item.endMonth || item.endMonth >= targetMonth)).map(item => ({ ...item, paid: item.paidMonths.includes(targetMonth) }));
const ordered = rows => [...rows].sort((a, b) => b.date.localeCompare(a.date) || a.description.localeCompare(b.description));
const options = (all = false) => (all ? '<option value="">Todas as categorias</option>' : '') + state.categories.map(c => `<option value="${escape(c.id)}">${escape(c.name)}</option>`).join('');
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').hidden = true, 4500); }
function ensureReal() { if (demo) { toast('Saia da demonstração para registrar seus dados reais.'); return false; } return true; }
function empty(title, text, action = '') { return `<div class="empty"><div class="empty-icon">${icon('leaf')}</div><h2>${title}</h2><p>${text}</p>${action}</div>`; }

// 2. Renderização. Cada função transforma dados em uma parte da tela.
function statCards() {
  const t = totals(state.transactions, month);
  const installments = installmentsInMonth(); const recurring = recurringInMonth();
  const committed = installments.filter(item => !item.paid).reduce((total, item) => total + item.monthlyAmount, 0) + recurring.filter(item => !item.paid).reduce((total, item) => total + item.amount, 0);
  const pendingCount = monthly().filter(item => item.status === 'pending' && item.type === 'expense').length;
  const commitmentCount = installments.filter(item => !item.paid).length + recurring.filter(item => !item.paid).length;
  const cards = [
    ['Saldo acumulado', t.balance, 'wallet', 'Efetivados até o fim deste mês', 'featured'],
    ['Receitas do mês', t.income, 'down', `${money(t.receivable)} a receber`, ''],
    ['Despesas do mês', t.expense, 'up', 'Pagamentos já efetivados', ''],
    ['Contas a pagar', t.payable + committed, 'clock', `${pendingCount} ${pendingCount === 1 ? 'lançamento' : 'lançamentos'} + ${commitmentCount} ${commitmentCount === 1 ? 'compromisso' : 'compromissos'}`, '']
  ];
  return `<section class="cards" aria-label="Resumo financeiro">${cards.map(([label, value, image, note, css]) => `<article class="stat-card ${css}"><div class="stat-label">${label}<span class="stat-icon">${icon(image)}</span></div><div class="stat-value">${money(value)}</div><div class="stat-note">${note}</div></article>`).join('')}</section>`;
}
function cashChart() {
  const data = [];
  for (let offset = 5; offset >= 0; offset--) {
    const date = new Date(month + '-15T12:00:00'); date.setMonth(date.getMonth() - offset);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    data.push({ key, label: date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), ...totals(state.transactions, key) });
  }
  const maximum = Math.max(10000, ...data.flatMap(d => [d.income, d.expense]));
  const scale = Math.ceil(maximum / 100000) * 100000;
  const total = totals(state.transactions, month);
  return `<section class="panel"><div class="panel-heading"><div><h2>Fluxo de caixa</h2><p>Entradas e saídas nos últimos 6 meses</p></div><div class="legend"><span><i style="background:#1b5947"></i>Receitas</span><span><i style="background:#cce0a8"></i>Despesas</span></div></div><div class="chart" role="img" aria-label="${escape(data.map(d => `${d.label}: receitas ${money(d.income)}, despesas ${money(d.expense)}`).join('; '))}"><div class="chart-scale">${[1, .75, .5, .25, 0].map(n => `<span>${n === 0 ? 'R$ 0' : (scale * n / 100000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil'}</span>`).join('')}</div><div class="chart-columns">${data.map(d => `<div class="chart-column"><div class="bar" style="height:${d.income / scale * 100}%" title="Receitas: ${money(d.income)}"></div><div class="bar expense" style="height:${d.expense / scale * 100}%" title="Despesas: ${money(d.expense)}"></div><span class="chart-label">${d.label}</span></div>`).join('')}</div></div><div class="chart-summary"><span>Resultado efetivado do mês</span><strong class="${total.result < 0 ? 'negative' : ''}">${money(total.result)}</strong></div></section>`;
}
function expenseChart() {
  const expenses = monthly().filter(t => t.type === 'expense' && t.status === 'paid');
  const total = sum(expenses);
  let groups = state.categories.map(c => ({ ...c, amount: sum(expenses.filter(t => t.category === c.id)) })).filter(c => c.amount).sort((a,b) => b.amount - a.amount);
  if (groups.length > 4) groups = [...groups.slice(0, 4), { name: 'Demais categorias', color: '#bcc7bc', amount: sum(groups.slice(4)) }];
  let position = 0;
  const gradient = groups.map(c => { const start = position; position += c.amount / total * 100; return `${c.color} ${start}% ${position}%`; }).join(',');
  return `<section class="panel"><div class="panel-heading"><div><h2>Para onde vai seu dinheiro</h2><p>Despesas efetivadas por categoria</p></div></div>${!total ? empty('Ainda sem despesas', 'Suas categorias aparecerão aqui.') : `<div class="expense-content"><div class="donut" style="background:conic-gradient(${gradient})"><div class="donut-center"><small>Total de despesas</small><strong>${money(total)}</strong></div></div><div class="category-legend">${groups.map(c => `<div><span><i class="color-dot" style="background:${c.color}"></i>${escape(c.name)}</span><strong>${Math.round(c.amount / total * 100)}%</strong></div>`).join('')}</div></div>`}</section>`;
}
function rowsHtml(rows, actions = false) {
  return rows.map(t => `<tr><td><div class="transaction-description"><span class="transaction-symbol ${t.type}">${t.type === 'income' ? '↙' : '↗'}</span><span>${escape(t.description)}${t.type === 'expense' && t.paymentMethod ? `<small class="table-note">${{ credit: 'Crédito', debit: 'Débito', pix: 'Pix' }[t.paymentMethod]}${t.cardId ? ' · ' + escape(cardName(t.cardId)) : ''} · compra ${dateLabel(t.purchaseDate || t.date)}</small>` : ''}${t.status === 'paid' && t.dueDate && t.dueDate !== t.date ? `<small class="table-note">Vencia em ${dateLabel(t.dueDate)}</small>` : ''}</span></div></td><td><span class="tag">${escape(category(t.category).name)}</span></td><td>${dateLabel(t.date)}</td><td><span class="status ${t.status}">${t.status === 'pending' ? 'Pendente' : t.type === 'income' ? 'Recebido' : 'Pago'}</span></td><td class="amount ${t.type === 'income' ? 'positive' : ''}">${t.type === 'income' ? '+' : '−'} ${money(t.amount)}</td>${actions ? `<td><div class="row-actions">${t.status === 'pending' ? `<button data-action="settle" data-id="${t.id}" aria-label="Efetivar ${escape(t.description)}" title="Confirmar pagamento">${icon('check')}</button>` : ''}<button data-action="edit" data-id="${t.id}" aria-label="Editar ${escape(t.description)}" title="Editar">${icon('edit')}</button><button data-action="delete" data-id="${t.id}" aria-label="Excluir ${escape(t.description)}" title="Excluir">${icon('trash')}</button></div></td>` : ''}</tr>`).join('');
}
function table(rows, actions = false) { return `<div class="table-wrap"><table><thead><tr><th>DESCRIÇÃO</th><th>CATEGORIA</th><th>PAGAMENTO / VENCIMENTO</th><th>SITUAÇÃO</th><th>VALOR</th>${actions ? '<th>AÇÕES</th>' : ''}</tr></thead><tbody>${rowsHtml(rows, actions)}</tbody></table></div>`; }
function upcoming() {
  const pending = monthly().filter(t => t.status === 'pending' && t.type === 'expense').sort((a,b) => a.date.localeCompare(b.date));
  return `<section class="panel"><div class="panel-heading"><h2>Contas a pagar</h2><span class="pill">${pending.length} ${pending.length === 1 ? 'pendente' : 'pendentes'}</span></div>${pending.length ? pending.slice(0,4).map(t => `<div class="upcoming-item"><div class="date-tile"><small>${new Date(t.date + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</small><strong>${t.date.slice(8)}</strong></div><div class="upcoming-description"><strong>${escape(t.description)}</strong><small>${escape(category(t.category).name)}</small></div><div class="upcoming-amount">${money(t.amount)}<small>${t.date < today() ? 'Em atraso' : t.date === today() ? 'Vence hoje' : 'A vencer'}</small></div></div>`).join('') : empty('Tudo em dia', 'Nenhuma despesa pendente neste mês.')}</section>`;
}
function renderOverview() {
  const rows = ordered(monthly());
  const end = `${month}-${new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()}`;
  const cutoff = today() < end ? today() : end;
  const commitments = installmentsInMonth().filter(i => !i.paid).reduce((total, item) => total + item.monthlyAmount, 0) + recurringInMonth().filter(i => !i.paid).reduce((total, item) => total + item.amount, 0);
  const projection = projectedBalance(state.transactions, cutoff, end, commitments);
  const available = projection - reservedForGoals(state.goals);
  return `${state.transactions.length === 0 ? `<div class="panel empty overview-welcome"><div><h2>Seu próximo capítulo começa aqui.</h2><p>Registre seu primeiro lançamento ou explore um exemplo.</p></div><button class="secondary" data-action="demo">Explorar demonstração ↗</button></div>` : ''}${statCards()}<section class="panel projection"><div><small>PROJEÇÃO ATÉ ${dateLabel(end)}</small><strong>${money(projection)}</strong><span>Após reservas informadas para metas: ${money(available)}</span></div><p>Estimativa com lançamentos pendentes e compromissos cadastrados. Se uma parcela ou recorrência também foi lançada como despesa, ela será contada duas vezes.</p></section><div class="dashboard-grid">${cashChart()}${expenseChart()}</div><div class="dashboard-grid"><section class="panel table-panel"><div class="panel-heading"><div><h2>Últimos lançamentos</h2><p>Suas movimentações neste mês</p></div><a class="text-button" href="#transactions">Ver todos ↗</a></div>${rows.length ? table(rows.slice(0, 5)) : empty('Tudo pronto para começar', 'Adicione uma receita ou despesa para acompanhar seu mês.', '<button class="primary" data-action="new">＋ Adicionar lançamento</button>')}<div class="table-footer"><span>${rows.length} lançamentos em ${monthName(month)}</span><a href="#settings" class="text-button">Dados e backup ↗</a></div></section>${upcoming()}</div>`;
}
const reportKinds = { transaction: 'Lançamento', installment: 'Parcelamento', recurring: 'Recorrência', budget: 'Orçamento', goal: 'Meta', card: 'Cartão' };
function completeBody() {
  const records = filterReport(reportRecords(state), reportFilter);
  const totals = reportTotals(records);
  const trend = reportTrend(records);
  const max = Math.max(1, ...trend.flatMap(item => [item.income, item.expense]));
  const pages = Math.max(1, Math.ceil(records.length / 12)); reportFilter.page = Math.min(reportFilter.page, pages);
  const shown = records.slice((reportFilter.page - 1) * 12, reportFilter.page * 12);
  const kindCount = Object.entries(reportKinds).map(([key, label]) => { const count = records.filter(item => item.kind === key).length; return `<span><strong>${count}</strong> ${count === 1 ? label.toLowerCase() : { transaction: 'lançamentos', installment: 'parcelamentos', recurring: 'recorrências', budget: 'orçamentos', goal: 'metas', card: 'cartões' }[key]}</span>`; }).join('');
  return `<section class="complete-stats" aria-label="Resumo de todos os registros"><article><span>Receitas recebidas</span><strong>${money(totals.income)}</strong><small>Todos os lançamentos efetivados no período</small></article><article><span>Despesas pagas</span><strong>${money(totals.expense)}</strong><small>Todos os lançamentos efetivados no período</small></article><article><span>Resultado realizado</span><strong class="${totals.income - totals.expense < 0 ? 'negative' : ''}">${money(totals.income - totals.expense)}</strong><small>Recebido menos pago</small></article><article><span>A receber / a pagar</span><strong>${money(totals.receivable)} <em>/</em> ${money(totals.payable)}</strong><small>Lançamentos ainda pendentes</small></article></section><div class="complete-insights"><section class="panel complete-chart"><div class="panel-heading"><div><h2>Fluxo de todos os meses</h2><p>Receitas e despesas efetivadas, por mês com lançamentos</p></div><div class="complete-legend"><span>● Receitas</span><span>● Despesas</span></div></div>${trend.length ? `<div class="complete-chart-scroll"><div class="complete-chart-bars" style="--points:${trend.length}" role="img" aria-label="${escape(trend.map(item => `${monthName(item.month)}: receitas ${money(item.income)}, despesas ${money(item.expense)}`).join('; '))}">${trend.map(item => `<div class="complete-chart-month"><div class="complete-bar-pair"><i class="complete-bar income" style="height:${Math.max(item.income ? 2 : 0, item.income / max * 100)}%" title="Receitas: ${money(item.income)}"></i><i class="complete-bar expense" style="height:${Math.max(item.expense ? 2 : 0, item.expense / max * 100)}%" title="Despesas: ${money(item.expense)}"></i></div><span>${escape(item.month.slice(5) + '/' + item.month.slice(2, 4))}</span></div>`).join('')}</div></div>` : empty('Sem fluxo no período', 'Os lançamentos recebidos e pagos formarão este gráfico.')}</section><section class="panel complete-commitments"><h2>Outros compromissos</h2><p>Valores cadastrados separadamente dos lançamentos. Não entram no resultado realizado acima.</p><div><span>Total de compras parceladas</span><strong>${money(totals.installments)}</strong></div><div><span>Contas recorrentes por mês</span><strong>${money(totals.recurringMonthly)}</strong></div><div><span>Guardado em metas</span><strong>${money(totals.goalsSaved)}</strong></div><div><span>Cartões cadastrados</span><strong>${records.filter(item => item.kind === 'card').length}</strong></div></section></div><section class="panel complete-list"><div class="panel-heading"><div><h2>Todos os registros</h2><p>${records.length} ${records.length === 1 ? 'item encontrado' : 'itens encontrados'}. Cartões e contas contínuas aparecem uma vez; não são duplicados a cada mês.</p></div></div><div class="complete-kind-count">${kindCount}</div>${shown.length ? `<div class="table-wrap"><table><thead><tr><th>REGISTRO</th><th>TIPO</th><th>DATA / INÍCIO</th><th>CATEGORIA</th><th>VALOR</th></tr></thead><tbody>${shown.map(item => `<tr><td><strong>${escape(item.label)}</strong><small class="table-note">${escape(item.detail)}${item.kind === 'goal' ? ` · guardado ${money(item.savedAmount)}` : ''}</small></td><td><span class="tag">${reportKinds[item.kind]}</span></td><td>${item.date ? dateLabel(item.date) : '—'}</td><td>${escape(item.category)}</td><td class="amount">${item.amount === null ? '—' : money(item.amount)}</td></tr>`).join('')}</tbody></table></div>` : empty('Nenhum registro encontrado', 'Remova os filtros ou cadastre um novo item.') }<div class="table-footer"><span>Página ${reportFilter.page} de ${pages}</span><div class="pagination"><button class="secondary" data-action="report-previous" ${reportFilter.page === 1 ? 'disabled' : ''} aria-label="Página anterior">‹</button><button class="secondary" data-action="report-next" ${reportFilter.page === pages ? 'disabled' : ''} aria-label="Próxima página">›</button></div></div></section>`;
}
function renderComplete() {
  return `<section class="complete-intro"><div><p class="eyebrow">SEU PANORAMA FINANCEIRO</p><h2>Uma visão de tudo</h2><p>Os dados aparecem completos. Use os filtros apenas para investigar uma parte.</p></div><span>${state.transactions.length} lançamentos · ${state.installments.length + state.recurringExpenses.length} compromissos</span></section><div class="complete-filters"><label>Buscar<input id="report-search" placeholder="Descrição, categoria ou detalhe" value="${escape(reportFilter.search)}"></label><label>Tipo<select id="report-kind"><option value="">Todos os tipos</option>${Object.entries(reportKinds).map(([key, label]) => `<option value="${key}" ${reportFilter.kind === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>De<input id="report-from" type="date" min="1900-01-01" max="9999-12-31" value="${reportFilter.from}"></label><label>Até<input id="report-to" type="date" min="1900-01-01" max="9999-12-31" value="${reportFilter.to}"></label><button class="secondary" data-action="report-clear">Limpar filtros</button></div><div id="complete-results">${completeBody()}</div>`;
}
function filteredRows() {
  const text = filter.search.toLocaleLowerCase('pt-BR');
  return [...viewedMonthly()].sort((a,b) => (filter.view === 'purchase' ? (b.purchaseDate || b.date).localeCompare(a.purchaseDate || a.date) : b.date.localeCompare(a.date)) || a.description.localeCompare(b.description)).filter(t => (!filter.type || t.type === filter.type) && (!filter.status || t.status === filter.status) && (!filter.category || t.category === filter.category) && (!filter.paymentMethod || t.paymentMethod === filter.paymentMethod) && (t.description.toLocaleLowerCase('pt-BR').includes(text) || t.notes.toLocaleLowerCase('pt-BR').includes(text)));
}
function transactionsResult() {
  const rows = filteredRows(); const pages = Math.max(1, Math.ceil(rows.length / 12)); filter.page = Math.min(filter.page, pages);
  return `${rows.length ? table(rows.slice((filter.page - 1) * 12, filter.page * 12), true) : empty('Nenhum lançamento encontrado', 'Altere os filtros ou adicione um novo lançamento.')}<div class="table-footer"><span>${rows.length} registros · ${filter.view === 'purchase' ? 'Valor das compras' : 'Resultado dos registros'}: ${money(filter.view === 'purchase' ? sum(rows.filter(t => t.type === 'expense')) : rows.reduce((a,t) => a + (t.type === 'income' ? t.amount : -t.amount), 0))}<br><small>${filter.view === 'purchase' ? 'Compras filtradas pela data em que ocorreram' : 'Inclui pendentes nos filtros atuais'}</small></span><div class="pagination"><button class="secondary" data-action="previous" ${filter.page === 1 ? 'disabled' : ''} aria-label="Página anterior">‹</button><span>${filter.page} / ${pages}</span><button class="secondary" data-action="next" ${filter.page === pages ? 'disabled' : ''} aria-label="Próxima página">›</button></div></div>`;
}
function renderTransactions() {
  const purchaseTotal = sum(viewedMonthly().filter(t => t.type === 'expense'));
  return `${filter.view === 'payment' ? statCards() : `<section class="panel view-summary"><strong>Compras feitas em ${monthName(month)}: ${money(purchaseTotal)}</strong><p>Esta visão usa a data da compra. O saldo e as contas a pagar usam a data do pagamento.</p></section>`}<div class="filters"><label>Visualizar por<select id="filter-view"><option value="payment">Pagamento / vencimento</option><option value="purchase">Data da compra</option></select></label><input id="search" aria-label="Buscar lançamentos" placeholder="Buscar descrição ou observação…" value="${escape(filter.search)}"><select id="filter-type" aria-label="Filtrar por tipo"><option value="">Todos os tipos</option><option value="income">Receitas</option><option value="expense">Despesas</option></select><select id="filter-status" aria-label="Filtrar por situação"><option value="">Todas as situações</option><option value="paid">Efetivados</option><option value="pending">Pendentes</option></select><select id="filter-category" aria-label="Filtrar por categoria">${options(true)}</select><select id="filter-paymentMethod" aria-label="Filtrar por meio de pagamento"><option value="">Todos os meios</option><option value="credit">Crédito</option><option value="debit">Débito</option><option value="pix">Pix</option></select><button class="secondary" data-action="csv">${icon('download')} CSV</button></div><section id="transactions-result" class="panel table-panel">${transactionsResult()}</section>`;
}
function renderBudgets() {
  const budgets = state.budgets.filter(b => b.month === month);
  const totalLimit = sum(budgets);
  return `<section class="panel purchase-planner"><div><p class="eyebrow">DECISÃO DE COMPRA</p><h2>À vista ou parcelado?</h2><p>Compare o impacto de uma compra no saldo e nos próximos meses antes de decidir.</p></div><button class="primary" data-action="planner">Simular compra</button></section><div class="panel-heading"><div><h2>Planejamento de ${monthName(month)}</h2><p>Os limites incluem despesas lançadas e parcelas previstas. Total planejado: ${money(totalLimit)}.</p></div><button class="secondary" data-action="budget">＋ Definir limite</button></div>${!budgets.length ? `<section class="panel">${empty('Dê um plano ao seu dinheiro', 'Defina um limite mensal por categoria e acompanhe o quanto já comprometeu.', '<button class="primary" data-action="budget">Criar primeiro orçamento</button>')}</section>` : `<div class="budget-grid">${budgets.map(b => {
    const c = category(b.category); const spent = sum(monthly().filter(t => t.type === 'expense' && t.category === b.category)) + sum(installmentsInMonth().filter(t => t.category === b.category).map(t => ({ amount: t.monthlyAmount }))) + sum(recurringInMonth().filter(t => t.category === b.category)); const remaining = b.amount - spent;
    return `<section class="panel budget-card ${remaining < 0 ? 'over' : ''}"><div class="panel-heading"><h2><i class="color-dot" style="background:${c.color}"></i>${escape(c.name)}</h2><span class="pill">${Math.round(spent / b.amount * 100)}%</span></div><div class="budget-values"><strong>${money(spent)}</strong><small>de ${money(b.amount)}</small></div><progress max="${b.amount}" value="${Math.min(spent, b.amount)}" aria-label="Orçamento de ${escape(c.name)}"></progress><p class="budget-note ${remaining < 0 ? 'negative' : ''}">${remaining < 0 ? `${money(-remaining)} acima do limite` : `${money(remaining)} disponíveis para gastar`}</p><div class="budget-actions"><button class="text-button" data-action="budget" data-id="${b.category}">Editar limite</button><button class="text-button" data-action="delete-budget" data-id="${b.category}">Remover</button></div></section>`;
  }).join('')}</div>`}`;
}
function renderInstallments() {
  const active = installmentsInMonth(); const recurring = recurringInMonth();
  const monthlyTotal = active.filter(item => !item.paid).reduce((total, item) => total + item.monthlyAmount, 0) + recurring.filter(item => !item.paid).reduce((total, item) => total + item.amount, 0);
  const installmentCards = state.installments.map(item => { const amount = installmentAt(item, month); const end = monthOffset(item.startMonth, item.installmentCount - 1); const index = amount === null ? null : installmentNumberAt(item, month); const paid = index && item.paidInstallments.includes(index); return `<article class="panel installment-card ${paid ? 'commitment-paid' : ''}"><div class="panel-heading"><div><span class="tag">${escape(category(item.category).name)}</span><h2>${escape(item.description)}</h2></div><div class="row-actions"><button data-action="edit-installment" data-id="${item.id}" aria-label="Editar ${escape(item.description)}">${icon('edit')}</button><button data-action="delete-installment" data-id="${item.id}" aria-label="Excluir ${escape(item.description)}">${icon('trash')}</button></div></div><div class="installment-amount"><strong>${money(Math.floor(item.totalAmount / item.installmentCount))}</strong><span>por mês · ${item.installmentCount}x</span></div><dl><div><dt>Valor total</dt><dd>${money(item.totalAmount)}</dd></div><div><dt>Período</dt><dd>${monthName(item.startMonth)} — ${monthName(end)}</dd></div><div><dt>Neste mês</dt><dd>${index ? `${index}ª parcela · ${money(amount)}` : month < item.startMonth ? 'Ainda não começou' : 'Finalizado'}</dd></div></dl>${index ? `<button class="${paid ? 'secondary' : 'primary'} commitment-action" data-action="toggle-installment-paid" data-id="${item.id}">${paid ? 'Marcar como pendente' : 'Marcar parcela como paga'}</button>` : ''}</article>`; }).join('');
  const recurringCards = state.recurringExpenses.map(item => { const activeNow = item.startMonth <= month && (!item.endMonth || item.endMonth >= month); const paid = item.paidMonths.includes(month); return `<article class="panel installment-card ${paid ? 'commitment-paid' : ''}"><div class="panel-heading"><div><span class="tag">Recorrente · dia ${item.dueDay}</span><h2>${escape(item.description)}</h2></div><div class="row-actions"><button data-action="edit-recurring" data-id="${item.id}" aria-label="Editar ${escape(item.description)}">${icon('edit')}</button><button data-action="delete-recurring" data-id="${item.id}" aria-label="Excluir ${escape(item.description)}">${icon('trash')}</button></div></div><div class="installment-amount"><strong>${money(item.amount)}</strong><span>todo mês</span></div><dl><div><dt>Categoria</dt><dd>${escape(category(item.category).name)}</dd></div><div><dt>Período</dt><dd>${monthName(item.startMonth)} — ${item.endMonth ? monthName(item.endMonth) : 'sem término'}</dd></div><div><dt>Neste mês</dt><dd>${activeNow ? paid ? 'Pago' : 'Pendente' : 'Fora do período'}</dd></div></dl>${activeNow ? `<button class="${paid ? 'secondary' : 'primary'} commitment-action" data-action="toggle-recurring-paid" data-id="${item.id}">${paid ? 'Marcar como pendente' : 'Marcar mês como pago'}</button>` : ''}</article>`; }).join('');
  return `<section class="commitment-hero"><div><p class="eyebrow">COMPROMISSOS PENDENTES EM ${monthName(month).toUpperCase()}</p><strong>${money(monthlyTotal)}</strong><span>${active.filter(i => !i.paid).length + recurring.filter(i => !i.paid).length} pagamentos previstos neste mês</span></div><div class="hero-actions"><button class="secondary" data-action="recurring">＋ Conta recorrente</button><button class="primary" data-action="installment">＋ Compra parcelada</button></div></section>${!state.installments.length && !state.recurringExpenses.length ? `<section class="panel">${empty('Nenhum compromisso cadastrado', 'Adicione compras parceladas ou contas que se repetem todo mês.')}</section>` : `<div class="commitment-section"><div class="panel-heading"><div><h2>Compras parceladas</h2><p>${state.installments.length} cadastradas</p></div></div><div class="installment-grid">${installmentCards || '<div class="panel empty">Nenhuma compra parcelada.</div>'}</div></div><div class="commitment-section"><div class="panel-heading"><div><h2>Despesas recorrentes</h2><p>Aluguel, assinaturas e contas mensais</p></div></div><div class="installment-grid">${recurringCards || '<div class="panel empty">Nenhuma despesa recorrente.</div>'}</div></div>`}`;
}
function renderGoals() {
  const reserved = reservedForGoals(state.goals); const cash = totals(state.transactions, month).balance;
  return `<section class="panel view-summary"><strong>${money(reserved)} informados como reservados para metas</strong><p>Disponível estimado após reservas: ${money(cash - reserved)}. Os valores guardados são informativos; registre a transferência como lançamento se quiser refletir a saída no caixa. Evite contar a mesma reserva duas vezes.</p></section><div class="panel-heading"><div><h2>${state.goals.length} meta${state.goals.length === 1 ? '' : 's'} em andamento</h2><p>Acompanhe o valor guardado e o prazo de cada objetivo.</p></div><button class="primary" data-action="goal">＋ Nova meta</button></div>${!state.goals.length ? `<section class="panel">${empty('Crie sua primeira meta', 'Defina um objetivo, o valor necessário e quando pretende alcançá-lo.', '<button class="primary" data-action="goal">Criar meta</button>')}</section>` : `<div class="goal-grid">${state.goals.map(goal => { const percent = Math.min(100, Math.round(goal.currentAmount / goal.targetAmount * 100)); const remaining = Math.max(0, goal.targetAmount - goal.currentAmount); return `<article class="panel goal-card"><div class="panel-heading"><div><span class="goal-percent">${percent}%</span><h2>${escape(goal.name)}</h2></div><div class="row-actions"><button data-action="edit-goal" data-id="${goal.id}" aria-label="Editar ${escape(goal.name)}">${icon('edit')}</button><button data-action="delete-goal" data-id="${goal.id}" aria-label="Excluir ${escape(goal.name)}">${icon('trash')}</button></div></div><progress max="${goal.targetAmount}" value="${Math.min(goal.currentAmount, goal.targetAmount)}" aria-label="Progresso da meta ${escape(goal.name)}"></progress><div class="goal-values"><strong>${money(goal.currentAmount)}</strong><span>de ${money(goal.targetAmount)}</span></div><p>Faltam <strong>${money(remaining)}</strong> · prazo ${dateLabel(goal.targetDate)}</p></article>`; }).join('')}</div>`}`;
}
function renderCards() {
  return `<div class="panel-heading"><div><h2>Seus cartões</h2><p>Configure fechamento e vencimento para sugerir a fatura de cada compra. Os totais abaixo incluem compras simples vinculadas ao cartão; parcelamentos permanecem na área própria.</p></div><button class="primary" data-action="new-card">＋ Novo cartão</button></div>${!state.cards.length ? `<section class="panel">${empty('Nenhum cartão cadastrado', 'Cadastre um cartão para organizar as próximas faturas.', '<button class="primary" data-action="new-card">Cadastrar cartão</button>')}</section>` : `<div class="card-grid">${state.cards.map(card => { const purchases = state.transactions.filter(t => t.cardId === card.id && t.paymentMethod === 'credit' && t.status === 'pending'); const nextDate = purchases.map(t => t.date).sort()[0]; const invoice = nextDate ? purchases.filter(t => t.date.slice(0, 7) === nextDate.slice(0, 7)) : []; return `<article class="panel card-overview"><div class="panel-heading"><div><h2>${escape(card.name)}</h2><p>Fecha dia ${card.closingDay} · vence dia ${card.dueDay}</p></div><div class="row-actions"><button data-action="edit-card" data-id="${card.id}" aria-label="Editar ${escape(card.name)}" title="Editar cartão">${icon('edit')}</button><button data-action="delete-card" data-id="${card.id}" aria-label="Excluir ${escape(card.name)}" title="Excluir cartão">${icon('trash')}</button></div></div><strong>${money(sum(invoice))}</strong><p>${nextDate ? `${nextDate < today() ? 'Fatura em atraso' : 'Próxima fatura pendente'}: ${monthName(nextDate.slice(0, 7))} · ${invoice.length} compra${invoice.length === 1 ? '' : 's'}` : 'Nenhuma compra pendente neste cartão.'}</p>${invoice.length ? `<ul>${invoice.map(t => `<li><span>${escape(t.description)}</span><strong>${money(t.amount)}</strong></li>`).join('')}</ul>` : ''}</article>`; }).join('')}</div>`}`;
}
function agendaItems() {
  const start = today(); const end = new Date(start + 'T12:00:00'); end.setDate(end.getDate() + 30);
  const until = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  const items = state.transactions.filter(t => t.status === 'pending' && t.date <= until).map(t => ({ date: t.date, description: t.description, amount: t.amount, type: t.type, source: 'Lançamento' }));
  for (const offset of [0, 1]) { const key = monthOffset(start.slice(0, 7), offset); for (const item of installmentsInMonth(key).filter(i => !i.paid)) items.push({ date: `${key}-${String(item.dueDay).padStart(2, '0')}`, description: item.description, amount: item.monthlyAmount, type: 'expense', source: 'Parcela' }); for (const item of recurringInMonth(key).filter(i => !i.paid)) items.push({ date: `${key}-${String(item.dueDay).padStart(2, '0')}`, description: item.description, amount: item.amount, type: 'expense', source: 'Recorrente' }); }
  return items.filter(item => item.date <= until).sort((a,b) => a.date.localeCompare(b.date));
}
function renderCalendar() {
  const items = agendaItems();
  return `<section class="panel view-summary"><strong>Próximos 30 dias</strong><p>Inclui lançamentos pendentes, parcelas e contas recorrentes. Vencidos ainda pendentes aparecem no início.</p></section><section class="panel calendar-list">${items.length ? items.map(item => `<div class="calendar-item"><time datetime="${item.date}">${dateLabel(item.date)}</time><div><strong>${escape(item.description)}</strong><small>${item.source}${item.date < today() ? ' · Vencido' : ''}</small></div><strong class="${item.type === 'income' ? 'positive' : ''}">${item.type === 'income' ? '+' : '−'} ${money(item.amount)}</strong></div>`).join('') : empty('Agenda livre', 'Nenhum vencimento pendente nos próximos 30 dias.')}</section>`;
}
function renderAdmin() {
  if (!currentUser?.isAdmin) return `<section class="panel">${empty('Acesso restrito', 'Somente o administrador pode gerenciar usuários.')}</section>`;
  if (!adminUsers) { queueMicrotask(loadAdminUsers); return '<section class="panel empty">Carregando usuários…</section>'; }
  return `<div class="panel-heading"><div><h2>${adminUsers.length} usuário${adminUsers.length === 1 ? '' : 's'} cadastrado${adminUsers.length === 1 ? '' : 's'}</h2><p>Crie contas, ajuste acessos e atualize dados.</p></div><button class="primary" data-action="new-user">＋ Novo usuário</button></div><section class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>USUÁRIO</th><th>E-MAIL</th><th>ACESSO</th><th>ÚLTIMO ACESSO</th><th>AÇÕES</th></tr></thead><tbody>${adminUsers.map(user => `<tr><td><strong>${escape(user.name)}</strong>${user.isAdmin ? '<small class="table-note">Administrador</small>' : ''}</td><td>${escape(user.email)}</td><td><span class="status ${user.blocked ? 'pending' : 'paid'}">${user.blocked ? 'Bloqueado' : 'Ativo'}</span></td><td>${user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString('pt-BR') : 'Nunca acessou'}</td><td><div class="admin-actions"><button class="text-button" data-action="edit-user" data-id="${user.id}">Editar</button>${user.id !== currentUser.id ? `<button class="text-button" data-action="toggle-user-block" data-id="${user.id}">${user.blocked ? 'Desbloquear' : 'Bloquear'}</button><button class="text-button danger-text" data-action="delete-user" data-id="${user.id}">Excluir</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div></section>`;
}
async function loadAdminUsers() { try { adminUsers = await request('/admin/users'); if (page === 'admin') render(); } catch (error) { $('#page-content').innerHTML = `<section class="panel">${empty('Não foi possível carregar', escape(error.message), '<button class="secondary" data-action="reload-users">Tentar novamente</button>')}</section>`; } }
function renderCategories() {
  return `<section class="panel" style="margin-bottom:24px"><h2>Nova categoria</h2><form id="category-form" class="inline-form"><label>Nome<input name="name" placeholder="Ex.: Pets" maxlength="40" required></label><label class="color-field">Cor<input name="color" type="color" value="#5277cf"></label><button class="primary">Adicionar categoria</button></form><p class="muted" style="font-size:.81rem">As categorias ficam disponíveis em receitas, despesas e orçamentos.</p></section><div class="category-grid">${state.categories.map(c => { const records = state.transactions.filter(t => t.category === c.id).length; const installments = state.installments.filter(item => item.category === c.id).length; const recurring = state.recurringExpenses.filter(item => item.category === c.id).length; return `<article class="panel category-item"><i class="color-dot" style="background:${c.color}"></i><strong>${escape(c.name)}</strong><small>${records} lançamentos · ${installments + recurring} compromissos</small>${c.id === 'outros' ? '<span class="category-required">Categoria padrão</span>' : `<button class="row-delete category-delete" data-action="delete-category" data-id="${escape(c.id)}" aria-label="Remover ${escape(c.name)}" title="Remover categoria">${icon('trash')}</button>`}</article>`; }).join('')}</div>`;
}
function renderSettings() {
  return `<div class="settings-grid"><section class="panel">${icon('download')}<h2>Backup completo</h2><p>Baixe lançamentos, parcelamentos, categorias e orçamentos em um arquivo JSON. Guarde uma cópia fora deste computador.</p><button class="primary" data-action="backup">${icon('download')} Baixar backup</button></section><section class="panel">${icon('upload')}<h2>Restaurar seus dados</h2><p>Recupere um backup criado pelo Nexora. A restauração substitui os dados atuais; você poderá revisar a quantidade de registros antes de confirmar.</p><button class="secondary" data-action="restore">${icon('upload')} Selecionar backup</button><input type="file" id="backup-file" accept=".json,application/json" hidden></section><section class="panel">${icon('list')}<h2>Levar para a planilha</h2><p>Exporte os lançamentos do mês selecionado em CSV, compatível com Excel e outras planilhas. Na tela Lançamentos, a exportação respeita seus filtros.</p><button class="secondary" data-action="csv">Exportar ${monthName(month)}</button></section><section class="panel">${icon('leaf')}<h2>Explore sem alterar seus dados</h2><p>Veja um exemplo de finanças organizadas. A demonstração usa dados fictícios temporários e mantém seus registros reais separados.</p><button class="secondary" data-action="demo">Explorar demonstração ↗</button></section></div><div class="panel settings-note"><strong>Onde seus dados ficam?</strong><p>Seus registros ficam protegidos no banco de dados e vinculados exclusivamente à sua conta. Faça backups regularmente.</p><p class="muted">${state.transactions.length} lançamentos · ${state.installments.length} parcelamentos · ${state.categories.length} categorias · ${state.budgets.length} orçamentos</p></div>`;
}
function render() {
  page = Object.hasOwn(titles, location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
  $('#page-title').textContent = titles[page][0]; $('#breadcrumb').textContent = titles[page][0]; $('#page-description').textContent = titles[page][1];
  document.title = `${titles[page][0]} · Nexora`;
  $('#month-label').textContent = monthName(month).replace(/^./, letter => letter.toUpperCase());
  $('#month-trigger').hidden = page === 'cards' || page === 'calendar' || page === 'complete';
  document.querySelectorAll('[data-page]').forEach(a => { a.classList.toggle('active', a.dataset.page === page); if (a.dataset.page === page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  $('#demo-banner').hidden = !demo;
  if (!state) return;
  $('#page-content').innerHTML = ({ overview: renderOverview, complete: renderComplete, transactions: renderTransactions, cards: renderCards, calendar: renderCalendar, budgets: renderBudgets, installments: renderInstallments, goals: renderGoals, categories: renderCategories, admin: renderAdmin, settings: renderSettings })[page]();
  if (page === 'transactions') for (const key of ['type', 'status', 'category', 'paymentMethod', 'view']) $(`#filter-${key}`).value = filter[key];
}

// 3. Alterações: aguarde o servidor salvar antes de atualizar a interface.
async function mutate(path, method, value, message) { state = await request(path, method, value); render(); if (message) toast(message); }
function openTransaction(id) {
  if (!ensureReal() || !state) return;
  const form = $('#transaction-form'); form.reset(); form.querySelector('.form-error').textContent = '';
  form.elements.category.innerHTML = options();
  form.elements.cardId.innerHTML = '<option value="">Sem cartão cadastrado</option>' + state.cards.map(card => `<option value="${card.id}">${escape(card.name)}</option>`).join('');
  form.elements.date.value = month === today().slice(0,7) ? today() : month + '-01';
  form.elements.purchaseDate.value = form.elements.date.value;
  form.elements.category.value = 'outros';
  const item = state.transactions.find(t => t.id === id);
  $('#transaction-title').textContent = item ? 'Editar lançamento' : 'Novo lançamento';
  if (item) for (const key of ['id', 'description', 'type', 'status', 'date', 'category', 'notes']) form.elements[key].value = item[key];
  if (item) { form.elements.purchaseDate.value = item.purchaseDate || item.date; form.elements.paymentMethod.value = item.paymentMethod || ''; form.elements.cardId.value = item.cardId || ''; }
  if (item) form.elements.amount.value = (item.amount / 100).toFixed(2).replace('.', ',');
  syncPurchaseFields(form);
  $('#transaction-dialog').showModal(); form.elements.description.focus();
}
function syncPurchaseFields(form) {
  const expense = form.elements.type.value === 'expense';
  $('#purchase-fields').hidden = !expense;
  $('#purchase-help').hidden = !expense;
  form.elements.paymentMethod.disabled = !expense;
  form.elements.purchaseDate.disabled = !expense;
  const credit = expense && form.elements.paymentMethod.value === 'credit';
  $('#card-field').hidden = !credit;
  form.elements.cardId.disabled = !credit;
  if (!credit) form.elements.cardId.value = '';
  const immediate = expense && ['debit', 'pix'].includes(form.elements.paymentMethod.value);
  if (immediate) { form.elements.status.value = 'paid'; form.elements.date.value = form.elements.purchaseDate.value || form.elements.date.value; }
  form.elements.status.disabled = immediate;
  form.elements.date.disabled = immediate;
  form.elements.purchaseDate.required = expense && !!form.elements.paymentMethod.value;
}
function openCard(id) {
  if (!ensureReal()) return;
  const form = $('#card-form'); form.reset(); form.querySelector('.form-error').textContent = '';
  const card = state.cards.find(item => item.id === id);
  $('#card-title').textContent = card ? 'Editar cartão' : 'Novo cartão';
  form.elements.id.value = card?.id || '';
  form.elements.name.value = card?.name || '';
  form.elements.closingDay.value = card?.closingDay || 10;
  form.elements.dueDay.value = card?.dueDay || 20;
  $('#card-dialog').showModal(); form.elements.name.focus();
}
function openSettle(id) {
  if (!ensureReal()) return;
  const item = state.transactions.find(t => t.id === id);
  if (!item || item.status !== 'pending') return;
  const form = $('#settle-form'); form.reset(); form.querySelector('.form-error').textContent = '';
  form.elements.id.value = id; form.elements.paidDate.value = today();
  $('#settle-title').textContent = item.type === 'income' ? 'Confirmar recebimento' : 'Confirmar pagamento';
  $('#settle-date-label').textContent = item.type === 'income' ? 'Data em que o dinheiro entrou' : 'Data em que o dinheiro saiu';
  $('#settle-description').textContent = `${item.description} · ${money(item.amount)} · vencimento ${dateLabel(item.date)}`;
  $('#settle-dialog').showModal(); form.elements.paidDate.focus();
}
function openBudget(id) {
  if (!ensureReal()) return;
  const form = $('#budget-form'); form.reset(); form.querySelector('.form-error').textContent = ''; form.elements.category.innerHTML = options();
  const item = state.budgets.find(b => b.month === month && b.category === id);
  form.elements.category.disabled = !!item;
  if (item) { form.elements.category.value = item.category; form.elements.amount.value = (item.amount / 100).toFixed(2).replace('.', ','); }
  $('#budget-dialog').showModal();
}
function updateInstallmentPreview() {
  const form = $('#installment-form');
  try {
    const total = toCents(form.elements.totalAmount.value); const count = Number(form.elements.installmentCount.value);
    if (!Number.isInteger(count) || count < 2 || count > 120) throw new Error();
    $('#installment-preview').innerHTML = `<strong>${count}x de aproximadamente ${money(Math.floor(total / count))}</strong><span>Última parcela em ${monthName(monthOffset(form.elements.startMonth.value, count - 1))}</span>`;
  } catch { $('#installment-preview').innerHTML = '<span>Informe o valor e as parcelas para ver a previsão.</span>'; }
}
function openInstallment(value = {}) {
  if (!ensureReal()) return;
  const item = typeof value === 'string' ? state.installments.find(entry => entry.id === value) : null; const prefill = item || value;
  const form = $('#installment-form'); form.reset(); form.querySelector('.form-error').textContent = '';
  form.elements.category.innerHTML = options(); form.elements.category.value = 'outros'; form.elements.startMonth.value = month; form.elements.installmentCount.value = prefill.installmentCount || 12;
  form.elements.dueDay.value = 10; form.elements.description.value = prefill.description || ''; form.elements.totalAmount.value = prefill.totalAmount || '';
  if (item) { form.elements.id.value = item.id; form.elements.totalAmount.value = (item.totalAmount / 100).toFixed(2).replace('.', ','); form.elements.startMonth.value = item.startMonth; form.elements.dueDay.value = item.dueDay; form.elements.category.value = item.category; }
  $('#installment-title').textContent = item ? 'Editar compra parcelada' : 'Adicionar compra parcelada';
  updateInstallmentPreview(); $('#installment-dialog').showModal(); form.elements.description.focus();
}
function openRecurring(id) {
  if (!ensureReal()) return; const form = $('#recurring-form'); form.reset(); form.querySelector('.form-error').textContent = ''; form.elements.category.innerHTML = options(); form.elements.category.value = 'outros'; form.elements.startMonth.value = month; form.elements.dueDay.value = 10;
  const item = state.recurringExpenses.find(entry => entry.id === id); $('#recurring-title').textContent = item ? 'Editar despesa recorrente' : 'Nova despesa recorrente';
  if (item) { form.elements.id.value = item.id; form.elements.description.value = item.description; form.elements.amount.value = (item.amount / 100).toFixed(2).replace('.', ','); form.elements.startMonth.value = item.startMonth; form.elements.endMonth.value = item.endMonth; form.elements.dueDay.value = item.dueDay; form.elements.category.value = item.category; }
  $('#recurring-dialog').showModal(); form.elements.description.focus();
}
function openGoal(id) {
  if (!ensureReal()) return; const form = $('#goal-form'); form.reset(); form.querySelector('.form-error').textContent = ''; form.elements.currentAmount.value = '0,00'; form.elements.targetDate.value = `${Number(month.slice(0,4)) + 1}-${month.slice(5)}-01`;
  const item = state.goals.find(entry => entry.id === id); $('#goal-title').textContent = item ? 'Editar meta' : 'Nova meta';
  if (item) { form.elements.id.value = item.id; form.elements.name.value = item.name; form.elements.targetAmount.value = (item.targetAmount / 100).toFixed(2).replace('.', ','); form.elements.currentAmount.value = (item.currentAmount / 100).toFixed(2).replace('.', ','); form.elements.targetDate.value = item.targetDate; }
  $('#goal-dialog').showModal(); form.elements.name.focus();
}
function updatePlanner() {
  const form = $('#planner-form'); const button = form.querySelector('[data-action="save-simulation"]');
  try {
    const cash = toCents(form.elements.cashAmount.value); const financed = toCents(form.elements.financedAmount.value); const count = Number(form.elements.installmentCount.value);
    if (!Number.isInteger(count) || count < 2 || count > 120) throw new Error('Parcelas inválidas.');
    const perMonth = Math.floor(financed / count); const selected = totals(state.transactions, month); const obligations = installmentsInMonth().filter(item => !item.paid).reduce((total, item) => total + item.monthlyAmount, 0) + recurringInMonth().filter(item => !item.paid).reduce((total, item) => total + item.amount, 0); const monthlyFree = selected.income - selected.expense - selected.payable - obligations;
    const difference = financed - cash; const afterCash = selected.balance - cash;
    $('#planner-result').innerHTML = `<div class="comparison-card"><span>PIX / À VISTA</span><strong>${money(cash)}</strong><p>Saldo após a compra: <b class="${afterCash < 0 ? 'negative' : ''}">${money(afterCash)}</b></p></div><div class="comparison-card"><span>PARCELADO</span><strong>${count}x de ${money(perMonth)}</strong><p>Sobra mensal estimada: <b class="${monthlyFree - perMonth < 0 ? 'negative' : ''}">${money(monthlyFree - perMonth)}</b></p><small>${difference > 0 ? `${money(difference)} a mais no total` : difference < 0 ? `${money(-difference)} mais barato que à vista` : 'Mesmo valor total'}</small></div>`;
    button.disabled = false;
  } catch { $('#planner-result').innerHTML = '<p class="muted">Preencha os valores para comparar o impacto.</p>'; button.disabled = true; }
}
function openPlanner() { const form = $('#planner-form'); form.reset(); form.elements.installmentCount.value = 12; form.querySelector('.form-error').textContent = ''; updatePlanner(); $('#planner-dialog').showModal(); form.elements.description.focus(); }
function openUser(id) {
  const form = $('#user-form'); form.reset(); form.querySelector('.form-error').textContent = ''; form.elements.id.value = id || '';
  const user = adminUsers?.find(item => item.id === id); $('#user-title').textContent = user ? 'Editar usuário' : 'Novo usuário';
  $('#password-label').textContent = user ? 'Nova senha (opcional)' : 'Senha temporária'; $('#password-help').textContent = user ? 'Deixe em branco para manter a senha atual.' : 'Mínimo de 8 caracteres.'; form.elements.password.required = !user;
  if (user) { form.elements.name.value = user.name; form.elements.email.value = user.email; }
  $('#user-dialog').showModal(); form.elements.name.focus();
}
function confirmAction(message, actionLabel = 'Confirmar') {
  return new Promise(resolve => {
    const dialog = $('#confirm-dialog'); $('#confirm-message').textContent = message; $('#confirm-ok').textContent = actionLabel;
    const controller = new AbortController(); const finish = value => { controller.abort(); dialog.close(); resolve(value); };
    $('#confirm-ok').addEventListener('click', () => finish(true), { signal: controller.signal });
    $('#confirm-cancel').addEventListener('click', () => finish(false), { signal: controller.signal });
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); }, { signal: controller.signal });
    dialog.showModal(); $('#confirm-cancel').focus();
  });
}
function download(content, filename, type) {
  const link = document.createElement('a'); const url = URL.createObjectURL(new Blob([content], { type }));
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportCsv() {
  const rows = page === 'transactions' ? filteredRows() : ordered(monthly());
  if (!rows.length) return toast('Não há lançamentos para exportar neste período.');
  // Aspas protegem separadores; apóstrofo impede fórmulas executáveis em planilhas.
  const cell = value => '"' + String(value).replace(/^(\s*[=+@-]|[\t\r\n])/, c => "'" + c).replace(/"/g, '""') + '"';
  const data = [['Descrição', 'Tipo', 'Categoria', 'Data da compra', 'Meio de pagamento', 'Cartão', 'Pagamento efetivo / previsto', 'Vencimento original', 'Situação', 'Valor (R$)', 'Observação'], ...rows.map(t => [t.description, t.type === 'income' ? 'Receita' : 'Despesa', category(t.category).name, t.type === 'expense' ? dateLabel(t.purchaseDate || t.date) : '', { credit: 'Crédito', debit: 'Débito', pix: 'Pix' }[t.paymentMethod] || '', t.cardId ? cardName(t.cardId) : '', dateLabel(t.date), dateLabel(t.dueDate || t.date), t.status === 'paid' ? 'Efetivado' : 'Pendente', (t.amount / 100).toFixed(2).replace('.', ','), t.notes])];
  download('\uFEFF' + data.map(row => row.map(cell).join(';')).join('\r\n'), `nexora-${demo ? 'demo-' : ''}${month}.csv`, 'text/csv;charset=utf-8'); toast('CSV exportado.');
}
function startDemo() {
  if (demo) { location.hash = 'overview'; return; }
  realState = state; demo = true; state = structuredClone(state); state.transactions = []; state.budgets = []; state.installments = []; state.recurringExpenses = []; state.goals = [];
  // Usa as categorias iniciais mesmo após a restauração de um backup personalizado.
  const demoCategories = [{ id:'salario',name:'Salário',color:'#17876b' },{id:'freelance',name:'Freelance',color:'#5277cf'},{id:'moradia',name:'Moradia',color:'#397a69'},{id:'alimentacao',name:'Alimentação',color:'#e1a34b'},{id:'transporte',name:'Transporte',color:'#6387cb'},{id:'saude',name:'Saúde',color:'#b97ab2'},{id:'lazer',name:'Lazer',color:'#d47c62'},{id:'educacao',name:'Educação',color:'#779853'},{id:'outros',name:'Outros',color:'#80908c'}];
  state.categories = demoCategories;
  const add = (description, amount, type, category, day, status = 'paid', target = month) => state.transactions.push({ id: crypto.randomUUID(), description, amount, type, category, date: `${target}-${String(day).padStart(2,'0')}`, status, notes: '' });
  for (let offset = 5; offset > 0; offset--) {
    const date = new Date(month + '-15T12:00:00'); date.setMonth(date.getMonth() - offset); const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    add('Receitas do mês', 620000 + (5-offset)*32000, 'income', 'salario', 5, 'paid', key);
    add('Despesas do mês', 470000 + (5-offset)*24000, 'expense', 'outros', 10, 'paid', key);
  }
  add('Salário', 780000, 'income', 'salario', 5); add('Projeto freelance', 150000, 'income', 'freelance', 10);
  add('Aluguel', 220000, 'expense', 'moradia', 5); add('Supermercado', 64890, 'expense', 'alimentacao', 9); add('Restaurante', 18500, 'expense', 'alimentacao', 7); add('Combustível', 25000, 'expense', 'transporte', 8); add('Cinema e jantar', 21000, 'expense', 'lazer', 6); add('Plano de saúde', 42000, 'expense', 'saude', 3);
  add('Internet', 11990, 'expense', 'moradia', 15, 'pending'); add('Energia elétrica', 18640, 'expense', 'moradia', 18, 'pending'); add('Curso de inglês', 34900, 'expense', 'educacao', 22, 'pending'); add('Projeto de identidade visual', 80000, 'income', 'freelance', 25, 'pending');
  state.budgets = [{month,category:'moradia',amount:280000},{month,category:'alimentacao',amount:100000},{month,category:'transporte',amount:50000},{month,category:'lazer',amount:20000},{month,category:'saude',amount:60000},{month,category:'educacao',amount:40000}];
  location.hash = 'overview'; render();
}

// 4. Eventos do usuário, agrupados para facilitar a leitura.
$('#month-trigger').addEventListener('click', () => { const form = $('#month-form'); form.elements.month.value = month.slice(5); form.elements.year.value = month.slice(0, 4); $('#month-dialog').showModal(); form.elements.month.focus(); });
$('#month-form').addEventListener('submit', event => { event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return; month = `${form.elements.year.value.padStart(4, '0')}-${form.elements.month.value}`; filter.page = 1; $('#month-dialog').close(); render(); });
window.addEventListener('hashchange', render);
$('#new-transaction').addEventListener('click', () => openTransaction());
$('#transaction-form').addEventListener('change', event => {
  const form = event.currentTarget;
  if (['paymentMethod', 'purchaseDate', 'cardId'].includes(event.target.name) && form.elements.paymentMethod.value === 'credit' && (!form.elements.id.value || event.target.name !== 'paymentMethod')) {
    form.elements.status.value = 'pending';
    const purchase = form.elements.purchaseDate.value || form.elements.date.value;
    const card = state.cards.find(item => item.id === form.elements.cardId.value);
    if (purchase && card) form.elements.date.value = cardDueDate(purchase, card);
    else if (purchase && event.target.name === 'paymentMethod') { const next = new Date(Number(purchase.slice(0, 4)), Number(purchase.slice(5, 7)), 1); next.setDate(Math.min(Number(purchase.slice(8)), new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate())); form.elements.date.value = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`; }
  }
  if (event.target.name === 'paymentMethod' || event.target.name === 'type' || event.target.name === 'purchaseDate') syncPurchaseFields(form);
});
$('#exit-demo').addEventListener('click', async () => { demo = false; state = realState; realState = null; render(); try { state = await request(); render(); } catch (error) { toast(error.message); } });
document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$('#transaction-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!ensureReal()) return; const form = event.currentTarget; const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
  try {
    const fields = Object.fromEntries(new FormData(form)); const id = fields.id; delete fields.id; fields.amount = toCents(fields.amount);
    if (fields.type === 'income') { fields.paymentMethod = ''; fields.purchaseDate = fields.date; }
    if (!fields.purchaseDate) fields.purchaseDate = fields.date;
    if (['debit', 'pix'].includes(fields.paymentMethod)) { fields.status = 'paid'; fields.date = fields.purchaseDate; }
    if (!fields.cardId) fields.cardId = '';
    const existing = state.transactions.find(item => item.id === id);
    fields.dueDate = fields.status === 'pending' ? fields.date : existing?.dueDate && existing.dueDate !== existing.date ? existing.dueDate : fields.date;
    await mutate(id ? `/transactions/${id}` : '/transactions', id ? 'PUT' : 'POST', fields, id ? 'Lançamento atualizado.' : 'Lançamento salvo.'); $('#transaction-dialog').close();
  } catch (error) { form.querySelector('.form-error').textContent = error.message; } finally { submit.disabled = false; }
});
$('#card-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!ensureReal()) return;
  const form = event.currentTarget; const button = form.querySelector('[type="submit"]'); button.disabled = true;
  try { const id = form.elements.id.value; await mutate(id ? `/cards/${id}` : '/cards', id ? 'PUT' : 'POST', { name: form.elements.name.value, closingDay: Number(form.elements.closingDay.value), dueDay: Number(form.elements.dueDay.value) }, id ? 'Cartão atualizado.' : 'Cartão cadastrado.'); $('#card-dialog').close(); }
  catch (error) { form.querySelector('.form-error').textContent = error.message; } finally { button.disabled = false; }
});
$('#settle-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!ensureReal()) return;
  const form = event.currentTarget; const button = form.querySelector('[type="submit"]'); button.disabled = true;
  try { const item = state.transactions.find(t => t.id === form.elements.id.value); const paidDate = form.elements.paidDate.value; if (item.type === 'expense' && paidDate < (item.purchaseDate || item.date)) throw new Error('O pagamento não pode ser anterior à compra.'); await mutate(`/transactions/${item.id}`, 'PUT', { ...item, status: 'paid', date: paidDate, dueDate: item.dueDate || item.date }, item.type === 'income' ? 'Recebimento registrado.' : 'Pagamento registrado.'); $('#settle-dialog').close(); }
  catch (error) { form.querySelector('.form-error').textContent = error.message; } finally { button.disabled = false; }
});
$('#budget-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!ensureReal()) return; const form = event.currentTarget; const button = form.querySelector('.primary'); button.disabled = true;
  try { await mutate('/budgets', 'PUT', { month, category: form.elements.category.value, amount: toCents(form.elements.amount.value) }, 'Orçamento salvo.'); $('#budget-dialog').close(); }
  catch (error) { form.querySelector('.form-error').textContent = error.message; } finally { button.disabled = false; }
});
$('#installment-form').addEventListener('input', updateInstallmentPreview);
$('#installment-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!ensureReal()) return; const form = event.currentTarget; const button = form.querySelector('.primary'); button.disabled = true;
  try { const id = form.elements.id.value; const previous = state.installments.find(item => item.id === id); await mutate(id ? `/installments/${id}` : '/installments', id ? 'PUT' : 'POST', { description: form.elements.description.value, totalAmount: toCents(form.elements.totalAmount.value), installmentCount: Number(form.elements.installmentCount.value), startMonth: form.elements.startMonth.value, dueDay: Number(form.elements.dueDay.value), category: form.elements.category.value, paidInstallments: (previous?.paidInstallments || []).filter(number => number <= Number(form.elements.installmentCount.value)) }, id ? 'Parcelamento atualizado.' : 'Compra parcelada adicionada.'); $('#installment-dialog').close(); }
  catch (error) { form.querySelector('.form-error').textContent = error.message; } finally { button.disabled = false; }
});
$('#recurring-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!ensureReal()) return; const form = event.currentTarget; const button = form.querySelector('.primary'); button.disabled = true;
  try { const id = form.elements.id.value; const previous = state.recurringExpenses.find(item => item.id === id); await mutate(id ? `/recurring-expenses/${id}` : '/recurring-expenses', id ? 'PUT' : 'POST', { description: form.elements.description.value, amount: toCents(form.elements.amount.value), startMonth: form.elements.startMonth.value, endMonth: form.elements.endMonth.value, dueDay: Number(form.elements.dueDay.value), category: form.elements.category.value, paidMonths: previous?.paidMonths || [] }, id ? 'Despesa recorrente atualizada.' : 'Despesa recorrente adicionada.'); $('#recurring-dialog').close(); }
  catch (error) { form.querySelector('.form-error').textContent = error.message; } finally { button.disabled = false; }
});
$('#goal-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!ensureReal()) return; const form = event.currentTarget; const button = form.querySelector('.primary'); button.disabled = true;
  try { const id = form.elements.id.value; const saved = form.elements.currentAmount.value.trim(); await mutate(id ? `/goals/${id}` : '/goals', id ? 'PUT' : 'POST', { name: form.elements.name.value, targetAmount: toCents(form.elements.targetAmount.value), currentAmount: /^0([,.]0{1,2})?$/.test(saved) ? 0 : toCents(saved), targetDate: form.elements.targetDate.value }, id ? 'Meta atualizada.' : 'Meta criada.'); $('#goal-dialog').close(); }
  catch (error) { form.querySelector('.form-error').textContent = error.message; } finally { button.disabled = false; }
});
$('#planner-form').addEventListener('input', updatePlanner);
$('#planner-form').querySelector('[data-action="save-simulation"]').addEventListener('click', () => { const form = $('#planner-form'); const prefill = { description: form.elements.description.value, totalAmount: form.elements.financedAmount.value, installmentCount: Number(form.elements.installmentCount.value) }; $('#planner-dialog').close(); openInstallment(prefill); });
$('#user-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('.primary'); button.disabled = true;
  try { const fields = Object.fromEntries(new FormData(form)); const id = fields.id; delete fields.id; await request(id ? `/admin/users/${id}` : '/admin/users', id ? 'PUT' : 'POST', fields); if (id === currentUser.id) { currentUser = await request('/me'); updateLoggedUser(); } adminUsers = await request('/admin/users'); form.closest('dialog').close(); render(); toast(id ? 'Usuário atualizado.' : 'Usuário criado.'); }
  catch (error) { form.querySelector('.form-error').textContent = error.message; } finally { button.disabled = false; }
});
$('#page-content').addEventListener('input', event => {
  if (event.target.id === 'search') { filter.search = event.target.value; filter.page = 1; $('#transactions-result').innerHTML = transactionsResult(); }
  if (event.target.id === 'report-search') { reportFilter.search = event.target.value; reportFilter.page = 1; $('#complete-results').innerHTML = completeBody(); }
});
$('#page-content').addEventListener('change', async event => {
  const reportKey = { 'report-kind': 'kind', 'report-from': 'from', 'report-to': 'to' }[event.target.id];
  if (reportKey) { reportFilter[reportKey] = event.target.value; reportFilter.page = 1; $('#complete-results').innerHTML = completeBody(); }
  const key = event.target.id.replace('filter-', '');
  if (['type', 'status', 'category', 'paymentMethod', 'view'].includes(key)) { filter[key] = event.target.value; filter.page = 1; if (key === 'view') render(); else $('#transactions-result').innerHTML = transactionsResult(); }
  if (event.target.id === 'backup-file' && event.target.files[0] && ensureReal()) {
    const file = event.target.files[0];
    try {
      if (file.size > 15 * 1024 * 1024) throw new Error('O backup deve ter até 15 MB.');
      const backup = JSON.parse(await file.text());
      if (backup.version !== 1 || !Array.isArray(backup.transactions) || !Array.isArray(backup.categories) || !Array.isArray(backup.budgets)) throw new Error('Arquivo de backup incompatível.');
      if (await confirmAction(`Restaurar ${backup.transactions.length} lançamentos, ${backup.categories.length} categorias e ${backup.budgets.length} orçamentos? Isso substitui todos os seus dados atuais. Baixe um backup antes se quiser preservá-los.`, 'Substituir e restaurar')) await mutate('/restore', 'POST', backup, 'Backup restaurado.');
    } catch (error) { toast(error instanceof SyntaxError ? 'O arquivo não contém um JSON válido.' : error.message); }
    finally { event.target.value = ''; }
  }
});
$('#page-content').addEventListener('submit', async event => {
  if (event.target.id !== 'category-form') return; event.preventDefault(); if (!ensureReal()) return;
  const button = event.target.querySelector('button'); button.disabled = true;
  try { await mutate('/categories', 'POST', Object.fromEntries(new FormData(event.target)), 'Categoria adicionada.'); } catch(error) { toast(error.message); } finally { button.disabled = false; }
});
$('#page-content').addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button) return; const { action, id } = button.dataset;
  if (action === 'new' || action === 'edit') return openTransaction(id);
  if (action === 'new-card' || action === 'edit-card') return openCard(id);
  if (action === 'settle') return openSettle(id);
  if (action === 'budget') return openBudget(id);
  if (action === 'installment') return openInstallment();
  if (action === 'edit-installment') return openInstallment(id);
  if (action === 'recurring' || action === 'edit-recurring') return openRecurring(id);
  if (action === 'goal' || action === 'edit-goal') return openGoal(id);
  if (action === 'planner') return openPlanner();
  if (action === 'new-user' || action === 'edit-user') return openUser(id);
  if (action === 'reload-users') { adminUsers = null; return render(); }
  if (action === 'demo') return startDemo();
  if (action === 'csv') return exportCsv();
  if (action === 'report-clear') { reportFilter = { search: '', kind: '', from: '', to: '', page: 1 }; return render(); }
  if (action === 'report-previous' || action === 'report-next') { reportFilter.page += action === 'report-next' ? 1 : -1; $('#complete-results').innerHTML = completeBody(); return; }
  if (action === 'previous' || action === 'next') { filter.page += action === 'next' ? 1 : -1; $('#transactions-result').innerHTML = transactionsResult(); return; }
  if (!ensureReal()) return;
  button.disabled = true;
  try {
    if (action === 'delete') { const item = state.transactions.find(t => t.id === id); if (await confirmAction(`Excluir “${item.description}”, no valor de ${money(item.amount)}?`, 'Excluir lançamento')) await mutate(`/transactions/${id}`, 'DELETE', {}, 'Lançamento excluído.'); }
    if (action === 'delete-card') { const card = state.cards.find(item => item.id === id); if (await confirmAction(`Excluir o cartão “${card.name}”? Compras vinculadas precisam ser editadas antes.`, 'Excluir cartão')) await mutate(`/cards/${id}`, 'DELETE', {}, 'Cartão excluído.'); }
    if (action === 'delete-budget' && await confirmAction('Remover este limite mensal? Seus lançamentos serão mantidos.', 'Remover limite')) await mutate('/budgets', 'DELETE', { month, category: id }, 'Limite removido.');
    if (action === 'delete-installment') { const item = state.installments.find(entry => entry.id === id); if (await confirmAction(`Excluir o parcelamento de “${item.description}”?`, 'Excluir parcelamento')) await mutate(`/installments/${id}`, 'DELETE', {}, 'Parcelamento excluído.'); }
    if (action === 'toggle-installment-paid') { const item = state.installments.find(entry => entry.id === id); const number = installmentNumberAt(item, month); const paidInstallments = item.paidInstallments.includes(number) ? item.paidInstallments.filter(value => value !== number) : [...item.paidInstallments, number]; await mutate(`/installments/${id}`, 'PUT', { ...item, paidInstallments }, item.paidInstallments.includes(number) ? 'Parcela voltou para pendente.' : 'Parcela marcada como paga.'); }
    if (action === 'delete-recurring') { const item = state.recurringExpenses.find(entry => entry.id === id); if (await confirmAction(`Excluir a recorrência “${item.description}”?`, 'Excluir recorrência')) await mutate(`/recurring-expenses/${id}`, 'DELETE', {}, 'Recorrência excluída.'); }
    if (action === 'toggle-recurring-paid') { const item = state.recurringExpenses.find(entry => entry.id === id); const paidMonths = item.paidMonths.includes(month) ? item.paidMonths.filter(value => value !== month) : [...item.paidMonths, month]; await mutate(`/recurring-expenses/${id}`, 'PUT', { ...item, paidMonths }, item.paidMonths.includes(month) ? 'Conta voltou para pendente.' : 'Conta marcada como paga.'); }
    if (action === 'delete-goal') { const item = state.goals.find(entry => entry.id === id); if (await confirmAction(`Excluir a meta “${item.name}”?`, 'Excluir meta')) await mutate(`/goals/${id}`, 'DELETE', {}, 'Meta excluída.'); }
    if (action === 'toggle-user-block') { const user = adminUsers.find(entry => entry.id === id); if (await confirmAction(`${user.blocked ? 'Desbloquear' : 'Bloquear'} o acesso de ${user.name}?`, user.blocked ? 'Desbloquear' : 'Bloquear')) { await request(`/admin/users/${id}/block`, 'POST', { blocked: !user.blocked }); adminUsers = await request('/admin/users'); render(); toast(user.blocked ? 'Usuário desbloqueado.' : 'Usuário bloqueado.'); } }
    if (action === 'delete-user') { const user = adminUsers.find(entry => entry.id === id); if (await confirmAction(`Excluir permanentemente a conta de ${user.name} (${user.email})? Os dados financeiros vinculados deixarão de ser acessíveis.`, 'Excluir conta')) { await request(`/admin/users/${id}`, 'DELETE', {}); adminUsers = await request('/admin/users'); render(); toast('Usuário excluído.'); } }
    if (action === 'delete-category') { const item = category(id); const records = state.transactions.filter(entry => entry.category === id).length; const commitments = state.installments.filter(entry => entry.category === id).length + state.recurringExpenses.filter(entry => entry.category === id).length; if (await confirmAction(`Remover “${item.name}”? ${records} lançamentos e ${commitments} compromissos serão movidos para Outros. Os limites dessa categoria serão removidos.`, 'Remover categoria')) await mutate(`/categories/${id}`, 'DELETE', {}, 'Categoria removida.'); }
    if (action === 'backup') { const backup = await request('/backup'); download(JSON.stringify(backup, null, 2), `nexora-backup-${today()}.json`, 'application/json'); toast('Backup exportado.'); }
    if (action === 'restore') $('#backup-file').click();
    if (action === 'retry') { state = await request(); render(); }
  } catch (error) { toast(error.message); } finally { button.disabled = false; }
});

const loginDialog = $('#login-dialog');
const loginForm = $('#login-form');
const logoutButton = $('#logout-button');
const themeToggle = $('#theme-toggle');
const loggedUser = $('#logged-user');
const topbarAvatar = $('#topbar-avatar');
const sidebarAvatar = $('#sidebar-avatar');
const sidebarUserName = $('#sidebar-user-name');
const sidebarUserEmail = $('#sidebar-user-email');
loginDialog.addEventListener('cancel', event => event.preventDefault());
loginDialog.addEventListener('close', () => {
  if (!isAuthenticated()) queueMicrotask(() => loginDialog.showModal());
});
function updateThemeButton() {
  const dark = document.documentElement.dataset.theme === 'dark';
  themeToggle.textContent = dark ? '☀' : '☾';
  themeToggle.setAttribute('aria-label', dark ? 'Ativar modo claro' : 'Ativar modo escuro');
  themeToggle.title = dark ? 'Ativar modo claro' : 'Ativar modo escuro';
}
themeToggle.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme; localStorage.setItem(THEME_KEY, theme); updateThemeButton();
});
updateThemeButton();

function updateLoggedUser() {
  if (!currentUser) {
    loggedUser.replaceChildren();
    loggedUser.removeAttribute('title');
    topbarAvatar.textContent = 'EU';
    sidebarAvatar.textContent = 'EU';
    sidebarUserName.textContent = 'Minhas finanças';
    sidebarUserEmail.textContent = 'Espaço pessoal';
    $('#admin-nav').hidden = true;
    return;
  }
  const strong = document.createElement('strong');
  const small = document.createElement('small');
  strong.textContent = currentUser.name;
  small.textContent = currentUser.email && currentUser.email !== currentUser.name ? currentUser.email : 'Perfil pessoal';
  loggedUser.replaceChildren(strong, small);
  loggedUser.title = `${currentUser.name}${currentUser.email ? `\n${currentUser.email}` : ''}\nID: ${currentUser.id}`;
  const initials = currentUser.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  topbarAvatar.textContent = initials || 'EU';
  sidebarAvatar.textContent = initials || 'EU';
  sidebarUserName.textContent = currentUser.name;
  sidebarUserEmail.textContent = currentUser.email || 'Perfil pessoal';
  $('#admin-nav').hidden = !currentUser.isAdmin;
}

function showLogin(message = '') {
  state = null;
  realState = null;
  currentUser = null;
  demo = false;
  updateLoggedUser();
  $('#demo-banner').hidden = true;
  $('#page-content').innerHTML = '<div class="panel empty">Faça login para acessar suas finanças.</div>';
  loginForm.querySelector('.form-error').textContent = message;
  if (!loginDialog.open) loginDialog.showModal();
}

async function loadApplication() {
  const [nextState, user] = await Promise.all([request(), request('/me')]);
  state = nextState;
  currentUser = user;
  updateLoggedUser();
  render();
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();

  const button = loginForm.querySelector('button[type="submit"]');
  const errorElement = loginForm.querySelector('.form-error');

  button.disabled = true;
  errorElement.textContent = '';

  try {
    const formData = new FormData(loginForm);

    await login(
      formData.get('email'),
      formData.get('password')
    );

    await loadApplication();
    loginDialog.close();
    loginForm.reset();
  } catch (error) {
    errorElement.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

logoutButton.addEventListener('click', () => {
  logout();
  showLogin();
  loginForm.elements.email.focus();
});

window.addEventListener('nexora:logout', () => {
  if (!isAuthenticated()) showLogin('Sua sessão terminou. Entre novamente.');
});
window.addEventListener('nexora:session-change', () => {
  if (!isAuthenticated()) showLogin();
  else loadApplication().catch(() => showLogin('Não foi possível validar a sessão. Entre novamente.'));
});

updateLoggedUser();
if (isAuthenticated()) {
  try { await loadApplication(); }
  catch (error) { showLogin(error.message); }
} else {
  showLogin();
}

// Integração opcional e somente leitura; não é necessária para usar a aplicação.
if (document.modelContext?.registerTool) {
  try { await document.modelContext.registerTool({ name: 'read_financial_summary', description: 'Lê o resumo do mês visível no Nexora, indicando se é uma demonstração.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: input => { if (!input || Object.keys(input).length) throw new Error('Esta consulta não aceita parâmetros.'); if (!state) throw new Error('Dados indisponíveis.'); return { month, demo, currency: 'BRL', unit: 'centavos', ...totals(state.transactions, month) }; } }); } catch { /* Navegadores sem suporte continuam funcionando normalmente. */ }
}
