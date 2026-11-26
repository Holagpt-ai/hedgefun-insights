import { resolveLatestCompletedTradingSession } from "@/lib/historical-backfill/catch-up-schedule";

const session = resolveLatestCompletedTradingSession();
console.log(JSON.stringify({ event: "catch_up_target_session", targetSession: session }));