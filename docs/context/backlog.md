# Backlog: open items off the immediate path, and the earlier plan

Moved verbatim from `CONTEXT.md` on 2026-10-10. `CONTEXT.md` keeps the
current next actions; this file keeps what is still open but not next, and the
plan as it stood through early October. Some statements here are dated and
partly superseded; where they disagree with `CONTEXT.md`, `CONTEXT.md` is
right.

## Pending items carried from earlier phases

### Carried over from Phase 0

None of these block Phase 5a.

| Item | Why it matters | Needs |
|---|---|---|
| **CODEOWNERS is inert** | It names two accounts that cannot access the repository, so GitHub ignores it and the review requirement on `/supabase/migrations/**` does not actually exist | The second engineer's real GitHub handle. The owner's account is `Two19Labs` |
| **Vercel on Hobby** | Hobby forbids commercial use | Upgrade before the Client is told the platform is theirs. Clause 3.8 puts the account in Cospire's name |
| **Supabase on Free** | No daily backups, 1GB Storage, pauses after seven days idle. Also gates leaked-password protection | Blocks ARS being **used** with real video essays, not built: Free's 1GB and 50MiB file limit are enough to build and test the upload path. Needed before students upload for real, and before the restore test. Clause 8.3 budgets for it |
| **Custom SMTP not configured** | The built-in sender is rate limited to 2 emails an hour and will stall bulk creation partway through a class | An SMTP account in Cospire's name plus DNS. Raise `[auth.rate_limit] email_sent` at the same time |
| **Neither pgTAP suite has ever run** | 32 assertions across two files, verified by hand against the live schema instead | A Docker-enabled machine, then `npm run db:test` |
| **Actions pinned by tag, not SHA** | A moved tag would run different code | Worth pinning before handover. CI now also warns that `actions/checkout@v4` and `actions/setup-node@v4` target the deprecated Node 20 and are being forced onto Node 24; bumping to `@v5` clears both the warning and the pinning item in one change |
| **`site_url` points at a `vercel.app` address** | It goes into password-reset emails | Replace if a custom domain is added, then `supabase config push` |

### Pulled forward from later phases

Recorded in the implementation plan, repeated here because they are easy to lose.

1. **Run one of Cospire's real documents through the importer during Phase 1 or 2.**
   The delivery plan commits to the first fortnight. It needs no finished UI, and
   poor accuracy on their older material is a conversation to have with four weeks
   left rather than one.
2. **Historical attempts and live edits: decided 2026-09-21.** Questions stay
   editable. A past attempt's review shows the current question, and Phase 4
   rescores every attempt a key, option or marks change affects. See the
   Critical finding below.
3. **Supabase Pro immediately, and a tested restore before handover.** Pro moved
   from "before Phase 5" to "now" when ARS was brought forward. The deliverable is
   a restore tested, not enabled, and database backups exclude Storage objects.

## The earlier "Next recommended action" (through 2026-10-09)

**First, three things that are not code**, from the meetings of 2026-09-16 and
2026-09-21:

1. **The 1 October commitment.** The Client was told ARS and the mock test
   would be ready and tested "in the next 15 days", and on 2026-09-21 that the
   project is on time; the owner confirmed on 2026-09-22 that the schedule
   holds. ARS is done and deployed, and so are the question bank and the mock
   builder. **On 2026-09-23 the owner put the import work ahead of the test
   engine**, so what a student sits is now the last of the four items above.
   **The test engine merged and was verified on the deployed URL on
   2026-09-28**, so the 1 October commitment is met on the platform side. The owner promised
   the Client on 2026-09-21 to raise any delay up front, and clause 4.4 wants
   that in writing at the time rather than at the end.
2. **Put the build-now, invoice-later arrangement in writing**, with the first
   items named: feedback, onboarding, offboarding, student journey trackers,
   the ARS report and the process importer. Clause 12 says quote first; clause
   16.1 says amendments are written. Both sides want this, so it only needs
   recording. **The same amendment should record that question import runs on
   paste-a-prompt**, with figures pasted in on review, rather than the
   automatic Google Docs image extraction clause 3.15 promises. The owner
   accepted this on 2026-09-21. Add the two items the Client raised in the
   call that day: **sub-admins**, once they define them, and **a parser for
   the mentor's report**.
3. **Send the Client access to the build**, as agreed at the end of the
   2026-09-21 call, so their team can review the flow. Their feedback clock
   starts when they have it.

**The process importer is built, verified, merged and deployed** (2026-09-20,
PR #30), together with the form engine it depends on. Two things follow from it
that are not code:

- **It is a clause 12 conversation, like the report.** The founder agreed the
  paste-a-prompt mechanism on 2026-09-16 for *question* import. Pointing it at
  whole ARS processes is more than Annexure A's words and was built on the
  owner's instruction of 2026-09-20 for a client review the same evening. The
  quotation and the clause 16.1 written amendment are outstanding, and are not
  settled by having built it.
- **Tell the Client what it does not do.** It reads what a model gives it. It
  never invents a date, and it will not deliver an aptitude test, because the
  test engine is unbuilt -- those rounds arrive as placeholders carrying their
  specification. Both are visible in the preview, and both are better said than
  discovered in front of a college.

**Phase 5a is complete.** Its exit gate closed on 2026-09-20, **28 of 28 against
the deployed URL**, and the draft/save path that previously lacked a
browser-level harness is inside it. Nothing in the phase is outstanding.

**Programmes and ARS are separated** (2026-09-20, PR #44/#45) and **every
signed-in screen has a loading state** (2026-09-21, PR #46). Both are deployed
and verified against the deployed URL.

### Now: Phase 6, before video

Decided 2026-10-01/02. Plan: *Phase 6* in `docs/implementation-plan.md`.
Decisions: `docs/decisions/2026-10-02-decision-statement.md`. Both decision
statements are **untracked**, so a worktree will not have them; copy them across
or read them from the main checkout. In order:

1. **6.1 The exam screen.** Instant question switching, background saving and a
   full-screen layout, from Aditya's reference design, with every server-side
   rule kept. Step 4.5 (closing abandoned attempts) comes with it. **In scope;
   start now.**
2. **6.2 Marks onto the mock (D19).** Expand first. Removing marks from
   questions waits for the Client's written line.
3. **6.3 Duplicate detection (D22–D24).** Exact fingerprint plus `pg_trgm`, **no
   model**. A flagged match offers same / corrected version / different.
   Clause 12.
4. **6.4 The mock-first import wizard (D7–D9, D13–D15, D20).** Clause 12.

**The owner decided on 2026-10-02 to start 6.2, 6.3 and 6.4 immediately, at
risk, ahead of the clause 12 quote.** They gave two reasons: marks on the mock
was settled with the Client on 1 October, and the import route is what the
Client uses first. The quote and the clause 16.1 written amendment are **still
owed**; building first does not settle them. **6.2-6.4 merged as PR #69
(`92df9fc`, 2026-10-08)**; its two migrations were applied on 2026-10-02. The exam-screen reference design
for 6.1 is `../design-previews/Cospire Mock Test (1).html`.
5. **6.5 Small committed items: merged as PR #71 (`a65a9d3`) on 2026-10-09.**
   Watermark bottom left, viewer full screen, the landscape check, the stale
   Programmes card. Done: watermark drawn once per page as one small bottom-left
   mark; a full-screen button on the document viewer, hidden where the
   Fullscreen API is unavailable; the stale "Aptitude preparation: not built
   yet" card removed from the Programmes page. Typecheck, lint, 537/537 tests
   and build pass; `verify.mjs` 35/36 and `programmes-ars-split.mjs` 19/19
   against a local production build and the hosted database, both pre-existing
   unrelated findings below; real-browser screenshots over Chrome's own
   DevTools Protocol confirm the watermark and full screen render correctly
   with the real landscape test PDF. See *Phase 6.5, small committed items* in
   `docs/context/completed.md`. The two findings it surfaced (the refused-document
   status and `loading-coverage` at 8/11) were harness faults, fixed on
   `fix/main-faults`.
6. **6.6 Admin gaps Annexure A promises**: an ARS submissions view, the activity
   log and flags, bulk CSV once SMTP exists. **Merged as PR #73 (`ee1e0e8`)
   2026-10-09 with D8**, its migration applied, harness 34/34. Bulk CSV still waits for SMTP; the video-watching flag waits
   for video.
7. **6.7 Real documents** through the paid Gemini path, once billing and their
   files exist.

### What to build next, in the order it should be taken

**Order changed by the owner on 2026-09-23: the import work comes before the
test engine.** Question import and mock assembly are what the Client can use
immediately on the material they already have; the test engine is the larger
build and now follows them. The 1 October commitment covers a tested mock
engine, so this order makes the written revision under clause 4.4 more likely
to be needed, not less -- see *Next recommended action*, item 1.

**1. Word upload: pictures out, numbered markers in. DONE.** Merged as PR #58
(`b2a4fb8`) and verified **25/25 against the deployed URL** on 2026-09-25. No model call, so it
works whatever the Client decides about cost. The admin uploads a `.docx`; the
platform opens it (a zip), extracts each image in document order into the
existing `question-images` bucket, and produces the paper's text with
`[[figure:N]]` where each image sat. The admin copies that text into any model
with the existing prompt, pastes the JSON back, and the platform resolves each
marker to image N before the usual review and approval. Word tables become text
tables. Flagged rather than guessed: an image inside an answer option, EMF/WMF
drawings Word stores as vector art, and native Word charts.
**Dependency: `fflate` 0.8.2, approved by the owner 2026-09-23 and now in
`package.json`** -- Node cannot
open a zip on its own, and a hand-written zip reader is the kind of code that
works on one file and fails on the next. `@google/genai` was **declined in
favour of plain `fetch`**, which was proven against the live key on 2026-09-23.

**2. The Gemini path: three steps instead of six. MERGED AND DEPLOYED** in the
same pull request. The Client has agreed all costs (owner, 2026-09-25). **The
live round trip is still UNVERIFIED**, and the reason is known: the Google Cloud
project behind the Client's key has no billing enabled, so it is served on
leftover capacity at five requests a minute. A new key would fix nothing; see
*The 503 that was a billing checkbox* in `docs/context/completed.md`. The platform sends the
prepared text to Gemini itself and places the images, so the admin uploads,
reviews and approves. Everything technical is in hand: the key works, returns
schema-valid JSON, and is on the paid tier. Two things to settle first, neither
of them code: the Client's agreement to the cost (about Rs 5 a paper, billed to
their own Google account -- the drafted question still quotes Claude and Rs 20
and needs redrafting before it is sent), and thinking turned low or off in the
call, because thinking tokens bill as output. Details, limits and routing are
under *Question import with pictures* below.

**3. Mocks built from documents that quote question IDs. MERGED as PR #61
(`092d878`), 29/29 on the deployed URL.** Readable IDs
(`Q00042`, computed from `questions.id`, no migration), copyable ID lists on
the bank and at the end of an import, and a plain-text mock template parsed
directly -- no model, because an ID must match exactly -- which resolves to the
existing `save_mock`. Built to the design under *Question IDs and mock
documents: designed 2026-09-22* in `docs/context/meetings.md`; the write-up and
what is still unverified are in `docs/context/completed.md`. **Item 5 of the
design, pasting a whole new paper so the questions enter the bank and a draft
mock is made in one step, is deliberately not built** -- the design marks it
"later, and only if wanted".

**4. The test engine (Phase 4). MERGED as PR #63 (`47beb72`), 49/49 on the
deployed URL.**
Everything operating manual §1 insists on is in the database, not in routes:
the server-authoritative timer (answers refused after the clock plus 30s),
sectional timing, per-question-type negative marking, the phone attempt
permanently unproctored and refused where a mock bars phones, warn-and-log
proctoring, keys readable only after the student's own submission, and
rescoring with `rescore_events` when a key, option set, type or marks value
changes. Left: **4.5, a scheduled close of abandoned attempts** (owner's
decision: `pg_cron` in the database, or Vercel Cron, which on Hobby runs once a
day), and analytics is merged (PR #65). **Attaching a mock to the ARS aptitude
round** is merged (PR #66).

**5. Run Cospire's real question documents through the importer** as soon as
they supply them, and settle the model choice with the accuracy test described
below rather than on price.

**6. Video and curriculums (Phase 2)**, the day VdoCipher access arrives, in its
own worktree. If it has not arrived by the start of week four it slips and
clause 4.4 applies -- notified in writing at the time, not at the end.

**7. Phase 1 step 5**, bulk CSV student creation, still blocked on custom SMTP.

### Smaller things, none of them blocking

- **The owner should decide where "Ashoka" belongs.** The `kind` backfill filed
  it as an ARS process because it holds one round called "ARS Template". If it
  is really aptitude-prep content, one click on its ARS page moves it back.
- **The per-screen re-skin of the remaining panels.** The shell, the ARS form
  and the loading states are done; the panels inside the admin and mentor
  screens have not been gone through one by one. Start with the mentor report
  screen, whose layout the owner called broken in the 2026-09-21 demo.
- **From the 2026-09-21 call, all small, none built yet:**
  - a full-screen mode for the document viewer
  - the watermark as one small mark in the bottom left of each page, in place
    of the rotated tiling
  - a landscape PDF opened in the viewer to check how it fits

  See *The walkthrough call, 2026-09-21* (`docs/context/meetings.md`).
- **`src/shared/ui/submit-button.tsx` is new and shared**, which operating
  manual §6.1 makes a human's call. It is used by 34 buttons across 16 files.
  Flagged in PR #46 rather than assumed; confirm or move it.
- **Vercel Pro.** It is owed for the commercial-use clause and it is also the
  only thing that will move the 1.3-second page times, which are cold starts on
  the Hobby tier rather than anything in this repository. See *Where the 1.3
  seconds actually goes*.

**The review contract is merged** (2026-09-18, `6a39649`), so `docs/review-checklist.md`
is on `main` and is what a reviewer works from.

**Put the MESA question-type fork to the Client.** Their benchmark process puts
email writing and a video essay inside one timed test; Annexure A fixes the four
question types to automatically scored ones. Either the writing becomes its own
round, which costs nothing, or extending the engine is quoted under clause 12.

Owed by the Client, to chase rather than work around:

1. **VdoCipher access -- all of Phase 2.** Week 3 is burning. Notify in writing
   now. Cite clause 4.4 (delivery extends day for day) and clause 4.2: the
   Kickoff Date is the latest of signature, advance and the Client providing the
   clause 6 access. Clause 6.4 sets no deadline for opening accounts, so 4.4 on
   its own is arguable.
2. **Supabase Pro**, before ARS is used with real video essays and before the
   restore test.
3. **Custom SMTP**, for bulk CSV creation (Phase 1 step 5), raising
   `[auth.rate_limit] email_sent` at the same time.
4. **Recoleta Bold `.woff2` and its web licence.** Headings use Georgia until then.
5. **The written list of programmes**, and **what "ARS" stands for**.
6. **The written Kickoff Date.** The copy of the agreement in `../Context/` has
   the Client's signature date blank; file the countersigned copy if one exists.
7. **From the 2026-09-21 call:** two or three sample documents of each of the
   five content kinds, their question lists for mocks, a definition of
   sub-admin permissions, and one consolidated list of flow feedback.

Owner decisions:

1. **Repository visibility against clause 3.9.** See *Repository visibility*.
2. **Tell Cospire what the document watermark does and does not stop**: a saved
   page image is watermarked, but the signed URL can be read from the page source
   to fetch the clean PDF within its ten minutes.
3. **The leftover audit organisation**, which can only be removed by a migration
   or a manual dashboard deletion.
4. **Correct the parent operating manual.** `../CLAUDE.md` omits `profiles.status`
   and does not note that `documents.id` must be `bigint`. The owner's file,
   outside git.

Carried from Phase 0, none of it blocking:

1. **Fix CODEOWNERS.** Needs the second engineer's GitHub handle. Both engineers
   currently commit as one shared account, so no review is enforceable.
2. **Vercel Hobby to Pro**, before the Client is told this is their platform.
3. **Run the pgTAP suites** on a Docker-enabled machine; neither has ever run.
4. **Replace `site_url`** if a custom domain replaces the `vercel.app` address.
5. **Pin Actions**, bumping `checkout` and `setup-node` to `@v5`.

The route through the rest of the build is in `docs/implementation-plan.md`.
