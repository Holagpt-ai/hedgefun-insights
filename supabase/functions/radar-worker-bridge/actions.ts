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
  "append_daily_volume_history",
  "finalize_52w_baseline_publish",
  "get_52w_state",
  "historical_identity_apply_diff",
  "historical_apply_daily_batch",
  "historical_apply_episode_batch",
  "historical_find_interrupted_job",
  "historical_rollout_backfilled_symbols",
  "historical_get_job",
  "historical_create_job",
  "historical_update_job",
  "historical_list_eligible_symbols",
  "historical_list_securities",
  "historical_list_symbol_history",
  "historical_list_reference_identifiers",
  "historical_get_daily_history",
  "historical_list_daily_history",
  "historical_list_episodes",
  "historical_symbol_at",
  "behavior_profile_get",
  "behavior_profile_upsert",
  "behavior_profile_list",
  "behavior_profile_list_candidates",
] as const;

export type RadarBridgeAction = (typeof RADAR_BRIDGE_ACTIONS)[number];

export function isRadarBridgeAction(
  value: unknown,
): value is RadarBridgeAction {
  return typeof value === "string" &&
    (RADAR_BRIDGE_ACTIONS as readonly string[]).includes(value);
}
