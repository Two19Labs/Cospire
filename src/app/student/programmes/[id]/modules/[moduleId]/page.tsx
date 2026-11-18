import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { StudentModuleScreen } from "@/features/curriculum/components/student-programme";
import { parsePositiveId } from "@/features/curriculum/curriculum";
import { getStudentModule } from "@/features/curriculum/queries/student-programmes";

export const metadata: Metadata = { title: "Module" };

export default async function StudentModulePage({ params }: { params: Promise<{ id: string; moduleId: string }> }) {
  const profile = await requireRole("student");
  const { id, moduleId } = await params;
  const courseId = parsePositiveId(id);
  const parsedModuleId = parsePositiveId(moduleId);
  if (courseId === null || parsedModuleId === null) notFound();

  // Null unless the module is attached to this programme and RLS shows it.
  const view = await getStudentModule(courseId, parsedModuleId, profile.id);
  if (!view) notFound();

  return <StudentModuleScreen profile={profile} view={view} />;
}
