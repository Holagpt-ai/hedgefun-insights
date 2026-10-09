# CI tests this worker on Deno 2.9.4. Lockfile version 5 is readable by 2.3+ and 2.9.4.
FROM denoland/deno:2.9.4
WORKDIR /repo
COPY services/scanner-stream-worker ./services/scanner-stream-worker
COPY supabase/functions/_shared/markets ./supabase/functions/_shared/markets
COPY supabase/functions/_shared/screeners/selection.ts ./supabase/functions/_shared/screeners/selection.ts
COPY supabase/functions/_shared/screeners/baseline-exclusion-publish.ts ./supabase/functions/_shared/screeners/baseline-exclusion-publish.ts
COPY supabase/functions/_shared/screeners/baseline-corporate-action.ts ./supabase/functions/_shared/screeners/baseline-corporate-action.ts
COPY supabase/functions/_shared/radar-v22 ./supabase/functions/_shared/radar-v22
COPY src/lib/screeners/previous-session-facts.ts ./src/lib/screeners/previous-session-facts.ts
COPY src/lib/radar/radar-event-engine.ts ./src/lib/radar/radar-event-engine.ts
COPY src/lib/radar/intraday-participation.ts ./src/lib/radar/intraday-participation.ts
COPY src/lib/radar/cumulative-session-volume.ts ./src/lib/radar/cumulative-session-volume.ts
COPY src/config/intraday-participation.config.ts ./src/config/intraday-participation.config.ts
COPY supabase/functions/_shared/scanner-alerts ./supabase/functions/_shared/scanner-alerts
COPY supabase/functions/_shared/market-feed ./supabase/functions/_shared/market-feed
WORKDIR /repo/services/scanner-stream-worker
RUN deno cache src/main.ts
EXPOSE 8080
CMD ["run", "--allow-net", "--allow-env", "src/main.ts"]
