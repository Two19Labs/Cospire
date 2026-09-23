// Validation for everything an author types about a question.
//
// The bounds match the constraints in `20260921120000_question_bank.sql`. The
// database is the enforcer; this exists so an author is told what to fix in a
// sentence, and so the importer's review screen can show every problem with a
// parsed question at once instead of the first constraint it trips.
//
// Both the hand-written editor and import approval end in `toSaveQuestionArgs`,
// so there is one shape for a question on its way to `save_question`.

import { numericalAnswerMaxLength, parseNumericalAnswer } from "./numerical";

export const questionTypes = ["mcq", "mcq_multi", "numerical", "di_stimulus"] as const;
export type QuestionType = (typeof questionTypes)[number];

export const difficulties = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof difficulties)[number];

export const questionTypeLabels: Record<QuestionType, string> = {
  di_stimulus: "DI set (shared chart or passage)",
  mcq: "Single correct",
  mcq_multi: "Multiple correct",
  numerical: "Typed answer (TITA)",
};

export const questionBodyMaxLength = 20000;
export const solutionMaxLength = 20000;
export const optionTextMaxLength = 2000;
export const minOptions = 2;
export const maxOptions = 10;
export const maxAcceptedForms = 20;
export const maxImages = 10;
export const topicMaxLength = 100;
export const maxMarks = 100;

// Option ids are assigned by position, never taken from an author or a model:
// the key refers to them, and a model asked for identifiers invents colliding
// ones. Ten letters cover the ten-option ceiling.
const optionIds = "abcdefghij".split("");

export interface QuestionDraft {
  accepted: string[];
  body: string;
  correctOptions: number[];
  difficulty: string;
  images: string[];
  marks: string;
  options: string[];
  parentId: number | null;
  sectionId: number | null;
  solution: string;
  tolerance: string;
  topic: string;
  type: string;
}

export interface QuestionOption {
  id: string;
  text: string;
}

export type CorrectAnswer =
  | { options: string[] }
  | { accepted: string[]; tolerance?: number }
  | null;

export interface ValidQuestion {
  body: string;
  correctAnswer: CorrectAnswer;
  difficulty: Difficulty;
  images: string[];
  marks: number;
  options: QuestionOption[];
  parentId: number | null;
  sectionId: number;
  solution: string | null;
  topic: string;
  type: QuestionType;
}

export interface QuestionValidation {
  problems: string[];
  question: ValidQuestion | null;
}

export function normaliseTopic(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

// Marks are numeric(5, 2): up to two decimal places. "2.5" is a real CAT-style
// value; "2.555" is a typo.
function parseMarks(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null;
  return Number(text);
}

function parseTolerance(raw: string): number | null | undefined {
  const text = raw.trim();
  if (text === "") return undefined;
  if (!/^\d{1,6}(\.\d{1,6})?$/.test(text)) return null;
  return Number(text);
}

function isImagePath(path: string, orgId: number): boolean {
  return new RegExp(
    `^org/${orgId}/questions/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(png|jpg|jpeg|gif|webp)$`,
  ).test(path);
}

export function validateQuestion(draft: QuestionDraft, orgId: number): QuestionValidation {
  const problems: string[] = [];

  const type = questionTypes.find((candidate) => candidate === draft.type);
  if (!type) problems.push("Choose a question type.");

  const body = draft.body.replace(/\r\n/g, "\n").trim();
  if (body === "") problems.push(type === "di_stimulus" ? "Write the shared passage or describe the chart." : "Write the question.");
  if (body.length > questionBodyMaxLength) problems.push(`The question is longer than ${questionBodyMaxLength} characters.`);

  if (draft.sectionId === null) problems.push("Choose a section.");

  const topic = normaliseTopic(draft.topic);
  if (topic === "") problems.push("Give the question a topic.");
  if (topic.length > topicMaxLength) problems.push(`The topic is longer than ${topicMaxLength} characters.`);

  const difficulty = difficulties.find((candidate) => candidate === draft.difficulty);
  if (!difficulty) problems.push("Choose a difficulty.");

  let marks: number | null = null;
  if (type === "di_stimulus") {
    // The passage is read, not answered; its sub-questions carry the marks.
    marks = 0;
  } else {
    marks = parseMarks(draft.marks);
    if (marks === null || marks <= 0 || marks > maxMarks) {
      problems.push(`Marks must be a number above 0 and at most ${maxMarks}, with up to two decimals.`);
    }
  }

  if (type === "di_stimulus" && draft.parentId !== null) {
    problems.push("A DI set cannot sit inside another DI set.");
  }

  const images = [...new Set(draft.images.map((path) => path.trim()).filter((path) => path !== ""))];
  if (images.length > maxImages) problems.push(`A question can carry at most ${maxImages} images.`);
  if (images.some((path) => !isImagePath(path, orgId))) problems.push("One of the images could not be recognised. Remove it and add it again.");

  let options: QuestionOption[] = [];
  let correctAnswer: CorrectAnswer = null;

  if (type === "mcq" || type === "mcq_multi") {
    // Blank rows are the unused slots of the editor, not options.
    const kept = draft.options
      .map((text, index) => ({ index, text: text.trim() }))
      .filter((option) => option.text !== "");

    if (kept.length < minOptions) problems.push(`Give at least ${minOptions} options.`);
    if (kept.length > maxOptions) problems.push(`Give at most ${maxOptions} options.`);
    if (kept.some((option) => option.text.length > optionTextMaxLength)) {
      problems.push(`An option is longer than ${optionTextMaxLength} characters.`);
    }

    options = kept.slice(0, maxOptions).map((option, position) => ({ id: optionIds[position], text: option.text }));

    // correctOptions are indexes into the draft's own rows, so map them through
    // the blank-row filter to the ids just assigned.
    const chosen = [...new Set(draft.correctOptions)]
      .map((draftIndex) => kept.findIndex((option) => option.index === draftIndex))
      .filter((position) => position >= 0 && position < options.length)
      .map((position) => options[position].id);

    if (type === "mcq" && chosen.length !== 1) problems.push("Mark exactly one option as correct.");
    if (type === "mcq_multi" && chosen.length < 1) problems.push("Mark at least one option as correct.");
    correctAnswer = { options: chosen };
  }

  if (type === "numerical") {
    const accepted = [...new Set(draft.accepted.map((form) => form.trim()).filter((form) => form !== ""))];
    if (accepted.length === 0) problems.push("Give the correct answer.");
    if (accepted.length > maxAcceptedForms) problems.push(`Give at most ${maxAcceptedForms} accepted forms.`);
    for (const form of accepted) {
      if (form.length > numericalAnswerMaxLength || parseNumericalAnswer(form) === null) {
        problems.push(`"${form}" is not a number the answer box can compare. Use forms like 12, 0.5 or 1/2.`);
      }
    }

    const tolerance = parseTolerance(draft.tolerance);
    if (tolerance === null) problems.push("Tolerance must be a plain number, such as 0.01, or left blank.");
    correctAnswer = tolerance ? { accepted, tolerance } : { accepted };
  }

  const solution = draft.solution.replace(/\r\n/g, "\n").trim();
  if (solution.length > solutionMaxLength) problems.push(`The solution is longer than ${solutionMaxLength} characters.`);

  if (problems.length > 0 || !type || !difficulty || marks === null || draft.sectionId === null) {
    return { problems, question: null };
  }

  return {
    problems,
    question: {
      body,
      correctAnswer,
      difficulty,
      images,
      marks,
      options,
      parentId: draft.parentId,
      sectionId: draft.sectionId,
      solution: type === "di_stimulus" || solution === "" ? null : solution,
      topic,
      type,
    },
  };
}

// The argument object for `rpc("save_question")`. `questionId` is null for a
// new question.
export function toSaveQuestionArgs(question: ValidQuestion, questionId: number | null) {
  return {
    p_body: question.body,
    p_correct_answer: question.correctAnswer,
    p_difficulty: question.difficulty,
    p_images: question.images,
    p_marks: question.marks,
    p_options: question.options,
    p_parent_id: question.parentId,
    p_question_id: questionId,
    p_section_id: question.sectionId,
    p_solution: question.solution,
    p_topic: question.topic,
    p_type: question.type,
  };
}
