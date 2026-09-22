/**
 * Historical Forward Outcomes V1 — production batch runner (bridge only).
 *
 * Requires RADAR_BRIDGE_URL + RADAR_WORKER_SECRET. Never prints secrets.
 */

import { HistoricalBridgeClient, requireHistoricalBridgeConfig } from "@/lib/persistence/historical-bridge-client";
import { recomputeForwardOutcomesForSecurity } from "@/lib/forward-outcomes/recompute-forward-outcomes-for-security";
import type { SecurityId } from "@/types/security-identity";

const BATCH_SIZE = Number(process.env.FORWARD_OUTCOME_BATCH_SIZE ?? 25);
const MAX_BATCHES = Number(process.env.FORWARD_OUTCOME_MAX_BATCHES ?? 10_000);
const REFRESH_UNAVAILABLE = process.env.FORWARD_OUTCOME_REFRESH_UNAVAILABLE === "1";

const config = requireHistoricalBridgeConfig();
const bridge = new HistoricalBridgeClient(config);

async function listCandidates(after: string | null): Promise<Array<{ security_id: string }>> {
  const result = await bridge.call("forward_outcome_list_candidates", {
    after_security_id: after,
    limit: BATCH_SIZE,
  });
  const rows = Array.isArray(result.result) ? result.result as Record<string, unknown>[] : [];
  return rows.map((row) => ({ security_id: String(row.security_id) }));
}

async function main() {
  let after: string | null = null;
  let batches = 0;
  let totalApplied = 0;

  for (;;) {
    if (batches >= MAX_BATCHES) break;
    const candidates = await listCandidates(after);
    if (candidates.length === 0) break;

    for (const candidate of candidates) {
      const securityId = candidate.security_id as SecurityId;
      const outcome = await recomputeForwardOutcomesForSecurity({
        bridge,
        securityId,
        refreshUnavailable: REFRESH_UNAVAILABLE,
      });
      totalApplied += outcome.applied;
      console.log(JSON.stringify({
        msg: "forward_outcome_security_done",
        security_id: securityId,
        generated: outcome.generated,
        applied: outcome.applied,
        skipped_existing: outcome.skippedExisting,
      }));
      after = securityId;
    }

    batches += 1;
    if (candidates.length < BATCH_SIZE) break;
  }

  console.log(JSON.stringify({ msg: "forward_outcome_run_complete", total_applied: totalApplied, batches }));
}

main().catch((error) => {
  console.error(JSON.stringify({ msg: "forward_outcome_run_failed", error: String(error) }));
  process.exit(1);
});
