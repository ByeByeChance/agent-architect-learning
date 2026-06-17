import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import path from "path";

const server = new McpServer({ name: "file-search-server", version: "1.0.0" });

const SEARCH_ROOT = process.env.SEARCH_ROOT || process.cwd();

function walk(dir: string, pattern: string, maxResults: number, results: string[]) {
  if (results.length >= maxResults) return;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (results.length >= maxResults) return;
    const full = path.join(dir, entry.name);
    if (entry.name.includes(pattern)) results.push(full);
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      walk(full, pattern, maxResults, results);
    }
  }
}

server.tool("search_files", "按文件名搜索文件（支持模糊匹配）", {
  pattern: z.string().describe("搜索关键词"),
  maxResults: z.number().default(20).describe("最大结果数"),
}, async ({ pattern, maxResults }) => {
  const results: string[] = [];
  walk(SEARCH_ROOT, pattern, maxResults, results);
  return {
    content: [{
      type: "text",
      text: results.length > 0
        ? `找到 ${results.length} 个文件:\n${results.join("\n")}`
        : `在 ${SEARCH_ROOT} 中未找到包含 "${pattern}" 的文件`,
    }],
  };
});

// 暴露搜索根目录为 resource
server.resource("search-root", "search://root", async () => ({
  contents: [{ uri: "search://root", text: SEARCH_ROOT, mimeType: "text/plain" }],
}));

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`File Search MCP Server running on stdio (root: ${SEARCH_ROOT})`);
