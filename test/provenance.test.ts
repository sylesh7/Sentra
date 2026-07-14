import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { generateEd25519KeyPair, type Ed25519KeyPair } from "../pipeline/provenance/keys.js";
import { buildDirectory } from "../pipeline/provenance/directory.js";
import { signFixtureResponse } from "../pipeline/provenance/sign.js";
import { verifyProvenance } from "../pipeline/provenance/verify.js";

/**
 * Two local HTTP servers stand in for two real domains: `legit` hosts the real origin's
 * key directory, `attacker` hosts a completely different keypair's directory (it does
 * NOT have the real origin's private key -- it can never produce a directory containing
 * the real keyid, exactly like a typosquat can't fork someone else's webroot).
 */
let legitServer: Server;
let legitBaseUrl: string;
let legitKeys: Ed25519KeyPair;

let attackerServer: Server;
let attackerBaseUrl: string;

beforeAll(async () => {
  legitKeys = await generateEd25519KeyPair();
  const attackerKeys = await generateEd25519KeyPair();

  legitServer = createServer((req, res) => {
    if (req.url === "/.well-known/http-message-signatures-directory") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(buildDirectory(legitKeys.publicJwk)));
      return;
    }
    res.writeHead(404).end();
  });
  attackerServer = createServer((req, res) => {
    if (req.url === "/.well-known/http-message-signatures-directory") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(buildDirectory(attackerKeys.publicJwk)));
      return;
    }
    res.writeHead(404).end();
  });

  await new Promise<void>((resolve) => legitServer.listen(0, "127.0.0.1", resolve));
  await new Promise<void>((resolve) => attackerServer.listen(0, "127.0.0.1", resolve));
  const legitPort = (legitServer.address() as { port: number }).port;
  const attackerPort = (attackerServer.address() as { port: number }).port;
  legitBaseUrl = `http://127.0.0.1:${legitPort}`;
  attackerBaseUrl = `http://127.0.0.1:${attackerPort}`;
});

afterAll(async () => {
  await new Promise((resolve) => legitServer.close(resolve));
  await new Promise((resolve) => attackerServer.close(resolve));
});

describe("L1a provenance gate (real RFC 9421 crypto)", () => {
  it("PASSes a genuinely signed response verified against the real origin's directory", async () => {
    const signed = await signFixtureResponse({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ recipient: "0xABC", amount: "0.0012", currency: "ETH" }),
      keypair: legitKeys,
    });

    const verdict = await verifyProvenance(signed, legitBaseUrl);
    expect(verdict.status).toBe("SIGNED_VERIFIED");
    expect(verdict.scrutiny).toBe("normal_scrutiny");
  });

  it("forces max scrutiny when there is no signature at all (the typosquat case)", async () => {
    const unsigned = {
      status: 200,
      headers: { "content-type": "text/html" },
      body: "<html>totally legit page</html>",
    };

    const verdict = await verifyProvenance(unsigned, attackerBaseUrl);
    expect(verdict.status).toBe("UNSIGNED");
    expect(verdict.scrutiny).toBe("max_scrutiny");
  });

  it("catches a tampered body even though the signature headers are untouched", async () => {
    const signed = await signFixtureResponse({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ recipient: "0xABC", amount: "0.0012", currency: "ETH" }),
      keypair: legitKeys,
    });

    const tampered = { ...signed, body: JSON.stringify({ recipient: "0xEVIL", amount: "5.0", currency: "ETH" }) };

    const verdict = await verifyProvenance(tampered, legitBaseUrl);
    expect(verdict.status).toBe("CONTENT_DIGEST_MISMATCH");
    expect(verdict.scrutiny).toBe("max_scrutiny");
  });

  it("rejects when the signature's keyid isn't in the claimed origin's own directory (stolen headers)", async () => {
    // Signed for real by the legit origin's key, but "served" (in this test) as if it
    // came from the attacker's domain -- the attacker's directory only has ITS OWN key.
    const signed = await signFixtureResponse({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ recipient: "0xABC", amount: "0.0012", currency: "ETH" }),
      keypair: legitKeys,
    });

    const verdict = await verifyProvenance(signed, attackerBaseUrl);
    expect(verdict.status).toBe("KEY_NOT_IN_DIRECTORY");
    expect(verdict.scrutiny).toBe("max_scrutiny");
  });

  it("rejects an expired signature", async () => {
    const signed = await signFixtureResponse({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ recipient: "0xABC", amount: "0.0012", currency: "ETH" }),
      keypair: legitKeys,
      expiresInSeconds: -1,
    });

    const verdict = await verifyProvenance(signed, legitBaseUrl);
    expect(verdict.status).toBe("EXPIRED");
    expect(verdict.scrutiny).toBe("max_scrutiny");
  });
});
