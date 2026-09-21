import type { Metadata } from "next";

import { requireRole } from "@/features/auth/guards";
import { EditQuestionRoute } from "@/features/question-bank/components/routes";

export const metadata: Metadata = { title: "Edit question" };

export default async function EditQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("mentor");
  const { id } = await params;
  return <EditQuestionRoute id={id} profile={profile} searchParams={await searchParams} />;
}
