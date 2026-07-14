import type { ExtractedPaymentFields, FieldSource, SourcedField } from "../quarantine/types.js";

export interface InterpreterVerdict {
  verdict: "ALLOW" | "DENY";
  reasons: string[];
  evidence: { fields: ExtractedPaymentFields };
}

/**
 * L1c capability interpreter -- deterministic policy code, NOT an LLM. This is the
 * design rule from the README made executable: content never gets trust because it
 * claims to be trustworthy (structured or not). Only fields sourced from plain visible
 * text may populate a payment-triggering action; JSON-LD, Open Graph, hidden-CSS, and
 * generic meta tags are exactly the exploit surface used in Zscaler Campaign 1 & 2, so
 * they are unconditionally rejected here regardless of what the value looks like.
 */
const TRUSTED_SOURCES: readonly FieldSource[] = ["visible_text"];

function checkField(name: string, field: SourcedField | null, reasons: string[]): void {
  if (!field) {
    reasons.push(`${name} was not found in the page content`);
    return;
  }
  if (!TRUSTED_SOURCES.includes(field.source)) {
    reasons.push(
      `${name} was sourced from '${field.source}', which is never trusted to populate a payment-triggering action`,
    );
  }
}

export function interpretExtraction(fields: ExtractedPaymentFields): InterpreterVerdict {
  const reasons: string[] = [];

  checkField("recipientAddress", fields.recipientAddress, reasons);
  checkField("amount", fields.amount, reasons);
  checkField("currency", fields.currency, reasons);

  if (reasons.length > 0) {
    return { verdict: "DENY", reasons, evidence: { fields } };
  }

  return {
    verdict: "ALLOW",
    reasons: ["recipientAddress, amount, and currency all sourced from visible_text"],
    evidence: { fields },
  };
}
