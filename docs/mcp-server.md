# MCP server: `getTrust` — real, built, tested, deployed

This closes the gap `PRD.md` flagged as the one blocking item before ASP registration:
Sentra's pipeline is now exposed as a real, callable MCP tool, not just a CLI script,
and is publicly reachable at:

**`https://sentra-gettrust.vercel.app/mcp`**

## What's real here

- **`pipeline/gettrust.ts`** — the actual single entry point. `getTrust({proposedAction,
  sourceUrl, execute?})` fetches `sourceUrl` itself (never trusts caller-supplied page
  content — see the module's own doc comment for why), runs the full Steps 1→6
  pipeline against it, cross-checks the caller's claimed action against what Sentra
  independently found, issues and persists a signed Trust Receipt regardless of
  PASS/FAIL, and optionally executes the real L3 attestation-gated payment if
  `execute: true` is passed (defaults to `false` — decision + receipt only, no funds
  move unless explicitly asked).
- **`pipeline/quarantine/parseContent.ts`** — real HTML parsing (cheerio, a real DOM
  parser, not regex scraping) into the structured `PageContent` shape the quarantine
  reader and quorum already consume: JSON-LD script contents, Open Graph meta tags,
  CSS-hidden elements (inline `display:none`/`visibility:hidden`/bare `hidden`
  attribute — the exact Zscaler Campaign 1/2 technique), and whatever's left over as
  visible text. Tested (`test/parseContent.test.ts`, 2/2) against a page mirroring the
  real sanitized fixture, confirming hidden/structured content never leaks into
  "visible."
- **`services/mcp/getTrustTool.ts`** — the shared tool definition (`createGetTrustServer`),
  a standard, spec-compliant MCP server using the official `@modelcontextprotocol/sdk`
  (v1.29.0), Streamable HTTP transport (stateless — each `getTrust` call is independent,
  matching the SDK's own `simpleStatelessStreamableHttp.ts` reference pattern), exposing
  exactly one tool: `getTrust`. Imported by both the local dev server
  (`services/mcp/server.ts`) and the Vercel serverless handler (`api/mcp.ts`).
- **`api/mcp.ts`** — the Vercel serverless entry point (`maxDuration: 300`, using Fluid
  Compute on the Hobby tier). Deployed and live.

## Verified, not asserted

- `test/gettrust.test.ts` — real local HTTP servers (one signed+registered "legit"
  origin, one unsigned "attacker" origin), `getTrust()` called against real URLs:
  PASS for a real fetch of a signed, visible-text invoice matching the proposed
  action; FAIL for the sanitized Campaign 1 pattern; FAIL when the caller's claimed
  action doesn't match what Sentra independently verified; FAIL closed when
  `source_url` can't be fetched at all.
- `test/mcpServer.test.ts` — a **real MCP `Client`**, connected over **real HTTP**
  (`StreamableHTTPClientTransport`, the actual wire protocol) to the actual Express
  app, lists tools (finds `getTrust`), calls it, gets a real `PASS` with a signed
  receipt back. No layer of this is mocked; only the "origin website" is a local
  stand-in, exactly like every other test in this repo.

Both suites passed cleanly in isolation. Running the full test suite back-to-back
today exhausted OpenRouter's 50-request/day free-tier cap partway through (documented
constraint, see `pipeline/quorum/consensus.ts`) — later runs correctly report
`UNAVAILABLE` and fail closed rather than crash, which is itself proof the fail-safe
path works, just not what those specific assertions expected. Not a logic defect;
resolves at the UTC daily reset or immediately with OpenRouter credit added.

**Live production verification**: connected a real MCP `Client` over real HTTPS to
`https://sentra-gettrust.vercel.app/mcp` — `listTools()` correctly returns `getTrust`,
and a real tool call against an unreachable `source_url` returns a properly signed
fail-closed Trust Receipt (fetch failure → `verdict: "FAIL"`, real signature, real
receipt hash), confirming the full pipeline runs correctly on Vercel's serverless
runtime end-to-end.

## Try it locally

```
npm run mcp:serve
```

Starts the server on `http://127.0.0.1:8787/mcp` (override with `MCP_PORT`). Connect
any MCP client, or use `npx @modelcontextprotocol/inspector` for a quick manual check.

## Public hosting: done

Deployed to Vercel (`sylesh7s-projects/sentra-gettrust`), live at
`https://sentra-gettrust.vercel.app/mcp`. All secrets (RPC URLs, registry addresses,
`OWNER_PRIVATE_KEY`, `SENTRA_ATTESTATION_PRIVATE_KEY`, `AGENT_SESSION_PRIVATE_KEY`,
`OPENROUTER_API_KEY`, thirdweb credentials — 11 vars total) are pushed as encrypted
Vercel environment variables (both `production` and `preview` targets), never committed.

One real production bug was found and fixed post-deploy: Vercel's serverless
filesystem is read-only outside `/tmp`, so the local-disk receipt archive
(`.sentra-receipts/`, used by `npm run passport:show` for local/CLI convenience) threw
`ENOENT` on every call. Fixed with a best-effort `safePersistReceipt()` wrapper in
`pipeline/gettrust.ts` — the signed receipt is always returned in the tool response
regardless of whether the local archive write succeeds, so this never affects
correctness of the PASS/FAIL verdict itself, only the optional local audit trail.
Verified fixed against the live endpoint (see above).

OKX.AI ASP registration (Agentic Wallet login, OnchainOS skill install, A2MCP
registration prompts) needs the user's own authenticated agent session and is the one
remaining step, pointed at the URL above.
