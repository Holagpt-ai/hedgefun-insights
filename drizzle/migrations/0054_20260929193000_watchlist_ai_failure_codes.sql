-- Distinguish watchlist AI transport failures from market-data provider codes.
-- Polygon stages keep RATE_LIMITED / PROVIDER_TIMEOUT / PROVIDER_ERROR.

alter table public.watchlist_analysis_requests
  drop constraint if exists watchlist_analysis_requests_error_code_check;

alter table public.watchlist_analysis_requests
  add constraint watchlist_analysis_requests_error_code_check
  check (
    error_code is null or error_code in (
      'RATE_LIMITED', 'PROVIDER_TIMEOUT', 'PROVIDER_ERROR',
      'AI_TIMEOUT', 'AI_RATE_LIMITED', 'AI_PROVIDER_ERROR', 'AI_AUTH',
      'AI_VALIDATION_FAILED', 'UPSTREAM_ERROR', 'UNKNOWN'
    )
  );

create or replace function public.fail_watchlist_analysis_v2(
  p_request_id uuid,
  p_user_id    uuid,
  p_error_code text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $cmd$
declare
  v_status   text;
  v_req_user uuid;
begin
  if p_request_id is null or p_user_id is null then
    raise exception 'missing_parameters' using errcode = 'P0006';
  end if;
  if p_error_code not in (
    'RATE_LIMITED','PROVIDER_TIMEOUT','PROVIDER_ERROR',
    'AI_TIMEOUT','AI_RATE_LIMITED','AI_PROVIDER_ERROR','AI_AUTH',
    'AI_VALIDATION_FAILED','UPSTREAM_ERROR','UNKNOWN'
  ) then
    raise exception 'bad_error_code' using errcode = 'P0005';
  end if;

  select status, user_id
    into v_status, v_req_user
    from public.watchlist_analysis_requests
   where id = p_request_id
   for update;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0001';
  end if;
  if v_req_user <> p_user_id then
    raise exception 'user_mismatch' using errcode = 'P0007';
  end if;
  if v_status = 'failed' then
    return pg_catalog.jsonb_build_object('status', 'already_failed');
  end if;
  if v_status = 'succeeded' then
    raise exception 'request_already_succeeded' using errcode = 'P0002';
  end if;
  if v_status <> 'pending' then
    raise exception 'request_already_finalized' using errcode = 'P0002';
  end if;

  update public.watchlist_analysis_requests
     set status = 'failed',
         completed_at = pg_catalog.now(),
         error_code = p_error_code
   where id = p_request_id;

  return pg_catalog.jsonb_build_object('status', 'failed');
end;
$cmd$;