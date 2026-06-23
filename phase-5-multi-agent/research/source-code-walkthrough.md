# Phase 5 源码走读

> 精读了 AutoGen (Microsoft) 和 CrewAI 两个多 Agent 框架的核心设计。
> 重点分析：Agent 对话模型、任务编排机制、Handoff 实现、HITL 集成方式。

---

## 1. AutoGen — AgentChat 对话模型

**版本**：autogen-agentchat v0.7.x | **源码**：Python

### 1.1 核心抽象：ConversableAgent

AutoGen 的设计基石是一个统一抽象——`ConversableAgent`，所有 Agent 类型（Assistant、UserProxy、GroupChat）都继承自它。

```python
# 从 autogen/agentchat/conversable_agent.py 核心结构

class ConversableAgent:
    def __init__(
        self,
        name: str,
        system_message: str | None = None,
        llm_config: dict | None = None,
        human_input_mode: str = "NEVER",  # ALWAYS / NEVER / TERMINATE
        max_consecutive_auto_reply: int | None = None,
        # ... 30+ 其他参数
    ):
        self._name = name
        self._system_message = system_message
        self._human_input_mode = human_input_mode
        self._reply_func_list = []  # ← 关键：回复处理器链
        self._conversation_history = []
    
    def register_reply(
        self,
        trigger: Agent | str | type | Callable,
        reply_func: Callable,
        position: int = 0
    ):
        """注册回复处理器——责任链模式的精髓"""
        self._reply_func_list.insert(position, (trigger, reply_func))
    
    async def a_generate_reply(
        self,
        messages: list[dict] | None = None,
        sender: "Agent" | None = None,
    ) -> str | dict | None:
        """遍历回复处理器链，找到第一个匹配的"""
        for trigger, reply_func in self._reply_func_list:
            if self._match_trigger(trigger, sender):
                reply = await reply_func(self, messages, sender)
                if reply is not None:
                    return reply
        return None
```

**设计精妙之处**：`register_reply` 用的是**责任链模式（Chain of Responsibility）**，不是简单的 if/else 或 switch。每个 reply handler 有 trigger 条件，第 0 个 handler（最高优先级）最先匹配。用户可以插入自定义 handler 覆盖默认行为。

默认 handler 链：
```
Position 0: 自定义用户 handlers
Position 1: check_termination_and_human_reply  ← HITL 逻辑
Position 2: generate_function_call_reply       ← Tool calling
Position 3: generate_tool_calls_reply          ← 新版 tool calling  
Position 4: a_check_can_repeat_speaker_reply   ← 防止死循环
Position 5: a_generate_code_execution_reply    ← 代码执行
Position 6: generate_oai_reply                 ← LLM 生成 (fallback)
```

### 1.2 GroupChat — 多 Agent 对话管理

```python
# 从 autogen/agentchat/groupchat.py

class GroupChat:
    agents: list[ConversableAgent]
    messages: list[dict]
    max_round: int = 10
    speaker_selection_method: str = "auto"  # auto / round_robin / random / manual
    
    async def a_select_speaker(
        self,
        last_speaker: ConversableAgent,
        selector: ConversableAgent
    ) -> ConversableAgent:
        """选择下一个发言的 Agent——核心调度逻辑"""
        if self.speaker_selection_method == "round_robin":
            # 轮转：按顺序轮流发言
            return self._next_agent_in_order(last_speaker)
        
        # auto: 让 LLM 选择下一个发言者
        prompt = self._build_speaker_selection_prompt(last_speaker)
        reply = await selector.a_generate_oai_reply(prompt)
        return self._agent_by_name(reply)
```

**调度策略对比**：

| 策略 | 逻辑 | 适用场景 |
|---|---|---|
| `round_robin` | 固定顺序轮流 | 流程固定的任务 |
| `auto` | LLM 选择下一个发言者 | 动态对话流 |
| `random` | 随机选择 | 模拟/多样性 |
| `manual` | 用户指定 | HITL 场景 |

**关键发现**：AutoGen 的 `auto` 模式让 LLM 选择下一个发言者，这引入了额外的 LLM 调用（每次选择约 200-500 tokens）。但好处是完全动态——不像我们的 Orchestrator 需要提前分解所有任务。两种方式各有优劣：

- **预分解（我们的方式）**：适合任务明确、步骤固定的场景，更可控
- **动态选择（AutoGen 方式）**：适合对话式、探索性的场景，更灵活

### 1.3 HITL 的三种模式

```python
class ConversableAgent:
    # human_input_mode 的三种值
    
    # ALWAYS: 每次发言都需要人类输入
    # ⚠️ 等于把 Agent 变成了人类的傀儡，只适合调试
    
    # NEVER: 完全自动，人类零干预
    # ⚠️ 高风险操作没有保护，只适合低风险场景
    
    # TERMINATE: Agent 请求终止时询问人类
    # ✅ 最实用的模式——只在关键决策点介入
```

AutoGen 的 HITL 实现比我们的细粒度少——它只在"整个 Agent 要终止"时介入，不区分"删除文件"和"生成代码"的风险等级。我们的 HITL Gate 按操作的风险等级（CRITICAL/WARNING/INFO）做了更细的决策。

---

## 2. CrewAI — 角色化 Agent 编排

**版本**：crewai v0.102 | **源码**：Python

### 2.1 核心理念：Agent 不是工具，是角色

CrewAI 和 AutoGen 的根本差异在于：**CrewAI 把 Agent 建模为"角色"而非"对话参与者"**。

```python
# 从 crewai/agent.py

class Agent:
    role: str          # "Senior Software Engineer"
    goal: str          # "Write clean, type-safe code"
    backstory: str     # "You have 15 years of experience..."
    
    tools: list[BaseTool]
    llm: BaseLLM
    
    def execute_task(
        self,
        task: Task,
        context: str | None = None
    ) -> str:
        # System Prompt = role + goal + backstory
        system_prompt = f"""
        You are {self.role}.
        Your goal: {self.goal}
        Your background: {self.backstory}
        
        Rules:
        1. Only use the tools provided to you
        2. If you are unsure, state your uncertainty
        3. Always cite your reasoning steps
        """
        return self._call_llm(system_prompt, task.description)
```

**backstory 是关键创新**——它给了 Agent 一个"虚拟人格"，让 LLM 不仅仅是执行指令，而是"扮演一个角色"。这在创意类任务（写作、设计）中效果显著，但在工程类任务（代码审查、安全检测）中可能引入不必要的偏差。

### 2.2 Task 的依赖管理

```python
# 从 crewai/task.py

class Task:
    description: str
    expected_output: str          # 期望输出的自然语言描述
    agent: Agent | None = None
    context: list["Task"] | None = None  # ← 依赖声明
    async_execution: bool = False        # ← 并行执行标记
    
    # context 是该 Task 依赖的 Task 列表
    # Crew 在执行时自动处理依赖和并行
```

**和我们实现的对比**：

| | CrewAI | 我们的 Orchestrator |
|---|---|---|
| 依赖声明 | Task.context: list[Task] | Task.dependsOn: string[] |
| 并行列 | Task.async_execution: bool | 自动检测（无依赖=可并行） |
| 调度策略 | 隐含在 Crew 中 | 拓扑排序显式执行 |
| 可观测性 | 基本日志 | Trace + TaskNode 树 |

### 2.3 Crew — 编排容器

```python
# 从 crewai/crew.py

class Crew:
    agents: list[Agent]
    tasks: list[Task]
    process: Process  # Process.sequential / Process.hierarchical
    verbose: bool
    
    def kickoff(self) -> str:
        if self.process == Process.sequential:
            return self._run_sequential()
        elif self.process == Process.hierarchical:
            return self._run_hierarchical()
    
    def _run_sequential(self):
        """按顺序执行 Task"""
        result = ""
        for task in self.tasks:
            agent = task.agent or self._pick_best_agent(task)
            result = agent.execute_task(task, context=result)
        return result
    
    def _run_hierarchical(self):
        """用 Manager Agent 分解和分配 Task"""
        manager = self._create_manager()
        return manager.delegate_and_execute(self.tasks)
```

**Process.sequential vs Process.hierarchical**：
- Sequential = 固定顺序，最简单的多 Agent 模式
- Hierarchical = 有一个 Manager Agent，类似我们的 Orchestrator 但 Manager 也是 LLM Agent

**CrewAI 的 Manager 和我们的 Orchestrator 的关键差异**：CrewAI 的 Manager 是 LLM Agent（用 LLM 决策如何分配任务），我们的 Orchestrator 是代码逻辑（用拓扑排序和确定性规则）。LLM Agent Manager 更灵活（可以处理意外情况），代码逻辑 Manager 更可控（不会做意外决策）。

---

## 3. 三个设计教训

### 3.1 责任链模式 > switch-case

AutoGen 的 `reply_func_list` 用责任链模式让 Agent 处理逻辑可插拔。新增一个 handler（比如 HITL 审批）不需要改核心 Agent 代码——注册一个新 handler 就行。

**应用**：我们的 Agent 路由将来可以扩展成责任链——先尝试精确角色匹配，失败则语义路由，再失败则手动指定。

### 3.2 "角色化"是一把双刃剑

CrewAI 的 `role + goal + backstory` 三件套在创意任务中效果显著——LLM 扮演"资深工程师"比"你是一个 AI"生成的内容更有风格。但在工程任务中，过强的角色设定可能导致 Agent "入戏太深"——比如"安全审查专家"可能过度保守，把低风险标记为严重问题。

**原则**：工程 Agent 用 System Prompt 给精确规则，创意 Agent 用角色给风格方向。

### 3.3 HITL 的粒度决定了系统的可用性

AutoGen 的 HITL 只在 Agent 终止时介入（太粗），CrewAI 没有原生 HITL（需要自己实现）。我们的 HITL Gate 按操作风险等级细分——这是生产环境真正需要的。太细（每次 LLM 调用都审批）不可用，太粗（只在大决策审批）不安全。

---

## 4. 两者都没有做好的事

1. **Context Budget 跨 Agent 管理**：AutoGen 和 CrewAI 都没有全局 token 预算概念。一个 Agent 可能吃掉 80% 的 context，导致其他 Agent 无预算可用。

2. **Agent 间记忆共享**：两个框架的 Agent 之间只能通过对话历史传递信息，没有结构化的"共享记忆"。Agent A 发现了一个 bug——Agent B 应该能检索到"Agent A 的同一次会话中发现了 bug X"。

3. **失败恢复的自动化**：两个框架都依赖重试，但没有"告诉 Agent 上次哪里失败了"的 feedback loop。我们的实现中，重试时注入 `previousFailures`——这是从 promptfoo 学到的设计。

---

## 参考资料

- AutoGen 源码: https://github.com/microsoft/autogen
- CrewAI 源码: https://github.com/crewAIInc/crewAI
- OpenAI Swarm (Handoff 参考): https://github.com/openai/swarm
