import { useState } from "react";

export default function ChatStream() {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    // TODO: 接入真实的 DeepSeek API + MCP tools
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "这是模拟回复。接入 MCP SDK 后可实现真正的 Tool Call 流式展示。" },
      ]);
      setLoading(false);
    }, 1000);
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Agent Chat</h2>
      <div className="h-96 overflow-y-auto space-y-3 mb-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-lg p-3 text-sm ${
              m.role === "user" ? "bg-blue-600" : "bg-gray-700"
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && <div className="text-sm text-gray-500">Agent 思考中...</div>}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="问点什么..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
        />
        <button onClick={send} disabled={loading}
          className="px-4 py-2 bg-blue-600 rounded text-sm disabled:opacity-50">
          发送
        </button>
      </div>
    </div>
  );
}
