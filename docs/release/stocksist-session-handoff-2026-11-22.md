# STOCKSIST — SESSION HANDOFF & CONTINUITY (November 22, 2026 ET)

**Repository:** Holagpt-ai/hedgefun-insights  
**Authoritative GitHub main:** be8659df81157a8964f709cce1d4a4caacf24243 (PR #265 squash merge; verified identical to main on November 22).  
**Status boundary:** Git commits are not evidence of a Lovable Edge, Fly, Vercel, or SQL production deployment. Production facts below are separately attributed to Lovable/Fly reports or read-only database checks.  
**Production domain:** https://stocksist.com  
**Launch target:** November 29, 2026; December 6 US equity extended-hours rollout is a conditional marketing premise, not a proven unconditional exchange go-live.

## 1. Objective & Goal

Finish the launch-critical Stocksist trading intelligence platform, eliminate substantiated scanner/Radar reliability and access-control problems, preserve honest delayed market-data labels and connected workflows, and complete bounded production acceptance before public launch. Do not reopen completed audits or divert into AI Trader, real-time upgrades, broker, billing, or monetization without explicit owner decision.

## 2. Decision Log — completed or approved

1. **ISS-034 diagnostic gate:** Nov 16 failure was an all-day scanner publication stall (87 retained generations; ASBPW/ASPCR missing prior closes). Full-universe 13,240-symbol replay for job 4ed4a4c7-d8c4-4582-bd89-cc949d6e291d succeeded Nov 17 with no mismatch. PR #260 diagnostics, #261 Option B degraded Gappers publish (default OFF), #262 Lovable source parity, and #263 Git-snapshot-only rollback exception all merged. Option B remains OFF; never infer it activated.
2. **ISS-034 Edge-only release:** Lovable Cloud deployed only sync-screener-data on Nov 18 at approximately 17:10:30 UTC from approved synchronized source. Submitted-source fingerprint e16fba307fd842e3df5984432153976286bca7221c77f6ac0f8dae820c0a21fd. OPTIONS 200; platform running Edge revision ID unavailable, submitted-source fingerprint does not independently attest binary. Approved Git recovery source e7a3eaeeceec1310e941d263dd5df63fd3b76998 would build new bytes, not restore prior binary; separately authorize any recovery. Natural 17:15 UTC job: 7/7 chunks, 103 rows, all six tabs evaluated, Gappers 0 unresolved, no continuation error or abort. ISS-034 remains OPEN for Batch 191 multi-session acceptance. Read-only database later showed latest screener publish at Nov 21 00:55:27 UTC (Nov 20 19:55 ET); this alone does not satisfy matrix.
3. **Security finding on scanner_intelligence_alerts:** Lovable critical category flagged authenticated SELECT policy USING(true) on market-alert data (about 44,868 records) without personal fields. No confirmed PII exposure; user-specific read/dismiss state is in a separately restricted table. Intentional shared-alert access retained. Paid-plan entitlement consideration is separate and not implemented.
4. **ISS-049 persistence:** Lovable reported 23 project-wide statement cancellations in approximately 24 hours and 99 failed Radar saves within eight minutes. Bounded path is Fly publishRadarV2IfNeeded → radar-worker-bridge publish_candidates_v2 → Postgres replace_radar_v22_candidates_v1; distinct from sync-screener-data. Postgres 57014 timeouts roll back partial replace; exact historical burst-to-57014 correlation unproven. PR #264 merged at 47f2136b7cb35234cc85d23bccd090d202eea5e0; worker backoff is max(15 s, min(checkpoint, 60 s)), default checkpoint 30 s. No SQL changes.
5. **Fly production v50:** Owner-authorized worker-only deploy Nov 18 ~18:06 UTC, app stocksist-radar-v22-worker, config fly.radar.toml, machine 8e4192a73d09e8 in iad. Image deployment-01M7QXBMQERTR1FCQZVCT4V00M; digest sha256:25c905c9491b1281849689dec9c211b5f67c9d3bb5f9fa786749745363d88448. Post-deploy publish_candidates_v2 HTTP 200 success and timeout_ms=130000 in logs. Backoff under a natural failure has not yet been observed. Rollback reference is v49 image deployment-01M7JK8SMFV0RP648PH6VBDN4G, digest sha256:41d00ca5a76ced3725a1fa365dbc2d52ea23ace9af60f76aba94a076493d6257 (do not automatically roll back). One start_52w_baseline_publish 504 around machine roll is not proven persistent. ISS-049 remains OPEN for 24-hour-plus natural persistence and statement-cancel evidence.
6. **Market-data capacity:** Lovable verified Batch 37 shared Upstash Redis cache running. Secret names UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN present (values never examined). In three-day sampled logs: 38 market-data HTTP requests (19 200 and 19 OPTIONS 204), no 429, quota_denies=0, upstream_failures=0; no local_fallback. Production cap still 18 snapshot / 8 aggregate origin attempts per minute shared across visitors, 6/4 per instance on local fallback. Treat as pre-advertising capacity risk, not present outage; no provider upgrade or quota change approved.
7. **Radar >20 symbols:** Current stocksist.com bundle includes batches of at most 20 historical symbols; existing tests 28/28 pass. No seven-day historical service request evidence and no authenticated >20-row runtime test. Existing fix deployed, live acceptance NOT VERIFIED; no new code.
8. **Continuation RVOL:** Live code passes volume baseline and sample count. Existing 3x RVOL test gives HIGH confidence and full four points (6/6 tests pass). Nov 9–18 stored handoffs: 8,873 with 3x+ RVOL and zero missing baselines / low-confidence flags. Possible dropped candidates and empty sample-size-quality field not proven defects. No scoring changes.
9. **AM Inbox qualified fallback:** Deployed frontend displays up to six qualified candidates when no priority candidate exists, without requiring View all. Date/expiration and pagination preserved. Nov 9–18: 20,365 captures; Nov 18 AM: 2,321 date/identity eligible candidates. No natural qualified>0/priority=0 case established, authenticated UI NOT VERIFIED. One legacy Batch 12 conservative RVOL-ranking test failure remains unrelated; do not reopen scoring solely because of it.
10. **AM Inbox RPC ACL:** Direct production read-only inspection found anonymous EXECUTE=true on SECURITY DEFINER function public.late_session_handoff_list_active_v1(date), contrary to intended authenticated-only access. PR #265 merged Nov 18 at be8659df81157a8964f709cce1d4a4caacf24243. CI initially failed in disposable database due to pre-existing Drizzle-only historical tables and behavior-profile schema mismatch; revised CI-only setup now passes four Journal jobs and the new pgTAP ACL regression. Lovable's migration-history inspector could not uniquely resolve applied history; DO NOT repair/replay ledgers. Owner explicitly authorized direct execution of only the approved REVOKE and GRANT via Lovable Cloud. Successfully executed and independently verified: anon EXECUTE=false; authenticated and service_role=true; SECURITY DEFINER and function hash df1282e91f6667bb2dd45c704abbfca6 unchanged. **This is a direct production ACL correction outside the migration ledger; never mark 20261118193000 as ledger-applied.** Pre-existing uncommitted Lovable deno.lock change left untouched.
11. **No implicit deployments:** GitHub PR deployment banners and Lovable source sync do not attest Fly, Edge, SQL or actual Vercel production source. Lovable is not the Stocksist frontend publishing path.

## 3. Avoidance List — do not repeat

- Do not rerun 13,240-symbol full-universe ISS-034 replay or broad scanner audits; replay gate already satisfied.
- Do not confuse a 7/7 staged scanner job with a published generation; require publish RPC and tab evidence. Do not declare ISS-034 closed on one successful run.
- Do not enable SCREENER_ALLOW_DEGRADED_GAPPERS_PUBLISH without separate owner approval; default OFF is deliberate.
- Do not attempt to restore an unknown exact Edge binary; only Git-snapshot redeploy may be separately approved. Never substitute the unrelated ISS-024 Layer C fallback SHA.
- Do not merge or deploy again for ISS-049 without new evidence; Fly v50 is already running. Do not assume first successful Radar writes prove failure backoff exercised.
- Do not rerun the old four failing Journal jobs on the obsolete #265 head: the same PR was corrected; latest CI green.
- Do not automatically replay Supabase migrations or edit/backfill Supabase/Drizzle migration ledgers. Do not claim direct ACL SQL has a ledger marker.
- Do not click Lovable security Fix All or treat the general scanner_intelligence_alerts market data warning as proven PII exposure.
- Do not recreate the progressive historical 20-symbol fix, shared market-data cache, continuation RVOL baseline propagation, or AM Inbox qualified fallback; these already exist in deployed source.
- Do not modify or discard unrelated uncommitted deno.lock. No fake scanner rows, catalysts, volume or live-data claims.
- Do not use Lovable to publish Stocksist frontend. Do not assume GitHub main, Lovable editor, Vercel, Fly, and DB auto-synchronize.

## 4. Project Memory & Context Sync

**Canonical repo/source:** Holagpt-ai/hedgefun-insights GitHub main, current be8659df81157a8964f709cce1d4a4caacf24243 as checked Nov 22. Cursor workspace C:\Projects\hedgefun-batch218. A separate approved isolated deploy checkout used C:\Projects\hedgefun-iss049-fly-deploy, detached at 47f2136b; do not swap default workspace without checking.

**Cloud/product:** stocksist.com; Lovable app HedgeFun Insights Lovable project 417e2d28-74eb-46af-bc29-6f03aed6facf; Lovable Cloud backend zcjptaolpumhtlwhlemq (Supabase); production frontend GitHub → Vercel. Separate source integration branch cursor/lovable-sync-from-main-20261024 with Lovable overlays. Last observed editor source tip after #265 was e85140824a3471a9a635e585a21c5ead447416d4, containing merged source; do not treat this as platform runtime provenance.

**Key config (do not reveal values):**
- SCREENER_ALLOW_DEGRADED_GAPPERS_PUBLISH absent / OFF; Option B inactive.
- RADAR_PUBLISH_BRIDGE_TIMEOUT_MS intended 130000 and live v50 logs show timeout_ms=130000.
- RADAR_PERSISTENCE_V2_ENABLED=true in Fly config; default checkpoint 30000 ms.
- UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN names present; shared_cache=upstash in logs.
- MARKET_DATA_FEED_MODE=auto in fly.radar.toml; real-time feed upgrade remains deferred.
- Do not change secrets or cron during unrelated releases.

**Relevant files:**
- docs/PROJECT_MEMORY.md, docs/SESSION_HANDOFF.md, docs/ISSUE_REGISTER.md, docs/DEPLOYMENT_STATUS.md, docs/CHANGELOG.md.
- docs/release/iss049-radar-persistence-statement-cancel-v1.md, docs/release/am-inbox-handoff-list-active-acl-v1.md, docs/release/lovable-scanner-reliability-warnings.md, docs/release/batch191-scanner-acceptance-v1.md, docs/release/batch219-radar-v2-recovery-v1.md, docs/migration-drizzle-supabase-notes.md.
- supabase/functions/sync-screener-data/, services/scanner-stream-worker/src/radar/persist_v2.ts, fly.radar.toml.
- supabase/migrations/20261118193000_late_session_handoff_list_active_acl_v1.sql and supabase/tests/database/late_session_handoff_function_acl.test.sql.

**One-time ACL production correction:** exact SQL already executed, record as applied by direct Lovable SQL on Nov 18 with before/after privilege checks and unchanged function body; the migration's version is not claimed applied in either ledger. Never backfill ledgers to manufacture sync.

**Documentation status at Nov 22 before this docs PR:** Canonical project/handoff/issue/deployment documents were stale relative to v50 and direct ACL correction. This handoff and accompanying docs-only PR propose append-only superseding checkpoints; GitHub main is unchanged until owner reviews/merges that PR.

## 5. Current Status & Next Steps — exact unfinished inventory

**Completed/locked:** #260–#265 implementation merges; approved Edge-only ISS-034 deploy; first postdeploy scanner publish; Fly v50 deploy and immediate success; Batch 37 Redis cache running without current 429s; historical >20-symbol chunking in live bundle; continuation RVOL baseline and AM Inbox qualified fallback in live bundle; direct AM Inbox RPC anonymous ACL correction (verified). Do not list these as code to be rebuilt.

**Active P0 acceptance / launch-critical:**
1. **ISS-034 OPEN:** Finish natural premarket, opening (particularly 09:30 ET), regular and after-hours Batch 191 session matrix. Confirm publication (not merely chunk completion), all tab evidence, 0 unresolved required gap inputs, no http_546/prior_generation_retained recurring stall. Option B remains OFF; separate owner authorization required if deciding to activate degraded mode.
2. **ISS-049 OPEN:** Post-v50 real-session Radar persistence monitoring: recent publish success/failure and v2_synced_at freshness; measure 57014 cancellations, persist_failed/502 and backoff behavior under naturally occurring failures. Historical 99/8-minute burst is not log-correlated; no new Fly release unless warranted. Monitor start_52w_baseline_publish 504 only if recurring.
3. **ISS-044 OPEN:** Verify 20:00 ET closed-session park, nonempty closed snapshot when candidates exist, correct session label and park flush after Fly v50. Read-only November 22 query showed radar_v22_closed_snapshot count=0, so closed-park acceptance not established; do not conflate with ISS-049 or assume zero alone proves the cause.
4. **ISS-024 Layer C BLOCKED:** Source PR #259 merged; migration 20261116153000 production activation not approved. Do not apply as side-effect of the ACL correction. Layer D UI acceptance still outstanding.
5. **ISS-025 OPEN:** Authenticated AM Inbox continuation UI acceptance (qualified fallback, session dates, no hidden qualified cards); the actual RPC anonymous ACL defect is corrected. No more fallback logic implementation.

**Other bounded verification / potential work:**
6. **Watchlist temporary false Data Unavailable while initial analysis loads:** Still reported, not yet verified/fixed in this session. Next discrete frontend issue; prefer genuine loading/unknown state over erroneous unavailable labels without fabricating data.
7. **Radar history >20 symbols:** Code/live bundle PASS, actual authenticated Repeat Movers/history rows past first 20 NOT VERIFIED. Final acceptance only.
8. **Continuation RVOL / AM Inbox:** Scoring code/live bundle PASS, missing history profile quality field unclassified, live late-session→next-morning candidate completeness NOT VERIFIED. One old Batch 12 RVOL test expected-value failure recorded separately, not this ACL regression.
9. **Quiet-feed watchdog / delayed-feed issue:** Fixed historically in source, but live market-session transition behavior not signed off. Do not initiate feed upgrade. **ISS-043** closed-session cron skip acceptance separate.
10. **ISS-047 / ISS-048:** Watchlist refresh + securityId handoff and Journal/Action Center workflows merged in Git; authenticated live acceptance remains outstanding.
11. **ISS-038 / ISS-045 / ISS-037:** delayed-quote marketing copy, New Highs/Lows baseline UI, and free-float visual provenance still require bounded Vercel/Edge production verification where not established.
12. **ISS-039 / ISS-040:** immutable cross-platform deployment attestations and independent editor/runtime parity; do not confuse source-sync with deployed binaries.
13. **ISS-042 admin roles/UI, ISS-036 acceleration live values, ISS-026 earnings Edge, ISS-028 catalyst attribution UI, ISS-032 Journal UI, ISS-027 mobile, ISS-041 weekend fallback:** carry forward existing issue-register gates; do not restart resolved implementations without new evidence.
14. **Market-data shared quota:** No current 429; watch shared Upstash usage as traffic increases and review origin capacity before paid advertising. No quota increases approved.
15. **Security/commercial:** Scanner-intelligence-alerts shared-market read policy is not proven personal leakage. If premium entitlements require paywalled server access, create a separate commercial access-control scope; do not mix with the corrected AM Inbox RPC ACL.
16. **Launch positioning:** Public launch target Nov 29; verify all claims about proposed extended-hours equities schedule before committing advertising. Keep honest 15-minute delayed data labels.
17. **Deferred unless reopened:** AI Trader, broker, billing/newsletter, major real-time feed upgrades, AI Analyst/Catalyst V2.1 regression/streaming cleanup, and other end-stage commercial features.

**Next precise action:** Owner reviews/merges docs-only context synchronization PR; no infrastructure changes. Then continue one bounded Watchlist loading-state reproduction/fix if confirmed while natural ISS-034, ISS-044 and ISS-049 acceptance evidence accumulates in normal sessions. Complete existing authenticated UI and Vercel launch checks as a consolidated prelaunch acceptance pass, not another broad code audit.
