import type { Metadata } from "next";

import { UsersScreen } from "@/features/admin/components/users-screen";
import { parsePageNumber } from "@/features/admin/list-params";
import { listUsers } from "@/features/admin/queries/list-users";
import { requireRole } from "@/features/auth/guards";

export const metadata: Metadata = { title: "Users" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");
  const params = await searchParams;

  const rawSearch = params.q;
  const search = typeof rawSearch === "string" ? rawSearch : "";
  const rawPage = params.page;
  const page = parsePageNumber(typeof rawPage === "string" ? rawPage : undefined);

  const users = await listUsers({ page, search });

  return <UsersScreen profile={profile} search={search} users={users} />;
}
