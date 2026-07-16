import { createPublicClient, http, type Chain, type PublicClient } from "viem";
import { CHAIN_CONFIG, type ChainKey } from "../config/chains.js";

/** Derives a viem Chain object from a CHAIN_CONFIG entry -- one source of truth, not two. */
export function toViemChain(key: ChainKey): Chain {
  const def = CHAIN_CONFIG[key];
  return {
    id: def.id,
    name: def.name,
    nativeCurrency: def.nativeCurrency,
    rpcUrls: { default: { http: [def.rpcUrl] } },
    blockExplorers: { default: def.blockExplorer },
    testnet: def.testnet,
  };
}

/** Derives a viem PublicClient from a CHAIN_CONFIG entry, ready for real reads. */
export function createClientFor(key: ChainKey): PublicClient {
  const def = CHAIN_CONFIG[key];
  return createPublicClient({
    chain: toViemChain(key),
    transport: http(def.rpcUrl),
  });
}
