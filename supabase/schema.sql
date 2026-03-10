-- HedgeFun.fun — Complete Database Schema
-- Run in Supabase SQL Editor after project creation

-- PROFILES
create table profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  full_name text,
  avatar_url text,
  plan text default 'free' check (plan in ('free','pro','admin')),
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text default 'inactive'
    check (subscription_status in ('active','inactive','canceled','past_due','trialing')),
  current_period_end timestamptz,
  preferred_language text default 'en' check (preferred_language in ('en','es')),
  preferred_theme text default 'light' check (preferred_theme in ('light','dark')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- STOCKS MASTER
create table stocks (
  id uuid default gen_random_uuid() primary key,
  symbol text unique not null,
  name text not null,
  price decimal(12,4),
  change_amount decimal(10,4),
  change_percent decimal(8,4),
  market_cap bigint,
  volume bigint,
  pe_ratio decimal(8,2),
  eps decimal(8,4),
  revenue bigint,
  week_52_high decimal(12,4),
  week_52_low decimal(12,4),
  beta decimal(6,4),
  sector text,
  industry text,
  exchange text,
  description text,
  website text,
  logo_url text,
  updated_at timestamptz default now()
);

-- MARKET MOVERS
create table market_movers (
  id uuid default gen_random_uuid() primary key,
  symbol text not null,
  name text not null,
  price decimal(12,4),
  change_percent decimal(8,4),
  volume bigint,
  type text check (type in ('gainer','loser','active','premarket','afterhours')),
  session_date date default current_date,
  updated_at timestamptz default now()
);

-- MARKET INDEXES (sparklines)
create table market_indexes (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  symbol text not null unique,
  current_value decimal(12,4),
  change_amount decimal(10,4),
  change_percent decimal(8,4),
  sparkline_data jsonb,
  updated_at timestamptz default now()
);

-- IPO LIST
create table ipo_list (
  id uuid default gen_random_uuid() primary key,
  symbol text,
  name text not null,
  ipo_date date not null,
  price_range text,
  offer_price decimal(10,2),
  status text check (status in ('recent','upcoming','spac')),
  exchange text,
  created_at timestamptz default now()
);

-- MARKET NEWS
create table market_news (
  id uuid default gen_random_uuid() primary key,
  headline text not null,
  source text,
  url text,
  category text check (category in ('markets','stocks','ipo','etf','general')),
  published_at timestamptz default now()
);

-- USER WATCHLISTS
create table watchlists (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  symbol text not null,
  added_at timestamptz default now(),
  unique(user_id, symbol)
);

-- EARNINGS CALENDAR
create table earnings_calendar (
  id uuid default gen_random_uuid() primary key,
  symbol text not null,
  company_name text not null,
  report_date date not null,
  estimate_eps decimal(8,4),
  actual_eps decimal(8,4),
  surprise_percent decimal(8,4),
  time_of_day text check (time_of_day in ('before_open','after_close','during')),
  created_at timestamptz default now()
);

-- SUBSCRIPTIONS (Stripe sync)
create table subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade unique,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan text check (plan in ('free','pro_monthly','pro_annual')) default 'free',
  status text check (status in ('active','inactive','canceled','past_due','trialing')) default 'inactive',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- CHATBOT SESSIONS
create table chatbot_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete set null,
  session_token text not null unique,
  messages jsonb default '[]',
  total_tokens_used integer default 0,
  created_at timestamptz default now(),
  last_active_at timestamptz default now()
);

-- AGENTIC SEO LOG
create table agentic_seo_log (
  id uuid default gen_random_uuid() primary key,
  symbol text not null,
  page_type text not null,
  generated_content jsonb,
  generator_model text,
  auditor_model text,
  audit_passed boolean,
  audit_score integer,
  cts_composite_score decimal(4,3),
  tier text check (tier in ('T1','T2','T3')),
  created_at timestamptz default now()
);

-- ROW LEVEL SECURITY
alter table profiles enable row level security;
alter table watchlists enable row level security;
alter table subscriptions enable row level security;
alter table chatbot_sessions enable row level security;
alter table stocks enable row level security;
alter table market_movers enable row level security;
alter table market_indexes enable row level security;
alter table market_news enable row level security;
alter table ipo_list enable row level security;
alter table earnings_calendar enable row level security;

create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Users manage own watchlist" on watchlists for all using (auth.uid() = user_id);
create policy "Users view own subscription" on subscriptions for select using (auth.uid() = user_id);
create policy "Users view own chat sessions" on chatbot_sessions for select using (auth.uid() = user_id);
create policy "Public read stocks" on stocks for select using (true);
create policy "Public read movers" on market_movers for select using (true);
create policy "Public read indexes" on market_indexes for select using (true);
create policy "Public read news" on market_news for select using (true);
create policy "Public read ipos" on ipo_list for select using (true);
create policy "Public read earnings" on earnings_calendar for select using (true);

-- AUTO-UPDATE updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on profiles
  for each row execute procedure update_updated_at();

create trigger subscriptions_updated_at
  before update on subscriptions
  for each row execute procedure update_updated_at();
