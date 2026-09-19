/**
 * Dormant Screener Intelligence presentation surface.
 *
 * Not imported by production routes, ScreenerTable, or Radar grid.
 * Future integration must opt in through explicit flags.
 */

export {
  buildMobileIntelligencePresentation,
  formatCatalystQuality,
  formatCompactDollarVolume,
  formatContinuationBadges,
  formatDiscoveryRank,
  formatRatio,
  formatShortFloat,
  formatTradeQuality,
  formatTriggerMarketTime,
  formatTriggerPresentation,
  getIntelligenceTooltip,
  isIntelligenceColumnActive,
  resolveIntelligenceFlags,
  visibleIntelligenceColumns,
} from "@/lib/screeners/presentation";
