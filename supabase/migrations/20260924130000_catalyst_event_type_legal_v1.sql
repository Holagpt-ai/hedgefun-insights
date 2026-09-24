-- Add legal catalyst taxonomy; keep existing rows valid.

ALTER TABLE public.catalyst_events
  DROP CONSTRAINT IF EXISTS catalyst_events_event_type_check;

ALTER TABLE public.catalyst_events
  ADD CONSTRAINT catalyst_events_event_type_check
  CHECK (event_type IN (
    'earnings','fda_biotech','merger_acquisition','analyst_action',
    'sec_filing_news','corporate_action','product_contract','legal','company_news'
  ));
