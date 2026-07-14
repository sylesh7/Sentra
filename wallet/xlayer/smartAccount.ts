import { getContract } from "thirdweb";
import { smartWallet, DEFAULT_ACCOUNT_FACTORY_V0_7 } from "thirdweb/wallets/smart";
import { xLayerTestnetChain, createSentraThirdwebClient, getOwnerPersonalAccount } from "./thirdwebClient.js";

/**
 * Creates (connects to, in AA terms -- the contract address is counterfactual until the
 * first UserOp) the Sentra smart account on X Layer Testnet, admin-controlled by the
 * owner EOA. Uses the v0.7 EntryPoint factory (same canonical EntryPoint address used by
 * the Base Sepolia/ZeroDev fallback: 0x0000000071727De22E5E9d8BAf0edAc6f37da032).
 */
export async function createSentraSmartAccount() {
  const client = createSentraThirdwebClient();
  const ownerAccount = getOwnerPersonalAccount(client);

  const wallet = smartWallet({
    chain: xLayerTestnetChain,
    factoryAddress: DEFAULT_ACCOUNT_FACTORY_V0_7,
    sponsorGas: true,
  });

  const smartAccount = await wallet.connect({
    client,
    personalAccount: ownerAccount,
  });

  const accountContract = getContract({
    address: smartAccount.address,
    chain: xLayerTestnetChain,
    client,
  });

  return { client, ownerAccount, wallet, smartAccount, accountContract };
}
