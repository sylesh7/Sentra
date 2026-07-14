import type { Address } from "viem";
import { getOnChainAgent, registryRef } from "./registry.js";
import { fetchAgentCard } from "./resolve.js";
import type { IdentityVerdict } from "./types.js";

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * L2 gate, entrypoint A: the caller already knows the claimed agentId (e.g. it was
 * embedded in the payment intent, or resolved by verifyCounterpartyByDomain below).
 * Verifies the agentId is actually minted on-chain and that its registered wallet
 * matches the wallet the payment intent wants to pay.
 */
export async function verifyCounterpartyByAgentId(
  agentId: bigint,
  claimedWallet: Address,
): Promise<IdentityVerdict> {
  const record = await getOnChainAgent(agentId);
  if (!record) {
    return {
      verdict: "REJECT",
      reason: `agentId ${agentId} is not registered on ${registryRef()}`,
      evidence: { agentId: agentId.toString(), registry: registryRef() },
    };
  }

  const resolvedWallet = record.agentWallet ?? record.owner;
  if (!sameAddress(resolvedWallet, claimedWallet)) {
    return {
      verdict: "REJECT",
      reason: `agentId ${agentId} resolves to ${resolvedWallet}, not the claimed payment wallet ${claimedWallet}`,
      evidence: {
        agentId: agentId.toString(),
        onChainWallet: resolvedWallet,
        claimedWallet,
        owner: record.owner,
        agentURI: record.agentURI,
      },
    };
  }

  return {
    verdict: "PASS",
    agentId,
    resolvedWallet,
    evidence: {
      agentId: agentId.toString(),
      owner: record.owner,
      agentWallet: record.agentWallet,
      agentURI: record.agentURI,
      registry: registryRef(),
    },
  };
}

/**
 * L2 gate, entrypoint B: the caller only has the source page's origin (e.g. straight
 * from the provenance check in L1a -- this is the realistic path for an arbitrary
 * incoming page, not just a pre-known agentId). Fetches
 * {originBaseUrl}/.well-known/agent-card.json -- fresh, every time, never trusting page
 * content -- and requires it to explicitly claim an agentId on OUR verified registry
 * (chain + contract address) before trusting anything further. An empty or missing
 * registrations[] is a REJECT, not a soft-pass: self-declared structured content proves
 * nothing on its own (this is the exact Campaign 1/2 exploit pattern from the Zscaler
 * report). Note this is still safe even if the ORIGIN is the attacker's own domain and
 * they fabricate a registrations[] entry: verifyCounterpartyByAgentId below cross-checks
 * the claimed agentId's real on-chain wallet against claimedWallet, so a fabricated
 * agentId claim only helps an attacker if they also happen to control that agentId's
 * real registered wallet.
 */
export async function verifyCounterpartyByDomain(
  originBaseUrl: string,
  claimedWallet: Address,
): Promise<IdentityVerdict> {
  let card;
  try {
    card = await fetchAgentCard(originBaseUrl);
  } catch (err) {
    return {
      verdict: "REJECT",
      reason: `could not fetch ${originBaseUrl}/.well-known/agent-card.json: ${(err as Error).message}`,
      evidence: { originBaseUrl },
    };
  }

  const match = card.registrations.find((r) => r.agentRegistry === registryRef());
  if (!match) {
    return {
      verdict: "REJECT",
      reason: `${originBaseUrl} does not present a registrations[] entry for ${registryRef()} -- no on-chain identity proof`,
      evidence: { originBaseUrl, registrations: card.registrations, expectedRegistry: registryRef() },
    };
  }

  const agentId = BigInt(match.agentId);
  const inner = await verifyCounterpartyByAgentId(agentId, claimedWallet);
  return {
    ...inner,
    evidence: { ...inner.evidence, originBaseUrl, sourcedFrom: new URL(".well-known/agent-card.json", originBaseUrl).toString() },
  };
}
