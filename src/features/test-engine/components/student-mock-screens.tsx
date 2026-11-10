import Link from "next/link";

import { Icon } from "@/features/auth/components/icon";
import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { SubmitButton, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/shared/ui";

import { startAttemptAction } from "../actions/attempt-actions";
import { formatMarks } from "../marks";
import type { AttemptSummary, StudentMock } from "../queries/student-mocks";
import { ExamCard, ExamFrame } from "./exam-frame";
import { FullscreenOnSubmit } from "./fullscreen";
import { AttemptLink } from "./own-window";
import { TouchFlag } from "./touch-flag";

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

function attemptLabel(attempt: AttemptSummary): string {
  if (attempt.status === "in_progress") return "In progress";
  return attempt.score === null ? "Submitted" : `Score ${formatMarks(attempt.score)}`;
}

// Cards rather than the admin's table (UI refresh slice 2). A student's list is
// short by construction and carries three facts per mock, and the whole card is
// one large target on a phone.
export function StudentMocksScreen({ mocks, profile }: { mocks: StudentMock[]; profile: Profile }) {
  return (
    <RoleShell description="Open a mock to read its instructions and start." profile={profile} title="Mock tests">
      {mocks.length === 0 ? (
        <section className="empty-state">
          <span aria-hidden="true" className="empty-state__mark">
            <Icon name="test" />
          </span>
          <h2>No mock tests yet.</h2>
          <p>When an administrator shares a mock test with you, it appears here.</p>
        </section>
      ) : (
        <div className="card-grid card-grid--wide">
          {mocks.map((mock) => (
            <Link className="course-card course-card--link" href={`/student/mocks/${mock.id}`} key={mock.id}>
              <h2>{mock.title}</h2>
              <p>
                {mock.durationMinutes} min · {mock.attempts.length} of {mock.maxAttempts} attempt
                {mock.maxAttempts === 1 ? "" : "s"} used
              </p>
              <span className="course-card__bottom">
                <span>{mock.attempts[0] ? attemptLabel(mock.attempts[0]) : "Not started"}</span>
                <span aria-hidden="true">Open →</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </RoleShell>
  );
}

const startErrors: Record<string, string> = {
  failed: "The test could not be started. Try again.",
  limit: "You have used every attempt this mock allows.",
  phone: "This mock cannot be taken on a phone. Open it on a laptop or desktop.",
};

// The paper at a glance, as the approved prototype sets it out.
function MockFacts({ mock }: { mock: StudentMock }) {
  return (
    <ul aria-label="About this test" className="fact-chips">
      <li className="fact-chips__lead">{mock.durationMinutes} min</li>
      {mock.sections.length > 1 ? <li>{mock.sections.length} sections</li> : null}
      <li>{mock.negativeMarking > 0 ? `−${formatMarks(mock.negativeMarking)} per wrong answer` : "No negative marking"}</li>
      <li>
        {mock.attempts.length} of {mock.maxAttempts} attempt{mock.maxAttempts === 1 ? "" : "s"} used
      </li>
    </ul>
  );
}

export function StudentMockScreen({
  analytics = null,
  mock,
  phone,
  profile,
}: {
  // The latest submitted attempt's analytics, drawn by the analytics feature.
  analytics?: React.ReactNode;
  mock: StudentMock;
  phone: boolean;
  profile: Profile;
}) {
  const open = mock.attempts.find((attempt) => attempt.status === "in_progress");
  const used = mock.attempts.length;

  return (
    <RoleShell back={{ href: "/student/mocks", label: "Back to mock tests" }} profile={profile} title={mock.title}>
      {analytics}
      {/* A short summary only: the instructions are on the page the button
          opens, and the clock starts from the Start button there. */}
      <section className="panel">
        <MockFacts mock={mock} />
        <div className="toolbar">
          {open ? (
            <Link className="button button--primary" href={`/student/attempts/${open.id}`}>
              Resume test
            </Link>
          ) : phone && !mock.allowMobile ? (
            <p className="notice notice--error">{startErrors.phone}</p>
          ) : used >= mock.maxAttempts ? (
            <p className="muted">{startErrors.limit}</p>
          ) : (
            <AttemptLink href={`/student/mocks/${mock.id}/start`}>{used === 0 ? "Attempt mock" : "Attempt again"}</AttemptLink>
          )}
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

// The mock's instructions, in the exam's own frame: what "Attempt mock" opens.
// Nothing is written until Start is pressed, so reading this costs no time.
export function MockInstructionsScreen({
  error,
  mock,
  phone,
  profile,
}: {
  error?: string;
  mock: StudentMock;
  phone: boolean;
  profile: Profile;
}) {
  const used = mock.attempts.length;
  const sectional = mock.sections.some((section) => section.durationMinutes !== null);

  return (
    <ExamFrame sub={profile.name} title={mock.title}>
      <ExamCard eyebrow="Instructions">
        <h2>{mock.title}</h2>
        {error && startErrors[error] ? <p className="notice notice--error">{startErrors[error]}</p> : null}
        <MockFacts mock={mock} />
        {sectional ? (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Section</TableHeaderCell>
                <TableHeaderCell>Time</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mock.sections.map((section) => (
                <TableRow key={section.id}>
                  <TableCell>{section.title}</TableCell>
                  <TableCell>{section.durationMinutes ? `${section.durationMinutes} min` : "Untimed"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : mock.sections.length > 1 ? (
          <p className="muted">Sections: {mock.sections.map((section) => section.title).join(", ")}</p>
        ) : null}
        {mock.instructions ? <p className="mock-intro__text">{mock.instructions}</p> : null}
        <ul className="mock-intro__rules">
          {sectional ? (
            <li>The sections above are timed and sat in order. You cannot return to a section once you leave it.</li>
          ) : (
            <li>One timer for the whole paper. You can move between questions freely.</li>
          )}
          <li>
            {mock.negativeMarking > 0
              ? `A wrong answer loses ${formatMarks(mock.negativeMarking)} mark${mock.negativeMarking === 1 ? "" : "s"} on ${mock.negativeMarkingTypes.map((type) => (type === "numerical" ? "typed-answer" : type === "mcq_multi" ? "multiple-answer" : "multiple-choice")).join(" and ")} questions. An unanswered question loses nothing.`
              : "There is no negative marking."}
          </li>
          <li>The clock starts when you press Start test. It is kept by the server: closing the page does not stop it.</li>
          <li>{mock.maxAttempts === 1 ? "You have one attempt." : `You have ${mock.maxAttempts} attempts.`}</li>
          {phone ? (
            <li>You are on a phone, so this attempt will be recorded as unproctored.</li>
          ) : mock.proctoringEnabled ? (
            <li>This test is proctored. Stay in full screen: leaving it, or switching tabs or windows, is recorded.</li>
          ) : null}
        </ul>
        <div className="toolbar">
          {phone && !mock.allowMobile ? (
            <p className="notice notice--error">{startErrors.phone}</p>
          ) : used >= mock.maxAttempts ? (
            <p className="muted">{startErrors.limit}</p>
          ) : (
            <form action={startAttemptAction}>
              <input name="mockId" type="hidden" value={mock.id} />
              <TouchFlag />
              <FullscreenOnSubmit />
              <SubmitButton pendingLabel="Starting…">Start test</SubmitButton>
            </form>
          )}
          <Link className="button button--secondary" href={`/student/mocks/${mock.id}`}>
            Not now
          </Link>
        </div>
      </ExamCard>
    </ExamFrame>
  );
}
