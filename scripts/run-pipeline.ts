import { createServer, type Server } from "node:http";
import type { Address } from "viem";
import { generateEd25519KeyPair } from "../pipeline/provenance/keys.js";
import { buildDirectory } from "../pipeline/provenance/directory.js";
import { signFixtureResponse } from "../pipeline/provenance/sign.js";
import { verifyProvenance, type FetchedResponse } from "../pipeline/provenance/verify.js";
import { runQuorumExtraction } from "../pipeline/quorum/consensus.js";
import { interpretExtraction } from "../pipeline/interpreter/policy.js";
import { verifyCounterpartyByDomain } from "../pipeline/identity/verify.js";
import { registryRef } from "../pipeline/identity/registry.js";
import { planPayment, type PaymentIntent } from "../pipeline/planner/plan.js";
import { issueTrustReceipt, persistReceipt, verifyTrustReceipt } from "../pipeline/planner/receipt.js";
import { buildTrustPassport } from "../pipeline/passport/index.js";
import { executePaymentIntentWithAttestation } from "../pipeline/executor/executeWithAttestation.js";
import { campaign1FakeDocsPage, legitInvoicePage } from "../fixtures/campaign1-sanitized.js";
import { novelInjectionPage } from "../fixtures/novel-attack-injection.js";
import type { PageContent } from "../pipeline/quarantine/types.js";

const REAL_AGENT_ID = 8017; // real, live ERC-8004 agent on Base Sepolia (Phase 1), for the legit fixture's agent-card.json

// Real L3 execution moves real (testnet) funds and costs real gas each run, so it's
// opt-in: `npm run pipeline:run -- --execute`. Without the flag this is a pure decision
// run through Steps 1-6 (still 100% real -- real LLM calls, real crypto, real on-chain
// identity reads -- it just stops short of sending a UserOp).
const SHOULD_EXECUTE = process.argv.includes("--execute");

interface TestServer {
  server: Server;
  baseUrl: string;
}

/**
 * A local stand-in for a real origin. `signingJwk` set -> serves a real key directory
 * (L1a can verify a signed response against it). `agentCardRegistrations` set -> serves
 * a real agent-card.json (L2 can discover a claimed identity from this domain). Neither
 * is a stub for the pipeline logic itself -- both are real HTTP responses the real
 * verifyProvenance/verifyCounterpartyByDomain functions fetch and parse for real; only
 * the "is this domain real" question is being stood in for, exactly like a unit test
 * server would for any external dependency.
 */
async function startOriginServer(opts: {
  signingJwk?: JsonWebKey;
  agentCardRegistrations?: { agentId: number; agentRegistry: string }[];
}): Promise<TestServer> {
  const server = createServer((req, res) => {
    if (req.url === "/.well-known/http-message-signatures-directory" && opts.signingJwk) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(buildDirectory(opts.signingJwk)));
      return;
    }
    if (req.url === "/.well-known/agent-card.json" && opts.agentCardRegistrations) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ registrations: opts.agentCardRegistrations }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function runScenario(label: string, page: PageContent, response: FetchedResponse, originBaseUrl: string) {
  console.log(`\n${"=".repeat(70)}\nSCENARIO: ${label}\n${"=".repeat(70)}`);

  console.log("\n-- Step 1: Provenance gate (L1a) --");
  const provenance = await verifyProvenance(response, originBaseUrl);
  console.log(`status=${provenance.status} scrutiny=${provenance.scrutiny}`);

  console.log("\n-- Steps 2+3: Quarantined extraction + quorum consensus (L1c + L1b) --");
  const quorum = await runQuorumExtraction(page);
  for (const member of quorum.members) {
    console.log(
      `  [${member.model}] recipient=${member.fields.recipientAddress?.value ?? "null"} (${member.fields.recipientAddress?.source ?? "-"})` +
        ` amount=${member.fields.amount?.value ?? "null"} currency=${member.fields.currency?.value ?? "null"}`,
    );
  }
  console.log(`agreement=${quorum.agreement}`);
  for (const reason of quorum.reasons) console.log(`  - ${reason}`);

  console.log("\n-- Step 5: Capability interpreter (L1c) --");
  let interpretation: ReturnType<typeof interpretExtraction> | undefined;
  if (quorum.consensusFields) {
    interpretation = interpretExtraction(quorum.consensusFields);
    console.log(`verdict=${interpretation.verdict}`);
    for (const reason of interpretation.reasons) console.log(`  - ${reason}`);
  } else {
    console.log("skipped -- no quorum consensus to interpret");
  }

  // L2 identity is discovered from the ORIGIN itself (real HTTP fetch of
  // {originBaseUrl}/.well-known/agent-card.json), never from a pre-known agentId
  // supplied out of band -- this is the realistic path for an arbitrary incoming page.
  console.log("\n-- Step 4: Identity verification (L2) --");
  const recipient = quorum.consensusFields?.recipientAddress;
  let identity: Awaited<ReturnType<typeof verifyCounterpartyByDomain>> | undefined;
  if (recipient) {
    identity = await verifyCounterpartyByDomain(originBaseUrl, recipient.value as Address);
    console.log(`verdict=${identity.verdict}`, identity.verdict === "REJECT" ? `(${identity.reason})` : "");
  } else {
    console.log("skipped -- no consensus recipient to verify");
  }

  console.log("\n-- Step 6: Verdict --");
  let verdict: "PASS" | "FAIL";
  let reason: string;
  let plan: PaymentIntent | undefined;

  if (!interpretation || !identity) {
    verdict = "FAIL";
    reason = quorum.reasons.join("; ");
    console.log("BLOCK:", reason);
  } else {
    const planned = planPayment({ quorum, extraction: interpretation, identity, provenance });
    if ("blocked" in planned) {
      verdict = "FAIL";
      reason = planned.reason;
      console.log("BLOCK:", reason);
    } else {
      verdict = "PASS";
      reason = "All checks passed; counterparty verified via ERC-8004 Identity Registry.";
      plan = planned.plan;
      console.log("PASS -- forwarding to L3:", plan);
    }
  }

  // Trust Receipt (add-on L §2.1): formalize the Step 6 verdict -- PASS *or* FAIL, a block
  // is evidence too -- into a signed, portable artifact. Signed by Sentra's attestation
  // key (the same key L3 co-signs with), persisted fetchable by receiptId, and verified
  // right here so the demo proves the signature round-trips.
  console.log("\n-- Trust Receipt (signed, portable verdict artifact) --");
  const receipt = await issueTrustReceipt({ scenario: label, provenance, quorum, interpretation, identity, verdict, reason, plan });
  const receiptPath = persistReceipt(receipt);
  const check = await verifyTrustReceipt(receipt);
  console.log(`receiptId=${receipt.receiptId}`);
  console.log(`verdict=${receipt.verdict}  signer=${receipt.signer}  signatureVerified=${check.valid}`);
  console.log(`persisted: ${receiptPath}`);

  if (verdict !== "PASS" || !plan) return;

  if (!SHOULD_EXECUTE) {
    console.log("\n(dry run -- pass --execute to actually send this payment on Base Sepolia)");
    return;
  }

  console.log("\n-- L3: mandatory attestation-gate execution (Base Sepolia) --");
  console.log("(the agent's session key ALONE cannot authorize this -- see scripts/attestation-demo.ts");
  console.log(" for the on-chain proof; Sentra's co-signature below is what makes it possible)");
  const result = await executePaymentIntentWithAttestation(plan);
  console.log("attestation-gated account:", result.accountAddress);
  console.log("tx hash:", result.txHash);
  console.log("on-chain success:", result.success);
}

async function main() {
  const legitKeys = await generateEd25519KeyPair();

  // Legit origin: signs its responses AND publishes an agent-card.json claiming the
  // real, on-chain-registered agentId 8017.
  const legit = await startOriginServer({
    signingJwk: legitKeys.publicJwk,
    agentCardRegistrations: [{ agentId: REAL_AGENT_ID, agentRegistry: registryRef() }],
  });
  // Attacker origin (Campaign 1 pattern): no signing capability, no agent-card.json --
  // it doesn't control any real origin's webroot or any real agent's identity.
  const attacker = await startOriginServer({});
  // A second, DIFFERENT attacker origin for the novel-injection fixture: also nothing,
  // proving this isn't special-cased to the first attacker fixture's shape.
  const attacker2 = await startOriginServer({});

  try {
    const attackerResponse: FetchedResponse = {
      status: 200,
      headers: { "content-type": "text/html" },
      body: JSON.stringify(campaign1FakeDocsPage),
    };
    await runScenario(
      "A: naive agent's view -- fake docs page (sanitized Campaign 1 pattern)",
      campaign1FakeDocsPage,
      attackerResponse,
      attacker.baseUrl,
    );

    const legitResponse = await signFixtureResponse({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(legitInvoicePage),
      keypair: legitKeys,
    });
    await runScenario(
      "B: legitimate invoice -- signed origin, visible-text fields, real registered wallet",
      legitInvoicePage,
      legitResponse,
      legit.baseUrl,
    );

    const injectionResponse: FetchedResponse = {
      status: 200,
      headers: { "content-type": "text/html" },
      body: JSON.stringify(novelInjectionPage),
    };
    await runScenario(
      "C: novel attack -- different wallet/amount/narrative, prompt injection targeting the extractor itself",
      novelInjectionPage,
      injectionResponse,
      attacker2.baseUrl,
    );
  } finally {
    await new Promise((resolve) => legit.server.close(resolve));
    await new Promise((resolve) => attacker.server.close(resolve));
    await new Promise((resolve) => attacker2.server.close(resolve));
  }

  // Trust Passport (add-on L §2.2): a read-composition view of everything Sentra knows
  // about one agent -- on-chain ERC-8004 identity + reputation, plus Sentra's own local
  // Trust Receipt history (which the scenarios above just populated). Built for the real,
  // on-chain-registered agent 8017 that scenario B verified and passed. Honest nulls where
  // no data exists (reputation not yet populated, no verified skills) -- never faked.
  console.log(`\n${"=".repeat(70)}\nTRUST PASSPORT: agent ${REAL_AGENT_ID}\n${"=".repeat(70)}`);
  const passport = await buildTrustPassport(BigInt(REAL_AGENT_ID));
  console.log(JSON.stringify(passport, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
