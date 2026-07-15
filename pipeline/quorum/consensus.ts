import { extractPaymentFields } from "../quarantine/reader.js";
import type { ExtractedPaymentFields, PageContent, SourcedField } from "../quarantine/types.js";
import type { QuorumMemberFailure, QuorumMemberResult, QuorumVerdict } from "./types.js";

/** Minimum successful responses needed to evaluate agreement at all. */
const MIN_QUORUM_MEMBERS = 2;

/**
 * Two model sets, both genuinely heterogeneous (different labs, different weights) --
 * pick based on whether the OpenRouter key has paid credits.
 *
 * FREE_QUORUM_MODELS costs $0 (OpenRouter's `:free` tier) and is the DEFAULT, because a
 * quorum that only works when a wallet has a positive balance defeats the point of a
 * fail-closed trust firewall. Two real, distinct constraints observed live while
 * choosing these three -- both documented here because they look like bugs until you
 * know they're OpenRouter policy, not this codebase's fault:
 *
 *   1. Per-request: several other free models (most of the Meta/Qwen/Venice-served
 *      ones) return upstream 429s under normal load and were excluded for that reason.
 *   2. Per-day, account-wide, and the one that actually matters for planning capacity:
 *      OpenRouter caps a $0-balance key at 50 free-tier requests/DAY across ALL
 *      `:free` models combined, resetting at 00:00 UTC. Adding as little as $10 of
 *      credit raises that to 1000/day -- confirmed directly from OpenRouter's own 429
 *      response ("Rate limit exceeded: free-models-per-day. Add 10 credits to unlock
 *      1000 free model requests per day"). A 3-model quorum burns 3 of the 50 per
 *      pipeline run, so ~16 runs/day is the real ceiling on an unfunded key. This is
 *      fine for demo/dev use, NOT enough for a live ASP taking real traffic -- add
 *      credits (even a small amount unlocks the 1000/day tier) before relying on this
 *      in production, and/or switch to PAID_QUORUM_MODELS below, which has no
 *      analogous per-day request cap, only normal per-token billing.
 */
export const FREE_QUORUM_MODELS = [
  "tencent/hy3:free",
  "cohere/north-mini-code:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
];

export const PAID_QUORUM_MODELS = [
  "anthropic/claude-haiku-4.5",
  "openai/gpt-4.1-mini",
  "google/gemini-3.5-flash",
];

export const DEFAULT_QUORUM_MODELS = FREE_QUORUM_MODELS;

function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Some models redundantly repeat the currency inside the amount field despite currency
 * already being a separate field (observed live: cohere/north-mini-code returning
 * "0.0012 ETH" while other models correctly returned bare "0.0012" for the same page).
 * Extracting the leading numeric substring means that formatting quirk doesn't
 * manufacture a false DISAGREE -- a genuinely different NUMBER still disagrees.
 */
function normalizeAmountValue(value: string): string {
  const match = value.trim().match(/^-?\d+(\.\d+)?/);
  return match ? match[0] : normalizeValue(value);
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
function fieldsAgree(a: SourcedField | null, b: SourcedField | null, fieldName: "recipientAddress" | "amount" | "currency"): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  const normalize = fieldName === "amount" ? normalizeAmountValue : normalizeValue;
  return normalize(a.value) === normalize(b.value) && a.source === b.source;
}

function describeField(f: SourcedField | null): string {
  return f ? `"${f.value}" (${f.source})` : "null";
}

/**
 * Pure comparison logic, deliberately separated from the network calls so it can be
 * exercised directly in tests without hitting OpenRouter.
 */
export function compareQuorumMembers(
  members: QuorumMemberResult[],
  failures: QuorumMemberFailure[] = [],
): QuorumVerdict {
  if (members.length < MIN_QUORUM_MEMBERS) {
    throw new Error(`quorum requires at least ${MIN_QUORUM_MEMBERS} members to compare`);
  }

  const [first, ...rest] = members;
  const reasons: string[] = [];

  for (const other of rest) {
    if (!fieldsAgree(first.fields.recipientAddress, other.fields.recipientAddress, "recipientAddress")) {
      reasons.push(
        `recipientAddress disagreement: ${first.model}=${describeField(first.fields.recipientAddress)} vs ${other.model}=${describeField(other.fields.recipientAddress)}`,
      );
    }
    if (!fieldsAgree(first.fields.amount, other.fields.amount, "amount")) {
      reasons.push(
        `amount disagreement: ${first.model}=${describeField(first.fields.amount)} vs ${other.model}=${describeField(other.fields.amount)}`,
      );
    }
    if (!fieldsAgree(first.fields.currency, other.fields.currency, "currency")) {
      reasons.push(
        `currency disagreement: ${first.model}=${describeField(first.fields.currency)} vs ${other.model}=${describeField(other.fields.currency)}`,
      );
    }
  }

  if (reasons.length > 0) {
    return { agreement: "DISAGREE", members, failures, consensusFields: null, reasons };
  }

  // Every member agreed on both value and source for every field -- consensusFields can
  // be the first member's fields verbatim, EXCEPT amount: normalize its stored value to
  // the bare numeric string so a downstream parseEther() never trips on a redundant unit
  // suffix some model happened to include, regardless of which member ended up "first".
  const consensusFields: ExtractedPaymentFields = {
    recipientAddress: first.fields.recipientAddress,
    amount: first.fields.amount ? { ...first.fields.amount, value: normalizeAmountValue(first.fields.amount.value) } : null,
    currency: first.fields.currency,
    reasoning: `Quorum of ${members.length} models (${members.map((m) => m.model).join(", ")}) agreed on all fields, including source classification.`,
  };

  return {
    agreement: "AGREE",
    members,
    failures,
    consensusFields,
    reasons: [`all ${members.length} models agreed on recipientAddress, amount, currency, and their sources`],
  };
}

/**
 * Runs every model independently and tolerates individual failures (a provider outage,
 * an exhausted API key, a single model timing out) without crashing the whole pipeline
 * -- this is a trust firewall, so an infrastructure hiccup MUST fail closed (a clean
 * UNAVAILABLE block) rather than throw an uncaught exception that takes the process
 * down or, worse, gets swallowed somewhere upstream into an accidental fail-open.
 */
export async function runQuorumExtraction(
  content: PageContent,
  models: string[] = DEFAULT_QUORUM_MODELS,
): Promise<QuorumVerdict> {
  const settled = await Promise.allSettled(
    models.map(async (model) => ({ model, fields: await extractPaymentFields(content, { model }) })),
  );

  const members: QuorumMemberResult[] = [];
  const failures: QuorumMemberFailure[] = [];
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    if (result.status === "fulfilled") {
      members.push(result.value);
    } else {
      failures.push({ model: models[i], error: (result.reason as Error)?.message ?? String(result.reason) });
    }
  }

  if (members.length < MIN_QUORUM_MEMBERS) {
    return {
      agreement: "UNAVAILABLE",
      members,
      failures,
      consensusFields: null,
      reasons: [
        `only ${members.length}/${models.length} quorum members responded (need at least ${MIN_QUORUM_MEMBERS}): ` +
          failures.map((f) => `${f.model}: ${f.error}`).join("; "),
      ],
    };
  }

  return compareQuorumMembers(members, failures);
}
