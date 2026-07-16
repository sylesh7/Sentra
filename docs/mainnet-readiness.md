# Mainnet readiness: what "supports mainnet" honestly means here

This is a precise claim, not a vague one, because the wording matters for how it gets
presented to judges or other agents evaluating this ASP.

## What's actually true

L2 (ERC-8004 identity verification) is chain-agnostic by construction: chain ID, RPC
endpoint, and contract address all come from `src/config/chains.ts`'s `CHAIN_CONFIG`,
not from hardcoded values scattered through the read logic. Pointing an identity check
at a different chain is a config lookup, not a code change --
`pipeline/identity/registry.ts` exports `BASE_MAINNET_REGISTRY` and
`XLAYER_MAINNET_REGISTRY` alongside the testnet ones, built from the exact same
`RegistryTarget` shape and consumed by the exact same `verifyCounterpartyByAgentId`
function.

This is proven, not asserted: `npm run mainnet:readiness-proof` runs that one unmodified
function against all four known chains -- Base Sepolia, X Layer Testnet, Base Mainnet,
and X Layer Mainnet -- and gets a real `PASS` on every one, each resolving a real
registered agent and reporting the correct tier-specific contract address
(`0x8004A169...` for both mainnets, `0x8004A818...` for both testnets -- these
genuinely differ between tiers, see `src/config/erc8004.ts`). No gas spent, no
transaction, no funds at risk anywhere in this -- every call is a read-only `eth_call`.

## What's NOT true, and must not be implied

L3 (the part that actually moves funds -- session-key spend cap, attestation gate) is
**not** chain-agnostic in the same sense, and does not "support mainnet" in any form.
It runs on Base Sepolia only, deliberately. There is no mainnet wallet, no mainnet
session key, no mainnet UserOperation path, tested or otherwise. Nothing about this
refactor changes that.

X Layer Mainnet's two RPC endpoints listed in the ethereum-lists/chains registry
(`rpc.xlayer.tech`, `xlayerrpc.okx.com`) both timed out from this environment --
`CHAIN_CONFIG` uses `https://xlayer.drpc.org` instead (found via chainlist.org's
aggregated RPC list, confirmed live: `eth_chainId` -> `0xc4` = 196), which responds
correctly and is what the readiness proof actually exercises. All four `CHAIN_CONFIG`
entries are now backed by a real, live proof -- none are placeholder/unverified.

## The framing to use in the pitch

> "The system is chain-agnostic by design for identity verification -- the same
> contract-reading logic works against testnet or mainnet via a config swap, no code
> changes required, and we've proven that live against Base Mainnet's real ERC-8004
> registry. We're running the fund-custody side (L3) on testnet for the hackathon;
> mainnet deployment there is a deliberate next step, held until an audit, since that
> contract custodies real funds."

Avoid implying mainnet is "supported" as in *live and usable right now* for anything
that touches money. If a judge or another agent tries to call Sentra's payment
checkpoint against mainnet funds, there is nothing there for L3. "Supports" in this
pitch means "architecturally ready for," specifically and only for the read-only
identity layer -- not "currently running everywhere."

This is a legitimate, common pattern in real fintech/security software: testnet-first,
config-driven, audit-gated mainnet rollout for the part that custodies funds, while the
read-only verification layer can reasonably go live earlier since it moves no money.
Stating the boundary plainly is a stronger signal than either quietly deploying unaudited
fund-custody code under deadline pressure, or never having thought about the mainnet
path at all.
