import Link from "next/link";

import { StudentReports } from "@/features/ars-report/components/student-reports";
import type { StudentReportPage } from "@/features/ars-report/queries/list-reports";
import type { StudentProcess } from "@/features/ars/queries/student-process";
import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { ProgressMeter } from "@/features/curriculum/components/progress-meter";
import type { StudentProgrammeRow } from "@/features/curriculum/queries/student-programmes";
import type { StudentMock } from "@/features/test-engine/queries/student-mocks";

// The student's home: two big white cards on the cream page. One holds the
// programmes they are working through, each with its percentage set large;
// the other what is waiting for them next -- a test to start or finish, an ARS
// round that is their turn. Then the mentor's released reports.
//
// The prototype also shows a study streak and "mocks attempted / average
// score" tiles. Those are prototype scope, not Annexure A (design/README.md),
// so they are deliberately not here.

const shown = 4;

interface NextUp {
  action: string;
  detail: string;
  href: string;
  key: string;
  title: string;
}

function formatDay(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

function nextUp(mocks: StudentMock[], processes: StudentProcess[]): NextUp[] {
  const items: NextUp[] = [];
  // A test already started comes first: its clock is running.
  for (const mock of mocks) {
    if (mock.attempts.some((attempt) => attempt.status === "in_progress")) {
      items.push({ action: "Continue", detail: "In progress · the clock is running", href: `/student/mocks/${mock.id}`, key: `m${mock.id}`, title: mock.title });
    }
  }
  for (const process of processes) {
    const round = process.rounds.find((entry) => entry.state === "open" && entry.submissionMode !== "offline");
    if (!round) continue;
    const due = formatDay(round.dueAt);
    items.push({
      action: round.started ? "Continue" : "Start",
      detail: `ARS · ${process.title}${due ? ` · due ${due}` : ""}`,
      href: `/student/ars/${round.id}`,
      key: `r${round.id}`,
      title: round.name,
    });
  }
  for (const mock of mocks) {
    if (mock.attempts.length === 0) {
      items.push({ action: "Start", detail: `Mock test · ${mock.durationMinutes} min`, href: `/student/mocks/${mock.id}`, key: `m${mock.id}`, title: mock.title });
    }
  }
  return items.slice(0, shown);
}

export function StudentHome({
  mocks,
  processes,
  profile,
  programmes,
  reports,
}: {
  mocks: StudentMock[];
  processes: StudentProcess[];
  profile: Profile;
  programmes: { pageCount: number; rows: StudentProgrammeRow[] };
  reports: StudentReportPage;
}) {
  const firstName = profile.name.trim().split(/\s+/)[0] || profile.name;
  const upcoming = nextUp(mocks, processes);

  return (
    <RoleShell description="Your programmes, and what is waiting for you next." heading={`Welcome back, ${firstName}.`} profile={profile} title="Home">
      <div className="home-grid">
        <section aria-labelledby="home-programmes" className="home-card home-grid__main">
          <div className="section-head">
            <h2 className="section-label" id="home-programmes">
              My programmes
            </h2>
            {programmes.pageCount > 1 || programmes.rows.length > shown ? (
              <Link className="section-head__link" href="/student/programmes">
                All programmes
              </Link>
            ) : null}
          </div>
          {programmes.rows.length === 0 ? (
            <p className="panel-empty">No programmes yet. Your admin adds you to them.</p>
          ) : (
            <ul className="home-rows">
              {programmes.rows.slice(0, shown).map((row) => (
                <li key={row.id}>
                  <Link className="home-row" href={`/student/programmes/${row.id}`}>
                    <span className="home-row__text">
                      <h3>{row.title}</h3>
                      <ProgressMeter complete={row.complete} percent={row.percent} total={row.total} />
                    </span>
                    <span className="home-row__figure">
                      <strong>{row.percent}%</strong>
                      <small>{row.complete === 0 ? "Start" : row.complete === row.total ? "Review" : "Continue"} →</small>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="home-next" className="home-card home-grid__side">
          <div className="section-head">
            <h2 className="section-label" id="home-next">
              Next up
            </h2>
          </div>
          {upcoming.length === 0 ? (
            <p className="panel-empty">Nothing is waiting for you. New tests and ARS rounds appear here.</p>
          ) : (
            <ul className="next-list">
              {upcoming.map((item, index) => (
                <li className="next-card" key={item.key}>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.detail}</p>
                  </div>
                  {/* The first item is the one thing to do now, so it alone
                      is a primary button. */}
                  <Link className={`button ${index === 0 ? "button--primary" : "button--secondary"}`} href={item.href}>
                    {item.action}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <StudentReports reports={reports} />
    </RoleShell>
  );
}
