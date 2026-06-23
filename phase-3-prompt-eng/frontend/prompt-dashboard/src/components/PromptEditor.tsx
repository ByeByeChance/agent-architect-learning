import { useState } from "react";

// 嵌入 Prompt 数据（实际项目中从 API 或文件系统加载）
const PROMPTS = [
  {
    id: "code-reviewer",
    name: "代码审查专家",
    version: "1.0.0",
    content: `# System Prompt: 代码审查专家

## 版本
- version: 1.0.0
- date: 2026-06-23
- author: Chance
- tags: [code-review, typescript, react]

## Role
你是一个资深前端代码审查专家，专精于 TypeScript + React 生态。
你的审查风格：安全第一、性能第二、可维护性第三、风格第四。

## Constraints
- 输出格式：Markdown，分为「🔴 严重问题」「🟡 改进建议」「🟢 做得好的地方」
- 每个问题必须附上具体的代码行号和修复方案
- 不多于 8 个问题（避免信息过载）
- 使用中文回答，代码术语保持英文

## Behavior Rules
1. 先理解代码意图再评论，不要基于假设批评
2. 安全漏洞（XSS、注入、敏感信息泄露）必须标记为严重问题
3. 如果看到超过 50 行的函数，建议拆分
4. 禁止建议"使用 AI 生成这段代码"
5. 审查不要超过原代码长度的 2 倍`,
  },
  {
    id: "code-generator",
    name: "代码生成专家",
    version: "1.0.0",
    content: `# System Prompt: 代码生成专家

## 版本
- version: 1.0.0
- date: 2026-06-23
- author: Chance
- tags: [code-generation, typescript, react]

## Role
你是一个 TypeScript + React 代码生成专家。
你的代码风格：简洁、类型安全、可测试。

## Constraints
- 始终使用 TypeScript 严格模式
- 每个文件只导出一个公共 API
- 函数不超过 20 行；超过则拆分
- 不写 any 类型（除非有注释说明原因）
- 生成的代码必须可以直接运行

## Output Format
- 方案简述（1-2 句话说明设计思路）
- 代码（带文件路径注释）
- 使用示例（最小可运行示例）
- 注意事项（关键前提、边界条件）`,
  },
];

// 质量评分规则
const CHECKS = [
  { id: "has-role", label: "包含角色定义（Role）", check: (c: string) => /##\s*(Role|角色)/.test(c) },
  { id: "has-constraints", label: "包含约束规则（Constraints）", check: (c: string) => /##\s*(Constraints|约束)/.test(c) },
  { id: "has-version", label: "声明版本号", check: (c: string) => /version:\s*\d/.test(c) },
  { id: "not-too-long", label: "Token 估算 < 1000", check: (c: string) => Math.round(c.length * 0.4 + c.split(/\s+/).length * 0.3) < 1000 },
  { id: "no-contradiction", label: "无明显矛盾约束", check: (c: string) => !(c.includes("始终") && c.includes("有时")) },
  { id: "has-behavior", label: "包含行为规范", check: (c: string) => /(Behavior|行为|规则)/.test(c) },
];

export default function PromptEditor() {
  const [selectedId, setSelectedId] = useState(PROMPTS[0].id);
  const [mode, setMode] = useState<"view" | "edit">("view");

  const prompt = PROMPTS.find((p) => p.id === selectedId)!;
  const estimatedTokens = Math.round(
    prompt.content.length * 0.4 + prompt.content.split(/\s+/).length * 0.3
  );

  return (
    <div>
      <div style={styles.toolbar}>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={styles.select}
        >
          {PROMPTS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} (v{p.version})
            </option>
          ))}
        </select>

        <div style={styles.modeToggle}>
          <button
            onClick={() => setMode("view")}
            style={{ ...styles.modeBtn, ...(mode === "view" ? styles.activeModeBtn : {}) }}
          >
            👁 查看
          </button>
          <button
            onClick={() => setMode("edit")}
            style={{ ...styles.modeBtn, ...(mode === "edit" ? styles.activeModeBtn : {}) }}
          >
            ✏️ 编辑
          </button>
        </div>
      </div>

      <div style={styles.layout}>
        {/* 主体：Prompt 内容 */}
        <div style={styles.mainCol}>
          <div style={styles.sectionHeader}>
            <span>Prompt 内容</span>
            <span style={styles.tokenBadge}>~{estimatedTokens} tokens</span>
          </div>
          {mode === "view" ? (
            <pre style={styles.preview}>{prompt.content}</pre>
          ) : (
            <textarea
              style={styles.editor}
              value={prompt.content}
              readOnly
              placeholder="编辑功能在实际项目中可启用..."
            />
          )}
        </div>

        {/* 侧栏：质量评分 */}
        <aside style={styles.sidebar}>
          <div style={styles.sectionHeader}>质量评分</div>
          <div style={styles.scoreCircle}>
            <div style={styles.scoreValue}>
              {(
                (CHECKS.filter((c) => c.check(prompt.content)).length /
                  CHECKS.length) *
                100
              ).toFixed(0)}
              %
            </div>
          </div>

          <div style={styles.checkList}>
            {CHECKS.map((check) => {
              const passed = check.check(prompt.content);
              return (
                <div key={check.id} style={styles.checkItem}>
                  <span>{passed ? "✅" : "❌"}</span>
                  <span style={{ textDecoration: passed ? "none" : "line-through", opacity: passed ? 1 : 0.5 }}>
                    {check.label}
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ ...styles.sectionHeader, marginTop: 20 }}>版本历史</div>
          <div style={styles.versionList}>
            <div style={styles.versionItem}>
              <span style={styles.versionTag}>v1.0.0</span>
              <span style={styles.versionDate}>2026-06-23</span>
            </div>
            <div style={styles.emptyHint}>暂无更多版本</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    gap: 16,
  },
  select: {
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#f8fafc",
    fontSize: 14,
  },
  modeToggle: {
    display: "flex",
    gap: 4,
    borderRadius: 6,
    border: "1px solid #334155",
    overflow: "hidden",
  },
  modeBtn: {
    padding: "8px 16px",
    border: "none",
    background: "#1e293b",
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: 13,
  },
  activeModeBtn: {
    background: "#0c4a6e",
    color: "#f8fafc",
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "1fr 280px",
    gap: 24,
    alignItems: "start",
  },
  mainCol: {
    background: "#1e293b",
    borderRadius: 8,
    border: "1px solid #334155",
    overflow: "hidden",
  },
  sectionHeader: {
    padding: "12px 16px",
    fontSize: 13,
    fontWeight: 600,
    color: "#94a3b8",
    borderBottom: "1px solid #334155",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tokenBadge: {
    padding: "2px 8px",
    borderRadius: 10,
    background: "#0f172a",
    color: "#38bdf8",
    fontSize: 12,
  },
  preview: {
    margin: 0,
    padding: 20,
    fontSize: 13,
    lineHeight: 1.7,
    overflow: "auto",
    maxHeight: "calc(100vh - 300px)",
    whiteSpace: "pre-wrap" as const,
    color: "#e2e8f0",
  },
  editor: {
    width: "100%",
    minHeight: "calc(100vh - 300px)",
    padding: 20,
    fontSize: 13,
    lineHeight: 1.7,
    background: "#0f172a",
    color: "#e2e8f0",
    border: "none",
    resize: "vertical" as const,
    fontFamily: "monospace",
  },
  sidebar: {
    background: "#1e293b",
    borderRadius: 8,
    border: "1px solid #334155",
    padding: 0,
    overflow: "hidden",
  },
  scoreCircle: {
    display: "flex",
    justifyContent: "center",
    padding: "20px 0",
    borderBottom: "1px solid #334155",
  },
  scoreValue: {
    width: 72,
    height: 72,
    borderRadius: "50%",
    background: "conic-gradient(#38bdf8 0deg 300deg, #334155 300deg 360deg)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
    fontWeight: 700,
    color: "#f8fafc",
  },
  checkList: {
    padding: "12px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  checkItem: {
    display: "flex",
    gap: 8,
    fontSize: 13,
    color: "#cbd5e1",
  },
  versionList: {
    padding: "12px 16px",
  },
  versionItem: {
    display: "flex",
    justifyContent: "space-between",
    padding: "6px 0",
    fontSize: 13,
  },
  versionTag: {
    color: "#38bdf8",
    fontWeight: 600,
  },
  versionDate: {
    color: "#64748b",
  },
  emptyHint: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
    padding: 12,
  },
};
