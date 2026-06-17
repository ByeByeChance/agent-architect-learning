# 组件架构设计

## 分层原则

### 展示层 (Presentation)
- 纯 UI 组件，无业务逻辑
- 例：Button, Input, Card, Modal, Table
- 依赖：只依赖 Design Token

### 逻辑层 (Logic / Hooks)
- 状态管理、数据获取、副作用
- 例：useAgentChat, useToolCall, useStreamResponse
- 依赖：API 客户端、状态库

### 数据层 (Data)
- API 调用封装、数据转换、缓存
- 例：openaiClient, anthropicClient, toolRegistry
- 依赖：外部 SDK

---

## Agent 产品基础组件清单

每个 Agent 产品都需要以下 5 个核心组件：

### 1. StreamingText — 流式显示 Agent 输出
```
Props: { text: string; isStreaming: boolean; speed?: number }
States: streaming | complete | error
```

### 2. ToolCallCard — 显示单次工具调用
```
Props: { toolName: string; params: Record<string, unknown>; result: string; status: 'pending' | 'success' | 'error' }
States: pending | success | error
```

### 3. AgentThinking — 显示推理过程（可折叠）
```
Props: { thinking: string; collapsed?: boolean }
States: thinking | complete
```

### 4. ChatBubble — 消息气泡
```
Props: { role: 'user' | 'agent'; content: string; timestamp: Date }
States: default | loading | error
```

### 5. StatusIndicator — Agent 状态指示器
```
Props: { status: 'idle' | 'thinking' | 'calling_tool' | 'responding' | 'error' }
States: idle | thinking | calling_tool | responding | error
```

---

## 组件规范

每个组件必须包含：
1. **Props 类型定义**（TypeScript interface）
2. **Loading 状态**（骨架屏或 spinner）
3. **Empty 状态**（无数据时显示什么）
4. **Error 状态**（错误信息和重试按钮）
5. **可访问性标注**（ARIA labels, roles）
