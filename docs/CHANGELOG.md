# Changelog

Application history below is a map of `main`, not a claim that each merge was deployed. Deploy facts belong in `docs/DEPLOYMENT_STATUS.md`.

## Unreleased

- Scanner + catalyst intelligence integration V1: SEC taxonomy labels on Screeners and Radar, Catalyst tab **SEC EDGAR** filter and `matchesCatalystFeedCategoryFilter`, verified zero volume preserved in market-mover ordering, Radar/Action Center symbol handoffs, and documented worker/client catalyst boundary. Vercel SPA deploy pending; Fly worker image unchanged. **ISS-015** remains open.
- Edge Function release and rollback procedure for Lovable Cloud (`docs/release/edge-function-release-lovable.md`); git SHA on `main` is distinguished from live Supabase Edge revision. **ISS-015** remains open.
- Recover AI Analyst Catalyst Evidence Depth V2, bounded chat catalyst delivery, and financial-fact extraction from `68c88114`, `2f22387b`, and `ed75aa71`. Official attribution now requires the asked symbol, events older than 45 days stay historical context, and priority facts need a source URL. Closes ISS-001 in git. `chat` is not deployed (ISS-015).
- Record October 24 Vercel findings as reported investigation items: 42 npm vulnerabilities (3 critical, 25 high, 13 moderate, 1 low), a production JS bundle of about 3.45 MB, a deprecated Vercel Edge middleware runtime, and outdated Browserslist data (ISS-016 through ISS-019). These are not confirmed production exploits.

## main through 9e1a9538 (2026-10-24)

| SHA | What landed |
| --- | --- |
| `9e1a9538` | PR #165. Lovable Cloud as managed Supabase operator; platform ownership in project memory and agent instructions. |
| `10723434` | PR #164. AI Analyst catalyst evidence depth V2 and bounded chat delivery. |
| `03449198` | PR #163. Project memory, architecture docs, issue register, session handoff, integrity checks, Lovable branch roles, and the historical Gate I.3 activation record. |
| `63957b31` | PR #162. Lovable-generated MCP artifacts aligned with the reviewed integration tip. |
| `ed3a3728` | PR #161. `main` reconciled with Catalyst V2.1 and Gate I.3 integration, including SEC circuit-breaker migration `20261024153000`. |
| `d835f704` | PR #156. Gate I SEC EDGAR recurring ingestion lease, telemetry, and dedupe. |
| `8d9232fd` | PR #155. Gate H.1 SEC remediation RPC privilege hotfix. |
| `56f6a057` | PR #154. Gate H SEC V1C historical misattribution remediation. |
| `9243c603` | SEC filing attribution integrity V1. |
| `d8d68231` | PR #152. Batch 37.1 cache-before-quota ordering. |
| `e22a8361` | PR #151. Batch 37 shared live market-data cache. |
| `3e730139` | PR #150. Batch 36 SEC activation readiness and verification tooling. |
| `c0b65511` | PR #149. Batch 34 core intelligence integration. |
| `6d659bcc` through `b499890f` | Batch 33 historical catch-up controls, entitlement recovery, and bridge identity cache. |
| `9951b303` | Batch 32 historical episode explorer. |
| `192e5218` | Batch 31 public experience, SEO, and onboarding. |
| `3338905f` | Batch 30 daily intelligence and catalyst workflows. |
| `53b1dde6` | Batch 29 catalyst source activation code. Enabling sources was a later ops plan. |
| `be50a5a1` through `8c929211` | Batch 28 Radar historical context, shared market-data cache, and momentum continuation. |

Earlier scanner, watchlist, journal, and screener releases are on `main` below those commits. Use `git log origin/main` for the full list. Feature presence is summarized in `docs/SESSION_HANDOFF.md`.

## Superseded recovery copies

`origin/cursor/catalyst-evidence-depth-v2` (`c3bb034a`) is a narrower copy of the same analyst work. This recovery used the archived-branch versions from `cursor/chat-single-pass-v1`. That archived branch was not merged. Active Lovable integration remains `cursor/lovable-sync-from-main-20261024`.
