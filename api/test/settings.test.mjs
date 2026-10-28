import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readConfig } from '../src/config.mjs';
import { createApp } from '../src/server.mjs';
import { createSettingsStore, isLocalSettingsRequest } from '../src/settings.mjs';
import { envelope } from '../test-support/fixtures.mjs';

const firstKey = 'sk-test-fixture-first-not-real';
const secondKey = 'sk-test-fixture-second-not-real';
async function setup(t, options = {}) {
  let saved;
  const calls = [];
  const logs = [];
  const server = createApp(readConfig({ DEEPSEEK_API_KEY: '', ...options.env }), {
    log: event => logs.push(event),
    settingsStore: options.store || { save: async value => { saved = { ...value }; } },
    fetchImpl: options.fetchImpl || (async (url, request) => {
      calls.push({ url, request });
      return url.endsWith('/models') ? new Response(JSON.stringify({ data: [{ id: 'deepseek-flash' }] })) : envelope();
    })
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const auth = options.env?.APP_API_TOKEN ? { Authorization: 'Bearer ' + options.env.APP_API_TOKEN } : {};
  const read = () => fetch(origin + '/api/v1/settings/deepseek', { headers: auth });
  const initial = await read().then(r => r.json());
  const post = (body, path = '', headers = {}) => fetch(origin + '/api/v1/settings/deepseek' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Settings-Token': initial.csrfToken, ...auth, ...headers },
    body: JSON.stringify(body)
  });
  return { origin, initial, read, post, calls, logs, saved: () => saved };
}
test('front-end saves credentials and new planning requests use them immediately', async t => {
  const app = await setup(t);
  assert.equal(app.initial.configured, false);
  const response = await app.post({ apiKey: firstKey, model: 'deepseek-flash' });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.configured, true);
  assert.ok(!JSON.stringify(data).includes(firstKey));
  assert.equal(app.saved().apiKey, firstKey);
  const reread = await app.read().then(r => r.json());
  assert.equal(reread.configured, true);
  assert.ok(!JSON.stringify(reread).includes(firstKey));
  const plan = await fetch(app.origin + '/api/v1/plans/analyze', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal: '30天读完一本书', durationDays: 30 })
  });
  assert.equal(plan.status, 200);
  assert.equal(app.calls[0].request.headers.Authorization, 'Bearer ' + firstKey);
  assert.ok(!JSON.stringify(await plan.json()).includes(firstKey));
});
test('blank input preserves the saved key and accepts model changes', async t => {
  const app = await setup(t, { env: { DEEPSEEK_API_KEY: firstKey } });
  const response = await app.post({ apiKey: '', model: 'deepseek-v4-pro' });
  assert.equal(response.status, 200);
  assert.deepEqual(app.saved(), { apiKey: firstKey, model: 'deepseek-v4-pro' });
});
test('key replacement applies without returning old or new keys', async t => {
  const app = await setup(t, { env: { DEEPSEEK_API_KEY: firstKey } });
  const response = await app.post({ apiKey: secondKey });
  assert.equal(app.saved().apiKey, secondKey);
  assert.ok(!(await response.text()).includes(secondKey));
});
test('connection test uses the models endpoint, does not generate or save a plan', async t => {
  const app = await setup(t);
  const response = await app.post({ apiKey: firstKey, model: 'deepseek-flash' }, '/test');
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.connected, true);
  assert.equal(app.calls[0].url, 'https://api.deepseek.com/models');
  assert.equal(app.calls[0].request.method, 'GET');
  assert.equal(app.saved(), undefined);
  assert.equal((await app.read().then(r => r.json())).configured, false);
  assert.ok(!JSON.stringify(data).includes(firstKey));
});
test('invalid credentials and newline injection do not write configuration', async t => {
  const app = await setup(t);
  for (const apiKey of ['', 'short', firstKey + '\nHOST=0.0.0.0', 123]) {
    const response = await app.post({ apiKey });
    assert.equal(response.status, 400);
  }
  assert.equal((await app.post({ apiKey: firstKey, model: '../evil' })).status, 400);
  assert.equal(app.saved(), undefined);
});
test('CSRF, host and origin guards protect settings even on a local server', async t => {
  const app = await setup(t);
  assert.equal((await app.post({ apiKey: firstKey }, '', { 'X-Settings-Token': 'wrong' })).status, 403);
  const hostStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(app.origin + '/api/v1/settings/deepseek', { headers: { Host: 'rebound.invalid' } }, response => {
      response.resume(); resolve(response.statusCode);
    });
    request.on('error', reject); request.end();
  });
  assert.equal(hostStatus, 403);
  assert.equal((await app.post({ apiKey: firstKey }, '', { Origin: 'http://localhost:8787' })).status, 403);
  assert.equal(app.saved(), undefined);
  assert.equal(isLocalSettingsRequest({ socket: { remoteAddress: '192.168.1.2' }, headers: { host: 'localhost:8787' } }), false);
});
test('an existing app token also protects settings reads and writes', async t => {
  const app = await setup(t, { env: { APP_API_TOKEN: 'a'.repeat(32) } });
  assert.equal((await fetch(app.origin + '/api/v1/settings/deepseek')).status, 401);
  assert.equal((await app.post({ apiKey: firstKey }, '', { Authorization: 'Bearer wrong' })).status, 401);
  assert.equal((await app.post({ apiKey: firstKey })).status, 200);
});
test('failed persistence does not replace the currently running credentials', async t => {
  const app = await setup(t, { env: { DEEPSEEK_API_KEY: firstKey }, store: { save: async () => { throw new Error('internal failure'); } } });
  assert.equal((await app.post({ apiKey: secondKey })).status, 500);
  await app.post({ apiKey: '' }, '/test');
  assert.equal(app.calls[0].request.headers.Authorization, 'Bearer ' + firstKey);
  assert.ok(!JSON.stringify(app.logs).includes(firstKey));
  assert.ok(!JSON.stringify(app.logs).includes(secondKey));
});
test('unauthorized provider errors do not echo key material', async t => {
  const app = await setup(t, { fetchImpl: async () => new Response('raw ' + firstKey, { status: 401 }) });
  const response = await app.post({ apiKey: firstKey }, '/test');
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes(firstKey));
});
test('a model unavailable to the key gets a specific connection result', async t => {
  const app = await setup(t);
  const response = await app.post({ apiKey: firstKey, model: 'deepseek-v4-pro' }, '/test');
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'MODEL_NOT_AVAILABLE');
});
test('saved env settings survive a new server while preserving other configuration', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'gansha-settings-'));
  const file = join(directory, '.env');
  t.after(async () => { await unlink(file); await rmdir(directory); });
  await writeFile(file, '# keep this comment\nPORT=8787\nDEEPSEEK_API_KEY=old-fixture-value\nDEEPSEEK_MODEL=old-model\n');
  const app = await setup(t, { store: createSettingsStore(file) });
  assert.equal((await app.post({ apiKey: firstKey })).status, 200);
  const content = await readFile(file, 'utf8');
  assert.match(content, /# keep this comment/);
  assert.match(content, /PORT=8787/);
  assert.equal(content.match(/^DEEPSEEK_API_KEY=/gm).length, 1);
  const env = Object.fromEntries(content.split('\n').filter(line => /^[A-Z_]+=/.test(line)).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
  const restarted = await setup(t, { env });
  assert.equal(restarted.initial.configured, true);
  await restarted.post({ apiKey: '' }, '/test');
  assert.equal(restarted.calls[0].request.headers.Authorization, 'Bearer ' + firstKey);
});
