# Sentra — Pending Audit

**Audited:** 2026-07-16 · against `README.md` (core build) + `../addon.md` (Trust-layer add-on)
**Last updated:** 2026-07-16 — add-on built, wired, and proven end-to-end on-chain (see §2).
**Deadline:** Jul 17, 2026, 23:59 UTC

---

## TL;DR (current state)

The **core pipeline (`README.md`) and both `addon.md` primitives are now done and proven live.**
All five layers (L1a–L3) plus the new **Trust Receipt** and **Trust Passport** run end-to-end via
`npm run pipeline:run -- --execute`, ending in a real co-signed Base Sepolia transaction.

**Proof from the live run (2026-07-16):**
- Scenario B (legit invoice) → full **PASS** → **L3 attestation-gate tx**
  `0x5040349cce4951e1edaf92ca933e3a28dcd5784fa5b4405dc4f5ca35a0e5dc07` — **on-chain success: true**
  (attestation-gated account `0x9D053dA3a073D0E552aA2f3E7b00048ff6563dCD`).
- Scenario A (fake docs) → **FAIL** (interpreter DENY: fields from `json_ld`).
- Scenario C (novel injection) → **FAIL** (quorum DISAGREE: one model mis-tagged source — caught live).
- **Trust Receipt** signed by Sentra attestation key `0xD3F7…`, `signatureVerified=true`, persisted per verdict.
- **Trust Passport** for agent 8017: real ERC-8004 identity read, `passed: 3` local history, honest `reputationScore: null`.

What remains is **not build work** — it's the manual OKX ASP submission (explicitly out of scope per your
call) and the always-was-roadmap items. See §7.

---

## 1. Core build (`README.md`) — DONE ✅

All five layers real, wired in `scripts/run-pipeline.ts`, tested. Unchanged by the add-on work.

| Layer | File(s) | State |
|---|---|---|
| L1a Provenance (RFC 9421 / Web Bot Auth) | `pipeline/provenance/*` | ✅ real crypto + `test/provenance.test.ts` |
| L1b Quorum (multi-model consensus) | `pipeline/quorum/consensus.ts` | ✅ value+source compare, fail-closed, `test/quorum.test.ts` |
| L1c Quarantine reader | `pipeline/quarantine/reader.ts` | ✅ no-tool extraction, zod boundary |
| L1c Capability interpreter | `pipeline/interpreter/policy.ts` | ✅ deterministic allow/deny, `test/interpreter.test.ts` |
| L2 Identity (ERC-8004 + agent-card) | `pipeline/identity/*` | ✅ live Base Sepolia reads, `test/identity.test.ts` |
| Privileged planner | `pipeline/planner/plan.ts` | ✅ typed-in/typed-out, fails closed |
| L3 Attestation gate (2-of-2 weighted multisig) | `wallet/attestation/*`, `pipeline/executor/executeWithAttestation.ts` | ✅ real ZeroDev, on-chain proven |
| End-to-end pipeline | `scripts/run-pipeline.ts` | ✅ Steps 1→6 + L3 execute, 3 scenarios, **+ receipt + passport** |

---

## 2. `addon.md` deliverables — DONE ✅ (was the main open work; now built + tested)

### 2.1 Trust Receipt — **BUILT, WIRED, TESTED** ✅
- `pipeline/planner/receipt.ts` — formats the Step 6 verdict (PASS *and* FAIL) as `TrustReceipt v0`,
  canonical-hashes it to a `receiptId`, signs with the **existing** Sentra attestation key
  (`SENTRA_ATTESTATION_PRIVATE_KEY`, same key L3 co-signs with — no new key), persists to
  `.sentra-receipts/<receiptId>.json`, and exposes `verifyTrustReceipt` (recompute hash + recover signer).
- Wired into `scripts/run-pipeline.ts` at every Step 6 terminal point; verified live (`signatureVerified=true`).
- Tests: `test/receipt.test.ts` (6) — round-trip verify, deterministic id, tamper detection, signer-swap
  detection, FAIL-receipt path. Uses ephemeral keys (no secret/network needed).

### 2.2 Trust Passport — **BUILT, WIRED, TESTED** ✅
- `pipeline/passport/index.ts` — read-composition view: ERC-8004 Identity read + Reputation-registry
  `getSummary` read + local Trust Receipt history aggregation. Rendered at the end of the pipeline and via
  `npm run passport:show -- <agentId>`.
- Honesty rule enforced in code: `reputationScore: null` when no on-chain feedback exists;
  `verifiedSkills: []` (roadmap); `disputesRaised: 0`. No fabricated numbers.
- Tests: `test/passport.test.ts` (4) — history aggregation, agent isolation, wallet-match fallback, empty case.

### 2.3 Trust Network — framing only, correctly nothing to build ✅
- Pitch closing language, no code. No action.

**Total test suite: 34/34 passing** (10 new). `npm run typecheck` clean.

**Optional/cosmetic (not blocking):** `docs/trust-layer-addon.md` (a repo copy of `addon.md`) still not
checked in — addon §3 suggests it. Skip unless you want it in-repo for judges.

---

## 3. Runtime prerequisites — DONE ✅

- ✅ `.env` populated (all keys set: ZERODEV_RPC, OWNER/SENTRA/AGENT keys, OPENROUTER_API_KEY).
- ✅ `npm install` done.
- ✅ Attestation-gated account funded (L3 tx settled successfully this run).
- ⚠️ **OpenRouter free tier = 50 requests/day PER ACCOUNT** (3 per pipeline run). The demo run above needed a
  fresh-account key to reset the daily cap. Before recording / any burst of runs, either use a fresh-account
  key or add ~$10 credit (unlocks 1000/day). Fail-closed behavior when exhausted is correct, but it blocks
  the green path — don't get caught by it mid-recording.

---

## 4. Demo-script accuracy — FIXED ✅

`demo/demo-script.md` no longer claims "Claude, GPT, Gemini" as the on-screen quorum; it now says
"three different models, from three different labs" and notes the free set (Tencent/Cohere/Nvidia) is the
default with the paid set one config switch away. Name what's actually on screen when recording.

---

## 5. ASP submission (README §8) — OUT OF SCOPE (your call)

You explicitly deprioritized ASP registration for this build session. For the record, if you revisit it:
- The HTTP endpoint (README §8 step 4) is **not built** — pipeline is CLI-only. It's the one code item ASP
  registration would need (thin wrapper over the tested Steps 1→6 + receipt).
- Everything else there is manual you-actions (Agentic Wallet, OnchainOS skill, registration flow, X post,
  Google Form). Draft ASP text is ready in `docs/submission-checklist.md`.

---

## 6. Explicit roadmap — NOT blockers (README §7 already labels these)

- **X Layer as live L3 chain** — code in `wallet/xlayer/`, blocked on third-party bundler support
  (`docs/x-layer-investigation.md`). L3 runs on Base Sepolia — real, proven.
- **ERC-8004 Validation Registry posting** — not built.
- **TEE-attested compute** — not built.
- **Escalation destination** for quorum disagreement / max-scrutiny — "block + log reason" only, by design.

---

## 7. What's actually left

Nothing in the build. To turn this into a submission:
1. **(If recording)** ensure OpenRouter quota is available (fresh key or +$10) — §3.
2. **(If pursuing ASP)** build the HTTP endpoint, then do the manual OKX steps — §5. *Out of scope per your call.*
3. Record the ≤90s X demo (`demo/demo-script.md` storyboard ready) + submit the Google Form.

Code-complete: core pipeline ✅, Trust Receipt ✅, Trust Passport ✅, L3 on-chain ✅, 34/34 tests ✅.
