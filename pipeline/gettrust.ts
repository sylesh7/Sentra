import type { Address } from "viem";
import { verifyProvenance, type FetchedResponse } from "./provenance/verify.js";
import type { ProvenanceVerdict } from "./provenance/types.js";
import { runQuorumExtraction } from "./quorum/consensus.js";
import type { QuorumVerdict } from "./quorum/types.js";
import { interpretExtraction } from "./interpreter/policy.js";
import { verifyCounterpartyByDomain } from "./identity/verify.js";
import { planPayment, type PaymentIntent } from "./planner/plan.js";
import { issueTrustReceipt, persistReceipt, type TrustReceipt } from "./planner/receipt.js";
import { executePaymentIntentWithAttestation, type AttestationExecutionResult } from "./executor/executeWithAttestation.js";
import { parseHtmlToPageContent } from "./quarantine/parseContent.js";

export interface ProposedAction {
  recipient: Address;
  amount: string;
  currency: string;
}

export interface GetTrustInput {
  proposedAction: ProposedAction;
  sourceUrl: string;
  /**
   * Real L3 execution moves real (testnet) funds. Opt-in, defaults to false: a call
   * without this returns a decision + Trust Receipt only, exactly like `pipeline:run`
   * without `--execute`.
   */
  execute?: boolean;
}

export type GetTrustResult =
  | { verdict: "PASS"; reason: string; receipt: TrustReceipt; plan: PaymentIntent; execution?: AttestationExecutionResult }
  | { verdict: "FAIL"; reason: string; receipt: TrustReceipt };

const FETCH_TIMEOUT_MS = 10_000;

/**
 * Local-disk persistence (`.sentra-receipts/`) is a nice-to-have audit trail for
 * CLI/local-dev use (`npm run passport:show` reads it back) -- it is NOT something the
 * MCP caller needs, since the full signed receipt is already in the tool response
 * either way. On a read-only serverless filesystem (e.g. Vercel, where only /tmp is
 * writable) persistReceipt() throws ENOENT; that must never turn a real PASS/FAIL
 * verdict into a 500. Best-effort only: log and move on.
 */
function safePersistReceipt(receipt: TrustReceipt): void {
  try {
    persistReceipt(receipt);
  } catch (err) {
    console.warn(`Trust Receipt ${receipt.receiptId} could not be persisted to disk (non-fatal): ${(err as Error).message}`);
  }
}

function amountsMatch(a: string, b: string): boolean {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isNaN(na) || Number.isNaN(nb)) return a.trim() === b.trim();
  return na === nb;
}

/**
 * The pipeline's single entry point: proposed action + a URL to verify it against.
 *
 * Deliberately does NOT accept caller-supplied `source_content` -- it fetches
 * `sourceUrl` itself. Trusting a caller's claimed page content wholesale would reopen
 * exactly the hole this project exists to close (a compromised/lied-to caller could
 * hand over fabricated "content" and claim a signed origin). Fetching server-side is
 * also what makes the provenance signature check meaningful: RFC 9421 verification
 * needs real response headers, not a body string alone.
 *
 * The caller's `proposedAction` is never trusted outright either: Sentra independently
 * re-extracts recipient/amount/currency from the fetched content via the same Steps
 * 1-6 pipeline, and only PASSes if what it independently found both clears every layer
 * AND matches what the caller claimed. A mismatch is treated as a real signal (the
 * caller may already be acting on manipulated information) and fails closed.
 */
export async function getTrust(input: GetTrustInput): Promise<GetTrustResult> {
  const url = new URL(input.sourceUrl);
  const originBaseUrl = url.origin;

  let response: FetchedResponse;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(input.sourceUrl, { redirect: "follow", signal: controller.signal });
    clearTimeout(timeout);
    const body = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => (headers[key] = value));
    response = { status: res.status, headers, body };
  } catch (err) {
    return failClosed({
      reason: `could not fetch source_url: ${(err as Error).message}`,
      scenario: input.sourceUrl,
    });
  }

  const provenance = await verifyProvenance(response, originBaseUrl);
  const page = parseHtmlToPageContent(input.sourceUrl, response.body);
  const quorum = await runQuorumExtraction(page);

  const interpretation = quorum.consensusFields ? interpretExtraction(quorum.consensusFields) : undefined;

  const recipientField = quorum.consensusFields?.recipientAddress;
  const identity = recipientField
    ? await verifyCounterpartyByDomain(originBaseUrl, recipientField.value as Address)
    : undefined;

  if (!interpretation || !identity) {
    return failClosed({
      reason: quorum.reasons.join("; ") || "no consensus recipient to verify",
      scenario: input.sourceUrl,
      provenance,
      quorum,
    });
  }

  const planned = planPayment({ quorum, extraction: interpretation, identity, provenance });

  if ("blocked" in planned) {
    return failClosed({
      reason: planned.reason,
      scenario: input.sourceUrl,
      provenance,
      quorum,
      interpretation,
      identity,
    });
  }

  const { plan } = planned;

  // Cross-check the caller's claim against what Sentra independently found. This is a
  // REAL, additional gate beyond planPayment's own checks -- planPayment only verifies
  // internal consistency (extraction vs. identity); it has no notion of "what did the
  // caller say it was about to do." A caller acting on already-manipulated information
  // would still pass planPayment's checks if the manipulated version happens to be
  // internally consistent -- this catches that.
  const claimMatches =
    plan.recipient.toLowerCase() === input.proposedAction.recipient.toLowerCase() &&
    amountsMatch(input.proposedAction.amount, quorum.consensusFields!.amount!.value) &&
    input.proposedAction.currency.toLowerCase() === plan.currency.toLowerCase();

  if (!claimMatches) {
    return failClosed({
      reason:
        `proposed_action does not match what Sentra independently verified from source_url ` +
        `(claimed recipient=${input.proposedAction.recipient} amount=${input.proposedAction.amount} ${input.proposedAction.currency}; ` +
        `verified recipient=${plan.recipient} amount=${quorum.consensusFields!.amount!.value} ${plan.currency})`,
      scenario: input.sourceUrl,
      provenance,
      quorum,
      interpretation,
      identity,
      plan,
    });
  }

  const receipt = await issueTrustReceipt({
    scenario: input.sourceUrl,
    provenance,
    quorum,
    interpretation,
    identity,
    verdict: "PASS",
    reason: "All checks passed; counterparty verified via ERC-8004 Identity Registry; proposed_action matches independent extraction.",
    plan,
  });
  safePersistReceipt(receipt);

  let execution: AttestationExecutionResult | undefined;
  if (input.execute) {
    execution = await executePaymentIntentWithAttestation(plan);
  }

  return {
    verdict: "PASS",
    reason: receipt.reason,
    receipt,
    plan,
    execution,
  };
}

async function failClosed(params: {
  reason: string;
  scenario: string;
  provenance?: ProvenanceVerdict;
  quorum?: QuorumVerdict;
  interpretation?: ReturnType<typeof interpretExtraction>;
  identity?: Awaited<ReturnType<typeof verifyCounterpartyByDomain>>;
  plan?: PaymentIntent;
}): Promise<GetTrustResult> {
  const provenance: ProvenanceVerdict = params.provenance ?? {
    status: "UNSIGNED",
    scrutiny: "max_scrutiny",
    reason: params.reason,
    evidence: {},
  };
  const quorum: QuorumVerdict = params.quorum ?? {
    agreement: "UNAVAILABLE",
    members: [],
    failures: [],
    consensusFields: null,
    reasons: [params.reason],
  };

  const receipt = await issueTrustReceipt({
    scenario: params.scenario,
    provenance,
    quorum,
    interpretation: params.interpretation,
    identity: params.identity,
    verdict: "FAIL",
    reason: params.reason,
    plan: params.plan,
  });
  safePersistReceipt(receipt);

  return { verdict: "FAIL", reason: params.reason, receipt };
}
