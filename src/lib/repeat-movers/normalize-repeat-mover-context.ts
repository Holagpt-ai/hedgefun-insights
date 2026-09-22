import type { EpisodeDirection, EpisodeTier } from "@/config/security-intelligence.config";
import { EPISODE_DIRECTIONS, EPISODE_TIERS } from "@/config/security-intelligence.config";
import type { RepeatMoverCurrentContext } from "@/types/repeat-mover";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function finiteOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readDirection(value: unknown, movePct: number | null): EpisodeDirection | null {
  if (typeof value === "string") {
    const upper = value.toUpperCase();
    if ((EPISODE_DIRECTIONS as readonly string[]).includes(upper)) {
      return upper as EpisodeDirection;
    }
  }
  if (movePct === null) return null;
  if (movePct > 0) return "POSITIVE";
  if (movePct < 0) return "NEGATIVE";
  if (movePct === 0) return "MIXED";
  return null;
}

function readTier(value: unknown): EpisodeTier | null {
  if (typeof value !== "string") return null;
  const upper = value.toUpperCase();
  if ((EPISODE_TIERS as readonly string[]).includes(upper)) {
    return upper as EpisodeTier;
  }
  return null;
}

function readDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 10);
  return ISO_DATE.test(trimmed) ? trimmed : null;
}

function readSymbol(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

export type RepeatMoverContextInput = Partial<RepeatMoverCurrentContext> & {
  symbol?: string | null;
};

export function normalizeRepeatMoverCurrentContext(
  input: RepeatMoverContextInput,
): RepeatMoverCurrentContext {
  const movePct = finiteOrNull(input.movePct);
  return {
    observedSymbol: readSymbol(input.observedSymbol ?? input.symbol),
    sessionDate: readDate(input.sessionDate),
    movePct,
    volume: finiteOrNull(input.volume),
    rvol: finiteOrNull(input.rvol),
    dollarVolume: finiteOrNull(input.dollarVolume),
    direction: readDirection(input.direction, movePct),
    tier: readTier(input.tier),
    recordedAt: typeof input.recordedAt === "string" && input.recordedAt.trim().length > 0
      ? input.recordedAt.trim()
      : null,
  };
}
