# Documents end-to-end verification

Proves the Phase 1 exit gate against a running application and the hosted
database: *an admin creates a student, grants them a document, that student
reads it, and another student is correctly refused.*

It exists because a green build is not evidence. Phase 0 shipped a passing build
whose login page was entirely broken, and this slice shipped a grant action that
typecheck, lint, 58 unit tests and a production build all accepted while it
silently wrote nothing to the database.

There is no browser automation here, so the method is: create throwaway accounts
with the Auth Admin API, capture real session cookies through `@supabase/ssr` so
they are byte-identical to what the application itself writes, drive the running
app over HTTP, and then check the database for ground truth rather than trusting
a success redirect.

## Running it

Three steps, in order. `state.json` goes under `coverage/`, which is gitignored,
because it holds live session cookies and a password. **Never move it into a
tracked directory.**

```bash
# 1. Throwaway accounts and real session cookies
node --env-file=.env.local scripts/verify/setup.mjs coverage/verify/state.json

# 2. The checks. Third argument is the base URL under test.
ACTION_TICKET=<id> ACTION_RECORD=<id> \
  node --env-file=.env.local scripts/verify/verify.mjs \
    coverage/verify/state.json https://cospire-roan.vercel.app

# 3. Always. Removes documents, objects, grants and accounts, then prints the
#    live counts so they can be compared with the baseline.
node --env-file=.env.local scripts/verify/teardown.mjs coverage/verify/state.json
```

Teardown deletes **only rows belonging to the accounts named in `state.json`**:
grants where the run's accounts are the granter or the grantee, and documents the
run's admin uploaded. It refuses to run at all if `state.json` names no accounts.

That scoping is not decoration. Until 2026-09-08 the script deleted every
`resource_type = 'document'` grant and every row in `documents`, along with their
Storage objects. That was indistinguishable from correct while the baseline held
none of either, and became a data-loss bug the moment the owner uploaded real
content on 2026-09-03. Do not "simplify" it back.

Teardown order is forced by the schema: `content_access.granted_by` and
`documents.uploaded_by` both reference `profiles` with ON DELETE RESTRICT, so
grants and documents must go before the accounts that created them.

## The two action ids

The upload path is the only part that cannot be driven as a plain form, because
a file cannot be posted without either JavaScript or routing the bytes through
the app server, which operating manual §8 forbids. So those two Server Actions
are invoked over the `Next-Action` protocol, and that needs their ids.

**Ids change on every recompile.** Read them from the built bundle rather than
reusing them:

```bash
grep -roh 'createServerReference)("[a-f0-9]*"' \
  .next/static/chunks/app/admin/documents | sed 's/.*("//;s/"//' | sort -u
```

That yields two. Probe each with a ticket-shaped argument; the one returning a
`token` is `ACTION_TICKET` and the other is `ACTION_RECORD`.

Against a deployed URL, fetch `/admin/documents` with an admin cookie, take the
chunk URLs out of the HTML, download them and grep the same pattern.

Form-posted actions — granting and revoking — need no id passed in: the script
reads them out of the rendered HTML. It scopes that search to the form carrying
`documentId`, because the first action id on the page belongs to the Sign out
form in the header, and posting grant fields at the logout action produces a
convincing false failure.

## The baseline

Take the live counts before starting and compare after teardown. As of
2026-09-08 the baseline is 2 orgs, 5 profiles, 5 auth users, 1 mentor
assignment, **2 grants, 2 documents, 2 storage objects**.

Nothing in that baseline is a leftover, and none of it may be deleted:

- The second organisation (`id = 5`) is the isolated audit org that no
  application route can remove. `setup.mjs` uses it as the rival org.
- The fourth Cospire profile is a real student account created by the owner on
  2026-09-01, along with its mentor assignment.
- The two documents are the owner's **real PDFs**, uploaded through the console
  on 2026-09-03, and the two grants point students at them. These are client
  content on a Free-plan project with no backups.

## What it cannot prove

That PDF.js paints the page and the watermark is legible. The script proves the
bytes arrive and that the watermark is in the server-rendered markup. A human
still has to open one document in a real browser.

`sample.pdf` is a hand-built two-page PDF with real text on both pages, so that
check is a glance rather than an inspection. `make_pdf.py` regenerates it.

## ars-import.mjs — the process importer

```bash
node --env-file=.env.local scripts/verify/ars-import.mjs http://127.0.0.1:3001
```

Self-contained: it creates its own throwaway admin, student and programme, and
deletes them in a `finally` block scoped to what it created. It needs a running
app and prints the live counts afterwards so they can be compared with the
baseline in `docs/context/verification-log.md`.

Two things it knows that the older scripts here do not, both of which cost an
hour to rediscover:

- **A Server Action posted without an `Origin` header is refused** by Next.js,
  and answers `500 Failed to find Server Action. This request might be from an
  older or newer deployment` — which reads like a build mismatch and is not one.
  A browser always sends the header. The older scripts do not set it and should
  when they are next touched.
- **A form rendered by `useActionState` carries no `$ACTION_ID_` field.** It
  carries `$ACTION_REF_n`, an `$ACTION_n:0` / `$ACTION_n:1` bound pair and an
  `$ACTION_KEY`. This script replays whichever hidden fields the server
  rendered, rather than recognising one shape, which is also the honest test of
  whether the form works with scripting switched off.

Its assertions deliberately avoid the words `Application` and
`Why this programme?`, which appear in the copyable prompt's own example on the
same page: asserting on either passes against a page that parsed nothing at all.
That false pass was found in this script's first draft.

## shot.mjs — rendering signed-in screens to PNG

```bash
node --env-file=.env.local scripts/verify/shot.mjs http://127.0.0.1:3001 coverage/shots
```

A look cannot be asserted, so this photographs it. It signs in the way the other
scripts here do, saves the served HTML with a `<base>` tag pointing back at the
running app, and hands the file to the Chrome already installed on the machine.
Stylesheets and the self-hosted font load from the app itself, so the capture is
what the app served. It creates its own admin, student, programme and rounds and
deletes them afterwards.

Three things it knows, each of which cost time:

- **Every `<script>` is stripped from the saved HTML.** React cannot hydrate from
  a `file://` origin — the RSC payload fetches against the wrong origin and the
  client error boundary replaces the whole page — and `--disable-javascript` is
  a no-op in Chrome's new headless. Without the scripts the server HTML renders,
  which is the honest thing to photograph here anyway: every screen works with
  scripting off.
- **A fresh `--user-data-dir` per run.** Chrome caches `file://` pages inside a
  profile, and reusing one silently re-photographs the previous run — which
  looks exactly like a change that did not take effect.
- **Chrome resolves `--screenshot` against its own working directory**, so the
  path must be absolute. It exits 0 when it cannot write, so the script checks
  the file exists rather than trusting the exit code.

**Chrome on Windows will not make a window narrower than about 500px.** Asking
for 430 renders at ~500 and crops, which reads as a layout overflowing when it
is not. Capture phone widths at 520 and above.

## ars-gate.mjs — the Phase 5a exit gate

```bash
node --env-file=.env.local scripts/verify/ars-gate.mjs https://cospire-roan.vercel.app
```

The gate sentence driven end to end in one sequence, rather than inferred from
parts. It creates five throwaway accounts — an admin, an assigned mentor, an
unassigned one, and two students who **both hold the programme** — and deletes
everything it made.

Two things it knows:

- **A file round cannot be handed in through the form alone.** `saveAnswers`
  skips file fields, because a plain post carries no bytes, so a required upload
  reads as missing until the upload action has attached it to a draft — and that
  action, not the form, creates the draft. The harness does what the browser
  does. Get this wrong and every later round stalls behind the sequence trigger.
- **Delete every `mentor_assignments` row before deleting any account.**
  `assigned_by` is ON DELETE RESTRICT, so removing the admin while its own
  assignment still references it fails — and `deleteUser` reports that in a
  return value, not by throwing. It leaked one profile per run until the live
  counts in the cleanup line gave it away.

## programmes-ars-split.mjs — the two admin sections are really separate

```bash
node --env-file=.env.local scripts/verify/programmes-ars-split.mjs https://cospire-roan.vercel.app
```

The risk in `courses.kind` was never the column. It is that both sections share
one table, one create action and one granting action, so a mistake sends an
admin to the wrong section — or leaves a section unable to create or grant
anything at all, which an earlier attempt did.

So it checks that each section creates its own kind and returns to itself, that
neither list shows the other's rows, that **both** can grant a student, that a
row can be moved between them and back, and that a student granted through ARS
really reaches the process and its round.

The last one is deliberate: an earlier version of that check passed against a
process with **no rounds**, where there was nothing to see either way. A check
that cannot fail is worse than no check.

## docx-import.mjs — the Word upload

```bash
node --env-file=.env.local scripts/verify/docx-import.mjs http://127.0.0.1:3030
```

Drives the sentence the feature exists for: an admin opens a `.docx`, its
pictures land in `question-images`, the text comes back with `[[figure:N]]`
where each one sat, and after the model's JSON is pasted back each marker
resolves to the right picture on the approved question.

It builds its own `.docx` with `zipSync` rather than carrying a binary fixture,
so the document under test is readable in a diff. That document is deliberately
awkward in the ways a real paper is: two PNGs, an EMF drawing, a native Word
chart, a data table, and a paragraph left in with track changes on.

**The one thing it does not drive.** Extraction runs in the browser, because no
file may pass through the application server (operating manual §8) and a Vercel
function's request body is capped far below a question paper. There is no
browser automation here, so the script does what the browser does: it imports
the **real** `readDocx` and uploads each picture under a real admin session,
byte-identically. Everything after that — the paste, the marker resolution,
staging, the review screen and approval — is driven over HTTP against the
running build. So the React click handler joining the two halves is the part no
check covers, and that is stated rather than implied.

To import the feature's TypeScript from a plain `.mjs`, it registers a six-line
`module.registerHooks` resolver that adds the `.ts` the application's imports
leave off; Node strips the types itself. That is there so the harness runs the
same code the product runs — a harness that reimplements what it checks proves
only that the copy agrees with itself.

Two things it knows:

- **A repeated form field must replace every hidden copy of itself.** The figure
  map is one `figures` input per figure, so `postForm` treats an overridden name
  as replacing all of them rather than appending to them. Get that wrong and the
  crafted-post check silently passes because the honest fields are still there.
- **The crafted post stages a real batch.** Proving that a hostile figure path
  attaches nothing means letting the post through and counting images on the
  rows it wrote, so the script deletes that batch before staging the honest one.

### The baseline this run measured, 2026-09-23

After cleanup: **0 questions, 0 question keys, 0 staged imports, 0 objects under
`org/1/questions`, 5 profiles, 2 documents** — and **1 question section** (id 39,
"QA", created 2026-09-21) and **8 courses**, neither of which this run created
and neither of which it may delete.

## gemini-import.mjs — the model path

```bash
# the round trip, billed to the Client's Google account
node --env-file=.env.local scripts/verify/gemini-import.mjs

# and, given a running build, that the key is in nothing the browser is served
node --env-file=.env.local scripts/verify/gemini-import.mjs http://127.0.0.1:3030
```

Builds a small Word paper, extracts it with the **real** `readDocx`, sends the
text and its picture to Gemini with the **real** `readQuestionsWithGemini`, and
reads the answer back through the **real** `parseImportedQuestions`. It writes
nothing to the database: the call and the parse are the whole subject.

It reports three verdicts, not two. `UNVERIFIED` is used where a check could not
be completed, and it is not rounded up to a pass.

**The picture is one pixel, deliberately.** What this proves is that a picture
travels and that its marker comes back on the right question. How well Gemini
reads a real chart is Google's problem, and measuring it needs one of Cospire's
own papers — the pulled-forward accuracy item in `CONTEXT.md`.

Two things it knows:

- **`503 UNAVAILABLE` is a normal answer, not a rare one.** Every model on this
  account returned it for the whole of the 2026-09-23 build session. So the
  script treats a failed call as a check of its own — that the admin is given a
  sentence they can act on — and marks the round trip `UNVERIFIED` rather than
  failing the run.
- **The resolve hook handles `@/` as well as extensionless imports.** Without the
  alias, `import-spec.ts` fails to load and the failure reads like a missing npm
  package rather than a path alias.
