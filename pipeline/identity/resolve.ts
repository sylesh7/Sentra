import { registrationFileSchema, agentCardSchema, type RegistrationFile, type AgentCard } from "./types.js";

const FETCH_TIMEOUT_MS = 8000;
const IPFS_GATEWAY = "https://ipfs.io/ipfs/";

function toFetchableUrl(uri: string): string {
  if (uri.startsWith("ipfs://")) return IPFS_GATEWAY + uri.slice("ipfs://".length);
  return uri;
}

async function fetchJson(uri: string): Promise<unknown> {
  if (uri.startsWith("data:application/json;base64,")) {
    const base64 = uri.slice("data:application/json;base64,".length);
    return JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
  }
  const url = toFetchableUrl(uri);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`fetch ${url} -> HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/** Fetches and validates the registration file an agentId's tokenURI/agentURI points to. */
export async function fetchRegistrationFile(agentURI: string): Promise<RegistrationFile> {
  const raw = await fetchJson(agentURI);
  return registrationFileSchema.parse(raw);
}

/**
 * Fetches the domain-control proof file at https://{domain}/.well-known/agent-card.json.
 * This is the ONLY source Sentra trusts for "this domain claims to operate agentId X" --
 * it is fetched fresh over HTTPS for every check, never cached from page content.
 */
export async function fetchAgentCard(domain: string): Promise<AgentCard> {
  const url = `https://${domain}/.well-known/agent-card.json`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`fetch ${url} -> HTTP ${res.status}`);
    const raw = await res.json();
    return agentCardSchema.parse(raw);
  } finally {
    clearTimeout(timeout);
  }
}
