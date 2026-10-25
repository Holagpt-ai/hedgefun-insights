import type { CatalystEvent } from "@/types/catalyst";

export type IntelLifecycleState =
  | "discovered"
  | "scheduled"
  | "approaching"
  | "live"
  | "announced"
  | "reacting"
  | "follow_through"
  | "resolved"
  | "invalidated";

export type IntelVerificationState =
  | "VERIFIED_PRIMARY"
  | "VERIFIED_MULTI_SOURCE"
  | "REPORTED"
  | "UNVERIFIED"
  | "CONFLICTING"
  | "INVALIDATED";

const SCHEDULE_ONLY: ReadonlySet<IntelLifecycleState> = new Set([
  "discovered",
  "scheduled",
  "approaching",
]);

const ANNOUNCED_LIFECYCLE: ReadonlySet<IntelLifecycleState> = new Set([
  "announced",
  "reacting",
  "follow_through",
  "resolved",
  "live",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(facts: Record<string, unknown>, key: string): string | null {
  const raw = facts[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function readNumber(facts: Record<string, unknown>, key: string): number | null {
  const raw = facts[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

export function readIntelLifecycle(facts: Record<string, unknown>): IntelLifecycleState | null {
  const raw = readString(facts, "intel_lifecycle") ?? readString(facts, "lifecycle");
  if (!raw) return null;
  if (SCHEDULE_ONLY.has(raw as IntelLifecycleState) || ANNOUNCED_LIFECYCLE.has(raw as IntelLifecycleState) || raw === "invalidated") {
    return raw as IntelLifecycleState;
  }
  return null;
}

export function readIntelVerification(facts: Record<string, unknown>): IntelVerificationState | null {
  const raw = readString(facts, "intel_verification") ?? readString(facts, "verification");
  const allowed: IntelVerificationState[] = [
    "VERIFIED_PRIMARY",
    "VERIFIED_MULTI_SOURCE",
    "REPORTED",
    "UNVERIFIED",
    "CONFLICTING",
    "INVALIDATED",
  ];
  return allowed.includes(raw as IntelVerificationState) ? (raw as IntelVerificationState) : null;
}

export function readIntelMateriality(facts: Record<string, unknown>): number | null {
  return readNumber(facts, "materiality") ?? readNumber(facts, "intel_materiality");
}

export function readIntelFactsFromEvent(event: CatalystEvent): {
  lifecycle: IntelLifecycleState | null;
  verification: IntelVerificationState | null;
  materiality: number | null;
  ingestedAt: string | null;
  securityId: string | null;
  providerTickerConflict: boolean;
  earningsDisposition: string | null;
} {
  const facts = isRecord(event.facts) ? event.facts : {};
  return {
    lifecycle: readIntelLifecycle(facts),
    verification: readIntelVerification(facts),
    materiality: readIntelMateriality(facts),
    ingestedAt: readString(facts, "ingested_at") ?? readString(facts, "intel_ingested_at"),
    securityId: readString(facts, "security_id") ?? readString(facts, "securityId"),
    providerTickerConflict: facts.provider_ticker_conflict === true,
    earningsDisposition: readString(facts, "earnings_disposition"),
  };
}

export function isScheduleOnlyLifecycle(lifecycle: IntelLifecycleState | null): boolean {
  return lifecycle !== null && SCHEDULE_ONLY.has(lifecycle);
}

export function isAnnouncedLifecycle(lifecycle: IntelLifecycleState | null): boolean {
  return lifecycle !== null && ANNOUNCED_LIFECYCLE.has(lifecycle);
}
