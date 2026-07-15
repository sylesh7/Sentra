import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  formatEther,
  keccak256,
  recoverMessageAddress,
  toBytes,
  verifyMessage,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "../../src/config/env.js";
import { registryRef } from "../identity/registry.js";
import type { InterpreterVerdict } from "../interpreter/policy.js";
import type { IdentityVerdict } from "../identity/types.js";
import type { ProvenanceVerdict } from "../provenance/types.js";
import type { QuorumVerdict } from "../quorum/types.js";
import type { PaymentIntent } from "./plan.js";

/**
 * TrustReceipt v0 (per docs/trust-layer-addon.md §2.1). This is NOT a new trust model:
 * it's the Step 6 verdict the pipeline already computes, formalized into a signed,
 * portable artifact instead of an internal log line. The exact same object justifies the
 * L3 co-signature and can be handed to OKX.AI's escrow/arbitration flow later -- one
 * verdict, two consumers. It's signed by the SAME Sentra attestation key that co-signs
 * L3 (no new key management), so a receipt's authenticity is verifiable by anyone who
 * knows Sentra's attestation address.
 *
 * Design rule carried over from the rest of the pipeline: nothing here is trusted because
 * it claims to be -- the signature is over a keccak256 hash of a *canonically* serialized
 * payload, so a receipt that was altered by even one byte recovers a different signer (or
 * fails verification outright). See verifyTrustReceipt / trust round-trip test.
 */
export const TRUST_RECEIPT_VERSION = "TrustReceipt/v0" as const;

export interface TrustReceiptPayload {
  version: typeof TRUST_RECEIPT_VERSION;
  /** Optional human label for the scenario that produced this receipt (demo aid, part of the hash). */
  scenario: string | null;
  /** Resolved recipient wallet the payment would/would-not go to (null if never established). */
  counterparty: Address | null;
  /** Counterparty's ERC-8004 agentId, ONLY when identity verification passed on-chain. */
  counterpartyAgentId: string | null;
  action: {
    type: "payment";
    asset: string | null;
    amount: string | null;
  };
  layers: {
    provenance: { status: string; scrutiny: string };
    quorum: { agreement: string; agree: number; of: number; disagreement: boolean };
    identity: { status: "registered" | "rejected" | "skipped"; registryChain: string; agentId: string | null };
    policy: { result: "allow" | "deny" | "skipped"; reasons: string[] };
  };
  verdict: "PASS" | "FAIL";
  reason: string;
  timestamp: number;
}

export interface TrustReceipt extends TrustReceiptPayload {
  /** keccak256 over the canonical JSON of the payload above -- also the persistence key. */
  receiptId: Hex;
  /** Sentra attestation address that produced `signature`. */
  signer: Address;
  /** EIP-191 signature by the Sentra attestation key over `receiptId`. */
  signature: Hex;
}

export interface BuildTrustReceiptInput {
  scenario?: string;
  provenance: ProvenanceVerdict;
  quorum: QuorumVerdict;
  interpretation?: InterpreterVerdict;
  identity?: IdentityVerdict;
  verdict: "PASS" | "FAIL";
  reason: string;
  /** Present only on PASS -- the typed intent the planner emitted. */
  plan?: PaymentIntent;
  /** Override the clock for deterministic tests; defaults to Date.now(). */
  timestamp?: number;
}

/**
 * Deterministic JSON: object keys sorted recursively so the SAME logical payload always
 * hashes to the SAME receiptId regardless of insertion order. Anything non-deterministic
 * here (e.g. relying on V8 key ordering) would make receiptIds unstable and signatures
 * unverifiable across processes.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`);
  return `{${entries.join(",")}}`;
}

function buildPayload(input: BuildTrustReceiptInput): TrustReceiptPayload {
  const consensus = input.quorum.consensusFields;

  const counterparty: Address | null =
    input.plan?.recipient ??
    (input.identity?.verdict === "PASS" ? input.identity.resolvedWallet : null) ??
    ((consensus?.recipientAddress?.value as Address | undefined) ?? null);

  const asset = input.plan?.currency ?? consensus?.currency?.value ?? null;
  const amount = input.plan ? formatEther(input.plan.amountWei) : consensus?.amount?.value ?? null;

  const identityLayer: TrustReceiptPayload["layers"]["identity"] = input.identity
    ? input.identity.verdict === "PASS"
      ? { status: "registered", registryChain: registryRef(), agentId: input.identity.agentId.toString() }
      : { status: "rejected", registryChain: registryRef(), agentId: null }
    : { status: "skipped", registryChain: registryRef(), agentId: null };

  const policyLayer: TrustReceiptPayload["layers"]["policy"] = input.interpretation
    ? { result: input.interpretation.verdict === "ALLOW" ? "allow" : "deny", reasons: input.interpretation.reasons }
    : { result: "skipped", reasons: [] };

  return {
    version: TRUST_RECEIPT_VERSION,
    scenario: input.scenario ?? null,
    counterparty,
    counterpartyAgentId: input.identity?.verdict === "PASS" ? input.identity.agentId.toString() : null,
    action: { type: "payment", asset, amount },
    layers: {
      provenance: { status: input.provenance.status, scrutiny: input.provenance.scrutiny },
      quorum: {
        agreement: input.quorum.agreement,
        agree: input.quorum.members.length,
        of: input.quorum.members.length + input.quorum.failures.length,
        disagreement: input.quorum.agreement === "DISAGREE",
      },
      identity: identityLayer,
      policy: policyLayer,
    },
    verdict: input.verdict,
    reason: input.reason,
    timestamp: input.timestamp ?? Date.now(),
  };
}

export function receiptId(payload: TrustReceiptPayload): Hex {
  return keccak256(toBytes(canonicalize(payload)));
}

/**
 * Builds, hashes, and signs a Trust Receipt. `signerPrivateKey` defaults to the Sentra
 * attestation key from env (the same key L3 uses); tests pass an ephemeral key so they
 * need no real secret. Signing over the receiptId (a keccak256 hash of the canonical
 * payload) means the signature covers every field -- tamper with any of them and either
 * verification fails or a different signer is recovered.
 */
export async function issueTrustReceipt(
  input: BuildTrustReceiptInput,
  signerPrivateKey: Hex = env.SENTRA_ATTESTATION_PRIVATE_KEY ?? requireAttestationKey(),
): Promise<TrustReceipt> {
  const payload = buildPayload(input);
  const id = receiptId(payload);
  const account = privateKeyToAccount(signerPrivateKey);
  const signature = await account.signMessage({ message: { raw: id } });
  return { ...payload, receiptId: id, signer: account.address, signature };
}

function requireAttestationKey(): Hex {
  throw new Error(
    "SENTRA_ATTESTATION_PRIVATE_KEY is not set -- a Trust Receipt must be signed by Sentra's " +
      "attestation key (the same key L3 co-signs with). Set it in .env, or pass a key explicitly.",
  );
}

/**
 * Recomputes the receiptId from the payload (proving the id wasn't tampered with) and
 * verifies the signature came from the claimed signer. Both must hold for a receipt to
 * be trustworthy -- either alone is forgeable.
 */
export async function verifyTrustReceipt(receipt: TrustReceipt): Promise<{ valid: boolean; reason?: string }> {
  const { receiptId: claimedId, signer, signature, ...payload } = receipt;
  const recomputed = receiptId(payload as TrustReceiptPayload);
  if (recomputed !== claimedId) {
    return { valid: false, reason: `receiptId mismatch: payload hashes to ${recomputed}, receipt claims ${claimedId}` };
  }
  const ok = await verifyMessage({ address: signer, message: { raw: claimedId }, signature });
  if (!ok) {
    const actual = await recoverMessageAddress({ message: { raw: claimedId }, signature });
    return { valid: false, reason: `signature does not match signer ${signer} (recovered ${actual})` };
  }
  return { valid: true };
}

// --- Persistence (a plain JSON file store, fetchable by receiptId -- deliberately NOT a
// database, per the add-on's "do not build a database for this in two days" guidance) ---

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECEIPT_STORE_DIR = join(__dirname, "../../.sentra-receipts");

export function receiptStoreDir(): string {
  return RECEIPT_STORE_DIR;
}

export function persistReceipt(receipt: TrustReceipt, dir: string = RECEIPT_STORE_DIR): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, `${receipt.receiptId}.json`);
  writeFileSync(path, JSON.stringify(receipt, null, 2));
  return path;
}

export function loadReceipt(id: Hex, dir: string = RECEIPT_STORE_DIR): TrustReceipt | null {
  const path = join(dir, `${id}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as TrustReceipt;
}

export function loadAllReceipts(dir: string = RECEIPT_STORE_DIR): TrustReceipt[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf-8")) as TrustReceipt);
}
