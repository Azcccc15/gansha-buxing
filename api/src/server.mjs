import http from 'node:http';
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadLocalEnv, readConfig } from './config.mjs';
import { AppError } from './errors.mjs';
import { validateInput } from './validation.mjs';
import { generateAnalysis, testConnection } from './deepseek.mjs';
import { createSettingsStore, validateCredentials, isLocalSettingsRequest } from './settings.mjs';

const MAX_BODY_BYTES = 16 * 1024;
const staticFiles = new Map([
  ['/', ['home.html', 'text/html; charset=utf-8']],
  ['/developer', ['index.html', 'text/html; charset=utf-8']],
  ['/home.html', ['home.html', 'text/html; charset=utf-8']],
  ['/appui.css', ['appui.css', 'text/css; charset=utf-8']],
  ['/goals.js', ['goals.js', 'text/javascript; charset=utf-8']],
  ['/store.js', ['store.js', 'text/javascript; charset=utf-8']],
  ['/transport.js', ['transport.js', 'text/javascript; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/settings.css', ['settings.css', 'text/css; charset=utf-8']]
]);
function sendJSON(res, status, body) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
function authorized(header, token) {
  if (!token) return true;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const digest = text => createHash('sha256').update(text).digest();
  return timingSafeEqual(digest(header.slice(7)), digest(token));
}
async function readBody(req) {
  if (Number(req.headers['content-length']) > MAX_BODY_BYTES) {
    req.resume();
    throw new AppError(413, 'REQUEST_TOO_LARGE', '请求内容过长，请精简目标和补充情况。');
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    let failed = false;
    const chunks = [];
    req.on('data', chunk => {
      if (failed) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        failed = true;
        reject(new AppError(413, 'REQUEST_TOO_LARGE', '请求内容过长，请精简目标和补充情况。'));
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      if (failed) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch {
        reject(new AppError(400, 'INVALID_JSON', '请求内容不是有效的 JSON。'));
      }
    });
    req.on('error', () => reject(new AppError(400, 'REQUEST_INTERRUPTED', '请求传输中断。')));
    req.on('aborted', () => reject(new AppError(400, 'REQUEST_INTERRUPTED', '请求传输中断。')));
  });
}

export function createApp(config, { fetchImpl = fetch, log = entry => console.error(JSON.stringify(entry)), settingsStore = createSettingsStore() } = {}) {
  let inFlight = 0;
  let credentials = { apiKey: config.apiKey, model: config.model };
  let settingsQueue = Promise.resolve();
  const settingsToken = randomBytes(32).toString('hex');
  const buckets = new Map();
  function useQuota(ip) {
    const now = Date.now();
    for (const [key, value] of buckets) if (value.resetAt <= now) buckets.delete(key);
    let bucket = buckets.get(ip);
    if (!bucket) {
      if (buckets.size >= 512) throw new AppError(503, 'SERVER_BUSY', '当前访问较多，请稍后重试。');
      bucket = { count: 0, resetAt: now + 60000 };
      buckets.set(ip, bucket);
    }
    if (bucket.count >= config.requestsPerMinute) throw new AppError(429, 'RATE_LIMITED', '本分钟分析次数较多，请稍后再试。');
    bucket.count++;
  }
  const server = http.createServer(async (req, res) => {
    const requestId = randomUUID();
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    let occupied = false;
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      const origin = req.headers.origin;
      if (origin) {
        if (!config.origins.has(origin)) throw new AppError(403, 'ORIGIN_NOT_ALLOWED', '当前页面来源未获允许。');
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'OPTIONS' && path === '/api/v1/plans/analyze') {
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '600'
        });
        res.end();
        return;
      }
      if (req.method === 'GET' && path === '/api/v1/health') {
        sendJSON(res, 200, {
          status: 'ok', service: '干啥不行', provider: 'deepseek',
          configured: Boolean(credentials.apiKey), model: credentials.model,
          authRequired: Boolean(config.apiToken), settingsAvailable: isLocalSettingsRequest(req)
        });
        return;
      }
      if (req.method === 'GET' && staticFiles.has(path)) {
        const [file, contentType] = staticFiles.get(path);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(readFileSync(new URL('../public/' + file, import.meta.url)));
        return;
      }
      if (['/api/v1/settings/deepseek', '/api/v1/settings/deepseek/test'].includes(path)) {
        if (!isLocalSettingsRequest(req)) throw new AppError(403, 'LOCAL_SETTINGS_ONLY', '密钥设置仅限本机页面操作。');
        if (!authorized(req.headers.authorization, config.apiToken)) throw new AppError(401, 'UNAUTHORIZED', '请先填写接口访问口令，再读取或保存设置。');
        if (req.method === 'GET' && path === '/api/v1/settings/deepseek') {
          sendJSON(res, 200, { configured: Boolean(credentials.apiKey), model: credentials.model, csrfToken: settingsToken });
          return;
        }
        if (req.method !== 'POST') throw new AppError(405, 'METHOD_NOT_ALLOWED', '设置更新与测试需要使用 POST 请求。');
        if (req.headers['x-settings-token'] !== settingsToken) throw new AppError(403, 'INVALID_SETTINGS_TOKEN', '设置页面已更新，请刷新页面后重试。');
        if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', '请使用 application/json 提交设置。');
        const body = await readBody(req);
        if (path.endsWith('/test')) {
          const candidate = validateCredentials(body, credentials);
          useQuota(req.socket.remoteAddress);
          const connection = await testConnection({ ...config, ...candidate }, { fetchImpl, signal: controller.signal });
          sendJSON(res, 200, connection);
        } else {
          const save = settingsQueue.then(async () => {
            const next = validateCredentials(body, credentials);
            await settingsStore.save(next);
            credentials = next;
          });
          settingsQueue = save.catch(() => {});
          await save;
          sendJSON(res, 200, { configured: true, model: credentials.model, message: '设置已保存并立即生效，无需重启。' });
        }
        return;
      }
      if (path !== '/api/v1/plans/analyze') throw new AppError(404, 'NOT_FOUND', '没有找到这个接口。');
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS');
        throw new AppError(405, 'METHOD_NOT_ALLOWED', '此接口需要使用 POST 请求。');
      }
      if (!authorized(req.headers.authorization, config.apiToken)) throw new AppError(401, 'UNAUTHORIZED', '接口访问口令不正确或尚未填写。');
      if (!credentials.apiKey) throw new AppError(503, 'DEEPSEEK_NOT_CONFIGURED', '请在页面的“DeepSeek 接口设置”中填写并保存 API 密钥。');
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', '请使用 application/json 提交目标。');
      const input = validateInput(await readBody(req));
      useQuota(req.socket.remoteAddress || 'unknown');
      if (inFlight >= config.maxConcurrent) throw new AppError(503, 'SERVER_BUSY', '已有方案正在生成，请稍后再试。');
      inFlight++;
      occupied = true;
      const requestConfig = { ...config, ...credentials };
      const analysis = await generateAnalysis(input, requestConfig, { fetchImpl, signal: controller.signal });
      sendJSON(res, 200, {
        requestId, ...analysis,
        meta: {
          provider: 'deepseek', model: requestConfig.model,
          generatedAt: new Date().toISOString(), timeZone: input.timeZone,
          draftId: analysis.status === 'ready' ? randomUUID() : null,
          requiresConfirmation: analysis.status === 'ready',
          activated: false
        }
      });
    } catch (error) {
      const known = error instanceof AppError;
      const status = known ? error.status : 500;
      const code = known ? error.code : 'INTERNAL_ERROR';
      if (status === 429) res.setHeader('Retry-After', '60');
      if (status >= 500) log({ requestId, status, code });
      sendJSON(res, status, { requestId, error: { code, message: known ? error.message : '服务暂时出错，请稍后重试。' } });
    } finally {
      if (occupied) inFlight--;
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  return server;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    loadLocalEnv();
    const config = readConfig();
    const server = createApp(config);
    server.on('error', error => {
      console.error(error.code === 'EADDRINUSE' ? '端口已被占用，请修改 api/.env 中的 PORT 后重试。' : '服务启动失败，请检查 HOST 和 PORT。');
      process.exitCode = 1;
    });
    server.listen(config.port, config.host, () => {
      console.log('干啥不行 · DeepSeek 接口已启动');
      console.log('本机测试页面：http://localhost:' + config.port);
      console.log(config.apiKey ? '密钥已配置；真实分析会使用 DeepSeek 账户额度。' : '尚未配置密钥：请打开页面，在“DeepSeek 接口设置”中填写并保存。');
    });
    for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => server.close());
  } catch (error) {
    console.error(error instanceof AppError ? error.message : '配置读取失败，请检查 api/.env。');
    process.exitCode = 1;
  }
}
