#!/usr/bin/env node
/**
 * Read-only Monday scanner acceptance helper.
 * Prints ET windows, checklist, and suggested read-only commands.
 * Does not call production write APIs or deploy infrastructure.
 */

const SESSION_DATE = process.env.SCANNER_ACCEPTANCE_DATE ?? "2026-10-26";

const WINDOWS = [
  { id: "premarket", label: "Premarket discovery", et: "04:00–09:30" },
  { id: "rth", label: "Regular-session momentum", et: "09:30–16:00" },
  { id: "late", label: "Late-session continuation", et: "16:00–20:00" },
];

const CHECKLIST = [
  "Premarket candidates with provider timestamps or honest unavailable",
  "RTH Radar volume-first ranking and Five Pillars qualification",
  "Verified volume ordering (Polygon v=0 not treated as liquidity)",
  "5m RVOL unavailable states when data missing",
  "Float-turnover gates match stored inputs",
  "Provider timestamps / delayed-feed disclosure on Radar",
  "Promotion and cooling lifecycle without duplicate spam",
  "Catalyst labels (verified / historical / unverified) without rank impact",
  "Late-session handoff / carryover for next session",
];

console.log("Stocksist — Monday scanner acceptance (read-only)\n");
console.log(`Target session date (ET): ${SESSION_DATE}`);
console.log("Do not treat weekend checks as live RTH acceptance.\n");

console.log("ET observation windows:");
for (const w of WINDOWS) {
  console.log(`  • ${w.label}: ${w.et} ET`);
}

console.log("\nEvidence checklist:");
CHECKLIST.forEach((item, i) => console.log(`  ${i + 1}. ${item}`));

console.log("\nSuggested read-only commands (run manually during RTH):");
console.log("  fly logs -a stocksist-radar-v22-worker --since 2h");
console.log("  curl -sS https://stocksist.com/asset-manifest.json");
console.log("\nLocal regression (no network):");
console.log("  npx vitest run src/lib/__tests__/batch26-scanner-integrity.test.ts src/lib/__tests__/batch27-scanner-reliability.test.ts");

process.exit(0);
