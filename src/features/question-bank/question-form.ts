// Reading the question editor's form post into a draft, and back.
//
// A Server Action receives whatever a post carries, not what the editor
// rendered, so every field is read defensively: a missing field is an empty
// value, a repeated one is taken once, and nothing is trusted to be a string.

import { maxOptions, type QuestionDraft } from "./question-input";
import { parseId } from "./list-params";

export const optionFieldCount = maxOptions;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function texts(formData: FormData, name: string): string[] {
  return formData.getAll(name).filter((value): value is string => typeof value === "string");
}

export function readQuestionForm(formData: FormData): { draft: QuestionDraft; questionId: number | null } {
  const options = Array.from({ length: optionFieldCount }, (_, index) => text(formData, `option-${index}`));

  const correctOptions = texts(formData, "correct")
    .map((value) => (/^\d{1,2}$/.test(value) ? Number(value) : -1))
    .filter((index) => index >= 0 && index < optionFieldCount);

  return {
    draft: {
      // One accepted form per line: "0.5" on one, "1/2" on the next.
      accepted: text(formData, "accepted").split(/\r?\n/),
      body: text(formData, "body"),
      correctOptions,
      difficulty: text(formData, "difficulty"),
      images: texts(formData, "images"),
      marks: text(formData, "marks"),
      options,
      parentId: parseId(text(formData, "parentId")),
      sectionId: parseId(text(formData, "sectionId")),
      solution: text(formData, "solution"),
      tolerance: text(formData, "tolerance"),
      topic: text(formData, "topic"),
      type: text(formData, "type"),
    },
    questionId: parseId(text(formData, "questionId")),
  };
}

// What the editor shows, whether it came from a saved question or from a post
// that was refused and must be handed back unchanged.
export interface QuestionFormValues {
  accepted: string;
  body: string;
  correctOptions: number[];
  difficulty: string;
  images: string[];
  marks: string;
  options: string[];
  sectionId: string;
  solution: string;
  tolerance: string;
  topic: string;
}

export function draftToFormValues(draft: QuestionDraft): QuestionFormValues {
  return {
    accepted: draft.accepted.join("\n"),
    body: draft.body,
    correctOptions: draft.correctOptions,
    difficulty: draft.difficulty,
    images: draft.images,
    marks: draft.marks,
    options: draft.options,
    sectionId: draft.sectionId ? String(draft.sectionId) : "",
    solution: draft.solution,
    tolerance: draft.tolerance,
    topic: draft.topic,
  };
}

// A saved question and its key, as the database holds them, turned back into
// what the editor shows. Option ids are positional ("a", "b", ...), so the
// correct ones map back to row indexes by position.
export interface StoredQuestion {
  body: string;
  correctAnswer: unknown;
  difficulty: string;
  images: unknown;
  marks: number;
  options: unknown;
  sectionId: number;
  solution: string | null;
  topic: string;
}

export function storedToFormValues(stored: StoredQuestion): QuestionFormValues {
  const options = Array.isArray(stored.options)
    ? stored.options.map((option) =>
        option && typeof option === "object" && typeof (option as { text?: unknown }).text === "string"
          ? (option as { text: string }).text
          : "",
      )
    : [];
  const optionIds = Array.isArray(stored.options)
    ? stored.options.map((option) => String((option as { id?: unknown })?.id ?? ""))
    : [];

  const answer = (stored.correctAnswer ?? {}) as { accepted?: unknown; options?: unknown; tolerance?: unknown };
  const chosen = Array.isArray(answer.options) ? answer.options.map(String) : [];
  const accepted = Array.isArray(answer.accepted) ? answer.accepted.map(String) : [];

  return {
    accepted: accepted.join("\n"),
    body: stored.body,
    correctOptions: optionIds.flatMap((id, index) => (chosen.includes(id) ? [index] : [])),
    difficulty: stored.difficulty,
    images: Array.isArray(stored.images) ? stored.images.map(String) : [],
    marks: String(stored.marks),
    options,
    sectionId: String(stored.sectionId),
    solution: stored.solution ?? "",
    tolerance: typeof answer.tolerance === "number" ? String(answer.tolerance) : "",
    topic: stored.topic,
  };
}

export interface QuestionEditorState {
  problems: string[];
  values: QuestionFormValues | null;
}

export const initialQuestionEditorState: QuestionEditorState = { problems: [], values: null };
