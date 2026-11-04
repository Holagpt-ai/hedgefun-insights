# Session handoff — current 2026-11-04 ET

**Code:** GitHub `main` **`2edaabfc`**. Fly `stocksist-radar-v22-worker` **v46** deployed from **`797cc615`**.

**In flight:** **ISS-037** screener free-float display — PR **#215** head **`e4281c05`** (release-safety revision: frontend float only, publication path unchanged); **Vercel only** after merge. Batch **190.12** migration + **190.13** cron body fix: Lovable owner pending as applicable.

**ISS-028** open. Authenticated Catalyst/Watchlist/Radar production walkthrough **NOT VERIFIED**.

**Deployment and acceptance evidence (preserved):**
- November 1 Lovable Cloud `sync-screener-data` source reported as **`ccb4055b3f8b84c46fa38529844150c140638705`**.
- November 2 premarket acceptance reported **PASS** (seven consecutive publications, 04:00–04:30 ET; row counts 60/62/63; no new `http_409` in that window).
- **Batch 191:** **PARTIAL** — regular-session and after-hours acceptance still **NOT VERIFIED** (Nov 4 RTH **FAIL** — publication deadlock; see ISS-034 / Batch **190.12**).
- **Batch 192 activation (reported):** Vercel production deploy for AM Inbox UI; Lovable Cloud **`generate-daily-brief`** Edge deploy for evidence-cutoff rules. Cached brief rows unchanged until regeneration.

**Batch 196.1 Fly activation (2026-11-04):** Release **v45 → v46**. New image `deployment-01M6K5GH34NZCA1C5Y45AWPVHZ` (`sha256:9f29e7cd2c13b6acb306b153e3468f86edf348794e492c5e4d7dad17abfbee47`). Machine **`8e4192a73d09e8`** started once; no new OOM. `/health` moved from brief startup `degraded` to **`running`**; Polygon subscribed, feed not stale. `last_error_code` null after restart (v45 had carried `persist_failed`). Live acceleration percentages were **not sampled**. **ISS-036** not closed. **ISS-034 OPEN** (regular-session and after-hours publication acceptance still required). **ISS-025** visual acceptance **NOT VERIFIED**.

**Next:** Owner acceptance of ISS-036 on natural scanner rows. Complete Batch **191** RTH/AH acceptance. No further Fly, migration, or cron changes unless explicitly approved.

**Deferred:** AI Trader, brokers, billing, large real-time-feed upgrades.

---

**Historical continuity snapshots (preserved):**

See `docs/CHANGELOG.md`, `docs/DEPLOYMENT_STATUS.md`, and `docs/release/` runbooks for Batch 190–191 history, Gate 4 pass/regression, and ISS-034 criteria.

# Session handoff (archive)

See `docs/CHANGELOG.md` and `docs/release/` runbooks.
