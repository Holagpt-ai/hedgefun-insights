-- CATALYST-P1-R1: contract hardening (forward-only)
-- Safe preconditions: 0 rows with verification_state<>'provider_reported',
-- 0 rows with null event_date, 1685 earnings rows with null title.

-- 1. Backfill missing earnings titles from validated fields only.
UPDATE public.catalyst_events
   SET title = COALESCE(company_name, symbol) || ' earnings'
 WHERE title IS NULL
   AND event_type = 'earnings'
   AND (company_name IS NOT NULL OR symbol IS NOT NULL);

-- 2. Abort if any non-earnings null-title rows remain (should be 0).
DO $$
DECLARE v_left int;
BEGIN
  SELECT count(*) INTO v_left FROM public.catalyst_events WHERE title IS NULL;
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'catalyst_contract_hardening: % rows still have null title', v_left;
  END IF;
END $$;

-- 3. Abort if any null event_date rows exist.
DO $$
DECLARE v_left int;
BEGIN
  SELECT count(*) INTO v_left FROM public.catalyst_events WHERE event_date IS NULL;
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'catalyst_contract_hardening: % rows have null event_date', v_left;
  END IF;
END $$;

-- 4. Abort if any non-provider-reported rows exist.
DO $$
DECLARE v_left int;
BEGIN
  SELECT count(*) INTO v_left FROM public.catalyst_events
   WHERE verification_state <> 'provider_reported';
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'catalyst_contract_hardening: % rows are not provider_reported', v_left;
  END IF;
END $$;

-- 5. Replace verification_state check constraint with provider_reported only.
ALTER TABLE public.catalyst_events
  DROP CONSTRAINT IF EXISTS catalyst_events_verification_state_check;
ALTER TABLE public.catalyst_events
  ADD CONSTRAINT catalyst_events_verification_state_check
  CHECK (verification_state = 'provider_reported');

-- 6. Enforce NOT NULL on event_date and title.
ALTER TABLE public.catalyst_events ALTER COLUMN event_date SET NOT NULL;
ALTER TABLE public.catalyst_events ALTER COLUMN title SET NOT NULL;

-- 7. Enforce nonempty title.
ALTER TABLE public.catalyst_events
  DROP CONSTRAINT IF EXISTS catalyst_events_title_nonempty_check;
ALTER TABLE public.catalyst_events
  ADD CONSTRAINT catalyst_events_title_nonempty_check
  CHECK (length(btrim(title)) > 0);