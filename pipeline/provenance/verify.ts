import {
  verify as httpSigVerify,
  HTTP_MESSAGE_SIGNATURES_DIRECTORY,
  type ResponseLike,
  type Parameters as SigParameters,
} from "http-message-sig";
import { jwkToKeyID } from "web-bot-auth";
import { helpers } from "web-bot-auth/crypto";
import { computeContentDigest } from "./contentDigest.js";
import { fetchDirectory } from "./directory.js";
import type { ProvenanceVerdict } from "./types.js";

export interface FetchedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function header(h: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? h[key] : undefined;
}

type CryptoOutcome =
  | { kind: "key_not_in_directory"; keyid: string; directoryUrl: string }
  | { kind: "directory_unreachable"; directoryUrl: string; message: string }
  | { kind: "invalid_signature"; keyid: string; directoryUrl: string }
  | { kind: "verified"; keyid: string; directoryUrl: string; created?: Date; expires?: Date };

/** Real Ed25519 verification against a directory-resolved JWK -- no library-specific Verify<T> mismatch. */
async function verifyEd25519(data: string, signature: Uint8Array, jwk: JsonWebKey): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, crv: jwk.crv, x: jwk.x },
    { name: "Ed25519" },
    true,
    ["verify"],
  );
  return crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    new Uint8Array(signature),
    new TextEncoder().encode(data),
  );
}

function makeVerifier(claimedOriginBaseUrl: string) {
  return async (data: string, signature: Uint8Array, parameters: SigParameters): Promise<CryptoOutcome> => {
    const keyid = parameters.keyid;
    const directoryUrl = new URL(HTTP_MESSAGE_SIGNATURES_DIRECTORY, claimedOriginBaseUrl).toString();
    if (!keyid) {
      // No keyid to resolve -- treat like "key not found" with an empty id, evidence still useful.
      return { kind: "key_not_in_directory", keyid: "", directoryUrl };
    }

    let directory;
    try {
      directory = await fetchDirectory(claimedOriginBaseUrl);
    } catch (err) {
      return { kind: "directory_unreachable", directoryUrl, message: (err as Error).message };
    }

    let matchingJwk: JsonWebKey | undefined;
    for (const jwk of directory.keys) {
      const candidateId = await jwkToKeyID(jwk, helpers.WEBCRYPTO_SHA256, helpers.BASE64URL_DECODE);
      if (candidateId === keyid) {
        matchingJwk = jwk;
        break;
      }
    }
    if (!matchingJwk) {
      return { kind: "key_not_in_directory", keyid, directoryUrl };
    }

    const isValid = await verifyEd25519(data, signature, matchingJwk);
    if (!isValid) {
      return { kind: "invalid_signature", keyid, directoryUrl };
    }

    return { kind: "verified", keyid, directoryUrl, created: parameters.created as Date | undefined, expires: parameters.expires as Date | undefined };
  };
}

/**
 * L1a provenance gate. Real RFC 9421 verification (via Cloudflare's own http-message-sig
 * library for header parsing / signature-base construction), real SHA-256 content-digest
 * binding, real key-directory fetch from the CLAIMED origin (never from page content) --
 * a typosquat cannot pass this because it does not control the real origin's webroot, so
 * it cannot serve a directory containing the real key.
 */
export async function verifyProvenance(
  response: FetchedResponse,
  claimedOriginBaseUrl: string,
): Promise<ProvenanceVerdict> {
  const sigInput = header(response.headers, "signature-input");
  const sig = header(response.headers, "signature");
  if (!sigInput || !sig) {
    return {
      status: "UNSIGNED",
      scrutiny: "max_scrutiny",
      reason: "no Signature / Signature-Input headers present on the response",
      evidence: { claimedOriginBaseUrl },
    };
  }

  // Bind body to signature independently before trusting anything cryptographic: the
  // signature only covers the content-digest HEADER value, not the body bytes directly,
  // so a swapped body with an untouched header would still "verify" unless we separately
  // recompute and compare the digest here.
  const contentDigestHeader = header(response.headers, "content-digest");
  if (!contentDigestHeader) {
    return {
      status: "CONTENT_DIGEST_MISMATCH",
      scrutiny: "max_scrutiny",
      reason: "signed response has no content-digest header to bind the body to the signature",
      evidence: {},
    };
  }
  const recomputedDigest = await computeContentDigest(response.body);
  if (recomputedDigest !== contentDigestHeader) {
    return {
      status: "CONTENT_DIGEST_MISMATCH",
      scrutiny: "max_scrutiny",
      reason: "response body does not match its signed content-digest -- body was altered after signing",
      evidence: { recomputedDigest, claimedDigest: contentDigestHeader },
    };
  }

  const message: ResponseLike = { status: response.status, headers: response.headers };

  let outcome: CryptoOutcome;
  try {
    outcome = await httpSigVerify(message, makeVerifier(claimedOriginBaseUrl));
  } catch (err) {
    const msg = (err as Error).message;
    if (/expired/i.test(msg)) {
      return { status: "EXPIRED", scrutiny: "max_scrutiny", reason: msg, evidence: {} };
    }
    return { status: "SIGNATURE_INVALID", scrutiny: "max_scrutiny", reason: msg, evidence: {} };
  }

  switch (outcome.kind) {
    case "directory_unreachable":
      return {
        status: "DIRECTORY_UNREACHABLE",
        scrutiny: "max_scrutiny",
        reason: `could not fetch key directory from the claimed origin: ${outcome.message}`,
        evidence: { claimedOriginBaseUrl, directoryUrl: outcome.directoryUrl },
      };
    case "key_not_in_directory":
      return {
        status: "KEY_NOT_IN_DIRECTORY",
        scrutiny: "max_scrutiny",
        reason: `keyid "${outcome.keyid}" was not found in the directory published at ${outcome.directoryUrl}`,
        evidence: { keyid: outcome.keyid, directoryUrl: outcome.directoryUrl },
      };
    case "invalid_signature":
      return {
        status: "SIGNATURE_INVALID",
        scrutiny: "max_scrutiny",
        reason: "signature did not verify against the directory-resolved key",
        evidence: { keyid: outcome.keyid, directoryUrl: outcome.directoryUrl },
      };
    case "verified":
      return {
        status: "SIGNED_VERIFIED",
        scrutiny: "normal_scrutiny",
        keyid: outcome.keyid,
        directoryUrl: outcome.directoryUrl,
        evidence: { created: outcome.created, expires: outcome.expires },
      };
  }
}
