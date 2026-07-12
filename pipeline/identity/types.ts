import { z } from "zod";

/**
 * ERC-8004 agentRegistry identifiers are CAIP-350-style strings:
 * "{namespace}:{chainId}:{identityRegistryAddress}", e.g. "eip155:84532:0x8004...".
 */
export const agentRegistryRefSchema = z.string().regex(/^eip155:\d+:0x[a-fA-F0-9]{40}$/);

export const registrationEntrySchema = z.object({
  agentId: z.number().or(z.string()),
  agentRegistry: agentRegistryRefSchema,
});

/** Structure required by ERC-8004 EIP-8004#registration-v1 for the agentURI-hosted file. */
export const registrationFileSchema = z.object({
  type: z.string(),
  name: z.string(),
  description: z.string(),
  image: z.string().optional(),
  services: z.array(z.record(z.string(), z.unknown())).optional(),
  x402Support: z.boolean().optional(),
  active: z.boolean().optional(),
  registrations: z.array(registrationEntrySchema).default([]),
  supportedTrust: z.array(z.string()).optional(),
});
export type RegistrationFile = z.infer<typeof registrationFileSchema>;

/** Shape of the domain-control proof file at https://{domain}/.well-known/agent-card.json */
export const agentCardSchema = z.object({
  registrations: z.array(registrationEntrySchema).default([]),
});
export type AgentCard = z.infer<typeof agentCardSchema>;

export interface OnChainAgentRecord {
  agentId: bigint;
  owner: `0x${string}`;
  agentWallet: `0x${string}` | null;
  agentURI: string;
}

export type IdentityVerdict =
  | { verdict: "PASS"; agentId: bigint; resolvedWallet: `0x${string}`; evidence: Record<string, unknown> }
  | { verdict: "REJECT"; reason: string; evidence: Record<string, unknown> };
