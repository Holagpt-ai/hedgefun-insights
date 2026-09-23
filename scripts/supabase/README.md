# Supabase migrations (repository guardrails)

Production applies migrations in **lexicographic order** of the 14-digit prefix on each filename (`YYYYMMDDHHmmss_…`). If a new file’s prefix is **less than or equal to** an already-applied migration, Supabase records it as applied but **does not run the SQL** — a silent skip.

## Before adding a migration

1. Pull latest `main`.
2. Run ordering check:

   ```bash
   npm run verify:migrations
   ```

3. Choose a prefix **strictly greater** than the current max (the script prints it). Example after max `20260923210000`:

   ```bash
   # Supabase CLI (preferred)
   supabase migration new launch_cleanup_security_v1
   ```

   If the CLI timestamp is wrong, rename the file so the prefix is greater than `npm run verify:migrations` max — **never renumber migrations already on production**.

4. Validate the new filename:

   ```bash
   npm run verify:migrations -- 20260923220000_launch_cleanup_security_v1.sql
   ```

5. Commit the SQL under `supabase/migrations/`. Lovable applies to production.

Do **not** rewrite or re-timestamp migrations that have already shipped.
