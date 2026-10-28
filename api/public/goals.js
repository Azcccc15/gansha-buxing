import { isAndroid, apiFetch } from './transport.js';
import { readState, emptyState, transact, addGoal, completeTask, deleteTask, achieveGoal, archiveGoal, extendGoal, dateKey, reminderTasks } from './store.js';

let state;
let storageReady = true;
let toastTimer;
function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function button(text, action, className = 'secondary') {
  const el = node('button', text, className);
  el.type = 'button'; el.addEventListener('click', action); return el;
}
function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 4500);
}
try { state = readState(localStorage); } catch (error) { state = emptyState(); storageReady = false; toast(error.message); }
function showPage(view) {
  const allowed = ['today', 'goals', 'create', 'settings'];
  if (!allowed.includes(view)) view = 'today';
  for (const el of document.querySelectorAll('[data-page]')) el.hidden = el.dataset.page !== view;
  for (const el of document.querySelectorAll('[data-view]')) {
    if (el.dataset.view === view) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  }
  history.replaceState(null, '', '#' + view);
  window.scrollTo({ top: 0, behavior: 'instant' });
}
for (const el of document.querySelectorAll('[data-view]')) el.addEventListener('click', () => showPage(el.dataset.view));
window.addEventListener('hashchange', () => showPage(location.hash.slice(1)));
function commit(change) {
  if (!storageReady) { toast('本地记录读取异常，请先导出记录后排查。'); return false; }
  try {
    state = transact(localStorage, state, change);
    render(); syncReminders(); return true;
  } catch (error) { toast(error.message || '保存失败，请检查设备剩余空间。'); return false; }
}
function confirmAction(title, copy, label = '确认') {
  const dialog = document.getElementById('confirm-dialog');
  if (dialog.open) return Promise.resolve(false);
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-copy').textContent = copy;
  dialog.querySelector('[value=confirm]').textContent = label;
  dialog.returnValue = 'cancel'; dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
}
function celebrate(title, copy, isGoal = false) {
  document.getElementById('celebrate-label').textContent = isGoal ? '你做到了，这是你的里程碑' : '这一步，值得庆祝';
  document.getElementById('celebrate-title').textContent = title;
  document.getElementById('celebrate-copy').textContent = copy;
  const dialog = document.getElementById('celebration');
  if (!dialog.open) dialog.showModal();
}
document.getElementById('celebrate-close').addEventListener('click', () => document.getElementById('celebration').close());
async function finish(goal, task) {
  if (!await confirmAction('这项行动真的完成了吗？', task.title + '\n完成标准：' + task.completionCriteria + '\n确认后这条完成记录会锁定，不能撤销或删除。', '确认完成')) return;
  if (commit(s => completeTask(s, goal.id, task.id))) {
    const today = state.goals.filter(g => !g.archived && !g.achievedAt).flatMap(g => g.tasks).filter(t => !t.deleted && t.date === dateKey());
    const allDone = today.length > 0 && today.every(t => t.completedAt);
    celebrate(allDone ? '今天的行动，全部拿下！' : '又向目标靠近了一步', allDone ? '你认真完成了今天的安排。好好享受这份踏实，明天继续。' : '你完成了“' + task.title + '”。这份努力已经记下，值得为自己高兴。');
  }
}
async function removeTask(goal, task) {
  if (await confirmAction('删除这项未完成行动？', task.title + '\n删除后将取消对应提醒，其他行动和完成记录会保留。', '删除行动')) commit(s => deleteTask(s, goal.id, task.id));
}
function taskCard(goal, task) {
  const card = node('article', undefined, 'task-card');
  card.dataset.taskId = task.id;
  const top = node('div', undefined, 'task-top');
  const copy = node('div');
  copy.append(node('span', task.date + ' · ' + task.time + ' · ' + task.minutes + ' 分钟', 'task-meta'), node('h3', task.title));
  top.append(copy); card.append(top, node('p', goal.title), node('p', '完成标准：' + task.completionCriteria));
  if (task.completedAt) card.append(node('span', '✓ 已完成 · 记录已锁定', 'locked'));
  else if (!goal.achievedAt && !goal.archived) {
    const tools = node('div', undefined, 'task-tools');
    if (task.date <= dateKey()) tools.append(button('完成这项行动', () => finish(goal, task), ''));
    tools.append(button('加入日历', () => calendar(goal, task)), button('删除', () => removeTask(goal, task), 'text-button'));
    card.append(tools);
  }
  return card;
}
function empty(title, copy, action = true) {
  const el = node('div', undefined, 'empty-product');
  el.append(node('span', '↗', 'empty-mark'), node('h3', title), node('p', copy));
  if (action) el.append(button('设立一个新目标 ↗', () => showPage('create'), ''));
  return el;
}
function goalCard(goal) {
  const card = node('article', undefined, 'goal-card');
  const done = goal.tasks.filter(t => t.completedAt).length;
  const all = goal.tasks.filter(t => !t.deleted).length;
  const top = node('div', undefined, 'goal-top');
  top.append(node('h3', goal.title), node('span', done + ' / ' + all + ' 项已完成', 'goal-count'));
  card.append(top, node('p', goal.startDate + ' 开始 · 共 ' + goal.plan.durationDays + ' 天'), node('p', '目标达成标准：' + goal.plan.completionCriteria));
  if (goal.achievedAt) card.append(node('span', '✦ 已达成 · ' + new Date(goal.achievedAt).toLocaleDateString('zh-CN'), 'locked'));
  if (goal.archived) card.append(node('span', '已结束 · 完成历史仍保留', 'locked'));
  const details = node('details'); details.append(node('summary', '查看阶段与全部行动'));
  const phases = node('ul', undefined, 'goal-phases');
  for (const p of goal.plan.phases) phases.append(node('li', '第 ' + p.startDay + '—' + p.endDay + ' 天 · ' + p.title + '：' + p.description));
  details.append(phases);
  for (const t of goal.tasks.filter(t => !t.deleted)) details.append(taskCard(goal, t));
  card.append(details);
  if (!goal.achievedAt && !goal.archived) {
    const tools = node('div', undefined, 'goal-tools');
    const covered = Math.max(0, ...goal.tasks.map(t => t.day));
    if (covered < goal.plan.durationDays) {
      card.append(node('p', '已安排前 ' + covered + ' 天行动。后续按需生成，每次最多7天；生成后请确认。'));
      tools.append(button('生成后续行动', () => extend(goal, covered)));
    }
    tools.append(button('我已达成目标 ✦', async () => {
      if (await confirmAction('你已经达到目标标准了吗？', goal.plan.completionCriteria + '\n打卡次数不能替代真实成果。确认后结束后续提醒，保留目标成就和全部完成记录。', '确认目标已达成')) {
        if (commit(s => achieveGoal(s, goal.id))) celebrate('你真的做到了！', '“' + goal.title + '”已经成为你的成就。谢谢那个一步步坚持的自己。', true);
      }
    }, ''));
    tools.append(button('结束这个目标', async () => {
      if (await confirmAction('结束这个目标？', '停止剩余行动和提醒，已经完成的记录会保留在历史中。', '结束目标')) commit(s => archiveGoal(s, goal.id));
    }, 'text-button'));
    card.append(tools);
  }
  return card;
}
function render() {
  const today = dateKey();
  document.getElementById('today-date').textContent = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
  const active = state.goals.filter(g => !g.archived && !g.achievedAt);
  const tasks = active.flatMap(g => g.tasks.filter(t => !t.deleted && t.date <= today).map(t => [g, t])).sort((a, b) => (a[1].date + a[1].time).localeCompare(b[1].date + b[1].time));
  document.getElementById('stat-today').textContent = state.goals.flatMap(g => g.tasks).filter(t => t.completedAt && dateKey(new Date(t.completedAt)) === today).length;
  document.getElementById('stat-active').textContent = active.length;
  document.getElementById('stat-achieved').textContent = state.goals.filter(g => g.achievedAt).length;
  const list = document.getElementById('today-list'); list.replaceChildren();
  for (const [g, t] of tasks.filter(([,t]) => !t.completedAt || t.date === today)) list.append(taskCard(g, t));
  if (!list.children.length) list.append(empty(active.length ? '今天，给自己一点空间' : '先种下一个想法', active.length ? '可在“我的目标”查看未来行动或生成后续安排。' : '说出目标，小干会帮你想好下一步。', !active.length));
  const goals = document.getElementById('goals-list'); goals.replaceChildren();
  for (const g of active) goals.append(goalCard(g));
  if (!active.length) goals.append(empty('你想实现的，都可以从这里开始', '先有一个小目标，再走一小步。'));
  const history = document.getElementById('history-list'); history.replaceChildren();
  for (const g of state.goals.filter(g => g.archived || g.achievedAt).reverse()) history.append(goalCard(g));
  if (!history.children.length) history.append(node('p', '每一次努力都会留下记录。这里等着你的第一个里程碑。', 'summary'));
  document.getElementById('reminder-state').textContent = state.reminders ? '已开启' : '未开启';
  document.getElementById('reminder-toggle').textContent = state.reminders ? '关闭行动提醒' : '开启行动提醒';
}
function extend(goal, covered) {
  showPage('create');
  window.dispatchEvent(new CustomEvent('gansha:extend', { detail: { goalId: goal.id, input: {
    goal: goal.originalGoal, durationDays: goal.plan.durationDays - covered, dailyMinutes: goal.plan.dailyMinutes,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai', answers: [],
    context: ('这是已有目标的后续规划。原周期' + goal.plan.durationDays + '天，已安排前' + covered + '天。请为剩余周期制定下一批行动，day从1编号，客户端会偏移至原目标对应日期。原完成标准：' + goal.plan.completionCriteria + '。近期任务：' + goal.tasks.slice(-3).map(t => t.title + (t.completedAt ? '（已完成）' : '（未完成）')).join('；')).slice(0, 2000)
  } } }));
}
window.addEventListener('gansha:adopt', event => {
  const { plan, input, target, button: adopt } = event.detail;
  if (commit(s => target ? extendGoal(s, target, plan) : addGoal(s, plan, input))) {
    adopt.disabled = true; adopt.textContent = '✓ 已加入我的目标';
    showPage('goals'); toast('行动已保存，随时可以从“今日行动”开始。');
  }
});
async function syncReminders() {
  if (!isAndroid || !storageReady) return;
  try {
    const response = await apiFetch('/native/reminders', { method: 'POST', body: JSON.stringify({ tasks: reminderTasks(state) }) });
    if (!response.ok) throw new Error();
  }
  catch { toast('行动已保存，提醒同步失败，请在设置中重新开启。'); }
}
document.getElementById('reminder-toggle').addEventListener('click', async () => {
  if (!isAndroid) { toast('手机安装版支持通知；电脑端请用行动卡片的“加入日历”。'); return; }
  if (state.reminders) { commit(s => { s.reminders = false; }); return; }
  try {
    const response = await apiFetch('/native/notifications', { method: 'POST' });
    const data = await response.json();
    if (!response.ok || !data.granted) { toast('请允许系统通知后，再点击开启行动提醒。'); return; }
    commit(s => { s.reminders = true; });
  } catch { toast('通知设置暂时无法打开，请稍后重试。'); }
});
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function calendar(goal, task) {
  const start = new Date(task.date + 'T' + task.time + ':00').getTime();
  const data = { title: task.title, description: goal.title + '\n完成标准：' + task.completionCriteria, start, end: start + task.minutes * 60000 };
  if (isAndroid) {
    try { const r = await apiFetch('/native/calendar', { method: 'POST', body: JSON.stringify(data) }); if (!r.ok) throw new Error(); }
    catch { toast('未找到可用的日历应用，请先安装日历。'); }
    return;
  }
  const stamp = time => new Date(time).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const escape = text => text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GanshaBuxing//V1.0//ZH', 'BEGIN:VEVENT', 'UID:' + task.id + '@gansha.local', 'DTSTAMP:' + stamp(Date.now()), 'DTSTART:' + stamp(data.start), 'DTEND:' + stamp(data.end), 'SUMMARY:' + escape(data.title), 'DESCRIPTION:' + escape(data.description), 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
  download('行动日历.ics', ics, 'text/calendar;charset=utf-8'); toast('日历文件已导出，请用日历应用导入。');
}
document.getElementById('export-data').addEventListener('click', async () => {
  const content = storageReady ? JSON.stringify({ exportedAt: new Date().toISOString(), ...state }, null, 2) : localStorage.getItem('gansha.state.v1') || '{}';
  if (isAndroid) {
    const r = await apiFetch('/native/export', { method: 'POST', body: JSON.stringify({ content }) });
    if (!r.ok) toast('导出暂时失败，请稍后重试。');
  } else download('干啥不行-记录-' + dateKey() + '.json', content, 'application/json;charset=utf-8');
});
if (isAndroid) document.getElementById('reminder-help').textContent = '允许系统通知后，会在行动安排的时间提醒你。系统提醒由本机执行，无需电脑保持运行。';
render(); showPage(location.hash.slice(1)); syncReminders();
window.addEventListener('focus', () => { render(); syncReminders(); });
window.addEventListener('storage', event => {
  if (event.key !== 'gansha.state.v1') return;
  try { state = readState(localStorage); render(); } catch (error) { storageReady = false; toast(error.message); }
});
setInterval(render, 60000);
