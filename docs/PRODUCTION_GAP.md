# Demo → 生产：六个阶段的差距全景

**Demo 的共同前提**：单进程、内存存储、无鉴权、无持久化、假数据、console.log。**生产的要求**：分布式、持久化、鉴权、容错、可观测。

---

## Phase 1 — LLM API 客户端

| 维度 | Demo | 生产 | 差距本质 |
|---|---|---|---|
| **API Key** | 一个 Key 写死在 `.env` | Key 轮换、密钥管理服务（Vault/KMS）、按 Agent 分配独立 Key | 泄露一个 Key 全部服务瘫痪 |
| **容错** | 无——调用失败直接抛异常 | 自动重试（exponential backoff）、429 限流退避、连接池管理 | LLM API 不是 100% 可用的 |
| **模型路由** | 硬编码 `createLLMClient("deepseek")` | 动态路由：按任务类型选模型（简单任务用 gpt-4o-mini 省钱）、按可用性降级 | 成本和质量之间的实时权衡 |
| **调用追踪** | `console.log` 打出 token 数 | 每次调用记录 traceId、tokens、cost、latency → 推送到可观测平台 | 没有追踪就无法优化成本 |

**生产化重点**：API 网关层（统一鉴权、限流、路由、追踪），不是每个 Agent 自己裸调 LLM。

---

## Phase 2 — MCP 协议与工具

| 维度 | Demo | 生产 | 差距本质 |
|---|---|---|---|
| **Transport** | Stdio（Server 是子进程，stdin/stdout 通信） | SSE / Streamable HTTP（Server 是独立服务，通过网络通信） | Stdio 只能同机、同进程树；网络 Transport 才能跨机器 |
| **服务发现** | 手动配置 Server 路径 | MCP Registry：Server 注册自己 → Client 发现 → 动态连接 | 10 个 MCP Server 不能每个手动配 |
| **鉴权** | 无 | OAuth2 / API Key / mTLS——不是谁都能调用天气 Server | MCP Server 可能操作真实数据库/文件系统 |
| **工具安全** | 信任所有 tool call | 工具执行需权限校验（调用方身份、参数范围、速率限制） | File Search Server 如果不过滤路径就是任意文件读取 |
| **多 Server 路由** | 无——demo 里只有 3 个 Server 且没同时跑 | Agent 需要知道"哪个 Server 有哪个工具"，智能路由 tool call | 两个 Server 都有 `search` 工具时，调用哪个？ |

**生产化重点**：MCP Server 不是"跑个脚本"，是独立部署的服务——有自己的健康检查、限流、日志。Client 和 Server 之间的 Transport 层需要 TLS + 鉴权。

---

## Phase 3 — Prompt Engineering

| 维度 | Demo | 生产 | 差距本质 |
|---|---|---|---|
| **版本存储** | 本地文件系统 `prompts/{id}.md` | 数据库 + Git（Prompt 即代码，PR review 后才能上线） | 多人协作、回滚、审计 |
| **测试规模** | 20 个用例，本地跑 | CI pipeline 中数千个用例，每次 Prompt 变更自动触发 | 20 个用例找不到边缘情况 |
| **多模型对比** | 手动跑一次 `multi-model-bench` | 持续监控：每个模型的输出质量、延迟、成本 → Grafana 仪表盘 | 模型行为随时间漂移，不是一次性对比 |
| **LLM-as-Judge** | 简单调用 LLM 评分 | 多 Judge 交叉验证、Judge 本身需要校准（用人类标注的金标准测试 Judge 的准确率） | 不可靠的 Judge 评估不可靠的模型——双重误差 |
| **语义 Diff** | 无——只做文本 diff | "措辞不同但逻辑等价"的自动判断（需要 LLM 来做语义对比） | 文本 diff 看不出"这句话改了对行为有没有影响" |
| **A/B 测试** | 无 | 生产流量 5% 走新 Prompt vs 95% 走旧 Prompt，对比行为指标 | Prompt 改了"感觉更好"不等于"指标更好" |

**生产化重点**：Prompt 从"开发时写的文本"变成"需要 CI/CD 的软件制品"。每次改 Prompt 跑回归测试，线上灰度验证，指标对比后再全量。

---

## Phase 4 — Agent 记忆与 RAG

| 维度 | Demo | 生产 | 差距本质 |
|---|---|---|---|
| **Embedding** | MockEmbedder（trigram 哈希，确定性伪随机） | BGE-M3 / text-embedding-3-small（真实语义模型，API 调用） | Mock 是"字符串相似"而非"语义相似"——中英文同义词全丢 |
| **向量存储** | 内存 VectorStore（暴力搜索 O(N×D)） | FAISS/Chroma/pgvector（HNSW/IVF 索引，O(log N)） | 1 万条文档暴力搜索还能跑，100 万条就崩了 |
| **Chunking** | 固定参数递归分割 | 根据文档类型自适应（代码按函数、文档按段落、表格按行列） | 一份代码和一篇散文用同样的 chunk 策略是灾难 |
| **检索质量** | 无评估 | Recall@10、MRR 等指标持续监控 | 不知道检索好不好的 RAG = 随机增强 |
| **三层记忆** | 全在内存，进程退出全丢 | 工作记忆（Redis）、短期记忆（PostgreSQL）、长期记忆（向量库 + 对象存储） | 三层记忆的生命周期不同，不能都放内存 |
| **上下文压缩** | 每次调 LLM 压缩（贵 + 慢） | 分级：轻量级用规则提取关键句 → 中级用小模型压缩 → 重量级才用大模型 | 压缩的成本不能比原文的 token 成本还高 |

**生产化重点**：Embedding 质量决定了 RAG 的天花板——Mock 换真实 Embedding 是第一步。第二步是检索质量评估（你怎么知道搜出来的东西是对的）。第三步是按文档类型自适应 Chunking。

---

## Phase 5 — 多 Agent 架构

| 维度 | Demo | 生产 | 差距本质 |
|---|---|---|---|
| **Orchestrator** | 单进程串行调度 Agent | 分布式任务队列（Celery/BullMQ/Temporal），Agent 各自是独立 worker | Orchestrator 挂了全链不能停 |
| **Agent 注册** | 内存 Map `agents.set(name, config)` | 服务发现（Consul/etcd/K8s Service） | Agent 实例会扩缩、重启、迁移——不能靠内存 Map 找它们 |
| **消息传递** | 函数调用（同一进程） | 消息队列（RabbitMQ/Kafka/NATS） | Agent 间消息不能丢、不能重复投递、需要 ack |
| **HITL Gate** | 控制台 `confirm("是否批准?")` 模拟 | 真实审批工作流——通知 → 等待 → 超时 → 默认策略（允许/拒绝） | 审批人不在电脑前不能阻塞整个 Agent 链 |
| **Context Budget** | 单进程 `Map<agentId, usage>` 计数 | 分布式预算——Redis 原子计数 + API Gateway 拦截超预算请求 | 多个 Agent 实例同时消耗预算，必须有原子操作 |
| **共享记忆** | 两个内存 Map（VectorStore + knowledge Map） | 向量数据库 + PostgreSQL + Shared Memory Service（见 `shared-memory/production-design.md`） | 跨进程、持久化、并发控制 |

**生产化重点**：Orchestrator 是最大单点——生产需要把"任务分解"（轻量 LLM 调用）和"任务调度"（队列管理）分开。分解完的 DAG/状态持久化到数据库，Worker 从队列拉任务，Orchestrator 挂了 Worker 继续跑。

---

## Phase 6 — 产品化与治理

| 维度 | Demo | 生产 | 差距本质 |
|---|---|---|---|
| **成本追踪** | 内存计数 + 控制台打印 | 每个 Agent 调用的 token/cost 实时写入时序数据库 → 按团队/用户/标签聚合 → Grafana 面板 + 预算告警（PagerDuty） | 内存计数进程退出全丢；生产需要历史趋势、异常告警、月度报表 |
| **预算管控** | 检查后只是打印告警 | API Gateway 层拦截——超预算直接返回 429，不在 Agent 层做"软检查" | Dashboard 里的预算不是预算，Gateway 强制拦截的才是 |
| **信任评分** | 进程内 `TrustScorer` | 独立的 Trust Service，评分写入数据库 → 每次 Agent 调用前查分 → 低分自动触发 HITL | 信任评分需要跨会话持久化，不能每次重启归零 |
| **护栏（regex 层）** | 用 demo 里的 `INJECTION_PATTERNS` 数组 | 正则规则从安全团队的配置文件中加载（热更新，不需重启）+ LLM 二层语义检测 | 攻击模式在变，规则需要持续更新 |
| **熔断器** | 内存状态机（`CircuitState` 变量） | Redis 分布式状态——多个 Agent 实例共享同一个熔断器状态 | 熔断器状态必须跨实例一致——A 实例已经把熔断器打到 OPEN，B 实例不能再尝试调用 |
| **限流器** | 内存 Token Bucket | Redis 滑动窗口 + API Gateway 限流 | 单进程限流管不住多个实例 |
| **审计日志** | 内存数组 + SHA-256 链 | PostgreSQL append-only 表 + 定期导出到对象存储（S3 不可变 bucket） + 每条日志上链（可选） | 内存数组不持久；生产审计日志是不可变的证据链 |
| **金丝雀发布** | 模拟——随机数模拟质量分 | 真实流量分割——负载均衡 5% 流量到新模型，A/B 对比 24 小时行为指标后决定推广/回滚 | 模拟不能替代真实用户的交互 |
| **告警** | 控制台打印 | Prometheus AlertManager → PagerDuty/Slack | 控制台告警没人 24 小时盯着看 |

**生产化重点**：Phase 6 的每个模块都是"内存数据结构 → 外部服务"的转变。最核心的是三条线：(1) 成本从"打印出来"变成"Gateway 拦截"；(2) 审计从"数组"变成"不可变证据链"；(3) 熔断/限流从"进程内"变成"分布式共享状态"。

---

## 所有的"内存 → 外部"汇总

这是一个贯穿六个阶段的统一模式：

| 在 Demo 里的形式 | 在生产里的形式 | 出现在哪些阶段 |
|---|---|---|
| `Map<string, T>` | Redis / PostgreSQL | P4 记忆、P5 注册中心/预算/共享记忆、P6 成本/信任/熔断/限流 |
| `Array<T>` | 数据库表 + 时序数据库 | P6 审计日志、P3 版本历史、P4 记忆历史 |
| `console.log()` | 结构化日志 (OTel) + Grafana | 全部 |
| `Date.now()` | `now()`（数据库函数、NTP 同步） | P4 记忆时效、P6 审计时间戳 |
| 模拟数据（随机数/假 API） | 真实外部服务（LLM API、支付 API、数据库） | 全部 |
| 单进程调用 | HTTP/gRPC/message queue | P2 MCP Transport、P5 Agent 通信、P6 Shared Memory Service |

**核心判断：demo 验证"想法对不对"，生产验证"挂了能不能恢复"。** 两者的代码逻辑一样——`add()`、`search()`、`execute()` 的方法签名不需要变——但方法内部的存储操作需要从 Map 换成数据库调用。

---

## 按规模拐点的生产化路径

不是所有场景都需要全套生产化：

| 规模 | 怎么做 | 哪些可以继续用 Demo 方案 |
|---|---|---|
| **个人工具**（1 人，<10 次/天） | Demo 方案基本够用 | 内存 VectorStore、内存记忆、单进程 Agent |
| **小团队**（3-10 人，内部工具） | 加持久化 + 鉴权 | Embedding 可以继续用 Mock（如果是英文），存储换成 SQLite |
| **业务系统**（10-100 人，外部用户） | 全套：分布式存储、消息队列、可观测、告警 | 只剩概念不变，实现全换 |
| **平台级**（>100 人，多租户） | 多租户隔离 + 跨区域部署 + SLA | 每个模块都是独立服务 |
