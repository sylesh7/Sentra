import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

/**
 * Generates a fresh EOA to act as the "owner" (sudo) signer of the Sentra Kernel
 * smart account (L3). This key never signs payments directly once session keys
 * are wired up in Phase 2 -- it only has authority to install/revoke session keys.
 *
 * Run once with: npm run wallet:create
 * Then: paste OWNER_PRIVATE_KEY into .env, and fund the printed address via
 * https://www.alchemy.com/faucets/base-sepolia (or Coinbase's Base Sepolia faucet).
 */
const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

console.log("Generated a new Base Sepolia owner EOA.\n");
console.log("Address (fund this via a Base Sepolia faucet):");
console.log("  " + account.address);
console.log("\nPrivate key (put this in .env as OWNER_PRIVATE_KEY -- never commit it):");
console.log("  " + privateKey);
