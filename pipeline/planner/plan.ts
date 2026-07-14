import { parseEther, type Address } from "viem";
import type { InterpreterVerdict } from "../interpreter/policy.js";
import type { IdentityVerdict } from "../identity/types.js";
import type { ProvenanceVerdict } from "../provenance/types.js";
import type { ExtractedPaymentFields } from "../quarantine/types.js";

export interface PaymentIntent {
  recipient: Address;
  amountWei: bigint;
  currency: string;
}

export type PlannerResult = { plan: PaymentIntent } | { blocked: true; reason: string };

export interface PlannerInput {
  extraction: InterpreterVerdict;
  identity: IdentityVerdict;
  provenance: ProvenanceVerdict;
  fields: ExtractedPaymentFields;
}

/**
 * Privileged planner. This function NEVER receives raw page content -- only the typed,
 * source-tagged fields and the upstream layer verdicts. That's enforced by the type
 * signature itself: PlannerInput has no field that could carry an HTML/JSON blob.
 *
 * Cross-checks the extracted recipient against the L2 identity-verified wallet (the
 * README's "counterparty allow-list, cross-checked vs L2"), and currently fails closed
 * on unsigned/unverified provenance (max_scrutiny) -- Phase 4 replaces this with real
 * quorum-consensus escalation instead of a flat block.
 */
export function planPayment(input: PlannerInput): PlannerResult {
  if (input.extraction.verdict !== "ALLOW") {
    return { blocked: true, reason: `capability interpreter denied extraction: ${input.extraction.reasons.join("; ")}` };
  }
  if (input.identity.verdict !== "PASS") {
    return { blocked: true, reason: `counterparty identity not verified: ${input.identity.reason}` };
  }

  const { recipientAddress, amount, currency } = input.fields;
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
      reason:
        `provenance gate forced max scrutiny (${input.provenance.status}) and no quorum-escalation path is wired ` +
        `yet (Phase 4) -- failing closed rather than proceeding on an unverified/unsigned source`,
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
