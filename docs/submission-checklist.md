# OKX.AI ASP submission checklist

Deadline: **Jul 17, 2026, 23:59 UTC**. Maps directly to `README.md` §8. Everything here
that requires your own Agentic Wallet, OKX account, or the OKX.AI agent-driven
registration flow is **your action** — I can prepare the artifacts and code but can't
register an ASP on your behalf or authenticate as you.

## What's ready to submit

| Artifact | Status | Where |
|---|---|---|
| Working pre-execution checkpoint (Steps 1–6) | ✅ real, tested | `scripts/run-pipeline.ts` |
| Real on-chain spend-cap enforcement | ✅ real, tested | `scripts/demo-spend-cap.ts`, tx `0x3a98b1ec...` on Base Sepolia |
| Real on-chain identity verification | ✅ real, tested | `pipeline/identity/`, agentId 8017 on Base Sepolia |
| Real RFC 9421 provenance gate | ✅ real, tested | `pipeline/provenance/`, `test/provenance.test.ts` |
| Real 3-model quorum | ✅ real, tested | `pipeline/quorum/`, Claude + GPT + Gemini via OpenRouter |
| Sanitized Campaign 1 fixture | ✅ | `fixtures/campaign1-sanitized.ts` |
| Demo script/storyboard | ✅ | `demo/demo-script.md` |
| "What's real vs roadmap" honesty section | ✅ | `README.md` §7 |
| X Layer investigation writeup (for judge Q&A) | ✅ | `docs/x-layer-investigation.md` |

## Your action items (README §8, in order)

1. **Set up an Agentic Wallet.** Required before ASP registration — this is your
   unified on-chain identity for the registration flow itself. Not something I can do
   for you (it's tied to your own OKX account/credentials).

2. **Install the OnchainOS Skill.** Via OpenClaw, Hermes, Claude Code, or Codex per
   OKX's guidance. This is what lets *your* agent session talk to the OKX.AI
   registration flow — needs to run in a context authenticated as you, not this one.

3. **Choose A2MCP as the service type.** Already decided in `README.md` §8 — a
   standardized, no-negotiation API service is the right shape for a pass/fail
   checkpoint. Nothing to build differently in this repo for that choice.

4. **Expose a compliant endpoint.** This repo currently runs as CLI scripts
   (`npm run pipeline:run`), not a hosted HTTP endpoint. **Before you can register the
   ASP, this needs to become a real reachable endpoint** — e.g. wrap
   `pipeline/planner/plan.ts`'s Step 1→6 flow in a small HTTP server (Express/Fastify/
   Hono) that accepts a payment-intent request and returns the verdict JSON. Decide
   free vs. x402-paid per your own call in §8; free is simpler for the hackathon
   window. *This is real remaining work* — say the word and I'll build the HTTP
   wrapper next; it's a thin layer over code that already exists and is tested.

5. **Register via OKX.AI's prompt-driven flow.** You provide name/description/service
   list/pricing to the Agent directly — I can draft the description text (see below)
   but the registration conversation itself has to be you or your own agent session.

6. **Wait for review (up to 24h).** Submit the morning of Day 5, not the evening — a
   same-day resubmission cycle needs slack in the window.

7. **Confirm it's live** in the OKX.AI marketplace once approved.

8. **Post the ≤90s X demo with #OKXAI.** Script is ready: `demo/demo-script.md`.
   Recording/posting is a you-action (needs your camera/screen-record setup and your X
   account).

9. **Submit the Google Form** before the deadline, with ASP details + the X post link.

## Draft ASP registration text (for step 5 — edit freely)

> **Name:** Sentra
> **Description:** A pre-execution trust firewall for agent-to-agent payments. Sentra
> sits as a mandatory checkpoint before any payment, credential grant, or high-stakes
> tool call: it verifies content provenance (RFC 9421 signed responses), runs a
> multi-model quorum extraction to catch model-specific prompt-injection susceptibility,
> enforces a deterministic policy that never trusts self-declared structured metadata
> (JSON-LD/Open Graph/hidden CSS) to populate a payment field, checks counterparty
> identity against the ERC-8004 Identity Registry, and — even if every layer above is
> bypassed — caps damage with a hard, on-chain-enforced session-key spend ceiling.
> Built in response to Zscaler ThreatLabz's July 2026 report of live indirect-prompt-
> injection campaigns against AI agents (4 of 26 LLMs manipulated into an unauthorized
> payment in the reported test).
> **Service type:** A2MCP
> **Default pricing:** free (hackathon submission window)

## Before you submit: known gaps to be upfront about if asked

- No hosted endpoint yet (item 4 above) — pipeline runs as CLI/scripts today.
- L3 runs on Base Sepolia, not X Layer Testnet (see `docs/x-layer-investigation.md`
  for why — thirdweb/BlockPI don't support X Layer's AA bundler yet, OKBund is
  self-host-only).
- Quorum is 3 models, no disagreement-triggered secondary review beyond fail-closed
  blocking (no human-in-the-loop or escalation queue built).
- ERC-8004 Validation Registry posting, TEE-attested compute: not built, correctly
  labeled roadmap in `README.md` §7.
