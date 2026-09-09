// Known-provider registry. Unknown providers fail conservatively.
// V1 does not fetch from providers; it only inspects already-normalized rows.

import {
  KNOWN_CATALYST_PROVIDERS,
  type KnownCatalystProvider,
} from "./types.ts";

export function isKnownProvider(provider: string): provider is KnownCatalystProvider {
  return (KNOWN_CATALYST_PROVIDERS as readonly string[]).includes(provider);
}

export function normalizeProvider(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

export interface ProviderPolicy {
  known: boolean;
  provider: string;
  /** Unknown providers cannot be classified hard and cannot alert. */
  allowHard: boolean;
  allowAlerts: boolean;
  sourceQuality: number;
  confidenceCap: number | null;
  scoreCap: number | null;
}

export function providerPolicy(providerRaw: string): ProviderPolicy {
  const provider = normalizeProvider(providerRaw);
  if (provider === "sec_edgar") {
    return {
      known: true,
      provider,
      allowHard: true,
      allowAlerts: true,
      sourceQuality: 95,
      confidenceCap: null,
      scoreCap: null,
    };
  }
  if (provider === "earnings_calendar") {
    return {
      known: true,
      provider,
      allowHard: true,
      allowAlerts: true,
      sourceQuality: 90,
      confidenceCap: null,
      scoreCap: null,
    };
  }
  if (provider === "polygon") {
    return {
      known: true,
      provider,
      allowHard: true,
      allowAlerts: true,
      sourceQuality: 70,
      confidenceCap: null,
      scoreCap: null,
    };
  }
  return {
    known: false,
    provider: provider || "unknown",
    allowHard: false,
    allowAlerts: false,
    sourceQuality: 15,
    confidenceCap: 30,
    scoreCap: 40,
  };
}
