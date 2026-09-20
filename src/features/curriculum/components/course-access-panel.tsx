import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/shared/ui";

import { setCourseAccessAction } from "../actions/set-course-access";
import { setCourseKindAction } from "../actions/set-course-kind";
import { courseKindLabels, type CourseKind } from "../list-params";
import type { CourseAccessStudent } from "../queries/list-course-access";

// Who is on this programme or process, and the control that puts them there.
//
// Extracted from the programme detail screen on 2026-09-20 so the ARS section
// can grant too. Before that, granting existed on exactly one screen, and the
// first attempt at making Programmes a placeholder deleted the only route to
// it -- which would have left no way to give a student an ARS process at all.
//
// `kind` travels with every post so the action returns to the section the admin
// is actually looking at. It is a closed set mapped to a literal path, never a
// URL taken from a field.

interface CourseAccessPanelProps {
  courseId: number;
  kind: CourseKind;
  students: CourseAccessStudent[];
}

export function CourseAccessPanel({ courseId, kind, students }: CourseAccessPanelProps) {
  const granted = students.filter((student) => student.granted).length;
  const noun = kind === "ars_process" ? "process" : "programme";

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>Students</h2>
          <p className="muted">
            {students.length === 0
              ? "No students in this organisation yet."
              : `${granted} of ${students.length} student${students.length === 1 ? " is" : "s are"} on this ${noun}.`}
          </p>
        </div>
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
                    <span className={`pill pill--${student.granted ? "active" : "disabled"}`}>
                      {student.granted ? `On ${noun}` : "Not on it"}
                    </span>
                    {/*
                      The Server Action is passed straight to the form, so
                      granting works with JavaScript disabled.
                    */}
                    <form action={setCourseAccessAction}>
                      <input name="courseId" type="hidden" value={courseId} />
                      <input name="kind" type="hidden" value={kind} />
                      <input name="studentId" type="hidden" value={student.id} />
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
  );
}

// The way out of a wrong classification.
//
// `courses.kind` was backfilled by one rule -- a course with ARS rounds is a
// process -- and a rule that good can still be wrong about a particular row.
// Without this the classification would be permanent.
export function CourseMoveForm({ courseId, kind }: { courseId: number; kind: CourseKind }) {
  const target: CourseKind = kind === "ars_process" ? "programme" : "ars_process";

  return (
    <form action={setCourseKindAction} className="row-form">
      <input name="courseId" type="hidden" value={courseId} />
      <input name="kind" type="hidden" value={kind} />
      <input name="target" type="hidden" value={target} />
      <span className="muted">
        Filed as a <strong>{courseKindLabels[kind]}</strong>.
      </span>
      <button className="button button--compact button--secondary" type="submit">
        Move to {courseKindLabels[target]}s
      </button>
    </form>
  );
}
