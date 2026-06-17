# API 文档精读笔记

> 精读目标：
> - OpenAI Chat Completions: https://platform.openai.com/docs/api-reference/chat/create
> - Anthropic Messages: https://docs.anthropic.com/en/api/messages

## OpenAI Chat Completions API

### 核心参数

| 参数 | 类型 | 作用 | 默认值 |
|---|---|---|---|
| messages | array | 对话历史 | 必填 |
| model | string | 模型选择 | 必填 |
| temperature | number | 随机性控制 | 1 |
| top_p | number | 核采样 | 1 |
| tools | array | 可用工具列表 | 无 |
| tool_choice | string/object | 工具选择策略 | "auto" |

### messages 结构
- **system**: 设定 Agent 行为规则
- **user**: 用户输入
- **assistant**: 模型回复（含 tool_calls）
- **tool**: 工具执行结果

---

## OpenAI vs Anthropic API 对比

| 特性 | OpenAI | Anthropic |
|---|---|---|
| 消息格式 | messages 数组 | messages 数组 |
| System Prompt | messages 中的 system role | 独立的 system 参数 |
| 工具调用 | tools + tool_choice | tools + tool_choice |
| 最大输出 | max_completion_tokens | max_tokens |
| 停止条件 | stop 参数 | stop_sequences 参数 |

---

## 读文档前不知道的 3 个发现

[读完后写在这里]

1.
2.
3.
