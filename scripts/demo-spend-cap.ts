import { parseEther, formatEther } from "viem";
import { createSentraKernelAccount, createSentraKernelClient } from "../wallet/kernelAccount.js";
import { createSpendCappedSessionKey } from "../wallet/sessionKey.js";
import { publicClient } from "../src/chain/clients.js";

/**
 * L3 demo, matching README Day 2:
 *   "Script a UserOperation that attempts to exceed the cap -> confirm on-chain revert"
 *   "Deliverable: working demo of even a compromised agent can't overspend"
 *
 * All three UserOps below are real, submitted to the real ZeroDev bundler against the
 * real Base Sepolia EntryPoint. Nothing here is simulated locally.
 */

// Two burner recipients so we can also prove the counterparty allow-list, not just the cap.
const ALLOWED_RECIPIENT = "0x000000000000000000000000000000000000dEaD" as const; // allow-listed
const NOT_ALLOWED_RECIPIENT = "0x000000000000000000000000000000000000bEEF" as const; // never allow-listed

const SPEND_CAP = parseEther("0.0015"); // per-tx cap on ALLOWED_RECIPIENT

async function sendAndReport(label: string, client: ReturnType<typeof createSentraKernelClient>, to: `0x${string}`, value: bigint) {
  console.log(`\n--- ${label} ---`);
  console.log(`to=${to} value=${formatEther(value)} ETH`);
  try {
    const userOpHash = await client.sendUserOperation({
      callData: await client.account!.encodeCalls([{ to, value, data: "0x" }]),
    });
    console.log("submitted userOpHash:", userOpHash);
    const receipt = await client.waitForUserOperationReceipt({ hash: userOpHash });
    console.log("on-chain tx hash:", receipt.receipt.transactionHash);
    console.log("UserOp success:", receipt.success);
    return { outcome: "accepted" as const, receipt };
  } catch (err) {
    const details = (err as { details?: string; shortMessage?: string }).details
      ?? (err as Error).message.split("\n")[0];
    console.log("REJECTED before/at execution:", details);
    return { outcome: "rejected" as const, error: err as Error };
  }
}

async function main() {
  const { account, ecdsaValidator } = await createSentraKernelAccount();
  const balance = await publicClient.getBalance({ address: account.address });
  console.log("Smart account:", account.address, "balance:", formatEther(balance), "ETH");
  if (balance < parseEther("0.005")) {
    throw new Error("Smart account underfunded -- run `npm run wallet:fund -- 0.02` first.");
  }

  const validUntil = Math.floor(Date.now() / 1000) + 3600;
  const { sessionKeyKernelAccount, sessionKeyAddress } = await createSpendCappedSessionKey({
    sudo: ecdsaValidator,
    allowedRecipients: [{ address: ALLOWED_RECIPIENT, maxValueWei: SPEND_CAP }],
    validUntil,
  });
  console.log("\nSession key installed:", sessionKeyAddress);
  console.log("Policy: target =", ALLOWED_RECIPIENT, "| cap =", formatEther(SPEND_CAP), "ETH | validUntil =", new Date(validUntil * 1000).toISOString());

  // This client is built ONLY from the session key account -- it has no access to the
  // owner's private key. It represents what a hired/compromised agent process would hold.
  const sessionClient = createSentraKernelClient(sessionKeyKernelAccount);

  const results: Record<string, string> = {};

  const inCap = await sendAndReport(
    "1. WITHIN cap, allow-listed recipient (should succeed)",
    sessionClient,
    ALLOWED_RECIPIENT,
    parseEther("0.001"),
  );
  results.withinCap = inCap.outcome;

  const overCap = await sendAndReport(
    "2. EXCEEDS cap, allow-listed recipient (should be rejected)",
    sessionClient,
    ALLOWED_RECIPIENT,
    parseEther("0.01"),
  );
  results.overCap = overCap.outcome;

  const wrongTarget = await sendAndReport(
    "3. WITHIN cap, NON-allow-listed recipient (should be rejected)",
    sessionClient,
    NOT_ALLOWED_RECIPIENT,
    parseEther("0.0001"),
  );
  results.wrongTarget = wrongTarget.outcome;

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(results, null, 2));

  const pass =
    results.withinCap === "accepted" &&
    results.overCap === "rejected" &&
    results.wrongTarget === "rejected";
  console.log(pass ? "\nPASS: hard spend ceiling enforced on-chain." : "\nFAIL: check output above.");
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
