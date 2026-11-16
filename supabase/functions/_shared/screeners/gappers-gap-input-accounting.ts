/**
 * Shared Gappers gap-input accounting (volume-active → calculable / structural /
 * split-scale / unresolved). Used by evidence builders and ISS-034 replay probes.
 */

/** Capped diagnostic symbol samples (matches NHL / Gappers abort evidence). */
export const GAPPERS_DIAGNOSTIC_SYMBOL_CAP = 20;
import {
  currentSessionOpen,
  extendedQuoteSemanticsForTicker,
  extendedSessionLastPrice,
  gapPercentForTabContext,
  gapSuppressedByCloseVersusPriorWithoutOpen,
  gapSuppressedOnlyBySplitScaleGuard,
  normalizeSymbol,
  previousRegularClose,
  regularClose,
  type PolygonTicker,
  type TabSelectionOpts,
} from "./selection.ts";
import {
  sessionQualificationVolume,
  type SessionVolumeCache,
  type SessionVolumeContext,
} from "./session-volume.ts";

export type GappersGapInputBucket =
  | "not_volume_active"
  | "calculable"
  | "no_prior_session"
  | "split_scale_suppressed"
  | "unresolved";

export type GappersGapInputRejectReason =
  | "observation_session_unresolved"
  | "missing_gap_reference"
  | "missing_prior_close"
  | "gap_blocked_non_split"
  | "unknown";

export type GappersGapInputReplayOpts = {
  extendedSession: boolean;
  observationSessionFields?: boolean;
  nowMs?: number;
  cache?: SessionVolumeCache;
  /** Production replay only — compare PR #260 helper; not used in publish path. */
  useCloseVersusPriorWithoutOpenHelper?: boolean;
  isStructurallyNoPriorSession?: (t: PolygonTicker) => boolean;
};

export type GappersGapInputClassification = {
  bucket: GappersGapInputBucket;
  symbol: string | null;
  rejectReason?: GappersGapInputRejectReason;
  rejectDetail?: GappersGapInputPrerequisiteFlags;
};

export type GappersGapInputPrerequisiteFlags = {
  has_positive_day_o: boolean;
  has_positive_day_c: boolean;
  has_positive_prevDay_c: boolean;
  extended_quote_semantics: boolean | null;
};

export type GappersGapInputUnresolvedRow = {
  symbol: string;
  rejectReason: GappersGapInputRejectReason;
  rejectDetail: GappersGapInputPrerequisiteFlags;
};

export type GappersGapInputAccounting = {
  volume_positive_count: number;
  gap_calculable_count: number;
  no_prior_session_count: number;
  split_scale_suppressed_count: number;
  unresolved_gap_input_count: number;
  close_versus_prior_helper_matches: number;
  unresolved: GappersGapInputUnresolvedRow[];
};

function prerequisiteFlags(
  t: PolygonTicker,
  tabGapOpts: TabSelectionOpts,
): GappersGapInputPrerequisiteFlags {
  const dayO = currentSessionOpen(t, false);
  const dayC = regularClose(t);
  const prevC = previousRegularClose(t);
  return {
    has_positive_day_o: dayO !== null && dayO > 0,
    has_positive_day_c: dayC !== null && dayC > 0,
    has_positive_prevDay_c: prevC !== null && prevC > 0,
    extended_quote_semantics: extendedQuoteSemanticsForTicker(t, tabGapOpts),
  };
}

export function diagnoseGappersGapInputRejection(
  t: PolygonTicker,
  tabGapOpts: TabSelectionOpts,
): GappersGapInputRejectReason {
  if (extendedQuoteSemanticsForTicker(t, tabGapOpts) === null) {
    return "observation_session_unresolved";
  }
  const prevClose = previousRegularClose(t);
  if (prevClose === null || !(prevClose > 0)) {
    return "missing_prior_close";
  }
  const ext = extendedQuoteSemanticsForTicker(t, tabGapOpts);
  const reference = ext
    ? extendedSessionLastPrice(t)
    : currentSessionOpen(t, false);
  if (reference === null || !(reference > 0)) {
    return "missing_gap_reference";
  }
  const regular = regularClose(t);
  if (regular !== null && regular > 0) {
    return "gap_blocked_non_split";
  }
  return "unknown";
}

export function classifyGappersGapInput(
  t: PolygonTicker,
  volumeCtx: SessionVolumeContext,
  opts: GappersGapInputReplayOpts,
): GappersGapInputClassification {
  if (sessionQualificationVolume(t, volumeCtx) === null) {
    return { bucket: "not_volume_active", symbol: null };
  }
  const sym = normalizeSymbol(t?.ticker);
  const tabGapOpts: TabSelectionOpts = {
    extendedSession: opts.extendedSession,
    observationSessionFields: opts.observationSessionFields,
    nowMs: opts.nowMs,
  };

  if (gapPercentForTabContext(t, tabGapOpts) !== null) {
    return { bucket: "calculable", symbol: sym };
  }
  if (opts.isStructurallyNoPriorSession?.(t)) {
    return { bucket: "no_prior_session", symbol: sym };
  }
  if (gapSuppressedOnlyBySplitScaleGuard(t, tabGapOpts)) {
    return { bucket: "split_scale_suppressed", symbol: sym };
  }
  if (
    opts.useCloseVersusPriorWithoutOpenHelper &&
    gapSuppressedByCloseVersusPriorWithoutOpen(t, tabGapOpts)
  ) {
    return { bucket: "split_scale_suppressed", symbol: sym };
  }
  const rejectDetail = prerequisiteFlags(t, tabGapOpts);
  return {
    bucket: "unresolved",
    symbol: sym,
    rejectReason: diagnoseGappersGapInputRejection(t, tabGapOpts),
    rejectDetail,
  };
}

export function replayGappersGapInputAccounting(
  universe: readonly PolygonTicker[],
  opts: GappersGapInputReplayOpts,
): GappersGapInputAccounting {
  const volumeCtx: SessionVolumeContext = {
    extendedSession: opts.extendedSession,
    observationSessionVolume: opts.observationSessionFields,
    nowMs: opts.nowMs,
    cache: opts.cache,
  };
  const out: GappersGapInputAccounting = {
    volume_positive_count: 0,
    gap_calculable_count: 0,
    no_prior_session_count: 0,
    split_scale_suppressed_count: 0,
    unresolved_gap_input_count: 0,
    close_versus_prior_helper_matches: 0,
    unresolved: [],
  };
  const tabGapOpts: TabSelectionOpts = {
    extendedSession: opts.extendedSession,
    observationSessionFields: opts.observationSessionFields,
    nowMs: opts.nowMs,
  };

  for (const t of universe) {
    if (gapSuppressedByCloseVersusPriorWithoutOpen(t, tabGapOpts)) {
      out.close_versus_prior_helper_matches += 1;
    }
    const cls = classifyGappersGapInput(t, volumeCtx, opts);
    switch (cls.bucket) {
      case "calculable":
        out.gap_calculable_count += 1;
        out.volume_positive_count += 1;
        break;
      case "no_prior_session":
        out.no_prior_session_count += 1;
        out.volume_positive_count += 1;
        break;
      case "split_scale_suppressed":
        out.split_scale_suppressed_count += 1;
        out.volume_positive_count += 1;
        break;
      case "unresolved":
        out.unresolved_gap_input_count += 1;
        out.volume_positive_count += 1;
        if (cls.symbol && out.unresolved.length < GAPPERS_DIAGNOSTIC_SYMBOL_CAP) {
          out.unresolved.push({
            symbol: cls.symbol,
            rejectReason: cls.rejectReason ?? "unknown",
            rejectDetail: cls.rejectDetail ?? prerequisiteFlags(t, tabGapOpts),
          });
        }
        break;
      default:
        break;
    }
  }
  return out;
}

export type GappersGapInputCounterSink = {
  volume_positive_count: number;
  gap_calculable_count: number;
  no_prior_session_count: number;
  split_scale_suppressed_count: number;
  unresolved_gap_input_count: number;
  unresolvedGapSymbols?: string[];
};

export function applyGappersGapInputToCounters(
  counters: GappersGapInputCounterSink,
  cls: GappersGapInputClassification,
): void {
  switch (cls.bucket) {
    case "calculable":
      counters.volume_positive_count += 1;
      counters.gap_calculable_count += 1;
      break;
    case "no_prior_session":
      counters.volume_positive_count += 1;
      counters.no_prior_session_count += 1;
      break;
    case "split_scale_suppressed":
      counters.volume_positive_count += 1;
      counters.split_scale_suppressed_count += 1;
      break;
    case "unresolved": {
      counters.volume_positive_count += 1;
      counters.unresolved_gap_input_count += 1;
      if (
        cls.symbol &&
        counters.unresolvedGapSymbols &&
        counters.unresolvedGapSymbols.length < GAPPERS_DIAGNOSTIC_SYMBOL_CAP
      ) {
        counters.unresolvedGapSymbols.push(cls.symbol);
      }
      break;
    }
    default:
      break;
  }
}

export function compareGappersGapInputAccounting(
  universe: readonly PolygonTicker[],
  opts: Omit<GappersGapInputReplayOpts, "useCloseVersusPriorWithoutOpenHelper">,
): { baseline: GappersGapInputAccounting; withHelper: GappersGapInputAccounting } {
  return {
    baseline: replayGappersGapInputAccounting(universe, {
      ...opts,
      useCloseVersusPriorWithoutOpenHelper: false,
    }),
    withHelper: replayGappersGapInputAccounting(universe, {
      ...opts,
      useCloseVersusPriorWithoutOpenHelper: true,
    }),
  };
}