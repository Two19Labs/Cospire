// Pure request-parameter handling for the admin's view of every ARS submission.
//
// Kept out of `queries/` for the reason `list-params.ts` gives: those modules
// are `server-only` and so unreachable from a unit test.

export const arsSubmissionsPageSize = 25;

export const arsSubmissionStatuses = ["submitted", "reviewed", "draft"] as const;
export type ArsSubmissionStatus = (typeof arsSubmissionStatuses)[number];

export const arsStatusLabels: Record<ArsSubmissionStatus, string> = {
  draft: "Draft",
  reviewed: "Reviewed",
  submitted: "Waiting for review",
};

export interface ArsSubmissionFilters {
  page: number;
  processId: number | null;
  roundId: number | null;
  status: ArsSubmissionStatus | null;
}

function positiveId(raw: string | undefined): number | null {
  if (!raw || !/^[1-9][0-9]{0,15}$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function first(raw: string | string[] | undefined): string | undefined {
  return typeof raw === "string" ? raw : undefined;
}

// Anything unrecognised reads as "no filter", never as an error: a stale
// bookmark should still open the list.
export function parseArsSubmissionFilters(
  params: Record<string, string | string[] | undefined>,
): ArsSubmissionFilters {
  const status = first(params.status);
  const page = Number.parseInt(first(params.page) ?? "1", 10);
  return {
    page: Number.isSafeInteger(page) && page > 1 ? page : 1,
    processId: positiveId(first(params.process)),
    roundId: positiveId(first(params.round)),
    status: (arsSubmissionStatuses as readonly string[]).includes(status ?? "")
      ? (status as ArsSubmissionStatus)
      : null,
  };
}

// Every link back to the list is rebuilt from parsed values only.
export function buildArsSubmissionsHref(filters: Partial<ArsSubmissionFilters>): string {
  const params = new URLSearchParams();
  if (filters.processId) params.set("process", String(filters.processId));
  if (filters.roundId) params.set("round", String(filters.roundId));
  if (filters.status) params.set("status", filters.status);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `/admin/ars-submissions?${query}` : "/admin/ars-submissions";
}
