import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { verifyCounterpartyByAgentId, verifyCounterpartyByDomain } from "../pipeline/identity/verify.js";
import { registryRef } from "../pipeline/identity/registry.js";

// These are integration tests against the real, live ERC-8004 IdentityRegistry on
// Base Sepolia -- no mocks, per project policy. agentId 8017 is a real registered
// agent ("PCC Gateway") found on BaseScan Sepolia; if it's ever burned/transferred
// this test will need a fresh live agentId swapped in.
const REAL_AGENT_ID = 8017n;
const REAL_AGENT_WALLET = "0xddF476D86Afd5E2075B8C95cbfFD3d76aEfa4b6B" as const;

describe("verifyCounterpartyByAgentId (live Base Sepolia)", () => {
  it("PASSes for a real registered agentId with the matching on-chain wallet", async () => {
    const verdict = await verifyCounterpartyByAgentId(REAL_AGENT_ID, REAL_AGENT_WALLET);
    expect(verdict.verdict).toBe("PASS");
  }, 20000);

  it("REJECTs when the claimed wallet doesn't match the on-chain agent wallet", async () => {
    const verdict = await verifyCounterpartyByAgentId(
      REAL_AGENT_ID,
      "0x000000000000000000000000000000000000dEaD",
    );
    expect(verdict.verdict).toBe("REJECT");
  }, 20000);

  it("REJECTs for an agentId that was never minted", async () => {
    const verdict = await verifyCounterpartyByAgentId(
      999999999n,
      "0x000000000000000000000000000000000000dEaD",
    );
    expect(verdict.verdict).toBe("REJECT");
  }, 20000);
});

describe("verifyCounterpartyByDomain (real HTTP fetch + live Base Sepolia)", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/.well-known/agent-card.json") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ registrations: [{ agentId: Number(REAL_AGENT_ID), agentRegistry: registryRef() }] }));
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("PASSes when the origin's real agent-card.json claims a real agentId with a matching wallet", async () => {
    const verdict = await verifyCounterpartyByDomain(baseUrl, REAL_AGENT_WALLET);
    expect(verdict.verdict).toBe("PASS");
  }, 20000);

  it("REJECTs when the origin has no agent-card.json at all (the typosquat case)", async () => {
    const verdict = await verifyCounterpartyByDomain("http://127.0.0.1:1", REAL_AGENT_WALLET);
    expect(verdict.verdict).toBe("REJECT");
  }, 20000);

  it("REJECTs when the origin's agent-card.json claims a real agentId but the wallet doesn't match", async () => {
    const verdict = await verifyCounterpartyByDomain(baseUrl, "0x000000000000000000000000000000000000dEaD");
    expect(verdict.verdict).toBe("REJECT");
  }, 20000);
});
