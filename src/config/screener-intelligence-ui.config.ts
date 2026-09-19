/**
 * Screener Intelligence UI V1 — presentation registry only.
 *
 * Dormant. Does not enable live ScreenerTable columns, change Discovery Rank,
 * or publish new production UI. All intelligence flags default OFF.
 */

export const SCREENER_INTELLIGENCE_UI_VERSION = "v1" as const;

export const SCREENER_INTELLIGENCE_UNAVAILABLE = "—" as const;

export type ScreenerIntelligencePriority = "P0" | "P1" | "P2" | "P3";
export type ScreenerIntelligenceRollout = "existing" | "dormant";

export const SCREENER_INTELLIGENCE_FLAG_KEYS = [
  "showDollarVolume",
  "showRvol20d",
  "showTradeQuality",
  "showFloatTurnover",
  "showShortFloat",
  "showTriggerTime",
  "showContinuation",
  "showVolPrior",
  "showCatalyst",
] as const;

export type ScreenerIntelligenceFlagKey = (typeof SCREENER_INTELLIGENCE_FLAG_KEYS)[number];

export type ScreenerIntelligenceFlags = Record<ScreenerIntelligenceFlagKey, boolean>;

/** Production defaults: new intelligence stays hidden. */
export const SCREENER_INTELLIGENCE_UI_FLAGS: ScreenerIntelligenceFlags = {
  showDollarVolume: false,
  showRvol20d: false,
  showTradeQuality: false,
  showFloatTurnover: false,
  showShortFloat: false,
  showTriggerTime: false,
  showContinuation: false,
  showVolPrior: false,
  showCatalyst: false,
};

export const SCREENER_INTELLIGENCE_COLUMN_IDS = [
  "discoveryRank",
  "symbol",
  "price",
  "move",
  "volume",
  "dollarVolume",
  "volumeRatioPrior",
  "rvol20d",
  "floatTurnover",
  "shortFloat",
  "tradeQuality",
  "catalyst",
  "triggerTime",
  "continuation",
] as const;

export type ScreenerIntelligenceColumnId = (typeof SCREENER_INTELLIGENCE_COLUMN_IDS)[number];

export interface ScreenerIntelligenceColumnDefinition {
  id: ScreenerIntelligenceColumnId;
  label: string;
  shortLabel: string;
  tooltip: string;
  valueType: "rank" | "text" | "price" | "percent" | "volume" | "dollar" | "ratio" | "badge" | "time" | "score";
  priority: ScreenerIntelligencePriority;
  desktopVisible: boolean;
  compactVisible: boolean;
  mobileVisible: boolean;
  mobileSlot: "header" | "secondary" | "intelligence" | "details";
  sortable: boolean;
  filterable: boolean;
  rollout: ScreenerIntelligenceRollout;
  flag?: ScreenerIntelligenceFlagKey;
}

export const SCREENER_INTELLIGENCE_COLUMNS: readonly ScreenerIntelligenceColumnDefinition[] = [
  {
    id: "discoveryRank",
    label: "Rank",
    shortLabel: "#",
    tooltip: "Volume-first Discovery Rank. Filtering never renumbers this value.",
    valueType: "rank",
    priority: "P0",
    desktopVisible: true,
    compactVisible: true,
    mobileVisible: true,
    mobileSlot: "header",
    sortable: false,
    filterable: false,
    rollout: "existing",
  },
  {
    id: "symbol",
    label: "Symbol",
    shortLabel: "Symbol",
    tooltip: "Ticker identity for this candidate.",
    valueType: "text",
    priority: "P0",
    desktopVisible: true,
    compactVisible: true,
    mobileVisible: true,
    mobileSlot: "header",
    sortable: true,
    filterable: false,
    rollout: "existing",
  },
  {
    id: "price",
    label: "Price",
    shortLabel: "Price",
    tooltip: "Latest validated last price from the active market-data source.",
    valueType: "price",
    priority: "P0",
    desktopVisible: true,
    compactVisible: true,
    mobileVisible: true,
    mobileSlot: "header",
    sortable: true,
    filterable: true,
    rollout: "existing",
  },
  {
    id: "move",
    label: "Move",
    shortLabel: "Move",
    tooltip: "Regular-session percent change. Not a 15s or 60s tape burst.",
    valueType: "percent",
    priority: "P0",
    desktopVisible: true,
    compactVisible: true,
    mobileVisible: true,
    mobileSlot: "header",
    sortable: true,
    filterable: true,
    rollout: "existing",
  },
  {
    id: "volume",
    label: "Volume",
    shortLabel: "Vol",
    tooltip: "Current cumulative session share volume.",
    valueType: "volume",
    priority: "P0",
    desktopVisible: true,
    compactVisible: true,
    mobileVisible: true,
    mobileSlot: "secondary",
    sortable: true,
    filterable: true,
    rollout: "existing",
  },
  {
    id: "dollarVolume",
    label: "Dollar Vol",
    shortLabel: "$Vol",
    tooltip: "Price multiplied by current session volume. Capital in motion, not share count alone.",
    valueType: "dollar",
    priority: "P1",
    desktopVisible: true,
    compactVisible: true,
    mobileVisible: true,
    mobileSlot: "secondary",
    sortable: true,
    filterable: true,
    rollout: "dormant",
    flag: "showDollarVolume",
  },
  {
    id: "volumeRatioPrior",
    label: "Vol/Prior",
    shortLabel: "Vol/Prior",
    tooltip:
      "Current cumulative session volume divided by immediately prior valid session volume. Distinct from RVOL 20D.",
    valueType: "ratio",
    priority: "P2",
    desktopVisible: true,
    compactVisible: false,
    mobileVisible: false,
    mobileSlot: "details",
    sortable: true,
    filterable: true,
    rollout: "dormant",
    flag: "showVolPrior",
  },
  {
    id: "rvol20d",
    label: "RVOL 20D",
    shortLabel: "RVOL 20D",
    tooltip:
      "Current cumulative session volume divided by average full regular-session volume of the prior 20 valid completed trading sessions. Not Vol/Prior and not time-adjusted RVOL.",
    valueType: "ratio",
    priority: "P1",
    desktopVisible: true,
    compactVisible: true,
    mobileVisible: true,
    mobileSlot: "secondary",
    sortable: true,
    filterable: true,
    rollout: "dormant",
    flag: "showRvol20d",
  },
  {
    id: "floatTurnover",
    label: "Float Turn",
    shortLabel: "Turn",
    tooltip: "Current session volume divided by public float.",
    valueType: "ratio",
    priority: "P2",
    desktopVisible: true,
    compactVisible: false,
    mobileVisible: false,
    mobileSlot: "details",
    sortable: true,
    filterable: true,
    rollout: "dormant",
    flag: "showFloatTurnover",
  },
  {
    id: "shortFloat",
    label: "Short Float",
    shortLabel: "Short %",
    tooltip:
      "Shares sold short divided by public float, as a percentage. Fundamentals data can be aging or stale and is not live tape.",
    valueType: "percent",
    priority: "P3",
    desktopVisible: true,
    compactVisible: false,
    mobileVisible: false,
    mobileSlot: "details",
    sortable: true,
    filterable: true,
    rollout: "dormant",
    flag: "showShortFloat",
  },
  {
    id: "tradeQuality",
    label: "Trade Quality",
    shortLabel: "Quality",
    tooltip:
      "Secondary 0–100 score of current trading conditions. It does not replace Discovery Rank and is omitted when coverage is incomplete.",
    valueType: "score",
    priority: "P1",
    desktopVisible: true,
    compactVisible: true,
    mobileVisible: true,
    mobileSlot: "intelligence",
    sortable: true,
    filterable: true,
    rollout: "dormant",
    flag: "showTradeQuality",
  },
  {
    id: "catalyst",
    label: "Catalyst",
    shortLabel: "Catalyst",
    tooltip: "Normalized catalyst quality. None is a known absence. Unavailable is unknown.",
    valueType: "badge",
    priority: "P2",
    desktopVisible: true,
    compactVisible: true,
    mobileVisible: true,
    mobileSlot: "intelligence",
    sortable: false,
    filterable: true,
    rollout: "dormant",
    flag: "showCatalyst",
  },
  {
    id: "triggerTime",
    label: "Trigger",
    shortLabel: "Trigger",
    tooltip: "Earliest validated first-trigger time in U.S. Eastern time. Expanded view lists each trigger type.",
    valueType: "time",
    priority: "P2",
    desktopVisible: true,
    compactVisible: true,
    mobileVisible: true,
    mobileSlot: "intelligence",
    sortable: true,
    filterable: false,
    rollout: "dormant",
    flag: "showTriggerTime",
  },
  {
    id: "continuation",
    label: "Continuation",
    shortLabel: "Cont.",
    tooltip: "Late-session / day-two continuation context. Does not replace Discovery Rank.",
    valueType: "badge",
    priority: "P3",
    desktopVisible: true,
    compactVisible: false,
    mobileVisible: false,
    mobileSlot: "details",
    sortable: false,
    filterable: false,
    rollout: "dormant",
    flag: "showContinuation",
  },
] as const;

export const SCREENER_INTELLIGENCE_TOOLTIPS: Record<
  "dollarVolume" | "volumeRatioPrior" | "rvol20d" | "floatTurnover" | "shortFloat" | "tradeQuality" | "triggerTime" | "continuation",
  string
> = {
  dollarVolume: SCREENER_INTELLIGENCE_COLUMNS.find((column) => column.id === "dollarVolume")?.tooltip ?? "",
  volumeRatioPrior: SCREENER_INTELLIGENCE_COLUMNS.find((column) => column.id === "volumeRatioPrior")?.tooltip ?? "",
  rvol20d: SCREENER_INTELLIGENCE_COLUMNS.find((column) => column.id === "rvol20d")?.tooltip ?? "",
  floatTurnover: SCREENER_INTELLIGENCE_COLUMNS.find((column) => column.id === "floatTurnover")?.tooltip ?? "",
  shortFloat: SCREENER_INTELLIGENCE_COLUMNS.find((column) => column.id === "shortFloat")?.tooltip ?? "",
  tradeQuality: SCREENER_INTELLIGENCE_COLUMNS.find((column) => column.id === "tradeQuality")?.tooltip ?? "",
  triggerTime: SCREENER_INTELLIGENCE_COLUMNS.find((column) => column.id === "triggerTime")?.tooltip ?? "",
  continuation: SCREENER_INTELLIGENCE_COLUMNS.find((column) => column.id === "continuation")?.tooltip ?? "",
};

export const TRADE_QUALITY_DISPLAY_LABELS = {
  HIGH_QUALITY: "High",
  STRONG: "Strong",
  MODERATE: "Moderate",
  WEAK: "Weak",
  LOW_QUALITY: "Low",
  INCOMPLETE: "Incomplete",
} as const;

export const CATALYST_DISPLAY_LABELS = {
  STRONG: "Strong",
  MODERATE: "Moderate",
  WEAK: "Weak",
  NONE: "None",
} as const;

export const CONTINUATION_BADGE_LABELS = {
  POWER_HOUR_MOMENTUM: "Power Hour",
  STRONG_CLOSE_NEAR_HOD: "Near HOD",
  AFTER_HOURS_CONTINUATION: "AH Cont.",
  DAY_TWO_WATCH: "Day-Two",
} as const;

export const SHORT_FLOAT_FRESHNESS_LABELS = {
  FRESH: "Fresh",
  AGING: "Aging",
  STALE: "Stale",
  UNKNOWN: "Unknown",
} as const;

export const TRIGGER_SUMMARY_LINE_LABELS = {
  firstTriggerAt: "First",
  discoveryTriggerAt: "Discovery",
  earliestVolumeTriggerAt: "Volume",
  momentumTriggerAt: "Momentum",
  hodBreakTriggerAt: "HOD Break",
  catalystTriggerAt: "Catalyst",
} as const;
