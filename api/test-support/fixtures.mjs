export function readyAnalysis(days = 30) {
  return {
    status: 'ready', summary: '每天安排一小段阅读时间，并定期回顾。',
    warnings: [], questions: [],
    plan: {
      title: '读完一本书', category: '阅读', durationDays: days, dailyMinutes: 20,
      completionCriteria: '读完选定的书，并留下简短阅读记录。',
      assumptions: ['暂按每天20分钟安排', '建议19:30提醒，等待用户确认'],
      phases: [{ startDay: 1, endDay: days, title: '持续阅读与回顾', description: '按章节阅读，在最后一天回顾收获。' }],
      actions: Array.from({ length: Math.min(7, days) }, (_, i) => ({
        day: i + 1, title: i === 0 ? '浏览目录，阅读前10页' : '继续阅读并记下一句启发',
        minutes: 20, time: '19:30', completionCriteria: '完成当日阅读，并留下简短记录。'
      }))
    }
  };
}
export function envelope(analysis = readyAnalysis(), finishReason = 'stop') {
  return new Response(JSON.stringify({
    choices: [{ finish_reason: finishReason, message: { content: JSON.stringify(analysis), reasoning_content: 'internal-reasoning-not-for-client' } }]
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
