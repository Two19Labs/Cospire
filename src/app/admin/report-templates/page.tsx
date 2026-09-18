import type { Metadata } from "next";

import { requireRole } from "@/features/auth/guards";
import { TemplatesScreen } from "@/features/ars-report/components/templates-screen";
import { parsePage, parseTemplateError, parseTemplateNotice } from "@/features/ars-report/list-params";
import { listTemplates } from "@/features/ars-report/queries/list-templates";

export const metadata: Metadata = { title: "Report templates" };

export default async function ReportTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");
  const params = await searchParams;
  const templates = await listTemplates({ page: parsePage(params.page) });

  return (
    <TemplatesScreen
      error={parseTemplateError(params.templateError)}
      notice={parseTemplateNotice(params.templateNotice)}
      profile={profile}
      templates={templates}
    />
  );
}
