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

  it("carries provider failures through into the returned verdict without dropping them", () => {
    const members: QuorumMemberResult[] = [
      { model: "model-a", fields: { recipientAddress: visibleField("0xABC"), amount: visibleField("0.001"), currency: visibleField("ETH") } },
      { model: "model-b", fields: { recipientAddress: visibleField("0xABC"), amount: visibleField("0.001"), currency: visibleField("ETH") } },
    ];
    const failures = [{ model: "model-c", error: "OpenRouter account out of credits" }];
    const verdict = compareQuorumMembers(members, failures);
    expect(verdict.agreement).toBe("AGREE");
    expect(verdict.failures).toEqual(failures);
  });

  it("refuses to evaluate agreement with fewer than 2 members -- this is the invariant runQuorumExtraction relies on to fail closed", () => {
    const members: QuorumMemberResult[] = [
      { model: "model-a", fields: { recipientAddress: visibleField("0xABC"), amount: visibleField("0.001"), currency: visibleField("ETH") } },
    ];
    expect(() => compareQuorumMembers(members)).toThrow(/at least 2 members/);
  });

  it("AGREEs on amount when one model redundantly includes the unit -- observed live from cohere/north-mini-code returning \"0.0012 ETH\" instead of \"0.0012\"", () => {
    const members: QuorumMemberResult[] = [
      { model: "model-a", fields: { recipientAddress: visibleField("0xABC"), amount: visibleField("0.0012"), currency: visibleField("ETH") } },
      { model: "model-b", fields: { recipientAddress: visibleField("0xABC"), amount: visibleField("0.0012 ETH"), currency: visibleField("ETH") } },
    ];
    const verdict = compareQuorumMembers(members);
    expect(verdict.agreement).toBe("AGREE");
    // Stored value is normalized to the bare number so a downstream parseEther() never
    // trips on a redundant unit suffix, regardless of which member happened to be "first".
    expect(verdict.consensusFields?.amount?.value).toBe("0.0012");
  });

  it("still DISAGREEs when the actual numeric amount differs, unit-suffix normalization aside", () => {
    const members: QuorumMemberResult[] = [
      { model: "model-a", fields: { recipientAddress: visibleField("0xABC"), amount: visibleField("0.0012"), currency: visibleField("ETH") } },
      { model: "model-b", fields: { recipientAddress: visibleField("0xABC"), amount: visibleField("5.0 ETH"), currency: visibleField("ETH") } },
    ];
    const verdict = compareQuorumMembers(members);
    expect(verdict.agreement).toBe("DISAGREE");
    expect(verdict.reasons.join(" ")).toMatch(/amount disagreement/);
  });
});
