import { AppError } from './errors.mjs';
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function inputError(message) { throw new AppError(400, 'INVALID_REQUEST', message); }
function outputError() { throw new AppError(502, 'INVALID_AI_RESPONSE', 'AI 返回的方案格式不完整，请重试。'); }
function text(value, name, max, fail = inputError) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(name + '格式不正确。');
  return value.trim();
}
function num(value, min, max, fail = outputError) {
  if (!Number.isInteger(value) || value < min || value > max) fail('数值范围不正确。');
  return value;
}
function strings(value, maxItems, maxLength) {
  if (!Array.isArray(value) || value.length > maxItems) outputError();
  return value.map(v => text(v, '', maxLength, outputError));
}
export function validateInput(body) {
  if (!isObject(body)) inputError('请求内容必须是 JSON 对象。');
  const goal = text(body.goal, '目标', 500);
  const durationDays = num(body.durationDays, 1, 3650, inputError);
  let dailyMinutes;
  if (body.dailyMinutes !== undefined && body.dailyMinutes !== null) dailyMinutes = num(body.dailyMinutes, 5, 480, inputError);
  const timeZone = body.timeZone === undefined ? 'Asia/Shanghai' : text(body.timeZone, '时区', 100);
  try { new Intl.DateTimeFormat('zh-CN', { timeZone }).format(); } catch { inputError('时区无效。'); }
  const context = body.context === undefined || body.context === '' ? '' : text(body.context, '补充情况', 2000);
  const rawAnswers = body.answers ?? [];
  if (!Array.isArray(rawAnswers) || rawAnswers.length > 10) inputError('最多提供 10 条补充回答。');
  const ids = new Set();
  const answers = rawAnswers.map(a => {
    if (!isObject(a)) inputError('补充回答格式不正确。');
    const questionId = text(a.questionId, '问题编号', 80);
    if (!/^[a-zA-Z0-9_-]+$/.test(questionId) || ids.has(questionId)) inputError('问题编号无效或重复。');
    ids.add(questionId);
    if (a.question !== undefined && !['是', '否'].includes(a.answer)) inputError('是非题只能回答“是”或“否”。');
    return {
      questionId, answer: text(a.answer, '回答', 500),
      ...(a.question !== undefined ? { question: text(a.question, '问题', 500) } : {})
    };
  });
  return { goal, durationDays, dailyMinutes, timeZone, context, answers };
}
export function validateAnalysis(value, request) {
  if (!isObject(value) || !['ready', 'needs_information', 'cannot_plan'].includes(value.status)) outputError();
  const summary = text(value.summary, '', 1500, outputError);
  const warnings = strings(value.warnings, 5, 500);
  if (!Array.isArray(value.questions) || value.questions.length > 3) outputError();
  const seen = new Set();
  const questions = value.questions.map(q => {
    if (!isObject(q) || q.type !== 'yes_no') outputError();
    const id = text(q.id, '', 80, outputError);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || seen.has(id) || request.answers?.some(a => a.questionId === id)) outputError();
    seen.add(id);
    return { id, type: 'yes_no', text: text(q.text, '', 120, outputError), reason: text(q.reason, '', 500, outputError) };
  });
  if (value.status !== 'ready') {
    if (value.plan !== null || (value.status === 'needs_information' ? (!questions.length || request.answers?.length) : questions.length)) outputError();
    return { status: value.status, summary, warnings, questions, plan: null };
  }
  if (questions.length || !isObject(value.plan)) outputError();
  const p = value.plan;
  if (p.durationDays !== request.durationDays) outputError();
  const dailyMinutes = num(p.dailyMinutes, 5, 480);
  if (request.dailyMinutes !== undefined && dailyMinutes !== request.dailyMinutes) outputError();
  if (!Array.isArray(p.phases) || !p.phases.length || p.phases.length > 8) outputError();
  let expectedDay = 1;
  const phases = p.phases.map(phase => {
    if (!isObject(phase)) outputError();
    const startDay = num(phase.startDay, 1, request.durationDays);
    const endDay = num(phase.endDay, startDay, request.durationDays);
    if (startDay !== expectedDay) outputError();
    expectedDay = endDay + 1;
    return { startDay, endDay, title: text(phase.title, '', 100, outputError), description: text(phase.description, '', 800, outputError) };
  });
  if (expectedDay !== request.durationDays + 1) outputError();
  if (!Array.isArray(p.actions) || p.actions.length !== Math.min(7, request.durationDays)) outputError();
  const actions = p.actions.map((a, index) => {
    if (!isObject(a) || a.day !== index + 1) outputError();
    if (typeof a.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(a.time)) outputError();
    return {
      day: a.day, title: text(a.title, '', 150, outputError),
      minutes: num(a.minutes, 1, dailyMinutes), time: a.time,
      completionCriteria: text(a.completionCriteria, '', 500, outputError)
    };
  });
  return {
    status: 'ready', summary, warnings, questions: [],
    plan: {
      title: text(p.title, '', 200, outputError), category: text(p.category, '', 50, outputError),
      durationDays: p.durationDays, dailyMinutes,
      completionCriteria: text(p.completionCriteria, '', 1000, outputError),
      assumptions: strings(p.assumptions, 6, 500), phases, actions
    }
  };
}
