# Judge Guide

A judge should not have to take this README on faith. Everything below is checkable in
minutes, most of it with zero credentials of your own.

## Fast path (< 5 minutes, zero secrets needed)

```
git clone <this repo>
cd Sentra
npm install
npm run verify:live
```

`scripts/verify-live.ts` hits Sentra's live, publicly deployed MCP endpoint
(`https://sentra-gettrust.vercel.app/mcp`) and a public, keyless Base Sepolia RPC
(`https://sepolia.base.org`) — no `.env`, no API key, nothing of ours required beyond
`npm install`. It prints five checks, each with a piece of evidence you can independently
re-check yourself (a receipt id, a tx hash, a byte count), not just a pass/fail line:

1. The live MCP endpoint is reachable and exposes `getTrust` with the documented schema.
2. A call with an unreachable `source_url` fails closed, and the returned Trust Receipt's
   signature is verified client-side with plain ECDSA recovery — not asserted, recomputed.
3. A call against a real, unsigned, non-payment page (`https://example.com`) also fails
   closed rather than fabricating a PASS.
4. The ERC-8004 Identity Registry (`0x8004A818BFB912233c491871b3d84c89A494BD9e`) has real
   deployed bytecode on Base Sepolia, read directly from a public RPC.
5. A cited L3 attestation-gate transaction (`0x5040349c...5dc07`) is fetched from that same
   public RPC and confirmed mined, successful, and addressed to the real ERC-4337
   EntryPoint — not a hash pasted into a doc and never checked.

If check 3 reports an OpenRouter rate-limit message inside its FAIL reason instead of a
different one, that's the real, documented free-tier daily cap on Sentra's own quorum key
(50 requests/day, shared across every judge hitting the endpoint that day) — the check
still correctly fails closed either way. See `pipeline/quorum/consensus.ts` and
`docs/mcp-server.md` for that constraint.

## Slower path, if you want to go deeper

```
npm run typecheck    # tsc --noEmit, clean
npm test             # vitest — real HTTP servers, real crypto, real on-chain reads; no mocks
npm run pipeline:run -- --execute   # full Steps 1-6 + a real L3 co-signed Base Sepolia tx
```

`npm run agent:gate` chains all three plus `verify:live` into one command — the same gate
this repo runs on itself before any submission-facing change.

Test suite is 9 files. As of the last run: **39/42 passing**; the 3 failures are the same
OpenRouter free-tier exhaustion described above (a real, external, time-of-day-dependent
constraint, not a logic defect) — the assertions that fail are checking for a specific
`PASS` outcome that can't happen while the shared demo key is rate-limited, not checking
that the code crashed.

## Scoring map

| Judging criterion | What to actually inspect |
|---|---|
| **Best Product** — does this solve a real, well-evidenced problem? | `README.md` §1 (the Zscaler ThreatLabz campaigns this is built against, cited with a source link) and §2 (the five-layer design, each layer named against a specific attack it defeats) |
| **Best Product** — is it usable as a real service today, not a prototype? | `npm run verify:live` (above) — a live, publicly reachable MCP endpoint any A2MCP-speaking agent can call right now, not a local-only script |
| **Software Utility** — is the engineering real and defensible? | `docs/SECURITY_NOTES.md` for the explicit enforced/not-enforced boundary; `pipeline/gettrust.ts` for the actual entry point (reads `sourceUrl` itself, never trusts caller-supplied content — see the module's own doc comment); `wallet/attestation/` + `scripts/attestation-demo.ts` for the on-chain proof that a solo agent signature is rejected and only a Sentra co-signature clears the account's threshold |
| **Software Utility** — no faked results? | Every ✅/🔲 marker in `PRD.md` is checked against source, not asserted (see its own methodology note); `docs/mainnet-readiness.md` and `docs/erc8004-addresses.md` show the real verification trail (live RPC calls, not remembered chain IDs) behind every chain claim |
| **Finance Copilot** (secondary track) | `pipeline/planner/receipt.ts` (Trust Receipt — signed, hash-verifiable payment decision record) and `pipeline/passport/index.ts` (Trust Passport — real ERC-8004 identity + reputation read composed with local receipt history, `reputationScore: null` when no on-chain feedback exists rather than a fabricated number) |

## Reviewer questions, pre-answered

**Can an agent just skip Sentra?**
Not if it's using the account Sentra actually enforces on. The payment smart account's
*sole* controlling validator is a 2-of-2 weighted multisig (`@zerodev/weighted-validator`):
the agent's session key carries weight 50, Sentra's attestation key carries weight 50,
threshold is 100. There is no valid signature path on that account that doesn't include
Sentra's co-signature, and Sentra only ever produces it after a real Steps 1-6 PASS.
Proven both directions on-chain in `scripts/attestation-demo.ts` — solo agent signature
rejected by the bundler, combined signature succeeds — and independently re-checkable via
`npm run verify:live`'s check 5 above. The honest boundary: this only holds for funds
custodied in *that* account. Nothing stops an agent from having a completely separate
wallet Sentra was never wired into — Sentra enforces the account it controls, not every
wallet an agent could theoretically hold. See `docs/SECURITY_NOTES.md`.

**Why Base Sepolia, not X Layer, for enforcement?**
Investigated directly, not assumed: thirdweb rejects X Layer's chain ID for its
account-abstraction SDK, BlockPI doesn't list an X Layer bundler, and OKBund is
self-host-only. Full evidence trail in `docs/x-layer-investigation.md`. This blocks *fund
custody* (L3) only — the ERC-8004 identity read (L2) is chain-agnostic and already proven
live on X Layer Testnet and X Layer Mainnet via `npm run mainnet:readiness-proof`
(4/4 real PASS across Base Sepolia, X Layer Testnet, Base Mainnet, X Layer Mainnet). The
distinction between "chain-agnostic reads are real" and "mainnet fund custody is not" is
deliberate — see `docs/mainnet-readiness.md`.

**How is this different from CertiK / wallet-native risk scanners?**
Those grade the *destination* — is this contract/wallet historically associated with
scams. Sentra grades the *instruction* — is the payment field an agent is about to act on
actually what the page's real, provenance-verified content says, or was it injected via
structured metadata a naive scanner never reads (JSON-LD, Open Graph, CSS-hidden `<div>`s
— the exact Zscaler Campaign 1/2 technique). A destination can have a spotless reputation
and still be the target of a page that's lying to the agent about what to pay it. The two
checks are complementary, not redundant — Sentra doesn't replace destination-reputation
tooling and doesn't claim to.

**Why does the quorum sometimes fail closed with a rate-limit error instead of a clean
PASS/FAIL?**
Because the default quorum runs on OpenRouter's free tier — real infrastructure, genuinely
$0 per call, but capped at 50 requests/day per account (documented directly from
OpenRouter's own 429 response, see `pipeline/quorum/consensus.ts`). When quota is
exhausted, the pipeline reports `UNAVAILABLE` and fails closed rather than crashing or
silently downgrading to a fake PASS — that fail-closed behavior is itself part of what's
being demonstrated, not a bug being excused. Raising the cap to 1000/day costs $10 of
OpenRouter credit; not spent for the hackathon submission since the free tier already
proves the behavior.

**Is any of this mocked?**
No — repeatedly and explicitly audited for this during the build (see `PRD.md` §5's test
row and the risk table in §9). Every layer does a real network call or real cryptographic
operation: real Ed25519 signature verification for provenance, real LLM API calls for
quorum, real `eth_call`/`eth_getCode`/`eth_getTransactionReceipt` for identity and
on-chain proofs, real EIP-191 signing for Trust Receipts, real ERC-4337 UserOperations for
L3. The only "local stand-in" anywhere in the test suite is the origin website itself in a
handful of tests (`test/gettrust.test.ts`, `test/mcpServer.test.ts` spin up a local HTTP
server to act as the counterparty's site) — the verification logic being tested against it
is identical to what runs against a real internet URL, which is exactly what
`npm run verify:live` demonstrates against `https://example.com` and the live endpoint.

## Controlled Demo Proof

The table below is **self-run test traffic against this repo's own testnet fixtures and
accounts, generated to demonstrate the pipeline — not organic third-party usage or
revenue.** Sentra has zero external ASP callers as of this writing; do not read anything
below as traction.

| Scenario | Input | Verdict | Evidence |
|---|---|---|---|
| Legit invoice, signed origin, real registered counterparty | local fixture, RFC 9421-signed | PASS → L3 co-signed execution | tx `0x5040349cce4951e1edaf92ca933e3a28dcd5784fa5b4405dc4f5ca35a0e5dc07` (Base Sepolia, `status: success`) |
| Sanitized Campaign 1 reconstruction (JSON-LD + hidden-CSS payment instruction) | `fixtures/campaign1-sanitized.ts` | FAIL — interpreter DENY, fields sourced from `json_ld` | `scripts/run-pipeline.ts` output, Scenario A |
| Novel injection, independently authored | `fixtures/novel-attack-injection.ts` | FAIL — quorum DISAGREE (one model mis-tagged source live during testing) | `scripts/run-pipeline.ts` output, Scenario C — this one is stronger evidence than the primary fixture precisely because it wasn't built to match a known answer |

Re-run any of these yourself with `npm run pipeline:run -- --execute` (needs your own
funded Base Sepolia test wallet if you want the L3 leg to actually execute; decision-only
runs need no funds).

## What this is not claiming

See `docs/SECURITY_NOTES.md` for the full enforced/not-enforced boundary. In short:
mainnet fund custody, X Layer as an enforcement chain, ERC-8004 Validation Registry
posting, TEE-attested compute, and value-based scrutiny tiering are all explicitly
roadmap, not shipped — stated the same way in `README.md` §7 and `PRD.md` §8.
