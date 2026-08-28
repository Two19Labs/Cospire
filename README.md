# Cospire LMS V1

Custom learning and assessment platform for Cospire.

## Local setup

1. Install Node.js 24 and Docker Desktop.
2. Run `npm ci`.
3. Copy `.env.example` to `.env.local` and fill in the client-owned service values.
4. Run `npm run db:start` for a local Supabase stack.
5. Run `npm run db:reset` to apply migrations locally.
6. Run `npm run dev`.

Read `CONTEXT.md` and `CLAUDE.md` before making changes.

The ordered hosted-project handoff is in
[`docs/supabase-phase-0-runbook.md`](docs/supabase-phase-0-runbook.md). The
database migration is the source of truth; do not make ad hoc schema changes in
the Supabase Table Editor.

## Verification

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

With Docker Desktop running, also use `npm run db:reset`, `npm run db:lint`, and
`npm run db:test`. Generate `src/shared/db/types.ts` from the database with
`npm run db:types:local` locally or `npm run db:types` after linking the hosted
project. That generated file must never be hand-edited.
