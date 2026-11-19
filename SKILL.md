---
name: local-agent-workbench
description: 构建、理解或扩展「本地优先、配置驱动的轻量 Agent 工作台」时使用。这类工作台参照 WorkBuddy 模式（Agent 循环 + 内置工具 + MCP + Skill），但所有远程能力由本地 JSON 配置驱动，可打包成免安装桌面 exe。当用户要从零搭建类似 SimpleWork 的 Agent 应用、移植其多模型/多协议适配、三级配置体系、MCP/Skill 加载器、Web SSE 会话、Electron 便携打包，或排查其中的代理/超时/asar/会话持久化问题时加载本 Skill。
agent_created: true
---

# 本地优先 Agent 工作台构建指南

## 概述

本 Skill 蒸馏自一个完整落地的参考实现（SimpleWork）：Node.js + TypeScript 的本地 Agent 工作台，具备 Model Context Protocol（MCP）工具接入、渐进式 Skill、多会话 Web UI 与 Electron 便携桌面版。目标是让加载者在「搭建 / 理解 / 扩展 / 排错」同类系统时，直接复用已验证的架构骨架与踩坑结论，而不是从零试错。

核心设计取舍：**本地优先、零重依赖、配置即代码、可整体迁移**。只用两个运行时依赖（MCP SDK + undici），模型/MCP/Skill 全部预置在出厂 JSON，用户只填 Key 或开关。

## 何时以及如何使用

按任务类型选择路径：

| 任务 | 读取 |
| --- | --- |
| 从零搭建一个 Agent 工作台 | 先看 `references/architecture.md` 定骨架，再按 `references/build-blueprint.md` 分阶段实现 |
| 理解现有实现 / 回答某模块怎么工作 | 按主题读 `references/` 下对应文档（配置、Provider、Agent、MCP/Skill、Web、桌面） |
| 增加一类模型 / 自定义模型 | `references/llm-providers.md` |
| 做多会话 / 上下文持久化 / 搜索复制引用 | `references/web-and-conversations.md` |
| 打桌面 exe / 便携化 | `references/desktop-packaging.md` |
| 遇到反直觉故障（连不上、卡死、静默退出、工具无输出） | **先读 `references/pitfalls.md`** —— 这里记录了所有踩过的坑与修复 |

使用原则：
- 先读 `architecture.md` 建立全局观，再按需加载专题文档，避免一次性吞下全部参考。
- 遇到具体报错时，优先在 `pitfalls.md` 里按症状检索（可用 grep），多数问题已有现成结论。
- 从零实现时，直接复制 `assets/` 下的配置骨架与 `scripts/` 下的可复用脚本，不要凭记忆重写。

## 核心能力地图

1. **三级配置体系**：出厂预置 < 用户级 < 项目级，按 id 合并、环境变量展开、配置即代码。见 `references/config-system.md`。
2. **三协议模型适配**：OpenAI 兼容 / Anthropic 原生 / Ollama 原生（NDJSON），统一中间表示 + 适配器。见 `references/llm-providers.md`。
3. **Agent 循环**：流式输出 → 按 id 归并工具调用 → 回填结果 → 多轮迭代；落盘前用 sanitize 修复中断轮次。见 `references/agent-and-tools.md`。
4. **MCP + Skill**：stdio/http/sse 三种传输、工具名前缀防冲突；Skill 目录常驻、正文按需加载。见 `references/mcp-and-skills.md`。
5. **Web 会话层**：每会话一个隔离 Agent，SSE 流式，多会话 JSON 持久化，两种搜索、多粒度复制、跨对话引用。见 `references/web-and-conversations.md`。
6. **Electron 便携桌面版**：主进程内嵌本地服务，窗口只做浏览器壳；配置跟随 exe 目录、整体可迁移。见 `references/desktop-packaging.md`。

## 从零构建的最短路径

1. 建项目骨架：`package.json`（`type:module`、仅 MCP SDK + undici 两个运行依赖）、`tsconfig.json`、CLI 入口 + Web 入口双 bin。
2. 建 `config/*.json` 四份出厂配置（config/models/mcp/skills），可直接拷 `assets/config/` 改造。
3. 实现配置层：`paths.ts`（三级目录）→ `env.ts`（.env + 占位符展开）→ `config.ts`（分层合并）。
4. 实现 LLM 层：`llm/types.ts` 统一消息/工具表示 → 三套 Provider → `llm/index.ts` 按协议分发。
5. 实现工具层：`tools/types.ts` 契约 → `tools/builtin.ts` 内置工具 → `mcp/manager.ts` → `skills/loader.ts` + `installer.ts`。
6. 实现 `agent.ts` 循环 + `history.ts` 修复 + `prompt.ts` 系统提示。
7. 接 Web（`web/server.ts` + 单文件前端）与桌面壳（`desktop/main.cjs`）。
8. 每阶段都对照 `references/build-blueprint.md` 的验证点自检，最后跑 `scripts/doctor.mjs` 体检。

## 资源清单

- `references/architecture.md` — 全局架构、模块职责、数据流、目录结构
- `references/build-blueprint.md` — 分阶段构建路线图与各阶段验证点
- `references/config-system.md` — 三级配置合并、.env 展开、自定义模型增删
- `references/llm-providers.md` — 三协议适配器细节与统一中间表示
- `references/agent-and-tools.md` — Agent 循环、工具配对、历史裁剪、系统提示
- `references/mcp-and-skills.md` — MCP 传输与工具注册、Skill 加载与安装
- `references/web-and-conversations.md` — SSE 服务、会话持久化、搜索/复制/跨对话引用
- `references/desktop-packaging.md` — Electron 内嵌服务、便携目录、迁移、打包 fuses
- `references/pitfalls.md` — **踩坑速查**（代理/超时/Ollama/Windows cmd/asar/safe-delete 等）
- `assets/config/` — 四份出厂配置骨架模板
- `scripts/doctor.mjs` — 项目结构与配置自检脚本
