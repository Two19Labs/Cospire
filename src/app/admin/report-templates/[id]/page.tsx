import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { TemplateDetailScreen } from "@/features/ars-report/components/template-detail";
import { parseTemplateError, parseTemplateNotice } from "@/features/ars-report/list-params";
import { parseId } from "@/features/ars-report/template-input";
import { getTemplate } from "@/features/ars-report/queries/get-template";

export const metadata: Metadata = { title: "Report template" };

export default async function ReportTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");

  // A URL segment is user input. Anything that is not a positive whole number is
  // a 404 rather than a malformed query sent to Postgres.
  const templateId = parseId((await params).id);
  if (templateId === null) notFound();

  const template = await getTemplate(templateId);
  // RLS filters a template outside this admin's reach to no row, which is
  // indistinguishable from a deleted one and is meant to be.
  if (!template) notFound();

  const query = await searchParams;
  return (
    <TemplateDetailScreen
      error={parseTemplateError(query.templateError)}
      notice={parseTemplateNotice(query.templateNotice)}
      profile={profile}
      template={template}
    />
  );
}
