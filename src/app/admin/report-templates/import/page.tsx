import type { Metadata } from "next";

import { requireRole } from "@/features/auth/guards";
import { RoleShell } from "@/features/auth/components/role-shell";
import { SectionTabs } from "@/features/admin/components/section-views";
import { TemplateImportScreen } from "@/features/ars-report/components/template-import-screen";
import { templateViews } from "@/features/ars-report/components/templates-screen";
import { buildTemplateImportPrompt } from "@/features/ars-report/template-import-prompt";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

export const metadata: Metadata = { title: "Import report template" };

export default async function ImportReportTemplatePage() {
  const profile = await requireRole("admin");
  const supabase = await createServerSupabaseClient();
  const { data: courses, error } = await supabase.from("courses").select("id, title").order("title").limit(200);
  if (error) throw new Error(`Unable to load programmes: ${error.message}`);
  return (
    <RoleShell
      back={{ href: "/admin/report-templates?view=list", label: "Back to templates" }}
      description="The same reviewed paste-to-build workflow as the ARS process importer. Nothing is saved until you inspect the preview and confirm."
      profile={profile}
      title="Build a report template"
    >
      <SectionTabs current="import" views={templateViews} />
      <TemplateImportScreen courses={courses ?? []} prompt={buildTemplateImportPrompt()} />
    </RoleShell>
  );
}
