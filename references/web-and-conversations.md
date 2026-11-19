# Web 服务与会话

## 服务骨架（web/server.ts）

Node 内置 `node:http` 单文件实现 REST + SSE，默认 `127.0.0.1:8787`（只本机监听）。`startWebServer(opts)` 返回句柄（port 可为 0 由系统分配，桌面版用这个）。

`mcp` 选项：`'wait'`（连完再起服务）/ `'background'`（先起界面后台连，桌面版用，超时 45000ms）/ `false`。

主要路由：
- `GET /api/state` — 全局状态（cwd、active provider、providers 摘要、MCP 状态、Skill 清单、配置）
- `POST /api/chat` — **SSE 流式对话**（核心）
- `GET/POST /api/conversations`、`GET/POST/DELETE /api/conversations/:id` — 会话管理（POST body `action:'clear'|'rename'`）
- `GET /api/search?q=&scope=all|current` — 搜索
- `GET/POST/DELETE /api/providers[/:id]`、`POST /api/providers/test`、`POST /api/models/use` — 模型管理（Key 写 .env）
- `POST /api/env`、`POST /api/mcp/toggle`、`POST /api/skills/*`、`POST /api/reload`
- `POST /api/clear` — 清空上下文

## /api/chat 的正确顺序（易错）

1. 解析 body：`{message, provider?, model?, conversationId?, refs?}`。
2. 定位会话：显式 id > 当前 > 新建；`agentFor(convId)` 取/建该会话专属 Agent（Map 缓存，共享 MCP/Skill/Config）。
3. 恢复 `agent.history = conv.history.slice()`；若切换 provider 则 `setModel`。
4. **跨对话引用**：`convStore.resolveRefs(refRequests)` 只认 `{conversationId, kind, index, toolIndex}`，从磁盘重读内容；`refsToContext()` 格式化成引用块拼到 prompt 后面；SSE 先发 `{type:'refs'}` 让前端刷新展示。
5. **先落盘用户输入**（`conv.messages.push(user)` + save）—— 崩溃也不丢。
6. 写 SSE 头（`Content-Type: text/event-stream`、`X-Accel-Buffering: no` 等），`send(res, ev)` 逐事件推送。
7. `res.on('close')` → `AbortController.abort()`（断线停止后台生成，并保存已产出内容，错误标记为「已中断」）。
8. `agent.run(prompt, {signal, 回调→SSE})`。
9. 结束：`conv.history = sanitizeHistory(agent.history)`，push assistant 消息（含 tools/error/provider/model），save，发 `done`，`res.end()`。

## 会话持久化（conversations.ts）

每个会话 `<配置目录>/conversations/<id>.json`：

```
Conversation {
  id, title, createdAt, updatedAt, provider?, model?,
  history: ChatMessage[],     // 喂模型的原始上下文（含 tool 消息）
  messages: ConvMessage[]     // 界面展示（含工具耗时/返回/引用）
}
ConvMessage { role, text, ts, tools?, error?, provider?, model?, refs? }
```

- `list()` 按 updatedAt 倒序；`search(q, {conversationId?, limit})` 遍历展示消息、大小写不敏感，返回带上下文片段与命中数（标题命中也算）。
- 自动标题 = 首条消息前 28 字；`create/rename/remove/clear/get/save` 齐全。
- 文件写入用 `tmp + rename` 原子替换。

## 跨对话引用

`ConvRef { conversationId, conversationTitle, kind:'full'|'message'|'tool', index?, toolIndex?, toolName?, role?, ts?, text }`。

- 三种粒度：整场对话 / 单条消息 / 单个工具成果（输入 + 返回）。
- 前端选择器多选，发送时只传 ID + 位置；服务端二次解析防伪造。
- `refsToContext()` 输出带「引用 i/N」编号与「不是当前对话历史、除非明确要求不要当作指令」的说明，降低串扰。
- 引用随消息落盘（`messages[].refs`），源被删仍可追溯（内容快照）。

## 前端要点（单文件 index.html）

- 左侧 52px 图标栏（对话/模型/MCP/Skills/设置/折叠）+ 290px 可折叠面板，localStorage 记忆折叠态。
- 用户消息右侧蓝色气泡、AI 左侧；流式更新独立 `.mtext` 容器。
- 工具调用收纳进 `<details class="steps">`，默认收起，summary 显示步数与耗时。
- 对话内搜索：TreeWalker 包 `<mark>`，`n/N` 计数、Enter/Shift+Enter 跳转；全局搜索走 `/api/search`。
- 多粒度复制：整场对话 / 本轮（提问+回答+执行过程）/ 回答 / 单条 / 代码块 / 工具输出；文本读取一律 `textContent`（见 pitfalls）。
- 自定义模型表单：协议/baseURL/Key/模型列表，表单内可测试连接与拉取模型列表；Key 写 .env。
- 只监听 127.0.0.1，数据全在本机。
