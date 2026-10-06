/**
 * Dev-only scanner explanation. Reads one observation JSON file.
 * Does not call a market-data provider and does not write production state.
 *
 *   npx tsx scripts/inspect-scanner-symbol.ts observation.json
 */
import { readFileSync } from "node:fs";
import { inspectSymbolSession, type SymbolObservation } from "../src/lib/scanner-verification/symbol-session-diagnostic.ts";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx scripts/inspect-scanner-symbol.ts <observation.json>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, "")) as {
  nowMs?: number;
  prior?: { session_date: string; qualified: boolean; visible: boolean } | null;
  current: SymbolObservation;
};

if (!raw.current?.symbol || !raw.current.session_date) {
  console.error("observation.current.symbol and session_date are required");
  process.exit(1);
}

const diagnostic = inspectSymbolSession({
  nowMs: typeof raw.nowMs === "number" ? raw.nowMs : Date.now(),
  prior: raw.prior ?? null,
  current: raw.current,
});

console.log(JSON.stringify(diagnostic, null, 2));
