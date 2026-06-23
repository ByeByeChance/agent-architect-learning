/**
 * 向量库管理面板 —— 展示向量库统计、文档索引、相似度分布
 */

const MOCK_STATS = {
  totalVectors: 1240,
  dimensions: 1024,
  metric: "cosine",
  totalDocs: 85,
  avgChunksPerDoc: 14.6,
  storageEstimate: "5.1 MB",
  indexType: "HNSW",
  indexParams: { M: 16, efConstruction: 200, efSearch: 50 },
};

const MOCK_DOCS = [
  {
    title: "React 18 Suspense 详解",
    chunks: 8,
    vectors: 8,
    avgScore: 0.87,
    lastUpdated: "2026-06-20",
  },
  {
    title: "TypeScript 泛型深入",
    chunks: 12,
    vectors: 12,
    avgScore: 0.91,
    lastUpdated: "2026-06-21",
  },
  {
    title: "RAG 检索增强生成原理",
    chunks: 6,
    vectors: 6,
    avgScore: 0.84,
    lastUpdated: "2026-06-19",
  },
  {
    title: "HNSW 算法原理",
    chunks: 5,
    vectors: 5,
    avgScore: 0.79,
    lastUpdated: "2026-06-18",
  },
  {
    title: "Node.js Stream 和背压机制",
    chunks: 7,
    vectors: 7,
    avgScore: 0.82,
    lastUpdated: "2026-06-22",
  },
  {
    title: "Docker 容器化部署指南",
    chunks: 10,
    vectors: 10,
    avgScore: 0.76,
    lastUpdated: "2026-06-15",
  },
  {
    title: "Python asyncio 异步编程",
    chunks: 9,
    vectors: 9,
    avgScore: 0.73,
    lastUpdated: "2026-06-14",
  },
  {
    title: "React 状态管理方案对比",
    chunks: 11,
    vectors: 11,
    avgScore: 0.88,
    lastUpdated: "2026-06-23",
  },
];

const SIMILARITY_DISTRIBUTION = [
  { range: "0.9-1.0", count: 245, color: "#10b981" },
  { range: "0.8-0.9", count: 420, color: "#34d399" },
  { range: "0.7-0.8", count: 310, color: "#f59e0b" },
  { range: "0.6-0.7", count: 168, color: "#f97316" },
  { range: "0.5-0.6", count: 72, color: "#ef4444" },
  { range: "<0.5", count: 25, color: "#dc2626" },
];

export default function VectorDBView() {
  const maxDist = Math.max(...SIMILARITY_DISTRIBUTION.map((d) => d.count));

  return (
    <div>
      <h2 style={styles.sectionTitle}>🗄️ 向量库管理</h2>
      <p style={styles.sectionDesc}>
        文档索引、维度统计、相似度分布概览
      </p>

      <div style={styles.grid}>
        {/* Stats Cards */}
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{MOCK_STATS.totalVectors.toLocaleString()}</div>
            <div style={styles.statLabel}>总向量数</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{MOCK_STATS.dimensions}D</div>
            <div style={styles.statLabel}>向量维度</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{MOCK_STATS.metric}</div>
            <div style={styles.statLabel}>相似度度量</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{MOCK_STATS.totalDocs}</div>
            <div style={styles.statLabel}>文档数</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{MOCK_STATS.storageEstimate}</div>
            <div style={styles.statLabel}>存储估算</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{MOCK_STATS.indexType}</div>
            <div style={styles.statLabel}>索引类型</div>
          </div>
        </div>

        {/* Index Config */}
        <div style={styles.twoCol}>
          <div style={styles.panel}>
            <div style={styles.panelTitle}>HNSW 索引参数</div>
            <div style={styles.paramRow}>
              <span style={styles.paramLabel}>M (每节点连接数)</span>
              <span style={styles.paramValue}>{MOCK_STATS.indexParams.M}</span>
            </div>
            <div style={styles.paramRow}>
              <span style={styles.paramLabel}>efConstruction (构建宽度)</span>
              <span style={styles.paramValue}>{MOCK_STATS.indexParams.efConstruction}</span>
            </div>
            <div style={styles.paramRow}>
              <span style={styles.paramLabel}>efSearch (搜索宽度)</span>
              <span style={styles.paramValue}>{MOCK_STATS.indexParams.efSearch}</span>
            </div>
            <div style={styles.paramRow}>
              <span style={styles.paramLabel}>平均 chunks/文档</span>
              <span style={styles.paramValue}>{MOCK_STATS.avgChunksPerDoc}</span>
            </div>
          </div>

          {/* Similarity Distribution */}
          <div style={styles.panel}>
            <div style={styles.panelTitle}>相似度分布</div>
            {SIMILARITY_DISTRIBUTION.map((d) => (
              <div key={d.range} style={styles.distRow}>
                <span style={styles.distLabel}>{d.range}</span>
                <div style={styles.distBarBg}>
                  <div
                    style={{
                      ...styles.distBarFill,
                      width: `${(d.count / maxDist) * 100}%`,
                      background: d.color,
                    }}
                  />
                </div>
                <span style={styles.distCount}>{d.count}</span>
              </div>
            ))}
            <div style={styles.distInsight}>
              💡 91% 的查询返回相似度 &gt; 0.7 的结果，检索质量良好。
              &lt;0.5 的 25 个向量可能来自主题无关文档，建议审核。
            </div>
          </div>
        </div>

        {/* Document Table */}
        <div style={styles.tablePanel}>
          <div style={styles.panelTitle}>文档索引清单</div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>文档名称</th>
                <th style={styles.th}>Chunks</th>
                <th style={styles.th}>向量数</th>
                <th style={styles.th}>平均相关度</th>
                <th style={styles.th}>最近更新</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_DOCS.map((doc) => (
                <tr key={doc.title} style={styles.tr}>
                  <td style={styles.td}>
                    <div style={styles.docName}>{doc.title}</div>
                  </td>
                  <td style={styles.td}>{doc.chunks}</td>
                  <td style={styles.td}>{doc.vectors}</td>
                  <td style={styles.td}>
                    <div style={styles.scoreCell}>
                      <div style={styles.miniScoreBg}>
                        <div
                          style={{
                            ...styles.miniScoreFill,
                            width: `${doc.avgScore * 100}%`,
                            background:
                              doc.avgScore > 0.85
                                ? "#10b981"
                                : doc.avgScore > 0.8
                                  ? "#f59e0b"
                                  : "#ef4444",
                          }}
                        />
                      </div>
                      <span style={styles.miniScoreText}>
                        {(doc.avgScore * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td style={styles.td}>{doc.lastUpdated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sectionTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "#f8fafc",
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 24,
  },
  grid: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: 12,
  },
  statCard: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 10,
    padding: "16px",
    textAlign: "center" as const,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 700,
    color: "#f8fafc",
  },
  statLabel: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 4,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  twoCol: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  },
  panel: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 10,
    padding: 20,
  },
  panelTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#e2e8f0",
    marginBottom: 14,
  },
  paramRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: "1px solid #1e293b",
    fontSize: 13,
  },
  paramLabel: { color: "#94a3b8" },
  paramValue: { color: "#e2e8f0", fontWeight: 600, fontFamily: "monospace" },
  distRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  distLabel: { fontSize: 12, color: "#94a3b8", minWidth: 60 },
  distBarBg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    background: "#1e293b",
    overflow: "hidden",
  },
  distBarFill: { height: "100%", borderRadius: 4, transition: "width 0.3s" },
  distCount: { fontSize: 12, fontWeight: 600, color: "#e2e8f0", minWidth: 30, textAlign: "right" as const },
  distInsight: {
    fontSize: 11,
    color: "#475569",
    marginTop: 12,
    padding: "8px 10px",
    background: "#0b1120",
    borderRadius: 6,
    lineHeight: 1.5,
  },
  tablePanel: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 10,
    padding: 20,
    overflowX: "auto" as const,
  },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  th: {
    textAlign: "left" as const,
    padding: "10px 12px",
    borderBottom: "1px solid #1e293b",
    color: "#64748b",
    fontWeight: 600,
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  tr: { borderBottom: "1px solid #1e293b" },
  td: { padding: "10px 12px", color: "#94a3b8" },
  docName: { color: "#e2e8f0", fontWeight: 500 },
  scoreCell: { display: "flex", alignItems: "center", gap: 8 },
  miniScoreBg: {
    width: 60,
    height: 6,
    borderRadius: 3,
    background: "#1e293b",
    overflow: "hidden",
  },
  miniScoreFill: { height: "100%", borderRadius: 3 },
  miniScoreText: { fontSize: 12, fontWeight: 600, color: "#e2e8f0" },
};
