# X Layer Testnet account-abstraction investigation (2026-07-14)

The build plan called for X Layer Testnet (chain 1952) as the primary L3 chain via
thirdweb, with BlockPI-native AA and OKX's own OKBund as named fallbacks. All three
were tried against the real chain; none currently work for a hosted testnet demo. This
is recorded here so the decision is reproducible and the submission can state it plainly
rather than pretend X Layer support exists.

## What's confirmed working on X Layer Testnet

- Chain is live: `eth_chainId` -> `0x7a0` (1952). The README originally stated 195,
  which is a deprecated chain id -- corrected, see `docs/erc8004-addresses.md`.
- Canonical ERC-4337 EntryPoint v0.6 and v0.7 are both deployed (`eth_getCode` returns
  real bytecode at the standard singleton addresses).
- ERC-8004 IdentityRegistry / ReputationRegistry are deployed at the same addresses as
  every other chain the erc-8004 team shipped to (verified via `eth_getCode`).
- Basic wallet creation, balance queries, and plain RPC access work fine through every
  provider tried (thirdweb dashboard, direct RPC).

## What's confirmed NOT working (the actual blocker)

**thirdweb -- client SDK (`smartWallet()` / ERC-4337 factory path).** thirdweb's default
`AccountFactory_0_7` (`0x4be0ddfebca9a5a4a617dee4dece99e7c862dceb`) has **no bytecode**
on X Layer Testnet (`eth_getCode` -> `0x`). `predictSmartAccountAddress` fails outright
because it reads from a contract that isn't there.

**thirdweb -- EIP-7702 path (in-app wallet / MinimalAccount).** The delegation contract
address is resolved dynamically from thirdweb's own bundler via a `tw_getDelegationContract`
RPC call. Queried directly:

```
POST https://1952.bundler.thirdweb.com/v2
-> {"error":"Invalid chain: 1952","chain":"1952"}
```

**thirdweb -- Server Wallets REST API (`POST /v1/transactions`).** This looked like a
different code path (and the dashboard happily shows a server wallet + its OKB balance
on X Layer Testnet, since that only needs plain RPC). Submitting a real transaction
through it was accepted into a queue, then failed:

```json
{
  "status": "FAILED",
  "errorCode": "DELEGATION_CHECK_FAILED",
  "executionResult": {
    "error": {
      "innerError": {
        "message": "HTTP error 400 with body: {\"error\":\"Invalid chain: 1952\",\"chain\":\"1952\"}",
        "rpc_url": "https://1952.bundler.thirdweb.com/v2"
      }
    }
  }
}
```

Same root cause as the SDK path: every thirdweb product surface eventually routes
through the same per-chain bundler, and that bundler does not have X Layer Testnet
configured, despite thirdweb's own marketing/chain-list pages claiming AA support for
X Layer.

**BlockPI Bundler Service.** Docs checked directly
(`docs.blockpi.io/build/account-abstraction-erc-4337/bundler-service`): supported chains
are OP Mainnet, Base Mainnet, Polygon Mainnet, and Taiko Hekla. X Layer is not listed at
all -- the README's claim of "X Layer's native BlockPI-provided account abstraction
services" does not hold up against BlockPI's own current documentation.

**OKBund.** Real, actively maintained OKX repo (github.com/okx/OKBund, 33 stars, last
updated 2026-07-04). But it is explicitly **self-hosted only** -- there is no public
hosted endpoint. Using it would mean standing up and keeping alive a Java bundler
process for the whole build/demo/judging window, plus deploying/verifying an
AccountFactory on X Layer myself (none is currently confirmed deployed there). That's a
real, viable path in principle, but it trades a working, already-verified demo for new
long-lived infrastructure risk under a hard deadline -- exactly the tradeoff the
README's own decision rule says not to make.

## Decision

L3 runs on **Base Sepolia + ZeroDev**, which is fully built and independently verified
on-chain (see Phase 2: real tx hash, real spend-cap + allow-list + expiry enforcement at
the ERC-4337 validation layer). The X Layer + thirdweb code (`wallet/xlayer/`,
`src/chain/xlayer.ts`, `scripts/xlayer-*.ts`) is kept in the repo -- it's correct code,
blocked by a third-party infra gap, not a bug -- and is worth revisiting if/when thirdweb
or BlockPI add X Layer Testnet to their bundler chain list. Say this plainly in the
submission rather than implying X Layer support that doesn't currently exist: OKX.AI
judges can verify the bundler rejection independently in about thirty seconds.
