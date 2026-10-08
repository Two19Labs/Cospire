import type { Metadata } from "next";

import { getImportRound } from "@/features/ars/queries/round-import";
import { RoleShell } from "@/features/auth/components/role-shell";
import { requireRole } from "@/features/auth/guards";
import { QuestionImportScreen } from "@/features/question-bank/components/import-screen";
import { buildQuestionImportPrompt } from "@/features/question-bank/import-prompt";
import { listImportBatches } from "@/features/question-bank/queries/list-imports";
import { listSections } from "@/features/question-bank/queries/list-sections";

export const metadata: Metadata = { title: "Import a paper" };

// Mock-first import (D7): the same importer as the question bank's, opened from
// Mock tests, so the review ends by building the mock from the paper.
//
// Also opened from an ARS aptitude round (D8) as `?round=<id>`: the mock it
// builds then links itself to that round. A round id this admin cannot read,
// or one that is not an off-platform round, is ignored rather than trusted.
export default async function ImportPaperPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");
  const params = await searchParams;
  const roundRaw = typeof params.round === "string" ? params.round : "";
  const [batches, sections, round] = await Promise.all([
    listImportBatches(),
    listSections(),
    /^[1-9][0-9]{0,15}$/.test(roundRaw) ? getImportRound(Number(roundRaw)) : Promise.resolve(null),
  ]);

  return (
    <RoleShell
      back={round ? { href: `/admin/ars/${round.courseId}/rounds/${round.id}`, label: `Back to ${round.name}` } : { href: "/admin/mocks", label: "Back to mock tests" }}
      description={`Open the paper, get it read, review its questions, then build the mock. New questions go into the bank; ones it already holds are linked, not copied.${round ? ` The mock links itself to the ARS round “${round.name}”.` : ""}`}
      profile={profile}
      title="Import a paper"
    >
      <QuestionImportScreen
        batches={batches}
        buildMock
        linkRoundId={round?.id ?? null}
        modelAvailable={Boolean(process.env.MODEL_BASE_URL ? process.env.MODEL_API_KEY : process.env.GEMINI_API_KEY)}
        modelLabel={process.env.MODEL_BASE_URL ? process.env.MODEL_LABEL || "the model" : "Gemini"}
        notice={null}
        orgId={profile.orgId}
        prompt={buildQuestionImportPrompt()}
        sections={sections}
        startManual={params.paste === "1"}
      />
    </RoleShell>
  );
}
