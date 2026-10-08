import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { StudentReadingScreen } from "@/features/curriculum/components/student-programme";
import { parsePositiveId } from "@/features/curriculum/curriculum";
import { getStudentProgramme } from "@/features/curriculum/queries/student-programmes";

export const metadata: Metadata = { title: "Reading" };

// A text item. Documents open in the existing viewer and tests in the mock
// screen, so only readings have a page of their own.
export default async function StudentReadingPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const profile = await requireRole("student");
  const { id, itemId } = await params;
  const courseId = parsePositiveId(id);
  const parsedItemId = parsePositiveId(itemId);
  if (courseId === null || parsedItemId === null) notFound();

  const view = await getStudentProgramme(courseId, profile.id);
  const item = view?.sections
    .flatMap((section) => section.items)
    .find((entry) => entry.id === parsedItemId && entry.type === "text");
  if (!view || !item) notFound();

  return (
    <StudentReadingScreen
      courseId={courseId}
      done={view.complete.has(item.id)}
      item={item}
      profile={profile}
      programmeTitle={view.programme.title}
    />
  );
}
