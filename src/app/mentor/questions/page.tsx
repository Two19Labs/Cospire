import type { Metadata } from "next";

import { requireRole } from "@/features/auth/guards";
import { QuestionsRoute } from "@/features/question-bank/components/routes";

export const metadata: Metadata = { title: "Question bank" };

export default async function QuestionBankPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("mentor");
  return <QuestionsRoute profile={profile} searchParams={await searchParams} />;
}
