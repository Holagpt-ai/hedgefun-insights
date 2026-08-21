-- journal_save_trade_v1. SECURITY INVOKER; owner is always auth.uid().
-- integrity-md5: 6970651aa8191fd64ce8d44eb6cdb4cd
DO $journal_seg$
DECLARE
  v_statements text[] := ARRAY[
    $journal_stmt$CREATE OR REPLACE FUNCTION public.journal_save_trade_v1(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $save$
DECLARE
  v_uid uuid;
  v_trade jsonb;
  v_account jsonb;
  v_plan jsonb;
  v_calc jsonb;
  v_audit jsonb;
  v_lifecycle text;
  v_status text;
  v_setup text;
  v_source text;
  v_import_job_id uuid;
  v_trade_id uuid;
  v_account_id uuid;
  v_playbook_id uuid;
  v_owner uuid;
  v_is_update boolean := false;
  v_tz text;
  v_session date;
  v_entry_at timestamptz;
  v_exit_at timestamptz;
  v_playbook_name text;
  v_row record;
  v_exec jsonb;
  v_leg_id uuid;
  v_exec_id uuid;
  v_fee_id uuid;
  v_run_id uuid;
  v_sql_calc jsonb;
  v_exec_ids jsonb := '[]'::jsonb;
  v_leg_ids jsonb := '[]'::jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'p_payload required';
  END IF;

  -- Never trust a client-supplied user_id.
  v_trade := coalesce(p_payload->'trade', '{}'::jsonb);
  v_account := coalesce(p_payload->'account', '{}'::jsonb);
  v_plan := coalesce(p_payload->'plan', '{}'::jsonb);
  v_calc := coalesce(p_payload->'calculation', '{}'::jsonb);
  v_audit := coalesce(p_payload->'audit', '{}'::jsonb);

  v_source := coalesce(nullif(btrim(v_trade->>'source'), ''), 'manual');
  IF lower(v_source) IN ('demo', 'demo_workspace') THEN
    RAISE EXCEPTION 'demo workspace cannot persist trades';
  END IF;
  IF v_source NOT IN ('manual', 'import', 'legacy_migrate') THEN
    v_source := 'manual';
  END IF;
  IF coalesce(v_trade->>'id', '') ILIKE 'demo%' OR coalesce(v_trade->>'account_id', '') ILIKE 'demo%' THEN
    RAISE EXCEPTION 'demo workspace cannot persist trades';
  END IF;

  -- Import ownership is established from auth.uid(), never from a client user_id.
  v_import_job_id := NULL;
  IF v_source = 'import' THEN
    IF (v_trade->>'import_job_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT j.id INTO v_import_job_id
      FROM public.journal_import_jobs j
      WHERE j.id = (v_trade->>'import_job_id')::uuid
        AND j.user_id = v_uid;
    END IF;
    IF v_import_job_id IS NULL THEN
      RAISE EXCEPTION 'import job not found' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_trade->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_trade_id := (v_trade->>'id')::uuid;
  ELSE
    v_trade_id := gen_random_uuid();
  END IF;

  SELECT user_id INTO v_owner
  FROM public.journal_trades
  WHERE id = v_trade_id;
  IF FOUND THEN
    IF v_owner IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'trade not found' USING ERRCODE = '42501';
    END IF;
    v_is_update := true;
  END IF;

  v_account_id := NULL;
  IF (v_account->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT id INTO v_account_id
    FROM public.journal_accounts
    WHERE id = (v_account->>'id')::uuid
      AND user_id = v_uid;
  END IF;
  IF v_account_id IS NULL AND (v_trade->>'account_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT id INTO v_account_id
    FROM public.journal_accounts
    WHERE id = (v_trade->>'account_id')::uuid
      AND user_id = v_uid;
  END IF;
  IF v_account_id IS NULL THEN
    SELECT id INTO v_account_id
    FROM public.journal_accounts
    WHERE user_id = v_uid
      AND is_primary = true
    ORDER BY created_at
    LIMIT 1;
  END IF;
  IF v_account_id IS NULL THEN
    SELECT id INTO v_account_id
    FROM public.journal_accounts
    WHERE user_id = v_uid
      AND name = coalesce(nullif(btrim(v_account->>'name'), ''), 'Primary Account')
    LIMIT 1;
  END IF;
  IF v_account_id IS NULL THEN
    INSERT INTO public.journal_accounts (user_id, name, base_currency, is_primary)
    VALUES (v_uid, coalesce(nullif(btrim(v_account->>'name'), ''), 'Primary Account'), 'USD', true)
    RETURNING id INTO v_account_id;
  END IF;

  v_playbook_id := NULL;
  IF (v_trade->>'playbook_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT id INTO v_playbook_id
    FROM public.journal_playbooks
    WHERE id = (v_trade->>'playbook_id')::uuid
      AND user_id = v_uid;
  END IF;
  v_playbook_name := nullif(btrim(coalesce(v_trade->>'playbook_name', '')), '');
  IF v_playbook_id IS NULL AND v_playbook_name IS NOT NULL THEN
    INSERT INTO public.journal_playbooks (user_id, name)
    VALUES (v_uid, v_playbook_name)
    ON CONFLICT (user_id, name) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_playbook_id;
  END IF;

  v_lifecycle := coalesce(
    nullif(btrim(p_payload->'lifecycle'->>'status'), ''),
    nullif(btrim(v_trade->>'lifecycle_status'), ''),
    nullif(btrim(v_trade->>'status'), ''),
    'open'
  );
  v_status := lower(coalesce(nullif(btrim(v_trade->>'status'), ''), 'open'));
  IF v_status NOT IN ('open', 'closed') THEN
    v_status := CASE
      WHEN v_lifecycle IN (
        'closed', 'closed_before_expiration', 'expired', 'assigned', 'exercised',
        'rolled', 'expired_itm', 'expired_worthless', 'archived', 'cancelled'
      ) AND coalesce(v_trade->>'exit_date', '') <> '' THEN 'closed'
      ELSE 'open'
    END;
  END IF;

  v_setup := nullif(btrim(coalesce(v_trade->>'setup_tag', '')), '');
  IF v_setup IS NOT NULL AND v_setup NOT IN (
    'flat_top_breakout', 'bottom_bouncer', 'flat_base_breakout', 'breakout_pullback', 'other'
  ) THEN
    v_setup := NULL;
  END IF;

  v_tz := coalesce(nullif(btrim(v_trade->>'timezone'), ''), 'America/New_York');
  v_entry_at := coalesce((v_trade->>'entry_date')::timestamptz, now());
  v_exit_at := (v_trade->>'exit_date')::timestamptz;
  IF v_trade->>'session_date' ~ '^\d{4}-\d{2}-\d{2}$' THEN
    v_session := (v_trade->>'session_date')::date;
  ELSE
    v_session := (v_entry_at AT TIME ZONE v_tz)::date;
  END IF;

  IF v_is_update THEN
    UPDATE public.journal_trades SET
      symbol = coalesce(nullif(btrim(v_trade->>'symbol'), ''), symbol),
      side = coalesce(nullif(btrim(v_trade->>'side'), ''), side),
      status = v_status,
      qty = coalesce((v_trade->>'qty')::numeric, qty),
      entry_price = coalesce((v_trade->>'entry_price')::numeric, entry_price),
      exit_price = (v_trade->>'exit_price')::numeric,
      entry_date = v_entry_at,
      exit_date = v_exit_at,
      session_date = v_session,
      target_price = (v_trade->>'target_price')::numeric,
      stop_price = (v_trade->>'stop_price')::numeric,
      setup_tag = v_setup,
      return_dollars = (v_trade->>'return_dollars')::numeric,
      return_pct = (v_trade->>'return_pct')::numeric,
      hold_duration_minutes = (v_trade->>'hold_duration_minutes')::integer,
      account_id = v_account_id,
      asset_class = nullif(btrim(v_trade->>'asset_class'), ''),
      instrument = nullif(btrim(v_trade->>'instrument'), ''),
      direction = coalesce(nullif(btrim(v_trade->>'direction'), ''), nullif(btrim(v_trade->>'side'), '')),
      lifecycle_status = v_lifecycle,
      playbook_id = v_playbook_id,
      timezone = v_tz,
      planned_risk = (v_trade->>'planned_risk')::numeric,
      planned_entry = (v_trade->>'planned_entry')::numeric,
      planned_stop = (v_trade->>'planned_stop')::numeric,
      planned_target = (v_trade->>'planned_target')::numeric,
      planned_size = (v_trade->>'planned_size')::numeric,
      thesis = v_trade->>'thesis',
      reviewed_at = (v_trade->>'reviewed_at')::timestamptz,
      calculation_version = coalesce(nullif(btrim(v_trade->>'calculation_version'), ''), 'journal-calc.v1'),
      source = v_source,
      import_job_id = v_import_job_id,
      updated_at = now()
    WHERE id = v_trade_id
      AND user_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'trade not found' USING ERRCODE = '42501';
    END IF;
    DELETE FROM public.journal_executions WHERE trade_id = v_trade_id;
    DELETE FROM public.journal_trade_legs WHERE trade_id = v_trade_id;
  ELSE
    INSERT INTO public.journal_trades (
      id, user_id, symbol, side, status, qty, entry_price, exit_price,
      entry_date, exit_date, session_date, target_price, stop_price, setup_tag,
      return_dollars, return_pct, hold_duration_minutes, account_id, asset_class,
      instrument, direction, lifecycle_status, playbook_id, timezone,
      planned_risk, planned_entry, planned_stop, planned_target, planned_size,
      thesis, reviewed_at, calculation_version, source, import_job_id, demo_forbidden
    ) VALUES (
      v_trade_id,
      v_uid,
      coalesce(nullif(btrim(v_trade->>'symbol'), ''), 'UNKNOWN'),
      coalesce(nullif(btrim(v_trade->>'side'), ''), 'long'),
      v_status,
      coalesce((v_trade->>'qty')::numeric, 0),
      coalesce((v_trade->>'entry_price')::numeric, 0),
      (v_trade->>'exit_price')::numeric,
      v_entry_at,
      v_exit_at,
      v_session,
      (v_trade->>'target_price')::numeric,
      (v_trade->>'stop_price')::numeric,
      v_setup,
      (v_trade->>'return_dollars')::numeric,
      (v_trade->>'return_pct')::numeric,
      (v_trade->>'hold_duration_minutes')::integer,
      v_account_id,
      nullif(btrim(v_trade->>'asset_class'), ''),
      nullif(btrim(v_trade->>'instrument'), ''),
      coalesce(nullif(btrim(v_trade->>'direction'), ''), nullif(btrim(v_trade->>'side'), ''), 'long'),
      v_lifecycle,
      v_playbook_id,
      v_tz,
      (v_trade->>'planned_risk')::numeric,
      (v_trade->>'planned_entry')::numeric,
      (v_trade->>'planned_stop')::numeric,
      (v_trade->>'planned_target')::numeric,
      (v_trade->>'planned_size')::numeric,
      v_trade->>'thesis',
      (v_trade->>'reviewed_at')::timestamptz,
      coalesce(nullif(btrim(v_trade->>'calculation_version'), ''), 'journal-calc.v1'),
      v_source,
      v_import_job_id,
      false
    );
  END IF;

  INSERT INTO public.journal_trade_plans (
    user_id, trade_id, planned_entry, planned_stop, planned_target,
    planned_size, planned_risk, thesis, updated_at
  ) VALUES (
    v_uid,
    v_trade_id,
    coalesce((v_plan->>'planned_entry')::numeric, (v_trade->>'planned_entry')::numeric),
    coalesce((v_plan->>'planned_stop')::numeric, (v_trade->>'planned_stop')::numeric),
    coalesce((v_plan->>'planned_target')::numeric, (v_trade->>'planned_target')::numeric),
    coalesce((v_plan->>'planned_size')::numeric, (v_trade->>'planned_size')::numeric),
    coalesce((v_plan->>'planned_risk')::numeric, (v_trade->>'planned_risk')::numeric),
    coalesce(v_plan->>'thesis', v_trade->>'thesis'),
    now()
  )
  ON CONFLICT (trade_id) DO UPDATE SET
    planned_entry = EXCLUDED.planned_entry,
    planned_stop = EXCLUDED.planned_stop,
    planned_target = EXCLUDED.planned_target,
    planned_size = EXCLUDED.planned_size,
    planned_risk = EXCLUDED.planned_risk,
    thesis = EXCLUDED.thesis,
    updated_at = now();

  FOR v_row IN
    SELECT value AS elem, ordinality
    FROM jsonb_array_elements(coalesce(p_payload->'legs', '[]'::jsonb)) WITH ORDINALITY AS t(value, ordinality)
  LOOP
    IF (v_row.elem->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_leg_id := (v_row.elem->>'id')::uuid;
    ELSE
      v_leg_id := gen_random_uuid();
    END IF;
    INSERT INTO public.journal_trade_legs (
      id, trade_id, action, "right", strike, expiration, contracts, multiplier, occ_symbol, status, sequence_index
    ) VALUES (
      v_leg_id,
      v_trade_id,
      coalesce(nullif(btrim(v_row.elem->>'action'), ''), 'buy'),
      v_row.elem->>'right',
      (v_row.elem->>'strike')::numeric,
      nullif(v_row.elem->>'expiration', '')::date,
      (v_row.elem->>'contracts')::numeric,
      coalesce((v_row.elem->>'multiplier')::numeric, 100),
      v_row.elem->>'occ_symbol',
      coalesce(nullif(btrim(v_row.elem->>'status'), ''), 'open'),
      coalesce((v_row.elem->>'sequence_index')::integer, (v_row.ordinality - 1)::integer)
    );
    v_leg_ids := v_leg_ids || jsonb_build_array(v_leg_id);
  END LOOP;

  FOR v_row IN
    SELECT value AS elem, ordinality
    FROM jsonb_array_elements(coalesce(p_payload->'executions', '[]'::jsonb)) WITH ORDINALITY AS t(value, ordinality)
  LOOP
    v_exec := v_row.elem;
    IF (v_exec->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_exec_id := (v_exec->>'id')::uuid;
    ELSE
      v_exec_id := gen_random_uuid();
    END IF;
    v_leg_id := NULL;
    IF (v_exec->>'leg_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT id INTO v_leg_id
      FROM public.journal_trade_legs
      WHERE id = (v_exec->>'leg_id')::uuid
        AND trade_id = v_trade_id;
    END IF;
    INSERT INTO public.journal_executions (
      id, trade_id, occurred_at, occurred_at_utc, timezone, action,
      quantity, price, multiplier, commission, regulatory_fee, other_fee,
      fee_currency, venue, order_type, source, external_execution_id,
      idempotency_key, import_job_id, note, leg_id, sequence_index
    ) VALUES (
      v_exec_id,
      v_trade_id,
      coalesce((v_exec->>'occurred_at')::timestamptz, (v_exec->>'occurred_at_utc')::timestamptz, v_entry_at),
      coalesce((v_exec->>'occurred_at_utc')::timestamptz, (v_exec->>'occurred_at')::timestamptz, v_entry_at),
      coalesce(nullif(btrim(v_exec->>'timezone'), ''), v_tz),
      coalesce(nullif(btrim(v_exec->>'action'), ''), 'buy'),
      coalesce((v_exec->>'quantity')::numeric, 0),
      coalesce((v_exec->>'price')::numeric, 0),
      coalesce((v_exec->>'multiplier')::numeric, 1),
      coalesce((v_exec->>'commission')::numeric, 0),
      coalesce((v_exec->>'regulatory_fee')::numeric, 0),
      coalesce((v_exec->>'other_fee')::numeric, 0),
      coalesce(nullif(btrim(v_exec->>'fee_currency'), ''), 'USD'),
      v_exec->>'venue',
      v_exec->>'order_type',
      CASE WHEN v_import_job_id IS NOT NULL THEN 'import' ELSE v_exec->>'source' END,
      v_exec->>'external_execution_id',
      nullif(btrim(coalesce(v_exec->>'idempotency_key', '')), ''),
      CASE
        WHEN v_import_job_id IS NOT NULL THEN v_import_job_id
        WHEN (v_exec->>'import_job_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (v_exec->>'import_job_id')::uuid
        ELSE NULL
      END,
      v_exec->>'note',
      v_leg_id,
      coalesce((v_exec->>'sequence_index')::integer, (v_row.ordinality - 1)::integer)
    );
    v_exec_ids := v_exec_ids || jsonb_build_array(v_exec_id);

    FOR v_row IN
      SELECT value AS elem
      FROM jsonb_array_elements(coalesce(v_exec->'fees', '[]'::jsonb)) AS t(value)
    LOOP
      v_fee_id := gen_random_uuid();
      INSERT INTO public.journal_execution_fees (
        id, execution_id, kind, amount, currency, native_amount, native_currency,
        conversion_rate, conversion_timestamp, conversion_source, account_currency_amount
      ) VALUES (
        v_fee_id,
        v_exec_id,
        coalesce(nullif(btrim(v_row.elem->>'kind'), ''), 'other'),
        coalesce((v_row.elem->>'amount')::numeric, 0),
        coalesce(nullif(btrim(v_row.elem->>'currency'), ''), 'USD'),
        (v_row.elem->>'native_amount')::numeric,
        v_row.elem->>'native_currency',
        (v_row.elem->>'conversion_rate')::numeric,
        (v_row.elem->>'conversion_timestamp')::timestamptz,
        v_row.elem->>'conversion_source',
        coalesce((v_row.elem->>'account_currency_amount')::numeric, (v_row.elem->>'amount')::numeric)
      );
    END LOOP;
  END LOOP;

  -- Authoritative SQL calculation. Over-exit raises and rolls back this transaction.
  -- Client-supplied calculation numbers are audit evidence only, never the write path.
  v_sql_calc := public.journal_calculate_trade_v1(v_trade_id);
  v_run_id := (v_sql_calc->>'calculation_run_id')::uuid;

  DELETE FROM public.journal_calculation_lineage WHERE calculation_run_id = v_run_id;
  INSERT INTO public.journal_calculation_lineage (
    calculation_run_id, input_hash, observations, exclusions
  ) VALUES (
    v_run_id,
    v_audit->>'timestamp',
    coalesce(v_audit->'observations', '[]'::jsonb),
    coalesce(
      ARRAY(SELECT jsonb_array_elements_text(coalesce(v_audit->'exclusions', '[]'::jsonb))),
      '{}'::text[]
    )
  );

  INSERT INTO public.journal_audit_log (
    user_id, actor_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    v_uid,
    v_uid,
    CASE WHEN v_is_update THEN 'journal_trade_update' ELSE 'journal_trade_save' END,
    'journal_trades',
    v_trade_id,
    NULL,
    jsonb_build_object(
      'trade_id', v_trade_id,
      'lifecycle', v_lifecycle,
      'audit', v_audit,
      'calculation', v_calc
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'trade_id', v_trade_id,
    'account_id', v_account_id,
    'playbook_id', v_playbook_id,
    'execution_ids', v_exec_ids,
    'leg_ids', v_leg_ids,
    'calculation_run_id', v_run_id
  );
END;
$save$
$journal_stmt$,
    $journal_stmt$REVOKE ALL ON FUNCTION public.journal_save_trade_v1(jsonb) FROM PUBLIC
$journal_stmt$,
    $journal_stmt$GRANT EXECUTE ON FUNCTION public.journal_save_trade_v1(jsonb) TO authenticated, service_role
$journal_stmt$
  ];
  v_expected text := '6970651aa8191fd64ce8d44eb6cdb4cd';
  v_digest text;
  v_stmt text;
BEGIN
  v_digest := md5(array_to_string(v_statements, E'\x1e'));
  IF v_digest IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION
      'journal migration integrity mismatch: expected %, got %',
      v_expected,
      v_digest;
  END IF;
  FOREACH v_stmt IN ARRAY v_statements LOOP
    EXECUTE v_stmt;
  END LOOP;
END;
$journal_seg$;