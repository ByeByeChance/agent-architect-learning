import { useState } from "react";

const mockCalls = [
  { id: "1", tool: "get_weather", params: { city: "北京" }, result: "晴，25°C，湿度 40%", status: "success" as const, duration: 234 },
  { id: "2", tool: "get_weather", params: { city: "上海" }, result: "多云，28°C，湿度 65%", status: "success" as const, duration: 198 },
  { id: "3", tool: "search_files", params: { pattern: "index.ts" }, result: "找到 3 个文件: ...", status: "success" as const, duration: 456 },
];

export default function ToolCallLog() {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Tool Call 日志</h2>
      <div className="space-y-2">
        {mockCalls.map((call) => (
          <ToolCallCard key={call.id} call={call} />
        ))}
      </div>
    </div>
  );
}

function ToolCallCard({ call }: { call: typeof mockCalls[0] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-750" onClick={() => setExpanded(!expanded)}>
        <span>{call.status === "success" ? "✅" : "❌"}</span>
        <span className="font-mono text-sm text-blue-400">{call.tool}</span>
        <span className="text-xs text-gray-500 flex-1">
          {Object.entries(call.params).map(([k, v]) => `${k}=${v}`).join(", ")}
        </span>
        <span className="text-xs text-gray-600">{call.duration}ms</span>
      </div>
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-700">
          <div className="mt-2">
            <span className="text-xs text-gray-500">参数:</span>
            <pre className="text-xs mt-1 bg-gray-900 p-2 rounded">{JSON.stringify(call.params, null, 2)}</pre>
          </div>
          <div className="mt-2">
            <span className="text-xs text-gray-500">结果:</span>
            <pre className="text-xs mt-1 bg-gray-900 p-2 rounded">{call.result}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
