import Link from "next/link";

import { Icon } from "@/features/auth/components/icon";
import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";

import { documentsPageSize } from "../list-params";
import type { DocumentListPage } from "../queries/list-documents";

// The student's library is the same query the admin library uses, with no extra
// filter applied. `documents_select_authorized` returns only the documents this
// student holds a content_access grant for, so the difference between this
// screen and the admin's is entirely the database's decision.
//
// It is drawn as cards rather than the admin's table (UI refresh slice 2): a
// student's list is short by construction, has two facts per row, and the whole
// card is one large target on a phone.
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
    <RoleShell
      description="Everything an administrator has shared with you."
      profile={profile}
      title="Documents"
    >
      {rows.length === 0 ? (
        <section className="empty-state">
          <span aria-hidden="true" className="empty-state__mark">
            <Icon name="file" />
          </span>
          <h2>Nothing has been shared with you yet.</h2>
          <p>
            When an administrator shares a document with you, it appears here.
          </p>
        </section>
      ) : (
        <>
          <div className="list-bar">
            <p className="list-bar__count">
              Showing {firstOnPage}-{lastOnPage} of {total}
            </p>
          </div>
          <div className="card-grid">
            {rows.map((row) => (
              <Link
                className="course-card course-card--link"
                href={`/student/documents/${row.id}`}
                key={row.id}
              >
                <h2>{row.title}</h2>
                <span className="course-card__bottom">
                  <span>{row.folder || "Unfiled"}</span>
                  <span aria-hidden="true">Read →</span>
                </span>
              </Link>
            ))}
          </div>
        </>
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
    </RoleShell>
  );
}
