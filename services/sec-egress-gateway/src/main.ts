import { createSecEgressGateway } from "./gateway.ts";

const port = Number(Deno.env.get("PORT") ?? "8080");
const gateway = createSecEgressGateway({
  authSecret: Deno.env.get("STOCKSIST_SEC_GATEWAY_SECRET"),
  userAgent: Deno.env.get("SEC_USER_AGENT"),
  minIntervalMs: secondsEnv("SEC_LATEST_FILINGS_MIN_INTERVAL_SECONDS", 240),
  transportTtlMs: secondsEnv("SEC_LATEST_FILINGS_TRANSPORT_TTL_SECONDS", 240),
  egressIdentity: Deno.env.get("SEC_EGRESS_IDENTITY") ?? null,
  log: (event) => console.log(JSON.stringify(event)),
});

Deno.serve({ port, hostname: "0.0.0.0" }, (request) => gateway.handle(request));

function secondsEnv(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  const parsed = raw ? Number(raw) : fallback;
  if (!Number.isFinite(parsed) || parsed < 0) return fallback * 1000;
  return parsed * 1000;
}
