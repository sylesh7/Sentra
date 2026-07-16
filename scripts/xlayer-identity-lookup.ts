import type { Address } from "viem";
import { verifyCounterpartyByAgentId } from "../pipeline/identity/verify.js";
import { XLAYER_REGISTRY } from "../pipeline/identity/registry.js";

/**
 * L2 identity check against X Layer Testnet's own ERC-8004 IdentityRegistry -- a plain
 * read-only eth_call, no bundler, no smart account, no funding beyond what a public RPC
 * already gives for free. This is a SEPARATE registry instance from Base Sepolia's (same
 * contract address, but each chain has its own independent set of registered agents) --
 * agentId 8017 from the Base Sepolia demo does not exist here; agentIds 1-10ish do.
 *
 * Usage:
 *   npm run xlayer:identity-lookup -- <agentId> <claimedWalletAddress>
 *
 * Example against a real, currently-registered X Layer Testnet agent:
 *   npm run xlayer:identity-lookup -- 1 0x82c486145908b2D00eFeb71C8745c5fdA86fC9f0
 */
async function main() {
  const [agentIdArg, walletArg] = process.argv.slice(2);
  if (!agentIdArg || !walletArg) {
    console.error("Usage: xlayer:identity-lookup <agentId> <claimedWalletAddress>");
    process.exit(1);
  }

  const verdict = await verifyCounterpartyByAgentId(BigInt(agentIdArg), walletArg as Address, XLAYER_REGISTRY);
  console.log(JSON.stringify(verdict, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2));
  process.exit(verdict.verdict === "PASS" ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
