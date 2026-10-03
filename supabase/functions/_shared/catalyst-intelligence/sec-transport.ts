import { SEC_LATEST_FILINGS_ATOM_URL } from "../sec-edgar/ingest.ts";

export type SecTransportMode = "direct" | "gateway";

export function readSecTransportMode(env: (key: string) => string | undefined): SecTransportMode {
  return (env("SEC_TRANSPORT_MODE") ?? "").trim().toLowerCase() === "gateway" ? "gateway" : "direct";
}

/** Primary latest-filings Atom only. Company-map URLs stay on the direct fetch path. */
export function isPrimarySecFilingsUrl(raw: string): boolean {
  if (raw === SEC_LATEST_FILINGS_ATOM_URL) return true;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (host !== "www.sec.gov" && host !== "sec.gov") return false;
    if (!url.pathname.endsWith("/cgi-bin/browse-edgar")) return false;
    return url.searchParams.get("action") === "getcurrent" && url.searchParams.get("output") === "atom";
  } catch {
    return false;
  }
}

/**
 * DIRECT returns the original fetch.
 * GATEWAY sends only the primary filings URL to the egress gateway.
 * A gateway miss returns 503 and does not call SEC.
 */
export function createSecFilingsTransport(input: {
  mode: SecTransportMode;
  fetchImpl: typeof fetch;
  gatewayBaseUrl?: string;
  gatewaySecret?: string;
}): typeof fetch {
  if (input.mode !== "gateway") return input.fetchImpl;
  const base = (input.gatewayBaseUrl ?? "").trim().replace(/\/$/, "");
  const secret = (input.gatewaySecret ?? "").trim();
  return (target, init) => {
    const raw = requestUrl(target);
    if (!isPrimarySecFilingsUrl(raw)) return input.fetchImpl(target, init);
    if (!base || !secret) {
      return Promise.resolve(new Response(JSON.stringify({ error: "SEC_GATEWAY_UNAVAILABLE" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }));
    }
    return input.fetchImpl(`${base}/v1/sec/latest-filings`, {
      method: "GET",
      redirect: "manual",
      signal: init?.signal,
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "application/atom+xml, application/xml, text/xml",
      },
    });
  };
}

function requestUrl(target: Parameters<typeof fetch>[0]): string {
  if (typeof target === "string") return target;
  if (target instanceof URL) return target.toString();
  return target.url;
}
