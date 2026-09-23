import type { Metadata } from "next";

import { requireRole } from "@/features/auth/guards";
import { SectionsScreen } from "@/features/question-bank/components/sections-screen";
import { parseSectionError, parseSectionNotice } from "@/features/question-bank/list-params";
import { listSections } from "@/features/question-bank/queries/list-sections";

export const metadata: Metadata = { title: "Question sections" };

export default async function QuestionSectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");
  const params = await searchParams;
  const sections = await listSections({ withCounts: true });

  return (
    <SectionsScreen
      error={parseSectionError(typeof params.error === "string" ? params.error : undefined)}
      notice={parseSectionNotice(typeof params.notice === "string" ? params.notice : undefined)}
      profile={profile}
      sections={sections}
    />
  );
}
