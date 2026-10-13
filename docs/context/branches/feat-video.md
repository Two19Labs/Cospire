# feat/video

VdoCipher video for Phase 2: playback first, then upload from the platform,
then `item_progress` for video. Worktree `C:\Cospire\Cospire-video`, port 3010,
branched from `main` at `c266168`.

## Facts from the owner, 2026-10-13

- The VdoCipher 30-day trial account is in the Client's (Cospire's) name, so
  clause 3.8 is satisfied and real videos may be used.
- The API secret lives in `.env.local` as `VDOCIPHER_API_SECRET`, filled by the
  owner. Server-only: never `NEXT_PUBLIC_`, never in a client component, never
  in a response or a log. Agents check its presence only, never its value.

## Decisions

## Traps

## Verification

Nothing verified yet.
