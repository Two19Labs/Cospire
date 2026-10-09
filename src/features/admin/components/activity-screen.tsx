import Link from "next/link";

import { PersonCell } from "@/features/auth/components/person-cell";
import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/shared/ui";

import { FLAG_WINDOW_HOURS, MAX_DISTINCT_IPS } from "../activity-flags";
import { activityPageSize, buildActivityHref } from "../activity-params";
import type { ActivityScreenData } from "../queries/activity-log";

// Shared with the loading skeleton so the two cannot drift.
export const activityTitle = "Activity log";
export const activityHeading = "Activity log";

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
const eventLabels = { active: "Active", sign_in: "Signed in", sign_out: "Signed out" } as const;

export function ActivityScreen({ data, profile }: { data: ActivityScreenData; profile: Profile }) {
  return (
    <RoleShell
      description={`Sign-ins and sign-outs, with accounts flagged over the last ${FLAG_WINDOW_HOURS} hours.`}
      heading={activityHeading}
      profile={profile}
      title={activityTitle}
    >
      {data.status === "unavailable" ? (
        <section className="panel">
          <p className="panel-empty">The activity log is not set up on this database yet. It starts recording once its migration is applied.</p>
        </section>
      ) : (
        <>
          <section className="panel">
            <div className="panel__header">
              <div>
                <h2>Flags</h2>
                <p className="muted">
                  Two sessions of one account in use at the same time, or one account seen from more than {MAX_DISTINCT_IPS} addresses.
                  A phone and a laptop, or a change of network, can trip either innocently: these are prompts to look, not verdicts.
                </p>
              </div>
            </div>
            {data.flagsTruncated ? <p className="notice">There was more activity than one screen reads; flags cover the earliest part of the window only.</p> : null}
            {data.flags.length === 0 ? (
              <p className="panel-empty">Nothing unusual in the last {FLAG_WINDOW_HOURS} hours.</p>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Account</TableHeaderCell>
                    <TableHeaderCell>Flag</TableHeaderCell>
                    <TableHeaderCell>Detail</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.flags.map(({ flag, userEmail, userName }) => (
                    <TableRow key={`${flag.kind}-${flag.userId}`}>
                      <TableCell><PersonCell email={userEmail} name={userName} /></TableCell>
                      <TableCell>
                        <span className="tag tag--rust">{flag.kind === "concurrent_sessions" ? "Concurrent sessions" : "Several locations"}</span>
                      </TableCell>
                      <TableCell>
                        {flag.kind === "concurrent_sessions"
                          ? `${flag.sessionCount} sessions overlapping, first at ${dateFormat.format(new Date(flag.firstOverlapAt))}`
                          : `${flag.ipCount} addresses: ${flag.ips.join(", ")}`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>

          <section className="panel">
            <div className="panel__header"><div><h2>Sign-ins and sign-outs</h2></div></div>
            {data.rows.length === 0 ? (
              <p className="panel-empty">No sign-ins recorded yet.</p>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Account</TableHeaderCell>
                    <TableHeaderCell>Event</TableHeaderCell>
                    <TableHeaderCell>When</TableHeaderCell>
                    <TableHeaderCell>Address</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell><PersonCell email={row.userEmail} name={row.userName} /></TableCell>
                      <TableCell>{eventLabels[row.eventType]}</TableCell>
                      <TableCell>{dateFormat.format(new Date(row.occurredAt))}</TableCell>
                      <TableCell>{row.ip ?? <span className="muted">Unknown</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {data.total === 0 ? null : (
              <nav aria-label="Pagination" className="pagination">
                <span className="pagination__count">
                  {`Showing ${(data.page - 1) * activityPageSize + 1}-${(data.page - 1) * activityPageSize + data.rows.length} of ${data.total} events`}
                </span>
                {data.pageCount > 1 ? (
                  <>
                    {data.page > 1 ? <Link href={buildActivityHref(data.page - 1)} rel="prev">Previous</Link> : <span>Previous</span>}
                    <span>Page {data.page} of {data.pageCount}</span>
                    {data.page < data.pageCount ? <Link href={buildActivityHref(data.page + 1)} rel="next">Next</Link> : <span>Next</span>}
                  </>
                ) : null}
              </nav>
            )}
          </section>
        </>
      )}
    </RoleShell>
  );
}
