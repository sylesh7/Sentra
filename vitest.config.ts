import { defineConfig } from "vitest/config";

/**
 * Several test files make real network calls against the same external services
 * (OpenRouter's rate-limited free-tier quorum models, Base Sepolia RPC). Vitest's
 * default is to run test FILES in parallel across workers, which under full-suite runs
 * creates real contention/rate-limiting against those shared external limits -- not a
 * logic bug (the same tests pass reliably in isolation). Running files sequentially
 * trades total suite wall-clock time for reliability, which is the right tradeoff here
 * since the affected suites are calling real, rate-limited third-party services.
 */
export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
