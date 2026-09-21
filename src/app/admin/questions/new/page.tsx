import type { Metadata } from "next";

import { requireRole } from "@/features/auth/guards";
import { NewQuestionRoute } from "@/features/question-bank/components/routes";

export const metadata: Metadata = { title: "New question" };

export default async function NewQuestionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");
  return <NewQuestionRoute profile={profile} searchParams={await searchParams} />;
}
