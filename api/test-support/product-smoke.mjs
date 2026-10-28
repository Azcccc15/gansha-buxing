import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { createApp } from '../src/server.mjs';
import { readConfig } from '../src/config.mjs';
import { readyAnalysis, envelope } from './fixtures.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/JXGM/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }) });
const config = readConfig({ DEEPSEEK_API_KEY: 'sk-fixture-for-product-tests' });
const server = createApp(config, { fetchImpl: async (_, options) => {
  const input = JSON.parse(JSON.parse(options.body).messages[1].content);
  return envelope(readyAnalysis(input.durationDays));
}, settingsStore: { save: async () => {} }, log: () => {} });
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const baseURL = 'http://127.0.0.1:' + server.address().port; config.origins.add(baseURL);
const output = new URL('../../artifacts/product/', import.meta.url); await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const view = name => page.locator('nav').getByRole('button', { name, exact: true }).click();
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.getByText('先种下一个想法', { exact: true }).waitFor();
  await view('＋ 新目标');
  await page.getByLabel('你的目标').fill('10天读完一本书'); await page.locator('#days').fill('10');
  await page.getByRole('button', { name: /生成我的方案/ }).click();
  await page.getByRole('button', { name: '确认，开始我的目标 ↗', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('gansha.state.v1')), null);
  await page.screenshot({ path: fileURLToPath(new URL('01-plan.png', output)), fullPage: true });
  await page.getByRole('button', { name: '确认，开始我的目标 ↗', exact: true }).click();
  await page.locator('#goals-list h3').filter({ hasText: '读完一本书' }).first().waitFor();
  await view('今日行动');
  await page.getByRole('button', { name: '完成这项行动', exact: true }).click();
  await page.getByRole('dialog').filter({ hasText: '这项行动真的完成了吗？' }).waitFor();
  await page.screenshot({ path: fileURLToPath(new URL('02-confirm.png', output)), fullPage: true });
  await page.getByRole('button', { name: '再想想', exact: true }).click();
  assert.equal(await page.locator('#today-list .locked').count(), 0);
  await page.getByRole('button', { name: '完成这项行动', exact: true }).click();
  await page.getByRole('button', { name: '确认完成', exact: true }).click();
  await page.getByRole('button', { name: '收下这份成就 ↗' }).waitFor();
  await page.screenshot({ path: fileURLToPath(new URL('03-daily-achievement.png', output)), fullPage: true });
  await page.getByRole('button', { name: '收下这份成就 ↗' }).click();
  assert.equal(await page.locator('#today-list .task-card button').count(), 0);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#today-list .locked').waitFor();
  await page.screenshot({ path: fileURLToPath(new URL('04-today.png', output)), fullPage: true });
  await view('我的目标');
  await page.locator('#goals-list summary').click();
  const deleteButton = page.locator('#goals-list').getByRole('button', { name: '删除', exact: true }).first();
  await deleteButton.click(); await page.getByRole('button', { name: '删除行动', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('gansha.state.v1')).goals[0].tasks.some(t => t.deleted));
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('gansha.state.v1')).goals[0].tasks.filter(t => t.deleted).length), 1);
  await page.getByRole('button', { name: '生成后续行动', exact: true }).click();
  await page.getByRole('button', { name: '确认，添加后续行动', exact: true }).click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('gansha.state.v1')).goals[0].tasks.length), 10);
  await page.screenshot({ path: fileURLToPath(new URL('05-goals.png', output)), fullPage: true });
  await page.getByRole('button', { name: '我已达成目标 ✦', exact: true }).click();
  await page.getByRole('button', { name: '确认目标已达成', exact: true }).click();
  await page.getByRole('heading', { name: '你真的做到了！', exact: true }).waitFor();
  await page.screenshot({ path: fileURLToPath(new URL('06-goal-achievement.png', output)), fullPage: true });
  await page.getByRole('button', { name: '收下这份成就 ↗' }).click();
  assert.equal(await page.locator('#history-list .goal-card').count(), 1);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('#history-list .goal-card').count(), 1);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of ['今日行动', '我的目标', '＋ 新目标', '设置']) {
      await view(name);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, name + ' at ' + width);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: fileURLToPath(new URL('07-settings.png', output)), fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await view('我的目标');
  await page.screenshot({ path: fileURLToPath(new URL('08-dark.png', output)), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: confirmed adoption, persistent goals, secondary completion confirmation, cancellation, locked records, daily/goal celebration, delete unfinished task, rolling action generation, history, light/dark and 320/390/1280px layouts.');
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
