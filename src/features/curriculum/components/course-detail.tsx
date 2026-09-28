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

  const granted = students.filter((student) => student.granted).length;

  return (
    <RoleShell
      // `sortOrder` is deliberately not shown. Every programme is 0 until the
      // reorder control exists, and a number the reader cannot change and did
      // not choose only invites the question of what it means.
      back={{ href: "/admin/courses", label: "Back to programmes" }}
      description={`Programme · Created ${course.createdAt.slice(0, 10)}`}
      profile={profile}
      title={course.title}
    >
      {error ? (
        <p className="notice notice--error" role="alert">
          {courseListErrors[error]}
        </p>
      ) : null}

      {notice ? <p className="notice notice--success">{courseNotices[notice]}</p> : null}

      <div className="mini-stats">
        <div>
          <strong>{students.length}</strong>
          <small>Students in organisation</small>
        </div>
        <div>
          <strong>{granted}</strong>
          <small>Students with access</small>
        </div>
        <div>
          <strong>Upcoming</strong>
          <small>Curriculum builder</small>
        </div>
      </div>

      <CourseAccessPanel courseId={course.id} kind="programme" students={students} />

      <section className="panel">
        <div className="panel__header">
          <h2>Curriculum</h2>
        </div>
        <p className="notice">
          Nothing yet. Curriculum items — videos, documents and topic tests in a
          chosen order — arrive with the curriculum builder in the video phase.
          Until then a programme grant is the unit of access, and the ARS rounds
          are managed separately from the ARS section in the sidebar.
        </p>
      </section>

      <section className="panel" id="settings">
        <div className="panel__header">
          <div>
            <h2>Classification</h2>
            <p className="muted">
              If this belongs with admission readiness rather than teaching
              content, move it to ARS.
            </p>
          </div>
        </div>
        <CourseMoveForm courseId={course.id} kind="programme" />
      </section>
    </RoleShell>
  );
}
