// 先启动服务，再运行：node examples/analyze.mjs "30天内读完一本书" 30
const goal = process.argv[2] || '30天内读完一本一直想读的书';
const durationDays = Number(process.argv[3] || 30);
const baseURL = process.env.GANSHA_API_URL || 'http://localhost:8787';
const token = process.env.APP_API_TOKEN;
try {
  const response = await fetch(baseURL + '/api/v1/plans/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify({ goal, durationDays, timeZone: 'Asia/Shanghai' })
  });
  const result = await response.json();
  console.log(JSON.stringify(result, null, 2));
  if (!response.ok) process.exitCode = 1;
} catch {
  console.error('无法连接接口，请先启动服务并检查地址。');
  process.exitCode = 1;
}
