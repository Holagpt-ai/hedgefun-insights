# Issue register

Keep this list short. Move fixed items to `docs/CHANGELOG.md`. Labels: **confirmed**, **reported**, **deferred**.

**Scanner & market intelligence (Nov 27):** **Source corrected** PR **#282** @ **`9b01caa0`** — NHL tab session reference + baseline truth precedence, intraday RVOL overlay on standard tabs, PM Inbox early-close gate, float partial map, sort/trust/historical terminal states. **Production acceptance OPEN** (Vercel; Edge row-level 5m RVOL persist **activation-only**). Preserves v530 / Option B / Layer C checkpoint.

**Homepage My Assets Watchlist (Nov 27):** **Fixed in git** PR **#280** @ **`b0c6f46b`**. Runtime / authenticated acceptance **deferred to final inspection**.

**AI Trader navigation (Nov 27, deferred):** Shelved until **2027**. Nav removed in PR **#280**. Infra preserved OFF. See **ISS-009**.

**Historical catch-up queue (Nov 26–27):** Production v57 stuck at **`BKH`** — confirmed empty-window deferral-belt cycle. **Source corrected** in PR **#281** (exclusive cursor advance, wrap-once exhaustion, campaign stuck-cursor halt, partial-window cursor safety, terminal log discrimination, post-lock campaign state, unified queue ordering). **Activation OPEN** — worker still **0** machines / preflight on; do not resume until corrected image deploys. Checkpoint preserved: **16/20**, **7432+7500/50000**, durable **599 / 340,797 / 32,939**, eligible ~**4735**, target **2026-11-25**, floor **2021-11-29**. Procedure: `historical-catchup-activation-procedure-v1.md`.

**Repeat Movers episodes (Nov 25–27):** Stale since **Oct 20** — **activation** after historical catch-up writes; Edge apikey + client distinctions already shipped. No redundant client rebuild.

**Catalyst Calendar V4 (Nov 26–27):** PR **#278** / **#279**. Lovable source sync reportedly completed. **Production activation BLOCKED** (migration safeguards + pending 28-table / TRUNCATE evidence). Calendar SQL / economic Edge / ingest / recurring refresh **unactivated**.

**Lovable RLS report (Nov 26, reported):** Critical — **28** tables — inventory **pending**. **Do not Fix All** in calendar recovery.

**Homepage Muse V21 (Nov 26, merged):** PR **#277** on `main`.

**Production checkpoint — November 25, 2026 (v530 + Option B ON; Layer C activated 19:34 UTC):** Edge v530; Option B **ON**; Layer C + reconcile SQL applied **direct outside ledger** @ **19:34:12 UTC** (ledger **not** marked); pubs **107**/**108** @ **19:35**/**19:40 UTC**; ISS-043 **CLOSED**. **P0 Watchlist AI:** six runs, **0** successes, `AI_PROVIDER_ERROR` ~130–171 ms — **precise upstream cause UNVERIFIED**; PR #275 adds containment + classification (pending Edge deploy). **P1 Brief:** `temporarily_unavailable` / `UNKNOWN` → reclassified `COST_GUARD` for model-not-found class. **P1 Repeat Movers:** episodes stale **Oct 20** — ingestion runbook `batch-nov25-repeat-movers-ingestion-runbook-v1.md`. **P1 ISS-024 tab delayed copy:** screener trust parity fix in same PR (Vercel).

**Earlier checkpoint (18:30 UTC; superseded for Layer C):** Layer C was **unapplied** in git-only state before owner direct SQL activation.

**Earlier Nov 25 read-only (16:36 UTC; superseded for deploy state):** Nov 23–25 publication ledger within expected ET windows; Nov 24 **58** consecutive `prior_generation_retained` (Gappers coverage); Nov 24 **09:30** / Nov 25 **09:40** **7/7** then stalled at pre-fix `finalize_stage:merge_selections` (~12 s), aborted ~30 min without recorded cause. **Diagnostic fix on branch (not deployed):** durable markers after merge selection + load volume baselines. **Kill mechanism UNVERIFIED.** ISS-034 **P0 OPEN**. **ISS-043 PASS** (session window 04:00–19:55 ET observed; no cron change). Option B **#261** on `main`, **OFF** in prod.

**Superseding production checkpoint — November 22, 2026 (docs-only):** GitHub main be8659df (#265 merged); ISS-034 Edge-only deployment Nov 18 completed with Option B OFF; first natural 17:15 UTC publish 7/7, 103 rows, six tabs evaluated / 0 unresolved Gappers; full Batch 191 acceptance **OPEN**. **ISS-049 backoff shipped to Fly v50** Nov 18 ~18:06 UTC; immediate Radar V2 HTTP 200 PASS, natural 57014/backoff/24h acceptance **OPEN** (rollback reference v49, not auto-authorized). **ISS-044 OPEN**: read-only Nov 22 closed snapshot count 0; need 20:00 ET park verification, not a repeat Fly deploy. **AM Inbox anonymous-execution defect FIXED in production via owner-authorized direct Lovable SQL** after PR #265 merge: anon=false, authenticated/service_role=true, unchanged function body. Migration history was not repaired, replayed, or marked applied; ISS-025 authenticated UI still OPEN. **Market-data Upstash capacity, 20-symbol Radar history batching, RVOL baseline and AM Inbox qualified fallback are existing code fixes**, not new implementation tickets. Live acceptance is tracked separately. See docs/release/stocksist-session-handoff-2026-11-22.md.


**Post-Batch 202 Group 4 public site (Nov 15 ET, PR pending, base `87759b67`):** **ISS-038** delayed-data copy fixes in git; **OPEN** until Vercel prod acceptance. **ISS-044** remains on branch `cursor/iss044-closed-session-evidence` @ **`159c62c7`**. Runbook `batch202-public-launch-readiness-v1.md`.

**Post–ISS-034 Edge deploy (Nov 18 ~17:10 UTC, owner-reported):** `sync-screener-data` fingerprint **`e16fba307fd842e3df5984432153976286bca7221c77f6ac0f8dae820c0a21fd`**; Option B **OFF**. Natural **17:15 UTC** job **7/7**, **103** rows, six tabs evaluated, Gappers unresolved **0**, no continuation error/abort. **ISS-034 OPEN** (remaining acceptance matrix). **ISS-049 OPEN** — Lovable: **23** statement cancellations / ~24 h; **99** failed Radar saves / **8 min** (Rad separate from screener; runbook `iss049-radar-persistence-statement-cancel-v1.md`). **No** ISS-034 handler change from this batch.

**ISS-034 Nov 16 all-day stall:** Last publish **9:25 AM**; **87**× `prior_generation_retained`. Unresolved **ASBPW**, **ASPCR** (`missing_prior_close`, positive `day.o`, zero `prevDay.c`). **Full-universe replay gate SATISFIED** (Nov 17): job `4ed4a4c7-d8c4-4582-bd89-cc949d6e291d`, **13,240** tickers, Deno replay **exit 0**, counters **1302/1298/1/1/2**, mismatches **none**, helper delta **0**; frozen baseline + policy exclusions validated (`observation.now_ms` **1794866701060 ms**). Export **not in git**. **PR #260** merged **main** `b04789c0` (diagnostics + replay). **PR #261** Option B (`SCREENER_ALLOW_DEGRADED_GAPPERS_PUBLISH`, default off) vs **main** — **not merged/deployed/activated**. **ISS-034 OPEN** until #261 merge, deploy, production acceptance. **ISS-024 Layer C** **BLOCKED**.

**Post-Batch 233 merge + ISS-034 Nov 13 (Nov 14 ET, `main=72c1a57c`):** PR **#251** merged November **12** at **`72c1a57ca9e6aa77fea5b15cc6a0ed8606f481db`**. **ISS-048** source implementation **complete**; **OPEN only for authenticated production acceptance**. GitHub → Lovable guarded sync run **`43319836884`** **succeeded** (check + apply jobs); Lovable **editor parity** and **running deployment identity** remain **independently unverified**. Source sync **≠** Edge/SQL deploy. **ISS-034:** Friday **Nov 13 09:30** failed closed — **7/7**, no publish RPC, **`prior_generation_retained`**, last durable **`finalize_stage:build_evidence`**, Gappers **`prerequisite_unavailable`**, NHL **`not_evaluated`**; **09:25** **88** rows; **09:50** **101**; **10:05** **102** / six tabs evaluated. **ISS-044** next P0: Nov **12 20:00 ET** — **119** Radar candidates, **RAIN** and **SHFS** `COOLING`, **0** closed-session snapshot rows, feed still **`after-hours`**; root cause **undetermined**. Runbook: `docs/release/iss034-nov13-opening-bell-evidence-v1.md`.

**Post-Batch 233 (Nov 12 PM ET, Journal + Action Center, PR pending, base `c8a1296f` — historical):** **ISS-048** — Action Center Continue Workflow dropped handoff symbol; Journal Screeners link omitted `securityId` — **fixed in git** (then merged as **#251**). Batch **188** / **173** / **16** **PASS** in audit. Authenticated checklist **NOT VERIFIED** (`batch233-journal-action-center-reliability-v1.md`).

**Post-Batch 232 (Nov 12 PM ET, Watchlist, merged, base `c8a1296f`):** **ISS-047** — V2 stale after alternate add paths + row workflow links missing `securityId` — **fixed in git** (not deployed). Cold load / trust / RLS contracts **pass** in audit. **Authenticated Watchlist UI NOT VERIFIED**. Runbook: `batch232-watchlist-reliability-v1.md`. Batch **231** ledger **502** jobs Nov 10–12 recorded; Layer C per-tab job evidence **NOT VERIFIED**.

**Post-Batch 230 (Nov 12 PM ET, AM Inbox, PR pending, base `34e8fb73`):** ISS-025 audit — continuation RPC/path **pass** at Nov 9 scale; fixes: workspace **25 s** timeout, `amInboxNavigatePath` symbol handoffs. **Authenticated AM Inbox UI NOT VERIFIED** — **ISS-025 OPEN**. Runbook: `batch230-am-inbox-continuation-v1.md`.

**Post-Batch 229 acceptance (Nov 12, authenticated Catalyst UI):** **Upcoming Earnings 821**, **Reported in Last 24h 791** after PR **#248** deploy. **ISS-046** — **UI VERIFIED** on production; counter defect **closed in git**.

**Post-Batch 229 (Nov 12 ~12:42 PM ET, Catalyst counter defect):** **Confirmed** misleading **Upcoming Earnings: 0** when feed `limit: 500` + `eventDateOrder: asc` saturates on Nov 9 historical rows despite 1,054 future earnings in DB. Fixed Batch **229** PR **#248**. Runbook: `batch229-catalyst-earnings-count-v1.md`.

**Post-Batch 228 deployment (Nov 12 12:19 ET):** Owner approved one-time **Git-snapshot-only rollback exception** (previous Edge revision unavailable). Lovable Cloud reported **successful** `sync-screener-data`-only deploy 12:18:24–12:18:34 ET from GitHub source `caefbe6b5e5d83582d0a69c8cf6f74bf3b0d0def` / editor `09266183e352b6a21f61acbd10d23ce91b2016f8`, fingerprint `07656eebf28569838df72838ea1f5c2026344167eb157b2728b25291bcbe3e29`; OPTIONS 200, actual running Edge version ID unavailable. Fallback Git source `e7a3eaeeceec1310e941d263dd5df63fd3b76998` is NOT exact binary restore. Read-only last publication 12:15 ET predeploy, 107 rows — not yet postdeploy acceptance. **ISS-034 OPEN** pending Nov 13 natural 09:30 ET; ISS-024/044/045 unchanged. Unrelated regenerated Penny `types.ts` + frontend preview typecheck mismatch tracked for separate cleanup, Penny inactive. No SQL/cron/Fly/frontend publication or other Edge deployment.



**Post-Batch 228 (Nov 12, opening-bell finalize, PR pending, base `e7a3eaee`):** **Confirmed** Nov **10–12** **09:30** stranded-finalize → **`expire_screener_sync_stale_jobs_v1`** abort (~12 min lease, null `abort_reason`). **Not** CPU-verified. Edge fix: release expired leases before abort; resume gating; marker after claim. **Nov 10 AH:** **48/0** published (ledger). **ISS-034 OPEN** until deploy + acceptance. Runbook `batch228-opening-bell-finalize-v1.md`.

**Post-Batch 227 final evidence (Nov 12 ~11:00 AM ET, read-only Lovable, PR #245, `main=6a969e94`):** **Nov 11** ledger PM **66/0**, RTH **71/2**, AH **48/0**; **Nov 12** partial RTH **16/1** through **~11:00 AM** (+ PM **66/0**). Feed **104** rows, tabs **`evaluated`**, Gappers **0**, NHL **available**. Opening **09:30** markers **`finalize_stage:claim_finalize_lease`** (Nov 11–12); **Nov 11 09:45** retention. **No CPU/root-cause inference.** **Nov 10** Batch **191** attestation **preserved** (AH **not accepted**). **ISS-034/024/044/045 OPEN.** **ISS-045:** Vercel prod identity **NOT VERIFIED** (not PR preview). Radar closed snapshot **0** rows; candidates **176** Nov 12. **No scanner source fix.** PR **#243** superseded — leave **OPEN**. Runbook: `docs/release/batch227-scanner-p0-acceptance-v1.md`.

**Post-Batch 191 ledger attestation (Nov 10 ~1:30 PM ET, PR #233):** Owner-verified job ledger (Lovable read-only): Nov **6/9/10** PM/RTH/AH publication counts in runbook; Nov **10** RTH **43** pubs (**7/7** + publish RPC), **4** aborts; feed **107** rows, six tabs **`evaluated`**, Gappers **0** unresolved, NHL **available**. **Nov 10 AH not accepted.** **ISS-034** / **ISS-024** **OPEN** — historical per-tab evaluation + authenticated UI not verified (`docs/release/batch191-scanner-acceptance-v1.md`).

**Post-Batch 217 merge, Nov 9 (historical):** PR #230 merged at `main=79260fbb`; Vercel check passed. Preview-auth #231 later merged to `main`. **ISS-040 OPEN**; **ISS-025** authenticated UI **NOT VERIFIED**.

**November 9 evening status supersedes the afternoon narrative below:** GitHub `main=17a31da8` (Batch 216 merged). GitHub → Lovable guarded apply **succeeded** (Actions `42676903219`), integration/editor included main; owner set `STOCKSIST_LOVABLE_SYNC_ACTIVATED=true` for automatic forward-sync. **ISS-040 OPEN only for unattended post-merge acceptance**, not source parity or activation; Edge deployment remains separate. Owner-reported Batches **215/216 Edge deploy completed**. **ISS-034** root cause still **NOT YET VERIFIED** (marker correlation open). **ISS-043** awaits closed-session observation after Edge deploy. **ISS-025:** Nov 9 RPC 3,776 rows / 1,525 symbols; Batch 217 readiness in PR; authenticated UI **NOT VERIFIED**.

**November 9 afternoon status (historical):** GitHub `main=ff81065b`. One-time GitHub → Lovable sync succeeded (integration/editor `fee9ab51`); activation variable returned to **false**. Permanent automatic sync is **not** active (**ISS-040 OPEN**). 09:30 ET 7/7 finalize recorded `http_546` and aborted without publication; Edge v518 logs did not name the stage. Recovered at 11:50 ET with 113 rows across six tabs; 10:55–11:50 ET jobs all published (**ISS-034 OPEN**). Batch 216 records the stage boundary only; root cause **NOT YET VERIFIED**.

**November 9 morning status (historical):** GitHub `main=c7cf47ee`; Lovable integration/editor `a751f7d5`; Batch 211 apply SKIPPED, **ISS-040 OPEN**. Batch 215 PR #227 merged but closed-session Edge activation not verified (**ISS-043 OPEN**). Today 09:30 ET 7/7 finalization recorded `http_546` without publish; 09:05 ET job aborted after a delayed finalize, 09:20/09:25 recovered with 94-row publishes (**ISS-034 P0 OPEN**). Friday Nov 6 RTH 47 published / 26 aborted; AH 48 published. Nov 7 and Nov 8 each 288 weekend aborts. Batch 213 diagnostic RPC exists in production with expected EXECUTE ACL and empty search_path; actual migration ledger remains unverified (**do not blindly reapply**). Admin authenticated UI/role remains unverified. All PRs #220–#227 are merged in GitHub; source merge does not establish Edge deployment.


**Historical baseline (Nov 6):** `origin/main` **`67e3418a`** (2026-11-06, Batch **191.1** PR **#221**; prior baseline **`3c810c4b`**). Batch **190.15** merged (PR **#217**); reported Edge **2026-11-04** + SQL **`supabase/migrations/20261104230000…`** via Lovable Drizzle **ledger idx 68** (`schema_migrations` **no** matching row — record only). **Nov 6 2026 (reported):** Batch **190.16** owner checkpoint — **`sync-screener-data`** Edge **v516**, six consecutive natural premarket generations (narrow window); recorded under Batch **210** example manifest `historical_evidence.production_checkpoint_2026_11_06` — **does not close ISS-034**. Batch **195** merged (PR **#212** → **`5d6399de`**); **ISS-037** merged (PR **#215** → **`3bd3ee68`**) — production verification **NOT VERIFIED** for either. Batch **196.2** (**#211**); **196.1** Fly v46 (**#209**/**#210**). Batch **192** (**#208**); Batch **191** docs (**#207**). Nov 2 premarket PASS (60/62/63). Master backlog: `docs/release/STOCKSIST_MASTER_PENDING_BACKLOG_2026-10-28.md`.

Original ten Lovable scanner warnings: `docs/release/lovable-scanner-reliability-warnings.md` — disposition in master backlog §4; do not reassign all ten wholesale.

**09:42 ET log/source follow-up:** Lovable's diagnostic read found Edge runtime **version 518**, a **09:35 ET HTTP 409** for `sync-screener-data`, but no matching 09:30 HTTP 546 request record, stage-enter/exit evidence, or explicit `CPU Time exceeded` message in its sampled 14:25–14:40 UTC log window. The **database** `continue_last_error=http_546` on the 09:30 job remains confirmed. Exact runtime failure stage and CPU-vs-other-resource cause remain **UNVERIFIED**; prioritize correlating logs and bounded stage tracing, not speculative infrastructure changes. During this Lovable **plan-mode** log review, Lovable created **two Git commits altering only `.lovable/plan.md`**; the new integration **and editor** tip is `a751f7d5854114fab651f0fbd29214c3da5bff0d`, **86 commits ahead** of main and still **5 behind**. GitHub compare verified no other path changed between the previous and new integration tips. The plan artifact is a Lovable-only overlay, not a backend deployment.

## Current active triage

| ID | Priority | Open item | Status / next action |
| --- | --- | --- | --- |
| **ISS-049** | **P0** | Radar V2 replace_radar_v22_candidates_v1 statement cancellations / failed-save bursts | **MITIGATION DEPLOYED, ACCEPTANCE OPEN.** PR #264 merged 47f2136b; Fly v50 deployed Nov 18 ~18:06 UTC with 30s checkpoint-aligned failure backoff; first postdeploy publish_candidates_v2 HTTP 200, 130s bridge timeout. Historical Lovable reports: 23 DB cancellations / 24h, 99 failed Radar saves / 8 min; precise 57014 burst correlation still unresolved. Need natural post-v50 failure/backoff and 24h persistence observations; do not redeploy absent evidence. Runbook iss049-radar-persistence-statement-cancel-v1.md. |
| **ISS-034** | **P0** | Scanner repeated-session acceptance / finalize stalls | **v530 DEPLOYED; Option B ON; PARTIAL ACCEPTANCE.** #273 markers on v530; **11** consecutive pubs through 18:30 UTC. Batch **191** matrix + opening-bell + multi-day acceptance **OPEN**. Layer C+reconcile SQL pending for stranded-job audit on Option B publishes. |
| ISS-033 | P0 | Premarket `day.v=0` vs `min.av` | **Fixed in git + Edge D1 deployed** (`23980c31…`). November 2 premarket acceptance window reported **PASS**. Keep broader Batch 191 matrix open until regular and after-hours checks are verified. |
| ISS-024 | P0 | Tab evidence / Gappers inputs | **Layer B** verified. **Layer C** migration **unapplied**; git bundle `20261116153000` + `20261125203000` (Option B reconcile) ready — `batch191-layer-c-option-b-activation-bundle-v1.md`. Owner SQL via Lovable integration; **preserve v530** Edge. **Layer D** on `main`; UI **NOT VERIFIED**. |
| **ISS-025** | **P0** | AM Inbox continuation loading and authenticated UI acceptance | **CLIENT FALLBACK IN LIVE SOURCE; UI ACCEPTANCE OPEN.** Qualified candidates default to up to six when priority=0, without View all; qualifying zero-priority natural session not witnessed. **Separate backend ACL corrected:** public.late_session_handoff_list_active_v1(date) anon EXECUTE=false after owner-authorized Nov 18 direct Lovable SQL, authenticated/service_role true; this was **not** marked as ledger migration. Preserve next-session/expiry and frontend entitlements. |
| **ISS-047** | P1 | Watchlist V2 stale after alternate add paths; row workflow links omit session `securityId` | **FIXED in git (Batch 232, merged PR #250).** Authenticated Watchlist checklist **NOT VERIFIED** (`batch232-watchlist-reliability-v1.md`). |
| **ISS-048** | P1 | Journal / Action Center workflow drops handoff `securityId` on outbound navigation | **Source complete** (Batch **233** PR **#251** merged `72c1a57c`). **OPEN only for authenticated production acceptance** (`batch233-journal-action-center-reliability-v1.md`). |
| ISS-036 | P1 | Extreme / unreliable volume acceleration display | Batch **196.1** merged (`797cc615`) and Fly **v46** deployed 2026-11-04. Worker `/health` **running**, Polygon subscribed. Live acceleration-value acceptance **NOT VERIFIED** (no sampled rows this window). |
| ISS-032 | P2 | Journal terminal-error loading | Fixed on `main` (Batch **188**) → **Batch 193** acceptance. |
| ISS-026 | P1 | Earnings ranking / Edge | **Source complete** (Batch **187**–**187.2**): dedicated calendar fetch, `rankEarningsByMarketImpact`, truncation flags, AM Inbox copy. **Edge activation UNVERIFIED** (`get-pre-market-workspace`, `sync-earnings-finnhub`, `sync-catalyst-events`) — owner-authorized Lovable deploy only; no new ranking code in Group 3. |
| ISS-027 | P1 | Risk / AI Brief mobile layout | Fixed on `main` (Batch **188**) → **Batch 193**. |
| ISS-028 | P1 | TSLA/SpaceX direct catalyst in UI | **Source complete on `main`** (Batch **195** + **195.1** issuer attribution, wire/editorial badges, `hydrateCatalystEventVerification`, Radar `headlineQualifiesForTickerScopedNews`). Group 3: Edge **`precedence.ts`** authority multiplier parity with client + **`attribution.ts`** `reconcileAttributionWithLiveRules` / `headlineQualifiesForTickerScopedNews` for ingest/brief paths. **Vercel + Edge deploy NOT VERIFIED** — **cannot close**. |
| ISS-029 | P2 | Homepage AI Trader / countdown | **Fixed** (Batch **189**). |
| ISS-030 | P2 | Carryover mobile cards | Fixed on `main` (Batch **188**) → **Batch 193**. |
| ISS-031 | P1 | Homepage movers vs Radar tabs | Explained — different universes. **Nov 5 reported:** homepage pricing copy read as **real-time** while delayed-feed disclosures apply elsewhere — see **ISS-038**. |
| **ISS-038** | P2 | Homepage delayed-data copy vs real-time wording | **FIXED in git (Batch 202 + Group 4 billing/disclaimer/admin plan bullets).** `SUBSCRIPTION_MARKET_DATA_FEATURE` in `public-market-copy.ts`; Billing, Disclaimer, Admin Subscriptions aligned to **15-minute delayed** policy. **OPEN** until **Vercel production** visual/sign-off. Runbook `batch202-public-launch-readiness-v1.md`. |
| **ISS-039** | P2 | Cross-platform release provenance vs live deployment identity | **CONFIRMED OPEN.** Git **Batch 210** adds immutable release manifests and read-only verification; **MATCH** on git ancestry and source closure hashes does **not** prove Edge/Vercel/Fly runtime binaries without platform-attested digests. Populate append-only attestations under `docs/release/manifests/attestations/`; authenticated platform API batches stay deferred. |
| **ISS-040** | P2 | GitHub main → Lovable integration automated source sync | **Guarded apply run `43319836884` succeeded** (Nov **12** after #251; check + integration-sync jobs). That does **not** attest Lovable **editor** SHA or live Edge/Vercel/Fly identity. **OPEN** for independent editor-parity check; never interpret source sync as Edge/DB deploy. |
| **ISS-043** | P1 | Scanner cron starts closed-session generations | **CLOSED (Nov 23–25).** Generations within **04:00–19:55 ET**; no cron change. |
| **ISS-042** | P1 | Admin access gate, role verification and diagnostic dashboard | Batch 214 PR #226 **MERGED**. Authenticated owner role/UI **NOT VERIFIED**. Batch 213 RPC is present in production with expected EXECUTE ACL and empty search_path, but migration ledger provenance **NOT VERIFIED**; do not reapply blindly. Verify admin and non-admin behavior; no unsolicited role grants. |
| **ISS-044** | **P0** | Radar V2 closed-session park empty; feed can remain after-hours | **FLY FIX DEPLOYED, 20:00 ET ACCEPTANCE OPEN.** ISS-044 closed-park retry PR #257 present in v49 and retained in v50; v50 deployed Nov 18. Read-only Nov 22 radar_v22_closed_snapshot count=0 (does not alone identify cause). Need naturally observed 20:00 ET parked snapshot when candidates exist, correct session state and no AH replay. v49 is current rollback reference, not v47; no redeploy/rollback without owner authorization. |
| **ISS-045** | P1 | NHL UI shows baseline unavailable while feed reports baseline available | **CONFIRMED (code, Nov 11).** **219.3B** on `main`. Feed reports NHL **`available`** @ Nov **12 ~11:00 AM** (Layer B). **Vercel production deployment identity NOT VERIFIED** — do not infer from PR preview. **OPEN** until verified prod deploy + owner authenticated NHL tab acceptance. |
| **ISS-041** | P2 | Client `resolveMarketSessionAt(ms)` without a schedule treats weekends as open | **FIXED in git** (PR **#255** merged `90ddda12`): `scheduleOrFallback` → `resolveSessionSchedule(date, null)`. **User-visible impact NOT VERIFIED.** |
| **ISS-037** | P2 | Screener free-float missing or unreliable | **Source complete** (PR **#215** → **`3bd3ee68`**): `useRadarFloatForSymbols`, `verifiedFloatRecordForDisplay` / stale `effective_date` rejection, screener **Free Float** column with measurement **as of** label (not publication `float_shares`). Group 3: **preserved** — no new float implementation. **Production verification NOT VERIFIED**. |

**Verification (not new implementation):** Batch **174** **CONDITIONAL**; Batch **175** persistence **PASS**, UI **NOT VERIFIED**; PR **#174** **CLOSED** unmerged.

## Confirmed

| ID | Item | Evidence |
| --- | --- | --- |
| ISS-002 | Navigation routes | `npm run integrity` (2026-10-24). |
| ISS-003 (Fly) | Radar worker v45 parity | Read-only 2026-10-24 **PASS**. |
| ISS-020 | `day.v=0` missing volume | Fixed #169. |
| ISS-021 | Premarket session labels | Batch **178**. |
| ISS-016–019 | npm / bundle / browserslist | Partially mitigated; remainder **Batch 202** / **198**. |
| ISS-015 | Production `chat` not on recovered delivery | **Blocked** — batch **204**. |
| ISS-022 | Catalyst headline issuer mismatch | Batch **181**. |
| ISS-023 | Mobile navigation freeze | Fixed git Batch **184**; mobile re-check **Batch 193**. |
| ISS-046 | Catalyst Upcoming Earnings summary **0** | **FIXED + UI VERIFIED (Nov 12).** Production **821** upcoming / **791** last 24h. PR **#248**. |

## Reported

| ID | Item | Notes |
| --- | --- | --- |
| ISS-003 (Vercel/Edge) | Manifest / revision ids | Partial screener fingerprints recorded Oct 28; full matrix unknown. |
| ISS-005 | Batch 34 status | Not refreshed. |
| ISS-006 | Catalyst distribution | Deferred — **Batch 203**. |
| ISS-007 | AI Analyst streaming | Deferred — **Batch 204**. |
| ISS-037 | Screener free-float reliability | See active triage; **NOT VERIFIED** — investigation deferred post–Batch **196.2**. |
| — | Day Trade Radar qualification counts (Nov 5) | **Reported:** displayed qualification counts require database reconciliation; no inconsistency confirmed — **Batch 196** acceptance. |
| — | Watchlist Analysis pending (Nov 5) | **Reported:** **17** symbols rendered with many **Analysis pending** states — log correlation deferred (**ISS-007** / batch **204** unless reproduced with backend evidence). |

## Deferred (product / platform)

| ID | Item | Master batch |
| --- | --- | --- |
| ISS-008 | Real-time feed | **205** |
| ISS-009 | AI Trader | **Shelved until 2027** (nav hidden Nov 27; infra preserved OFF) |
| ISS-010 | Broker | **207** |
| ISS-011 | Billing | **206** |
| ISS-012 | SEC schedule edits | No new batch unless new evidence |
| ISS-013 | Community | **209** |
| ISS-014 | Sitemap | **202** conditional |
| ISS-018 | Middleware deprecation | **198** / **202** |

## Historically verified

| ID | Item | Boundary |
| --- | --- | --- |
| ISS-004 | Gate I.3 SEC activation | Historical PR #163. |

## Not a defect

- MCP id `hedgefun-mcp` / generated bundle.
- Lovable integration branch role and protected files.
