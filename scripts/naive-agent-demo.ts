import { campaign1FakeDocsPage } from "../fixtures/campaign1-sanitized.js";

/**
 * The "before" half of the demo: what a naive agent does with NO Sentra checkpoint --
 * no provenance check, no privilege separation, no source-tagging, no quorum, no
 * identity verification. It just regex-extracts anything that looks like a payment
 * instruction from the ENTIRE page (including JSON-LD and CSS-hidden content, which is
 * exactly the Zscaler Campaign 1 exploit surface) and would act on it immediately.
 *
 * This script does not actually send a transaction -- it prints the payment intent a
 * naive agent would construct and act on, so the contrast with the Sentra-protected run
 * (`npm run pipeline:run`) is visible without needing a second real wallet to burn funds
 * pointlessly proving a negative.
 */
const page = campaign1FakeDocsPage;
const haystack = [page.visibleText, ...page.jsonLd, ...page.hiddenCssContent, ...Object.values(page.openGraphTags)].join(
  "\n",
);

const addressMatch = haystack.match(/0x[a-fA-F0-9]{40}/);
const amountMatch = haystack.match(/(\d+(?:\.\d+)?)\s*ETH/i);

console.log("=== NAIVE AGENT (no Sentra checkpoint) ===");
console.log(`Fetched: ${page.url}`);
console.log("No provenance check. No source tagging. No identity verification. No quorum.");
console.log("Scanning entire page (visible text + JSON-LD + hidden CSS + meta tags) for anything payment-shaped...\n");

if (addressMatch && amountMatch) {
  console.log("Found payment instruction. Constructing UserOperation:");
  console.log(`  to:     ${addressMatch[0]}`);
  console.log(`  value:  ${amountMatch[1]} ETH`);
  console.log(`  reason: "resolve MissingLicenseKeyException" (as instructed by the page)`);
  console.log("\n>>> WOULD SEND THIS PAYMENT NOW, no further checks. <<<");
  console.log("(This is exactly the Zscaler-documented failure mode: 4 of 26 LLMs did this for real.)");
} else {
  console.log("No payment instruction found.");
}

console.log("\n--- Compare to the Sentra-protected run: npm run pipeline:run ---");
