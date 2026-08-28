# Supabase Phase 0 runbook

The exact steps needed to complete the live Phase 0 exit gate on the hosted
Supabase project `eeeftjwvbppznsmcljnw`.

## Status

| Step | State |
|---|---|
| 1. Foundation migration | **Done** on 2026-08-28. Both migrations applied and recorded. |
| 2. Authentication configuration | **Outstanding — requires dashboard access.** |
| 3. Bootstrap the three profiles | Blocked on step 2. |
| 4. Application secrets | Partly done. Public values set locally; server-only values outstanding. |
| 5. Verify and close the gate | Blocked on steps 2 and 3. |

> **Open security gap.** `GET /auth/v1/settings` currently reports
> `"disable_signup": false`, so public sign-up is **enabled** on this project.
> The operating manual §9.6, technical brief §5.2, and Annexure A all require
> accounts to be created by admins only. Turn this off first in step 2.

## 1. Run the foundation migration — completed

Applied 2026-08-28 against project `eeeftjwvbppznsmcljnw`. No action remains.

Recorded in `supabase_migrations.schema_migrations`:

| Version | Name |
|---|---|
| `20260828093807` | `foundation_identity_access` |
| `20260828102907` | `restrict_rls_auto_enable_execute` |

Both versions match their repository filenames, so `supabase db push` treats
them as applied and will not attempt to re-run them.

The project was **not** clean when this ran. The migration had been executed once
from the SQL Editor at 10:00 UTC and its four tables were dropped again between
10:10 and 10:12 UTC, leaving the `private` schema and its seven helper functions
behind. Those residual functions were confirmed byte-identical to the repository
file before the migration was re-applied, and every function is `create or
replace`, so the re-run restored the intended state exactly.

## 2. Configure Authentication in the dashboard

1. Under **Authentication > Providers > Email**, keep email/password enabled
   and turn public user sign-up off.
2. Under **Authentication > URL Configuration**, set the production Site URL
   and add the production URL plus `http://localhost:3000` to allowed redirects.
3. Under **Authentication > SMTP Settings**, configure Cospire's custom SMTP
   sender. Do not use Supabase's default SMTP for production users.
4. Require passwords of at least eight characters with upper-case, lower-case,
   and digits.
5. Create one admin, one mentor, and one student under
   **Authentication > Users**. Use real inboxes available for the login test and
   copy each generated user UUID.

Creating Auth identities is intentionally a dashboard operation. Do not insert
rows directly into `auth.users` on the hosted project.

## 3. Create the three application profiles

1. Open `supabase/manual/phase_0_bootstrap_profiles.sql`.
2. Replace its three UUID placeholders with the UUIDs copied in step 2.
3. Adjust the three display names if needed.
4. Run the complete query in SQL Editor.
5. Confirm the first result returns three rows and the final result has one
   active `admin`, one active `mentor`, and one active `student`.

## 4. Configure application secrets

Copy `.env.example` to `.env.local`, then set:

- `NEXT_PUBLIC_SUPABASE_URL`: Project URL from the project's **Connect** dialog.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publishable key from **Connect** or
  **Settings > API Keys**.
- `DATABASE_URL`: transaction-pooler URI from **Connect**, with the database
  password URL-encoded and `sslmode=require` retained.
- `SUPABASE_SECRET_KEY`: server-only secret key for later administrative Auth
  operations, created under **Settings > API Keys**. Never give it a
  `NEXT_PUBLIC_` prefix.
- `NEXT_PUBLIC_APP_URL`: local or deployed application origin.

Use the same names in Vercel's Preview and Production environments. Trigger a
new deployment after changing environment values.

## 5. Verify and close the exit gate

Already verified on 2026-08-28 and needing no repeat unless the code changes:

- `npm run typecheck`, `npm run lint`, `npm test` (9 assertions), `npm run build`
  all pass with the generated `src/shared/db/types.ts` in place.
- Anonymous REST reads of `profiles` and `orgs` are refused with HTTP 401 and
  Postgres `42501 permission denied`, so `anon` is blocked at the grant level
  before RLS is consulted.
- A signed-in user with no `profiles` row sees zero rows in all four tables.
- No `service_role` or secret-key reference appears in the built client bundle.

Still outstanding, because each needs the three Auth users to exist:

- The Admin, Mentor, Student, disabled-user and cross-organisation RLS matrix
  against the hosted database.
- The three live sign-ins described below.

Re-run locally before deployment if the code changes:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

After the project is linked and Docker is available, also run:

```bash
npm run db:reset
npm run db:lint
npm run db:test
npm run db:types
```

On the deployed URL, sign in separately as the admin, mentor, and student.
Confirm each account is routed to its own role shell, cannot open either other
role URL, and can sign out. Phase 0 is not live-complete until all three checks
pass.

Current Supabase references: [API keys](https://supabase.com/docs/guides/getting-started/api-keys),
[database connections](https://supabase.com/docs/guides/database/connecting-to-postgres),
[redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), and
[custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
