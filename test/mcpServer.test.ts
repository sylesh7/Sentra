import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server as HttpServer } from "node:http";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createGetTrustApp } from "../services/mcp/server.js";
import { generateEd25519KeyPair } from "../pipeline/provenance/keys.js";
import { buildDirectory } from "../pipeline/provenance/directory.js";
import { signFixtureResponse } from "../pipeline/provenance/sign.js";
import { registryRef } from "../pipeline/identity/registry.js";

const REAL_AGENT_ID = 8017;
const REAL_AGENT_WALLET = "0xddF476D86Afd5E2075B8C95cbfFD3d76aEfa4b6B";

const LEGIT_INVOICE_HTML = `<!DOCTYPE html>
<html><body>
<h1>Invoice #2001 — API Access Renewal</h1>
<p>Amount due: 0.0012 ETH</p>
<p>Currency: ETH</p>
<p>Pay to: ${REAL_AGENT_WALLET}</p>
</body></html>`;

/**
 * Real, over-the-wire test: a real MCP client, connected over real HTTP (Streamable
 * HTTP transport, the actual protocol), to the actual `services/mcp/server.ts` app,
 * calling the actual `getTrust` tool -- which itself does a real HTTP fetch of a real
 * signed local origin, real LLM quorum calls, and a real on-chain identity check. No
 * layer of this test is mocked; only the "origin website" is a local stand-in server,
 * exactly like every other test in this repo.
 */
let mcpApp: ReturnType<typeof createGetTrustApp>;
let mcpServer: HttpServer;
let mcpUrl: string;

let originServer: HttpServer;
let originBaseUrl: string;

beforeAll(async () => {
  const keys = await generateEd25519KeyPair();
  const signed = await signFixtureResponse({ status: 200, contentType: "text/html", body: LEGIT_INVOICE_HTML, keypair: keys });

  originServer = createServer((req, res) => {
    if (req.url === "/.well-known/http-message-signatures-directory") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(buildDirectory(keys.publicJwk)));
      return;
    }
    if (req.url === "/.well-known/agent-card.json") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ registrations: [{ agentId: REAL_AGENT_ID, agentRegistry: registryRef() }] }));
      return;
    }
    if (req.url === "/invoice") {
      res.writeHead(signed.status, signed.headers);
      res.end(signed.body);
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => originServer.listen(0, "127.0.0.1", resolve));
  originBaseUrl = `http://127.0.0.1:${(originServer.address() as { port: number }).port}`;

  mcpApp = createGetTrustApp();
  mcpServer = mcpApp.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => mcpServer.once("listening", resolve));
  const mcpPort = (mcpServer.address() as { port: number }).port;
  mcpUrl = `http://127.0.0.1:${mcpPort}/mcp`;
}, 30_000);

afterAll(async () => {
  await new Promise((resolve) => originServer.close(resolve));
  await new Promise((resolve) => mcpServer.close(resolve));
});

describe("MCP server -- real client, real HTTP, real tool call", () => {
  it("lists getTrust as an available tool", async () => {
    const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
    await client.connect(transport);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name)).toContain("getTrust");
    } finally {
      await client.close();
    }
  }, 30_000);

  it("calling getTrust over real MCP returns a real PASS for a real signed invoice", async () => {
    const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
    await client.connect(transport);
    try {
      const result = await client.callTool({
        name: "getTrust",
        arguments: {
          recipient: REAL_AGENT_WALLET,
          amount: "0.0012",
          currency: "ETH",
          source_url: `${originBaseUrl}/invoice`,
        },
      });
      expect(result.isError).toBeFalsy();
      const content = (result.content as { type: string; text: string }[])[0];
      const parsed = JSON.parse(content.text);
      expect(parsed.verdict).toBe("PASS");
      expect(parsed.receipt.signer).toBeTruthy();
    } finally {
      await client.close();
    }
  }, 30_000);
});
