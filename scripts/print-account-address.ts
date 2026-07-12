import { createSentraKernelAccount } from "../wallet/kernelAccount.js";

const { account } = await createSentraKernelAccount();
console.log("Sentra Kernel smart account address (counterfactual until first UserOp):");
console.log("  " + account.address);
console.log("\nThis is the account that actually holds and sends payment funds.");
console.log("Fund it via the Base Sepolia faucet before running the spend-cap demo.");
