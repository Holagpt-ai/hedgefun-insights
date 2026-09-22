-- Marker migration: forces the migrator to process 0015_forward_outcomes_v1 after ordering correction.
COMMENT ON TABLE public.forward_outcomes IS
  'Observed forward session outcomes for historical episodes (+1/+2/+3/+5 trading sessions). Evidence only.';