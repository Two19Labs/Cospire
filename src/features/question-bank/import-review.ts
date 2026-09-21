// Between a staged import row and the question editor.
//
// Pure, so the review screen and the staging action agree on what a staged
// question means, and so both are testable.

import type { StagedQuestion } from "./import-spec";
import type { QuestionFormValues } from "./question-form";
import { validateQuestion } from "./question-input";

export interface SectionRef {
  id: number;
  name: string;
}

// A model writes "Quant" where the list says "QA" often enough that only an
// exact, case-insensitive match is trusted. Anything else is left for the admin
// to choose, rather than filed under a guess the analytics would then repeat.
export function matchSection(name: string, sections: SectionRef[]): number | null {
  const wanted = name.trim().replace(/\s+/g, " ").toLowerCase();
  if (!wanted) return null;
  return sections.find((section) => section.name.toLowerCase() === wanted)?.id ?? null;
}

// The document rarely states marks for every question. An admin gives one value
// for the batch, applied only where the question has none.
export function parseDefaultMarks(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return "";
  const text = raw.trim();
  return /^\d{1,3}(\.\d{1,2})?$/.test(text) && Number(text) > 0 && Number(text) <= 100 ? text : null;
}

export function applyDefaultMarks(staged: StagedQuestion, defaultMarks: string): StagedQuestion {
  if (staged.type === "di_stimulus" || staged.marks !== "" || defaultMarks === "") return staged;
  return { ...staged, marks: defaultMarks };
}

export function stagedToFormValues(staged: StagedQuestion, sectionId: number | null): QuestionFormValues {
  return {
    accepted: staged.accepted.join("\n"),
    body: staged.body,
    correctOptions: staged.correctOptions,
    difficulty: staged.difficulty,
    images: [],
    marks: staged.marks,
    options: staged.options,
    sectionId: sectionId ? String(sectionId) : "",
    solution: staged.solution,
    tolerance: staged.tolerance,
    topic: staged.topic,
  };
}

// The problems stored on the staged row: what the admin must fix before this
// question can be approved, measured by the same validator approval uses.
// Images are not counted -- a figure is noted, not required. A sub-question
// takes its set's section at approval, so its own is never a problem.
export function reviewProblems(staged: StagedQuestion, sectionId: number | null, orgId: number): string[] {
  const { problems } = validateQuestion(
    {
      accepted: staged.accepted,
      body: staged.body,
      correctOptions: staged.correctOptions,
      difficulty: staged.difficulty,
      images: [],
      marks: staged.marks,
      options: staged.options,
      parentId: null,
      sectionId: staged.parentPosition === null ? sectionId : sectionId ?? 1,
      solution: staged.solution,
      tolerance: staged.tolerance,
      topic: staged.topic,
      type: staged.type,
    },
    orgId,
  );
  return problems;
}
