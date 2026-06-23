import { useState } from "react";

/**
 * 检索可视化 —— 展示 RAG 检索全过程的每一步：
 * 1. Query → Embedding
 * 2. 向量相似度搜索
 * 3. Chunk 相关性排名
 * 4. 增强后的 Prompt（喂给 LLM 的最后形态）
 */

// 模拟检索数据（真实场景从后端 API 获取）
const MOCK_QUERIES = [
  {
    query: "React Suspense 怎么使用？",
    embeddingDim: 1024,
    totalDocs: 1240,
    searchTimeMs: 3.2,
    chunks: [
      {
        id: "chunk-1042",
        docTitle: "React 18 Suspense 详解",
        content:
          "React 18 的 Suspense 组件允许在组件树中声明加载状态。配合 React.lazy() 实现代码分割...",
        score: 0.942,
        rerankScore: 0.971,
      },
      {
        id: "chunk-873",
        docTitle: "React 并发特性指南",
        content:
          "React 18 引入了并发渲染，Suspense 是其重要组成部分。使用 useTransition 标记非紧急更新...",
        score: 0.876,
        rerankScore: 0.893,
      },
      {
        id: "chunk-591",
        docTitle: "React 性能优化实战",
        content:
          "使用 React.memo 和 Suspense 可以显著提升用户体验。但不是所有组件都需要懒加载...",
        score: 0.801,
        rerankScore: 0.824,
      },
      {
        id: "chunk-1203",
        docTitle: "Vue 3 Suspense 介绍",
        content:
          "Vue 3 也引入了 Suspense 组件，用于管理异步依赖。与 React Suspense 设计思路类似...",
        score: 0.723,
        rerankScore: 0.645,
      },
      {
        id: "chunk-67",
        docTitle: "Web 性能指标 Core Web Vitals",
        content:
          "LCP (Largest Contentful Paint) 是核心 Web 指标之一。使用 Suspense 配合流式 SSR 可改善 LCP...",
        score: 0.689,
        rerankScore: 0.612,
      },
    ],
  },
  {
    query: "TypeScript 泛型约束 extends",
    embeddingDim: 1024,
    totalDocs: 1240,
    searchTimeMs: 2.8,
    chunks: [
      {
        id: "chunk-215",
        docTitle: "TypeScript 泛型深入",
        content:
          "泛型约束（Generic Constraints）使用 extends 关键字限制泛型参数的类型范围...",
        score: 0.961,
        rerankScore: 0.988,
      },
      {
        id: "chunk-440",
        docTitle: "TypeScript 条件类型",
        content:
          "条件类型 T extends string ? true : false 是 TypeScript 泛型的三支柱之一...",
        score: 0.894,
        rerankScore: 0.912,
      },
      {
        id: "chunk-128",
        docTitle: "TypeScript 入门到精通",
        content:
          "基础泛型：function identity<T>(arg: T): T。配合 extends 可以添加约束...",
        score: 0.832,
        rerankScore: 0.845,
      },
    ],
  },
];

export default function RetrievalView() {
  const [selectedQuery, setSelectedQuery] = useState(0);
  const [showRerank, setShowRerank] = useState(true);
  const [showPrompt, setShowPrompt] = useState(false);

  const data = MOCK_QUERIES[selectedQuery];

  return (
    <div>
      <h2 style={styles.sectionTitle}>🔍 RAG 检索过程可视化</h2>
      <p style={styles.sectionDesc}>
        展示从用户问题到最终增强 Prompt 的完整检索链路
      </p>

      {/* Query Selector */}
      <div style={styles.querySelector}>
        {MOCK_QUERIES.map((q, i) => (
          <button
            key={i}
            onClick={() => setSelectedQuery(i)}
            style={{
              ...styles.queryBtn,
              ...(selectedQuery === i ? styles.queryBtnActive : {}),
            }}
          >
            {q.query}
          </button>
        ))}
      </div>

      <div style={styles.grid}>
        {/* Left: Pipeline Steps */}
        <div style={styles.pipeline}>
          <div style={styles.pipelineHeader}>检索 Pipeline</div>

          {/* Step 1: Query Embedding */}
          <div style={styles.step}>
            <div style={styles.stepMarker}>1</div>
            <div style={styles.stepContent}>
              <div style={styles.stepTitle}>Query → Embedding</div>
              <div style={styles.stepMeta}>
                维度: {data.embeddingDim}D · 耗时:{" "}
                {(data.searchTimeMs * 0.3).toFixed(1)}ms
              </div>
              <div style={styles.vectorBar}>
                <div
                  style={{
                    ...styles.vectorFill,
                    width: "100%",
                    background: "linear-gradient(90deg, #06b6d4, #8b5cf6)",
                  }}
                />
              </div>
              <div style={styles.vectorLabel}>
                Embedding 向量: [{Array(6).fill("±0.xx").join(", ")}, ...]
              </div>
            </div>
          </div>

          <div style={styles.connector}>
            <div style={styles.connectorLine} />
            <div style={styles.connectorArrow}>▼</div>
          </div>

          {/* Step 2: Vector Search */}
          <div style={styles.step}>
            <div style={styles.stepMarker}>2</div>
            <div style={styles.stepContent}>
              <div style={styles.stepTitle}>向量相似度搜索</div>
              <div style={styles.stepMeta}>
                搜索范围: {data.totalDocs.toLocaleString()} 篇文档 · 耗时:{" "}
                {data.searchTimeMs}ms · Top-5
              </div>
              <div style={styles.searchVisual}>
                {data.chunks.map((c, i) => (
                  <div key={c.id} style={styles.docIcon}>
                    <div
                      style={{
                        ...styles.docDot,
                        opacity: 1 - i * 0.15,
                        background:
                          c.score > 0.9
                            ? "#10b981"
                            : c.score > 0.8
                              ? "#f59e0b"
                              : "#ef4444",
                      }}
                    />
                    {i === 0 && (
                      <div style={styles.docHighlight}>
                        <div style={styles.ring} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={styles.connector}>
            <div style={styles.connectorLine} />
            <div style={styles.connectorArrow}>▼</div>
          </div>

          {/* Step 3: Rerank (optional) */}
          <div
            style={{
              ...styles.step,
              opacity: showRerank ? 1 : 0.4,
            }}
          >
            <div style={styles.stepMarker}>3</div>
            <div style={styles.stepContent}>
              <div style={styles.stepTitle}>
                Re-rank{" "}
                <span style={styles.badge}>
                  {showRerank ? "启用" : "禁用"}
                </span>
              </div>
              <div style={styles.stepMeta}>
                Cross-encoder 重排序 · Top-5 → Top-3
              </div>
            </div>
          </div>

          <div style={styles.connector}>
            <div style={styles.connectorLine} />
            <div style={styles.connectorArrow}>▼</div>
          </div>

          {/* Step 4: Augment Prompt */}
          <div style={styles.step}>
            <div style={styles.stepMarker}>4</div>
            <div style={styles.stepContent}>
              <div style={styles.stepTitle}>增强 Prompt → LLM</div>
              <div style={styles.stepMeta}>
                把 Top-3 chunks 拼接 System Prompt + 用户问题
              </div>
            </div>
          </div>
        </div>

        {/* Right: Chunk Scores */}
        <div style={styles.chunkPanel}>
          {/* Toggle */}
          <div style={styles.toggleRow}>
            <label style={styles.toggle}>
              <input
                type="checkbox"
                checked={showRerank}
                onChange={(e) => setShowRerank(e.target.checked)}
              />
              <span>显示 Re-rank 分数</span>
            </label>
            <label style={styles.toggle}>
              <input
                type="checkbox"
                checked={showPrompt}
                onChange={(e) => setShowPrompt(e.target.checked)}
              />
              <span>显示增强 Prompt</span>
            </label>
          </div>

          {/* Score Bars */}
          <div style={styles.chunkList}>
            {data.chunks.map((chunk, i) => {
              const displayScore = showRerank
                ? chunk.rerankScore
                : chunk.score;
              const delta = chunk.rerankScore - chunk.score;

              return (
                <div
                  key={chunk.id}
                  style={{
                    ...styles.chunkItem,
                    ...(i === 0 ? styles.chunkItemTop : {}),
                  }}
                >
                  <div style={styles.chunkHeader}>
                    <span style={styles.chunkRank}>#{i + 1}</span>
                    <span style={styles.chunkTitle}>{chunk.docTitle}</span>
                    <span style={styles.chunkId}>{chunk.id}</span>
                  </div>

                  <div style={styles.scoreRow}>
                    <div style={styles.scoreBarBg}>
                      <div
                        style={{
                          ...styles.scoreBarFill,
                          width: `${displayScore * 100}%`,
                          background:
                            displayScore > 0.9
                              ? "linear-gradient(90deg, #10b981, #34d399)"
                              : displayScore > 0.8
                                ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
                                : displayScore > 0.7
                                  ? "linear-gradient(90deg, #f97316, #fb923c)"
                                  : "linear-gradient(90deg, #ef4444, #f87171)",
                        }}
                      />
                    </div>
                    <span style={styles.scoreText}>
                      {(displayScore * 100).toFixed(1)}%
                      {showRerank && delta !== 0 && (
                        <span
                          style={{
                            ...styles.delta,
                            color: delta > 0 ? "#10b981" : "#ef4444",
                          }}
                        >
                          {" "}
                          ({delta > 0 ? "+" : ""}
                          {(delta * 100).toFixed(1)}%)
                        </span>
                      )}
                    </span>
                  </div>

                  <div style={styles.chunkContent}>
                    {chunk.content.slice(0, 120)}...
                  </div>

                  {i === 0 && data.chunks.length > 1 && (
                    <div style={styles.scoreGap}>
                      ← 与下一名差距:{" "}
                      {(
                        displayScore - (data.chunks[1]?.rerankScore ?? 0)
                      ).toFixed(3)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Augmented Prompt Preview */}
          {showPrompt && (
            <div style={styles.promptPreview}>
              <div style={styles.promptPreviewHeader}>
                📋 增强后的 Prompt（发送给 LLM）
              </div>
              <pre style={styles.promptContent}>
                {`[System] 你是一个基于文档的问答助手。只基于提供的文档回答。

[来源1] (相关度: ${data.chunks[0]?.rerankScore?.toFixed(2) ?? data.chunks[0]?.score.toFixed(2)})
${data.chunks[0]?.content}

[来源2] (相关度: ${data.chunks[1]?.rerankScore?.toFixed(2) ?? data.chunks[1]?.score.toFixed(2)})
${data.chunks[1]?.content}

[来源3] (相关度: ${data.chunks[2]?.rerankScore?.toFixed(2) ?? data.chunks[2]?.score.toFixed(2)})
${data.chunks[2]?.content}

[User] ${data.query}`}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== Styles =====

const styles: Record<string, React.CSSProperties> = {
  sectionTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "#f8fafc",
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 24,
  },
  querySelector: {
    display: "flex",
    gap: 8,
    marginBottom: 24,
    flexWrap: "wrap" as const,
  },
  queryBtn: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid #1e293b",
    background: "#0f172a",
    color: "#94a3b8",
    fontSize: 13,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  queryBtnActive: {
    borderColor: "#06b6d4",
    color: "#06b6d4",
    background: "#0c4a6e20",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "320px 1fr",
    gap: 24,
    alignItems: "start",
  },
  pipeline: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 12,
    padding: 20,
  },
  pipelineHeader: {
    fontSize: 14,
    fontWeight: 700,
    color: "#06b6d4",
    marginBottom: 16,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  step: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    padding: "12px",
    borderRadius: 8,
    background: "#0b1120",
    border: "1px solid #1e293b",
    transition: "all 0.2s",
  },
  stepMarker: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #06b6d4, #8b5cf6)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "#e2e8f0",
  },
  stepMeta: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  badge: {
    fontSize: 10,
    padding: "1px 6px",
    borderRadius: 4,
    background: "#0c4a6e",
    color: "#06b6d4",
    fontWeight: 600,
  },
  vectorBar: {
    height: 4,
    borderRadius: 2,
    background: "#1e293b",
    marginTop: 6,
    overflow: "hidden",
  },
  vectorFill: {
    height: "100%",
    borderRadius: 2,
  },
  vectorLabel: {
    fontSize: 10,
    color: "#475569",
    marginTop: 4,
    fontFamily: "monospace",
  },
  connector: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    padding: "4px 0",
  },
  connectorLine: {
    width: 1,
    height: 12,
    background: "#334155",
  },
  connectorArrow: {
    fontSize: 10,
    color: "#475569",
  },
  searchVisual: {
    display: "flex",
    gap: 12,
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  docIcon: {
    position: "relative" as const,
    width: 32,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  docDot: {
    width: 16,
    height: 16,
    borderRadius: "50%",
    transition: "all 0.3s",
  },
  docHighlight: {
    position: "absolute" as const,
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: "2px solid #06b6d4",
    animation: "pulse 2s infinite",
  },
  chunkPanel: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 12,
    padding: 20,
  },
  toggleRow: {
    display: "flex",
    gap: 16,
    marginBottom: 20,
  },
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "#94a3b8",
    cursor: "pointer",
  },
  chunkList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 12,
  },
  chunkItem: {
    padding: "14px",
    borderRadius: 8,
    background: "#0b1120",
    border: "1px solid #1e293b",
    transition: "all 0.2s",
  },
  chunkItemTop: {
    borderColor: "#334155",
    background: "#0c1a2a",
  },
  chunkHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  chunkRank: {
    fontSize: 12,
    fontWeight: 700,
    color: "#06b6d4",
  },
  chunkTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "#e2e8f0",
    flex: 1,
  },
  chunkId: {
    fontSize: 10,
    color: "#475569",
    fontFamily: "monospace",
  },
  scoreRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  scoreBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    background: "#1e293b",
    overflow: "hidden",
  },
  scoreBarFill: {
    height: "100%",
    borderRadius: 3,
    transition: "width 0.5s ease",
  },
  scoreText: {
    fontSize: 13,
    fontWeight: 600,
    color: "#e2e8f0",
    minWidth: 60,
    textAlign: "right" as const,
  },
  delta: {
    fontSize: 11,
  },
  chunkContent: {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 1.5,
  },
  scoreGap: {
    fontSize: 10,
    color: "#475569",
    marginTop: 6,
    fontStyle: "italic",
  },
  promptPreview: {
    marginTop: 24,
    borderRadius: 8,
    border: "1px solid #334155",
    overflow: "hidden",
  },
  promptPreviewHeader: {
    padding: "10px 14px",
    fontSize: 12,
    fontWeight: 600,
    color: "#94a3b8",
    background: "#1e293b",
  },
  promptContent: {
    padding: "14px",
    fontSize: 11,
    fontFamily: "SF Mono, Monaco, monospace",
    color: "#94a3b8",
    lineHeight: 1.6,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    maxHeight: 300,
    overflow: "auto",
    margin: 0,
    background: "#0b1120",
  },
};
