import { parseEther, formatEther, createWalletClient, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { toECDSASigner } from "@zerodev/weighted-validator";
import { createPartyClient, buildPaymentCall, approveAsParty, submitCoSigned } from "../wallet/attestation/cosign.js";
import { publicClient, baseSepolia } from "../src/chain/clients.js";
import { requireEnv } from "../src/config/env.js";

const RECIPIENT = "0x000000000000000000000000000000000000dEaD" as const;
const PAYMENT_AMOUNT = parseEther("0.0005");

/**
 * Proves the L3 attestation-gate property directly on-chain: the agent's session key
 * ALONE cannot move funds -- the smart account's regular validator is a 2-of-2 weighted
 * multisig (agent 50 + Sentra 50, threshold 100), so a solo agent signature carries only
 * half the required weight and the EntryPoint rejects it before execution. Only after
 * combining the agent's signature with Sentra's own co-signature (which Sentra only ever
 * produces after a real Steps 1-6 PASS -- see pipeline/executor/execute.ts) does the
 * combined weight clear the threshold and the payment actually executes.
 */
async function main() {
  const sessionPrivateKey = generatePrivateKey();
  const sessionAccount = privateKeyToAccount(sessionPrivateKey);
  const sentraAccount = privateKeyToAccount(requireEnv("SENTRA_ATTESTATION_PRIVATE_KEY"));

  console.log("Agent session key:      ", sessionAccount.address, "(weight 50)");
  console.log("Sentra attestation key:  ", sentraAccount.address, "(weight 50)");
  console.log("Threshold: 100 -- neither key alone is sufficient.\n");

  const config = {
    sessionKeyAddress: sessionAccount.address,
    sentraAttestationAddress: sentraAccount.address,
  };

  // Sentra's own view of the account establishes the canonical address.
  const sentraSigner = await toECDSASigner({ signer: sentraAccount });
  const sentraParty = await createPartyClient(sentraSigner, config);
  const accountAddress = sentraParty.account.address;
  console.log("Weighted payment account:", accountAddress);

  const balance = await publicClient.getBalance({ address: accountAddress });
  console.log("Balance:", formatEther(balance), "ETH");
  if (balance < PAYMENT_AMOUNT * 2n) {
    console.log("\nUnderfunded -- sending 0.005 ETH from the owner EOA first...");
    const owner = privateKeyToAccount(requireEnv("OWNER_PRIVATE_KEY"));
    const ownerWalletClient = createWalletClient({ account: owner, chain: baseSepolia, transport: http(baseSepolia.rpcUrls.default.http[0]) });
    const fundTx = await ownerWalletClient.sendTransaction({ to: accountAddress, value: parseEther("0.005") });
    await publicClient.waitForTransactionReceipt({ hash: fundTx });
    console.log("Funded. tx:", fundTx);
  }

  // Agent's own view of the SAME account, pinned to the address Sentra just derived.
  const agentSigner = await toECDSASigner({ signer: sessionAccount });
  const agentParty = await createPartyClient(agentSigner, config, accountAddress);

  const call = await buildPaymentCall(agentParty.account, RECIPIENT, PAYMENT_AMOUNT);
  console.log(`\nPayment call: send ${formatEther(PAYMENT_AMOUNT)} ETH to ${RECIPIENT}`);

  console.log("\n--- Attempt 1: agent submits with ONLY its own signature (weight 50/100) ---");
  const agentOnlySignature = await approveAsParty(agentParty.client, call);
  try {
    await submitCoSigned(agentParty.client, call, [agentOnlySignature]);
    console.log("UNEXPECTED: solo agent signature was accepted -- this should not happen.");
    process.exitCode = 1;
  } catch (err) {
    console.log("REJECTED as expected:", (err as Error).message.split("\n")[0]);
  }

  console.log("\n--- Attempt 2: agent + Sentra co-signature (weight 50+50 = 100/100) ---");
  const sentraSignature = await approveAsParty(sentraParty.client, call);
  // The LAST signer to approve is the one who submits (matches ZeroDev's own
  // multisig example) -- Sentra's client finalizes since it always signs last,
  // only ever after seeing a real Steps 1-6 PASS.
  const receipt = await submitCoSigned(sentraParty.client, call, [agentOnlySignature, sentraSignature]);
  console.log("tx hash:", receipt.receipt.transactionHash);
  console.log("on-chain success:", receipt.success);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
