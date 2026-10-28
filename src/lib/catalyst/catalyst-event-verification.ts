/**
 * Hydrate CatalystEvent verification metadata from persisted facts and attribution rules.
 * DB rows store attribution_class in facts JSON — not as top-level columns.
 */

import {
  attributeSymbol,
  reconcileAttributionWithLiveRules,
  type AttributionClass,
} from "@/lib/catalyst/attribution";
import { EARNINGS_CALENDAR_PROVIDER } from "@/lib/pre-market/builders";
import type { CatalystEvent } from "@/types/catalyst";

const ATTRIBUTION_AUTHORITATIVE_PROVIDERS = new Set([
  "sec_edgar",
  EARNINGS_CALENDAR_PROVIDER,
  "company_ir",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readFactString(facts: Record<string, unknown>, key: string): string | null {
  const raw = facts[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function readAttributionFromFacts(facts: Record<string, unknown>): AttributionClass | null {
  const raw = readFactString(facts, "attribution_class");
  if (
    raw === "direct" ||
    raw === "provider_associated" ||
    raw === "sector_related" ||
    raw === "unverified"
  ) {
    return raw;
  }
  return null;
}

function readTickerSpecificFromFacts(facts: Record<string, unknown>): boolean | null {
  const raw = facts.ticker_specific;
  if (raw === true || raw === false) return raw;
  return null;
}

/** Attach attribution_class and ticker_specific for client verification flows. */
export function hydrateCatalystEventVerification(event: CatalystEvent): CatalystEvent {
  const facts = isRecord(event.facts) ? event.facts : {};
  let attribution_class = event.attribution_class ?? readAttributionFromFacts(facts);
  let ticker_specific = event.ticker_specific ?? readTickerSpecificFromFacts(facts);

  if (event.provider === EARNINGS_CALENDAR_PROVIDER) {
    return {
      ...event,
      attribution_class: attribution_class ?? "direct",
      ticker_specific: ticker_specific ?? true,
    };
  }

  if (facts.provider_ticker_conflict === true) {
    attribution_class = "unverified";
    ticker_specific = false;
    return {
      ...event,
      attribution_class: "unverified",
      ticker_specific: false,
    };
  }

  const live = attributeSymbol({
    title: event.title,
    description: event.description,
    symbol: event.symbol,
    companyName: event.company_name,
    providerTickers: [event.symbol, ...(event.related_symbols ?? [])],
    providerAssociatesSymbol: true,
  });

  const authoritative =
    ATTRIBUTION_AUTHORITATIVE_PROVIDERS.has(event.provider)
    || readFactString(facts, "attribution_authoritative") === "true";

  if (authoritative) {
    return {
      ...event,
      attribution_class: attribution_class ?? live.class ?? "direct",
      ticker_specific: ticker_specific ?? live.ticker_specific ?? true,
    };
  }

  if (attribution_class === null || ticker_specific === null) {
    attribution_class = attribution_class ?? live.class;
    ticker_specific = ticker_specific ?? live.ticker_specific;
  } else {
    const reconciled = reconcileAttributionWithLiveRules(
      attribution_class,
      ticker_specific,
      live,
    );
    attribution_class = reconciled.class;
    ticker_specific = reconciled.ticker_specific;
  }

  return {
    ...event,
    attribution_class: attribution_class ?? event.attribution_class ?? null,
    ticker_specific: ticker_specific ?? event.ticker_specific ?? null,
  };
}

export function hydrateCatalystEvents(events: readonly CatalystEvent[]): CatalystEvent[] {
  return events.map(hydrateCatalystEventVerification);
}
