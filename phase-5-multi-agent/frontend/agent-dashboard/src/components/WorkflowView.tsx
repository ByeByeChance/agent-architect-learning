const TASKS = [
  { id: "task-1", desc: "编写 formatDate 函数的 TypeScript 实现", agent: "代码生成 Agent", status: "done", duration: "5.2s", tokens: "35K" },
  { id: "task-2", desc: "审查 formatDate 代码安全性和质量", agent: "代码审查 Agent", status: "done", duration: "16.1s", tokens: "22K", deps: ["task-1"] },
  { id: "task-3", desc: "为 formatDate 编写完整测试用例", agent: "测试编写 Agent", status: "done", duration: "12.6s", tokens: "18K", deps: ["task-1"] },
  { id: "synth", desc: "汇总所有 Agent 输出为最终报告", agent: "Synthesizer", status: "active", duration: "2.1s", tokens: "5K", deps: ["task-2", "task-3"] },
];

export default function WorkflowView() {
  return (
    <div>
      <h2 style={s.sectionTitle}>⚡ 工作流编排</h2>
      <p style={s.sectionDesc}>任务分解 → 拓扑排序 → 调度执行 → 结果验证</p>

      <div style={s.grid}>
        {/* Gantt-style timeline */}
        <div style={s.timelinePanel}>
          <div style={s.panelTitle}>执行时间线</div>
          {TASKS.map((t) => (
            <div key={t.id} style={s.timelineRow}>
              <div style={s.timelineLabel}>
                <div style={s.taskId}>{t.id}</div>
                <div style={s.taskDesc}>{t.desc.slice(0, 30)}...</div>
              </div>
              <div style={s.timelineBar}>
                <div style={{
                  ...s.bar, width: `${(parseFloat(t.duration) / 18) * 100}%`,
                  background: t.status === "done" ? "linear-gradient(90deg, #10b981, #34d399)" : "linear-gradient(90deg, #06b6d4, #8b5cf6)",
                  marginLeft: t.deps?.includes("task-1") ? "30%" : "0%",
                }}>
                  <span style={s.barLabel}>{t.agent}</span>
                </div>
                <span style={s.duration}>{t.duration}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Task detail cards */}
        <div style={s.cardsPanel}>
          {TASKS.map((t) => (
            <div key={t.id} style={{
              ...s.card, borderLeftColor: t.status === "done" ? "#10b981" : "#06b6d4",
            }}>
              <div style={s.cardHeader}>
                <span style={{
                  ...s.statusBadge, background: t.status === "done" ? "#064e3b" : "#0c4a6e",
                  color: t.status === "done" ? "#10b981" : "#06b6d4",
                }}>
                  {t.status === "done" ? "✅ 完成" : "🔄 执行中"}
                </span>
                <span style={s.cardTokens}>{t.tokens} tokens</span>
              </div>
              <div style={s.cardDesc}>{t.desc}</div>
              <div style={s.cardMeta}>
                Agent: {t.agent} · 耗时: {t.duration}
                {t.deps && <span> · 依赖: {t.deps.join(", ")}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  sectionTitle: { fontSize: 20, fontWeight: 700, color: "#f8fafc", marginBottom: 4 },
  sectionDesc: { fontSize: 13, color: "#64748b", marginBottom: 24 },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" },
  timelinePanel: { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 },
  panelTitle: { fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginBottom: 16 },
  timelineRow: { marginBottom: 16 },
  timelineLabel: { marginBottom: 4 },
  taskId: { fontSize: 11, fontWeight: 700, color: "#8b5cf6", fontFamily: "monospace" },
  taskDesc: { fontSize: 11, color: "#94a3b8" },
  timelineBar: { display: "flex", alignItems: "center", gap: 8 },
  bar: { height: 24, borderRadius: 6, display: "flex", alignItems: "center", paddingLeft: 8, minWidth: 60, transition: "width 0.5s" },
  barLabel: { fontSize: 10, color: "#fff", fontWeight: 600, whiteSpace: "nowrap" as const },
  duration: { fontSize: 11, color: "#94a3b8", fontFamily: "monospace", whiteSpace: "nowrap" as const },
  cardsPanel: { display: "flex", flexDirection: "column" as const, gap: 10 },
  card: { background: "#0f172a", border: "1px solid #1e293b", borderLeft: "3px solid", borderRadius: 8, padding: "14px" },
  cardHeader: { display: "flex", justifyContent: "space-between", marginBottom: 8 },
  statusBadge: { fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4 },
  cardTokens: { fontSize: 10, color: "#64748b", fontFamily: "monospace" },
  cardDesc: { fontSize: 13, color: "#e2e8f0", marginBottom: 6 },
  cardMeta: { fontSize: 10, color: "#64748b" },
};
