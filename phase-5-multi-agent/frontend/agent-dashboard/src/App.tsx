import { useState } from "react";
import TopologyView from "./components/TopologyView";
import WorkflowView from "./components/WorkflowView";
import HITLView from "./components/HITLView";

type Tab = "topology" | "workflow" | "hitl";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("topology");

  const tabs: { id: Tab; label: string; desc: string }[] = [
    { id: "topology", label: "🌐 Agent 拓扑", desc: "Orchestrator + Worker 结构可视化" },
    { id: "workflow", label: "⚡ 工作流编排", desc: "任务分解 → 调度 → 执行" },
    { id: "hitl", label: "🛡️ HITL & 预算", desc: "审批网关 + 上下文预算仪表盘" },
  ];

  return (
    <div style={css.container}>
      <header style={css.header}>
        <h1 style={css.title}>🤖 Multi-Agent Dashboard</h1>
        <span style={css.subtitle}>Phase 5 — 多 Agent 架构可视化面板</span>
      </header>
      <nav style={css.tabBar}>
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{...css.tab, ...(activeTab === tab.id ? css.activeTab : {})}}>
            <div style={css.tabLabel}>{tab.label}</div>
            <div style={css.tabDesc}>{tab.desc}</div>
          </button>
        ))}
      </nav>
      <main style={css.main}>
        {activeTab === "topology" && <TopologyView />}
        {activeTab === "workflow" && <WorkflowView />}
        {activeTab === "hitl" && <HITLView />}
      </main>
    </div>
  );
}

const css: Record<string, React.CSSProperties> = {
  container: { minHeight: "100vh", background: "#0b1120", color: "#e2e8f0" },
  header: { padding: "24px 32px 16px", borderBottom: "1px solid #1e293b", background: "linear-gradient(180deg, #0f172a 0%, #0b1120 100%)" },
  title: { margin: 0, fontSize: 24, fontWeight: 700, color: "#f8fafc" },
  subtitle: { fontSize: 13, color: "#64748b", marginTop: 4 },
  tabBar: { display: "flex", gap: 8, padding: "16px 32px", borderBottom: "1px solid #1e293b", background: "#0f172a" },
  tab: { flex: 1, maxWidth: 280, padding: "12px 16px", border: "1px solid #1e293b", borderRadius: 10, background: "#0b1120", cursor: "pointer", textAlign: "left" as const, transition: "all 0.2s" },
  activeTab: { borderColor: "#8b5cf6", background: "linear-gradient(135deg, #4c1d9520, #8b5cf610)", boxShadow: "0 0 20px rgba(139,92,246,0.1)" },
  tabLabel: { fontSize: 14, fontWeight: 600, color: "#f8fafc", marginBottom: 4 },
  tabDesc: { fontSize: 12, color: "#64748b" },
  main: { padding: "24px 32px" },
};
