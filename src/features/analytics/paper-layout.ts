// A mock's answerable questions in the order a student meets them, numbered
// exactly as the attempt screen numbers them. Not re-implemented: this feeds
// the engine's own `buildItems` the same inputs `getAttemptView` does --
// sections by sort order, top-level placements by sort order, and a DI passage
// expanded into its sub-questions in id order. The builder also places each
// sub-question as a `mock_questions` row of its own, so a row whose parent is
// placed in the same mock is reached through the parent, not listed again.
//
// Sub-questions are included archived or not, as the engine scores and shows
// them: archiving a question does not change what was sat.

import { buildItems, type PaperSection, type PlacedQuestion } from "@/features/test-engine/paper";

import type { PaperQuestion } from "./aggregate";

export interface QuestionTags {
  difficulty: string;
  id: number;
  marks: number;
  parentId: number | null;
  section: string;
  topic: string;
  type: string;
}

export interface Placement {
  questionId: number;
  sectionId: number;
  sortOrder: number;
}

export function layOutPaper(
  sections: PaperSection[],
  placements: Placement[],
  questions: Map<number, QuestionTags>,
  childrenOf: Map<number, number[]>,
): PaperQuestion[] {
  const ordered = [...placements].sort((a, b) => a.sortOrder - b.sortOrder);
  const placedIds = new Set(ordered.map((row) => row.questionId));
  const placed: PlacedQuestion[] = ordered
    .filter((row) => {
      const parent = questions.get(row.questionId)?.parentId;
      return parent === null || parent === undefined || !placedIds.has(parent);
    })
    .map((row) => ({
      childIds: [...(childrenOf.get(row.questionId) ?? [])].sort((a, b) => a - b),
      isStimulus: questions.get(row.questionId)?.type === "di_stimulus",
      questionId: row.questionId,
      sectionId: row.sectionId,
    }));

  return buildItems(sections, placed).flatMap((item) => {
    const tags = questions.get(item.questionId);
    return tags
      ? [{ difficulty: tags.difficulty, id: tags.id, marks: tags.marks, number: item.number, section: tags.section, topic: tags.topic }]
      : [];
  });
}
