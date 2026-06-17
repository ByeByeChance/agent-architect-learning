import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "weather-server", version: "1.0.0" });

const weatherDB: Record<string, string> = {
  北京: "晴，25°C，湿度 40%，风力 2 级",
  上海: "多云，28°C，湿度 65%，风力 3 级",
  深圳: "阵雨，30°C，湿度 80%，风力 1 级",
  杭州: "阴，22°C，湿度 55%，风力 2 级",
  成都: "晴转多云，26°C，湿度 50%，风力 1 级",
};

server.tool("get_weather", "获取指定城市的当前天气信息", {
  city: z.string().describe("城市名称，如 '北京'"),
}, async ({ city }) => {
  const result = weatherDB[city] || `${city}: 暂未收录该城市天气数据`;
  return { content: [{ type: "text", text: result }] };
});

server.tool("list_cities", "列出所有支持的城市", {}, async () => {
  const cities = Object.keys(weatherDB).join("、");
  return { content: [{ type: "text", text: `支持的城市：${cities}` }] };
});

// 暴露城市列表为 resource
server.resource("cities", "weather://cities", async () => ({
  contents: [{
    uri: "weather://cities",
    text: Object.keys(weatherDB).join(", "),
    mimeType: "text/plain",
  }],
}));

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Weather MCP Server running on stdio");
