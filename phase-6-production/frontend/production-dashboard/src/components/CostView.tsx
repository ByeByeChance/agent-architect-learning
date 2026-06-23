export default function CostView() {
  return (
    <div style={css.wrapper}>
      {/* Stat Cards */}
      <div style={css.cardGrid}>
        <StatCard label="今日总成本" value="$18.42" trend="+12%" trendUp color="#06b6d4" />
        <StatCard label="平均成本/调用" value="$0.092" trend="-3%" trendUp={false} color="#10b981" />
        <StatCard label="Cache Hit Rate" value="47.2%" trend="+8%" trendUp color="#8b5cf6" />
        <StatCard label="月度预算剩余" value="$7,153" trend="71.5%" trendUp={false} color="#f59e0b" />
      </div>

      {/* Budget Gauge */}
      <section style={css.section}>
        <h3 style={css.sectionTitle}>📊 月度预算仪表盘</h3>
        <div style={css.panel}>
          <div style={css.gaugeRow}>
            <span style={css.gaugeLabel}>$2,847</span>
            <div style={css.gaugeBar}>
              <div style={{ ...css.gaugeFill, width: "28.5%" }} />
              <div style={{ ...css.gaugeMarker, left: "80%" }} title="软限制 80%" />
            </div>
            <span style={css.gaugeLabel}>$10,000</span>
          </div>
          <div style={css.gaugeZones}>
            <span style={{ color: "#10b981", fontSize: 11 }}>● 安全 (0-70%)</span>
            <span style={{ color: "#f59e0b", fontSize: 11 }}>● 警告 (70-90%)</span>
            <span style={{ color: "#ef4444", fontSize: 11 }}>● 危险 (90-100%)</span>
          </div>
          <p style={css.gaugeNote}>软限制: $8,000 (80%) | 日均预算: $333 | 今日已用: $18.42</p>
        </div>
      </section>

      {/* Cost by Agent */}
      <section style={css.section}>
        <h3 style={css.sectionTitle}>🤖 按 Agent 成本分布</h3>
        <div style={css.panel}>
          {AGENT_COSTS.map((agent) => (
            <div key={agent.name} style={css.barRow}>
              <span style={css.barLabel}>{agent.name}</span>
              <div style={css.barTrack}>
                <div
                  style={{
                    ...css.barFill,
                    width: `${(agent.cost / 0.45) * 100}%`,
                    background: agent.model === "gpt-4o" ? "#06b6d4" : agent.model === "claude-3.5-sonnet" ? "#f59e0b" : "#3b82f6",
                  }}
                />
              </div>
              <span style={css.barValue}>${agent.cost.toFixed(3)}</span>
              <span style={css.barModel}>{agent.model}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Token Timeline */}
      <section style={css.section}>
        <h3 style={css.sectionTitle}>📈 Token 使用时间线 (最近 10 次调用)</h3>
        <div style={{ ...css.panel, overflowX: "auto" }}>
          <table style={css.table}>
            <thead>
              <tr>
                <th style={css.th}>时间</th>
                <th style={css.th}>Agent</th>
                <th style={css.th}>模型</th>
                <th style={css.th}>Prompt</th>
                <th style={css.th}>Compl.</th>
                <th style={css.th}>Cache</th>
                <th style={css.th}>成本</th>
              </tr>
            </thead>
            <tbody>
              {TOKEN_TIMELINE.map((row, i) => (
                <tr key={i} style={{ ...css.tr, background: row.cacheHit > 0 ? "rgba(16,185,129,0.06)" : "transparent" }}>
                  <td style={css.td}>{row.time}</td>
                  <td style={css.td}>{row.agent}</td>
                  <td style={css.td}>{row.model}</td>
                  <td style={css.td}>{row.prompt.toLocaleString()}</td>
                  <td style={css.td}>{row.completion.toLocaleString()}</td>
                  <td style={{ ...css.td, color: row.cacheHit > 0 ? "#10b981" : "#64748b" }}>{row.cacheHit > 0 ? `🔥 ${row.cacheHit.toLocaleString()}` : "—"}</td>
                  <td style={{ ...css.td, fontWeight: 600 }}>${row.cost.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Cost-per-Outcome */}
      <section style={css.section}>
        <h3 style={css.sectionTitle}>🎯 Cost-Per-Outcome 产出分析</h3>
        <div style={css.panel}>
          {OUTCOMES.map((o) => (
            <div key={o.type} style={css.outcomeRow}>
              <span style={css.outcomeType}>{o.type}</span>
              <div style={css.outcomeBarTrack}>
                <div style={{ ...css.outcomeBarFill, width: `${(o.costPerUnit / 0.5) * 100}%` }} />
              </div>
              <span style={css.outcomeCost}>${o.costPerUnit.toFixed(2)} / 次</span>
              <span style={css.outcomeCount}>{o.count} 次</span>
            </div>
          ))}
          <div style={css.outcomeSummary}>
            <span>📊 每次成功产出平均成本: <strong>$0.091</strong></span>
            <span>📊 成功率: <strong>83.3%</strong> (5/6)</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, trend, trendUp, color }: {
  label: string; value: string; trend: string; trendUp?: boolean; color: string;
}) {
  return (
    <div style={{ ...css.card, borderTop: `3px solid ${color}` }}>
      <div style={css.cardLabel}>{label}</div>
      <div style={css.cardValue}>{value}</div>
      <div style={{ ...css.cardTrend, color: trendUp ? "#ef4444" : "#10b981" }}>
        {trendUp ? "↑" : "↓"} {trend}
      </div>
    </div>
  );
}

// Mock Data
const AGENT_COSTS = [
  { name: "Orchestrator", cost: 0.035, model: "gpt-4o" },
  { name: "Code Generator", cost: 0.240, model: "claude-3.5-sonnet" },
  { name: "Code Reviewer", cost: 0.086, model: "claude-3.5-sonnet" },
  { name: "Test Writer", cost: 0.072, model: "gpt-4o" },
  { name: "Synthesizer", cost: 0.022, model: "deepseek-v3" },
];

const TOKEN_TIMELINE = [
  { time: "14:32:01", agent: "Code Gen", model: "claude-3.5-sonnet", prompt: 35000, completion: 8000, cacheHit: 25000, cost: 0.142 },
  { time: "14:31:45", agent: "Orchestrator", model: "gpt-4o", prompt: 8000, completion: 3000, cacheHit: 0, cost: 0.035 },
  { time: "14:30:12", agent: "Code Review", model: "claude-3.5-sonnet", prompt: 22000, completion: 5000, cacheHit: 15000, cost: 0.086 },
  { time: "14:29:33", agent: "Test Writer", model: "gpt-4o", prompt: 18000, completion: 6000, cacheHit: 0, cost: 0.072 },
  { time: "14:28:01", agent: "Code Gen", model: "claude-3.5-sonnet", prompt: 28000, completion: 7000, cacheHit: 20000, cost: 0.098 },
  { time: "14:27:15", agent: "Orchestrator", model: "gpt-4o", prompt: 7500, completion: 2800, cacheHit: 0, cost: 0.033 },
  { time: "14:26:42", agent: "Synthesizer", model: "deepseek-v3", prompt: 5000, completion: 2000, cacheHit: 0, cost: 0.004 },
  { time: "14:25:10", agent: "Code Review", model: "claude-3.5-sonnet", prompt: 20000, completion: 4500, cacheHit: 12000, cost: 0.078 },
  { time: "14:24:33", agent: "Test Writer", model: "gpt-4o", prompt: 16000, completion: 5500, cacheHit: 0, cost: 0.065 },
  { time: "14:23:01", agent: "Code Gen", model: "claude-3.5-sonnet", prompt: 32000, completion: 7500, cacheHit: 22000, cost: 0.125 },
];

const OUTCOMES = [
  { type: "📝 代码生成", count: 2, costPerUnit: 0.076 },
  { type: "🔍 代码审查", count: 2, costPerUnit: 0.076 },
  { type: "🧪 测试生成", count: 1, costPerUnit: 0.076 },
  { type: "📊 结果合成", count: 1, costPerUnit: 0.076 },
];

const css: Record<string, React.CSSProperties> = {
  wrapper: { display: "flex", flexDirection: "column", gap: 24 },
  cardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 },
  card: {
    background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10,
    padding: "16px 20px", display: "flex", flexDirection: "column", gap: 6,
  },
  cardLabel: { fontSize: 12, color: "#64748b", fontWeight: 500 },
  cardValue: { fontSize: 26, fontWeight: 700, color: "#f1f5f9" },
  cardTrend: { fontSize: 12, fontWeight: 500 },
  section: { display: "flex", flexDirection: "column", gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: 600, color: "#e2e8f0" },
  panel: {
    background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10,
    padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12,
  },
  gaugeRow: { display: "flex", alignItems: "center", gap: 12 },
  gaugeLabel: { fontSize: 14, fontWeight: 700, color: "#e2e8f0", minWidth: 70 },
  gaugeBar: {
    flex: 1, height: 24, background: "#1e293b", borderRadius: 12,
    position: "relative", overflow: "hidden",
  },
  gaugeFill: {
    height: "100%", borderRadius: 12,
    background: "linear-gradient(90deg, #10b981 0%, #f59e0b 70%, #ef4444 100%)",
    transition: "width 0.5s ease",
  },
  gaugeMarker: {
    position: "absolute", top: 0, width: 2, height: "100%",
    background: "#f1f5f9", opacity: 0.6,
  },
  gaugeZones: { display: "flex", gap: 16, justifyContent: "center" },
  gaugeNote: { fontSize: 11, color: "#64748b", textAlign: "center" },
  barRow: { display: "flex", alignItems: "center", gap: 12 },
  barLabel: { fontSize: 12, color: "#94a3b8", minWidth: 120, fontWeight: 500 },
  barTrack: { flex: 1, height: 18, background: "#1e293b", borderRadius: 9, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 9, transition: "width 0.5s ease", minWidth: 2 },
  barValue: { fontSize: 13, fontWeight: 700, color: "#e2e8f0", minWidth: 70 },
  barModel: { fontSize: 11, color: "#64748b", minWidth: 120 },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "8px 12px", fontSize: 11, color: "#64748b", fontWeight: 600, borderBottom: "1px solid #1e293b", textTransform: "uppercase" as const },
  td: { padding: "8px 12px", fontSize: 12, color: "#94a3b8", borderBottom: "1px solid #1e293b" },
  tr: {},
  outcomeRow: { display: "flex", alignItems: "center", gap: 12 },
  outcomeType: { fontSize: 13, color: "#e2e8f0", minWidth: 140, fontWeight: 500 },
  outcomeBarTrack: { flex: 1, height: 16, background: "#1e293b", borderRadius: 8, overflow: "hidden" },
  outcomeBarFill: { height: "100%", borderRadius: 8, background: "#8b5cf6" },
  outcomeCost: { fontSize: 13, fontWeight: 600, color: "#8b5cf6", minWidth: 90 },
  outcomeCount: { fontSize: 12, color: "#64748b", minWidth: 50 },
  outcomeSummary: {
    display: "flex", gap: 24, marginTop: 8, paddingTop: 12,
    borderTop: "1px solid #1e293b", fontSize: 13, color: "#94a3b8",
  },
};
