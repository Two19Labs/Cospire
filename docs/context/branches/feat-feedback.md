# feat/feedback

Owner's request, 2026-11-11, after the Client call: a place on the portal where
anyone on the Client's side logs a thought (a title, the thought, urgent or
not, screenshots) with **no login**, and a second link where the owner sees
every thought, answers it and sets a status. An email to the owner on each new
thought. One thought, one answer; no threads.

## How it works

- One route, `/feedback/[code]`. The code is compared (constant time) with
  `FEEDBACK_CLIENT_CODE` and `FEEDBACK_OWNER_CODE`; anything else is a 404. A
  code under 24 characters counts as unset, so the page is off until both are
  set. Changing a code kills the old link.
- **The Client's link** shows the form and every thought with its status and
  the owner's answer. **The owner's link** shows every thought with a status
  select and an answer box.
- `feedback_thoughts` and the private `feedback` bucket (images, 5 MB) have
  **no policies**: RLS on and forced, no grants to `anon` or `authenticated`.
  Nobody is signed in, so no policy could say who may read; the server
  (`src/features/feedback/store.ts`, secret-key client) is the only way in, and
  every action checks the code itself.
- Screenshots go browser to storage on a signed upload ticket (no media through
  the app server); they are shown through ten-minute signed URLs.
- At most 20 new thoughts an hour, board-wide. That also bounds the emails,
  which share Resend's daily allowance with student invitations.
- The email goes through Resend's HTTP API with `RESEND_API_KEY` to
  `FEEDBACK_NOTIFY_EMAIL`. Best effort: a thought is saved either way.
- The page sends no referrer and is marked noindex, since the URL is the key.

## Shared code touched (owner asked for a page with no login)

- `src/shared/db/supabase/middleware.ts`: `/feedback` added to `publicPaths`.
- `.env.example`: the three new names.

## Owner's steps before it works on the live URL

1. Apply migration `20261111100000_feedback_thoughts.sql` (`npm run db:migrate`).
2. In Vercel, set `FEEDBACK_CLIENT_CODE`, `FEEDBACK_OWNER_CODE` (two different
   random values, 24+ characters), `FEEDBACK_NOTIFY_EMAIL`, and
   `RESEND_API_KEY` if it is not there already; redeploy.

## Verification, 2026-11-11

- `typecheck`, `lint`, `test` (673, 7 new in `feedback.test.ts`), `build`.
- Local production build (3080), no session, the hosted database, test codes in
  the environment: a wrong code is 404; both real codes pass the gate and then
  answer **500**, because `feedback_thoughts` does not exist until the migration
  is applied; `/admin` still redirects to login.
- **Not verified:** everything past the gate. No thought has been saved, no
  screenshot uploaded or shown, no answer saved, no email sent. The migration
  has not been executed anywhere (no Docker). Nothing seen in a browser.
- Trap: with the shell's drive letter in lower case (`c:\Cospire\...`) every
  vitest file fails to load ("reading 'config'"); run from `C:\`.
