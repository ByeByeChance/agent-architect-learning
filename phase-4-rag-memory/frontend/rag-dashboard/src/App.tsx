import { useState } from "react";
import RetrievalView from "./components/RetrievalView";
import VectorDBView from "./components/VectorDBView";
import MemoryView from "./components/MemoryView";

type Tab = "retrieval" | "vectordb" | "memory";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("retrieval");

  const tabs: { id: Tab; label: string; desc: string }[] = [
    {
      id: "retrieval",
      label: "🔍 检索可视化",
      desc: "RAG 检索过程 + chunk 相关性分数",
    },
    {
      id: "vectordb",
      label: "🗄️ 向量库管理",
      desc: "文档索引、维度统计、相似度分布",
    },
    {
      id: "memory",
      label: "🧠 记忆状态",
      desc: "三层记忆模型可视化",
    },
  ];

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.title}>🧩 RAG & Memory Dashboard</h1>
        <span style={styles.subtitle}>
          Phase 4 — Agent 记忆与 RAG 可视化面板
        </span>
      </header>

      {/* Tab Bar */}
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

      {/* Content */}
      <main style={styles.main}>
        {activeTab === "retrieval" && <RetrievalView />}
        {activeTab === "vectordb" && <VectorDBView />}
        {activeTab === "memory" && <MemoryView />}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "#0b1120",
    color: "#e2e8f0",
  },
  header: {
    padding: "24px 32px 16px",
    borderBottom: "1px solid #1e293b",
    background: "linear-gradient(180deg, #0f172a 0%, #0b1120 100%)",
  },
  title: {
    margin: 0,
    fontSize: 24,
    fontWeight: 700,
    color: "#f8fafc",
    letterSpacing: "-0.02em",
  },
  subtitle: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 4,
  },
  tabBar: {
    display: "flex",
    gap: 8,
    padding: "16px 32px",
    borderBottom: "1px solid #1e293b",
    background: "#0f172a",
  },
  tab: {
    flex: 1,
    maxWidth: 280,
    padding: "12px 16px",
    border: "1px solid #1e293b",
    borderRadius: 10,
    background: "#0b1120",
    cursor: "pointer",
    textAlign: "left" as const,
    transition: "all 0.2s ease",
  },
  activeTab: {
    borderColor: "#06b6d4",
    background: "linear-gradient(135deg, #0c4a6e20, #06b6d410)",
    boxShadow: "0 0 20px rgba(6, 182, 212, 0.1)",
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "#f8fafc",
    marginBottom: 4,
  },
  tabDesc: {
    fontSize: 12,
    color: "#64748b",
  },
  main: {
    padding: "24px 32px",
  },
};
