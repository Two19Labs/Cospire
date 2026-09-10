import type { Metadata } from "next";

import { requireRole } from "@/features/auth/guards";
import { CoursesScreen } from "@/features/curriculum/components/courses-screen";
import {
  parseCourseListError,
  parseCourseNotice,
  parsePageNumber,
} from "@/features/curriculum/list-params";
import { listCourses } from "@/features/curriculum/queries/list-courses";

export const metadata: Metadata = { title: "Programmes" };

function firstValue(raw: string | string[] | undefined): string | undefined {
  return typeof raw === "string" ? raw : undefined;
}

export default async function AdminCoursesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");
  const params = await searchParams;

  const search = firstValue(params.q) ?? "";
  const page = parsePageNumber(firstValue(params.page));
  const error = parseCourseListError(firstValue(params.error));
  const notice = parseCourseNotice(firstValue(params.notice));

  const courses = await listCourses({ page, search });

  return (
    <CoursesScreen
      courses={courses}
      error={error}
      notice={notice}
      profile={profile}
      search={search}
    />
  );
}
