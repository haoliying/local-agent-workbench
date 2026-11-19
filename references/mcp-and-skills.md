# MCP 与 Skill 系统

## MCP 客户端（mcp/manager.ts）

基于 `@modelcontextprotocol/sdk`，支持三种 transport：

| transport | 实现类 | 配置 |
| --- | --- | --- |
| `stdio` | `StdioClientTransport` | `command` + `args` + `env` |
| `http` | `StreamableHTTPClientTransport` | `url` + `headers` |
| `sse`（默认兜底） | `SSEClientTransport` | `url` + `headers` |

关键实现：
- `args` / `env` 经 `expandString` 展开 `${VAR}`；`{{WORKSPACE}}` 占位替换为 cwd。
- 全链路超时包装 `withTimeout()`：connect 30000ms、listTools 20000ms、callTool 120000ms。`connectAll` 用 `Promise.all`，单个失败不影响其它。
- 工具注册名 = `mcp__<serverId>__<toolName>`（前缀可配），schema 描述加 `[MCP:<name>]` 前缀防冲突。
- `call()` 把 content 按 text / resource / 其它拼接；`isError` 时前缀「MCP 工具返回错误：」。
- Windows 命令规范化：`SHELL_COMMANDS = {npx,npm,pnpm,yarn,bun,bunx,uvx,uv}`，命中则包成 `cmd.exe /c <cmd> ...args`（见 pitfalls）。

预置 15 个公开 MCP（filesystem/memory/everything/context7/brave-search/github/postgres/puppeteer/playwright/amap/git/fetch/time/sqlite/my-http-server），默认启用 filesystem + memory。

## Skill 加载器（skills/loader.ts）

- `FRONT_MATTER` 正则解析 SKILL.md 头部（支持 `key: value` 与缩进续行、去引号），无需 YAML 库。
- `list()` 按 `skillDirs()` 顺序扫描，**同名去重、先到先得**（项目级 > 用户级 > 出厂），按 name 排序并缓存。
- `catalog()` 只返回 name + description + scope —— 系统提示里只放这一句话，是渐进式加载的核心。
- `load(name)` 返回「标题 + 资源清单（绝对路径）+ 正文」，通过 `use_skill` 工具按需拉进上下文。
- `resources(max=40)` 递归列资源，跳过 .git / node_modules。
- scope 判定：project / user / builtin；`allowed-tools` 用逗号切分。

## Skill 安装器（skills/installer.ts）

- `resolveTarget()` 支持 featured 名称或 `owner/repo/subPath`，branch 默认 main。
- **主通道 `cloneSparse()`**：`git init` + `core.sparseCheckout=true` + 写 `.git/info/sparse-checkout` 为 `<subPath>/*` + `git pull --depth 1`。只拉目标子目录，快且不依赖 GitHub API。
- **兜底 `cloneTarball()`**：下载 `https://codeload.github.com/<repo>/tar.gz/<branch>`，用系统 `tar -xzf`。
- 安装后写 `skills.json` 的 `installed` 记录（失败静默忽略，不影响使用）。
- `searchRemote()`：先离线匹配 featured 清单，再在线列仓库目录（`GITHUB_TOKEN` 提额，403 给限流提示），排序 featured → installed → name。

三个预置源：anthropics/skills、obra/superpowers、alirezarezvani/claude-skills。出厂自带 3 个中文 Skill（code-review / git-commit / summarize）。

## 渐进加载模式小结

系统提示常驻「目录（name + 一句话描述）」→ 模型判断相关才调 `use_skill` → 加载 SKILL.md 正文与资源清单 → 需要时再读 references/scripts。这套机制把 token 成本压到最低，是 Skill 生态的关键，重建时应原样照抄。
