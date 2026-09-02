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
    <RoleShell profile={profile} title={document.title}>
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>{document.title}</h2>
            <p className="muted">
              {document.folder ? document.folder : "Unfiled"} · added{" "}
              {document.createdAt.slice(0, 10)}
            </p>
          </div>
          <Link className="button button--secondary" href="/admin/documents">
            Back to library
          </Link>
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {documentListErrors[error]}
          </p>
        ) : null}

        {notice ? <p className="muted">{documentNotices[notice]}</p> : null}
      </section>

      <section className="panel">
        <div>
          <h2>Who can read this</h2>
          <p className="muted">
            {students.length === 0
              ? "There are no active students to grant this to yet."
              : `${grantedCount} of ${students.length} students have access.`}
          </p>
        </div>

        {students.length === 0 ? null : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Student</TableHeaderCell>
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>Access</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {students.map((student) => (
                <TableRow key={student.id}>
                  <TableCell>{student.name}</TableCell>
                  <TableCell>{student.email}</TableCell>
                  <TableCell>
                    <div className="row-form">
                      <span
                        className={`pill pill--${
                          student.granted ? "active" : "disabled"
                        }`}
                      >
                        {student.granted ? "Granted" : "No access"}
                      </span>
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
                        <button
                          className={`button button--compact button--${
                            student.granted ? "danger" : "secondary"
                          }`}
                          type="submit"
                        >
                          {student.granted ? "Revoke" : "Grant"}
                        </button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="panel">
        <div>
          <h2>Preview</h2>
          <p className="muted">
            Exactly what a student sees, watermarked with whoever is reading it
            — in this case you.
          </p>
        </div>
        <DocumentViewer fileUrl={fileUrl} watermark={watermark} />
      </section>
    </RoleShell>
  );
}
