import { parseEther, formatEther, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { connectAsSentra } from "../wallet/attestation/persistentAccount.js";
import { publicClient, baseSepolia } from "../src/chain/clients.js";
import { requireEnv } from "../src/config/env.js";

/** Sends native ETH from the owner EOA to the persistent attestation-gated account. */
async function main() {
  const amountArg = process.argv[2] ?? "0.01";
  const amount = parseEther(amountArg);

  const { account } = await connectAsSentra();
  const owner = privateKeyToAccount(requireEnv("OWNER_PRIVATE_KEY"));
  const ownerWalletClient = createWalletClient({ account: owner, chain: baseSepolia, transport: http(baseSepolia.rpcUrls.default.http[0]) });

  const ownerBalance = await publicClient.getBalance({ address: owner.address });
  console.log(`Owner ${owner.address} balance: ${formatEther(ownerBalance)} ETH`);
  console.log(`Sending ${amountArg} ETH to attestation-gated account ${account.address} ...`);

  const hash = await ownerWalletClient.sendTransaction({ to: account.address, value: amount });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log("tx hash:", hash);

  const newBalance = await publicClient.getBalance({ address: account.address });
  console.log(`Attestation-gated account balance now: ${formatEther(newBalance)} ETH`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
