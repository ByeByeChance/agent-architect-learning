# Transport 与安全

> 官方文档：https://modelcontextprotocol.io/docs/concepts/transports

## 1. Stdio Transport

**进程间标准输入/输出通信。**

MCP Server 作为一个子进程启动，JSON-RPC 消息通过 `stdin`/`stdout` 传递。

**工作方式**：
- Client 启动 Server 进程：`node index.js`
- Client 向 Server 的 stdin 写 JSON-RPC 请求
- Server 从 stdin 读取 → 处理 → 向 stdout 写 JSON-RPC 响应
- Server 退出时，Client 感知进程结束

**优缺点**：
- ✅ 零网络开销，天然隔离，不需要端口管理
- ✅ 适合本地工具（文件操作、CLI 命令）
- ❌ 无法远程访问（除非通过 SSH 等隧道）
- ❌ 一对一的连接模型，不能多个 Client 共享一个 Server

**典型场景**：Codex/Claude Desktop 启动本地 MCP Server 来访问文件系统。

## 2. SSE (Server-Sent Events) Transport

**HTTP + SSE 长连接。**

Server 作为一个 HTTP 服务运行，Client 通过 SSE 建立持久连接接收推送。

**工作方式**：
- Server 启动 HTTP 服务（如 Express）
- Client 向 `/sse` 端点建立 SSE 长连接
- Server 通过 SSE 推送事件（tools 列表、资源变化通知等）
- Client 通过 HTTP POST 发送 JSON-RPC 请求

**优缺点**：
- ✅ 支持远程访问（浏览器、其他机器）
- ✅ 多 Client 可连接同一个 Server
- ❌ 需要管理 HTTP 端口、跨域等
- ❌ SSE 是单向推送，请求仍需 POST

**典型场景**：Web 版的 Agent 调试面板连接远程 MCP Server。

## 3. Streamable HTTP（新）

**2025 年推出的新 Transport，统一 SSE 和 HTTP。**

将双向通信统一到一个 HTTP 端点，同时支持请求-响应和流式推送。

**工作方式**：
- 单一 HTTP 端点处理所有通信
- 支持标准 HTTP 请求/响应
- 也支持升级为 SSE 流

**优点**：
- ✅ 简化部署（一个端口、一个端点）
- ✅ 兼容现有 HTTP 基础设施（负载均衡、认证）
- ✅ 向后兼容 SSE

## 4. MCP 安全模型

**工具权限隔离**
每个 MCP Server 应有明确的权限边界。Server 只能访问它被授权访问的资源。例如 file-search-server 应该限制搜索根目录，不能访问整个文件系统。

**认证机制**
- **Stdio Transport**：依赖进程权限（Server 进程以什么用户运行，就只有该用户的权限）
- **SSE/HTTP Transport**：需要自己实现认证层（API Key、OAuth、JWT）
- OAuth 2.0 支持正在 MCP 规范中标准化

**安全最佳实践**：
1. 限制文件系统访问范围（用 `SEARCH_ROOT` 环境变量）
2. 对敏感操作（删除、写文件）要求确认
3. Server 不信任 Client 传来的路径参数，做路径校验防目录穿越
4. 日志不记录敏感数据（API Key、文件内容）
