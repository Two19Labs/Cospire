import type { Metadata } from "next";

import { AdminProcesses } from "@/features/ars/components/admin-processes";
import { listAdminProcesses } from "@/features/ars/queries/list-processes";
import { requireRole } from "@/features/auth/guards";
import { parseCourseListError, parseCourseNotice } from "@/features/curriculum/list-params";

export const metadata: Metadata = { title: "ARS" };

function firstValue(raw: string | string[] | undefined): string | undefined {
  return typeof raw === "string" ? raw : undefined;
}

export default async function AdminArsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");
  const query = await searchParams;

  return (
    <AdminProcesses
      error={parseCourseListError(firstValue(query.error))}
      notice={parseCourseNotice(firstValue(query.notice))}
      processes={await listAdminProcesses()}
      profile={profile}
    />
  );
}
