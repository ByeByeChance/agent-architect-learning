# 阶段 2 源码走读：MCP Server 与 Agent 调试面板

## 1. Hello MCP Server — 最简示例

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
```

三个核心依赖：
- `McpServer`：Server 本体，负责注册工具/资源/提示
- `StdioServerTransport`：stdio 通信方式，进程间标准输入输出
- `z`（Zod）：参数类型校验库，定义 tool 的参数格式

```typescript
const server = new McpServer({
  name: "hello-server",
  version: "1.0.0",
});
```

`McpServer` 构造时只传 name 和 version。这是 MCP 协议要求的——每个 Server 必须有唯一标识。

```typescript
server.tool("hello", "向某人问好", {
  name: z.string().describe("要问候的名字"),
}, async ({ name }) => {
  return {
    content: [{ type: "text", text: `Hello, ${name}! 👋` }],
  };
});
```

`server.tool()` 三个参数：
1. **name**：工具名。Client 通过 `tools/list` 看到这个名字。命名习惯是 snake_case。
2. **description**：工具描述。LLM 用它来决定"我该不该调这个工具？"
3. **inputSchema**（Zod 对象）：参数定义。Zod 的 `.describe()` 方法给每个参数加说明，LLM 据此理解需要传什么。

**返回值格式**：`{ content: [{ type: "text", text: "..." }] }` 是 MCP 规范要求的 Tool Result 格式。`type` 可以是 `"text"`、`"image"`、`"resource"`。

```typescript
server.resource("greeting", "hello://greeting", async () => ({
  contents: [{
    uri: "hello://greeting",
    text: "Welcome to Hello MCP Server!",
    mimeType: "text/plain",
  }],
}));
```

`server.resource()` 暴露数据。Client 通过 `resources/read` 读取，然后用这些数据作为 LLM 的上下文。

- 第一个参数：资源名
- 第二个参数：URI（统一资源标识符，类似 URL）
- 回调：返回包含 `contents` 数组的对象

```typescript
const transport = new StdioServerTransport();
await server.connect(transport);
```

**最后两行是最关键的两行。**
1. `new StdioServerTransport()` 创建一个 stdio 通信通道
2. `server.connect(transport)` 绑定 Server 和 Transport

`connect()` 做了什么事？
- 注册 `tools/list` 处理器 → 返回所有注册的工具
- 注册 `tools/call` 处理器 → 接收工具调用请求 → 执行 handler → 返回结果
- 注册 `resources/list` 和 `resources/read` 处理器
- 开始从 stdin 读取 JSON-RPC 消息
- 通过 stdout 发送响应

---

## 2. Weather MCP Server — Tool + Resource 协作

```typescript
server.tool("get_weather", "获取指定城市的当前天气信息", {
  city: z.string().describe("城市名称，如 '北京'"),
}, async ({ city }) => {
  const result = weatherDB[city] || `${city}: 暂未收录该城市天气数据`;
  return { content: [{ type: "text", text: result }] };
});
```

这段比 hello-server 多了一个重要细节：**错误处理**。

`weatherDB[city] || fallback` —— 当请求的城市不存在时，不抛异常，而是返回友好提示。在 MCP 中，**返回错误文本比抛出异常更好**。因为 LLM 收到错误文本后可以自己调整（比如换个城市再试），而异常会导致整个 tool call 失败。

```typescript
server.tool("list_cities", "列出所有支持的城市", {}, async () => {
```

这个 tool 没有参数，传入空对象 `{}`。LLM 可以先调用 `list_cities` 看看有哪些城市，再决定调 `get_weather` 查哪个。**这是一种常见的 MCP 工具设计模式：发现 + 查询。**

```typescript
server.resource("cities", "weather://cities", async () => ({
```

Resource 提供的是**数据**，Tool 提供的是**动作**。城市列表也可以做成 Tool（`list_cities`），但做成 Resource 有几个好处：
- LLM 可以在对话开始前读取 Resource 获取上下文
- Resource 可以被缓存（内容不变时不需要重复读取）
- 语义更清晰：数据就是数据，动作用 Tool

---

## 3. File Search MCP Server — 系统级操作

```typescript
const SEARCH_ROOT = process.env.SEARCH_ROOT || process.cwd();
```

通过环境变量控制搜索范围，这是安全关键设计。如果不限制范围，LLM 可能搜索整个文件系统。

```typescript
function walk(dir: string, pattern: string, maxResults: number, results: string[]) {
  if (results.length >= maxResults) return;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (results.length >= maxResults) return;
    const full = path.join(dir, entry.name);
    if (entry.name.includes(pattern)) results.push(full);
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      walk(full, pattern, maxResults, results);
    }
  }
}
```

递归目录遍历的递归实现：
1. `maxResults` 做上限保护，防止返回海量结果
2. `try...catch` 防止权限不足导致整个搜索崩溃
3. 跳过 `.` 开头的隐藏目录和 `node_modules`（性能关键）
4. `entry.name.includes(pattern)` 是模糊匹配——传 `"index"` 也能匹配 `"index.ts"`

```typescript
server.tool("search_files", "按文件名搜索文件（支持模糊匹配）", {
  pattern: z.string().describe("搜索关键词"),
  maxResults: z.number().default(20).describe("最大结果数"),
```

`.default(20)` 是 Zod 的默认值功能——如果 Client 没传 `maxResults`，自动设为 20。这样 LLM 不需要显式指定结果数量也能正常工作。

---

## 4. Agent 调试面板 — React 三层架构

### 4.1 为什么是三个 Tab？

```
🔌 Servers  → 管理面：有哪些 MCP Server 在运行？各有哪些 tool？
🔧 Tools    → 数据面：tool 调了什么？参数是什么？结果是什么？耗时？
💬 Chat     → 交互面：和 Agent 对话，看 tool call 实际怎么触发的
```

这三个 Tab 对应 Agent 系统的三个视角：
- **管理面**：运维人员关心的——系统是否正常
- **数据面**：开发者关心的——调用链是否对
- **交互面**：用户看到的——对话体验是否好

### 4.2 App.tsx — Tab 切换

```tsx
const [tab, setTab] = useState<"servers" | "tools" | "chat">("servers");
```

`useState` 的类型参数 `"servers" | "tools" | "chat"` 确保 `tab` 的值只能是这三个字面量之一——写错会报 TypeScript 编译错误。

```tsx
const labels = { servers: "🔌 MCP Servers", tools: "🔧 Tool Calls", chat: "💬 Chat" };
```

用对象映射而非三元/switch，新增 Tab 只需加一行。

### 4.3 McpServerStatus.tsx — 列表组件

```tsx
{mockServers.map((s) => (
  <div key={s.name}>
    <span className="w-2 h-2 rounded-full bg-green-400" />  {/* 状态指示灯 */}
    <span className="font-mono text-sm">{s.name}</span>       {/* 用等宽字体 */}
    {s.tools.map((t) => (
      <span className="font-mono">{t}()</span>                {/* 工具名也用等宽 */}
    ))}
  </div>
))}
```

**状态指示灯**：`w-2 h-2 rounded-full bg-green-400` 是 Tailwind 的"写一个绿点"的标准写法——2×2 像素、全圆、绿色。不需要额外的图标库。

**等宽字体**：Server 名和工具名用 `font-mono`。在调试面板中，程序化信息用等宽字体能让开发者眼睛更快定位关键数据。

### 4.4 ToolCallLog.tsx — 可展开卡片

```tsx
const [expanded, setExpanded] = useState(false);
```

每个 tool call 是一个独立卡片，各自维护展开/折叠状态。

```tsx
<div onClick={() => setExpanded(!expanded)}>
  <span>{call.status === "success" ? "✅" : "❌"}</span>
  <span className="font-mono text-sm text-blue-400">{call.tool}</span>
  <span>{Object.entries(call.params).map(([k, v]) => `${k}=${v}`).join(", ")}</span>
  <span>{call.duration}ms</span>
</div>
```

卡片折叠状态下显示四列：状态图标 → 工具名 → 参数摘要 → 耗时。这四列正好是开发者排查问题时最需要的信息。

```tsx
{expanded && (
  <pre className="text-xs bg-gray-900 p-2 rounded">
    {JSON.stringify(call.params, null, 2)}
  </pre>
)}
```

展开后显示完整 JSON。`JSON.stringify(x, null, 2)` 的第三个参数 `2` 是缩进空格数，让 JSON 可读。

### 4.5 ChatStream.tsx — 聊天界面

```tsx
const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
```

消息列表的状态管理。使用数组追加而非替换——React 的 `setState` 传入函数形式 `prev => [...prev, newMsg]` 保证并发安全（如果快速连续发消息，不会丢失）。

```tsx
setTimeout(() => {
  setMessages((prev) => [...prev, { role: "assistant", content: "模拟回复..." }]);
  setLoading(false);
}, 1000);
```

**当前是模拟的。** 真正接入 MCP SDK 需要：
1. 创建 MCP Client 连接到 Server
2. 监听 tool call 事件
3. 执行工具 → 回传结果
4. 流式展示 LLM 输出

这是阶段 2 后续要补的内容。

---

## 5. 阶段 2 架构总览

```
┌─────────────────────────┐
│   Agent 调试面板 (React) │  ← 你构建的 UI
│   Servers │ Tools │ Chat │
└──────────┬──────────────┘
           │ 调用 tools/list, tools/call
┌──────────▼──────────────┐
│   MCP Protocol (JSON-RPC)│  ← 标准协议
└──────────┬──────────────┘
     ┌─────┼─────┬─────────┐
     ▼     ▼     ▼
  hello  weather file-search   ← 你构建的 MCP Server
```

**核心认知**：MCP 的价值在于"分离"——Server 只管提供工具，Client 只管调用工具，中间的协议层保证互操作性。你可以随时换 Client（从 Codex 换成自己的 React 面板），Server 不用改一行代码。
