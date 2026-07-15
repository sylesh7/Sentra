import { http, type Address, type Hex } from "viem";
import { createWeightedKernelAccountClient, type WeightedSigner } from "@zerodev/weighted-validator";
import { baseSepolia } from "../../src/chain/clients.js";
import { requireEnv } from "../../src/config/env.js";
import { createWeightedPaymentAccount, validatorContractVersion, type WeightedPaymentAccountConfig } from "./weightedAccount.js";

function bundlerTransport() {
  return http(requireEnv("ZERODEV_RPC"));
}

/** Builds a weighted-multisig client acting as one specific party (agent OR Sentra). */
export async function createPartyClient(
  activeSigner: WeightedSigner,
  config: WeightedPaymentAccountConfig,
  knownAddress?: Address,
) {
  const account = await createWeightedPaymentAccount(activeSigner, config, knownAddress);
  const client = createWeightedKernelAccountClient({
    account,
    chain: baseSepolia,
    bundlerTransport: bundlerTransport(),
  });
  return { account, client };
}

export interface PaymentCallData {
  callData: Hex;
  sender: Address;
  nonce: bigint;
}

/** Builds the exact call (recipient, value) both parties will independently approve. */
export async function buildPaymentCall(
  account: Awaited<ReturnType<typeof createWeightedPaymentAccount>>,
  recipient: Address,
  valueWei: bigint,
): Promise<PaymentCallData> {
  const callData = await account.encodeCalls([{ to: recipient, value: valueWei, data: "0x" }]);
  const nonce = await account.getNonce();
  return { callData, sender: account.address, nonce };
}

/** One party's partial approval over the exact (sender, callData, nonce) tuple. */
export async function approveAsParty(
  client: Awaited<ReturnType<typeof createPartyClient>>["client"],
  call: PaymentCallData,
): Promise<Hex> {
  return client.approveUserOperation({
    callData: call.callData,
    nonce: call.nonce,
    validatorContractVersion,
  });
}

/** Combines both parties' signatures and submits -- succeeds only if combined weight >= threshold. */
export async function submitCoSigned(
  client: Awaited<ReturnType<typeof createPartyClient>>["client"],
  call: PaymentCallData,
  signatures: Hex[],
) {
  const userOpHash = await client.sendUserOperationWithSignatures({
    callData: call.callData,
    nonce: call.nonce,
    // Works around a real bug in @zerodev/weighted-validator@5.5.1: its own
    // getStubSignature checks `userOperation.signature !== "0x"` without guarding against
    // `undefined`, which is what this field is on a fresh account's first UserOp unless
    // we set it ourselves. Confirmed by reading node_modules/@zerodev/weighted-validator/
    // toWeightedValidatorPlugin.ts:233 -- not a workaround for anything on our side.
    signature: "0x",
    signatures,
  });
  const receipt = await client.waitForUserOperationReceipt({ hash: userOpHash });
  return receipt;
}
