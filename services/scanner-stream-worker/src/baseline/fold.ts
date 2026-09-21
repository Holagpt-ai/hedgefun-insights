import type { BarHL } from "./grouped.ts";
import type {
  BaselineExclusionPayload,
  BaselineRow,
  VolumeHistoryRow,
} from "./persist.ts";

/**
 * The radar worker and the 52-week baseline share one process.
 * A Map per session of every US symbol, plus one object per volume row,
 * is enough to sit on the V8 heap limit (~480MB on the 1GB machine).
 * This fold keeps monotonic high/low runs and volumes in typed arrays
 * and emits volume rows one chunk at a time.
 */

type CompactDeque = {
  days: Uint16Array;
  vals: Float64Array;
  n: number;
};

type Acc = {
  sessions: number;
  max: CompactDeque;
  min: CompactDeque;
};

type DayVol = {
  date: string;
  ids: Uint32Array;
  vols: Float64Array;
  n: number;
};

export type FoldedBaseline = {
  rows: BaselineRow[];
  exclusions: BaselineExclusionPayload[];
  retainedVolumeSamples: number;
  writeVolumeHistory(
    write: (
      rows: VolumeHistoryRow[],
    ) => Promise<"ok" | "persist_failed" | "validation_failed">,
  ): Promise<"ok" | "persist_failed" | "validation_failed">;
};

function createDeque(): CompactDeque {
  return { days: new Uint16Array(4), vals: new Float64Array(4), n: 0 };
}

function append(q: CompactDeque, day: number, v: number): void {
  if (q.n >= q.days.length) {
    const next = q.days.length * 2;
    const days = new Uint16Array(next);
    const vals = new Float64Array(next);
    days.set(q.days);
    vals.set(q.vals);
    q.days = days;
    q.vals = vals;
  }
  q.days[q.n] = day;
  q.vals[q.n] = v;
  q.n += 1;
}

function pushMax(q: CompactDeque, day: number, v: number): void {
  let n = q.n;
  while (n > 0 && q.vals[n - 1] <= v) n -= 1;
  q.n = n;
  append(q, day, v);
}

function pushMin(q: CompactDeque, day: number, v: number): void {
  let n = q.n;
  while (n > 0 && q.vals[n - 1] >= v) n -= 1;
  q.n = n;
  append(q, day, v);
}

function candidatesOf(
  q: CompactDeque,
  dates: readonly string[],
): Array<{ d: string; v: number }> {
  const out: Array<{ d: string; v: number }> = [];
  for (let i = 0; i < q.n; i++) {
    out.push({ d: dates[q.days[i]], v: q.vals[i] });
  }
  return out;
}

export function createBaselineFold(
  periodStart: string,
  periodEnd: string,
  minSessions: number,
  dates: readonly string[],
): {
  addDay(date: string, bars: ReadonlyMap<string, BarHL>): void;
  finish(providerAsOf: string): FoldedBaseline;
} {
  if (dates.length > 65_535) {
    throw new Error("baseline_window_too_long");
  }
  const dayIndex = new Map<string, number>();
  for (let i = 0; i < dates.length; i++) dayIndex.set(dates[i], i);

  const intern = new Map<string, number>();
  const symbols: string[] = [];
  const acc = new Map<number, Acc>();
  const volumeDays: DayVol[] = [];
  let volumeSamples = 0;

  function symbolId(symbol: string): number {
    const existing = intern.get(symbol);
    if (existing !== undefined) return existing;
    const id = symbols.length;
    symbols.push(symbol);
    intern.set(symbol, id);
    return id;
  }

  return {
    addDay(date, bars) {
      const day = dayIndex.get(date);
      if (day === undefined) return;
      if (date < periodStart || date > periodEnd) return;
      const ids = new Uint32Array(bars.size);
      const vols = new Float64Array(bars.size);
      let n = 0;
      for (const [symbol, bar] of bars) {
        const id = symbolId(symbol);
        let state = acc.get(id);
        if (!state) {
          state = {
            sessions: 0,
            max: createDeque(),
            min: createDeque(),
          };
          acc.set(id, state);
        }
        state.sessions += 1;
        pushMax(state.max, day, bar.h);
        pushMin(state.min, day, bar.l);
        if (bar.v !== null && bar.v > 0 && Number.isFinite(bar.v)) {
          ids[n] = id;
          vols[n] = bar.v;
          n += 1;
          volumeSamples += 1;
        }
      }
      if (n > 0) {
        volumeDays.push({ date, ids, vols, n });
      }
    },
    finish(providerAsOf) {
      const names: string[] = [];
      for (const id of acc.keys()) names.push(symbols[id]);
      names.sort();

      const rows: BaselineRow[] = [];
      const exclusions: BaselineExclusionPayload[] = [];
      for (const symbol of names) {
        const id = intern.get(symbol);
        if (id === undefined) continue;
        const state = acc.get(id);
        if (!state || state.sessions < 1) continue;
        if (state.sessions < minSessions) {
          exclusions.push({
            symbol,
            reason: "insufficient_sessions",
            sessions_observed: state.sessions,
            min_sessions: minSessions,
          });
          continue;
        }
        if (state.max.n < 1 || state.min.n < 1) continue;
        const high = state.max.vals[0];
        const low = state.min.vals[0];
        if (!(high >= low) || !(high > 0) || !(low > 0)) continue;
        if (!Number.isFinite(high) || !Number.isFinite(low)) continue;
        rows.push({
          symbol,
          period_start: periodStart,
          period_end: periodEnd,
          high_52w: high,
          low_52w: low,
          high_candidates: candidatesOf(state.max, dates),
          low_candidates: candidatesOf(state.min, dates),
          sessions_observed: state.sessions,
          provider_as_of: providerAsOf,
        });
      }
      acc.clear();

      const samples = volumeSamples;
      return {
        rows,
        exclusions,
        retainedVolumeSamples: samples,
        async writeVolumeHistory(write) {
          const maxItems = 2000;
          for (const day of volumeDays) {
            for (let offset = 0; offset < day.n; offset += maxItems) {
              const end = Math.min(day.n, offset + maxItems);
              const chunk: VolumeHistoryRow[] = [];
              for (let i = offset; i < end; i++) {
                chunk.push({
                  symbol: symbols[day.ids[i]],
                  session_date: day.date,
                  volume: day.vols[i],
                });
              }
              const status = await write(chunk);
              if (status !== "ok") return status;
            }
          }
          volumeDays.length = 0;
          return "ok";
        },
      };
    },
  };
}
