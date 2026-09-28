import { describe, expect, it } from "vitest";

import { layOutPaper, type QuestionTags } from "./paper-layout";

const tags = (id: number, type = "mcq", parentId: number | null = null): QuestionTags => ({
  difficulty: "easy",
  id,
  marks: 3,
  parentId,
  section: "QA",
  topic: `T${id}`,
  type,
});

// Ids deliberately out of paper order, so numbering by id would be caught.
const questions = new Map<number, QuestionTags>([
  [50, tags(50)],
  [10, tags(10)],
  [40, tags(40, "di_stimulus")],
  [42, tags(42, "numerical", 40)],
  [41, tags(41, "numerical", 40)],
  [30, tags(30)],
]);
const childrenOf = new Map([[40, [42, 41]]]);
const sections = [
  { durationMinutes: 10, id: 2, sortOrder: 2, title: "Second" },
  { durationMinutes: 10, id: 1, sortOrder: 1, title: "First" },
];

describe("numbering a paper as the attempt screen does", () => {
  it("sections by sort order, then placements by sort order, a DI passage expanded into its sub-questions by id", () => {
    const paper = layOutPaper(
      sections,
      [
        { questionId: 30, sectionId: 2, sortOrder: 1 },
        { questionId: 50, sectionId: 1, sortOrder: 2 },
        { questionId: 10, sectionId: 1, sortOrder: 3 },
        { questionId: 40, sectionId: 2, sortOrder: 4 },
        // The builder also places each sub-question as its own row.
        { questionId: 41, sectionId: 2, sortOrder: 5 },
        { questionId: 42, sectionId: 2, sortOrder: 6 },
      ],
      questions,
      childrenOf,
    );
    expect(paper.map((question) => [question.number, question.id])).toEqual([
      [1, 50],
      [2, 10],
      [3, 30],
      [4, 41],
      [5, 42],
    ]);
  });

  it("the passage itself is never a question, and a sub-question is listed once", () => {
    const paper = layOutPaper(sections, [{ questionId: 40, sectionId: 1, sortOrder: 1 }, { questionId: 42, sectionId: 1, sortOrder: 2 }], questions, childrenOf);
    expect(paper.map((question) => question.id)).toEqual([41, 42]);
  });
});
