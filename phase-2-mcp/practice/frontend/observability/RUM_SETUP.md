# 前端 RUM (Real User Monitoring) 方案

## 需要监控什么

| 指标 | 含义 | 目标 |
|---|---|---|
| FCP (First Contentful Paint) | 首次内容渲染时间 | < 1.8s |
| LCP (Largest Contentful Paint) | 最大内容渲染时间 | < 2.5s |
| INP (Interaction to Next Paint) | 交互延迟 | < 200ms |
| CLS (Cumulative Layout Shift) | 布局偏移 | < 0.1 |
| API Latency | API 响应时间 | < 500ms p95 |
| Tool Call Latency | Agent 工具调用延迟 | < 500ms |

## 推荐工具

- **web-vitals**（免费、接入简单）：Google 官方的 Core Web Vitals 采集库
- **Sentry**（异常 + 性能）：可同时追踪 JS 异常和页面性能
- **Datadog RUM**（功能全、付费）：适合企业级应用

## 在调试面板中集成

```typescript
import { onFCP, onLCP, onINP, onCLS } from "web-vitals";

// 在 App 入口处注册
onFCP(console.log);
onLCP(console.log);
onINP(console.log);
onCLS(console.log);
```

## 自定义 Metric：Tool Call 延迟

```typescript
const start = performance.now();
// ... 调用 MCP tool ...
const duration = performance.now() - start;
console.log(`[perf] tool_call.${toolName} = ${duration}ms`);
```
