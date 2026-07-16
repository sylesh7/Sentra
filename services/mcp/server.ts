import type { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { createGetTrustServer } from "./getTrustTool.js";

/**
 * Local dev server: `npm run mcp:serve` -> http://127.0.0.1:8787/mcp. For the real
 * public deployment target (Vercel), see api/mcp.ts, which wraps the SAME
 * createGetTrustServer() tool definition in a Vercel serverless function handler
 * instead of a persistent Express app. See docs/mcp-server.md.
 */
export function createGetTrustApp() {
  const app = createMcpExpressApp({ host: process.env.MCP_HOST ?? "127.0.0.1" });

  app.get("/", (_req: Request, res: Response) => {
    res.json({ service: "sentra-get-trust", status: "ok" });
  });

  // Stateless: a fresh server + transport per request, matching the official SDK's
  // simpleStatelessStreamableHttp.ts example -- each getTrust call is independent, so
  // there's no session state worth keeping between requests.
  app.post("/mcp", async (req: Request, res: Response) => {
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
  });

  app.get("/mcp", (_req: Request, res: Response) => {
    res.writeHead(405).end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }));
  });

  app.delete("/mcp", (_req: Request, res: Response) => {
    res.writeHead(405).end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }));
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = createGetTrustApp();
  const port = Number(process.env.MCP_PORT ?? 8787);
  app.listen(port, () => {
    console.log(`Sentra getTrust MCP server listening on http://127.0.0.1:${port}/mcp`);
  });
}
