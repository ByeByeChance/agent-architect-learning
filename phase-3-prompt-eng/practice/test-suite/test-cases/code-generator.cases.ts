/**
 * Code Generator Prompt 测试用例
 */

import { TestCase } from "./code-reviewer.cases.js";

export const CODE_GENERATOR_CASES: TestCase[] = [
  // ===== 格式测试 =====
  {
    id: "CG-001",
    description: "输出必须包含「方案简述」「代码」「使用示例」「注意事项」",
    tests: ["输出格式约束"],
    input: "写一个 React hook：useDebounce",
    assert: {
      containsAll: ["方案简述", "代码", "使用示例", "注意事项"],
    },
    tags: ["format", "regression"],
  },
  {
    id: "CG-002",
    description: "代码必须有文件路径注释",
    tests: ["文件路径注释"],
    input: "写一个工具函数：formatDate",
    assert: {
      containsAll: [".ts", ".tsx"],
      minLength: 100,
    },
    tags: ["format"],
  },

  // ===== 代码质量测试 =====
  {
    id: "CG-003",
    description: "不使用 any 类型",
    tests: ["不使用 any 类型"],
    input: "写一个函数：从 API 获取用户数据并返回",
    assert: {
      notContains: [": any", "as any", "<any>"],
      containsAll: ["User", "interface", "type"],
    },
    tags: ["quality", "regression"],
  },
  {
    id: "CG-004",
    description: "函数不超过 20 行",
    tests: ["函数不超过 20 行"],
    input: "写一个 React 组件：用户注册表单（包含姓名、邮箱、密码）",
    assert: {
      minLength: 200,
      maxLength: 3000,
    },
    tags: ["quality"],
  },

  // ===== 类型安全测试 =====
  {
    id: "CG-005",
    description: "使用 TypeScript 严格模式特性",
    tests: ["TypeScript 严格模式"],
    input: "写一个通用的 API 请求封装函数",
    assert: {
      containsAll: ["Promise", "type", "interface", "Error"],
      notContains: ["any"],
    },
    tags: ["quality", "regression"],
  },
  {
    id: "CG-006",
    description: "外部输入有 try-catch 错误处理",
    tests: ["外部输入必须 try-catch"],
    input: "写一个函数：从 localStorage 读取用户设置并解析 JSON",
    assert: {
      containsAll: ["try", "catch", "JSON.parse"],
    },
    tags: ["quality"],
  },

  // ===== 行为测试 =====
  {
    id: "CG-007",
    description: "不引入不必要的依赖",
    tests: ["不引入新包除非必要"],
    input: "写一个函数：将数组按指定 key 分组",
    assert: {
      notContains: ["npm install", "yarn add", "pnpm add"],
      containsAll: ["function", "reduce", "Map"],
    },
    tags: ["behavior"],
  },
  {
    id: "CG-008",
    description: "生成可运行的完整代码",
    tests: ["代码必须可以直接运行"],
    input: "写一个函数：检查字符串是否是有效的 email",
    assert: {
      containsAll: ["import", "export", "function", "return"],
    },
    tags: ["behavior", "regression"],
  },

  // ===== 边界测试 =====
  {
    id: "CG-009",
    description: "模糊需求应请求澄清",
    tests: ["生成代码前先问问题"],
    input: "写一个组件",
    assert: {
      minLength: 10,
    },
    tags: ["edge-case"],
  },
  {
    id: "CG-010",
    description: "复杂需求应拆分为多个函数",
    tests: ["函数不超过 20 行"],
    input: "写一个完整的用户管理系统（CRUD + 搜索 + 分页 + 排序）",
    assert: {
      minLength: 500,
      containsAll: ["interface", "function", "export"],
    },
    tags: ["edge-case"],
  },
];
