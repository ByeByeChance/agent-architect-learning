# Anthropic + OpenAI Prompt Engineering Guide 精读

> 来源：Anthropic Prompt Engineering Guide、OpenAI Prompt Engineering Guide、社区最佳实践

## 1. Anthropic 的 Prompt Engineering 哲学

Anthropic 官方指南的核心理念：**把清晰给模型，把灵活留给用户。**

### 核心原则

1. **Be clear and direct（清晰直接）**
   - 不要暗示，直接说你要什么
   - "请用 JSON 返回" > "如果能用 JSON 返回就更好了"
   - 模型不会"揣测圣意"，它需要明确的指令

2. **Use examples（用例子）**
   - 格式要求用例子演示，而非文字描述
   - 1 个高质量示例 > 10 段文字说明
   - 示例要覆盖边界 case

3. **Let Claude think（让模型思考）**
   - 复杂任务给思考空间：`<thinking>` 标签、CoT、step-by-step
   - 不要在第一个 token 就期待正确答案
   - Anthropic 特别强调 `<thinking>` 标签的用法

4. **Structure your prompts（结构化 Prompt）**
   - 用 XML 标签分隔不同部分
   - 用 Markdown 标题组织层次
   - 结构化输入对应结构化输出

### Anthropic 独特特性

**XML 标签风格**（Anthropic 推荐，Claude 训练数据中包含大量 XML）：
```
<instructions>
  <role>你是一个代码审查专家</role>
  <task>审查以下代码</task>
  <constraints>
    <constraint>不多于 8 个问题</constraint>
    <constraint>每个问题带行号</constraint>
  </constraints>
</instructions>
```

**`<thinking>` 标签**：
```
<thinking>
我需要先理解这段代码的意图和上下文。
这段代码接收用户输入但没有做 XSS 过滤...
</thinking>
<answer>
## 🔴 严重问题：XSS 漏洞...
</answer>
```

**Prefilling（预填）**：Anthropic API 支持预填 Assistant 回复的开头，强制模型按格式输出：
```
messages: [
  { role: "user", content: "..." },
  { role: "assistant", content: "<thinking>\n让我分析..." }  // 强制从 thinking 开始
]
```

## 2. OpenAI 的 Prompt Engineering 六策略

| 策略 | 说明 | 实践 |
|---|---|---|
| 1. Write clear instructions | 指令要具体、可执行 | "输出 JSON" 而非 "结构化输出" |
| 2. Provide reference text | 提供参考文本减少幻觉 | 把文档片段放入 prompt |
| 3. Split complex tasks | 复杂任务拆成子任务 | 先提取 → 再分析 → 再总结 |
| 4. Give the model time to think | 给推理空间 | Zero-shot CoT、"一步步来" |
| 5. Use external tools | 借助工具弥补短板 | Function Calling、Code Interpreter |
| 6. Test changes systematically | 系统化测试 | 黄金测试集、A/B 对比 |

## 3. 两家的差异与互补

| 维度 | Anthropic | OpenAI |
|---|---|---|
| 结构化方式 | XML 标签（训练数据多） | Markdown（通用） |
| 思考机制 | `<thinking>` 标签 | `Let's think step by step` |
| 输出控制 | Prefilling（强约束） | JSON Mode / Structured Outputs |
| 上下文长度 | 200K（长文档友好） | 128K |
| 安全倾向 | 更保守，默认拒绝多 | 相对宽松 |
| 多模态 | 文本+图片 | 文本+图片+音频 |

**互补策略**：
- 写 System Prompt 时，用 Anthropic 的 XML 标签风格（可读性好），同时确保 Markdown 标题也能被 OpenAI 识别
- CoT 用 `Let's think step by step`（两家都适用）
- 输出格式用 JSON Schema（OpenAI Structured Outputs 直接支持，Anthropic 通过 prefilling 实现）

## 4. Prompt 工程的常见误区

**误区 1：System Prompt 越长越好**
真相：超过 1000 token 后，模型对早期指令的遵守率下降。把详细信息放到 user message 或 RAG 注入。

**误区 2：给越多例子越好**
真相：3-5 个高质量例子足够。超过 10 个例子收益递减且消耗 context。例子的多样性比数量重要。

**误区 3：用 System Prompt 做所有事**
真相：System Prompt 用于角色和全局约束，具体任务指令放在 user message 里。User message 的优先级实际上高于 System Prompt（离输出更近）。

**误区 4：Temperature 0 就是确定性输出**
真相：Temperature 0 减少但不是消除随机性。不同 API 调用之间仍可能有微小差异（浮点运算、并行计算顺序）。

**误区 5：Prompt 写好就不用改了**
真相：模型在持续更新，同一个 Prompt 在不同模型版本上表现可能不同。Prompt 需要持续测试和迭代。
