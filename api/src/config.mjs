import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AppError } from './errors.mjs';

export function loadLocalEnv() {
  const path = fileURLToPath(new URL('../.env', import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
}
function integer(env, key, fallback, min, max) {
  const value = env[key] === undefined || env[key] === '' ? fallback : Number(env[key]);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new AppError(500, 'INVALID_CONFIGURATION', key + ' 配置不正确。');
  }
  return value;
}
export function readConfig(env = process.env) {
  const host = (env.HOST || '127.0.0.1').trim();
  const apiToken = (env.APP_API_TOKEN || '').trim();
  if ((apiToken && apiToken.length < 32) || (!['127.0.0.1', 'localhost', '::1'].includes(host) && apiToken.length < 32)) {
    throw new AppError(500, 'INVALID_CONFIGURATION', '开放网络访问前，请设置至少 32 字符的 APP_API_TOKEN。');
  }
  let baseURL;
  try { baseURL = new URL(env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'); } catch {
    throw new AppError(500, 'INVALID_CONFIGURATION', 'DeepSeek 服务地址格式不正确。');
  }
  if (baseURL.protocol !== 'https:' || baseURL.username || baseURL.password || baseURL.search || baseURL.hash) {
    throw new AppError(500, 'INVALID_CONFIGURATION', 'DeepSeek 服务地址必须使用 HTTPS，且不能包含凭据或查询参数。');
  }
  const model = (env.DEEPSEEK_MODEL || 'deepseek-flash').trim();
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(model)) throw new AppError(500, 'INVALID_CONFIGURATION', '模型名称配置不正确。');
  const port = integer(env, 'PORT', 8787, 1, 65535);
  const origins = new Set(['http://127.0.0.1:' + port, 'http://localhost:' + port, 'http://[::1]:' + port]);
  for (const entry of (env.CORS_ORIGINS || '').split(',').filter(Boolean)) {
    let origin;
    try { origin = new URL(entry.trim()); } catch {
      throw new AppError(500, 'INVALID_CONFIGURATION', 'CORS_ORIGINS 格式不正确。');
    }
    if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== entry.trim()) {
      throw new AppError(500, 'INVALID_CONFIGURATION', 'CORS_ORIGINS 需填写完整来源，例如 http://localhost:5173。');
    }
    origins.add(origin.origin);
  }
  return Object.freeze({
    host, port, apiToken, origins,
    apiKey: (env.DEEPSEEK_API_KEY || '').trim(), model,
    baseURL: baseURL.href.replace(/\/$/, ''),
    timeoutMs: integer(env, 'DEEPSEEK_TIMEOUT_MS', 60000, 100, 180000),
    requestsPerMinute: integer(env, 'RATE_LIMIT_PER_MINUTE', 20, 1, 600),
    maxConcurrent: integer(env, 'MAX_CONCURRENT_REQUESTS', 2, 1, 20)
  });
}
