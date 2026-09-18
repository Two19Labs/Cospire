import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";

import type { ProcessRound, RoundState, StudentProcess } from "../queries/student-process";

// The screen the founder described most concretely on 2026-09-16: "the student
// will see that the next step is, let's say, an interview or a group discussion.
// There are these five steps, and here are the dates, or here are the deadlines
// for it."
//
// It existed in no plan until 2026-09-18, which is why it is here rather than
// only a per-round answer page.

const stateLabels: Record<RoundState, string> = {
  done: "Done",
  locked: "Earlier step first",
  not_open: "Not open yet",
  open: "Your turn",
  reviewed: "Reviewed",
  waiting: "With your mentor",
};

function formatDay(value: string | null): string | null {
  if (!value) return null;
  // Rendered in IST, computed by fixed offset rather than an Intl time-zone
  // lookup: a runtime with trimmed ICU data falls back to UTC while still
  // printing "IST", which is a wrong answer that looks right. Same reasoning as
  // the document watermark.
  const shifted = new Date(new Date(value).getTime() + 5.5 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function RoundRow({ round }: { round: ProcessRound }) {
  const opens = formatDay(round.opensAt);
  const due = formatDay(round.dueAt);
  const reachable = round.state === "open";

  return (
    <article className="report-list__item">
      <div>
        <strong>{round.name}</strong>
        <p className="muted">
          {round.submissionMode === "offline"
            ? "Happens off the platform"
            : stateLabels[round.state]}
          {opens ? ` · opens ${opens}` : ""}
          {due ? ` · due ${due}` : ""}
          {round.isLate ? " · submitted late" : ""}
        </p>
      </div>
      {reachable && round.submissionMode !== "offline" ? (
        <Link className="button button--primary" href={`/student/ars/${round.id}`}>
          Continue
        </Link>
      ) : round.submissionMode === "offline" ? (
        <span className="pill">Scheduled</span>
      ) : (
        <Link className="button button--secondary" href={`/student/ars/${round.id}`}>
          View
        </Link>
      )}
    </article>
  );
}

export function StudentProcesses({
  processes,
  profile,
}: {
  processes: StudentProcess[];
  profile: Profile;
}) {
  return (
    <RoleShell profile={profile} title="Your ARS">
      {processes.length === 0 ? (
        <section className="panel">
          <h2>No process yet</h2>
          <p className="muted">
            When your mentor sets up an application readiness process for you, its steps and
            dates appear here.
          </p>
        </section>
      ) : (
        processes.map((process) => {
          const next = process.rounds.find((round) => round.state === "open");
          const done = process.rounds.filter(
            (round) => round.state === "waiting" || round.state === "reviewed",
          ).length;

          return (
            <section className="panel" key={process.courseId}>
              <div className="panel__header">
                <div>
                  <h2>{process.title}</h2>
                  <p className="muted">
                    {done} of {process.rounds.length} steps done
                    {next ? ` · next: ${next.name}` : ""}
                  </p>
                </div>
              </div>
              <div className="report-list">
                {process.rounds.map((round) => (
                  <RoundRow key={round.id} round={round} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </RoleShell>
  );
}
