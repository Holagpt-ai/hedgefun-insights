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
   where r.mode = 'batch'
     and coalesce((r.reason_codes->>'worker_type'),'') = p_worker
     and r.status = 'running'
     and coalesce((r.reason_codes->>'scope'),'') = coalesce(p_scope,'')
     and coalesce((r.reason_codes->>'lease_expires_at')::timestamptz, v_now) > v_now
   limit 1;
  if found then return; end if;

  select coalesce(r.cursor_end,'') into v_prev_cursor
    from public.watchlist_analysis_runs r
   where r.mode = 'batch'
     and coalesce((r.reason_codes->>'worker_type'),'') = p_worker
     and r.status = 'budget_resumed'
     and coalesce((r.reason_codes->>'scope'),'') = coalesce(p_scope,'')
   order by r.finished_at desc nulls last, r.started_at desc
   limit 1;

  v_expires := v_now + make_interval(secs => p_lease_seconds);

  insert into public.watchlist_analysis_runs
    (mode, session_type, started_at, status, cursor_start, cursor_end,
     tickers_total, tickers_ok, tickers_unavailable, tickers_error, reason_codes)
  values
    ('batch', null, v_now, 'running', coalesce(v_prev_cursor,''), coalesce(v_prev_cursor,''),
     0, 0, 0, 0,
     jsonb_build_object('worker','wl-v2','worker_type',p_worker,'scope',coalesce(p_scope,''),
                        'lease_expires_at', v_expires, 'errors','{}'::jsonb))
  returning watchlist_analysis_runs.run_id into v_new_run;

  run_id := v_new_run; cursor_start := coalesce(v_prev_cursor,''); return next;
end; $$;

revoke all on function public.claim_wl_v2_worker(text,text,integer) from public;
revoke all on function public.claim_wl_v2_worker(text,text,integer) from anon;
revoke all on function public.claim_wl_v2_worker(text,text,integer) from authenticated;
grant execute on function public.claim_wl_v2_worker(text,text,integer) to service_role;