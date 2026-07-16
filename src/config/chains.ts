import type { Address } from "viem";
import { env } from "./env.js";
import { MAINNET_ERC8004_ADDRESSES, TESTNET_ERC8004_ADDRESSES } from "./erc8004.js";

export interface ChainDefinition {
  id: number;
  name: string;
  rpcUrl: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  blockExplorer: { name: string; url: string };
  contracts: {
    identityRegistry: Address;
    reputationRegistry: Address;
  };
  testnet: boolean;
  /**
   * Whether THIS project has verified live RPC connectivity from here and (for chains
   * that carry a funded wallet) actually run a tested transaction -- NOT whether the
   * chain or the contracts on it exist. `false` means "the same config entry works
   * architecturally, we have not put money or a running flow behind it." See
   * docs/mainnet-readiness.md for what this distinction does and doesn't mean.
   */
  live: boolean;
}

/**
 * Single source of truth for every chain Sentra can point at. Adding a chain here is a
 * config change, not a code change -- pipeline/identity/registry.ts and
 * src/chain/*.ts both derive their clients and contract addresses from this object.
 * Real chain IDs and RPC endpoints only, verified per-entry (see comments) -- no
 * placeholder values.
 */
export const CHAIN_CONFIG = {
  baseSepolia: {
    id: env.BASE_SEPOLIA_CHAIN_ID,
    name: "Base Sepolia",
    rpcUrl: env.BASE_SEPOLIA_RPC_URL,
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    blockExplorer: { name: "BaseScan", url: "https://sepolia.basescan.org" },
    contracts: TESTNET_ERC8004_ADDRESSES,
    testnet: true,
    // L3 (session-key spend cap + attestation gate) runs here, real funded txs, Phase 2.
    live: true,
  },
  xLayerTestnet: {
    id: env.XLAYER_TESTNET_CHAIN_ID,
    name: "X Layer Testnet",
    rpcUrl: env.XLAYER_TESTNET_RPC_URL,
    nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
    blockExplorer: { name: "OKLink", url: "https://web3.okx.com/explorer/x-layer-testnet" },
    contracts: TESTNET_ERC8004_ADDRESSES,
    testnet: true,
    // L2 identity reads verified live here (agentId 1, real PASS/REJECT cases).
    live: true,
  },
  baseMainnet: {
    id: 8453,
    name: "Base Mainnet",
    // Chain ID + RPC verified live: eth_chainId -> 0x2105 = 8453 (2026-07-16).
    rpcUrl: "https://mainnet.base.org",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorer: { name: "BaseScan", url: "https://basescan.org" },
    contracts: MAINNET_ERC8004_ADDRESSES,
    testnet: false,
    // Contract deployment verified live (eth_getCode, 2026-07-16) -- reads would
    // genuinely work if pointed here. No wallet funded, no L3 flow run: not "live".
    live: false,
  },
  xLayerMainnet: {
    id: 196,
    name: "X Layer Mainnet",
    // Chain ID verified via the ethereum-lists/chains registry (status: active) and
    // re-confirmed live via eth_chainId (2026-07-16). The two RPCs listed in that
    // registry (rpc.xlayer.tech, xlayerrpc.okx.com) both timed out from this
    // environment; drpc.org's public endpoint (from chainlist.org's aggregated list)
    // responded correctly (eth_chainId -> 0xc4 = 196) and is what's wired here.
    rpcUrl: "https://xlayer.drpc.org",
    nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
    blockExplorer: { name: "OKLink", url: "https://www.oklink.com/xlayer" },
    contracts: MAINNET_ERC8004_ADDRESSES,
    testnet: false,
    // Contract deployment + a real registered agent verified live (2026-07-16) -- reads
    // genuinely work. No wallet funded, no L3 flow run here: not "live" in that sense.
    live: false,
  },
} as const satisfies Record<string, ChainDefinition>;

export type ChainKey = keyof typeof CHAIN_CONFIG;
