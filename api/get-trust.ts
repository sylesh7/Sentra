import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Address } from "viem";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@okxweb3/x402-express";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";
import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import { getTrust } from "../pipeline/gettrust.js";
import { requireEnv } from "../src/config/env.js";

// Real 300s ceiling on Vercel Hobby with Fluid Compute (default, on by default).
export const config = { maxDuration: 300 };

/**
 * Plain-HTTP, x402-protected A2MCP entry point -- built against OKX's own documented
 * seller integration (https://web3.okx.com/onchainos/dev-docs/okxai/howtomcp), using the
 * real OKX Payment SDK (@okxweb3/x402-express/x402-core/x402-evm), not a hand-rolled
 * protocol implementation. Deliberately NOT wrapped in the MCP protocol's Streamable
 * HTTP session handshake (api/mcp.ts is that version, kept for real MCP clients) -- a
 * service that requires a special Accept header before it will even respond isn't
 * reachable by a generic prober, which is what produced the original "endpoint
 * unreachable" / "timed out" / "x402 validation failed" rejection.
 *
 * Sentra's registered listing fee is 0 (free tier): the route below is genuinely priced
 * at $0, so unpaid callers still receive a real, spec-compliant 402 challenge and a real
 * signed authorization is still verified via OKXFacilitatorClient -- this is real x402,
 * not theater -- but no economic value ever moves, matching the on-chain registration.
 */

const NETWORK = "eip155:196"; // X Layer Mainnet, per OKX's own default example

// Constructed lazily, once, on first paid (POST) request -- never at module load. A
// missing/misconfigured OKX credential must not take down the free GET health check;
// it should only ever surface as a real error on the specific route that needs it.
let paymentMiddlewareHandler: ReturnType<typeof paymentMiddleware> | undefined;

function getPaymentMiddleware(): ReturnType<typeof paymentMiddleware> {
  if (!paymentMiddlewareHandler) {
    const facilitator = new OKXFacilitatorClient({
      apiKey: requireEnv("OKX_API_KEY"),
      secretKey: requireEnv("OKX_SECRET_KEY"),
      passphrase: requireEnv("OKX_PASSPHRASE"),
      syncSettle: true,
    });
    const payTo = requireEnv("SENTRA_X402_PAY_TO") as Address;
    paymentMiddlewareHandler = paymentMiddleware(
      {
        accepts: { scheme: "exact", network: NETWORK, payTo, price: "$0" },
        description:
          "Sentra getTrust pre-execution trust check for an agent-to-agent payment -- free tier (price $0)",
        mimeType: "application/json",
      },
      new x402ResourceServer(facilitator).register(NETWORK, new ExactEvmScheme()),
    );
  }
  return paymentMiddlewareHandler;
}

const app = express();
app.use(express.json());

// No explicit path pattern: Vercel forwards the real request path through to this
// function (e.g. "/get-trust" via the vercel.json rewrite, or "/api/get-trust" direct)
// rather than normalizing it to "/" -- Express 5's stricter path-to-regexp wildcard
// syntax makes a single catch-all pattern brittle, so route purely on HTTP method here.
//
// GET and POST are both payment-protected (a real 402 IS proof of reachability -- the
// server responded, it just declined without payment -- so this doesn't reopen the
// original "endpoint unreachable" failure mode). OKX's own `x402-check` CLI defaults to
// probing with a bare GET and expects 402 there too, matching OKX's own doc examples
// (e.g. "GET /generateImg" registered as the priced route) -- an always-200 GET, as this
// endpoint originally had, reads to that check as "not a valid x402 service". HEAD is
// the actual unambiguous liveness probe: unprotected, always 200, no payment semantics.
app.use((req, res, next) => {
  if (req.method === "HEAD") {
    res.status(200).end();
    return;
  }
  if (req.method !== "GET" && req.method !== "POST") {
    next();
    return;
  }
  getPaymentMiddleware()(req, res, next).catch((err) => {
    console.error("x402 payment middleware misconfigured:", err);
    res.status(500).json({ error: `x402 payment middleware misconfigured: ${(err as Error).message}` });
  });
});

app.use(async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST with a JSON body (or GET with the same fields as query params)." });
    return;
  }

  const source = req.method === "GET" ? (req.query as Record<string, unknown>) : (req.body as Record<string, unknown> | undefined);
  const body = source as {
    recipient?: string;
    amount?: string;
    currency?: string;
    source_url?: string;
    execute?: boolean | string;
  } | undefined;

  if (!body || !body.recipient || !body.amount || !body.currency || !body.source_url) {
    res.status(400).json({
      error: "Missing required field(s). Expected: recipient (string), amount (string), currency (string), source_url (string), execute (boolean, optional).",
    });
    return;
  }

  try {
    const result = await getTrust({
      proposedAction: {
        recipient: body.recipient as Address,
        amount: body.amount,
        currency: body.currency,
      },
      sourceUrl: body.source_url,
      execute: body.execute === true || body.execute === "true",
    });
    res.status(200).json(result);
  } catch (err) {
    console.error("Error handling getTrust request:", err);
    res.status(200).json({
      verdict: "FAIL",
      reason: `getTrust failed: ${(err as Error).message}`,
    });
  }
});

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req as unknown as express.Request, res as unknown as express.Response);
}
