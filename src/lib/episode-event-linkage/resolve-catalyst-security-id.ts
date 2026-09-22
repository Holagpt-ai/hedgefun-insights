import { SecurityIdentityStore } from "@/lib/security-identity/security-identity";
import type { SecurityId } from "@/types/security-identity";

export type CatalystIdentityResolution =
  | { status: "resolved"; securityId: SecurityId; method: string }
  | { status: "unresolved"; reason: string };

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isCalendarDate(value: string): boolean {
  return ISO_DATE_RE.test(value);
}

function covers(effectiveFrom: string, effectiveTo: string | null, eventDate: string): boolean {
  return effectiveFrom <= eventDate && (effectiveTo === null || effectiveTo >= eventDate);
}

function providerReferenceValue(provider: string, providerArticleId: string | null, dedupeKey: string): string {
  if (providerArticleId && providerArticleId.trim()) {
    return `${provider.trim()}:${providerArticleId.trim()}`;
  }
  return `${provider.trim()}:dedupe:${dedupeKey.trim()}`;
}

function readFactString(facts: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!facts) return null;
  const raw = facts[key];
  if (typeof raw !== "string" || !raw.trim()) return null;
  return raw.trim();
}

export function resolveCatalystEventSecurityId(input: {
  store: SecurityIdentityStore;
  symbol: string;
  eventDate: string | null;
  exchange?: string | null;
  provider: string;
  providerArticleId: string | null;
  dedupeKey: string;
  facts?: Record<string, unknown> | null;
}): CatalystIdentityResolution {
  const symbol = input.symbol.trim().toUpperCase();
  if (!symbol) return { status: "unresolved", reason: "missing_symbol" };

  const providerRef = providerReferenceValue(input.provider, input.providerArticleId, input.dedupeKey);
  const providerMatches = input.store.listIdentifiers().filter(
    (row) => row.kind === "PROVIDER_REFERENCE" && row.value === providerRef,
  );
  if (providerMatches.length > 1) {
    return { status: "unresolved", reason: "ambiguous_provider_reference" };
  }
  if (providerMatches.length === 1) {
    return { status: "resolved", securityId: providerMatches[0]!.securityId, method: "provider_reference" };
  }

  for (const kind of ["COMPOSITE_FIGI", "FIGI", "CIK"] as const) {
    const factKey = kind === "CIK" ? "cik" : kind === "FIGI" ? "figi" : "composite_figi";
    const value = readFactString(input.facts ?? null, factKey);
    if (!value) continue;
    const matches = input.store.listIdentifiers().filter((row) => row.kind === kind && row.value === value);
    if (matches.length > 1) return { status: "unresolved", reason: `ambiguous_${kind.toLowerCase()}` };
    if (matches.length === 1) {
      return { status: "resolved", securityId: matches[0]!.securityId, method: kind.toLowerCase() };
    }
  }

  const eventDate = input.eventDate && isCalendarDate(input.eventDate) ? input.eventDate : null;
  const exchange = input.exchange?.trim().toUpperCase() ?? null;

  if (eventDate) {
    const historyMatches = input.store.listHistory().filter((row) => {
      if (row.symbol !== symbol) return false;
      if (exchange !== null && row.exchange !== exchange) return false;
      return covers(row.effectiveFrom, row.effectiveTo, eventDate);
    });
    const securityIds = new Set(historyMatches.map((row) => row.securityId));
    if (securityIds.size > 1) return { status: "unresolved", reason: "ambiguous_symbol_at_date" };
    if (securityIds.size === 1) {
      return {
        status: "resolved",
        securityId: [...securityIds][0]!,
        method: exchange ? "symbol_exchange_at_date" : "symbol_at_date",
      };
    }
  }

  const currentMatches = input.store.listSecurities().filter(
    (row) => row.active && row.currentSymbol === symbol,
  );
  if (currentMatches.length > 1) {
    return { status: "unresolved", reason: "ambiguous_current_symbol" };
  }
  if (currentMatches.length === 1 && eventDate) {
    const securityId = currentMatches[0]!.securityId;
    const symbolAt = input.store.symbolAt(securityId, eventDate);
    if (symbolAt && symbolAt.symbol === symbol) {
      return { status: "resolved", securityId, method: "current_symbol_with_history_coverage" };
    }
    return { status: "unresolved", reason: "current_symbol_not_valid_at_event_date" };
  }

  return { status: "unresolved", reason: "no_identity_match" };
}
