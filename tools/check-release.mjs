import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString('utf8').split('\0').filter(Boolean);
}
export function checkRelease(files = trackedFiles()) {
  const secrets = [];
  for (const name of ['api/.env', 'android/signing.properties']) {
    const file = path.join(root, name);
    if (!existsSync(file)) continue;
    const contents = readFileSync(file, 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^(DEEPSEEK_API_KEY|APP_API_TOKEN|storePassword|keyPassword)\s*=\s*(.+)$/);
      if (match && match[2].trim().length >= 16) secrets.push(match[2].trim().replace(/^['"]|['"]$/g, ''));
    }
  }
  for (const name of files) {
    if (/^private\/|^deliverables\/|^artifacts\/|(^|\/)\.env$|(^|\/)signing\.properties$|\.(jks|keystore|p12|pem)$|(^|\/)local\.properties$/i.test(name)) throw new Error('禁止发布敏感文件：' + name);
    const bytes = readFileSync(path.join(root, name));
    for (const secret of secrets) if (bytes.includes(Buffer.from(secret))) throw new Error('发现真实凭据，请检查文件：' + name);
    if (/sk-[A-Za-z0-9]{32,}/.test(bytes.toString('utf8'))) throw new Error('发现疑似真实 API 密钥，请检查文件：' + name);
  }
  console.log('PASS: ' + files.length + ' tracked files checked; no private configuration, signing key or known live secret included.');
  return files;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) checkRelease();
