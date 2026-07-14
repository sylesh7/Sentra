import { describe, it, expect } from "vitest";
import { interpretExtraction } from "../pipeline/interpreter/policy.js";
import type { ExtractedPaymentFields } from "../pipeline/quarantine/types.js";

const visibleField = (value: string) => ({ value, source: "visible_text" as const });
const jsonLdField = (value: string) => ({ value, source: "json_ld" as const });

describe("L1c capability interpreter", () => {
  it("ALLOWs when every payment field came from visible text", () => {
    const fields: ExtractedPaymentFields = {
      recipientAddress: visibleField("0xABC"),
      amount: visibleField("0.0012"),
      currency: visibleField("ETH"),
    };
    const verdict = interpretExtraction(fields);
    expect(verdict.verdict).toBe("ALLOW");
  });

  it("DENYs when the amount came from JSON-LD -- the exact Campaign 1 exploit pattern", () => {
    const fields: ExtractedPaymentFields = {
      recipientAddress: visibleField("0xABC"),
      amount: jsonLdField("0.0012"),
      currency: visibleField("ETH"),
    };
    const verdict = interpretExtraction(fields);
    expect(verdict.verdict).toBe("DENY");
    expect(verdict.reasons.join(" ")).toMatch(/json_ld/);
  });

  it("DENYs when a required field is missing entirely", () => {
    const fields: ExtractedPaymentFields = {
      recipientAddress: visibleField("0xABC"),
      amount: null,
      currency: visibleField("ETH"),
    };
    const verdict = interpretExtraction(fields);
    expect(verdict.verdict).toBe("DENY");
    expect(verdict.reasons.join(" ")).toMatch(/not found/);
  });

  it("DENYs when recipient is hidden via CSS -- the exact Campaign 1/2 exploit pattern", () => {
    const fields: ExtractedPaymentFields = {
      recipientAddress: { value: "0xEVIL", source: "hidden_css" },
      amount: visibleField("0.0012"),
      currency: visibleField("ETH"),
    };
    const verdict = interpretExtraction(fields);
    expect(verdict.verdict).toBe("DENY");
    expect(verdict.reasons.join(" ")).toMatch(/hidden_css/);
  });
});
