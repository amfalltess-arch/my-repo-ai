import dns from "node:dns/promises";
import net from "node:net";

/**
 * SSRF protection (spec section 41). Before fetching *anything* at a
 * user-supplied URL — a YouTube link, a custom AI provider's base URL when
 * "Test Connection" is used, a PULL_FROM_URL source for TikTok — resolve the
 * hostname and reject private/loopback/link-local/reserved ranges so the
 * server can't be tricked into hitting its own metadata endpoint or internal
 * network.
 */

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

function isBlockedIp(ip: string): boolean {
  const type = net.isIP(ip);
  if (type === 0) return true; // not a valid IP at all -> treat as unsafe

  if (type === 4) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === undefined || b === undefined) return true;
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 0) return true; // "this network"
    if (a >= 224) return true; // multicast/reserved
    return false;
  }

  // IPv6
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true; // loopback
  if (normalized.startsWith("fe80:")) return true; // link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local
  if (normalized.startsWith("::ffff:")) {
    // IPv4-mapped IPv6 — re-check the embedded IPv4 address
    const embedded = normalized.split(":").pop();
    if (embedded && net.isIP(embedded) === 4) return isBlockedIp(embedded);
  }
  return false;
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export async function assertSafeUrl(
  rawUrl: string,
  opts: { allowedProtocols?: string[] } = {},
): Promise<URL> {
  const allowedProtocols = opts.allowedProtocols ?? ["https:"];
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("Not a valid URL.");
  }

  if (!allowedProtocols.includes(url.protocol)) {
    throw new UnsafeUrlError(`Protocol ${url.protocol} is not allowed.`);
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new UnsafeUrlError("This host is not allowed.");
  }

  // If the hostname is already a literal IP, check it directly.
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new UnsafeUrlError("This address is not allowed.");
    }
    return url;
  }

  // Otherwise resolve DNS and check every address it can resolve to, so a
  // hostname can't pass validation and then resolve to an internal IP
  // (DNS rebinding).
  let addresses: string[];
  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    addresses = records.map((r) => r.address);
  } catch {
    throw new UnsafeUrlError("Could not resolve host.");
  }

  if (addresses.length === 0 || addresses.some(isBlockedIp)) {
    throw new UnsafeUrlError("This host resolves to a disallowed address.");
  }

  return url;
}
