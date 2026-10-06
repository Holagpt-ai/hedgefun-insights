// Generic HTTPS fetch for configured registry URLs.
// Rejects private networks, unsafe protocols, unbounded redirects, and huge bodies.

import { sha256Hex } from "../catalyst/contract.ts";
import { FETCH_TIMEOUT_MS, MAX_REDIRECTS, MAX_RESPONSE_BYTES } from "./config.ts";
import type { SourceRunContext } from "./types.ts";

export class SourceFetchError extends Error {
  retryAfterSeconds: number | null = null;

  constructor(
    readonly category: string,
    readonly statusCode: number | null,
    readonly retryable: boolean,
  ) {
    super(category);
    this.name = "SourceFetchError";
  }
}

export interface SafeFetchResult {
  status: number;
  body: string;
  etag: string | null;
  lastModified: string | null;
  finalUrl: string;
  unchanged: boolean;
}

function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const parts = m.slice(1).map((p) => Number(p));
  if (parts.some((n) => n > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 255) return true;
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  if (h.startsWith("::ffff:")) return isPrivateIpv4(h.slice(7));
  return false;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host.endsWith(".internal") || host === "metadata.google.internal") return true;
  if (host === "metadata.google" || host === "0.0.0.0") return true;
  if (/^\d+$/.test(host)) return true;
  if (isPrivateIpv4(host) || isPrivateIpv6(host)) return true;
  return false;
}

export function assertPublicHttpsUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SourceFetchError("invalid_url", null, false);
  }
  if (url.protocol !== "https:") {
    throw new SourceFetchError("unsafe_protocol", null, false);
  }
  if (url.username || url.password) {
    throw new SourceFetchError("unsafe_url", null, false);
  }
  if (isBlockedHostname(url.hostname)) {
    throw new SourceFetchError("private_network", null, false);
  }
  return url;
}

async function rejectPrivateDns(hostname: string): Promise<void> {
  const host = hostname.toLowerCase();
  if (host.endsWith(".test") || host.endsWith(".example") || host.endsWith(".invalid")) return;
  const resolver = (globalThis as {
    Deno?: { resolveDns?: (host: string, record: string) => Promise<string[]> };
  }).Deno?.resolveDns;
  if (!resolver) return;
  try {
    const ips = await resolver(host, "A");
    for (const ip of ips) {
      if (isBlockedHostname(ip)) throw new SourceFetchError("private_network", null, false);
    }
  } catch (err) {
    if (err instanceof SourceFetchError) throw err;
  }
}

export async function safeFetch(input: {
  url: string;
  userAgent: string;
  fetchImpl?: typeof fetch;
  etag?: string | null;
  lastModified?: string | null;
  timeoutMs?: number;
  maxBytes?: number;
}): Promise<SafeFetchResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = input.maxBytes ?? MAX_RESPONSE_BYTES;
  let current = assertPublicHttpsUrl(input.url);
  await rejectPrivateDns(current.hostname);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const headers: Record<string, string> = {
      "User-Agent": input.userAgent,
      "Accept": "application/rss+xml, application/atom+xml, application/json, text/html, text/calendar, application/xml, text/xml;q=0.9, */*;q=0.1",
    };
    if (hop === 0 && input.etag) headers["If-None-Match"] = input.etag;
    if (hop === 0 && input.lastModified) headers["If-Modified-Since"] = input.lastModified;

    let res: Response;
    try {
      res = await fetchImpl(current.toString(), {
        method: "GET",
        redirect: "manual",
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === "TimeoutError" || name === "AbortError") {
        throw new SourceFetchError("timeout", null, true);
      }
      throw new SourceFetchError("network", null, true);
    }

    if (res.status === 304) {
      return {
        status: 304,
        body: "",
        etag: input.etag ?? null,
        lastModified: input.lastModified ?? null,
        finalUrl: current.toString(),
        unchanged: true,
      };
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new SourceFetchError("redirect", res.status, false);
      if (hop === MAX_REDIRECTS) throw new SourceFetchError("redirect", res.status, false);
      const next = new URL(location, current);
      current = assertPublicHttpsUrl(next.toString());
      await rejectPrivateDns(current.hostname);
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      throw new SourceFetchError("upstream", res.status, true);
    }
    if (!res.ok) throw new SourceFetchError("upstream", res.status, false);

    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      if (text.length > maxBytes) throw new SourceFetchError("oversized", res.status, false);
      return {
        status: res.status,
        body: text,
        etag: res.headers.get("etag"),
        lastModified: res.headers.get("last-modified"),
        finalUrl: current.toString(),
        unchanged: false,
      };
    }

    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const step = await reader.read();
      if (step.done) break;
      received += step.value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new SourceFetchError("oversized", res.status, false);
      }
      chunks.push(step.value);
    }
    const body = new TextDecoder().decode(concatBytes(chunks, received));
    return {
      status: res.status,
      body,
      etag: res.headers.get("etag"),
      lastModified: res.headers.get("last-modified"),
      finalUrl: current.toString(),
      unchanged: false,
    };
  }
  throw new SourceFetchError("redirect", null, false);
}

export async function loadConfiguredSource(ctx: SourceRunContext): Promise<string | null> {
  const forceFullFetch = ctx.fetchState.forceFullFetch === true;
  const fetched = await safeFetch({
    url: ctx.source.url,
    userAgent: ctx.userAgent,
    fetchImpl: ctx.fetchImpl,
    etag: forceFullFetch ? null : ctx.source.lastEtag,
    lastModified: forceFullFetch ? null : ctx.source.lastModified,
  });
  ctx.fetchState.etag = fetched.etag;
  ctx.fetchState.lastModified = fetched.lastModified;
  if (fetched.unchanged && !forceFullFetch) {
    ctx.fetchState.unchanged = true;
    ctx.fetchState.contentHash = ctx.source.lastContentHash;
    return null;
  }
  const hash = await sha256Hex(fetched.body);
  ctx.fetchState.contentHash = hash;
  if (ctx.source.lastContentHash && ctx.source.lastContentHash === hash && !forceFullFetch) {
    ctx.fetchState.unchanged = true;
    return null;
  }
  return fetched.body;
}

function concatBytes(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
