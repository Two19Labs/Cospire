import type { Metadata } from "next";

import { RoleShell } from "@/features/auth/components/role-shell";
import { requireRole } from "@/features/auth/guards";
import { QuestionImportScreen } from "@/features/question-bank/components/import-screen";
import { buildQuestionImportPrompt } from "@/features/question-bank/import-prompt";
import { listImportBatches } from "@/features/question-bank/queries/list-imports";
import { listSections } from "@/features/question-bank/queries/list-sections";

export const metadata: Metadata = { title: "Import a paper" };

// Mock-first import (D7): the same importer as the question bank's, opened from
// Mock tests, so the review ends by building the mock from the paper.
export default async function ImportPaperPage() {
  const profile = await requireRole("admin");
  const [batches, sections] = await Promise.all([listImportBatches(), listSections()]);

  return (
    <RoleShell
      back={{ href: "/admin/mocks", label: "Back to mock tests" }}
      description="Open the paper, get it read, review its questions, then build the mock. New questions go into the bank; ones it already holds are linked, not copied."
      profile={profile}
      title="Import a paper"
    >
      <QuestionImportScreen
        batches={batches}
        buildMock
        modelAvailable={Boolean(process.env.MODEL_BASE_URL ? process.env.MODEL_API_KEY : process.env.GEMINI_API_KEY)}
        modelLabel={process.env.MODEL_BASE_URL ? process.env.MODEL_LABEL || "the model" : "Gemini"}
        notice={null}
        orgId={profile.orgId}
        prompt={buildQuestionImportPrompt()}
        sections={sections}
      />
    </RoleShell>
  );
}
