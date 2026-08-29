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

| Phase | Week | Scope | Status |
|---|---|---|---|
| **0** | 1 | Foundation, identity, access | **Complete** |
| **1** | 2 | Admin console and documents | Next |
| **2** | 3 | Video, curriculums, **first demo** | Not started |
| **3** | 4 | Question bank and authoring | Not started |
| **4** | 5 | Test engine, **second demo** | Not started |
| **5** | 6 | ARS, migration, handover | Not started |

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

**Week 2. This is next.**

**Exit gate, from the delivery plan:** *"An admin creating a student, granting them
a document, and that student reading it while another student is correctly
refused."*

That sentence is the acceptance test. Build toward demonstrating exactly it.

### Build order

Each step unblocks the next.

1. **Admin console shell and user list.** Paginated from the first commit, per the
   operating manual §8. `profiles` is small now and will not stay that way.
2. **Create a single user.** The server creates the Auth identity and the
   `profiles` row together, or neither. This is the first place the application
   needs the Supabase secret key: server-only, never in a client component, never
   logged. `profiles.email` is derived from `auth.users` by trigger, so the two
   cannot drift.
3. **Mentor assignment.** Writes `mentor_assignments`. The validation triggers
   already refuse a non-mentor, a non-student, a disabled party or a cross-org
   pair, so the UI is a thin layer over rules the database enforces.
4. **Manual access granting.** Writes `content_access` as `resource_type` plus
   `resource_id`. Needed before documents mean anything.
5. **Bulk creation from a spreadsheet.** Upload, parse, **validate every row before
   creating anything**, report bad rows back, then create in one pass. A partial
   import leaving half a class created is worse than a clean failure.
6. **Document library.** `documents` table, folders, upload to Supabase Storage.
7. **Protected viewer.** PDF.js to canvas with the student's identity drawn across
   each page. Signed URLs expiring in five to fifteen minutes.

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

- A student requesting another student's document is refused.
- The same request made **directly against the Storage path**, bypassing the app,
  is also refused. RLS passing is not evidence the file is protected.
- A bulk upload containing one invalid row creates nothing at all.

### Blocked by

**Custom SMTP** blocks step 5 only. Steps 1 to 4, 6 and 7 can proceed without it.

---

# Phase 2 — Video, curriculums, and the first demonstration

**Week 3.**

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
4. **The curriculum builder**, reordering by `sort_order`.
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

**Week 6.**

**Exit gate:** handover accepted, followed by seven days for Cospire to report
anything not working as described, corrected free of charge, after which three
months of support begins.

### ARS

Build **one round engine, not four screens.** `ars_rounds` carries
`submission_mode` (`text`, `file`, `form`) and a `config` JSONB; one student route
renders whichever shape the round declares. Annexure A commits to admins adding
further round types, and a fifth round must not need a developer.

The access rule is an RLS policy on `ars_submissions` **and** a Storage policy on
the upload bucket. Video essays are files; a correct row policy in front of a
world-readable bucket protects nothing.

### Handover deliverables

- The complete source repository and its full history
- Database schema, migrations and environment configuration
- Written documentation and an operations runbook
- A recorded training session
- **Verified backups, with a restore tested rather than assumed**

Database backups **do not include Storage objects**. A separate file backup and
restore process is needed, recorded as critical in `CONTEXT.md`.

### This phase is overloaded, and that is already known

ARS, migration, QA, deployment, documentation and training all land here.
`CONTEXT.md` records it as a high risk. The mitigation is not working harder in
Phase 5; it is pulling work earlier, from now:

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
| Supabase Pro upgrade and a tested restore | Phase 5 | **Before Phase 5 starts** |

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

## Definition of done, every phase

On top of the checklist in operating manual §6:

- Typecheck, lint, tests and build pass, and CI is green on the pull request.
- RLS policies exist for any new table, covering INSERT and UPDATE as well as
  SELECT, written in the migration that creates the table.
- Storage policies exist for any new bucket, in the same migration.
- No `service_role` or secret key referenced in client code, and none in the built
  client bundle.
- **The phase's exit gate passes on the deployed URL, not only locally.** Phase 0
  produced a green build whose login page was entirely broken. A passing build is
  not evidence the feature works.
- `CONTEXT.md` updated with what changed, what was verified, and what is still open.
