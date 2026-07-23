set search_path = public;

create or replace function public.finalize_watchlist_analysis_v2(
  p_request_id uuid,
  p_payload    jsonb,
  p_alerts     jsonb,
  p_run_id     uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_status       text;
  v_ticker       text;
  v_session_date date;
  v_session_type public.watchlist_session;
  v_direction    public.watchlist_direction;
  v_alert        jsonb;
begin
  select status, ticker
    into v_status, v_ticker
    from public.watchlist_analysis_requests
   where id = p_request_id
   for update;
  if not found then
    raise exception 'request not found' using errcode = 'P0001';
  end if;
  if v_status <> 'pending' then
    raise exception 'request already finalized' using errcode = 'P0002';
  end if;

  if (p_payload->>'contract_version')::int <> 2 then
    raise exception 'bad_contract_version' using errcode = 'P0003';
  end if;
  if (p_payload->>'ticker') <> v_ticker then
    raise exception 'ticker_mismatch' using errcode = 'P0004';
  end if;

  v_session_date := (p_payload->>'session_date')::date;
  v_session_type := (p_payload->>'session_type')::public.watchlist_session;
  v_direction    := (p_payload->>'direction')::public.watchlist_direction;

  insert into public.watchlist_analysis_v2 (
    ticker, contract_version, session_date, session_type, valid_through,
    direction, explanation, driver_ids, failure_reason,
    price, change_pct, intraday, volume, rvol, rvol_class,
    market_signals, recent_events, key_levels, inputs_quality,
    analyzed_at, run_id
  ) values (
    v_ticker, 2, v_session_date, v_session_type,
    (p_payload->>'valid_through')::timestamptz,
    v_direction,
    p_payload->>'explanation',
    coalesce(p_payload->'driver_ids', '[]'::jsonb),
    p_payload->>'failure_reason',
    nullif(p_payload->>'price','')::numeric,
    nullif(p_payload->>'change_pct','')::numeric,
    coalesce(p_payload->'intraday', '[]'::jsonb),
    nullif(p_payload->>'volume','')::bigint,
    nullif(p_payload->>'rvol','')::numeric,
    nullif(p_payload->>'rvol_class','')::text,
    coalesce(p_payload->'market_signals', '[]'::jsonb),
    coalesce(p_payload->'recent_events', '[]'::jsonb),
    coalesce(p_payload->'key_levels', '{}'::jsonb),
    coalesce(p_payload->'inputs_quality', '{}'::jsonb),
    (p_payload->>'analyzed_at')::timestamptz,
    p_run_id
  )
  on conflict (ticker) do update set
    contract_version = excluded.contract_version,
    session_date     = excluded.session_date,
    session_type     = excluded.session_type,
    valid_through    = excluded.valid_through,
    direction        = excluded.direction,
    explanation      = excluded.explanation,
    driver_ids       = excluded.driver_ids,
    failure_reason   = excluded.failure_reason,
    price            = excluded.price,
    change_pct       = excluded.change_pct,
    intraday         = excluded.intraday,
    volume           = excluded.volume,
    rvol             = excluded.rvol,
    rvol_class       = excluded.rvol_class,
    market_signals   = excluded.market_signals,
    recent_events    = excluded.recent_events,
    key_levels       = excluded.key_levels,
    inputs_quality   = excluded.inputs_quality,
    analyzed_at      = excluded.analyzed_at,
    run_id           = excluded.run_id;

  insert into public.watchlist_analysis_history (
    ticker, session_date, session_type,
    direction, explanation, market_signals, analyzed_at, run_id
  ) values (
    v_ticker, v_session_date, v_session_type,
    v_direction,
    p_payload->>'explanation',
    coalesce(p_payload->'market_signals', '[]'::jsonb),
    (p_payload->>'analyzed_at')::timestamptz,
    p_run_id
  );

  if p_alerts is not null and jsonb_typeof(p_alerts) = 'array' then
    for v_alert in select * from jsonb_array_elements(p_alerts) loop
      insert into public.watchlist_alerts_v2 (
        ticker, alert_type, reason, facts, event_time, session_date, dedupe_key
      ) values (
        v_ticker,
        v_alert->>'alert_type',
        v_alert->>'reason',
        coalesce(v_alert->'facts', '{}'::jsonb),
        coalesce((v_alert->>'event_time')::timestamptz, now()),
        nullif(v_alert->>'session_date','')::date,
        v_alert->>'dedupe_key'
      )
      on conflict (dedupe_key) do nothing;
    end loop;
  end if;

  update public.watchlist_analysis_requests
     set status = 'succeeded',
         completed_at = now(),
         error_code = null
   where id = p_request_id;

  if p_run_id is not null then
    update public.watchlist_analysis_runs
       set tickers_ok = coalesce(tickers_ok, 0) + 1,
           finished_at = now()
     where run_id = p_run_id;
  end if;
end;
$fn$;

revoke all on function public.finalize_watchlist_analysis_v2(uuid, jsonb, jsonb, uuid) from public;
revoke all on function public.finalize_watchlist_analysis_v2(uuid, jsonb, jsonb, uuid) from anon;
revoke all on function public.finalize_watchlist_analysis_v2(uuid, jsonb, jsonb, uuid) from authenticated;
grant execute on function public.finalize_watchlist_analysis_v2(uuid, jsonb, jsonb, uuid) to service_role;

create or replace function public.fail_watchlist_analysis_v2(
  p_request_id uuid,
  p_error_code text,
  p_run_id     uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_status text;
begin
  if p_error_code not in (
    'RATE_LIMITED','PROVIDER_TIMEOUT','PROVIDER_ERROR',
    'AI_VALIDATION_FAILED','UPSTREAM_ERROR','UNKNOWN'
  ) then
    raise exception 'bad error_code' using errcode = 'P0005';
  end if;

  select status into v_status
    from public.watchlist_analysis_requests
   where id = p_request_id
   for update;
  if not found then
    raise exception 'request not found' using errcode = 'P0001';
  end if;
  if v_status <> 'pending' then
    raise exception 'request already finalized' using errcode = 'P0002';
  end if;

  update public.watchlist_analysis_requests
     set status = 'failed',
         completed_at = now(),
         error_code = p_error_code
   where id = p_request_id;

  if p_run_id is not null then
    update public.watchlist_analysis_runs
       set tickers_error = coalesce(tickers_error, 0) + 1,
           finished_at   = now()
     where run_id = p_run_id;
  end if;
end;
$fn$;

revoke all on function public.fail_watchlist_analysis_v2(uuid, text, uuid) from public;
revoke all on function public.fail_watchlist_analysis_v2(uuid, text, uuid) from anon;
revoke all on function public.fail_watchlist_analysis_v2(uuid, text, uuid) from authenticated;
grant execute on function public.fail_watchlist_analysis_v2(uuid, text, uuid) to service_role;