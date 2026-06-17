# MCP 协议规范

> 官方文档：https://modelcontextprotocol.io/introduction

## 1. MCP 解决什么问题？

**问题**：LLM 本身只能生成文本，无法访问文件系统、数据库、外部 API。要让 LLM 真正做有用的事，必须给它"手和脚"。

**MCP (Model Context Protocol)** 是 Anthropic 提出的开放协议，定义了 AI 模型和外部工具/数据源之间的标准通信方式。它解决的核心问题是：**不同的 LLM 客户端如何用统一的方式发现和调用不同的工具？**

类比：USB 协议让任何设备都能插到任何电脑上。MCP 就是 AI 世界的 USB——LLM 客户端通过 MCP 连接任何 MCP Server，自动发现可用工具、调用工具、获取结果。

**MCP vs OpenAI Function Calling：**
| 维度 | MCP | OpenAI Tools |
|---|---|---|
| 范围 | 跨模型、跨客户端的开放协议 | OpenAI 专有的 API 参数 |
| 工具发现 | 自动（tools/list 方法） | 手动（需事先知道有哪些工具） |
| 资源暴露 | ✅ Resource 概念 | ❌ 无此概念 |
| 适用场景 | IDE agent、桌面 agent、本地工具 | 简单的 Web API 调用 |

简单说：OpenAI Tools 是"我告诉你能用什么"，MCP 是"你自己去问 server 有什么可用"。

## 2. 三个核心概念

**Tool（工具）**：模型可调用的动作。类似编程中的函数——有名字、参数、返回值。例如 `get_weather(city: string) → string`。

**Resource（资源）**：模型可读取的数据。类似编程中的文件或 API 端点——模型可以主动拉取数据。例如 `weather://cities` 返回城市列表。

**Prompt（提示模板）**：预定义的交互模板。让 MCP Server 可以提供标准化的 prompt 给客户端使用。例如代码审查的 system prompt 模板。

这三个概念的协作模式：
1. Client 连接 Server → 通过 `resources/list` 发现有哪些数据
2. Client 通过 `tools/list` 发现有哪些工具可用
3. Client 调用 `tools/call` 执行工具
4. Client 通过 `prompts/list` 发现预先写好的 prompt 模板

## 3. MCP 协议分层

```
Concept 层      Tool / Resource / Prompt       # "你能做什么"
Protocol 层     JSON-RPC 2.0                    # "怎么传消息"
Transport 层    Stdio / SSE / Streamable HTTP    # "物理上怎么连"
```

设计哲学：分层解耦。Concept 层定义语义，Protocol 层定义消息格式，Transport 层负责物理连接。三层各自独立演进。

## 4. JSON-RPC 消息格式

MCP 使用 JSON-RPC 2.0 作为消息协议。所有消息都是符合 JSON-RPC 规范的 JSON 对象：

**请求 (Request)：**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": { "city": "北京" }
  }
}
```
- `id`：请求标识，用于匹配 request 和 response
- `method`：要执行的操作（`tools/list`、`tools/call`、`resources/read` 等）
- `params`：方法参数

**响应 (Response)：**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{ "type": "text", "text": "晴，25°C" }]
  }
}
```

**通知 (Notification)**：没有 `id` 字段，不需要回复。用于单向事件，如 `notifications/initialized`。

## 5. MCP vs OpenAI Function Calling

| 什么时候用 MCP | 什么时候用 OpenAI Tools |
|---|---|
| 需要 agent 自动发现可用工具 | 预先知道有哪些工具，手动传给 API |
| 需要暴露数据（Resource）给 agent 读取 | 只有工具调用需求 |
| 跨模型、跨客户端复用工具 | 只用在 OpenAI 生态 |
| 本地工具（文件系统、数据库） | 远程 API 调用 |
| IDE/桌面 agent 场景 | Web chatbot 场景 |

**结论**：OpenAI Tools 是 Function Calling 的一种实现方式，MCP 是更上层的协议标准。OpenAI 自己也在往 MCP 靠拢——未来两者可能会趋同。
