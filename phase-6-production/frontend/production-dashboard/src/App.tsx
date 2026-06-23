import { useState } from "react";
import CostView from "./components/CostView";
import TrustView from "./components/TrustView";
import OpsView from "./components/OpsView";

type Tab = "cost" | "trust" | "ops";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("cost");

  const tabs: { id: Tab; label: string; desc: string }[] = [
    { id: "cost", label: "💰 成本治理", desc: "Token 成本追踪、预算监控、漂移检测" },
    { id: "trust", label: "🛡️ 信任与安全", desc: "护栏管线、信任评分、对抗测试" },
    { id: "ops", label: "⚙️ 生产运维", desc: "熔断器、限流、健康检查、金丝雀发布" },
  ];

  return (
    <div style={css.container}>
      <header style={css.header}>
        <h1 style={css.title}>🏭 Agent Production Dashboard</h1>
        <p style={css.subtitle}>Phase 6 — Agent 产品化与治理：成本 · 信任 · 运维</p>
      </header>

      <nav style={css.tabBar}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                ...css.tab,
                ...(isActive ? css.tabActive : {}),
              }}
            >
              <span style={css.tabLabel}>{tab.label}</span>
              <span style={css.tabDesc}>{tab.desc}</span>
            </button>
          );
        })}
      </nav>

      <main style={css.main}>
        {activeTab === "cost" && <CostView />}
        {activeTab === "trust" && <TrustView />}
        {activeTab === "ops" && <OpsView />}
      </main>
    </div>
  );
}

const css: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "#0b1120",
    color: "#e2e8f0",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  header: {
    padding: "24px 32px 16px",
    borderBottom: "1px solid #1e293b",
    background: "linear-gradient(180deg, #0f172a 0%, #0b1120 100%)",
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: "#f1f5f9",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: "#64748b",
  },
  tabBar: {
    display: "flex",
    gap: 0,
    borderBottom: "1px solid #1e293b",
    background: "#0f172a",
    padding: "0 32px",
  },
  tab: {
    flex: 1,
    maxWidth: 320,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
    padding: "14px 20px",
    background: "transparent",
    border: "none",
    borderBottom: "3px solid transparent",
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: 13,
    transition: "all 0.2s ease",
    fontFamily: "inherit",
  },
  tabActive: {
    color: "#e2e8f0",
    borderBottomColor: "#8b5cf6",
    background: "linear-gradient(180deg, rgba(139,92,246,0.08) 0%, transparent 100%)",
    boxShadow: "0 1px 3px rgba(139,92,246,0.15)",
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: 600,
  },
  tabDesc: {
    fontSize: 11,
    color: "#64748b",
  },
  main: {
    padding: "24px 32px",
  },
};
