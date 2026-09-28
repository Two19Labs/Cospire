import Link from "next/link";

import { Icon } from "@/features/auth/components/icon";
import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/shared/ui";

import type { MockSummary } from "../queries/mock-builder";

// The page heading, shared with the loading skeleton.
export const mocksHeading = "Practice with purpose.";

export function MocksScreen({ profile, mocks, page, pageCount }: { profile: Profile; mocks: MockSummary[]; page: number; pageCount: number }) {
  return (
    <RoleShell
      actions={
        <>
          <Link className="button button--secondary" href="/admin/mocks/import">
            Build from a document
          </Link>
          <Link className="button button--primary" href="/admin/mocks/new">
            <Icon name="plus" />
            New mock
          </Link>
        </>
      }
      description="Build timed tests from the question bank, by picking questions or by pasting a document that quotes their IDs."
      heading={mocksHeading}
      profile={profile}
      title="Mock tests"
    >
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Mocks</h2>
            <p className="muted">Sections, timing and scoring rules for each test.</p>
          </div>
        </div>
        {mocks.length === 0 ? (
          <p className="panel-empty">No mocks yet. Build the first one from the question bank.</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Mock test</TableHeaderCell>
                <TableHeaderCell>Duration</TableHeaderCell>
                <TableHeaderCell>Structure</TableHeaderCell>
                <TableHeaderCell>Attempts</TableHeaderCell>
                <TableHeaderCell>Controls</TableHeaderCell>
                <TableHeaderCell>
                  <span className="visually-hidden">Action</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mocks.map((mock) => (
                <TableRow key={mock.id}>
                  <TableCell>
                    <Link href={`/admin/mocks/${mock.id}`}>{mock.title}</Link>
                  </TableCell>
                  <TableCell>{mock.durationMinutes} min</TableCell>
                  <TableCell>
                    {mock.sectionCount} section{mock.sectionCount === 1 ? "" : "s"} · {mock.questionCount} questions
                  </TableCell>
                  <TableCell>{mock.maxAttempts}</TableCell>
                  <TableCell>
                    <span className="tag-row">
                      <span className="tag">{mock.allowMobile ? "Mobile allowed" : "Desktop only"}</span>
                      {mock.proctoringEnabled ? <span className="tag tag--sage">Proctored</span> : null}
                    </span>
                  </TableCell>
                  <TableCell className="table__actions">
                    <Link className="title-link" href={`/admin/mocks/${mock.id}`}>
                      Edit →
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {pageCount > 1 ? (
          <nav aria-label="Mock pagination" className="pagination">
            {page > 1 ? <Link href={`/admin/mocks?page=${page - 1}`}>Previous</Link> : <span>Previous</span>}
            <span>
              Page {page} of {pageCount}
            </span>
            {page < pageCount ? <Link href={`/admin/mocks?page=${page + 1}`}>Next</Link> : <span>Next</span>}
          </nav>
        ) : null}
      </section>
    </RoleShell>
  );
}
