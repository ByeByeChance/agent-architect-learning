const mockServers = [
  { name: "hello-server", version: "1.0.0", status: "connected", tools: ["hello", "echo"] },
  { name: "weather-server", version: "1.0.0", status: "connected", tools: ["get_weather", "list_cities"] },
  { name: "file-search-server", version: "1.0.0", status: "connected", tools: ["search_files"] },
];

export default function McpServerStatus() {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">已连接的 MCP Server</h2>
      <div className="space-y-3">
        {mockServers.map((s) => (
          <div key={s.name} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span className="font-mono text-sm">{s.name}</span>
                <span className="text-xs text-gray-500">v{s.version}</span>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-green-900 text-green-300">{s.status}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {s.tools.map((t) => (
                <span key={t} className="text-xs px-2 py-0.5 rounded bg-blue-900 text-blue-300 font-mono">
                  {t}()
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
