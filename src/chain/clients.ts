import { createPublicClient, http, type Chain } from "viem";
import { env } from "../config/env.js";

export const baseSepolia: Chain = {
  id: env.BASE_SEPOLIA_CHAIN_ID,
  name: "Base Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [env.BASE_SEPOLIA_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "BaseScan", url: "https://sepolia.basescan.org" },
  },
  testnet: true,
};

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(env.BASE_SEPOLIA_RPC_URL),
});
