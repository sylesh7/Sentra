# Sentra demo script (target: ≤90 seconds)

Everything cited below is a real, independently-verifiable artifact from this build —
no staged output, no placeholder tx hashes. Re-run any command yourself; the receipts
are on public testnet block explorers.

## Structure (90s budget)

| Time | Beat | What's on screen |
|---|---|---|
| 0:00–0:10 | Hook | The problem, stated plainly |
| 0:10–0:30 | Before | Naive agent gets tricked |
| 0:30–0:60 | After | Sentra blocks it, shows why, and passes the real one |
| 0:60–0:80 | Architecture | 30-second callout of the 5 layers |
| 0:80–0:90 | Close | The on-chain receipts |

## Shot list / narration

**0:00–0:10 — Hook**

> "In July 2026, Zscaler caught two real prompt-injection campaigns tricking AI agents
> into sending crypto payments — hidden in JSON-LD, not in what the agent actually
> reads. 4 out of 26 LLMs fell for it. Sentra is the checkpoint that stops that before
> funds move."

**0:10–0:30 — Before: naive agent gets tricked**

Terminal, run live:
```
npm run demo:naive
```
Narrate over the output: "This fake package docs page hides a payment instruction in
JSON-LD — the exact Campaign 1 pattern. A naive agent scanning the whole page for
anything payment-shaped finds it and would send it immediately. No checks."

**0:30–0:60 — After: Sentra blocks it, then passes the real one**

Terminal, run live:
```
npm run pipeline:run -- --execute
```
Narrate over the output as it streams:
- "Same fake page. Provenance gate: unsigned — max scrutiny."
- "Three different models — Claude, GPT, Gemini — independently extract the fields.
  They agree... on where it's hidden. Capability interpreter: DENY. JSON-LD never
  authorizes a payment, full stop."
- "Identity check rejects it too — that wallet isn't the counterparty it claims to be."
- Cut to the second scenario: "Now a real invoice, signed by its real origin, fields in
  plain text, recipient is a real registered agent on-chain. Same pipeline: PASS —
  and Sentra sends it for real, inside a spend cap it can't exceed even if compromised."

**0:60–0:80 — Architecture (30s callout, voice over a static diagram)**

> "Five independent layers, each defeating a different part of the attack: cryptographic
> provenance for typosquats, model quorum for injection-susceptible LLMs, quarantined
> extraction with a deterministic policy layer for structured-metadata tricks, on-chain
> identity so 'trusted' means cryptographically verified, and a hard spend ceiling that
> holds even if everything above it fails."

**0:80–0:90 — Close: the receipts**

Show on screen (have both tabs pre-opened):
- ERC-8004 IdentityRegistry, Base Sepolia, agentId 8017:
  `https://sepolia.basescan.org/address/0x8004A818BFB912233c491871b3d84c89A494BD9e`
- The real L3 payment tx from the `--execute` run above (grab the fresh hash it prints;
  see also the Phase 2 spend-cap-enforcement proof:
  `https://sepolia.basescan.org/tx/0x3a98b1ec40de912efeeeca84ac39ce63746b55c8c830ed0f3119905dbb7e28a4`
  — a UserOp that exceeded the session key's cap, reverted at validation, on-chain)

> "Every number on screen is a real transaction. Sentra: OKX.AI's pre-execution
> checkpoint for agent-to-agent payments."

## Recording checklist

- [ ] Run `npm run demo:naive` once beforehand to confirm output looks clean on the
      recording machine (no dependency install noise mid-take)
- [ ] Run `npm run pipeline:run -- --execute` once beforehand for the same reason, AND
      to get a fresh tx hash for the close (grab it from the "L3: session-key-scoped
      execution" section of the output)
- [ ] Have both BaseScan tabs pre-loaded before recording (don't wait on page loads
      inside the 90s)
- [ ] Confirm `.env` has funded balances before recording — re-run
      `npm run wallet:address` then check balance if unsure
- [ ] Captions/subtitles recommended since it's dense — OKX.AI judges may watch muted

## What NOT to claim in the video

Per `README.md` §7, be explicit if asked in follow-up: X Layer Testnet is not the demo
chain (thirdweb/BlockPI don't support it yet — `docs/x-layer-investigation.md` has the
full evidence trail), quorum is 3 models not the roadmap's larger set, and ERC-8004
Validation Registry posting is not implemented. Don't let the video imply otherwise.
