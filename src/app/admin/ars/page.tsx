import type { Metadata } from "next";

import { AdminProcesses } from "@/features/ars/components/admin-processes";
import { listAdminProcesses } from "@/features/ars/queries/list-processes";
import { requireRole } from "@/features/auth/guards";

export const metadata: Metadata = { title: "ARS" };

export default async function AdminArsPage() {
  const profile = await requireRole("admin");
  return <AdminProcesses profile={profile} processes={await listAdminProcesses()} />;
}
