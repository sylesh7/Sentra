/** RFC 9530 Content-Digest header value (sha-256), computed for real over the given body. */
export async function computeContentDigest(body: string): Promise<string> {
  const data = new TextEncoder().encode(body);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const b64 = Buffer.from(hash).toString("base64");
  return `sha-256=:${b64}:`;
}
