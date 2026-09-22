/**
 * Fly one-shot Historical Intelligence production backfill worker.
 * Secrets: RADAR_BRIDGE_URL, RADAR_WORKER_SECRET, POLYGON_API_KEY (optional HISTORICAL_PRODUCTION_DATABASE_URL for local).
 */
import { createServer } from "node:http";
import {
  runHistoricalBackfillConnectivityCheck,
  runProductionHistoricalRollout,
} from "@/lib/historical-backfill/production-rollout";

const port = Number(process.env.PORT ?? "8080");
const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/plain" });
  response.end("historical-backfill-running\n");
});
server.listen(port, "0.0.0.0");

const connectivityOnly = process.env.HISTORICAL_BACKFILL_CONNECTIVITY_ONLY === "1";
const runner = connectivityOnly
  ? runHistoricalBackfillConnectivityCheck({ loadLocalEnv: false })
  : runProductionHistoricalRollout({ loadLocalEnv: false });

runner
  .then((result) => {
    if (connectivityOnly) {
      console.log(JSON.stringify({ event: "connectivity_ok", ...result }));
    }
    server.close();
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "historical backfill failed");
    server.close();
    process.exit(1);
  });
