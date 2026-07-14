import { createSentraSmartAccount } from "../wallet/xlayer/smartAccount.js";

const { smartAccount } = await createSentraSmartAccount();
console.log("Sentra smart account address on X Layer Testnet (counterfactual until first UserOp):");
console.log("  " + smartAccount.address);
console.log("\nFund it via the X Layer faucet (https://www.okx.com/xlayer/faucet) before running the spend-cap demo.");
