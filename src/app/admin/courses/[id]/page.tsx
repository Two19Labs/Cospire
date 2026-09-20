import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { CourseDetail } from "@/features/curriculum/components/course-detail";
import {
  parseCourseId,
  parseCourseListError,
  parseCourseNotice,
} from "@/features/curriculum/list-params";
import { getCourse } from "@/features/curriculum/queries/get-course";
import { listCourseAccess } from "@/features/curriculum/queries/list-course-access";

export const metadata: Metadata = { title: "Programme" };

function firstValue(raw: string | string[] | undefined): string | undefined {
  return typeof raw === "string" ? raw : undefined;
}

export default async function AdminCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");
  const { id } = await params;
  const query = await searchParams;

  const courseId = parseCourseId(id);
  if (courseId === null) notFound();

  // A programme this admin may not see comes back as null, and becomes a 404.
  // Not a 403: telling a rival organisation's admin that a programme exists but
  // is not theirs is a disclosure in itself, and there is nothing they could do
  // with the distinction.
  const course = await getCourse(courseId);
  if (!course) notFound();

  const students = await listCourseAccess(courseId);

  return (
    <CourseDetail
      course={course}
      error={parseCourseListError(firstValue(query.error))}
      notice={parseCourseNotice(firstValue(query.notice))}
      profile={profile}
      students={students}
    />
  );
}
