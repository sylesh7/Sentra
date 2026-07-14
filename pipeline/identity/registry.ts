import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ContractFunctionExecutionError, type Address, type PublicClient } from "viem";
import { publicClient as baseSepoliaPublicClient } from "../../src/chain/clients.js";
import { env } from "../../src/config/env.js";
import type { OnChainAgentRecord } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const identityRegistryAbi = JSON.parse(
  readFileSync(join(__dirname, "../../contracts/abis/IdentityRegistry.json"), "utf-8"),
);

const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

/**
 * ERC-8004's IdentityRegistry is deployed at the SAME deterministic (CREATE2) address on
 * every chain the erc-8004 team deployed to -- Base Sepolia and X Layer Testnet included,
 * both verified live via eth_getCode (see docs/erc8004-addresses.md). Only the client
 * (i.e. which chain's RPC to query) needs to change; the address and ABI don't.
 */
export interface RegistryTarget {
  client: PublicClient;
  chainId: number;
}

export const BASE_SEPOLIA_REGISTRY: RegistryTarget = {
  client: baseSepoliaPublicClient,
  chainId: env.BASE_SEPOLIA_CHAIN_ID,
};

/**
 * Reads the ERC-8004 IdentityRegistry on the given chain. Returns null if the agentId was
 * never minted (ownerOf reverts with ERC721NonexistentToken) -- this is a genuine on-chain
 * "not registered" result, not a stand-in for one.
 */
export async function getOnChainAgent(
  agentId: bigint,
  target: RegistryTarget = BASE_SEPOLIA_REGISTRY,
): Promise<OnChainAgentRecord | null> {
  const { client } = target;
  try {
    const [owner, agentURI] = await Promise.all([
      client.readContract({
        address: env.ERC8004_IDENTITY_REGISTRY,
        abi: identityRegistryAbi,
        functionName: "ownerOf",
        args: [agentId],
      }) as Promise<Address>,
      client.readContract({
        address: env.ERC8004_IDENTITY_REGISTRY,
        abi: identityRegistryAbi,
        functionName: "tokenURI",
        args: [agentId],
      }) as Promise<string>,
    ]);

    let agentWallet: Address | null = null;
    try {
      const wallet = (await client.readContract({
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

export function registryRef(target: RegistryTarget = BASE_SEPOLIA_REGISTRY): string {
  return `eip155:${target.chainId}:${env.ERC8004_IDENTITY_REGISTRY}`;
}
