-- W2-P4 Watchlist V2 operations: worker leases, cursor + error accounting,
-- and pg_cron schedules. Additive only; does not modify locked V2 tables,
-- RLS, grants, the V1 analyzer, the V2 analyzer contract, or trigger_watchlist_analysis().

create or replace function public.claim_wl_v2_worker(
  p_worker text, p_scope text, p_lease_seconds integer
) returns table (run_id uuid, cursor_start text)
language plpgsql security definer set search_path = '' as $$
declare
  v_lock_key bigint;
  v_prev_cursor text;
  v_now timestamptz := now();
  v_expires timestamptz;
  v_new_run uuid;
begin
  if p_worker not in ('batch-analysis','rvol-baseline') then raise exception 'invalid_worker'; end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then raise exception 'invalid_lease_seconds'; end if;
  v_lock_key := ('x' || substr(md5('wl-v2:' || p_worker || ':' || coalesce(p_scope,'')), 1, 16))::bit(64)::bigint;
  if not pg_try_advisory_xact_lock(v_lock_key) then return; end if;

  perform 1 from public.watchlist_analysis_runs r
   where r.mode = p_worker and r.status = 'running'
     and coalesce((r.reason_codes->>'scope'),'') = coalesce(p_scope,'')
     and coalesce((r.reason_codes->>'lease_expires_at')::timestamptz, v_now) > v_now
   limit 1;
  if found then return; end if;

  select coalesce(r.cursor_end,'') into v_prev_cursor
    from public.watchlist_analysis_runs r
   where r.mode = p_worker and r.status = 'budget_resumed'
     and coalesce((r.reason_codes->>'scope'),'') = coalesce(p_scope,'')
   order by r.finished_at desc nulls last, r.started_at desc
   limit 1;

  v_expires := v_now + make_interval(secs => p_lease_seconds);

  insert into public.watchlist_analysis_runs
    (mode, session_type, started_at, status, cursor_start, cursor_end,
     tickers_total, tickers_ok, tickers_unavailable, tickers_error, reason_codes)
  values
    (p_worker, null, v_now, 'running', coalesce(v_prev_cursor,''), coalesce(v_prev_cursor,''),
     0, 0, 0, 0,
     jsonb_build_object('worker','wl-v2','scope',coalesce(p_scope,''),
                        'lease_expires_at', v_expires, 'errors','{}'::jsonb))
  returning watchlist_analysis_runs.run_id into v_new_run;

  run_id := v_new_run; cursor_start := coalesce(v_prev_cursor,''); return next;
end; $$;

create or replace function public.checkpoint_wl_v2_cursor(p_run_id uuid, p_cursor text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.watchlist_analysis_runs
     set cursor_end = coalesce(p_cursor, cursor_end)
   where run_id = p_run_id and status = 'running';
end; $$;

create or replace function public.record_wl_v2_run_error(p_run_id uuid, p_ticker text, p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_key text; v_code text;
begin
  v_key  := left(coalesce(p_ticker,''), 15);
  v_code := left(coalesce(p_code,'UNKNOWN'), 40);
  update public.watchlist_analysis_runs
     set tickers_total = coalesce(tickers_total,0) + 1,
         tickers_error = coalesce(tickers_error,0) + 1,
         reason_codes  = jsonb_set(coalesce(reason_codes,'{}'::jsonb),
                                   array['errors', v_key], to_jsonb(v_code), true)
   where run_id = p_run_id and status = 'running';
end; $$;

create or replace function public.complete_wl_v2_run(p_run_id uuid, p_status text, p_cursor_end text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('completed','budget_resumed','failed') then raise exception 'invalid_status'; end if;
  update public.watchlist_analysis_runs
     set status = p_status,
         cursor_end = coalesce(p_cursor_end, cursor_end),
         finished_at = now()
   where run_id = p_run_id and status = 'running';
end; $$;

create or replace function public.record_wl_v2_baseline_written(p_run_id uuid, p_ticker text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.watchlist_analysis_runs
     set tickers_total = coalesce(tickers_total,0) + 1,
         tickers_ok    = coalesce(tickers_ok,0) + 1
   where run_id = p_run_id and status = 'running';
end; $$;

revoke all on function public.claim_wl_v2_worker(text,text,integer) from public;
revoke all on function public.claim_wl_v2_worker(text,text,integer) from anon;
revoke all on function public.claim_wl_v2_worker(text,text,integer) from authenticated;
grant execute on function public.claim_wl_v2_worker(text,text,integer) to service_role;
revoke all on function public.checkpoint_wl_v2_cursor(uuid,text) from public;
revoke all on function public.checkpoint_wl_v2_cursor(uuid,text) from anon;
revoke all on function public.checkpoint_wl_v2_cursor(uuid,text) from authenticated;
grant execute on function public.checkpoint_wl_v2_cursor(uuid,text) to service_role;
revoke all on function public.record_wl_v2_run_error(uuid,text,text) from public;
revoke all on function public.record_wl_v2_run_error(uuid,text,text) from anon;
revoke all on function public.record_wl_v2_run_error(uuid,text,text) from authenticated;
grant execute on function public.record_wl_v2_run_error(uuid,text,text) to service_role;
revoke all on function public.complete_wl_v2_run(uuid,text,text) from public;
revoke all on function public.complete_wl_v2_run(uuid,text,text) from anon;
revoke all on function public.complete_wl_v2_run(uuid,text,text) from authenticated;
grant execute on function public.complete_wl_v2_run(uuid,text,text) to service_role;
revoke all on function public.record_wl_v2_baseline_written(uuid,text) from public;
revoke all on function public.record_wl_v2_baseline_written(uuid,text) from anon;
revoke all on function public.record_wl_v2_baseline_written(uuid,text) from authenticated;
grant execute on function public.record_wl_v2_baseline_written(uuid,text) to service_role;

do $cron$
declare
  v_url_analysis text := 'https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/run-watchlist-analysis-v2-batch';
  v_url_baseline text := 'https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/build-watchlist-rvol-baselines-v2';
  v_dispatch_analysis text;
  v_dispatch_baseline text;
begin
  v_dispatch_analysis := format($sql$
DO $inner$
DECLARE
  v_secret_count integer;
  v_secret text;
  v_request_id bigint;
BEGIN
  SELECT count(*) INTO v_secret_count FROM vault.decrypted_secrets WHERE name = 'sync_secret';
  IF v_secret_count <> 1 THEN
    RAISE WARNING 'wl-v2-batch-analysis: expected exactly one Vault sync_secret row; skip';
    RETURN;
  END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'sync_secret';
  SELECT net.http_post(
    url    := %L,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_secret),
    body   := '{}'::jsonb
  ) INTO v_request_id;
END;
$inner$;
$sql$, v_url_analysis);

  v_dispatch_baseline := format($sql$
DO $inner$
DECLARE
  v_secret_count integer;
  v_secret text;
  v_request_id bigint;
BEGIN
  SELECT count(*) INTO v_secret_count FROM vault.decrypted_secrets WHERE name = 'sync_secret';
  IF v_secret_count <> 1 THEN
    RAISE WARNING 'wl-v2-rvol-baselines: expected exactly one Vault sync_secret row; skip';
    RETURN;
  END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'sync_secret';
  SELECT net.http_post(
    url    := %L,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_secret),
    body   := '{}'::jsonb
  ) INTO v_request_id;
END;
$inner$;
$sql$, v_url_baseline);

  perform cron.unschedule(jobid) from cron.job where jobname = 'wl-v2-batch-analysis-10min';
  perform cron.schedule('wl-v2-batch-analysis-10min', '*/10 * * * 1-6', v_dispatch_analysis);

  perform cron.unschedule(jobid) from cron.job where jobname = 'wl-v2-rvol-baselines-nightly';
  perform cron.schedule('wl-v2-rvol-baselines-nightly', '30 1,2,3 * * 2-6', v_dispatch_baseline);
end;
$cron$;
