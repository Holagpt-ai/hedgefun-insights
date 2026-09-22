import type {
  ForwardOutcomeAvailabilityState,
  ForwardOutcomeSessionHorizon,
} from "@/config/forward-outcomes.config";
import type { ForwardOutcomeHorizon } from "@/config/security-intelligence.config";
import type { EpisodeDirection } from "@/config/security-intelligence.config";
import type { SecurityId } from "@/types/security-identity";

export interface EpisodeReferencePrices {
  referenceClose: number | null;
  referenceHigh: number | null;
  referenceLow: number | null;
}

export interface ComputedForwardOutcomeFacts {
  horizon: ForwardOutcomeSessionHorizon;
  availabilityState: ForwardOutcomeAvailabilityState;
  dataAvailable: boolean;
  episodeSessionDate: string | null;
  horizonSessionDate: string | null;
  referencePrice: number | null;
  referenceTimestamp: string | null;
  outcomePrice: number | null;
  returnPct: number | null;
  openToCloseReturnPct: number | null;
  gapPct: number | null;
  maxGainPct: number | null;
  maxDrawdownPct: number | null;
  highPrice: number | null;
  lowPrice: number | null;
  sessionVolume: number | null;
  rvol: number | null;
  /** Horizon session move vs prior close (matches comparable next-session semantics). */
  horizonSessionMovePct: number | null;
  closePosition: number | null;
  closedAboveEpisodeClose: boolean | null;
  closedBelowEpisodeClose: boolean | null;
  exceededEpisodeHigh: boolean | null;
  brokeEpisodeLow: boolean | null;
}

export interface PersistedForwardOutcomeRow extends ComputedForwardOutcomeFacts {
  episodeId: string;
  securityId: SecurityId;
  horizonKey: ForwardOutcomeHorizon;
}

/** Canonical +1 session observation (reuses continuation threshold semantics). */
export interface NextSessionContinuationObservation {
  nextSessionAvailable: boolean;
  nextSessionReturnPct: number | null;
  nextSessionHighExcursionPct: number | null;
  nextSessionLowExcursionPct: number | null;
  nextSessionClosePosition: number | null;
  nextSessionVolume: number | null;
  nextSessionRvol: number | null;
  nextSessionContinuation: boolean | null;
  episodeDirection: EpisodeDirection | null;
}

export interface RepeatMoverForwardOutcomeEvidence {
  closeToCloseReturnPct: Partial<Record<ForwardOutcomeSessionHorizon, number | null>>;
  highExcursionPct: Partial<Record<ForwardOutcomeSessionHorizon, number | null>>;
  lowExcursionPct: Partial<Record<ForwardOutcomeSessionHorizon, number | null>>;
  closePosition: Partial<Record<ForwardOutcomeSessionHorizon, number | null>>;
  nextSession: NextSessionContinuationObservation | null;
}
