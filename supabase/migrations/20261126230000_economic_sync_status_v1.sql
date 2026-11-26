-- Economic calendar sync coverage metadata (prepared for Lovable apply only).

create table if not exists public.economic_sync_status (
  id smallint primary key default 1 check (id = 1),
  provider text,
  last_success_at timestamptz,
  last_window_from date,
  last_window_to date,
  last_row_count integer not null default 0,
  last_error_class text,
  updated_at timestamptz not null default now()
);

alter table public.economic_sync_status enable row level security;

create policy "economic_sync_status_public_read"
  on public.economic_sync_status
  for select
  to anon, authenticated
  using (true);

revoke insert, update, delete, truncate on public.economic_sync_status from anon, authenticated;
grant select on public.economic_sync_status to anon, authenticated;

insert into public.economic_sync_status (id, provider)
values (1, null)
on conflict (id) do nothing;

comment on table public.economic_sync_status is
  'Singleton row describing last authorized economic calendar sync (coverage — not a substitute for release data).';