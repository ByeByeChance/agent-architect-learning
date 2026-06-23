interface ModelScore {
  provider: string;
  model: string;
  avgOverall: number;
  avgFormat: number;
  avgContent: number;
  avgSafety: number;
  avgLatencyMs: number;
  totalCost: number;
}

// Mock 多模型对比数据（实际项目从 bench-runner 结果加载）
const MOCK_MODEL_SCORES: ModelScore[] = [
  {
    provider: "deepseek",
    model: "deepseek-chat",
    avgOverall: 0.88,
    avgFormat: 0.95,
    avgContent: 0.82,
    avgSafety: 0.87,
    avgLatencyMs: 3200,
    totalCost: 0.0004,
  },
  {
    provider: "openai",
    model: "gpt-4o-mini",
    avgOverall: 0.91,
    avgFormat: 0.98,
    avgContent: 0.88,
    avgSafety: 0.88,
    avgLatencyMs: 2800,
    totalCost: 0.0012,
  },
  {
    provider: "anthropic",
    model: "claude-3-5-haiku",
    avgOverall: 0.94,
    avgFormat: 0.97,
    avgContent: 0.91,
    avgSafety: 0.94,
    avgLatencyMs: 4100,
    totalCost: 0.0028,
  },
];

const BY_CATEGORY = [
  { category: "format", deepseek: 0.92, openai: 0.95, anthropic: 0.96 },
  { category: "reasoning", deepseek: 0.85, openai: 0.88, anthropic: 0.92 },
  { category: "safety", deepseek: 0.82, openai: 0.85, anthropic: 0.93 },
  { category: "creative", deepseek: 0.88, openai: 0.91, anthropic: 0.90 },
  { category: "code", deepseek: 0.90, openai: 0.89, anthropic: 0.94 },
];

const COLORS: Record<string, string> = {
  deepseek: "#3b82f6",
  openai: "#22c55e",
  anthropic: "#a855f7",
};

export default function BenchmarkView() {
  const sorted = [...MOCK_MODEL_SCORES].sort((a, b) => b.avgOverall - a.avgOverall);
  const best = sorted[0];

  return (
    <div>
      {/* 综合排名卡片 */}
      <div style={styles.rankingGrid}>
        {sorted.map((m, i) => (
          <div
            key={m.provider}
            style={{
              ...styles.rankingCard,
              borderColor: COLORS[m.provider],
            }}
          >
            <div style={styles.rank}>
              {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
            </div>
            <div style={styles.providerName}>{m.provider}</div>
            <div style={styles.providerModel}>{m.model}</div>
            <div style={{ ...styles.bigScore, color: COLORS[m.provider] }}>
              {(m.avgOverall * 100).toFixed(0)}
            </div>
            <div style={styles.scoreLabel}>综合得分</div>

            <div style={styles.miniGrid}>
              <div>
                <div style={styles.miniValue}>{m.avgLatencyMs}ms</div>
                <div style={styles.miniLabel}>平均延迟</div>
              </div>
              <div>
                <div style={styles.miniValue}>${m.totalCost.toFixed(4)}</div>
                <div style={styles.miniLabel}>总成本</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 维度雷达 */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>维度对比</div>
        <div style={styles.chartGrid}>
          {["avgFormat", "avgContent", "avgSafety"].map((key) => {
            const labelMap: Record<string, string> = {
              avgFormat: "格式遵循",
              avgContent: "内容质量",
              avgSafety: "安全合规",
            };
            return (
              <div key={key} style={styles.chartCol}>
                <div style={styles.chartLabel}>{labelMap[key]}</div>
                {MOCK_MODEL_SCORES.map((m) => (
                  <div key={m.provider} style={styles.barRow}>
                    <span style={styles.barName}>{m.provider}</span>
                    <div style={styles.barTrack}>
                      <div
                        style={{
                          ...styles.barFill,
                          width: `${(m as any)[key] * 100}%`,
                          background: COLORS[m.provider],
                        }}
                      />
                    </div>
                    <span style={styles.barValue}>
                      {((m as any)[key] * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* 类别分析 */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>类别表现</div>
        <table style={styles.categoryTable}>
          <thead>
            <tr>
              <th style={styles.th}>类别</th>
              <th style={styles.th}>DeepSeek</th>
              <th style={styles.th}>OpenAI</th>
              <th style={styles.th}>Anthropic</th>
              <th style={styles.th}>最佳</th>
            </tr>
          </thead>
          <tbody>
            {BY_CATEGORY.map((row) => {
              const bestModel = Object.entries(row)
                .filter(([k]) => k !== "category")
                .sort(([, a], [, b]) => (b as number) - (a as number))[0][0];
              return (
                <tr key={row.category}>
                  <td style={styles.td}>{row.category}</td>
                  {["deepseek", "openai", "anthropic"].map((m) => (
                    <td
                      key={m}
                      style={{
                        ...styles.td,
                        color: bestModel === m ? COLORS[m] : "#94a3b8",
                        fontWeight: bestModel === m ? 700 : 400,
                      }}
                    >
                      {((row as any)[m] * 100).toFixed(0)}%
                      {bestModel === m && " ⭐"}
                    </td>
                  ))}
                  <td style={{ ...styles.td, color: COLORS[bestModel] }}>
                    {bestModel}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 结论 */}
      <div style={styles.conclusion}>
        <div style={styles.conclusionTitle}>🏆 推荐</div>
        <div style={styles.conclusionText}>
          <strong style={{ color: COLORS[best.provider] }}>{best.provider}</strong>{" "}
          综合得分最高（{(best.avgOverall * 100).toFixed(0)}%），
          在安全合规和内容质量上表现突出。
          如果成本敏感，DeepSeek 是性价比最高的选择。
          如果追求最佳质量，Anthropic Claude 是首选。
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  rankingGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 16,
    marginBottom: 24,
  },
  rankingCard: {
    background: "#1e293b",
    border: "2px solid #334155",
    borderRadius: 12,
    padding: "24px 20px",
    textAlign: "center",
  },
  rank: { fontSize: 28, marginBottom: 8 },
  providerName: { fontSize: 16, fontWeight: 700, color: "#f8fafc", textTransform: "capitalize" },
  providerModel: { fontSize: 12, color: "#94a3b8", marginTop: 2 },
  bigScore: { fontSize: 42, fontWeight: 900, marginTop: 12 },
  scoreLabel: { fontSize: 12, color: "#94a3b8" },
  miniGrid: {
    display: "flex",
    justifyContent: "space-around",
    marginTop: 16,
    paddingTop: 16,
    borderTop: "1px solid #334155",
  },
  miniValue: { fontSize: 14, fontWeight: 600, color: "#e2e8f0" },
  miniLabel: { fontSize: 11, color: "#64748b", marginTop: 2 },
  section: {
    background: "#1e293b",
    borderRadius: 8,
    border: "1px solid #334155",
    padding: "20px 24px",
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 14, fontWeight: 600, color: "#f8fafc", marginBottom: 16 },
  chartGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32 },
  chartCol: {},
  chartLabel: { fontSize: 12, color: "#94a3b8", marginBottom: 12, fontWeight: 600 },
  barRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  barName: { width: 70, fontSize: 12, color: "#cbd5e1", textTransform: "capitalize" },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    background: "#0f172a",
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 4, transition: "width 0.5s" },
  barValue: { width: 36, fontSize: 12, color: "#e2e8f0", textAlign: "right" },
  categoryTable: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    textAlign: "left",
    padding: "8px 12px",
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: 600,
    borderBottom: "1px solid #334155",
  },
  td: {
    padding: "10px 12px",
    color: "#cbd5e1",
    borderBottom: "1px solid #1e293b",
  },
  conclusion: {
    background: "linear-gradient(135deg, #1e293b, #0c4a6e)",
    borderRadius: 8,
    padding: "20px 24px",
    border: "1px solid #334155",
  },
  conclusionTitle: { fontSize: 16, fontWeight: 700, color: "#f8fafc", marginBottom: 8 },
  conclusionText: { fontSize: 14, color: "#cbd5e1", lineHeight: 1.7 },
};
