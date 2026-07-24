
CREATE OR REPLACE FUNCTION public.claim_wl_v2_analysis_cycle(
  p_scope text,
  p_session_type public.watchlist_session,
  p_lease_seconds integer
)
RETURNS TABLE(run_id uuid, cursor_start text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
declare
  v_worker constant text := 'batch-analysis';
  v_lock_key bigint;
  v_now timestamptz := now();
  v_expires timestamptz;
  v_run record;
  v_new_run uuid;
begin
  if p_scope is null or p_scope !~ '^\d{4}-\d{2}-\d{2}:(premarket|rth|postclose)$' then
    raise exception 'invalid_scope';
  end if;
  if p_session_type is null then
    raise exception 'invalid_session_type';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'invalid_lease_seconds';
  end if;

  v_lock_key := ('x' || substr(md5('wl-v2:' || v_worker || ':' || p_scope), 1, 16))::bit(64)::bigint;
  if not pg_try_advisory_xact_lock(v_lock_key) then
    return;
  end if;

  v_expires := v_now + make_interval(secs => p_lease_seconds);

  -- Newest run for this exact worker_type + scope.
  select r.run_id, r.status, r.cursor_end,
         coalesce((r.reason_codes->>'lease_expires_at')::timestamptz, v_now) as lease_expires_at
    into v_run
    from public.watchlist_analysis_runs r
   where r.mode = 'batch'
     and coalesce((r.reason_codes->>'worker_type'),'') = v_worker
     and coalesce((r.reason_codes->>'scope'),'') = p_scope
   order by r.started_at desc
   limit 1
   for update;

  if found then
    if v_run.status = 'running' and v_run.lease_expires_at > v_now then
      -- Active worker holds the lease.
      return;
    end if;

    if v_run.status = 'budget_resumed' then
      update public.watchlist_analysis_runs r
         set status = 'running',
             finished_at = null,
             reason_codes = jsonb_set(
               coalesce(r.reason_codes,'{}'::jsonb),
               array['lease_expires_at'], to_jsonb(v_expires), true)
       where r.run_id = v_run.run_id;
      run_id := v_run.run_id;
      cursor_start := coalesce(v_run.cursor_end,'');
      return next;
      return;
    end if;

    if v_run.status = 'running' and v_run.lease_expires_at <= v_now then
      update public.watchlist_analysis_runs r
         set reason_codes = jsonb_set(
               coalesce(r.reason_codes,'{}'::jsonb),
               array['lease_expires_at'], to_jsonb(v_expires), true)
       where r.run_id = v_run.run_id;
      run_id := v_run.run_id;
      cursor_start := coalesce(v_run.cursor_end,'');
      return next;
      return;
    end if;
    -- completed or failed -> fall through to create a fresh cycle.
  end if;

  insert into public.watchlist_analysis_runs
    (mode, session_type, started_at, status, cursor_start, cursor_end,
     tickers_total, tickers_ok, tickers_unavailable, tickers_error, reason_codes)
  values
    ('batch', p_session_type, v_now, 'running', '', '',
     0, 0, 0, 0,
     jsonb_build_object(
       'worker','wl-v2',
       'worker_type', v_worker,
       'scope', p_scope,
       'lease_expires_at', v_expires,
       'errors', '{}'::jsonb
     ))
  returning watchlist_analysis_runs.run_id into v_new_run;

  run_id := v_new_run;
  cursor_start := '';
  return next;
  return;
end;
$function$;

REVOKE ALL ON FUNCTION public.claim_wl_v2_analysis_cycle(text, public.watchlist_session, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_wl_v2_analysis_cycle(text, public.watchlist_session, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_wl_v2_analysis_cycle(text, public.watchlist_session, integer) TO service_role;
