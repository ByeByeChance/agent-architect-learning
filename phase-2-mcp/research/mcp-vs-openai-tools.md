# MCP vs OpenAI Function Calling — 对照分析

## 协议层对比

| 维度 | MCP | OpenAI Tools |
|---|---|---|
| 协议标准 | JSON-RPC 2.0 | HTTP REST |
| 传输方式 | Stdio / SSE / Streamable HTTP | HTTPS only |
| 消息格式 | `{ jsonrpc, method, params, id }` | OpenAI API 特有的 `tools` 参数 |
| 工具发现 | `tools/list` 自动发现 | 需预先定义在请求中 |
| 资源暴露 | `resources/read` | 无 |
| Prompt 模板 | `prompts/list` | 无 |
| 错误处理 | JSON-RPC error codes | HTTP 状态码 |
| 流式支持 | SSE / Streamable HTTP | Server-Sent Events |

## 架构差异

**MCP 是协议，OpenAI Tools 是 API 参数。** 这是最核心的差异。

```
MCP 架构：
  LLM Client ←→ [MCP Protocol] ←→ MCP Server (你的代码)
                    ↑
              标准化的 JSON-RPC

OpenAI Tools 架构：
  你的代码 → OpenAI API (tools 参数) → OpenAI 模型 → 返回 tool_calls
                     ↑
                OpenAI 私有格式
```

## 代码对比

**MCP 方式：**
```typescript
// 定义工具（无需在请求中声明，Client 自动发现）
server.tool("get_weather", "获取天气", {
  city: z.string(),
}, async ({ city }) => {
  return { content: [{ type: "text", text: `晴，25°C` }] };
});

// Client 调用流程：
// 1. tools/list → 发现 get_weather
// 2. tools/call → 执行 get_weather
// 3. 返回结果
```

**OpenAI Tools 方式：**
```typescript
// 每次请求都要声明工具
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [...],
  tools: [{
    type: "function",
    function: {
      name: "get_weather",
      parameters: { type: "object", properties: { city: { type: "string" } } },
    },
  }],
});

// 手动解析 tool_calls → 执行函数 → 回传结果
```

**MCP 的优势**：
1. 工具定义和调用解耦——Server 定义了工具后，任何 MCP Client 都能自动发现
2. 工具可以复用——同一个 weather-server 可被 Codex、Claude Desktop、自定义面板使用
3. Resource 概念——OpenAI 没有等价的机制

**OpenAI Tools 的优势**：
1. 简单——没有额外的 Server 进程，直接在 API 调用中声明
2. 不需要管理连接生命周期
3. 适合简单的"一次调用"场景

## 什么时候用哪个？

- **MCP**：IDE agent、桌面 agent、需要复用工具、需要暴露数据资源
- **OpenAI Tools**：简单的 chatbot、不需要发现机制、快速原型

**趋势**：OpenAI 也在支持 MCP 协议。未来两者边界会越来越模糊。
