# Phase history and audits

Progress records, exit gates and security audits for Phases 0, 1 and 5a. Moved out of `CONTEXT.md` on 2026-09-22; the text is unchanged.

## Phase 0 exit gate: closed 2026-08-29

Deployed to Vercel at `https://cospire-roan.vercel.app` from `main`. `site_url`
and the redirect allow-list were repointed from the local placeholder to that URL
before testing.

All three roles signed in on the deployed URL within minutes of each other and
reached their own role shell, confirmed against `auth.users.last_sign_in_at`.

Final state verified the same day:

| Check | Result |
|---|---|
| Live `/login` | 200, renders the sign-in form |
| Live `/admin` while anonymous | 307 to `/login` |
| Security headers on the deployed site | 5 of 5, plus HSTS from Vercel |
| Migrations, repo vs live | 3, all matching |
| Auth config, repo vs live | 0 differing lines |
| Working tree | `main`, clean, synced |

## Phase 0 security audit, 2026-08-28

An adversarial review of the database, the auth service, and the running
application. Every probe ran against the live project; anything needing extra
rows created them inside a transaction that was rolled back, and the live counts
were re-checked afterwards.

### Held under attack

| Attempt | Result |
|---|---|
| Admin moves a user into another organisation | Blocked |
| Admin creates a profile inside another organisation | Blocked |
| Admin renames another organisation | Blocked (0 rows) |
| Mentor reads another mentor's assigned students | Blocked, sees only self |
| Student reads a peer student in the same organisation | Blocked, sees only self |
| Student self-promotes, creates profiles, self-assigns a mentor, self-grants access, deletes the admin | All blocked |
| Signup via magic link, OTP, anonymous, or phone | All refused with `signup_disabled` |
| Email enumeration through password reset | Identical responses for known and unknown addresses |
| Calling the `private` helpers over the Data API | 404, schema not exposed |
| Reading the API schema | Refused, requires a secret key |
| Anonymous table reads | Refused at grant level, before RLS |
| Unauthenticated requests to `/admin`, `/mentor`, `/student`, `/dashboard` | All redirect to `/login` |

The magic-link result is the one worth noting: disabling password signup while
leaving OTP open is a common miss, and every path is closed here.

### Fixed

**Admin could lock the organisation out of all admin access.** Verified live: the
sole admin could set their own `role` to 'student' or `status` to 'disabled',
leaving zero active admins and no in-application recovery.
`profiles_delete_admin` already blocked self-deletion, so the case had been
considered for DELETE and missed on UPDATE. Fixed by a constraint trigger in
`20260828122059`, which still permits a handover once a second admin exists.

**A user could authenticate and be sent back to sign-in with no explanation.**
Reachable in the gap between an admin creating an account and its profile
existing, and also by any disabled user. Correct credentials looped straight back
to the form, so it would have arrived as an unreproducible support report.
Anonymous and orphaned sessions are now distinct; the orphaned case ends the
session and says why.

**No HTTP security headers.** The sign-in page was embeddable in a frame on any
site. Added `frame-ancestors`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`,
and a `Permissions-Policy` denying camera and microphone.

**`profiles.email` could drift from the Auth address.** Now derived from
`auth.users` on every write.

**Route protection depended on every page remembering its guard.** Middleware now
requires a session outside an explicit public list. Role checks stay in the page
guards; this is the floor beneath them.

### Rate limits raised, and why

Measured rather than assumed: sign-in throttled with HTTP 429 after **36**
consecutive attempts from one IP. `sign_in_sign_ups` is counted per five minutes
per IP address.

Clause 3.1 fixes capacity at 100 users active at once. CAT candidates commonly sit
a scheduled mock together at a coaching centre, where every student shares one
public IP, so at the default of 30 the thirty first student is refused sign-in to
their own test and it looks like an outage.

`sign_in_sign_ups` raised 30 to 150 and `token_refresh` 150 to 300. The trade is
weaker per-IP brute-force resistance, accepted because public signup is closed,
passwords require eight or more characters with mixed case and digits, and sign-in
gives no oracle distinguishing an unknown address from a wrong password.
**This one is a judgement call and is worth a second opinion.**

`email_sent` stays at 2 per hour: Supabase's built-in sender caps it regardless.
It must be raised together with custom SMTP or bulk student creation under clause
2.1 will stall partway through a class.

### Known and accepted

`getSessionState` throws if the profile query fails, which surfaces as the generic
error boundary. Failing closed and loudly is the right behaviour for an unexpected
database error; the generic page is a presentation gap, not an access one.

## GitHub exposure audit, 2026-08-29

The repository is public by the owner's decision, so it was audited as an
attacker would read it.

Clean:

- Every blob in every commit scanned for credential patterns. Nothing found; the
  only match is the literal `your-project-ref:password` placeholder in
  `.env.example`.
- Zero Actions secrets, Dependabot secrets, Actions variables, deploy keys and
  webhooks. There is nothing stored in GitHub to steal.
- One collaborator, `Two19Labs`, admin.
- CI uses the `pull_request` trigger rather than `pull_request_target`, so a fork's
  code never runs with repository permissions. `permissions: contents: read`, no
  secrets referenced, workflow token read-only and unable to approve reviews.
- Repository knowledge grants nothing. Reading every table name, policy and private
  function name from the repo, then calling them with the publishable key: all four
  tables return 401, every helper returns 404, storage is empty, and the auth admin
  endpoint returns 401.

### Open finding: CODEOWNERS is inert

`.github/CODEOWNERS` names `@manthan` and `@aditya`. Both are real GitHub accounts
belonging to other people, and neither has access to this repository. GitHub
silently ignores CODEOWNERS entries for users who cannot access the repo, with no
warning.

So the review requirement on `/supabase/migrations/**` does not exist. It is not
dangerous today, since neither account has access and the file alone grants
nothing, but it is documentation that describes a control which is not in place.

The owner's account is `Two19Labs`. Fixing it needs the second engineer's real
GitHub handle before the `/src/features/**` line can be corrected.

### Minor hardening, not blocking

- Actions are referenced by tag rather than commit SHA. Low risk with official
  GitHub actions; worth pinning before handover.
- Anyone can open a pull request that consumes Actions minutes. GitHub's default
  approval requirement for first-time contributors covers this; worth confirming
  it is enabled.

## Phase 1 progress, 2026-09-01

Build order is the seven steps in `docs/implementation-plan.md`.

| Step | State |
|---|---|
| 1. Console shell and paginated user list | **Done and verified** against the hosted database |
| 2. Create a single user | **Done and verified**, success and four rejection paths |
| 3. Mentor assignment | **Done and verified**, including refusal by the database trigger |
| 3b. Deactivate / reactivate a user | **Done and verified.** Added 2026-09-01 after the owner spotted that the console could create users but never offboard one |
| 4. Manual access granting | **Done, merged and deployed** (PR #16). Verified on the deployed URL on 2026-09-08 as part of the 36/36 gate run |
| 5. Bulk creation from a spreadsheet | Not started. **CSV only**, decided 2026-09-01. The only step still unbuilt, and blocked on custom SMTP |
| 6. Document library | **Done, merged and deployed** (PR #16). Migrations applied |
| 7. Protected viewer | **Done, merged and deployed** (PR #16). Browser render confirmed by the owner 2026-09-03. `pdfjs-dist@6.3.289`, pinned exact |

### Decisions taken on 2026-09-01 and 2026-09-02

- **The secret key was not rotated after being shown in an editor selection on
  2026-09-02.** It has never been committed and `.env.local` remains absent from
  git history. The owner reviewed the exposure and judged the key uncompromised.
  Recorded so the decision is visible rather than implied; rotate if that
  judgement changes.

- **Bulk upload accepts CSV only.** Excel and Sheets both export it, so an
  `.xlsx` parser buys a dependency and a larger validation surface for a step
  the admin can already do. The owner separately approved an `.xlsx` parser;
  it was **not** added, because CSV-only leaves it nothing to do. Revisit only
  if admins are found to be uploading workbooks untouched.
- **The secret key is used for Auth identities and nothing else.** Creating a
  user calls the Admin API with it, then inserts `profiles` through the
  signed-in admin's own client so `profiles_insert_admin` still decides which
  organisation may be written to. Using the secret key for the table write
  would work and would silently take RLS out of the path.
- **"Both or neither" is a compensating delete, not a transaction.** The Auth
  identity is an API call and the profile is a database write, with no shared
  transaction available. If the profile insert fails the Auth user is deleted;
  if that delete *also* fails the admin is told, in plain words, that an
  orphaned identity exists and must be removed from the dashboard.
- **No return URLs in form fields.** The mentor form posts a page number and a
  search term, and the action rebuilds the destination from a literal path.
  A hidden field holding the URL would have been an open redirect.
- **Users are deactivated, never deleted.** Annexure A names visibility and
  creation only, so this is scope the owner chose to absorb rather than raise
  as a variation. Deactivation rather than deletion is forced by the schema,
  not preference:
  `content_access.granted_by` and `mentor_assignments.assigned_by` reference
  `profiles` with **ON DELETE RESTRICT**, so an admin who has ever granted a
  document or assigned a mentor cannot be deleted at all; and deleting a
  student cascades through their grants and assignments and would, from Phase 4,
  take `attempts` with it - the very history that contracted rescoring operates
  on. `profiles.status` already existed, so no migration was needed.
  The control is hidden on the admin's own row and the action refuses a
  hand-posted self-disable; the last-admin trigger remains the backstop.

### Shared and config files touched, needing review at PR

Both are outside a feature folder, so operating manual §6.1 makes them a human's
call rather than an agent's:

- `src/shared/db/supabase/admin.ts` is **new**. It is the only place
  `SUPABASE_SECRET_KEY` is read, and is marked `server-only` so importing it
  from a Client Component fails the build rather than shipping the key.
- `vitest.config.mts` now mirrors the `@/*` alias from `tsconfig.json`. Without
  it, any test whose subject imports across features fails to resolve - which
  would have blocked the numerical-answer and scoring tests operating manual
  §11 requires in Phases 3 and 4.

### What was verified, and what was not

`SUPABASE_SECRET_KEY` was supplied by the owner on 2026-09-01 and is a
new-style `sb_secret_` key, not a legacy `service_role` JWT.

**Static checks:** `npm run typecheck`, `npm run lint`, `npm test`
(**28 assertions, up from 9**), `npm run build` (12 routes), and a scan of
`.next/static` finding no `sb_secret` / `SUPABASE_SECRET` / `service_role`
reference.

**Behavioural checks against the hosted database, 2026-09-01.** Method: a
throwaway admin was created, signed in through `@supabase/ssr` with a capturing
cookie store so the session cookie was byte-identical to the application's own,
and the running app was then driven over HTTP. Every form was posted through
the **no-JavaScript progressive-enhancement path**, which incidentally proves
these screens work with scripting disabled.

| Check | Result |
|---|---|
| `/admin/users` as a signed-in admin | 200, list renders, count line correct |
| `/admin/users/new` as a signed-in admin | 200, all three role options render |
| Search | `?q=verification` narrowed 4 users to 1 |
| **Search injection** `q=x,role.eq.admin` | Sanitised; no matches, no error, no admin list leaked |
| Create user, success | 303 to `/admin/users`; Auth identity and profile both created, **same id**, email confirmed, `org_id` correct |
| Create user, duplicate email | 200 with "An account already uses this email address"; nothing created |
| Create user, weak password | 200 with "Use at least 8 characters."; **no Auth identity created** |
| Create user, role not one of the three | 200 with "Choose a role."; nothing created |
| Create user, malformed email | 200 with "Enter a valid email address."; nothing created |
| **Orphan check after all rejections** | 0 Auth identities without a profile |
| Assign mentor | 303; row written with correct `mentor_id`, `student_id`, `assigned_by`, `org_id` |
| **Assign a student as the mentor** | Refused by `mentor_assignments_validate_roles`, redirected to `?error=assignment-failed`. The database did the refusing, not application code |
| Malformed `studentId` | `?error=invalid-request`, refused before the round trip |
| Unassign | 303, row removed |
| Disable a user, then re-enable | `profiles.status` written both ways |
| Hand-posted self-disable, and a bogus status value | Both refused, nothing changed |
| **A disabled user signing in** | Auth still issues a token, but the first request redirects to `/auth/no-access`, which ends the session. Disabling is effective without deleting the identity |
| Crafted `?error=<img src=x onerror=...>` | Banner does not render; payload appears only URL-encoded inside Next's router-state JSON. **Zero literal `<img` tags in the HTML** |

**Test isolation.** Baseline before was 3 auth users, 1 org, 3 profiles, 0
assignments, 0 grants. Every account created during verification was deleted
afterwards and the live counts were re-checked: **identical to baseline**, with
the mentor assignment removed by FK cascade. Only two identities needed
deleting, because the invalid attempts never created one - independent
confirmation that a rejected creation writes nothing.

**Still not verified, and not to be recorded as working:**

- **The compensating-delete branch of `createUserAction` has never executed.**
  It fires only when the Auth identity is created and the `profiles` insert
  then fails, which no input reaches: validation catches bad data first, and a
  duplicate email fails at the Auth step before any profile write. It guards
  against an unexpected database failure, so it is untested by construction
  rather than by omission.
- **The `last-admin` error message is unreachable through the console.** The
  toggle is hidden on your own row, so an admin can never take the count to
  zero by hand: with two admins, A can disable B but not themselves. The
  trigger and the 23001 mapping are a backstop for a hand-crafted request, and
  the trigger itself was verified in Phase 0.
- **The admin console is verified working in production.** On 2026-09-02 a user
  was created through `https://cospire-roan.vercel.app` and confirmed in the
  database: Auth identity and profile written together, sharing one id, correct
  role and organisation. Both test accounts were deleted afterwards. Routes,
  guards and all six security headers were confirmed live. `SUPABASE_SECRET_KEY`
  **is** set in the Vercel environment - that creation could not have succeeded
  otherwise. It has not been exercised by a human through a browser, only over
  HTTP with a real session.
- No migration was written and none was needed; steps 1-3 left the schema
  untouched.

## Phase 1 security audit, 2026-09-02

An adversarial review of the admin console before merging `feat/admin-console`.
Throwaway accounts were created for each role, real session cookies captured
through `@supabase/ssr`, and the running application attacked over HTTP.

### Held under attack

| Attempt | Result |
|---|---|
| Student GETs `/admin/users` and `/admin/users/new` | 307 to `/student` |
| Mentor GETs `/admin/users` | 307 to `/mentor` |
| Student POSTs `createUserAction` to self-provision an admin | Refused; no profile and no Auth identity created |
| Student POSTs `setUserStatusAction` to disable an admin | Refused; target still active |
| Student POSTs `assignMentorAction` to give themselves a mentor | Refused; no row written |
| Mentor POSTs `setUserStatusAction` and `assignMentorAction` | Both refused |
| Anonymous GET and POST to the admin route and actions | 307 to `/login` |
| **Admin of another organisation lists users** | Sees only their own org. The list query has no org filter by design; RLS scopes it, and this proves it |
| Admin of another organisation assigns a mentor cross-org | Refused, `?error=assignment-failed` |
| Search term carrying PostgREST filter syntax | Neutralised |
| Crafted `?error=` payload | Not rendered; no literal tag reaches the HTML |
| Secret key in the built client bundle | Absent. The **actual key value** appears nowhere in the entire `.next` tree |

Static review: the secret key is read in exactly one module, which is
`server-only`; all three admin Server Actions re-check the role rather than
trusting the page guard; every `"use server"` file exports only async
functions; no `console.log`, `any`, `@ts-ignore`, or migration on the branch;
and every security-relevant Phase 0 file is untouched.

Supabase security advisor: the same two WARN items as Phase 0, both plan or
scope decisions rather than defects. No new findings.

### Fixed during the audit

**A status change that silently did nothing reported success.** An admin of
another organisation posting a `userId` from this one received the success
redirect while the row was unchanged. Nothing was disclosed and nothing was
written -- RLS did its job -- but PostgREST returns no error when a policy
filters an UPDATE to zero rows, so the action could not tell "done" from
"not allowed". `setUserStatusAction` now selects the affected rows and treats
anything other than exactly one as a failure. Re-tested: cross-org attempts
report `status-change-failed`, and legitimate disable and re-enable still work.

### Finding: an organisation can never be decommissioned

Discovered while cleaning up. `profiles_keep_one_active_admin` refuses to
delete, demote **or** disable an organisation's last active admin (23001), and
`profiles.org_id` references `orgs` with ON DELETE RESTRICT. Both directions
are therefore closed, and there is no application-level route to remove an
organisation once it exists.

For single-tenant V1 this is the invariant behaving exactly as intended and it
protects the real deployment. It is recorded because it is not obvious, and
because it has one consequence now:

**A leftover test organisation exists.** The audit created a second org with
one admin (`Rival Admin`, `audit-rival-...@example.com`) to prove cross-org
isolation, and it cannot be removed by any application route. It is fully
isolated by RLS -- Cospire admins cannot see it and it cannot see them, both
verified -- so it is untidy rather than harmful. Removing it needs either a
migration that relaxes the trigger when an organisation is being removed, or a
one-off manual deletion in the Supabase dashboard with the trigger temporarily
disabled. It was deliberately **not** removed through the MCP server, because
operating manual §4.5 forbids schema writes by that route.

## The documents slice, merged 2026-09-03 (PR #16)

Phase 1 steps 6, 4 and 7 in one branch, because a library with nothing in it
cannot be granted and a grant with nothing to read cannot be demonstrated.

### Migrations, both applied to the hosted project

| Version | What |
|---|---|
| `20260902180054_documents_library_and_storage` | `documents` table, RLS enabled and forced, four policies; the private `documents` bucket with `application/pdf` and a 50MiB cap plus four `storage.objects` policies; a `content_access` resource-validation trigger; `content_access_resource_idx` |
| `20260902201530_restrict_document_object_reads_to_admins` | Narrows direct object reads to admins. See the decision below |

Both are additive and safe against the deployed code, which reads none of it.

### Decisions taken

- **Direct Storage reads are admin-only, not mirrored from the table policy.**
  The first migration mirrored `documents_select_authorized` onto
  `storage.objects`, so a granted student could fetch the raw, un-watermarked
  PDF straight from the Storage API with an hour-long session token, skipping
  the viewer entirely. Both routes deliver the same bytes -- technical brief §8
  is honest that any renderable PDF has already been delivered -- but one leaves
  a traceable mark and the other does not, and there was no reason to publish
  the untraceable one. Students now read only through server-minted signed URLs.
  **This is a judgement call and is worth a second opinion.**
- **Object first, row second.** The row is the commit point and is written only
  after the object is confirmed present. The other order leaves a library entry
  an admin can see and grant that opens as a 404; this order can only leave an
  invisible orphan object.
- **A check constraint pins the object key to the owning organisation** and to a
  random UUID. The uploaded filename never reaches the object store, so no
  admin-supplied text can carry `..` or an encoding trick, and a row can never
  point at another organisation's file.
- **Folders are a flat text label**, not a table and not a path. The technical
  brief offers `parent_id` nesting as an option; nothing in Annexure A asks for
  it.
- **The upload widget requires JavaScript, and is the only component that does.**
  A multipart post would send the PDF through the app server, which operating
  manual §8 forbids and the Vercel payload limit would break in production.
  Granting, revoking, search and filtering all still work with scripting off.
- **Document deletion was deliberately not built.** It is not in the exit gate,
  and `content_access` has no foreign key to `documents`, so deleting one would
  leave dangling grants needing their own handling.
- **Mentors have no document access.** `content_access` is per student, so a
  mentor holds no grants. Nothing in Annexure A asks for it.

### Verified, and how

36 checks against the hosted database, driving a locally running production
build over HTTP with real session cookies captured through `@supabase/ssr`.
Five throwaway accounts: admin, two students, a mentor, and an admin of the
second organisation. **All 36 passed.**

The parts worth naming:

| Check | Result |
|---|---|
| Admin uploads a real two-page PDF, grants it to student A, student A opens it | Signed URL returns the actual bytes: `%PDF-` header, exact length |
| Student B opens the same document | 404, and it is absent from their list |
| **Student B requests the object directly at the Storage path** | Refused, HTTP 400 |
| Mentor, other-organisation admin, anonymous, direct at the Storage path | All refused |
| **Student A, who holds a grant, direct at the Storage path** | Refused. This is the tightening above, working |
| Admin of the owning organisation, direct at the Storage path | Allowed, HTTP 200 |
| Student attempts to upload into the bucket | Refused, HTTP 400 |
| Signed URL expiry, read from the token rather than assumed | 600 seconds, inside the contracted 5-15 minutes |
| Tampered signed-URL token | Refused |
| Watermark | Names student A and their address, composed server-side, present in the server-rendered HTML |
| Student asks for an upload ticket; student B grants themselves access; other-org admin grants this document | All three refused, nothing written |
| Database refuses: cross-org grant, grant naming a non-existent document, storage path escaping the org prefix | All three refused by trigger or check constraint |

Test isolation: baseline taken first, everything deleted afterwards, live counts
re-checked and identical.

### Two defects the verification caught that every static check had passed

Recorded because they are the argument for doing this at all. Typecheck, lint,
58 unit tests and a production build were all green with both in place.

1. **Granting silently wrote nothing.** The action used `upsert`, which compiles
   to `INSERT ... ON CONFLICT DO UPDATE` and therefore needs UPDATE rights.
   `content_access` is deliberately granted only SELECT, INSERT and DELETE and
   has no UPDATE policy, so every grant was refused with `42501`. Replaced with
   a plain insert treating `23505` as success. The table was right; the code was
   wrong.
2. **A malformed upload path returned a 500.** It reached `String.split` before
   being validated. A Server Action is a public endpoint and TypeScript's
   parameter types are erased at that boundary, so the type check is now made at
   runtime.

### Verified in a browser by the owner, 2026-09-03

This closed the one gap no automated check here could reach, and found two
defects in the process. Done against a local production build of the branch,
before the merge.

| Check | Result |
|---|---|
| PDF.js renders the pages | **Pass.** The worker resolves in a production build, which had been the largest unverified risk |
| The watermark reaches the canvas pixels | **Pass.** Saving a page as an image produces a file carrying the reader's name and address, so a screenshot or saved image is traceable |

Two defects found and fixed as a result, in `6880ac3`:

1. **The watermark read UTC.** Now IST, computed by fixed offset rather than an
   `Intl` time-zone lookup, because a runtime with trimmed ICU data falls back to
   UTC while still printing "IST" -- a wrong answer that looks right. Vercel runs
   on UTC. Tested across the midnight rollover and under three machine time
   zones.
2. **A PDF.js worker leaked on every navigation.** The parse runs on a worker
   owned by the loading task, not by React, so unmounting released neither the
   worker nor the document's buffers. Five were alive in devtools. The cleanup
   now destroys the loading task.

### Not verified, and not to be recorded as working

- **The orphan-object branch is untested by construction.** It fires only when
  the browser transfers bytes and then fails to call the recording action.
- **Saving a page as an image is possible and expected.** Technical brief §8
  accepts this in terms: the defence is that every such copy carries the reader's
  identity, not that copying is prevented. **A reader can also read the signed
  URL out of the page source and fetch the clean, un-watermarked PDF** within its
  ten-minute window. That is inherent to rendering a PDF in a browser and is not
  closable without putting media through the app server, which operating manual
  §8 forbids. Raised with the owner 2026-09-03; **worth telling Cospire plainly
  rather than letting them discover it.**

### Two operational facts worth keeping

- **Migrations run as `supabase_admin`, a superuser; MCP `execute_sql` runs as
  `postgres`, which is not.** This matters: `postgres` is not a member of
  `supabase_storage_admin` and cannot create policies on `storage.objects`, so
  reasoning about what a migration may do by testing through MCP gives the wrong
  answer. Storage policies applied through `npm run db:migrate` without trouble.
- **`anon` and `authenticated` hold full `arwdDxtm` grants on `storage.objects`
  and `storage.buckets`**, issued by `supabase_storage_admin` when the extension
  was installed. RLS is the only thing standing between those grants and every
  file in the project, so a bucket with no policies is protected by the absence
  of a permissive one rather than by design. Every future bucket needs its
  policies in the migration that creates it.

## Phase 5a progress: programmes then ARS

Exit gate: a student submits each of the three round shapes, their assigned mentor
opens them in a queue and writes feedback, the student reads it, and a second
student — and an unassigned mentor — are refused both the row and the uploaded
file **at its Storage path**.

**This gate is closed, 2026-09-20, 28 of 28 against the deployed URL.** See
*The Phase 5a exit gate* below for what it proves and the one word of it that
has moved since it was written.

| Step | State |
|---|---|
| 1. `courses`, the grant helper and admin screens | **Done, merged and deployed 2026-09-10** (PR #19). Verified at both layers; migration applied |
| 2. `ars_rounds` with its `course_id`, and the mentor-visibility policy | **Done, merged and deployed 2026-09-10** (PR #21). Verified at both layers; both migrations applied. Admin round authoring lives on the programme detail page |
| 3. `ars_submissions`, `ars_process_runs`, `ars_attempt_grants` | **Done, merged and deployed 2026-09-18** (PR #25). `20260911200751_ars_submissions_and_process_runs.sql` applied to the hosted project and verified by 17 probes in a rolled-back transaction. Reworked before applying, after the 2026-09-16 meeting: `ars_feedback` is gone, since the write-up belongs to a whole process. No application code yet -- that is step 5 |
| 4. The Storage bucket and its policies on `storage.objects` | **Done, merged and deployed 2026-09-18** (PR #25), then extended on `feat/ars-file-upload` for several file questions in one form. `20260920150318` is applied. Live Storage verification 10/10: two uploads attach to one draft; replacement/removal work before hand-in; mentor cannot read a draft but can read after hand-in; another student is refused; handed-in files cannot be replaced or deleted |
| 4b. Round dates, `requires_review`, and the `offline` round type | **Done, merged and deployed 2026-09-18** (PR #25). From the 2026-09-16 meeting: a round carries when it opens and when it is due, whether a mentor reads it, and whether it happens off the platform (interview, GD, guesstimate) with the mentor recording the outcome |
| 5. The student submission route and the mentor review queue | **PR #38 merged.** The process view, multi-step renderer, private multi-file uploads, assigned-student queue, answer detail, short-lived private download links, review transition, and off-platform outcome recording are built. The ordinary text-field draft/save path still lacks a browser-level harness |
| 5b. **The process importer** | **Done, merged and deployed 2026-09-20** (PR #30). 35 of 35 over HTTP. No migration. See *The process importer* |
| 6. The ARS report | **Done, merged and deployed 2026-09-18** (PR #28), with admin template authoring included -- `/admin/report-templates` and its detail screen are live -- and a document importer for templates added in **PR #40**. Four migrations applied, 17/17 database checks, 12/12 production-build HTTP checks |

**Nothing here is blocked from being built.** The Supabase Pro upgrade is a
**capacity** limit and not a capability one: Free gives 1GB of Storage and a 50MiB
`file_size_limit`, which is enough to build and test the upload path with small
files. Pro blocks students uploading **real video essays**, so it must land before
ARS is used rather than before it is written. This corrects an earlier reading of
this file that treated Pro as blocking the phase outright.

The phase needs no VdoCipher, no SMTP and no Google or LLM account.

Both obligations that hung over step 2 are now discharged, and one new one takes
their place.

- **`ars_rounds.course_id` is in the migration that created the table**, per the
  decision of 2026-09-06. It is half of a composite foreign key against
  `courses (id, org_id)`, so a round cannot sit in one organisation while its
  programme sits in another.
- **Mentors can now see a programme**, through the separate `courses_select_mentor`
  policy and `private.mentor_reaches_course`. The rule is the narrowest one that
  makes a review queue possible: a mentor reaches a programme when they are the
  active assigned mentor of an active student who holds it. Verified against a
  discriminating pair -- their student's programme is visible, another student's
  is not.
- **New, and it belongs to step 3: `ars_submissions.round_id` must be ON DELETE
  RESTRICT.** Rounds can be deleted today, which is safe only because nothing
  hangs off them. Once a student has answered a round, deleting it destroys their
  work, and the schema should refuse rather than the interface remembering to.
  The note is also in `src/features/ars/actions/delete-round.ts`, beside the code
  that would have to change.

**Step 3 decisions, taken by the owner on 2026-09-12. Read them with *The ARS
meeting, 2026-09-16* beside them: the Client has since changed three of these,
and the migration is being reworked rather than applied.**

- **One submission per student per round**, enforced by a unique
  `(student_id, round_id)`. The student may edit it only while it is a `draft`;
  once `submitted` it is fixed.
- **The mentor marks the submission itself as reviewed**, after reading all of
  it: `status` moves `submitted` to `reviewed`. Row policies cannot limit which
  columns a role changes, so a trigger enforces that a mentor's only permitted
  change is that one transition, and a student's only permitted changes are the
  answer while a draft plus `draft` to `submitted`.
- **Only the assigned mentor writes feedback.** Admins see submissions and
  feedback (Annexure A: "visibility of all ... submissions") but do not write it.

Three further choices made in the migration, each worth the owner's eye:

- **Mentors do not see drafts.** A queue showing half-written answers invites
  feedback on something the student is still changing.
- **A student reads feedback only once the submission is marked reviewed.**
  Marking reviewed is the moment feedback is released.
- **One feedback row per submission**, edited rather than appended to. So if a
  student's mentor is reassigned after feedback exists, the new mentor can read
  it but neither edit it nor add their own. Acceptable at V1 scale; a second row
  per mentor is an additive change if it ever matters.

Also in the migration: `submitted_at`, `reviewed_at` and `reviewed_by` are
written by a trigger from the server clock, never the client; only `answer`,
`file_path` and `status` are updatable columns at all; there is no DELETE grant;
and `file_path` is pinned to `org/<org>/ars/<student>/<uuid>.<ext>` so step 4's
bucket has a fixed shape. Deleting a round with submissions now returns "Students
have already answered this round" instead of the generic failure.

Build order and tests are in `docs/implementation-plan.md` under Phase 5a.
