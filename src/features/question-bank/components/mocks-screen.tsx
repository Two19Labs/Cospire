import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/shared/ui";

import type { MockSummary } from "../queries/mock-builder";

export function MocksScreen({ profile, mocks, page, pageCount }: { profile: Profile; mocks: MockSummary[]; page: number; pageCount: number }) {
  return (
    <RoleShell profile={profile} title="Mock tests">
      <section className="panel">
        <div className="panel__header">
          <div><h2>Mocks</h2><p className="muted">Build timed tests from the question bank, by picking questions or by pasting a document that quotes their IDs.</p></div>
          <div className="toolbar">
            <Link className="button button--primary button--compact" href="/admin/mocks/new">New mock</Link>
            <Link className="button button--secondary button--compact" href="/admin/mocks/import">Build from a document</Link>
          </div>
        </div>
        {mocks.length === 0 ? <p className="muted">No mocks yet.</p> : (
          <div className="table-scroll"><Table><TableHead><TableRow>
            <TableHeaderCell>Mock</TableHeaderCell><TableHeaderCell>Duration</TableHeaderCell>
            <TableHeaderCell>Structure</TableHeaderCell><TableHeaderCell>Attempts</TableHeaderCell>
            <TableHeaderCell>Controls</TableHeaderCell>
          </TableRow></TableHead><TableBody>{mocks.map((mock) => (
            <TableRow key={mock.id}><TableCell><Link href={`/admin/mocks/${mock.id}`}>{mock.title}</Link></TableCell>
              <TableCell>{mock.durationMinutes} min</TableCell><TableCell>{mock.sectionCount} section{mock.sectionCount === 1 ? "" : "s"} · {mock.questionCount} questions</TableCell>
              <TableCell>{mock.maxAttempts}</TableCell><TableCell>{mock.allowMobile ? "Mobile allowed" : "Desktop only"}{mock.proctoringEnabled ? " · Proctored" : ""}</TableCell>
            </TableRow>
          ))}</TableBody></Table></div>
        )}
        {pageCount > 1 ? <nav aria-label="Mock pagination" className="pagination">
          {page > 1 ? <Link href={`/admin/mocks?page=${page - 1}`}>Previous</Link> : <span className="muted">Previous</span>}
          <span className="muted">Page {page} of {pageCount}</span>
          {page < pageCount ? <Link href={`/admin/mocks?page=${page + 1}`}>Next</Link> : <span className="muted">Next</span>}
        </nav> : null}
      </section>
    </RoleShell>
  );
}
