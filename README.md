# Sentra — A Pre-Execution Trust Firewall for Agent-to-Agent Payments

**An Agent Service Provider (ASP) for OKX.AI that stops indirect-prompt-injection-driven
payment fraud before funds move — using structural model isolation, cryptographic content
provenance, on-chain agent identity, and hard-enforced spending limits on OKX's own X Layer.**

Built for: OKX.AI Genesis Hackathon (submission deadline: Jul 17, 2026, 23:59 UTC)
Primary tracks: Best Product, Software Utility, Finance Copilot (secondary)

---

## 1. Problem Statement

Zscaler ThreatLabz documented two live indirect prompt injection (IPI) campaigns in
July 2026 that target autonomous AI agents directly:

- **Campaign 1** — a fake Python package page (`requests-secure-v2`) hides instructions
  in JSON-LD structured metadata and CSS-concealed `<div>` content, framing a crypto
  payment as a "routine step" to resolve a fake `MissingLicenseKeyException`. Tested
  against an agent with a live, unrestricted payment tool (sandboxed, no real funds),
  **4 of 26 LLMs** were manipulated into executing the payment.
- **Campaign 2** — a typosquat of DeBank (`debank[.]auction`) uses fabricated JSON-LD
  and hidden-CSS instructions to get itself ranked as the "authoritative" source.
  **2 of 26 LLMs** misclassified it as legitimate — but **0 of 26** did when the agent
  was given the real DeBank URL as a reference point.

**Why this is small today but dangerous soon:** current exposure is mostly experimental.
But OKX.AI's entire premise is agents autonomously hiring, paying, and transacting with
other agents at machine speed, with no human in the loop. That is exactly the environment
where this attack class stops being a lab curiosity and becomes the dominant fraud vector.

**Key finding we design around:** providing a trusted, external reference eliminated the
attack in Campaign 2. Self-declared structured metadata (JSON-LD, Open Graph tags) was the
attacker's primary trust-signal exploit in both campaigns — so structured content must
never be trusted just because it's structured.

Source: [Zscaler ThreatLabz — Indirect Prompt Injection in Web Content Targets AI Agents](https://www.zscaler.com/blogs/security-research/indirect-prompt-injection-web-content-targets-ai-agents)

---

## 2. Solution Overview

Sentra is an ASP other agents call as a mandatory pre-execution checkpoint before any
payment, credential grant, or high-stakes tool call. It layers four independent defenses
so no single bypass compromises the whole system:

| Layer | Mechanism | Defeats |
|---|---|---|
| **L1a — Provenance gate** | Web Bot Auth (RFC 9421 signed HTTP responses) | Typosquats / impersonation (Campaign 2 pattern) |
| **L1b — Quorum consensus** | 2–3 heterogeneous models independently extract payment fields; disagreement = escalate | Model-specific injection susceptibility (the 4/26, 2/26 split) |
| **L1c — Privilege separation** | CaMeL-style quarantined reader + privileged planner + capability interpreter | Structured-metadata trust exploits (JSON-LD abuse, Campaign 1 & 2 pattern) |
| **L2 — Identity verification** | ERC-8004 Identity Registry lookup (the "known-good reference" the data proves works) | Fake ASPs / unregistered counterparties |
| **L3 — Hard spend ceiling** | X Layer smart account (ERC-4337) with a scoped session key | Total defense failure — caps damage even if L1+L2 are both bypassed |

Design rule carried through every layer: **content never gets trust because it claims to
be trustworthy (structured or not) — only cryptographic or on-chain verification confers
trust.**

---

## 3. Wallet & Testnet Selection (updated — X Layer, not Base Sepolia)

**Chain: X Layer Testnet (OKX's own zkEVM L2, chain ID 195)**
- This is OKX.AI's own hackathon, and X Layer is named alongside OnchainOS, the Agent
  Payment Protocol, OKB, and OKX Wallet as the core infrastructure stack underneath
  OKX.AI itself — building here signals direct alignment with the ecosystem this
  hackathon exists to grow, which matters more to these specific judges than a generic
  "any EVM chain" choice.
- Technically viable, not just a symbolic pick: X Layer Testnet is EVM-equivalent
  (Polygon CDK, ZK-rollup, settles to Ethereum) and explicitly supports gas-sponsored
  transactions for both ERC-4337 and EIP-7702, with ~1–2s block times and an official
  faucet (0.01–0.2 OKB/day).
- **Asset-family note carried over from the attack data:** the exploited Campaign 1
  payment was ETH-family/EVM-denominated — X Layer's full EVM-equivalence keeps this
  narrative intact even though gas is OKB-denominated.

**Wallet SDK: thirdweb Account Abstraction (primary)**
- ZeroDev does not currently expose an X Layer bundler/paymaster endpoint — confirmed
  during scoping, so it's out as primary.
- thirdweb explicitly lists X Layer among its supported account-abstraction chains, with
  a predictable bundler/paymaster URL pattern
  (`https://<chain_id>.bundler.thirdweb.com/v2/<thirdweb-client-id>`) and free testnet
  usage with just a client ID — this gives session-key-capable smart accounts (spend
  caps, restricted contract calls, expiry) without hand-rolling AA infrastructure.
- **Fallback if thirdweb integration stalls:** OKBund, OKX's own open-source ERC-4337
  bundler implementation, paired with X Layer's native BlockPI-provided account
  abstraction services — the most platform-native option, but higher integration
  effort under time pressure, so treat as Plan B, not the starting point.
- **Fallback if X Layer itself becomes a blocker:** Base Sepolia + ZeroDev remains the
  most battle-tested combination in the ecosystem. Keep the wallet integration layer
  chain-agnostic (config-driven RPC/bundler URLs, not hardcoded) so switching chains
  doesn't require a rebuild — a same-day decision, not a rewrite, if needed.

**Decision rule for the build:** attempt thirdweb + X Layer first with a firm timebox
(a few hours, not a full day). If a working smart account with an enforced session-key
spend cap isn't live on X Layer by the timebox, fall back immediately rather than losing
a full build day to it — a working demo on a fallback chain beats a broken one on the
"ideal" chain.

**Outcome (2026-07-14):** the decision rule triggered. thirdweb's bundler backend
rejects X Layer Testnet outright (`{"error":"Invalid chain: 1952"}`) across every product
surface tried — client SDK factory path, EIP-7702 path, and the Server Wallets REST API
all fail on the same root cause. BlockPI's bundler docs don't list X Layer at all
(despite this doc originally claiming otherwise). OKBund is real but self-hosted-only,
no public endpoint. Full evidence trail: `docs/x-layer-investigation.md`. **L3 runs on
Base Sepolia + ZeroDev** (fully built and verified on-chain); the X Layer/thirdweb code
stays in the repo as a real, correct, infra-blocked attempt worth revisiting if thirdweb
or BlockPI add X Layer support later.

---

## 4. Documentation References

**The threat (ground truth for the whole project):**
- Zscaler ThreatLabz IPI report — https://www.zscaler.com/blogs/security-research/indirect-prompt-injection-web-content-targets-ai-agents

**Structural defense (L1):**
- CaMeL / "Defeating Prompt Injections by Design" (Google DeepMind) — search "CaMeL prompt injection Google DeepMind" for the current paper link
- Model Context Protocol spec (for tool-boundary design) — https://modelcontextprotocol.io

**Content provenance (L1a):**
- Web Bot Auth architecture draft — https://datatracker.ietf.org/doc/html/draft-meunier-web-bot-auth-architecture
- Web Bot Auth registry/Signature Agent Card draft — https://www.ietf.org/archive/id/draft-meunier-webbotauth-registry-01.html
- Cloudflare Web Bot Auth integration docs — https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/
- HTTP Message Signatures — RFC 9421

**On-chain identity (L2):**
- ERC-8004 "Trustless Agents" spec — search "ERC-8004 Ethereum trustless agents identity registry" for the current EIP link; verify registry contract addresses before integrating
- EAS (Ethereum Attestation Service) docs, as a fallback/complement — https://docs.attest.org

**Wallet / spend enforcement (L3 — X Layer):**
- X Layer developer docs — https://web3.okx.com/xlayer/docs
- X Layer testnet faucet — https://web3.okx.com/xlayer/faucet
- X Layer chain reference (chain ID, RPC, AA support) — https://thirdweb.com/x-layer-testnet
- thirdweb Account Abstraction / Bundler & Paymaster infra — https://portal.thirdweb.com/smart-wallet/infrastructure
- thirdweb "Getting Started with Account Abstraction" — https://portal.thirdweb.com/react/v5/account-abstraction/get-started
- OKBund (OKX's ERC-4337 bundler, fallback option) — search "okx OKBund github" for current repo
- ERC-4337 EIP (spec reference regardless of SDK) — https://eips.ethereum.org/EIPS/eip-4337

**Platform / ASP submission:**
- OKX.AI ASP tutorial — https://www.okx.ai/tutorial/asp
- OKX.AI role/registration overview — https://www.okx.ai/tutorial
- OKX.AI Genesis Hackathon (HackQuest listing) — https://www.hackquest.io/hackathons/OKXAI-Genesis-Hackathon
- OKX Agent Skills (OnchainOS Skills repo) — https://github.com/okx/agent-skills

> Before building against ERC-8004, verify current mainnet/testnet contract addresses
> directly from the EIP repo or a live block explorer — do not hardcode addresses from
> memory, they change and being wrong here breaks the demo.

---

## 5. End-to-End Flow

```
 Calling Agent (e.g. a coding agent, a shopping agent, or OKX.AI escrow itself)
      │
      │  "I need to pay 0.0012 [asset] to 0xABC... for this API key"
      ▼
┌─────────────────────────────────────────────────────────────────┐
│  SENTRA PRE-EXECUTION CHECKPOINT                                  │
│                                                                     │
│  Step 1 — Provenance Gate (L1a)                                   │
│    → Fetch source page's Web Bot Auth signature (if present)      │
│    → Signed + verified origin  → proceed at normal scrutiny       │
│    → Unsigned / mismatched     → force max-scrutiny mode           │
│                                                                     │
│  Step 2 — Quarantined Extraction (L1c)                            │
│    → Untrusted content → quarantined reader (NO tool access)      │
│    → JSON-LD / OG / self-declared metadata = untrusted, always    │
│    → Output: typed fields ONLY (recipient, amount, currency)      │
│                                                                     │
│  Step 3 — Quorum Check (L1b)                                      │
│    → 2–3 independent models re-extract the same fields            │
│    → Agreement → continue / Disagreement → flag + escalate        │
│                                                                     │
│  Step 4 — Identity Verification (L2)                               │
│    → Query ERC-8004 Identity Registry for recipient/counterparty  │
│    → No entry, or mismatch vs. claimed operator → REJECT           │
│    → Verified entry → continue                                    │
│                                                                     │
│  Step 5 — Capability Interpreter (L1c)                             │
│    → Deterministic policy code (not an LLM) checks:                │
│      is this field, from this source, allowed to populate         │
│      a payment-triggering action? → allow / deny                   │
│                                                                     │
│  Step 6 — Verdict                                                  │
│    → PASS: forward typed, verified payment intent to planner       │
│    → FAIL: block, return reasoned explanation + evidence log       │
└─────────────────────────────────────────────────────────────────┘
      │  (only on PASS)
      ▼
 Privileged Planner (never saw raw untrusted content) issues UserOperation
      │
      ▼
┌─────────────────────────────────────────────────────────────────┐
│  L3 — SESSION KEY ENFORCEMENT (X Layer Testnet, ERC-4337)          │
│    → thirdweb smart account, scoped session key:                   │
│         - spend cap per tx / per time window                       │
│         - counterparty allow-list (cross-checked vs L2)            │
│         - expiry                                                   │
│    → UserOp inside bounds → EntryPoint executes, gas-sponsored     │
│    → UserOp outside bounds → reverts on-chain, no human needed     │
└─────────────────────────────────────────────────────────────────┘
      │
      ▼
 Transaction settles (or is cryptographically impossible to settle
 outside policy) — result + Sentra's verdict log available for
 OKX.AI's existing escrow/arbitration flow if a dispute follows.
```

---

## 6. 5-Day Build Plan

**Day 1 — Foundation + identity verification (L2)**
- Set up repo structure; stand up X Layer testnet smart account via thirdweb
  (timeboxed attempt — fall back per the decision rule in Section 3 if it stalls)
- Fund via X Layer faucet
- Build ERC-8004 Identity Registry read integration (query real testnet/mainnet registry
  where available; if not yet deployed/reachable from X Layer tooling, mock with an
  equivalent registry contract you deploy yourself, clearly labeled as a stand-in)
- Deliverable: given a wallet/domain, return registered / not-registered

**Day 2 — Hard spend ceiling (L3)**
- Configure thirdweb session key: max spend per tx, allow-listed recipients, expiry
- Script a UserOperation that attempts to exceed the cap → confirm on-chain revert
- Deliverable: working demo of "even a compromised agent can't overspend," on X Layer

**Day 3 — Structural defense (L1c) + provenance gate (L1a)**
- Build quarantined reader (extraction-only, no tool binding) + privileged planner split
- Implement capability interpreter rules (simple allow/deny policy table is fine)
- Integrate Web Bot Auth signature check against a real signed source + an intentionally
  unsigned/spoofed source for contrast
- Deliverable: pipeline that ingests a page and outputs typed fields only, provenance-tagged

**Day 4 — Quorum layer (L1b) + end-to-end wiring**
- Wire 2–3 models for redundant field extraction, add disagreement-triggers-escalation logic
- Connect all layers into the single Step 1→6 pipeline above
- Reconstruct a safe, sanitized version of the Zscaler Campaign 1 scenario (fake docs page,
  hidden payment instruction) as the test fixture — do not reproduce or link to the actual
  malicious site or wallet address
- Deliverable: full pipeline demo — naive agent pays the fake invoice, Sentra-protected
  agent blocks it and shows why, on X Layer testnet

**Day 5 — ASP submission, listing, demo video, hackathon form**
- Follow the full ASP submission flow in Section 8 below — start early, review can take
  up to 24 hours
- Record the ≤90s demo: before/after split (unprotected agent pays → protected agent
  blocks), brief architecture callout, close on the ERC-8004 + X Layer session-key receipts
- Post to X with #OKXAI, submit the Google Form with ASP details + X post link

---

## 7. What's Real vs. What's Roadmap (state this explicitly in the submission)

**Build genuinely working for the demo:**
- ZeroDev session-key spend cap on **Base Sepolia** (real, verifiable on-chain — see
  `docs/x-layer-investigation.md` for why X Layer isn't the demo chain: thirdweb, BlockPI,
  and OKBund were all tried against it first, per the decision rule in Section 3)
- Privilege-separated extraction pipeline (real, inspectable)
- Web Bot Auth / RFC 9421 signature check against real signed responses (real Ed25519
  crypto, real key-directory fetch, tested against a genuine tampered-body case too)
- ERC-8004 identity lookup (real — IdentityRegistry deployed and verified live on both
  Base Sepolia and X Layer Testnet at the same address)

**Explicitly roadmap, say so in the pitch rather than fake it:**
- X Layer Testnet as the L3 chain, once thirdweb/BlockPI actually support it (code
  already written in `wallet/xlayer/`, blocked purely on third-party bundler support)
- ERC-8004 Validation Registry posting (Sentra registering itself as an on-chain validator)
- TEE-attested verification compute
- Production-grade quorum model set (start with 2 models, not 3+, if Day 4 is tight)

---

## 8. OKX.AI ASP Submission Steps (do not skip — this is a hard eligibility gate)

OKX.AI listing is agent-driven, not a web form — you register through OKX.AI's own
registration agent, not a submitted webpage or pitch deck. Steps, in order:

1. **Set up an Agentic Wallet.** This is required before registering as an ASP — it's
   your unified on-chain identity for both providing and (if needed) testing services.
2. **Install the required OnchainOS Skill.** Available via OpenClaw, Hermes, Claude Code,
   or Codex, per OKX's own guidance — this is what lets your agent interact with the
   OKX.AI registration flow.
3. **Choose your service type — A2MCP for Sentra.**
   - **A2MCP (Agent-to-MCP)** — standardized API service, pay-per-call or free, no
     negotiation. This is the right fit for Sentra: other agents call it, get a
     pass/fail verdict back, no back-and-forth needed.
   - (A2A, with escrow and negotiation, is the alternative for services requiring
     back-and-forth scoping — not the right shape for a checkpoint API.)
4. **Expose a compliant endpoint.** For A2MCP, the endpoint must be either a free
   endpoint that returns the result directly, or an x402-based paid endpoint — the OKX
   Payment SDK is recommended if you go the paid route. Decide early which pricing model
   fits the demo (free during the hackathon window is simplest and removes a dependency).
5. **Register the ASP via OKX.AI's prompt-driven flow.** Follow the Agent's guidance to
   provide: name, description, service list, and default pricing.
6. **Wait for review — up to 24 hours.** OKX reviews each submission and sends the result
   to the email registered with your Agentic Wallet, and to the Agent conversation window.
   This is why Day 5 morning, not evening, is the right time to submit — a same-day
   resubmission cycle is only possible if there's still time left in the window.
7. **Confirm it's live.** If approved, your ASP appears in the OKX.AI Agent marketplace.
   If review is still pending or didn't pass by the deadline, it can still be found and
   used via its Agent ID — but per the hackathon rules, approval and going live is what
   keeps the submission eligible, so don't treat "found via Agent ID" as a safe fallback.
8. **Post the X demo (#OKXAI).** ≤90 seconds, introduce the ASP, explain the use case,
   include a clear demo/walkthrough.
9. **Submit the Google Form before Jul 17, 23:59 UTC.** Must include ASP details and the
   link to your X post.

Reference: https://www.okx.ai/tutorial/asp

---

## 9. Track Alignment

- **Best Product** — primary: differentiated architecture solving a documented, cited
  real-world failure mode, integrates with (not against) OKX.AI's existing escrow model
- **Software Utility** — primary: it's infrastructure other ASPs consume
- **Finance Copilot** — secondary: fits the finance-safety framing, but don't assume it's
  a lock — "copilot" framing usually implies advisory UX, not a firewall other agents call
- **Revenue Rocket** — deprioritized: B2B infra revenue won't materialize meaningfully
  within the campaign window; don't lead with this claim in the pitch

---

## 10. Repo Structure (suggested)

```
sentra/
├── README.md
├── contracts/            # session key config, any mock ERC-8004 registry
├── pipeline/
│   ├── provenance/       # Web Bot Auth signature verification
│   ├── quarantine/       # untrusted-content reader, no tool access
│   ├── quorum/           # multi-model consensus extraction
│   └── interpreter/      # deterministic capability/policy rules
├── wallet/                # thirdweb AA integration, session key setup (X Layer)
├── fixtures/              # sanitized test scenarios (no live malicious URLs/wallets)
├── demo/                  # demo script, video assets
└── docs/                  # architecture notes, doc reference links
```

---

## 11. Hard Constraints / Reminders

- Do not reproduce, link to, or drive traffic toward the actual malicious sites or wallet
  address named in the Zscaler report — build sanitized fixtures that mimic the pattern.
- Verify ERC-8004 contract addresses from a live source before integrating; do not trust
  a hardcoded address from any single document, including this one.
- OKX.AI listing approval is a hard eligibility gate — submit early on Day 5, not late.
- Confirm the thirdweb/X Layer bundler path works before committing further build time
  to it — this was already a known risk point with ZeroDev; don't let it recur silently.
