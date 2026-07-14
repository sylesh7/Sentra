import { helpers } from "web-bot-auth/crypto";
import { jwkToKeyID } from "web-bot-auth";

export interface Ed25519KeyPair {
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
  keyid: string;
}

/** Generates a real Ed25519 keypair via WebCrypto and derives its RFC 7638 keyid. */
export async function generateEd25519KeyPair(): Promise<Ed25519KeyPair> {
  const { publicKey, privateKey } = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;

  const publicJwk = await crypto.subtle.exportKey("jwk", publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", privateKey);
  const keyid = await jwkToKeyID(publicJwk, helpers.WEBCRYPTO_SHA256, helpers.BASE64URL_DECODE);

  return { publicJwk, privateJwk, keyid };
}
