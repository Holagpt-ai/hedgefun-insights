# Session handoff — current 2026-11-01 ET

**GitHub `main`:** `ed4fbd8d7dc2722d89bc36320095ec87c31bc3e9` (PR **#204** Batch **190.10** atop **#203** Batch **190.9** atop **#202** docs **`56816bd5`**). **Production Edge:** still Batch **190.8** deploy **2026-10-30 23:54:35–23:54:46 UTC** from integration **`f8e2fda698c473519d4ddb40f06f04ad6f13c4d6`**, Lovable submitted source SHA-256 `7bf8c45d9c26ff021693624f21f878e90c3193d4f16dbb92fd59123ae39c32d6`; revision ID unreported.

**Lovable integration:** `cursor/lovable-sync-from-main-20261024` @ **`b7a76d9a34a9fc2418d3ec6e483945fe0745c9f7`** (forward-sync **190.9+190.10** from `main`; Lovable-only migrations and generated files preserved). Preflight runbook: `docs/release/batch190-9-10-sync-screener-edge-preflight-v1.md`. **Supabase:** Lovable Cloud `zcjptaolpumhtlwhlemq`. Cron job 25 remains active.

**ISS-034 P0 OPEN.** Gate 4 on **190.8** **passed 2026-10-31 01:08 UTC** (three consecutive six-tab publications). Last success **03:20:02 UTC**, 110 rows. **Saturday 2026-10-31** regression through ~**21:35 UTC**: **164** `http_409` failures and **54** `prior_generation_retained` aborts. **Sunday 2026-11-01:** live Edge unchanged; six-tab feed still stale vs last success. **Monday 2026-11-02** production acceptance **pending** after owner Lovable deploy of **`sync-screener-data` only** from **`b7a76d9a`**. Do not start Batch **191**.

**Rollback:** Approved Git-snapshot fallback remains Batch **190.7** integration **`2691424bbfa89b4da9a3ca9a832c007606b5a582`** (not exact binary of live **190.8**). Historical Git-only exception does **not** auto-authorize the **190.9+190.10** deploy; capture Lovable “before replacement” state per `docs/release/edge-function-release-lovable.md`.

**Next:** Owner executes Lovable **`sync-screener-data`** deploy from integration tip (not from Cursor). Merge docs preflight PR when approved. No migration apply, cron, secrets, or scanner invoke from Cursor unless explicitly approved.

**Deferred:** Batch **191+**; AI Trader, brokers, billing, major real-time-feed upgrades.

---

# Session handoff — 2026-10-31 ET (archive)

Gate 4 **passed at 01:08 UTC** then regressed; **164** `http_409` and **54** `prior_generation_retained` through ~**21:35 UTC**. PR **#203** / **#204** were in review at that time; both are now merged to **`ed4fbd8d`**. Details preserved in `docs/DEPLOYMENT_STATUS.md` and `docs/CHANGELOG.md`.

---

# Session handoff — 2026-10-30 ET / 23:55 UTC snapshot

**Code:** GitHub `main` `b720106771950b7ed90c81d53f3ce2f196e35c49` (Batch 190.8 PR #201). Lovable integration @ `f8e2fda698c473519d4ddb40f06f04ad6f13c4d6`.

**Owner authorization and live Edge:** Git-snapshot-only rollback exception for unavailable revision ID; fallback **`2691424bbfa89b4da9a3ca9a832c007606b5a582`**. Deploy **2026-10-30 23:54:35–23:54:46 UTC**, submitted source SHA-256 `7bf8c45d9c26ff021693624f21f878e90c3193d4f16dbb92fd59123ae39c32d6`.

**Production acceptance (pre-pass):** 23:55:40 UTC read-only; feed **20:10:02 UTC**, 108 rows; Gate 4 later passed then regressed as above.

---

# Session handoff (archive)

See `docs/CHANGELOG.md` and `docs/release/` runbooks.
