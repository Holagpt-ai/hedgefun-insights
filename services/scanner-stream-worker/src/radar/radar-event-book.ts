import {
  DEFAULT_RADAR_EVENT_ENGINE_CONFIG,
  emptyRadarEventEngineState,
  stepRadarEventEngine,
  type RadarEventEngineStepInput,
} from "../../../../src/lib/radar/radar-event-engine.ts";

export type RadarEventBook = {
  step(
    symbol: string,
    input: Omit<RadarEventEngineStepInput, "symbol">,
  ): ReturnType<typeof stepRadarEventEngine>;
  clear(): void;
  dropSymbol(symbol: string): void;
};

export function createRadarEventBook(): RadarEventBook {
  const bySymbol = new Map<
    string,
    ReturnType<typeof emptyRadarEventEngineState>
  >();

  return {
    step(symbol, input) {
      const prev = bySymbol.get(symbol) ?? null;
      const result = stepRadarEventEngine(
        prev,
        { ...input, symbol },
        DEFAULT_RADAR_EVENT_ENGINE_CONFIG,
      );
      bySymbol.set(symbol, result.state);
      return result;
    },
    clear() {
      bySymbol.clear();
    },
    dropSymbol(symbol) {
      bySymbol.delete(symbol);
    },
  };
}
