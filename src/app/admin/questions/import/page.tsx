import type { Metadata } from "next";

import { RoleShell } from "@/features/auth/components/role-shell";
import { requireRole } from "@/features/auth/guards";
import { QuestionImportScreen } from "@/features/question-bank/components/import-screen";
import { buildQuestionImportPrompt } from "@/features/question-bank/import-prompt";
import { listImportBatches } from "@/features/question-bank/queries/list-imports";

export const metadata: Metadata = { title: "Import questions" };

export default async function ImportQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");
  const params = await searchParams;
  const batches = await listImportBatches();

  return (
    <RoleShell profile={profile} title="Import questions">
      <QuestionImportScreen
        batches={batches}
        notice={params.notice === "discarded" ? "The questions that were not approved were discarded." : null}
        modelAvailable={Boolean(process.env.MODEL_BASE_URL ? process.env.MODEL_API_KEY : process.env.GEMINI_API_KEY)}
        modelLabel={process.env.MODEL_BASE_URL ? process.env.MODEL_LABEL || "the model" : "Gemini"}
        orgId={profile.orgId}
        prompt={buildQuestionImportPrompt()}
      />
    </RoleShell>
  );
}
