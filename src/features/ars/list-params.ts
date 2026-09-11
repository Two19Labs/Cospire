// Pure request-parameter handling for ARS rounds.
//
// Kept out of the `queries/` modules deliberately, for the same reason the
// documents and curriculum features keep theirs out: those modules are
// `server-only`, which Next.js resolves through a bundler alias rather than a
// real package, so anything importing them is unreachable from a unit test.
//
// The rounds panel renders inside the programme detail page, which belongs to
// the curriculum feature. Rather than teach that feature the ARS vocabulary,
// ARS keeps its own closed sets and its own query-string keys -- `roundError`
// and `roundNotice` -- so the two cannot collide and neither owns the other's
// words.

export const roundErrorKey = "roundError";
export const roundNoticeKey = "roundNotice";

// A round id arrives from a form field. It is a bigint in the database, so
// anything that is not a positive whole number is refused here rather than sent
// to Postgres to fail as a type error.
export function parseRoundId(raw: string | undefined): number | null {
  if (!raw || !/^[0-9]{1,18}$/.test(raw)) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

// Every post-action destination is rebuilt here from parsed values only, so no
// form field can influence where the browser lands. Same open-redirect
// reasoning as `buildCourseHref` and the admin console's `buildUsersHref`: a
// hidden field holding a return URL is an open redirect wearing a convenience
// costume.
export function buildRoundsHref({
  courseId,
  error,
  notice,
}: {
  courseId: number;
  error?: RoundError;
  notice?: RoundNotice;
}): string {
  const params = new URLSearchParams();
  if (error) params.set(roundErrorKey, error);
  if (notice) params.set(roundNoticeKey, notice);
  const query = params.toString();
  return query
    ? `/admin/courses/${courseId}?${query}#rounds`
    : `/admin/courses/${courseId}#rounds`;
}

// A closed set, so a crafted value renders nothing at all rather than reaching
// the page.
export const roundErrors = {
  "create-failed": "That round could not be created. Nothing changed.",
  "delete-failed": "That round could not be removed. Nothing changed.",
  "duplicate-name": "This programme already has a round with that name.",
  "has-submissions":
    "Students have already answered this round, so it cannot be removed.",
  "fields-invalid":
    "Add at least one question, one per line, each different and under 200 characters.",
  "invalid-request": "That request was not valid. Nothing changed.",
  "mode-invalid": "Choose what the student submits.",
  "name-invalid": "Give the round a name, at most 200 characters.",
  "prompt-invalid":
    "Tell the student what to do, in at most 4000 characters.",
} as const;

export type RoundError = keyof typeof roundErrors;

export function parseRoundError(raw: string | undefined): RoundError | null {
  if (raw && Object.hasOwn(roundErrors, raw)) return raw as RoundError;
  return null;
}

export const roundNotices = {
  created: "Round added.",
  removed: "Round removed.",
} as const;

export type RoundNotice = keyof typeof roundNotices;

export function parseRoundNotice(raw: string | undefined): RoundNotice | null {
  if (raw && Object.hasOwn(roundNotices, raw)) return raw as RoundNotice;
  return null;
}
