import { verifyCounterpartyByAgentId } from "../pipeline/identity/verify.js";
import type { Address } from "viem";

/**
 * Usage:
 *   npm run identity:lookup -- <agentId> <claimedWalletAddress>
 *
 * Example against a real, currently-registered Base Sepolia agent:
 *   npm run identity:lookup -- 8017 0xddF476D86Afd5E2075B8C95cbfFD3d76aEfa4b6B
 */
async function main() {
  const [agentIdArg, walletArg] = process.argv.slice(2);
  if (!agentIdArg || !walletArg) {
    console.error("Usage: identity:lookup <agentId> <claimedWalletAddress>");
    process.exit(1);
  }

  const verdict = await verifyCounterpartyByAgentId(BigInt(agentIdArg), walletArg as Address);
  console.log(JSON.stringify(verdict, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2));
  process.exit(verdict.verdict === "PASS" ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
