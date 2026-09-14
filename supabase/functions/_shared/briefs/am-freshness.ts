/**
 * AM Intelligence Brief V2 freshness windows and supersession policy.
 * Deterministic ET wall-clock rules — no page-driven generation.
 */

export type AmGenerationWindow = "early" | "mid" | "final_preopen";

export type AmBriefFreshnessState = "current" | "aging" | "stale" | "expired" | "unavailable";

export const AM_GENERATION_WINDOWS: Readonly<
  Record<AmGenerationWindow, { id: AmGenerationWindow; startMin: number; endMin: number; label: string }>
> = {
  early: { id: "early", startMin: 4 * 60, endMin: 4 * 60 + 30, label: "Early pre-market" },
  mid: { id: "mid", startMin: 7 * 60, endMin: 8 * 60, label: "Mid pre-market" },
  final_preopen: { id: "final_preopen", startMin: 8 * 60 + 30, endMin: 8 * 60 + 50, label: "Final pre-open" },
};

export const AM_WINDOW_ORDER: readonly AmGenerationWindow[] = ["early", "mid", "final_preopen"];

/** Minutes before the next window when an on-window brief becomes aging. */
export const AM_BRIEF_AGING_LEAD_MINUTES = 30;

/** Matches client AM brief expiry (noon ET). */
export const AM_BRIEF_EXPIRE_MINUTES = 12 * 60;

export function windowRank(w: AmGenerationWindow): number {
  return AM_WINDOW_ORDER.indexOf(w);
}

export function readSnapshotGenerationWindow(snapshot: unknown): AmGenerationWindow | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const raw = (snapshot as Record<string, unknown>).generation_window;
  if (raw === "early" || raw === "mid" || raw === "final_preopen") return raw;
  return null;
}

/** Active controlled-generation window, if any. */
export function isInsideGenerationWindow(minutesEt: number): AmGenerationWindow | null {
  for (const w of AM_WINDOW_ORDER) {
    const def = AM_GENERATION_WINDOWS[w];
    if (minutesEt >= def.startMin && minutesEt <= def.endMin) return w;
  }
  return null;
}

/** Highest window whose start time has passed during the pre-open session. */
export function expectedGenerationWindow(minutesEt: number): AmGenerationWindow | null {
  if (minutesEt < AM_GENERATION_WINDOWS.early.startMin) return null;
  if (minutesEt < AM_GENERATION_WINDOWS.mid.startMin) return "early";
  if (minutesEt < AM_GENERATION_WINDOWS.final_preopen.startMin) return "mid";
  return "final_preopen";
}

export function etMinutesFromParts(hour: number, minute: number): number {
  const safeMinute = Number.isFinite(minute) ? minute : 0;
  const safeHour = Number.isFinite(hour) ? hour : 0;
  return safeHour * 60 + safeMinute;
}

export function etMinutesFromIso(iso: string): number | null {
  if (!iso || !Number.isFinite(Date.parse(iso))) return null;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hourRaw = parseInt(get("hour"), 10);
  const hour = hourRaw === 24 ? 0 : hourRaw;
  const minute = parseInt(get("minute"), 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return etMinutesFromParts(hour, minute);
}

export function classifyBriefGenerationWindow(
  generatedAtIso: string,
  snapshotGenerationWindow?: AmGenerationWindow | null,
): AmGenerationWindow | null {
  if (snapshotGenerationWindow) return snapshotGenerationWindow;
  const m = etMinutesFromIso(generatedAtIso);
  if (m === null) return null;
  for (let i = AM_WINDOW_ORDER.length - 1; i >= 0; i--) {
    const w = AM_WINDOW_ORDER[i];
    const def = AM_GENERATION_WINDOWS[w];
    if (m >= def.startMin && m <= def.endMin) return w;
  }
  if (m < AM_GENERATION_WINDOWS.early.startMin) return null;
  if (m < AM_GENERATION_WINDOWS.mid.startMin) return "early";
  if (m < AM_GENERATION_WINDOWS.final_preopen.startMin) return "mid";
  return "final_preopen";
}

function nextWindowAfter(w: AmGenerationWindow): AmGenerationWindow | null {
  const idx = windowRank(w);
  if (idx < 0 || idx >= AM_WINDOW_ORDER.length - 1) return null;
  return AM_WINDOW_ORDER[idx + 1];
}

export interface ResolveAmBriefFreshnessInput {
  nowMs: number;
  briefDate: string;
  nowEtDate: string;
  nowMinutesEt: number;
  generatedAt: string;
  snapshotGenerationWindow?: AmGenerationWindow | null;
}

export interface AmBriefFreshnessResult {
  freshnessState: AmBriefFreshnessState;
  generationWindow: AmGenerationWindow | null;
  expectedGenerationWindow: AmGenerationWindow | null;
  supersededBy: AmGenerationWindow | null;
  ageSeconds: number;
  isCurrentEtTradingDay: boolean;
}

export function resolveAmBriefFreshness(input: ResolveAmBriefFreshnessInput): AmBriefFreshnessResult {
  const isCurrentEtTradingDay = input.briefDate === input.nowEtDate;
  const genMs = Date.parse(input.generatedAt);
  const ageSeconds = Number.isFinite(genMs)
    ? Math.max(0, Math.round((input.nowMs - genMs) / 1000))
    : 0;

  const genWindow = classifyBriefGenerationWindow(
    input.generatedAt,
    input.snapshotGenerationWindow ?? null,
  );
  const expected = expectedGenerationWindow(input.nowMinutesEt);

  if (!isCurrentEtTradingDay) {
    return {
      freshnessState: "expired",
      generationWindow: genWindow,
      expectedGenerationWindow: null,
      supersededBy: null,
      ageSeconds,
      isCurrentEtTradingDay: false,
    };
  }

  if (input.nowMinutesEt >= AM_BRIEF_EXPIRE_MINUTES) {
    return {
      freshnessState: "expired",
      generationWindow: genWindow,
      expectedGenerationWindow: expected,
      supersededBy: null,
      ageSeconds,
      isCurrentEtTradingDay: true,
    };
  }

  if (!Number.isFinite(genMs) || !genWindow || !expected) {
    return {
      freshnessState: !genWindow ? "unavailable" : "current",
      generationWindow: genWindow,
      expectedGenerationWindow: expected,
      supersededBy: null,
      ageSeconds,
      isCurrentEtTradingDay: true,
    };
  }

  const genRank = windowRank(genWindow);
  const expRank = windowRank(expected);

  if (genRank < expRank) {
    return {
      freshnessState: "stale",
      generationWindow: genWindow,
      expectedGenerationWindow: expected,
      supersededBy: expected,
      ageSeconds,
      isCurrentEtTradingDay: true,
    };
  }

  const next = nextWindowAfter(genWindow);
  if (next && genRank === expRank && genRank < AM_WINDOW_ORDER.length - 1) {
    const nextStart = AM_GENERATION_WINDOWS[next].startMin;
    if (input.nowMinutesEt >= nextStart - AM_BRIEF_AGING_LEAD_MINUTES && input.nowMinutesEt < nextStart) {
      return {
        freshnessState: "aging",
        generationWindow: genWindow,
        expectedGenerationWindow: expected,
        supersededBy: next,
        ageSeconds,
        isCurrentEtTradingDay: true,
      };
    }
  }

  return {
    freshnessState: "current",
    generationWindow: genWindow,
    expectedGenerationWindow: expected,
    supersededBy: null,
    ageSeconds,
    isCurrentEtTradingDay: true,
  };
}

/**
 * Window supersession gate for controlled generation.
 * Returns true when cron is inside a later window than the stored brief.
 */
export function shouldRegenerateForWindowSupersession(input: {
  nowMinutesEt: number;
  existingGeneratedAt: string;
  existingSnapshot: unknown;
}): boolean {
  const activeWindow = isInsideGenerationWindow(input.nowMinutesEt);
  if (!activeWindow) return false;
  const existingWindow = classifyBriefGenerationWindow(
    input.existingGeneratedAt,
    readSnapshotGenerationWindow(input.existingSnapshot),
  );
  if (!existingWindow) return true;
  return windowRank(activeWindow) > windowRank(existingWindow);
}
