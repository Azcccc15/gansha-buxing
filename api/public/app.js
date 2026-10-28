import { apiFetch, isAndroid } from './transport.js';
const form = document.getElementById('goal-form');
const result = document.getElementById('result');
const message = document.getElementById('message');
const connection = document.getElementById('connection');
const generate = document.getElementById('generate');
const cancel = document.getElementById('cancel');
let controller;
let sequence = 0;
let activeInput;
let settingsToken = '';
let configured = false;
let analysisBusy = false;
let followupData;
let extensionTarget;
const keyInput = document.getElementById('deepseek-key');
const modelInput = document.getElementById('deepseek-model');
const settingsMessage = document.getElementById('settings-message');
const saveSettingsButton = document.getElementById('settings-save');
const testSettingsButton = document.getElementById('settings-test');

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function busy(value) {
  analysisBusy = value;
  generate.disabled = value || !configured;
  generate.textContent = value ? '正在分析你的目标……' : '生成我的方案 ↗';
  cancel.hidden = !value;
  for (const button of result.querySelectorAll('button')) button.disabled = value;
}
function status(text, error = false) {
  message.textContent = text;
  message.className = error ? 'error' : '';
}
async function health() {
  try {
    const response = await apiFetch('/api/v1/health');
    if (!response.ok) throw new Error();
    const data = await response.json();
    configured = data.configured;
    connection.className = data.configured ? 'notice' : 'notice error';
    connection.textContent = data.configured
      ? 'DeepSeek 已配置 · ' + data.model + ' · 真实分析会使用你的 DeepSeek 账户额度。'
      : '接口已启动，尚未填写 DeepSeek 密钥。请在下方“DeepSeek 接口设置”中填写并保存。';
    generate.disabled = !configured || analysisBusy;
  } catch {
    connection.className = 'notice error';
    connection.textContent = '接口暂时无法连接。请检查服务是否已启动。';
    generate.disabled = true;
  }
}
function settingsStatus(text, error = false) {
  settingsMessage.textContent = text;
  settingsMessage.className = error ? 'error' : '';
}
function authHeaders() {
  const token = document.getElementById('token').value.trim();
  return token ? { Authorization: 'Bearer ' + token } : {};
}
async function loadSettings() {
  const response = await apiFetch('/api/v1/settings/deepseek', { headers: authHeaders() });
  const data = await response.json();
  if (!response.ok) {
    settingsToken = '';
    throw new Error(data.error?.message || '设置状态读取失败，请稍后重试。');
  }
  settingsToken = data.csrfToken;
  document.getElementById('settings-state').textContent = data.configured ? '已配置' : '待配置';
  modelInput.value = data.model;
  keyInput.placeholder = data.configured ? '已保存密钥；留空保留当前密钥，也可粘贴新密钥替换' : '在这里粘贴你的 DeepSeek API Key，例如 sk-…';
  document.getElementById('key-hint').textContent = data.configured
      ? '已有密钥已自动识别，页面不会回显。替换后点击保存即可立即生效。'
    : isAndroid ? '密钥由手机系统密钥库加密保存，不会写入网页存储或在页面回显。' : '密钥保存到本机服务端，不会写入浏览器存储或在页面回显。';
  return data;
}
async function updateSettings(testOnly) {
  saveSettingsButton.disabled = true;
  testSettingsButton.disabled = true;
  settingsStatus(testOnly ? '正在测试 DeepSeek 连接……' : '正在保存设置……');
  const candidate = { apiKey: keyInput.value.trim(), model: modelInput.value.trim() };
  try {
    if (!settingsToken) await loadSettings();
    const response = await apiFetch('/api/v1/settings/deepseek' + (testOnly ? '/test' : ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Settings-Token': settingsToken, ...authHeaders() },
      body: JSON.stringify(candidate)
    });
    const data = await response.json();
    if (!response.ok) {
      if (data.error?.code === 'INVALID_SETTINGS_TOKEN') settingsToken = '';
      throw new Error(data.error?.message || '操作失败，请稍后重试。');
    }
    if (testOnly) {
      settingsStatus(data.message + (candidate.apiKey ? ' 当前输入尚未保存，请点击“保存设置”后使用。' : ''));
    } else {
      keyInput.value = '';
      await loadSettings();
      await health();
      settingsStatus(data.message);
    }
  } catch (error) {
    settingsStatus(error.message || '设置操作失败，请稍后重试。', true);
  } finally {
    saveSettingsButton.disabled = false;
    testSettingsButton.disabled = false;
  }
}
document.getElementById('settings-form').addEventListener('submit', event => {
  event.preventDefault();
  updateSettings(false);
});
testSettingsButton.addEventListener('click', () => updateSettings(true));

function renderQuestionnaire(data) {
  const questionnaire = element('section', undefined, 'questionnaire');
  questionnaire.setAttribute('aria-label', '补充信息小问卷');
  const answers = new Map((activeInput.answers || []).map(a => [a.questionId, a.answer]));
  let index = data.questions.findIndex(q => !answers.has(q.id));
  if (index === -1) index = data.questions.length;
  function show(focus = false) {
    questionnaire.replaceChildren();
    const reviewing = index === data.questions.length;
    const heading = element('h4', reviewing ? '回答好了，检查一下' : '第 ' + (index + 1) + ' / ' + data.questions.length + ' 题', 'quiz-heading');
    heading.tabIndex = -1;
    questionnaire.append(heading);
    const progress = element('progress');
    progress.max = data.questions.length;
    progress.value = reviewing ? data.questions.length : index;
    progress.setAttribute('aria-label', '问卷进度');
    questionnaire.append(progress);
    if (reviewing) {
      for (const [i, q] of data.questions.entries()) {
        const row = element('div', undefined, 'quiz-review');
        const copy = element('div');
        copy.append(element('p', q.text), element('strong', answers.get(q.id)));
        const edit = element('button', '修改', 'secondary quiz-edit');
        edit.type = 'button';
        edit.setAttribute('aria-label', '修改第 ' + (i + 1) + ' 题回答');
        edit.addEventListener('click', () => { index = i; show(true); });
        row.append(copy, edit);
        questionnaire.append(row);
      }
      const submit = element('button', '就这样，生成方案 ↗');
      submit.type = 'button';
      submit.addEventListener('click', () => {
        const combined = new Map((activeInput.answers || []).map(a => [a.questionId, a]));
        for (const q of data.questions) combined.set(q.id, { questionId: q.id, question: q.text, answer: answers.get(q.id) });
        analyze({ ...activeInput, answers: [...combined.values()] });
      });
      questionnaire.append(submit);
    } else {
      const q = data.questions[index];
      const question = element('p', q.text, 'quiz-question');
      question.id = 'quiz-question';
      const choices = element('div', undefined, 'quiz-choices');
      choices.setAttribute('role', 'group');
      choices.setAttribute('aria-labelledby', question.id);
      for (const answer of ['是', '否']) {
        const button = element('button', undefined, 'quiz-choice');
        button.type = 'button';
        button.setAttribute('aria-pressed', String(answers.get(q.id) === answer));
        button.append(element('span', answer === '是' ? '✓' : '−', 'quiz-symbol'), element('span', answer));
        button.firstChild.setAttribute('aria-hidden', 'true');
        button.addEventListener('click', () => { answers.set(q.id, answer); index++; show(true); });
        choices.append(button);
      }
      const reason = element('details', undefined, 'quiz-reason');
      reason.append(element('summary', '为什么问这个？'), element('p', q.reason, 'fine'));
      questionnaire.append(question, element('p', '轻点一个答案即可，无需打字。', 'summary'), choices, reason);
      if (index > 0) {
        const back = element('button', '← 上一题', 'secondary');
        back.type = 'button';
        back.addEventListener('click', () => { index--; show(true); });
        questionnaire.append(back);
      }
    }
    if (focus) heading.focus({ preventScroll: true });
  }
  show();
  return questionnaire;
}
function renderResponse(data) {
  result.replaceChildren();
  result.append(element('p', data.status === 'ready' ? '真实 AI 方案 · 待你确认' : '小干的分析', 'result-meta'));
  const title = data.plan?.title || (data.status === 'needs_information' ? '点一点，让方案更适合你' : '这个目标需要调整');
  result.append(element('h3', title, 'result-title'), element('p', data.summary, 'summary'));
  for (const warning of data.warnings) result.append(element('p', warning, 'warning'));
  if (data.status === 'needs_information') {
    result.append(renderQuestionnaire(data));
  }
  if (data.plan) {
    const p = data.plan;
    result.append(element('p', p.durationDays + ' 天 · 每天 ' + p.dailyMinutes + ' 分钟 · ' + p.category, 'result-meta'));
    result.append(element('h4', '完成标准', 'subhead'), element('p', p.completionCriteria, 'criterion'));
    if (p.assumptions.length) {
      result.append(element('h4', '方案使用的假设', 'subhead'));
      const list = element('ul');
      for (const assumption of p.assumptions) list.append(element('li', assumption));
      result.append(list);
    }
    result.append(element('h4', '分阶段，慢慢实现', 'subhead'));
    p.phases.forEach((phase, i) => {
      const row = element('div', undefined, 'phase');
      const copy = element('div');
      copy.append(element('strong', '第 ' + phase.startDay + '—' + phase.endDay + ' 天 · ' + phase.title), element('p', phase.description));
      row.append(element('span', i + 1, 'phase-number'), copy);
      result.append(row);
    });
    result.append(element('h4', '近期行动，已经排好', 'subhead'));
    for (const action of p.actions) {
      const card = element('div', undefined, 'action');
      card.append(element('small', '第 ' + action.day + ' 天 · ' + action.minutes + ' 分钟 · ' + action.time));
      card.append(element('p'), element('strong', action.title), element('p', '完成标准：' + action.completionCriteria));
      result.append(card);
    }
    if (document.getElementById('today-list')) {
      const adopt = element('button', extensionTarget ? '确认，添加后续行动' : '确认，开始我的目标 ↗');
      adopt.type = 'button';
      adopt.addEventListener('click', () => window.dispatchEvent(new CustomEvent('gansha:adopt', { detail: { plan: data.plan, input: activeInput, target: extensionTarget, button: adopt } })));
      result.append(adopt, element('p', '确认后才会保存行动。提醒需要另外开启，打卡不会自动证明目标已经达成。', 'fine'));
    } else result.append(element('p', '这是待确认草案，此接口调试页不保存任务或创建提醒。', 'warning'));
  }
  document.getElementById('response-details').hidden = false;
  document.getElementById('response-json').textContent = JSON.stringify(data, null, 2);
}
async function analyze(input) {
  controller?.abort();
  controller = new AbortController();
  const current = ++sequence;
  if (!input.answers.length) followupData = undefined;
  activeInput = input;
  result.replaceChildren(element('p', '正在分析：' + input.goal, 'summary'));
  document.getElementById('response-details').hidden = true;
  busy(true);
  status('正在向 DeepSeek 请求方案，请稍候……');
  try {
    const token = document.getElementById('token').value.trim();
    const response = await apiFetch('/api/v1/plans/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      signal: controller.signal,
      body: JSON.stringify(input)
    });
    const data = await response.json();
    if (current !== sequence) return;
    if (!response.ok) throw new Error(data.error?.message || '本次分析失败，请稍后重试。');
    followupData = data.status === 'needs_information' ? data : undefined;
    renderResponse(data);
    status(data.status === 'ready' ? '方案草案已生成。' : data.status === 'needs_information' ? '只需点选“是”或“否”，答完再生成方案。' : '请参考方案区域的建议调整目标。');
  } catch (error) {
    if (current !== sequence) return;
    if (followupData && input.answers.length) renderResponse(followupData);
    else result.replaceChildren(element('p', error.name === 'AbortError' ? '本次分析已取消，可以重新提交目标。' : '本次未生成方案，请根据提示重试。', 'summary'));
    status(error.name === 'AbortError' ? '已取消本次分析。' : error.message || '无法连接接口，请稍后重试。', error.name !== 'AbortError');
  } finally {
    if (current === sequence) busy(false);
  }
}
form.addEventListener('submit', event => {
  event.preventDefault();
  extensionTarget = undefined;
  const minutes = document.getElementById('minutes').value;
  analyze({
    goal: document.getElementById('goal').value.trim(),
    durationDays: Number(document.getElementById('days').value),
    ...(minutes ? { dailyMinutes: Number(minutes) } : {}),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
    answers: []
  });
});
cancel.addEventListener('click', () => controller?.abort());
window.addEventListener('gansha:extend', event => {
  extensionTarget = event.detail.goalId;
  analyze(event.detail.input);
});
if (isAndroid) {
  const advanced = document.getElementById('token')?.closest('details');
  if (advanced) advanced.hidden = true;
}
health();
loadSettings().catch(error => settingsStatus(error.message, true));
