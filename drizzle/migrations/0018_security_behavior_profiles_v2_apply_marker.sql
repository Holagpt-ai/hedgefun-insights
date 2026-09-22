REVOKE ALL ON FUNCTION public.behavior_profile_list_candidates_v1(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.behavior_profile_list_candidates_v1(uuid, integer) TO service_role;
REVOKE ALL ON FUNCTION public.behavior_profile_upsert_v1(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.behavior_profile_upsert_v1(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.forward_outcome_aggregate_for_security_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.forward_outcome_aggregate_for_security_v1(uuid) TO service_role;
