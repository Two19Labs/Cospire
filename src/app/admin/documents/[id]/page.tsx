import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { DocumentDetail } from "@/features/documents/components/document-detail";
import {
  parseDocumentId,
  parseDocumentListError,
  parseDocumentNotice,
} from "@/features/documents/list-params";
import { getDocumentView } from "@/features/documents/queries/get-document-view";
import { listDocumentAccess } from "@/features/documents/queries/list-document-access";

export const metadata: Metadata = { title: "Document" };

function firstValue(raw: string | string[] | undefined): string | undefined {
  return typeof raw === "string" ? raw : undefined;
}

export default async function AdminDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");
  const { id } = await params;
  const query = await searchParams;

  const documentId = parseDocumentId(id);
  if (documentId === null) notFound();

  // A document this admin may not see comes back as null, and becomes a 404.
  // Not a 403: telling someone a document exists but is not theirs is a
  // disclosure in itself, and there is nothing they could do with the
  // distinction.
  const view = await getDocumentView({ documentId, viewer: profile });
  if (!view) notFound();

  const students = await listDocumentAccess(documentId);

  return (
    <DocumentDetail
      error={parseDocumentListError(firstValue(query.error))}
      notice={parseDocumentNotice(firstValue(query.notice))}
      profile={profile}
      students={students}
      view={view}
    />
  );
}
