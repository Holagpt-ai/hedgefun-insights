/**
 * Deterministic security identity mapping.
 *
 * Symbol, exchange, float, shares, and market cap are point-in-time attributes.
 * They are never the primary key. This module does not read Radar or screeners.
 */

import type { DataProvenanceState } from "@/config/data-quality.config";
import {
  ADR_STATUSES,
  SECURITY_IDENTITY_VERSION,
  SECURITY_LEVEL_IDENTIFIER_PRIORITY,
  SECURITY_TYPES,
  type AdrStatus,
  type ReferenceIdentifierKind,
  type SecurityLevelIdentifierKind,
  type SecurityResolutionState,
  type SecurityType,
} from "@/config/security-identity.config";
import { parseTimestampMs } from "@/lib/screeners/contract";
import type {
  IdentityResolution,
  Security,
  SecurityId,
  SecurityIdentityObservation,
  SecurityReferenceIdentifier,
  SecuritySymbolHistory,
  SymbolAtDate,
} from "@/types/security-identity";

const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,11}$/;
const EXCHANGE_RE = /^[A-Z0-9][A-Z0-9 ./-]{0,31}$/;
const COUNTRY_RE = /^[A-Z]{2}$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

interface NormalizedObservation {
  symbol: string;
  exchange: string | null;
  effectiveDate: string;
  issuerName: string | null;
  securityType: SecurityType;
  country: string | null;
  adrStatus: AdrStatus;
  identifiers: ReadonlyMap<ReferenceIdentifierKind, string>;
  source: string | null;
  sourceAsOf: string | null;
  observedAt: string | null;
  fetchedAt: string | null;
  provenance: DataProvenanceState;
  recordedAt: string;
}

function isCalendarDate(value: string): boolean {
  const match = ISO_DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1970 || year > 2100) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

function previousIsoDate(isoDate: string): string {
  const match = ISO_DATE_RE.exec(isoDate);
  if (!match) throw new Error("previousIsoDate requires a calendar date");
  const probe = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  probe.setUTCDate(probe.getUTCDate() - 1);
  return probe.toISOString().slice(0, 10);
}

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function canonicalTimestamp(value: string | null | undefined): { ok: true; iso: string | null } | { ok: false } {
  if (value == null || value.trim() === "") return { ok: true, iso: null };
  const ms = parseTimestampMs(value);
  if (ms === null) return { ok: false };
  return { ok: true, iso: new Date(ms).toISOString() };
}

function isSecurityType(value: string): value is SecurityType {
  return (SECURITY_TYPES as readonly string[]).includes(value);
}

function isAdrStatus(value: string): value is AdrStatus {
  return (ADR_STATUSES as readonly string[]).includes(value);
}

function isProvenance(value: string): value is DataProvenanceState {
  return value === "PROVIDER" || value === "DERIVED" || value === "INTERNAL" || value === "COMPOSITE" || value === "UNKNOWN";
}

function normalize(observation: SecurityIdentityObservation): { ok: true; value: NormalizedObservation } | { ok: false; reason: string } {
  const symbol = blankToNull(observation.symbol)?.toUpperCase() ?? "";
  if (!SYMBOL_RE.test(symbol)) return { ok: false, reason: "invalid symbol" };

  const exchangeRaw = blankToNull(observation.exchange);
  const exchange = exchangeRaw?.toUpperCase() ?? null;
  if (exchange !== null && !EXCHANGE_RE.test(exchange)) return { ok: false, reason: "invalid exchange" };

  const effectiveDate = blankToNull(observation.effectiveDate) ?? "";
  if (!isCalendarDate(effectiveDate)) return { ok: false, reason: "invalid effective date" };

  const recorded = canonicalTimestamp(observation.recordedAt);
  if (!recorded.ok || recorded.iso === null) return { ok: false, reason: "invalid recordedAt" };
  const sourceAsOf = canonicalTimestamp(observation.sourceAsOf);
  const observedAt = canonicalTimestamp(observation.observedAt);
  const fetchedAt = canonicalTimestamp(observation.fetchedAt);
  if (!sourceAsOf.ok || !observedAt.ok || !fetchedAt.ok) return { ok: false, reason: "invalid evidence timestamp" };

  const countryRaw = blankToNull(observation.country);
  const country = countryRaw?.toUpperCase() ?? null;
  if (country !== null && !COUNTRY_RE.test(country)) return { ok: false, reason: "invalid country" };

  const securityTypeRaw = blankToNull(observation.securityType);
  if (securityTypeRaw !== null && !isSecurityType(securityTypeRaw)) return { ok: false, reason: "invalid security type" };
  const securityType: SecurityType = securityTypeRaw !== null && isSecurityType(securityTypeRaw) ? securityTypeRaw : "UNKNOWN";

  const adrRaw = blankToNull(observation.adrStatus);
  if (adrRaw !== null && !isAdrStatus(adrRaw)) return { ok: false, reason: "invalid adr status" };
  let adrStatus: AdrStatus = adrRaw !== null && isAdrStatus(adrRaw) ? adrRaw : "UNKNOWN";
  if (adrRaw === null && securityType === "ADR") adrStatus = "ADR";

  const provenanceRaw = blankToNull(observation.provenance);
  if (provenanceRaw !== null && !isProvenance(provenanceRaw)) return { ok: false, reason: "invalid provenance" };
  const provenance: DataProvenanceState = provenanceRaw !== null && isProvenance(provenanceRaw) ? provenanceRaw : "UNKNOWN";

  const identifiers = new Map<ReferenceIdentifierKind, string>();
  const supplied: Array<[ReferenceIdentifierKind, string | null | undefined]> = [
    ["COMPOSITE_FIGI", observation.compositeFigi],
    ["FIGI", observation.figi],
    ["PROVIDER_REFERENCE", observation.providerReferenceId],
    ["CIK", observation.cik],
  ];
  for (const [kind, raw] of supplied) {
    const value = blankToNull(raw);
    if (value === null) continue;
    identifiers.set(kind, kind === "PROVIDER_REFERENCE" || kind === "CIK" ? value : value.toUpperCase());
  }

  return {
    ok: true,
    value: {
      symbol,
      exchange,
      effectiveDate,
      issuerName: blankToNull(observation.issuerName),
      securityType,
      country,
      adrStatus,
      identifiers,
      source: blankToNull(observation.source),
      sourceAsOf: sourceAsOf.iso,
      observedAt: observedAt.iso,
      fetchedAt: fetchedAt.iso,
      provenance,
      recordedAt: recorded.iso,
    },
  };
}

function covers(row: SecuritySymbolHistory, eventDate: string): boolean {
  return row.effectiveFrom <= eventDate && (row.effectiveTo === null || row.effectiveTo >= eventDate);
}

function unresolved(reason: string): IdentityResolution {
  return {
    version: SECURITY_IDENTITY_VERSION,
    status: "UNRESOLVED",
    securityId: null,
    security: null,
    created: false,
    reason,
  };
}

function isSecurityLevelKind(kind: ReferenceIdentifierKind): kind is SecurityLevelIdentifierKind {
  return (SECURITY_LEVEL_IDENTIFIER_PRIORITY as readonly string[]).includes(kind);
}

export class SecurityIdentityStore {
  private readonly securities = new Map<SecurityId, Security>();
  private readonly history: SecuritySymbolHistory[] = [];
  private readonly identifiers: SecurityReferenceIdentifier[] = [];
  private readonly createId: () => SecurityId;

  constructor(createId: () => SecurityId = () => crypto.randomUUID()) {
    this.createId = createId;
  }

  /** Replaces in-memory rows. Callers use this to run the existing resolver against a loaded snapshot. */
  loadState(state: {
    securities: readonly Security[];
    history: readonly SecuritySymbolHistory[];
    identifiers: readonly SecurityReferenceIdentifier[];
  }): void {
    this.securities.clear();
    for (const security of state.securities) this.securities.set(security.securityId, { ...security });
    this.history.length = 0;
    this.history.push(...state.history.map((row) => ({ ...row })));
    this.identifiers.length = 0;
    this.identifiers.push(...state.identifiers.map((row) => ({ ...row })));
  }

  listSecurities(): readonly Security[] {
    return [...this.securities.values()];
  }

  listHistory(securityId?: SecurityId): readonly SecuritySymbolHistory[] {
    return this.history.filter((row) => securityId === undefined || row.securityId === securityId);
  }

  listIdentifiers(securityId?: SecurityId): readonly SecurityReferenceIdentifier[] {
    return this.identifiers.filter((row) => securityId === undefined || row.securityId === securityId);
  }

  getSecurity(securityId: SecurityId): Security | null {
    return this.securities.get(securityId) ?? null;
  }

  /**
   * Symbol in force for this security on the event date.
   * Returns null when the date is outside recorded history. Never substitutes today's symbol.
   */
  symbolAt(securityId: SecurityId, eventDate: string): SymbolAtDate | null {
    if (!isCalendarDate(eventDate)) return null;
    const matches = this.history.filter((row) => row.securityId === securityId && covers(row, eventDate));
    if (matches.length !== 1) return null;
    const row = matches[0];
    return {
      securityId,
      symbol: row.symbol,
      exchange: row.exchange,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
    };
  }

  /** Open symbol only. A closed historical symbol is not current. */
  currentSymbol(securityId: SecurityId): SymbolAtDate | null {
    const open = this.history.filter((row) => row.securityId === securityId && row.effectiveTo === null);
    if (open.length !== 1) return null;
    const row = open[0];
    return {
      securityId,
      symbol: row.symbol,
      exchange: row.exchange,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: null,
    };
  }

  resolve(observation: SecurityIdentityObservation): IdentityResolution {
    const normalized = normalize(observation);
    if (!normalized.ok) return unresolved(normalized.reason);
    const next = normalized.value;

    const securityLevelHits = new Map<SecurityId, SecurityLevelIdentifierKind>();
    for (const kind of SECURITY_LEVEL_IDENTIFIER_PRIORITY) {
      const value = next.identifiers.get(kind);
      if (value === undefined) continue;
      const found = this.identifiers.find((row) => row.kind === kind && row.value === value);
      if (found) securityLevelHits.set(found.securityId, kind);
    }
    if (securityLevelHits.size > 1) return unresolved("conflicting permanent identifiers");

    const covering = this.history.filter(
      (row) => row.symbol === next.symbol && row.exchange === next.exchange && covers(row, next.effectiveDate),
    );
    if (covering.length > 1) return unresolved("ambiguous symbol history");

    const matchedId = securityLevelHits.size === 1 ? [...securityLevelHits.keys()][0] : null;
    const coveringId = covering.length === 1 ? covering[0].securityId : null;
    if (matchedId && coveringId && matchedId !== coveringId) {
      return unresolved("symbol history conflicts with permanent identifier");
    }

    const targetId = matchedId ?? coveringId;
    if (targetId) return this.applyToExisting(targetId, next);

    return this.createSecurity(next);
  }

  private applyToExisting(securityId: SecurityId, next: NormalizedObservation): IdentityResolution {
    const security = this.securities.get(securityId);
    if (!security) return unresolved("matched security missing");

    const identifierConflict = this.identifierConflict(securityId, next);
    if (identifierConflict) return unresolved(identifierConflict);

    const open = this.history.filter((row) => row.securityId === securityId && row.effectiveTo === null);
    if (open.length !== 1) return unresolved("security has no single open symbol");
    const openRow = open[0];
    const sameListing = openRow.symbol === next.symbol && openRow.exchange === next.exchange;

    if (!sameListing) {
      if (next.effectiveDate <= openRow.effectiveFrom) {
        return unresolved("symbol change is not after the open history row");
      }
      const closedOn = previousIsoDate(next.effectiveDate);
      if (closedOn < openRow.effectiveFrom) return unresolved("symbol change cannot close the open history row");
      openRow.effectiveTo = closedOn;
      this.history.push(this.historyRow(securityId, next));
      security.currentSymbol = next.symbol;
      security.exchange = next.exchange;
    }

    this.attachIdentifiers(securityId, next);
    if (security.issuerName === null && next.issuerName !== null) security.issuerName = next.issuerName;
    if (security.securityType === "UNKNOWN" && next.securityType !== "UNKNOWN") security.securityType = next.securityType;
    if (security.country === null && next.country !== null) security.country = next.country;
    if (security.adrStatus === "UNKNOWN" && next.adrStatus !== "UNKNOWN") security.adrStatus = next.adrStatus;
    if (this.hasSecurityLevelIdentifier(securityId)) security.resolutionState = "RESOLVED";
    security.updatedAt = next.recordedAt;

    return {
      version: SECURITY_IDENTITY_VERSION,
      status: security.resolutionState,
      securityId,
      security,
      created: false,
      reason: sameListing ? "matched existing security" : "matched existing security and advanced symbol history",
    };
  }

  private createSecurity(next: NormalizedObservation): IdentityResolution {
    const securityId = this.createId();
    const resolutionState: SecurityResolutionState = this.observationHasSecurityLevelId(next) ? "RESOLVED" : "CANDIDATE";
    const security: Security = {
      securityId,
      currentSymbol: next.symbol,
      issuerName: next.issuerName,
      securityType: next.securityType,
      exchange: next.exchange,
      country: next.country,
      adrStatus: next.adrStatus,
      active: true,
      resolutionState,
      createdAt: next.recordedAt,
      updatedAt: next.recordedAt,
    };
    this.securities.set(securityId, security);
    this.history.push(this.historyRow(securityId, next));
    this.attachIdentifiers(securityId, next);
    return {
      version: SECURITY_IDENTITY_VERSION,
      status: resolutionState,
      securityId,
      security,
      created: true,
      reason: resolutionState === "RESOLVED" ? "created security from permanent identifier" : "created candidate security",
    };
  }

  private identifierConflict(securityId: SecurityId, next: NormalizedObservation): string | null {
    for (const [kind, value] of next.identifiers) {
      const owned = this.identifiers.find((row) => row.securityId === securityId && row.kind === kind);
      if (owned && owned.value !== value) return `conflicting ${kind} on matched security`;
      if (!isSecurityLevelKind(kind)) continue;
      const other = this.identifiers.find((row) => row.kind === kind && row.value === value && row.securityId !== securityId);
      if (other) return `conflicting ${kind} already belongs to another security`;
    }
    return null;
  }

  private attachIdentifiers(securityId: SecurityId, next: NormalizedObservation): void {
    for (const [kind, value] of next.identifiers) {
      const existing = this.identifiers.find((row) => row.securityId === securityId && row.kind === kind);
      if (existing) continue;
      this.identifiers.push({
        securityId,
        kind,
        value,
        source: next.source,
        sourceAsOf: next.sourceAsOf,
        provenance: next.provenance,
        observedAt: next.observedAt,
        fetchedAt: next.fetchedAt,
      });
    }
  }

  private observationHasSecurityLevelId(next: NormalizedObservation): boolean {
    return SECURITY_LEVEL_IDENTIFIER_PRIORITY.some((kind) => next.identifiers.has(kind));
  }

  private hasSecurityLevelIdentifier(securityId: SecurityId): boolean {
    return this.identifiers.some((row) => row.securityId === securityId && isSecurityLevelKind(row.kind));
  }

  private historyRow(securityId: SecurityId, next: NormalizedObservation): SecuritySymbolHistory {
    return {
      securityId,
      symbol: next.symbol,
      exchange: next.exchange,
      effectiveFrom: next.effectiveDate,
      effectiveTo: null,
      source: next.source,
      sourceAsOf: next.sourceAsOf,
      provenance: next.provenance,
      observedAt: next.observedAt,
      fetchedAt: next.fetchedAt,
    };
  }
}

export function createSecurityIdentityStore(createId?: () => SecurityId): SecurityIdentityStore {
  return new SecurityIdentityStore(createId);
}
