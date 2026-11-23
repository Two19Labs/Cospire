import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { inboxPageSize, type InboxFilters, type SupportReportRow } from "./support";

// The admin inbox, read through the admin's own session:
// `support_reports_select_admin` returns every row of their organisation and
// nothing else. Ordered and filtered on `support_reports_inbox_idx`.

export interface InboxRow {
  comment: string;
  createdAt: string;
  id: number;
  page: string;
  reporterEmail: string;
  reporterName: string;
  resolvedAt: string | null;
  status: SupportReportRow["status"];
}

export interface InboxPage {
  page: number;
  pageCount: number;
  rows: InboxRow[];
  total: number;
}

export async function listReports(filters: InboxFilters): Promise<InboxPage> {
  const supabase = await createServerSupabaseClient();
  const from = (filters.page - 1) * inboxPageSize;
  let query = supabase
    .from("support_reports")
    .select("id, page, comment, status, reporter_id, resolved_at, created_at", { count: "exact" })
    .eq("kind", filters.kind)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + inboxPageSize - 1);
  if (filters.status) query = query.eq("status", filters.status);

  const { count, data, error } = await query;
  if (error) throw new Error(`Unable to list reports: ${error.message}`);
  const reports = (data ?? []) as Pick<SupportReportRow, "comment" | "created_at" | "id" | "page" | "reporter_id" | "resolved_at" | "status">[];
  const total = count ?? reports.length;

  // Names for this page only, so the cost does not grow with the organisation.
  const ids = [...new Set(reports.map((row) => row.reporter_id))];
  const people = new Map<string, { email: string; name: string }>();
  if (ids.length) {
    const { data: rows, error: peopleError } = await supabase.from("profiles").select("id, name, email").in("id", ids);
    if (peopleError) throw new Error("Unable to name the reporters.");
    for (const row of rows ?? []) people.set(row.id as string, { email: row.email as string, name: row.name as string });
  }

  return {
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / inboxPageSize)),
    rows: reports.map((row) => ({
      comment: row.comment,
      createdAt: row.created_at,
      id: row.id,
      page: row.page,
      reporterEmail: people.get(row.reporter_id)?.email ?? "",
      reporterName: people.get(row.reporter_id)?.name ?? "Student",
      resolvedAt: row.resolved_at,
      status: row.status,
    })),
    total,
  };
}
