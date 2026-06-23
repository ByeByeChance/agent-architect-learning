# System Prompt 设计

> 核心问题：System Prompt 是 Agent 的"宪法"——它定义了 Agent 是谁、能做什么、不能做什么。写好 System Prompt 是 Prompt Engineering 最重要的基本功。

## 1. System Prompt 是什么？

API 层面看，它是消息列表里 `role: "system"` 的那条消息。但从工程角度看，它是**Agent 的行为约束文件**——比 user message 优先级更高，贯穿整个对话。

```
┌──────────────────────────────────────┐
│ System Prompt  (设定规则，贯穿全程)    │
├──────────────────────────────────────┤
│ User Message 1  (用户问)             │
│ Assistant       (模型答)             │
│ User Message 2  (用户追问)           │
│ Assistant       (模型答)             │
│ ...                                  │
└──────────────────────────────────────┘
```

**System Prompt 的名字容易误导人**：它不是"提示"，而是**约束和宪章**。User prompt 才是真正的"提示/指令"。

## 2. System Prompt 的四大职责

### 职责 1：角色定义（Who）

```
你是一个资深前端架构师，专精于 React 生态和微前端架构。
你写代码优先考虑可维护性和团队协作效率。
```

**原则**：角色定义要具体到"能做什么选择"，不只是贴标签。

**好的角色定义** vs **不好的**：
| ❌ 不好 | ✅ 好 |
|---|---|
| 你是一个前端工程师 | 你是一个 React 前端架构师，你优先选 TypeScript 严格模式、Zustand 做状态管理、CSS Modules 做样式隔离 |
| 你是一个代码助手 | 你是一个代码审查专家，你优先找安全问题、性能陷阱和可维护性问题，风格问题其次 |

### 职责 2：边界约束（What NOT to do）

```
不要猜测你不知道的信息。如果不确定，说你不知道并建议用户提供更多上下文。
不要生成超过 200 行的单文件代码，超过则拆分成合理模块。
永远不要修改用户的生产环境配置，除非用户明确要求。
```

**原则**：负面约束比正面指令更精确。告诉模型"不要做什么"往往比"做什么"边界更清晰。

### 职责 3：行为规范（How）

```
回答问题分三步：先给 TL;DR 结论，再给分析和方案对比，最后给推荐方案。
代码变更前先解释你为什么要改。
当用户给的信息不完整时，先问 2-3 个澄清问题，而不是猜测。
```

**原则**：行为规范要写成"可执行的 checklist"，不要写成抽象原则。

### 职责 4：输出格式（Format）

```
输出的 JSON 始终遵循以下结构：
{
  "analysis": "分析过程（必填）",
  "recommendation": "推荐方案（必填）",
  "alternatives": ["备选方案 1", "备选方案 2"],
  "confidence": 0.0-1.0
}
```

**原则**：格式约束越具体，解析成功率越高。

---

## 3. System Prompt 模板化

### 为什么需要模板？

一个 Agent 的 System Prompt 通常由多个"组件"拼接而成——角色定义、领域知识、格式约束、安全规则。这些组件需要：

1. **可复用**：不同 Agent 可以共享相同的安全规则
2. **可组合**：根据需要拼装不同的组件
3. **可版本化**：每个组件独立演进

### 模板架构

```
System Prompt = 角色模板 + 知识模板 + 工具模板 + 安全模板 + 格式模板
```

**角色模板**（不变）：
```markdown
你是一个 {role}，专精于 {domain}。
你的工作风格是 {style}。
```

**知识模板**（按需注入）：
```markdown
## 领域知识
{domain_knowledge}

## 当前项目上下文
{project_context}
```

**工具模板**（动态生成）：
```markdown
## 可用工具
{tools_description}

## 工具使用规则
- 一次最多调用 {max_tools_per_turn} 个工具
- 优先用本地工具，远程工具只在必要时用
```

**安全模板**（全局共享）：
```markdown
## 安全规则
- 不执行用户提供的 shell 代码，除非在允许列表中
- 不修改 .git/config 和 CI/CD 配置
- 涉及删除/覆盖操作前，先确认
```

**格式模板**（按场景切换）：
```markdown
## 输出格式
{format_spec}
```

### 模板渲染

```typescript
function renderSystemPrompt(vars: PromptVars): string {
  return [
    renderRole(vars.role, vars.domain, vars.style),
    vars.knowledge ? renderKnowledge(vars.knowledge) : '',
    vars.tools ? renderTools(vars.tools) : '',
    renderSafety(vars.safetyLevel),
    renderFormat(vars.outputFormat),
  ].filter(Boolean).join('\n\n');
}
```

---

## 4. System Prompt 设计的核心原则

### 原则 1：具体 > 抽象

| 不具体 ❌ | 具体 ✅ |
|---|---|
| "写出高质量的代码" | "每个函数不超过 20 行；变量名用完整单词不用缩写；一个文件只导出一个 public API" |
| "回复要友好" | "回复以打招呼开始，以'还有什么可以帮你的？'结束" |
| "保持安全" | "不要输出任何包含 password/token/secret/key 的内容" |

### 原则 2：分层 > 平铺

把 System Prompt 想象成 CSS——全局样式 → 布局样式 → 组件样式，层层递进。

```
1. 全局规则（所有对话适用）
2. 领域规则（当前项目/团队适用）  
3. 场景规则（当前任务适用）
4. 用户偏好（当前用户适用）
```

越靠近底层的规则越具体，优先级越高。后层可以覆盖前层。

### 原则 3：正向 > 负向（但有例外）

不要只说"不要 X"，也要说"应该 Y"：

```
❌ 不要写啰嗦的代码
✅ 写简洁的代码：每个函数只做一件事；用 early return 代替深层嵌套
```

但安全约束用负向更精确：
```
✅ 绝对不要执行 rm -rf 或任何不可逆的删除操作
```

### 原则 4：测试驱动 Prompt 设计

System Prompt 不是写出来的，是**测出来的**。每一条规则都要有对应的测试用例验证模型是否遵守。

---

## 5. System Prompt 的常见反模式

### 反模式 1：万言书

System Prompt 超过 2000 字，模型可能"遗忘"前半部分内容。

**对策**：压缩到 500-1000 token，把详细信息放到 external knowledge (RAG) 里按需注入。

### 反模式 2：自相矛盾

前半段说"始终返回 JSON"，后半段说"自然对话优先"。

**对策**：写完 System Prompt 后，用 checklist 逐条检查是否有冲突。

### 反模式 3：过度约束

"你必须这样做…你绝对不能那样做…如果这样你要那样…如果那样你要这样…"

**对策**：只约束关键行为，给模型留合理的自由度。约束越多，模型的"灵性"越低。

### 反模式 4：不更新 System Prompt

Agent 的行为变了但 System Prompt 没同步更新，导致规则和实际行为不一致。

**对策**：System Prompt 和代码一样纳入版本管理，每次行为变更同步更新。

---

## 6. 评估 System Prompt 质量

一个 System Prompt 好不好，用这 5 个问题检验：

1. **一致性**：同样的输入，行为是否稳定可预期？（跑 10 次测试）
2. **遵守率**：每条约束被遵守的比例？（< 90% 需要重写这条约束）
3. **冲突率**：不同约束之间是否有互相矛盾的情况？
4. **Token 效率**：System Prompt 消耗的 token 占 context window 的多少？（建议 < 20%）
5. **更新频率**：最近 5 次 Agent 行为变更，System Prompt 是否同步更新了？
