/**
 * Fly one-shot Historical Intelligence production backfill worker.
 * Secrets: HISTORICAL_PRODUCTION_DATABASE_URL, POLYGON_API_KEY (runtime only).
 */
import { createServer } from "node:http";
import { runProductionHistoricalRollout } from "@/lib/historical-backfill/production-rollout";

const port = Number(process.env.PORT ?? "8080");
const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/plain" });
  response.end("historical-backfill-running\n");
});
server.listen(port, "0.0.0.0");

runProductionHistoricalRollout({ loadLocalEnv: false })
  .then(() => {
    server.close();
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "historical backfill failed");
    server.close();
    process.exit(1);
  });
