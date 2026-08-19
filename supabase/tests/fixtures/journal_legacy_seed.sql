-- Legacy Journal rows as they existed before 20260816190000.
-- Loaded only onto a disposable database that has been migrated through
-- 20260814180000. Do not apply to production.

CREATE TABLE IF NOT EXISTS public.journal_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  side text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  qty numeric NOT NULL,
  entry_price numeric NOT NULL,
  exit_price numeric,
  entry_date timestamptz NOT NULL,
  exit_date timestamptz,
  session_date date,
  target_price numeric,
  stop_price numeric,
  setup_tag text,
  return_dollars numeric,
  return_pct numeric,
  hold_duration_minutes integer,
  is_wash boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid NOT NULL REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  body text NOT NULL,
  note_type text NOT NULL DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_stats_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_trades integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  wash_trades integer NOT NULL DEFAULT 0,
  win_rate numeric,
  avg_win_dollars numeric,
  avg_loss_dollars numeric,
  total_pnl numeric,
  largest_win numeric,
  largest_loss numeric,
  period_start date,
  period_end date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS journal_stats_cache_user_id_key
  ON public.journal_stats_cache (user_id);

CREATE TABLE IF NOT EXISTS public.journal_equity_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  cumulative_pnl numeric NOT NULL DEFAULT 0,
  trade_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS journal_equity_snapshots_user_date_key
  ON public.journal_equity_snapshots (user_id, snapshot_date);

-- Two test users. IDs are stable so upgrade assertions can pin timestamps.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES
(
  '00000000-0000-0000-0000-000000000000',
  'a1111111-1111-4111-8111-0000000000aa',
  'authenticated', 'authenticated', 'journal-legacy-a@example.test',
  '$2a$10$legacy.placeholder.hash.value.aaaaaa', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  'b2222222-2222-4222-8222-0000000000bb',
  'authenticated', 'authenticated', 'journal-legacy-b@example.test',
  '$2a$10$legacy.placeholder.hash.value.bbbbbb', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  '', '', '', ''
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.journal_trades (
  id, user_id, symbol, side, status, qty, entry_price, exit_price,
  entry_date, exit_date, session_date, return_dollars, is_wash
) VALUES
(
  'c1111111-1111-4111-8111-0000000000c1',
  'a1111111-1111-4111-8111-0000000000aa',
  'NVDA', 'long', 'closed', 100, 118.40, 122.88,
  '2026-07-01 13:32:00+00', '2026-07-01 17:40:00+00', '2026-07-01', 440, false
),
(
  'c1111111-1111-4111-8111-0000000000c2',
  'a1111111-1111-4111-8111-0000000000aa',
  'AAPL', 'long', 'closed', 100, 215.80, 217.08,
  '2026-07-02 14:12:00+00', '2026-07-02 18:01:00+00', '2026-07-02', 120, false
),
(
  'c1111111-1111-4111-8111-0000000000c3',
  'a1111111-1111-4111-8111-0000000000aa',
  'TSLA', 'long', 'open', 40, 248.20, NULL,
  '2026-07-03 19:50:00+00', NULL, '2026-07-03', NULL, false
),
(
  'c2222222-2222-4222-8222-0000000000c4',
  'b2222222-2222-4222-8222-0000000000bb',
  'MSFT', 'short', 'closed', 50, 420.00, 411.60,
  '2026-07-04 15:00:00+00', '2026-07-04 19:00:00+00', '2026-07-04', 420, false
);

INSERT INTO public.journal_notes (id, user_id, trade_id, body, note_type)
VALUES (
  'd1111111-1111-4111-8111-000000000001',
  'a1111111-1111-4111-8111-0000000000aa',
  'c1111111-1111-4111-8111-0000000000c1',
  'Legacy NVDA note must survive upgrade.',
  'general'
);

INSERT INTO public.journal_stats_cache (
  id, user_id, total_trades, wins, losses, wash_trades, win_rate, total_pnl
) VALUES (
  'd2222222-2222-4222-8222-000000000001',
  'a1111111-1111-4111-8111-0000000000aa',
  2, 2, 0, 0, 1, 560
);

INSERT INTO public.journal_equity_snapshots (
  id, user_id, snapshot_date, cumulative_pnl, trade_count
) VALUES (
  'e1111111-1111-4111-8111-0000000000e1',
  'a1111111-1111-4111-8111-0000000000aa',
  '2026-07-02', 560, 2
);
