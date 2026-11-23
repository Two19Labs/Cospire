import Link from "next/link";

import { SectionCards, SectionTabs, type SectionView } from "@/features/admin/components/section-views";
import { PersonCell } from "@/features/auth/components/person-cell";
import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { SubmitButton, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/shared/ui";

import { setReportStatusAction } from "../actions";
import type { InboxPage } from "../queries";
import { buildInboxHref, inboxPageSize, kindLabels, reportStatuses, statusLabels, type InboxFilters, type ReportKind } from "../support";

// The one review queue (D65): help tickets and reported mistakes from
// students, one tab each, newest first, open by default.

export const supportTitle = "Help & reports";

export const supportViews: (SectionView & { key: ReportKind })[] = [
  { description: "Technical problems students raised from Help.", href: "/admin/support?view=ticket", key: "ticket", label: "Help tickets" },
  { description: "Content mistakes reported from the button on every student page.", href: "/admin/support?view=mistake", key: "mistake", label: "Reported mistakes" },
];

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
const notices: Record<string, { className: string; text: string }> = {
  failed: { className: "notice notice--error", text: "That could not be changed. Reload and try again." },
  open: { className: "notice notice--success", text: "Reopened." },
  resolved: { className: "notice notice--success", text: "Marked resolved." },
};

export function SupportScreen({
  filters,
  list,
  notice,
  profile,
}: {
  filters: InboxFilters | null;
  list: InboxPage | null;
  notice?: string;
  profile: Profile;
}) {
  return (
    <RoleShell description="Help tickets and reported mistakes from students, in one queue." profile={profile} title={supportTitle}>
      {filters && list ? <Inbox filters={filters} list={list} notice={notice} /> : <SectionCards views={supportViews} />}
    </RoleShell>
  );
}

function Inbox({ filters, list, notice }: { filters: InboxFilters; list: InboxPage; notice?: string }) {
  const { page, pageCount, rows, total } = list;
  const firstOnPage = total === 0 ? 0 : (page - 1) * inboxPageSize + 1;
  const lastOnPage = (page - 1) * inboxPageSize + rows.length;
  const shown = notice ? notices[notice] : undefined;

  return (
    <>
      <SectionTabs current={filters.kind} views={supportViews} />
      {shown ? <p className={shown.className} role="status">{shown.text}</p> : null}
      <section className="panel">
        {/* A plain GET form, so a filtered list can be linked and reloaded. */}
        <form action="/admin/support" className="toolbar toolbar--bleed" method="get">
          <input name="view" type="hidden" value={filters.kind} />
          <label className="field field--inline" htmlFor="support-status">
            <span className="field__label">Status</span>
            <select className="input input--compact" defaultValue={filters.status ?? "all"} id="support-status" name="status">
              {reportStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
              <option value="all">Any status</option>
            </select>
          </label>
          <SubmitButton pendingLabel="Filtering…" variant="secondary">Filter</SubmitButton>
        </form>

        {rows.length === 0 ? (
          <p className="panel-empty">
            {filters.status === "open" ? `No open ${kindLabels[filters.kind].toLowerCase()}s.` : "Nothing matches this filter."}
          </p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Student</TableHeaderCell>
                <TableHeaderCell>Comment</TableHeaderCell>
                <TableHeaderCell>Page</TableHeaderCell>
                <TableHeaderCell>Raised</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell><PersonCell email={row.reporterEmail} name={row.reporterName} /></TableCell>
                  <TableCell><span style={{ whiteSpace: "pre-wrap" }}>{row.comment}</span></TableCell>
                  <TableCell><code>{row.page}</code></TableCell>
                  <TableCell>{dateFormat.format(new Date(row.createdAt))}</TableCell>
                  <TableCell>
                    <span className={row.status === "open" ? "tag tag--gold" : "tag tag--sage"}>{statusLabels[row.status]}</span>
                    {row.resolvedAt ? <span className="cell-sub">{dateFormat.format(new Date(row.resolvedAt))}</span> : null}
                    <form action={setReportStatusAction}>
                      <input name="id" type="hidden" value={row.id} />
                      <input name="status" type="hidden" value={row.status === "open" ? "resolved" : "open"} />
                      <input name="view" type="hidden" value={filters.kind} />
                      <input name="filter" type="hidden" value={filters.status ?? "all"} />
                      <input name="page" type="hidden" value={filters.page} />
                      <SubmitButton compact pendingLabel="Saving…" variant="secondary">
                        {row.status === "open" ? "Mark resolved" : "Reopen"}
                      </SubmitButton>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {total === 0 ? null : (
          <nav aria-label="Pagination" className="pagination">
            <span className="pagination__count">{`Showing ${firstOnPage}-${lastOnPage} of ${total}`}</span>
            {pageCount > 1 ? (
              <>
                {page > 1 ? <Link href={buildInboxHref({ ...filters, page: page - 1 })} rel="prev">Previous</Link> : <span>Previous</span>}
                <span>Page {page} of {pageCount}</span>
                {page < pageCount ? <Link href={buildInboxHref({ ...filters, page: page + 1 })} rel="next">Next</Link> : <span>Next</span>}
              </>
            ) : null}
          </nav>
        )}
      </section>
    </>
  );
}
