// Pure request-parameter handling for the programme list.
//
// Kept out of the `queries/` modules deliberately, for the same reason
// `src/features/documents/list-params.ts` is: those modules are `server-only`,
// which Next.js resolves through a bundler alias rather than a real package, so
// anything importing them is unreachable from a unit test. The filter-injection
// guard below is exactly the kind of code that must stay directly testable.

// Paginated from the first commit, per operating manual §8. A hundred
// registered users will not produce a thousand programmes, but the screen that
// loads everything is the one nobody revisits until it is slow.
export const coursesPageSize = 25;

// PostgREST reads `or=(...)` as a comma-separated list of filters, so a comma,
// parenthesis, backslash or double quote inside the term rewrites the filter
// rather than being matched by it. `%` is an ilike wildcard. None of the five
// mean anything inside a programme name, so they are dropped.
//
// `_` is also a wildcard and is deliberately kept: the worst it can do is widen
// the match, which is not a security property.
//
// This mirrors `sanitizeDocumentSearch` rather than importing it. The two are
// the same four lines today, and their natural shared home is `src/shared/`,
// which operating manual §6 puts behind a human promotion.
export function sanitizeCourseSearch(raw: string): string {
  return raw
    .replace(/[,()\\"%]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function parsePageNumber(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : 1;
}

// A programme id arrives from a URL segment or a form field. It is a bigint in
// the database, so anything that is not a positive whole number is refused here
// rather than sent to Postgres to fail as a type error.
export function parseCourseId(raw: string | undefined): number | null {
  if (!raw || !/^[0-9]{1,18}$/.test(raw)) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

// What a `courses` row actually is. The column was added on 2026-09-20 because
// a learning programme and an admission-readiness process had been the same row
// since Phase 5a step 1, so each admin list showed the other's rows.
//
// One vocabulary drives two things -- which rows a screen lists, and which
// screen an action returns to -- so the two cannot drift apart.
export const courseKinds = ["programme", "ars_process"] as const;

export type CourseKind = (typeof courseKinds)[number];

export const courseKindLabels: Record<CourseKind, string> = {
  ars_process: "ARS process",
  programme: "Programme",
};

// Returns null rather than guessing. Callers decide their own default, because
// "the admin posted nothing" and "the admin posted rubbish" are the same thing
// here and both should land on the section the caller came from.
export function parseCourseKind(raw: unknown): CourseKind | null {
  return typeof raw === "string" && (courseKinds as readonly string[]).includes(raw)
    ? (raw as CourseKind)
    : null;
}

// The two admin sections, as literal paths. A closed set mapped to a literal is
// what keeps this from being an open redirect: a form may say WHICH of two
// sections it belongs to, and nothing more.
function sectionRoot(kind: CourseKind): string {
  return kind === "ars_process" ? "/admin/ars" : "/admin/courses";
}

export function buildKindListHref({
  error,
  kind,
  notice,
}: {
  error?: CourseListError;
  kind: CourseKind;
  notice?: CourseNotice;
}): string {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  if (notice) params.set("notice", notice);
  const query = params.toString();
  const root = sectionRoot(kind);
  return query ? `${root}?${query}` : root;
}

export function buildKindCourseHref({
  courseId,
  error,
  kind,
  notice,
}: {
  courseId: number;
  error?: CourseListError;
  kind: CourseKind;
  notice?: CourseNotice;
}): string {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  if (notice) params.set("notice", notice);
  const query = params.toString();
  const base = `${sectionRoot(kind)}/${courseId}`;
  return query ? `${base}?${query}` : base;
}

// Every link and post-action redirect into the programme screens is built here,
// from parsed values only, so no form field can ever influence the destination.
// Same open-redirect reasoning as `buildDocumentsHref` and the admin console's
// `buildUsersHref`: a hidden field holding a return URL is an open redirect
// wearing a convenience costume.
export function buildCoursesHref({
  error,
  notice,
  page,
  search,
}: {
  error?: CourseListError;
  notice?: CourseNotice;
  page: number;
  search: string;
}): string {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (page > 1) params.set("page", String(page));
  if (error) params.set("error", error);
  if (notice) params.set("notice", notice);
  const query = params.toString();
  return query ? `/admin/courses?${query}` : "/admin/courses";
}

export function buildCourseHref({
  courseId,
  error,
  notice,
}: {
  courseId: number;
  error?: CourseListError;
  notice?: CourseNotice;
}): string {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  if (notice) params.set("notice", notice);
  const query = params.toString();
  return query
    ? `/admin/courses/${courseId}?${query}`
    : `/admin/courses/${courseId}`;
}

// A closed set, so a crafted `?error=` value renders nothing at all rather than
// reaching the page. The Phase 1 audit probed exactly this with an onerror
// payload and found no literal tag in the HTML; the property is worth keeping
// rather than re-earning.
export const courseListErrors = {
  "access-change-failed": "That access change was refused. Nothing changed.",
  "move-failed": "That could not be moved to the other section. Nothing changed.",
  "duplicate-title": "A programme with that name already exists.",
  "invalid-request": "That request was not valid. Nothing changed.",
  "sort-order-invalid": "Use a whole number for the ordering.",
  "title-missing": "Give the programme a name.",
  "title-too-long": "Use at most 200 characters for the name.",
  "create-failed": "That programme could not be created. Nothing changed.",
} as const;

export type CourseListError = keyof typeof courseListErrors;

export function parseCourseListError(
  raw: string | undefined,
): CourseListError | null {
  if (raw && Object.hasOwn(courseListErrors, raw)) {
    return raw as CourseListError;
  }
  return null;
}

export const courseNotices = {
  moved: "Moved. You will find it in the other section.",
  created: "Programme created.",
  granted: "Access granted.",
  revoked: "Access removed.",
} as const;

export type CourseNotice = keyof typeof courseNotices;

export function parseCourseNotice(
  raw: string | undefined,
): CourseNotice | null {
  if (raw && Object.hasOwn(courseNotices, raw)) {
    return raw as CourseNotice;
  }
  return null;
}
