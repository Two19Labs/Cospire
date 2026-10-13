# Branch notes

One file per open branch: `docs/context/branches/<branch>.md`, with `/`
written as `-` (`feat/video` becomes `feat-video.md`).

**Why:** every branch used to write its running notes into `CONTEXT.md`, so
every rebase in October hit a conflict there. A file of its own cannot collide.

**How:**

- When a branch starts, it adds its one-line row under **Active work** in
  `CONTEXT.md` and creates its notes file here.
- While it works, its decisions, discoveries, open questions and verification
  go in the notes file. `CONTEXT.md` changes only for what becomes true for the
  whole project: a decision, a blocker, a migration applied.
- **Before its pull request merges, the branch folds its notes in and deletes
  the file:** the write-up goes to `docs/context/completed.md`, check results
  to `docs/context/verification-log.md`, and its row comes out of Active work.

`scripts/check-context.mjs` refuses a notes file whose branch is not under
Active work, so a forgotten file is caught by the next pull request.
