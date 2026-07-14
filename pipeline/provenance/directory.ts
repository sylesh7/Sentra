import { HTTP_MESSAGE_SIGNATURES_DIRECTORY } from "http-message-sig";

export interface JsonWebKeySet {
  keys: JsonWebKey[];
}

export function buildDirectory(publicJwk: JsonWebKey): JsonWebKeySet {
  return { keys: [publicJwk] };
}

export { HTTP_MESSAGE_SIGNATURES_DIRECTORY };

/**
 * Fetches the real signed-key directory published at
 * {baseUrl}/.well-known/http-message-signatures-directory. `baseUrl` defaults to the
 * claimed origin's own https:// URL -- this is the whole point: a typosquat domain
 * has no way to serve a directory that legitimately proves it holds the real origin's
 * key, because it doesn't control the real origin's DNS/webroot.
 */
export async function fetchDirectory(baseUrl: string): Promise<JsonWebKeySet> {
  const url = new URL(HTTP_MESSAGE_SIGNATURES_DIRECTORY, baseUrl).toString();
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`directory fetch ${url} -> HTTP ${res.status}`);
  }
  const json = (await res.json()) as JsonWebKeySet;
  if (!Array.isArray(json.keys)) {
    throw new Error(`directory at ${url} did not return a JWK Set`);
  }
  return json;
}
