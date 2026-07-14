import { createThirdwebClient, defineChain } from "thirdweb";
import { privateKeyToAccount } from "thirdweb/wallets";
import { env, requireEnv } from "../../src/config/env.js";

export const xLayerTestnetChain = defineChain({
  id: env.XLAYER_TESTNET_CHAIN_ID,
  rpc: env.XLAYER_TESTNET_RPC_URL,
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  testnet: true,
});

export function createSentraThirdwebClient() {
  const clientId = requireEnv("THIRDWEB_CLIENT_ID");
  return createThirdwebClient({
    clientId,
    secretKey: env.THIRDWEB_SECRET_KEY,
  });
}

/** The owner (admin) signer -- same OWNER_PRIVATE_KEY used for the Base Sepolia fallback. */
export function getOwnerPersonalAccount(client: ReturnType<typeof createSentraThirdwebClient>) {
  const privateKey = requireEnv("OWNER_PRIVATE_KEY");
  return privateKeyToAccount({ client, privateKey });
}
