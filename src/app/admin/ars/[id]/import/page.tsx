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
  return (
    <RoleShell
      back={{ href: `/admin/ars/${courseId}`, label: course.title }}
      description={
        <>
          For <strong>{course.title}</strong>. Copy the prompt below into any AI model along with
          the institution&apos;s admission-process document, then paste its answer back here.
          Nothing is created until you have checked it.
        </>
      }
      profile={profile}
      title="Build from a document"
    >
      <ImportScreen courseId={courseId} courseTitle={course.title} existingRoundCount={rounds.length} prompt={buildImportPrompt()} />
    </RoleShell>
  );
}
