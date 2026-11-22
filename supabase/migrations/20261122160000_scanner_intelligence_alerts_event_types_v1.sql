-- Forward-only: widen scanner_intelligence_alerts.event_type to the eight
-- ScannerEventType values writers already submit (SCANNER_EVENT_TYPES).
-- Does not rewrite existing rows. NOT APPLIED from Cursor.

ALTER TABLE public.scanner_intelligence_alerts
  DROP CONSTRAINT IF EXISTS scanner_intelligence_alerts_event_type_check;

ALTER TABLE public.scanner_intelligence_alerts
  ADD CONSTRAINT scanner_intelligence_alerts_event_type_check CHECK (
    event_type IN (
      'HOD_BREAK',
      'HOD_MOMENTUM',
      'RUNNING_UP',
      'VWAP_RECLAIM',
      'GAP_CONTINUATION',
      'LATE_DAY_ACCELERATION',
      'VOLUME_EXPLOSION',
      'VWAP_LOSS'
    )
  );
