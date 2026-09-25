// Between a staged import row and the question editor.
//
// Pure, so the review screen and the staging action agree on what a staged
// question means, and so both are testable.

import type { StagedQuestion } from "./import-spec";
import type { QuestionFormValues } from "./question-form";
import { maxImages, validateQuestion } from "./question-input";

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

// Turning `[[figure:3]]` into the image the Word upload put in the bucket.
//
// The parser records the numbers a question's text referred to; this is where
// they become paths, because only the upload knows what it stored. A number with
// no image behind it -- an EMF drawing, a native Word chart, or a number the
// model invented -- becomes a note rather than a silence, so the admin is told
// to paste that one in rather than discovering later that a question is missing
// its chart.
//
// Capped at `maxImages`, which is what the question itself allows: a passage
// quoting eleven figures is staged with ten and told so.
export function attachFigures(staged: StagedQuestion, figurePaths: Record<number, string>): StagedQuestion {
  if (staged.figures.length === 0) return staged;

  const images: string[] = [];
  const missing: number[] = [];
  for (const n of staged.figures) {
    const path = figurePaths[n];
    if (!path) missing.push(n);
    else if (!images.includes(path)) images.push(path);
  }

  const notes = [...staged.notes];
  const kept = images.slice(0, maxImages);
  if (images.length > kept.length) {
    notes.push(`This question named ${images.length} figures and a question carries at most ${maxImages}. The rest were left out.`);
  }
  if (missing.length > 0) {
    notes.push(
      `${missing.length === 1 ? `Figure ${missing[0]} was` : `Figures ${missing.join(", ")} were`} not taken out of the document. Paste ${missing.length === 1 ? "it" : "them"} in before approving.`,
    );
  }

  return { ...staged, images: kept, notes };
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
    // `?? []` because a row staged before the Word upload existed has no
    // `images` key in its JSON at all, and those rows are still reviewable.
    images: staged.images ?? [],
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
// A missing figure is noted, never a problem -- it does not stop approval -- but
// the images that were attached are passed in, so a question carrying a path the
// validator would refuse is caught here rather than at approval.
// A sub-question takes its set's section at approval, so its own is never a
// problem.
export function reviewProblems(staged: StagedQuestion, sectionId: number | null, orgId: number): string[] {
  const { problems } = validateQuestion(
    {
      accepted: staged.accepted,
      body: staged.body,
      correctOptions: staged.correctOptions,
      difficulty: staged.difficulty,
      images: staged.images ?? [],
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
