# Stocksist

Stocksist (`https://stocksist.com`) is the market-intelligence workspace in this repository. The app is a Vite + React + TypeScript SPA. Supabase supplies Postgres, Auth, and Edge Functions. Vercel serves the production frontend. Fly hosts the Radar worker, historical backfill job, and SEC egress gateway.

GitHub `main` on [Holagpt-ai/hedgefun-insights](https://github.com/Holagpt-ai/hedgefun-insights) is the source of truth. The repository name still says Hedgefun; the public brand is Stocksist. The legacy hostname listed in `vercel.json` redirects to the apex domain.

## Start here

Development agents should read, in order:

1. [docs/PROJECT_MEMORY.md](docs/PROJECT_MEMORY.md)
2. [docs/SESSION_HANDOFF.md](docs/SESSION_HANDOFF.md)
3. [docs/ISSUE_REGISTER.md](docs/ISSUE_REGISTER.md)

Architecture, routes, data services, deployment status, and release gates live under `docs/`. [AGENTS.md](AGENTS.md) is the working agreement for code changes.

## Local development

Requirements: Node.js and npm.

```sh
npm ci
npm run dev
```

Checks used before a pull request:

```sh
npm run typecheck
npm run build
npm run test:integrity
npm run integrity
```

`npm test` runs the Vitest suite and is much larger. Use it for the product area you changed.

## Deploy boundaries

Production migrations, Edge Function deploys, Fly deploys, DNS, cron, and secrets are separate approved operations. Merging a pull request does not perform them. See [docs/RELEASE_GATES.md](docs/RELEASE_GATES.md) and [docs/DEPLOYMENT_STATUS.md](docs/DEPLOYMENT_STATUS.md).

Lovable can edit this repo, but preview hosts are not production. The active integration branch is `cursor/lovable-sync-from-main-20261024`. After PR #162 it was merged forward and its files match `main`. Sync from `main`. The Lovable project id is not recorded in this repository.

## Integrity

`npm run integrity` checks registered navigation targets, sitemap and canonical agreement, public brand hosts, MCP generated-artifact agreement, and git divergence from `origin/main`. It does not call Vercel, Supabase, Fly, or Lovable. `npm run integrity -- --remote` fetches the public production asset manifest only.
