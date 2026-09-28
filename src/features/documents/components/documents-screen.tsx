import Link from "next/link";

import { Icon } from "@/features/auth/components/icon";
import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  SubmitButton,
} from "@/shared/ui";

import {
  buildDocumentsHref,
  documentListErrors,
  documentsPageSize,
  type DocumentListError,
} from "../list-params";
import type { DocumentListPage } from "../queries/list-documents";
import { UploadForm } from "./upload-form";

// The page heading, shared with the loading skeleton.
export const documentsHeading = "A library worth returning to.";

interface DocumentsScreenProps {
  documents: DocumentListPage;
  error: DocumentListError | null;
  folder: string;
  folders: string[];
  profile: Profile;
  search: string;
}

export function DocumentsScreen({
  documents,
  error,
  folder,
  folders,
  profile,
  search,
}: DocumentsScreenProps) {
  const { page, pageCount, rows, total } = documents;
  const firstOnPage = total === 0 ? 0 : (page - 1) * documentsPageSize + 1;
  const lastOnPage = (page - 1) * documentsPageSize + rows.length;

  return (
    <RoleShell
      actions={
        // An anchor to the upload form further down: no JavaScript needed.
        <a className="button button--primary" href="#upload">
          <Icon name="upload" />
          Upload a document
        </a>
      }
      description="Keep resources organised and give the right students access."
      heading={documentsHeading}
      profile={profile}
      title="Documents"
    >
      {error ? (
        <p className="notice notice--error" role="alert">
          {documentListErrors[error]}
        </p>
      ) : null}

      <section className="panel">
        {/*
          A plain GET form, so a filtered library can be linked, reloaded and
          bookmarked, and the whole screen stays a Server Component.
        */}
        <form action="/admin/documents" className="toolbar toolbar--bleed" method="get">
          <label className="field field--inline" htmlFor="document-search">
            <span className="field__label">Search</span>
            <input
              className="input"
              defaultValue={search}
              id="document-search"
              name="q"
              placeholder="Search document titles"
              type="search"
            />
          </label>
          <label className="field" htmlFor="document-folder">
            <span className="field__label">Folder</span>
            <select
              className="input input--compact"
              defaultValue={folder}
              id="document-folder"
              name="folder"
            >
              <option value="">All folders</option>
              {folders.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <SubmitButton variant="secondary" pendingLabel="Working…">
            Filter
          </SubmitButton>
          {search || folder ? (
            <Link className="button button--ghost" href="/admin/documents">
              Clear
            </Link>
          ) : null}
        </form>

        {rows.length === 0 ? (
          <p className="panel-empty">
            {search || folder
              ? "No document matches that filter. Try a different search or clear the filters."
              : "No documents yet. Upload the first one below."}
          </p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Document</TableHeaderCell>
                <TableHeaderCell>Folder</TableHeaderCell>
                <TableHeaderCell>Added</TableHeaderCell>
                <TableHeaderCell>
                  <span className="visually-hidden">Access</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link className="doc-link" href={`/admin/documents/${row.id}`}>
                      <Icon name="file" />
                      {row.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {row.folder ? (
                      <span className="tag">{row.folder}</span>
                    ) : (
                      <span className="muted">Unfiled</span>
                    )}
                  </TableCell>
                  <TableCell>{row.createdAt.slice(0, 10)}</TableCell>
                  <TableCell className="table__actions">
                    <Link className="title-link" href={`/admin/documents/${row.id}`}>
                      Manage →
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {total === 0 ? null : (
          <nav aria-label="Pagination" className="pagination">
            <span className="pagination__count">
              Showing {firstOnPage}-{lastOnPage} of {total} documents
            </span>
            {pageCount > 1 ? (
              <>
                {page > 1 ? (
                  <Link
                    href={buildDocumentsHref({ folder, page: page - 1, search })}
                    rel="prev"
                  >
                    Previous
                  </Link>
                ) : (
                  <span>Previous</span>
                )}
                <span>
                  Page {page} of {pageCount}
                </span>
                {page < pageCount ? (
                  <Link
                    href={buildDocumentsHref({ folder, page: page + 1, search })}
                    rel="next"
                  >
                    Next
                  </Link>
                ) : (
                  <span>Next</span>
                )}
              </>
            ) : null}
          </nav>
        )}
      </section>

      <div className="two-col" id="upload">
        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>Add to the library</h2>
              <p className="muted">
                The file goes straight to storage; it never passes through this
                application.
              </p>
            </div>
          </div>
          <UploadForm folders={folders} />
        </section>

        <aside className="summary-rail">
          <section className="panel">
            <div className="panel__header">
              <h2>Upload guidance</h2>
            </div>
            <div>
              <p className="summary-row">
                <span>File type</span>
                <strong>PDF</strong>
              </p>
              <p className="summary-row">
                <span>Maximum size</span>
                <strong>50 MB</strong>
              </p>
              <p className="summary-row">
                <span>Access</span>
                <strong>Granted per student</strong>
              </p>
            </div>
            <p className="field__hint">
              Uploading a document does not grant any student access. Open it
              afterwards to choose who can read it.
            </p>
          </section>
        </aside>
      </div>
    </RoleShell>
  );
}
