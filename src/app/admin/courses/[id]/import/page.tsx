import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ImportScreen } from "@/features/ars/components/import-screen";
import { buildImportPrompt } from "@/features/ars/import-prompt";
import { listRounds } from "@/features/ars/queries/list-rounds";
import { RoleShell } from "@/features/auth/components/role-shell";
import { requireRole } from "@/features/auth/guards";
import { parseCourseId } from "@/features/curriculum/list-params";
import { getCourse } from "@/features/curriculum/queries/get-course";

export const metadata: Metadata = { title: "Import a process" };

export default async function AdminCourseImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireRole("admin");
  const { id } = await params;

  const courseId = parseCourseId(id);
  if (courseId === null) notFound();

  // A programme this admin may not see comes back as null and becomes a 404,
  // for the same reason the detail page does it: telling a rival organisation's
  // admin that a programme exists but is not theirs is a disclosure in itself.
  const course = await getCourse(courseId);
  if (!course) notFound();

  // Read here rather than inside the screen, so the warning about what an
  // import will destroy is counted from the database on every load rather than
  // from something the browser was told earlier.
  const rounds = await listRounds(courseId);

  return (
    <RoleShell profile={profile} title={course.title}>
      <ImportScreen
        courseId={courseId}
        courseTitle={course.title}
        existingRoundCount={rounds.length}
        prompt={buildImportPrompt()}
      />
    </RoleShell>
  );
}
