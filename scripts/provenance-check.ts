import { createServer, type Server } from "node:http";
import { generateEd25519KeyPair } from "../pipeline/provenance/keys.js";
import { buildDirectory } from "../pipeline/provenance/directory.js";
import { signFixtureResponse } from "../pipeline/provenance/sign.js";
import { verifyProvenance, type FetchedResponse } from "../pipeline/provenance/verify.js";

/**
 * Standalone L1a demo.
 *
 * No args: runs the built-in signed-vs-unsigned contrast (real Ed25519 crypto, real
 * local HTTP servers, real RFC 9421 verification -- same primitives as test/provenance.test.ts).
 *
 * With a URL arg: fetches that REAL page over HTTPS and checks for real Signature /
 * Signature-Input headers. Almost any ordinary site will come back UNSIGNED -- that's
 * the honest, expected result; Web Bot Auth response-signing isn't widely deployed yet.
 *   npm run provenance:check -- https://example.com
 */
async function checkRealUrl(url: string) {
  const res = await fetch(url);
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => (headers[key] = value));
  const body = await res.text();

  const response: FetchedResponse = { status: res.status, headers, body };
  const origin = new URL(url).origin;
  const verdict = await verifyProvenance(response, origin);
  console.log(`Checked ${url}`);
  console.log(JSON.stringify(verdict, null, 2));
}

async function runBuiltInDemo() {
  const keys = await generateEd25519KeyPair();
  const server: Server = createServer((req, res) => {
    if (req.url === "/.well-known/http-message-signatures-directory") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(buildDirectory(keys.publicJwk)));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const body = JSON.stringify({ recipient: "0xABC", amount: "0.0012", currency: "ETH" });

    const signed = await signFixtureResponse({ status: 200, contentType: "application/json", body, keypair: keys });
    console.log("--- Signed response, verified against its real origin ---");
    console.log(JSON.stringify(await verifyProvenance(signed, baseUrl), null, 2));

    const unsigned: FetchedResponse = { status: 200, headers: { "content-type": "application/json" }, body };
    console.log("\n--- Unsigned response (typosquat pattern) ---");
    console.log(JSON.stringify(await verifyProvenance(unsigned, baseUrl), null, 2));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const urlArg = process.argv[2];
(urlArg ? checkRealUrl(urlArg) : runBuiltInDemo()).catch((err) => {
  console.error(err);
  process.exit(1);
});
