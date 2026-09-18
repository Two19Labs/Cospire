// Pure request-parameter handling for the ARS report lists.
//
// Kept out of `queries/` for the same reason the ARS rounds feature keeps its
// own: those modules are `server-only`, which Next.js resolves through a bundler
// alias rather than a real package, so anything importing them is unreachable
// from a unit test. The parsing below is the part worth testing, so it lives
// where a test can reach it.

// Both lists are bounded from the first commit, per operating manual §8. The
// mentor queue reads every completed process a mentor can see and then fans that
// id list into four follow-up queries, so an unbounded page is not one slow
// screen -- it is four `IN` lists whose length nobody chose.
export const mentorReportsPageSize = 20;
export const studentReportsPageSize = 20;

// A page number arrives from the query string, so it is anything at all until
// proven otherwise. Anything that is not a positive whole number is page one
// rather than an error: a mistyped URL should show the first page, not a stack
// trace.
export function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^[0-9]{1,6}$/.test(value)) return 1;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

// Destinations are rebuilt from parsed values only, never from a supplied
// string. Same open-redirect reasoning as `buildRoundsHref` and the admin
// console's `buildUsersHref`.
export function buildReportsHref({ base, page }: { base: "/mentor" | "/student"; page: number }): string {
  const safePage = Number.isSafeInteger(page) && page > 1 ? page : 1;
  return safePage === 1 ? base : `${base}?page=${safePage}`;
}

// --------------------------------------------------------------------------
// Report-template authoring
// --------------------------------------------------------------------------

// Closed sets. Nothing the admin typed is ever put into a URL and rendered --
// the same rule the rounds panel and the admin console follow, and the reason a
// crafted `?error=` payload reaches only Next's JSON-escaped router state.
export type TemplateError =
  | "component-invalid"
  | "delete-failed"
  | "invalid-request"
  | "name-invalid"
  | "not-found"
  | "save-failed"
  | "weightage-invalid"
  | "weightage-over-100";

export type TemplateNotice =
  | "component-added"
  | "component-removed"
  | "created"
  | "saved"
  | "weightages-saved";

export const templateErrorKey = "templateError";
export const templateNoticeKey = "templateNotice";

export function buildTemplatesHref({
  error,
  notice,
  page,
}: {
  error?: TemplateError;
  notice?: TemplateNotice;
  page?: number;
}): string {
  const params = new URLSearchParams();
  if (page && page > 1) params.set("page", String(page));
  if (error) params.set(templateErrorKey, error);
  if (notice) params.set(templateNoticeKey, notice);
  const query = params.toString();
  return query ? `/admin/report-templates?${query}` : "/admin/report-templates";
}

// Rebuilt from parsed values only. A hidden field holding the destination would
// be an open redirect wearing a convenience costume.
export function buildTemplateHref({
  error,
  notice,
  templateId,
}: {
  error?: TemplateError;
  notice?: TemplateNotice;
  templateId: number;
}): string {
  const params = new URLSearchParams();
  if (error) params.set(templateErrorKey, error);
  if (notice) params.set(templateNoticeKey, notice);
  const query = params.toString();
  const base = `/admin/report-templates/${templateId}`;
  return query ? `${base}?${query}` : base;
}

export const templateErrorMessages: Record<TemplateError, string> = {
  "component-invalid": "Check the component's title, weightage and labels.",
  "delete-failed": "That could not be removed. It may already be in use by a report.",
  "invalid-request": "That request could not be read.",
  "name-invalid": `Give the template a name of at most 120 characters.`,
  "not-found": "That template no longer exists.",
  "save-failed": "That could not be saved.",
  "weightage-invalid": "A weightage is a percentage above 0 and at most 100.",
  "weightage-over-100": "Those weightages would total more than 100. Lower another component first.",
};

export const templateNoticeMessages: Record<TemplateNotice, string> = {
  "component-added": "Component added.",
  "component-removed": "Component removed.",
  created: "Template created.",
  saved: "Saved.",
  "weightages-saved": "Weightages updated.",
};

export function parseTemplateError(raw: string | string[] | undefined): TemplateError | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value in templateErrorMessages ? (value as TemplateError) : null;
}

export function parseTemplateNotice(raw: string | string[] | undefined): TemplateNotice | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value in templateNoticeMessages ? (value as TemplateNotice) : null;
}

export const templatesPageSize = 20;
