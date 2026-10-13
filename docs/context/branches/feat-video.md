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

## Migration `20261013120000_videos.sql` (file only, NOT applied)

`videos` (RLS enabled and forced, select/insert/update/delete policies; admins
manage, students read through `private.student_has_video_grant` = a direct
`video` grant OR `student_has_programme_item('video', id)`); a delete trigger
removing a video's grants and curriculum items; `video` branches added to
`private.validate_curriculum_item` and `private.validate_content_access_resource`;
`private.student_may_record_progress` admits `video` items. Additive only.
The owner applies it with `npm run db:migrate` after review, then
`npm run db:types`.

`npx supabase db push --dry-run` cannot run in this worktree: it is not linked
(`LegacyProjectNotLinkedError`; `supabase/.temp` lives only in the main
checkout). Instead, read-only MCP `list_migrations` on 2026-10-13 showed the
hosted history ends at `20261008130000` and `list_tables` shows no `videos`
table, so this file is the only pending migration.

## Decisions

- `status` uses our own spelling of VdoCipher's three states: `pre_upload`
  ("Pre-Upload"), `processing` ("Queued" and anything not ready), `ready`.
- `vdocipher_id` is checked as 32 lowercase hex characters.
- Students are not filtered on `status`: a granted video that is still
  processing shows a "still processing" message rather than vanishing.

- The OTP request (`src/features/video/vdocipher.ts`): `POST
  https://dev.vdocipher.com/api/videos/{id}/otp`, `Authorization: Apisecret …`,
  `ttl` 300 s, `annotate` a JSON **string** holding one moving `rtext` watermark
  whose text is `composeWatermark` from the documents feature (name · email ·
  IST time), so video and document watermarks read the same.
- The access check is `getVideoPlayback`: the `videos` row is read as the
  signed-in user (RLS), and only a returned, `ready` row leads to an OTP.

- Admin: `/admin/videos` (paginated list, add by VdoCipher id with title
  optional, "Refresh status" for a video not yet ready) and
  `/admin/videos/[id]` (a preview through the same access check and OTP).
  "Videos" sits under Management in the admin nav.
- Curriculum: `video` is a buildable item type with its own paginated picker
  (`?videosPage=`); a student opens it at
  `/student/programmes/[id]/items/[itemId]`, which renders the VdoCipher v2
  iframe (`player.vdocipher.com/v2/?otp=…&playbackInfo=…`).
- Upload from the platform (`/admin/videos`, "Upload a video"):
  `startVideoUploadAction` gets credentials from VdoCipher (`PUT /api/videos?
  title=`), writes the row as `pre_upload`, and returns VdoCipher's signed
  storage policy; the browser posts the file straight to `uploadLink`
  (policy fields, `success_action_status=201`, file last) and expects 201.
  The admin then presses "Refresh status" until VdoCipher reports ready. No
  webhook: a button is enough at this scale. Needs JavaScript, like the
  document upload. No progress bar (fetch has none); add XHR progress if
  admins ask.
- Direct `video` grants are accepted by the database but there is no screen to
  make one: students reach videos through programmes, as decided in N11.

## Traps

- **Apply the migration before merging.** The admin programme page now reads
  `videos` for its picker, so deployed code without the table would fail that
  page. Expand first, as always.
- `supabase db push --dry-run` needs the main checkout (this worktree is not
  linked).

## Verification

- 2026-10-13: `npm run typecheck`, `lint`, `test` (617 passed, 6 in
  `src/features/video/video.test.ts`: no OTP fetch when RLS returns no row or
  the video is not ready; OTP request URL, header, ttl and double-encoded
  `annotate`; id format refusal), `npm run build` passed. No
  `VDOCIPHER_API_SECRET` or `dev.vdocipher.com` string in `.next/static`.
- **NOT verified live:** `VDOCIPHER_API_SECRET` is empty in `.env.local` and the
  migration is not applied, so no real OTP, no playback, no watermark on screen,
  and no RLS probe of `videos` has run.
