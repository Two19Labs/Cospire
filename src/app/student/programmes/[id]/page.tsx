import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { StudentProgrammeScreen } from "@/features/curriculum/components/student-programme";
import { parsePositiveId } from "@/features/curriculum/curriculum";
import { getStudentProgramme } from "@/features/curriculum/queries/student-programmes";

export const metadata: Metadata = { title: "Programme" };

export default async function StudentProgrammePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("student");
  const courseId = parsePositiveId((await params).id);
  if (courseId === null) notFound();

  // Null when the student does not hold this programme: RLS hides the row.
  const view = await getStudentProgramme(courseId, profile.id);
  if (!view) notFound();

  return (
    <StudentProgrammeScreen
      profile={profile}
      progressFailed={(await searchParams).progress === "failed"}
      view={view}
    />
  );
}
