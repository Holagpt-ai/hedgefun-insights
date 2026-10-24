# Agent instructions

Stocksist work starts from GitHub `main` in `Holagpt-ai/hedgefun-insights`. The public product is Stocksist at `https://stocksist.com`.

## Session start

Read these before changing code:

1. `docs/PROJECT_MEMORY.md` — decisions that should not be relitigated
2. `docs/SESSION_HANDOFF.md` — last completed batch and the next approved one
3. `docs/ISSUE_REGISTER.md` — confirmed defects, reported conditions, and deferred work

Open `docs/ARCHITECTURE.md` when the task touches data flow, routes, or deployables. Do not repeat a full-repo audit if those three files are current.

## During a change

- Update `docs/ARCHITECTURE.md`, `docs/ROUTE_MAP.md`, or `docs/DATA_AND_SERVICES.md` when the implementation changes that contract.
- Keep `docs/ISSUE_REGISTER.md` accurate when a confirmed defect is fixed or a new one is verified.
- Leave historical batch runbooks in place. Link to them instead of rewriting them.
- Run `npm run integrity` after navigation, sitemap, brand, or generated MCP edits.

## Session end

Update `docs/SESSION_HANDOFF.md` and add an entry to `docs/CHANGELOG.md` with:

- what landed
- pull request URL and head SHA
- deployment state that was actually checked
- open problems
- the next approved batch

## Restrictions that stay in force until a later batch says otherwise

- No production migrations, Edge deploys, DNS edits, cron changes, or secret changes.
- Do not merge pull requests unless the user asks.
- Do not merge `cursor/chat-single-pass-v1` or any other stale Lovable branch into `main`. Port reviewed files instead.
- Real-time feed upgrades, AI Trader, broker integration, and billing go-live stay deferred.
- `supabase/functions/mcp/index.ts` is generated. Change `src/lib/mcp/` and use the existing emitter. Do not hand-edit the bundle.

## Checks

```sh
npm run typecheck
npm run build
npm run test:integrity
npm run integrity
```

`npm run integrity -- --remote` compares `dist/asset-manifest.json` with the public `https://stocksist.com/asset-manifest.json`. It does not prove which git SHA Vercel built. Authenticated Vercel, Supabase, Fly, and Lovable checks are out of scope unless the task says to run them.
