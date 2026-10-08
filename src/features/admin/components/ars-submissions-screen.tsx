import Link from "next/link";

import { PersonCell } from "@/features/auth/components/person-cell";
import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { SubmissionAnswers } from "@/features/ars-review/components/mentor-review-detail";
import type { MentorSubmissionDetail } from "@/features/ars-review/queries/mentor-submissions";
import {
  SubmitButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/shared/ui";

import {
  arsStatusLabels,
  arsSubmissionStatuses,
  arsSubmissionsPageSize,
  buildArsSubmissionsHref,
  type ArsSubmissionFilters,
} from "../ars-submissions-params";
import type { ArsSubmissionListPage } from "../queries/list-ars-submissions";

// Shared with the loading skeletons so the two cannot drift.
export const arsSubmissionsTitle = "ARS submissions";
export const arsSubmissionsHeading = "Every ARS submission, in one place.";

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
const statusTag = { draft: "tag", reviewed: "tag tag--sage", submitted: "tag tag--gold" } as const;

export function ArsSubmissionsScreen({
  filters,
  list,
  profile,
}: {
  filters: ArsSubmissionFilters;
  list: ArsSubmissionListPage;
  profile: Profile;
}) {
  const { page, pageCount, rows, total } = list;
  const firstOnPage = total === 0 ? 0 : (page - 1) * arsSubmissionsPageSize + 1;
  const lastOnPage = (page - 1) * arsSubmissionsPageSize + rows.length;
  const filtered = filters.processId !== null || filters.status !== null;

  return (
    <RoleShell
      description="Every student, round and process. Read-only: mentors review from their own queue."
      heading={arsSubmissionsHeading}
      profile={profile}
      title={arsSubmissionsTitle}
    >
      <section className="panel">
        {/* A plain GET form, so a filtered list can be linked and reloaded. */}
        <form action="/admin/ars-submissions" className="toolbar toolbar--bleed" method="get">
          <label className="field field--inline" htmlFor="ars-process">
            <span className="field__label">Process</span>
            <select className="input input--compact" defaultValue={filters.processId ?? ""} id="ars-process" name="process">
              <option value="">All processes</option>
              {list.processes.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          {filters.processId !== null ? (
            <label className="field field--inline" htmlFor="ars-round">
              <span className="field__label">Round</span>
              <select className="input input--compact" defaultValue={filters.roundId ?? ""} id="ars-round" name="round">
                <option value="">All rounds</option>
                {list.rounds.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
          ) : null}
          <label className="field field--inline" htmlFor="ars-status">
            <span className="field__label">Status</span>
            <select className="input input--compact" defaultValue={filters.status ?? ""} id="ars-status" name="status">
              <option value="">Any status</option>
              {arsSubmissionStatuses.map((status) => <option key={status} value={status}>{arsStatusLabels[status]}</option>)}
            </select>
          </label>
          <SubmitButton variant="secondary" pendingLabel="Filtering…">Filter</SubmitButton>
          {filtered ? <Link className="button button--ghost" href="/admin/ars-submissions">Clear</Link> : null}
        </form>
        {filters.processId !== null && filters.roundId === null && list.rounds.length > 0 ? (
          <p className="muted">Pick a round above to narrow the list further.</p>
        ) : null}

        {rows.length === 0 ? (
          <p className="panel-empty">{filtered ? "No submission matches these filters." : "No student has started an ARS round yet."}</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Student</TableHeaderCell>
                <TableHeaderCell>Process &amp; round</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Handed in</TableHeaderCell>
                <TableHeaderCell><span className="visually-hidden">Open</span></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell><PersonCell email={row.studentEmail} name={row.studentName} /></TableCell>
                  <TableCell>{row.processTitle}<br /><span className="muted">{row.roundName} · attempt {row.attemptNo}</span></TableCell>
                  <TableCell><span className={statusTag[row.status]}>{arsStatusLabels[row.status]}</span></TableCell>
                  <TableCell>{row.submittedAt ? dateFormat.format(new Date(row.submittedAt)) : <span className="muted">Not yet</span>}{row.isLate ? <><br /><span className="tag tag--rust">Late</span></> : null}</TableCell>
                  <TableCell className="table__actions"><Link className="button button--secondary" href={`/admin/ars-submissions/${row.id}`}>Open</Link></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {total === 0 ? null : (
          <nav aria-label="Pagination" className="pagination">
            <span className="pagination__count">{`Showing ${firstOnPage}-${lastOnPage} of ${total} submissions`}</span>
            {pageCount > 1 ? (
              <>
                {page > 1 ? <Link href={buildArsSubmissionsHref({ ...filters, page: page - 1 })} rel="prev">Previous</Link> : <span>Previous</span>}
                <span>Page {page} of {pageCount}</span>
                {page < pageCount ? <Link href={buildArsSubmissionsHref({ ...filters, page: page + 1 })} rel="next">Next</Link> : <span>Next</span>}
              </>
            ) : null}
          </nav>
        )}
      </section>
    </RoleShell>
  );
}

// One submission, read-only. The answers and file links are the mentor
// screen's own component; the "Mark reviewed" form is left out, because the
// database lets only the assigned mentor review.
export function AdminArsSubmissionDetail({ profile, submission }: { profile: Profile; submission: MentorSubmissionDetail }) {
  return (
    <RoleShell back={{ href: "/admin/ars-submissions", label: "All ARS submissions" }} heading={submission.studentName} profile={profile} title="ARS submission">
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>{submission.roundName}</h2>
            <p className="muted">{submission.courseTitle} · attempt {submission.attemptNo}{submission.isLate ? " · submitted late" : ""}{submission.reviewedAt ? ` · reviewed ${dateFormat.format(new Date(submission.reviewedAt))}` : ""}</p>
          </div>
          <span className={statusTag[submission.status]}>{arsStatusLabels[submission.status]}</span>
        </div>
        {submission.status === "draft" ? <p className="notice">A draft: the student has not handed this in, and may still change it.</p> : null}
        <SubmissionAnswers answers={submission.answers} />
      </section>
    </RoleShell>
  );
}
