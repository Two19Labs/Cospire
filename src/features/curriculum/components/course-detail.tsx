import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import {
  courseListErrors,
  courseNotices,
  type CourseListError,
  type CourseNotice,
} from "../list-params";
import { CourseAccessPanel, CourseMoveForm } from "./course-access-panel";
import type { Course } from "../queries/get-course";
import type { CourseAccessStudent } from "../queries/list-course-access";

interface CourseDetailProps {
  course: Course;
  error: CourseListError | null;
  notice: CourseNotice | null;
  profile: Profile;
  students: CourseAccessStudent[];
}

export function CourseDetail({
  course,
  error,
  notice,
  profile,
  students,
}: CourseDetailProps) {

  return (
    <RoleShell profile={profile} title={course.title}>
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>{course.title}</h2>
            {/*
              `sortOrder` is deliberately not shown. Every programme is 0 until
              the reorder control exists, and a number the reader cannot change
              and did not choose only invites the question of what it means.
            */}
            <p className="muted">Created {course.createdAt.slice(0, 10)}</p>
          </div>
          <Link className="button button--secondary" href="/admin/courses">
            Back to programmes
          </Link>
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {courseListErrors[error]}
          </p>
        ) : null}

        {notice ? <p className="muted">{courseNotices[notice]}</p> : null}

        <CourseMoveForm courseId={course.id} kind="programme" />
      </section>

      <CourseAccessPanel courseId={course.id} kind="programme" students={students} />

      <section className="panel">
        <div>
          <h2>Curriculum</h2>
          <p className="muted">
            Nothing yet. Curriculum items — videos, documents and topic tests in
            a chosen order — arrive with the curriculum builder in the video
            phase. Until then a programme grant is the unit of access, and the
            ARS rounds are managed separately from the ARS section in the sidebar.
          </p>
        </div>
      </section>
    </RoleShell>
  );
}
