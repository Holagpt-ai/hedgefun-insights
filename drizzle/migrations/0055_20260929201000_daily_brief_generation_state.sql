-- Failure state for a scheduled brief lives beside daily_briefs.
-- daily_briefs.content stays the brief text. This table never stores provider
-- messages, prompts, or a stand-in brief.

create table public.daily_brief_generation_state (
  brief_type text not null check (brief_type in ('am', 'pm')),
  brief_date date not null,
  status text not null check (status in ('insufficient_evidence', 'temporarily_unavailable')),
  failure_category text not null check (failure_category in (
    'AUTH',
    'RATE_LIMIT',
    'TIMEOUT',
    'PROVIDER_5XX',
    'MALFORMED_RESPONSE',
    'SCHEMA_VALIDATION',
    'INSUFFICIENT_EVIDENCE',
    'STALE_INPUT',
    'COST_GUARD',
    'UNKNOWN'
  )),
  retryable boolean not null,
  failed_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (brief_type, brief_date)
);

alter table public.daily_brief_generation_state enable row level security;

revoke all on public.daily_brief_generation_state from public;
revoke all on public.daily_brief_generation_state from anon;
revoke all on public.daily_brief_generation_state from authenticated;
grant select, insert, update, delete on public.daily_brief_generation_state to service_role;