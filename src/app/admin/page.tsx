import type { Metadata } from "next";

import { AdminHome } from "@/features/admin/components/admin-home";
import { requireRole } from "@/features/auth/guards";

export const metadata: Metadata = { title: "Administration" };

export default async function AdminPage() {
  const profile = await requireRole("admin");
  return <AdminHome profile={profile} />;
}
