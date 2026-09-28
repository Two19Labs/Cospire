# Handoffs

One file per branch, named for it: `docs/handoff/feat-test-engine.md`. One file
per branch so two agents stopping at once cannot overwrite each other, and
committed so it survives the worktree being removed — which has happened here
mid-flight.

**Delete the handoff in the pull request that finishes the work.** A stale
handoff is worse than none: the next agent reads it as current and continues work
that is already done.

The rule that produces one — check at checkpoints, stop below 7%, commit and push
before writing — is in `AGENTS.md`.

## The test

Not *"did I describe what I did"*. It is:

> **Could a fresh agent, with no memory of this session, continue without asking
> a single question?**

If not, the handoff is not finished and neither are you.

## Template

Copy this, fill every heading, delete nothing. A heading with nothing under it is
information too — it says the question was asked.

```markdown
# Handoff: <branch>

**Written** <date, timezone> because <which window> fell to <N>% remaining,
below the 7% threshold. It resets at <time>.

**Branch** `<branch>`, at commit `<sha>`, pushed.
**Worktree** `<path>`, port <n>.

## The task, and why it exists

One paragraph. What was being built and what it is for — not a restatement of
the ticket, but why anyone wants it.

## Done and verified

Each with the command that settles it and its **real** result. Never "should
work". Never a check you did not run.

- <what> — `<command>` — <actual result>

## Done and NOT verified

Say it plainly. This is the section that gets rounded up when someone is tired,
and it is the one that matters most.

- <what> — not verified because <why>

## Half-done, and exactly where the seam is

Which file, which function, what state it is in, what breaks if it ships as-is.

## The next concrete step

Not "continue the work". The actual next command or the actual next edit.

## Decisions already made — do not relitigate

Each with its reason. This is what stops the next agent redoing an argument that
was already settled, and what stops them quietly reversing it.

## Traps already hit

Everything that cost time here, so it costs nobody else time. Include the ones
that made you look foolish; those are the expensive ones.

## What I could not do, and why

Blocked, out of scope, needed a human, needed a credential. Be specific.
```

## Rules

- **Never record an assumption as a fact**, or "should work" as "works". A
  handoff is read by someone with no way to check your optimism.
- **Never put a secret, credential, token or client data in one.** These are
  committed, and the Client has read access to this repository.
- **Keep it true about what is unfinished.** An unfinished task recorded honestly
  is useful. An unfinished task recorded as complete is worse than no record.
