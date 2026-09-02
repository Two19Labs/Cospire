import type { Metadata } from "next";

import { UsersScreen } from "@/features/admin/components/users-screen";
import {
  parsePageNumber,
  parseUserListError,
} from "@/features/admin/list-params";
import {
  getMentorByStudent,
  listMentors,
} from "@/features/admin/queries/list-mentors";
import { listUsers } from "@/features/admin/queries/list-users";
import { requireRole } from "@/features/auth/guards";

export const metadata: Metadata = { title: "Users" };

function firstValue(raw: string | string[] | undefined): string | undefined {
  return typeof raw === "string" ? raw : undefined;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");
  const params = await searchParams;

  const search = firstValue(params.q) ?? "";
  const page = parsePageNumber(firstValue(params.page));
  const error = parseUserListError(firstValue(params.error));

  const users = await listUsers({ page, search });
  const studentIds = users.rows
    .filter((row) => row.role === "student")
    .map((row) => row.id);

  // Only the students actually on this page are looked up, so the cost of the
  // screen does not grow with the size of the organisation.
  const [mentors, mentorByStudent] = await Promise.all([
    listMentors(),
    getMentorByStudent(studentIds),
  ]);

  return (
    <UsersScreen
      error={error}
      mentorByStudent={mentorByStudent}
      mentors={mentors}
      profile={profile}
      search={search}
      users={users}
    />
  );
}
