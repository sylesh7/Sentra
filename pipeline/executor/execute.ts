import { formatEther } from "viem";
import { createSentraKernelAccount, createSentraKernelClient } from "../../wallet/kernelAccount.js";
import { createSpendCappedSessionKey } from "../../wallet/sessionKey.js";
import { publicClient } from "../../src/chain/clients.js";
import type { PaymentIntent } from "../planner/plan.js";

export interface ExecutionResult {
  txHash: `0x${string}`;
  success: boolean;
  sessionKeyAddress: `0x${string}`;
}

/**
 * L3 execution: only ever called on a planner PASS. Installs a session key scoped
 * EXACTLY to this plan (this recipient, capped at this amount, short expiry) and sends
 * the payment through it rather than the owner key -- so the actual payment path is
 * provably bounded by the same on-chain enforcement proven in Phase 2, not by
 * application trust in the planner's output.
 */
export async function executePaymentIntent(plan: PaymentIntent): Promise<ExecutionResult> {
  const { account, ecdsaValidator } = await createSentraKernelAccount();

  const balance = await publicClient.getBalance({ address: account.address });
  if (balance < plan.amountWei) {
    throw new Error(
      `smart account balance ${formatEther(balance)} ETH is below the planned payment ${formatEther(plan.amountWei)} ETH`,
    );
  }

  const validUntil = Math.floor(Date.now() / 1000) + 600; // 10 minutes -- this session key is single-purpose
  const { sessionKeyKernelAccount, sessionKeyAddress } = await createSpendCappedSessionKey({
    sudo: ecdsaValidator,
    allowedRecipients: [{ address: plan.recipient, maxValueWei: plan.amountWei }],
    validUntil,
  });

  const sessionClient = createSentraKernelClient(sessionKeyKernelAccount);

  const userOpHash = await sessionClient.sendUserOperation({
    callData: await sessionClient.account!.encodeCalls([
      { to: plan.recipient, value: plan.amountWei, data: "0x" },
    ]),
  });
  const receipt = await sessionClient.waitForUserOperationReceipt({ hash: userOpHash });

  return {
    txHash: receipt.receipt.transactionHash,
    success: receipt.success,
    sessionKeyAddress,
  };
}
