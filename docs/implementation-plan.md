# Implementation plan

What gets built, in what order, and what has to be true before each part can start.

This plan follows the signed delivery plan week by week. Where it adds detail, the
detail is about sequencing and dependencies, not about scope. Scope is fixed by the
agreement; nothing here adds to it.

**Authority.** The agreement defines what is delivered. The parent operating manual
(`../CLAUDE.md`) defines how. `CONTEXT.md` records current execution state. This
file records the route between them. If it conflicts with any of those, they win
and this file gets corrected.

---

## Where we are

**Week 1, Foundation, is complete.** The contractual deliverable was "a live URL,
all three roles can log in and each sees a different, correct, empty platform."
That is done and verified: three roles signed in on the deployed URL and reached
their own shell.

Also complete from week 1's brief: the database design, the three roles, and the
permission model enforced at the database rather than in application code. The ARS
visibility rule is not yet built because `ars_submissions` does not exist, but the
pattern it depends on is in place and tested.

**Week numbers, not dates.** The exact written Kickoff Date has not been confirmed,
which `CONTEXT.md` already records as an open item. Everything below is sequenced
relative to week 1 completing. Confirm the Kickoff Date before treating any date as
contractual, because the week-four content deadline hangs off it.

---

## Week 2 — Admin console and documents

**The deliverable, in the client's words:** an admin creating a student, granting
them a document, and that student reading it while another student is correctly
refused.

That sentence is the acceptance test. Build toward demonstrating exactly it.

### Build order

The order matters because each step unblocks the next.

**1. Admin console shell and user list.** Paginated from the first commit, per the
operating manual §8. `profiles` is small now and will not stay that way.

**2. Create a single user.** Admin enters name, email, role. The server creates the
Auth identity and the `profiles` row together, or neither.

This is the first place the application needs the Supabase secret key, because
creating an Auth user is an admin operation. It is server-only, it never reaches a
client component, and it is never logged. `profiles.email` is derived from
`auth.users` by trigger, so the two cannot drift.

**3. Mentor assignment.** Writes `mentor_assignments`. The validation triggers
already refuse a non-mentor, a non-student, a disabled party, or a cross-org pair,
so the UI is a thin layer over rules the database already enforces.

**4. Manual access granting.** Writes `content_access` as `resource_type` plus
`resource_id`. Needed before documents mean anything.

**5. Bulk creation from a spreadsheet.** Upload, parse, **validate every row before
creating anything**, report bad rows back for correction, then create in one pass.
A partial import that leaves half a class created is worse than a clean failure.

Blocked on custom SMTP. See prerequisites.

**6. Document library.** `documents` table, folders, upload to Supabase Storage.

**7. Protected viewer.** PDF.js rendering to canvas with the student's identity
drawn across each page. Signed URLs expiring in five to fifteen minutes.

### Non-negotiable for this week

- **Storage policies on the documents bucket**, written in the same migration that
  creates the bucket. Row policies protect table rows; files are governed
  separately by policies on `storage.objects`. A correct policy on `documents` in
  front of a public bucket protects nothing.
- **The watermark is composed server-side** from the signed-in identity. Anything
  the client supplies can be edited to say somebody else's name, which defeats the
  point of a traceable watermark.
- **No media through the application server.** Uploads and downloads go directly to
  Storage with authorisation, per the operating manual §8 and the Vercel payload
  limits recorded in `CONTEXT.md`.

### Tests that must exist before this week is called done

Beyond the standard definition of done:

- A student requesting another student's document is refused.
- The same request made directly against the Storage path, not through the app, is
  also refused. RLS passing is not evidence the file is protected.
- A bulk upload containing one invalid row creates nothing.

---

## Week 3 — Video, curriculums, and the first demonstration

**Deliverable:** video upload and DRM-protected delivery, watermarking, progress
tracking, and the curriculum builder.

**The demonstration includes showing a copied video link failing in a second
browser.** Build toward being able to do that convincingly, with the client's real
content loaded.

### Build order

1. **VdoCipher upload pipeline.** Admin uploads through the platform; the app hands
   the file to VdoCipher and stores the returned id in `videos`. Track processing
   status; encoding is not instant.
2. **Playback.** The OTP request happens **server-side only**, after checking the
   student has access, with the watermark text composed in that same server-side
   request. Generating OTPs in browser code exposes the API key.
3. **`curriculum_items`.** Courses, sections, and the ordered mixed list. Not a
   lessons table; see the operating manual §4.1.
4. **The curriculum builder.** Reordering by `sort_order`.
5. **`item_progress`.** Per curriculum item, not per video, because completion is
   measured across the whole sequence.

`gating` stays unused. The column exists so a change of mind costs an afternoon.

### Risk to front-load

Video encoding, DRM licence behaviour and watermark rendering are all third-party
behaviour discovered by trying, not by reading. Get one real video through the full
path early in the week, not on demo morning.

---

## Week 4 — Question bank and authoring

**Deliverable:** the question bank, the authoring interface with mandatory tagging,
DI sets, numerical answers with equivalent accepted formats, the mock builder, and
Google Doc import with automatic image extraction and a review screen.

### Build order

1. **`questions`** with `section`, `topic`, `difficulty`, `marks` all mandatory.
   Not nullable, and no skip-tagging path. These four columns are the entire reason
   the analytics in week 5 are possible.
2. **The authoring interface**, including image add, replace and remove by upload
   **and by clipboard paste**. Clause 3.17. This is the release valve that makes
   best-efforts PDF extraction acceptable, so it is not a fallback to bolt on late.
3. **DI sets** as one `di_stimulus` row with children via `parent_id`.
4. **Numerical answers.** A list of accepted forms, normalised on both sides before
   comparison. This has its own tests before anything else in the module.
5. **`question_imports` staging**, then the Google Docs fetch, then the LLM parse
   with strict JSON schema output, then the review-and-approve screen.
6. **The mock builder**, writing `mock_questions` **with `mock_section_id`**.
   Without it the engine cannot tell which questions belong to which section and
   sectional timing cannot be built at all.

### Do this in the first fortnight, not in week 4

The delivery plan commits to running **one of Cospire's real documents** through
the importer in the first fortnight and showing them the actual output, so
expectations are set on evidence.

That is a week 2 or week 3 task even though the module is week 4. It needs no
finished UI: fetch a real document, run the parse, show the result. If accuracy is
poor on their older material, that is a conversation to have with four weeks left,
not one.

---

## Week 5 — The test engine and the second demonstration

**Deliverable:** timed delivery with sectional timers, navigation, mark for review,
scoring with negative marking, student analytics, proctoring, and the mobile flow.

**The demonstration asks someone from Cospire to sit a full mock end to end.**

### Build order

1. **Attempt lifecycle.** `attempts.started_at` written by the server. Elapsed time
   validated server-side on submit. The client countdown is decoration.
2. **`attempt_sections`.** One row per section entered, with its own start
   timestamp. There is nowhere else to record when a section began.
3. **Autosave** to `attempt_responses` on change, debounced. Handle the same
   attempt open in two tabs; last write wins is acceptable, silent divergence is
   not.
4. **Scoring**, server-side on submission, following the rule in the operating
   manual §13.1.
5. **Analytics** as SQL aggregates over the four metadata columns.
6. **Proctoring.** Browser APIs writing to `proctor_events`. **Warn and log, never
   auto-submit.**
7. **Mobile.** Device detected **server-side**, `attempts.proctored = false`
   written permanently, surfaced in both student and admin views. A mock with
   `allow_mobile = false` refuses the attempt outright.
8. **Auto-submit of expired attempts** via Vercel Cron. Needs durable job records,
   locks and idempotency, because Cron can overlap or deliver more than once.
9. **Rescoring** after an answer-key correction, as a background job, writing
   `rescore_events`. An agreed deliverable that is one sentence in the contract and
   easy to miss.

### Two integrity risks recorded in `CONTEXT.md`, both due here

- **Historical attempts must not change when a live question or mock setting is
  edited.** Decide the snapshot or versioning approach **before** writing the
  engine, not after attempts exist.
- **Answer keys currently sit on the row students need to read.** Separate the key
  or expose a safe projection before delivery renders a question.

Neither is optional and both are cheaper now than in week 6.

---

## Week 6 — ARS, migration, handover

**Deliverable:** the ARS workflow, mentor review queue, written feedback, migration
of existing content, final testing and deployment.

### ARS

Build **one round engine**, not four screens. `ars_rounds` carries
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

The restore test requires Supabase Pro, and note that **database backups do not
include Storage objects** — a separate file backup and restore process is needed,
recorded in `CONTEXT.md` as a critical finding.

Cospire then has seven days to report anything not working as described, corrected
free of charge, after which three months of support begins.

### The week-six overload, stated plainly

`CONTEXT.md` records this as a high risk already: ARS, migration, QA, deployment,
documentation and training all land in the same week. The mitigation is not working
harder in week six. It is pulling work earlier, starting now:

- Run the importer against real content in week 2 or 3, not week 4.
- Get the content inventory and the written acceptance boundary early. Migration
  cannot start without Cospire's material and it sits in the final week.
- Draft the runbook and documentation as each module lands, not at the end.
- Do the Supabase Pro upgrade and the restore test before week 6 begins.

---

## Running work in parallel

Two or three worktrees, never more. The bottleneck is human review, not code
generation. Ports are assigned in the operating manual §5.2.

A sensible split for week 2:

| Worktree | Scope | Port |
|---|---|---|
| `admin` | Admin console, user creation, assignment, access granting | 3040 |
| `documents` | Library, folders, upload, protected viewer | 3050 |

Both touch `src/shared/**` only by reading. Anything either needs promoted to
shared stops and gets a human to promote it.

Migrations are append-only and timestamped, so two agents adding files is a
non-conflict. Never edit a committed migration.

**Worktrees isolate files, not the database.** Every worktree points at the same
Supabase project, so a dropped column breaks another agent instantly with no merge
conflict to warn anyone. Migrations stay additive.

---

## Prerequisites, and who owns them

These block work rather than slow it. Chase them now.

| Needed | Blocks | Owner |
|---|---|---|
| **Custom SMTP** account and DNS records | Bulk student creation, all invitations and password resets | Cospire, clause 3.8 |
| **VdoCipher** account and API access | All of week 3 | Cospire |
| **Google API / LLM** accounts | Question import, week 4 | Cospire |
| **Existing content**: videos, question banks, documents | Migration, and the early import accuracy test | Cospire, **by start of week 4** |
| **A decision on what is still in use** | Migration scope, so nothing is migrated that nobody opens | Cospire |
| **One real question document** | The first-fortnight import accuracy test | Cospire |
| **Supabase Pro** | Backups and the restore test, Storage for ARS uploads | Cospire, clause 8.3 |
| **Vercel Pro** | Commercial use; Hobby does not permit it | Cospire, clause 3.8 |
| **Docker** on a build machine | The two pgTAP suites, neither of which has ever run | Two19 Labs |

The delivery plan also assumes **feedback within two working days**. Where that
slips the delivery date moves by the same amount, and it must be flagged in writing
at the time rather than absorbed silently.

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

From the delivery plan, so the client experience matches what was sold:

- **Written updates twice a week**, Tuesday and Friday. No standing calls.
- **Demonstration at the end of week 3**, curriculum builder and student experience
  with real content, including a copied video link failing.
- **Demonstration at the end of week 5**, with someone from Cospire sitting a full
  mock end to end.
- **If something slips, they hear it that day.** A delay known in week two is a
  scheduling question; one discovered in week six is a problem.

---

## Definition of done, every feature

On top of the checklist in the operating manual §6:

- Typecheck, lint, tests and build pass, and CI is green on the pull request.
- RLS policies exist for any new table, covering INSERT and UPDATE as well as
  SELECT, written in the migration that creates the table.
- Storage policies exist for any new bucket, in the same migration.
- No `service_role` or secret key referenced in client code, and none in the built
  client bundle.
- The feature is exercised on the deployed preview URL, not only locally. Phase 0
  produced a green build whose login page was entirely broken; a passing build is
  not evidence the feature works.
- `CONTEXT.md` updated with what changed, what was verified, and what is still open.
