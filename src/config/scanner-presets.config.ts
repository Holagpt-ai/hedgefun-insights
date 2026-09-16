/**
 * Trader Lens price presets.
 *
 * These filter the already-promoted Radar candidate universe after
 * volume-first ranking. They never change Radar discovery or rank numbers.
 */

export const TRADER_LENS_PRESET_IDS = [
  "all_movers",
  "momentum_2_20",
  "band_1_10",
  "band_5_20",
  "band_10_50",
  "custom",
] as const;

export type TraderLensPresetId = (typeof TRADER_LENS_PRESET_IDS)[number];

export interface TraderLensPreset {
  id: TraderLensPresetId;
  label: string;
  /** Inclusive lower bound. Null means no minimum. */
  min: number | null;
  /** Inclusive upper bound. Null means no maximum. */
  max: number | null;
}

export const TRADER_LENS_PRESETS: readonly TraderLensPreset[] = [
  { id: "all_movers", label: "All Movers", min: null, max: null },
  { id: "momentum_2_20", label: "$2–$20 Momentum", min: 2, max: 20 },
  { id: "band_1_10", label: "$1–$10", min: 1, max: 10 },
  { id: "band_5_20", label: "$5–$20", min: 5, max: 20 },
  { id: "band_10_50", label: "$10–$50", min: 10, max: 50 },
  { id: "custom", label: "Custom", min: null, max: null },
] as const;

export const DEFAULT_TRADER_LENS_PRESET_ID: TraderLensPresetId = "all_movers";

const PRESET_BY_ID: ReadonlyMap<TraderLensPresetId, TraderLensPreset> = new Map(
  TRADER_LENS_PRESETS.map((preset) => [preset.id, preset]),
);

export function getTraderLensPreset(id: string): TraderLensPreset | undefined {
  return PRESET_BY_ID.get(id as TraderLensPresetId);
}

export function isTraderLensPresetId(value: unknown): value is TraderLensPresetId {
  return typeof value === "string" && PRESET_BY_ID.has(value as TraderLensPresetId);
}

export interface TraderLensPriceBounds {
  min: number | null;
  max: number | null;
}

export function resolveTraderLensBounds(
  presetId: TraderLensPresetId,
  customMin: number | null,
  customMax: number | null,
): TraderLensPriceBounds {
  if (presetId === "all_movers") return { min: null, max: null };
  if (presetId === "custom") return { min: customMin, max: customMax };
  const preset = getTraderLensPreset(presetId);
  return { min: preset?.min ?? null, max: preset?.max ?? null };
}

/** Parse a user-entered price. Invalid / empty / negative → null (no bound). */
export function parseTraderLensPriceInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}
