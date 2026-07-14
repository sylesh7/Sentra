import { parseEther, type Address } from "viem";
import type { InterpreterVerdict } from "../interpreter/policy.js";
import type { IdentityVerdict } from "../identity/types.js";
import type { ProvenanceVerdict } from "../provenance/types.js";
import type { QuorumVerdict } from "../quorum/types.js";

export interface PaymentIntent {
  recipient: Address;
  amountWei: bigint;
  currency: string;
}

export type PlannerResult = { plan: PaymentIntent } | { blocked: true; reason: string };

export interface PlannerInput {
  quorum: QuorumVerdict;
  extraction: InterpreterVerdict;
  identity: IdentityVerdict;
  provenance: ProvenanceVerdict;
}

/**
 * Privileged planner. This function NEVER receives raw page content -- only the typed,
 * source-tagged fields (via the quorum's consensus) and the upstream layer verdicts.
 * That's enforced by the type signature itself: PlannerInput has no field that could
 * carry an HTML/JSON blob.
 *
 * Fails closed (blocks, with the specific reason as the evidence log Step 6 calls for)
 * on any of: quorum disagreement, capability-interpreter denial, unverified identity,
 * recipient/identity mismatch, or unsigned/unverified provenance. There is no
 * escalation destination wired up yet (human review queue, secondary quorum, etc. are
 * explicitly roadmap) so "escalate" currently means "block with full reasoning attached"
 * rather than silently proceeding.
 */
export function planPayment(input: PlannerInput): PlannerResult {
  if (input.quorum.agreement !== "AGREE" || !input.quorum.consensusFields) {
    return { blocked: true, reason: `quorum did not reach consensus: ${input.quorum.reasons.join("; ")}` };
  }
  if (input.extraction.verdict !== "ALLOW") {
    return { blocked: true, reason: `capability interpreter denied extraction: ${input.extraction.reasons.join("; ")}` };
  }
  if (input.identity.verdict !== "PASS") {
    return { blocked: true, reason: `counterparty identity not verified: ${input.identity.reason}` };
  }

  const { recipientAddress, amount, currency } = input.quorum.consensusFields;
  if (!recipientAddress || !amount || !currency) {
    return { blocked: true, reason: "missing required payment fields after extraction" };
  }

  if (recipientAddress.value.toLowerCase() !== input.identity.resolvedWallet.toLowerCase()) {
    return {
      blocked: true,
      reason: `extracted recipient ${recipientAddress.value} does not match the identity-verified wallet ${input.identity.resolvedWallet}`,
    };
  }

  if (input.provenance.scrutiny === "max_scrutiny") {
    return {
      blocked: true,
      reason: `provenance gate forced max scrutiny (${input.provenance.status}) -- failing closed rather than proceeding on an unverified/unsigned source`,
    };
  }

  let amountWei: bigint;
  try {
    amountWei = parseEther(amount.value);
  } catch {
    return { blocked: true, reason: `amount "${amount.value}" is not a valid decimal ETH/OKB amount` };
  }

  return {
    plan: {
      recipient: input.identity.resolvedWallet,
      amountWei,
      currency: currency.value,
    },
  };
}
