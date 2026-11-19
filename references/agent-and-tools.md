# Agent 循环、工具与上下文

## Agent 循环（agent.ts）

`Agent.run(userInput, events)` 的核心流程：

1. `createProvider()` 解析供应商 / Key / 模型；缺 Key 的处理见 `llm-providers.md`。
2. `history.push({role:'user', content: userInput})`。
3. 组装 `messages = [{role:'system', content: buildSystemPrompt()}, ...trimHistory()]`。
4. 循环 `turn = 1..maxTurns`（默认 40）：
   - 调 `provider.stream()`，流式 delta 通过 `onText` / `onReasoning` 回调；`tool_calls` 按 `id` 归并（同 id 覆盖 function）。
   - 流结束后，若有 tool_calls：push assistant 消息（`content = result.content || streamed || null`，带 `tool_calls`），逐个执行工具：
     - `JSON.parse(arguments || '{}')`，失败用 `{}`；
     - `confirmBeforeTool` 开启且工具不在 `autoApprove` 时调 `events.onConfirm`；拒绝则回填「用户拒绝了本次工具调用。」；
     - 结果超 `maxOutputChars ?? 20000` 截断并附「...[输出过长已截断]」；错误结果前缀「错误：」；
     - 回填 `role:'tool'` 消息，用 `tool_call_id` 与 `call.id` 配对。
   - 无 tool_calls → 记下最终文本，`break`。
   - 每轮检查 `signal.aborted` 以响应取消。
5. 结束统一 `sanitizeHistory()`。返回最终文本。

`MAX_HISTORY_MESSAGES = 80`；`trimHistory()` 会就地裁剪 `this.history`（保留 system 之外最近的消息）。工具异常被吞成 `{isError:true}` 的文本结果，不会抛出中断循环。

## 事件回调（AgentEvents）

`onText(delta)` / `onReasoning(delta)` / `onToolStart(name,args)` / `onToolEnd(name,result,ok,ms)` / `onTurn(n)` / `onError(msg)` / `onConfirm(name,args)=>bool` / `signal: AbortSignal`。

Web 层把这些回调转成 SSE 事件（`text` / `reasoning` / `tool_start` / `tool_end` / `error` / `done` / `conversation` / `refs`），桌面复用同一个 Web 服务，因此一套引擎可服务多个壳。

## 系统提示（prompt.ts）

`buildSystemPrompt()` 依次拼：
- 运行环境（cwd、时间 `YYYY-MM-DD HH:mm`、平台）；
- 内置工具清单 + MCP 工具清单（工具描述截断到 160 字；无 MCP 工具时提示 `sw mcp enable <id>`）；
- Skill 目录：`skills.catalog()` **只注入 name + description + scope**（渐进式加载，正文靠 `use_skill` 工具按需拉取）；
- 项目记忆：`path.join(cwd, memory.dir, memory.injectFile)`；
- `systemPromptAppend` 自定义规则；输出语言默认简体中文。

设计要点：工具同时出现在 system 文本和 tools schema 两个通道，提高模型调用准确率。

## 上下文修复（history.ts）

`sanitizeHistory()` 修复被中断的工具轮次（厂商 API 要求 assistant.tool_calls 与 tool 回复严格配对）：

- 遍历消息；遇到 `assistant.tool_calls`，收集其后**紧邻连续**的 `tool` 消息；
- `want = Set(tool_calls.id)`，`got = Set(reply.tool_call_id)`；
- **全部配对**才保留该 assistant + replies，并跳过已消费的回复；
- 否则：若该 assistant 有 `content`，只保留纯文本（丢弃 tool_calls）；无 content 则整条丢弃；
- 孤立的 `role:'tool'` 消息一律丢弃；
- 正常对话零变化。

调用时机：每轮 Agent 结束、落盘前；下一轮从磁盘恢复 history 后也建议跑一次。

## 内置工具（tools/builtin.ts）

11 个工具：`read_file`（带行号 offset/limit）、`write_file`、`edit_file`、`list_dir`、`glob`、`grep`、`run_command`、`web_search`、`web_fetch`、`todo_write`、`use_skill`。

实现要点：
- `edit_file`：`old_string` 必须唯一，靠 `raw.split(old).length - 1 === 1` 判定，重复则拒绝（比行号更安全）。
- `globToRegExp()` 手写：`**→.*`、`*→[^/\\]*`；`IGNORE_DIRS` 跳过 node_modules/.git/dist 等。
- `grep` 跳过 >2MB 文件。
- `run_command` `detectShell()`：非 Windows 用 `bash -lc`；Windows 优先 Git Bash（候选路径探测 `bash --version`），否则 `powershell.exe -NoProfile -Command`；超时 SIGKILL。
- `web_search` 优先 Tavily → Brave → 免密 DuckDuckGo HTML（双端点 html/lite 兜底）。
- 工具契约 `Tool{name, description, parameters(JSON Schema), readOnly?, execute(ctx)}`，`ctx` 带 signal；统一截断输出。
