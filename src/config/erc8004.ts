import type { Address } from "viem";

/**
 * ERC-8004's IdentityRegistry / ReputationRegistry are deployed via deterministic
 * CREATE2 at the SAME address across every chain within a tier -- one address pair
 * shared by ALL mainnets, a DIFFERENT pair shared by ALL testnets. This is NOT the same
 * address reused between tiers (a real mistake to avoid: testnet and mainnet addresses
 * genuinely differ). Verified via the erc-8004 team's own contracts repo README
 * (raw GitHub fetch, not a summarized/paraphrased source) and cross-checked with a live
 * eth_getCode call on every chain this project actually reads from. Full trail,
 * including the specific eth_getCode calls, in docs/erc8004-addresses.md.
 */
export const TESTNET_ERC8004_ADDRESSES = {
  identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Address,
  reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713" as Address,
};

export const MAINNET_ERC8004_ADDRESSES = {
  identityRegistry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as Address,
  reputationRegistry: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as Address,
};
