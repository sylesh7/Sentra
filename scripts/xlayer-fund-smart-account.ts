import { createWalletClient, http, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createSentraSmartAccount } from "../wallet/xlayer/smartAccount.js";
import { xLayerPublicClient, xLayerTestnet } from "../src/chain/xlayer.js";
import { requireEnv } from "../src/config/env.js";

/**
 * Sends native OKB from the owner EOA to the Sentra smart account address on X Layer
 * Testnet. Usage: npm run xlayer:fund -- 0.02
 */
async function main() {
  const amountArg = process.argv[2] ?? "0.02";
  const amount = parseEther(amountArg);

  const { smartAccount } = await createSentraSmartAccount();
  const owner = privateKeyToAccount(requireEnv("OWNER_PRIVATE_KEY"));

  const ownerWalletClient = createWalletClient({
    account: owner,
    chain: xLayerTestnet,
    transport: http(xLayerTestnet.rpcUrls.default.http[0]),
  });

  const ownerBalance = await xLayerPublicClient.getBalance({ address: owner.address });
  console.log(`Owner ${owner.address} balance: ${formatEther(ownerBalance)} OKB`);
  console.log(`Sending ${amountArg} OKB to smart account ${smartAccount.address} ...`);

  const hash = await ownerWalletClient.sendTransaction({
    to: smartAccount.address as `0x${string}`,
    value: amount,
  });
  console.log("tx hash:", hash);

  const receipt = await xLayerPublicClient.waitForTransactionReceipt({ hash });
  console.log("status:", receipt.status);

  const newBalance = await xLayerPublicClient.getBalance({ address: smartAccount.address as `0x${string}` });
  console.log(`Smart account balance now: ${formatEther(newBalance)} OKB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
