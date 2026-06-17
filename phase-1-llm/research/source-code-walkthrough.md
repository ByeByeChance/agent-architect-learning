# 阶段 1 源码走读：从配置到 Function Calling 的完整链路

> 走读文件：config.ts → deepseek.ts → tool-runner.ts → prompt-test.ts

---

## 1. 配置中心：config.ts

```typescript
// practice/agent/api-client/config.ts
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";
```

`dotenv/config` 在 import 时执行，自动读取 `.env` 文件的键值对写入 `process.env`。所以后面所有地方直接用 `process.env.XXX` 就能拿到 API Key。

```typescript
export const appConfig = {
  provider: (process.env.AI_PROVIDER || "deepseek") as Provider,

  providers: {
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY!,
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      baseURL: "https://api.deepseek.com",
    },
    // ...
  },
};
```

`as const` 让 TypeScript 把 `"deepseek"` 推断为字面量类型而不是 `string`，这样后续可以类型安全地用 `appConfig.provider` 做分支判断。

```typescript
export function createChatClient(provider?: Provider) {
  const p = provider || appConfig.provider;
  const cfg = appConfig.providers[p];

  if (p === "anthropic") {
    const client = new Anthropic({ apiKey: cfg.apiKey });
    return {
      type: "anthropic" as const,
      model: cfg.model,
      async chat(prompt: string, system?: string) { /* ... */ },
    };
  }

  // OpenAI 兼容路径（DeepSeek 走这里）
  const client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: (cfg as any).baseURL,  // ← 关键：DeepSeek 走这里
  });
  return {
    type: "openai-compatible" as const,
    model: cfg.model,
    client,
  };
}
```

**关键设计决策**：DeepSeek 没有独立的 SDK，通过 `new OpenAI({ baseURL: "https://api.deepseek.com" })` 复用 OpenAI SDK。因为 DeepSeek 的 API 格式和 OpenAI 100% 兼容，只是域名和模型名不同。这就是"配置驱动"的核心——换 provider 只改 `.env` 一行。

---

## 2. API 客户端：deepseek.ts

```typescript
const deepseek = new OpenAI({
  apiKey: config.deepseek.apiKey,
  baseURL: config.deepseek.baseURL,
});

async function chat(prompt: string) {
  const response = await deepseek.chat.completions.create({
    model: config.deepseek.model,
    messages: [{ role: "user", content: prompt }],
  });
  return response.choices[0].message.content;
}
```

逐行解读：

- `deepseek.chat.completions.create({...})` — 发起 HTTP POST 到 `https://api.deepseek.com/v1/chat/completions`
- `model: "deepseek-chat"` — 告诉 DeepSeek 用哪个模型
- `messages: [{ role: "user", content: prompt }]` — 对话历史，一条 user 消息
- `response.choices[0]` — API 返回一个 choices 数组（通常只有一个），取第一个
- `.message.content` — 模型返回的实际文本

OpenAI SDK 内部做的事：
1. 把参数序列化为 JSON
2. POST 到 `{baseURL}/chat/completions`
3. 解析 JSON 响应
4. 返回类型安全的 `ChatCompletion` 对象

---

## 3. Temperature 实验：temperature-exploration.ts

核心循环：

```typescript
for (const temp of [0, 0.3, 0.7, 1.0, 1.5]) {
  const responses: string[] = [];
  for (let i = 0; i < 3; i++) {
    const res = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [{ role: "user", content: prompt }],
      temperature: temp,  // ← 唯一变量
    });
    responses.push(res.choices[0].message.content!);
  }
  const unique = new Set(responses).size;  // 统计多样性
}
```

**为什么同一个 temperature 跑 3 次**：LLM 的随机性来自采样过程。每次调用都是一次独立的随机采样。跑 3 次才能看出某个 temperature 值下输出的稳定性。

`new Set(responses).size` 利用 Set 去重特性，直接算出有多少种不同的输出。

---

## 4. Prompt 测试：prompt-test.ts

```typescript
const systemPrompt = fs.readFileSync(
  path.join(__dirname, "prompt-versions", `${appConfig.promptTest.systemPromptVersion}.md`),
  "utf-8"
);
```

从文件系统读 System Prompt，而不是硬编码在代码里。这样改 Prompt 不需要改代码，改 md 文件就行——Prompt 版本化管理的基础。

```typescript
const res = await ai.client.chat.completions.create({
  model: ai.model,
  temperature: 0,              // 测试用 t=0，输出稳定
  messages: [
    { role: "system", content: systemPrompt },  // ← 注入规则
    { role: "user", content: tc.input },
  ],
});
output = res.choices[0].message.content!;
const pass = output.length > 10;  // 简单校验：有输出且不是空
```

**system role 的机制**：API 层面，system 消息优先级最高。模型在处理 user 消息之前先"内化" system 规则。这就是为什么 prompt injection 测试会通过——system 规则告诉模型"不能做 X"，它就会拒绝。

目前 `pass` 的判断是 `output.length > 10`，最简单的形式。真正的 Prompt 测试需要更复杂的 eval（比如用另一个 LLM 当裁判）。

---

## 5. Function Calling：tool-runner.ts（核心）

这是阶段 1 最复杂的流程：

```typescript
// Step 1: 定义工具
export const weatherTool = {
  type: "function",
  function: {
    name: "get_weather",
    description: "获取指定城市的当前天气信息",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "城市名称" },
      },
      required: ["city"],
    },
  },
};
```

这是标准的 JSON Schema。模型通过这个定义理解：
- 这个工具叫什么（name）
- 做什么用（description）
- 需要什么参数（parameters）
- 哪些参数必填（required）

```typescript
// Step 2: 发请求，带工具定义
const response = await ai.client.chat.completions.create({
  model: ai.model,
  messages: [{ role: "user", content: "北京和上海的天气怎么样？" }],
  tools: [weatherTool],  // ← 告诉模型"你有这个工具可用"
});
```

模型收到后做两件事：
1. 理解用户意图
2. 判断是否需要调用工具

如果模型认为需要工具，`response.choices[0].finish_reason` 会是 `"tool_calls"`。

```typescript
// Step 3: 解析工具调用
if (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
  for (const toolCall of choice.message.tool_calls) {
    const args = JSON.parse(toolCall.function.arguments);
    // args = { city: "北京" }
    const result = await getWeather(args.city);
    // result = "晴，25°C，湿度 40%"

    toolMessages.push({
      role: "tool",
      tool_call_id: toolCall.id,  // ← 必须匹配
      content: result,
    });
  }
}
```

`tool_call_id` 必须精确匹配，否则 API 会报错。这是协议层面的约束——每个工具调用的"回执"必须带上原始调用的 ID。

```typescript
// Step 4: 把工具结果发回模型
const finalResponse = await ai.client.chat.completions.create({
  model: ai.model,
  messages: [
    { role: "user", content: userMessage },
    choice.message,           // 模型的 tool_calls 响应
    ...toolMessages,          // 工具执行结果
  ],
});
```

**完整链路**：
```
用户消息 → 模型判断需要工具 → 返回 tool_calls
  → 你执行 getWeather("北京") → 得到 "晴，25°C"
  → 你执行 getWeather("上海") → 得到 "多云，28°C"
  → 把结果作为 tool 消息发回模型
  → 模型生成最终回答（含天气+穿衣建议）
```

这就是为什么 LLM 能"连接现实"——不是模型自己知道天气，而是它知道"我不知道但我可以问"。

---

## 6. 为什么这样设计？（架构反思）

1. **配置中心单点**：换 provider 不改任何业务代码
2. **System Prompt 外置**：Prompt 是数据，不是代码
3. **工厂模式**：`createChatClient()` 封装了 provider 差异，调用方不用管底层是谁
4. **错误边界**：config.ts 启动时校验 API Key，fail-fast 而非运行时才发现
