import type { Address } from "viem";
import { verifyCounterpartyByAgentId } from "../pipeline/identity/verify.js";
import {
  BASE_SEPOLIA_REGISTRY,
  XLAYER_REGISTRY,
  BASE_MAINNET_REGISTRY,
  XLAYER_MAINNET_REGISTRY,
  type RegistryTarget,
} from "../pipeline/identity/registry.js";

/**
 * Proves the "chain-agnostic by design, config swap not a rewrite" claim across all
 * four chains this project knows about -- two testnets, two mainnets. Every single
 * result below comes from the EXACT SAME verifyCounterpartyByAgentId function; only the
 * RegistryTarget passed in differs. No code path is chain-specific.
 *
 * All four are real, read-only eth_call lookups against real, currently-registered
 * agents. No gas, no transaction, no funds at risk, no wallet involved -- this is L2
 * (identity verification) only. L3 (fund custody) is NOT chain-agnostic in this sense
 * and stays on Base Sepolia only; see docs/mainnet-readiness.md for that boundary.
 *
 * Usage: npm run mainnet:readiness-proof
 */
interface Case {
  label: string;
  target: RegistryTarget;
  agentId: bigint;
  claimedWallet: Address;
}

const cases: Case[] = [
  {
    label: "Base Sepolia (testnet -- our normal demo chain)",
    target: BASE_SEPOLIA_REGISTRY,
    agentId: 8017n,
    claimedWallet: "0xddF476D86Afd5E2075B8C95cbfFD3d76aEfa4b6B" as Address,
  },
  {
    label: "X Layer Testnet (testnet -- OKX's own L2, where its real registry lives)",
    target: XLAYER_REGISTRY,
    agentId: 1n,
    claimedWallet: "0x82c486145908b2D00eFeb71C8745c5fDa86Fc9f0" as Address,
  },
  {
    label: "Base Mainnet (real, live, currently-deployed registry, no code changes)",
    target: BASE_MAINNET_REGISTRY,
    agentId: 1n,
    claimedWallet: "0x89e9E1Ab11dd1B138b1DcE6D6A4A0926AAfD5029" as Address,
  },
  {
    label: "X Layer Mainnet (real, live, currently-deployed registry, no code changes)",
    target: XLAYER_MAINNET_REGISTRY,
    agentId: 1n,
    claimedWallet: "0x6ba100a250955209b3CAd5F06E31895f678425c1" as Address,
  },
];

async function main() {
  console.log("Same function (verifyCounterpartyByAgentId), four RegistryTargets:\n");

  const results: { label: string; verdict: string }[] = [];

  for (const c of cases) {
    console.log(`-- ${c.label} --`);
    const verdict = await verifyCounterpartyByAgentId(c.agentId, c.claimedWallet, c.target);
    console.log(`registry: eip155:${c.target.chainId}:${c.target.identityRegistry}`);
    console.log(`verdict=${verdict.verdict}`);
    if (verdict.verdict === "REJECT") console.log(`reason: ${verdict.reason}`);
    console.log("");
    results.push({ label: c.label, verdict: verdict.verdict });
  }

  console.log("=== SUMMARY ===");
  for (const r of results) console.log(`${r.verdict === "PASS" ? "PASS" : "FAIL"} -- ${r.label}`);

  const allPass = results.every((r) => r.verdict === "PASS");
  console.log(
    allPass
      ? "\nPASS: identical code, real reads across two testnets and two mainnets."
      : "\nFAIL: check output above.",
  );
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
