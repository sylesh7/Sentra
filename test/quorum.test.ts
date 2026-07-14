import { describe, it, expect } from "vitest";
import { compareQuorumMembers } from "../pipeline/quorum/consensus.js";
import type { QuorumMemberResult } from "../pipeline/quorum/types.js";

const visibleField = (value: string) => ({ value, source: "visible_text" as const });
const jsonLdField = (value: string) => ({ value, source: "json_ld" as const });

describe("L1b quorum consensus (pure comparison logic)", () => {
  it("AGREEs when every model extracts the same values", () => {
    const members: QuorumMemberResult[] = [
      { model: "model-a", fields: { recipientAddress: visibleField("0xABC"), amount: visibleField("0.001"), currency: visibleField("ETH") } },
      { model: "model-b", fields: { recipientAddress: visibleField("0xABC"), amount: visibleField("0.001"), currency: visibleField("eth") } },
      { model: "model-c", fields: { recipientAddress: visibleField("0xabc"), amount: visibleField("0.001"), currency: visibleField("ETH") } },
    ];
    const verdict = compareQuorumMembers(members);
    expect(verdict.agreement).toBe("AGREE");
    expect(verdict.consensusFields?.recipientAddress?.value).toBe("0xABC");
  });

  it("DISAGREEs when models extract different recipient addresses (model-specific injection susceptibility)", () => {
    const members: QuorumMemberResult[] = [
      { model: "model-a", fields: { recipientAddress: visibleField("0xABC"), amount: visibleField("0.001"), currency: visibleField("ETH") } },
      { model: "model-b", fields: { recipientAddress: visibleField("0xEVIL"), amount: visibleField("0.001"), currency: visibleField("ETH") } },
    ];
    const verdict = compareQuorumMembers(members);
    expect(verdict.agreement).toBe("DISAGREE");
    expect(verdict.consensusFields).toBeNull();
    expect(verdict.reasons.join(" ")).toMatch(/recipientAddress disagreement/);
  });

  it("DISAGREEs when one model finds a field the other doesn't (a model resisted the injection)", () => {
    const members: QuorumMemberResult[] = [
      { model: "model-a", fields: { recipientAddress: jsonLdField("0xEVIL"), amount: jsonLdField("0.001"), currency: jsonLdField("ETH") } },
      { model: "model-b", fields: { recipientAddress: null, amount: null, currency: null } },
    ];
    const verdict = compareQuorumMembers(members);
    expect(verdict.agreement).toBe("DISAGREE");
  });

  it("DISAGREEs on source-tag mismatch even when the value matches -- one model got prompt-injected into mis-tagging", () => {
    // This is the exact shape observed live against fixtures/novel-attack-injection.ts:
    // gpt-4.1-mini alone was talked into reporting an open_graph field as visible_text
    // while the other two models correctly resisted. A value-only comparison would miss
    // this entirely; source must be part of "agreement" too.
    const members: QuorumMemberResult[] = [
      { model: "model-a", fields: { recipientAddress: visibleField("0xABC"), amount: visibleField("0.001"), currency: visibleField("ETH") } },
      { model: "model-b", fields: { recipientAddress: jsonLdField("0xABC"), amount: visibleField("0.001"), currency: visibleField("ETH") } },
    ];
    const verdict = compareQuorumMembers(members);
    expect(verdict.agreement).toBe("DISAGREE");
    expect(verdict.consensusFields).toBeNull();
    expect(verdict.reasons.join(" ")).toMatch(/recipientAddress disagreement/);
  });

  it("AGREEs and preserves the shared source tag when every model matches on both value and source", () => {
    const members: QuorumMemberResult[] = [
      { model: "model-a", fields: { recipientAddress: jsonLdField("0xABC"), amount: jsonLdField("0.001"), currency: jsonLdField("ETH") } },
      { model: "model-b", fields: { recipientAddress: jsonLdField("0xABC"), amount: jsonLdField("0.001"), currency: jsonLdField("ETH") } },
    ];
    const verdict = compareQuorumMembers(members);
    expect(verdict.agreement).toBe("AGREE");
    expect(verdict.consensusFields?.recipientAddress?.source).toBe("json_ld");
  });
});
