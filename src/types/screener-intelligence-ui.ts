import type { ContinuationCategory } from "@/config/continuation.config";
import type {
  ScreenerIntelligenceColumnId,
  ScreenerIntelligenceFlags,
  ScreenerIntelligencePriority,
} from "@/config/screener-intelligence-ui.config";
import type { ShortFloatFreshnessState, ShortFloatQualityState } from "@/config/short-float.config";
import type { TradeQualityCatalystQuality, TradeQualityLabel } from "@/config/trade-quality.config";
import type { TriggerSummary } from "@/types/trigger-time";

export type {
  ScreenerIntelligenceColumnId,
  ScreenerIntelligenceFlags,
  ScreenerIntelligencePriority,
};

export interface ScreenerIntelligenceDisplayInput {
  discoveryRank?: number | null;
  symbol?: string | null;
  price?: number | null;
  movePct?: number | null;
  volume?: number | null;
  dollarVolume?: number | null;
  volumeRatioPrior?: number | null;
  rvol20d?: number | null;
  floatTurnover?: number | null;
  shortFloatPct?: number | null;
  shortFloatFreshness?: ShortFloatFreshnessState | null;
  shortFloatQuality?: ShortFloatQualityState | null;
  shortFloatSourceAsOf?: string | null;
  tradeQualityScore?: number | null;
  tradeQualityLabel?: TradeQualityLabel | null;
  tradeQualityCoveragePct?: number | null;
  catalystQuality?: TradeQualityCatalystQuality | null;
  triggerSummary?: TriggerSummary | null;
  continuationCategories?: readonly ContinuationCategory[] | null;
}

export interface TradeQualityPresentation {
  compact: string;
  label: string;
  coverage: string | null;
  incomplete: boolean;
}

export interface ShortFloatPresentation {
  compact: string;
  detail: string | null;
  freshness: string | null;
  stale: boolean;
  discrepancy: boolean;
}

export interface ContinuationBadgePresentation {
  compact: string;
  badges: string[];
  extraCount: number;
}

export interface TriggerPresentation {
  compact: string;
  lines: Array<{ label: string; value: string }>;
}

export interface MobileIntelligenceRow {
  slot: "header" | "secondary" | "intelligence" | "details";
  label: string;
  value: string;
  columnId: ScreenerIntelligenceColumnId;
}

export interface MobileIntelligencePresentation {
  header: {
    rank: string;
    symbol: string;
    price: string;
    move: string;
  };
  secondary: MobileIntelligenceRow[];
  intelligence: MobileIntelligenceRow[];
  details: MobileIntelligenceRow[];
}
