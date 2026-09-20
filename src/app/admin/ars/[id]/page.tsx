import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RoundsPanel } from "@/features/ars/components/rounds-panel";
import {
  parseRoundError,
  parseRoundNotice,
  roundErrorKey,
  roundNoticeKey,
} from "@/features/ars/list-params";
import { listRounds } from "@/features/ars/queries/list-rounds";
import { RoleShell } from "@/features/auth/components/role-shell";
import { requireRole } from "@/features/auth/guards";
import {
  CourseAccessPanel,
  CourseMoveForm,
} from "@/features/curriculum/components/course-access-panel";
import {
  courseListErrors,
  courseNotices,
  parseCourseId,
  parseCourseListError,
  parseCourseNotice,
} from "@/features/curriculum/list-params";
import { getCourse } from "@/features/curriculum/queries/get-course";
import { listCourseAccess } from "@/features/curriculum/queries/list-course-access";

export const metadata: Metadata = { title: "ARS process" };

function firstValue(raw: string | string[] | undefined): string | undefined {
  return typeof raw === "string" ? raw : undefined;
}

export default async function AdminArsProcessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");

  const courseId = parseCourseId((await params).id);
  if (courseId === null) notFound();

  // A row this admin may not see comes back as null and becomes a 404, for the
  // same reason the programme detail page does it: telling another
  // organisation's admin that something exists but is not theirs is itself a
  // disclosure.
  const [course, rounds, students] = await Promise.all([
    getCourse(courseId),
    listRounds(courseId),
    listCourseAccess(courseId),
  ]);
  if (!course) notFound();

  const query = await searchParams;
  const error = parseCourseListError(firstValue(query.error));
  const notice = parseCourseNotice(firstValue(query.notice));

  return (
    <RoleShell profile={profile} title={`${course.title} — ARS`}>
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>{course.title}</h2>
            <p className="muted">
              An admission readiness process. Its rounds are below, and the
              students working through it are beneath those.
            </p>
          </div>
          <Link className="button button--secondary" href="/admin/ars">
            All ARS processes
          </Link>
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {courseListErrors[error]}
          </p>
        ) : null}
        {notice ? <p className="muted">{courseNotices[notice]}</p> : null}

        <CourseMoveForm courseId={courseId} kind="ars_process" />
      </section>

      <RoundsPanel
        courseId={courseId}
        error={parseRoundError(firstValue(query[roundErrorKey]))}
        notice={parseRoundNotice(firstValue(query[roundNoticeKey]))}
        rounds={rounds}
      />

      {/*
        Granting lives here as well as on the programme screen. Before this the
        only way to put a student on an ARS process was through Programmes,
        which is precisely what made the two sections inseparable.
      */}
      <CourseAccessPanel courseId={courseId} kind="ars_process" students={students} />
    </RoleShell>
  );
}
