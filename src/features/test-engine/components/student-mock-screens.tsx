import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { SubmitButton, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/shared/ui";

import { startAttemptAction } from "../actions/attempt-actions";
import type { AttemptSummary, StudentMock } from "../queries/student-mocks";

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

function formatMarks(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, "");
}

function attemptLabel(attempt: AttemptSummary): string {
  if (attempt.status === "in_progress") return "In progress";
  return attempt.score === null ? "Submitted" : `Score ${formatMarks(attempt.score)}`;
}

export function StudentMocksScreen({ mocks, profile }: { mocks: StudentMock[]; profile: Profile }) {
  return (
    <RoleShell profile={profile} title="Mock tests">
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Your mock tests</h2>
            <p className="muted">
              {mocks.length === 0 ? "No mock tests have been shared with you yet." : "Open a mock to read its instructions and start."}
            </p>
          </div>
        </div>
        {mocks.length === 0 ? null : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Mock</TableHeaderCell>
                <TableHeaderCell>Duration</TableHeaderCell>
                <TableHeaderCell>Attempts</TableHeaderCell>
                <TableHeaderCell>Latest</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mocks.map((mock) => (
                <TableRow key={mock.id}>
                  <TableCell>
                    <Link href={`/student/mocks/${mock.id}`}>{mock.title}</Link>
                  </TableCell>
                  <TableCell>{mock.durationMinutes} min</TableCell>
                  <TableCell>
                    {mock.attempts.length} of {mock.maxAttempts}
                  </TableCell>
                  <TableCell>{mock.attempts[0] ? attemptLabel(mock.attempts[0]) : <span className="muted">Not started</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </RoleShell>
  );
}

const startErrors: Record<string, string> = {
  failed: "The test could not be started. Try again.",
  limit: "You have used every attempt this mock allows.",
  phone: "This mock cannot be taken on a phone. Open it on a laptop or desktop.",
};

export function StudentMockScreen({ error, mock, phone, profile }: { error?: string; mock: StudentMock; phone: boolean; profile: Profile }) {
  const open = mock.attempts.find((attempt) => attempt.status === "in_progress");
  const used = mock.attempts.length;
  const sectional = mock.sections.some((section) => section.durationMinutes !== null);
  const blockedPhone = phone && !mock.allowMobile;

  return (
    <RoleShell profile={profile} title={mock.title}>
      {error && startErrors[error] ? <p className="notice notice--error">{startErrors[error]}</p> : null}
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Before you start</h2>
            <p className="muted">
              {mock.durationMinutes} minutes · {used} of {mock.maxAttempts} attempt{mock.maxAttempts === 1 ? "" : "s"} used
            </p>
          </div>
        </div>
        {mock.instructions ? <p style={{ whiteSpace: "pre-wrap" }}>{mock.instructions}</p> : null}
        <ul>
          {sectional ? (
            <li>
              The sections are timed and sat in order:{" "}
              {mock.sections.map((section) => `${section.title} (${section.durationMinutes ?? "untimed"}${section.durationMinutes ? " min" : ""})`).join(", ")}.
              You cannot return to a section once you leave it.
            </li>
          ) : (
            <li>One timer for the whole paper. You can move between questions freely.</li>
          )}
          <li>
            {mock.negativeMarking > 0
              ? `A wrong answer loses ${formatMarks(mock.negativeMarking)} mark${mock.negativeMarking === 1 ? "" : "s"} on ${mock.negativeMarkingTypes.map((type) => (type === "numerical" ? "typed-answer" : type === "mcq_multi" ? "multiple-answer" : "multiple-choice")).join(" and ")} questions. An unanswered question loses nothing.`
              : "There is no negative marking."}
          </li>
          <li>The timer is kept by the server. Closing the page does not stop it.</li>
          {phone ? <li>You are on a phone, so this attempt will be recorded as unproctored.</li> : null}
        </ul>
        <div className="toolbar">
          {open ? (
            <Link className="button button--primary" href={`/student/attempts/${open.id}`}>
              Resume test
            </Link>
          ) : blockedPhone ? (
            <p className="notice notice--error">{startErrors.phone}</p>
          ) : used >= mock.maxAttempts ? (
            <p className="muted">You have used every attempt this mock allows.</p>
          ) : (
            <form action={startAttemptAction}>
              <input name="mockId" type="hidden" value={mock.id} />
              <SubmitButton pendingLabel="Starting…">{used === 0 ? "Start test" : "Start another attempt"}</SubmitButton>
            </form>
          )}
          <Link className="button button--secondary" href="/student/mocks">
            Back to mock tests
          </Link>
        </div>
      </section>

      {mock.attempts.length ? (
        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>Your attempts</h2>
            </div>
          </div>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Started</TableHeaderCell>
                <TableHeaderCell>Result</TableHeaderCell>
                <TableHeaderCell>Proctoring</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mock.attempts.map((attempt) => (
                <TableRow key={attempt.id}>
                  <TableCell>
                    <Link href={`/student/attempts/${attempt.id}`}>{dateFormat.format(new Date(attempt.startedAt))}</Link>
                  </TableCell>
                  <TableCell>{attemptLabel(attempt)}</TableCell>
                  <TableCell>{attempt.proctored ? "Proctored" : "Unproctored (phone)"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}
    </RoleShell>
  );
}
