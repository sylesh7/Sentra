import { buildTrustPassport } from "../pipeline/passport/index.js";

/**
 * Renders a Trust Passport for a given ERC-8004 agentId, on-chain + local history combined.
 * Usage: npm run passport:show -- <agentId>   (defaults to 8017, the demo's registered agent)
 */
async function main() {
  const arg = process.argv[2];
  const agentId = BigInt(arg ?? "8017");
  const passport = await buildTrustPassport(agentId);
  console.log(JSON.stringify(passport, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
