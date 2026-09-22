# Agent Instructions - Cospire LMS

Applies to every agent working in this repository, whichever tool you are.

Before planning, editing, reviewing, or running commands, read these files fully:

1. `CONTEXT.md`
2. `CLAUDE.md`
3. The source documents those files route you to for the task

## The context rule - non-negotiable, every agent, every session

`CONTEXT.md` is the single source of truth for the state of this project. It is
what lets a new chat, a new agent or a new engineer pick this up without anyone
explaining it to them. Keeping it true is part of the work, not admin bolted on
at the end.

**Before planning or editing anything**

1. Read `CONTEXT.md` in full. Not skimmed, not searched for a keyword.
   Then read the file in `docs/context/` for the area your task touches: the
   history lives there, one file per topic, and `CONTEXT.md` lists which is
   which. Reading all of them is not required.
2. Add your entry to **Active work** - branch, scope, the files you will own -
   before your first material change, so a parallel agent can see the collision
   coming.

**While working**

3. Update it the moment something material changes: a decision, a discovery, a
   blocker, a migration, a new dependency, an assumption about an external
   service. Write it when you learn it, not at the end when you have forgotten
   why it mattered.

**Before ending any turn, handing off, or going quiet**

4. Move finished items out of **Active work**.
   Put the detailed write-up of finished work in the right `docs/context/`
   file, and leave `CONTEXT.md` a line or two plus a pointer. It holds what is
   true now, so a new session can read it whole without cost.
5. Record what you verified and how, **including what failed**. Never record an
   assumption as a fact, and never record "should work" as "works".
6. Update **Pending**, the blockers, and **Next recommended action**.
7. **Replace stale statements. Do not append a correction beneath them.** A file
   that contradicts itself is worse than one that is merely out of date, because
   the reader cannot tell which half is true.

**The test that decides whether you are finished**

> A new session that reads only `CONTEXT.md` must be able to continue this work
> without asking a single question.

If that is not true, the file is not finished and neither are you. Check it by
reading your own entry as if you had never seen this project.

**Never** put secrets, credentials, tokens, connection strings, student data or
anyone's personal data in it. Never overwrite another agent's **Active work**
entry without explicit coordination.

This rule is not waived by being in a hurry, by the change being small, or by the
work being unfinished. An unfinished task recorded honestly is useful. An
unfinished task recorded as complete is worse than no record at all.

The signed agreement remains authoritative on scope, and the parent operating
manual remains authoritative on implementation. Where either conflicts with
`CONTEXT.md`, they win and `CONTEXT.md` gets corrected.

## The rule is enforced, not just written

The three statements of the context rule in this repository did not stop
`CONTEXT.md` describing a merged pull request as open for five days, or nine
further statements going stale from that one event. A fourth, sterner paragraph
is the remedy already known to fail, so the rule has a gate instead:

```bash
node scripts/check-context.mjs
```

It runs in CI on every pull request and refuses one that leaves `CONTEXT.md`
contradicting the repository. It checks facts, never wording:

1. A pull request `CONTEXT.md` calls open that GitHub says is merged.
2. A branch claimed under **Active work** that no longer exists on `origin`.
3. Changes under `src/` or `supabase/` with no change to `CONTEXT.md`.
4. A `Last updated` date older than the file's own newest commit.

Run it before you push. It needs no dependencies and takes a second.

Check 3 has an escape hatch for the genuine case, as a commit trailer, so the
reason travels with the history rather than living in a pull request comment
that handover will not carry:

```
Context-Exempt: <why this change needs no context update>
```

Reaching for that trailer to avoid writing three sentences is how the file goes
stale again. It is there for the change that truly records nothing.

## Every new screen ships with its skeleton

A new `page.tsx` under `src/app/admin`, `src/app/mentor` or `src/app/student`
gets its own `loading.tsx` in the same folder, **in the same change**. Shape it
like the screen it stands in for: `ShellSkeleton` from
`src/features/auth/components/shell-skeleton.tsx`, with the screen's own title
when the title is fixed, no title when it is the record's name (the title bar
then shimmers), and panels matching the screen's layout.

Never let a new screen fall back to its parent's skeleton. That was the defect
the Client saw in the 2026-09-21 demo: a click into a detail screen showed the
list's skeleton under the list's title, so it looked as though the click had not
landed. Forms submit through `SubmitButton` from `src/shared/ui/submit-button.tsx`
with a `pendingLabel`, so a submit never looks ignored either.

`src/features/auth/loading-coverage.test.ts` fails the build when a role page has
no `loading.tsx` of its own. Do not add an exemption to it; add the skeleton.
