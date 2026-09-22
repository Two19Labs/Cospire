# Review

How work on this repository gets checked before it merges.

The premise, learned here rather than assumed: **a green build is not evidence.**
Phase 0 shipped a passing build whose login page was entirely broken. The
documents slice shipped a grant action that typecheck, lint, 58 unit tests and a
production build all accepted while it silently wrote nothing to the database.
Both were found by driving the running application and reading the database
afterwards.

So a review that reads the diff and runs the build catches neither of the two
worst defects this project has produced. The checks below are ordered by what has
actually caught things.

---

## 1. The standing invariants

These apply to every branch regardless of what it touches. They are drawn from
the operating manual (`../CLAUDE.md` sections 6, 8, 9 and 11) and are restated
here so a reviewer has one file to work from.

### Access control

- [ ] Every new table holding user data has **RLS enabled in the migration that
      creates it**, never a later one.
- [ ] Policies cover **INSERT and UPDATE as well as SELECT**. A `FOR SELECT`
      policy alone leaves writes unconstrained, and the write half is the half
      that leaks.
- [ ] Every new Storage bucket has its own policies on `storage.objects`.
      **Table RLS does not protect files.** A perfect policy on a table in front
      of an open bucket protects nothing.
- [ ] Policies read the role through a `STABLE SECURITY DEFINER` helper, not a
      direct `profiles` subquery, and use `(SELECT auth.uid())` rather than bare
      `auth.uid()`.
- [ ] Row policies cannot limit *which columns* a role changes. Where that
      matters, a trigger does it, and the trigger is tested.

### Secrets

- [ ] `SUPABASE_SECRET_KEY` and `service_role` appear in no client component, no
      API response, no log line.
- [ ] The **actual key value** appears nowhere in the built `.next` tree, not
      merely no reference to its name.
- [ ] No secret in any committed file. If one is ever committed it is rotated,
      not deleted from history.

### Schema

- [ ] Migrations are **timestamped, append-only, additive**. No edit to a
      committed migration. No drop or rename of anything the deployed code reads.
- [ ] No DDL through the Supabase MCP server. It reads; `npm run db:migrate`
      writes.
- [ ] Every time column is `timestamptz`, never bare `timestamp`.
- [ ] `src/shared/db/types.ts` is generated, never hand-edited.
- [ ] The migration is safe against the **currently deployed** code, because
      Vercel deploys on merge while migrations are applied by hand.

### Code

- [ ] `npm run typecheck`, `npm run lint`, `npm run test` and `npm run build`
      all pass.
- [ ] No `any`, and no `@ts-ignore` without a comment saying why.
- [ ] No `console.log` left behind.
- [ ] Every list query is paginated and indexed.
- [ ] No media through the application server.
- [ ] Server Actions are public endpoints. TypeScript parameter types are erased
      at that boundary, so every argument is validated **at runtime**.
- [ ] `CONTEXT.md` is true after the change: the branch's **Active work** row is
      cleared or current, and **Pending** and **Next recommended action** reflect
      it. The detailed write-up and verification rows are in the right
      `docs/context/` file, not appended to `CONTEXT.md`, and nothing stale was
      left beneath a correction.
- [ ] Every new admin, mentor or student screen has its own `loading.tsx`,
      shaped like that screen, and forms use `SubmitButton` with a pending label.
      `loading-coverage.test.ts` catches a missing file; the reviewer checks
      the shape is the screen's own and not a copy of its parent's.

---

## 2. The traps this project has already hit

Do not rediscover these. Each cost real time, and every one passed a green build.

| Trap | What it looks like | The check |
|---|---|---|
| **The absence of an error is not evidence of an effect** | RLS filters a disallowed write to zero rows and returns no error. PostgREST reports success | **Count rows.** Never accept "no error raised" as proof that a write was refused, or that it landed |
| **A probe that proves nothing** | `INSERT ... SELECT` where the SELECT is itself filtered by RLS inserts nothing, raises nothing, and reads as a pass | Use literal values and count affected rows. Never let RLS on the read side do the work |
| **A CHECK that passes on NULL** | `config -> 'fields'` is SQL NULL when the key is absent, the whole expression evaluates to NULL, and **a CHECK passes when its expression is NULL** | Every CHECK over a nullable expression decides its NULL case on purpose. `... IS TRUE` collapses NULL to false |
| **`upsert` needs UPDATE rights** | It compiles to `INSERT ... ON CONFLICT DO UPDATE`. On a table granted only SELECT, INSERT and DELETE, every write fails with `42501` | A plain insert, treating `23505` as success |
| **Storage deletes cannot be tested in SQL** | `storage.protect_delete()` refuses any SQL delete: "Use the Storage API instead" | Bucket delete and update policies stay **unverified** until an HTTP path exercises them. Say so rather than implying coverage |
| **MCP runs as the wrong role** | Migrations run as `supabase_admin`, a superuser. MCP `execute_sql` runs as `postgres`, which is not a member of `supabase_storage_admin` | Never conclude what a migration may do by testing it through MCP |
| **A bucket with no policy** | `anon` and `authenticated` hold full `arwdDxtm` grants on `storage.objects`. RLS is the only thing standing between those grants and every file | Every bucket gets its policies in the migration that creates it |
| **A safety net that reads one line** | The context gate missed three stale claims because the word making the claim had wrapped onto the next line | Prose here wraps at 80 characters. Any check over this file reads sentences, not lines |
| **Reading the source instead of the served output** | A font that downloaded on every page and rendered nowhere: equal CSS specificity, and Next emits its class first | Read the **served** stylesheet and the **served** HTML, not the source |
| **Running the context gate too early** | It passes before the commit and fails after, because the commit is what makes the header stale | Run `node scripts/check-context.mjs` **after** committing |
| **Building while the server runs** | On Windows, `npm run build` against a live `next start` corrupts `.next/server/middleware.js`. The build reports success and every route then 500s | Stop the server, delete `.next`, rebuild |

---

## 3. Verifying against a running application

There is no browser automation in this repository. The method, which has caught
every real defect so far:

1. Create throwaway accounts with the Auth Admin API.
2. Capture real session cookies through `@supabase/ssr`, so they are
   byte-identical to what the application itself writes.
3. Drive the running app over HTTP, posting every form through the
   **no-JavaScript path**.
4. Read the database for ground truth rather than trusting a success redirect.
5. Tear down, scoped to the run's own rows, then re-measure the live counts.

The harness is in `scripts/verify/`. Its README carries the exact commands.

### The live database holds real client data

**2 orgs, 5 profiles, 1 mentor assignment, 4 courses, 4 content grants,
2 documents, and 0 rows in every ARS table** (re-measured 2026-09-18).

None of it is test residue. Two of the documents are the owner's real PDFs. The
project is on the Free plan with **no backups**, so anything deleted is gone.

- Scope every cleanup to **what your run created**. A teardown scoped by
  "everything currently here" is a bug waiting for someone to add real data, and
  it was exactly that here until 2026-09-08.
- **Re-measure the baseline before trusting it.** A recorded baseline that has
  drifted is worse than none, because it is what makes a destructive operation
  look safe.

---

## 4. The claim list

Every branch ships one, in the pull request body. It replaces prose such as
"tested and working", which a reviewer cannot act on.

A claim is a statement that could be false, plus the command that settles it.

```markdown
## Claims

### C1. A student cannot read another student's submission
- Prove it: sign in as student B, select the row by id, count rows
- Expect:   0 rows, no error
- Actual:   0 rows
- Verdict:  pass

### C2. The bucket refuses a write outside the student's own prefix
- Prove it: as student A, upload to org/1/ars/<student-B-uuid>/x.pdf
- Expect:   refused, and 0 objects created at that path
- Actual:   refused HTTP 400, 0 objects
- Verdict:  pass

### C3. The bucket's delete policy
- Prove it: cannot be proven in SQL, storage.protect_delete() refuses
- Verdict:  UNVERIFIED, and recorded as such
```

Rules for writing one:

- A claim whose proof is "the build passes" is not a claim.
- A claim about a refusal must **count rows**.
- **UNVERIFIED is a legitimate verdict.** Recording it honestly is the point. An
  unfinished check recorded as passing is worse than no check at all.
- Anything the author could not test states *why it is untestable*, rather than
  that it was skipped.

---

## 5. The reviewer's brief

Given to a review agent along with the branch and this file.

> You are reviewing a branch on a client project with a fixed contractual scope
> and real client data in a database that has no backups.
>
> **Distrust, in this order:** the pull request description, the diff, a green
> build, a passing test suite. Every one of these has been green while a real
> defect shipped. Trust only a command you ran and the output it produced.
>
> **Do this:**
> 1. Read sections 1 and 2 of `docs/review-checklist.md` and hold every standing
>    invariant against the diff.
> 2. Run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`.
> 3. For any new table, read the actual policies out of the live database and
>    confirm INSERT and UPDATE are covered, not only SELECT.
> 4. For any new bucket, read the policies on `storage.objects`.
> 5. Take each claim in the pull request body and attempt to falsify it. Run the
>    stated command yourself. **Count rows.**
> 6. For anything driven over HTTP, read the served output rather than the source.
>
> **Never:** apply a migration, write schema through the MCP server, delete a row
> you did not create, or run a teardown you have not read.
>
> **Report** every claim with a verdict of pass, fail or unverified, and name the
> command that produced it. List what you could not check, and why. Do not
> summarise a failure as a caveat, and never report a check you did not run.
>
> **Escalate rather than decide** anything commercial: whether something is
> Annexure A scope or a clause 12 change request, whether a client promise has
> moved, or whether a deviation from the operating manual is acceptable. Those
> are the owner's calls, and a wrong one is not fixed by a revert.

### What the reviewer cannot do

Stated here so it is never quietly assumed otherwise:

- **It cannot see.** Whether PDF.js paints pixels, whether a watermark survives a
  saved screenshot, whether a screen matches the prototype: these need a person
  with a browser. They are few, and they fall per phase rather than per branch.
- **It shares the author's blind spots.** It is a second pass by the same kind of
  reader, not an independent one. Its value is in running commands and counting
  rows, not in reading more carefully.
- **It does not merge.** On a client repository the merge is the one
  irreversible step, and it stays with a person.
