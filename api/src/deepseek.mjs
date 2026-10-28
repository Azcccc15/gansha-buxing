import { readFileSync } from 'node:fs';
import { AppError } from './errors.mjs';
import { validateAnalysis } from './validation.mjs';

const systemPrompt = readFileSync(new URL('./system-prompt.txt', import.meta.url), 'utf8');
const MAX_RESPONSE_BYTES = 512 * 1024;

async function readJSON(response) {
  const chunks = [];
  let size = 0;
  if (!response.body) throw new AppError(502, 'EMPTY_AI_RESPONSE', 'DeepSeek 没有返回内容，请重试。');
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_RESPONSE_BYTES) throw new AppError(502, 'AI_RESPONSE_TOO_LARGE', 'AI 返回内容过长，请缩小目标范围后重试。');
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {
    throw new AppError(502, 'INVALID_AI_RESPONSE', 'DeepSeek 返回内容无法解析，请重试。');
  }
}

export async function generateAnalysis(input, config, { fetchImpl = fetch, signal } = {}) {
  if (!config.apiKey) throw new AppError(503, 'DEEPSEEK_NOT_CONFIGURED', '请在服务端 api/.env 中填写 DEEPSEEK_API_KEY，然后重启服务。');
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), config.timeoutMs);
  const combinedSignal = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
  try {
    const response = await fetchImpl(config.baseURL + '/chat/completions', {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.apiKey },
      signal: combinedSignal,
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify({ ...input, today: new Intl.DateTimeFormat('sv-SE', { timeZone: input.timeZone }).format() }) }
        ],
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 6000,
        stream: false
      })
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      if ([401, 403].includes(response.status)) throw new AppError(503, 'DEEPSEEK_AUTH_ERROR', 'DeepSeek 密钥无效或没有访问权限，请检查服务端配置。');
      if (response.status === 402) throw new AppError(503, 'DEEPSEEK_BALANCE_REQUIRED', 'DeepSeek 账户余额不足，请检查账户余额。');
      if (response.status === 429) throw new AppError(503, 'DEEPSEEK_BUSY', 'DeepSeek 当前请求较多，请稍后重试。');
      throw new AppError(502, 'DEEPSEEK_UNAVAILABLE', 'DeepSeek 暂时无法生成方案，请稍后重试。');
    }
    const result = await readJSON(response);
    const choice = result?.choices?.[0];
    if (choice?.finish_reason === 'length') throw new AppError(502, 'AI_OUTPUT_TRUNCATED', 'AI 方案未生成完整，请重试或缩小目标范围。');
    if (choice?.finish_reason !== 'stop') throw new AppError(502, 'INVALID_AI_RESPONSE', 'AI 本次未能完整生成方案，请重试。');
    const content = choice?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new AppError(502, 'EMPTY_AI_RESPONSE', 'AI 本次返回为空，请重试。');
    let parsed;
    try { parsed = JSON.parse(content); } catch {
      throw new AppError(502, 'INVALID_AI_RESPONSE', 'AI 返回的方案格式不正确，请重试。');
    }
    return validateAnalysis(parsed, input);
  } catch (error) {
    if (signal?.aborted) throw new AppError(499, 'REQUEST_CANCELLED', '本次分析已取消。');
    if (timeout.signal.aborted) throw new AppError(504, 'DEEPSEEK_TIMEOUT', '分析超时，请稍后重试。');
    if (error instanceof AppError) throw error;
    throw new AppError(502, 'DEEPSEEK_CONNECTION_FAILED', '暂时无法连接 DeepSeek，请检查网络后重试。');
  } finally {
    clearTimeout(timer);
  }
}

export async function testConnection(config, { fetchImpl = fetch, signal } = {}) {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), Math.min(config.timeoutMs, 15000));
  try {
    const response = await fetchImpl(config.baseURL + '/models', {
      method: 'GET', redirect: 'error',
      headers: { Authorization: 'Bearer ' + config.apiKey },
      signal: signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      if ([401, 403].includes(response.status)) throw new AppError(503, 'DEEPSEEK_AUTH_ERROR', '密钥无效或没有权限，请检查后重试。');
      if (response.status === 429) throw new AppError(503, 'DEEPSEEK_BUSY', 'DeepSeek 当前请求较多，请稍后再试。');
      throw new AppError(502, 'DEEPSEEK_UNAVAILABLE', 'DeepSeek 暂时无法连接，请稍后再试。');
    }
    const data = await readJSON(response);
    if (!Array.isArray(data.data) || !data.data.some(model => model?.id === config.model)) {
      throw new AppError(400, 'MODEL_NOT_AVAILABLE', '连接成功，但当前模型不可用，请核对模型名称。');
    }
    return { connected: true, model: config.model, message: '连接正常，密钥和模型可以使用。' };
  } catch (error) {
    if (signal?.aborted) throw new AppError(499, 'REQUEST_CANCELLED', '连接测试已取消。');
    if (timeout.signal.aborted) throw new AppError(504, 'DEEPSEEK_TIMEOUT', '连接测试超时，请检查网络后重试。');
    if (error instanceof AppError) throw error;
    throw new AppError(502, 'DEEPSEEK_CONNECTION_FAILED', '无法连接 DeepSeek，请检查网络后重试。');
  } finally { clearTimeout(timer); }
}
