import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ImportScreen } from "@/features/ars/components/import-screen";
import { buildImportPrompt } from "@/features/ars/import-prompt";
import { listRounds } from "@/features/ars/queries/list-rounds";
import { RoleShell } from "@/features/auth/components/role-shell";
import { requireRole } from "@/features/auth/guards";
import { parseCourseId } from "@/features/curriculum/list-params";
import { getCourse } from "@/features/curriculum/queries/get-course";

export const metadata: Metadata = { title: "Import an ARS process" };
export default async function AdminArsImportPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole("admin");
  const courseId = parseCourseId((await params).id);
  if (courseId === null) notFound();
  const [course, rounds] = await Promise.all([getCourse(courseId), listRounds(courseId)]);
  if (!course) notFound();
  return <RoleShell profile={profile} title={`${course.title} ARS`}><ImportScreen courseId={courseId} courseTitle={course.title} existingRoundCount={rounds.length} prompt={buildImportPrompt()} /></RoleShell>;
}
