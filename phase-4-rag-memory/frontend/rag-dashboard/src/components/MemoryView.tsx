import { useState } from "react";

/**
 * 记忆状态面板 —— 三层记忆模型可视化
 * 工作记忆 | 短期记忆 | 长期记忆
 */

interface MemoryEntry {
  key: string;
  preview: string;
  type: "semantic" | "episodic" | "preference";
  timestamp: string;
  tokenSize: number;
}

const MOCK_WORKING_MEMORY = {
  messages: [
    { role: "system", content: "你是 Chance 的 AI 助手。用户偏好 TypeScript + React。", tokens: 18 },
    { role: "system", content: "[Memory] 已知相关信息：用户偏好 TypeScript + Zustand，项目在第 4 阶段", tokens: 24 },
    { role: "user", content: "帮我审查这段 TypeScript 代码", tokens: 12 },
    { role: "assistant", content: "好的，请发送代码。我会重点关注类型安全和性能。", tokens: 16 },
    { role: "user", content: "泛型约束 extends 关键词怎么用？", tokens: 10 },
  ],
  totalTokens: 80,
  maxTokens: 4000,
};

const MOCK_SHORT_TERM = {
  totalMessages: 24,
  summary:
    "用户请求审查 TypeScript 代码，助手表示将关注类型安全和性能。用户询问泛型约束 extends 的用法。对话中涉及 React 性能优化、代码审查规范等话题。用户偏好先理论后实践的学习方式。",
  hasSummary: true,
  summaryTokens: 52,
};

const MOCK_LONG_TERM: MemoryEntry[] = [
  {
    key: "user-pref-ts",
    preview: "技术栈偏好: TypeScript + React + Zustand",
    type: "preference",
    timestamp: "2026-06-23 11:30",
    tokenSize: 35,
  },
  {
    key: "user-pref-style",
    preview: "学习风格: 先理论后实践，每阶段更新 PLAN.md 和 TODO.md",
    type: "preference",
    timestamp: "2026-06-23 11:30",
    tokenSize: 48,
  },
  {
    key: "project-phase",
    preview: "项目进度: 阶段 4（Agent 记忆与 RAG），已完成 3 个阶段",
    type: "episodic",
    timestamp: "2026-06-23 11:31",
    tokenSize: 42,
  },
  {
    key: "mcp-design",
    preview: "MCP 理解: AI 世界的 USB 协议——Server 提供工具，Client 发现调用。Tool=动作，Resource=数据",
    type: "semantic",
    timestamp: "2026-06-23 11:31",
    tokenSize: 65,
  },
  {
    key: "phase3-test-results",
    preview: "Phase 3 测试: 21 用例中 3/5 通过（format 标签），CR-003 输出超长，CG-002 缺少 .tsx",
    type: "episodic",
    timestamp: "2026-06-23 15:50",
    tokenSize: 55,
  },
  {
    key: "rag-architecture",
    preview: "RAG 架构: Chunking→Embedding→检索→增强→生成。Small-to-Big 是推荐的生产策略。",
    type: "semantic",
    timestamp: "2026-06-23 16:00",
    tokenSize: 58,
  },
  {
    key: "embedding-model-choice",
    preview: "Embedding 选型: 中文场景首选 BGE-M3（开源免费），英文+生产用 text-embedding-3-small",
    type: "semantic",
    timestamp: "2026-06-23 16:05",
    tokenSize: 70,
  },
];

export default function MemoryView() {
  const [selectedMemory, setSelectedMemory] = useState<MemoryEntry | null>(null);
  const [filterType, setFilterType] = useState<"all" | "semantic" | "episodic" | "preference">("all");

  const filtered = MOCK_LONG_TERM.filter(
    (m) => filterType === "all" || m.type === filterType
  );

  const typeLabels: Record<string, string> = {
    semantic: "🧠 语义记忆",
    episodic: "📖 情节记忆",
    preference: "⭐ 偏好",
  };

  const wmUsage = MOCK_WORKING_MEMORY.totalTokens / MOCK_WORKING_MEMORY.maxTokens;

  return (
    <div>
      <h2 style={styles.sectionTitle}>🧠 三层记忆模型</h2>
      <p style={styles.sectionDesc}>
        工作记忆（Context）· 短期记忆（Session）· 长期记忆（VectorStore）
      </p>

      {/* Three Memory Cards */}
      <div style={styles.memoryGrid}>
        {/* Working Memory */}
        <div style={styles.memoryCard}>
          <div style={styles.memoryCardHeader}>
            <div style={styles.memoryIcon}>💭</div>
            <div>
              <div style={styles.memoryName}>工作记忆</div>
              <div style={styles.memorySubtitle}>Working Memory · 当前 Context</div>
            </div>
          </div>

          {/* Token Usage Gauge */}
          <div style={styles.gaugeSection}>
            <div style={styles.gaugeLabel}>
              Token 使用率: {MOCK_WORKING_MEMORY.totalTokens} / {MOCK_WORKING_MEMORY.maxTokens}
            </div>
            <div style={styles.gaugeBg}>
              <div
                style={{
                  ...styles.gaugeFill,
                  width: `${wmUsage * 100}%`,
                  background:
                    wmUsage > 0.7
                      ? "linear-gradient(90deg, #f97316, #ef4444)"
                      : "linear-gradient(90deg, #06b6d4, #10b981)",
                }}
              />
              <div style={{ ...styles.gaugeMarker, left: "70%" }}>
                <div style={styles.gaugeMarkerLabel}>70%</div>
              </div>
            </div>
          </div>

          {/* Message List */}
          <div style={styles.msgList}>
            {MOCK_WORKING_MEMORY.messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  ...styles.msgItem,
                  background:
                    msg.role === "system" ? "#0c1a2a" : msg.role === "user" ? "#1a1c2a" : "#0a1c1a",
                }}
              >
                <span style={styles.msgRole}>
                  {msg.role === "system" ? "⚙️" : msg.role === "user" ? "👤" : "🤖"}
                </span>
                <span style={styles.msgContent}>
                  {msg.content.slice(0, 60)}...
                </span>
                <span style={styles.msgTokens}>{msg.tokens}t</span>
              </div>
            ))}
          </div>
        </div>

        {/* Short-term Memory */}
        <div style={styles.memoryCard}>
          <div style={styles.memoryCardHeader}>
            <div style={styles.memoryIcon}>📝</div>
            <div>
              <div style={styles.memoryName}>短期记忆</div>
              <div style={styles.memorySubtitle}>Short-term Memory · 会话级</div>
            </div>
          </div>

          <div style={styles.statsInline}>
            <div style={styles.statItem}>
              <div style={styles.statNumber}>{MOCK_SHORT_TERM.totalMessages}</div>
              <div style={styles.statDesc}>条消息</div>
            </div>
            <div style={styles.statItem}>
              <div style={styles.statNumber}>
                {MOCK_SHORT_TERM.hasSummary ? "✅" : "❌"}
              </div>
              <div style={styles.statDesc}>已压缩</div>
            </div>
            <div style={styles.statItem}>
              <div style={styles.statNumber}>{MOCK_SHORT_TERM.summaryTokens}</div>
              <div style={styles.statDesc}>摘要 tokens</div>
            </div>
          </div>

          {/* Summary Preview */}
          {MOCK_SHORT_TERM.hasSummary && (
            <div style={styles.summaryBox}>
              <div style={styles.summaryHeader}>📋 LLM 压缩摘要</div>
              <div style={styles.summaryContent}>
                {MOCK_SHORT_TERM.summary}
              </div>
              <div style={styles.summaryMeta}>
                原始: ~{MOCK_SHORT_TERM.totalMessages * 15} tokens → 压缩后: {MOCK_SHORT_TERM.summaryTokens} tokens
                （压缩率 {(MOCK_SHORT_TERM.summaryTokens / (MOCK_SHORT_TERM.totalMessages * 15) * 100).toFixed(0)}%）
              </div>
            </div>
          )}

          <div style={styles.placeholderBox}>
            <div style={styles.placeholderTitle}>⚡ 压缩策略</div>
            <div style={styles.placeholderText}>
              超过 {MOCK_WORKING_MEMORY.maxTokens * 0.7} tokens 时自动触发摘要压缩。
              保留最近 4 条消息原文 + 旧消息 LLM 摘要 = 混合策略。
            </div>
          </div>
        </div>

        {/* Long-term Memory */}
        <div style={styles.memoryCard}>
          <div style={styles.memoryCardHeader}>
            <div style={styles.memoryIcon}>🗄️</div>
            <div>
              <div style={styles.memoryName}>长期记忆</div>
              <div style={styles.memorySubtitle}>Long-term Memory · 永久存储</div>
            </div>
          </div>

          {/* Type Filter */}
          <div style={styles.filterRow}>
            {(["all", "semantic", "episodic", "preference"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                style={{
                  ...styles.filterBtn,
                  ...(filterType === t ? styles.filterBtnActive : {}),
                }}
              >
                {t === "all" ? "全部" : typeLabels[t]}
              </button>
            ))}
          </div>

          {/* Memory List */}
          <div style={styles.ltmList}>
            {filtered.map((mem) => (
              <div
                key={mem.key}
                onClick={() =>
                  setSelectedMemory(
                    selectedMemory?.key === mem.key ? null : mem
                  )
                }
                style={{
                  ...styles.ltmItem,
                  ...(selectedMemory?.key === mem.key
                    ? styles.ltmItemSelected
                    : {}),
                }}
              >
                <div style={styles.ltmHeader}>
                  <span style={styles.ltmType}>
                    {typeLabels[mem.type] || mem.type}
                  </span>
                  <span style={styles.ltmTokens}>{mem.tokenSize} tokens</span>
                </div>
                <div style={styles.ltmContent}>{mem.preview}</div>
                <div style={styles.ltmMeta}>{mem.timestamp}</div>

                {selectedMemory?.key === mem.key && (
                  <div style={styles.ltmDetail}>
                    <div style={styles.ltmDetailTitle}>检索上下文</div>
                    <div style={styles.ltmDetailText}>
                      当用户问及相关问题时，这条记忆会被向量检索命中并注入 Context。
                      当前相似度阈值: 0.1，类型过滤: {filterType === "all" ? "无" : filterType}。
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
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
  memoryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 16,
    alignItems: "start",
  },
  memoryCard: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 12,
    padding: 20,
  },
  memoryCardHeader: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  memoryIcon: { fontSize: 28 },
  memoryName: { fontSize: 16, fontWeight: 700, color: "#f8fafc" },
  memorySubtitle: { fontSize: 11, color: "#64748b", marginTop: 2 },
  gaugeSection: { marginBottom: 16 },
  gaugeLabel: {
    fontSize: 11,
    color: "#64748b",
    marginBottom: 6,
  },
  gaugeBg: {
    height: 8,
    borderRadius: 4,
    background: "#1e293b",
    overflow: "hidden",
    position: "relative" as const,
  },
  gaugeFill: { height: "100%", borderRadius: 4, transition: "width 0.3s" },
  gaugeMarker: {
    position: "absolute" as const,
    top: -2,
    height: 12,
    width: 1,
    background: "#64748b",
  },
  gaugeMarkerLabel: {
    fontSize: 9,
    color: "#64748b",
    marginTop: -14,
    marginLeft: -10,
    whiteSpace: "nowrap" as const,
  },
  msgList: { display: "flex", flexDirection: "column" as const, gap: 4 },
  msgItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 8px",
    borderRadius: 6,
    fontSize: 11,
  },
  msgRole: { fontSize: 12, flexShrink: 0 },
  msgContent: { flex: 1, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  msgTokens: { fontSize: 10, color: "#475569", flexShrink: 0 },
  statsInline: {
    display: "flex",
    gap: 16,
    marginBottom: 16,
    justifyContent: "space-around" as const,
  },
  statItem: { textAlign: "center" as const },
  statNumber: {
    fontSize: 20,
    fontWeight: 700,
    color: "#f8fafc",
  },
  statDesc: { fontSize: 11, color: "#64748b", marginTop: 2 },
  summaryBox: {
    background: "#0b1120",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    border: "1px solid #1e293b",
  },
  summaryHeader: { fontSize: 12, fontWeight: 600, color: "#e2e8f0", marginBottom: 8 },
  summaryContent: {
    fontSize: 11,
    color: "#94a3b8",
    lineHeight: 1.6,
  },
  summaryMeta: {
    fontSize: 10,
    color: "#475569",
    marginTop: 8,
    paddingTop: 8,
    borderTop: "1px solid #1e293b",
  },
  placeholderBox: {
    background: "#0b1120",
    borderRadius: 8,
    padding: 12,
    border: "1px dashed #1e293b",
  },
  placeholderTitle: { fontSize: 12, fontWeight: 600, color: "#e2e8f0", marginBottom: 6 },
  placeholderText: { fontSize: 11, color: "#64748b", lineHeight: 1.5 },
  filterRow: { display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" as const },
  filterBtn: {
    padding: "4px 10px",
    borderRadius: 6,
    border: "1px solid #1e293b",
    background: "#0b1120",
    color: "#94a3b8",
    fontSize: 11,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  filterBtnActive: { borderColor: "#06b6d4", color: "#06b6d4", background: "#0c4a6e20" },
  ltmList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
    maxHeight: 400,
    overflowY: "auto" as const,
  },
  ltmItem: {
    padding: "10px",
    borderRadius: 8,
    background: "#0b1120",
    border: "1px solid #1e293b",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  ltmItemSelected: { borderColor: "#06b6d4", background: "#0c1a2a" },
  ltmHeader: { display: "flex", justifyContent: "space-between", marginBottom: 4 },
  ltmType: { fontSize: 10, color: "#06b6d4", fontWeight: 600 },
  ltmTokens: { fontSize: 10, color: "#475569" },
  ltmContent: { fontSize: 12, color: "#e2e8f0", lineHeight: 1.4 },
  ltmMeta: { fontSize: 10, color: "#475569", marginTop: 4 },
  ltmDetail: {
    marginTop: 10,
    padding: "10px",
    background: "#0f172a",
    borderRadius: 6,
    border: "1px solid #1e293b",
  },
  ltmDetailTitle: { fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 4 },
  ltmDetailText: { fontSize: 11, color: "#64748b", lineHeight: 1.5 },
};
