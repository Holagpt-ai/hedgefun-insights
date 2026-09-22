/**
 * Local entrypoint for the production Historical Intelligence rollout.
 * Requires HISTORICAL_PRODUCTION_DATABASE_URL and POLYGON_API_KEY in the environment.
 */
import { runProductionHistoricalRollout } from "@/lib/historical-backfill/production-rollout";

runProductionHistoricalRollout({ loadLocalEnv: true }).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "production backfill failed");
  process.exitCode = 1;
});
