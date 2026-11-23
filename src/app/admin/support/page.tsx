import type { Metadata } from "next";

import { pickView } from "@/features/admin/components/section-views";
import { requireRole } from "@/features/auth/guards";
import { SupportScreen, supportViews } from "@/features/support/components/inbox-screen";
import { listReports } from "@/features/support/queries";
import { parseInboxFilters, type ReportKind } from "@/features/support/support";

export const metadata: Metadata = { title: "Help & reports" };

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");
  const params = await searchParams;
  const view = pickView(params, supportViews, "ticket") as ReportKind | null;
  const filters = view ? parseInboxFilters(view, params) : null;
  const list = filters ? await listReports(filters) : null;
  const notice = typeof params.notice === "string" ? params.notice : undefined;
  return <SupportScreen filters={filters} list={list} notice={notice} profile={profile} />;
}
