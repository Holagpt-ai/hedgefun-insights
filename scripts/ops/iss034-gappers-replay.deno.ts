#!/usr/bin/env -S deno run --allow-read
/**
 * Replay Gappers gap-input accounting from a Lovable-exported job JSON.
 *
 * Export shape (read-only SQL in Lovable; service role / admin only):
 *   { "observation": { ... }, "all_tickers": [ ... ], "merged_artifacts"?: { ... } }
 *
 * Usage:
 *   deno run --allow-read scripts/ops/iss034-gappers-replay.deno.ts path/to/job-export.json
 */

import { POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE } from "../../supabase/functions/_shared/screeners/baseline-coverage.ts";
import type { HistoricalCoverageEvidence } from "../../supabase/functions/_shared/screeners/evaluation-evidence.ts";
import {
  compareGappersGapInputAccounting,
} from "../../supabase/functions/_shared/screeners/gappers-gap-input-accounting.ts";
import { isStructurallyNoPriorSession } from "../../supabase/functions/_shared/screeners/evaluation-evidence.ts";
import type { PolygonTicker } from "../../supabase/functions/_shared/screeners/selection.ts";
import { createSessionVolumeCache } from "../../supabase/functions/_shared/screeners/session-volume.ts";

const file = Deno.args[0];
if (!file) {
  console.error(
    "Usage: deno run --allow-read scripts/ops/iss034-gappers-replay.deno.ts <job-export.json>",
  );
  Deno.exit(1);
}

type JobExport = {
  observation?: {
    nowMs?: number;
    extendedSession?: boolean;
    observationSessionFields?: boolean;
  };
  all_tickers?: PolygonTicker[];
  merged_artifacts?: {
    gappersAccum?: Record<string, unknown>;
  };
};

const raw = JSON.parse(await Deno.readTextFile(file)) as JobExport;
const universe = raw.all_tickers ?? [];
const obs = raw.observation ?? {};
const nowMs = typeof obs.nowMs === "number" ? obs.nowMs : Date.now();
const extendedSession = obs.extendedSession === true;
const observationSessionFields = obs.observationSessionFields !== false;

const coverage: HistoricalCoverageEvidence = {
  available: false,
  baselineSymbols: new Set<string>(),
  policyExclusions: POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
};

const replayOpts = {
  extendedSession,
  observationSessionFields,
  nowMs,
  cache: createSessionVolumeCache({
    nowMs,
    observationSessionVolume: observationSessionFields,
    extendedSession,
  }),
  isStructurallyNoPriorSession: (t: PolygonTicker) =>
    isStructurallyNoPriorSession(t, coverage, extendedSession, nowMs),
};

const { baseline, withHelper } = compareGappersGapInputAccounting(universe, replayOpts);
const stored = raw.merged_artifacts?.gappersAccum;

const out = {
  universe_count: universe.length,
  stored_gappers_accum: stored ?? null,
  baseline,
  with_helper: {
    unresolved_gap_input_count: withHelper.unresolved_gap_input_count,
    split_scale_suppressed_count: withHelper.split_scale_suppressed_count,
    close_versus_prior_helper_matches: withHelper.close_versus_prior_helper_matches,
  },
  unresolved_delta:
    withHelper.unresolved_gap_input_count - baseline.unresolved_gap_input_count,
};

console.log(JSON.stringify(out, null, 2));