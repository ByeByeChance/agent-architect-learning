# CoT / ReAct / Reflexion 关键论文笔记

> 从学术角度理解 Prompt Engineering 的核心技术——它们为什么有效、边界在哪、怎么选。

## 1. Chain-of-Thought (Wei et al., 2022)

**论文**：Chain-of-Thought Prompting Elicits Reasoning in Large Language Models

### 核心发现

**在 few-shot prompting 中加入推理步骤示例**，能显著提升 LLM 在多步推理任务上的表现。

实验数据（GSM8K 数学推理）：
- Standard prompting：~18% 准确率
- CoT prompting：~58% 准确率（+40%）
- 模型越大，CoT 收益越明显（< 10B 参数几乎没效果）

### 为什么有效？

论文给出的三个理由：
1. **分解问题**：CoT 把复杂推理分解为可验证的中间步骤
2. **更多计算**：每个推理 token 都给模型更多"计算时间"
3. **自回归优势**：Transformer decoder 的自回归性质让每个 token 都能基于之前的推理 token

### 实践启示

- CoT 示例要展示推理步骤，不能只给答案
- 推理步骤质量 > 数量：2-3 个好的推理示例足够
- 算术推理、常识推理、符号推理 — CoT 都有帮助，但程度不同

---

## 2. ReAct (Yao et al., 2022)

**论文**：ReAct: Synergizing Reasoning and Acting in Language Models

### 核心洞察

**Reasoning-only (CoT)** 和 **Acting-only (纯 tool calling)** 各有缺陷：
- CoT 只有推理没有行动 → 无法获取外部信息，容易产生幻觉
- 纯 tool calling 只有行动没有推理 → 无法规划、无法从行动中学习

ReAct 把两者交织在一起：**Reason → Act → Observe → Reason → Act → ...**

### ReAct 循环

```
Thought: 用户问北京天气 → 我需要调用天气工具
Action: get_weather("北京")
Observation: 晴，25°C，湿度 40%
Thought: 天气很好 → 可以推荐户外活动 → 需要搜索
Action: search("北京户外活动推荐")
Observation: 颐和园 4.8 分、长城 4.7 分...
Thought: 有了足够的信息 → 可以给用户回复
Answer: 今天北京天气晴朗...
```

### 关键实验结论

| 任务类型 | CoT-only | Act-only | ReAct |
|---|---|---|---|
| 知识密集型 QA | 60% | 45% | 68% |
| 决策任务 | 55% | 50% | 72% |
| 简单事实查询 | 90% | 85% | 88% |

结论：**任务越需要外部信息，ReAct 的优势越大。** 对于简单的纯推理任务，CoT 更经济（不需要 tool call 开销）。

### 实践启示

- Function Calling 就是 ReAct 的一种特例
- 如果 Agent 需要访问外部系统（天气、搜索、数据库），ReAct 是最佳模式
- 不需要外部信息的推理任务，CoT 更高效

---

## 3. Reflexion (Shinn et al., 2023)

**论文**：Reflexion: Language Agents with Verbal Reinforcement Learning

### 核心洞察

人类不是一次就做对的——我们在失败后反思、然后重试。LLM Agent 也应该这样。

### Reflexion 循环

```
1. Actor: 执行任务（用 ReAct）
2. Evaluator: 评估输出质量（用 LLM-as-judge 或启发式规则）
3. Self-Reflection: 
   - 如果成功 → 记录"这样做是对的"
   - 如果失败 → 反思"为什么失败"，用自然语言记录教训
4. 重试 → 将反思结果注入下一次尝试的 prompt
```

### 为什么有效？

- **语言化的经验**：不像 RL 需要数值奖励信号，Reflexion 把"经验"表示为自然语言
- **可解释**：反思结果是人类可读的文本，可以直接用于调试
- **累积改进**：多次反思的教训可以叠加，逐步提升

### 实践启示

- Prompt 测试失败时，不只是修 Prompt，也让模型反思失败原因
- 可以建立"反思日志"，供后续 Prompt 优化参考
- Reflexion 在 Agent 自修复场景中特别有用

---

## 4. 三者关系与选择框架

```
能不能在不访问外部工具的情况下完成？
├── 是 → Zero-shot / Few-shot CoT
└── 否 → 需要多步行动和外部工具？
    ├── 是 → ReAct
    └── 已经有了行动结果但需要改进？
        └── 是 → Reflexion
```

### 复杂度与成本的权衡

| 方法 | Token 消耗 | 延迟 | 适用场景 |
|---|---|---|---|
| CoT | 1x（基准） | 1x | 纯推理任务 |
| ReAct | 2-5x | 2-5x | 需要工具调用的任务 |
| Reflexion | 5-20x | 5-20x | 需要自我改进/自修复 |
| Tree-of-Thought | 10-100x | 10-100x | 高价值决策/创造性问题 |

### 一句话总结

- **CoT** = 让模型"想清楚再说"
- **ReAct** = 让模型"边想边做边学"
- **Reflexion** = 让模型"失败后总结反思再重来"
