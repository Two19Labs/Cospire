import type { Metadata } from "next";

import { requireRole } from "@/features/auth/guards";
import { RoleShell } from "@/features/auth/components/role-shell";
import { TemplateImportScreen } from "@/features/ars-report/components/template-import-screen";
import { buildTemplateImportPrompt } from "@/features/ars-report/template-import-prompt";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

export const metadata: Metadata = { title: "Import report template" };

export default async function ImportReportTemplatePage() {
  const profile = await requireRole("admin");
  const supabase = await createServerSupabaseClient();
  const { data: courses, error } = await supabase.from("courses").select("id, title").order("title").limit(200);
  if (error) throw new Error(`Unable to load programmes: ${error.message}`);
  return <RoleShell profile={profile} title="Import report template"><TemplateImportScreen courses={courses ?? []} prompt={buildTemplateImportPrompt()} /></RoleShell>;
}
