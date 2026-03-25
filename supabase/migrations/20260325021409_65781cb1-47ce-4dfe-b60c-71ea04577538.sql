
SELECT cron.schedule(
  'sync-ipo-news-every-30min',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/sync-ipo-news',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
