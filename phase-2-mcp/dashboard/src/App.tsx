import { useState } from "react";
import McpServerStatus from "./components/McpServerStatus";
import ToolCallLog from "./components/ToolCallLog";
import ChatStream from "./components/ChatStream";

export default function App() {
  const [tab, setTab] = useState<"servers" | "tools" | "chat">("servers");

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold mb-4">🕸️ Agent 调试面板</h1>
      <div className="flex gap-2 mb-6">
        {(["servers", "tools", "chat"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              tab === t ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {{ servers: "🔌 MCP Servers", tools: "🔧 Tool Calls", chat: "💬 Chat" }[t]}
          </button>
        ))}
      </div>
      <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
        {{ servers: <McpServerStatus />, tools: <ToolCallLog />, chat: <ChatStream /> }[tab]}
      </div>
    </div>
  );
}
