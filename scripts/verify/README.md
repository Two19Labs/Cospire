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
baseline in `CONTEXT.md`.

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
