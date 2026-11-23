// The one review queue (D65): help tickets and reported mistakes. Pure, so the
// input rules and the inbox's address are unit tested
// (`support.test.ts`); the database repeats every limit as a CHECK.
//
// `support_reports` is not in `src/shared/db/types.ts` until the migration is
// applied and the types regenerated, so its row is typed here.

export const reportKinds = ["ticket", "mistake"] as const;
export type ReportKind = (typeof reportKinds)[number];

export const reportStatuses = ["open", "resolved"] as const;
export type ReportStatus = (typeof reportStatuses)[number];

export const kindLabels: Record<ReportKind, string> = { mistake: "Mistake", ticket: "Help ticket" };
export const statusLabels: Record<ReportStatus, string> = { open: "Open", resolved: "Resolved" };

export const maxComment = 2000;
const maxPage = 500;

export interface SupportReportRow {
  comment: string;
  created_at: string;
  id: number;
  kind: ReportKind;
  org_id: number;
  page: string;
  reporter_id: string;
  resolved_at: string | null;
  resolved_by: string | null;
  status: ReportStatus;
  updated_at: string;
}

export interface NewReport {
  comment: string;
  kind: ReportKind;
  page: string;
}

// What the form shows after a send. Here rather than in `actions.ts`, which is
// "use server" and may export only async functions.
export interface ReportState {
  error: string | null;
  sent: boolean;
}
export const initialReportState: ReportState = { error: null, sent: false };

// A path and query on this site, nothing else: a full URL is cut to its path,
// and anything unreadable becomes "unknown" rather than refusing the report.
export function normalisePage(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "unknown";
  let page = raw.trim();
  try {
    const url = new URL(page, "http://x");
    page = `${url.pathname}${url.search}`;
  } catch {
    return "unknown";
  }
  return page.startsWith("/") ? page.slice(0, maxPage) : "unknown";
}

export function parseReport(input: { comment: unknown; kind: unknown; page: unknown }): NewReport | string {
  const kind = reportKinds.find((entry) => entry === input.kind);
  if (!kind) return "That could not be read. Reload the page and try again.";
  const comment = typeof input.comment === "string" ? input.comment.trim() : "";
  if (!comment) return kind === "ticket" ? "Describe the problem first." : "Say what is wrong first.";
  if (comment.length > maxComment) return `Keep it under ${maxComment.toLocaleString("en-IN")} characters.`;
  return { comment, kind, page: normalisePage(input.page) };
}

export function parseStatus(value: unknown): ReportStatus | null {
  return reportStatuses.find((status) => status === value) ?? null;
}

// The inbox: a kind (the view), a status filter (open by default, it is a
// queue) and a page number.
export const inboxPageSize = 25;

export interface InboxFilters {
  kind: ReportKind;
  page: number;
  status: ReportStatus | null;
}

function first(raw: string | string[] | undefined): string | undefined {
  return typeof raw === "string" ? raw : undefined;
}

export function parseInboxFilters(kind: ReportKind, params: Record<string, string | string[] | undefined>): InboxFilters {
  const status = first(params.status);
  const page = Number.parseInt(first(params.page) ?? "1", 10);
  return {
    kind,
    page: Number.isSafeInteger(page) && page > 1 ? page : 1,
    status: status === "all" ? null : (parseStatus(status) ?? "open"),
  };
}

// Every link back to the inbox is rebuilt from parsed values only.
export function buildInboxHref(filters: InboxFilters, notice?: string): string {
  const params = new URLSearchParams({ view: filters.kind, status: filters.status ?? "all" });
  if (filters.page > 1) params.set("page", String(filters.page));
  if (notice) params.set("notice", notice);
  return `/admin/support?${params.toString()}`;
}
