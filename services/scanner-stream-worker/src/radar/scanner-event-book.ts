import {
  DEFAULT_SCANNER_EVENT_CONFIG,
  evaluateScannerEventQualification,
  pickPrimaryScannerEvent,
  SCANNER_EVENT_TYPES,
  type ScannerEventConfig,
  type ScannerEventEvalInput,
  type ScannerEventSnapshot,
  type ScannerEventType,
} from "../../../../supabase/functions/_shared/radar-v22/scanner-events.ts";

type Slot = {
  active: boolean;
  triggeredAtMs: number | null;
  cooldownUntilMs: number | null;
};

export type ScannerEventBookSnapshot = {
  events: ScannerEventSnapshot[];
  primary: ScannerEventSnapshot | null;
  /** False→true transitions this evaluation tick. */
  newlyActivated: ScannerEventSnapshot[];
};

export type ScannerEventBook = {
  step(
    symbol: string,
    eventNowMs: number,
    input: ScannerEventEvalInput,
    isoFromMs: (ms: number) => string | null,
  ): ScannerEventBookSnapshot;
  clear(): void;
  dropSymbol(symbol: string): void;
};

export function createScannerEventBook(
  cfg: ScannerEventConfig = DEFAULT_SCANNER_EVENT_CONFIG,
): ScannerEventBook {
  const bySymbol = new Map<string, Map<ScannerEventType, Slot>>();

  function slots(symbol: string): Map<ScannerEventType, Slot> {
    let m = bySymbol.get(symbol);
    if (!m) {
      m = new Map();
      for (const t of SCANNER_EVENT_TYPES) {
        m.set(t, { active: false, triggeredAtMs: null, cooldownUntilMs: null });
      }
      bySymbol.set(symbol, m);
    }
    return m;
  }

  return {
    step(symbol, eventNowMs, input, isoFromMs) {
      const qual = evaluateScannerEventQualification(input, cfg);
      const map = slots(symbol);
      const activeSnapshots: ScannerEventSnapshot[] = [];
      const newlyActivated: ScannerEventSnapshot[] = [];

      for (const type of SCANNER_EVENT_TYPES) {
        const slot = map.get(type)!;
        const wants = qual[type];

        if (wants) {
          if (!slot.active) {
            if (
              slot.cooldownUntilMs === null ||
              eventNowMs >= slot.cooldownUntilMs
            ) {
              slot.active = true;
              slot.triggeredAtMs = eventNowMs;
              slot.cooldownUntilMs = null;
              const iso = isoFromMs(eventNowMs);
              if (iso) {
                newlyActivated.push({
                  type,
                  triggered_at: iso,
                  active: true,
                });
              }
            }
          }
        } else if (slot.active) {
          slot.active = false;
          slot.cooldownUntilMs = eventNowMs + cfg.eventCooldownMs;
        }

        if (slot.active && slot.triggeredAtMs !== null) {
          const iso = isoFromMs(slot.triggeredAtMs);
          if (iso) {
            activeSnapshots.push({
              type,
              triggered_at: iso,
              active: true,
            });
          }
        }
      }

      const primary = pickPrimaryScannerEvent(activeSnapshots);
      return { events: activeSnapshots, primary, newlyActivated };
    },
    clear() {
      bySymbol.clear();
    },
    dropSymbol(symbol) {
      bySymbol.delete(symbol);
    },
  };
}
