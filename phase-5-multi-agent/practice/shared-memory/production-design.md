# Shared Memory Bus — 从 Demo 到生产

## Demo 能跑 ≠ 生产能用

Demo 的"共享库"本质上是**两个内存 Map + 单进程**：

```
SharedMemoryStore {
  store:    Map<string, number[]>    ← 向量数据
  knowledge: Map<string, Knowledge>  ← 元数据
}
```

Agent A 写入 `store.add()` → 同一个 Map → Agent B `store.search()` 读到。进程一关全没。

**真正的生产环境，Agent 各自是独立进程/服务。** 共享的前提是"网络可访问的外部存储"。

---

## 一、生产架构全景

```
                         ┌──────────────────────┐
                         │   Embedding Service   │
                         │   (BGE-M3 / text-     │
                         │    embedding-3-small) │
                         └──────────┬───────────┘
                                    │ gRPC/HTTP
                                    │ encode(text) → vector
                                    │
┌──────────┐  Write Path  ┌────────┴──────────┐
│ Agent A  │─────────────▶│  Shared Memory    │
│ (进程)   │              │  Service          │
└──────────┘              │                   │
                          │  POST /knowledge  │────▶ PostgreSQL
┌──────────┐  Read Path   │  GET  /search     │       (元数据)
│ Agent B  │◀─────────────│                   │
│ (进程)   │              │                   │────▶ FAISS/Chroma
└──────────┘              └───────────────────┘       (向量索引)

┌──────────┐
│ Agent C  │  同样通过 Shared Memory Service 读写
│ (进程)   │
└──────────┘
```

**三个独立服务替代 demo 的两个 Map：**

| Demo | 生产 | 职责 |
|---|---|---|
| `Map<string, number[]>` (VectorStore) | FAISS / Chroma / pgvector | 向量相似度检索 |
| `Map<string, Knowledge>` | PostgreSQL | 元数据存储、按标签/时间/Agent 过滤 |
| 无 | Shared Memory Service (HTTP/gRPC) | 统一 API、权限控制、写入去重 |

---

## 二、存储选型

### 向量数据库

| 方案 | 规模 | 优势 | 劣势 | 适合 |
|---|---|---|---|---|
| **pgvector** (PostgreSQL 扩展) | <10M 条 | 和元数据同库，一条 SQL 同时查向量+元数据，运维简单 | 大规模下性能不如专用向量库 | 中小规模、不想多维护一个数据库 |
| **FAISS** (Facebook) | 任意 | 最快，支持 HNSW/IVF/PQ 多种索引，内存+磁盘混合 | 需要额外部署，不存元数据 | 大规模、性能敏感 |
| **Chroma** | <1M 条 | 开箱即用，自带元数据过滤，Python/JS SDK | 分布式还不成熟 | 原型→生产的自然过渡 |
| **Milvus** | >100M 条 | 云原生、分布式、支持混合检索 | 重（需要 etcd + MinIO + Pulsar） | 企业级、超大规模 |

**推荐路径**：原型用 Chroma → 中等规模用 pgvector（和元数据一个库，少一个运维负担）→ 超大规模用 Milvus。

### 元数据表设计（PostgreSQL）

```sql
CREATE TABLE shared_knowledge (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_agent  VARCHAR(128) NOT NULL,       -- 来源 Agent
    content       TEXT NOT NULL,               -- 发现内容
    context       TEXT,                        -- 原始上下文
    confidence    REAL NOT NULL DEFAULT 0.5,   -- 0-1
    knowledge_type VARCHAR(16) NOT NULL        -- TRANSIENT/SITUATIONAL/DURABLE
                    CHECK (knowledge_type IN ('TRANSIENT','SITUATIONAL','DURABLE')),
    tags          TEXT[] DEFAULT '{}',         -- PostgreSQL 数组
    stale_since   TIMESTAMPTZ,                 -- NULL = 有效
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- 向量字段（如果用 pgvector）
    embedding     VECTOR(768)                  -- BGE-M3 维度
);

-- 按时间 + 类型过滤
CREATE INDEX idx_knowledge_type_time
    ON shared_knowledge(knowledge_type, created_at DESC)
    WHERE stale_since IS NULL;

-- 按来源 Agent 过滤
CREATE INDEX idx_knowledge_agent
    ON shared_knowledge(source_agent, created_at DESC);

-- 向量索引（pgvector）
CREATE INDEX idx_knowledge_embedding
    ON shared_knowledge
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
```

### 为什么向量和元数据最好放在一起

Demo 里的两步操作"先向量搜索拿 id → 再 Map 查元数据"在生产中如果分开存储（向量在 FAISS，元数据在 PostgreSQL），就是两次网络调用。pgvector 的好处是：**一条 SQL 同时完成向量搜索和元数据过滤**：

```sql
SELECT id, source_agent, content, confidence, knowledge_type, tags,
       created_at,
       1 - (embedding <=> query_vector) AS similarity  -- cosine distance → similarity
FROM shared_knowledge
WHERE stale_since IS NULL
  AND confidence > 0.6
  AND knowledge_type IN ('DURABLE', 'SITUATIONAL')
  AND source_agent != 'Query Writer'    -- exclude self
  -- 半衰期过滤
  AND created_at > CASE knowledge_type
        WHEN 'TRANSIENT'   THEN now() - INTERVAL '20 minutes'
        WHEN 'SITUATIONAL' THEN now() - INTERVAL '4 hours'
        WHEN 'DURABLE'     THEN now() - INTERVAL '28 days'
      END
ORDER BY embedding <=> query_vector  -- cosine distance
LIMIT 5;
```

**一条 SQL、一次网络往返。** 这是在 demo 的 `search()` 方法里把 `this.store.search()` + `this.knowledge.get()` 两个 Map 操作合并为一次数据库查询。

---

## 三、Shared Memory Service 的 API 设计

不是每个 Agent 自己连数据库——中间加一层 HTTP Service：

```
POST   /api/v1/knowledge         写入发现
GET    /api/v1/search            语义检索
POST   /api/v1/knowledge/:id/stale   手动标记过时
GET    /api/v1/knowledge?agent=X&type=DURABLE   列表查询
DELETE /api/v1/knowledge/:id     删除（只有源 Agent 或 admin 可以）
```

### 写入 API 的请求体

```json
{
  "source_agent": "code-generator-03",
  "content": "users 表 age 字段已废弃，应使用 birth_date",
  "context": "在编写 getAdultUsers 查询时发现",
  "confidence": 0.92,
  "knowledge_type": "DURABLE",
  "tags": ["database", "schema", "deprecation"]
}
```

Service 收到后：
1. 调 Embedding Service → 获得向量
2. 写入 PostgreSQL（元数据 + 向量）
3. 异步触发过期检测（搜相似旧知识 → 标记 stale）
4. 返回 201 Created

### 检索 API 的请求体

```json
{
  "query": "查询所有成年用户",
  "top_k": 3,
  "filters": {
    "min_confidence": 0.6,
    "exclude_agents": ["Query Writer"],
    "knowledge_types": ["DURABLE", "SITUATIONAL"],
    "exclude_stale": true
  }
}
```

Service 收到后：
1. 调 Embedding Service 把 query 变成向量
2. 执行 SQL（向量搜索 + 元数据过滤 + 半衰期过滤 → 见上节）
3. 应用时间衰减到分数
4. 返回 Top-K 结果

---

## 四、和 Demo 的关键行为差异

### 1. 并发写入冲突

**Demo**：单线程 JS，不担心并发。两个 Agent 同时 `store.add()` 总是先后执行。

**生产**：Agent A 和 Agent B 同时通过 HTTP 写入。需要处理：
- **同一条发现被两个 Agent 同时写入**：唯一约束或 INSERT ON CONFLICT
- **过期标记和检索的竞争**：新知识写入了但过期标记还没跑完 → 旧知识可能被某次检索返回。解法：写入时同步执行过期检测（在同一个事务里 `UPDATE ... SET stale_since = now() WHERE id IN (SELECT id FROM ... WHERE similarity > 0.6)`）

### 2. 一致的时效性判断

**Demo**：`Date.now() - k.timestamp`——用的是 Agent 所在机器的时钟。

**生产**：Agent A 在东京（UTC+9），Agent B 在伦敦（UTC+0），Service 在弗吉尼亚（UTC-5）。三个时钟互不可信。**改用数据库时间：** `created_at` 是数据库写入时自动生成的 `now()`，检索时用 `now() - created_at`——**所有时效性判断以数据库时钟为准**，避免时钟偏移导致同一知识在不同 Agent 视角下"寿命"不同。

### 3. 错误处理

**Demo**：`extract()` 失败 → 返回空数组 `[]`，静默跳过。

**生产**：需要区分三类失败：
- **Embedding Service 不可用** → 写入失败，是否需要降级到本地模型？是否需要重试队列？
- **数据库连接断开** → 写入失败，当前 Agent 任务是否还能继续？（答案：应该能——**Shared Memory 不应成为 Agent 执行的关键路径**）
- **检索超时** → 返回空结果，Agent 用无增强的默认 Prompt 执行（记忆共享是增强，不是前提）

---

## 五、拓展开销：什么时候值得加这层基础设施

| 条件 | 要不要上 Shared Memory Service |
|---|---|
| < 3 个 Agent、单进程 | 直接用 demo 方案（内存 Map）就够了 |
| 3-10 个 Agent、同机房 | Chroma / SQLite + 本地 Embedding 模型 |
| 10-50 个 Agent、跨服务 | pgvector + Shared Memory Service |
| > 50 个 Agent、跨区域 | Milvus + 独立 Embedding Service + Redis 缓存热数据 |

**核心判断标准**：Agent 间能通过"不通信"来避免多少重复的错误决策。如果一个 Agent 的错误因为另一个 Agent 不知道而被重复了 N 次，那 Shared Memory 就是值得的——因为它从根本上解决了"不知道你不知道"的问题。
