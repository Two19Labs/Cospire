import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/shared/ui";

import { proctorEventLabels, type ProctorEventType } from "../proctor";
import type { MockAttemptRow } from "../queries/mock-attempts";

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

function describeEvents(events: MockAttemptRow["events"]): string {
  const parts = (Object.entries(events) as [ProctorEventType, number][]).map(
    ([type, count]) => `${proctorEventLabels[type]} ×${count}`,
  );
  return parts.length ? parts.join(", ") : "None";
}

// Who has sat this mock. Unproctored phone attempts are marked on every row,
// as clause 3.5 requires them to be surfaced to admins.
export function MockAttemptsPanel({ attempts }: { attempts: MockAttemptRow[] }) {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>Attempts</h2>
          <p className="muted">
            {attempts.length === 0 ? "Nobody has sat this mock yet." : `${attempts.length} attempt${attempts.length === 1 ? "" : "s"}, newest first.`}
          </p>
        </div>
      </div>
      {attempts.length === 0 ? null : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Student</TableHeaderCell>
              <TableHeaderCell>Started</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Score</TableHeaderCell>
              <TableHeaderCell>Proctoring</TableHeaderCell>
              <TableHeaderCell>Logged events</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {attempts.map((attempt) => (
              <TableRow key={attempt.id}>
                <TableCell>{attempt.studentName}</TableCell>
                <TableCell>{dateFormat.format(new Date(attempt.startedAt))}</TableCell>
                <TableCell>
                  {attempt.status === "in_progress" ? "In progress" : attempt.submittedBy === "timer" ? "Submitted when time ran out" : "Submitted"}
                </TableCell>
                <TableCell>{attempt.score ?? "—"}</TableCell>
                <TableCell>
                  <span className={`pill pill--${attempt.proctored ? "active" : "disabled"}`}>
                    {attempt.proctored ? "Proctored" : "Unproctored (phone)"}
                  </span>
                </TableCell>
                <TableCell>{attempt.proctored ? describeEvents(attempt.events) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
