import Link from "next/link";

import type { MentorSubmissionRow } from "../queries/mentor-submissions";
import type { OfflineRoundRow } from "../queries/mentor-submissions";
import { recordOfflineRoundAction } from "../actions/review-actions";

export function MentorReviewQueue({ rows }: { rows: MentorSubmissionRow[] }) {
  const waiting = rows.filter((row) => row.status === "submitted");
  const reviewed = rows.filter((row) => row.status === "reviewed");
  return (
    <section className="panel">
      <div className="panel__header">
        <div><h2>Submission review queue</h2><p className="muted">Answers and uploads from your assigned students.</p></div>
        <span className="pill">{waiting.length} waiting</span>
      </div>
      {rows.length === 0 ? <p className="muted">No submitted rounds are waiting for you.</p> : (
        <div className="report-list">
          {[...waiting, ...reviewed].map((row) => (
            <article className="report-list__item" key={row.id}>
              <div>
                <strong>{row.studentName} · {row.roundName}</strong>
                <p className="muted">{row.courseTitle} · attempt {row.attemptNo}{row.isLate ? " · late" : ""} · {row.status === "submitted" ? "waiting for review" : "reviewed"}</p>
              </div>
              <Link className={`button ${row.status === "submitted" ? "button--primary" : "button--secondary"}`} href={`/mentor/ars/${row.id}`}>
                {row.status === "submitted" ? "Review" : "View"}
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function OfflineRoundQueue({ rows }: { rows: OfflineRoundRow[] }) {
  if (!rows.length) return null;
  return (
    <section className="panel">
      <div className="panel__header"><div><h2>Off-platform outcomes</h2><p className="muted">Record interviews, group discussions, and other rounds after they happen.</p></div></div>
      <div className="report-list">{rows.map((row) => (
        <article className="report-list__item" key={`${row.studentId}:${row.roundId}`}>
          <div><strong>{row.studentName} · {row.roundName}</strong><p className="muted">{row.courseTitle}</p></div>
          <form action={recordOfflineRoundAction} className="offline-outcome"><input name="studentId" type="hidden" value={row.studentId} /><input name="roundId" type="hidden" value={row.roundId} /><select aria-label="Outcome" className="input" defaultValue="completed" name="outcome"><option value="completed">Completed</option><option value="passed">Passed</option><option value="needs_follow_up">Needs follow-up</option></select><input aria-label="Mentor note" className="input" maxLength={2000} name="note" placeholder="Note (optional)" /><button className="button button--primary" type="submit">Record outcome</button></form>
        </article>
      ))}</div>
    </section>
  );
}
