-- Durable prior-session Radar snapshot for Carryover Watch.
-- radar_v22_closed_snapshot is deleted when the surveillance date rolls.
-- This archive keeps the last completed sessions so 4 AM can read history
-- without waiting on the new day's delayed tape.
-- A failure here must not abort replace_radar_v22_candidates_v1.

CREATE TABLE IF NOT EXISTS public.radar_v22_carryover_snapshot (
  LIKE public.radar_v22_closed_snapshot INCLUDING DEFAULTS
);

ALTER TABLE public.radar_v22_carryover_snapshot
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'radar_v22_carryover_snapshot_pkey'
  ) THEN
    ALTER TABLE public.radar_v22_carryover_snapshot
      ADD CONSTRAINT radar_v22_carryover_snapshot_pkey PRIMARY KEY (trading_date, symbol);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'radar_v22_carryover_snapshot_kind_check'
  ) THEN
    ALTER TABLE public.radar_v22_carryover_snapshot
      ADD CONSTRAINT radar_v22_carryover_snapshot_kind_check
      CHECK (snapshot_kind = 'closed_session');
  END IF;
END $$;

COMMENT ON TABLE public.radar_v22_carryover_snapshot IS
  'Retained prior-session Radar payload for Carryover Watch. Not the live candidate set and not today''s board.';

ALTER TABLE public.radar_v22_carryover_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Carryover Radar snapshot is publicly readable"
  ON public.radar_v22_carryover_snapshot;
CREATE POLICY "Carryover Radar snapshot is publicly readable"
  ON public.radar_v22_carryover_snapshot FOR SELECT USING (true);

REVOKE ALL ON TABLE public.radar_v22_carryover_snapshot FROM PUBLIC;
GRANT SELECT ON TABLE public.radar_v22_carryover_snapshot TO anon, authenticated;
GRANT ALL ON TABLE public.radar_v22_carryover_snapshot TO service_role;

CREATE INDEX IF NOT EXISTS radar_v22_carryover_snapshot_trading_date_idx
  ON public.radar_v22_carryover_snapshot (trading_date DESC);

CREATE OR REPLACE FUNCTION public.archive_radar_carryover_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  src public.radar_v22_closed_snapshot%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    src := OLD;
  ELSE
    src := NEW;
  END IF;

  DELETE FROM public.radar_v22_carryover_snapshot
  WHERE trading_date = src.trading_date
    AND symbol = src.symbol;

  INSERT INTO public.radar_v22_carryover_snapshot
  SELECT (src).*, clock_timestamp();

  DELETE FROM public.radar_v22_carryover_snapshot
  WHERE trading_date NOT IN (
    SELECT trading_date FROM (
      SELECT DISTINCT trading_date
      FROM public.radar_v22_carryover_snapshot
      ORDER BY trading_date DESC
      LIMIT 5
    ) recent
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'carryover archive skipped: %', SQLERRM;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS radar_carryover_archive_ins ON public.radar_v22_closed_snapshot;
CREATE TRIGGER radar_carryover_archive_ins
AFTER INSERT ON public.radar_v22_closed_snapshot
FOR EACH ROW EXECUTE FUNCTION public.archive_radar_carryover_snapshot();

DROP TRIGGER IF EXISTS radar_carryover_archive_del ON public.radar_v22_closed_snapshot;
CREATE TRIGGER radar_carryover_archive_del
AFTER DELETE ON public.radar_v22_closed_snapshot
FOR EACH ROW EXECUTE FUNCTION public.archive_radar_carryover_snapshot();

REVOKE ALL ON FUNCTION public.archive_radar_carryover_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_radar_carryover_snapshot() TO service_role;
