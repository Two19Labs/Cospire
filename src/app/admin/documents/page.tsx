import type { Metadata } from "next";

import { DocumentsScreen } from "@/features/documents/components/documents-screen";
import {
  parseDocumentListError,
  parsePageNumber,
} from "@/features/documents/list-params";
import {
  listDocuments,
  listFolders,
} from "@/features/documents/queries/list-documents";
import { requireRole } from "@/features/auth/guards";

export const metadata: Metadata = { title: "Documents" };

function firstValue(raw: string | string[] | undefined): string | undefined {
  return typeof raw === "string" ? raw : undefined;
}

export default async function AdminDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");
  const params = await searchParams;

  const search = firstValue(params.q) ?? "";
  const folder = firstValue(params.folder) ?? "";
  const page = parsePageNumber(firstValue(params.page));
  const error = parseDocumentListError(firstValue(params.error));

  const [documents, folders] = await Promise.all([
    listDocuments({ folder, page, search }),
    listFolders(),
  ]);

  return (
    <DocumentsScreen
      documents={documents}
      error={error}
      folder={folder}
      folders={folders}
      profile={profile}
      search={search}
    />
  );
}
