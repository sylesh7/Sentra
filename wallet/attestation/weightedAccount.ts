import { createKernelAccount } from "@zerodev/sdk";
import { getEntryPoint, KERNEL_V3_3 } from "@zerodev/sdk/constants";
import {
  createWeightedValidator,
  WeightedValidatorContractVersion,
  type WeightedSigner,
} from "@zerodev/weighted-validator";
import type { Address } from "viem";
import { publicClient } from "../../src/chain/clients.js";

export const entryPoint = getEntryPoint("0.7");
// KERNEL_V3_3 matches ZeroDev's own tested weighted-multisig example exactly (their
// example uses this version, not V3_1) -- an earlier attempt at sudo=owner ECDSA +
// regular=weightedValidator under KERNEL_V3_1 hit real bugs in the SDK's "enable a new
// regular plugin + execute in one UserOp" code path (confirmed by reading
// node_modules/@zerodev/weighted-validator source: getStubSignature crashes on
// undefined, and the enable-signature bundling doesn't carry the combined multisig
// through to the actual execution signature). Using the weighted validator as SUDO
// directly, exactly as ZeroDev's own example does, sidesteps that entire code path.
export const kernelVersion = KERNEL_V3_3;
// V0_0_2_PATCHED per ZeroDev's own current example -- verified deployed on Base Sepolia
// at 0x144F02c15a8CB2E01D35bf2af8e9eFD96401e44b via eth_getCode.
export const validatorContractVersion = WeightedValidatorContractVersion.V0_0_2_PATCHED;

export interface WeightedPaymentAccountConfig {
  /** The agent's session-key address -- weight 50. Alone, insufficient to authorize anything. */
  sessionKeyAddress: Address;
  /** Sentra's attestation address -- weight 50. Alone, also insufficient. */
  sentraAttestationAddress: Address;
}

/**
 * L3 mandatory co-sign gate: a Kernel account whose SOLE controlling validator is a
 * 2-of-2 weighted multisig (threshold 100, each signer weight 50) between the agent's
 * session key and Sentra's own attestation key. There is no separate owner/sudo key
 * that could override this -- the weighted validator IS sudo, so NEITHER party alone,
 * and no third "admin" key either, can authorize a UserOperation. This is a real,
 * deployed ZeroDev primitive (@zerodev/weighted-validator), not a custom contract.
 *
 * `activeSigner` identifies which of the two configured signers THIS local instance
 * represents (i.e. whose private key it can produce a partial signature with).
 * `knownAddress`, when provided, pins the connection to an address computed by an
 * earlier call rather than trusting counterfactual derivation to agree across two
 * separately-constructed instances (agent's process vs. Sentra's process, in reality).
 */
export async function createWeightedPaymentAccount(
  activeSigner: WeightedSigner,
  config: WeightedPaymentAccountConfig,
  knownAddress?: Address,
) {
  const weightedValidator = await createWeightedValidator(publicClient, {
    entryPoint,
    kernelVersion,
    validatorContractVersion,
    signer: activeSigner,
    config: {
      threshold: 100,
      signers: [
        { publicKey: config.sessionKeyAddress, weight: 50 },
        { publicKey: config.sentraAttestationAddress, weight: 50 },
      ],
    },
  });

  const account = await createKernelAccount(publicClient, {
    entryPoint,
    kernelVersion,
    address: knownAddress,
    plugins: { sudo: weightedValidator },
  });

  return account;
}
