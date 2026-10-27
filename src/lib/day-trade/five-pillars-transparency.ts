/**
 * Read-only Five Pillars presentation for Day Trade Radar.
 * Uses canonical scanner row fields and persisted lifecycle state — no parallel metrics.
 */

import {
  DAY_TRADE_QUALIFICATION_GRACE_MIN_MS,
  DAY_TRADE_QUALIFICATION_GRACE_REQUIRED_FAILURES,
} from "@/config/day-trade-qualification-lifecycle.config";
import type { DayTradeQualificationStateRow } from "@/lib/day-trade/qualification-lifecycle-client";
import { deskDepartureLabel } from "@/lib/day-trade/qualification-lifecycle-client";
import {
  evaluateDayTradeFreshness,
  qualifiesDayTradeFreshness,
} from "@/features/day-trade-radar-v2/day-trade-freshness";
import {
  DAY_TRADE_FLOAT_MAX_SHARES,
  DAY_TRADE_RVOL_MIN,
  evaluateDayTradeEligibility,
  evaluateDayTradeParticipation,
  qualifiesDayTradeMomentum,
} from "@/features/day-trade-radar-v2/day-trade-strategy";
import type { RadarRankedRow } from "@/features/day-trade-radar-v2/types";
import { finiteMetric } from "@/lib/screeners/screener-metric-display";
import {
  LEGACY_MOVE_MIN_PCT,
  LEGACY_PRICE_MAX,
  LEGACY_PRICE_MIN,
} from "@/lib/screeners/legacy-confirmation";
import { formatEtClock } from "@/lib/screeners/screener-trigger-time";

export type FivePillarKey = "price" | "move" | "float" | "participation" | "freshness";

export type FivePillarDisplayStatus = "PASS" | "FAIL" | "GRACE" | "MISSING";

export type QualificationLifecycleKind =
  | "on_desk"
  | "monitoring"
  | "expired"
  | "failed"
  | "awaiting_evidence";

export interface FivePillarEvidenceRow {
  key: FivePillarKey;
  label: string;
  status: FivePillarDisplayStatus;
  observed: string;
  threshold: string;
  observationAt: string | null;
}

export interface FivePillarsTransparencyView {
  pillars: FivePillarEvidenceRow[];
  lifecycle: QualificationLifecycleKind;
  lifecycleTitle: string;
  lifecycleDetail: string;
  compactSummary: string;
  momentumPass: boolean;
  freshnessPass: boolean;
  fivePillarsPass: boolean;
  providerAsOf: string | null;
  /** Persisted first qualification — not a claim of current pass. */
  firstQualifiedAt: string | null;
  lastDeskDepartureAt: string | null;
  gracePolicyNote: string;
}

export const FIVE_PILLAR_LABELS: Record<FivePillarKey, string> = {
  price: "Price band",
  move: "Day move",
  float: "Float",
  participation: "Relative volume",
  freshness: "Desk freshness",
};

const PARTICIPATION_SOURCE_LABEL: Record<string, string> = {
  rvol_5m: "5m RVOL",
  time_adjusted_rvol: "Time-adjusted RVOL",
  rvol_20d: "20D RVOL",
  volume_ratio_prior_session: "Vol vs prior session",
};

function formatPrice(n: number | null): string {
  if (n === null) return "—";
  return `$${n.toFixed(2)}`;
}

function formatPct(n: number | null): string {
  if (n === null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function formatShares(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M sh`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K sh`;
  return `${Math.trunc(n)} sh`;
}

function formatMultiplier(n: number | null): string {
  if (n === null) return "—";
  return `${n.toFixed(1)}×`;
}

function pillarPhaseFromState(
  persisted: DayTradeQualificationStateRow | null | undefined,
): "ACTIVE" | "GRACE" | "EXPIRED" | null {
  const phase = persisted?.pillar_phase?.trim().toUpperCase();
  if (phase === "ACTIVE" || phase === "GRACE" || phase === "EXPIRED") return phase;
  if (persisted?.pillar_expired_at) return "EXPIRED";
  return null;
}

function hadPriorQualification(persisted: DayTradeQualificationStateRow | null | undefined): boolean {
  return Boolean(persisted?.first_qualified_at || persisted?.ever_on_desk);
}

function mapGateToDisplay(input: {
  pass: boolean | null;
  fail: boolean;
  missing: boolean;
  pillarPhase: "ACTIVE" | "GRACE" | "EXPIRED" | null;
  priorQualified: boolean;
}): FivePillarDisplayStatus {
  if (input.missing || input.pass === null) return "MISSING";
  if (input.pass) return "PASS";
  if (input.pillarPhase === "GRACE" && input.priorQualified) return "GRACE";
  return "FAIL";
}

function participationObserved(row: RadarRankedRow): string {
  const evaluation = evaluateDayTradeParticipation(row);
  if (evaluation.pass && evaluation.winningSource && evaluation.winningValue !== null) {
    const label = PARTICIPATION_SOURCE_LABEL[evaluation.winningSource] ?? evaluation.winningSource;
    return `${formatMultiplier(evaluation.winningValue)} (${label})`;
  }
  const available = evaluation.signals.filter((s) => s.available);
  if (available.length === 0) return "—";
  const best = available[0];
  const label = PARTICIPATION_SOURCE_LABEL[best.source] ?? best.source;
  return `${formatMultiplier(best.value)} (${label})`;
}

function buildPillarRows(input: {
  row: RadarRankedRow;
  nowMs: number;
  pillarPhase: "ACTIVE" | "GRACE" | "EXPIRED" | null;
  priorQualified: boolean;
  observationAt: string | null;
}): FivePillarEvidenceRow[] {
  const eligibility = evaluateDayTradeEligibility(input.row);
  const price = finiteMetric(input.row.price);
  const move = finiteMetric(input.row.change_percent);
  const floatShares = finiteMetric(input.row.float_shares);
  const participation = evaluateDayTradeParticipation(input.row);
  const anyParticipation = participation.signals.some((s) => s.available);
  const freshnessEval = evaluateDayTradeFreshness(input.row, input.nowMs);
  const freshnessPass = qualifiesDayTradeFreshness(input.row, input.nowMs);

  const priceStatus = mapGateToDisplay({
    pass: eligibility.priceGate,
    fail: eligibility.priceGate === false,
    missing: eligibility.priceGate === null,
    pillarPhase: input.pillarPhase,
    priorQualified: input.priorQualified,
  });
  const moveStatus = mapGateToDisplay({
    pass: eligibility.moveGate,
    fail: eligibility.moveGate === false,
    missing: eligibility.moveGate === null,
    pillarPhase: input.pillarPhase,
    priorQualified: input.priorQualified,
  });

  let floatStatus: FivePillarDisplayStatus = "MISSING";
  if (eligibility.floatGate === "pass") floatStatus = "PASS";
  else if (eligibility.floatGate === "fail_high_float") {
    floatStatus =
      input.pillarPhase === "GRACE" && input.priorQualified ? "GRACE" : "FAIL";
  }

  const participationStatus = mapGateToDisplay({
    pass: participation.pass ? true : anyParticipation ? false : null,
    fail: anyParticipation && !participation.pass,
    missing: !anyParticipation,
    pillarPhase: input.pillarPhase,
    priorQualified: input.priorQualified,
  });

  const freshnessStatus = mapGateToDisplay({
    pass: freshnessPass,
    fail: !freshnessPass && freshnessEval.activityAt !== null,
    missing: freshnessEval.activityAt === null && !freshnessPass,
    pillarPhase: input.pillarPhase,
    priorQualified: input.priorQualified,
  });

  return [
    {
      key: "price",
      label: FIVE_PILLAR_LABELS.price,
      status: priceStatus,
      observed: formatPrice(price),
      threshold: `$${LEGACY_PRICE_MIN}–$${LEGACY_PRICE_MAX}`,
      observationAt: input.observationAt,
    },
    {
      key: "move",
      label: FIVE_PILLAR_LABELS.move,
      status: moveStatus,
      observed: formatPct(move),
      threshold: `≥ +${LEGACY_MOVE_MIN_PCT}%`,
      observationAt: input.observationAt,
    },
    {
      key: "float",
      label: FIVE_PILLAR_LABELS.float,
      status: floatStatus,
      observed: formatShares(floatShares),
      threshold: `≤ ${(DAY_TRADE_FLOAT_MAX_SHARES / 1_000_000).toFixed(0)}M sh`,
      observationAt: input.observationAt,
    },
    {
      key: "participation",
      label: FIVE_PILLAR_LABELS.participation,
      status: participationStatus,
      observed: participationObserved(input.row),
      threshold: `≥ ${DAY_TRADE_RVOL_MIN}× (any trusted RVOL signal)`,
      observationAt: input.observationAt,
    },
    {
      key: "freshness",
      label: FIVE_PILLAR_LABELS.freshness,
      status: freshnessStatus,
      observed: freshnessEval.activityAt
        ? `${freshnessEval.state} · ${formatEtClock(freshnessEval.activityAt) ?? freshnessEval.activityAt}`
        : freshnessEval.state,
      threshold: "Current participation eligible for main desk",
      observationAt: freshnessEval.activityAt ?? input.observationAt,
    },
  ];
}

function resolveLifecycle(input: {
  row: RadarRankedRow;
  nowMs: number;
  onAuthoritativeDesk: boolean;
  persisted: DayTradeQualificationStateRow | null | undefined;
  momentumPass: boolean;
  freshnessPass: boolean;
  awaitingEvidence: boolean;
}): Pick<FivePillarsTransparencyView, "lifecycle" | "lifecycleTitle" | "lifecycleDetail"> {
  const phase = pillarPhaseFromState(input.persisted);
  const everOnDesk = input.persisted?.ever_on_desk === true;
  const onDeskPersisted = input.persisted?.currently_on_desk === true;
  const monitoring =
    input.persisted?.monitoring_eligible === true &&
    !input.onAuthoritativeDesk &&
    !onDeskPersisted;

  if (input.awaitingEvidence) {
    return {
      lifecycle: "awaiting_evidence",
      lifecycleTitle: "Awaiting sufficient evidence",
      lifecycleDetail:
        "Scanner observation is missing price, move, or relative volume needed to evaluate Five Pillars.",
    };
  }

  if (phase === "EXPIRED" || input.persisted?.pillar_expired_at) {
    const expiredAt = formatEtClock(input.persisted?.pillar_expired_at ?? null);
    return {
      lifecycle: "expired",
      lifecycleTitle: "Qualification expired",
      lifecycleDetail: expiredAt
        ? `Five Pillars expired at ${expiredAt} ET. A prior pass is not a current pass.`
        : "Five Pillars expired for this session. A prior pass is not a current pass.",
    };
  }

  if (input.onAuthoritativeDesk && input.momentumPass && input.freshnessPass) {
    const entered = formatEtClock(input.persisted?.first_desk_at ?? input.persisted?.first_qualified_at);
    return {
      lifecycle: "on_desk",
      lifecycleTitle: "Currently qualified · on desk",
      lifecycleDetail: entered
        ? `On the authoritative Top-10 desk · first desk entry ${entered} ET.`
        : "On the authoritative Top-10 desk with current Five Pillars and freshness pass.",
    };
  }

  if (monitoring || (everOnDesk && !input.onAuthoritativeDesk)) {
    const departure = deskDepartureLabel(input.persisted?.last_desk_departure_reason ?? null);
    const left = formatEtClock(input.persisted?.last_desk_departure_at ?? null);
    const grace =
      phase === "GRACE"
        ? ` Five Pillars in grace (${DAY_TRADE_QUALIFICATION_GRACE_REQUIRED_FAILURES} failures ≥ ${Math.round(DAY_TRADE_QUALIFICATION_GRACE_MIN_MS / 1000)}s apart before expiration).`
        : "";
    return {
      lifecycle: "monitoring",
      lifecycleTitle: "Previously qualified · monitoring",
      lifecycleDetail: [
        left ? `Left desk ${left} ET (${departure}).` : departure,
        "Off-desk monitoring uses the same scanner observation fields as the main board.",
        grace,
      ]
        .filter(Boolean)
        .join(" "),
    };
  }

  if (!input.momentumPass) {
    return {
      lifecycle: "failed",
      lifecycleTitle: "Failed qualification",
      lifecycleDetail: "Does not meet current Five Pillars momentum gates on the latest scanner observation.",
    };
  }

  if (input.momentumPass && !input.freshnessPass) {
    return {
      lifecycle: "failed",
      lifecycleTitle: "Failed desk freshness",
      lifecycleDetail:
        "Five Pillars momentum passes, but desk freshness rejects main-desk eligibility on the latest observation.",
    };
  }

  return {
    lifecycle: "failed",
    lifecycleTitle: "Not on desk",
    lifecycleDetail: "Passes gates but is not on the authoritative Top-10 desk for this refresh.",
  };
}

function awaitingEvidence(row: RadarRankedRow): boolean {
  const eligibility = evaluateDayTradeEligibility(row);
  const participation = evaluateDayTradeParticipation(row);
  const anyParticipation = participation.signals.some((s) => s.available);
  return (
    eligibility.priceGate === null ||
    eligibility.moveGate === null ||
    !anyParticipation
  );
}

function countPassStatuses(pillars: FivePillarEvidenceRow[]): number {
  return pillars.filter((p) => p.status === "PASS").length;
}

export function buildFivePillarsTransparencyView(input: {
  row: RadarRankedRow;
  nowMs: number;
  onAuthoritativeDesk?: boolean;
  persisted?: DayTradeQualificationStateRow | null;
}): FivePillarsTransparencyView {
  const persisted = input.persisted ?? null;
  const pillarPhase = pillarPhaseFromState(persisted);
  const priorQualified = hadPriorQualification(persisted);
  const observationAt = input.row.provider_as_of ?? persisted?.provider_as_of ?? null;
  const momentumPass = qualifiesDayTradeMomentum(input.row);
  const freshnessPass = qualifiesDayTradeFreshness(input.row, input.nowMs);
  const fivePillarsPass = momentumPass && freshnessPass;
  const missing = awaitingEvidence(input.row);

  const pillars = buildPillarRows({
    row: input.row,
    nowMs: input.nowMs,
    pillarPhase,
    priorQualified,
    observationAt,
  });

  const lifecycle = resolveLifecycle({
    row: input.row,
    nowMs: input.nowMs,
    onAuthoritativeDesk: input.onAuthoritativeDesk === true,
    persisted,
    momentumPass,
    freshnessPass,
    awaitingEvidence: missing,
  });

  const passCount = countPassStatuses(pillars);
  const historicalOnly =
    lifecycle.lifecycle === "expired" ||
    (lifecycle.lifecycle === "monitoring" && pillarPhase !== "ACTIVE" && !fivePillarsPass);

  let compactSummary = `${passCount}/5 pillars · ${lifecycle.lifecycleTitle}`;
  if (historicalOnly && persisted?.five_pillars_pass) {
    compactSummary = `${passCount}/5 pillars now · prior stored pass (not current)`;
  }

  return {
    pillars,
    ...lifecycle,
    compactSummary,
    momentumPass,
    freshnessPass,
    fivePillarsPass,
    providerAsOf: observationAt,
    firstQualifiedAt: persisted?.first_qualified_at ?? null,
    lastDeskDepartureAt: persisted?.last_desk_departure_at ?? null,
    gracePolicyNote: `Grace policy: ${DAY_TRADE_QUALIFICATION_GRACE_REQUIRED_FAILURES} verified pillar failures at least ${Math.round(DAY_TRADE_QUALIFICATION_GRACE_MIN_MS / 60_000)} minute apart before expiration.`,
  };
}
