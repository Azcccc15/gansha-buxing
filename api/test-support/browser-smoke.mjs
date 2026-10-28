import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readConfig } from '../src/config.mjs';
import { createApp } from '../src/server.mjs';
import { readyAnalysis, envelope } from './fixtures.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/JXGM/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = new URL('../../artifacts/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
let server;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:8787/developer', { waitUntil: 'networkidle' });
  const currentHealth = await page.request.get('http://localhost:8787/api/v1/health').then(r => r.json());
  await page.getByRole('heading', { name: 'DeepSeek 接口设置' }).waitFor();
  assert.equal(await page.getByRole('button', { name: /生成我的方案/ }).isDisabled(), !currentHealth.configured);
  assert.equal(await page.getByLabel('API 密钥', { exact: true }).inputValue(), '');
  await page.screenshot({ path: fileURLToPath(new URL('api-not-configured.png', output)), fullPage: true });
  const config = readConfig({ DEEPSEEK_API_KEY: '', DEEPSEEK_TIMEOUT_MS: '1000' });
  let saved;
  const analysisInputs = [];
  let retryFailed = false;
  server = createApp(config, { log: () => {}, settingsStore: { save: async value => { saved = value; } }, fetchImpl: async (url, options) => {
    if (url.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'deepseek-flash' }] }));
    const input = JSON.parse(JSON.parse(options.body).messages[1].content);
    analysisInputs.push(input);
    if (input.goal.includes('余额')) return new Response('fixture error', { status: 402 });
    if (input.goal.includes('等待')) return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('cancel', 'AbortError')), { once: true }));
    if (input.goal.includes('补问') && !input.answers.length) return envelope({
      status: 'needs_information', summary: '缺少关键情况。', warnings: [],
      questions: (input.goal.includes('三题') ? [
        { id: 'baseline', type: 'yes_no', text: '你是否已经接触过这个领域？', reason: '基础会影响开始的难度。' },
        { id: 'resource', type: 'yes_no', text: '你是否已经准备好学习资料？', reason: '避免安排暂时无法开始的任务。' },
        { id: 'evening', type: 'yes_no', text: '你是否方便在晚间行动？', reason: '选择合适的建议时间。' }
      ] : [{ id: 'baseline', type: 'yes_no', text: '你是否已经接触过这个领域？', reason: '基础会影响开始的难度。' }]), plan: null
    });
    if (input.goal.includes('重试') && !retryFailed) { retryFailed = true; return new Response('fixture error', { status: 500 }); }
    const plan = readyAnalysis(input.durationDays);
    plan.plan.title = '读完一本书 <img src=x onerror=alert(1)>';
    return envelope(plan);
  } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseURL = 'http://127.0.0.1:' + server.address().port;
  config.origins.add(baseURL);
  await page.goto(baseURL + '/developer', { waitUntil: 'networkidle' });
  await page.getByLabel('API 密钥', { exact: true }).fill('sk-browser-fixture-not-a-real-key');
  assert.equal(await page.getByLabel('API 密钥', { exact: true }).getAttribute('type'), 'password');
  await page.getByRole('button', { name: '测试连接', exact: true }).click();
  await page.locator('#settings-message').filter({ hasText: /连接正常/ }).waitFor();
  assert.equal(saved, undefined);
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await page.locator('#settings-message').filter({ hasText: /立即生效/ }).waitFor();
  assert.equal(saved.apiKey, 'sk-browser-fixture-not-a-real-key');
  assert.equal(await page.getByLabel('API 密钥', { exact: true }).inputValue(), '');
  await page.getByText(/DeepSeek 已配置/).waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText(/DeepSeek 已配置/).waitFor();
  assert.equal(await page.getByLabel('API 密钥', { exact: true }).inputValue(), '');
  assert.equal(await page.evaluate(() => Object.keys(localStorage).length), 0);
  await page.getByLabel('你的目标').fill('30天读完一本书');
  await page.getByRole('button', { name: /生成我的方案/ }).click();
  await page.getByRole('heading', { name: /读完一本书 <img/ }).waitFor();
  assert.equal(await page.locator('#result img').count(), 0);
  assert.equal(await page.locator('#result .action').count(), 7);
  await page.getByLabel('你的目标').fill('30天学习，需要补问');
  await page.getByRole('button', { name: /生成我的方案/ }).click();
  await page.getByText('你是否已经接触过这个领域？', { exact: true }).waitFor();
  assert.equal(await page.locator('#result textarea, #result input').count(), 0);
  await page.getByRole('button', { name: '是', exact: true }).click();
  await page.getByRole('heading', { name: '回答好了，检查一下' }).waitFor();
  await page.getByRole('button', { name: '修改第 1 题回答' }).click();
  assert.equal(await page.getByRole('button', { name: '是', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: '否', exact: true }).click();
  await page.getByRole('button', { name: /就这样，生成方案/ }).click();
  await page.getByRole('heading', { name: /读完一本书 <img/ }).waitFor();
  assert.deepEqual(analysisInputs.at(-1).answers, [{ questionId: 'baseline', question: '你是否已经接触过这个领域？', answer: '否' }]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('你的目标').fill('三题补问，失败后重试');
  await page.getByRole('button', { name: /生成我的方案/ }).click();
  await page.getByRole('heading', { name: '第 1 / 3 题' }).waitFor();
  const beforeAnswers = analysisInputs.length;
  await page.locator('.output').screenshot({ path: fileURLToPath(new URL('questionnaire-mobile.png', output)) });
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    assert.equal(await page.getByRole('button', { name: '是', exact: true }).isVisible(), true);
    assert.equal(await page.getByRole('button', { name: '否', exact: true }).isVisible(), true);
  }
  await page.getByRole('button', { name: '是', exact: true }).click();
  await page.getByRole('button', { name: '否', exact: true }).click();
  await page.getByRole('button', { name: '← 上一题', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '否', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: '否', exact: true }).click();
  await page.getByRole('button', { name: '是', exact: true }).click();
  await page.getByRole('heading', { name: '回答好了，检查一下' }).waitFor();
  assert.equal(analysisInputs.length, beforeAnswers);
  await page.getByRole('button', { name: /就这样，生成方案/ }).click();
  await page.locator('#message').filter({ hasText: /暂时无法生成方案/ }).waitFor();
  await page.getByRole('heading', { name: '回答好了，检查一下' }).waitFor();
  assert.equal(await page.locator('.quiz-review').count(), 3);
  await page.getByRole('button', { name: /就这样，生成方案/ }).click();
  await page.getByRole('heading', { name: /读完一本书 <img/ }).waitFor();
  assert.deepEqual(analysisInputs.at(-1).answers.map(a => a.answer), ['是', '否', '是']);
  assert.ok(analysisInputs.at(-1).answers.every(a => a.question));
  await page.getByLabel('你的目标').fill('测试余额错误');
  await page.getByRole('button', { name: /生成我的方案/ }).click();
  await page.locator('#message').filter({ hasText: /余额不足/ }).waitFor();
  assert.equal(await page.locator('#result .action').count(), 0);
  await page.getByLabel('你的目标').fill('等待分析，用于取消测试');
  await page.getByRole('button', { name: /生成我的方案/ }).click();
  await page.getByRole('button', { name: '取消本次分析' }).click();
  await page.locator('#message').filter({ hasText: '已取消本次分析。' }).waitFor();
  assert.equal(await page.getByRole('button', { name: /生成我的方案/ }).isDisabled(), false);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    const fit = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    assert.equal(fit, true);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: masked key settings, live credential activation, one/three-question yes-no flows, navigation and editing, original question with answers, single final submission, retained answers after failure, no free-text follow-up, responsive quiz, analysis, errors and cancellation.');
} finally {
  await browser.close();
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
