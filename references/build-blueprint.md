# 分阶段构建路线图

按阶段实现，每阶段都有明确验证点。不要跳阶段——后面的模块依赖前面的抽象。

## 阶段 0：骨架

- `package.json`：`type:module`、`engines.node>=18.18`、bin `sw`/`simplework`、依赖 MCP SDK + undici、dev 依赖 typescript/tsx/@types/node。
- `tsconfig.json`：`target ES2022`、`module NodeNext`、`moduleResolution NodeNext`、`outDir dist`、严格模式。
- `src/index.ts` CLI 入口分发子命令。

**验证**：`npm run build` 无类型错误，`node dist/index.js --help` 有输出。

## 阶段 1：配置层

- `paths.ts` → `env.ts` → `config.ts`，先写死两个最小配置（models/config）跑通。
- 拷 `assets/config/` 四份 JSON 作为出厂预置（先留最小可用集）。

**验证**：三层配置合并符合「后者覆盖前者」；`${VAR}` 展开正确；写入走项目级/用户级而非出厂目录。

## 阶段 2：LLM 层

- `llm/types.ts` 统一表示 → `openai.ts`（先做这一家）→ `llm/index.ts` 分发。
- 用 `httpFetch` + `readSSE`（含代理与超时策略，见 pitfalls）。
- 再补 `anthropic.ts` 与 `ollama.ts`。

**验证**：`sw models list` 显示厂商；发一条最小请求拿到回复；流式逐字到达；有 Key / 无 Key 行为符合预期。

## 阶段 3：工具与 MCP

- `tools/types.ts` 契约 → `tools/builtin.ts` 11 个内置工具。
- `mcp/manager.ts` 三传输 + 超时 + 命令规范化。

**验证**：`sw doctor` 全绿；`sw mcp test filesystem` 能列出工具；Windows 下 npx 系 MCP 能连上。

## 阶段 4：Skill 系统

- `skills/loader.ts`（frontmatter 解析 + 目录去重 + catalog）→ `installer.ts`（sparse checkout + tarball 兜底）。

**验证**：`sw skills list` 有出厂 Skill；`sw skills install <name>` 能装到正确目录；系统提示里只出现 name+description。

## 阶段 5：Agent 循环

- `prompt.ts` → `history.ts` → `agent.ts`，接上阶段 2-4 的能力。

**验证**：多轮工具调用（TURN1 调工具 → TURN2 用结果回答）；中断后 history 经 sanitize 仍能被下一轮使用。

## 阶段 6：会话与 Web

- `conversations.ts` 会话仓库 → `session.ts` spawnAgent → `web/server.ts` + 单文件前端。

**验证**：两轮对话带 `conversationId` 能回忆上文；会话 JSON 落盘含 history + messages；断线 abort 后已产出内容被保存。

## 阶段 7：Web 增强（搜索 / 复制 / 引用 / 折叠）

- `ConversationStore.search()` + `/api/search`；前端两种搜索、四种复制、steps 折叠、跨对话引用选择器。

**验证**：对话内高亮计数与跳转、全局搜索命中片段、引用二次解析防伪造、折叠默认收起。

## 阶段 8：Electron 桌面版

- `desktop/main.cjs` + `preload.cjs` + `build-desktop.mjs` + 图标 + `package.json` fuses。

**验证**：见 `desktop-packaging.md` 的 4 步校验；便携目录生成全套配置、迁移不覆盖、asar 完整、exe 实跑正常。

## 全局验收清单

- [ ] `npm run typecheck` / `npm run build` 通过
- [ ] CLI 三件套：models list/test、mcp test、skills install
- [ ] 真实推理 + 工具循环跑通（含本地 Ollama 场景）
- [ ] 多会话上下文跨请求恢复
- [ ] Web SSE 逐字、断线保存
- [ ] 搜索 / 复制 / 引用 / 折叠功能均验证
- [ ] exe 便携模式在干净目录实测
- [ ] README 说明与实现一致

## 迭代建议

每加一个大能力都补一条「踩坑速查」（`pitfalls.md`）——它是本 Skill 最有价值的资产，把试错成本一次性沉淀下来。
