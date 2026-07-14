import { signatureHeaders, type ResponseLike } from "http-message-sig";
import { Ed25519Signer } from "web-bot-auth/crypto";
import { computeContentDigest } from "./contentDigest.js";
import type { Ed25519KeyPair } from "./keys.js";

export const SIGNED_COMPONENTS = ["@status", "content-type", "content-digest"];

export interface SignedFixtureResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Signs a fixture HTTP response the way a real origin would: computes a real
 * Content-Digest over the body, then produces real RFC 9421 Signature /
 * Signature-Input headers over (@status, content-type, content-digest) using the
 * real Cloudflare http-message-sig implementation and an Ed25519 key held only by
 * this "origin".
 */
export async function signFixtureResponse(params: {
  status: number;
  contentType: string;
  body: string;
  keypair: Ed25519KeyPair;
  expiresInSeconds?: number;
}): Promise<SignedFixtureResponse> {
  const digest = await computeContentDigest(params.body);
  const baseHeaders: Record<string, string> = {
    "content-type": params.contentType,
    "content-digest": digest,
  };

  const message: ResponseLike = {
    status: params.status,
    headers: baseHeaders,
  };

  const signer = await Ed25519Signer.fromJWK(params.keypair.privateJwk);
  const created = new Date();
  const expires = new Date(created.getTime() + (params.expiresInSeconds ?? 300) * 1000);

  const sigHeaders = await signatureHeaders(message, {
    signer, // signer.keyid (derived from the public JWK) becomes the Signature-Input keyid
    components: SIGNED_COMPONENTS,
    created,
    expires,
  });

  return {
    status: params.status,
    headers: { ...baseHeaders, ...sigHeaders },
    body: params.body,
  };
}
