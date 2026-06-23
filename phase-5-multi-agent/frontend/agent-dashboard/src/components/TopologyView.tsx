import { useState } from "react";

const AGENTS = [
  { id: "orch", name: "Orchestrator", role: "orchestrator", x: 50, y: 5, status: "active", tasks: 3, tokens: "8K/30K" },
  { id: "cg", name: "代码生成 Agent", role: "worker", x: 15, y: 45, status: "done", tasks: 1, tokens: "35K/50K" },
  { id: "cr", name: "代码审查 Agent", role: "worker", x: 50, y: 45, status: "done", tasks: 1, tokens: "22K/50K" },
  { id: "tw", name: "测试编写 Agent", role: "worker", x: 85, y: 45, status: "done", tasks: 1, tokens: "18K/42K" },
  { id: "synth", name: "Synthesizer", role: "synthesizer", x: 50, y: 85, status: "active", tasks: 1, tokens: "5K/20K" },
];

const EDGES = [
  { from: "orch", to: "cg", label: "task-1" },
  { from: "orch", to: "cr", label: "task-2 (依赖 task-1)" },
  { from: "orch", to: "tw", label: "task-3 (依赖 task-1)" },
  { from: "cg", to: "cr", label: "代码输出" },
  { from: "cg", to: "tw", label: "代码输出" },
  { from: "cr", to: "synth", label: "审查结果" },
  { from: "tw", to: "synth", label: "测试结果" },
  { from: "cg", to: "synth", label: "代码" },
];

export default function TopologyView() {
  const [selected, setSelected] = useState<string | null>(null);

  const statusColors: Record<string, string> = {
    active: "#06b6d4",
    done: "#10b981",
    failed: "#ef4444",
    idle: "#64748b",
  };

  return (
    <div>
      <h2 style={s.sectionTitle}>🌐 Agent 拓扑结构</h2>
      <p style={s.sectionDesc}>Orchestrator/Worker 模式 — 当前执行 "formatDate 工具函数开发"</p>

      <div style={s.grid}>
        {/* Topology Canvas */}
        <div style={s.canvas}>
          {/* Edges */}
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            {EDGES.map((e, i) => {
              const from = AGENTS.find((a) => a.id === e.from)!;
              const to = AGENTS.find((a) => a.id === e.to)!;
              const x1 = `${from.x + 5}%`, y1 = `${from.y + 5}%`;
              const x2 = `${to.x + 5}%`, y2 = `${to.y - 2}%`;
              return (
                <g key={i}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#334155" strokeWidth="1" strokeDasharray={e.from === "orch" ? "4,2" : "2,2"} />
                  <text x={(parseFloat(x1) + parseFloat(x2)) / 2 + "%"} y={(parseFloat(y1) + parseFloat(y2)) / 2 + "%"}
                    fill="#475569" fontSize="9" textAnchor="middle" dominantBaseline="middle">
                    {e.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Nodes */}
          {AGENTS.map((agent) => (
            <div key={agent.id}
              onClick={() => setSelected(selected === agent.id ? null : agent.id)}
              style={{
                ...s.node, left: `${agent.x}%`, top: `${agent.y}%`,
                borderColor: selected === agent.id ? "#8b5cf6" : statusColors[agent.status],
                background: selected === agent.id ? "#1e1040" : "#0f172a",
                transform: `translate(-50%, -50%) scale(${selected === agent.id ? 1.05 : 1})`,
              }}>
              <div style={{ ...s.nodeDot, background: statusColors[agent.status] }} />
              <div style={s.nodeName}>{agent.name}</div>
              <div style={s.nodeMeta}>
                {agent.tasks} tasks · {agent.tokens}
              </div>
              {selected === agent.id && (
                <div style={s.nodeDetail}>
                  <div style={s.detailRow}>角色: {agent.role}</div>
                  <div style={s.detailRow}>状态: {agent.status === "active" ? "执行中" : agent.status === "done" ? "已完成" : "空闲"}</div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Legend + Stats */}
        <div style={s.sidebar}>
          <div style={s.panel}>
            <div style={s.panelTitle}>图例</div>
            {Object.entries(statusColors).map(([k, v]) => (
              <div key={k} style={s.legendRow}>
                <div style={{ ...s.legendDot, background: v }} />
                <span>{k === "active" ? "执行中" : k === "done" ? "已完成" : k === "failed" ? "失败" : "空闲"}</span>
              </div>
            ))}
            <div style={{ marginTop: 8, fontSize: 11, color: "#475569" }}>
              ━━ 编排调度<br />
              ┅┅ 数据依赖
            </div>
          </div>
          <div style={s.panel}>
            <div style={s.panelTitle}>统计</div>
            <div style={s.statRow}><span>Agent 总数</span><span>5</span></div>
            <div style={s.statRow}><span>Worker</span><span>3</span></div>
            <div style={s.statRow}><span>总任务数</span><span>3</span></div>
            <div style={s.statRow}><span>通过率</span><span style={{ color: "#10b981" }}>100%</span></div>
            <div style={s.statRow}><span>总耗时</span><span>33.8s</span></div>
            <div style={s.statRow}><span>Token 使用</span><span>88K/200K</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  sectionTitle: { fontSize: 20, fontWeight: 700, color: "#f8fafc", marginBottom: 4 },
  sectionDesc: { fontSize: 13, color: "#64748b", marginBottom: 24 },
  grid: { display: "grid", gridTemplateColumns: "1fr 240px", gap: 16, alignItems: "start" },
  canvas: { position: "relative" as const, height: 450, background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, overflow: "hidden" },
  node: { position: "absolute" as const, width: 160, padding: "12px", borderRadius: 8, border: "1px solid", cursor: "pointer", transition: "all 0.2s", zIndex: 1 },
  nodeDot: { width: 8, height: 8, borderRadius: "50%", marginBottom: 6 },
  nodeName: { fontSize: 12, fontWeight: 600, color: "#e2e8f0" },
  nodeMeta: { fontSize: 10, color: "#64748b", marginTop: 2 },
  nodeDetail: { marginTop: 8, padding: "6px 8px", background: "#0b1120", borderRadius: 4, fontSize: 10, color: "#94a3b8" },
  detailRow: { padding: "1px 0" },
  sidebar: { display: "flex", flexDirection: "column" as const, gap: 12 },
  panel: { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: 16 },
  panelTitle: { fontSize: 13, fontWeight: 700, color: "#e2e8f0", marginBottom: 10 },
  legendRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#94a3b8", marginBottom: 4 },
  legendDot: { width: 10, height: 10, borderRadius: "50%" },
  statRow: { display: "flex", justifyContent: "space-between", fontSize: 12, color: "#94a3b8", padding: "4px 0", borderBottom: "1px solid #1e293b" },
};
