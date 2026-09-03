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
2026-09-02 the baseline is 2 orgs, 5 profiles, 1 mentor assignment, 0 grants,
0 documents, 0 storage objects.

Two things in that baseline are **not** leftovers and must not be deleted: the
second organisation is the isolated audit org that no application route can
remove, and the fourth Cospire profile is a real student account created by the
owner on 2026-09-01, along with its mentor assignment.

## What it cannot prove

That PDF.js paints the page and the watermark is legible. The script proves the
bytes arrive and that the watermark is in the server-rendered markup. A human
still has to open one document in a real browser.

`sample.pdf` is a hand-built two-page PDF with real text on both pages, so that
check is a glance rather than an inspection. `make_pdf.py` regenerates it.
