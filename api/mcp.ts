import type { VercelRequest, VercelResponse } from "@vercel/node";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createGetTrustServer } from "../services/mcp/getTrustTool.js";

// Real 300s ceiling on Vercel Hobby with Fluid Compute (default, on by default) -- real
// getTrust() calls (LLM quorum + on-chain reads + a live HTTP fetch) run 10-20s, well
// within this. Set explicitly rather than relying on the platform default.
export const config = { maxDuration: 300 };

/**
 * Vercel serverless function entry point for Sentra's MCP tool surface. Same tool
 * definition as the local dev server (services/mcp/server.ts) -- both build a fresh
 * McpServer via createGetTrustServer() per request, since VercelRequest/VercelResponse
 * are real IncomingMessage/ServerResponse extensions (Node's http types), which is
 * exactly what StreamableHTTPServerTransport.handleRequest expects.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET" && req.url === "/") {
    res.status(200).json({ service: "sentra-get-trust", status: "ok" });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
    return;
  }

  try {
    const server = createGetTrustServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (err) {
    console.error("Error handling MCP request:", err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
}
