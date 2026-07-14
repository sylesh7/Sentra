import { sendTransaction, prepareTransaction, waitForReceipt } from "thirdweb";
import { toWei } from "thirdweb/utils";
import { formatEther } from "viem";
import { createSentraSmartAccount } from "../wallet/xlayer/smartAccount.js";
import { installSpendCappedSessionKey, connectAsSessionKey } from "../wallet/xlayer/sessionKey.js";
import { xLayerTestnetChain } from "../wallet/xlayer/thirdwebClient.js";
import { xLayerPublicClient } from "../src/chain/xlayer.js";

/**
 * X Layer variant of the Base Sepolia spend-cap demo (scripts/demo-spend-cap.ts). Same
 * three real UserOps, same "even a compromised agent can't overspend" property, this
 * time against thirdweb's IAccountPermissions on X Layer Testnet.
 */
const ALLOWED_RECIPIENT = "0x000000000000000000000000000000000000dEaD" as const;
const NOT_ALLOWED_RECIPIENT = "0x000000000000000000000000000000000000bEEF" as const;
const SPEND_CAP_ETH = "0.0015";

async function sendAndReport(
  label: string,
  client: Awaited<ReturnType<typeof connectAsSessionKey>>["client"],
  account: Awaited<ReturnType<typeof connectAsSessionKey>>["sessionSmartAccount"],
  to: `0x${string}`,
  valueEth: string,
) {
  console.log(`\n--- ${label} ---`);
  console.log(`to=${to} value=${valueEth} OKB`);
  try {
    const transaction = prepareTransaction({
      chain: xLayerTestnetChain,
      client,
      to,
      value: toWei(valueEth),
    });
    const receipt = await sendTransaction({ transaction, account });
    console.log("submitted tx hash:", receipt.transactionHash);
    const confirmed = await waitForReceipt(receipt);
    console.log("status:", confirmed.status);
    return { outcome: "accepted" as const };
  } catch (err) {
    console.log("REJECTED before/at execution:", (err as Error).message.split("\n")[0]);
    return { outcome: "rejected" as const };
  }
}

async function main() {
  const { smartAccount, accountContract, ownerAccount } = await createSentraSmartAccount();
  const balance = await xLayerPublicClient.getBalance({ address: smartAccount.address as `0x${string}` });
  console.log("Smart account:", smartAccount.address, "balance:", formatEther(balance), "OKB");
  if (balance < BigInt(toWei("0.005").toString())) {
    throw new Error("Smart account underfunded -- run `npm run xlayer:fund -- 0.02` first.");
  }

  const validUntil = new Date(Date.now() + 3600 * 1000);
  const { sessionPrivateKey, sessionKeyAddress, installTxHash } = await installSpendCappedSessionKey({
    accountContract,
    ownerAccount,
    allowedRecipients: [{ address: ALLOWED_RECIPIENT, maxValueEth: SPEND_CAP_ETH }],
    validUntil,
  });
  console.log("\nSession key installed:", sessionKeyAddress, "(tx", installTxHash + ")");
  console.log("Policy: target =", ALLOWED_RECIPIENT, "| cap =", SPEND_CAP_ETH, "OKB | validUntil =", validUntil.toISOString());

  const { client: sessionClient, sessionSmartAccount } = await connectAsSessionKey({
    smartAccountAddress: smartAccount.address as `0x${string}`,
    sessionPrivateKey,
  });

  const results: Record<string, string> = {};

  results.withinCap = (
    await sendAndReport("1. WITHIN cap, allow-listed recipient (should succeed)", sessionClient, sessionSmartAccount, ALLOWED_RECIPIENT, "0.001")
  ).outcome;

  results.overCap = (
    await sendAndReport("2. EXCEEDS cap, allow-listed recipient (should be rejected)", sessionClient, sessionSmartAccount, ALLOWED_RECIPIENT, "0.01")
  ).outcome;

  results.wrongTarget = (
    await sendAndReport("3. WITHIN cap, NON-allow-listed recipient (should be rejected)", sessionClient, sessionSmartAccount, NOT_ALLOWED_RECIPIENT, "0.0001")
  ).outcome;

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(results, null, 2));

  const pass = results.withinCap === "accepted" && results.overCap === "rejected" && results.wrongTarget === "rejected";
  console.log(pass ? "\nPASS: hard spend ceiling enforced on-chain (X Layer Testnet)." : "\nFAIL: check output above.");
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
