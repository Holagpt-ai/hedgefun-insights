-- Batch 33.4: close open symbol-history rows before inserting successors (one-open-symbol index).
-- Preserves function signature, validation, and transactional behavior.

CREATE OR REPLACE FUNCTION public.historical_identity_apply_diff(
  p_securities jsonb,
  p_history_inserts jsonb,
  p_history_updates jsonb,
  p_identifier_inserts jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
BEGIN
  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_securities, '[]'::jsonb)) AS t(value)
  LOOP
    INSERT INTO public.securities (
      security_id, current_symbol, issuer_name, security_type, exchange, country,
      adr_status, active, resolution_state, created_at, updated_at
    ) VALUES (
      (item->>'security_id')::uuid,
      item->>'current_symbol',
      nullif(item->>'issuer_name', '')::text,
      item->>'security_type',
      nullif(item->>'exchange', '')::text,
      nullif(item->>'country', '')::text,
      item->>'adr_status',
      (item->>'active')::boolean,
      item->>'resolution_state',
      nullif(item->>'created_at', '')::timestamptz,
      nullif(item->>'updated_at', '')::timestamptz
    )
    ON CONFLICT (security_id) DO UPDATE SET
      current_symbol = excluded.current_symbol,
      issuer_name = excluded.issuer_name,
      security_type = excluded.security_type,
      exchange = excluded.exchange,
      country = excluded.country,
      adr_status = excluded.adr_status,
      active = excluded.active,
      resolution_state = excluded.resolution_state,
      updated_at = excluded.updated_at;
  END LOOP;

  -- Close existing open rows before inserting new open symbol-history rows.
  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_history_updates, '[]'::jsonb)) AS t(value)
  LOOP
    UPDATE public.security_symbol_history
    SET effective_to = nullif(item->>'effective_to', '')::date
    WHERE security_id = (item->>'security_id')::uuid
      AND symbol = item->>'symbol'
      AND coalesce(exchange, '') = coalesce(nullif(item->>'exchange', '')::text, '')
      AND effective_from = (item->>'effective_from')::date;
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_history_inserts, '[]'::jsonb)) AS t(value)
  LOOP
    INSERT INTO public.security_symbol_history (
      history_id, security_id, symbol, exchange, effective_from, effective_to,
      source, source_as_of, provenance, observed_at, fetched_at
    ) VALUES (
      coalesce(nullif(item->>'history_id', '')::uuid, gen_random_uuid()),
      (item->>'security_id')::uuid,
      item->>'symbol',
      nullif(item->>'exchange', '')::text,
      (item->>'effective_from')::date,
      nullif(item->>'effective_to', '')::date,
      nullif(item->>'source', '')::text,
      nullif(item->>'source_as_of', '')::timestamptz,
      item->>'provenance',
      nullif(item->>'observed_at', '')::timestamptz,
      nullif(item->>'fetched_at', '')::timestamptz
    );
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_identifier_inserts, '[]'::jsonb)) AS t(value)
  LOOP
    INSERT INTO public.security_reference_identifiers (
      security_id, identifier_kind, identifier_value, source, source_as_of, provenance, observed_at, fetched_at
    ) VALUES (
      (item->>'security_id')::uuid,
      item->>'identifier_kind',
      item->>'identifier_value',
      nullif(item->>'source', '')::text,
      nullif(item->>'source_as_of', '')::timestamptz,
      item->>'provenance',
      nullif(item->>'observed_at', '')::timestamptz,
      nullif(item->>'fetched_at', '')::timestamptz
    )
    ON CONFLICT (security_id, identifier_kind) DO NOTHING;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.historical_identity_apply_diff(jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.historical_identity_apply_diff(jsonb, jsonb, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.historical_identity_apply_diff(jsonb, jsonb, jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.historical_identity_apply_diff(jsonb, jsonb, jsonb, jsonb) TO service_role;
