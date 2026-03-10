-- PROFILES
CREATE TABLE IF NOT EXISTS profiles (
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

-- STOCKS MASTER
CREATE TABLE IF NOT EXISTS stocks (
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
CREATE TABLE IF NOT EXISTS market_movers (
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

-- MARKET INDEXES
CREATE TABLE IF NOT EXISTS market_indexes (
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
CREATE TABLE IF NOT EXISTS ipo_list (
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
CREATE TABLE IF NOT EXISTS market_news (
  id uuid default gen_random_uuid() primary key,
  headline text not null,
  source text,
  url text,
  category text check (category in ('markets','stocks','ipo','etf','general')),
  published_at timestamptz default now()
);

-- USER WATCHLISTS
CREATE TABLE IF NOT EXISTS watchlists (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  symbol text not null,
  added_at timestamptz default now(),
  unique(user_id, symbol)
);

-- EARNINGS CALENDAR
CREATE TABLE IF NOT EXISTS earnings_calendar (
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

-- SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS subscriptions (
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
CREATE TABLE IF NOT EXISTS chatbot_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete set null,
  session_token text not null unique,
  messages jsonb default '[]',
  total_tokens_used integer default 0,
  created_at timestamptz default now(),
  last_active_at timestamptz default now()
);

-- AGENTIC SEO LOG
CREATE TABLE IF NOT EXISTS agentic_seo_log (
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
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_movers ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_indexes ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipo_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE earnings_calendar ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users manage own watchlist" ON watchlists FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users view own subscription" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users view own chat sessions" ON chatbot_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Public read stocks" ON stocks FOR SELECT USING (true);
CREATE POLICY "Public read movers" ON market_movers FOR SELECT USING (true);
CREATE POLICY "Public read indexes" ON market_indexes FOR SELECT USING (true);
CREATE POLICY "Public read news" ON market_news FOR SELECT USING (true);
CREATE POLICY "Public read ipos" ON ipo_list FOR SELECT USING (true);
CREATE POLICY "Public read earnings" ON earnings_calendar FOR SELECT USING (true);

-- TRIGGER: handle_new_user
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, avatar_url)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- TRIGGER: auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

CREATE OR REPLACE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();