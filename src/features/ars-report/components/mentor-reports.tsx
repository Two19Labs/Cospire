import Link from "next/link";

import type { Profile } from "@/features/auth/types";
import { RoleShell } from "@/features/auth/components/role-shell";

import { createReportAction } from "../actions/report-actions";
import { buildReportsHref } from "../list-params";
import type { MentorReportPage } from "../queries/list-reports";

export function MentorReports({ profile, reports, embedded = false }: { profile: Profile; reports: MentorReportPage; embedded?: boolean }) {
  const { page, pageCount, rows, total } = reports;
  const content = (
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>ARS reports</h2>
            <p className="muted">Completed processes waiting for your assessment, followed by reports already released.</p>
          </div>
          {total > 0 ? <p className="muted">{total} completed {total === 1 ? "process" : "processes"}</p> : null}
        </div>
        {rows.length === 0 ? <p className="muted">No completed ARS process is ready for a report yet.</p> : (
          <div className="report-list">
            {rows.map((row) => (
              <article className="report-list__item" key={row.runId}>
                <div>
                  <strong>{row.studentName}</strong>
                  <p className="muted">{row.courseTitle} · completed {row.completedAt.slice(0, 10)}</p>
                </div>
                {row.reportId ? (
                  <Link className="button button--secondary" href={`/mentor/reports/${row.reportId}`}>
                    {row.reportStatus === "released" ? "View report" : "Continue report"}
                  </Link>
                ) : row.templateId ? (
                  <form action={createReportAction}>
                    <input name="runId" type="hidden" value={row.runId} />
                    <input name="templateId" type="hidden" value={row.templateId} />
                    <button className="button button--primary" type="submit">Start {row.templateName}</button>
                  </form>
                ) : <span className="pill pill--disabled">Admin template needed</span>}
              </article>
            ))}
          </div>
        )}
        {pageCount > 1 ? (
          <nav aria-label="Pagination" className="pagination">
            {page > 1 ? (
              <Link href={buildReportsHref({ base: "/mentor", page: page - 1 })} rel="prev">
                Previous
              </Link>
            ) : (
              <span className="muted">Previous</span>
            )}
            <span className="muted">
              Page {page} of {pageCount}
            </span>
            {page < pageCount ? (
              <Link href={buildReportsHref({ base: "/mentor", page: page + 1 })} rel="next">
                Next
              </Link>
            ) : (
              <span className="muted">Next</span>
            )}
          </nav>
        ) : null}
      </section>
  );
  return embedded ? content : <RoleShell profile={profile} title="Mentor workspace">{content}</RoleShell>;
}
