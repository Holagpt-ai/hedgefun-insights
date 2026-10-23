/**
 * Gate H classifier entrypoint — runs the Deno read-only classifier.
 * Usage: npx vite-node --config vitest.config.ts scripts/ops/sec-v1c-misattribution-classify.ts
 * (spawns deno with approved DB URL in env)
 */
import { spawnSync } from "node:child_process";

const deno = spawnSync(
  "deno",
  [
    "run",
    "-A",
    "scripts/ops/sec-v1c-misattribution-classify.deno.ts",
  ],
  { stdio: "inherit", env: process.env },
);

if (deno.status !== 0) process.exit(deno.status ?? 1);
