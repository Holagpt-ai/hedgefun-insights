/** Hardcoded worker-bridge actions. Not RPC or table names. */

export const RADAR_BRIDGE_ACTIONS = [
  "acquire_lease",
  "heartbeat_lease",
  "release_lease",
  "get_calendar",
  "publish_generation",
  "publish_candidates_v2",
  "set_feed_status",
  "replace_52w_baseline",
  "get_52w_state",
] as const;

export type RadarBridgeAction = (typeof RADAR_BRIDGE_ACTIONS)[number];

export function isRadarBridgeAction(
  value: unknown,
): value is RadarBridgeAction {
  return typeof value === "string" &&
    (RADAR_BRIDGE_ACTIONS as readonly string[]).includes(value);
}
