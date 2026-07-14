# ERC-8004 contract addresses — verification log

Per the README's hard constraint: never hardcode these from memory or a single
document. Below is exactly how each address in `.env.example` was verified, so
the check is reproducible.

## Base Sepolia (chain id 84532)

| Contract | Address |
|---|---|
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

**Source of the address:** raw README from the ERC-8004 team's own contracts repo,
fetched directly (not through a summarizing tool):
`https://raw.githubusercontent.com/erc-8004/erc-8004-contracts/master/README.md`

**On-chain proof the address is live** (2026-07-12), via a direct JSON-RPC call to
the public Base Sepolia endpoint — not a block explorer summary:

```
POST https://sepolia.base.org
{"jsonrpc":"2.0","id":1,"method":"eth_getCode","params":["0x8004A818BFB912233c491871b3d84c89A494BD9e","latest"]}
-> non-empty bytecode (EIP-1167 minimal proxy, consistent with the repo's
   "upgradeable implementation" pattern)

{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}
-> "0x14a34" = 84532 = Base Sepolia
```

**Live registered agent used for integration testing:** agentId `8017`
(`ownerOf` / `getAgentWallet` both resolve to `0xddF476D86Afd5E2075B8C95cbfFD3d76aEfa4b6B`,
`agentURI` -> `https://capability.network/.well-known/agent-registration.json`).
Found by inspecting the IdentityRegistry's transaction history on BaseScan Sepolia
directly (not scraped, not assumed) — the same CREATE2 vanity address pattern
(`0x8004...`) is reused across every chain the registry is deployed to, which the
raw README also confirms address-by-address per network.

## X Layer Testnet (chain id 1952 -- NOT 195)

| Contract | Address |
|---|---|
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` (same address as Base Sepolia -- deterministic CREATE2 deployment) |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

**Chain ID correction (verified 2026-07-13):** an earlier draft of this project's README
stated X Layer Testnet's chain ID as `195`. Direct verification found that wrong:

```
POST https://testrpc.xlayer.tech {"method":"eth_chainId"} -> "0x7a0" = 1952 (decimal)
```

Cross-checked against the ethereum-lists/chains public registry
(`eip155-195.json`): chain 195 is explicitly `"status": "deprecated"`, name
`"X Layer Testnet(Deprecated)"`. Chain **1952** (`eip155-1952.json`) is `"status": "active"`
and is what `testrpc.xlayer.tech` / `xlayertestrpc.okx.com` actually serve. This project
uses **1952**.

**On-chain proof the registry is live on X Layer Testnet:**
```
POST https://testrpc.xlayer.tech
{"method":"eth_getCode","params":["0x8004A818BFB912233c491871b3d84c89A494BD9e","latest"]}
-> non-empty bytecode, identical minimal-proxy pattern to the Base Sepolia deployment
```

## Why this matters

Two independent lookups (a raw GitHub fetch vs. a summarized WebFetch pass) initially
returned different-looking addresses for the "same" contract before cross-checking —
a reminder that this project's whole premise (never trust a single unverified source)
applies to building it, not just to the runtime pipeline.
