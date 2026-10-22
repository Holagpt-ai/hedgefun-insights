/**
 * Fly one-shot Historical Intelligence production backfill worker.
 * Secrets: RADAR_BRIDGE_URL, RADAR_WORKER_SECRET, POLYGON_API_KEY (optional HISTORICAL_PRODUCTION_DATABASE_URL for local).
 */
import { createServer } from "node:http";
import {
  HISTORICAL_CATCHUP_PREFLIGHT_ENV,
  isHistoricalCatchupResumeOnlyEnabled,
} from "@/config/historical-catchup.config";
import {
  runHistoricalBackfillConnectivityCheck,
  runHistoricalCatchUpPreflight,
  runHistoricalCatchUpResumeOnly,
  runHistoricalCatchUpRollout,
} from "@/lib/historical-backfill/production-rollout";

const port = Number(process.env.PORT ?? "8080");
const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/plain" });
  response.end("historical-backfill-running\n");
});
server.listen(port, "0.0.0.0");

const connectivityOnly = process.env.HISTORICAL_BACKFILL_CONNECTIVITY_ONLY === "1";
const preflightOnly = process.env[HISTORICAL_CATCHUP_PREFLIGHT_ENV] === "1";
const resumeOnly = !preflightOnly && isHistoricalCatchupResumeOnlyEnabled();
const runner = connectivityOnly
  ? runHistoricalBackfillConnectivityCheck({ loadLocalEnv: false })
  : preflightOnly
    ? runHistoricalCatchUpPreflight({ loadLocalEnv: false })
    : resumeOnly
      ? runHistoricalCatchUpResumeOnly({ loadLocalEnv: false })
      : runHistoricalCatchUpRollout({ loadLocalEnv: false });

runner
  .then((result) => {
    if (connectivityOnly) {
      console.log(JSON.stringify({ event: "connectivity_ok", ...result }));
    } else if (preflightOnly) {
      console.log(JSON.stringify({ event: "catch_up_preflight_ok", ...result }));
    } else if (resumeOnly && result && typeof result === "object" && "terminalEvent" in result) {
      console.log(JSON.stringify({ event: result.terminalEvent, ...result }));
    }
    server.close();
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "historical backfill failed");
    server.close();
    process.exit(1);
  });
