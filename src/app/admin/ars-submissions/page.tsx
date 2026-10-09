import type { Metadata } from "next";

import { parseArsSubmissionFilters } from "@/features/admin/ars-submissions-params";
import { ArsSubmissionsScreen, arsSubmissionsTitle } from "@/features/admin/components/ars-submissions-screen";
import { listArsSubmissions } from "@/features/admin/queries/list-ars-submissions";
import { requireRole } from "@/features/auth/guards";

export const metadata: Metadata = { title: arsSubmissionsTitle };

export default async function AdminArsSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");
  const filters = parseArsSubmissionFilters(await searchParams);
  const list = await listArsSubmissions(filters);
  return <ArsSubmissionsScreen filters={filters} list={list} profile={profile} />;
}
