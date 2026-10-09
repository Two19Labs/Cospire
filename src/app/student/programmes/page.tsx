import type { Metadata } from "next";

import { requireRole } from "@/features/auth/guards";
import { StudentProgrammeList } from "@/features/curriculum/components/student-programme";
import { parsePageNumber } from "@/features/curriculum/list-params";
import { listStudentProgrammes } from "@/features/curriculum/queries/student-programmes";

export const metadata: Metadata = { title: "Programmes" };

export default async function StudentProgrammesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("student");
  const raw = (await searchParams).page;
  const list = await listStudentProgrammes(parsePageNumber(typeof raw === "string" ? raw : undefined), profile.id);
  return <StudentProgrammeList {...list} profile={profile} />;
}
