import Link from "next/link";

import { SectionCards, SectionTabs, type SectionView } from "@/features/admin/components/section-views";
import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/shared/ui";

import type { MockSummary } from "../queries/mock-builder";

// The page heading, shared with the loading skeleton.
export const mocksHeading = "Mock tests";

export const mockViews: SectionView[] = [
  { description: "Every mock, its status and its attempts.", href: "/admin/mocks?view=list", key: "list", label: "View mocks" },
  { description: "Pick questions from the bank and set the timing.", href: "/admin/mocks/new", key: "new", label: "New mock" },
  { description: "Read a paper; its questions become the mock.", href: "/admin/mocks/import-paper", key: "import-paper", label: "Import a paper" },
  { description: "Paste a document that lists question IDs.", href: "/admin/mocks/import", key: "import", label: "Build from question IDs" },
];

// view: null for the landing cards; otherwise the list.
export function MocksScreen({ profile, mocks, page, pageCount, view }: { profile: Profile; mocks: MockSummary[]; page: number; pageCount: number; view: string | null }) {
  return (
    <RoleShell
      description="Import a paper and its questions become a mock, with any the bank already holds linked rather than copied. Or pick questions from the bank, or quote their IDs."
      heading={mocksHeading}
      profile={profile}
      title="Mock tests"
    >
      {view === null ? <SectionCards views={mockViews} /> : <>
      <SectionTabs current="list" views={mockViews} />
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
                    {/* D41. Only admins see this list, and a draft has to be
                        obvious here: students see nothing of it at all. */}
                    {mock.status === "draft" ? <span className="tag">Draft</span> : null}
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
            {page > 1 ? <Link href={`/admin/mocks?view=list&page=${page - 1}`}>Previous</Link> : <span>Previous</span>}
            <span>
              Page {page} of {pageCount}
            </span>
            {page < pageCount ? <Link href={`/admin/mocks?view=list&page=${page + 1}`}>Next</Link> : <span>Next</span>}
          </nav>
        ) : null}
      </section>
      </>}
    </RoleShell>
  );
}
