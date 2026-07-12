import type { Address, Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { toCallPolicy, toTimestampPolicy, CallPolicyVersion } from "@zerodev/permissions/policies";
import { toPermissionValidator, type ModularSigner } from "@zerodev/permissions";
import { createKernelAccount } from "@zerodev/sdk";
import type { KernelValidator } from "@zerodev/ecdsa-validator";
import { publicClient } from "../src/chain/clients.js";
import { entryPoint, kernelVersion } from "./kernelAccount.js";

export interface AllowedRecipient {
  address: Address;
  maxValueWei: bigint;
}

/**
 * L3 core primitive: a session key whose on-chain validator will refuse to sign off on
 * any UserOperation that (a) targets an address outside `allowedRecipients`, (b) sends
 * more native value than that recipient's cap, or (c) is used after `validUntil`. This
 * is enforced by the CallPolicy + TimestampPolicy contracts during ERC-4337 validation --
 * not application-level logic that a compromised agent process could skip.
 */
export async function createSpendCappedSessionKey(params: {
  sudo: KernelValidator;
  allowedRecipients: AllowedRecipient[];
  validUntil: number; // unix seconds
}) {
  const sessionPrivateKey: Hex = generatePrivateKey();
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);
  const sessionKeySigner: ModularSigner = await toECDSASigner({ signer: sessionKeyAccount });

  const callPolicy = toCallPolicy({
    policyVersion: CallPolicyVersion.V0_0_4,
    permissions: params.allowedRecipients.map((r) => ({
      target: r.address,
      valueLimit: r.maxValueWei,
    })),
  });

  const timestampPolicy = toTimestampPolicy({ validUntil: params.validUntil });

  const permissionPlugin = await toPermissionValidator(publicClient, {
    entryPoint,
    kernelVersion,
    signer: sessionKeySigner,
    policies: [callPolicy, timestampPolicy],
  });

  const sessionKeyKernelAccount = await createKernelAccount(publicClient, {
    entryPoint,
    kernelVersion,
    plugins: {
      sudo: params.sudo,
      regular: permissionPlugin,
    },
  });

  return { sessionPrivateKey, sessionKeyAddress: sessionKeyAccount.address, sessionKeyKernelAccount };
}
