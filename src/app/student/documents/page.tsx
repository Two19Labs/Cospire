import type { Metadata } from "next";

import { requireRole } from "@/features/auth/guards";
import { StudentDocumentsScreen } from "@/features/documents/components/student-documents-screen";
import { parsePageNumber } from "@/features/documents/list-params";
import { listDocuments } from "@/features/documents/queries/list-documents";

export const metadata: Metadata = { title: "Documents" };

function firstValue(raw: string | string[] | undefined): string | undefined {
  return typeof raw === "string" ? raw : undefined;
}

export default async function StudentDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("student");
  const params = await searchParams;

  // No search or folder filter for students. The admin library needs them
  // because it holds everything; a student sees only what has been shared with
  // them, which is a short list by construction.
  const documents = await listDocuments({
    folder: "",
    page: parsePageNumber(firstValue(params.page)),
    search: "",
  });

  return <StudentDocumentsScreen documents={documents} profile={profile} />;
}
