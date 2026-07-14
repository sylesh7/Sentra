import { createPublicClient, http, type Chain } from "viem";
import { env } from "../config/env.js";

/**
 * X Layer Testnet. Chain ID verified live via eth_chainId against
 * https://testrpc.xlayer.tech -- it returns 0x7a0 = 1952, NOT 195 (195 is a deprecated
 * chain per the ethereum-lists/chains registry). See docs/erc8004-addresses.md.
 */
export const xLayerTestnet: Chain = {
  id: env.XLAYER_TESTNET_CHAIN_ID,
  name: "X Layer Testnet",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: { http: [env.XLAYER_TESTNET_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "OKLink", url: "https://web3.okx.com/explorer/x-layer-testnet" },
  },
  testnet: true,
};

export const xLayerPublicClient = createPublicClient({
  chain: xLayerTestnet,
  transport: http(env.XLAYER_TESTNET_RPC_URL),
});
