# MCP 协议规范

> 官方文档：https://modelcontextprotocol.io/introduction

## 1. MCP 解决什么问题？

[LLM 怎么调用外部工具？MCP 和 Function Calling 的区别？]

## 2. 三个核心概念

- Tool：模型可调用的动作
- Resource：模型可读取的数据
- Prompt：预定义的交互模板

## 3. MCP 协议分层

- Transport 层：通信方式（Stdio / SSE / Streamable HTTP）
- Protocol 层：JSON-RPC 消息格式
- Concept 层：Tool/Resource/Prompt

## 4. JSON-RPC 消息格式

[request/response/notification 的 JSON 结构]

## 5. MCP vs OpenAI Function Calling

[什么时候用 MCP，什么时候用 OpenAI tools 参数？]

---
