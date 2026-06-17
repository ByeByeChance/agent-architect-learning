# MCP Transport 源码分析

> 源码路径：`node_modules/@modelcontextprotocol/sdk/dist/esm/server/`

## Stdio Server Transport

阅读 `stdio.js`，核心流程：

```typescript
class StdioServerTransport {
  async start() {
    // 1. 监听 process.stdin，逐行读取
    process.stdin.on("data", (chunk) => {
      buffer += chunk;
      // 按换行分割 JSON-RPC 消息
      while (buffer.includes("\n")) {
        const line = buffer.split("\n")[0];
        buffer = buffer.slice(line.length + 1);
        const message = JSON.parse(line);
        this._onmessage(message);  // → 路由到 handler
      }
    });
  }

  async send(message) {
    // 2. 向 process.stdout 写 JSON-RPC 响应
    process.stdout.write(JSON.stringify(message) + "\n");
  }
}
```

关键设计：
- **每行一个 JSON 消息**（JSON-RPC 以换行分割）
- **全双工**：stdin 收请求，stdout 发响应
- **进程生命周期**：Server 退出 = Transport 关闭

## SSE Server Transport

阅读 `sse.js`：

```typescript
class SSEServerTransport {
  constructor(endpoint, res) {
    // 1. 建立 SSE 连接
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    this._res = res;
  }

  async start() {
    // 2. 等待第一个 POST 请求（Client 的消息端点）
    // Client 通过 HTTP POST 发送 JSON-RPC 请求
  }

  async send(message) {
    // 3. 通过 SSE 推送事件
    this._res.write(`data: ${JSON.stringify(message)}\n\n`);
  }
}
```

SSE 消息格式：`data: <JSON>\n\n`（空行表示事件结束）

**Transport 选择流程图**：
```
需要远程访问？
  ├─ 是 → 需要双向流？
  │       ├─ 是 → Streamable HTTP
  │       └─ 否 → SSE
  └─ 否 → Stdio
```
