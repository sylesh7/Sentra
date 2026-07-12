import { describe, it, expect } from "vitest";
import { verifyCounterpartyByAgentId } from "../pipeline/identity/verify.js";

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
