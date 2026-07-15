import "dotenv/config";
import { z } from "zod";
import type { Address, Hex } from "viem";

const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "expected a 0x-prefixed 20-byte address");

const hexPrivateKeySchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "expected a 0x-prefixed 32-byte private key");

const envSchema = z.object({
  // Fallback chain (already working: ZeroDev Kernel + session keys, verified Day 2).
  BASE_SEPOLIA_RPC_URL: z.string().url().default("https://sepolia.base.org"),
  BASE_SEPOLIA_CHAIN_ID: z.coerce.number().int().default(84532),
  ZERODEV_RPC: z.string().url().optional(),

  // Primary chain per the updated build plan: X Layer Testnet (OKX's own L2).
  // Chain ID verified live via eth_chainId against testrpc.xlayer.tech -- 1952, NOT 195
  // (195 is a deprecated chain per the ethereum-lists/chains registry). See
  // docs/erc8004-addresses.md for the verification trail.
  XLAYER_TESTNET_RPC_URL: z.string().url().default("https://testrpc.xlayer.tech"),
  XLAYER_TESTNET_CHAIN_ID: z.coerce.number().int().default(1952),
  THIRDWEB_CLIENT_ID: z.string().min(1).optional(),
  THIRDWEB_SECRET_KEY: z.string().min(1).optional(),

  // Same deterministic (CREATE2) addresses on every chain the ERC-8004 team deployed to,
  // Base Sepolia and X Layer Testnet included -- verified per-chain via eth_getCode.
  ERC8004_IDENTITY_REGISTRY: addressSchema,
  ERC8004_REPUTATION_REGISTRY: addressSchema,

  OWNER_PRIVATE_KEY: hexPrivateKeySchema.optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),

  // Sentra's own attestation key (L3 mandatory co-sign gate). Deliberately separate from
  // OWNER_PRIVATE_KEY: the owner retains ultimate admin control of the smart account,
  // Sentra's attestation key ONLY ever produces a per-UserOp co-signature, and only after
  // a real Steps 1-6 PASS. See pipeline/executor/cosign.ts.
  SENTRA_ATTESTATION_PRIVATE_KEY: hexPrivateKeySchema.optional(),

  // Stands in for the calling agent's own persistent session key -- in a real
  // deployment the AGENT holds this, not Sentra; it's here only because this repo
  // demos both sides of the co-sign flow from one process. Persistent (not regenerated
  // per run) because the weighted account it co-controls holds real funds across runs.
  AGENT_SESSION_PRIVATE_KEY: hexPrivateKeySchema.optional(),
});

// dotenv leaves declared-but-blank keys ("ZERODEV_RPC=") as "", not undefined --
// treat blank strings as unset so .optional() fields behave as documented.
const rawEnv = Object.fromEntries(
  Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v]),
);

const parsed = envSchema.safeParse(rawEnv);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  throw new Error("Fix .env before continuing (see .env.example).");
}

export const env = {
  ...parsed.data,
  ERC8004_IDENTITY_REGISTRY: parsed.data.ERC8004_IDENTITY_REGISTRY as Address,
  ERC8004_REPUTATION_REGISTRY: parsed.data.ERC8004_REPUTATION_REGISTRY as Address,
  OWNER_PRIVATE_KEY: parsed.data.OWNER_PRIVATE_KEY as Hex | undefined,
  SENTRA_ATTESTATION_PRIVATE_KEY: parsed.data.SENTRA_ATTESTATION_PRIVATE_KEY as Hex | undefined,
  AGENT_SESSION_PRIVATE_KEY: parsed.data.AGENT_SESSION_PRIVATE_KEY as Hex | undefined,
};

export function requireEnv<K extends keyof typeof env>(key: K): NonNullable<(typeof env)[K]> {
  const value = env[key];
  if (value === undefined || value === "") {
    throw new Error(`Missing required env var: ${key} (see .env.example)`);
  }
  return value as NonNullable<(typeof env)[K]>;
}
