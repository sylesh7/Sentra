import { describe, it, expect } from "vitest";
import { summarizeLocalHistory } from "../pipeline/passport/index.js";
import type { TrustReceipt } from "../pipeline/planner/receipt.js";

const WALLET = "0x000000000000000000000000000000000000dEaD" as const;

// Minimal receipt fixtures -- only the fields summarizeLocalHistory reads.
function receipt(partial: Partial<TrustReceipt>): TrustReceipt {
  return {
    version: "TrustReceipt/v0",
    scenario: null,
    counterparty: WALLET,
    counterpartyAgentId: "8017",
    action: { type: "payment", asset: "ETH", amount: "0.001" },
    layers: {
      provenance: { status: "SIGNED_VERIFIED", scrutiny: "normal_scrutiny" },
      quorum: { agreement: "AGREE", agree: 2, of: 2, disagreement: false },
      identity: { status: "registered", registryChain: "eip155:84532:0x", agentId: "8017" },
      policy: { result: "allow", reasons: [] },
    },
    verdict: "PASS",
    reason: "ok",
    timestamp: 0,
    receiptId: "0x00",
    signer: WALLET,
    signature: "0x00",
    ...partial,
  } as TrustReceipt;
}

describe("Trust Passport local history aggregation", () => {
  it("counts passes and blocks for the matching agentId and returns the latest attestation", () => {
    const receipts = [
      receipt({ receiptId: "0xaa", verdict: "PASS", timestamp: 100 }),
      receipt({ receiptId: "0xbb", verdict: "FAIL", timestamp: 200 }),
      receipt({ receiptId: "0xcc", verdict: "PASS", timestamp: 300 }),
    ];
    const h = summarizeLocalHistory(8017n, WALLET, receipts);
    expect(h.totalChecks).toBe(3);
    expect(h.passed).toBe(2);
    expect(h.blocked).toBe(1);
    expect(h.lastAttestation).toBe("0xcc"); // highest timestamp
  });

  it("ignores receipts for a different agent (no cross-contamination)", () => {
    const receipts = [
      receipt({ receiptId: "0xaa", counterpartyAgentId: "8017", counterparty: WALLET }),
      receipt({ receiptId: "0xbb", counterpartyAgentId: "9999", counterparty: "0x1111111111111111111111111111111111111111" }),
    ];
    const h = summarizeLocalHistory(8017n, WALLET, receipts);
    expect(h.totalChecks).toBe(1);
    expect(h.lastAttestation).toBe("0xaa");
  });

  it("matches on resolved wallet even when agentId is absent on the receipt", () => {
    const receipts = [receipt({ receiptId: "0xaa", counterpartyAgentId: null, counterparty: WALLET })];
    const h = summarizeLocalHistory(8017n, WALLET, receipts);
    expect(h.totalChecks).toBe(1);
  });

  it("returns an empty, honest summary when no receipts match", () => {
    const h = summarizeLocalHistory(8017n, WALLET, []);
    expect(h).toEqual({ totalChecks: 0, passed: 0, blocked: 0, lastAttestation: null });
  });
});
