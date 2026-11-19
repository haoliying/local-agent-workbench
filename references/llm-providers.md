# LLM Provider 适配

## 统一中间表示（llm/types.ts）

```
ChatMessage { role: 'system'|'user'|'assistant'|'tool', content: string|null,
              name?, tool_calls?: ToolCall[], tool_call_id? }
ToolCall    { id, type:'function', function:{ name, arguments: string } }  // arguments 是 JSON 字符串
StreamHandlers { onText, onReasoning, onToolCall, signal }
LLMProvider { chat(), chatStream(), listModels() }
```

所有厂商协议翻译成这一套；Agent 只认中间表示。新增厂商 = 加一个适配器实现 `LLMProvider`。

## 分发（llm/index.ts）

`createProviderFromDef(def, modelId?)`：
- 模型优先级：`modelId || def.defaultModel || def.models[0].id`
- protocol 分发：`anthropic` → AnthropicProvider；`ollama` → OllamaProvider（不传 key）；其他 → OpenAICompatibleProvider
- 返回 `{ provider, def, model, missingKeyEnv }`，`missingKeyEnv = !apiKey ? def.apiKeyEnv : undefined`

## OpenAI 兼容适配器（openai.ts）

- 端点：`joinURL(baseURL, '/chat/completions')`；`joinURL` 去尾部斜杠再拼。
- 头：`Authorization: Bearer <key>`（key 为空也照发，兼容免密中转）。
- 超时：chat 180000ms、listModels 30000ms、stream `0`（不超时，靠 signal）。
- 请求体带 `stream_options: {include_usage:true}` 以在流末取 usage。
- SSE 解析：按 `\n\n` 分包；`tool_calls` 按 `tc.index` 累积 `function.name` 与 `function.arguments`（分片到达），流末统一组装。
- 适用：DeepSeek/智谱/通义/混元/Kimi/豆包/硅基流动/MiniMax/Gemini/OpenRouter/Groq/vLLM/LM Studio 等绝大多数服务。

## Anthropic 原生适配器（anthropic.ts）

- 端点 `/messages`，头 `anthropic-version: 2023-06-01` + `x-api-key`。
- `max_tokens ?? 4096`（Anthropic 必填）。
- `convert()`：把 system 消息抽出来单独放 `system` 字段；tool 执行结果攒成 `role:'user'` 的 `tool_result` 内容块；要求首条必须是 user。
- 流式：`content_block_start` / `content_block_delta`（文本与 `input_json_delta` 累积）/ `message_delta`（取 usage）。
- 工具调用 id 用 Anthropic 自己的 `tool_use.id`。

## Ollama 原生适配器（ollama.ts）

**为什么不用 `/v1`**：Ollama 的 OpenAI 兼容层对 Qwen 系列工具调用不可靠（tool_calls 乱码混进正文），必须用原生 `/api/chat`。`rootURL()` 会剥掉用户误填的 `/v1` 后缀。

- 端点：chat `/api/chat`，模型列表 `/api/tags`。
- **传输格式是 NDJSON**（每行一个 JSON，`json.done === true` 结束），不是 SSE —— 自写 `readNDJSON` 生成器。
- `arguments` 必须是**对象**（OpenAI 是字符串）：`parseArgs` / `normalizeToolCalls` 负责互转。
- 无 id 时合成 `call_${Date.now().toString(36)}_${i}`；流式工具调用按名字/位置归并。
- `keep_alive: '10m'` 避免 14B 模型每次冷启动约 10s；`temperature` / `num_predict` 放在 `options` 里。
- 超时：chat 600000ms（本地小模型慢）。

## 预置厂商清单（15 家）

deepseek / zhipu / qwen / **hunyuan（混元，OpenAI 兼容端点 `https://api.hunyuan.cloud.tencent.com/v1`，Key 变量 `HUNYUAN_API_KEY`）** / moonshot / doubao / siliconflow / minimax / openai / anthropic / gemini / openrouter / groq / ollama / local-openai。

预置模型名只是"建议值"，`sw models fetch <provider>` 可从服务在线拉真实列表回写本地配置。

## 连接自测

每家 Provider 应提供最小请求测试（发一句"只回复两个字：你好"），返回耗时与首段文本；自定义模型表单里也应能「测试连接」「拉取模型列表」——保存前就验证，避免存错地址。
