import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import {
  courseListErrors,
  courseNotices,
  type CourseListError,
  type CourseNotice,
} from "../list-params";
import { CourseAccessPanel, CourseMoveForm } from "./course-access-panel";
import { CurriculumBuilder } from "./curriculum-builder";
import type { CurriculumMessage } from "../curriculum";
import type { Course } from "../queries/get-course";
import type { CurriculumSection } from "../queries/get-curriculum";
import type { PickerPage } from "../queries/list-picker";
import type { CourseAccessStudent } from "../queries/list-course-access";

interface CourseDetailProps {
  course: Course;
  curriculum: CurriculumSection[];
  curriculumMessage: CurriculumMessage | null;
  documents: PickerPage;
  mocks: PickerPage;
  error: CourseListError | null;
  notice: CourseNotice | null;
  profile: Profile;
  students: CourseAccessStudent[];
}

export function CourseDetail({
  course,
  curriculum,
  curriculumMessage,
  documents,
  mocks,
  error,
  notice,
  profile,
  students,
}: CourseDetailProps) {

  const granted = students.filter((student) => student.granted).length;
  const itemCount = curriculum.reduce((total, section) => total + section.items.length, 0);

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
          <strong>{itemCount}</strong>
          <small>Curriculum items</small>
        </div>
      </div>

      <CourseAccessPanel courseId={course.id} kind="programme" students={students} />

      {course.kind === "programme" ? (
        <CurriculumBuilder
          courseId={course.id}
          documents={documents}
          message={curriculumMessage}
          mocks={mocks}
          sections={curriculum}
        />
      ) : null}

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
