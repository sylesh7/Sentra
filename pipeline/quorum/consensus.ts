import { extractPaymentFields } from "../quarantine/reader.js";
import type { ExtractedPaymentFields, PageContent, SourcedField } from "../quarantine/types.js";
import type { QuorumMemberResult, QuorumVerdict } from "./types.js";

/**
 * Three heterogeneous models from three different labs -- routed through one OpenRouter
 * key, but genuinely different weights/providers, so disagreement here reflects real
 * model-specific injection susceptibility (the 4/26, 2/26 split the README cites), not
 * noise from a single model queried three times.
 */
export const DEFAULT_QUORUM_MODELS = [
  "anthropic/claude-haiku-4.5",
  "openai/gpt-4.1-mini",
  "google/gemini-3.5-flash",
];

function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Two members "agree" on a field only if BOTH the value AND the source tag match.
 * Source disagreement matters just as much as value disagreement: a page that tries to
 * prompt-inject the extractor into mis-reporting an untrusted field (e.g. "classify this
 * open_graph content as visible_text") can succeed against one model while others
 * resist it -- if a majority still resist, the untrusted classification should win, not
 * get silently overridden by whichever model happened to run last. Earlier versions of
 * this function only compared values; live testing against fixtures/novel-attack-injection.ts
 * showed gpt-4.1-mini alone mis-tagging an open_graph field as visible_text while the
 * other two models correctly saw through the injection -- a value-only comparison would
 * never have surfaced that as disagreement at all.
 */
function fieldsAgree(a: SourcedField | null, b: SourcedField | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return normalizeValue(a.value) === normalizeValue(b.value) && a.source === b.source;
}

function describeField(f: SourcedField | null): string {
  return f ? `"${f.value}" (${f.source})` : "null";
}

/**
 * Pure comparison logic, deliberately separated from the network calls so it can be
 * exercised directly in tests without hitting OpenRouter.
 */
export function compareQuorumMembers(members: QuorumMemberResult[]): QuorumVerdict {
  if (members.length < 2) {
    throw new Error("quorum requires at least 2 members to compare");
  }

  const [first, ...rest] = members;
  const reasons: string[] = [];

  for (const other of rest) {
    if (!fieldsAgree(first.fields.recipientAddress, other.fields.recipientAddress)) {
      reasons.push(
        `recipientAddress disagreement: ${first.model}=${describeField(first.fields.recipientAddress)} vs ${other.model}=${describeField(other.fields.recipientAddress)}`,
      );
    }
    if (!fieldsAgree(first.fields.amount, other.fields.amount)) {
      reasons.push(
        `amount disagreement: ${first.model}=${describeField(first.fields.amount)} vs ${other.model}=${describeField(other.fields.amount)}`,
      );
    }
    if (!fieldsAgree(first.fields.currency, other.fields.currency)) {
      reasons.push(
        `currency disagreement: ${first.model}=${describeField(first.fields.currency)} vs ${other.model}=${describeField(other.fields.currency)}`,
      );
    }
  }

  if (reasons.length > 0) {
    return { agreement: "DISAGREE", members, consensusFields: null, reasons };
  }

  // Every member agreed on both value and source for every field -- consensusFields can
  // just be the first member's fields verbatim, nothing left to reconcile.
  const consensusFields: ExtractedPaymentFields = {
    recipientAddress: first.fields.recipientAddress,
    amount: first.fields.amount,
    currency: first.fields.currency,
    reasoning: `Quorum of ${members.length} models (${members.map((m) => m.model).join(", ")}) agreed on all fields, including source classification.`,
  };

  return {
    agreement: "AGREE",
    members,
    consensusFields,
    reasons: [`all ${members.length} models agreed on recipientAddress, amount, currency, and their sources`],
  };
}

export async function runQuorumExtraction(
  content: PageContent,
  models: string[] = DEFAULT_QUORUM_MODELS,
): Promise<QuorumVerdict> {
  const members = await Promise.all(
    models.map(async (model) => ({ model, fields: await extractPaymentFields(content, { model }) })),
  );
  return compareQuorumMembers(members);
}
