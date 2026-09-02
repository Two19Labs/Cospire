import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { StudentDocumentScreen } from "@/features/documents/components/student-document-screen";
import { parseDocumentId } from "@/features/documents/list-params";
import { getDocumentView } from "@/features/documents/queries/get-document-view";

export const metadata: Metadata = { title: "Document" };

export default async function StudentDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireRole("student");
  const { id } = await params;

  const documentId = parseDocumentId(id);
  if (documentId === null) notFound();

  // This is the second half of the exit gate. A student without a
  // content_access grant gets null from `documents_select_authorized` and a 404
  // here -- and no signed URL is ever minted for them, because the mint happens
  // only after the database has returned the row.
  const view = await getDocumentView({ documentId, viewer: profile });
  if (!view) notFound();

  return <StudentDocumentScreen profile={profile} view={view} />;
}
