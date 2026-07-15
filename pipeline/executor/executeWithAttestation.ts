import { formatEther } from "viem";
import { connectAsAgent, connectAsSentra } from "../../wallet/attestation/persistentAccount.js";
import { buildPaymentCall, approveAsParty, submitCoSigned } from "../../wallet/attestation/cosign.js";
import { publicClient } from "../../src/chain/clients.js";
import type { PaymentIntent } from "../planner/plan.js";

export interface AttestationExecutionResult {
  txHash: `0x${string}`;
  success: boolean;
  accountAddress: `0x${string}`;
}

/**
 * L3 execution via the mandatory attestation gate. The payment account's SOLE
 * controlling validator is a 2-of-2 weighted multisig (agent session key + Sentra
 * attestation key, threshold 100, weight 50 each) -- there is no owner override and no
 * static allow-list the agent could exhaust or reuse without Sentra's involvement.
 * Sentra's co-signature is produced HERE, and only here, and only because this function
 * is only ever called after `planPayment` returns a PASS (see scripts/run-pipeline.ts).
 * A compromised agent process holding only its own session key cannot move funds
 * through this account under any circumstances -- proven on-chain in
 * scripts/attestation-demo.ts (solo agent signature: rejected; combined: succeeds).
 */
export async function executePaymentIntentWithAttestation(plan: PaymentIntent): Promise<AttestationExecutionResult> {
  const sentraParty = await connectAsSentra();
  const accountAddress = sentraParty.account.address;

  const balance = await publicClient.getBalance({ address: accountAddress });
  if (balance < plan.amountWei) {
    throw new Error(
      `attestation-gated account balance ${formatEther(balance)} ETH is below the planned payment ` +
        `${formatEther(plan.amountWei)} ETH -- fund it with \`npm run attestation:fund\` first`,
    );
  }

  const agentParty = await connectAsAgent(accountAddress);
  const call = await buildPaymentCall(agentParty.account, plan.recipient, plan.amountWei);

  // The agent constructs and partially signs the exact call the planner approved --
  // it cannot alter recipient/amount after this point without invalidating its own
  // signature, since approveUserOperation binds to (sender, callData, nonce).
  const agentSignature = await approveAsParty(agentParty.client, call);

  // Sentra co-signs the SAME call. This is the one and only place in the codebase where
  // this happens, and it only runs because the caller already got a PASS.
  const sentraSignature = await approveAsParty(sentraParty.client, call);

  const receipt = await submitCoSigned(sentraParty.client, call, [agentSignature, sentraSignature]);

  return {
    txHash: receipt.receipt.transactionHash,
    success: receipt.success,
    accountAddress,
  };
}
