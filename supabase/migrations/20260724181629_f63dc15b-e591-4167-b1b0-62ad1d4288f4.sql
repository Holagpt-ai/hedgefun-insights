DO $$
DECLARE r1 bigint; r2 bigint; r3 bigint;
BEGIN
  r1 := public._tmp_invoke_v2('TSLA','cff36c13-6ed4-4df8-ad33-c6492cdd55b1');
  r2 := public._tmp_invoke_v2('VTI','cff36c13-6ed4-4df8-ad33-c6492cdd55b1');
  r3 := public._tmp_invoke_v2('WMT','cff36c13-6ed4-4df8-ad33-c6492cdd55b1');
  RAISE NOTICE 'reqs: % % %', r1, r2, r3;
END $$;