# Batch 214 — Admin access states and owner role verification

**Problem (reported 2026-11-07):** `https://stocksist.com/admin/operations` sends the owner straight to the homepage.

## Verified findings

| Possible cause | Finding | Evidence |
| --- | --- | --- |
| Frontend deployment mismatch | **Ruled out.** | The public `asset-manifest.json` and `index-DYtkIPVm.js` include the `/admin/operations` route. The lazy `AdminOperationsPage-gPCuq1V9.js` chunk contains the Batch 213 strings (`get_ops_scanner_diagnostics_v1`, "exception calendar verified"). Read-only `curl` of public assets on 2026-11-07. |
| Auth loading race on direct load | **Ruled out for a stored session.** | `AuthContext` keeps `loading=true` until `getSession` / `INITIAL_SESSION` resolve, so the guard shows its spinner first. |
| Missing session | **Possible, not verified.** | Before this batch, a missing session redirected to `/`, which looked identical to the other causes. |
| Missing `admin` role | **Possible, not verified. Most likely.** | No migration in git inserts into `public.user_roles`, and client writes are blocked by RLS (`20260525215441`). An `admin` row exists only if someone added it in Lovable Cloud. This cannot be checked from the repo or the public site. |
| `has_role` RPC failure | **Possible, not verified.** | There is one definition (`has_role(uuid, app_role)`, `20260522174654`), relying on Supabase default EXECUTE grants. Before this batch, an RPC error also redirected to `/`. |

Before Batch 214 all three possible causes produced the same silent redirect to `/`. After this PR is deployed, the page itself tells the owner which one applies.

## Behavior change (`src/components/admin/AdminGuard.tsx`)

| State | Before | After |
| --- | --- | --- |
| Auth loading | Spinner | Spinner (unchanged) |
| No session | Redirect to `/` | Redirect to `/login?next=<admin path>`, which returns the user to the admin page after sign-in |
| Signed in, `has_role` → `false` (or any non-`true` value) | Redirect to `/` | **Access denied** page showing the signed-in email and user id |
| `has_role` error or thrown error | Redirect to `/` | **Could not verify admin access**, with the bounded error code and message and a Retry button |
| `has_role` → `true` | Admin pages | Admin pages (unchanged) |

All non-admin states fail closed: admin children never render. A role result is keyed to the user id it was computed for, so a result for one session cannot authorize a different user who signs in later. Data protection is unchanged: RLS, the `user_roles` client-write block, and the admin check inside `get_ops_scanner_diagnostics_v1`.

## Owner role verification and grant (Lovable Cloud — not executed by this batch)

1. After this PR is deployed, open `/admin/operations` signed in with the owner account.
   - **Login page:** the session was missing. Sign in; you return to the admin page.
   - **Access denied:** the role is missing. Copy the **User ID** shown.
   - **Could not verify:** the RPC failed. Record the code and message (for example `PGRST203` or `42501`) and check `has_role` grants in Lovable Cloud.
2. **Read-only check** in Lovable Cloud's SQL / database tool:

   ```sql
   SELECT u.id, u.email, r.role
   FROM auth.users u
   LEFT JOIN public.user_roles r ON r.user_id = u.id AND r.role = 'admin'
   WHERE u.id = '<USER_ID_FROM_ACCESS_DENIED_PAGE>';
   ```

   `role` = `admin` means the role exists. `NULL` means it is missing.
3. **Grant, only after explicit owner approval**, through Lovable Cloud (it bypasses client RLS as the database owner). Do not add this as a git migration; that would commit a personal user id to the public repository.

   ```sql
   INSERT INTO public.user_roles (user_id, role)
   VALUES ('<USER_ID_FROM_ACCESS_DENIED_PAGE>', 'admin')
   ON CONFLICT (user_id, role) DO NOTHING;
   ```

4. Reload `/admin/operations`. Expect the Operations page. Then confirm that a non-admin account sees **Access denied**.
5. **Optional RPC grant check:** `SELECT has_function_privilege('authenticated', 'public.has_role(uuid, public.app_role)', 'EXECUTE');` should return `true`.

## Out of scope

Role assignment, migrations, deploys, and the separate Batch 213 migration apply.
