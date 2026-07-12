import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ContractFunctionExecutionError, type Address } from "viem";
import { publicClient } from "../../src/chain/clients.js";
import { env } from "../../src/config/env.js";
import type { OnChainAgentRecord } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const identityRegistryAbi = JSON.parse(
  readFileSync(join(__dirname, "../../contracts/abis/IdentityRegistry.json"), "utf-8"),
);

const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

/**
 * Reads the ERC-8004 IdentityRegistry directly on Base Sepolia. Returns null if the
 * agentId was never minted (ownerOf reverts with ERC721NonexistentToken) -- this is a
 * genuine on-chain "not registered" result, not a stand-in for one.
 */
export async function getOnChainAgent(agentId: bigint): Promise<OnChainAgentRecord | null> {
  try {
    const [owner, agentURI] = await Promise.all([
      publicClient.readContract({
        address: env.ERC8004_IDENTITY_REGISTRY,
        abi: identityRegistryAbi,
        functionName: "ownerOf",
        args: [agentId],
      }) as Promise<Address>,
      publicClient.readContract({
        address: env.ERC8004_IDENTITY_REGISTRY,
        abi: identityRegistryAbi,
        functionName: "tokenURI",
        args: [agentId],
      }) as Promise<string>,
    ]);

    let agentWallet: Address | null = null;
    try {
      const wallet = (await publicClient.readContract({
        address: env.ERC8004_IDENTITY_REGISTRY,
        abi: identityRegistryAbi,
        functionName: "getAgentWallet",
        args: [agentId],
      })) as Address;
      agentWallet = wallet === ZERO_ADDRESS ? null : wallet;
    } catch {
      // No agent wallet set (unsetAgentWallet was called, or never set) — fall back to owner.
      agentWallet = null;
    }

    return { agentId, owner, agentWallet, agentURI };
  } catch (err) {
    if (err instanceof ContractFunctionExecutionError) {
      return null; // token doesn't exist -> genuinely unregistered
    }
    throw err;
  }
}

export function registryRef(): string {
  return `eip155:${env.BASE_SEPOLIA_CHAIN_ID}:${env.ERC8004_IDENTITY_REGISTRY}`;
}
