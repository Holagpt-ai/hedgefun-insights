import type { RadarV22Config } from "./config.ts";
import type { RadarV22BoardLifecycle } from "../../../../supabase/functions/_shared/radar-v22/types.ts";
import type { RankedCandidate } from "./types.ts";

const LIFECYCLE_PRIORITY: Record<RadarV22BoardLifecycle, number> = {
  ACTIVE: 0,
  REACTIVATED: 0,
  CONFIRMING: 1,
  DETECTED: 2,
  COOLING: 3,
};

function cmpNumberDesc(a: number, b: number): number {
  if (a > b) return -1;
  if (a < b) return 1;
  return 0;
}

function cmpAccelDesc(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return cmpNumberDesc(a, b);
}

function cmpFreshnessAsc(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function compareRankedCandidates(
  a: RankedCandidate,
  b: RankedCandidate,
  config: RadarV22Config,
): number {
  const aTier = a.vol60s >= config.highActivityShares60s;
  const bTier = b.vol60s >= config.highActivityShares60s;
  if (aTier !== bTier) return aTier ? -1 : 1;

  const vol60 = cmpNumberDesc(a.vol60s, b.vol60s);
  if (vol60 !== 0) return vol60;
  const vol15 = cmpNumberDesc(a.vol15s, b.vol15s);
  if (vol15 !== 0) return vol15;
  const vol5 = cmpNumberDesc(a.vol5s, b.vol5s);
  if (vol5 !== 0) return vol5;
  if (config.sentinelEnabled) {
    const accel = cmpAccelDesc(a.acceleration5m, b.acceleration5m);
    if (accel !== 0) return accel;
    const dollars = cmpNumberDesc(a.dollarVol60s, b.dollarVol60s);
    if (dollars !== 0) return dollars;
    const fresh = cmpFreshnessAsc(
      a.freshnessAgeMs ?? null,
      b.freshnessAgeMs ?? null,
    );
    if (fresh !== 0) return fresh;
    const session = cmpNumberDesc(a.sessionVolume, b.sessionVolume);
    if (session !== 0) return session;
  } else {
    const session = cmpNumberDesc(a.sessionVolume, b.sessionVolume);
    if (session !== 0) return session;
    const dollars = cmpNumberDesc(a.dollarVol60s, b.dollarVol60s);
    if (dollars !== 0) return dollars;
    const accel = cmpAccelDesc(a.acceleration5m, b.acceleration5m);
    if (accel !== 0) return accel;
  }
  const life = LIFECYCLE_PRIORITY[a.lifecycle] -
    LIFECYCLE_PRIORITY[b.lifecycle];
  if (life !== 0) return life;
  if (a.symbol < b.symbol) return -1;
  if (a.symbol > b.symbol) return 1;
  return 0;
}

export function rankBoard(
  candidates: RankedCandidate[],
  config: RadarV22Config,
): RankedCandidate[] {
  return [...candidates]
    .sort((a, b) => compareRankedCandidates(a, b, config))
    .slice(0, config.boardRowCap);
}
