-- W2-B1C-R3: Finalizer SQL runtime repair
-- Mechanical fix only: pg_catalog.coalesce/nullif -> coalesce/nullif
-- All other R2 logic preserved verbatim.

CREATE OR REPLACE FUNCTION public.finalize_watchlist_analysis_v2(
  p_request_id uuid,
  p_user_id uuid,
  p_ticker text,
  p_payload jsonb,
  p_alerts jsonb,
  p_run_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
declare
  v_status         text;
  v_req_user       uuid;
  v_req_ticker     text;
  v_ticker         text;
  v_session_date   date;
  v_session_type   public.watchlist_session;
  v_direction      public.watchlist_direction;
  v_prior_dir      public.watchlist_direction;
  v_alert          jsonb;
  v_run_status     text;
  v_run_session    public.watchlist_session;
  v_alerts_created integer := 0;
  v_owns_now       integer;
  v_analyzed_at    timestamptz;
  v_valid_through  timestamptz;
  v_alert_type     text;
  v_alert_ticker   text;
  v_alert_reason   text;
  v_alert_dedupe   text;
  v_alert_facts    jsonb;
  v_facts_kv       jsonb;
  v_from_dir       text;
  v_to_dir         text;
begin
  if p_request_id is null or p_user_id is null or p_ticker is null or p_payload is null then
    raise exception 'missing_parameters' using errcode = 'P0006';
  end if;

  select status, user_id, ticker
    into v_status, v_req_user, v_req_ticker
    from public.watchlist_analysis_requests
   where id = p_request_id
   for update;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0001';
  end if;
  if v_req_user <> p_user_id then
    raise exception 'user_mismatch' using errcode = 'P0007';
  end if;
  if v_req_ticker <> p_ticker then
    raise exception 'ticker_mismatch' using errcode = 'P0004';
  end if;
  if v_status = 'succeeded' then
    return pg_catalog.jsonb_build_object('status', 'already_finalized', 'alerts_created', 0);
  end if;
  if v_status = 'failed' then
    raise exception 'request_already_failed' using errcode = 'P0002';
  end if;
  if v_status <> 'pending' then
    raise exception 'request_already_finalized' using errcode = 'P0002';
  end if;

  select 1 into v_owns_now
    from public.watchlists
   where user_id = p_user_id and symbol = p_ticker
   limit 1;
  if v_owns_now is null then
    raise exception 'not_permitted' using errcode = 'P0007';
  end if;

  if (p_payload->>'contract_version')::int <> 2 then
    raise exception 'bad_contract_version' using errcode = 'P0003';
  end if;
  if (p_payload->>'ticker') <> p_ticker then
    raise exception 'ticker_mismatch' using errcode = 'P0004';
  end if;
  v_session_date := (p_payload->>'session_date')::date;
  v_session_type := (p_payload->>'session_type')::public.watchlist_session;
  v_direction    := (p_payload->>'direction')::public.watchlist_direction;
  v_analyzed_at  := (p_payload->>'analyzed_at')::timestamptz;
  v_valid_through:= (p_payload->>'valid_through')::timestamptz;
  if v_valid_through <= v_analyzed_at then
    raise exception 'valid_through_not_after_analyzed_at' using errcode = 'P0003';
  end if;
  if v_direction = 'data_unavailable' then
    if coalesce(pg_catalog.length(p_payload->>'failure_reason'), 0) = 0 then
      raise exception 'missing_failure_reason' using errcode = 'P0003';
    end if;
  else
    if p_payload ? 'failure_reason' and pg_catalog.jsonb_typeof(p_payload->'failure_reason') <> 'null' then
      raise exception 'unexpected_failure_reason' using errcode = 'P0003';
    end if;
  end if;
  if coalesce(pg_catalog.length(p_payload->>'explanation'), 0) = 0 then
    raise exception 'bad_explanation' using errcode = 'P0003';
  end if;
  if pg_catalog.jsonb_typeof(p_payload->'driver_ids') <> 'array' then
    raise exception 'bad_driver_ids' using errcode = 'P0003';
  end if;
  if pg_catalog.jsonb_typeof(p_payload->'intraday') <> 'array' then
    raise exception 'bad_intraday' using errcode = 'P0003';
  end if;
  if pg_catalog.jsonb_typeof(p_payload->'market_signals') <> 'array' then
    raise exception 'bad_market_signals' using errcode = 'P0003';
  end if;
  if pg_catalog.jsonb_typeof(p_payload->'recent_events') <> 'array' then
    raise exception 'bad_recent_events' using errcode = 'P0003';
  end if;
  if pg_catalog.jsonb_typeof(p_payload->'key_levels') <> 'object' then
    raise exception 'bad_key_levels' using errcode = 'P0003';
  end if;
  if pg_catalog.jsonb_typeof(p_payload->'inputs_quality') <> 'object' then
    raise exception 'bad_inputs_quality' using errcode = 'P0003';
  end if;
  if p_payload ? 'volume'
     and pg_catalog.jsonb_typeof(p_payload->'volume') <> 'null'
     and (p_payload->>'volume')::numeric < 0 then
    raise exception 'bad_volume' using errcode = 'P0003';
  end if;
  if p_payload ? 'rvol'
     and pg_catalog.jsonb_typeof(p_payload->'rvol') <> 'null'
     and (p_payload->>'rvol')::numeric < 0 then
    raise exception 'bad_rvol' using errcode = 'P0003';
  end if;

  if public._wl_v2_has_forbidden_key(p_payload) then
    raise exception 'forbidden_key' using errcode = 'P0008';
  end if;
  if p_alerts is not null and public._wl_v2_has_forbidden_key(p_alerts) then
    raise exception 'forbidden_key' using errcode = 'P0008';
  end if;

  if p_run_id is not null then
    select status, session_type
      into v_run_status, v_run_session
      from public.watchlist_analysis_runs
     where run_id = p_run_id
     for update;
    if not found then
      raise exception 'invalid_run_id' using errcode = 'P0009';
    end if;
    if v_run_status <> 'running' then
      raise exception 'invalid_run_id' using errcode = 'P0009';
    end if;
    if v_run_session is not null and v_run_session <> v_session_type then
      raise exception 'invalid_run_id' using errcode = 'P0009';
    end if;
  end if;

  select direction into v_prior_dir
    from public.watchlist_analysis_v2
   where ticker = p_ticker;

  v_ticker := p_ticker;

  insert into public.watchlist_analysis_v2 (
    ticker, contract_version, session_date, session_type, valid_through,
    direction, explanation, driver_ids, failure_reason,
    price, change_pct, intraday, volume, rvol, rvol_class,
    market_signals, recent_events, key_levels, inputs_quality,
    analyzed_at, run_id
  ) values (
    v_ticker, 2, v_session_date, v_session_type,
    v_valid_through, v_direction,
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
    v_analyzed_at, p_run_id
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
    v_analyzed_at, p_run_id
  );

  if p_alerts is not null and pg_catalog.jsonb_typeof(p_alerts) = 'array' then
    for v_alert in select value from pg_catalog.jsonb_array_elements(p_alerts) loop
      v_alert_type   := v_alert->>'alert_type';
      v_alert_ticker := v_alert->>'ticker';
      v_alert_reason := v_alert->>'reason';
      v_alert_dedupe := v_alert->>'dedupe_key';
      v_alert_facts  := coalesce(v_alert->'facts', '{}'::jsonb);

      if v_alert_type = 'key_level' then
        raise exception 'key_level_not_allowed' using errcode = 'P0010';
      end if;
      if v_alert_type not in (
           'direction_change','unusual_volume','market_signal',
           'company_event','earnings_upcoming'
         ) then
        raise exception 'bad_alert_type' using errcode = 'P0010';
      end if;
      if v_alert_ticker is null or v_alert_ticker <> p_ticker then
        raise exception 'bad_alert_ticker' using errcode = 'P0010';
      end if;
      if coalesce(pg_catalog.length(v_alert_reason), 0) = 0 then
        raise exception 'bad_alert_reason' using errcode = 'P0010';
      end if;
      if coalesce(pg_catalog.length(v_alert_dedupe), 0) = 0 then
        raise exception 'bad_alert_dedupe' using errcode = 'P0010';
      end if;
      if pg_catalog.jsonb_typeof(v_alert_facts) <> 'object' then
        raise exception 'bad_alert_facts' using errcode = 'P0010';
      end if;
      for v_facts_kv in select value from pg_catalog.jsonb_each(v_alert_facts) loop
        if pg_catalog.jsonb_typeof(v_facts_kv) not in ('string','number','boolean','null') then
          raise exception 'bad_alert_facts' using errcode = 'P0010';
        end if;
      end loop;
      if coalesce(pg_catalog.length(v_alert->>'event_time'), 0) = 0 then
        raise exception 'bad_alert_event_time' using errcode = 'P0010';
      end if;
      if coalesce(pg_catalog.length(v_alert->>'session_date'), 0) = 0 then
        raise exception 'bad_alert_session_date' using errcode = 'P0010';
      end if;

      if v_alert_type = 'direction_change' then
        if v_prior_dir is null then
          raise exception 'no_prior_direction' using errcode = 'P0010';
        end if;
        if v_prior_dir = 'data_unavailable' or v_direction = 'data_unavailable' then
          raise exception 'unavailable_direction_change' using errcode = 'P0010';
        end if;
        v_from_dir := v_alert_facts->>'from';
        v_to_dir   := v_alert_facts->>'to';
        if v_from_dir is null or v_to_dir is null then
          raise exception 'bad_direction_change_facts' using errcode = 'P0010';
        end if;
        if v_from_dir <> v_prior_dir::text then
          raise exception 'stale_prior_direction' using errcode = 'P0010';
        end if;
        if v_to_dir <> v_direction::text then
          raise exception 'stale_new_direction' using errcode = 'P0010';
        end if;
        if v_prior_dir = v_direction then
          raise exception 'no_direction_change' using errcode = 'P0010';
        end if;
      end if;

      insert into public.watchlist_alerts_v2 (
        ticker, alert_type, reason, facts, event_time, session_date, dedupe_key
      ) values (
        v_alert_ticker, v_alert_type, v_alert_reason, v_alert_facts,
        (v_alert->>'event_time')::timestamptz,
        (v_alert->>'session_date')::date,
        v_alert_dedupe
      )
      on conflict (dedupe_key) do nothing;
      if found then
        v_alerts_created := v_alerts_created + 1;
      end if;
    end loop;
  end if;

  update public.watchlist_analysis_requests
     set status = 'succeeded',
         completed_at = pg_catalog.now(),
         error_code = null
   where id = p_request_id;

  if p_run_id is not null then
    if v_direction = 'data_unavailable' then
      update public.watchlist_analysis_runs
         set tickers_total = coalesce(tickers_total, 0) + 1,
             tickers_unavailable = coalesce(tickers_unavailable, 0) + 1
       where run_id = p_run_id and status = 'running';
    else
      update public.watchlist_analysis_runs
         set tickers_total = coalesce(tickers_total, 0) + 1,
             tickers_ok    = coalesce(tickers_ok, 0) + 1
       where run_id = p_run_id and status = 'running';
    end if;
  end if;

  return pg_catalog.jsonb_build_object('status', 'succeeded', 'alerts_created', v_alerts_created);
end;
$function$;

REVOKE ALL ON FUNCTION public.finalize_watchlist_analysis_v2(uuid,uuid,text,jsonb,jsonb,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_watchlist_analysis_v2(uuid,uuid,text,jsonb,jsonb,uuid) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_watchlist_analysis_v2(uuid,uuid,text,jsonb,jsonb,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_watchlist_analysis_v2(uuid,uuid,text,jsonb,jsonb,uuid) TO service_role;
