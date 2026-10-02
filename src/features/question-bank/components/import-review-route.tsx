import { notFound } from "next/navigation";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { parseBatchId } from "../import-state";
import { parsePageNumber } from "../list-params";
import { signQuestionImages } from "../queries/get-question";
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

  // The figures the Word upload attached, so the admin sees each one beside the
  // question rather than a path. Signed with the admin's own session, which is
  // what proves `question_images_select_author` rather than stepping round it.
  const imagePaths = [
    ...new Set(batch.rows.flatMap((row) => (row.status === "pending_review" ? row.parsed?.images ?? [] : []))),
  ];
  const imageUrls = await signQuestionImages(imagePaths);

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

  // The bank questions a pending row may be the same as, so the admin compares
  // the two texts before deciding. Read through the admin's own session.
  const candidateIds = [
    ...new Set(
      batch.rows.flatMap((row) => {
        const verdict = row.status === "pending_review" ? row.parsed?.duplicate : undefined;
        if (!verdict) return [];
        if (verdict.kind === "same") return [verdict.questionId];
        if (verdict.kind === "possible") return verdict.candidates.flatMap((candidate) => (candidate.source === "bank" ? [candidate.questionId] : []));
        return [];
      }),
    ),
  ];
  const bankTexts: Record<number, string> = {};
  if (candidateIds.length > 0) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.from("questions").select("id, body").in("id", candidateIds);
    if (error) throw new Error(`Unable to read the matching questions: ${error.message}`);
    for (const question of data ?? []) bankTexts[Number(question.id)] = String(question.body);
  }

  return (
    <ImportReviewScreen
      bankTexts={bankTexts}
      batch={batch}
      batchId={batchId}
      imageUrls={imageUrls}
      notice={notice}
      orgId={orgId}
      page={parsePageNumber(page)}
      parentSets={parentSets}
      sections={sections}
      topics={topics}
    />
  );
}
