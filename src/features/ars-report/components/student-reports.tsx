import Link from "next/link";

import type { StudentReportRow } from "../queries/list-reports";

export function StudentReports({ rows }: { rows: StudentReportRow[] }) {
  return (
    <section className="panel">
      <div><h2>Your ARS reports</h2><p className="muted">Only reports your mentor has finished and released appear here.</p></div>
      {rows.length === 0 ? <p className="muted">No report has been released yet.</p> : (
        <div className="report-list">
          {rows.map((row) => <article className="report-list__item" key={row.reportId}><div><strong>{row.courseTitle}</strong><p className="muted">Released {row.releasedAt.slice(0, 10)} · {row.overallScore ?? "—"}/100</p></div><Link className="button button--secondary" href={`/student/reports/${row.reportId}`}>Read report</Link></article>)}
        </div>
      )}
    </section>
  );
}
