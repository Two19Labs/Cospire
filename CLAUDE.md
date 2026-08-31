# Cospire LMS Repository Entry Point

Read `CONTEXT.md` first, in full, and follow the context rule below at the start
and the end of every task.

Then read the full operating manual at `../CLAUDE.md`. The parent manual defines
how this repository is built; the signed agreement in `../Context/` defines what
is delivered. When they conflict, the agreement wins.

## The context rule - non-negotiable, every agent, every session

`CONTEXT.md` is the single source of truth for the state of this project. It is
what lets a new chat, a new agent or a new engineer pick this up without anyone
explaining it to them. Keeping it true is part of the work, not admin bolted on
at the end.

**Before planning or editing anything**

1. Read `CONTEXT.md` in full. Not skimmed, not searched for a keyword.
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
