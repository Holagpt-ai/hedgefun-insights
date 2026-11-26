# Session handoff — November 26, 2026 (Historical queue fix + partial catch-up)

**Fly `stocksist-historical-backfill-job`:** production image `deployment-01M5JGEZBCYDGE1KHFT8CRVS6Z` (**v48**). **Zero machines**; **`HISTORICAL_CATCHUP_PREFLIGHT_ONLY=1`**. Floor **`2021-11-29`**; target **`2026-11-25`**. **Ops:** pilot + **2/20** campaign runs through **~4735** eligible remaining; run 3 exit **1** (queue head starvation — `eligible.slice(0,n)` + `maxEmptyResolutionBatches=1`). **Git fix (PR #276 pending):** symbol cursor, provider taxonomy, campaign state, lock ownership, full per-run reservation before launch, verified Fly cleanup — see `docs/historical-intelligence/recurring-catchup-operations-v1.md`. **Campaign budget (retain):** runs **3/20** (failed run 3 counts); provider **~3410/50000** (3010 success + ~400 estimated run 3 reference scans). **After image deploy:** restore campaign via `scripts/historical/campaign-state.nov26.json` (3/20 runs, ~3410 provider budget); persist `HISTORICAL_CATCHUP_QUEUE_AFTER_SYMBOL` from `catch_up_queue_state` after each run; resume `run-fly-catchup-campaign.ps1`. **Recurring driver:** `Invoke-RecurringHistoricalCatchup.ps1` (dry-run default; **no production schedule**).

---

# Session handoff — November 25, 2026 (authenticated launch defects; PR pending)

**GitHub baseline:** `9a86c34e0778f07bbd12db29e0a855d80737ff6c`. **Branch:** `cursor/launch-authenticated-defects-nov25` — shared Anthropic config/classification (Watchlist + Daily Brief), screener delayed-data trust parity (Gappers/NHL vs Radar tabs), Repeat Movers Edge `apikey` + backfill runbook. **Deploy after merge:** Vercel frontend; Lovable Edge **`analyze-watchlist-tickers-v2`**, **`generate-daily-brief`** (verify `ANTHROPIC_API_KEY` + model). **No** SQL/Fly/cron/backfill from this batch.

**Production preserved (Nov 25 evening):** Scanner Edge **v530**, Option B **ON**, Fly **v50**, ISS-043 **CLOSED**. Layer C + reconcile applied **direct SQL outside ledger** @ **19:34:12 UTC** (ledger **not** marked). P0 Watchlist: six runs / **0** AI successes, ~20–26 failures/run, ~130–171 ms `AI_PROVIDER_ERROR` — **specific upstream cause UNVERIFIED** until sanitized provider response (status + error type) is captured; fast latency proves repeated upstream rejection, not which class. Repeat Movers: **`market_behavior_episodes` stale since Oct 20** confirmed; ingestion mechanism **UNVERIFIED**.

---

# Session handoff — November 25, 2026 (Layer C + Option B reconcile; historical)

**GitHub `main`:** `97c2eb0348da33c6e0216aa743d9ca358b2f458b` (#273 merged). **Production:** Scanner Edge **v530**; Option B **ON**; Layer C bundle applied direct SQL **19:34 UTC** (ledger untouched); PR #274 reconcile source on branch history.

---

# Session handoff — November 25, 2026 (ISS-034 finalize boundary; historical)

**Base:** `70fb72de835bed0517bb01faebfcab5a4bd3c066` (post–Batch B). **Landed (git only, not deployed):** durable finalize markers — `merge_selections` after selection work; `load_volume_baselines` after baseline load — to narrow Nov 24–25 opening-bell stalls between merge and volume load. **Root cause UNVERIFIED** (CPU/lease/DB not established; logs empty).

**Nov 25 Lovable read-only:** Nov 23 PM/RTH/AH pubs **63/68/48**; Nov 24 **49/62/0** AH + **58** consecutive retains (Gappers coverage); Nov 25 **65** PM + **18** RTH partial; Nov 24 **09:30** and Nov 25 **09:40** **7/7** then last marker `finalize_stage:merge_selections`, ~12 s post-chunk, stale abort ~30 min, null cause. **ISS-034 P0 OPEN** until Edge deploy + acceptance. **ISS-043 PASS** Nov 23–25 session window (no cron change). **Option B OFF**; **#261** merged; Layer C **BLOCKED**; **#272** migration **not applied**; Fly **v50** unchanged.

---

# Session handoff — November 22, 2026 (Launch Batch B; historical)

**GitHub `main`:** `87f7fd81eb418474ae6e38544348577477d61301` (#268–#271). **Batch B** adds forward-only alert event-type CHECK (`20261122160000`); **not applied**. ISS-034 Nov 20 RTH retain path is existing Option B-off preserve (SONN); 09:35 `merge_selections` abort **unresolved**. Fly **v50** preserved. Layer C **not** executed.

---

# Session handoff — November 22, 2026 (Group 4 final development; historical)

**GitHub `main`:** `25b6c85d136c2c9e2e147a20a2274b8e18511e02` (#268–#270 merged). **Group 4** branch `cursor/group4-final-development` — ISS-038 billing/disclaimer/admin delayed-data copy; release intent manifest for ISS-039; ISS-027/032/042 **preserved**; no SQL/Edge/Fly deploy.

**Prior — Group 3 (#270):** Edge catalyst precedence authority parity + attribution reconcile/headline gate on `main`.

**Prior — Group 2 (#269):** `resolveWatchlistRowPresentation` — false Data Unavailable during hydrate fixed.

**Landed (Group 4, pending PR):** `SUBSCRIPTION_MARKET_DATA_FEATURE` + Billing/Disclaimer/Admin Subscriptions alignment; `group4-final-development-2026-11-22.v1.json`.

**Production authorization still required:** Vercel deploy for ISS-038 sign-off; Layer C SQL; ISS-044 20:00 ET; Batch 191 ISS-034 matrix; authenticated UI gates (ISS-025/047/048); Lovable integration forward-sync when `STOCKSIST_LOVABLE_SYNC_ACTIVATED=true`.

---

# Session handoff — November 22, 2026 (Group 3 market intelligence; historical)

**GitHub `main`:** `e234b5493755ecaafa2431a7e7ee1a3b1141ab2a` (#269 merged — Group 2 watchlist). **Group 3** branch `cursor/group3-market-intelligence` — Edge catalyst precedence authority parity + attribution reconcile/headline gate; ISS-026/037 **preserved** (complete in source); ISS-028 frontend complete, Edge alignment in git pending deploy.

**Prior — Group 2 (#269):** `resolveWatchlistRowPresentation` — false Data Unavailable during hydrate fixed.

**Prior — Group 1 (#268):** ISS-024 Layer D session truth; ISS-044 acceptance runbook on main.

**Landed (Group 1, #268):** ISS-024 **Layer D** — `prior_surveillance_session_snapshot` truth copy when `viewForActiveTab` withholds rows for `previous_during_live`; `useScreenerData` passes session alignment. **ISS-044** — read-only runbook `docs/release/iss044-weekday-2000-et-acceptance-v1.md` (Fly **v50** preserved). **ISS-024 Layer C** — activation package in `batch191-layer-c-production-activation-v1.md` (SQL/Edge **BLOCKED** without owner §1 pre-flight). **CI:** `deno.lock` aligned to `vite-plugin-hmr-gate@^1.8.3`.

**Landed (Group 2, pending #269):** `resolveWatchlistRowPresentation` + `V2Row.presentation` in `useWatchlistV2` / `WatchlistRowV2` — false **Data Unavailable** during analysis hydrate fixed.

**Production authorization still required:** Layer C SQL `20261116153000`; ISS-044 **20:00 ET** observation; Batch **191** ISS-034 matrix; authenticated AM Inbox (ISS-025), watchlist/journal prod handoffs (ISS-047/048).

---

# Session handoff — November 22, 2026 (security ACL complete; Fly v50; ISS-034 still open)

**Canonical detail:** docs/release/stocksist-session-handoff-2026-11-22.md. **GitHub main:** be8659df81157a8964f709cce1d4a4caacf24243 (#265). This is a docs-only continuity update, not a new deployment.

- **Completed:** ISS-034 Edge-only deploy Nov 18 ~17:10 UTC (submitted fingerprint e16fba3..., Option B OFF), first natural post-deploy job 17:15 UTC published 103 rows / 7/7 / six tabs, Gappers unresolved 0. Full Batch 191 matrix still OPEN. Previous Edge binary ID UNKNOWN, fallback Git e7a3eaee only after separate approval.
- **Completed:** PR #264 merged at 47f2136b; Fly worker v50 shipped Nov 18 ~18:06 UTC, new image deployment-01M7QXBMQERTR1FCQZVCT4V00M, digest sha256:25c905c9491b1281849689dec9c211b5f67c9d3bb5f9fa786749745363d88448. Bridge timeout 130 s, normal Radar V2 writes succeed. Backoff under natural failure and DB cancellation reduction NOT VERIFIED; ISS-049 OPEN. v49 rollback image deployment-01M7JK8SMFV0RP648PH6VBDN4G.
- **Completed, directly in production outside ledger:** after PR #265 squash be8659df, owner-approved Lovable Cloud REVOKE ALL EXECUTE FROM PUBLIC, anon + GRANT EXECUTE TO authenticated, service_role for public.late_session_handoff_list_active_v1(date). Verified anon false, authenticated/service_role true and unchanged SECURITY DEFINER/function hash. No migration ledger records edited or falsely marked applied; deno.lock untouched. ISS-025 UI authentication acceptance still OPEN.
- **ISS-044 OPEN:** November 22 read-only closed snapshot 0 rows; closed-session park and session-state acceptance pending. **ISS-024 Layer C** separate/blocked, migration not applied by this work.
- **No new implementation:** Redis shared market cache verified without 429s; Radar historical >20-symbol fix, continuation RVOL baseline, AM Inbox qualified fallback present in live code. Watchlist loading false-error warning is next bounded unresolved UI check; other live acceptance evidence deferred to consolidated launch pass.

## Avoid repeating completed work

Do not rerun the full-universe ISS-034 replay, repeat broad audits, invent market data, reactivate Option B, redeploy Fly/Edge, repeat #265 CI failures from old head, or repair migration ledgers. Do not claim Git source equals deployed runtime. Details and unfinished items in canonical linked snapshot.

---

# Session handoff — ISS-034 post-deploy + ISS-049 Radar persistence (November 18, 2026 ET)

**GitHub `main`:** **`de3d6d9c`** (includes **#263** rollback exception docs). **ISS-024 Layer C:** **separate / BLOCKED** (unchanged).

## ISS-034 — owner-reported production evidence (not full acceptance)

| Field | Value |
| --- | --- |
| Edge deploy | **`sync-screener-data`**, **~2026-11-18 17:10:30 UTC** |
| Submitted-source fingerprint | **`e16fba307fd842e3df5984432153976286bca7221c77f6ac0f8dae820c0a21fd`** |
| Option B | **OFF** |
| First natural generation | **17:15 UTC** — **7/7**, **103** rows, six tabs evaluated |
| Gappers unresolved | **0** |
| Continuation error / abort | **none recorded** |
| **ISS-034** | **OPEN** — remaining Batch **191** matrix / multi-session acceptance |

## ISS-049 — Radar V2 persistence (P0; separate from screener)

Lovable: **23** statement cancellations (~24 h); **99** failed Radar DB saves (~8 min). Investigation: Fly → `publish_candidates_v2` → **`replace_radar_v22_candidates_v1`** (`radar_v22_*` tables). **Not** `sync-screener-data` publish RPCs unless log correlation proves otherwise. Runbook: `docs/release/iss049-radar-persistence-statement-cancel-v1.md`. Worker backoff alignment PR pending; **no** Fly/SQL deploy from Cursor.

---

# Session handoff — ISS-034 `sync-screener-data` rollback exception closeout (November 17, 2026 ET)

**Status:** Owner-approved **one-time Git-snapshot-only rollback exception** documented. **No** Edge deploy, SQL, secrets change, Option B activation, or Lovable apply performed from Cursor.

| Field | Value |
| --- | --- |
| GitHub `main` | **`5f00210f2d8dca9143158f17d003cb5bab0e6031`** (PR **#262**; **#260** + **#261** on `main`) |
| Lovable integration / editor | **`b181f6089ece0aa836e34d1eb7f222cba5716062`** |
| Live `sync-screener-data` Edge revision | **UNKNOWN** — no verified version id; **no binary rollback** |
| **ISS-034** | **OPEN** (deploy + natural-session acceptance still required) |
| **ISS-024 Layer C** | **Separate / BLOCKED** — not part of this exception |

## Fallback Git sources (validated in repo; not live binaries)

| SHA | Role | Use for this exception? |
| --- | --- | --- |
| **`e7a3eaeeceec1310e941d263dd5df63fd3b76998`** | Batch **227** / Batch **228** family — last documented **scanner Edge** recovery commit before **#260** / **#261** handler work | **Yes** — **approved recovery Git source** if a failed deploy requires redeploy of pre–ISS-034-fix scanner logic |
| **`53a0ee4c5775f5f69c41164fffb74441cb8c9bf5`** | Pre–Layer C parent per `batch191-layer-c-production-activation-v1.md` | **No** (default) — reserve for **Layer C** activation/rollback narrative only; not the ISS-034 scanner default |

Redeploying either SHA through Lovable **builds new Edge bytes**; it does **not** restore a prior platform artifact.

## Option B gate (mandatory before release)

Code on `main` fail-closes unless `SCREENER_ALLOW_DEGRADED_GAPPERS_PUBLISH === "true"`. **Before** any `sync-screener-data` deploy:

1. In Lovable Cloud → Edge secrets (project `zcjptaolpumhtlwhlemq`), inspect `SCREENER_ALLOW_DEGRADED_GAPPERS_PUBLISH` and classify attestation as **OFF**, **ON**, or **UNKNOWN** only (OFF = unset or not enabling Option B production behavior).
2. Record owner attestation in the deploy note: secret **name** + attestation (**OFF** / **ON** / **UNKNOWN**). **Never** log, paste, or commit secret **values** in docs, tickets, or git.
3. Release requires attestation **OFF**. **UNKNOWN** (not inspected) **blocks** release.

Do **not** set the flag to enable Option B unless a separate owner ticket authorizes Option B production activation.

## Exact Lovable deployment instructions (`sync-screener-data` only)

Executor: **Lovable Cloud** on `zcjptaolpumhtlwhlemq`. Procedure shell: `docs/release/edge-function-release-lovable.md`.

1. **Before:** Note **live Edge version id** from Lovable if exposed; if unavailable, record **UNKNOWN** (matches rollback exception).
2. **Source parity:** Confirm Lovable project active SHA is **`b181f608`** or a **later** approved integration/editor tip such that GitHub `main` **`5f00210f`** is a **git ancestor** of that commit (`git merge-base --is-ancestor 5f00210f <lovable-tip>` must succeed).
3. **Option B preflight:** Complete § Option B gate above — attestation **OFF** (not UNKNOWN).
4. **Scope:** Deploy **only** **`sync-screener-data`**. Supabase bundles required `supabase/functions/_shared/**` imports; **do not** deploy other Edge functions, MCP, Fly, cron, Vercel, or SQL.
5. **Deploy:** Lovable Cloud → Edge Functions → **`sync-screener-data`** → deploy from synced project source (one function).
6. **After:** Capture deploy timestamp, Lovable-reported success/failure, and any **source/settings fingerprint** Lovable exposes; running revision id if shown, else **UNKNOWN**.
7. **Smoke:** `OPTIONS` on `/functions/v1/sync-screener-data` (expect HTTP 200). No synthetic full-universe scan unless owner approves.
8. **Do not:** Apply migration `20261116153000`, change unrelated secrets, enable Option B, or activate Penny/Layer C.

## Rollback if deploy is unacceptable

1. **No** platform “revert to previous binary” unless Lovable exposes a restorable version id (currently **UNKNOWN**).
2. Owner may authorize **one** redeploy from Git **`e7a3eaee`** via Lovable (same single-function scope). Update `docs/DEPLOYMENT_STATUS.md` with time + result.
3. Do **not** use **`53a0ee4c`** for ISS-034 scanner rollback unless a separate Layer C owner decision says otherwise.

## Owner authorizations still required (not done)

| Step | Authorization |
| --- | --- |
| Edge deploy `5f00210f` / `b181f608` source | Explicit owner **go** for production `sync-screener-data` |
| Option B secret state | Owner attestation **OFF** only (not ON or UNKNOWN); no secret values in records |
| Rollback exception | Acknowledged Git-only recovery via **`e7a3eaee`** |
| ISS-034 acceptance | Natural session observation after deploy |
| ISS-024 Layer C | **Separate** activation runbook — **not** in this batch |

---

# Session handoff — ISS-034 full-job replay gate (November 17, 2026 ET)

**Status:** **PR #260** merged to **`main`** @ `b04789c00ad954716a9a16403c66dd21b9724b4c`.

**Mandatory full-universe replay gate:** **SATISFIED** (Nov 17 owner Lovable export run locally; **~13.9 MB JSON not committed** — stays outside Git).

| Evidence | Verified |
| --- | --- |
| Job ID | `4ed4a4c7-d8c4-4582-bd89-cc949d6e291d` |
| Universe | **13,240** tickers (`all_tickers`) |
| Canonical CLI | `deno run --allow-read scripts/ops/iss034-gappers-replay.deno.ts` → **exit 0** |
| Counters (stored = replayed) | **1302 / 1298 / 1 / 1 / 2** |
| Counter mismatches | **none** |
| Unresolved tails | **ASBPW**, **ASPCR** → `missing_prior_close` |
| Close-versus-prior helper delta | **0** |
| Frozen baseline | `nhl_baseline_snapshot` — **12,121** quote entries, status `available`; policy exclusions **available** (**2,609** excluded) |

**Job clock (export as stored):** `observation.now_ms` / `frozen_at_ms` = **1794866701060** — **milliseconds**, not microseconds; replay uses this value, not live `Date.now()`.

**ISS-034:** **OPEN** — **#261** (Option B) pending on **`main`**; Edge deploy and production acceptance after owner authorization.

---

# Session handoff — ISS-034 Option B (November 17, 2026 ET)

**Branch:** `cursor/iss034-option-b-degraded-gappers-publish` — **PR #261** (base **`main`**).  
**Flag:** `SCREENER_ALLOW_DEGRADED_GAPPERS_PUBLISH` default **off**. **No** deploy/SQL/secrets/flag activation.

---

# Session handoff — ISS-034 Nov 16 all-day scanner stall (November 16, 2026 ET)

**GitHub `main`:** `b04789c00ad954716a9a16403c66dd21b9724b4c` (**#260** merged).

**Production evidence:** Last publish **9:25 AM ET**; **87** `prior_generation_retained` aborts; Gappers `unresolved_gap_input_count=2` with 1302 volume-active (job `4ed4a4c7-…`). **Cause:** fail-closed Gappers accounting + preserve vs 9:25 evaluated snapshot — **not** Nov 13 open transient.

**Fix:** **#260** merged; **#261** Option B pending. Unresolved: **ASBPW**, **ASPCR** (`missing_prior_close`). UI: feed `synced_at` **9:25 AM** but Gappers tab can show **evaluated** morning rows (`screener-truth-state` regression documents mismatch). **ISS-024 Layer C BLOCKED**.

**Preserved:** Fly v49, MCP uncommitted, 8 PM ET ISS-044 acceptance.

---

# Session handoff — ISS-024 Layer C production prep (November 16, 2026 ET)

**GitHub `main`:** **`15aef76e3bc22650a6ccbd0286fb9d4cf3ab1017`** — PR **#259** **merged** (Layer C source complete).

**Production activation:** **BLOCKED** until owner read-only pre-flight in `docs/release/batch191-layer-c-production-activation-v1.md` §1 confirms migration `20261116153000` is **not** applied and records live `sync-screener-data` metadata. **Then:** SQL apply → Edge record/deploy (`sync-screener-data` only) → first-natural-publish SQL verify (`batch191-layer-c-tab-evidence-v1.md`).

**Pre–Layer C rollback Git provenance (Edge redeploy only, not binary):** `53a0ee4c5775f5f69c41164fffb74441cb8c9bf5`. SQL is forward-only after apply.

**Cursor:** **no** SQL, Edge, Fly, cron, or secrets. Fly Radar **v49** preserved for ISS-044 (orthogonal to Layer C).

**Preserved:** stash `preserve-iss044-docs-mcp`, uncommitted `supabase/functions/mcp/index.ts`.

**Next:** Owner Lovable pre-flight → authorized activation → ISS-024 Layer C spot-check; ISS-044 **20:00 ET** acceptance unchanged.

---

# Session handoff — Batch 196 numerical integrity (November 16, 2026 ET)

**Baseline:** GitHub `main` **`a0912926a4c8cae672170d11fa8a234715cc9df7`**.

**Finding:** **196.1/196.2** already on `main`; **no Fly/worker edits** (v49 for ISS-044). **CONFIRMED UI defect:** detail drawer used `acceleration_5m` (60s bucket ratio) under label **5m Acceleration**; grid/Screeners use `volume_acceleration_pct`.

**Fix:** `RadarDetailPanel` + `VOLUME_ACCELERATION_HEADER`; Vitest regressions. **Stop before merge.**

**Open:** ISS-036 live acceptance; qualification count prod reconciliation; null RVOL/accel when baseline/gates fail — **expected**, not defects.

**Next:** ISS-044 **20:00 ET**; Batch **191** Layer C.

---

# Session handoff — ISS-044 closed-session park retry (November 16, 2026 ET)

**Baseline:** GitHub `main` **`5d45d520501f6b65b8e5a080be34aaa3510ff8f7`**.

**ISS-044 implementation:** Branch `cursor/iss044-closed-park-retry`, PR **#257**. Retry-safety: `closed-park-recovery.ts`, bounded park RPC pacing, stable two-stage ids, no V1 empty spam on park retries, `isClosedParkFullyCommitted` before `acknowledgeClosedParkCommitted()`. **89** focused Deno tests **PASS**; typecheck/build **PASS**. **No** Fly/SQL/Edge deploy.

**Cold-start limitation:** Worker restart after **20:00 ET** with empty engine cannot reconstruct an outstanding park without a service-role candidate read + explicit hydration API — **not added** (would need approved RPC/migration).

**Nov 12 prod miss:** root cause **still undetermined**; this batch closes the reproducible single-attempt park gap from 219.3A.

**Preserved:** Group 5 stash, ISS-044 evidence branch **`159c62c7`**, uncommitted MCP bundle.

**Next:** PR review → owner-authorized **Fly worker only** deploy → weekday **20:00 ET** `radar_v22_closed_snapshot` acceptance.

---

# Session handoff — Earnings Top-3 test regression (November 16, 2026 ET)

**Baseline:** GitHub `main` **`90ddda12f5ed3b8791cdc19d9a936bdc256ad0b6`** (ISS-041 PR **#255** merged).

**Follow-up:** Branch `fix/earnings-headlines-reveal-test`. Group 3 failure was **test harness only** — `EarningsList` renders `PreMarketSymbolActions` (`useAuth`); test lacked `AuthContext` mock. Aligns with `PreMarketSymbolActions.test.tsx`. **7** Top-N reveal Vitest **PASS**; typecheck/build **PASS**. **No** UI defect. **No** deploy/merge.

**Preserved:** Group 5 stash, ISS-044 @ **`159c62c7`**, MCP bundle excluded from PR.

---

# Session handoff — ISS-041 market-session fallback (November 15, 2026 ET)

**Baseline:** GitHub `main` **`ff6a10fd377a66265100bbd1d8d70c1a65f54eb9`** (Batch 202 / ISS-038 merged as PR **#254**).

**ISS-041:** Branch `cursor/iss041-market-session-fallback`. `scheduleOrFallback` routes through `resolveSessionSchedule(date, null)` so Saturday/Sunday resolve **closed** when callers omit a schedule (`screener-session.ts`, `movers-observation.ts`, MCP bundle consumers). **16** calendar/session Vitest **PASS**; typecheck/build **PASS**. **No** deploy, merge, or production change.

**Preserved:** Batch 202 branch state, Group 5 stash, ISS-044 branch `cursor/iss044-closed-session-evidence`, unrelated MCP bundle excluded from PR.

**Next:** owner review → merge PR → optional authenticated weekend check on consumer surfaces.

---

# Session handoff — Batch 202 public launch readiness (November 15, 2026 ET)

**Baseline:** GitHub `main` **`87759b67f1a0a3fe944d628b7011132afe45f3e2`**.

**Batch 202 (Group 4):** Branch `cursor/batch202-public-launch-readiness`. **ISS-038** copy + **23×5** positioning + public auth CTA tracking. **47** targeted Vitest **PASS**; typecheck/build/integrity **PASS**. **Stop before merge/deploy.**

**ISS-044:** preserved on `cursor/iss044-closed-session-evidence` @ **`159c62c7`** — not in this PR.

**Next:** PR review → Vercel prod + homepage/mobile visual acceptance; ISS-044 Mon park window separate.

---

# Session handoff — ISS-034 November 13 opening-bell evidence (November 14, 2026 ET)

**Baseline:** GitHub `main` **`72c1a57ca9e6aa77fea5b15cc6a0ed8606f481db`** (Batch **233** PR **#251** squash-merged November **12**).

**This session (no new batch number):** Isolated branch from `origin/main` in the open workspace. Traced Friday **November 13 09:30 ET** only. **Finding:** Batch **228** lease recovery **advanced** (7/7 + `finalize_stage:build_evidence`). Abort **`prior_generation_retained`** is fail-closed session-transition evidence: regular-session Gappers need **`day.o`**, NHL needs **`day.h`/`day.l`**; same-date 09:25 is retained. **09:25** **88** rows; **09:50** **101**; **10:05** **102** / six tabs evaluated. **No** scanner behavior change. Regression: `iss034-opening-bell-evidence_test.ts`. Runbook `docs/release/iss034-nov13-opening-bell-evidence-v1.md`.

**ISS-048:** source **complete** on `main`; **OPEN only for authenticated production acceptance**.

**Source sync:** GitHub Actions run **`43319836884`** **succeeded** (check + guarded integration apply) after #251. Lovable **editor parity** and **running deployment identity** **independently unverified**. Sync **≠** Edge/SQL/Vercel/Fly deploy.

**ISS-044 (next P0, separate):** Nov **12 20:00 ET** — **119** Radar candidates; **RAIN** and **SHFS** `COOLING`; **zero** closed-session snapshot rows; feed still **`after-hours`**. Root cause **undetermined**. Do **not** mix Radar worker changes with ISS-034.

**Not done:** no production deploy, SQL, Edge, Fly, cron, secrets, or PR merge.

**Next:** owner review of this ISS-034 PR; then ISS-044 closed-park diagnosis; Batch **191** Layers C/D remain open.

---

## Archived handoff — Batch 233 Journal & Action Center workflow (November 12, 2026 ~4:45 PM ET)

**Baseline (at authoring):** GitHub `main` **`c8a1296f6f39ba47f1ee58965d33851bc5fce3af`** (Batch **232** merged).

**Batch 233:** Action Center Continue Workflow tiles preserve handoff symbol/`securityId`; Journal trade Screeners link uses `routes.screeners`. Runbook `batch233-journal-action-center-reliability-v1.md`. **Later merged:** PR **#251** → **`72c1a57c`** (November 12). Authenticated Journal + Action Center checklist **NOT VERIFIED**.

---

## Archived handoff — Batch 232 Watchlist reliability (November 12, 2026 ~3:35 PM ET)

**Baseline:** GitHub `main` **`d4c77d1f45f7c484bb43123cd8f7ca7ae9fd751e`**.

**Batch 232:** Watchlist V2 cache invalidation on alternate add paths; row workflow links via `workflowSymbolRoutes` + Action Center. Runbook `batch232-watchlist-reliability-v1.md`. **PR #250** merged @ **`c8a1296f`**.

**Recorded acceptance:** Batch **231** scanner ledger **502** jobs Nov 10–12; Batch **232** **ISS-047** fixed in git. Authenticated Watchlist checklist **NOT VERIFIED**.

---

## Archived handoff — Batch 230 AM Inbox continuation (November 12, 2026 ~2:40 PM ET)

**Baseline:** GitHub `main` **`34e8fb739b5b5ff2103c43c7c3ce72662429554a`** (Batch **229** merged).

**Batch 230:** ISS-025 targeted fixes — bounded `get-pre-market-workspace` (**25 s**); symbol-aware `amInboxNavigatePath` for Screeners/Action Center. Runbook `batch230-am-inbox-continuation-v1.md`. **PR #249** @ **`7a716a82c9340cac27cfa333ff19076a2627b683`** — owner review; **not merged**.

**Recorded acceptance:** Batch **229** authenticated Catalyst UI Nov **12** — **Upcoming Earnings 821**, **Reported in Last 24h 791**. **ISS-046** UI **verified** (production); **ISS-025** **OPEN** until authenticated AM Inbox checklist in runbook.

---

## Archived handoff — Batch 229 Catalyst earnings counter (November 12, 2026)

**Merged:** PR **#248** @ **`34e8fb73`**. Catalyst summary counts + review corrections deployed path on `main`.

---

## Archived handoff — Batch 228 deployed (November 12, 2026 ~12:19 ET)

**Latest verified GitHub main:** `caefbe6b5e5d83582d0a69c8cf6f74bf3b0d0def` (PR #246 merged). Lovable forward synced; current editor source `09266183e352b6a21f61acbd10d23ce91b2016f8` (scanner runtime matches main).

**Owner-approved one-time rollback exception:** Old Edge platform version/revision unavailable. Git-source-only rollback fallback `e7a3eaeeceec1310e941d263dd5df63fd3b76998` would require a separate controlled single-function redeploy and is not an exact previous binary.

**Deployment:** Lovable Cloud reported success for exactly **`sync-screener-data`** between **12:18:24–12:18:34 PM ET**, source/settings fingerprint `07656eebf28569838df72838ea1f5c2026344167eb157b2728b25291bcbe3e29`; OPTIONS HTTP 200. Neither previous nor new platform Edge version ID is obtainable. No SQL, other Edge, Fly, cron, secrets, frontend publish, Penny/overnight activation. Read-only database at 12:19:39 ET: last published generation 12:15:10 ET (pre-deploy), 107 rows; does **not** establish deployed version or opening-bell recovery.

**Continuity:** ISS-034 still OPEN. Next acceptance is natural Friday **November 13 09:30 ET** job: verify 7/7, publish RPC, lease recovery and abort outcomes, then Batch 191 C/D as scheduled. After deployment Lovable regenerated `types.ts` from current DB without Penny RPC types; Penny client restored to main; preview typecheck remains a separate deferred issue, with no Penny activation. PR #243 remains superseded/open; do not merge automatically.

---

## Archived pre-deployment handoff — Batch 228 opening-bell finalize reliability, November 12, 2026 ET

**Source:** GitHub `main` **`e7a3eaeeceec1310e941d263dd5df63fd3b76998`** (Batch **227** PR **#245** merged).

**Batch 228:** Traced 09:30 finalize-lease lifecycle; **confirmed** lease-expiry abort (`abort_reason` null) discards 7/7 work when cron runs `abortExpired` before release. Edge fix + regressions. **Nov 10 AH** ledger **48/0** recorded. **ISS-034 OPEN** pending Edge deploy acceptance. **No SQL/cron/secrets.**

**Next:** Owner review PR; Lovable deploy **`sync-screener-data`** only; observe next **09:30** window.

## Archived handoff — Batch 227 P0 scanner acceptance

**Merged:** PR **#245** @ **`e7a3eaee`**.

**Source (historical):** GitHub `main` **`6a969e9457909444adce6f582172e40e3f9eee0e`** (Batch **226** PR **#244** squash-merged).

**Batch 227 (PR #245):** P0 acceptance docs — **read-only Lovable evidence Nov 11–12 ~11:00 AM ET** recorded in runbook. **ISS-034/024/044/045 remain OPEN.** **No source fixes.** **Vercel production deployment identity NOT VERIFIED.** **PR #243** superseded in intent — **left OPEN**. **No deploy.**

**Verified snapshot (Nov 12 ~11:00 AM ET):** Ledger — Nov **11** PM **66/0**, RTH **71/2**, AH **48/0**; Nov **12** PM **66/0**, RTH **16/1** (partial). Feed **104** rows, six tabs **`evaluated`**, Gappers **0**, NHL **available**. Radar closed snapshot **0**; candidates **176** (Nov 12). Opening aborts: **09:30** `finalize_stage:claim_finalize_lease` (Nov 11–12); **Nov 11 09:45** `prior_generation_retained`. **Nov 10 Batch 191 ledger preserved** (AH not accepted).

**Batch 226 (merged):** Penny persistence/read **files only** — **not production-activated.**

**Next:** Nov **12** full RTH/AH ledger sign-off; **ISS-044** **20:00 ET** closed park when eligible; verify **Vercel prod SHA** + ISS-045 UI; Batch **191** Layers **C/D**.

## Archived handoff — Batch 226 Penny persistence & read V1

**Merged:** PR **#244** @ **`6a969e9457909444adce6f582172e40e3f9eee0e`**. Files-only; Lovable migration + publisher/UI activation deferred.

## Archived handoff — Batch 225 Penny Continuation workflow handoff V1

**Merged:** PR **#242** · Workflow projection + client badge matcher.

## Archived handoff — Batch 224 Penny Continuation integration V1

**Merged:** PR **#241** · `evaluateBoundedPennyContinuationV1` + adapter alignment. Deno **19** tests. **No live wiring.**

## Archived handoff — Batch 223 Penny Continuation backend engine V1

**Merged:** PR **#240** · Modules `penny-continuation-*.ts`, Deno `batch223-penny-continuation_test.ts`. **No live wiring.**

## Archived handoff — Batch 222 Penny Continuation contract V1

**Merged:** PR **#239** · Contract `docs/release/batch222-penny-continuation-eligibility-scoring-v1.md` (owner-approved thresholds for implementation).

## Archived handoff — Batch 221 Overnight scanner backend pipeline V1, November 11, 2026 ET

**Source:** GitHub `main` **`c3519ffd2bd7e9545fbca502e8b88f13505f8ebb`** (Batch 221 branch).

**Batch 221:** Overnight observation/volume semantics (`overnightSessionVolume`, `resolveOvernightCycleAt`, `equityTradeDateForVolume`, `resolveScannerObservationSessionFields`). AH cumulative never maps to overnight; `prevDay.c` gap reference preserved. **`OVERNIGHT_SCANNER_PIPELINE_READY` stays `false`** — no cron/secrets/deploy. Deno: `batch221-overnight-pipeline_test.ts` (12) + existing session-volume / equity-session-control suites.

**Next:** Owner review Batch 221 PR. Activation still requires exchange date + provider confirmation + owner env + pipeline flag flip + Edge deploy (see `docs/release/batch221-overnight-scanner-pipeline-v1.md`).

## Archived handoff — Batch 220 Catalyst + Watchlist loading performance V1, November 11, 2026 ET

**Source:** GitHub `main` **`c44b669d4d511d3a8f7683f0725dc07ee0071558`** (Batch 220 branch).

**Batch 220:** Watchlist list shimmer no longer gates on analysis / request-status queries (`resolveWatchlistLoadingState` + `isListLoading`). Catalyst: initial-fetch-only spinner; **no** cross-ticker react-query placeholder; `filterCatalystEventsToSymbolContext` on `?symbol=`; stable enrichment key; in-flight enrichment cleared on cancel (not stuck in `requested`). Vitest: `watchlist-loading-state`, `batch220-loading-performance`, `useCatalystHistoricalContext.batch220`. Frontend only — **not deployed**.

**ISS-044:** **OPEN** — Fly **v48**; weekday **20:00 ET** closed-snapshot acceptance.

**ISS-045:** **OPEN** — PR **#236** merged at `c44b669`; pending Vercel UI acceptance.

**Next:** Owner review Batch 220 PR → Vercel only. Re-check Watchlist cold load (symbols before analysis) and Catalyst tab (feed before history, filter churn).

## Archived handoff — Batch 219.3B NHL baseline UI consistency, November 11, 2026 ET

**Source:** GitHub `main` **`dc9305f59d46e208d9a96f6c3650b2da6a9e48da`** + Fly **v48** (219.3A deployed).

**Batch 219.3B (ISS-045):** Owner-reported Nov 11 ~7:41 AM ET NHL tab showed **Baseline unavailable** while 7:40 AM publication had `nhl_baseline_loaded=true`, generation `1b65754e-…`, **12,118** quotes. **Root cause (code):** `screener-truth-state` used baseline failure copy for every NHL `generation_unavailable`, including `previous_during_live` session gate and generation validation retries — not only `nhl_baseline_status: unavailable`. Frontend-only truth-state fix + regressions. **No Fly/SQL/Edge.**

**ISS-044:** **OPEN** — pending weekday **20:00 ET** closed-snapshot acceptance (v48 live).

**Next:** Owner review 219.3B PR → Vercel only; re-check NHL tab during pre-market with available baseline.

## Archived handoff — Batch 219.3A Fly deploy, November 11, 2026 ET

**Source:** GitHub `main` **`dc9305f59d46e208d9a96f6c3650b2da6a9e48da`** (Batch 219.3A PR **#235** merged).

**Batch 219.3A Fly deploy (owner-authorized):** `stocksist-radar-v22-worker` release **v48** from git `dc9305f` via `flyctl deploy --config fly.radar.toml --remote-only`. Image `registry.fly.io/stocksist-radar-v22-worker:deployment-01M75N75WEW46WCQT8DAP9JFCC`, manifest digest `sha256:e42c03f29bc2f5a11fd5bc9c70c5f1e36207a8745ac1986cd6d9ac1c40711484`. Machine **`8e4192a73d09e8`** `iad` **started**; smoke checks passed; post-deploy `publish_candidates_v2` **HTTP 200** every ~5s with no `radar_persist_v2_failed` / **23505** in sampled logs. **Rollback reference:** v47 `deployment-01M73Z9VFR2SQ97S92HS9B06XX`. No SQL / Edge / cron / secrets / Vercel changes.

**ISS-044:** **OPEN** until next weekday **20:00 ET** closed-session park produces a valid non-empty `radar_v22_closed_snapshot` when eligible candidates exist (`snapshot_kind='closed_session'`).

**Next:** Read-only Lovable check after **20:00 ET** closed park on the next eligible weekday. Do **not** reapply `20261110193000`.

## Archived handoff — Batch 191 scanner acceptance, November 10, 2026 ET

**Source:** GitHub `main` `fcef28f66482affdf1491660e8398c697b84c3d1` (Batch 218 #232 merged).

**Batch 191 (PR #233, read-only):** Owner-verified `screener_sync_generation_jobs` via **Lovable Cloud** (ET session totals Nov 6/9/10 in runbook). Nov 10 RTH through **1:30 PM:** **43** published (all **7/7** + publish RPC), **4** aborted (09:30 inconclusive; 09:45–09:55 retention). Feed @ **1:30 PM:** **107** rows, six tabs **evaluated**, Gappers unresolved **0**, NHL **available**. **Nov 10 AH not accepted.** Layers: ledger **verified**; per-job tab history + authenticated UI **not verified**. **ISS-034** / **ISS-024** **OPEN**. **No code/deploy.**

**Next:** Owner review PR #233; after Nov 10 AH, extend ledger + Layer B; Layer C/D acceptance.

## Archived handoff — Batch 218, November 10, 2026 ET

**Source:** GitHub `main` `a23c7474175cde3a044c09dbe35d646c80cdc745` (preview-auth parity #231 atop Batch 217 #230).

**Batch 218 (ISS-034 closure gate):** Documentation-only. Reconciled Nov 9 **09:30 `http_546`** — **finalize stage and CPU cause NOT VERIFIED**; no scanner code change. Nov 10 **09:30** abort: **mechanism NOT conclusively established** (null `abort_reason` / `abort_evidence`; last **`finalize_stage:claim_finalize_lease`**). **09:45–09:55:** **confirmed `prior_generation_retained`**. Gappers unresolved **3→0** supports transient incomplete gap inputs; **no** symbol-level provider attribution. **09:45** Gainers/Losers **`prerequisite_unavailable`** in abort evidence is tab evaluation only — **not** verified provider failure. Nov 10 **10:00–12:35:** **32** consecutive publications / **106** rows. **ISS-034 OPEN**; **ISS-044** tracked separately. Runbook: `docs/release/batch218-iss034-root-cause-closure-gate-v1.md`.

**Next:** Owner review of Batch 218 PR. Then Batch **191** after-hours + multi-day acceptance; correlate any future `http_546` with `finalize_stage:*`. No Edge/SQL/cron from 218.

## Archived handoff — Batch 217, November 9, 2026 ET

**Post-merge checkpoint:** PR #230 merged to `main=79260fbb` after Vercel success; AM Inbox authenticated visual acceptance **ISS-025 OPEN**. Preview-auth parity #231 landed on `main`. Source-sync: see ISS-040 in register.

**Source:** GitHub `main` `17a31da8fcb22ad89abdb623edc950f2094e849e` (Batch 216 PR #229 merged). GitHub → Lovable apply succeeded in Actions run `42676903219`; integration/editor contained all main commits (`2708cc04`, later `b54b328a`). Owner set `STOCKSIST_LOVABLE_SYNC_ACTIVATED=true` for ongoing guarded automatic source forward-sync. Unattended future-push acceptance is still pending under ISS-040; this never implies Edge or SQL deployment.

**Edge (owner-reported):** Batches **215** and **216** Lovable Cloud Edge deployment completed. Closed-session skip observation for ISS-043 and production finalize-stage marker correlation for ISS-034 remain open.

**Batch 217 (ISS-025):** AM Inbox Late-Session Continuation production readiness for the Nov 9 load (3,776 rows / 1,525 symbols / ~4.1 MB). Measured client map+build **~424 ms** (bound 8 s). Fixed missing symbol-aware Screeners handoff on continuation cards. No RPC/migration/candidate-limit changes. Authenticated UI acceptance **NOT VERIFIED**.

**Next:** owner review of the Batch 217 PR. Do not merge from this session. After merge + Vercel frontend deploy, authenticate and visually accept AM Inbox continuation. No Edge SQL/cron from this batch.

## Archived handoff — Batch 216, November 9, 2026 ET

**Source:** GitHub `main` `ff81065b8edf5a02c54ba356105965f23466c2ae`. One-time GitHub → Lovable sync succeeded; integration/editor `fee9ab51`. Activation variable returned to **false**. Automatic sync is not active.

**ISS-034:** 09:30 ET 7/7 finalize recorded `http_546` and aborted without publication. Edge v518 logs did not identify the stage or prove CPU exhaustion. Recovered: 11:50 ET published 113 rows / six tabs; 10:55–11:50 ET, 12/12 published. **ROOT CAUSE NOT YET VERIFIED.** Batch 216 / 216.1 / 216.2: durable stage marker via conditional UPDATE; Operations treats standalone `finalize_stage:*` as progress and keeps `http_546:finalize_stage:*` as an Edge resource-limit failure. Merged as PR #229 → `17a31da8`; Edge later owner-reported deployed.

**Next (historical):** owner review of PR #229 — completed (merged). Production marker correlation still required.

## Archived handoff — live read-only audit, November 9, 2026 morning ET

**Read-only evidence checkpoint:** GitHub `main` `c7cf47eea30a70b86a6edae03b572268d2202b15` and Lovable integration/editor `a751f7d5854114fab651f0fbd29214c3da5bff0d`; Batch 211 check passed but apply was SKIPPED (run `42378183167`). All PRs #220–#227 are merged; **no** source sync or Edge deploy was performed by this audit. Source-sync acceptance **ISS-040 OPEN**.

**Production scanner (Nov 9):** 61 premarket publishes through 09:00 ET; 09:05 7/7 job later aborted, recovered with 09:20 and 09:25 successful 94-row publications; 09:30 7/7 job recorded `http_546` and was still finalizing without publish at ~09:38 ET. Friday Nov 6 RTH 47 published and 26 aborted; AH 48 published. Nov 7 and Nov 8 each 288 closed-session aborts. **ISS-034 OPEN**; correlate 09:30 Edge logs before assigning CPU root cause, then complete repeated RTH/AH publication and tab evidence matrix. **ISS-043 OPEN:** Batch 215 merged but production Edge not verified.

**Operations admin RPC:** `get_ops_scanner_diagnostics_v1(integer)` exists in Lovable Cloud and is privilege-scoped; authenticated UI/admin role still unverified. Confirm migration provenance before any change, since earlier “not applied” handoff is now stale. Keep ISS-042 open pending authenticated owner role checks. Runtime provenance ISS-039 still open.

**Next narrowly scoped operations:**
1. Batch 211: owner-controlled activation for **one** guarded source forward-sync, capture GitHub Actions artifact and new integration SHA, verify Lovable editor SHA independently, return activation to false until separate ongoing-automation decision. Do not use manual force-push.
2. ISS-034: read-only Lovable Edge log correlation for 09:30 `http_546`; preserve failed job evidence and six-tab payloads. Use existing P0 acceptance contract, not a broad scanner redesign.
3. ISS-043: explicitly approved `sync-screener-data` Edge deployment of reviewed Batch 215 source only, followed by closed-session observation; no cron disable.
4. Finish repeated RTH/AH scanner and Gappers/NHL acceptance, then remaining Catalyst, AM Inbox, Operations admin, Radar, mobile/Journal and launch checks.
5. Record confirmed source/deploy/DB evidence in the continuity docs; keep completed implementation in CHANGELOG and only unfinished acceptance in active backlog.

**Safety:** No production SQL, Edge/Fly deploy, Vercel publish, cron/config/secret change, branch force-push, or PR merge is authorized by this documentation audit. Old source snapshots below are preserved as historical handoffs.

**09:42 ET log/source follow-up:** Lovable's diagnostic read found Edge runtime **version 518**, a **09:35 ET HTTP 409** for `sync-screener-data`, but no matching 09:30 HTTP 546 request record, stage-enter/exit evidence, or explicit `CPU Time exceeded` message in its sampled 14:25–14:40 UTC log window. The **database** `continue_last_error=http_546` on the 09:30 job remains confirmed. Exact runtime failure stage and CPU-vs-other-resource cause remain **UNVERIFIED**; prioritize correlating logs and bounded stage tracing, not speculative infrastructure changes. During this Lovable **plan-mode** log review, Lovable created **two Git commits altering only `.lovable/plan.md`**; the new integration **and editor** tip is `a751f7d5854114fab651f0fbd29214c3da5bff0d`, **86 commits ahead** of main and still **5 behind**. GitHub compare verified no other path changed between the previous and new integration tips. The plan artifact is a Lovable-only overlay, not a backend deployment.

## Archived previous handoff — November 7

**Batch 214 merged** (#226 → `1616b9bc`). The owner's `admin` role is still not verified.

**Batch 215 (PR [#227](https://github.com/Holagpt-ai/hedgefun-insights/pull/227), code head `01a8d7e3`, not merged):** a session gate for new generations on the staged `sync-screener-data` cron, plus the 23×5-ready schedule contract `_shared/markets/equity-session-control.ts`. Closed sessions (weekend, calendar holiday, weekday nights) skip new generations. Cleanup, reconcile, resume, `continue`, and `finalize` still run. The 23×5 overnight session is modeled but **off** (three env flags plus an overnight-pipeline batch). **Checked locally:** 22 new Deno tests, the CI job's 247 non-Postgres Deno tests, typecheck, build, and integrity. Postgres tests are BLOCKED locally (Docker) and run in CI. **Not done:** no Edge deploy, so production still starts closed-session generations (ISS-043). **Next approved sequence after review:** merge #227, then a Lovable Cloud deploy of `sync-screener-data`, then a weekend/holiday observation. The 23×5 prerequisites are in `docs/release/batch215-unified-scanner-session-control-v1.md`.

**Merged since the previous entries:** Batch 212 (#224 → `3c659048`) and Batch 213 (#225 → `803464ad`) are on `main`. The Batch 213 migration `20261106200000` is **still not applied**. Older entries below that call them unmerged are historical.

**Batch 214 (PR [#226](https://github.com/Holagpt-ai/hedgefun-insights/pull/226), code head `b9844bf1`, not merged):** The owner reported that `/admin/operations` redirects to the homepage. **Verified:** production serves the Batch 212/213 route and chunk, so this is not a deploy mismatch. **Not verified:** whether the owner account has the `admin` role. No migration grants it, and production data was not read. Before this batch, `AdminGuard` sent every failure to `/`. It now sends no-session users to `/login?next=…`, shows Access Denied with the account's email and id for non-admins, and shows "Could not verify" with retry on an RPC error. All states fail closed, and RLS is unchanged. **Checked:** typecheck, build, and integrity pass; 87 targeted tests pass; full-suite failures match `main`. **Next:** the owner deploys #226 after review, opens the page, and follows `docs/release/batch214-admin-access-states-v1.md`. Any role grant goes through Lovable Cloud only, after explicit approval.

**Batch 213 (PR [#225](https://github.com/Holagpt-ai/hedgefun-insights/pull/225), code head `ed69dae3`, stacked on #224, not merged):** Adds the admin-only RPC `get_ops_scanner_diagnostics_v1` (migration `20261106200000`, **NOT applied**). It is `SECURITY DEFINER` with `search_path=''` and checks `has_role(auth.uid(),'admin')` inside the function. EXECUTE is granted to `authenticated` only. It returns a bounded (at most 20 jobs), redacted projection of the jobs table plus a ±2-week exception calendar, and the Batch 212 classifiers and UI consume it. **Checked locally:** typecheck, build, and both integrity checks pass; 83 ops/admin tests pass; `deno check` of the new Postgres test passes; the full-suite failures match `origin/main` with none new. **Postgres integration:** **BLOCKED locally** (Docker Desktop crashed on a `sailor-ingest.sock` socket-access error; Docker was not reset and its data was not deleted). The same 8 tests **PASS** in CI on a throwaway Postgres 16 on the runner (`Screener Deno regressions` run `42317438845` on `7061c2ea`, 268 passed, 0 failed). Production apply has not been checked. Production is untouched. **Approval sequence:** merge #224, retarget #225 to `main` and merge it, then separately approve the Lovable Cloud apply and run the post-apply checks in `docs/release/batch213-secure-scanner-diagnostics-v1.md`.

**Batch 212 (PR [#224](https://github.com/Holagpt-ai/hedgefun-insights/pull/224), code head `836bc07c`, not merged):** Operations Control Center V1 at `/admin/operations`, read-only and admin-guarded. It reads `screener_feed_state`, `radar_v22_feed_state`, public GitHub REST, and the bundled Batch 210 attestations. Job, chunk, lease, and finalize state, Edge logs, worker version, and the Batch 211 artifact result show as **Unknown** because they have no browser read path. There is no migration, Edge, cron, Fly, Vercel, or controller change. **Checked:** typecheck, build, and both integrity checks pass, and 53 new tests pass. The full-suite failures are the same set as on `origin/main` `f2a3cdae` (26 files on the branch, 27 on main), with none only on this branch. **Not checked:** the authenticated production view. **New:** ISS-041 (weekend-open fallback in `resolveMarketSessionAt`). **Pre-existing drift noted:** `npm run build` regenerates `supabase/functions/mcp/index.ts` with mover-session changes from `src/lib`, so the committed bundle on `main` is behind its sources. The regeneration was reverted from this PR. **Proposed next (needs approval):** Batch 213, an admin-only `SECURITY DEFINER` read RPC (`has_role` gated) that returns redacted control columns of recent `screener_sync_generation_jobs` rows plus `market_session_calendar` exceptions, so the job/finalize panel and holiday-aware freshness have data. Runbook: `docs/release/batch212-operations-control-center-v1.md`.

**CURRENT (Nov 6, Batch 211 PR #223 under review):** GitHub `main` **`88de3533`** (Batch **195.1 PR #222 merged**); Lovable integration tip **`3ec5f7cd`** contained that `main` at the batch baseline — **independently re-check** the Lovable **editor/project active SHA** when verifying sync. PR **#223** adds forward-sync with **apply authorization inside `synchronize()`** and safer disposable E2E ref handling; **still no automatic integration writes** until separate owner activation (`STOCKSIST_LOVABLE_SYNC_ACTIVATED=true`). Read-only check, merge-safety tests and runbook under `scripts/lovable-sync/`, `.github/workflows/lovable-source-forward-sync.yml`, `docs/release/batch211-lovable-source-forward-sync-v1.md`. **Persistent policy + monitoring:** `docs/PROJECT_MEMORY.md` § **GitHub ↔ Lovable Source Synchronization** (main vs integration SHA comparison, last successful sync from **workflow artifacts**, failed-run / CONFLICT / UNKNOWN escalation, **no silent failures or automatic force-push recovery**); latest verified baseline table in `docs/DEPLOYMENT_STATUS.md` § Batch 211. **ISS-040** stays **OPEN** until real automatic GitHub-main→integration sync is verified end-to-end. **No Edge/SQL/Fly/Vercel actions.** ISS-028, ISS-024, ISS-034, ISS-036, ISS-039 remain subject to separate acceptance. Earlier PR #222 pending wording below is historical at its authoring point.


**Batch 195.1 (PR #222, not merged; badge `dad9afac`; trust-safety `4f699897`):** Catalyst issuer-headline attribution, plus the Polygon source-badge correction on the same branch. An ACAD row no longer takes an RXRX/Viatris earnings headline from a shared word such as "pharmaceuticals", and a related headline is not labeled as that symbol's earnings or press release. `provider="polygon"` now uses one wire-versus-editorial rule for both `catalystSourceBadge` and the event-category label: GlobeNewswire and Business Wire are Press Release only for a direct issuer row; Motley Fool, Zacks, and other editorial publishers stay News. Unknown issuer attribution on non-authoritative providers does not default to Press Release from the wire name alone; company IR stays authoritative. `CatalystDetailPanel` hides EPS and surprise Market Facts for related or unverified issuer associations. The frontend correction is the Vercel bundle. Backend activation is a later Lovable Cloud deploy of the Edge Functions listed in the runbook; this PR does not deploy them. No production row rewrite, migration, cron, Fly, or Vercel operation. Runbook `docs/release/batch195-1-issuer-headline-attribution-v1.md`. **ISS-028** stays **OPEN** until authenticated production is checked.

**Batch 191.1 (merged):** PR **#221** → `67e3418a`. Gappers evidence — **`split_scale_suppressed_count`** so **`impliesSplitScale`** gap suppression is not counted as **unresolved** inputs. Runbook `docs/release/batch191-1-gappers-split-scale-evidence-v1.md`. **ISS-024** / **ISS-034** stay **OPEN**.

**Batch 210 / PR #220 (branch):** `cursor/batch210-unified-release-control-v1` — CI verify workflow now runs **`npm ci --ignore-scripts`** after **`actions/setup-node@v4`** (Node **24**) so release-control scripts have locked deps on clean runners.

**Code:** GitHub `main` **`67e3418a`** (Batch **191.1** PR **#221** on top of Batch **190.15** / **`3c810c4b`**).

**Batch 190.16 production checkpoint (2026-11-06, reported):** Owner-reported Lovable Cloud **`sync-screener-data`** Edge **version 516**; six consecutive natural premarket generations (narrow window). Git narrative: `docs/release/manifests/batch210.example.190.16.historical.v1.json` (`historical_evidence.production_checkpoint_2026_11_06`). **ISS-034 OPEN** — **Batch 191** RTH/AH still required. **ISS-039** remains the release-provenance tracking issue; git-only verification does not prove live Edge binary equivalence.

**Session recovery (unrelated):** Uncommitted edits to `src/lib/screeners/screener-radar-intraday-overlay.ts` were reverted during recovery to match `main`; not part of Batch 210. **No restore** without separate review.

**Production activation (Batch 190.15 — reported complete):** Lovable Cloud Edge **`sync-screener-data`** deployed **2026-11-04** (before migration apply). Canonical SQL: **`supabase/migrations/20261104230000_screener_sync_slim_control_json_v1.sql`**. Lovable reported apply via **Drizzle ledger idx 68**; **`supabase_migrations.schema_migrations`** has **no** matching row — do not backfill either ledger. Observed RPC payload sizes: full-job response ~**8.60 MB**; slim **`control`** response **407 bytes**. First natural post-migration generation: **85** persisted rows, **six** evaluated tabs, **7/7** chunks completed, publication reported **PASS** for that run only.

**ISS-034:** **OPEN.** One successful post-**190.15** generation does **not** prove durable Edge CPU headroom across repeated regular-session and after-hours cron windows. Nov **4** **HTTP 546** finalize failures and stranded **`finalizing`** job evidence remain on record. Complete **Batch 191** RTH and AH acceptance before closing.

**November 5 screenshot observations (reported — backend causes not verified):**
- **Catalyst:** ACAD row shown alongside an **RXRX**-specific headline → **ISS-028** / **Batch 195** issuer-trust acceptance.
- **Screeners:** **Gappers** and **New Highs / Lows** appear as **stale snapshots** while other screener tabs show **delayed but refreshing** data → **ISS-024** / **Batch 191**.
- **Day Trade Radar:** displayed qualification counts require database reconciliation; no inconsistency confirmed → **Batch 196** acceptance.
- **Watchlist:** **17** rendered symbols with numerous **Analysis pending** indicators → reported; **Batch 204** / **ISS-007** deferred unless reproduced with logs.
- **Homepage:** copy implies **real-time** pricing while product disclosures describe a **delayed** market feed → **ISS-038** (reported copy mismatch).

**Merged on `main` (production verification outstanding):** **Batch 195** PR **#212** → **`5d6399de`**; **ISS-037** PR **#215** → **`3bd3ee68`**. Do not assume Vercel or Edge deploy parity until verified.

**Deployment evidence preserved:**
- November 1 `sync-screener-data` integration source **`ccb4055b3f8b84c46fa38529844150c140638705`**.
- November 2 premarket acceptance **PASS** (seven consecutive publications, 04:00–04:30 ET; row counts 60/62/63).
- **Batch 190.12** SQL and **190.13** cron `{}` normalization **already deployed** — do not reapply.
- **Batch 192:** Vercel + **`generate-daily-brief`** deploy reported; **ISS-025** visual acceptance **NOT VERIFIED**.
- **Batch 196.1:** Fly **`stocksist-radar-v22-worker` v46** from **`797cc615`**; **ISS-036** live value acceptance **NOT VERIFIED**.

**Next approved sequence:**
1. Review and merge **Batch 195.1** only after review. Do not deploy Edge or rewrite catalyst rows from this PR.
2. **Batch 191** — timed regular-session and after-hours scanner acceptance (**ISS-034** gate).
3. **Batch 195** — authenticated Catalyst/Watchlist/Radar issuer-trust walkthrough (**ISS-028**, including the ACAD/Viatris and SpaceX press-release cases).
4. **Batch 192** — AM Inbox authenticated visual acceptance (**ISS-025**).
5. **Batch 193** — mobile/Journal acceptance.
6. **ISS-037** — production verification after PR **#215** merge (**NOT VERIFIED**; no new merge requested).
7. Narrow follow-ups from Nov 5 reports: **ISS-038** homepage delayed-data copy; **ISS-024** tab freshness parity (Gappers/NHL vs other tabs); Day Trade displayed qualification counts (**Batch 196** reconciliation).

**Deferred:** AI Trader (**POST-LAUNCH PAUSED**), brokers, billing, real-time-feed upgrades (**ISS-008** / batch **205**).

---

**Historical continuity snapshots (preserved):**

See `docs/CHANGELOG.md`, `docs/DEPLOYMENT_STATUS.md`, and `docs/release/` runbooks for Batch 190–191 history, Gate 4 pass/regression, and ISS-034 criteria.

**Batch 210 (when merged):** Unified Release Control V1 — manifests under `docs/release/manifests/`, runbook `docs/release/batch210-unified-release-control-v1.md`, **ISS-039** (git provenance vs live platform identity).

# Session handoff (archive)

See `docs/CHANGELOG.md` and `docs/release/` runbooks.
