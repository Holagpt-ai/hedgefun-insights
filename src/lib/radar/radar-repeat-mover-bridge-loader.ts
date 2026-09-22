import { getRepeatMoverContextViaBridge } from "@/lib/repeat-movers/repeat-mover-bridge-access";
import type { HistoricalBridgeClient } from "@/lib/persistence/historical-bridge-client";
import type { RepeatMoverContextLoader } from "@/lib/radar/enrich-radar-historical-context";

export function createRadarRepeatMoverBridgeLoader(
  bridge: HistoricalBridgeClient,
): RepeatMoverContextLoader {
  return async ({ securityId, currentContext }) =>
    getRepeatMoverContextViaBridge({
      bridge,
      securityId,
      currentContext,
    });
}
