# Sentra — Product Requirements Document (PRD)

**Project:** Sentra — Pre-Execution Trust Firewall for Agent Payments
**Hackathon:** OKX AI Genesis Hackathon 2026
**Track:** Best Product (primary), Software Utility (primary), Finance Copilot (secondary)
**ASP Type:** A2MCP
**Version:** 1.1 — Pre-submission, corrected against actual implementation
**Last updated:** 2026-07-16

> **This revision corrects v1.0 against the real, verified codebase.** Where v1.0
> described the intended design, this version states plainly what's built vs. not yet
> built. Nothing below is aspirational without being labeled as such — see the ✅/🔲
> markers throughout. Full audit trail behind every correction: `pending.md` (a prior
> session's own build audit, independently consistent with this one) and direct
> source reads of `pipeline/planner/receipt.ts`, `pipeline/passport/index.ts`,
> `wallet/attestation/weightedAccount.ts`, `src/config/chains.ts`.

---

## 1. Product Overview

### 1.1 Problem Statement

Autonomous agents are starting to pay each other with no human in the loop. Zscaler
ThreatLabz documented two live indirect prompt injection (IPI) campaigns in July 2026
that exploit exactly this: a fake package page and a typosquat of DeBank, both hiding
instructions in JSON-LD structured metadata and hidden CSS, successfully manipulating
4 of 26 and 2 of 26 tested LLMs respectively into treating fraudulent content as
authoritative — including, in the first campaign, executing a live (sandboxed) payment.

Exposure today is small — mostly experimental, mostly sandboxed. But OKX.AI's own
premise is agents autonomously hiring, paying, and transacting with other agents at
machine speed. That is exactly the environment where this attack class stops being a
lab curiosity and becomes the dominant fraud vector on the platform.

A related, separate finding worth carrying into the design: OKX's own Agentic Wallet
already risk-grades and blocks known-bad destinations, and CertiK is already a live
OKX.AI ASP that assesses wallet/contract security before a transaction. Neither of
those checks the thing Sentra checks: whether the *instruction that produced the
transaction request* was itself manipulated by content the agent read on the way there.
A freshly-created, unflagged address with no bad history passes both existing checks
and still cleans out an agent's wallet if the agent was talked into it by injected text.

### 1.2 Solution

Sentra is a pre-execution checkpoint. Before an agent executes a payment, credential
grant, or other high-stakes action based on content it read from the web or from
another agent, it runs that proposed action through Sentra's pipeline. Sentra runs a
five-stage pipeline — provenance verification, redundant multi-model extraction,
deterministic policy enforcement, on-chain identity verification, and a signed
attestation — and returns a decision, plus (on approval) a signed **Trust Receipt**.

**Status: the five-stage pipeline is real, built, and tested end-to-end (34/34 tests
passing, real on-chain transactions on Base Sepolia). It is NOT yet exposed as a
callable network service — today it runs as a CLI script (`npm run pipeline:run`), not
an HTTP or MCP endpoint. See §4.1 and §8 for exactly what "`getTrust()`" means right
now vs. what it needs to become before ASP registration is possible.**

### 1.3 One-line Pitch

> "Guardrail vendors guess whether a request is malicious. Sentra makes malicious
> requests structurally incapable of moving funds — and proves it with a signed
> receipt any wallet or ASP can check."

---

## 2. Goals & Success Metrics

### 2.1 Hackathon Goals

| Goal | Status | Notes |
|---|---|---|
| Five-stage pipeline complete and proven | ✅ Done | Real on-chain L2/L3, real LLM quorum, real crypto. `npm run pipeline:run -- --execute` |
| `getTrust()` exposed as a callable service | 🔲 Not built | Today the pipeline is orchestrated inline in `scripts/run-pipeline.ts` (a CLI script), and `planPayment()` (`pipeline/planner/plan.ts`) is the internal pure verdict function — but neither is wrapped in an HTTP/MCP server. **This is the one piece of real work standing between the current build and ASP registration.** |
| Session-key / attestation-gate enforcement demonstrated | ✅ Done | Real 2-of-2 weighted multisig on Base Sepolia — solo agent signature rejected on-chain, combined signature succeeds. `npm run attestation:demo` |
| Trust Receipt issued and verifiable | ✅ Done | Signed, hashed, persisted, round-trip tested (`test/receipt.test.ts`, 6 tests) |
| Trust Passport composable per agent | ✅ Done | Real on-chain identity + reputation reads + local history (`test/passport.test.ts`, 4 tests) |
| Before/after attack demo | ✅ Done | `npm run demo:naive` vs `npm run pipeline:run` — sanitized Campaign 1 fixture blocked, legit invoice passes |
| ASP live and approved on OKX.AI marketplace | 🔲 Not started | Blocked on the HTTP endpoint above, then the manual OKX.AI registration flow (README §8) |
| Demo video ≤90s | 🔲 Not recorded | Storyboard ready: `demo/demo-script.md` |
| Submission before deadline | 🔲 Pending | **Deadline is Jul 17, 2026, 23:59 UTC — see §10 for the corrected timeline; there is roughly a day and a half left, not the three days v1.0 assumed** |

### 2.2 Quality Metrics

| Metric | Target | Status |
|---|---|---|
| Verdict latency (p95, below-threshold path) | < 1s | 🔲 **No such path exists.** Every payment currently runs the full 3-model quorum uniformly — there is no value-based tiering anywhere in `pipeline/quorum/consensus.ts` or `pipeline/planner/plan.ts`. This target has no code path to measure yet; treat it as a design goal for a future optimization, not a current metric |
| Verdict latency (p95, full-quorum path) | < 6s | ⚠️ Not formally benchmarked, but consistent with observed live runs (a few seconds per scenario end-to-end including 3 real LLM calls) |
| False-clear rate on known injection fixture | 0% | ✅ Confirmed — the sanitized Campaign 1 fixture (`fixtures/campaign1-sanitized.ts`) is blocked every run, and a live model-specific injection was actually caught during testing (`fixtures/novel-attack-injection.ts` — one model mis-tagged a field, quorum correctly flagged DISAGREE) |
| Determinism of the interpreter stage | 100% | ✅ `pipeline/interpreter/policy.ts` is pure, deterministic, no LLM — same typed input always produces the same allow/deny |
| Uptime during judging window | 99.9% | 🔲 Not applicable yet — nothing is hosted. Becomes relevant once the HTTP endpoint exists and is deployed somewhere |

---

## 3. User Stories

*(The HTTP/MCP wrapper these describe is now real and deployed — see §4.1.)*

### Primary User: AI Agent (A2MCP caller)

> **As an AI agent about to execute a payment based on content I just read**, I want to
> call a single tool with the proposed transaction and its source content, and get back
> a clear allow/deny decision plus a receipt my wallet can verify, so that I don't need
> to build my own defense against a manipulated source.

**Acceptance criteria:**
- MCP tool `getTrust` accepts the proposed action (`recipient`, `amount`, `currency`)
  and `source_url`; it deliberately does **not** accept a caller-supplied
  `source_content` — it fetches `source_url` itself so the provenance check has real
  response headers to verify, and so a compromised caller can't hand over fabricated
  "content" claiming a signed origin
- Returns a verdict (`PASS` / `FAIL`), a `reason`, and — on both outcomes — a signed
  **Trust Receipt**
- Deterministic at the policy layer: identical typed inputs always produce the same
  allow/deny outcome from the interpreter stage

*(Trust Receipt itself does not currently carry a numeric `risk_score` field — see §4.3
for the real payload shape. If a scalar risk score is wanted for the API response, it
needs to be added; today the receipt's `layers` object carries the structured evidence
instead of a single number.)*

### Secondary User: OKX.AI Escrow / Arbitration Flow

> **As OKX.AI's existing dispute-resolution system**, I want Sentra's verdict and
> evidence log available after the fact, so that a disputed transaction has a
> pre-execution trust record to reference, not just a post-hoc claim.

**Acceptance criteria:**
- Every verdict (pass or block) is logged with its evidence trail — ✅ true today: every
  `issueTrustReceipt()` call captures the full `layers` object (provenance, quorum,
  identity, policy) regardless of PASS/FAIL
- Logs are queryable by receipt reference — ✅ true today, but by **local flat-file
  lookup**, not a real query API: `loadReceipt(receiptId)` reads
  `.sentra-receipts/<receiptId>.json` from disk. There is no database, no index by
  agent/time-range, and no network-exposed way to fetch a receipt yet (see §4.3's
  `GET /receipt/{id}` — not built)

### Tertiary User: Another ASP's Wallet Contract

> **As a smart-contract wallet enforcing a session key**, I want to check a Trust
> Receipt's signature before allowing a UserOperation above a threshold to execute, so
> that funds cannot move on the strength of an agent's judgment alone.

**Acceptance criteria — corrected against what's actually built:**
- ✅ True, but via a different, real mechanism than "a contract checks a Trust Receipt
  field-by-field": Sentra's L3 enforcement is a **2-of-2 weighted multisig** (ZeroDev's
  `@zerodev/weighted-validator`, not a custom contract — see §4.5). The wallet's
  `regular` validator requires combined signature weight ≥ threshold from (a) the
  agent's session key and (b) Sentra's attestation key, over the *exact* UserOperation
  being submitted (`sender`, `callData`, `nonce`, EIP-712-signed). A solo agent
  signature carries only half the required weight and is rejected at validation —
  proven both ways in `scripts/attestation-demo.ts`.
- The Trust Receipt is signed by that *same* attestation key, but today it is a
  **separate, off-chain artifact** — no deployed contract reads or verifies a Trust
  Receipt on-chain. The receipt documents *why* Sentra decided to co-sign; the
  co-signature itself, not the receipt object, is what the chain actually enforces.
  Conflating these two would overstate what's on-chain — see §4.5 for the precise
  boundary.

---

## 4. Feature Specification

### 4.1 `getTrust()` — target interface vs. what exists today ✅ built, tested, deployed

**`pipeline/gettrust.ts`** exports the real, single entry point:
`getTrust({proposedAction, sourceUrl, execute?}) → GetTrustResult`. It deliberately does
**not** accept caller-supplied `source_content` — it fetches `sourceUrl` itself (see the
module's doc comment: trusting a caller's claimed content wholesale would reopen the
exact hole this project exists to close). It is exposed as a real MCP tool
(`services/mcp/getTrustTool.ts`, official `@modelcontextprotocol/sdk`), served locally
(`npm run mcp:serve`) and deployed publicly on Vercel at
**`https://sentra-gettrust.vercel.app/mcp`**. See `docs/mcp-server.md` for the full
verification trail (`test/gettrust.test.ts`, `test/mcpServer.test.ts`, and a live
production tool call over real HTTPS).

**What existed before this (kept for history):**
- `pipeline/planner/plan.ts` exports `planPayment(input: PlannerInput): PlannerResult`
  — a **pure, synchronous** function. It does **not** take raw `source_content` or
  `source_url`; it takes the *already-computed* upstream verdicts:
  ```ts
  interface PlannerInput {
    quorum: QuorumVerdict;
    extraction: InterpreterVerdict;
    identity: IdentityVerdict;
    provenance: ProvenanceVerdict;
  }
  type PlannerResult = { plan: PaymentIntent } | { blocked: true; reason: string };
  ```
  This is deliberate (see the type's own comment: "this function NEVER receives raw
  page content"), and it's the right design for the privileged-planner security
  property — but it means `planPayment` alone is not the `getTrust()` entry point.
- The actual Steps 1→6 orchestration (fetch provenance → run quorum → interpret →
  verify identity → plan → issue receipt → optionally execute) lives **inline** in
  `scripts/run-pipeline.ts`'s `runScenario()`/`main()` — real, tested, working, but
  written as a CLI script, not exported as a reusable, importable function, and not
  reachable over a network.

**This is now done** — `pipeline/gettrust.ts` is exactly this extraction (async
orchestration function, not a CLI script), and `services/mcp/getTrustTool.ts` +
`api/mcp.ts` are the MCP tool server wrapping it, deployed at
`https://sentra-gettrust.vercel.app/mcp`.

**Internal stages, in order (all real, all tested):**

1. **Provenance check (L1a)** — `pipeline/provenance/verify.ts`. Fetches and verifies
   the RFC 9421 (Web Bot Auth pattern) signature on the source, if present. Signed +
   verified → normal scrutiny. Unsigned or mismatched → forced max-scrutiny.
2. **Quorum extraction (L1b)** — `pipeline/quorum/consensus.ts`. 3 independent,
   heterogeneously-vendored models (see §4.1a below — no value-based tiering exists,
   every call runs the same 3-model set) extract `recipient`, `amount`, `currency`.
   Self-declared structured metadata (JSON-LD, Open Graph) is never trusted as a
   signal — both value AND source classification must agree across all responding
   models. Agreement → continue. Disagreement, or fewer than 2 models responding
   (`UNAVAILABLE`) → block, fail closed.
3. **Capability interpreter (L1c)** — `pipeline/interpreter/policy.ts`. Deterministic
   policy code (not a model): only `visible_text`-sourced fields may populate a
   payment-triggering action.
4. **Identity verification (L2)** — `pipeline/identity/verify.ts`. Queries the
   ERC-8004 Identity Registry (real, live, on Base Sepolia/X Layer Testnet, and now
   also proven reachable on Base Mainnet/X Layer Mainnet for reads — see
   `docs/mainnet-readiness.md`). No entry, or a resolved wallet that mismatches the
   claimed counterparty → reject.
5. **Trust Receipt construction** — `pipeline/planner/receipt.ts`. On PASS *or* FAIL,
   builds and signs a Trust Receipt (see §4.3 for the real shape).
6. **Verdict** — `PASS` (with the Trust Receipt and, if `--execute` is passed, a real
   L3 co-signed on-chain payment) or `FAIL` with `reason` and the full evidence log.

#### 4.1a No value-based tiering exists yet

v1.0 implied a threshold below which lighter/faster checks apply. **This is not built.**
Every proposed action — regardless of amount — runs the identical full pipeline:
3-model quorum, full interpreter check, full identity lookup. There is no code path
anywhere that inspects `amount` before deciding how much scrutiny to apply. This is a
safe default (uniform scrutiny), but it means the "<1s below-threshold" latency target
in §2.2 has nothing to measure against today, and the L3 "below-threshold executes
freely" behavior described in v1.0 §4.5 does not exist either — see §4.5 below.

### 4.2 Output Artifacts — real shapes, not the v1.0 sketch

**Trust Receipt** (`pipeline/planner/receipt.ts`, `TrustReceipt`/`TrustReceiptPayload`,
version `TrustReceipt/v0`) — the *actual* fields, not `sign(recipient, amount,
currency, nonce, expiry)` as v1.0 described:

```ts
{
  version: "TrustReceipt/v0",
  scenario: string | null,
  counterparty: Address | null,
  counterpartyAgentId: string | null,
  action: { type: "payment"; asset: string | null; amount: string | null },
  layers: {
    provenance: { status: string; scrutiny: string },
    quorum: { agreement: string; agree: number; of: number; disagreement: boolean },
    identity: { status: "registered"|"rejected"|"skipped"; registryChain: string; agentId: string|null },
    policy: { result: "allow"|"deny"|"skipped"; reasons: string[] },
  },
  verdict: "PASS" | "FAIL",
  reason: string,
  timestamp: number,
  // added at signing time:
  receiptId: Hex,   // keccak256 of the canonical (recursively key-sorted) JSON payload
  signer: Address,  // Sentra's attestation address
  signature: Hex,   // EIP-191 personal-sign over receiptId, via viem
}
```

No `nonce`/`expiry` fields exist on the receipt itself today (v1.0 assumed these for
replay/staleness protection). Replay protection currently comes from a different real
mechanism: the L3 co-signature is bound to the UserOperation's actual on-chain `nonce`
(see §4.5), which is a stronger, chain-enforced property than a nonce field on an
off-chain JSON object would be — but it means the receipt's own nonce/expiry fields, if
wanted for a wallet-side replay check independent of the co-sign flow, are not there
yet and would be new work, not a rename.

Signed with the **same** `SENTRA_ATTESTATION_PRIVATE_KEY` used for L3 co-signing — no
separate key to manage. Persisted as flat JSON files in `.sentra-receipts/`
(`persistReceipt`/`loadReceipt`/`loadAllReceipts`) — explicitly not a database, by
design, for the build timeline. Verified via `verifyTrustReceipt()`, which recomputes
`receiptId` from the payload (catching tampering) and checks the signature recovers to
the claimed `signer` (catching signer substitution). Both directions are unit-tested
(`test/receipt.test.ts`, 6 tests).

**Trust Passport** (`pipeline/passport/index.ts`, `TrustPassport`, version
`TrustPassport/v0`) — a **read-composition view**, not a new contract or a new
on-chain write:

```ts
{
  version: "TrustPassport/v0",
  agentId: string,
  identity: { registered: boolean; registry: "erc8004"; chain: string; resolvedWallet: Address|null; owner: Address|null },
  reputationScore: number | null,        // null if the Reputation registry has zero feedback entries
  reputationSampleCount: number,
  sentraHistory: { totalChecks: number; passed: number; blocked: number; disputesRaised: number }, // disputesRaised always 0 (roadmap)
  verifiedSkills: string[],              // always [] (roadmap, never populated with placeholder data)
  lastAttestation: string | null,        // receiptId of the most recent receipt involving this agent
  generatedAt: number,
}
```

Built from three real reads, none fabricated: (1) ERC-8004 Identity Registry
`ownerOf`/`getAgentWallet`, (2) ERC-8004 Reputation Registry `getSummary()` — returns
`null` score when on-chain feedback count is 0, never a manufactured number, (3) local
`.sentra-receipts/` history filtered by agentId/wallet. Tested end-to-end
(`test/passport.test.ts`, 4 tests). Callable today via `npm run passport:show -- <agentId>`.

### 4.3 Core API — target design, not yet built

Everything in this section (`POST /getTrust`, `GET /receipt/{id}`, `GET /health`, the
x402 402 response) describes the **intended** network interface. **None of it exists
as a running server today** — see §4.1. The response shape needs one correction versus
v1.0 regardless of when it's built: no numeric `risk_score` is currently computed
anywhere in the pipeline (interpreter/quorum/identity produce categorical verdicts, not
a scalar). Either add a real risk-scoring function or drop that field from the response
contract — don't ship a hardcoded/placeholder number.

*(Request/response JSON shapes from v1.0 are otherwise a reasonable target design and
are not repeated here — see v1.0 draft or reconstruct from §4.2's real payload shapes
plus the stage list in §4.1.)*

### 4.4 MCP Tool (FastMCP)

🔲 **Not built.** No MCP SDK dependency exists in `package.json`/`package-lock.json`
(confirmed by direct search). "FastMCP" implies a Python MCP framework; this project
has zero Python anywhere (see §5). If an MCP tool surface is wanted, it needs a
Node/TypeScript MCP SDK (e.g. `@modelcontextprotocol/sdk`), wrapping the same
`getTrust()`-equivalent function §4.1 describes as still needing extraction.

### 4.5 Enforcement Mechanism — corrected: no custom contract, real ZeroDev multisig

**v1.0 described:** `contracts/SentraSessionKey.sol`, a custom ERC-4337 session-key
validator module checking a signed Trust Receipt on-chain, with a below-threshold
free-execution path.

**What's actually built, and it's real:** there is **no Solidity file anywhere in this
repo** (confirmed: `find . -name "*.sol"` returns nothing, and `contracts/` contains
only downloaded ERC-8004 ABI JSON files, not deployed-by-this-project contracts). L3
enforcement instead uses **stock, audited ZeroDev packages**:

- `@zerodev/weighted-validator` — `wallet/attestation/weightedAccount.ts` configures a
  Kernel smart account whose sole controlling validator is a **2-of-2 weighted
  multisig**: `threshold: 100`, two signers each `weight: 50` — the agent's session key
  and Sentra's attestation key. Neither key alone reaches the threshold. Each party's
  `approveUserOperation()` call produces an EIP-712 signature over
  `keccak256(sender, callData, nonce)` — i.e. over the *exact* transaction, not a
  looser approval. `pipeline/executor/executeWithAttestation.ts` wires this into the
  pipeline: the agent partial-signs, Sentra co-signs only after a real PASS verdict,
  `submitCoSigned()` combines both. Proven both directions on real Base Sepolia
  transactions in `scripts/attestation-demo.ts` (solo signature: rejected at
  validation; combined: succeeds).
- `@zerodev/permissions` — `wallet/sessionKey.ts` provides a second, independent,
  already-working L3 primitive: a session key scoped by `CallPolicy` (per-recipient
  value caps) and `TimestampPolicy` (expiry). This is the "static allow-list" model —
  useful for pre-vetted, repeat counterparties — and does not require Sentra's
  per-transaction co-signature. Both mechanisms are real and coexist; they serve
  different trust models (per-transaction attestation vs. pre-approved allowance).

**No below-threshold free-execution path exists.** Every UserOperation through the
weighted-multisig account requires both signatures, regardless of value. Adding a
value-based threshold (small payments skip Sentra's co-sign) would be new design work,
not a rename of something already there.

**Network:** Base Sepolia only. See §7 for why X Layer isn't the enforcement chain
(third-party AA tooling gap, not a code gap) and `docs/mainnet-readiness.md` for the
precise, narrower claim that *is* true: L2 identity reads are chain-agnostic today,
proven live against Base Mainnet and X Layer Mainnet — fund custody (L3) is not.

### 4.6 Identity Registry Integration

**Module:** `pipeline/identity/` — real, not a stand-in.

- Read-only ERC-8004 Identity Registry queries, live on **four** chains via
  `src/config/chains.ts`'s `CHAIN_CONFIG`: Base Sepolia and X Layer Testnet (both
  `live: true` — funded/tested), Base Mainnet and X Layer Mainnet (both `live: false`
  meaning "no funded wallet or L3 flow run here," but reads are proven working —
  `npm run mainnet:readiness-proof` gets a real `PASS` against all four).
- No stand-in/mock registry exists or was ever needed — the real ERC-8004 registry was
  reachable on every chain checked. The "clearly-labeled stand-in if unreachable"
  contingency from the original README never had to be exercised.

---

## 5. Technical Stack — corrected

| Layer | v1.0 said | Actual |
|---|---|---|
| Language | Python 3.11 | **TypeScript** (Node.js, ESM, `"type": "module"`) |
| Runtime / scripts | — | `tsx` (CLI script execution), no build step for dev |
| API framework | FastAPI | 🔲 None yet — no HTTP server exists (see §4.1, §4.3) |
| MCP wrapper | FastMCP | 🔲 None yet — no MCP SDK dependency (see §4.4) |
| Extraction models | 3 heterogeneous vendor models (quorum, L1b) | ✅ Accurate — real, via OpenRouter: free-tier default (Tencent/Cohere/Nvidia, `FREE_QUORUM_MODELS`), paid set available (`PAID_QUORUM_MODELS`: Claude/GPT/Gemini) — `pipeline/quorum/consensus.ts` |
| Provenance verification | RFC 9421 HTTP Message Signatures | ✅ Accurate — real Ed25519 crypto via WebCrypto, real `http-message-sig`/`web-bot-auth` npm packages, `pipeline/provenance/` |
| Payment middleware | Free endpoint / x402 roadmap | 🔲 No endpoint exists yet at all (free or paid); x402 not integrated anywhere (`grep -ril "x402"` returns nothing) |
| Identity registry | ERC-8004 (read-only client) | ✅ Accurate, and broader than stated — 4 chains, see §4.6 |
| Smart contracts | Solidity 0.8.x, Hardhat | 🔲 **None** — no `.sol` files, no Hardhat config, anywhere. See §4.5 |
| Account abstraction | thirdweb SDK (attempted X Layer) → ZeroDev (Base Sepolia, shipped) | ✅ Accurate, with detail: `@zerodev/permissions` (static session key) + `@zerodev/weighted-validator` (mandatory attestation gate) — both real, both shipped |
| Chain | Base Sepolia (launch), X Layer Testnet (roadmap) | Undersold — X Layer Testnet L2 reads are **live today**, not roadmap. L3 stays Base Sepolia-only (real blocker, see §7) |
| Hosting | TBD VPS, nginx, Let's Encrypt | 🔲 Nothing set up — no Dockerfile, no nginx config, no deploy target chosen |
| Container | Docker + docker-compose | 🔲 None exist |
| Testing | — | ✅ `vitest`, 34/34 passing across 6 suites — real on-chain reads, real crypto, real HTTP fetches, no mocks (see repo-wide fake-fallback audit, no findings) |

---

## 6. Payment Model

**Type:** A2MCP (pay-per-call, no negotiation) — decision unchanged from v1.0.
**Gate at launch:** Free endpoint — 🔲 not yet applicable, since no endpoint exists to gate.
**Roadmap:** x402-based paid tier once real per-call model-inference cost justifies it — unchanged, still correctly roadmap (no x402 code anywhere).
**Note on cost reality:** the free-tier quorum models (`FREE_QUORUM_MODELS`) are
genuinely $0 per call but capped at 50 requests/day per OpenRouter account (1000/day
with ≥$10 credit) — relevant to plan around once a live endpoint exists and gets real
traffic, not just for demo recording. See `pipeline/quorum/consensus.ts`'s own
documentation of this constraint.

---

## 7. Non-Functional Requirements — corrected

| Requirement | v1.0 Specification | Status |
|---|---|---|
| Determinism (interpreter stage only) | 100% | ✅ True |
| Latency (p95, below-threshold) | < 1s | 🔲 No below-threshold path exists (§4.1a) |
| Latency (p95, full quorum) | < 6s | ⚠️ Not formally benchmarked |
| Availability | 99.9% during judging window | 🔲 N/A — nothing hosted yet |
| Security | Signing keys in env vars / secrets manager only; never in source | ✅ True — `SENTRA_ATTESTATION_PRIVATE_KEY`, `OWNER_PRIVATE_KEY`, `AGENT_SESSION_PRIVATE_KEY` all read from `.env` (gitignored), never hardcoded |
| Trust Receipt lifetime | Single-use, short expiry window; replay-checked on-chain | ⚠️ Partially true, differently: no expiry field on the receipt object itself; replay protection is real but comes from the L3 UserOperation nonce, not a receipt-level nonce (§4.2) |
| Evidence retention | Logged and queryable for ≥30 days | ⚠️ Logged: yes, indefinitely (flat files, no TTL/eviction). Queryable: only by local filesystem lookup, not a network API (§3) |

---

## 8. Out of Scope (v1)

Unchanged from v1.0, plus one addition:

- ERC-8004 Validation Registry posting (Sentra registering itself as an on-chain validator)
- TEE-attested verification compute
- X Layer as the live *enforcement* (L3) chain (blocked on third-party AA tooling —
  confirmed dead end for thirdweb/BlockPI, OKBund is self-host-only; see
  `docs/x-layer-investigation.md`). X Layer Testnet/Mainnet *identity reads* (L2) are
  in scope and already live — this exclusion is specifically about fund custody.
- Non-EVM chains (Solana, Bitcoin) and non-blockchain payment rails
- Trust Passport used as an enforcement input (v1 treats it as informational only)
- Multi-tenant custom policy configuration per calling agent
- **Value-based quorum/latency tiering** (§4.1a) — every payment gets uniform full
  scrutiny today; this is a safe default, not a regression, but §2.2's below-threshold
  latency target has no corresponding feature yet

---

## 9. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| X Layer AA tooling unsupported for L3 (confirmed: thirdweb rejects X Layer chain ID; BlockPI doesn't list it; OKBund is self-hosted-only) | Realized | Ship enforcement on Base Sepolia + ZeroDev (done); document the X Layer attempt and blocker explicitly (done, `docs/x-layer-investigation.md`); L2 identity reads on X Layer shipped anyway since that part never depended on AA tooling |
| **No HTTP/MCP endpoint exists — ASP registration cannot proceed without it** | **Realized, and the critical path item** | Extract `getTrust()` from `scripts/run-pipeline.ts` into an importable function (§4.1), wrap in a minimal server, deploy somewhere reachable. This is the single highest-priority remaining task — see §10 |
| OKX.AI review takes close to the full 24 hours | Medium, and now time-critical | Given the corrected timeline (§10), registration must be submitted first thing, not mid-window |
| Quorum stage cost/latency at scale | Medium | No tiering built yet (§4.1a) — real gap if traffic materializes; free-tier daily cap (50/1000 requests) is a harder near-term constraint than latency |
| CertiK / wallet-native risk-grading perceived as redundant | Medium | Pitch explicitly names both and states the distinct layer Sentra covers: instruction-integrity, not destination-reputation |
| Sanitized attack fixture doesn't convincingly represent the real campaigns | Low — mitigated | Fixture reconstructs the documented JSON-LD + hidden-CSS technique without reproducing the real site/wallet; a *second*, independently-authored fixture (`fixtures/novel-attack-injection.ts`) caught a genuine live model-specific injection during testing, which is stronger evidence than the primary fixture alone |
| Judges probe and find a claimed-live component is actually stubbed | Medium | This PRD revision exists specifically to close that gap — every ✅/🔲 above is checked against source, not asserted. Repo-wide audit for fake-pass fallbacks found none |

---

## 10. Build Timeline — corrected to match the real deadline

**v1.0 assumed 3 days remaining as of 2026-07-16. The actual deadline is Jul 17, 2026,
23:59 UTC (per `README.md` header) — from 2026-07-16, that's roughly a day and a half,
not three days.** The timeline below is compressed accordingly, and reordered because
most of what v1.0 scheduled across "Day 1–2" is **already done**:

| When | Milestone | Status |
|---|---|---|
| Already complete | Full 5-stage pipeline (L1a/L1b/L1c/L2), L3 attestation gate, Trust Receipt, Trust Passport, sanitized attack fixtures, mainnet-readiness proof, demo storyboard | ✅ Done — this is what v1.0's Day 1–2 targeted, and it's finished |
| Already complete | Extract `getTrust()` as a real importable function; wrap in a real MCP server; deploy it publicly | ✅ Done — live at `https://sentra-gettrust.vercel.app/mcp`, verified over real HTTPS with a real MCP client (see `docs/mcp-server.md`) |
| **Remaining, today or early tomorrow** | Submit OKX.AI ASP registration (agent-driven flow, README §8) — the endpoint is live, so this can start now; review can take up to 24h | 🔲 **The one blocking item** — requires the user's own authenticated agent session |
| **Before deadline (Jul 17, 23:59 UTC)** | Record and post the ≤90s demo video with #OKXAI; submit the Google Form with ASP details + X post link | 🔲 Not started — storyboard ready (`demo/demo-script.md`) |

---

*Sentra — OKX AI Genesis Hackathon 2026*
