import { connectAsSentra } from "../wallet/attestation/persistentAccount.js";

const { account } = await connectAsSentra();
console.log("Persistent attestation-gated payment account:");
console.log("  " + account.address);
console.log("\nControlled ONLY by a 2-of-2 weighted multisig (agent session key + Sentra");
console.log("attestation key, threshold 100, weight 50 each) -- no separate owner override.");
console.log("Fund it via `npm run attestation:fund -- 0.01` before running the pipeline with --execute.");
