import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { publicClient, baseSepolia } from "../src/chain/clients.js";
import { requireEnv } from "../src/config/env.js";

export const entryPoint = getEntryPoint("0.7");
export const kernelVersion = KERNEL_V3_1;

/** The owner (sudo) signer -- controls the account, installs/revokes session keys. */
export function getOwnerSigner() {
  const privateKey = requireEnv("OWNER_PRIVATE_KEY");
  return privateKeyToAccount(privateKey);
}

/** Builds (but does not deploy) the Sentra Kernel smart account, sudo-controlled by the owner EOA. */
export async function createSentraKernelAccount() {
  const signer = getOwnerSigner();
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
    kernelVersion,
  });

  const account = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: { sudo: ecdsaValidator },
    kernelVersion,
  });

  return { account, ecdsaValidator };
}

/**
 * Kernel account client wired to the real ZeroDev bundler for Base Sepolia. Gas
 * sponsorship is opt-in and requires a Gas Policy configured in the ZeroDev dashboard
 * for the project; without one, the smart account pays its own gas from its own
 * balance (which is what we want for the spend-cap demo anyway -- it isolates the
 * on-chain CallPolicy enforcement from paymaster policy noise).
 */
export function createSentraKernelClient(
  account: Awaited<ReturnType<typeof createKernelAccount>>,
  opts: { sponsored?: boolean } = {},
) {
  const zerodevRpc = requireEnv("ZERODEV_RPC");

  if (opts.sponsored) {
    const paymaster = createZeroDevPaymasterClient({
      chain: baseSepolia,
      transport: http(zerodevRpc),
    });
    return createKernelAccountClient({
      account,
      chain: baseSepolia,
      bundlerTransport: http(zerodevRpc),
      paymaster: {
        getPaymasterData(userOperation) {
          return paymaster.sponsorUserOperation({ userOperation });
        },
      },
    });
  }

  return createKernelAccountClient({
    account,
    chain: baseSepolia,
    bundlerTransport: http(zerodevRpc),
  });
}
