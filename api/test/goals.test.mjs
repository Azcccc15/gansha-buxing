import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, addGoal, completeTask, deleteTask, achieveGoal, archiveGoal, extendGoal, reminderTasks, plusDays, readState, transact, STORAGE_KEY } from '../public/store.js';
import { readyAnalysis } from '../test-support/fixtures.mjs';
function fixture(days = 30) {
  const state = emptyState();
  const goal = addGoal(state, readyAnalysis(days).plan, { goal: '读完一本书' }, '2026-10-28');
  return { state, goal };
}
test('adoption persists a complete original plan and dates across month boundaries', () => {
  const { goal } = fixture();
  assert.equal(goal.tasks[0].date, '2026-10-28');
  assert.equal(goal.tasks[6].date, '2026-11-03');
  assert.equal(plusDays('2028-02-28', 1), '2028-02-29');
  assert.equal(plusDays('2026-12-31', 1), '2027-01-01');
});
test('completed tasks remain immutable through completion and deletion operations', () => {
  const { state, goal } = fixture();
  completeTask(state, goal.id, goal.tasks[0].id, '2026-10-28');
  const record = goal.tasks[0].completedAt;
  assert.throws(() => completeTask(state, goal.id, goal.tasks[0].id, '2026-10-28'));
  assert.throws(() => deleteTask(state, goal.id, goal.tasks[0].id));
  assert.equal(goal.tasks[0].completedAt, record);
  assert.equal(goal.tasks[0].deleted, false);
});
test('future task completion is rejected and unfinished task deletion is isolated', () => {
  const { state, goal } = fixture();
  assert.throws(() => completeTask(state, goal.id, goal.tasks[1].id, '2026-10-28'));
  deleteTask(state, goal.id, goal.tasks[1].id);
  assert.equal(goal.tasks[1].deleted, true);
  assert.equal(goal.tasks[0].deleted, false);
});
test('achievement is explicit and completion of all generated actions does not imply success', () => {
  const { state, goal } = fixture(1);
  completeTask(state, goal.id, goal.tasks[0].id, '2026-10-28');
  assert.equal(goal.achievedAt, null);
  achieveGoal(state, goal.id);
  assert.ok(goal.achievedAt);
  assert.throws(() => archiveGoal(state, goal.id));
});
test('ending a goal preserves completed history and stops remaining reminders', () => {
  const { state, goal } = fixture(); state.reminders = true;
  completeTask(state, goal.id, goal.tasks[0].id, '2026-10-28');
  archiveGoal(state, goal.id);
  assert.ok(goal.tasks[0].completedAt);
  assert.equal(goal.tasks[0].deleted, false);
  assert.ok(goal.tasks.slice(1).every(t => t.deleted));
  assert.deepEqual(reminderTasks(state, new Date('2026-10-27T00:00:00')), []);
});
test('rolling generation appends dates without replacing locked records', () => {
  const { state, goal } = fixture(10);
  completeTask(state, goal.id, goal.tasks[0].id, '2026-10-28');
  const record = structuredClone(goal.tasks[0]);
  extendGoal(state, goal.id, readyAnalysis(3).plan);
  assert.equal(goal.tasks.length, 10);
  assert.equal(goal.tasks[7].day, 8);
  assert.equal(goal.tasks[9].date, '2026-11-06');
  assert.deepEqual(goal.tasks[0], record);
  assert.throws(() => extendGoal(state, goal.id, readyAnalysis(3).plan));
});
test('reminders contain local date/time and omit deleted, completed, past and ended tasks', () => {
  const { state, goal } = fixture(); state.reminders = true;
  completeTask(state, goal.id, goal.tasks[0].id, '2026-10-28');
  deleteTask(state, goal.id, goal.tasks[1].id);
  const tasks = reminderTasks(state, new Date('2026-10-27T00:00:00'));
  assert.equal(tasks.length, 5);
  assert.equal(tasks[0].date, '2026-10-30');
  assert.equal(tasks[0].time, '19:30');
  achieveGoal(state, goal.id);
  assert.deepEqual(reminderTasks(state, new Date('2026-10-27T00:00:00')), []);
});
test('failed disk commit does not mutate existing application state', () => {
  const { state, goal } = fixture();
  const before = structuredClone(state);
  assert.throws(() => transact({ setItem() { throw new Error('disk full'); } }, state, s => deleteTask(s, goal.id, goal.tasks[0].id)));
  assert.deepEqual(state, before);
});
test('record storage can be read back and corrupt records are never silently overwritten', () => {
  const { state } = fixture();
  const storage = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const adapter = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  const next = transact(adapter, state, s => { s.reminders = true; });
  assert.deepEqual(readState(adapter), next);
  adapter.setItem(STORAGE_KEY, '{broken');
  assert.throws(() => readState(adapter));
});

test('stale pages cannot overwrite a completed record saved by another page', () => {
  const { state, goal } = fixture();
  const saved = structuredClone(state);
  completeTask(saved, goal.id, goal.tasks[0].id, '2026-10-28');
  let writes = 0;
  const storage = { getItem: () => JSON.stringify(saved), setItem: () => { writes++; } };
  assert.throws(() => transact(storage, state, s => deleteTask(s, goal.id, goal.tasks[0].id)));
  assert.equal(writes, 0);
});
