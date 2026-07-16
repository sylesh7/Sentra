import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createPublicClient, http, verifyMessage } from "viem";
import { baseSepolia as baseSepoliaChain } from "viem/chains";

/**
 * Zero-secret, one-command verifier for judges. Every check here hits either the live
 * public MCP endpoint or a public, keyless Base Sepolia RPC -- no .env, no API key, no
 * npm-installed project secrets required beyond `npm install`. Run with:
 *
 *   npm run verify:live
 *
 * Each check prints ✓/✗ and a concrete piece of evidence (a receipt id, a tx hash, a
 * byte length) rather than just "pass" -- the point is that a judge can take any of
 * these values and independently look them up (a block explorer, the receipt JSON)
 * rather than trusting this script's own verdict.
 */

const MCP_URL = "https://sentra-gettrust.vercel.app/mcp";

// Base's own public RPC -- free, keyless, real (https://docs.base.org/tools/node-providers).
const PUBLIC_RPC = "https://sepolia.base.org";

// Deterministic ERC-8004 Identity Registry address for the testnet CREATE2 tier (same
// address on every testnet, incl. Base Sepolia and X Layer Testnet -- see
// docs/erc8004-addresses.md). Public contract address, not a secret.
const IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;

// A real, mined, successful L3 attestation-gate transaction from this repo's own
// on-chain testing (see pending.md / scripts/attestation-demo.ts): the combined
// agent+Sentra 2-of-2 weighted-multisig signature clearing the ERC-4337 EntryPoint.
// Public tx hash, not a secret -- anyone can look this up on a Base Sepolia explorer.
const L3_PROOF_TX = "0x5040349cce4951e1edaf92ca933e3a28dcd5784fa5b4405dc4f5ca35a0e5dc07" as const;
const ERC4337_ENTRYPOINT = "0x0000000071727de22e5e9d8baf0edac6f37da032" as const;

let passed = 0;
let failed = 0;

function ok(label: string, detail: string) {
  passed++;
  console.log(`\x1b[32m✓\x1b[0m ${label}`);
  console.log(`  ${detail}`);
}

function bad(label: string, detail: string) {
  failed++;
  console.log(`\x1b[31m✗\x1b[0m ${label}`);
  console.log(`  ${detail}`);
}

async function checkMcpEndpointAndSchema() {
  const client = new Client({ name: "sentra-verify-live", version: "1.0.0" }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  await client.connect(transport);
  const { tools } = await client.listTools();
  const getTrust = tools.find((t) => t.name === "getTrust");
  await client.close();

  if (!getTrust) {
    bad("Live MCP endpoint exposes getTrust", `connected to ${MCP_URL} but tool list was: ${tools.map((t) => t.name).join(", ") || "(empty)"}`);
    return;
  }
  const props = Object.keys((getTrust.inputSchema as { properties?: Record<string, unknown> }).properties ?? {});
  const expected = ["recipient", "amount", "currency", "source_url", "execute"];
  const hasAll = expected.every((k) => props.includes(k));
  if (hasAll) {
    ok("Live MCP endpoint reachable, exposes getTrust with the documented schema", `${MCP_URL} -- fields: ${props.join(", ")}`);
  } else {
    bad("getTrust schema matches documentation", `expected ${expected.join(", ")}, got ${props.join(", ")}`);
  }
}

async function callGetTrust(args: Record<string, unknown>): Promise<{ isError: boolean; text: string }> {
  const client = new Client({ name: "sentra-verify-live", version: "1.0.0" }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  await client.connect(transport);
  const result = await client.callTool({ name: "getTrust", arguments: args });
  await client.close();
  const text = (result.content as { type: string; text: string }[])[0]?.text ?? "";
  return { isError: Boolean(result.isError), text };
}

async function checkFailClosedUnreachableSource() {
  const { text } = await callGetTrust({
    recipient: "0x000000000000000000000000000000000000dEaD",
    amount: "0.001",
    currency: "ETH",
    source_url: "http://127.0.0.1:1/unreachable-from-vercel",
  });
  const parsed = JSON.parse(text) as { verdict: string; reason: string; receipt: { receiptId: string; signer: string; signature: `0x${string}` } };

  if (parsed.verdict !== "FAIL") {
    bad("Unfetchable source_url fails closed", `expected verdict FAIL, got ${parsed.verdict}`);
    return;
  }

  // Self-verify the receipt's signature with pure client-side crypto -- no RPC needed,
  // this is a plain ECDSA recovery check against the receiptId the server itself hashed.
  const validSig = await verifyMessage({
    address: parsed.receipt.signer as `0x${string}`,
    message: { raw: parsed.receipt.receiptId as `0x${string}` },
    signature: parsed.receipt.signature,
  });

  if (validSig) {
    ok(
      "Fail-closed on unreachable source_url, with a genuinely signed Trust Receipt",
      `verdict=FAIL reason="${parsed.reason}"\n  receiptId=${parsed.receipt.receiptId}\n  signer=${parsed.receipt.signer} (signature independently recovers correctly)`,
    );
  } else {
    bad("Trust Receipt signature verification", `receiptId=${parsed.receipt.receiptId} signer=${parsed.receipt.signer} -- signature did not recover to signer`);
  }
}

async function checkFailClosedRealUnsignedPage() {
  const { text } = await callGetTrust({
    recipient: "0x000000000000000000000000000000000000dEaD",
    amount: "0.001",
    currency: "ETH",
    source_url: "https://example.com",
  });
  const parsed = JSON.parse(text) as { verdict: string; reason: string };

  if (parsed.verdict === "FAIL") {
    ok(
      "Fails closed against a real, unsigned, non-payment page (no fabricated PASS)",
      `source_url=https://example.com verdict=FAIL reason="${parsed.reason}"`,
    );
  } else {
    bad("Real unsigned page correctly rejected", `expected FAIL, got ${parsed.verdict} for https://example.com -- this would be a real false-PASS bug`);
  }
}

async function checkIdentityRegistryOnChain() {
  const client = createPublicClient({ chain: baseSepoliaChain, transport: http(PUBLIC_RPC) });
  const code = await client.getBytecode({ address: IDENTITY_REGISTRY });
  if (code && code !== "0x" && code.length > 2) {
    ok(
      "ERC-8004 Identity Registry is real deployed bytecode on Base Sepolia (public RPC, no key)",
      `${IDENTITY_REGISTRY} -- ${(code.length - 2) / 2} bytes of code at this address`,
    );
  } else {
    bad("Identity Registry bytecode exists", `${IDENTITY_REGISTRY} returned empty code via ${PUBLIC_RPC}`);
  }
}

async function checkL3AttestationTxOnChain() {
  const client = createPublicClient({ chain: baseSepoliaChain, transport: http(PUBLIC_RPC) });
  const receipt = await client.getTransactionReceipt({ hash: L3_PROOF_TX });
  const succeeded = receipt.status === "success";
  const hitEntryPoint = receipt.to?.toLowerCase() === ERC4337_ENTRYPOINT.toLowerCase();

  if (succeeded && hitEntryPoint) {
    ok(
      "The cited L3 attestation-gate transaction is real, mined, and succeeded (public RPC, no key)",
      `${L3_PROOF_TX}\n  block=${receipt.blockNumber} to=${receipt.to} (ERC-4337 EntryPoint) status=success`,
    );
  } else {
    bad("L3 attestation-gate transaction proof", `${L3_PROOF_TX} -- status=${receipt.status} to=${receipt.to}`);
  }
}

async function main() {
  console.log(`Sentra live verifier -- zero secrets, hits ${MCP_URL} and public Base Sepolia RPC only.\n`);

  const checks: Array<[string, () => Promise<void>]> = [
    ["MCP endpoint + schema", checkMcpEndpointAndSchema],
    ["Fail-closed: unreachable source", checkFailClosedUnreachableSource],
    ["Fail-closed: real unsigned page", checkFailClosedRealUnsignedPage],
    ["On-chain: Identity Registry bytecode", checkIdentityRegistryOnChain],
    ["On-chain: L3 attestation tx", checkL3AttestationTxOnChain],
  ];

  for (const [label, fn] of checks) {
    try {
      await fn();
    } catch (err) {
      bad(label, `threw: ${(err as Error).message}`);
    }
    console.log();
  }

  console.log(`${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    console.log(
      "\nNote: 'Fail-closed: real unsigned page' calls the live quorum stage, which runs on " +
        "Sentra's own OpenRouter free-tier key (50 requests/day, shared across all judges " +
        "hitting the endpoint today). If that specific check fails with a rate-limit reason " +
        "in its output rather than a real logic error, that's the documented daily cap, not a " +
        "defect -- see pipeline/quorum/consensus.ts and docs/mcp-server.md.",
    );
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("verify-live crashed:", err);
  process.exit(1);
});
