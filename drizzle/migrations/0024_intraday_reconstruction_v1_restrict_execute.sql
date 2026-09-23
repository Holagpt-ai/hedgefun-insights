REVOKE EXECUTE ON FUNCTION public.intraday_reconstruction_apply_batch_v1(jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.intraday_episode_event_apply_batch_v1(jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.intraday_reconstruction_list_episodes_v1(uuid, integer, boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.intraday_reconstruction_list_by_episodes_v1(uuid[]) FROM anon, authenticated;
NOTIFY pgrst, 'reload schema';