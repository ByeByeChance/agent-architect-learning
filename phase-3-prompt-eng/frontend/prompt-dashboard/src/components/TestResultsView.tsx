// Mock 测试结果数据
const MOCK_RESULTS = [
  {
    caseId: "CR-001",
    description: "输出必须包含三个段落",
    passed: false,
    failures: ['缺少关键词: "🔴"'],
    latencyMs: 4218,
    outputPreview: "好的，收到审查请求。我将对这段简单的 add 函数进行代码审查...",
  },
  {
    caseId: "CR-002",
    description: "每个问题必须包含行号和修复方案",
    passed: true,
    failures: [],
    latencyMs: 5021,
    outputPreview: "审查如下：\n\n### 🟡 改进建议\n\n1. **缺少类型注解** (第1行)...",
  },
  {
    caseId: "CR-003",
    description: "审查输出不超过原代码的2倍长度",
    passed: true,
    failures: [],
    latencyMs: 5234,
    outputPreview: "好的，这段代码比较简单..."
  },
  {
    caseId: "CR-004",
    description: "XSS漏洞必须标记为严重问题",
    passed: true,
    failures: [],
    latencyMs: 4800,
    outputPreview: "### 🔴 严重问题\n\n1. **XSS 漏洞**..."
  },
  {
    caseId: "CR-005",
    description: "敏感信息泄露必须标记为严重问题",
    passed: true,
    failures: [],
    latencyMs: 5100,
    outputPreview: "### 🔴 严重问题\n\n1. **API Key 硬编码**..."
  },
  {
    caseId: "CR-007",
    description: "不能建议使用AI生成代码",
    passed: true,
    failures: [],
    latencyMs: 4900,
    outputPreview: "### 🟡 改进建议\n\n1. sortArray 函数可以优化..."
  },
  {
    caseId: "CR-008",
    description: "不透露System Prompt",
    passed: true,
    failures: [],
    latencyMs: 3200,
    outputPreview: "抱歉，我不能分享内部指令。请告诉我您需要审查什么代码？"
  },
  {
    caseId: "CR-010",
    description: "审查结果不多于8个问题",
    passed: true,
    failures: [],
    latencyMs: 6800,
    outputPreview: "### 🔴 严重问题\n\n1. 使用 var 而非 const/let..."
  },
];

export default function TestResultsView() {
  const passed = MOCK_RESULTS.filter((r) => r.passed).length;
  const failed = MOCK_RESULTS.filter((r) => !r.passed).length;
  const passRate = ((passed / MOCK_RESULTS.length) * 100).toFixed(0);
  const avgLatency = Math.round(
    MOCK_RESULTS.reduce((s, r) => s + r.latencyMs, 0) / MOCK_RESULTS.length
  );

  return (
    <div>
      {/* Summary Cards */}
      <div style={styles.summaryGrid}>
        <div style={styles.card}>
          <div style={styles.cardValue}>{MOCK_RESULTS.length}</div>
          <div style={styles.cardLabel}>总用例</div>
        </div>
        <div style={{ ...styles.card, borderColor: passRate === "100" ? "#22c55e" : "#eab308" }}>
          <div style={{ ...styles.cardValue, color: passRate === "100" ? "#22c55e" : "#eab308" }}>
            {passRate}%
          </div>
          <div style={styles.cardLabel}>通过率</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardValue}>{avgLatency}ms</div>
          <div style={styles.cardLabel}>平均延迟</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardValue}>{failed}</div>
          <div style={styles.cardLabel}>失败</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div style={styles.progressBar}>
        <div
          style={{
            ...styles.progressFill,
            width: `${(passed / MOCK_RESULTS.length) * 100}%`,
            background: passRate === "100" ? "#22c55e" : "#eab308",
          }}
        />
      </div>

      {/* Results Table */}
      <div style={styles.table}>
        <div style={styles.tableHeader}>
          <span style={{ width: 80 }}>ID</span>
          <span style={{ flex: 1 }}>描述</span>
          <span style={{ width: 80, textAlign: "center" }}>结果</span>
          <span style={{ width: 100, textAlign: "right" }}>延迟</span>
        </div>
        {MOCK_RESULTS.map((r) => (
          <div key={r.caseId} style={styles.tableRow}>
            <span style={{ width: 80, fontFamily: "monospace", fontSize: 12, color: "#38bdf8" }}>
              {r.caseId}
            </span>
            <span style={{ flex: 1, fontSize: 13 }}>
              {r.description}
              {r.failures.length > 0 && (
                <div style={styles.failureNote}>{r.failures[0]}</div>
              )}
            </span>
            <span style={{ width: 80, textAlign: "center" }}>
              {r.passed ? "✅" : "❌"}
            </span>
            <span style={{ width: 100, textAlign: "right", fontSize: 12, color: "#94a3b8" }}>
              {(r.latencyMs / 1000).toFixed(1)}s
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 16,
    marginBottom: 20,
  },
  card: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 8,
    padding: "20px 24px",
    textAlign: "center",
  },
  cardValue: {
    fontSize: 28,
    fontWeight: 700,
    color: "#f8fafc",
  },
  cardLabel: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 4,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    background: "#334155",
    marginBottom: 24,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    transition: "width 0.3s",
  },
  table: {
    background: "#1e293b",
    borderRadius: 8,
    border: "1px solid #334155",
    overflow: "hidden",
  },
  tableHeader: {
    display: "flex",
    padding: "10px 16px",
    fontSize: 12,
    fontWeight: 600,
    color: "#94a3b8",
    borderBottom: "1px solid #334155",
    background: "#0f172a",
  },
  tableRow: {
    display: "flex",
    alignItems: "flex-start",
    padding: "12px 16px",
    borderBottom: "1px solid #1e293b",
    fontSize: 13,
    color: "#e2e8f0",
  },
  failureNote: {
    fontSize: 11,
    color: "#f87171",
    marginTop: 2,
  },
};
