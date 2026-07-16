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

**Live registered agents used for L2 integration testing (2026-07-16):** this is a
SEPARATE registry instance from Base Sepolia's -- same contract address/ABI, but each
chain has its own independent set of registrations. agentId `8017` (the Base Sepolia
test fixture) does not exist here. Found by direct `ownerOf()` probing over `eth_call`
(agentIds 1-10 are registered, 100/1000/8017 revert as unminted):

- agentId `1`: `ownerOf` / `getAgentWallet` both resolve to
  `0x82c486145908b2D00eFeb71C8745c5fDa86Fc9f0`, `tokenURI` -> `"price_oracle"` (a plain
  label, not a URL, on this particular registration).
- agentId `3`, `5`, `10`: all resolve to `0x067aBC270c4638869cD347530bE34CBdD93D0Ea1`.

Verified end-to-end via `npm run xlayer:identity-lookup -- 1 0x82c486145908b2D00eFeb71C8745c5fDa86Fc9f0`
(real PASS), plus a mismatched-wallet and a never-minted-agentId case (both real
REJECTs) -- see `pipeline/identity/registry.ts`'s `XLAYER_REGISTRY` target and
`pipeline/identity/verify.ts`'s optional `RegistryTarget` parameter.

## Base Mainnet (chain id 8453) -- read-only, see docs/mainnet-readiness.md

| Contract | Address |
|---|---|
| IdentityRegistry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (mainnet-tier address -- genuinely different from the testnet-tier `0x8004A818...` above, not a typo) |
| ReputationRegistry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |

**On-chain proof (2026-07-16), direct RPC, no summarizing tool:**
```
POST https://mainnet.base.org {"method":"eth_chainId"} -> "0x2105" = 8453
POST https://mainnet.base.org {"method":"eth_getCode","params":["0x8004A169FB4a3325136EB29fA0ceB6D2e539a432","latest"]}
-> non-empty bytecode
```

**Live registered agent used to prove the config-swap claim:** agentId `1` on Base
Mainnet resolves (`ownerOf`/`getAgentWallet`) to `0x89E9E1ab11dD1B138b1dcE6d6A4a0926aaFD5029`
-- a real registration for "ClawNews" ("Hacker News for AI agents"), decoded from a
base64 `data:` URI `agentURI`, not a placeholder.

## X Layer Mainnet (chain id 196)

| Contract | Address |
|---|---|
| IdentityRegistry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (same mainnet-tier address as Base Mainnet) |
| ReputationRegistry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |

Chain ID verified via the ethereum-lists/chains registry (`status: active`). The two
RPC endpoints listed there (`rpc.xlayer.tech`, `xlayerrpc.okx.com`) both timed out from
this environment; `https://xlayer.drpc.org` (found via chainlist.org's aggregated RPC
list) responded correctly and is what `CHAIN_CONFIG` uses:

```
POST https://xlayer.drpc.org {"method":"eth_chainId"} -> "0xc4" = 196
POST https://xlayer.drpc.org {"method":"eth_getCode","params":["0x8004A169FB4a3325136EB29fA0ceB6D2e539a432","latest"]}
-> non-empty bytecode
```

**Live registered agent:** agentId `1` resolves (`ownerOf`/`getAgentWallet`) to
`0x6ba100a250955209b3CAd5F06E31895f678425c1`.

**All four chains** (Base Sepolia, X Layer Testnet, Base Mainnet, X Layer Mainnet)
verified end-to-end via `npm run mainnet:readiness-proof`, which runs the exact same
`verifyCounterpartyByAgentId` function against each and gets a real `PASS` on all four
-- see `docs/mainnet-readiness.md` for what this claim does and doesn't mean.

## Why this matters

Two independent lookups (a raw GitHub fetch vs. a summarized WebFetch pass) initially
returned different-looking addresses for the "same" contract before cross-checking —
a reminder that this project's whole premise (never trust a single unverified source)
applies to building it, not just to the runtime pipeline.
