import { createServer, type Server } from "node:http";
import type { Address } from "viem";
import { generateEd25519KeyPair } from "../pipeline/provenance/keys.js";
import { buildDirectory } from "../pipeline/provenance/directory.js";
import { signFixtureResponse } from "../pipeline/provenance/sign.js";
import { verifyProvenance, type FetchedResponse } from "../pipeline/provenance/verify.js";
import { extractPaymentFields } from "../pipeline/quarantine/reader.js";
import { interpretExtraction } from "../pipeline/interpreter/policy.js";
import { verifyCounterpartyByAgentId } from "../pipeline/identity/verify.js";
import { planPayment } from "../pipeline/planner/plan.js";
import { campaign1FakeDocsPage, legitInvoicePage } from "../fixtures/campaign1-sanitized.js";
import type { PageContent } from "../pipeline/quarantine/types.js";

const KNOWN_GOOD_AGENT_ID = 8017n; // real, live ERC-8004 agent on Base Sepolia (Phase 1)

async function startDirectoryServer(publicJwk: JsonWebKey | null): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((req, res) => {
    if (req.url === "/.well-known/http-message-signatures-directory" && publicJwk) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(buildDirectory(publicJwk)));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function runScenario(label: string, page: PageContent, response: FetchedResponse, originBaseUrl: string, claimedAgentId: bigint) {
  console.log(`\n${"=".repeat(70)}\nSCENARIO: ${label}\n${"=".repeat(70)}`);

  console.log("\n-- Step 1: Provenance gate (L1a) --");
  const provenance = await verifyProvenance(response, originBaseUrl);
  console.log(`status=${provenance.status} scrutiny=${provenance.scrutiny}`);

  console.log("\n-- Step 2: Quarantined extraction (L1c) --");
  const fields = await extractPaymentFields(page);
  console.log(JSON.stringify(fields, null, 2));

  console.log("\n-- Step 5: Capability interpreter (L1c) --");
  const interpretation = interpretExtraction(fields);
  console.log(`verdict=${interpretation.verdict}`);
  for (const reason of interpretation.reasons) console.log(`  - ${reason}`);

  let identity: Awaited<ReturnType<typeof verifyCounterpartyByAgentId>> | undefined;
  if (fields.recipientAddress) {
    console.log("\n-- Step 4: Identity verification (L2) --");
    identity = await verifyCounterpartyByAgentId(claimedAgentId, fields.recipientAddress.value as Address);
    console.log(`verdict=${identity.verdict}`, identity.verdict === "REJECT" ? `(${identity.reason})` : "");
  }

  console.log("\n-- Step 6: Verdict --");
  if (!identity) {
    console.log("BLOCK: no recipient address extracted, nothing to verify or plan");
    return;
  }
  const plan = planPayment({ extraction: interpretation, identity, provenance, fields });
  if ("blocked" in plan) {
    console.log("BLOCK:", plan.reason);
  } else {
    console.log("PASS -- forwarding to L3:", plan.plan);
  }
}

async function main() {
  const legitKeys = await generateEd25519KeyPair();
  const { server: legitServer, baseUrl: legitBaseUrl } = await startDirectoryServer(legitKeys.publicJwk);
  const { server: attackerServer, baseUrl: attackerBaseUrl } = await startDirectoryServer(null);

  try {
    // Scenario A: sanitized Campaign 1 reconstruction. No signing capability (typosquat
    // pattern) -> unsigned. Payment fields live in JSON-LD / hidden CSS, not visible text.
    const attackerResponse: FetchedResponse = {
      status: 200,
      headers: { "content-type": "text/html" },
      body: JSON.stringify(campaign1FakeDocsPage),
    };
    await runScenario(
      "Naive agent's view: fake docs page (sanitized Campaign 1 pattern)",
      campaign1FakeDocsPage,
      attackerResponse,
      attackerBaseUrl,
      KNOWN_GOOD_AGENT_ID,
    );

    // Scenario B: legitimate invoice, signed by its real origin, payment fields in
    // visible text, recipient matches a real ERC-8004-registered wallet.
    const legitResponse = await signFixtureResponse({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(legitInvoicePage),
      keypair: legitKeys,
    });
    await runScenario(
      "Legitimate invoice page (signed origin, visible-text fields, real registered wallet)",
      legitInvoicePage,
      legitResponse,
      legitBaseUrl,
      KNOWN_GOOD_AGENT_ID,
    );
  } finally {
    await new Promise((resolve) => legitServer.close(resolve));
    await new Promise((resolve) => attackerServer.close(resolve));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
