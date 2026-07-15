import { privateKeyToAccount } from "viem/accounts";
import { toECDSASigner } from "@zerodev/weighted-validator";
import { requireEnv } from "../../src/config/env.js";
import { createPartyClient } from "./cosign.js";
import type { WeightedPaymentAccountConfig } from "./weightedAccount.js";

/** The two persistent parties for the attestation-gated payment account. */
export function getPersistentConfig(): WeightedPaymentAccountConfig {
  const agentAccount = privateKeyToAccount(requireEnv("AGENT_SESSION_PRIVATE_KEY"));
  const sentraAccount = privateKeyToAccount(requireEnv("SENTRA_ATTESTATION_PRIVATE_KEY"));
  return {
    sessionKeyAddress: agentAccount.address,
    sentraAttestationAddress: sentraAccount.address,
  };
}

export async function connectAsAgent(knownAddress?: `0x${string}`) {
  const agentAccount = privateKeyToAccount(requireEnv("AGENT_SESSION_PRIVATE_KEY"));
  const signer = await toECDSASigner({ signer: agentAccount });
  return createPartyClient(signer, getPersistentConfig(), knownAddress);
}

export async function connectAsSentra(knownAddress?: `0x${string}`) {
  const sentraAccount = privateKeyToAccount(requireEnv("SENTRA_ATTESTATION_PRIVATE_KEY"));
  const signer = await toECDSASigner({ signer: sentraAccount });
  return createPartyClient(signer, getPersistentConfig(), knownAddress);
}
