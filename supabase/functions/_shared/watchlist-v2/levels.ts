// Pure level computation over validated ascending bars.
// Published levels (persisted) include the most recent bar.
// Transition levels (internal only) exclude it.

import type { IntradayBar, KeyLevels, SessionType } from "./contract.ts";
import { etParts } from "./session.ts";

function isPremarketMinute(m: number): boolean {
  return m >= 4 * 60 && m <= 9 * 60 + 29;
}
function isRthMinute(m: number): boolean {
  return m >= 9 * 60 + 30 && m <= 15 * 60 + 59;
}

function minutesOf(t: number): number {
  return etParts(new Date(t)).minutes;
}

/** Compute published key levels; scope reflects session_type. */
export function computeKeyLevels(
  bars: IntradayBar[],
  sessionType: SessionType,
  priorClose: number | null,
): KeyLevels {
  const pmBars = bars.filter((b) => isPremarketMinute(minutesOf(b.t)));
  const rthBars = bars.filter((b) => isRthMinute(minutesOf(b.t)));

  // VWAP scope
  let vwapScope: "rth" | "session_to_date" | null = null;
  let vwapBars: IntradayBar[] = [];
  if (sessionType === "rth" || sessionType === "postclose") {
    vwapScope = "rth";
    vwapBars = rthBars;
  } else if (sessionType === "premarket") {
    vwapScope = "session_to_date";
    vwapBars = bars.slice();
  }
  let vwap: number | null = null;
  if (vwapBars.length > 0) {
    let num = 0, den = 0;
    for (const b of vwapBars) {
      const tp = (b.h + b.l + b.c) / 3;
      num += tp * b.v;
      den += b.v;
    }
    vwap = den > 0 ? num / den : null;
  }

  // HOD/LOD scope
  let hodLodScope: "premarket" | "rth" | "session_to_date";
  let scopeBars: IntradayBar[];
  if (sessionType === "premarket") {
    hodLodScope = "premarket";
    scopeBars = pmBars;
  } else if (sessionType === "rth") {
    hodLodScope = "rth";
    scopeBars = rthBars;
  } else {
    hodLodScope = "session_to_date";
    scopeBars = bars.slice();
  }
  let hod: number | null = null;
  let lod: number | null = null;
  if (scopeBars.length > 0) {
    hod = scopeBars.reduce((m, b) => Math.max(m, b.h), -Infinity);
    lod = scopeBars.reduce((m, b) => Math.min(m, b.l), Infinity);
    if (!Number.isFinite(hod) || hod <= 0) hod = null;
    if (!Number.isFinite(lod) || lod <= 0) lod = null;
  }

  let pmH: number | null = null, pmL: number | null = null;
  if (pmBars.length > 0) {
    pmH = pmBars.reduce((m, b) => Math.max(m, b.h), -Infinity);
    pmL = pmBars.reduce((m, b) => Math.min(m, b.l), Infinity);
    if (!Number.isFinite(pmH) || pmH <= 0) pmH = null;
    if (!Number.isFinite(pmL) || pmL <= 0) pmL = null;
  }

  const priorClosePub = priorClose !== null && Number.isFinite(priorClose) && priorClose > 0 ? priorClose : null;

  return {
    vwap,
    hod,
    lod,
    premarket_high: pmH,
    premarket_low: pmL,
    prior_close: priorClosePub,
    basis: { hod_lod_scope: hodLodScope, vwap_scope: vwapScope },
  };
}

export interface TransitionLevels {
  hod_excl_current: number | null;
  lod_excl_current: number | null;
  premarket_high_excl_current: number | null;
  premarket_low_excl_current: number | null;
  previous_bar_close: number | null;
}

/** Levels computed over bars.slice(0, -1); returns nulls if <2 bars. */
export function computeTransitionLevels(
  bars: IntradayBar[],
  sessionType: SessionType,
): TransitionLevels {
  if (bars.length < 2) {
    return {
      hod_excl_current: null,
      lod_excl_current: null,
      premarket_high_excl_current: null,
      premarket_low_excl_current: null,
      previous_bar_close: null,
    };
  }
  const prior = bars.slice(0, -1);
  const pmPrior = prior.filter((b) => isPremarketMinute(minutesOf(b.t)));
  const rthPrior = prior.filter((b) => isRthMinute(minutesOf(b.t)));

  let scope: IntradayBar[];
  if (sessionType === "premarket") scope = pmPrior;
  else if (sessionType === "rth") scope = rthPrior;
  else scope = prior;

  const hi = scope.length ? scope.reduce((m, b) => Math.max(m, b.h), -Infinity) : null;
  const lo = scope.length ? scope.reduce((m, b) => Math.min(m, b.l), Infinity) : null;
  const pmH = pmPrior.length ? pmPrior.reduce((m, b) => Math.max(m, b.h), -Infinity) : null;
  const pmL = pmPrior.length ? pmPrior.reduce((m, b) => Math.min(m, b.l), Infinity) : null;

  return {
    hod_excl_current: hi !== null && Number.isFinite(hi) && hi > 0 ? hi : null,
    lod_excl_current: lo !== null && Number.isFinite(lo) && lo > 0 ? lo : null,
    premarket_high_excl_current: pmH !== null && Number.isFinite(pmH) && pmH > 0 ? pmH : null,
    premarket_low_excl_current: pmL !== null && Number.isFinite(pmL) && pmL > 0 ? pmL : null,
    previous_bar_close: prior[prior.length - 1].c,
  };
}
