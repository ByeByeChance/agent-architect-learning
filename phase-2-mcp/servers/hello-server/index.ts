import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "hello-server", version: "1.0.0" });

server.tool("hello", "向某人问好", {
  name: z.string().describe("要问候的名字"),
}, async ({ name }) => {
  return {
    content: [{ type: "text", text: `Hello, ${name}! 👋` }],
  };
});

server.tool("echo", "回显输入内容", {
  message: z.string().describe("要回显的内容"),
}, async ({ message }) => {
  return {
    content: [{ type: "text", text: `Echo: ${message}` }],
  };
});

// 暴露一个简单的 resource
server.resource("greeting", "hello://greeting", async () => ({
  contents: [{
    uri: "hello://greeting",
    text: "Welcome to Hello MCP Server!",
    mimeType: "text/plain",
  }],
}));

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Hello MCP Server running on stdio");
