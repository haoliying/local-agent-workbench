# 架构总览

## 一句话定位

一个本地优先的 Agent 工作台 = **统一消息/工具中间表示** → **三协议适配器** → **Agent 多轮循环（工具配对 + 历史修复）** → **事件回调解耦 UI（Web SSE / Electron）** + **三级配置目录** + **渐进式 Skill** + **便携目录环境变量下传**。

## 技术栈与依赖

- Node.js >= 18.18，TypeScript，`type: module` ESM
- 运行时依赖**只有两个**：`@modelcontextprotocol/sdk`（MCP）、`undici`（代理感知 fetch + SSE/NDJSON）
- 开发依赖：typescript、tsx、@types/node
- 双入口 bin：`sw` / `simplework`；Web 用内置 `node:http`；桌面用 Electron + electron-builder

刻意不引 axios / express / 重框架——保持本地工具轻量、启动快、可整体打包。

## 目录结构（源码骨架）

```
src/
├── core/
│   ├── paths.ts          三级目录解析 + 可迁移配置根
│   ├── env.ts            .env 加载 + ${VAR} 递归展开 + 应用内写 Key
│   ├── config.ts         配置分层合并（按 id 合并 providers/servers/skills）
│   ├── http.ts           代理感知 fetch + SSE/NDJSON 流解析 + 超时策略
│   ├── llm/              types.ts(统一表示) + openai/anthropic/ollama/index(分发)
│   ├── tools/            types.ts(契约) + builtin.ts(内置工具)
│   ├── mcp/manager.ts    MCP 客户端（stdio/streamableHttp/sse）
│   ├── skills/           loader.ts(加载目录) + installer.ts(下载安装)
│   ├── agent.ts          Agent 循环（流式 + 工具 + 裁剪）
│   ├── conversations.ts  会话仓库（展示消息 + 模型上下文 + 引用）
│   ├── history.ts        上下文修复（丢弃中断的工具轮次）
│   ├── prompt.ts         系统提示组装
│   └── session.ts        组装以上为一个会话，支持 spawnAgent 派生多实例
├── cli/commands.ts       CLI 命令
├── web/server.ts         node:http REST + SSE，web/public/index.html 单文件前端
└── index.ts              CLI 入口
desktop/
├── main.cjs              Electron 主进程：内嵌服务 + 便携目录 + 配置迁移
├── preload.cjs           IPC 白名单（info / open-path / 新建会话）
├── payload/              编译产物 + config + skills 的同步副本（被 asar 打包）
└── scripts/              载荷同步、图标生成
config/                   出厂预置四份 JSON
skills/                   出厂自带 Skill
```

## 分层与数据流

```
用户/前端
   │  消息（含可选的跨对话引用请求）
   ▼
Web server (/api/chat) ── 每会话一个 Agent，先落盘用户输入
   │
   ▼
Agent.run(prompt)
   │  ① 组装 system（工具目录 + Skill 目录 + 记忆 + 自定义规则）
   │  ② history = [system] + trimHistory()
   │  ③ provider.stream()  ← createProvider() 按 protocol 分发
   │  ④ 流式 delta → 事件回调 → SSE；tool_calls 按 id 归并
   │  ⑤ 逐个执行工具（内置 / MCP），结果作为 role:tool 回填
   │  ⑥ 无更多 tool_calls → sanitizeHistory() → 落盘
   ▼
conversations/<id>.json   （history = 模型上下文；messages = 界面展示）
```

## 关键抽象

**统一中间表示**（`llm/types.ts`）：`ChatMessage{role, content|null, name?, tool_calls?, tool_call_id?}`、`ToolCall{id, type:'function', function:{name, arguments:string}}`。所有 Provider 把厂商协议翻译成这个表示，Agent 只认这一套。

**事件回调**（`AgentEvents`）：`onText / onReasoning / onToolStart / onToolEnd / onTurn / onConfirm / signal`。Agent 不依赖任何 UI，Web 把回调转成 SSE 事件，桌面复用同一个 Web 服务。这是「一套引擎、多个壳」的关键。

**会话隔离**（Web）：`agents: Map<convId, Agent>`，每个会话独立 Agent（独立 history），共享 MCP / Skill / Config。切换会话即切换 Agent 实例。

**三级配置**：出厂预置 < 用户级 < 项目级，按 id 合并；`SIMPLEWORK_CONFIG_DIR` / `SIMPLEWORK_PORTABLE_DIR` 可整体改写配置根（便携迁移的基础）。

## 扩展新能力的标准切口

- 加新模型协议：在 `llm/` 加适配器实现 `LLMProvider`，在 `llm/index.ts` 分发分支加 case，在 `Protocol` 类型加枚举值。
- 加内置工具：在 `tools/builtin.ts` 注册一个 `Tool`（name + JSON Schema + execute），默认只读工具可标记 `readOnly` 免确认。
- 加 MCP 传输：在 `mcp/manager.ts` 的 transport 分派里加分支并包装超时。
- 加 Web 能力：`web/server.ts` 加路由 + 前端加面板；涉及会话数据则扩 `Conversation` 结构并做向后兼容（字段可选 + 读取时补默认值）。

每个切口对应的验证点与常见错误见 `build-blueprint.md` 与 `pitfalls.md`。
