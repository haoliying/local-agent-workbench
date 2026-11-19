# local-agent-workbench

> 一个蒸馏自完整落地项目的 WorkBuddy Skill：把「本地优先、配置驱动的轻量 Agent 工作台」（参考实现：SimpleWork）的架构、实现决策与踩坑经验沉淀成可复用知识，让任何 WorkBuddy 实例加载后就能构建 / 理解 / 扩展 / 排错同类系统。

## 这是什么

这不是项目源码的复制，而是**知识蒸馏**：从 Node.js + TypeScript 的 Agent 工作台（模型/MCP/Skill 全部本地配置驱动、可打包成免安装桌面 exe）中提炼出：

- 8 份专题参考文档（架构、配置、三协议 Provider、Agent 循环、MCP/Skill、Web 会话、桌面打包、**踩坑速查**）
- 分阶段构建路线图（每阶段带验证点）
- 4 份可直接复用的出厂配置骨架（15 家模型厂商 / 15 个 MCP / Skill 源）
- 一个自检脚本（对目标项目跑一遍，检查关键结构与易踩坑实现）

## 安装

方式一：下载 `Releases` 里的 `local-agent-workbench.zip`，解压到 `~/.workbuddy/skills/` 下。

方式二：直接克隆到 skills 目录：

```bash
git clone https://github.com/haoliying/local-agent-workbench.git ~/.workbuddy/skills/local-agent-workbench
```

安装后在 WorkBuddy 中说出类似下面的话即可触发：

- 「帮我从零搭一个本地优先的 Agent 工作台，模型走本地 Ollama」
- 「这个项目里 MCP 工具调用为什么乱码 / 打包 exe 为什么静默退出」
- 「照着 SimpleWork 的模式给我的 Agent 加上多会话和跨对话引用」

## 目录结构

```
local-agent-workbench/
├── SKILL.md                      主入口（触发条件 + 能力地图 + 最短路径）
├── references/
│   ├── architecture.md           全局架构、数据流、扩展切口
│   ├── build-blueprint.md        分阶段构建路线图 + 验收清单
│   ├── config-system.md          三级配置合并、.env 展开、自定义模型
│   ├── llm-providers.md          OpenAI / Anthropic / Ollama 三协议适配
│   ├── agent-and-tools.md        Agent 循环、工具配对、历史修复、内置工具
│   ├── mcp-and-skills.md         MCP 三传输 + Skill 渐进加载/安装
│   ├── web-and-conversations.md  SSE 服务、会话持久化、搜索/复制/引用
│   ├── desktop-packaging.md      Electron 内嵌服务、便携目录、打包 fuses
│   └── pitfalls.md               ⭐ 踩坑速查（代理/超时/asar/safe-delete…）
├── scripts/
│   └── doctor.mjs                项目结构与关键实现自检
└── assets/
    └── config/                   4 份出厂配置骨架
```

## 自检脚本用法

```bash
node scripts/doctor.mjs /path/to/your-project
```

对参照本 Skill 搭建的项目跑体检：结构齐全、依赖到位、且关键易错实现（`ProxyAgent`、流式超时、内网直连、Ollama 原生端点、Windows cmd 包装、Electron fuses、便携目录）都已落实时输出全绿。

## License

MIT。蒸馏自的参考实现（SimpleWork）同为 MIT；其中引用的第三方 MCP / Skill 许可见各自仓库。
