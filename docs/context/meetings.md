# Client meetings and what they settled

Records of calls with the Client and the decisions they produced, newest first. Moved out of `CONTEXT.md` on 2026-09-22; the text is unchanged.

## The walkthrough call, 2026-09-21

The owner demonstrated the build to the Client's founder: the document viewer,
user and mentor management, the ARS process importer, a student handing in a
round, the mentor queue and outcome recording, and the report template importer
and mentor report. The question bank was shown running locally. The transcript is
at `../Context/2026-09-21 walkthrough call - transcript.md`, outside git. It is an
automatic transcript, patchy in places, and the date is inferred: the owner
supplied it on 2026-09-22 as "the meeting yesterday".

### Settled

- **One central question bank.** Mocks, practice tests and anything else that
  holds questions are built by picking from it. Students never see the bank
  itself. The owner recommended this and the founder agreed, for a reason that
  matters later: he wants a student eventually to see every question they have
  attempted in a topic and how they did, which needs one repository. **This is
  what PR #49 already builds**, so nothing changes.
- **Paste-a-prompt confirmed again**, this time for whole ARS processes: "this
  is good, this is convenient", and he chose it over paying for an API key. He
  called it a good jugaad at no cost.
- **The Client reviews flow and logic now, and the look later.** He said the
  screens "really need to be beautified" but asked his team to comment only on
  the technical side and the flow for now. The owner told him "the UI is not
  worked upon at all". That understates it: the shell and the ARS form were
  re-skinned on 2026-09-20. What is true is that the panels inside the admin and
  mentor screens have not been reworked one by one.
- **Autofill in application forms: the founder left it to the owner** ("you can
  take a call"). The question was whether a student's name, email and similar
  fields should come from their account or be typed in.

### Two19 committed in the call

- **A full-screen mode for the document viewer.** "That can be done easily." It
  does not exist today.
- **A small watermark: decided by the owner, 2026-09-22.** The founder wants
  students to have a good reading experience and said Cospire branding "and
  that is it" would do, since anyone can put the content into a model and
  recreate the questions anyway. **One small watermark per page, in the bottom
  left corner, drawn once and not tiled.** Today the viewer tiles the watermark
  text, rotated, across the whole page at 0.16 opacity
  (`drawWatermark` in `src/features/documents/components/document-viewer.tsx`),
  and that is what changes. The text stays what `composeWatermark` produces
  unless the owner says otherwise. Accepted with the decision: one corner mark
  can be cropped out of a screenshot, where a tiled one could not. Update the
  comments above `drawWatermark` when it is rebuilt, since they argue for
  tiling. Not built yet.
- **Landscape PDFs.** "A lot of PDFs that we have created right now are
  horizontal." The owner said it is not a worry. **Not verified:** nobody has
  opened a landscape PDF in the viewer to check how it fits the frame or how
  the watermark lies on it. Test with one of their real files when they arrive.
- **An alternative to one shared chat for question IDs.** Designed on
  2026-09-22; see *Question IDs and mock documents* below.
- **The report template's round selector: rechecked 2026-09-22, 7 of 8 on the
  deployed URL.** While linking imported components to the new Ashoka process
  in the demo, the owner said "some error is happening" and "this should be
  Ashoka specific". A throwaway run against `https://cospire-roan.vercel.app`
  reproduced the demo: a template as the importer leaves it (no programme, no
  links) was moved into a new process and activated, each component was linked
  to a round, and one was unlinked with "No round". **All of that saves
  correctly**, confirmed by reading the rows back, and live counts returned to
  baseline. **The one failure is the defect the demo hit:** the selector offers
  every round in the organisation, not the template's programme's rounds.
  `getTemplate` in `src/features/ars-report/queries/get-template.ts` selects
  `ars_rounds` with no `course_id` filter, and the options show a bare round
  name. Live data has 8 rounds across 4 processes, and "Personal Interview and
  Group Discussion" appears in two of them, indistinguishable in the list. So
  an admin can link a component to another process's round and not know it.
  **Fix:** when the template has a programme, offer only that programme's
  rounds; when it has none, label each option with its process name. **Built
  in PR #50**, merged 2026-09-22 as `9d6364f` and deployed, no migration. A
  round already linked from another process also stays listed and labelled,
  so a save cannot silently unlink it. `scripts/verify/report-round-links.mjs`
  passes **8/8 on the deployed URL**, counts back to baseline.
- **Skeletons looked absent on student and mentor screens** (the owner's own
  observation during the demo). **Fixed and deployed 2026-09-22 in PR #52**
  (`39860c6`). Every page already had a skeleton. Seven detail screens borrowed
  their parent's, under the parent's title, and sign-in went through an extra
  `/dashboard` round trip. See the Completed row of 2026-09-22.
- **The mentor report screen's layout is broken.** "The UI is messed up, I need
  to [fix] that." Add it to the panel-by-panel re-skin list.
- **Send the Client access to the build** so their team can sit with the flow.
  The founder closed on this as the next step.

### New scope, to be recorded rather than absorbed

Both of these go into the clause 12 and 16.1 written amendment beside the items
already listed under *Next recommended action*.

- **Sub-admins.** Admins who can add processes but not delete anything, so not
  everyone has master-admin control, possibly in several categories. The owner
  asked the Client to define what each kind may do. Annexure A has three roles;
  a fourth touches every policy that checks for an admin, so it is quoted once
  they send the definition, not absorbed.
- **A parser for the mentor's report.** The founder said mentors will dictate
  their assessment into an AI tool and want to paste the result in rather than
  fill the form by hand. The owner agreed to keep both routes, and added that
  "wherever there is a manual entry step, we could shift that to a parser". That
  sentence is an open-ended offer; do not let it be read as a promise covering
  every screen.

### Still open

- **"Mark as optional."** Reads as marking an application field optional or
  required. **The form engine already supports it**: every field carries a
  `required` flag, optional by default (`src/features/ars/form-builder.ts`).
  Confirm that is what he meant and show him where it is.
- **Five kinds of content.** The founder named practice documents, class
  documents, advanced documents, question banks and mocks, and said "everything
  is question documents" with some theory. Whether practice documents and class
  documents are protected PDFs in the library or sets of questions built from
  the bank has not been decided. Their samples will show which.

### Owed by the Client from the call

1. **Two or three documents of each of the five kinds.** A team member was
   meant to send them already and had not been asked.
2. **Their question lists for mocks**, so the bank can be filled and the
   importer tried on real material. "I'll check with the team."
3. **A definition of sub-admin permissions.**
4. **One consolidated list of feedback on the flow.** He expects many rounds of
   changes. The delivery plan's two working days for feedback applies, and
   change requests beyond Annexure A go through clause 12.

### Question IDs and mock documents: designed 2026-09-22

**The goal, from the owner:** the Client uses question IDs to write a mock as a
document, pastes it in, and the mock is built with no manual picking.

The founder agreed each question needs a unique ID but rejected one shared
Claude chat that allocates them, since the whole team would have to use it,
and suggested IDs by working session. **Neither is needed. The database
already issues the ID**: `questions.id` is a `bigint` identity, unique, issued
on insert and never reused, so no person or chat allocates anything and two
people importing at once cannot collide.

1. **A readable form, with no migration.** Show every question as `Q` plus its
   id padded to five digits, such as `Q00042`, computed from `questions.id` and
   not stored. It appears on each bank row and the question page, and bank
   search accepts it. The parser accepts `Q42`, `q00042` and `Q-00042` as the
   same question. An archived question keeps its ID.
2. **Getting IDs out without copying them one by one.** The question importer's
   approval step lists the IDs it just created, in paper order, ready to copy;
   the bank offers "copy IDs" for the current filtered list, such as all hard
   DILR questions. A DI set is one ID, the stimulus.
3. **The mock document is a fixed plain-text template, parsed directly with no
   AI model.** An ID must be matched exactly and there is nothing to interpret,
   so a model adds only a chance of a mistyped ID. The Client writes it in a
   Google Doc and pastes it:

   ```text
   Mock: CAT Full Length 3
   Duration: 120
   Negative marking: 1 on mcq, mcq_multi
   Attempts: 1
   Allow mobile: no
   Proctoring: yes

   Section: VARC | 40
   Q00101, Q00102, Q00103
   Section: DILR | 40
   Q00210, Q00215
   Section: QA | 40
   Q00301, Q00302
   ```

   With one section and no minutes, the mock has overall timing only, matching
   the builder's existing rule. A document in some other layout can still be
   turned into this template with any model, the same copy-a-prompt habit the
   Client already uses.
4. **All or nothing, with a preview, like every importer here.** Refused, with
   the line number: an ID that does not exist or is archived; a DI child's ID,
   answered with "use the set's ID, Qnnnnn"; an ID used twice; section minutes
   that do not add up to the duration; and any setting outside the builder's
   own limits. A DI stimulus ID brings all its children, in order. On confirm
   it calls the existing `save_mock` function, so there is **no new write path
   and no migration**, and the result opens in the ordinary mock editor.
5. **Later, and only if wanted:** paste a whole new mock paper so the questions
   go into the bank and a draft mock is made from them in one step. This was
   the second route discussed in the call. It still uses the central bank.

Where it lives: a parser beside `src/features/question-bank/mock-form.ts`, unit
tested, and a route at `/admin/mocks/import`. Build it after PR #49 merges, on a
new branch. **The Client's side of it:** import questions first, then write
mocks from the IDs the bank shows.

### The schedule

The founder asked twice, near the end, for the project to be finished on time.
The owner answered "I definitely think that we're on time and we will complete
it", and promised to raise any delay early. **The owner confirmed on 2026-09-22
that the schedule holds and the remaining build will land on time.** No clause
4.4 notice is planned for the build itself. VdoCipher access is a separate,
client-owned dependency and stays listed under *External blockers*.

## The ARS meeting, 2026-09-16

A call with the Client's founder about ARS. The full transcript is at
`../Context/2026-09-16 ARS founder meeting - transcript.md`, outside git: the
recording carried no audio, so it was read frame by frame from a screen capture
of a transcript, and the recording begins partway into the meeting.

This section is the record of what it settled. Where it contradicts the Step 3
decisions of 2026-09-12, **the Client's answer wins and this section is right.**

### Settled

- **Two-way rounds stay off the platform.** Interviews, group discussions and
  guesstimates happen elsewhere -- a guesstimate is a video call run like a
  consulting case. The platform shows the student the step, its dates and
  deadlines, and holds the mentor's evaluation afterwards. The founder raised
  the contractual limit himself. This closes the Annexure B question that had
  blocked the round design, and it means **a round needs date and deadline
  fields**, which nothing in the schema has today.
- **A round is built from a fixed set of components:** video submission, short
  or long written answer, a form, an essay, email writing, and an aptitude test
  (a mock). An ARS process may have **any number of rounds**; three to five is
  usual. Admins compose a process out of those components.
- **A process belongs to an admission process, not to a student.** Students are
  enrolled into it; a college that changes its admission process gets a new one
  built. One student can be in several processes at once.
- **Mocks are built on the mock page and attached to ARS**, never authored
  inside ARS. Scoring is automatic and **a mentor never touches a mock score**.
  Negative marking stays a per-mock toggle, usually off. Timing is per test,
  sectional or not.
- **Word limits are configurable** on every written input.
- **Question import:** a standard prompt run in Claude with the output pasted
  into a parser in the platform, rather than a built-in API integration the
  Client pays per call for. The founder agreed to this in the call.

### What this changes in work already designed

- **ARS-specific mocks DO appear on the student's dashboard**, and a student can
  sit one on its own. The 2026-09-12 answer -- that they show only inside ARS --
  is superseded. What limits them is **who is enrolled** (the "advanced
  end-to-end" students), not hiding the mock.
- **Application rounds DO take file uploads:** resume, tenth-grade marksheet,
  certificates. They are real files kept in the back end, with an option to
  delete later; not a pretend upload. The 2026-09-12 answer of "text only" is
  superseded, and this pulls the Storage bucket of step 4 forward into the
  application round.
- **Scoring and the mentor's write-up happen at the end of a whole process, not
  per submission.** `ars_feedback` as designed hangs one row off one submission,
  which is now the wrong shape. This is why the step 3 migration is being
  reworked rather than applied.

### New scope, to be recorded rather than absorbed

- **The ARS report.** The founder described a report with subjective scoring on
  set parameters, written descriptions, detailed observations, a plan of action,
  strengths and weaknesses, on a template the admin can change, with any field
  left blank by a mentor. Annexure A promises that a mentor "writes feedback and
  marks a submission as reviewed". A configurable report builder carrying
  quantitative and qualitative sections is more than that, and it is the largest
  single piece of new work the meeting produced.
- **Further modules named in the same call:** feedback, onboarding, offboarding
  and student journey trackers, wanted **before** the video module.

### Two commitments made in the call that need attention

- **"In the next 15 days we'll be ready and tested with ARS and the mock test?"
  -- "Definitely."** That is roughly 2026-10-01, and it covers the question
  bank, the test engine and the whole of ARS, none of which is built. The Client
  was also told the project is "still on track" with only a slight VdoCipher
  delay. Nothing has been sent in writing that revises the date, and this file
  has recorded since 2026-09-14 that the original six weeks would not hold.
  **Either what "ready" means on 1 October is cut down, or the date is reset in
  writing.** Clause 4.4 requires the notice at the time, not at the end.
- **A build-now, invoice-later arrangement for extra work.** The Client asked
  not to price every small item, and Two19 agreed to invoice additional work
  with the final payment. Clause 12.2 and 12.3 say the opposite in terms: each
  request is quoted, approved in writing, and **nothing is built first and
  invoiced afterwards.** Both sides want the friction gone, which is fine, but
  clause 16.1 makes it a written amendment. Until that exists, "whatever the
  additional work and pricing might be" is an open-ended promise with no number
  attached.

### Still unresolved after the meeting

- **The MESA benchmark contradicts the agreed question types.** The founder
  calls the MESA MAT process the benchmark and describes logical reasoning, an
  aptitude test, email writing and a video essay as **four components of one
  test**, with an application at the end. Annexure A fixes the question types to
  four automatically scored ones, with no written or uploaded answer inside an
  attempt. The choice recorded on 2026-09-15 -- restructure into separate rounds,
  or quote for extending the engine -- was never put to him and is still open.
- **Where the Aptitude Prep bundles sit.** "These are all a part of ARS", then
  "got a little confused, but everything is clarified", and the matter was left.
  They read as course bundles of videos, PDFs and tests rather than ARS rounds.

### The report template, supplied 2026-09-18

The Client supplied a completed sample report, and the owner confirmed it is the
shape to build. **The file is not in this repository and must not be**: it names
a real student and carries her board marks, her venture, and candid assessments
of her communication. Clause 13.3 and the rule at the head of this file both bar
it. It sits outside git, and no migration, seed or pull request reproduces any
of its content.

What its structure settles, which prose had left open:

- **The component table is weighted**, and the overall score is **computed** from
  the parts, not typed. The sample's five components reconcile exactly to its
  printed total, so a mentor editing one score must not be able to leave a stale
  or invented total behind.
- **The sub-metric table differs per component.** One scores each metric and
  comments; one carries narrative and no scores; one scores with a tag and no
  prose. Even the column heading differs across four words. So the heading and
  the column set are template data, not code.
- **Narrative blocks are optional per component** -- strengths, development
  areas, action plan. The sample omits one of each in different components, and
  the founder said so in terms.
- **A component need not be a round.** Four of the sample's five map onto rounds;
  "Profile & Content" does not, because no round exists in which a student
  submits a profile. So a component *may* name a round and is not required to.
  This was the one genuine modelling fork and it is now closed.

**Scope.** Annexure A promises a mentor "writes feedback and marks a submission
as reviewed". A configurable template carrying weighted quantitative scoring is
more than that sentence, and it is the largest single piece of new work the
2026-09-16 meeting produced. It is being built on the owner's instruction of
2026-09-18; **the clause 12 quotation and the clause 16.1 written amendment are
still outstanding and are not settled by having built it.**

### Round deadlines: accept late, stamp it, show it

Decided 2026-09-18, after a review found that `opens_at` and `due_at` were read
by nothing at all -- no policy, no trigger, no function -- so a student could
submit a month after a deadline and the database would accept it silently.

A late submission is **accepted and stamped**, never refused. Refusing means a
student whose upload finishes a minute past midnight is locked out of their own
process and telephones Cospire; accepting silently means the deadline is a
label. The stamp is computed from the **server clock** against the round's own
`due_at`, which is operating manual rule 1 applied to a deadline rather than a
timer. Whether lateness costs anything stays a human judgement, as it is off the
platform.

`submitted_late` is null while a draft, and null when the round carries no
deadline -- which is deliberately not the same as "on time" and must not be
flattened into false.

### Owed by Two19 from the call

1. A document listing everything needed from the Client, including content and
   any app subscriptions.
2. Go through the MESA ARS app properly; the founder asked twice.
3. Review the three further public mock sites he was adding.

## The Masters' Union ARS process, read 2026-09-18

The Client sent the two public links behind their live MU ARS process, and the
owner asked that it be rebuilt here end to end and then made replicable. It is
the first real specification this project has had for ARS, and reading it
settled several open questions and opened one gap.

**The process is three rounds:** an application, an aptitude test, and
interviews plus group discussions. The third is off the platform, which is what
`submission_mode = 'offline'` already exists for.

**The aptitude round is a mock**, and its specification maps onto the planned
schema without change: three sections (QA, LR, DI), 45 questions, two hours
overall, **no sectional time limits**, sections switchable at will, **no negative
marking**, solutions shown afterwards. It cannot be delivered here yet: the
question bank is built (unmerged, 2026-09-21), but the mock builder and the test
engine are not. For a demonstration it can be an
off-platform round linking to the Client's existing test, labelled honestly.

**Components are not rounds, and their own data proves it.** The MU process has
three rounds; the sample report has five components. The application round feeds
*Profile & Content* and *Video Essay*; the single interview-and-GD round feeds
two separate components. The decision of 2026-09-18 to let a component name a
round without requiring one was therefore right.

**The application form broke the old `config` shape, which is the useful
finding.** It has four steps with per-step drafts and a progress reading,
sections inside each step, eight field types, a 200-word essay with a live
count, fields pre-filled from the account, and fields that appear in answer to
another field. `config` had carried a flat `{ fields: [...] }`, which cannot
express any of that. `src/features/ars/form-schema.ts` replaces it, and the
Client's real application is transcribed into the test suite so that any change
breaking it fails loudly.

**Conditional fields are deliberately not in the first version.** The MU form
hides the expected-passing-year fields unless the twelfth results are not out.
Version one shows every field instead. The form stays usable and the gap is
recorded rather than pretended away.

**Two things to put to the Client.** Their application has **no file upload at
all**, though the founder said resumes, tenth marksheets and certificates would
be needed -- so either the form predates that or uploads belong elsewhere. And
step two of the application, "Aptitude Test Details", collects *self-reported
scores from other exams* and is **not** the aptitude test round; two different
things with nearly the same name.

## How content is organised and granted: answered by the Client, 2026-09-06

The open question from 2026-09-03 is **answered**. Nothing built is wasted, and
no contract variation is needed.

### What Cospire said

Content is organised as **programmes**, one per target institution per content
type. The names came through a voice transcript and are **not yet confirmed in
writing**, but the shape is: *Masters' Union - aptitude prep*, *Masters' Union -
ARS*, *Ashoka - aptitude prep*, *Ashoka - ARS*, and others. The exact list is
still owed by the Client.

1. **A programme is a `courses` row, created by the admin.** Not a fixed list in
   code. The Client explicitly asked for the freedom to add programmes himself
   rather than being locked to a list we ship. `courses` is already a table, so
   this costs nothing beyond the admin screen in Phase 2.
2. **Access is granted per programme, with individual grants as the override.**
   "Mostly grouped, but with the ability to give access individually", in his
   words. Both mechanisms, not one.
3. **A student prepping for several institutions holds several programme
   grants.** That is the intended model, not an edge case.
4. **ARS rounds differ per institution, and the admin creates them per
   institution.** Confirmed 2026-09-06. This is the answer that has schema
   consequences; see below.

### Why this needs no variation

The distinction that matters: he described groups **of content**, not groups
**of students**. Content grouping is already in the schema as `courses`. Student
grouping - batches, cohorts - appears nowhere in the agreement or the schema and
would be a clause 3.9 variation. **If batches are ever raised, they must be
raised as a variation rather than absorbed.**

The scale problem that prompted the question also dissolves. Granting is not a
hundred students against forty documents; it is two or three programme grants
per student.

### What this obliges, and when

`courses` and `ars_rounds` now exist (Phase 5a steps 1 and 2). `curriculum_items`
does not, and waits for Phase 2.

| Obligation | Build it in |
|---|---|
| **`courses` must exist.** Nothing about programmes can be built until the table does | **Phase 5a, first step.** Pulled forward from Phase 2 on 2026-09-08, because ARS cannot carry a programme link to a table that does not exist. The table plus admin create and grant only — not `curriculum_items`, not the builder |
| **`ars_rounds` carries a programme link from birth.** Without it every student sees every institution's rounds | **Phase 5a, in the migration that creates the table** |
| **Course grants must cascade to curriculum content.** `private.student_has_document_grant` checks only `resource_type = 'document'`, so a programme grant opens no videos or documents. Cascading needs `curriculum_items` to know what a programme contains | **Phase 2, with the curriculum builder.** Not before: there is nothing to join to. ARS does not wait on this — a round belongs to a programme directly, so `private.student_has_course_grant()` reaches it without any curriculum |

**`content_access.resource_type` does not need widening.** It accepts `course`,
`video`, `document`, `mock` and cannot name an ARS round. Once rounds belong to a
programme, granting the programme reaches them, so the constraint stays as it is.

### Still owed by the Client

- The written list of programmes, with the names as students should see them.
- What "ARS" actually stands for. The agreement uses the term throughout and
  **never expands it**; it is Cospire's own vocabulary and will appear as a label
  in the interface, so it should be their words.

### The agreement's own words, for the next reader

The model above is consistent with all three places the agreement addresses it:
*"Content access and mentor assignment are granted manually per student"*;
*"Student, limited to content granted to them"*; and in the exclusions,
*"Automated purchase to access logic. Access is granted manually by an admin."*
Programme-level granting is still an admin granting, by hand, per student. It is
a shortcut through the admin console, not automated enrolment.

## Sequencing change, 2026-09-08

**The Client asked for ARS to be built first**, ahead of video and the test
engine. Scope is untouched; only the order moves.

**Only the next phase is committed.** ARS becomes **Phase 5a** and is next.
**Weeks 4 to 6 are deliberately left un-planned** until VdoCipher's arrival date
is known, because that date decides whether video slots alongside the question
bank or displaces something. Migration and handover stay last as Phase 5b.

Checked against the agreement before recording:

- **Not a change request.** Clause 12 covers functionality not described in the
  agreement; every module here is in Annexure A. Nothing to quote.
- **No payment consequence.** Clause 7 is 20% on signing and 80% on completion
  and acceptance, and clause 5 acceptance runs against clause 2, clause 3 and
  Annexure A — not the week table. Payment is not milestone-linked.
- **It does amend clause 4.3**, which names week 3 as video plus the first
  demonstration and week 6 as ARS. This needs agreeing **in writing**.
- **One delivery-plan promise moves.** Demo one was committed to showing *"a
  copied video link failing in a second browser."* That moves to demo two and
  must be said explicitly rather than dropped quietly.

**Why it is defensible on its own merits.** Phase 2 is blocked on VdoCipher and
nothing in it can start; ARS is blocked on a plan upgrade, which is a card
payment. The reorder swaps a blocked slot for an unblocked one and empties ARS
out of the final week this plan already calls overloaded.

**The honest counter, to be said in the same conversation:** video is the bigger
and more third-party-dependent module. If it simply lands in the last week
instead, the overload moves rather than clears. Video belongs in its own worktree
starting the day VdoCipher access arrives. If that has not happened by the start
of week four, video slips and **clause 4.4 applies** — the delivery date extends
day for day, notified in writing at the time.

**Client communications on this are the owner's**, decided 2026-09-08: the
resequence, the VdoCipher condition, the demo-one change and the Supabase Pro
timing all go to Cospire from the owner rather than being raised from here.

### What ARS needs before it can start

- **`courses` must exist first.** The decision of 2026-09-06 requires `ars_rounds`
  to carry its programme link in the migration that creates it. This is a small
  pull-forward from Phase 2: the `courses` table plus admin create and grant, not
  `curriculum_items` and not the builder. `content_access.resource_type` already
  accepts `'course'`, so no constraint change is needed.
- **Supabase Pro, now rather than before Phase 5.** 1GB of Free-plan Storage will
  not hold video essays, and `[storage] file_size_limit` is 50MiB. Clause 8.3
  already budgets it, so this is a timing note, not a new cost.
- **Not VdoCipher.** ARS video is a student upload reviewed by a mentor, not
  protected course content, so it goes to Supabase Storage behind a signed URL.
  That is precisely what makes this phase startable while Phase 2 is not.
