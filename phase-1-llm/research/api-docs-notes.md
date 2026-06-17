# API 文档精读笔记

> DeepSeek API: https://api-docs.deepseek.com/
> OpenAI API: https://platform.openai.com/docs/api-reference/chat/create

## 核心 API 参数对照

| 参数 | DeepSeek | OpenAI | 说明 |
|---|---|---|---|
| model | `deepseek-chat` / `deepseek-reasoner` | `gpt-4o` / `gpt-4o-mini` | 模型选择 |
| messages | ✅ | ✅ | 对话历史数组 |
| temperature | 0-2 (默认 1) | 0-2 (默认 1) | 值越低越确定，越高越随机 |
| top_p | ✅ | ✅ | 核采样，如 0.1 则只选概率最高的 10% |
| max_tokens | ✅ | ✅ | 最大输出 token 数 |
| tools | ✅ | ✅ | Function Calling 工具定义 |
| stream | ✅ | ✅ | 流式输出（SSE） |
| response_format | ✅ | ✅ | 强制 JSON 输出格式 |
| frequency_penalty | ✅ | ✅ | 降低重复词出现概率（-2.0 到 2.0） |
| presence_penalty | ✅ | ✅ | 鼓励谈论新话题（-2.0 到 2.0） |

## messages 结构

```json
[
  { "role": "system", "content": "你是代码审查助手" },
  { "role": "user", "content": "这段代码有什么问题？" },
  { "role": "assistant", "content": "..." },
  { "role": "tool", "tool_call_id": "xxx", "content": "晴，25°C" }
]
```

四种 role：
- **system**：设定 Agent 行为规则（OpenAI 和 DeepSeek 都支持）
- **user**：用户输入
- **assistant**：模型回复（含 tool_calls）
- **tool**：工具执行结果，必须带有匹配的 tool_call_id

## Tool Calling 流程

```
用户消息 → 模型判断是否需要工具
  ├─ 不需要 → 直接文本回复
  └─ 需要 → 返回 tool_calls 数组
       └─ 你执行工具 → 返回 tool 消息
            └─ 模型收到结果 → 生成最终回答
```

## 关键发现

1. **DeepSeek 完全兼容 OpenAI API 格式**，直接用 OpenAI SDK 改 baseURL 即可，零额外依赖
2. **tool_choice: "auto"** 是默认值，模型自行决定要不要调工具。可强制设为 "required" 要求必调，或指定具体工具名
3. **stream: true** 开启流式输出，前端可以逐 token 展示，体验类似 ChatGPT 的打字效果。这对构建 Agent 产品至关重要
4. **response_format: { type: "json_object" }** 强制模型输出合法 JSON，解决了解析问题。但需要 system prompt 中也说明格式要求
