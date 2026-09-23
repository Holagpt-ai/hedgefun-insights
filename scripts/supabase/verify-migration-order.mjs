#!/usr/bin/env node
import {
  validateMigrationOrdering,
  validateNewMigrationFilename,
} from "./migration-order.mjs";

const candidate = process.argv[2] ?? null;

const order = validateMigrationOrdering();
if (!order.ok) {
  console.error("Supabase migration ordering validation FAILED:");
  for (const line of order.errors) console.error(`  - ${line}`);
  process.exit(1);
}

console.log(
  `Supabase migration ordering ok (${order.fileCount} files, max prefix ${order.maxTimestamp ?? "n/a"})`,
);

if (candidate) {
  const next = validateNewMigrationFilename(candidate);
  if (!next.ok) {
    console.error(`New migration filename rejected: ${next.reason}`);
    process.exit(1);
  }
  console.log(`New migration filename ok: ${candidate} (> ${next.maxTimestamp ?? "none"})`);
}
