import { PersonCell } from "@/features/auth/components/person-cell";
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

import { setDocumentAccessAction } from "../actions/set-document-access";
import {
  documentListErrors,
  documentNotices,
  type DocumentListError,
  type DocumentNotice,
} from "../list-params";
import type { DocumentView } from "../queries/get-document-view";
import type { AccessStudent } from "../queries/list-document-access";
import { DocumentViewer } from "./document-viewer";

interface DocumentDetailProps {
  error: DocumentListError | null;
  notice: DocumentNotice | null;
  profile: Profile;
  students: AccessStudent[];
  view: DocumentView;
}

export function DocumentDetail({
  error,
  notice,
  profile,
  students,
  view,
}: DocumentDetailProps) {
  const { document, fileUrl, watermark } = view;
  const grantedCount = students.filter((student) => student.granted).length;

  return (
    <RoleShell
      back={{ href: "/admin/documents", label: "Back to library" }}
      description={`${document.folder ? document.folder : "Unfiled"} · Added ${document.createdAt.slice(0, 10)}`}
      profile={profile}
      title={document.title}
    >
      {/* In-page sections rather than tabs that need JavaScript. */}
      <nav aria-label="Page sections" className="tabs">
        <a className="tabs__link tabs__link--current" href="#access">
          Student access
        </a>
        <a className="tabs__link" href="#preview">
          Document preview
        </a>
      </nav>

      {error ? (
        <p className="notice notice--error" role="alert">
          {documentListErrors[error]}
        </p>
      ) : null}

      {notice ? <p className="notice notice--success">{documentNotices[notice]}</p> : null}

      <section className="panel" id="access">
        <div className="panel__header">
          <div>
            <h2>Who can read this</h2>
            <p className="muted">
              {students.length === 0
                ? "There are no active students to grant this to yet."
                : `${grantedCount} of ${students.length} students have access.`}
            </p>
          </div>
        </div>

        {students.length === 0 ? (
          <p className="panel-empty">Students appear here once their accounts exist.</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Student</TableHeaderCell>
                <TableHeaderCell>Access</TableHeaderCell>
                <TableHeaderCell>
                  <span className="visually-hidden">Action</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {students.map((student) => (
                <TableRow key={student.id}>
                  <TableCell>
                    <PersonCell email={student.email} name={student.name} />
                  </TableCell>
                  <TableCell>
                    <span
                      className={`pill pill--${
                        student.granted ? "active" : "disabled"
                      }`}
                    >
                      {student.granted ? "Granted" : "No access"}
                    </span>
                  </TableCell>
                  <TableCell className="table__actions">
                    {/*
                      The Server Action is passed straight to the form, so
                      granting works with JavaScript disabled. The document id
                      travels as a value and the action rebuilds the
                      destination from a literal path, which is what stops
                      this being an open redirect.
                    */}
                    <form action={setDocumentAccessAction}>
                      <input
                        name="documentId"
                        type="hidden"
                        value={document.id}
                      />
                      <input
                        name="studentId"
                        type="hidden"
                        value={student.id}
                      />
                      <input
                        name="intent"
                        type="hidden"
                        value={student.granted ? "revoke" : "grant"}
                      />
                      <SubmitButton
                        className={student.granted ? "button--ghost" : undefined}
                        compact
                        pendingLabel={student.granted ? "Revoking…" : "Granting…"}
                        variant={student.granted ? "secondary" : "primary"}
                      >
                        {student.granted ? "Revoke" : "Grant"}
                      </SubmitButton>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="panel" id="preview">
        <div className="panel__header">
          <div>
            <h2>Preview</h2>
            <p className="muted">
              Exactly what a student sees, watermarked with whoever is reading it
              — in this case you.
            </p>
          </div>
        </div>
        <DocumentViewer fileUrl={fileUrl} watermark={watermark} />
      </section>
    </RoleShell>
  );
}
