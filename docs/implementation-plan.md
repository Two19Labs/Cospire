# Implementation plan

The build in six phases, one per contracted week. Each phase has an **exit gate**:
a single demonstrable sentence, taken from the signed delivery plan wherever one
exists. A phase is finished when its gate passes on the deployed URL, not when the
code is written.

This plan sequences work and names dependencies. It does not add scope. Scope is
fixed by the agreement.

**Authority.** The agreement defines what is delivered. The parent operating manual
(`../CLAUDE.md`) defines how. `CONTEXT.md` records current execution state. If this
file conflicts with any of them, they win and this file gets corrected.

**On dates.** Phases map to contracted weeks, but the exact written Kickoff Date has
never been confirmed, which `CONTEXT.md` records as an open item. The week-four
content deadline hangs off it. Confirm it before treating any date as contractual.

---

## Phase status

Phase numbers name **scope**, not order. The order changed on 2026-09-08; see
*The sequence changed* below.

| Phase | Scope | Week in the agreement | Order now | Status |
|---|---|---|---|---|
| **0** | Foundation, identity, access | 1 | done | **Complete** |
| **1** | Admin console and documents | 2 | done | **Exit gate closed 2026-09-08**, 36/36 on the deployed URL. Only step 5 (bulk CSV) is unbuilt, blocked on SMTP |
| **5a** | **Programmes, then ARS** | 6 | **next** | Not started. Brought forward at the Client's request |
| **2** | Video, curriculums | 3 | deferred | **Blocked on VdoCipher**, which has still not arrived |
| **3** | Question bank and authoring | 4 | to be re-planned | Not started |
| **4** | Test engine | 5 | to be re-planned | Not started |
| **5b** | Migration, handover | 6 | last | Not started |

---

## The sequence changed, 2026-09-08

**The Client asked for ARS to be built first**, ahead of video and the test
engine. Recorded here as a sequencing change; the scope is untouched.

**Only the next phase is committed. Weeks 4 to 6 are deliberately left open** and
get re-planned once VdoCipher's arrival date is known, because that date decides
whether video slots alongside the question bank or displaces something.

### What this costs, checked against the agreement

- **It is not a change request.** Clause 12 covers functionality not described in
  the agreement. Every module here is already in Annexure A; only the order moves.
  Nothing to quote.
- **It has no payment consequence.** Clause 7 is 20% on signing and 80% on
  completion and acceptance. Payment is not milestone-linked, and clause 5
  acceptance runs against clause 2, clause 3 and Annexure A, not the week table.
- **It does amend clause 4.3.** That table names week 3 as video plus the first
  demonstration and week 6 as ARS. Changing the order changes the contracted
  milestone table, so it needs agreeing in writing rather than absorbing quietly.
- **One delivery-plan promise moves.** The first demonstration was committed to
  showing *"a copied video link failing in a second browser."* Without video that
  cannot be shown at demo one, and it moves to demo two. Say so explicitly.

### Why ARS-first is defensible on its own merits

Phase 2 is blocked on VdoCipher and nothing in it can legally start. ARS is
blocked on a Supabase plan upgrade, which is a card payment. The reorder swaps a
blocked slot for an unblocked one, and it empties ARS out of the final week that
this plan already calls overloaded.

The honest counter, which belongs in the same conversation: **video is a larger
and more third-party-dependent module than ARS.** If it simply lands in the last
week instead, the overload moves rather than clearing. Video should be built in
its own worktree the day VdoCipher access arrives, not given a week of its own.
If that access does not arrive by the start of week four, video slips and clause
4.4 applies — the delivery date extends day for day, notified in writing at the
time.

### What ARS needs before it can start

ARS is not free-standing. Two prerequisites, one of them ours:

1. **`courses` must exist**, because the decision of 2026-09-06 requires
   `ars_rounds` to carry its programme link in the migration that creates it.
   This is a pull-forward from Phase 2 step 3, and a small one: ARS needs the
   `courses` table plus admin create and grant. It does **not** need
   `curriculum_items`, ordering, or the builder — those belong to video.
   `content_access.resource_type` already accepts `'course'`, so no constraint
   change is required.
2. **Supabase Pro**, moved forward from before Phase 5 to before this phase.
   1GB of Free-plan Storage will not hold video essays, and
   `[storage] file_size_limit` is currently 50MiB. Clause 8.3 already budgets it,
   so this is a timing note and not a new cost.

ARS video essays are **student uploads reviewed by a mentor**, not protected
course content, so they go to Supabase Storage behind signed URLs. They do **not**
need VdoCipher, which is what makes this phase startable while Phase 2 is not.

---

# Phase 0 — Foundation ✅ Complete

**Exit gate, from the delivery plan:** *"A live URL. All three roles can log in and
each sees a different, correct, empty platform."*

**Passed.** All three roles signed in on the deployed URL and reached their own
role shell, confirmed against `auth.users.last_sign_in_at`.

Delivered: `orgs`, `profiles`, `mentor_assignments` and `content_access` with RLS
enabled and forced; 13 policies covering writes as well as reads; password sign-in
with role-scoped workspaces; CI, branch protection and the review workflow; and a
security audit with two real defects found and fixed.

The ARS visibility rule is not built, because `ars_submissions` does not exist yet.
The pattern it depends on is in place and tested.

Full detail is in `CONTEXT.md`.

---

# Phase 1 — Admin console and documents

**Week 2. Exit gate closed 2026-09-08.** Steps 1 to 4, 6 and 7 are merged,
deployed and verified. Only step 5, bulk CSV creation, is unbuilt, and it is
blocked on custom SMTP.

The gate was closed by running `scripts/verify/` against
`https://cospire-roan.vercel.app`: **36 of 36 checks passed**, including the
exit-gate sentence itself and the direct Storage-path refusals. This is the
deployed URL, not a local build.

**Exit gate, from the delivery plan:** *"An admin creating a student, granting them
a document, and that student reading it while another student is correctly
refused."*

That sentence is the acceptance test. Build toward demonstrating exactly it.

### Build order

Each step unblocks the next.

1. ~~**Admin console shell and user list.**~~ **Done, PR #12.** Paginated from the
   first commit, per the operating manual §8. `profiles` is small now and will not
   stay that way.
2. ~~**Create a single user.**~~ **Done, PR #12.** The server creates the Auth
   identity and the `profiles` row together, or neither. This is the first place the application
   needs the Supabase secret key: server-only, never in a client component, never
   logged. `profiles.email` is derived from `auth.users` by trigger, so the two
   cannot drift.
3. ~~**Mentor assignment.**~~ **Done, PR #12.** Writes `mentor_assignments`. The validation triggers
   already refuse a non-mentor, a non-student, a disabled party or a cross-org
   pair, so the UI is a thin layer over rules the database enforces.
3b. **Deactivate and reactivate a user.** **Done, PR #12.** Not in the original
   build order and not named in Annexure A, which specifies visibility and
   creation only. Added on 2026-09-01 after the owner noticed the console could
   create users but never offboard one, and absorbed as included scope.

   Deactivation rather than deletion is forced by the schema, not preference:
   `content_access.granted_by` and `mentor_assignments.assigned_by` reference
   `profiles` with ON DELETE RESTRICT, so an admin who has granted anything
   cannot be deleted at all; and deleting a student would, from Phase 4, destroy
   the `attempts` that contracted rescoring operates on.

4. ~~**Manual access granting.**~~ **Done, PR #16, merged and deployed.** Writes
   `content_access` as `resource_type` plus `resource_id`, from the document's
   own detail page so the picker has a real resource to grant.
5. **Bulk creation from a spreadsheet.** Upload, parse, **validate every row before
   creating anything**, report bad rows back, then create in one pass. A partial
   import leaving half a class created is worse than a clean failure. **The only
   step still unbuilt, and the only one custom SMTP blocks.**
6. ~~**Document library.**~~ **Done, PR #16, merged and deployed.** `documents` table, flat
   text folders, direct-to-Storage upload. Built before step 4 rather than after,
   because a grant with nothing to point at cannot be demonstrated.
7. ~~**Protected viewer.**~~ **Done, PR #16, merged and deployed.** PDF.js to canvas with
   the reader's identity drawn across each page, from a signed URL expiring in
   ten minutes.

### Must be true

- **Storage policies on the documents bucket, in the migration that creates it.**
  Row policies protect rows; files are governed separately by policies on
  `storage.objects`. A correct policy on `documents` in front of a public bucket
  protects nothing.
- **The watermark is composed server-side** from the signed-in identity. Anything
  the client supplies can be edited to say someone else's name, which defeats a
  traceable watermark entirely.
- **No media through the application server.** Direct authorised upload and
  download, per operating manual §8 and the Vercel payload limits in `CONTEXT.md`.

### Tests before this phase is called done

- ~~A student requesting another student's document is refused.~~ **Done:** 404
  through the app, and absent from their list.
- ~~The same request made **directly against the Storage path**, bypassing the
  app, is also refused.~~ **Done:** refused for the other student, the mentor,
  another organisation's admin, an anonymous caller, and even for the student who
  *does* hold the grant.
- A bulk upload containing one invalid row creates nothing at all. **Still to do,
  with step 5.**

**Run on the deployed URL on 2026-09-08, 36 of 36 passing.** The one thing the
harness still cannot prove is that PDF.js paints the page and the watermark is
legible; the owner confirmed that in a browser on 2026-09-03.

### Blocked by

**Custom SMTP** blocks step 5 only. Steps 1 to 4, 6 and 7 proceeded without it.

### Learned while building the documents slice

- **Migrations run as `supabase_admin`, a superuser. MCP `execute_sql` runs as
  `postgres`, which is not.** `postgres` cannot create policies on
  `storage.objects`; a migration can. Reasoning about migration permissions by
  probing through MCP gives the wrong answer.
- **`anon` and `authenticated` already hold full grants on `storage.objects`.**
  RLS is the only thing between those grants and every file in the project, so a
  bucket without policies is safe only by the absence of a permissive one.
- **A permissive Storage read policy can quietly defeat the watermark.**
  Mirroring the table policy onto objects let a granted student fetch the raw
  PDF straight from the Storage API, skipping the viewer. Direct reads are now
  admin-only.
- **`upsert` needs UPDATE rights.** `content_access` grants only SELECT, INSERT
  and DELETE, so an upsert is refused with `42501` and writes nothing — with no
  error visible to typecheck, lint, tests or the build.

### Learned while building steps 1 to 3

- **An organisation can never be decommissioned.** Its last active admin cannot
  be deleted, demoted or disabled, and `profiles.org_id` is ON DELETE RESTRICT.
  Correct for single-tenant V1; recorded because it is not obvious.
- **`server-only` is a Next bundler alias, not a package.** Vitest cannot resolve
  it, so pure logic that needs testing must live outside a `server-only` module.
- **RLS filtering an UPDATE to zero rows returns no error.** An action that does
  not count affected rows will report success for a change that never happened.

---

# Phase 2 — Video, curriculums, and the first demonstration

**Deferred from week 3 on 2026-09-08.** ARS was brought forward at the Client's
request and VdoCipher access has still not arrived, so nothing here can start.
Build this in its own worktree the day that access lands rather than reserving a
week for it. If it has not arrived by the start of week four, this phase slips and
clause 4.4 applies.

**`courses` is no longer built here.** Step 3 below is split: the `courses` table
and admin create/grant move forward into the ARS phase, which cannot exist without
them. `curriculum_items`, ordering and the builder stay here.

**Exit gate:** a full walkthrough of the curriculum builder and the student
experience **with Cospire's real content loaded**, including showing a copied video
link failing in a second browser.

The demo is the gate. Being able to show protection working, rather than describe
it, is the point.

### Build order

1. **VdoCipher upload pipeline.** The app hands the file to VdoCipher and stores
   the returned id in `videos`. Track processing status; encoding is not instant.
2. **Playback.** The OTP request happens **server-side only**, after checking
   access, with the watermark text composed in that same request. Generating OTPs
   in browser code exposes the API key.
3. **`curriculum_items`.** Courses, sections, and the ordered mixed list. Not a
   lessons table; operating manual §4.1.

   **A course is a "programme" in the Client's language**, one per target
   institution per content type — *Ashoka - aptitude prep*, *Masters' Union -
   ARS*. Confirmed 2026-09-06. Admins create them; the list is never hardcoded.

4. **The curriculum builder**, reordering by `sort_order`. **Admins must be able
   to create a programme here**, because the Client asked explicitly not to be
   locked to a list we ship.

4b. **Make course grants cascade.** `private.student_has_document_grant` checks
   only `resource_type = 'document'`, so a programme grant opens nothing today.
   This step is why it was not done in Phase 1: cascading needs `courses` and
   `curriculum_items` to know what a programme contains, and neither existed.
   Do it here, with the same treatment for videos, and for mocks in Phase 4.

   A student prepping for several institutions holds several programme grants,
   and individual item grants remain as the override. Both, per the Client.
5. **`item_progress`**, per curriculum item rather than per video, because
   completion is measured across the whole sequence.

`gating` stays unused. The column exists so a change of mind costs an afternoon.

### Front-load the third-party risk

Video encoding, DRM licence behaviour and watermark rendering are discovered by
trying, not by reading. Get one real video through the whole path early in the
week, not on demo morning.

### Blocked by

**VdoCipher account and API access.** Nothing in this phase starts without it.

---

# Phase 3 — Question bank and authoring

**Week 4.**

**Exit gate:** an admin authors a tagged question, imports a real Google Doc,
reviews the parsed output beside the source, approves it into the live bank, and
builds a mock from it.

### Build order

1. **`questions`** with `section`, `topic`, `difficulty` and `marks` **mandatory**.
   Not nullable, no skip-tagging path. These four columns are the entire reason the
   Phase 4 analytics are possible.
2. **The authoring interface**, including image add, replace and remove by upload
   **and by clipboard paste**, per clause 3.17. This is the release valve that
   makes best-efforts PDF extraction acceptable, so it is not a late fallback.
3. **DI sets** as one `di_stimulus` row with children via `parent_id`.
4. **Numerical answers.** A list of accepted forms, normalised on both sides before
   comparison. Tested before anything else in this phase.
5. **`question_imports` staging**, then the Google Docs fetch, then the LLM parse
   with strict JSON schema output, then the review-and-approve screen. Nothing
   reaches `questions` unreviewed.
6. **The mock builder**, writing `mock_questions` **with `mock_section_id`**.
   Without it the engine cannot tell which questions belong to which section and
   sectional timing cannot be built at all.

### Blocked by

**Google API and LLM accounts.** Steps 1 to 4 and 6 proceed without them; step 5
does not.

---

# Phase 4 — The test engine and the second demonstration

**Week 5. The largest and riskiest phase, placed in the middle on purpose.**

**Exit gate:** someone from Cospire sits a full mock end to end during the
demonstration.

### Build order

1. **Attempt lifecycle.** `attempts.started_at` written by the server; elapsed time
   validated server-side on submit. The client countdown is decoration.
2. **`attempt_sections`.** One row per section entered, with its own start
   timestamp. There is nowhere else to record when a section began.
3. **Autosave** to `attempt_responses` on change, debounced. Handle the same
   attempt open in two tabs; last write wins is acceptable, silent divergence is
   not.
4. **Scoring**, server-side on submission, per operating manual §13.1.
5. **Analytics** as SQL aggregates over the four metadata columns.
6. **Proctoring.** Browser APIs writing to `proctor_events`. **Warn and log, never
   auto-submit.**
7. **Mobile.** Device detected **server-side**; `attempts.proctored = false`
   written permanently and surfaced in both student and admin views. A mock with
   `allow_mobile = false` refuses the attempt outright.
8. **Auto-submit of expired attempts** via Vercel Cron, with durable job records,
   locks and idempotency, because Cron can overlap or deliver more than once.
9. **Rescoring** after an answer-key correction, as a background job writing
   `rescore_events`. An agreed deliverable that is one sentence in the contract and
   easy to miss.

### Two decisions that must be made before writing the engine

Both are recorded as critical in `CONTEXT.md`, and both get expensive the moment
real attempts exist.

- **Historical attempts must not change when a live question or mock setting is
  edited.** Decide the snapshot or versioning approach first.
- **Answer keys currently sit on the row students need to read.** Separate the key
  or expose a safe projection before delivery renders a question.

---

# Phase 5 — ARS, migration, handover

**Split on 2026-09-08.** ARS became **Phase 5a and is now the next phase built**,
at the Client's request. Migration and handover stay last, as **Phase 5b**. The
exit gate below belongs to 5b.

**Exit gate (5b):** handover accepted, followed by seven days for Cospire to report
anything not working as described, corrected free of charge, after which three
months of support begins.

## Phase 5a — Programmes and ARS · next

**Exit gate:** a student submits each of the three round shapes, their assigned
mentor opens them in a queue and writes feedback, the student reads it, and a
second student — and an unassigned mentor — are refused both the row and the
uploaded file at its Storage path.

### Build order

1. **`courses`**, pulled forward from Phase 2 step 3. The table plus admin create,
   list and grant. Not `curriculum_items`, not the builder. A programme is one per
   target institution per content type, in the Client's language, and admins
   create them rather than picking from a list we ship.
2. **`private.student_has_course_grant()`**, the sibling of
   `student_has_document_grant`. `content_access.resource_type` already accepts
   `'course'`, so this needs no constraint change.
3. **`ars_rounds`** with `org_id`, **`course_id`**, `submission_mode`
   (`text` | `file` | `form`), `config` jsonb and `sort_order`. The programme link
   goes in this migration, per the decision of 2026-09-06. Retrofitting it later
   was the thing that decision existed to prevent.
4. **`ars_submissions`** and **`ars_feedback`**, with RLS enabled in the same
   migration and policies covering **writes as well as reads**.
5. **The Storage bucket and its policies on `storage.objects`.** Separate from
   RLS and not optional: a correct row policy in front of an open bucket protects
   nothing. This is rule #2 of the operating manual and it is the access rule the
   Client named as the one they care most about.
6. **One student route** rendering whichever shape the round declares, and **the
   mentor review queue** — the first feature the mentor role has ever had, and the
   first use of `mentor_assignments` since Phase 0 built it.

### Blocked by

**Supabase Pro**, brought forward from before Phase 5. Free gives 1GB of Storage
and video essays are the only thing in this system that grows fast. Raise
`[storage] file_size_limit` from 50MiB at the same time.

Not blocked by VdoCipher. ARS video is a student upload reviewed by a mentor, not
protected course content, so it goes to Supabase Storage behind a signed URL.

### Tests before this phase is called done

Per operating manual §11, the write and Storage halves are the ones that matter:

- Insert an `ars_submissions` row carrying **another student's** `student_id` and
  assert the database refuses it.
- Request another student's uploaded video **by its Storage path** as an unrelated
  student, as an unassigned mentor, and anonymously. Assert all three are refused.
  RLS passing is not evidence the file is protected.
- An unassigned mentor's review queue is empty.

### The ARS design, unchanged by the resequence

This is the specification Phase 5a builds. Only its position in the order moved.

Build **one round engine, not four screens.** `ars_rounds` carries
`submission_mode` (`text`, `file`, `form`) and a `config` JSONB; one student route
renders whichever shape the round declares. Annexure A commits to admins adding
further round types, and a fifth round must not need a developer.

**`ars_rounds` must carry a programme link in the migration that creates it.**
Confirmed with the Client on 2026-09-06: ARS rounds differ per institution, and
the admin creates them per institution. Ashoka's rounds are not Masters' Union's.
Without a `course_id`, every student sees every institution's rounds, and adding
it afterwards is a retrofit in the week this plan already calls overloaded.

Access then needs no new mechanism: a round belongs to a programme, and granting
the programme reaches it. **`content_access.resource_type` does not need
widening** — it accepts `course`, `video`, `document`, `mock`, cannot name a
round, and does not have to.

The access rule is an RLS policy on `ars_submissions` **and** a Storage policy on
the upload bucket. Video essays are files; a correct row policy in front of a
world-readable bucket protects nothing.

## Phase 5b — Migration and handover · last

### Handover deliverables

- The complete source repository and its full history
- Database schema, migrations and environment configuration
- Written documentation and an operations runbook
- A recorded training session
- **Verified backups, with a restore tested rather than assumed**

Database backups **do not include Storage objects**. A separate file backup and
restore process is needed, recorded as critical in `CONTEXT.md`.

### This phase was overloaded, and moving ARS out is half the fix

ARS, migration, QA, deployment, documentation and training all landed here, which
`CONTEXT.md` records as a high risk. **Building ARS first removes one of those
six**, which is the largest single relief available to this week.

It only holds if video does not simply take ARS's place. Video is the bigger
module and the one with third-party risk, so it belongs in a parallel worktree
starting when VdoCipher lands, not in the final week.

The rest of the mitigation is unchanged: pull work earlier, from now.

- Run the importer against real content in Phase 1 or 2, not Phase 3.
- Get the content inventory and written acceptance boundary early. Migration cannot
  start without Cospire's material and it sits in the final week.
- Draft the runbook and documentation as each phase lands.
- Do the Supabase Pro upgrade and the restore test before Phase 5 begins.

---

## Pulled forward on purpose

Three items belong to later phases but must happen earlier. Leaving them where they
naturally fall is how Phase 5 becomes unrecoverable.

| Item | Belongs to | Do it in |
|---|---|---|
| Run one of Cospire's **real** documents through the importer and show them the actual output | Phase 3 | **Phase 1 or 2.** The delivery plan commits to the first fortnight. Needs no finished UI. If accuracy is poor on their older material, that is a conversation with four weeks left rather than one |
| Decide how historical attempts are protected from live edits | Phase 4 | **Before Phase 4 starts** |
| Supabase Pro upgrade and a tested restore | Phase 5 | **Now.** ARS moved to the front, so its Storage requirement moved with it. The restore test can follow, but the plan cannot start on 1GB |

---

## Running phases in parallel

Two or three worktrees, never more. The bottleneck is human review, not code
generation. Ports are assigned in operating manual §5.2.

A sensible split for Phase 1:

| Worktree | Scope | Port |
|---|---|---|
| `admin` | Console, user creation, assignment, access granting | 3040 |
| `documents` | Library, folders, upload, protected viewer | 3050 |

Both read `src/shared/**` and modify nothing in it. Anything either needs promoted
to shared stops and a human promotes it.

Migrations are append-only and timestamped, so two agents adding files is a
non-conflict. Never edit a committed migration.

**Worktrees isolate files, not the database.** Every worktree points at the same
Supabase project, so a dropped column breaks another agent instantly with no merge
conflict to warn anyone. Migrations stay additive.

---

## Prerequisites, and who owns them

These block work rather than slow it.

| Needed | Blocks | Owner |
|---|---|---|
| **Custom SMTP** and DNS records | Bulk student creation, invitations, password resets | Cospire, clause 3.8 |
| **VdoCipher** account and API access | All of Phase 2 | Cospire |
| **Google API / LLM** accounts | Question import in Phase 3 | Cospire |
| **Existing content**: videos, question banks, documents | Migration, and the early import test | Cospire, **by start of week 4** |
| **A decision on what is still in use** | Migration scope | Cospire |
| **One real question document** | The pulled-forward import test | Cospire |
| **Supabase Pro** | Backups, restore test, Storage for ARS uploads | Cospire, clause 8.3 |
| **Vercel Pro** | Commercial use; Hobby does not permit it | Cospire, clause 3.8 |
| **Docker** on a build machine | The two pgTAP suites, neither of which has ever run | Two19 Labs |

The delivery plan assumes **feedback within two working days**. Where that slips
the delivery date moves by the same amount, and it must be flagged in writing at
the time rather than absorbed silently.

---

## Carried over from Phase 0

Not blocking, but they should not quietly disappear.

- **CODEOWNERS is inert.** It names two accounts that cannot access the repository,
  so GitHub ignores it and the review requirement on migrations does not exist.
  Needs the second engineer's real GitHub handle.
- **Vercel is on Hobby**, deliberately for now, to be upgraded before the Client is
  told the platform is theirs.
- **Supabase is on Free.** Pro also unlocks leaked-password protection.
- **`site_url`** points at a `vercel.app` address; replace it if a custom domain is
  added.
- **Actions are referenced by tag, not commit SHA.** Worth pinning before handover.
- **The repository is public**, by decision, to be made private after the project.

---

## Cadence

From the delivery plan, so the client experience matches what was sold.

- **Written updates twice a week**, Tuesday and Friday. No standing calls.
- **Demonstration at the end of Phase 2**, curriculum builder and student
  experience with real content, including a copied video link failing.
- **Demonstration at the end of Phase 4**, with someone from Cospire sitting a full
  mock end to end.
- **If something slips, they hear it that day.** A delay known in week two is a
  scheduling question; one discovered in week six is a problem.

---

## Migrations must be safe against the currently deployed code

**Code deploys itself. The database does not.** Vercel ships on merge to `main`
within a minute. Migrations are applied by a person running `npm run db:migrate`.
Nothing links the two, and CI never touches the database.

So there is always a window where the running code and the schema disagree, and
during a rollout it is worse than a window: Vercel serves the old bundle and the
new one at the same time, so a student mid-attempt may be on either.

The rule that removes the problem rather than automating around it:

> **A migration must never break the code that is currently deployed.**

This is expand and contract, and the cleanup still happens. It simply does not
happen in the same release as the code change.

| Step | What | Release |
|---|---|---|
| Expand | Add the new column or table, nullable or with a default | 1 |
| Migrate | Backfill, write to both, then switch reads to the new one | 1 to 2 |
| Contract | Drop the old column or table | 3, once nothing reads it |

### In practice

- **Add, do not change.** New tables, new columns, new policies.
- **Never drop or rename in the same release as the code that stops using it.** A
  rename is: add the new column, backfill, write to both, switch reads, drop later.
- **New columns are nullable or defaulted.** A `NOT NULL` column with no default
  breaks every insert the deployed code is still making.
- **Tighten in a later migration.** Add nullable, backfill, then set `NOT NULL`
  once the data is clean and the code is deployed.
- **Unique constraints fail on existing duplicates.** Check before adding one.
- **Apply the migration before merging the pull request that needs it.** Belt and
  braces: if the rule above is followed, order stops mattering, but this removes
  the window entirely.

### Two that will bite in later phases

- **`CREATE INDEX` locks writes on a large table.** The fix is
  `CREATE INDEX CONCURRENTLY`, which **cannot run inside a transaction**, and the
  CLI wraps each migration in one. It needs its own migration file with the
  transaction disabled. Relevant from Phase 3 onward, once `questions` is large.
- **A type change rewrites the table and takes a lock.** Treat it as expand and
  contract, never as an `alter column type`.

### Why this survives handover

Today the deployed code is known. After handover it will not be, and Cospire's
team will have less context than the people who wrote it. Under this rule the
worst outcome of a careless migration is an unused column rather than an outage.

It also keeps clause 3.9 literally true: append-only, additive migrations mean the
history recreates the database. Editing history to tidy up quietly breaks that.

The operating manual §5.6 already requires additive migrations, because every
worktree shares one database and a dropped column breaks another agent with no
merge conflict to warn anyone. This is the same rule with a second reason.

## Definition of done, every phase

On top of the checklist in operating manual §6:

- Typecheck, lint, tests and build pass, and CI is green on the pull request.
- RLS policies exist for any new table, covering INSERT and UPDATE as well as
  SELECT, written in the migration that creates the table.
- **The migration is safe against the currently deployed code**, per the rule
  above, and was applied before the pull request was merged.
- Storage policies exist for any new bucket, in the same migration.
- No `service_role` or secret key referenced in client code, and none in the built
  client bundle.
- **The phase's exit gate passes on the deployed URL, not only locally.** Phase 0
  produced a green build whose login page was entirely broken. A passing build is
  not evidence the feature works.
- `CONTEXT.md` updated with what changed, what was verified, and what is still open.
