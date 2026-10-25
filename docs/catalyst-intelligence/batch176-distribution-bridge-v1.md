# Batch 176 — Catalyst intelligence distribution bridge V1

**ISS-006:** Source code for intel → public `catalyst_events` distribution is implemented in git. **Production activation remains pending** (no Edge deploy, no writes, no cron attachment in this batch).

## Components

| Module | Role |
| --- | --- |
| `distribution-eligibility.ts` | Deterministic gate: ticker, `distributionStatus: ready`, verification, provenance, schedule-only exclusions |
| `distribution-projection.ts` | Maps eligible intel → `CatalystEventRow`; `intel:v1:{eventId}` dedupe; collision rules vs SEC / earnings calendar |
| `distribution-bridge.ts` | Dry-run / optional upsert batch; **disabled by default** (`operatorAuthorized` + `CATALYST_INTEL_DISTRIBUTION_WRITES_ENABLED`) |
| `intel-catalyst-event-facts-projection.ts` (Batch 172) | `distribution_catalyst_facts` / public `facts` shape |

Client mirrors: `src/lib/catalyst/intel-distribution-*.ts` (tests + consumer-safe types).

## Schema compatibility

Current `public.catalyst_events` (git migrations):

- `verification_state` CHECK: `provider_reported` \| `attribution_invalidated` only.
- Intel `VERIFIED_*` / `REPORTED` **must not** be stored as top-level `verification_state`; they are projected to `facts.intel_verification` and `facts.attribution_class`.
- `event_type` and `legal` label already supported; **no new migration required** for projection or dry-run.
- **Future optional migration:** extend `verification_state` enum for first-class intel verification (not in Batch 176).

## Activation requirements (post-merge)

1. Lovable Cloud Edge deploy including `_shared/catalyst-intelligence/distribution-*.ts`.
2. Explicit ops authorization + `CATALYST_INTEL_DISTRIBUTION_WRITES_ENABLED=true` for bounded upsert (separate from source bot enablement).
3. Dedicated server entry (manual POST or future function) — **not** wired to `sync-catalyst-events` cron or client loads.
4. Pre-load `existingPublicDedupeKeys` from `catalyst_events.dedupe_key` for collision pass.
5. Source activation sequence (`batch34-catalyst-activation-sequence.md`) unchanged.

## Verification rules (summary)

- **Eligible:** `ready`, resolved primary ticker, `VERIFIED_PRIMARY` \| `VERIFIED_MULTI_SOURCE` \| `REPORTED`, provenance URL or timestamp, announced lifecycle (not schedule-only / calendar-only / commentary).
- **Rejected:** `observation`, `UNVERIFIED`, `CONFLICTING`, `INVALIDATED`, future schedule without announcement, missing provenance.
