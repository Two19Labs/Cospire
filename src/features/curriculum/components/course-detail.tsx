import Link from "next/link";

import { RoundsPanel } from "@/features/ars/components/rounds-panel";
import type { RoundError, RoundNotice } from "@/features/ars/list-params";
import type { RoundListRow } from "@/features/ars/queries/list-rounds";
import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/shared/ui";

import { setCourseAccessAction } from "../actions/set-course-access";
import {
  courseListErrors,
  courseNotices,
  type CourseListError,
  type CourseNotice,
} from "../list-params";
import type { Course } from "../queries/get-course";
import type { CourseAccessStudent } from "../queries/list-course-access";

interface CourseDetailProps {
  course: Course;
  error: CourseListError | null;
  notice: CourseNotice | null;
  profile: Profile;
  // ARS keeps its own error and notice vocabulary, under its own query-string
  // keys, so this page can host the rounds panel without either feature owning
  // the other's words.
  roundError: RoundError | null;
  roundNotice: RoundNotice | null;
  rounds: RoundListRow[];
  students: CourseAccessStudent[];
}

export function CourseDetail({
  course,
  error,
  notice,
  profile,
  roundError,
  roundNotice,
  rounds,
  students,
}: CourseDetailProps) {
  const grantedCount = students.filter((student) => student.granted).length;

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
      </section>

      <section className="panel">
        <div>
          <h2>Who is on this programme</h2>
          <p className="muted">
            {students.length === 0
              ? "There are no active students to put on this yet."
              : `${grantedCount} of ${students.length} students are on it.`}
          </p>
        </div>

        {students.length === 0 ? null : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Student</TableHeaderCell>
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>Access</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {students.map((student) => (
                <TableRow key={student.id}>
                  <TableCell>{student.name}</TableCell>
                  <TableCell>{student.email}</TableCell>
                  <TableCell>
                    <div className="row-form">
                      <span
                        className={`pill pill--${
                          student.granted ? "active" : "disabled"
                        }`}
                      >
                        {student.granted ? "On programme" : "Not on it"}
                      </span>
                      {/*
                        The Server Action is passed straight to the form, so
                        granting works with JavaScript disabled. The programme
                        id travels as a value and the action rebuilds the
                        destination from a literal path, which is what stops
                        this being an open redirect.
                      */}
                      <form action={setCourseAccessAction}>
                        <input name="courseId" type="hidden" value={course.id} />
                        <input
                          name="studentId"
                          type="hidden"
                          value={student.id}
                        />
                        <input
                          name="intent"
                          type="hidden"
                          value={student.granted ? "revoke" : "grant"}
                        />
                        <button
                          className={`button button--compact button--${
                            student.granted ? "danger" : "secondary"
                          }`}
                          type="submit"
                        >
                          {student.granted ? "Remove" : "Add"}
                        </button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <RoundsPanel
        courseId={course.id}
        error={roundError}
        notice={roundNotice}
        rounds={rounds}
      />

      <section className="panel">
        <div>
          <h2>Curriculum</h2>
          <p className="muted">
            Nothing yet. Curriculum items — videos, documents and topic tests in
            a chosen order — arrive with the curriculum builder in the video
            phase. Until then a programme grant is the unit of access, and the
            ARS rounds above attach to it directly.
          </p>
        </div>
      </section>
    </RoleShell>
  );
}
