const HITL_HISTORY = [
  { id: "hitl-001", agent: "deployment-agent", action: "删除 /tmp/build 旧文件", severity: "CRITICAL", result: "TIMEOUT → REJECTED" },
  { id: "hitl-002", agent: "db-admin", action: "DROP TABLE old_analytics", severity: "CRITICAL", result: "TIMEOUT → REJECTED" },
  { id: "hitl-003", agent: "config-editor", action: "修改 .env 配置", severity: "WARNING", result: "USER APPROVED" },
  { id: "hitl-004", agent: "code-generator", action: "生成工具函数", severity: "INFO", result: "AUTO APPROVED" },
];

const BUDGET = [
  { id: "orchestrator", allocated: 30000, used: 8000 },
  { id: "code-gen", allocated: 50000, used: 35000 },
  { id: "code-review", allocated: 50000, used: 22000 },
  { id: "test-writer", allocated: 41666, used: 18000 },
  { id: "synthesizer", allocated: 20000, used: 5000 },
];

export default function HITLView() {
  return (
    <div>
      <h2 style={s.sectionTitle}>🛡️ HITL 审批 & 上下文预算</h2>
      <p style={s.sectionDesc}>Human-in-the-Loop 审批记录 + Context Budget 仪表盘</p>

      <div style={s.grid}>
        {/* HITL History */}
        <div style={s.panel}>
          <div style={s.panelTitle}>审批记录</div>
          <table style={s.table}>
            <thead><tr>
              <th style={s.th}>Agent</th><th style={s.th}>操作</th><th style={s.th}>风险</th><th style={s.th}>结果</th>
            </tr></thead>
            <tbody>
              {HITL_HISTORY.map((h) => (
                <tr key={h.id} style={s.tr}>
                  <td style={s.td}>{h.agent}</td>
                  <td style={s.td}>{h.action}</td>
                  <td style={s.td}>
                    <span style={{
                      ...s.sevBadge,
                      background: h.severity === "CRITICAL" ? "#7f1d1d" : h.severity === "WARNING" ? "#78350f" : "#064e3b",
                      color: h.severity === "CRITICAL" ? "#fca5a5" : h.severity === "WARNING" ? "#fcd34d" : "#6ee7b7",
                    }}>{h.severity}</span>
                  </td>
                  <td style={s.td}>{h.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={s.insight}>
            🛡️ CRITICAL 操作默认超时拒绝，WARNING 需用户确认，INFO 自动通过
          </div>
        </div>

        {/* Budget Dashboard */}
        <div style={s.panel}>
          <div style={s.panelTitle}>Context Budget 仪表盘</div>
          <div style={s.budgetTotal}>
            <div style={s.budgetNumber}>88K</div>
            <div style={s.budgetLabel}>已使用 / 200K tokens</div>
            <div style={s.budgetPercent}>44%</div>
          </div>

          {BUDGET.map((b) => {
            const pct = Math.round((b.used / b.allocated) * 100);
            const color = pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#10b981";
            return (
              <div key={b.id} style={s.budgetRow}>
                <div style={s.budgetHeader}>
                  <span>{b.id}</span>
                  <span style={{ color }}>{pct}%</span>
                </div>
                <div style={s.budgetBarBg}>
                  <div style={{ ...s.budgetBarFill, width: `${pct}%`, background: color }} />
                  <div style={{ ...s.budgetMarker, left: "70%", opacity: 0.5 }} />
                  <div style={{ ...s.budgetMarker, left: "90%", opacity: 0.8 }} />
                </div>
                <div style={s.budgetNums}>
                  {b.used.toLocaleString()} / {b.allocated.toLocaleString()} tokens
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  sectionTitle: { fontSize: 20, fontWeight: 700, color: "#f8fafc", marginBottom: 4 },
  sectionDesc: { fontSize: 13, color: "#64748b", marginBottom: 24 },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" },
  panel: { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 },
  panelTitle: { fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginBottom: 14 },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 12 },
  th: { textAlign: "left" as const, padding: "8px 10px", borderBottom: "1px solid #1e293b", color: "#64748b", fontSize: 10, textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  tr: { borderBottom: "1px solid #1e293b" },
  td: { padding: "8px 10px", color: "#94a3b8" },
  sevBadge: { fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4 },
  insight: { fontSize: 11, color: "#475569", marginTop: 12, padding: "8px", background: "#0b1120", borderRadius: 6 },
  budgetTotal: { textAlign: "center" as const, padding: "16px", background: "#0b1120", borderRadius: 10, marginBottom: 16 },
  budgetNumber: { fontSize: 32, fontWeight: 700, color: "#f8fafc" },
  budgetLabel: { fontSize: 11, color: "#64748b", marginTop: 2 },
  budgetPercent: { fontSize: 13, fontWeight: 600, color: "#10b981", marginTop: 4 },
  budgetRow: { marginBottom: 14 },
  budgetHeader: { display: "flex", justifyContent: "space-between", fontSize: 12, color: "#94a3b8", marginBottom: 4 },
  budgetBarBg: { height: 8, borderRadius: 4, background: "#1e293b", overflow: "hidden", position: "relative" as const },
  budgetBarFill: { height: "100%", borderRadius: 4, transition: "width 0.3s" },
  budgetMarker: { position: "absolute" as const, top: 0, width: 1, height: "100%", background: "#64748b" },
  budgetNums: { fontSize: 10, color: "#475569", marginTop: 2, textAlign: "right" as const },
};
