import { toViemChain, createClientFor } from "./fromConfig.js";

/**
 * Real, functional mainnet clients -- same derivation path as the testnet ones in
 * clients.ts/xlayer.ts, just pointed at CHAIN_CONFIG's mainnet entries. Not used by any
 * default pipeline flow (see CHAIN_CONFIG's `live: false` on both) -- these exist so
 * "point Sentra's L2 identity check at mainnet" is a config swap, not a rewrite, and so
 * that claim is provably true rather than asserted. See docs/mainnet-readiness.md.
 */
export const baseMainnet = toViemChain("baseMainnet");
export const baseMainnetPublicClient = createClientFor("baseMainnet");

export const xLayerMainnet = toViemChain("xLayerMainnet");
export const xLayerMainnetPublicClient = createClientFor("xLayerMainnet");
