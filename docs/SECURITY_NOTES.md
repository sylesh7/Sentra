# Security Notes

## The deliberately narrow promise

Sentra does not rate subjective intent or "quality" of a payment. It does not accept
caller-supplied overrides of its own verdict. It does not trust a caller's claimed page
content instead of fetching the page itself. It does not treat self-declared structured
metadata (JSON-LD, Open Graph tags, CSS-hidden text) as authorization for anything. It
does not enforce fund custody on any chain other than Base Sepolia today, and does not
claim mainnet deployment anywhere. It does not protect a payment made from a wallet Sentra
was never wired into — it enforces the specific account it co-controls, not every wallet
an agent could theoretically hold funds in. It does not claim organic usage or revenue —
see the Controlled Demo Proof table in `docs/JUDGE_GUIDE.md`, which is self-run test
traffic, labeled as such.

## Main Security Assumption

Sentra's enforcement guarantee (§"Enforced in V1" below) reduces to one assumption: **the
private key behind Sentra's attestation signer is not itself compromised, and Sentra's own
decision logic (Steps 1-6) is not itself successfully manipulated into producing a PASS it
shouldn't.** The 2-of-2 weighted multisig means an agent's session key alone is
cryptographically insufficient to move funds from the enforced account — but it also means
Sentra's attestation key is the other half of that same threshold. Sentra is not a
zero-trust system with respect to itself; it is a second, independent, cryptographically
enforced check that a compromised *agent* cannot bypass, layered on top of the assumption
that Sentra's own signing key and verification pipeline remain honest. `SENTRA_ATTESTATION_PRIVATE_KEY`
is read from environment configuration only, never hardcoded or logged — see
`pipeline/executor/executeWithAttestation.ts` and `wallet/attestation/cosign.ts`.

## Enforced in V1

- **No valid transaction path exists on the enforced account without Sentra's
  co-signature.** The account's sole controlling validator is a 2-of-2 weighted multisig
  (`@zerodev/weighted-validator`): agent session key weight 50, Sentra attestation key
  weight 50, threshold 100. Proven both directions on real Base Sepolia transactions
  (`scripts/attestation-demo.ts`): solo agent signature rejected by the bundler before
  execution; combined signature succeeds. Independently re-checkable with zero secrets via
  `npm run verify:live`.
- **Content provenance is cryptographically checked, not assumed.** RFC 9421 / Web Bot
  Auth signature verification against the actual HTTP response Sentra fetched itself
  (`pipeline/provenance/`), real Ed25519 crypto, tested against both a validly signed
  response and a tampered-body case.
- **Structured metadata is never a source of truth for payment fields.** The quarantined
  reader (`pipeline/quarantine/`) separates JSON-LD/OG/hidden-CSS content from visible
  text at parse time (`pipeline/quarantine/parseContent.ts`, tested in
  `test/parseContent.test.ts`); the capability interpreter (`pipeline/interpreter/policy.ts`)
  deterministically denies any payment field sourced from `json_ld` or hidden content, no
  matter how confidently a model reports it.
- **Independent, heterogeneous re-extraction, not single-model trust.** A quorum of
  models from different vendors independently extracts payment fields from the same
  content; disagreement blocks rather than averages or picks a majority silently
  (`pipeline/quorum/consensus.ts`).
- **Counterparty identity is checked against an on-chain registry**, not a caller-supplied
  claim (`pipeline/identity/`, ERC-8004 Identity Registry, resolved from the source
  origin's own `/.well-known/agent-card.json`, not a pre-known agent id).
- **The caller's proposed action is cross-checked against what Sentra independently
  found**, not trusted outright — a mismatch fails closed even if Sentra's own extraction
  would otherwise have passed (`pipeline/gettrust.ts`'s `claimMatches` check).
- **Every verdict, PASS or FAIL, produces a signed Trust Receipt** (EIP-191, canonical-hash
  receipt id) — a decision can't be un-recorded or asserted after the fact without a
  detectable signature mismatch (`pipeline/planner/receipt.ts`, `verifyTrustReceipt`).
- **Fails closed on infrastructure failure, not just on attack detection.** If the source
  URL can't be fetched, if fewer than the minimum quorum members respond (including full
  OpenRouter quota exhaustion), or if identity/policy checks can't complete, the verdict is
  FAIL with a receipt, never a silent PASS or an unhandled crash.

## Not in Scope for V1

- **Mainnet fund custody, on any chain.** L3 (spend cap / attestation gate) runs on Base
  Sepolia only, deliberately held on testnet pending an audit. L2 identity *reads* are
  proven live on Base Mainnet and X Layer Mainnet (`npm run mainnet:readiness-proof`), but
  a working read is not the same claim as custodying real funds — see
  `docs/mainnet-readiness.md` for why these are kept explicitly separate.
- **X Layer as an enforcement chain.** Blocked on third-party account-abstraction tooling
  (thirdweb rejects the chain id, BlockPI doesn't list a bundler, OKBund is
  self-host-only) — a tooling gap, not a Sentra code gap. Full trail in
  `docs/x-layer-investigation.md`.
- **ERC-8004 Validation Registry posting** — Sentra does not register itself as an
  on-chain validator or post attestations to that registry.
- **TEE-attested verification compute** — the quorum and interpreter stages run as
  ordinary server-side code, not inside a trusted execution environment with remote
  attestation.
- **Any escalation path for quorum disagreement or max-scrutiny provenance beyond "block
  and log the reason."** No human-review queue, no secondary/tie-breaking quorum round.
- **Value-based scrutiny tiering.** Every payment gets the full five-layer check today,
  regardless of amount — a safe default, but it means there is no low-latency
  below-threshold path yet.
- **Multi-tenant custom policy configuration.** One policy, applied uniformly to every
  calling agent; no per-caller overrides.
- **Trust Passport as an enforcement input.** The Passport (`pipeline/passport/`) is
  read-only, informational context composed from on-chain identity/reputation and local
  receipt history — v1 does not gate any decision on Passport contents.
- **A database or network-queryable receipt store.** Trust Receipts persist as flat JSON
  files, looked up by receipt id on local disk (or best-effort on Vercel's `/tmp` in the
  deployed environment — see `docs/mcp-server.md`), not via a queryable API.

## Reporting a concern

This is a hackathon submission on testnet infrastructure with no real funds at risk in the
deployed environment. If you find a way to produce a PASS verdict against manipulated
content, or a way to move funds through the enforced account without Sentra's
co-signature, that's exactly the kind of finding this document exists to make easy to
report against a concrete claim — cite the specific bullet above it breaks.
