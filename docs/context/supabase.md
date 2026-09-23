# Hosted Supabase state

What is applied to the hosted project, its Auth configuration, users, advisors and the traps found along the way. Moved out of `CONTEXT.md` on 2026-09-22; the text is unchanged.

## Hosted Supabase state

Project `eeeftjwvbppznsmcljnw` (Mumbai, Free plan), confirmed before any write.
No credentials, keys, or connection strings are recorded in this file.

### Applied

| Version | File | Result |
|---|---|---|
| `20260828093807` | `supabase/migrations/20260828093807_foundation_identity_access.sql` | Applied unchanged. 4 tables, 26 constraints, 16 indexes, 13 policies, 7 `private` helpers, 4 triggers, RLS enabled and forced everywhere, Cospire org seeded |
| `20260828102907` | `supabase/migrations/20260828102907_restrict_rls_auto_enable_execute.sql` | New, append-only. Removes the Data API execute surface from the platform-managed `public.rls_auto_enable()` |
| `20260910115938` | `supabase/migrations/20260910115938_courses_and_course_grants.sql` | Applied 2026-09-10 through `npm run db:migrate`, the CLI rather than MCP. Creates `public.courses` with RLS enabled **and forced** and four policies; adds `private.student_has_course_grant`; adds the `course` branch to `validate_content_access_resource`; adds the `courses_cascade_grants` trigger. Additive throughout. Security advisor: zero new findings |
| `20260910144415` | `supabase/migrations/20260910144415_ars_rounds.sql` | Applied 2026-09-10. Creates `public.ars_rounds` with RLS enabled **and forced** and four policies; adds `private.mentor_reaches_course` and `private.student_reaches_round`; adds `courses_id_org_unique` so the composite foreign key has something to reference; adds the `courses_select_mentor` policy. Additive throughout |
| `20260910144803` | `supabase/migrations/20260910144803_fix_ars_rounds_form_fields_check.sql` | Applied 2026-09-10, minutes after the above, correcting `ars_rounds_form_has_fields`. See *The NULL that passed a CHECK* |
| `20260911200751` | `supabase/migrations/20260911200751_ars_submissions_and_process_runs.sql` | Applied 2026-09-18 through `npm run db:migrate`. Creates `ars_submissions`, `ars_process_runs` and `ars_attempt_grants`, all with RLS enabled **and forced**; adds `ars_rounds_id_org_unique`; three `private` helpers and four triggers carrying the sequence rule, the attempt allowance, the order snapshot and run completion. Additive throughout. Security advisor: zero new findings |
| `20260918080226` | `supabase/migrations/20260918080226_ars_uploads_bucket.sql` | Applied 2026-09-18. Creates the private `ars-uploads` bucket (50MiB; mp4, quicktime, webm, pdf, jpeg, png) and four policies on `storage.objects`, plus `private.can_read_ars_object` and `private.can_write_ars_object`. Reads are **not** admin-only here, unlike documents: a video essay has no watermarked viewer to force anyone through, and Annexure A asks only that the file reach the student, their mentor and admins |
| `20260918080815` | `supabase/migrations/20260918080815_ars_round_scheduling_and_offline_rounds.sql` | Applied 2026-09-18. Adds `opens_at`, `due_at` and `requires_review` to `ars_rounds`, widens the mode check to include `offline`, adds `private.round_is_offline` and a policy letting the assigned mentor record an off-platform round. Widening a check can never fail against existing rows and cannot break the deployed code, which only writes the three modes it already knows |
| `20260918094500` | `supabase/migrations/20260918094500_ars_stamp_late_submissions.sql` | Applied 2026-09-18. Adds the server-authored `submitted_late` stamp and its partial queue index. The reviewed transition preserves the historical value; the first review caught and fixed an implementation that would have cleared it |
| `20260918095000` | `supabase/migrations/20260918095000_ars_report_templates_and_reports.sql` | Applied 2026-09-18. Four RLS-enabled and forced tables hold configurable templates, filled reports and weighted components. Triggers enforce run/student/template consistency, compute the total and gate release |
| `20260918100815` | `supabase/migrations/20260918100815_grant_ars_report_policy_helpers.sql` | Applied 2026-09-18 after the first live probe. Grants `authenticated` only the two private helper functions invoked by report-component policies; the original migration had revoked the execution those policies need |
| `20260918101442` | `supabase/migrations/20260918101442_allow_students_to_render_released_reports.sql` | Applied 2026-09-18. Lets a student read only the template labels referenced by their own released report, so the authorized filled values can actually be rendered. Draft and unrelated templates remain invisible |

Three further migrations are described in their own sections rather than here:
`20260828122059` (last-admin protection, under *Phase 0 security audit*), and
`20260902180054` and `20260902201530` (under *The documents slice*). All fifteen
recorded versions match their repository filenames, so `supabase db push` treats
them as applied and will not re-run them.

Note the ordering that was used here: `20260910115938` was applied to the database
while its code still sat in an unmerged pull request, and the two came back into
step when #19 merged on 2026-09-10. That is safe **only** because the migration is
additive and nothing deployed read `courses` in the meantime. A migration that
changed or removed an existing column must not be applied ahead of its merge this
way, because Vercel deploys on merge while migrations are applied by hand.

### The project was not clean

The foundation migration had already been run once from the SQL Editor at
2026-08-28 10:00 UTC, and its four tables were dropped again between 10:10 and
10:12 UTC. That left the `private` schema and its seven helper functions behind
with no migration-history row. Before re-applying, the residual functions were
compared against the repository file and found byte-identical, and every function
in the migration is `create or replace`, so the re-run restored the intended state
rather than patching around the remnants. After applying, all seven function
bodies in the database were re-checked against the repository file and match.

### Deviation from the operating manual, recorded deliberately

`CLAUDE.md` §4.5 forbids schema writes through the Supabase MCP server. Both
migrations above were applied through it, because the CLI in this session is not
logged in, not linked, and holds no database password, so `npm run db:migrate` was
not available. The clause exists to prevent schema that lives in the database and
nowhere in git; here both migrations are timestamped files in
`supabase/migrations/`, were applied verbatim, and the recorded history was
reconciled to the filenames. A human should confirm this was the intended route.

### Advisors

Security advisor: **zero findings** after the second migration.

The one finding it raised was `public.rls_auto_enable()`, a `SECURITY DEFINER`
function reported as callable by `anon` and `authenticated` at
`/rest/v1/rpc/rls_auto_enable` (lints 0028 and 0029). It is Supabase
platform-managed, backs the `ensure_rls` event trigger, is owned by `postgres`,
and is not created by this repository. It was never actually invocable: PostgreSQL
refuses any call outside a trigger context with `0A000: trigger functions can only
be called as triggers`. The grant was removed anyway so the advisor report handed
to the Client stays clean and a real finding is never buried under a known-benign
one. Revoking `EXECUTE` does not disable the safety net, and that was verified by
creating and dropping a probe table and confirming RLS was still auto-enabled.

Performance advisor: 11 findings, all INFO, **no correction made**.

- Six `unused_index`. The database holds zero rows and has served no traffic. The
  indexes back the RLS policies and will be used. Removing them would be wrong.
- Five `unindexed_foreign_keys`, all on composite `(actor_id, org_id)` foreign
  keys. Each already has a usable leading-column index
  (`content_access_grant_unique`, `content_access_granted_by_idx`,
  `mentor_assignments_mentor_id_idx`, `mentor_assignments_student_unique`,
  `mentor_assignments_assigned_by_idx`); the linter only matches an exact
  column-set match. At the 100-user ceiling fixed by clause 3.1, adding five more
  composite indexes is over-engineering excluded by clause 3.2.

### Site URL: deliberately local, must change before real users

`auth.site_url` is set to `http://127.0.0.1:3000` and the redirect allow-list holds
only `http://localhost:3000` and `http://127.0.0.1:3000`. This is a deliberate
decision taken on 2026-08-28: the application currently runs only on the
developer's machine and has no deployed URL yet.

Supabase writes `site_url` into password-reset and invite emails, so this value is
harmless while only the three test accounts exist and becomes a live defect the
moment a real student resets a password. **Before any real user is created, the
Vercel production URL must replace it in `supabase/config.toml` and be pushed with
`supabase config push`, and the same URL must be added to
`additional_redirect_urls`.**

### Auth configuration: pushed from `config.toml` on 2026-08-28

The CLI is now logged in and linked, so auth settings are applied with
`supabase config push` rather than clicked in the dashboard. The settings live in
`supabase/config.toml`, in git, and are part of the handover.

Live and verified:

| Setting | Value | Verified by |
|---|---|---|
| Public signup | **disabled** | `POST /auth/v1/signup` returns `422 signup_disabled` |
| Email/password login | **enabled** | `POST /auth/v1/token` returns `400 invalid_credentials`, not a provider error |
| Anonymous sign-ins | disabled | `/auth/v1/settings` |
| Social/external providers | all disabled | `/auth/v1/settings` |
| Minimum password length | 8 | pushed |
| Password requirements | lower + upper + digits | pushed |

Zero users exist; the signup probe above created nothing (`auth.users` = 0 rows).

### Trap found in `config.toml`, fixed — do not reintroduce

The first `config push` **disabled email logins entirely**. Sign-in returned
`422 email_provider_disabled`, which would have locked out every admin-created
user and blocked the exit gate.

Cause: `[auth.email] enable_signup` is **not** a signup-only flag. The CLI maps it
to `external_email_enabled`, the master switch for the email/password provider.
Setting it `false` turns email login off completely.

The correct split, now in the file with a comment explaining it:

- `[auth] enable_signup = false` — blocks public signup. This is the right knob.
- `[auth.email] enable_signup = true` — keeps email/password login working.

Caught because the push was verified against the live API rather than trusted on
its `auth: updated` return value. Any future `config push` must be followed by the
same two probes: signup refused, and login reaching `invalid_credentials`.

### Notes for later, not blocking now

- `[auth.rate_limit] email_sent = 2` (per hour). Fine while no email is sent, but
  it must be raised before bulk student creation or the import will stall.
- `[storage] file_size_limit = "50MiB"`. ARS video essays may exceed this; revisit
  when the ARS upload bucket is built.
- `[api] max_rows = 1000` caps any single Data API response, which matches the
  pagination rule in the operating manual §8.

### Remaining Auth gap

Only one item is left, and it is not blocking the exit gate:

- **Custom SMTP is not configured.** The `[auth.email.smtp]` block in
  `config.toml` is still commented out. This does not block the three test
  sign-ins, because dashboard-created users can be auto-confirmed with a password
  set directly and need no email. It **does** block bulk student creation
  (clause 2.1), and needs an SMTP provider account opened in Cospire's name per
  clause 3.8 plus DNS records. Configure the credentials as `env(...)` references
  so the setting stays in git and the secret does not.

### Users and profiles

Three Auth users were created in the dashboard by the project owner on 2026-08-28,
all email-confirmed. `supabase/manual/phase_0_bootstrap_profiles.sql` was updated
with their real UUIDs and run. Result: exactly one **active** profile for each of
`admin`, `mentor`, and `student`, all in the Cospire organisation.

No email addresses, passwords, or other personal data are recorded in this file.
Profile emails are read from `auth.users` by the bootstrap SQL, so they cannot
diverge from the Auth identities.

Current live counts, **re-measured 2026-09-21**: **2 orgs, 5 profiles (5
active), 2 mentor assignments, 6 content grants, 7 courses, 2 documents, 5 ARS
rounds, 1 ARS submission, 1 ARS process run, 1 ARS report template, and 0 rows
in every other ARS table.**

By `courses.kind`: **3 ARS processes** (Ashoka, MU ARS, test) and **4
programmes** (Ashoka - Aptitude Test Prep twice, Mesa, testing).

The newest courses, rounds and the submission are **the owner's own**: a process
called "test" with three rounds created through the importer on 2026-09-20, a
draft answer started on it the same afternoon, and "testing" created the same
day. They are not test residue and must not be deleted. This baseline moved
three times in two days, which is the point of re-measuring it rather than
trusting this line.

**This baseline had drifted from the one recorded on 2026-09-18**, which said 4
courses and 0 rows in every ARS table. The difference is the owner's own work on
2026-09-18: a fifth course, "MU ARS" (id 46), and two rounds -- "ARS Template" on
course 20 and "Application" on course 46. Nothing here is test residue. The
correction is made rather than appended because a recorded baseline that drifts
is worse than none: it is exactly what makes a destructive operation look safe,
which is the lesson of *The teardown near-miss*. Re-measure before the next run
rather than trusting this line.

Courses rose from 1 to 3 and grants from 3 to 4 during the owner's manual test
pass of 2026-09-14, and "Mesa" was added on 2026-09-18; those rows are the
owner's too. Two of them, ids 29 and 30, differ only by a space in the title and
look like a duplicate the owner may want to remove.

This is the baseline any future verification run should return to. **None of it
is test residue and none of it may be deleted:**

- The **second organisation** (`id = 5`) is the audit org described under the
  Phase 1 security audit. It cannot be removed by any application route, and
  `setup.mjs` uses it as the rival org.
- Of the five profiles, four are in Cospire and one is the audit org's admin.
  The **fourth Cospire profile** is a real student account created by the owner
  through the console on 2026-09-01, along with its mentor assignment. A real
  user, not test data.
- **Documents 7 and 8 are the owner's real PDFs**, uploaded through the console
  on 2026-09-03 during the browser render confirmation, and grants 12 and 13
  point students at them. The project is on the Free plan with no backups, so
  these files cannot be recovered if they are deleted.
- **Course 20, "Ashoka", is the owner's own**, created through the new programme
  screens on 2026-09-10 while checking them by hand, and granted to Cospire
  Student. Left in place rather than cleaned up, because it may be intended as a
  real programme. Its name is the short form; the Client's own convention is
  institution plus content type, as in "Ashoka - aptitude prep". Rename or remove
  it deliberately rather than treating it as verification residue.

### RLS verified against the hosted database

Every scenario below was run against the live project with
`set local role authenticated` and a real user's JWT claims. Scenarios needing
extra rows created them inside a transaction that was then **rolled back**; the
final counts above confirm nothing was left behind.

**Read access**

| Acting as | Profiles seen | Correct? |
|---|---|---|
| Admin | 3 (admin, mentor, student) | Yes, admin sees the whole org |
| Mentor, no students assigned | 1 (self only) | Yes, cannot browse other users |
| Mentor, student assigned | 2 (self + that student), not the admin | Yes, exactly the ARS rule |
| Student | 1 (self only), 0 assignments, 0 grants | Yes |
| Disabled student | **0 profiles, 0 orgs, 0 assignments, 0 grants** | Yes, disabling is total |
| Anonymous (`anon`) | Refused on all four tables | Yes, blocked at grant level before RLS |
| Cospire admin, after student moved to another org | 2 (admin, mentor), 1 org | Yes, cross-organisation isolation holds |

**Write access — the half that is usually untested**

| Attempt | Result |
|---|---|
| Student promotes self to admin | 0 rows changed |
| Student creates a new profile | Blocked |
| Student assigns themselves a mentor | Blocked |
| Student grants themselves content access | Blocked |
| Student deletes the admin | 0 rows deleted |
| Mentor assigns a student to themselves | Blocked |
| Admin assigns mentor to student | Allowed |
| Admin grants content access | Allowed |
| Admin edits a student profile | 1 row |
| Admin deletes their own account | 0 rows, by `profiles_delete_admin` |

The last row is a deliberate safety property: an admin cannot delete themselves and
lock the organisation out of its only admin access.

## Advisor findings after the audit fixes

The security advisor returns two WARN items. Neither is a defect in this
repository and neither is fixable here.

**Leaked password protection is disabled.** Supabase can reject passwords known
to appear in breaches by checking HaveIBeenPwned. Worth enabling. It is
**available on the Pro plan and above**, so it cannot be turned on while the
project is on Free. This is a fourth reason to upgrade, alongside backups,
Storage capacity and project pausing in the operating manual §4.6. Enable it in
the same session as the upgrade.

**Insufficient MFA options.** TOTP is disabled. This is a product decision rather
than a defect: nothing in Annexure A asks for MFA, and requiring it of a hundred
students adds friction to every mock. Enabling it for admins alone is the
sensible middle, and it is a scope conversation rather than a fix.
