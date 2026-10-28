import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { AppError } from './errors.mjs';

export function createSettingsStore(file = new URL('../.env', import.meta.url)) {
  const target = file instanceof URL ? file : pathToFileURL(file);
  return {
    async save({ apiKey, model }) {
      let existing = '';
      try { existing = await readFile(target, 'utf8'); } catch (error) {
        if (error.code !== 'ENOENT') throw new AppError(500, 'SETTINGS_SAVE_FAILED', '无法读取本机配置，请检查文件权限。');
      }
      function replaceSetting(content, name, value) {
        const line = name + '=' + value;
        const pattern = new RegExp('^[\\t ]*(?:export[\\t ]+)?' + name + '[\\t ]*=.*$', 'gm');
        return pattern.test(content) ? content.replace(pattern, () => line) : content + (content.endsWith('\n') || !content ? '' : '\n') + line + '\n';
      }
      const next = replaceSetting(replaceSetting(existing, 'DEEPSEEK_API_KEY', apiKey), 'DEEPSEEK_MODEL', model);
      const temporary = new URL('.env-' + randomUUID() + '.tmp', target);
      try {
        await writeFile(temporary, next, { mode: 0o600, flag: 'wx' });
        await rename(temporary, target);
      } catch {
        await unlink(temporary).catch(() => {});
        throw new AppError(500, 'SETTINGS_SAVE_FAILED', '保存失败，原配置未更新。请检查配置文件是否可写。');
      }
    }
  };
}

export function validateCredentials(body, current) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError(400, 'INVALID_SETTINGS', '设置内容格式不正确。');
  if (body.apiKey !== undefined && typeof body.apiKey !== 'string') throw new AppError(400, 'INVALID_API_KEY', '请输入有效的 API 密钥。');
  const apiKey = body.apiKey?.trim() || current.apiKey;
  if (!apiKey) throw new AppError(400, 'API_KEY_REQUIRED', '请先填写 DeepSeek API 密钥。');
  if (!/^[A-Za-z0-9._-]{16,512}$/.test(apiKey)) throw new AppError(400, 'INVALID_API_KEY', '密钥格式不正确，请检查是否复制完整，且没有换行或空格。');
  const model = body.model === undefined ? current.model : body.model;
  if (typeof model !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(model)) throw new AppError(400, 'INVALID_MODEL', '模型名称格式不正确。');
  return { apiKey, model };
}

export function isLocalSettingsRequest(req) {
  const localAddresses = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
  if (!localAddresses.includes(req.socket.remoteAddress)) return false;
  try {
    const hostURL = new URL('http://' + req.headers.host);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostURL.hostname)) return false;
    if (req.headers.origin && req.headers.origin !== hostURL.origin) return false;
    return true;
  } catch { return false; }
}
