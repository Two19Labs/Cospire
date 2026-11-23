"use server";

import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { parseInboxFilters, parseReport, parseStatus, buildInboxHref, reportKinds, type ReportState } from "./support";

// Both write through the caller's own session, so RLS on `support_reports` is
// what decides: a student files only their own report, open; only an admin of
// the organisation changes a status. The checks here are for a readable error,
// not for safety.

// A help ticket (Help page) or a reported mistake (the button on every page).
// The reporter and organisation come from the session, never from the form.
export async function fileReportAction(_previous: ReportState, formData: FormData): Promise<ReportState> {
  const profile = await requireRole("student");
  const report = parseReport({ comment: formData.get("comment"), kind: formData.get("kind"), page: formData.get("page") });
  if (typeof report === "string") return { error: report, sent: false };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("support_reports").insert({
    comment: report.comment,
    kind: report.kind,
    org_id: profile.orgId,
    page: report.page,
    reporter_id: profile.id,
  });
  return error ? { error: "That could not be sent. Try again in a moment.", sent: false } : { error: null, sent: true };
}

// Resolve or reopen one report, then back to the same filtered page.
export async function setReportStatusAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const kind = reportKinds.find((entry) => entry === formData.get("view")) ?? "ticket";
  const back = parseInboxFilters(kind, {
    page: String(formData.get("page") ?? ""),
    status: String(formData.get("filter") ?? ""),
  });
  const id = Number(formData.get("id"));
  const status = parseStatus(formData.get("status"));
  if (!Number.isSafeInteger(id) || id < 1 || !status) redirect(buildInboxHref(back, "failed"));

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("support_reports").update({ status }).eq("id", id).select("id");
  redirect(buildInboxHref(back, !error && (data?.length ?? 0) === 1 ? status : "failed"));
}
