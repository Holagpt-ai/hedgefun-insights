-- W2-P1 (M1): trigger_watchlist_analysis now reads sync_secret from Vault.
-- Target URL unchanged (legacy analyzer). Envelope unchanged {record:{symbol}}.
-- Fail-closed: if the Vault row is not exactly one, skip the HTTP call
-- with a WARNING and still allow the watchlist insert to succeed.

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
    body    := jsonb_build_object('record', jsonb_build_object('symbol', NEW.symbol))
  ) INTO v_request_id;

  RETURN NEW;
END;
$cmd$;
