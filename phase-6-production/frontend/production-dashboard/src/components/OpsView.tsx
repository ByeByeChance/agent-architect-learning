export default function OpsView() {
  return (
    <div style={css.wrapper}>
      {/* Circuit Breakers */}
      <section style={css.section}>
        <h3 style={css.sectionTitle}>⚡ 熔断器状态</h3>
        <div style={css.cardGrid}>
          {CIRCUIT_BREAKERS.map((cb) => {
            const stateColor = cb.state === "CLOSED" ? "#10b981" : cb.state === "OPEN" ? "#ef4444" : "#f59e0b";
            return (
              <div key={cb.name} style={{ ...css.cbCard, borderLeft: `4px solid ${stateColor}` }}>
                <div style={css.cbHeader}>
                  <span style={css.cbName}>{cb.name}</span>
                  <span style={{ ...css.cbState, background: stateColor }}>{cb.state}</span>
                </div>
                <div style={css.cbStats}>
                  <div style={css.cbStat}>
                    <span style={css.cbStatValue}>{cb.failureCount}</span>
                    <span style={css.cbStatLabel}>失败</span>
                  </div>
                  <div style={css.cbStat}>
                    <span style={css.cbStatValue}>{cb.successCount}</span>
                    <span style={css.cbStatLabel}>成功</span>
                  </div>
                  <div style={css.cbStat}>
                    <span style={css.cbStatValue}>{cb.totalTransitions}</span>
                    <span style={css.cbStatLabel}>转换</span>
                  </div>
                </div>
                <div style={css.cbFooter}>
                  <span style={css.cbFooterText}>最近变更: {cb.lastChange}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Rate Limiters */}
      <section style={css.section}>
        <h3 style={css.sectionTitle}>🚦 限流监控</h3>
        <div style={css.panel}>
          {RATE_LIMITERS.map((rl) => {
            const pct = (rl.currentTokens / rl.capacity) * 100;
            const color = pct > 50 ? "#10b981" : pct > 20 ? "#f59e0b" : "#ef4444";
            return (
              <div key={rl.name} style={css.rlRow}>
                <div style={css.rlInfo}>
                  <span style={css.rlName}>{rl.name}</span>
                  <span style={css.rlType}>{rl.type}</span>
                </div>
                <div style={css.rlBarTrack}>
                  <div style={{ ...css.rlBarFill, width: `${pct}%`, background: color }} />
                </div>
                <span style={{ ...css.rlValue, color }}>{rl.currentTokens}/{rl.capacity}</span>
                <span style={css.rlRate}>{rl.reqRate} req/s</span>
                <span style={{
                  ...css.rlStatus,
                  background: rl.status === "ALLOWED" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
                  color: rl.status === "ALLOWED" ? "#10b981" : "#ef4444",
                }}>
                  {rl.status}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Health Checks */}
      <section style={css.section}>
        <h3 style={css.sectionTitle}>🏥 健康检查</h3>
        <div style={css.panel}>
          <div style={css.healthOverall}>
            <div style={{
              width: 16, height: 16, borderRadius: "50%",
              background: HEALTH_STATUS.overall === "Healthy" ? "#10b981" : HEALTH_STATUS.overall === "Degraded" ? "#f59e0b" : "#ef4444",
              boxShadow: `0 0 8px ${HEALTH_STATUS.overall === "Healthy" ? "#10b981" : HEALTH_STATUS.overall === "Degraded" ? "#f59e0b" : "#ef4444"}`,
            }} />
            <span style={css.healthOverallText}>系统: {HEALTH_STATUS.overall}</span>
            <span style={css.healthUptime}>Uptime: {HEALTH_STATUS.uptime}</span>
          </div>
          <div style={css.healthGrid}>
            {HEALTH_CHECKS.map((hc) => (
              <div key={hc.name} style={css.healthItem}>
                <div style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: hc.healthy ? "#10b981" : "#ef4444",
                }} />
                <span style={css.healthName}>{hc.name}</span>
                <span style={css.healthLatency}>{hc.latencyMs}ms</span>
                <span style={{ color: hc.healthy ? "#10b981" : "#ef4444", fontSize: 12 }}>
                  {hc.healthy ? "✅" : "❌"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Audit Log */}
      <section style={css.section}>
        <h3 style={css.sectionTitle}>📜 审计日志 (哈希链验证: {AUDIT_CHAIN.verified ? "✅ 完整" : "❌ 被篡改"})</h3>
        <div style={{ ...css.panel, maxHeight: 340, overflowY: "auto" }}>
          {AUDIT_LOG.map((entry, i) => (
            <div key={i} style={css.auditEntry}>
              <div style={css.auditHeader}>
                <span style={css.auditTime}>{entry.time}</span>
                <span style={css.auditAgent}>@{entry.agent}</span>
                <span style={{
                  ...css.auditStatus,
                  color: entry.status === "SUCCESS" ? "#10b981" : entry.status === "FAILED" ? "#ef4444" : "#f59e0b",
                }}>
                  {entry.status}
                </span>
              </div>
              <div style={css.auditBody}>
                <span style={css.auditAction}>{entry.action}</span>
                <span style={css.auditTokens}>{entry.tokens.prompt}+{entry.tokens.completion} tokens</span>
                <span style={css.auditCost}>${entry.cost.toFixed(4)}</span>
              </div>
              <div style={css.auditHash}>
                <span style={css.auditHashLabel}>input_hash:</span>
                <code style={css.auditHashValue}>{entry.inputHash}</code>
                <span style={{ color: "#64748b", margin: "0 4px" }}>→</span>
                <span style={css.auditHashLabel}>prev:</span>
                <code style={css.auditHashValue}>{entry.prevHash}</code>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Canary Release */}
      <section style={css.section}>
        <h3 style={css.sectionTitle}>🐤 金丝雀发布进度</h3>
        <div style={css.panel}>
          <div style={css.canaryStepper}>
            {CANARY_STEPS.map((step, i) => {
              const isActive = i === CANARY_STEPS.length - 1;
              const isDone = step.status === "completed";
              const isFailed = step.status === "failed";
              const bg = isFailed ? "#ef4444" : isDone ? "#10b981" : isActive ? "#8b5cf6" : "#334155";
              return (
                <div key={i} style={css.canaryStep}>
                  <div style={{ ...css.canaryDot, background: bg, boxShadow: isActive ? `0 0 8px ${bg}` : "none" }} />
                  <span style={{ ...css.canaryStepLabel, color: isActive || isDone ? "#e2e8f0" : "#64748b" }}>
                    {step.label}
                  </span>
                  <span style={{ fontSize: 10, color: "#64748b" }}>{step.percent}%</span>
                </div>
              );
            })}
          </div>
          <div style={css.canaryCompare}>
            <div style={css.canaryModelCol}>
              <span style={css.canaryModelLabel}>稳定版 (Claude-3.5)</span>
              <div style={{ ...css.canaryScoreBar, width: "93%" }} />
              <span style={css.canaryScoreValue}>0.958</span>
            </div>
            <div style={css.canaryModelCol}>
              <span style={css.canaryModelLabel}>金丝雀 (GPT-4o)</span>
              <div style={{ ...css.canaryScoreBar, width: "97%", background: "#8b5cf6" }} />
              <span style={{ ...css.canaryScoreValue, color: "#8b5cf6" }}>0.978</span>
            </div>
          </div>
          <div style={css.canaryLog}>
            {CANARY_LOG.map((entry, i) => (
              <div key={i} style={css.canaryLogEntry}>
                <span style={css.canaryLogTime}>{entry.time}</span>
                <span style={{
                  ...css.canaryLogDecision,
                  color: entry.decision === "PROMOTE" ? "#10b981" : entry.decision === "ROLLBACK" ? "#ef4444" : "#f59e0b",
                }}>
                  {entry.decision === "PROMOTE" ? "🚀" : entry.decision === "ROLLBACK" ? "⏪" : "➡️"} {entry.decision}
                </span>
                <span style={css.canaryLogReason}>{entry.reason}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

// Mock Data
const CIRCUIT_BREAKERS: { name: string; state: string; failureCount: number; successCount: number; totalTransitions: number; lastChange: string }[] = [
  { name: "LLM API (Primary)", state: "CLOSED", failureCount: 2, successCount: 147, totalTransitions: 1, lastChange: "2h ago" },
  { name: "Tool: File System", state: "CLOSED", failureCount: 0, successCount: 89, totalTransitions: 0, lastChange: "N/A" },
  { name: "External API", state: "HALF_OPEN", failureCount: 5, successCount: 3, totalTransitions: 3, lastChange: "5m ago" },
];

const RATE_LIMITERS = [
  { name: "Global", type: "Token Bucket", currentTokens: 87, capacity: 100, reqRate: 13, status: "ALLOWED" as const },
  { name: "Per-User (Alice)", type: "Sliding Window", currentTokens: 42, capacity: 60, reqRate: 8, status: "ALLOWED" as const },
  { name: "Per-API-Key (CI)", type: "Token Bucket", currentTokens: 8, capacity: 50, reqRate: 15, status: "LIMITED" as const },
];

const HEALTH_STATUS = {
  overall: "Healthy" as const,
  uptime: "14d 7h 23m",
};

const HEALTH_CHECKS = [
  { name: "process-liveness", healthy: true, latencyMs: 1 },
  { name: "llm-api-connectivity", healthy: true, latencyMs: 45 },
  { name: "database-connectivity", healthy: true, latencyMs: 12 },
  { name: "tool-service-availability", healthy: true, latencyMs: 23 },
];

const AUDIT_CHAIN = { verified: true };

const AUDIT_LOG = [
  { time: "14:32:01", agent: "code-gen", action: "agent.call.code-generator", status: "SUCCESS" as const, tokens: { prompt: 35000, completion: 8000 }, cost: 0.142, inputHash: "a3f2b1...", prevHash: "9e4d7c..." },
  { time: "14:31:45", agent: "orchestr", action: "agent.call.orchestrator", status: "SUCCESS" as const, tokens: { prompt: 8000, completion: 3000 }, cost: 0.035, inputHash: "b4c3d2...", prevHash: "f1a2b3..." },
  { time: "14:30:12", agent: "reviewer", action: "agent.call.code-reviewer", status: "SUCCESS" as const, tokens: { prompt: 22000, completion: 5000 }, cost: 0.086, inputHash: "c5d4e3...", prevHash: "a3f2b1..." },
  { time: "14:29:33", agent: "test-wtr", action: "agent.call.test-writer", status: "FAILED" as const, tokens: { prompt: 18000, completion: 2000 }, cost: 0.035, inputHash: "d6e5f4...", prevHash: "b4c3d2..." },
  { time: "14:28:01", agent: "code-gen", action: "agent.call.code-generator", status: "SUCCESS" as const, tokens: { prompt: 28000, completion: 7000 }, cost: 0.098, inputHash: "e7f6g5...", prevHash: "c5d4e3..." },
];

const CANARY_STEPS: { label: string; percent: number; status: string }[] = [
  { label: "5%", percent: 5, status: "completed" },
  { label: "25%", percent: 25, status: "completed" },
  { label: "50%", percent: 50, status: "completed" },
  { label: "100%", percent: 100, status: "active" },
];

const CANARY_LOG: { time: string; decision: string; reason: string }[] = [
  { time: "14:25", decision: "PROMOTE", reason: "金丝雀质量(0.978)稳定，全量推广" },
  { time: "12:30", decision: "CONTINUE", reason: "金丝雀质量(0.901)在可接受范围，扩大至 50%" },
  { time: "10:15", decision: "CONTINUE", reason: "金丝雀质量(0.966)在可接受范围，扩大至 25%" },
  { time: "08:00", decision: "CONTINUE", reason: "金丝雀质量(0.964)正常，开始 5% 测试" },
];

const css: Record<string, React.CSSProperties> = {
  wrapper: { display: "flex", flexDirection: "column", gap: 24 },
  section: { display: "flex", flexDirection: "column", gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: 600, color: "#e2e8f0" },
  panel: {
    background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10,
    padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12,
  },

  // Circuit Breakers
  cardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 },
  cbCard: {
    background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10,
    padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10,
  },
  cbHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  cbName: { fontSize: 13, fontWeight: 600, color: "#e2e8f0" },
  cbState: { fontSize: 10, fontWeight: 700, color: "#fff", padding: "3px 10px", borderRadius: 12 },
  cbStats: { display: "flex", gap: 20 },
  cbStat: { display: "flex", flexDirection: "column", alignItems: "center" },
  cbStatValue: { fontSize: 20, fontWeight: 700, color: "#e2e8f0" },
  cbStatLabel: { fontSize: 10, color: "#64748b" },
  cbFooter: {},
  cbFooterText: { fontSize: 10, color: "#64748b" },

  // Rate Limiters
  rlRow: { display: "flex", alignItems: "center", gap: 12 },
  rlInfo: { display: "flex", flexDirection: "column", minWidth: 130, gap: 2 },
  rlName: { fontSize: 13, fontWeight: 600, color: "#e2e8f0" },
  rlType: { fontSize: 10, color: "#64748b" },
  rlBarTrack: { flex: 1, height: 14, background: "#1e293b", borderRadius: 7, overflow: "hidden" },
  rlBarFill: { height: "100%", borderRadius: 7, transition: "width 0.5s ease" },
  rlValue: { fontSize: 12, fontWeight: 600, minWidth: 65, textAlign: "right" as const },
  rlRate: { fontSize: 11, color: "#94a3b8", minWidth: 55, textAlign: "right" as const },
  rlStatus: { fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 10 },

  // Health Checks
  healthOverall: { display: "flex", alignItems: "center", gap: 10 },
  healthOverallText: { fontSize: 15, fontWeight: 600, color: "#e2e8f0" },
  healthUptime: { fontSize: 12, color: "#64748b", marginLeft: "auto" },
  healthGrid: { display: "flex", gap: 24, flexWrap: "wrap" as const },
  healthItem: { display: "flex", alignItems: "center", gap: 8 },
  healthName: { fontSize: 12, color: "#94a3b8" },
  healthLatency: { fontSize: 11, color: "#64748b" },

  // Audit Log
  auditEntry: {
    padding: "10px 14px", border: "1px solid #1e293b", borderRadius: 8,
    display: "flex", flexDirection: "column", gap: 6,
  },
  auditHeader: { display: "flex", alignItems: "center", gap: 10 },
  auditTime: { fontSize: 11, color: "#64748b", fontFamily: "monospace" },
  auditAgent: { fontSize: 12, color: "#94a3b8", fontWeight: 500 },
  auditStatus: { fontSize: 10, fontWeight: 700, marginLeft: "auto" },
  auditBody: { display: "flex", alignItems: "center", gap: 12 },
  auditAction: { fontSize: 12, color: "#e2e8f0", fontWeight: 500 },
  auditTokens: { fontSize: 11, color: "#64748b" },
  auditCost: { fontSize: 11, color: "#94a3b8", fontWeight: 600, marginLeft: "auto" },
  auditHash: { display: "flex", alignItems: "center", gap: 6, fontSize: 10 },
  auditHashLabel: { color: "#64748b" },
  auditHashValue: { color: "#8b5cf6", fontFamily: "monospace", background: "rgba(139,92,246,0.1)", padding: "1px 4px", borderRadius: 3 },

  // Canary Release
  canaryStepper: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 16 },
  canaryStep: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1 },
  canaryDot: { width: 14, height: 14, borderRadius: "50%", transition: "all 0.3s ease" },
  canaryStepLabel: { fontSize: 12, fontWeight: 600 },
  canaryCompare: { display: "flex", flexDirection: "column", gap: 8, padding: "12px 0", borderTop: "1px solid #1e293b", borderBottom: "1px solid #1e293b" },
  canaryModelCol: { display: "flex", alignItems: "center", gap: 12 },
  canaryModelLabel: { fontSize: 12, color: "#94a3b8", minWidth: 180 },
  canaryScoreBar: { height: 12, borderRadius: 6, background: "#10b981", transition: "width 0.5s ease" },
  canaryScoreValue: { fontSize: 13, fontWeight: 700, color: "#10b981" },
  canaryLog: { display: "flex", flexDirection: "column", gap: 6 },
  canaryLogEntry: { display: "flex", alignItems: "center", gap: 12, padding: "6px 0" },
  canaryLogTime: { fontSize: 11, color: "#64748b", fontFamily: "monospace", minWidth: 45 },
  canaryLogDecision: { fontSize: 12, fontWeight: 600, minWidth: 90 },
  canaryLogReason: { fontSize: 11, color: "#94a3b8" },
};
