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

import {
  buildDocumentsHref,
  documentListErrors,
  documentsPageSize,
  type DocumentListError,
} from "../list-params";
import type { DocumentListPage } from "../queries/list-documents";
import { UploadForm } from "./upload-form";

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
    <RoleShell profile={profile} title="Documents">
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Document library</h2>
            <p className="muted">
              {total === 0
                ? "No documents match."
                : `Showing ${firstOnPage}-${lastOnPage} of ${total}.`}
            </p>
          </div>
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {documentListErrors[error]}
          </p>
        ) : null}

        {/*
          A plain GET form, so a filtered library can be linked, reloaded and
          bookmarked, and the whole screen stays a Server Component.
        */}
        <form action="/admin/documents" className="toolbar" method="get">
          <label className="field field--inline" htmlFor="document-search">
            <span className="field__label">Search</span>
            <input
              className="input"
              defaultValue={search}
              id="document-search"
              name="q"
              placeholder="Title"
              type="search"
            />
          </label>
          <label className="field field--inline" htmlFor="document-folder">
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
          <button className="button button--secondary" type="submit">
            Filter
          </button>
          {search || folder ? (
            <Link className="muted" href="/admin/documents">
              Clear
            </Link>
          ) : null}
        </form>

        {rows.length === 0 ? (
          <p className="muted">
            {search || folder
              ? "No document matches that filter."
              : "No documents yet. Add the first one below."}
          </p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Title</TableHeaderCell>
                <TableHeaderCell>Folder</TableHeaderCell>
                <TableHeaderCell>Added</TableHeaderCell>
                <TableHeaderCell>Access</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link href={`/admin/documents/${row.id}`}>{row.title}</Link>
                  </TableCell>
                  <TableCell>
                    {row.folder ? (
                      row.folder
                    ) : (
                      <span className="muted">Unfiled</span>
                    )}
                  </TableCell>
                  <TableCell>{row.createdAt.slice(0, 10)}</TableCell>
                  <TableCell>
                    <Link
                      className="button button--secondary button--compact"
                      href={`/admin/documents/${row.id}`}
                    >
                      Manage
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
              <Link
                href={buildDocumentsHref({ folder, page: page - 1, search })}
                rel="prev"
              >
                Previous
              </Link>
            ) : (
              <span className="muted">Previous</span>
            )}
            <span className="muted">
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
              <span className="muted">Next</span>
            )}
          </nav>
        ) : null}
      </section>

      <section className="panel panel--narrow">
        <div>
          <h2>Add a document</h2>
          <p className="muted">
            PDF only, up to 50 MB. The file goes straight to storage; it never
            passes through this application.
          </p>
        </div>
        <UploadForm folders={folders} />
      </section>
    </RoleShell>
  );
}
