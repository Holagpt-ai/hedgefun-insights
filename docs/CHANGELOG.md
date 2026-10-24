# Changelog

Application history below is a map of `main`, not a claim that each merge was deployed. Deploy facts belong in `docs/DEPLOYMENT_STATUS.md`.

## Unreleased

- Project intelligence V1: repository memory, architecture docs, issue register, session handoff, and `npm run integrity`.
- No product behavior change.

## main through 63957b31 (2026-10-24)

| SHA | What landed |
| --- | --- |
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

## Not on main

AI Analyst Catalyst Evidence Depth V2 and chat catalyst delivery remain only on `origin/cursor/chat-single-pass-v1` (`68c88114`, `2f22387b`, `ed75aa71`) and, in a smaller form, on `origin/cursor/catalyst-evidence-depth-v2` (`c3bb034a`). See `docs/PROJECT_MEMORY.md`.
