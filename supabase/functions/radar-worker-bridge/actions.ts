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
  "replace_52w_baseline_with_exclusions",
  "start_52w_baseline_publish",
  "append_52w_baseline_rows",
  "append_52w_baseline_exclusions",
  "finalize_52w_baseline_publish",
  "get_52w_state",
] as const;

export type RadarBridgeAction = (typeof RADAR_BRIDGE_ACTIONS)[number];

export function isRadarBridgeAction(
  value: unknown,
): value is RadarBridgeAction {
  return typeof value === "string" &&
    (RADAR_BRIDGE_ACTIONS as readonly string[]).includes(value);
}
