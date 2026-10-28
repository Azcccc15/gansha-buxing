# 目标分析接口

接口版本：v1。默认服务地址：http://localhost:8787 。

## 生成方案

POST /api/v1/plans/analyze

请求头：

    Content-Type: application/json
    Authorization: Bearer <APP_API_TOKEN>

默认仅本机运行且未配置 APP_API_TOKEN 时，可以省略 Authorization。DeepSeek 密钥不属于此请求，不能从客户端传入。

最简请求：

    {
      "goal": "两天内读完指定的两章并做简短笔记",
      "durationDays": 2
    }

可选字段：

| 字段 | 含义 |
| --- | --- |
| dailyMinutes | 每天可用分钟数，整数 5—480；省略时由 AI 建议并说明假设 |
| timeZone | IANA 时区，默认 Asia/Shanghai |
| context | 已知基础、资源或限制，最多 2000 字；可以省略 |
| answers | 对上次补问的回答，见下方示例 |

goal 是 1—500 字的非空字符串；durationDays 是 1—3650 的整数。周期须由客户端明确传入，服务不会用一句模糊目标私自决定期限。

## 三种成功响应

HTTP 200 表示分析完成；客户端仍应检查 status：

- ready：方案草案已生成，展示给用户确认。
- needs_information：只有关键资料不足时补问一轮，优先 1 题、最多 3 题。每题 type=yes_no，前端逐题展示“是／否”按钮，最后检查并统一提交。
- cannot_plan：无法为该目标制定方案，展示原因和替代建议，不创建任务。

方案示例（内容由 AI 动态生成）：

    {
      "requestId": "服务生成的请求编号",
      "status": "ready",
      "summary": "先阅读第一章并记录要点，第二天完成另一章并回顾。",
      "warnings": [],
      "questions": [],
      "plan": {
        "title": "读完两章并做笔记",
        "category": "阅读",
        "durationDays": 2,
        "dailyMinutes": 20,
        "completionCriteria": "读完指定两章，并各写下三条要点。",
        "assumptions": ["暂按每天20分钟安排", "建议19:30提醒，等待用户确认"],
        "phases": [
          {
            "startDay": 1,
            "endDay": 2,
            "title": "阅读与回顾",
            "description": "每天完成一章并留下简短记录。"
          }
        ],
        "actions": [
          {
            "day": 1,
            "title": "读完第一章并写下三条要点",
            "minutes": 20,
            "time": "19:30",
            "completionCriteria": "第一章读完，并记录三条要点。"
          },
          {
            "day": 2,
            "title": "读完第二章，回顾两章之间的联系",
            "minutes": 20,
            "time": "19:30",
            "completionCriteria": "第二章读完，并补充三条要点。"
          }
        ]
      },
      "meta": {
        "provider": "deepseek",
        "model": "deepseek-flash",
        "generatedAt": "2026-10-27T08:00:00.000Z",
        "timeZone": "Asia/Shanghai",
        "draftId": "服务生成的草案编号",
        "requiresConfirmation": true,
        "activated": false
      }
    }

generatedAt 是 ISO UTC 时间；行动中的 time 是 meta.timeZone 所指定时区的本地时刻。day=1 表示用户后续确认并启动计划的第一天，不代表接口调用时自动开始计划。

仅提供前 min(7, durationDays) 天的具体行动，阶段覆盖整个周期。后续滚动生成未来行动、任务存储和提醒安排属于下一阶段的安卓业务功能。

补问示例：

    {
      "status": "needs_information",
      "summary": "需要了解影响活动安排的身体限制。",
      "warnings": [],
      "questions": [
        {
          "id": "limitations",
          "type": "yes_no",
          "text": "是否有影响运动的身体限制？",
          "reason": "这会影响活动类型与强度。"
        }
      ],
      "plan": null
    }

实际响应同样带有 requestId、meta。补问和不能制定方案时，draftId 为 null，requiresConfirmation 为 false，activated 始终为 false。

补充时重新提交原目标和周期，并带上当前所有回答：

    {
      "goal": "30天建立适合自己的运动习惯",
      "durationDays": 30,
      "answers": [
        {"questionId": "limitations", "question": "是否有影响运动的身体限制？", "answer": "是"}
      ]
    }

问题编号和 question 原题应来自前一次响应，编号不能重复。服务是无状态接口，因此必须连同原题提交，AI 才能正确理解“是／否”的含义。带 question 时 answer 只能为“是”或“否”；兼容旧客户端省略 question 的文字回答。问题文本最多120字，每题只问一个明确事实。回答后不再补问；资料不足时提供保守且范围受限的草案，或说明暂无法制定方案，不猜测精确年龄、体重等资料。

## 错误响应

    {
      "requestId": "请求编号",
      "error": {
        "code": "DEEPSEEK_NOT_CONFIGURED",
        "message": "请在服务端 api/.env 中填写 DEEPSEEK_API_KEY，然后重启服务。"
      }
    }

| HTTP | 常见错误码 | 客户端处理 |
| --- | --- | --- |
| 400 | INVALID_REQUEST / INVALID_JSON | 检查输入 |
| 401 | UNAUTHORIZED | 检查接口访问口令 |
| 403 | ORIGIN_NOT_ALLOWED | 检查允许的浏览器来源 |
| 413 | REQUEST_TOO_LARGE | 精简输入；整个请求上限 16 KiB |
| 415 | UNSUPPORTED_MEDIA_TYPE | 使用 application/json |
| 429 | RATE_LIMITED | 稍后重试，读取 Retry-After |
| 502 | INVALID_AI_RESPONSE / AI_OUTPUT_TRUNCATED / DEEPSEEK_CONNECTION_FAILED | 保留用户目标并展示错误，允许手动重试 |
| 503 | DEEPSEEK_NOT_CONFIGURED / DEEPSEEK_AUTH_ERROR / DEEPSEEK_BALANCE_REQUIRED / DEEPSEEK_BUSY / SERVER_BUSY | 检查服务配置或稍后重试 |
| 504 | DEEPSEEK_TIMEOUT | 提示分析超时，允许手动重试 |

服务不自动付费重试，不会用模板冒充失败后的 AI 结果。取消客户端请求后会中止本地等待和上游连接；已发出的请求是否计费以 DeepSeek 为准。

## 与现有原型字段对应

| 接口字段 | 界面字段 |
| --- | --- |
| 原请求 goal | sourceGoal |
| plan.durationDays | days |
| plan.dailyMinutes | minutes |
| summary | summary |
| plan.completionCriteria | criteria |
| plan.phases[].startDay / endDay | 阶段日期范围 |
| plan.phases[].description | 阶段说明 |
| plan.actions[].title / minutes / time | 任务名称、耗时、建议提醒时间 |
| plan.assumptions / warnings | 待用户核对的假设与提示 |

确认草案后再创建任务。AI 返回的任何文本都应作为普通文字显示，不能作为 HTML、代码或直接执行的系统操作。

## 服务检查

GET /api/v1/health 返回服务状态、配置是否齐全、模型和是否要求接口口令，不返回密钥。

默认每个来源地址每分钟最多分析 20 次，同时最多 2 次；可通过 .env 修改。此限制保存在单进程内存中，重启会清零。

## 前端密钥设置

仅允许来自本机回环地址、Host 为 localhost 或回环地址的页面操作；浏览器 Origin 必须与请求 Host 一致。若已配置 APP_API_TOKEN，以下接口也需要同样的 Authorization。

GET /api/v1/settings/deepseek

    {
      "configured": true,
      "model": "deepseek-flash",
      "csrfToken": "服务生成的设置防伪令牌"
    }

只返回是否配置和模型，不返回完整或部分密钥。

POST /api/v1/settings/deepseek：保存并立即应用。

请求头除 Content-Type 和可选 Authorization 外，还需 X-Settings-Token，值来自上面的 csrfToken。

    {
      "apiKey": "用户在本机页面中输入的密钥",
      "model": "deepseek-flash"
    }

apiKey 留空或省略时保留当前密钥，首次配置不可留空；model 省略时保留当前模型。服务会保留 .env 中其他配置，写入成功后才切换运行中的凭据。模型名称只能包含字母、数字、点、下划线或短横线。

POST /api/v1/settings/deepseek/test：检查候选或已保存凭据，使用同样的请求头与请求体。测试调用官方 GET /models 接口，核对当前模型是否可用，不生成方案，也不保存候选密钥。

典型设置错误：API_KEY_REQUIRED、INVALID_API_KEY、INVALID_MODEL、INVALID_SETTINGS_TOKEN、LOCAL_SETTINGS_ONLY、SETTINGS_SAVE_FAILED、MODEL_NOT_AVAILABLE。客户端应展示 message，不应记录请求中的密钥。
