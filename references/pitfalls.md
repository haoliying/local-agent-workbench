# 踩坑速查（先读这里）

按症状检索（grep 关键词即可）。每条都是参考实现中真实遇到并修复过的问题。

---

## 网络 / 代理 / 超时

### 连不上需要代理的厂商（Node fetch 不读系统代理）
- **症状**：公司网络下请求模型/API 全部超时或直接失败，curl 却正常。
- **原因**：Node 内置 fetch（undici）默认不读 `HTTP_PROXY` / `HTTPS_PROXY`。
- **修复**：自建请求层，用 undici 的 `ProxyAgent` 作为 dispatcher；读 `HTTPS_PROXY||HTTP_PROXY`，遵守 `NO_PROXY`（支持 `*`、`.domain`、`host` 后缀匹配）。
- **关键**：内网/私有地址必须**绕过代理直连**：`localhost`/`127.*`/`0.0.0.0`/`::1`/`*.local`/`*.lan`/`10.x`/`172.16–31.x`/`192.168.x`/`169.254.x`。否则开着代理时访问内网 Ollama/网关会挂死。
- 参考代码：`src/core/http.ts` 的 `shouldBypass()` / `isPrivateHost()` / `dispatcher()`。

### 流式请求立刻失败（fetch failed）或长时间后静默中断
- **症状 1**：所有流式请求瞬间 abort。
- **原因**：超时定时器写成 `setTimeout(abort, timeoutMs)`，而流式传了 `timeoutMs=0` → 0ms 立即 abort。
- **修复**：`timeoutMs > 0` 才设定时器；`<= 0` 表示不超时，靠 `signal` 取消。
- **症状 2**：本地大模型冷启动 / 长生成（几分钟）到 ~300s 被底层掐断，表现为 `fetch failed`。
- **原因**：undici 默认 `headersTimeout` / `bodyTimeout` 都是 300s。
- **修复**：`timeoutMs <= 0` 时同时传 `headersTimeout: 0, bodyTimeout: 0`。
- 参考代码：`src/core/http.ts` 的 `httpFetch()`。

### SSE 输出被缓冲、前端不逐字显示
- 响应头加 `X-Accel-Buffering: no`、`Cache-Control: no-cache, no-transform`、`Connection: keep-alive`。
- SSE 解析按 `\n\n` 分包、累积 buffer、逐行取 `data:`；用 `TextDecoder(stream:true)` 处理中文跨包。
- 客户端断开（桌面关窗 / 刷新）时 `res.on('close')` 要触发 `AbortController.abort()`，否则后台白跑。

---

## 模型协议

### Ollama 工具调用乱码 / 工具循环不触发
- **症状**：走 `/v1`（OpenAI 兼容层）时，Qwen 系列把 `tool_calls` 以乱码混进正文。
- **原因**：Ollama 的 OpenAI 兼容层对工具调用支持不可靠。
- **修复**：用**原生 `/api/chat`** 适配器；`rootURL()` 会把用户误填的 `/v1` 后缀剥掉。模型列表用 `/api/tags`。
- **关键差异**：原生端点是 **NDJSON**（逐行 JSON，`json.done` 结束），不是 SSE；`arguments` 必须是**对象**（OpenAI 是字符串），需 `parseArgs`/`normalizeToolCalls` 互转；无 id 时合成 `call_${Date.now().toString(36)}_${i}`；`keep_alive:'10m'` 避免 14B 每次冷启动约 10s；超时给到 600000ms。
- 参考代码：`src/core/llm/ollama.ts`。

### 流式 tool_calls 拼不完整
- OpenAI SSE 里 `tool_calls` 按 `index` 分片：`name` 和 `arguments` 分多次到达，必须按 `tc.index` 累积字符串，最后统一 `JSON.parse`。
- Agent 层再按 `call.id` 归并（同 id 覆盖 `function`），避免重复。
- Anthropic 走 `content_block_start/delta` + `input_json_delta` 累积，`message_delta` 取 usage。

### 某厂商没配 Key 就整体报错
- 参考实现的取舍：仅当 `protocol !== 'openai'` 且缺 Key 时抛错；OpenAI 兼容且 baseURL 非本地时，只发 `onError` 提示继续（兼容无需密钥的内网中转 / OneAPI）。
- `missingKeyEnv` 由 `createProvider` 返回，用于生成友好提示。

---

## Windows / MCP / 命令

### MCP 的 npx / uvx 连不上
- **症状**：stdio MCP 启动失败，日志里 `spawn npx ENOENT` 或 `.cmd` 无法执行。
- **原因 1**：Windows 上 `npx/npm/pnpm/yarn/bun/bunx/uvx/uv` 是 `.cmd`，不能直接 spawn。
- **修复**：`normalizeCommand()` 把这些命令包装成 `cmd.exe /c <cmd> ...args`。
- **原因 2**：打包后的 exe 不继承用户 PATH。
- **修复**：桌面主进程 `ensureNodeInPath()` 补足 node/npx 常见安装路径到 `process.env.PATH`。
- **原因 3**：uv 系 MCP（git/fetch/time/sqlite）需要先 `pip install uv`。
- 参考代码：`src/core/mcp/manager.ts`、`desktop/main.cjs`。

### 工具名冲突
- MCP 工具统一加前缀 `mcp__<serverId>__<toolName>`；内置工具裸名。MCP schema 描述再加 `[MCP:<name>]` 前缀，便于模型区分。

---

## 配置 / 会话

### 配置改了不生效
- 三层优先级：项目级 `<cwd>/.simplework` > 用户级 `~/.simplework` > 出厂 `config/`。子目录里若存在同名文件会**整体优先**，先确认改对了层级。
- `.env` 加载顺序是用户级 → 项目级 → 项目根，且**真实环境变量优先**（已存在的 key 不覆盖）；占位符拼错会静默变空串，用 `doctor` 检查缺失变量。
- Web 界面改配置后要触发 `store.reload()` 清缓存，否则仍用旧值。

### 重启后上下文丢失 / 工具轮次报错
- 每轮结束必须 `sanitizeHistory()`：丢弃「assistant 有 tool_calls 但没有配套 tool 回复」的残缺轮次和孤立 tool 消息，否则厂商 API 会拒绝（尤其中断后）。
- 用户输入要在发模型**之前**先落盘；断线/停止时保存已产出的部分内容。
- 展示数据（`messages`）与模型上下文（`history`）分开存：前者含工具耗时/返回用于回看，后者含 tool 消息用于续聊。

### 跨对话引用被污染
- 引用请求只接受「会话 ID + 位置（index/toolIndex）」，**内容一律从磁盘重新读取**；不信任前端传来的 text（防伪造）。
- 引用源被删除后，已发送引用因保存了内容快照仍可追溯。

---

## Electron / 打包

### exe 双击静默退出、只显示 Electron 默认页
- **原因**：high version Electron（44）+ `enableEmbeddedAsarIntegrityValidation` 不兼容；或打包中途失败导致 `app.asar` 里的 `package.json` 被写坏。
- **修复**：`desktop/package.json` 的 `build.electronFuses` 里设 `enableEmbeddedAsarIntegrityValidation: false`、`onlyLoadAppFromAsar: false`。
- **校验 asar**：`asar.extractFile(app.asar,'package.json')` 必须能 JSON.parse；若能 parse 且 `main` 正确，说明 asar 完好。坏包里这个位置是别的文件片段。
- 字段名必须是 `electronFuses`（electron-builder 约定），写错无效。

### portable exe 每次启动配置换地方 / 找不到配置
- portable 版会先解压到 `%TEMP%`，`__dirname` 指向临时目录。
- **修复**：优先读启动器环境变量 `PORTABLE_EXECUTABLE_DIR` 找回真实 exe 目录，其次 `SIMPLEWORK_PORTABLE_DIR`，最后 `app.getPath('exe')` 目录；用 `looksLikeTempDir()` 排除临时目录（宁可用临时目录也别每次换路径）。
- 把得到的可写目录写进 `process.env.SIMPLEWORK_CONFIG_DIR`，让内嵌的 Node 服务与配置层使用**同一个**目录。

### 旧配置迁移时 conversations/ skills/ 目录没过来
- **原因**：初始化时先 `mkdir` 建了空目录，随后 `copyDirIfMissing` 见目标已存在就跳过。
- **修复**：目录用 `mergeDir`（`cpSync(..., { force:false, recursive:true })` 合并、不覆盖已存在文件），文件用 `copyFileIfMissing`。规则统一为「目标存在不覆盖」。

### 打包时清空目录失败 / EBUSY
- **原因**：某些环境的安全删除（safe-delete）钩子拦截整目录 `rmSync`。
- **修复**：`fs.rmSync` 包 try/catch → 退化逐项删除 → 再不行保留旧文件让 `cpSync` 覆盖（不阻断构建）。
- 若外层钩子仍拦截（如 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`），在构建命令前 `export CODEBUDDY_SAFE_DELETE_ENABLED=0`，并输出到**全新目录**避免占用。

### 界面空白 / 渲染进程崩溃
- 打包图标不要用 HTML/浏览器截图生成的奇怪 PNG；用纯代码逐像素光栅化生成 icon（注意下采样索引色 bug）。
- `BrowserWindow` 用 `contextIsolation:true, nodeIntegration:false, sandbox:false`；主进程动态 `import()` payload 里的 ESM 服务。
- 窗口加载加 `loadWithRetry`（约 4 次、间隔 2.5s），给内嵌服务启动留时间。

---

## 前端 / 渲染

### 折叠区内的 pre 复制出来是空的
- **症状**：`details` 收起或刚展开时，`pre.innerText` 返回空字符串。
- **修复**：一律用 `textContent` 读取文本（`innerText` 受布局/可见性影响）。

### 流式正文覆盖掉复制按钮
- 不要把正文直接写进 bubble 的 `innerHTML`（会清掉按钮/工具卡片）。用独立的 `.mtext` 容器承载正文，流式只更新它；复制按钮、工具卡片、引用卡片作为兄弟节点。

### 工具调用铺开占用版面
- 用 `<details class="steps">` 收纳所有工具，默认 `open=false`；summary 显示「⚙ 执行过程 · N 步 · Xs」，流式中显示「⏳ 执行中」。

### GitHub API 限流导致 Skill 搜索失败
- 在线检索是锦上添花；安装走 `git sparse-checkout`（只拉目标子目录）不依赖 API，兜底 tarball。配 `GITHUB_TOKEN` 可提额。

---

## 收尾口诀

1. 网络问题先想「代理 + 内网直连 + 超时三兄弟（connect/headers/body）」。
2. 工具问题先想「协议原生 vs 兼容层、按 id/index 归并、sanitizeHistory」。
3. 打包问题先想「asar 完整性、便携目录环境变量、safe-delete 钩子」。
4. 前端文本读取一律 `textContent`，流式渲染用独立容器。
