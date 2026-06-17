# MCP Transport 源码分析

> 源码路径：`node_modules/@modelcontextprotocol/sdk/dist/esm/server/`

## Stdio Server Transport

[从 process.stdin 读 JSON-RPC → 解码 → 路由到 handler → 写 process.stdout]

## SSE Server Transport

[HTTP + SSE 长连接 → 推送工具列表 → 接收 tool call → 返回结果]

## JSON-RPC 消息路由

[server.tool() 注册时内部做了什么？消息怎么分发？]

---
