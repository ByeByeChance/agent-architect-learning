# Phase 3 源码走读

> 精读了三个关键代码库：promptfoo（Prompt 测试框架）、Anthropic SDK（API 设计哲学）、LangChain PromptTemplate（模板引擎）。
> 所有代码来自 node_modules 中的实际源码，非概括性描述。

---

## 1. promptfoo — Prompt 测试框架源码

**版本**：0.121.17 | **入口**：`dist/src/graders-CBgwKrWl.js` | **类型**：`dist/src/contracts.d.ts`

### 1.1 架构总览

promptfoo 是一个完整的 Prompt 评估 + 红队测试平台（现已被 OpenAI 收购，MIT 开源）。源码有清晰的 `//#region src/...` 标记，即使 minified 也可以追踪原始模块结构。

核心模块结构：
```
src/
├── assertions/utils.ts    # 断言工具函数
├── matchers/
│   ├── shared.ts           # 共享匹配逻辑（fail/graderFail/cosineSimilarity）
│   ├── rubric.ts           # LLM-as-Judge 裁判引擎
│   └── llmGrading.ts       # 各类 grading 的实现入口
├── prompts/
│   ├── index.ts            # Prompt 处理管线（12 种格式路由）
│   ├── grading.ts          # 裁判 Prompt 模板（内置的 grading prompts）
│   └── processors/         # 各格式处理器
│       ├── string.ts, csv.ts, json.ts, markdown.ts, yaml.ts, ...
│       ├── javascript.ts, python.ts, executable.ts
│       └── jinja.ts, jsonl.ts, text.ts
└── redteam/plugins/        # 红队测试：100+ 安全攻击插件
```

### 1.2 核心设计 1：`fail()` vs `graderFail()` — 错误的传播策略

```javascript
// 从 graders-CBgwKrWl.js 第 497-516 行
function fail(reason, tokensUsed) {
  return { pass: false, reason, score: 0, tokensUsed };
}

function graderFail(reason, tokensUsed) {
  return { ...fail(reason, tokensUsed), metadata: { graderError: true } };
  // ⚠️ graderError 标记是关键：
  // 当使用 not-llm-rubric 等逆断言时，grader 本身的错误不应该被翻转
  // 解析失败 ≠ 内容通过
}
```

**设计意图**：区分"内容不通过"和"裁判系统本身出错"。没有这个区分，`not-llm-rubric` 会把 JSON 解析失败翻转成"通过"——等于放过了所有错误。这是 promptfoo 最精妙的设计之一。

### 1.3 核心设计 2：裁判 Prompt 模板引擎

```javascript
// 从 graders-CBgwKrWl.js 第 1459-1475 行 — 默认 grading prompt
const DEFAULT_GRADING_PROMPT = JSON.stringify([
  {
    role: "system",
    content: `You are grading output according to a user-specified rubric.
    If the statement in the rubric is true, then the output passes the test.
    You respond with a JSON object with this structure: {reason, pass, score}

    Examples:
    <Output>Hello world</Output>
    <Rubric>Content contains a greeting</Rubric>
    {"reason": "the content contains the word 'Hello'", "pass": true, "score": 1.0}

    <Output>Avast ye swabs, repel the invaders!</Output>
    <Rubric>Does not speak like a pirate</Rubric>
    {"reason": "'avast ye' is a common pirate term", "pass": false, "score": 0.0}`
  },
  {
    role: "user",
    content: "<Output>\n{{ output }}\n</Output>\n<Rubric>\n{{ rubric }}\n</Rubric>"
  }
]);
```

**关键观察**：
- System role 定义规则 + 示例（Few-shot 内嵌在 system prompt 中）
- User role 用 XML 标签（`<Output>`、`<Rubric>`）分隔数据和标准——这是 Anthropic 推荐的风格
- 支持 Nunjucks 变量注入（`{{ output }}`、`{{ rubric }}`）
- 所有内置 grading prompt 都是 JSON 字符串——可以被用户自定义替换

promptfoo 内置了 8 种 grading prompt：
1. `DEFAULT_GRADING_PROMPT` — 通用 rubric 评估
2. `DEFAULT_AGENT_GRADING_PROMPT` — Agentic grading（可调用工具验证）
3. `PROMPTFOO_FACTUALITY_PROMPT` — 事实性评估（A-E 五分类）
4. `OPENAI_CLOSED_QA_PROMPT` — OpenAI 风格的封闭 QA 评估
5. `SUGGEST_PROMPTS_SYSTEM_MESSAGE` — 自动建议 prompt 变体
6. `OPTIMIZE_PROMPT_SYSTEM_MESSAGE` — 基于评估证据优化 prompt
7. `SELECT_BEST_PROMPT` — 从多个候选中选择最佳 prompt
8. `TRAJECTORY_GOAL_SUCCESS_PROMPT` — Agent 轨迹目标达成评估

### 1.4 核心设计 3：Prompt 处理管线（12 种格式路由）

```javascript
// 从 graders-CBgwKrWl.js 第 1689-1736 行
async function processPrompt(prompt, basePath = "", maxRecursionDepth = 1) {
  invariant(typeof prompt.raw === "string", "...");
  if (prompt.function) return [prompt];                    // JS 函数 → 动态生成
  if (prompt.raw.startsWith("exec:")) { ... }              // 可执行脚本 → stdout
  if (!maybeFilePath(prompt.raw)) return processString();  // 纯文本 → Nunjucks 渲染

  // 文件扩展名路由
  const { extension } = parsePathOrGlob(basePath, prompt.raw);
  if (extension === ".csv")  return processCsvPrompts();   // CSV 每行 → 一条 prompt
  if (extension === ".json") return processJsonFile();
  if (extension === ".jsonl") return processJsonlFile();
  if (extension === ".md")   return processMarkdownFile();
  if (extension === ".yaml" || extension === ".yml") return processYamlFile();
  if (extension === ".txt")  return processTxtFile();
  if (extension === ".j2")   return processJinjaFile();
  if (isJavascriptFile(extension)) return processJsFile();
  if (extension === ".py")   return processPythonFile();
  if ([".sh",".bash",".exe",".bat",".ps1",".rb",".pl"].includes(extension))
    return processExecutableFile();
  // 可执行权限检测
  const stats = await stat(filePath);
  if (stats.isFile() && (stats.mode & 73) !== 0)
    return processExecutableFile();
  return [];
}
```

**设计意图**：一条 prompt 不只是字符串——它可以是文件路径、函数、脚本、CSV 数据集。这解决了"同一个 prompt 要测 100 个 case"的批量生成问题。

### 1.5 核心设计 4：Rubric 渲染支持 Nunjucks + JSON

```javascript
// 从 graders-CBgwKrWl.js 第 636-645 行
async function renderLlmRubricPrompt(rubricPrompt, context) {
  const processedContext = processContextForTemplating(context, ...);
  try {
    // 先尝试 JSON 解析 → 对 JSON 内的每个字符串值做 Nunjucks 渲染
    const parsed = JSON.parse(rubricPrompt, (_k, v) =>
      typeof v === "string" ? nunjucks.renderString(v, processedContext) : v
    );
    return JSON.stringify(parsed);
  } catch (err) {
    logger.debug("Rubric prompt is not valid JSON, using Nunjucks rendering");
  }
  // fallback: 整个字符串做 Nunjucks 渲染
  return nunjucks.renderString(rubricPrompt, processedContext);
}
```

**设计意图**：Rubric prompt 的"JSON 优先 + Nunjucks fallback"策略——对技术人员友好（JSON 可程序化生成），对非技术人员也友好（纯文本 + `{{ var }}` 也能工作）。

### 1.6 核心设计 5：事实性评估（Factuality）的五分类体系

```javascript
// 从 graders-CBgwKrWl.js 第 1903-1909 行
const FACTUALITY_CATEGORY_DESCRIPTIONS = {
  A: "The submitted answer is a subset of the expert answer and is fully consistent with it.",
  B: "The submitted answer is a superset of the expert answer and is fully consistent with it.",
  C: "The submitted answer contains all the same details as the expert answer.",
  D: "There is a disagreement between the submitted answer and the expert answer.",
  E: "The answers differ, but these differences don't matter from the perspective of factuality."
};
```

这比简单的 pass/fail 精细得多——A/B/C 三种都是"通过"但程度不同，D 是不通过，E 是"差异但不影响事实性"。

---

## 2. Anthropic SDK — API 设计哲学

**版本**：0.39.0 | **类型定义**：`resources/messages/messages.d.ts`

### 2.1 关键设计 1：System Prompt 不是消息，是顶层参数

```typescript
// 从 messages.d.ts 第 1940-2086 行
interface MessageCreateParamsBase {
  system?: string | Array<TextBlockParam>;  // ← System 是独立顶层字段
  messages: Array<MessageParam>;             // ← messages 里只有 user/assistant
}

interface MessageParam {
  content: string | Array<ContentBlockParam>;
  role: 'user' | 'assistant';  // 没有 'system'!
}
```

API 文档注释明确说：
> "if you want to include a system prompt, you can use the top-level `system` parameter — there is no `'system'` role for input messages in the Messages API."

**设计意图**：System Prompt 是"游戏规则"，不属于对话回合。这个分离解决了 OpenAI API 的一个模糊点——system message 应该放在 messages 数组的哪个位置？

### 2.2 关键设计 2：Mid-Conversation System Block

```typescript
// 从 messages.d.ts 第 803-812 行
interface MidConversationSystemBlockParam {
  content: Array<TextBlockParam>;
  type: 'mid_conv_system';
  // "Use this block to provide or update system-level instructions
  //  at a specific point in the conversation, rather than only via
  //  the top-level `system` parameter."
}
```

**设计意图**：长对话中 system prompt 可能"漂移"，需要在中间重新注入约束。这是一个非常先进的 API 设计——把 System Prompt 从"静态前缀"变成了"动态可注入的控制指令"。

### 2.3 关键设计 3：Prefilling — 输出格式的最强约束

```typescript
// 从 messages.d.ts 第 1991-1998 行的示例
// Example with a partially-filled response from Claude:
[
  { "role": "user", "content": "What's the Greek name for Sun? (A) Sol (B) Helios (C) Sun" },
  { "role": "assistant", "content": "The best answer is (" }
]
// 模型被迫从 "(" 开始续写 → 必然输出 "B)" 然后继续
```

**设计意图**：比 OpenAI 的 JSON Mode 更灵活——可以 prefill 任何格式的前缀（XML 标签、Markdown 标题、特定代码结构），不限于 JSON。这是 Anthropic API 独有的能力。

### 2.4 关键设计 4：Stop Reason 语义化

```typescript
type StopReason = 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'pause_turn' | 'refusal';
```

每个 stop reason 都是有用的测试信号：
- `end_turn` → 正常完成
- `max_tokens` → 被截断了，可能是 prompt 太复杂
- `tool_use` → 模型需要调用工具
- `refusal` → 安全拦截（prompt 注入测试的关键信号）

promptfoo 的断言系统重度依赖 `stop_reason` 来判断测试结果。

### 2.5 Anthropic vs OpenAI 设计差异总结

| 维度 | Anthropic | OpenAI |
|---|---|---|
| System Prompt | 顶层 `system` 参数 | messages 数组中的 `role: "system"` |
| 输出约束 | Prefilling（任意格式前缀） | JSON Mode / Structured Outputs |
| 思考机制 | Extended Thinking（thinking tokens） | o1 系列（internal CoT） |
| 安全信号 | `refusal` stop reason | content filter flags |
| 中段指令 | `mid_conv_system` block | 无等价物 |
| 提示缓存 | `cache_control` marker | Automatic caching |

---

## 3. LangChain PromptTemplate — 模板引擎源码

**版本**：@langchain/core | **源码**：`dist/prompts/template.js`

### 3.1 模板格式：f-string 和 mustache

```javascript
// 从 template.js 第 7-46 行 — f-string 解析
const parseFString = (template) => {
  // 逐字符扫描
  // "{" + 非 "{" → 变量开始，找到 "}" → 提取变量名
  // "{{" → 转义为字面量 "{"
  // "}}" → 转义为字面量 "}"
  // 其他 → 字面量文本
};

// 从 template.js 第 101-108 行 — 格式路由表
const DEFAULT_FORMATTER_MAPPING = {
  "f-string": interpolateFString,
  mustache: interpolateMustache   // 底层调用 mustache.js
};
```

### 3.2 f-string 插值实现

```javascript
// 从 template.js 第 88-95 行 — f-string 插值
const interpolateFString = (template, values) => {
  return parseFString(template).reduce((res, node) => {
    if (node.type === "variable") {
      if (node.name in values)
        return res + (typeof values[node.name] === "string"
          ? values[node.name]
          : JSON.stringify(values[node.name]));  // 非字符串值自动 JSON 序列化
      throw new Error(`(f-string) Missing value for input ${node.name}`);
    }
    return res + node.text;
  }, "");
};
```

**设计意图**：
- 非字符串值自动 `JSON.stringify()`——这是一个隐匿的设计决策，意味着 `{obj: {a: 1}}` 会被变成 `[object Object]` 然后注入 prompt
- 变量缺失直接抛错——fail fast，不静默生成不完整 prompt
- 不支持 filter/pipe 语法——保持简单，复杂逻辑交给外部处理

### 3.3 模板校验：初始化时用 dummy 值跑一遍

```javascript
// 从 template.js 第 117-136 行 — checkValidTemplate
const checkValidTemplate = (template, templateFormat, inputVariables) => {
  // 用 "foo" 作为每个变量的 dummy 值跑渲染
  const dummyInputs = Object.fromEntries(
    inputVariables.map((v) => [v, "foo"])
  );
  renderTemplate(template, templateFormat, dummyInputs);
  // 如果抛错 → 模板无效
};
```

**设计意图**：在构造函数里就校验模板，不等到运行时才发现 `{typo}` 拼写错误。这是一个好的工程实践——fail fast。

### 3.4 ChatPromptTemplate：角色分离的消息模板

```typescript
// 从 chat.d.ts 第 187-203 行 — ChatPromptTemplate 的输入
interface ChatPromptTemplateInput {
  promptMessages: Array<BaseMessagePromptTemplate | BaseMessage>;
  // 每一条消息都是独立的模板，各自管理自己的变量
  // SystemMessagePromptTemplate.fromTemplate("你是{role}")
  // HumanMessagePromptTemplate.fromTemplate("{input}")
  // AIMessagePromptTemplate.fromTemplate("好的，{response}")
}
```

**设计意图**：不同 role 的消息是独立的模板实体，各自注入不同的变量。这比把所有内容塞进一个字符串要灵活得多——System 消息用一组变量，Human 消息用另一组。

### 3.5 FewShotPromptTemplate：example + selector

```typescript
// 从 few_shot.d.ts 第 12-51 行
interface FewShotPromptTemplateInput {
  examples?: Example[];                    // 静态示例列表
  exampleSelector?: BaseExampleSelector;   // 动态示例选择器（二选一）
  examplePrompt: PromptTemplate;           // 单个示例的格式化模板
  exampleSeparator?: string;              // 示例间分隔符，默认 "\n\n"
  prefix?: string;                        // 示例前的 text
  suffix?: string;                        // 示例后的 text（通常放用户输入占位）
}
```

**设计意图**：Few-shot = prefix + (exampleSeparator + 示例1 + 示例2 + ...) + suffix。ExampleSelector 支持语义相似度选择——从示例库中选和当前输入最相关的 K 个示例。

### 3.6 LangChain 设计评价

**优点**：
- f-string 解析简单直观，50 行代码就能实现
- ChatPromptTemplate 的角色分离设计合理
- 初始化时校验模板——fail fast

**缺陷**：
- FewShotPromptTemplate + ExampleSelector 过度抽象——实际项目中 3-5 个手写示例比动态选择更可控
- `interpolateFString` 对非字符串值自动 `JSON.stringify()`——可能产生意外输出（`{}` 会变成 `[object Object]`）
- 没有模板版本管理——这是我们的核心补充点
- TypeScript 类型系统过于复杂（用模板字面量类型提取变量名），实际收益有限

---

## 4. 三个代码库的综合启示

| 学到了什么 | 来自 | 如何应用到 Phase 3 |
|---|---|---|
| 区分"不通过"和"系统错误"| promptfoo 的 `graderError` | test-runner 的断言返回必须区分这两种状态 |
| 裁判 Prompt 也要精心设计 | promptfoo 的 8 种内置 grading prompt | 我们的 LLM-as-Judge 要参考其 XML 标签风格 |
| Prompt 不是字符串，是处理管线 | promptfoo 的 12 种格式路由 | prompt-vault 支持 `file://` 引用和 JS 函数 |
| System Prompt 是独立参数 | Anthropic SDK 的 `system` 顶层字段 | 我们的 api-client 保持这种分离 |
| Mid-conversation system block | Anthropic SDK | 长对话 Agent 的关键能力，Phase 4 重点 |
| Prefilling 是格式控制的最强手段 | Anthropic SDK | bench-runner 评估格式时优先用 output_config |
| 模板格式只选一种，两种就够了 | LangChain 的 f-string + mustache | 我们的 prompt-vault 选 f-string，够用 |
| 初始化时校验模板 | LangChain 的 `checkValidTemplate` | prompt-registry 的 `validate` 已经做了 |
| 版本管理是三个框架都没做的 | — | 这是 Phase 3 的核心创新点 |
