import { useState } from "react";
import PromptEditor from "./components/PromptEditor";
import TestResultsView from "./components/TestResultsView";
import BenchmarkView from "./components/BenchmarkView";

type Tab = "editor" | "tests" | "benchmark";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("editor");

  const tabs: { id: Tab; label: string; desc: string }[] = [
    { id: "editor", label: "📝 Prompt 编辑器", desc: "查看 / 编辑 / 版本对比" },
    { id: "tests", label: "🧪 测试结果", desc: "回归测试运行与报告" },
    { id: "benchmark", label: "🤖 多模型对比", desc: "DeepSeek vs OpenAI vs Claude" },
  ];

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>🧩 Prompt Engineering Dashboard</h1>
        <span style={styles.subtitle}>Phase 3 — 把 Prompt 当软件产品管理</span>
      </header>

      <nav style={styles.tabBar}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...styles.tab,
              ...(activeTab === tab.id ? styles.activeTab : {}),
            }}
          >
            <div style={styles.tabLabel}>{tab.label}</div>
            <div style={styles.tabDesc}>{tab.desc}</div>
          </button>
        ))}
      </nav>

      <main style={styles.main}>
        {activeTab === "editor" && <PromptEditor />}
        {activeTab === "tests" && <TestResultsView />}
        {activeTab === "benchmark" && <BenchmarkView />}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "#0f172a",
    color: "#e2e8f0",
    fontFamily: "system-ui, sans-serif",
  },
  header: {
    padding: "24px 32px 16px",
    borderBottom: "1px solid #1e293b",
  },
  title: {
    margin: 0,
    fontSize: 24,
    fontWeight: 700,
    color: "#f8fafc",
  },
  subtitle: {
    fontSize: 13,
    color: "#94a3b8",
  },
  tabBar: {
    display: "flex",
    gap: 8,
    padding: "16px 32px",
    borderBottom: "1px solid #1e293b",
    background: "#1e293b",
  },
  tab: {
    flex: 1,
    maxWidth: 260,
    padding: "12px 16px",
    border: "1px solid #334155",
    borderRadius: 8,
    background: "#0f172a",
    cursor: "pointer",
    textAlign: "left" as const,
    transition: "all 0.15s",
  },
  activeTab: {
    borderColor: "#38bdf8",
    background: "#0c4a6e",
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "#f8fafc",
    marginBottom: 4,
  },
  tabDesc: {
    fontSize: 12,
    color: "#94a3b8",
  },
  main: {
    padding: "24px 32px",
  },
};
