#!/usr/bin/env -S deno run --allow-read
/**
 * Replay Gappers gap-input accounting from a Lovable-exported job JSON.
 *
 * See `docs/release/iss034-nov16-full-job-replay-export-v1.md` for export SQL/spec.
 *
 * Usage:
 *   deno run --allow-read scripts/ops/iss034-gappers-replay.deno.ts path/to/job-export.json
 */

import {
  Iss034ReplayInputError,
  ISS034_NOV16_TARGET_JOB_ID,
  replayIss034JobExport,
} from "../../supabase/functions/_shared/screeners/iss034-job-gappers-replay.ts";

const file = Deno.args[0];
if (!file) {
  console.error(
    "Usage: deno run --allow-read scripts/ops/iss034-gappers-replay.deno.ts <job-export.json>",
  );
  console.error(`Target job id (Nov 16 stall): ${ISS034_NOV16_TARGET_JOB_ID}`);
  Deno.exit(1);
}

let raw: unknown;
try {
  raw = JSON.parse(await Deno.readTextFile(file));
} catch (e) {
  console.error(JSON.stringify({ error: "file_read_failed", message: String(e) }));
  Deno.exit(1);
}

try {
  const out = replayIss034JobExport(raw);
  console.log(JSON.stringify(out, null, 2));
  if (out.counter_reconciliation.mismatches.length > 0) {
    console.error(
      JSON.stringify({
        error: "counter_mismatch",
        mismatches: out.counter_reconciliation.mismatches,
        stored: out.counter_reconciliation.stored,
        replayed: out.counter_reconciliation.replayed,
      }),
    );
    Deno.exit(2);
  }
} catch (e) {
  if (e instanceof Iss034ReplayInputError) {
    console.error(JSON.stringify({ error: e.code, message: e.message }));
    Deno.exit(1);
  }
  throw e;
}