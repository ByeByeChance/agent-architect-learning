/**
 * HITL Gate — Human-in-the-Loop 审批网关
 *
 * 设计理念（对应 theory/03 §3）：
 *   不是所有 Agent 决策都应该自动执行。高风险操作（删除/部署/支付）
 *   必须经过人类审批。HITL Gate 是 Agent 系统的"安全阀"。
 *
 * 运行：npm run hitl
 */

// ===== Types =====

interface HITLRequest {
  id: string;
  type: "APPROVAL" | "CHOICE" | "GUIDANCE";
  severity: "CRITICAL" | "WARNING" | "INFO";
  summary: string;
  details: {
    agent: string;
    action: string;
    risk: string;
    alternatives?: string[];
    context?: string;
  };
  timeout: number;
  defaultAction: "APPROVE" | "REJECT" | "DEFER";
  traceId: string;
  createdAt: number;
  status: "pending" | "approved" | "rejected" | "timeout";
  resolvedAt?: number;
}

interface RiskRule {
  pattern: RegExp | string;
  severity: HITLRequest["severity"];
  message: string;
}

// ===== Risk Assessment =====

const RISK_RULES: RiskRule[] = [
  { pattern: /delete|删除|DROP|rm -rf/i, severity: "CRITICAL", message: "包含删除操作" },
  { pattern: /deploy|部署|kubectl|terraform/i, severity: "CRITICAL", message: "包含部署操作" },
  { pattern: /payment|支付|charge|退款/i, severity: "CRITICAL", message: "涉及资金操作" },
  { pattern: /DROP TABLE|TRUNCATE|ALTER TABLE/i, severity: "CRITICAL", message: "包含数据库 DDL 操作" },
  { pattern: /password|密码|secret|token|密钥/i, severity: "WARNING", message: "涉及敏感信息" },
  { pattern: /npm publish|docker push|git push --force/i, severity: "WARNING", message: "包含发布操作" },
  { pattern: /export.*data|导出.*数据|dump/i, severity: "WARNING", message: "包含数据导出操作" },
  { pattern: /config|配置|\.env|settings/i, severity: "INFO", message: "涉及配置修改" },
];

function assessRisk(agentAction: string): HITLRequest["severity"] {
  for (const rule of RISK_RULES) {
    if (
      typeof rule.pattern === "string"
        ? agentAction.includes(rule.pattern)
        : rule.pattern.test(agentAction)
    ) {
      if (rule.severity === "CRITICAL") return "CRITICAL";
      if (rule.severity === "WARNING") return "WARNING";
    }
  }
  // 检查是否有任何匹配
  const hasMatch = RISK_RULES.some((r) =>
    typeof r.pattern === "string"
      ? agentAction.includes(r.pattern)
      : r.pattern.test(agentAction)
  );
  return hasMatch ? "INFO" : "INFO";
}

// ===== HITL Manager =====

class HITLManager {
  private pendingRequests: Map<string, HITLRequest> = new Map();
  private history: HITLRequest[] = [];
  private resolvers: Map<
    string,
    {
      resolve: (decision: string) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  > = new Map();

  /**
   * 检查 Agent 的拟执行动作是否需要人类审批
   */
  checkIfApprovalNeeded(
    agentName: string,
    action: string,
    alternatives?: string[]
  ): HITLRequest | null {
    const severity = assessRisk(action);

    // CRITICAL: 必须审批
    // WARNING:  建议审批
    // INFO:     自动通过
    if (severity === "INFO") return null;

    return {
      id: `hitl-${Date.now()}`,
      type: alternatives ? "CHOICE" : "APPROVAL",
      severity,
      summary: `${agentName} 拟执行: ${action.slice(0, 80)}`,
      details: {
        agent: agentName,
        action,
        risk: RISK_RULES.find((r) =>
          typeof r.pattern === "string"
            ? action.includes(r.pattern)
            : r.pattern.test(action)
        )?.message || "未知风险",
        alternatives,
      },
      timeout: severity === "CRITICAL" ? 60000 : 300000, // 1min vs 5min
      defaultAction: "REJECT",
      traceId: `trace-${Date.now()}`,
      createdAt: Date.now(),
      status: "pending",
    };
  }

  /**
   * 提交审批请求并等待用户决策
   */
  async requestApproval(request: HITLRequest): Promise<"APPROVED" | "REJECTED" | "TIMEOUT"> {
    this.pendingRequests.set(request.id, request);
    console.log(
      `\n   🚨 HITL: [${request.severity}] ${request.summary}`
    );
    console.log(`      风险: ${request.details.risk}`);
    console.log(`      默认操作: ${request.defaultAction} (${request.timeout / 1000}s 超时)`);

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this._resolveRequest(request.id, "TIMEOUT");
        resolve("TIMEOUT");
      }, request.timeout);

      this.resolvers.set(request.id, { resolve, timer });
    });
  }

  /** 用户做出决策 */
  userDecision(requestId: string, approved: boolean): void {
    const resolver = this.resolvers.get(requestId);
    if (!resolver) {
      console.log(`   ⚠️ 未找到审批请求: ${requestId}`);
      return;
    }

    clearTimeout(resolver.timer);
    this._resolveRequest(requestId, approved ? "APPROVED" : "REJECTED");
    resolver.resolve(approved ? "APPROVED" : "REJECTED");
  }

  private _resolveRequest(
    id: string,
    decision: "APPROVED" | "REJECTED" | "TIMEOUT"
  ): void {
    const request = this.pendingRequests.get(id);
    if (!request) return;

    const status =
      decision === "APPROVED"
        ? "approved"
        : decision === "REJECTED"
          ? "rejected"
          : "timeout";
    request.status = status as HITLRequest["status"];
    request.resolvedAt = Date.now();
    this.history.push(request);
    this.pendingRequests.delete(id);

    const emoji =
      decision === "APPROVED" ? "✅" : decision === "REJECTED" ? "❌" : "⏰";
    console.log(
      `   ${emoji} HITL ${id}: ${decision} (${request.resolvedAt! - request.createdAt}ms)`
    );
  }

  /** 获取统计 */
  stats(): {
    pending: number;
    approved: number;
    rejected: number;
    timeout: number;
  } {
    return {
      pending: this.pendingRequests.size,
      approved: this.history.filter((r) => r.status === "approved").length,
      rejected: this.history.filter((r) => r.status === "rejected").length,
      timeout: this.history.filter((r) => r.status === "timeout").length,
    };
  }
}

// ===== Demo =====

async function main() {
  console.log("\n🛡️  HITL Gate Demo\n");
  console.log("=".repeat(65));

  const hitl = new HITLManager();

  // 模拟 Agent 执行不同风险等级的操作
  const agentActions = [
    {
      agent: "code-generator",
      action: "生成 TypeScript 工具函数",
    },
    {
      agent: "code-reviewer",
      action: "审查 src/config.ts 配置文件的安全性",
    },
    {
      agent: "deployment-agent",
      action: "删除 /tmp/build 临时目录中的旧文件",
    },
    {
      agent: "db-admin",
      action: "DROP TABLE old_analytics_data CASCADE",
      alternatives: ["仅重命名表", "导出数据后再删除", "直接删除"],
    },
  ];

  for (const { agent, action, alternatives } of agentActions) {
    console.log(`\n📋 Agent: ${agent}`);
    console.log(`   动作: ${action}`);

    const request = hitl.checkIfApprovalNeeded(agent, action, alternatives);

    if (!request) {
      console.log("   ✅ 低风险，自动通过\n");
      continue;
    }

    // 需要审批
    if (request.severity === "CRITICAL") {
      // 模拟：CRITICAL 级别用户手动审批
      const decision = await hitl.requestApproval(request);
      // 模拟用户在 1 秒后做出决策
      setTimeout(() => {
        hitl.userDecision(request.id, action.includes("RENAME") ? true : false);
      }, 1000);
    } else {
      // WARNING 级别等待用户（演示中自动超时处理）
      const decision = await hitl.requestApproval(request);
    }
  }

  // 等待异步审批完成
  await new Promise((r) => setTimeout(r, 2000));

  // 统计
  console.log("\n" + "=".repeat(65));
  console.log("\n📊 HITL 统计\n");
  const stats = hitl.stats();
  console.log(`   待审批: ${stats.pending}`);
  console.log(`   已批准: ${stats.approved}`);
  console.log(`   已拒绝: ${stats.rejected}`);
  console.log(`   已超时: ${stats.timeout}`);
  console.log(
    `\n💡 HITL Gate 的基本原则：重操作必审批，轻操作自动过，超时有默认行为\n`
  );
}

main().catch((err) => {
  console.error("❌ HITL error:", err);
  process.exit(1);
});
