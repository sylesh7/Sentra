import { sendTransaction, type Address } from "thirdweb";
import { generatePrivateKey, privateKeyToAccount as viemPrivateKeyToAccount } from "viem/accounts";
import { privateKeyToAccount } from "thirdweb/wallets";
import { smartWallet, DEFAULT_ACCOUNT_FACTORY_V0_7 } from "thirdweb/wallets/smart";
import { addSessionKey } from "thirdweb/extensions/erc4337";
import type { ThirdwebContract } from "thirdweb";
import { xLayerTestnetChain, createSentraThirdwebClient } from "./thirdwebClient.js";

export interface AllowedRecipient {
  address: Address;
  maxValueEth: string; // decimal ETH/OKB string, e.g. "0.0015"
}

/**
 * L3 core primitive (X Layer variant): installs a session key on the smart account with
 * a real on-chain enforced spend cap (nativeTokenLimitPerTransaction), counterparty
 * allow-list (approvedTargets), and expiry (permissionEndTimestamp) -- via thirdweb's
 * IAccountPermissions extension. Mirrors wallet/sessionKey.ts (Base Sepolia/ZeroDev).
 */
export async function installSpendCappedSessionKey(params: {
  accountContract: ThirdwebContract;
  ownerAccount: Parameters<typeof addSessionKey>[0]["account"];
  allowedRecipients: AllowedRecipient[];
  validUntil: Date;
}) {
  const sessionPrivateKey = generatePrivateKey();
  const sessionKeyAddress = viemPrivateKeyToAccount(sessionPrivateKey).address as Address;

  // thirdweb's permission model caps ONE native-token limit per transaction across all
  // approved targets (not a distinct cap per target) -- so we use the tightest requested
  // cap as the account-wide ceiling and still enforce the allow-list per target.
  const tightestCap = params.allowedRecipients
    .map((r) => Number(r.maxValueEth))
    .reduce((min, v) => Math.min(min, v), Number.POSITIVE_INFINITY);

  const transaction = addSessionKey({
    contract: params.accountContract,
    account: params.ownerAccount,
    sessionKeyAddress,
    permissions: {
      approvedTargets: params.allowedRecipients.map((r) => r.address),
      nativeTokenLimitPerTransaction: tightestCap,
      permissionStartTimestamp: new Date(),
      permissionEndTimestamp: params.validUntil,
    },
  });

  const receipt = await sendTransaction({ transaction, account: params.ownerAccount });

  return { sessionPrivateKey, sessionKeyAddress, installTxHash: receipt.transactionHash };
}

/** Connects to the EXISTING smart account address using only the session key as signer. */
export async function connectAsSessionKey(params: {
  smartAccountAddress: Address;
  sessionPrivateKey: `0x${string}`;
}) {
  const client = createSentraThirdwebClient();
  const sessionPersonalAccount = privateKeyToAccount({ client, privateKey: params.sessionPrivateKey });

  const sessionWallet = smartWallet({
    chain: xLayerTestnetChain,
    factoryAddress: DEFAULT_ACCOUNT_FACTORY_V0_7,
    sponsorGas: true,
    overrides: { accountAddress: params.smartAccountAddress },
  });

  const sessionSmartAccount = await sessionWallet.connect({
    client,
    personalAccount: sessionPersonalAccount,
  });

  return { client, sessionSmartAccount };
}
