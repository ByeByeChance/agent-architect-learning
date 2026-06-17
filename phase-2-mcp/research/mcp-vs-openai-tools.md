# MCP vs OpenAI Function Calling

| 维度 | MCP | OpenAI Tools |
|---|---|---|
| 协议 | JSON-RPC over Stdio/SSE | HTTP REST |
| 工具注册 | server.tool() | tools 参数 |
| 资源暴露 | server.resource() | 无 |
| 发现机制 | tools/list | 无（需预先知道） |
| 适用场景 | IDE agent、本地工具 | Web API 调用 |

## 什么时候用哪个？
- MCP：需要 agent 主动发现工具、需要暴露数据资源
- OpenAI Tools：简单的 API 调用、不需要发现机制

---
