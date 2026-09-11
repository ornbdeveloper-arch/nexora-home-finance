import { request } from './api.js';
import { login, logout, isAuthenticated } from './auth.js';
import { money, toCents, sum, totals } from './finance.js';

// 1. Estado da interface. Os dados reais vêm sempre do servidor.
const $ = selector => document.querySelector(selector);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
let state = null;
let realState = null;
let currentUser = null;
let demo = false;
let month = today().slice(0, 7);
let page = 'overview';
let filter = { search: '', type: '', status: '', category: '', page: 1 };
const titles = {
  overview: ['Visão geral', 'Um olhar completo para o seu dinheiro.'],
  transactions: ['Lançamentos', 'Cada entrada e saída, no seu devido lugar.'],
  budgets: ['Orçamentos', 'Planeje seus gastos e acompanhe seus limites.'],
  categories: ['Categorias', 'Organize seu dinheiro de um jeito que faz sentido para você.'],
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
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.wallet}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
// Escape qualquer texto informado pelo usuário antes de colocá-lo no HTML.
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const category = id => state.categories.find(c => c.id === id) || { name: 'Outros', color: '#80908c' };
const monthName = value => new Date(value + '-15T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const dateLabel = value => value.split('-').reverse().join('/');
const monthly = () => state.transactions.filter(t => t.date.startsWith(month));
const ordered = rows => [...rows].sort((a, b) => b.date.localeCompare(a.date) || a.description.localeCompare(b.description));
const options = (all = false) => (all ? '<option value="">Todas as categorias</option>' : '') + state.categories.map(c => `<option value="${escape(c.id)}">${escape(c.name)}</option>`).join('');
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').hidden = true, 4500); }
function ensureReal() { if (demo) { toast('Saia da demonstração para registrar seus dados reais.'); return false; } return true; }
function empty(title, text, action = '') { return `<div class="empty"><div class="empty-icon">${icon('leaf')}</div><h2>${title}</h2><p>${text}</p>${action}</div>`; }

// 2. Renderização. Cada função transforma dados em uma parte da tela.
function statCards() {
  const t = totals(state.transactions, month);
  const cards = [
    ['Saldo acumulado', t.balance, 'wallet', 'Efetivados até o fim deste mês', 'featured'],
    ['Receitas do mês', t.income, 'down', `${money(t.receivable)} a receber`, ''],
    ['Despesas do mês', t.expense, 'up', 'Pagamentos já efetivados', ''],
    ['Contas a pagar', t.payable, 'clock', `${monthly().filter(t => t.status === 'pending' && t.type === 'expense').length} pendências neste mês`, '']
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
  return rows.map(t => `<tr><td><div class="transaction-description"><span class="transaction-symbol ${t.type}">${t.type === 'income' ? '↙' : '↗'}</span><span>${escape(t.description)}</span></div></td><td><span class="tag">${escape(category(t.category).name)}</span></td><td>${dateLabel(t.date)}</td><td><span class="status ${t.status}">${t.status === 'pending' ? 'Pendente' : t.type === 'income' ? 'Recebido' : 'Pago'}</span></td><td class="amount ${t.type === 'income' ? 'positive' : ''}">${t.type === 'income' ? '+' : '−'} ${money(t.amount)}</td>${actions ? `<td><div class="row-actions">${t.status === 'pending' ? `<button data-action="settle" data-id="${t.id}" aria-label="Efetivar ${escape(t.description)}" title="Marcar como efetivado">${icon('check')}</button>` : ''}<button data-action="edit" data-id="${t.id}" aria-label="Editar ${escape(t.description)}" title="Editar">${icon('edit')}</button><button data-action="delete" data-id="${t.id}" aria-label="Excluir ${escape(t.description)}" title="Excluir">${icon('trash')}</button></div></td>` : ''}</tr>`).join('');
}
function table(rows, actions = false) { return `<div class="table-wrap"><table><thead><tr><th>DESCRIÇÃO</th><th>CATEGORIA</th><th>DATA</th><th>SITUAÇÃO</th><th>VALOR</th>${actions ? '<th>AÇÕES</th>' : ''}</tr></thead><tbody>${rowsHtml(rows, actions)}</tbody></table></div>`; }
function upcoming() {
  const pending = monthly().filter(t => t.status === 'pending' && t.type === 'expense').sort((a,b) => a.date.localeCompare(b.date));
  return `<section class="panel"><div class="panel-heading"><h2>Contas a pagar</h2><span class="pill">${pending.length} pendentes</span></div>${pending.length ? pending.slice(0,4).map(t => `<div class="upcoming-item"><div class="date-tile"><small>${new Date(t.date + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</small><strong>${t.date.slice(8)}</strong></div><div class="upcoming-description"><strong>${escape(t.description)}</strong><small>${escape(category(t.category).name)}</small></div><div class="upcoming-amount">${money(t.amount)}<small>${t.date < today() ? 'Em atraso' : t.date === today() ? 'Vence hoje' : 'A vencer'}</small></div></div>`).join('') : empty('Tudo em dia', 'Nenhuma despesa pendente neste mês.')}</section>`;
}
function renderOverview() {
  const rows = ordered(monthly());
  return `${state.transactions.length === 0 ? `<div class="panel empty overview-welcome"><div><h2>Seu próximo capítulo começa aqui.</h2><p>Registre seu primeiro lançamento ou explore um exemplo.</p></div><button class="secondary" data-action="demo">Explorar demonstração ↗</button></div>` : ''}${statCards()}<div class="dashboard-grid">${cashChart()}${expenseChart()}</div><div class="dashboard-grid"><section class="panel table-panel"><div class="panel-heading"><div><h2>Últimos lançamentos</h2><p>Suas movimentações neste mês</p></div><a class="text-button" href="#transactions">Ver todos ↗</a></div>${rows.length ? table(rows.slice(0, 5)) : empty('Tudo pronto para começar', 'Adicione uma receita ou despesa para acompanhar seu mês.', '<button class="primary" data-action="new">＋ Adicionar lançamento</button>')}<div class="table-footer"><span>${rows.length} lançamentos em ${monthName(month)}</span><a href="#settings" class="text-button">Dados e backup ↗</a></div></section>${upcoming()}</div>`;
}
function filteredRows() {
  const text = filter.search.toLocaleLowerCase('pt-BR');
  return ordered(monthly()).filter(t => (!filter.type || t.type === filter.type) && (!filter.status || t.status === filter.status) && (!filter.category || t.category === filter.category) && (t.description.toLocaleLowerCase('pt-BR').includes(text) || t.notes.toLocaleLowerCase('pt-BR').includes(text)));
}
function transactionsResult() {
  const rows = filteredRows(); const pages = Math.max(1, Math.ceil(rows.length / 12)); filter.page = Math.min(filter.page, pages);
  return `${rows.length ? table(rows.slice((filter.page - 1) * 12, filter.page * 12), true) : empty('Nenhum lançamento encontrado', 'Altere os filtros ou adicione um novo lançamento.')}<div class="table-footer"><span>${rows.length} registros · Resultado: ${money(rows.reduce((a,t) => a + (t.type === 'income' ? t.amount : -t.amount), 0))}<br><small>Inclui pendentes nos filtros atuais</small></span><div class="pagination"><button class="secondary" data-action="previous" ${filter.page === 1 ? 'disabled' : ''} aria-label="Página anterior">‹</button><span>${filter.page} / ${pages}</span><button class="secondary" data-action="next" ${filter.page === pages ? 'disabled' : ''} aria-label="Próxima página">›</button></div></div>`;
}
function renderTransactions() {
  return `${statCards()}<div class="filters"><input id="search" aria-label="Buscar lançamentos" placeholder="Buscar descrição ou observação…" value="${escape(filter.search)}"><select id="filter-type" aria-label="Filtrar por tipo"><option value="">Todos os tipos</option><option value="income">Receitas</option><option value="expense">Despesas</option></select><select id="filter-status" aria-label="Filtrar por situação"><option value="">Todas as situações</option><option value="paid">Efetivados</option><option value="pending">Pendentes</option></select><select id="filter-category" aria-label="Filtrar por categoria">${options(true)}</select><button class="secondary" data-action="csv">${icon('download')} CSV</button></div><section id="transactions-result" class="panel table-panel">${transactionsResult()}</section>`;
}
function renderBudgets() {
  const budgets = state.budgets.filter(b => b.month === month);
  const totalLimit = sum(budgets);
  return `<div class="panel-heading"><div><h2>Planejamento de ${monthName(month)}</h2><p>Os limites consideram despesas pagas e pendentes. Total planejado: ${money(totalLimit)}.</p></div><button class="secondary" data-action="budget">＋ Definir limite</button></div>${!budgets.length ? `<section class="panel">${empty('Dê um plano ao seu dinheiro', 'Defina um limite mensal por categoria e acompanhe o quanto já comprometeu.', '<button class="primary" data-action="budget">Criar primeiro orçamento</button>')}</section>` : `<div class="budget-grid">${budgets.map(b => {
    const c = category(b.category); const spent = sum(monthly().filter(t => t.type === 'expense' && t.category === b.category)); const remaining = b.amount - spent;
    return `<section class="panel budget-card ${remaining < 0 ? 'over' : ''}"><div class="panel-heading"><h2><i class="color-dot" style="background:${c.color}"></i>${escape(c.name)}</h2><span class="pill">${Math.round(spent / b.amount * 100)}%</span></div><div class="budget-values"><strong>${money(spent)}</strong><small>de ${money(b.amount)}</small></div><progress max="${b.amount}" value="${Math.min(spent, b.amount)}" aria-label="Orçamento de ${escape(c.name)}"></progress><p class="budget-note ${remaining < 0 ? 'negative' : ''}">${remaining < 0 ? `${money(-remaining)} acima do limite` : `${money(remaining)} disponíveis para gastar`}</p><div class="budget-actions"><button class="text-button" data-action="budget" data-id="${b.category}">Editar limite</button><button class="text-button" data-action="delete-budget" data-id="${b.category}">Remover</button></div></section>`;
  }).join('')}</div>`}`;
}
function renderCategories() {
  return `<section class="panel" style="margin-bottom:24px"><h2>Nova categoria</h2><form id="category-form" class="inline-form"><label>Nome<input name="name" placeholder="Ex.: Pets" maxlength="40" required></label><label class="color-field">Cor<input name="color" type="color" value="#5277cf"></label><button class="primary">Adicionar categoria</button></form><p class="muted" style="font-size:.81rem">As categorias ficam disponíveis em receitas, despesas e orçamentos.</p></section><div class="category-grid">${state.categories.map(c => `<article class="panel category-item"><i class="color-dot" style="background:${c.color}"></i><strong>${escape(c.name)}</strong><small>${state.transactions.filter(t => t.category === c.id).length} registros</small></article>`).join('')}</div>`;
}
function renderSettings() {
  return `<div class="settings-grid"><section class="panel">${icon('download')}<h2>Backup completo</h2><p>Baixe todos os lançamentos, categorias e orçamentos em um arquivo JSON. Guarde uma cópia fora deste computador.</p><button class="primary" data-action="backup">${icon('download')} Baixar backup</button></section><section class="panel">${icon('upload')}<h2>Restaurar seus dados</h2><p>Recupere um backup criado pelo Nexora. A restauração substitui os dados atuais; você poderá revisar a quantidade de registros antes de confirmar.</p><button class="secondary" data-action="restore">${icon('upload')} Selecionar backup</button><input type="file" id="backup-file" accept=".json,application/json" hidden></section><section class="panel">${icon('list')}<h2>Levar para a planilha</h2><p>Exporte os lançamentos do mês selecionado em CSV, compatível com Excel e outras planilhas. Na tela Lançamentos, a exportação respeita seus filtros.</p><button class="secondary" data-action="csv">Exportar ${monthName(month)}</button></section><section class="panel">${icon('leaf')}<h2>Explore sem alterar seus dados</h2><p>Veja um exemplo de finanças organizadas. A demonstração usa dados fictícios temporários e mantém seus registros reais separados.</p><button class="secondary" data-action="demo">Explorar demonstração ↗</button></section></div><div class="panel settings-note"><strong>Onde seus dados ficam?</strong><p>Seus registros ficam protegidos no banco de dados e vinculados exclusivamente à sua conta. Faça backups regularmente.</p><p class="muted">${state.transactions.length} lançamentos · ${state.categories.length} categorias · ${state.budgets.length} orçamentos</p></div>`;
}
function render() {
  page = Object.hasOwn(titles, location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
  $('#page-title').textContent = titles[page][0]; $('#breadcrumb').textContent = titles[page][0]; $('#page-description').textContent = titles[page][1];
  document.title = `${titles[page][0]} · Nexora`;
  document.querySelectorAll('[data-page]').forEach(a => { a.classList.toggle('active', a.dataset.page === page); if (a.dataset.page === page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  $('#demo-banner').hidden = !demo;
  if (!state) return;
  $('#page-content').innerHTML = ({ overview: renderOverview, transactions: renderTransactions, budgets: renderBudgets, categories: renderCategories, settings: renderSettings })[page]();
  if (page === 'transactions') for (const key of ['type', 'status', 'category']) $(`#filter-${key}`).value = filter[key];
}

// 3. Alterações: aguarde o servidor salvar antes de atualizar a interface.
async function mutate(path, method, value, message) { state = await request(path, method, value); render(); if (message) toast(message); }
function openTransaction(id) {
  if (!ensureReal() || !state) return;
  const form = $('#transaction-form'); form.reset(); form.querySelector('.form-error').textContent = '';
  form.elements.category.innerHTML = options();
  form.elements.date.value = month === today().slice(0,7) ? today() : month + '-01';
  form.elements.category.value = 'outros';
  const item = state.transactions.find(t => t.id === id);
  $('#transaction-title').textContent = item ? 'Editar lançamento' : 'Novo lançamento';
  if (item) for (const key of ['id', 'description', 'type', 'status', 'date', 'category', 'notes']) form.elements[key].value = item[key];
  if (item) form.elements.amount.value = (item.amount / 100).toFixed(2).replace('.', ',');
  $('#transaction-dialog').showModal(); form.elements.description.focus();
}
function openBudget(id) {
  if (!ensureReal()) return;
  const form = $('#budget-form'); form.reset(); form.querySelector('.form-error').textContent = ''; form.elements.category.innerHTML = options();
  const item = state.budgets.find(b => b.month === month && b.category === id);
  form.elements.category.disabled = !!item;
  if (item) { form.elements.category.value = item.category; form.elements.amount.value = (item.amount / 100).toFixed(2).replace('.', ','); }
  $('#budget-dialog').showModal();
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
  const data = [['Descrição', 'Tipo', 'Categoria', 'Data', 'Situação', 'Valor (R$)', 'Observação'], ...rows.map(t => [t.description, t.type === 'income' ? 'Receita' : 'Despesa', category(t.category).name, dateLabel(t.date), t.status === 'paid' ? 'Efetivado' : 'Pendente', (t.amount / 100).toFixed(2).replace('.', ','), t.notes])];
  download('\uFEFF' + data.map(row => row.map(cell).join(';')).join('\r\n'), `nexora-${demo ? 'demo-' : ''}${month}.csv`, 'text/csv;charset=utf-8'); toast('CSV exportado.');
}
function startDemo() {
  if (demo) { location.hash = 'overview'; return; }
  realState = state; demo = true; state = structuredClone(state); state.transactions = []; state.budgets = [];
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
$('#month').value = month;
$('#month').addEventListener('change', event => { if (!event.target.value || !event.target.validity.valid) { event.target.value = month; return; } month = event.target.value; filter.page = 1; render(); });
window.addEventListener('hashchange', render);
$('#new-transaction').addEventListener('click', () => openTransaction());
$('#exit-demo').addEventListener('click', async () => { demo = false; state = realState; realState = null; render(); try { state = await request(); render(); } catch (error) { toast(error.message); } });
document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$('#transaction-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!ensureReal()) return; const form = event.currentTarget; const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
  try {
    const fields = Object.fromEntries(new FormData(form)); const id = fields.id; delete fields.id; fields.amount = toCents(fields.amount);
    await mutate(id ? `/transactions/${id}` : '/transactions', id ? 'PUT' : 'POST', fields, id ? 'Lançamento atualizado.' : 'Lançamento salvo.'); $('#transaction-dialog').close();
  } catch (error) { form.querySelector('.form-error').textContent = error.message; } finally { submit.disabled = false; }
});
$('#budget-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!ensureReal()) return; const form = event.currentTarget; const button = form.querySelector('.primary'); button.disabled = true;
  try { await mutate('/budgets', 'PUT', { month, category: form.elements.category.value, amount: toCents(form.elements.amount.value) }, 'Orçamento salvo.'); $('#budget-dialog').close(); }
  catch (error) { form.querySelector('.form-error').textContent = error.message; } finally { button.disabled = false; }
});
$('#page-content').addEventListener('input', event => {
  if (event.target.id === 'search') { filter.search = event.target.value; filter.page = 1; $('#transactions-result').innerHTML = transactionsResult(); }
});
$('#page-content').addEventListener('change', async event => {
  const key = event.target.id.replace('filter-', '');
  if (['type', 'status', 'category'].includes(key)) { filter[key] = event.target.value; filter.page = 1; $('#transactions-result').innerHTML = transactionsResult(); }
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
  if (action === 'budget') return openBudget(id);
  if (action === 'demo') return startDemo();
  if (action === 'csv') return exportCsv();
  if (action === 'previous' || action === 'next') { filter.page += action === 'next' ? 1 : -1; $('#transactions-result').innerHTML = transactionsResult(); return; }
  if (!ensureReal()) return;
  button.disabled = true;
  try {
    if (action === 'delete') { const item = state.transactions.find(t => t.id === id); if (await confirmAction(`Excluir “${item.description}”, no valor de ${money(item.amount)}?`, 'Excluir lançamento')) await mutate(`/transactions/${id}`, 'DELETE', {}, 'Lançamento excluído.'); }
    if (action === 'settle') { const item = state.transactions.find(t => t.id === id); await mutate(`/transactions/${id}`, 'PUT', { ...item, status: 'paid' }, 'Lançamento efetivado.'); }
    if (action === 'delete-budget' && await confirmAction('Remover este limite mensal? Seus lançamentos serão mantidos.', 'Remover limite')) await mutate('/budgets', 'DELETE', { month, category: id }, 'Limite removido.');
    if (action === 'backup') { const backup = await request('/backup'); download(JSON.stringify(backup, null, 2), `nexora-backup-${today()}.json`, 'application/json'); toast('Backup exportado.'); }
    if (action === 'restore') $('#backup-file').click();
    if (action === 'retry') { state = await request(); render(); }
  } catch (error) { toast(error.message); } finally { button.disabled = false; }
});

const loginDialog = $('#login-dialog');
const loginForm = $('#login-form');
const logoutButton = $('#logout-button');
const loggedUser = $('#logged-user');
const topbarAvatar = $('#topbar-avatar');
const sidebarAvatar = $('#sidebar-avatar');
const sidebarUserName = $('#sidebar-user-name');
const sidebarUserEmail = $('#sidebar-user-email');
loginDialog.addEventListener('cancel', event => event.preventDefault());
loginDialog.addEventListener('close', () => {
  if (!isAuthenticated()) queueMicrotask(() => loginDialog.showModal());
});

function updateLoggedUser() {
  if (!currentUser) {
    loggedUser.replaceChildren();
    loggedUser.removeAttribute('title');
    topbarAvatar.textContent = 'EU';
    sidebarAvatar.textContent = 'EU';
    sidebarUserName.textContent = 'Minhas finanças';
    sidebarUserEmail.textContent = 'Espaço pessoal';
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
