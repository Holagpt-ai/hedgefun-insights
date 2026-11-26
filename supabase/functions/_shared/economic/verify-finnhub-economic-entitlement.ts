/**
 * Non-writing Finnhub economic calendar entitlement probe.
 * Does not persist rows; classifies HTTP/auth/payload for owner verification.
 */

export type FinnhubEntitlementProbe = {
  ok: boolean;
  http_status: number | null;
  class: "entitled" | "unauthorized" | "forbidden" | "rate_limited" | "empty" | "malformed" | "network" | "missing_key";
  sample_count: number;
  message: string;
};

const PROBE_TIMEOUT_MS = 12_000;

export async function verifyFinnhubEconomicEntitlement(apiKey: string | undefined): Promise<FinnhubEntitlementProbe> {
  if (!apiKey?.trim()) {
    return {
      ok: false,
      http_status: null,
      class: "missing_key",
      sample_count: 0,
      message: "FINNHUB_API_KEY not configured",
    };
  }

  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 3);
  const to = new Date(today);
  to.setUTCDate(to.getUTCDate() + 7);

  const url =
    `https://finnhub.io/api/v1/calendar/economic?from=${fmt(from)}&to=${fmt(to)}&token=${apiKey.trim()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (res.status === 401) {
      return { ok: false, http_status: 401, class: "unauthorized", sample_count: 0, message: "HTTP 401" };
    }
    if (res.status === 403) {
      return { ok: false, http_status: 403, class: "forbidden", sample_count: 0, message: "HTTP 403 — endpoint may not be entitled" };
    }
    if (res.status === 429) {
      return { ok: false, http_status: 429, class: "rate_limited", sample_count: 0, message: "HTTP 429" };
    }
    if (!res.ok) {
      return { ok: false, http_status: res.status, class: "malformed", sample_count: 0, message: `HTTP ${res.status}` };
    }

    const json = await res.json().catch(() => null);
    const arr = json && typeof json === "object" && Array.isArray((json as { economicCalendar?: unknown }).economicCalendar)
      ? (json as { economicCalendar: unknown[] }).economicCalendar
      : null;
    if (!arr) {
      return { ok: false, http_status: res.status, class: "malformed", sample_count: 0, message: "Missing economicCalendar array" };
    }
    if (!arr.length) {
      return { ok: true, http_status: res.status, class: "empty", sample_count: 0, message: "Entitlement OK; window returned zero rows" };
    }
    return {
      ok: true,
      http_status: res.status,
      class: "entitled",
      sample_count: arr.length,
      message: `Entitlement OK; sample_count=${arr.length}`,
    };
  } catch (err) {
    clearTimeout(timer);
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      http_status: null,
      class: aborted ? "network" : "network",
      sample_count: 0,
      message: aborted ? "Probe timed out" : "Network error",
    };
  }
}