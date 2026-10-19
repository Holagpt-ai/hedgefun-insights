import {
  currentMoverIdentity,
  toMoverListRow,
  type CanonicalMover,
} from "./movers-integrity";
import { observationMsFromIso } from "./movers-observation";
import { TRACKED_GAINERS_LOSERS_UNIVERSE_DETAIL, type MoversListProvenance } from "./movers-provenance";
import { PUBLIC_MARKET_DATA_DELAY_DISCLOSURE } from "@/lib/price-utils";
import {
  MARKET_PULSE_DEFAULT_CONFIG,
  type MarketPulseConfig,
} from "./market-pulse-config";
import type {
  MarketPulseDirection,
  MarketPulseIntelligenceRecord,
  MarketPulseSessionEvidence,
} from "./market-pulse-contract";

export interface MarketPulseSelectInput {
  gainers: CanonicalMover[];
  losers: CanonicalMover[];
  provenance: MoversListProvenance;
  nowMs?: number;
  config?: Partial<MarketPulseConfig>;
}

function verifiedVolume(volume: number | null | undefined): number | null {
  if (volume === null || volume === undefined || !Number.isFinite(volume) || volume < 0) {
    return null;
  }
  return volume;
}

function movementLabel(absPct: number, config: MarketPulseConfig): string {
  if (absPct >= config.sharpAbsChangePercent) return "Sharp move";
  if (absPct >= config.notableAbsChangePercent) return "Notable move";
  return "Move";
}

function directionLabel(direction: MarketPulseDirection, label: string): string {
  return direction === "up" ? `${label} · upward` : `${label} · downward`;
}

function sessionEvidenceFromProvenance(provenance: MoversListProvenance): MarketPulseSessionEvidence {
  if (provenance.freshness === "prior_session") return "prior_session_historical";
  if (provenance.freshness === "mixed") return "mixed_evidence";
  if (provenance.sessionDateMode === "partially_unverified") return "partially_unverified";
  if (provenance.freshness === "unverified") return "unverified";
  if (provenance.freshness === "delayed_snapshot") return "delayed_snapshot";
  return "current_session";
}

function qualifies(m: CanonicalMover, config: MarketPulseConfig): boolean {
  if (!m.valid || !m.symbol || m.change_percent === null) return false;
  const absPct = Math.abs(m.change_percent);
  const vol = verifiedVolume(m.volume);
  if (absPct < config.minAbsChangePercent) return false;
  if (absPct >= config.sharpAbsChangePercent) return true;
  if (vol !== null && vol >= config.minVerifiedVolume) return true;
  return absPct >= config.notableAbsChangePercent && vol !== null;
}

function scoreMover(m: CanonicalMover): number {
  const vol = verifiedVolume(m.volume) ?? -1;
  const absPct = Math.abs(m.change_percent ?? 0);
  return vol * 1_000 + absPct;
}

function toRecord(
  m: CanonicalMover,
  direction: MarketPulseDirection,
  sessionEvidence: MarketPulseSessionEvidence,
  config: MarketPulseConfig,
  nowMs: number,
): MarketPulseIntelligenceRecord | null {
  const row = toMoverListRow(m);
  if (!row || !m.symbol) return null;
  const absPct = Math.abs(row.changePercent);
  const obsMs = observationMsFromIso(m.provider_as_of);
  return {
    symbol: m.symbol,
    name: row.name,
    direction,
    changePercent: row.changePercent,
    price: row.price,
    volume: row.volume,
    movementLabel: directionLabel(direction, movementLabel(absPct, config)),
    observationLine: row.priceObservationLine,
    observationTimeUnavailable: row.priceObservationTimeUnavailable,
    sessionEvidence,
    eventIdentity: currentMoverIdentity(m) ?? `${m.symbol}|${m.session ?? "_"}|${m.session_date ?? "_"}`,
    stockDetailPath: `/stocks/${m.symbol.toLowerCase()}`,
    movementContext: "verified_movement_unexplained",
    verifiedCatalyst: null,
    relatedHeadline: null,
    catalystEvidenceUrl: null,
    catalystEvidenceAt: null,
    aiExplanationText: null,
    aiVerificationState: "disabled",
    observationFreshnessMs: obsMs !== null ? nowMs - obsMs : null,
  };
}

export function selectMarketPulseItems(input: MarketPulseSelectInput): MarketPulseIntelligenceRecord[] {
  const config = { ...MARKET_PULSE_DEFAULT_CONFIG, ...input.config };
  const nowMs = input.nowMs ?? Date.now();
  const sessionEvidence = sessionEvidenceFromProvenance(input.provenance);
  const candidates: Array<{ mover: CanonicalMover; direction: MarketPulseDirection; score: number }> = [];

  for (const m of input.gainers) {
    if (!qualifies(m, config)) continue;
    candidates.push({ mover: m, direction: "up", score: scoreMover(m) });
  }
  for (const m of input.losers) {
    if (!qualifies(m, config)) continue;
    if ((m.change_percent ?? 0) >= 0) continue;
    candidates.push({ mover: m, direction: "down", score: scoreMover(m) });
  }

  candidates.sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const items: MarketPulseIntelligenceRecord[] = [];

  for (const { mover, direction } of candidates) {
    const identity = currentMoverIdentity(mover);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    const record = toRecord(mover, direction, sessionEvidence, config, nowMs);
    if (record) items.push(record);
    if (items.length >= config.maxItems) break;
  }

  return items;
}

export function marketPulseUniverseDisclosure(): string {
  return `Significant moves are selected from validated provider top gainers and losers snapshots — not the entire market. ${TRACKED_GAINERS_LOSERS_UNIVERSE_DETAIL}`;
}

export function marketPulseDelayDisclosure(): string {
  return PUBLIC_MARKET_DATA_DELAY_DISCLOSURE;
}
