# Session handoff — latest 2026-10-28

**Canonical current main:** **`4f7c10db`** (PR **#193** P0 D1 merged).

**Lovable `sync-screener-data`:** **Deployed** D1 (fingerprint `23980c312052a4cb5de5be12e3a32b178e1d1fa8104c39f384e02f13845e6f03`). Integration branch tip **`d198a28f`** (ScanPreviewTest typing).

**Production blocker (ISS-034):** Oct 28 **16:45 / 16:50 UTC** — Edge **CPU Time exceeded**, ~13,262 symbols evaluated, **no publish** (last success **16:15:04 UTC**, 108 rows). Cron job 25 still firing.

**Next approved batch:** PR **`cursor/p0-screener-cpu-publication`** — session-volume memo + reduced full-universe evidence scans; 13,262-symbol Deno benchmark ~4s local. **Do not merge/deploy** until owner review.

**Open:** ISS-034 until redeploy + successful cron publish verified in Lovable.

---

# Session handoff (archive)

See `docs/CHANGELOG.md` and `docs/release/` runbooks.
