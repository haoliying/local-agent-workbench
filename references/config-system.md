# 配置体系

## 三层优先级

```
出厂预置 config/*.json  <  用户级 ~/.simplework/*.json  <  项目级 <cwd>/.simplework/*.json
```

后者覆盖前者。合并策略按文件类型区分：

- `config.json`（AppConfig）：`deepMerge`，对象递归合并、数组整体替换、`undefined` 不覆盖。
- `models.json`：`mergeModels` —— 按 provider `id` 合并，同名 provider 的 `models` 再按模型 `id` 合并；`active` 对象浅合并；`hiddenProviders` 取并集后过滤掉被隐藏项。
- `mcp.json` / `skills.json`：`mergeById`，按 `id`（featured 用 `name` 作 id）合并。

合并和 `expandDeep` 后缓存到实例字段；`store.reload()` 清空缓存实现热加载（Web 改配置后必须调用）。

## 配置根解析（paths.ts）

常量：`APP_NAME='SimpleWork'`、`CONFIG_DIR_NAME='.simplework'`。`INSTALL_DIR` 指向安装根（编译产物 `dist/` 的上两级），出厂配置/技能从 `INSTALL_DIR/config`、`INSTALL_DIR/skills` 读。

关键可迁移点：
- `globalDir()` = `process.env.SIMPLEWORK_CONFIG_DIR || ~/.simplework`。桌面便携版把这个环境变量指到 exe 目录，整个配置层随之搬家。
- `locate(file)` 顺序：`<cwd>/.simplework/<file>` → `globalDir()/<file>` → 出厂。
- `writablePath(file)`：项目级目录存在就写项目级，否则写用户级（不写出厂目录）。
- `skillDirs()` 四级：`<cwd>/.simplework/skills` → `<cwd>/skills` → `~/.simplework/skills` → 出厂 `skills/`。

## .env 与占位符（env.ts）

零依赖解析：逐行 `KEY=VALUE`，剥离成对引号，跳过注释；已存在于 `process.env` 的 key **不覆盖**（真实环境变量优先）。

文件顺序（load 时 reverse 后逐个加载，使项目级最后加载覆盖）：
1. `~/.simplework/.env`
2. `<cwd>/.env`
3. `<cwd>/.simplework/.env`

占位符：`${VAR}` 与 `$VAR`，正则 `/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g`。`expandDeep()` 递归处理 string / array / object；未定义的变量展开为空串（拼错不会报错，靠 `doctor` 的 `referencedEnvVars()` 报告缺失）。

应用内写 Key（Web 设置页）：`writeEnvVar()` 用 `^\s*KEY\s*=` 匹配替换、保留注释、同步 `process.env`。**密钥只写 .env，不落 models.json**（`upsertProvider` 会把 `apiKey` 置 undefined 再存）。

## 四份出厂配置的职责

| 文件 | 内容 |
| --- | --- |
| `config.json` | Agent 参数（maxTurns/temperature/maxTokens/confirmBeforeTool/autoApprove）、tools 开关（builtin 逐项 + mcpEnabled + 前缀 + 超时）、shell、web(host/port/autoOpen)、search、memory、ui |
| `models.json` | `version`、`active{provider,model}`、`providers[]`（id/name/region/protocol/baseURL/apiKeyEnv/defaultModel/models[]/custom）、`hiddenProviders[]` |
| `mcp.json` | `version`、`servers[]`（id/name/transport/command/args/env/url/headers/keyEnv/enabled/needsKey） |
| `skills.json` | `version`、`sources[]`（repo/branch/basePath/license）、`featured[]`（name/source/path/tags/desc）、`installed[]` |

模板见 `assets/config/`。

## 自定义模型的增删（config.ts）

- `normalizeProviderDef(input)`：校验 id（`/^[a-z0-9][a-z0-9._-]{0,39}$/`）、name 非空、protocol ∈ {openai,anthropic,ollama}、baseURL 以 http(s) 开头、至少一个模型；返回对象 `custom:true`、`apiKey:''`。
- `suggestProviderId(name, taken)`：名称转小写、非字母数字换 `-`、截断 24 字符，冲突追加 `-2/-3`。
- `upsertProvider(def, {activate})`：新增或替换，取消隐藏，必要时切换 active；apiKey 不落盘。
- `removeProvider(id)`：自定义直接移除；出厂的加入 `hiddenProviders`（隐藏而非真删）；若删的是 active 则自动选下一个可用 provider。
- `setActive(providerId, modelId?)`：切换默认厂商/模型。

## Debug 清单

- 改了配置没生效 → 检查层级优先级、`store.reload()`、`.env` 覆盖顺序。
- 报「缺少出厂配置文件」→ `INSTALL_DIR` 解析错误（编译产物与 config 不同级）；桌面版要把 config 同步进 `payload/`。
- Key 写不进 .env → 检查配置目录是否可写、桌面便携目录是否正确定位。
