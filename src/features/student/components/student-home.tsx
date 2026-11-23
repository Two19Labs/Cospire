import Link from "next/link";

import { StudentReports } from "@/features/ars-report/components/student-reports";
import type { StudentReportPage } from "@/features/ars-report/queries/list-reports";
import type { StudentProcess } from "@/features/ars/queries/student-process";
import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { ProgrammeCard } from "@/features/curriculum/components/student-programme";
import type { StudentProgrammeRow } from "@/features/curriculum/queries/student-programmes";

// The student's home: one card listing every course they hold, each a card
// that opens it (a programme, or an ARS process when they hold the grant), then
// the mentor's released reports. The screens dropped from the sidebar on
// 2026-11-23 (documents, mock tests, analytics) are one link away below.
//
// The prototype also shows a study streak and "mocks attempted / average
// score" tiles. Those are prototype scope, not Annexure A (design/README.md),
// so they are deliberately not here.

const shortcuts = [
  { href: "/student/documents", label: "Documents" },
  { href: "/student/mocks", label: "Mock tests" },
  { href: "/student/analytics", label: "Analytics" },
];

export function StudentHome({
  processes,
  profile,
  programmes,
  reports,
}: {
  processes: StudentProcess[];
  profile: Profile;
  programmes: { pageCount: number; rows: StudentProgrammeRow[] };
  reports: StudentReportPage;
}) {
  const firstName = profile.name.trim().split(/\s+/)[0] || profile.name;
  const empty = programmes.rows.length === 0 && processes.length === 0;

  return (
    <RoleShell description="The courses you are enrolled in." heading={`Welcome back, ${firstName}.`} profile={profile} title="Home">
      <section aria-labelledby="home-courses" className="home-card home-grid__main">
        <div className="section-head">
          <h2 className="section-label" id="home-courses">
            My courses
          </h2>
          {programmes.pageCount > 1 ? (
            <Link className="section-head__link" href="/student/programmes">
              All programmes
            </Link>
          ) : null}
        </div>
        {empty ? (
          <p className="panel-empty">No courses yet. Your admin adds you to them.</p>
        ) : (
          <div className="card-grid card-grid--wide">
            {programmes.rows.map((row) => (
              <ProgrammeCard key={row.id} row={row} />
            ))}
            {processes.map((process) => (
              <Link className="course-card course-card--link" href="/student/ars" key={process.courseId}>
                <h2>{process.title}</h2>
                <span className="course-card__bottom">
                  <span>
                    {process.rounds.length} {process.rounds.length === 1 ? "round" : "rounds"}
                  </span>
                  <span aria-hidden="true">Open →</span>
                </span>
              </Link>
            ))}
          </div>
        )}
        <p className="muted">
          {shortcuts.map((link, index) => (
            <span key={link.href}>
              {index > 0 ? " · " : null}
              <Link href={link.href}>{link.label}</Link>
            </span>
          ))}
        </p>
      </section>

      <StudentReports reports={reports} />
    </RoleShell>
  );
}
