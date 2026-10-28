import test from 'node:test';
import assert from 'node:assert/strict';
let requests = [];
let cancels = [];
global.window = { GanshaNative: {
  request: (...args) => requests.push(args),
  cancel: id => cancels.push(id)
} };
const { apiFetch, isAndroid } = await import('../public/transport.js');
test('Android transport passes exact route and JSON without browser fetch', async () => {
  assert.equal(isAndroid, true);
  const responsePromise = apiFetch('/api/v1/plans/analyze', { method: 'POST', body: '{"goal":"读书"}' });
  const [id, path, method, body] = requests.at(-1);
  assert.equal(path, '/api/v1/plans/analyze'); assert.equal(method, 'POST'); assert.equal(body, '{"goal":"读书"}');
  window.__ganshaReply(id, 200, { status: 'ready' });
  const response = await responsePromise;
  assert.equal(response.ok, true); assert.deepEqual(await response.json(), { status: 'ready' });
});
test('native errors retain status and cannot be mistaken for a generated plan', async () => {
  const promise = apiFetch('/api/v1/settings/deepseek/test', { method: 'POST' });
  const id = requests.at(-1)[0];
  window.__ganshaReply(id, 503, { error: { code: 'DEEPSEEK_AUTH_ERROR' } });
  const response = await promise;
  assert.equal(response.ok, false); assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'DEEPSEEK_AUTH_ERROR');
});
test('cancellation cancels native work and ignores delayed native results', async () => {
  const controller = new AbortController();
  const promise = apiFetch('/api/v1/plans/analyze', { method: 'POST', signal: controller.signal });
  const id = requests.at(-1)[0]; controller.abort();
  await assert.rejects(promise, { name: 'AbortError' });
  assert.ok(cancels.includes(id));
  assert.doesNotThrow(() => window.__ganshaReply(id, 200, { status: 'ready' }));
});
