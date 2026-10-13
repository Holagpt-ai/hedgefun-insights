/**
 * Prior-session Carryover Watch.
 * Reads retained scanner and Five Pillars records. Does not re-evaluate
 * yesterday's pillars against today's tape and does not invent symbols.
 */

import { buildRepeatMoverWorkflowHandoffs } from "@/lib/radar/radar-repeat-mover-handoffs";
import type { RadarRepeatMoverWorkflowHandoffs } from "@/lib/radar/radar-repeat-movers-types";
import { sessionMovePercent } from "@/lib/screeners/session-move";
import { isActionableScannerQuote } from "@/lib/screeners/scanner-tab-qualification";
import { formatEtClock } from "@/lib/screeners/screener-trigger-time";

export const CARRYOVER_HISTORICAL_NOTICE =
  "Historical prior-session record. A previous-session pass does not qualify the current session.";

export type CarryoverClass =
  | "previously_qualified"
  | "momentum_only"
  | "incomplete_evidence";

export interface CarryoverPillarRecord {
  symbol: string;
  pillarPhase: string | null;
  fivePillarsPass: boolean;
  pillarOutcomes: unknown;
  firstQualifiedAt: string | null;
  lastQualifiedAt: string | null;
  pillarExpiredAt: string | null;
  providerAsOf: string | null;
  everOnDesk: boolean;
  monitoredPrice: number | null;
  monitoredVolume: number | null;
}

export interface CarryoverCandidateView {
  symbol: string;
  classification: CarryoverClass;
  classificationLabel: string;
  price: number | null;
  movePct: number | null;
  sessionVolume: number | null;
  velocity: number | null;
  accelerationPct: number | null;
  hodLabel: string;
  sessionEvidence: string;
  floatLabel: string;
  catalystLabel: string;
  pillarLines: string[];
  evaluatedAtLabel: string | null;
  missingEvidence: string[];
  handoffs: RadarRepeatMoverWorkflowHandoffs;
}

export interface CarryoverWatchView {
  status: "ready" | "unavailable" | "empty";
  sessionDate: string;
  sessionLabel: string;
  /** Latest snapshot capture time retained for this session, when stored. */
  snapshotRecordedAtLabel: string | null;
  unavailableReason: string | null;
  sourceNote: string | null;
  pillarNote: string | null;
  candidates: CarryoverCandidateView[];
  withheldInvalidQuotes: number;
  historicalNotice: string;
}

const PILLAR_KEYS = ["price", "move", "float", "participation", "freshness"] as const;

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function symbolOf(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const symbol = raw.trim().toUpperCase();
  return symbol.length > 0 && symbol.length <= 12 ? symbol : null;
}

export function normalizeCarryoverSnapshotRow(raw: unknown): {
  symbol: string;
  price: number | null;
  volume: number | null;
  previousClose: number | null;
  velocity: number | null;
  accelerationPct: number | null;
  hodDistancePct: number | null;
  sessionKind: string | null;
  scannerEvents: unknown;
  primaryEvent: string | null;
  capturedAt: string | null;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const symbol = symbolOf(row.symbol);
  if (!symbol) return null;
  return {
    symbol,
    price: finiteNumber(row.last_price),
    volume: finiteNumber(row.session_volume),
    previousClose: finiteNumber(row.previous_close),
    velocity: finiteNumber(row.volume_velocity),
    accelerationPct: finiteNumber(row.volume_acceleration_pct),
    hodDistancePct: finiteNumber(row.distance_from_hod_pct),
    sessionKind: text(row.session_kind),
    scannerEvents: row.scanner_events,
    primaryEvent: text(row.primary_scanner_event),
    capturedAt: text(row.captured_at),
  };
}

function latestSnapshotCapturedAtLabel(
  rows: readonly { capturedAt: string | null }[],
): string | null {
  let bestIso: string | null = null;
  let bestMs = -Infinity;
  for (const row of rows) {
    const iso = row.capturedAt;
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms) || ms <= bestMs) continue;
    bestMs = ms;
    bestIso = iso;
  }
  return bestIso ? formatEtClock(bestIso) : null;
}

export function normalizeCarryoverPillar(raw: unknown): CarryoverPillarRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const symbol = symbolOf(row.symbol);
  if (!symbol) return null;
  return {
    symbol,
    pillarPhase: text(row.pillar_phase ?? row.phase),
    fivePillarsPass: row.five_pillars_pass === true,
    pillarOutcomes: row.pillar_outcomes ?? null,
    firstQualifiedAt: text(row.first_qualified_at),
    lastQualifiedAt: text(row.last_qualified_at),
    pillarExpiredAt: text(row.pillar_expired_at ?? row.expired_at),
    providerAsOf: text(row.provider_as_of),
    everOnDesk: row.ever_on_desk === true,
    monitoredPrice: finiteNumber(row.monitored_price),
    monitoredVolume: finiteNumber(row.monitored_volume),
  };
}

function eventTypes(raw: unknown, primary: string | null): string[] {
  const types = new Set<string>();
  if (primary) types.add(primary);
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const type = text((item as Record<string, unknown>).type);
      if (type) types.add(type);
    }
  }
  return [...types];
}

function sessionEvidence(sessionKind: string | null, events: readonly string[]): string {
  const parts: string[] = [];
  if (sessionKind === "after-hours") parts.push("After-hours snapshot");
  else if (sessionKind === "market") parts.push("Regular-session snapshot");
  else if (sessionKind === "pre-market") parts.push("Premarket snapshot");
  else parts.push("Session snapshot");
  if (events.includes("LATE_DAY_ACCELERATION")) parts.push("power-hour acceleration recorded");
  return parts.join(" · ");
}

function hodLabel(distance: number | null, events: readonly string[]): string {
  if (events.includes("HOD_BREAK")) return "HOD break recorded";
  if (distance === null) return "HOD relationship unavailable";
  if (distance <= 0.05) return "At HOD";
  return `${distance.toFixed(1)}% from HOD`;
}

function pillarLines(record: CarryoverPillarRecord | undefined): string[] {
  if (!record) return ["Five Pillars evaluation was not retained for this session."];
  const outcomes = record.pillarOutcomes;
  const lines: string[] = [];
  if (outcomes && typeof outcomes === "object" && !Array.isArray(outcomes)) {
    const bag = outcomes as Record<string, unknown>;
    for (const key of PILLAR_KEYS) {
      const value = bag[key];
      if (value === "pass" || value === "fail" || value === "unavailable") {
        lines.push(`${key}: ${value}`);
      }
    }
  }
  if (lines.length === 0) lines.push("Individual pillar results were not retained.");
  if (record.fivePillarsPass) lines.unshift("Five Pillars result stored: pass");
  else if (record.pillarPhase) lines.unshift(`Five Pillars phase stored: ${record.pillarPhase}`);
  else lines.unshift("Five Pillars result stored: not a pass");
  return lines;
}

function wasQualified(record: CarryoverPillarRecord | undefined): boolean {
  if (!record) return false;
  return (
    record.fivePillarsPass ||
    record.everOnDesk ||
    record.firstQualifiedAt !== null ||
    record.pillarPhase === "ACTIVE" ||
    record.pillarPhase === "GRACE" ||
    record.pillarPhase === "EXPIRED"
  );
}

function classificationLabel(kind: CarryoverClass): string {
  if (kind === "previously_qualified") return "Previously qualified";
  if (kind === "momentum_only") return "Momentum only";
  return "Incomplete evidence";
}

interface DraftRow {
  symbol: string;
  price: number | null;
  volume: number | null;
  previousClose: number | null;
  velocity: number | null;
  accelerationPct: number | null;
  hodDistancePct: number | null;
  sessionKind: string | null;
  events: string[];
  fromQualificationOnly: boolean;
}

function toCandidate(
  draft: DraftRow,
  pillar: CarryoverPillarRecord | undefined,
): CarryoverCandidateView | null {
  if (!isActionableScannerQuote(draft.price, draft.volume)) return null;
  const movePct = sessionMovePercent(draft.price, draft.previousClose);
  const missing: string[] = [];
  if (movePct === null) missing.push("prior regular close");
  if (draft.hodDistancePct === null && !draft.events.includes("HOD_BREAK")) {
    missing.push("HOD relationship");
  }
  if (!pillar) missing.push("Five Pillars evaluation");
  else if (pillarLines(pillar).some((line) => line.includes("not retained"))) {
    missing.push("individual pillar results");
  }
  const qualified = wasQualified(pillar);
  const hasMomentum =
    draft.events.length > 0 ||
    movePct !== null ||
    (draft.velocity !== null && draft.velocity > 0);
  const classification: CarryoverClass = qualified
    ? "previously_qualified"
    : hasMomentum
      ? "momentum_only"
      : "incomplete_evidence";

  const evaluatedAt = pillar?.providerAsOf ?? pillar?.lastQualifiedAt ?? pillar?.firstQualifiedAt ?? null;
  return {
    symbol: draft.symbol,
    classification,
    classificationLabel: classificationLabel(classification),
    price: draft.price,
    movePct,
    sessionVolume: draft.volume,
    velocity: draft.velocity,
    accelerationPct: draft.accelerationPct,
    hodLabel: hodLabel(draft.hodDistancePct, draft.events),
    sessionEvidence: draft.fromQualificationOnly
      ? "Qualification record only. End-of-session scanner snapshot was not retained."
      : sessionEvidence(draft.sessionKind, draft.events),
    floatLabel: "Float unavailable",
    catalystLabel: "Catalyst verification unavailable for the prior session",
    pillarLines: pillarLines(pillar),
    evaluatedAtLabel: formatEtClock(evaluatedAt),
    missingEvidence: missing,
    handoffs: buildRepeatMoverWorkflowHandoffs(draft.symbol),
  };
}

function volumeRank(row: CarryoverCandidateView): number {
  return row.sessionVolume !== null && row.sessionVolume > 0 ? row.sessionVolume : -1;
}

export function assembleCarryoverWatch(input: {
  sessionDate: string;
  sessionLabel: string;
  carryoverRows: readonly unknown[] | null;
  carryoverError: string | null;
  closedRows: readonly unknown[] | null;
  closedError: string | null;
  pillars: readonly unknown[] | null;
  pillarError: string | null;
}): CarryoverWatchView {
  const base = {
    sessionDate: input.sessionDate,
    sessionLabel: input.sessionLabel,
    snapshotRecordedAtLabel: null as string | null,
    historicalNotice: CARRYOVER_HISTORICAL_NOTICE,
    pillarNote: input.pillarError
      ? "Five Pillars history could not be read for this session. Stored scanner rows are shown without a recomputed pillar pass."
      : null,
  };

  const carryover = (input.carryoverRows ?? []).map(normalizeCarryoverSnapshotRow).filter((row) => row !== null);
  const closed = (input.closedRows ?? []).map(normalizeCarryoverSnapshotRow).filter((row) => row !== null);
  let sourceRows = carryover;
  let sourceNote: string | null = null;
  if (carryover.length > 0) {
    sourceNote = "Loaded from the retained prior-session snapshot.";
    base.snapshotRecordedAtLabel = latestSnapshotCapturedAtLabel(carryover);
  } else if (closed.length > 0) {
    sourceRows = closed;
    sourceNote = "Loaded from the closed-session snapshot still stored for this date.";
    base.snapshotRecordedAtLabel = latestSnapshotCapturedAtLabel(closed);
  } else if (input.carryoverError && input.closedError) {
    return {
      ...base,
      status: "unavailable",
      unavailableReason:
        "Prior-session snapshot unavailable. Historical sources radar_v22_carryover_snapshot and radar_v22_closed_snapshot could not be read.",
      sourceNote: null,
      candidates: [],
      withheldInvalidQuotes: 0,
    };
  } else if (input.carryoverError && closed.length === 0 && !input.closedError) {
    return {
      ...base,
      status: "unavailable",
      unavailableReason:
        "Prior-session snapshot unavailable. radar_v22_carryover_snapshot could not be read, and no closed-session rows remain for this date.",
      sourceNote: null,
      candidates: [],
      withheldInvalidQuotes: 0,
    };
  }

  const pillarBySymbol = new Map<string, CarryoverPillarRecord>();
  for (const raw of input.pillars ?? []) {
    const pillar = normalizeCarryoverPillar(raw);
    if (pillar) pillarBySymbol.set(pillar.symbol, pillar);
  }

  const seen = new Set<string>();
  const drafts: DraftRow[] = [];
  let withheldInvalidQuotes = 0;
  for (const row of sourceRows) {
    if (seen.has(row.symbol)) continue;
    seen.add(row.symbol);
    if (!isActionableScannerQuote(row.price, row.volume)) {
      withheldInvalidQuotes += 1;
      continue;
    }
    drafts.push({
      symbol: row.symbol,
      price: row.price,
      volume: row.volume,
      previousClose: row.previousClose,
      velocity: row.velocity,
      accelerationPct: row.accelerationPct,
      hodDistancePct: row.hodDistancePct,
      sessionKind: row.sessionKind,
      events: eventTypes(row.scannerEvents, row.primaryEvent),
      fromQualificationOnly: false,
    });
  }

  if (drafts.length === 0 && sourceRows.length === 0) {
    for (const pillar of pillarBySymbol.values()) {
      if (!isActionableScannerQuote(pillar.monitoredPrice, pillar.monitoredVolume)) continue;
      if (!wasQualified(pillar)) continue;
      drafts.push({
        symbol: pillar.symbol,
        price: pillar.monitoredPrice,
        volume: pillar.monitoredVolume,
        previousClose: null,
        velocity: null,
        accelerationPct: null,
        hodDistancePct: null,
        sessionKind: null,
        events: [],
        fromQualificationOnly: true,
      });
    }
    if (drafts.length > 0) {
      sourceNote = "Loaded from stored Five Pillars records. The end-of-session scanner snapshot was not retained.";
    }
  }

  const candidates = drafts
    .map((draft) => toCandidate(draft, pillarBySymbol.get(draft.symbol)))
    .filter((row): row is CarryoverCandidateView => row !== null)
    .sort((a, b) => volumeRank(b) - volumeRank(a) || a.symbol.localeCompare(b.symbol));

  if (candidates.length === 0 && sourceRows.length === 0 && drafts.length === 0) {
    return {
      ...base,
      status: "empty",
      unavailableReason: null,
      sourceNote,
      candidates: [],
      withheldInvalidQuotes,
    };
  }

  return {
    ...base,
    status: "ready",
    unavailableReason: null,
    sourceNote,
    candidates,
    withheldInvalidQuotes,
  };
}
