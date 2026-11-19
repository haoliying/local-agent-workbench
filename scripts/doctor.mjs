#!/usr/bin/env node
/**
 * local-agent-workbench 项目自检脚本
 *
 * 用法：
 *   node scripts/doctor.mjs [项目根目录]
 *
 * 检查一个「本地优先 Agent 工作台」项目是否具备关键结构与常见故障点，
 * 输出体检报告。不修改任何文件。
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || process.cwd());
const ok = (s) => `  [OK]   ${s}`;
const bad = (s) => `  [FAIL] ${s}`;
const warn = (s) => `  [WARN] ${s}`;
let fails = 0;
let warns = 0;

function check(cond, good, failMsg) {
  if (cond) console.log(ok(good));
  else { console.log(bad(failMsg)); fails++; }
}
function warning(cond, msg) {
  if (!cond) { console.log(warn(msg)); warns++; }
}
function exists(p) { return fs.existsSync(path.join(root, p)); }
function readJson(p) {
  try { return JSON.parse(fs.readFileSync(path.join(root, p), 'utf8')); } catch { return null; }
}

console.log(`\n=== 本地 Agent 工作台体检：${root} ===\n`);

// 1. 基础项目文件
console.log('[1] 基础项目结构');
check(exists('package.json'), 'package.json 存在', '缺少 package.json');
const pkg = readJson('package.json');
if (pkg) {
  check(pkg.type === 'module', 'ESM (type:module) 配置正确', 'package.json 缺少 "type":"module"（本架构用 ESM）');
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  check(Boolean(deps['@modelcontextprotocol/sdk']), '已依赖 MCP SDK', '缺少 @modelcontextprotocol/sdk');
  check(Boolean(deps.undici), '已依赖 undici（代理感知请求层）', '缺少 undici（Node fetch 不读系统代理）');
  check(Boolean(deps.typescript), '已依赖 typescript', '缺少 typescript');
}
check(exists('tsconfig.json'), 'tsconfig.json 存在', '缺少 tsconfig.json');

// 2. 出厂配置
console.log('\n[2] 出厂预置配置 config/');
for (const f of ['config.json', 'models.json', 'mcp.json', 'skills.json']) {
  check(exists(path.join('config', f)) || exists(f), `出厂配置 ${f} 存在`, `缺少出厂配置 ${f}`);
}
const models = readJson('config/models.json') || readJson('models.json');
if (models) {
  const n = (models.providers || []).length;
  check(n > 0, `models.json 含 ${n} 家厂商`, 'models.json 没有任何 providers');
  check(Boolean(models.active && models.active.provider), '已设置 active.provider', 'models.json 缺少 active.provider');
  warning((models.providers || []).some(p => p.protocol === 'ollama'), '未发现 ollama 本地厂商（可选，但强烈建议预置）');
}
const mcp = readJson('config/mcp.json') || readJson('mcp.json');
if (mcp) console.log(ok(`  mcp.json 含 ${(mcp.servers || []).length} 个预置 MCP 服务器`));

// 3. 核心源码模块
console.log('\n[3] 核心源码模块');
const modules = [
  ['src/core/paths.ts', '三级目录解析'],
  ['src/core/env.ts', '.env 与占位符展开'],
  ['src/core/config.ts', '配置分层合并'],
  ['src/core/http.ts', '代理感知 fetch / SSE'],
  ['src/core/llm/types.ts', '统一中间表示'],
  ['src/core/llm/index.ts', 'Provider 分发'],
  ['src/core/tools/builtin.ts', '内置工具'],
  ['src/core/mcp/manager.ts', 'MCP 客户端'],
  ['src/core/skills/loader.ts', 'Skill 加载器'],
  ['src/core/agent.ts', 'Agent 循环'],
  ['src/core/history.ts', '上下文修复'],
];
for (const [p, desc] of modules) check(exists(p), `${desc} (${p})`, `缺少模块 ${p}`);
const llms = ['openai', 'anthropic', 'ollama'];
for (const name of llms) check(exists(`src/core/llm/${name}.ts`), `${name} Provider 存在`, `缺少 ${name} Provider`);

// 4. HTTP 层关键修复点（grep 源码内容）
console.log('\n[4] 关键实现细节（易踩坑处）');
function src(p) { try { return fs.readFileSync(path.join(root, p), 'utf8'); } catch { return ''; } }
const httpSrc = src('src/core/http.ts');
check(/ProxyAgent/.test(httpSrc), 'http.ts 使用 ProxyAgent（代理感知）', 'http.ts 未见 ProxyAgent：Node fetch 不读系统代理');
check(/headersTimeout:\s*0/.test(httpSrc) && /bodyTimeout:\s*0/.test(httpSrc), '流式关闭 undici 300s 超时', 'http.ts 未关闭 headersTimeout/bodyTimeout：长生成会被静默掐断');
check(/172|192\.168|10\b/.test(httpSrc) || /isPrivateHost/.test(httpSrc), '内网地址绕过代理', 'http.ts 未见内网直连判断：访问局域网模型会挂死');
const ollamaSrc = src('src/core/llm/ollama.ts');
check(/\/api\/chat/.test(ollamaSrc), 'Ollama 走原生 /api/chat', 'ollama.ts 未见 /api/chat：/v1 工具调用会乱码');
const mcpSrc = src('src/core/mcp/manager.ts');
check(/cmd\.exe/.test(mcpSrc), 'Windows MCP 命令用 cmd.exe /c 包装', 'mcp manager 未见 cmd.exe 包装：Windows 下 npx/uvx 无法启动');

// 5. 桌面版（可选）
console.log('\n[5] 桌面版（可选）');
if (exists('desktop/main.cjs')) {
  check(exists('desktop/preload.cjs'), 'preload.cjs 存在', '缺少 desktop/preload.cjs');
  const dpkg = readJson('desktop/package.json');
  if (dpkg?.build?.electronFuses) {
    const f = dpkg.build.electronFuses;
    check(f.enableEmbeddedAsarIntegrityValidation === false, 'asar 完整性校验已关闭（Electron 44 兼容）', 'electronFuses.enableEmbeddedAsarIntegrityValidation 应为 false，否则 exe 静默退出');
    check(f.onlyLoadAppFromAsar === false, 'onlyLoadAppFromAsar 已关闭', 'electronFuses.onlyLoadAppFromAsar 应为 false');
  } else warning(false, 'desktop/package.json 未见 build.electronFuses 配置');
  const mainSrc = src('desktop/main.cjs');
  check(/PORTABLE_EXECUTABLE_DIR/.test(mainSrc), '便携目录检测已实现', 'main.cjs 未见 PORTABLE_EXECUTABLE_DIR：便携版配置会落到临时目录');
} else {
  console.log(warn('  未发现 desktop/ 目录，跳过桌面版检查（CLI/Web 项目可忽略）'));
  warns++;
}

// 6. 汇总
console.log(`\n=== 体检结果：${fails} 项失败，${warns} 项警告 ===`);
if (fails === 0) console.log('结构完整。详细实现指南见 references/，故障排查见 references/pitfalls.md。\n');
else console.log('请按上面的 [FAIL] 项补齐，再对照 references/build-blueprint.md 的阶段顺序实现。\n');
process.exit(fails === 0 ? 0 : 1);
