import { notFound } from "next/navigation";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { parseBatchId } from "../import-state";
import { parsePageNumber } from "../list-params";
import { getImportBatch } from "../queries/list-imports";
import { listSections, listTopics } from "../queries/list-sections";
import { ImportReviewScreen } from "./import-review-screen";

// Loads one import for review, plus the DI set passages in it that are already
// approved -- a sub-question is opened for approval only once its passage is a
// real question it can belong to.
export async function ImportReviewRoute({
  batchId: rawBatchId,
  notice,
  orgId,
  page,
}: {
  batchId: string;
  notice: string | null;
  orgId: number;
  page: string | undefined;
}) {
  const batchId = parseBatchId(rawBatchId);
  if (!batchId) notFound();

  const [batch, sections, topics] = await Promise.all([getImportBatch(batchId), listSections(), listTopics()]);
  if (!batch) notFound();

  const approvedSets = batch.rows.filter(
    (row) => row.status === "approved" && row.questionId !== null && row.parsed?.type === "di_stimulus",
  );

  const parentSets: Record<number, { body: string; id: number; sectionId: number }> = {};
  if (approvedSets.length > 0) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("questions")
      .select("id, body, section_id")
      .in(
        "id",
        approvedSets.map((row) => row.questionId as number),
      );
    if (error) throw new Error(`Unable to read the approved DI sets: ${error.message}`);
    for (const row of approvedSets) {
      const question = (data ?? []).find((entry) => Number(entry.id) === row.questionId);
      if (question) {
        parentSets[row.position] = {
          body: String(question.body),
          id: Number(question.id),
          sectionId: Number(question.section_id),
        };
      }
    }
  }

  return (
    <ImportReviewScreen
      batch={batch}
      batchId={batchId}
      notice={notice}
      orgId={orgId}
      page={parsePageNumber(page)}
      parentSets={parentSets}
      sections={sections}
      topics={topics}
    />
  );
}
