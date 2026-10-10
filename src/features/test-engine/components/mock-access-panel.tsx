import { SubmitButton, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/shared/ui";

import { PersonCell } from "@/features/auth/components/person-cell";

import { setMockAccessAction } from "../actions/set-mock-access";
import type { MockAccessStudent } from "../queries/list-mock-access";

const notices: Record<string, { text: string; tone: "success" | "error" }> = {
  failed: { text: "That change did not go through. The list below shows who has access now.", tone: "error" },
  granted: { text: "Student added. They can now start this mock.", tone: "success" },
  revoked: { text: "Student removed.", tone: "success" },
};

// Who may sit this mock. Without a grant a student cannot see the mock at all,
// and cannot start an attempt: both are refused in the database.
export function MockAccessPanel({ access, mockId, students }: { access?: string; mockId: number; students: MockAccessStudent[] }) {
  const granted = students.filter((student) => student.granted).length;
  const notice = access ? notices[access] : undefined;

  return (
    <section className="panel" id="students">
      <div className="panel__header">
        <div>
          <h2>Students</h2>
          <p className="muted">
            {students.length === 0
              ? "No students in this organisation yet."
              : `${granted} of ${students.length} student${students.length === 1 ? " has" : "s have"} access to this mock.`}
          </p>
        </div>
      </div>
      {notice ? <p className={`notice notice--${notice.tone}`}>{notice.text}</p> : null}

      {students.length === 0 ? (
        <p className="panel-empty">Students appear here once their accounts exist.</p>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Student</TableHeaderCell>
              <TableHeaderCell>Access</TableHeaderCell>
              <TableHeaderCell>
                <span className="visually-hidden">Action</span>
              </TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {students.map((student) => (
              <TableRow key={student.id}>
                <TableCell>
                  <PersonCell email={student.email} name={student.name} />
                </TableCell>
                <TableCell>
                  <span className={`pill pill--${student.granted ? "active" : "disabled"}`}>
                    {student.granted ? "Has access" : "No access"}
                  </span>
                </TableCell>
                <TableCell className="table__actions">
                  <form action={setMockAccessAction}>
                    <input name="mockId" type="hidden" value={mockId} />
                    <input name="studentId" type="hidden" value={student.id} />
                    <input name="intent" type="hidden" value={student.granted ? "revoke" : "grant"} />
                    <SubmitButton
                      className={student.granted ? "button--ghost" : undefined}
                      compact
                      pendingLabel={student.granted ? "Removing…" : "Adding…"}
                      variant={student.granted ? "secondary" : "primary"}
                    >
                      {student.granted ? "Remove access" : "Grant access"}
                    </SubmitButton>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
