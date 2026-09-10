import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  parseRoundError,
  parseRoundNotice,
  roundErrorKey,
  roundNoticeKey,
} from "@/features/ars/list-params";
import { listRounds } from "@/features/ars/queries/list-rounds";
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

  const [students, rounds] = await Promise.all([
    listCourseAccess(courseId),
    listRounds(courseId),
  ]);

  return (
    <CourseDetail
      course={course}
      error={parseCourseListError(firstValue(query.error))}
      notice={parseCourseNotice(firstValue(query.notice))}
      profile={profile}
      roundError={parseRoundError(firstValue(query[roundErrorKey]))}
      roundNotice={parseRoundNotice(firstValue(query[roundNoticeKey]))}
      rounds={rounds}
      students={students}
    />
  );
}
