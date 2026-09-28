import { createServer, type Server } from "node:http";
import type { ShadowWorkerHealthSnapshot } from "@/lib/ai-trader/runtime/shadow-worker-supervisor";

export function startShadowWorkerHealthServer(
  port: number,
  snapshot: () => ShadowWorkerHealthSnapshot,
): Promise<Server> {
  const server = createServer((req, res) => {
    const path = req.url?.split("?")[0] ?? "";
    if (req.method !== "GET" || (path !== "/health" && path !== "/")) {
      res.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    const body = snapshot();
    const code = body.status === "healthy" ? 200 : 503;
    res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => resolve(server));
  });
}
