import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/shared/ui";

import { documentsPageSize } from "../list-params";
import type { DocumentListPage } from "../queries/list-documents";

// The student's library is the same query the admin library uses, with no extra
// filter applied. `documents_select_authorized` returns only the documents this
// student holds a content_access grant for, so the difference between this
// screen and the admin's is entirely the database's decision.
export function StudentDocumentsScreen({
  documents,
  profile,
}: {
  documents: DocumentListPage;
  profile: Profile;
}) {
  const { page, pageCount, rows, total } = documents;
  const firstOnPage = total === 0 ? 0 : (page - 1) * documentsPageSize + 1;
  const lastOnPage = (page - 1) * documentsPageSize + rows.length;

  return (
    <RoleShell profile={profile} title="Documents">
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Your documents</h2>
            <p className="muted">
              {total === 0
                ? "Nothing has been shared with you yet."
                : `Showing ${firstOnPage}-${lastOnPage} of ${total}.`}
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="muted">
            When an administrator shares a document with you, it appears here.
          </p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Title</TableHeaderCell>
                <TableHeaderCell>Folder</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link href={`/student/documents/${row.id}`}>
                      {row.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {row.folder ? (
                      row.folder
                    ) : (
                      <span className="muted">Unfiled</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      className="button button--secondary button--compact"
                      href={`/student/documents/${row.id}`}
                    >
                      Read
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {pageCount > 1 ? (
          <nav aria-label="Pagination" className="pagination">
            {page > 1 ? (
              <Link href={`/student/documents?page=${page - 1}`} rel="prev">
                Previous
              </Link>
            ) : (
              <span className="muted">Previous</span>
            )}
            <span className="muted">
              Page {page} of {pageCount}
            </span>
            {page < pageCount ? (
              <Link href={`/student/documents?page=${page + 1}`} rel="next">
                Next
              </Link>
            ) : (
              <span className="muted">Next</span>
            )}
          </nav>
        ) : null}
      </section>
    </RoleShell>
  );
}
