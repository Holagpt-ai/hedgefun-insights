# Release gates

An application pull request and a production change are different approvals.

## Application PR

1. Branch from current GitHub `main`.
2. Keep the diff inside the approved batch. Do not mix migrations, Edge deploys, DNS, cron, or secrets into an application PR.
3. Run `npm run typecheck`, `npm run build`, and the tests for the area you changed.
4. Run `npm run test:integrity`. Run `npm run integrity` when routes, sitemap, brand, or MCP artifacts moved.
5. Open one pull request into `main`. Do not merge it unless the user asks.
6. Update `docs/SESSION_HANDOFF.md` and `docs/CHANGELOG.md` in that PR when the batch changes project memory.

Existing area checklists still apply when the batch touches them:

- `docs/release/production-reconciliation-checklist.md`
- `docs/sec-edgar/gate-i3-activation-readiness.md`
- `docs/catalyst-intelligence/batch34-catalyst-activation-sequence.md`
- `docs/release/batch34-production-release-manifest.md`

## After merge

1. Confirm Vercel Production built `main`. Compare `https://stocksist.com/asset-manifest.json` with the previous hash. The manifest does not contain a git SHA; record the deployment SHA from Vercel when someone is looking at it.
2. Sync Lovable from `main` or the active integration branch `cursor/lovable-sync-from-main-20261024` when that branch matches `main`. `cursor/chat-single-pass-v1` is an archived recovery branch, not the preview line.
3. Deploy Edge Functions or Fly images only when that batch lists the exact functions and the git SHA. Merging the app does not deploy them.
4. Apply Supabase migrations only through the approved Supabase process, in timestamp order, and only when the batch says to. Never rewrite an applied migration.
5. Leave the historically activated SEC schedule (cron job 52), `SEC_EDGAR_WRITE_ENABLED`, and `SEC_TRANSPORT_MODE` unchanged unless a later SEC batch says to change them. Do not reapply the Gate I.3 migration or redeploy `sync-sec-edgar-filings` from an unrelated PR.

## Integrity command

`npm run integrity` exits 1 on broken registered navigation, sitemap list drift, a sitemap path that is not a route, a non-apex canonical origin, a forbidden public host in brand files, or an MCP manifest/bundle mismatch.

Warnings do not fail the command. `origin/main` being ahead of the branch is a warning. A local `dist/` hash that differs from production is a warning only when `--remote` is passed. Network failure on `--remote` is a warning, not proof that production is down.

## Explicitly deferred

Real-time feed upgrades, AI Trader, broker integration, and billing go-live do not ride along with unrelated releases.
