import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";

import type { DocumentView } from "../queries/get-document-view";
import { DocumentViewer } from "./document-viewer";

export function StudentDocumentScreen({
  profile,
  view,
}: {
  profile: Profile;
  view: DocumentView;
}) {
  const { document, fileUrl, watermark } = view;

  return (
    <RoleShell profile={profile} title={document.title}>
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>{document.title}</h2>
            <p className="muted">
              {document.folder ? document.folder : "Unfiled"}
            </p>
          </div>
          <Link className="button button--secondary" href="/student/documents">
            Back to documents
          </Link>
        </div>

        {/*
          Said plainly rather than buried. A watermark that a reader does not
          know is there deters nobody, and deterrence is most of what it is for.
        */}
        <p className="muted">
          This document is marked with your name and the time you opened it.
        </p>
      </section>

      <section className="panel">
        <DocumentViewer fileUrl={fileUrl} watermark={watermark} />
      </section>
    </RoleShell>
  );
}
