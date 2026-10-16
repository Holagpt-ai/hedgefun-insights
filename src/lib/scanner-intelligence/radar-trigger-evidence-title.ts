/**
 * User-visible Radar trigger column titles — promotion, trigger clock, participation evidence.
 */

import type { RadarRankedRow } from "@/features/day-trade-radar-v2/types";
import {
  formatPromotionReasonTitle,
  parsePromotionReason,
} from "@/lib/radar/promotion-reason-display";
import {
  evaluateScreenerTriggerTime,
  scannerTimeEvidenceTitle,
  triggerTypeLabel,
} from "@/lib/screeners/screener-trigger-time";
import { buildParticipationTriggerEvidence } from "@/lib/scanner-intelligence/participation-trigger-evidence";
import type { MarketFeedTelemetry } from "@/lib/market-feed/telemetry";
import type { ScreenerUiStatus } from "@/lib/screeners/contract";

export function buildRadarTriggerDisplayTitle(input: {
  row: RadarRankedRow;
  nowMs: number;
  /** Panel/mobile paths include market-event vs publication provenance. */
  includeMarketEventEvidence?: boolean;
  marketEventAt?: string | null;
  publishedAt?: string | null;
  marketFeed?: MarketFeedTelemetry | null;
  status?: ScreenerUiStatus;
}): { title: string; triggeredAt: string | null | undefined } {
  const view = evaluateScreenerTriggerTime(input.row);
  const triggeredAt = view.primary?.triggeredAt ?? input.marketEventAt ?? null;
  const promotionTitle = formatPromotionReasonTitle(parsePromotionReason(input.row.promotion_reason));
  const baseTitle = view.primary
    ? `${triggerTypeLabel(view.primary.triggerType, view.primary.eventKey)} trigger`
    : "Triggered unavailable";

  if (!view.primary && !promotionTitle) {
    return { title: baseTitle, triggeredAt: null };
  }

  const marketTitle = input.includeMarketEventEvidence
    ? scannerTimeEvidenceTitle({
        marketEventAt: input.marketEventAt ?? triggeredAt,
        publishedAt: input.publishedAt ?? input.row.updated_at,
      })
    : null;

  const participation = buildParticipationTriggerEvidence(input.row, input.nowMs, {
    marketFeed: input.marketFeed,
    status: input.status,
  });

  const parts = [
    marketTitle,
    promotionTitle,
    baseTitle,
    participation.headline,
    participation.detail,
  ].filter((part) => part && part.trim());

  return { title: parts.join(". "), triggeredAt };
}
