import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { parseCourseId } from "@/features/curriculum/list-params";
import { listPickerPage } from "@/features/curriculum/queries/list-picker";
import { ModuleDetailScreen } from "@/features/modules/components/module-detail";
import { parseModuleMessage, parsePageNumber } from "@/features/modules/modules";
import { getModule } from "@/features/modules/queries/get-module";

export const metadata: Metadata = { title: "Module" };

function firstValue(raw: string | string[] | undefined): string | undefined {
  return typeof raw === "string" ? raw : undefined;
}

export default async function AdminModulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");
  const { id } = await params;
  const query = await searchParams;
  const moduleId = parseCourseId(id);
  if (moduleId === null) notFound();

  const [module, documents, mocks, videos] = await Promise.all([
    getModule(moduleId),
    listPickerPage("documents", parsePageNumber(firstValue(query.documentsPage))),
    listPickerPage("mocks", parsePageNumber(firstValue(query.mocksPage))),
    listPickerPage("videos", parsePageNumber(firstValue(query.videosPage))),
  ]);
  if (!module) notFound();

  return (
    <ModuleDetailScreen
      documents={documents}
      message={parseModuleMessage(firstValue(query.m))}
      mocks={mocks}
      module={module}
      profile={profile}
      videos={videos}
    />
  );
}
