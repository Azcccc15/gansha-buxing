// The same interface serves desktop development and the offline Android shell.
let sequence = 0;
const pending = new Map();
export const isAndroid = Boolean(window.GanshaNative);
window.__ganshaReply = (id, status, data) => {
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  clearTimeout(entry.timer);
  entry.cleanup();
  entry.resolve({ ok: status >= 200 && status < 300, status, json: async () => data });
};
export function apiFetch(path, options = {}) {
  if (!isAndroid) return fetch(path, options);
  return new Promise((resolve, reject) => {
    const id = String(++sequence);
    const abort = () => {
      pending.delete(id);
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      window.GanshaNative.cancel(id);
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => { abort(); }, 185000);
    const cleanup = () => options.signal?.removeEventListener('abort', abort);
    if (options.signal?.aborted) { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); return; }
    pending.set(id, { resolve, timer, cleanup });
    options.signal?.addEventListener('abort', abort, { once: true });
    try {
      window.GanshaNative.request(id, path, options.method || 'GET', options.body || '{}');
    } catch {
      pending.delete(id); clearTimeout(timer); cleanup();
      reject(new Error('手机接口暂时无法连接，请重新打开应用。'));
    }
  });
}
