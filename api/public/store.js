// Local goal records. Every write is committed before the UI reports success.
export const STORAGE_KEY = 'gansha.state.v1';
export function dateKey(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
export function plusDays(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + days, 12));
}
export function emptyState() { return { version: 1, goals: [], reminders: false }; }
export function readState(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return emptyState();
  try {
    const state = JSON.parse(raw);
    if (state.version !== 1 || !Array.isArray(state.goals) || typeof state.reminders !== 'boolean') throw new Error();
    for (const goal of state.goals) {
      if (!goal || typeof goal.id !== 'string' || typeof goal.title !== 'string' || !goal.plan || !Array.isArray(goal.plan.phases) || !Array.isArray(goal.tasks)) throw new Error();
      for (const task of goal.tasks) {
        if (typeof task.id !== 'string' || typeof task.title !== 'string' || !Number.isInteger(task.day) || typeof task.date !== 'string' || typeof task.time !== 'string') throw new Error();
        if (task.completedAt !== null && (typeof task.completedAt !== 'string' || Number.isNaN(Date.parse(task.completedAt)))) throw new Error();
      }
    }
    return state;
  } catch { throw new Error('本地记录无法读取，请先导出原始记录，不要清除应用数据。'); }
}
export function transact(storage, current, change) {
  if (typeof storage.getItem === 'function') {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw && JSON.stringify(JSON.parse(raw)) !== JSON.stringify(current)) throw new Error('记录已在其他页面更新，请刷新后继续。');
  }
  const next = structuredClone(current);
  change(next);
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
export function addGoal(state, draft, input, startDate = dateKey()) {
  if (!draft || !Array.isArray(draft.actions) || !draft.actions.length) throw new Error('请先生成完整方案。');
  const goal = { id: crypto.randomUUID(), title: draft.title, originalGoal: input.goal, startDate,
    createdAt: new Date().toISOString(), achievedAt: null, archived: false,
    plan: structuredClone(draft), tasks: [] };
  goal.tasks = draft.actions.map(a => ({ ...a, id: crypto.randomUUID(), date: plusDays(startDate, a.day - 1), completedAt: null, deleted: false }));
  state.goals.push(goal);
  return goal;
}
export function taskIn(state, goalId, taskId) {
  const goal = state.goals.find(g => g.id === goalId);
  const task = goal?.tasks.find(t => t.id === taskId);
  if (!goal || !task || task.deleted) throw new Error('这项任务已不存在。');
  return { goal, task };
}
export function completeTask(state, goalId, taskId, today = dateKey()) {
  const { goal, task } = taskIn(state, goalId, taskId);
  if (task.completedAt) throw new Error('已完成的记录已经锁定。');
  if (task.date > today) throw new Error('未来的任务还不能提前打卡。');
  if (goal.archived || goal.achievedAt) throw new Error('这个目标已经结束。');
  task.completedAt = new Date().toISOString();
}
export function deleteTask(state, goalId, taskId) {
  const { task } = taskIn(state, goalId, taskId);
  if (task.completedAt) throw new Error('完成记录不能删除或撤销。');
  task.deleted = true;
}
export function achieveGoal(state, goalId) {
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal || goal.archived || goal.achievedAt) throw new Error('这个目标已经结束。');
  goal.achievedAt = new Date().toISOString();
}
export function archiveGoal(state, goalId) {
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal || goal.achievedAt) throw new Error('达成记录需要保留。');
  goal.archived = true;
  for (const task of goal.tasks) if (!task.completedAt) task.deleted = true;
}
export function extendGoal(state, goalId, draft) {
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal || goal.archived || goal.achievedAt) throw new Error('这个目标已经结束。');
  const covered = Math.max(0, ...goal.tasks.map(t => t.day));
  if (covered >= goal.plan.durationDays) throw new Error('当前周期的行动已全部生成。');
  if (draft.durationDays !== goal.plan.durationDays - covered) throw new Error('后续方案的周期不匹配，请重新生成。');
  for (const a of draft.actions) {
    const day = covered + a.day;
    goal.tasks.push({ ...a, day, id: crypto.randomUUID(), date: plusDays(goal.startDate, day - 1), completedAt: null, deleted: false });
  }
}
export function reminderTasks(state, now = new Date()) {
  if (!state.reminders) return [];
  return state.goals.filter(g => !g.archived && !g.achievedAt).flatMap(g => g.tasks
    .filter(t => !t.deleted && !t.completedAt)
    .map(t => ({ id: t.id, title: t.title, goal: g.title, date: t.date, time: t.time, at: new Date(t.date + 'T' + t.time + ':00').getTime() })))
    .filter(t => t.at > now.getTime());
}
