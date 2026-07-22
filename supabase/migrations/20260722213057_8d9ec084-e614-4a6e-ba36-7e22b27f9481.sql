-- W2-B1A: additive analysis-request tracking table.
-- Service-role only for INSERT/UPDATE. Authenticated: SELECT own rows only.

CREATE TABLE public.watchlist_analysis_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  source text not null check (source in ('trigger','manual')),
  status text not null default 'pending' check (status in ('pending','succeeded','failed')),
  error_code text check (error_code in (
    'RATE_LIMITED','PROVIDER_TIMEOUT','PROVIDER_ERROR',
    'AI_VALIDATION_FAILED','UPSTREAM_ERROR','UNKNOWN'
  )),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint watchlist_analysis_requests_status_consistency check (
    (status = 'pending'   and error_code is null     and completed_at is null) or
    (status = 'succeeded' and error_code is null     and completed_at is not null) or
    (status = 'failed'    and error_code is not null and completed_at is not null)
  )
);

create index watchlist_analysis_requests_owner_ticker_idx
  on public.watchlist_analysis_requests (user_id, ticker, requested_at desc);

alter table public.watchlist_analysis_requests enable row level security;

revoke all on public.watchlist_analysis_requests from anon;
revoke all on public.watchlist_analysis_requests from authenticated;
grant select on public.watchlist_analysis_requests to authenticated;
-- No insert/update/delete grant to authenticated. Service role bypasses RLS/grants.

create policy "Users read own analysis requests"
  on public.watchlist_analysis_requests for select
  to authenticated
  using (auth.uid() = user_id);

DO $cmd$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'watchlist_analysis_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.watchlist_analysis_requests;
  END IF;
END
$cmd$;

CREATE OR REPLACE FUNCTION public.trigger_watchlist_analysis()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $cmd$
DECLARE
  v_secret_count integer;
  v_secret       text;
  v_request_id   bigint;
BEGIN
  SELECT count(*) INTO v_secret_count
  FROM vault.decrypted_secrets
  WHERE name = 'sync_secret';

  IF v_secret_count <> 1 THEN
    RAISE WARNING 'trigger_watchlist_analysis: expected exactly 1 vault secret named sync_secret, found %; skipping analysis call', v_secret_count;
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'sync_secret';

  SELECT net.http_post(
    url     := 'https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/analyze-watchlist-tickers',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_secret
               ),
    body    := jsonb_build_object(
                 'record', jsonb_build_object('symbol', NEW.symbol, 'user_id', NEW.user_id)
               )
  ) INTO v_request_id;

  RETURN NEW;
END;
$cmd$;