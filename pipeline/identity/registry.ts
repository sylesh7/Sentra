import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ContractFunctionExecutionError, type Address, type PublicClient } from "viem";
import { publicClient as baseSepoliaPublicClient } from "../../src/chain/clients.js";
import { xLayerPublicClient } from "../../src/chain/xlayer.js";
import { baseMainnetPublicClient, xLayerMainnetPublicClient } from "../../src/chain/mainnets.js";
import { CHAIN_CONFIG, type ChainKey } from "../../src/config/chains.js";
import type { OnChainAgentRecord } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const identityRegistryAbi = JSON.parse(
  readFileSync(join(__dirname, "../../contracts/abis/IdentityRegistry.json"), "utf-8"),
);

const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

/**
 * A chain to run L2 identity checks against. Carries its OWN contract address rather
 * than assuming one global address -- ERC-8004's registry address differs between the
 * mainnet tier and the testnet tier (same address WITHIN a tier, deterministic CREATE2,
 * but genuinely different BETWEEN tiers). Deriving this from CHAIN_CONFIG means adding
 * a chain here is a config change, not a rewrite of the read logic below.
 */
export interface RegistryTarget {
  client: PublicClient;
  chainId: number;
  identityRegistry: Address;
}

function targetFor(key: ChainKey, client: PublicClient): RegistryTarget {
  const def = CHAIN_CONFIG[key];
  return { client, chainId: def.id, identityRegistry: def.contracts.identityRegistry };
}

export const BASE_SEPOLIA_REGISTRY: RegistryTarget = targetFor("baseSepolia", baseSepoliaPublicClient);

/**
 * X Layer Testnet is where OKX's own ERC-8004 agent registry actually lives -- this is a
 * plain read-only eth_call target, no bundler/smart account/funding involved (unlike L3,
 * which stays on Base Sepolia; see docs/x-layer-investigation.md for why).
 */
export const XLAYER_REGISTRY: RegistryTarget = targetFor("xLayerTestnet", xLayerPublicClient);

/**
 * Mainnet targets: real chain, real verified contract deployment (see
 * docs/erc8004-addresses.md and docs/mainnet-readiness.md), genuinely usable for a read
 * if pointed here -- not currently exercised by any default pipeline flow or funded
 * wallet. "Architecturally ready for mainnet" means these two lines of config are all
 * that separate a testnet read from a mainnet one; nothing else in this file changes.
 */
export const BASE_MAINNET_REGISTRY: RegistryTarget = targetFor("baseMainnet", baseMainnetPublicClient);
export const XLAYER_MAINNET_REGISTRY: RegistryTarget = targetFor("xLayerMainnet", xLayerMainnetPublicClient);

/**
 * Reads the ERC-8004 IdentityRegistry on the given chain. Returns null if the agentId was
 * never minted (ownerOf reverts with ERC721NonexistentToken) -- this is a genuine on-chain
 * "not registered" result, not a stand-in for one.
 */
export async function getOnChainAgent(
  agentId: bigint,
  target: RegistryTarget = BASE_SEPOLIA_REGISTRY,
): Promise<OnChainAgentRecord | null> {
  const { client, identityRegistry } = target;
  try {
    const [owner, agentURI] = await Promise.all([
      client.readContract({
        address: identityRegistry,
        abi: identityRegistryAbi,
        functionName: "ownerOf",
        args: [agentId],
      }) as Promise<Address>,
      client.readContract({
        address: identityRegistry,
        abi: identityRegistryAbi,
        functionName: "tokenURI",
        args: [agentId],
      }) as Promise<string>,
    ]);

    let agentWallet: Address | null = null;
    try {
      const wallet = (await client.readContract({
        address: identityRegistry,
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
  return `eip155:${target.chainId}:${target.identityRegistry}`;
}
