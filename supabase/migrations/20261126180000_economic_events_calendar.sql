-- Catalyst Calendar V4 macro feed (prepared for Lovable Cloud apply — not executed from Cursor).

create table if not exists public.economic_events (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text unique,
  event_name text not null,
  country text,
  event_date date not null,
  event_time time without time zone,
  importance text,
  actual_value text,
  consensus_estimate text,
  previous_value text,
  units text,
  source text,
  source_url text,
  provider text,
  description text,
  actual_reported_at timestamptz,
  fetched_at timestamptz not null default now()
);

create index if not exists economic_events_event_date_idx on public.economic_events (event_date);

alter table public.economic_events enable row level security;

create policy "economic_events_public_read"
  on public.economic_events
  for select
  to anon, authenticated
  using (true);

-- Writes are service-role only (sync-economic-calendar Edge function).
revoke insert, update, delete, truncate on public.economic_events from anon, authenticated;
grant select on public.economic_events to anon, authenticated;

create index if not exists economic_events_country_date_idx
  on public.economic_events (country, event_date);

alter table public.economic_events
  add constraint economic_events_importance_check
  check (importance is null or importance in ('high', 'medium', 'low'));

comment on table public.economic_events is 'US and global macro releases for Catalyst Calendar V4 (provider-synced; no fabricated values).';