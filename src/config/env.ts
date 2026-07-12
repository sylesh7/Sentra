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
  BASE_SEPOLIA_RPC_URL: z.string().url().default("https://sepolia.base.org"),
  BASE_SEPOLIA_CHAIN_ID: z.coerce.number().int().default(84532),
  ERC8004_IDENTITY_REGISTRY: addressSchema,
  ERC8004_REPUTATION_REGISTRY: addressSchema,
  ZERODEV_RPC: z.string().url().optional(),
  OWNER_PRIVATE_KEY: hexPrivateKeySchema.optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
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
};

export function requireEnv<K extends keyof typeof env>(key: K): NonNullable<(typeof env)[K]> {
  const value = env[key];
  if (value === undefined || value === "") {
    throw new Error(`Missing required env var: ${key} (see .env.example)`);
  }
  return value as NonNullable<(typeof env)[K]>;
}
