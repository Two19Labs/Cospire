# feat/ui-refresh-2 — UI refresh slice 2 (part A)

Worktree `C:\Cospire\Cospire-ui`, port 3050. Started 2026-10-16 from
`origin/main` (`4b1fbdc`).

Slice 1 (PR #77) set the rules and the tokens; this slice brings the remaining
student screens onto them. Nothing here is new CSS vocabulary: `globals.css`
already carried `.panel`, `.card-grid`, `.course-card`, `.empty-state` and the
rest, so the work is mostly moving feature components onto classes that exist.

## What this branch changed

| Change | Why |
|---|---|
| `.auth-card` and `.state-card`: `box-shadow` removed | Slice 1 is "no shadows" and `--shadow` is already `none`. These two were the last literal shadows on a student-visible page (login, and the error/not-found card). The headless pass found the second one |
| `.panel > .panel__header:first-of-type:last-child`: no bottom rule, negative bottom margin | A panel that is only a header — the ARS report's title card — drew the header's rule and then an empty white band of panel padding under it |
| `.card-grid--wide` added | `.card-grid--two` uses `auto-fit`, which collapses the empty track, so a student with one programme saw a card stretched across the whole page, reading as a panel rather than a card. `auto-fill` at a 26rem minimum gives two to a desktop row and one on a phone |
| Student **Documents**: the admin table replaced by a `card-grid` of `course-card--link` cards, with a `list-bar` count, a real `empty-state`, and `loading.tsx` reshaped to `SkeletonCards` | A student's library is short by construction and has two facts per row. A card is also one large target on a phone |
| Student **ARS round**: the back link moved into `RoleShell`'s `back` prop; the post-save confirmation is now `notice notice--success` with `role="status"` instead of muted body text | Every other student screen puts its back link in the same place, and a confirmation said in grey body text does not read as a confirmation |

Deliberately left: the `.dialog` and the question-bank pending-overlay shadows.
Both are overlays over a backdrop rather than cards in the page flow.

## Blocked, and why this is part A

Two files slice 2 needs are held by other workers' ShareLane claims and could
not be edited:

- `src/features/curriculum/components/student-programme.tsx` — the programme
  list needs `card-grid--wide` instead of `card-grid--two`. Held by the video
  worker (`src/features/curriculum/**`). **The CSS it needs is already on this
  branch**; the class swap is one word.
- `src/features/test-engine/components/student-mock-screens.tsx` — the mock
  list is still an admin-shaped table and should be a `card-grid`. Held by the
  engine worker (`src/features/test-engine/**`).

They go in a second pull request once those claims release. Nothing on this
branch depends on them.

**Piece 3, a mock opening in its own window, is blocked by the same
`src/features/test-engine/**` claim.** The design is settled and compatible
with PR #80 either way (checked 2026-10-16: #80 `fix/save-completion` is still
**open**, not merged; it makes `FollowRedirect` call
`window.location.assign`, which behaves the same inside a popup):

- **Opening.** The Start form carries no `target` in the HTML. A small client
  component — the same shape as the existing `FullscreenOnSubmit` — calls
  `window.open("", "cospire-exam", …)` on submit and sets `form.target` to that
  name. With JavaScript off the attribute is never set and the attempt opens in
  the same tab, which is the required fallback.
- **Closing.** The submitted result page calls
  `window.opener.location.reload()` and then `window.close()`. The opener is
  same-origin, so no `BroadcastChannel` is needed; where there is no opener
  (same tab, or a phone) both calls are skipped and nothing changes. Phone
  attempts stay `proctored = false` regardless.
- **Proctoring.** Switching back to the dashboard window is an ordinary focus
  loss: warn and log to `proctor_events`, never auto-submit (D-confirmed
  2026-08-28). No change to that code.
- **Still to verify when built:** two CDP targets open on Start, the dashboard
  target reloads on submit, and a short mock's countdown reaching zero — the
  last of these is still unverified from the browser pass and needs a mock
  built through `admin.rpc("save_mock")` with the admin JWT, not the service
  client, which `ui-audit-fixture.mjs` already does.

## Verified, 2026-10-16

Local production build in this worktree on port 3050, against the hosted
database, with the throwaway fixture from `scripts/verify/ui-audit-fixture.mjs`
(setup/teardown; its own accounts and rows only). All 14 student routes loaded
through headless Chrome over CDP (`scripts/verify/ui-audit-browser.mjs`,
before and after), at 1440x900 and 390x844:

- 14/14 routes: 0 console errors, 0 failed requests, 0 accessibility findings
  from the script's checks, 0px horizontal overflow at 390px.
- Documents: the card grid renders three cards across at 1440 and stacked at
  390, with the folder and "Read →" on the card's bottom rule.
- The ARS report's title card no longer draws an empty band.
- The ARS round screen shows the shell back link in the same place as every
  other student screen.
- The built stylesheet contains neither of the removed shadows.
- 611 tests, typecheck, lint and `next build` all pass in this worktree.

**Not verified:** the confirmation *notice* itself (it needs a round actually
submitted in the browser, which the screens pass does not do); the login and
error pages in the browser (the audit only drives signed-in routes — the shadow
removal was confirmed in the built CSS instead).

**Note on `run_check`:** ShareLane's `run_check` runs in the parent workspace
(`npm --prefix Cospire run test`), so it tests the **main checkout**, not this
worktree. Checks for this branch were run with `npm run test` here.
