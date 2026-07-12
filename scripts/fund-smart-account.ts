import { createWalletClient, http, parseEther, formatEther } from "viem";
import { createSentraKernelAccount } from "../wallet/kernelAccount.js";
import { getOwnerSigner } from "../wallet/kernelAccount.js";
import { publicClient, baseSepolia } from "../src/chain/clients.js";

/**
 * Sends native ETH from the owner EOA to the Sentra Kernel smart account address so
 * the smart account has real balance to pay out from. Usage:
 *   npm run wallet:fund -- 0.02
 */
async function main() {
  const amountArg = process.argv[2] ?? "0.02";
  const amount = parseEther(amountArg);

  const { account } = await createSentraKernelAccount();
  const owner = getOwnerSigner();

  const ownerWalletClient = createWalletClient({
    account: owner,
    chain: baseSepolia,
    transport: http(baseSepolia.rpcUrls.default.http[0]),
  });

  const ownerBalance = await publicClient.getBalance({ address: owner.address });
  console.log(`Owner ${owner.address} balance: ${formatEther(ownerBalance)} ETH`);
  console.log(`Sending ${amountArg} ETH to smart account ${account.address} ...`);

  const hash = await ownerWalletClient.sendTransaction({
    to: account.address,
    value: amount,
  });
  console.log("tx hash:", hash);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("status:", receipt.status);

  const newBalance = await publicClient.getBalance({ address: account.address });
  console.log(`Smart account balance now: ${formatEther(newBalance)} ETH`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
