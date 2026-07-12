# Sentra — A Pre-Execution Trust Firewall for Agent-to-Agent Payments

**An Agent Service Provider (ASP) for OKX.AI that stops indirect-prompt-injection-driven
payment fraud before funds move — using structural model isolation, cryptographic content
provenance, on-chain agent identity, and hard-enforced spending limits.**

Built for: OKX.AI Genesis Hackathon (submission deadline: Jul 17, 2026, 23:59 UTC)
Primary tracks: Best Product, Software Utility, Finance Copilot

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
| **L3 — Hard spend ceiling** | ERC-4337 smart account with a scoped session key | Total defense failure — caps damage even if L1+L2 are both bypassed |

Design rule carried through every layer: **content never gets trust because it claims to
be trustworthy (structured or not) — only cryptographic or on-chain verification confers
trust.**

---

## 3. Wallet & Testnet Selection (justified by the attack data)

**Wallet SDK: ZeroDev Kernel (ERC-4337 v0.7 modular smart account)**
- The attack Sentra defends against ends in an unauthorized *payment*, so the core
  deliverable is a wallet, not just a scanner. ZeroDev ships a native **Session Key
  Validator** plugin — exactly the primitive needed (spend cap + counterparty allow-list
  + time window) without writing custom account contracts from scratch, which is not
  realistic in 5 days.
- Alternative considered: Biconomy Session Key Manager Module — comparable feature set,
  keep as fallback if ZeroDev bundler quota is a blocker mid-build.
- Rejected: hand-rolled ERC-4337 account — too much audit/build surface for the timeline.

**Testnet: Base Sepolia**
- Campaign 1's actual exploited payment was **ETH-denominated** (0.0012 ETH to a
  hardcoded wallet) — staying in the EVM/ETH family keeps the demo narrative
  (real attack → real defense, same asset family) coherent rather than switching chains.
- Base Sepolia has the most mature, free, low-latency ERC-4337 infrastructure available
  for a hackathon: Coinbase's own bundler/paymaster, the canonical EntryPoint v0.7
  (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`) deployed there, and first-class ZeroDev
  support — minimizing infra risk in a tight window.
- Base Sepolia has a reliable public faucet, avoiding gas-funding delays during the build.
- **Stretch goal, not core path:** OKX Wallet supports multi-chain AA and OKX operates its
  own X Layer testnet — worth a bonus integration late in the build for OKX-native judge
  appeal, but do not put it on the critical path; Base Sepolia tooling is more battle-tested
  under time pressure.

**Rejected:** Ethereum Sepolia (works, but Base Sepolia's paymaster/bundler UX is faster
to stand up), Starknet/zkSync native AA (architecturally incompatible with ERC-4337
session-key tooling used here).

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

**Wallet / spend enforcement (L3):**
- ERC-4337 EIP — https://eips.ethereum.org/EIPS/eip-4337
- ERC-4337 documentation hub — https://docs.erc4337.io
- ZeroDev docs (Kernel + Session Keys) — https://docs.zerodev.app
- OpenZeppelin Account Abstraction docs — https://docs.openzeppelin.com/contracts/5.x/account-abstraction
- Base Sepolia faucet & network docs — https://docs.base.org

**Platform:**
- OKX.AI ASP listing / submission portal — (link from hackathon page; confirm review requirements before Day 1)

> Before building against ERC-8004, verify current mainnet/testnet contract addresses
> directly from the EIP repo or a live block explorer — do not hardcode addresses from
> memory, they change and being wrong here breaks the demo.

---

## 5. End-to-End Flow

```
 Calling Agent (e.g. a coding agent, a shopping agent, or OKX.AI escrow itself)
      │
      │  "I need to pay 0.0012 ETH to 0xABC... for this API key"
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
│  L3 — ERC-4337 SESSION KEY ENFORCEMENT (Base Sepolia)              │
│    → ZeroDev Kernel smart account, scoped session key:             │
│         - spend cap per tx / per time window                       │
│         - counterparty allow-list (cross-checked vs L2)            │
│         - expiry                                                   │
│    → UserOp inside bounds → EntryPoint executes                    │
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
- Set up repo structure, ZeroDev Kernel smart account on Base Sepolia, fund via faucet
- Build ERC-8004 Identity Registry read integration (query real testnet/mainnet registry
  where available; if not yet deployed on Base Sepolia, mock with an equivalent
  on-chain registry contract you deploy yourself, clearly labeled as a stand-in)
- Deliverable: given a wallet/domain, return registered / not-registered

**Day 2 — Hard spend ceiling (L3)**
- Configure ZeroDev session key: max spend per tx, allow-listed recipients, expiry
- Script a UserOperation that attempts to exceed the cap → confirm on-chain revert
- Deliverable: working demo of "even a compromised agent can't overspend"

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
  agent blocks it and shows why

**Day 5 — OKX.AI listing, submission, demo video**
- Submit ASP for OKX.AI review (start this early in the day — do not leave it to the
  last hour given approval is a hard eligibility gate)
- Record the ≤90s demo: before/after split (unprotected agent pays → protected agent
  blocks), brief architecture callout, close on the ERC-8004 + ERC-4337 receipts
- Post to X with #OKXAI, submit the Google Form with ASP details + X post link

---

## 7. What's Real vs. What's Roadmap (state this explicitly in the submission)

**Build genuinely working for the demo:**
- ZeroDev session-key spend cap on Base Sepolia (real, verifiable on-chain)
- Privilege-separated extraction pipeline (real, inspectable)
- Web Bot Auth signature check against real signed responses
- ERC-8004 identity lookup (real if a testnet/mainnet registry instance is reachable;
  otherwise a clearly-labeled stand-in contract with the same interface)

**Explicitly roadmap, say so in the pitch rather than fake it:**
- ERC-8004 Validation Registry posting (Sentra registering itself as an on-chain validator)
- TEE-attested verification compute
- Multi-chain support beyond Base Sepolia
- Production-grade quorum model set (start with 2 models, not 3+, if Day 4 is tight)

---

## 8. Track Alignment

- **Best Product** — primary: differentiated architecture solving a documented, cited
  real-world failure mode, integrates with (not against) OKX.AI's existing escrow model
- **Software Utility** — primary: it's infrastructure other ASPs consume
- **Finance Copilot** — secondary: fits the finance-safety framing
- **Revenue Rocket** — deprioritized: B2B infra revenue won't materialize meaningfully
  within the campaign window; don't lead with this claim in the pitch

---

## 9. Repo Structure (suggested)

```
sentra/
├── README.md
├── contracts/            # session key config, any mock ERC-8004 registry
├── pipeline/
│   ├── provenance/       # Web Bot Auth signature verification
│   ├── quarantine/       # untrusted-content reader, no tool access
│   ├── quorum/           # multi-model consensus extraction
│   └── interpreter/      # deterministic capability/policy rules
├── wallet/                # ZeroDev Kernel integration, session key setup
├── fixtures/              # sanitized test scenarios (no live malicious URLs/wallets)
├── demo/                  # demo script, video assets
└── docs/                  # architecture notes, doc reference links
```

---

## 10. Hard Constraints / Reminders

- Do not reproduce, link to, or drive traffic toward the actual malicious sites or wallet
  address named in the Zscaler report — build sanitized fixtures that mimic the pattern.
- Verify ERC-8004 contract addresses from a live source before integrating; do not trust
  a hardcoded address from any single document, including this one.
- OKX.AI listing approval is a hard eligibility gate — start Day 5's submission early.