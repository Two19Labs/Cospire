// Reading a language model's answer back into questions for review.
//
// The mechanism the founder agreed on 2026-09-16: a standard prompt run in the
// model the Client already has, with a question document attached, and the
// answer pasted in here. No API key, no per-call bill, no Google account.
//
// **Pasted output is untrusted input.** It came from a model reading a document
// nobody here has seen. So this is lenient about NAMES -- "question", "stem" and
// "text" all mean the body -- and strict about VALUES, the same asymmetry as the
// ARS importer: a wrong name is a synonym, a wrong value is a wrong answer key.
//
// Nothing parsed here reaches `questions`. It is staged in `question_imports`
// and an admin approves each question by hand (Annexure A). A question the
// parser could not fully read is still staged, carrying its problems, so the
// admin fixes it on the review screen instead of losing it.
//
// Pure and dependency-free so it can be tested against pastes a model really
// produces.

import { extractJsonBlock } from "@/features/ars/import-spec";

import { parseNumericalAnswer } from "./numerical";
import {
  maxAcceptedForms,
  maxOptions,
  optionTextMaxLength,
  questionBodyMaxLength,
  solutionMaxLength,
  topicMaxLength,
  type QuestionType,
} from "./question-input";

export const maxQuestionsPerImport = 200;
const sourceMaxLength = 5000;

// What is staged for one question, in the editor's own terms so the review
// screen can open it without translation.
export interface StagedQuestion {
  accepted: string[];
  body: string;
  correctOptions: number[];
  difficulty: string;
  // The figure numbers this question referred to, in the order they appeared.
  // What the text asked for; `images` is what it got.
  figures: number[];
  // Image paths resolved from `figures` when the document was a Word upload.
  // Empty for a plain paste, where there is nothing on this side to resolve to.
  images: string[];
  marks: string;
  // Notes the admin should read but that do not stop approval.
  notes: string[];
  options: string[];
  // For a DI sub-question: the position, within this import, of its passage.
  parentPosition: number | null;
  sectionName: string;
  solution: string;
  source: string;
  tolerance: string;
  topic: string;
  type: QuestionType;
}

export interface ImportedItem {
  // Null when the entry could not be read as a question at all.
  parsed: StagedQuestion | null;
  position: number;
  // Reasons it cannot be approved as it stands.
  problems: string[];
  raw: Record<string, unknown>;
}

export interface QuestionImportOutcome {
  documentName: string | null;
  // Reasons the whole paste was refused. Per-question problems are on the items.
  problems: string[];
  items: ImportedItem[];
}

// ---------------------------------------------------------------------------
// Forgiving readers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(source: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const value = source[name];
    if (typeof value === "string" && value.trim() !== "") return value.replace(/\r\n/g, "\n").trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function readValue(source: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (source[name] !== undefined && source[name] !== null && source[name] !== "") return source[name];
  }
  return undefined;
}

function readList(source: Record<string, unknown>, ...names: string[]): unknown[] {
  for (const name of names) {
    if (Array.isArray(source[name])) return source[name] as unknown[];
  }
  return [];
}

function normaliseWord(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

const typeWords: Record<string, QuestionType | "set"> = {
  "di": "set",
  "di set": "set",
  "di stimulus": "set",
  "data interpretation": "set",
  "caselet": "set",
  "comprehension": "set",
  "passage": "set",
  "rc": "set",
  "set": "set",
  "integer": "numerical",
  "mcq": "mcq",
  "mcq multi": "mcq_multi",
  "msq": "mcq_multi",
  "multi": "mcq_multi",
  "multiple": "mcq_multi",
  "multiple choice": "mcq",
  "multiple correct": "mcq_multi",
  "multiple select": "mcq_multi",
  "numeric": "numerical",
  "numerical": "numerical",
  "single": "mcq",
  "single choice": "mcq",
  "single correct": "mcq",
  "tita": "numerical",
  "type in the answer": "numerical",
};

const difficultyWords: Record<string, string> = {
  difficult: "hard",
  e: "easy",
  easy: "easy",
  h: "hard",
  hard: "hard",
  high: "hard",
  low: "easy",
  m: "medium",
  medium: "medium",
  moderate: "medium",
  simple: "easy",
  tough: "hard",
};

// Figure markers, in both shapes the prompt allows.
//
// `[[figure:3]]` is what the Word importer writes, having already taken picture
// 3 out of the document. The number is the only link between the two, so it is
// carried through to staging and resolved to an image path there. A bare
// `[[figure]]` is what a model writes when it reads a document directly, with no
// picture on this side to link to, so it stays what it always was: a note
// telling the admin to paste the image in on the review screen.
//
// The marker itself never reaches the question. It is scaffolding between the
// document and the bank, and a question body reading "[[figure:3]]" in front of
// a student would be a defect.
// The alternation is ordered longest first, and must stay that way. With
// `fig` before `figure`, `[[figure:3]]` matches on `fig`, the `ure:3` is then
// eaten by the trailing `[^\]]*`, and the number is silently lost: the marker
// still disappears from the text, so the only visible symptom is a figure that
// never attaches to anything.
const figureMarker = /\[\[\s*(?:figure|diagram|picture|image|graph|chart|table|fig)\s*[:#-]?\s*(\d{1,3})?[^\]]*\]\]/gi;

interface FigureScan {
  // The numbers this text referred to, in order, deduplicated.
  numbers: number[];
  text: string;
  // A marker carrying no number.
  unnumbered: boolean;
}

function takeFigures(text: string): FigureScan {
  const numbers: number[] = [];
  let unnumbered = false;

  const stripped = text.replace(figureMarker, (_whole: string, digits: string | undefined) => {
    if (digits === undefined) {
      unnumbered = true;
      return "";
    }
    const n = Number(digits);
    if (Number.isInteger(n) && n >= 1 && !numbers.includes(n)) numbers.push(n);
    return "";
  });

  return {
    numbers,
    text: stripped.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim(),
    unnumbered,
  };
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

// "B", "(b)", "Option C", the option's own text, or a 1-based number. Text is
// tried first: with options "2", "3", "4" an answer of "3" means the option
// reading 3, not the third option.
function readChoice(answer: string, options: string[]): number | null {
  const text = answer.trim();
  if (text === "") return null;

  const byText = options.findIndex((option) => option.trim().toLowerCase() === text.toLowerCase());
  if (byText >= 0) return byText;

  const letter = text.match(/^(?:option\s*)?\(?([a-j])\)?[.)]?$/i);
  if (letter) {
    const index = letter[1].toLowerCase().charCodeAt(0) - 97;
    return index < options.length ? index : null;
  }

  if (/^\d{1,2}$/.test(text)) {
    const index = Number(text) - 1;
    return index >= 0 && index < options.length ? index : null;
  }

  return null;
}

function answerParts(value: unknown, split: boolean): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
  if (typeof value === "number") return [String(value)];
  if (typeof value !== "string") return [];
  if (!split) return [value.trim()].filter(Boolean);
  // "A, C", "A and C", "A & C", "A; C". A bare "AC" is two letters too.
  const parts = value.split(/\s*(?:,|;|&|\band\b)\s*/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 1 && /^[a-j]{2,10}$/i.test(parts[0])) return parts[0].split("");
  return parts;
}

// ---------------------------------------------------------------------------
// One question
// ---------------------------------------------------------------------------

interface Inherited {
  difficulty: string;
  sectionName: string;
  topic: string;
}

function readQuestion(
  raw: Record<string, unknown>,
  where: string,
  inherited: Inherited | null,
): { parsed: StagedQuestion | null; problems: string[] } {
  const problems: string[] = [];
  const notes: string[] = [];

  const typeWord = readText(raw, "type", "questionType", "question_type", "kind", "format");
  let type: QuestionType | "set" | null = typeWord ? typeWords[normaliseWord(typeWord)] ?? null : null;

  const optionList = readList(raw, "options", "choices", "answers_options", "alternatives");
  const options = optionList.map((option) =>
    isRecord(option) ? readText(option, "text", "label", "value", "option") : String(option ?? "").trim(),
  );

  if (typeWord && !type) {
    problems.push(`${where}: "${typeWord}" is not a question type this bank holds.`);
  }
  // No type given: options mean a choice question, none means a typed answer.
  if (!typeWord) type = options.length > 0 ? "mcq" : "numerical";
  if (type === "set") {
    problems.push(`${where}: a DI set cannot sit inside another set.`);
    type = null;
  }

  const rawBody = readText(raw, "question", "body", "stem", "text", "prompt");
  const bodyScan = takeFigures(rawBody);
  const body = bodyScan.text;
  const figures = [...bodyScan.numbers];
  let unnumbered = bodyScan.unnumbered;
  if (body === "" && figures.length === 0 && !unnumbered) problems.push(`${where}: the question text is missing.`);
  if (body.length > questionBodyMaxLength) problems.push(`${where}: the question is longer than ${questionBodyMaxLength} characters.`);

  // A figure inside an answer option: kept, because the bytes exist and losing
  // them would be worse, but always flagged. Images attach to a question as a
  // set, so an image that belongs in one option cannot be shown in its place,
  // and the honest fix is for the admin to retype the option.
  const cleanOptions = options.map((option) => takeFigures(option));
  for (const option of cleanOptions) {
    for (const n of option.numbers) if (!figures.includes(n)) figures.push(n);
    if (option.unnumbered) unnumbered = true;
  }
  const optionFigures = cleanOptions.flatMap((option) => option.numbers);
  if (cleanOptions.some((option) => option.numbers.length > 0 || option.unnumbered)) {
    notes.push(
      optionFigures.length > 0
        ? `An option contains ${optionFigures.length === 1 ? `figure ${optionFigures[0]}` : `figures ${optionFigures.join(", ")}`}. It is attached to the question; retype the option so it reads on its own.`
        : "An option contains a figure. Add it as an image, or retype the option.",
    );
  }

  let correctOptions: number[] = [];
  let accepted: string[] = [];
  let tolerance = "";
  const answer = readValue(raw, "answer", "correct", "correctAnswer", "correct_answer", "key", "answerKey");

  if (type === "mcq" || type === "mcq_multi") {
    if (options.length < 2) problems.push(`${where}: a choice question needs at least two options.`);
    if (options.length > maxOptions) problems.push(`${where}: at most ${maxOptions} options are allowed.`);
    if (options.some((option) => option.length > optionTextMaxLength)) problems.push(`${where}: an option is too long.`);

    const parts = answerParts(answer, type === "mcq_multi");
    const picked = parts.map((part) => readChoice(part, options));
    if (parts.length === 0) {
      problems.push(`${where}: no answer was given. Mark the correct option.`);
    } else if (picked.some((index) => index === null)) {
      problems.push(`${where}: the answer "${parts.join(", ")}" does not match any option. Mark the correct one.`);
    } else {
      correctOptions = [...new Set(picked as number[])];
      // A model sometimes calls a multi-answer question a plain MCQ. Two
      // correct options is not ambiguous, so the type follows the key.
      if (type === "mcq" && correctOptions.length > 1) {
        type = "mcq_multi";
        notes.push("Two or more answers were given, so this is set as multiple correct.");
      }
    }
  }

  if (type === "numerical") {
    if (options.length > 0) notes.push("Options were given for a typed-answer question and were left out.");
    accepted = answerParts(answer, false).flatMap((part) => part.split(/\s*(?:\bor\b|\|)\s*/i)).filter(Boolean);
    accepted = [...new Set(accepted)].slice(0, maxAcceptedForms);
    if (accepted.length === 0) {
      problems.push(`${where}: no answer was given. Enter the correct answer.`);
    } else if (accepted.some((form) => parseNumericalAnswer(form) === null)) {
      problems.push(`${where}: the answer "${accepted.join(" / ")}" is not a number the answer box can compare.`);
    }
    const rawTolerance = readValue(raw, "tolerance", "range", "margin");
    if (typeof rawTolerance === "number" && rawTolerance >= 0) tolerance = String(rawTolerance);
    else if (typeof rawTolerance === "string" && /^\d+(\.\d+)?$/.test(rawTolerance.trim())) tolerance = rawTolerance.trim();
  }

  const sectionName = readText(raw, "section", "sectionName", "section_name", "area", "subject") || inherited?.sectionName || "";
  if (!sectionName) notes.push("No section was given. Choose one before approving.");

  const topic = (readText(raw, "topic", "subtopic", "chapter", "concept") || inherited?.topic || "")
    .replace(/\s+/g, " ")
    .slice(0, topicMaxLength);
  if (!topic) problems.push(`${where}: no topic was given. Every question needs one.`);

  const difficultyWord = readText(raw, "difficulty", "level", "difficultyLevel");
  const difficulty = difficultyWord ? difficultyWords[normaliseWord(difficultyWord)] ?? "" : inherited?.difficulty ?? "";
  if (!difficulty) problems.push(`${where}: no difficulty was given. Choose easy, medium or hard.`);

  const marksValue = readValue(raw, "marks", "mark", "score", "points");
  const marks =
    typeof marksValue === "number" && marksValue > 0
      ? String(marksValue)
      : typeof marksValue === "string" && /^\d{1,3}(\.\d{1,2})?$/.test(marksValue.trim())
        ? marksValue.trim()
        : "";

  const solution = readText(raw, "solution", "explanation", "workings", "working").slice(0, solutionMaxLength);
  const source = readText(raw, "source", "original", "sourceText", "source_text").slice(0, sourceMaxLength);
  if (unnumbered) notes.push("The document has a figure here. Paste or upload it before approving.");

  if (!type) return { parsed: null, problems };

  return {
    parsed: {
      accepted,
      body: body.slice(0, questionBodyMaxLength),
      correctOptions,
      difficulty,
      figures,
      images: [],
      marks,
      notes,
      options: cleanOptions.map((option) => option.text).slice(0, maxOptions),
      parentPosition: null,
      sectionName,
      solution,
      source,
      tolerance,
      topic,
      type,
    },
    problems,
  };
}

function readSet(
  raw: Record<string, unknown>,
  where: string,
): { stimulus: StagedQuestion | null; problems: string[]; children: Record<string, unknown>[] } {
  const problems: string[] = [];
  const notes: string[] = [];

  const scan = takeFigures(readText(raw, "passage", "stimulus", "body", "question", "text", "data"));
  const body = scan.text;
  if (body === "" && scan.numbers.length === 0 && !scan.unnumbered) {
    problems.push(`${where}: the set's passage or chart description is missing.`);
  }
  if (scan.unnumbered) notes.push("The set's chart or table is a figure. Paste or upload it before approving.");

  const children = readList(raw, "questions", "subQuestions", "sub_questions", "items", "children").filter(isRecord);
  if (children.length === 0) problems.push(`${where}: the set has no sub-questions.`);

  const sectionName = readText(raw, "section", "sectionName", "section_name", "area", "subject");
  if (!sectionName) notes.push("No section was given. Choose one before approving.");
  const topic = readText(raw, "topic", "subtopic", "chapter", "concept").replace(/\s+/g, " ").slice(0, topicMaxLength);
  if (!topic) problems.push(`${where}: no topic was given. Every question needs one.`);
  const difficultyWord = readText(raw, "difficulty", "level");
  const difficulty = difficultyWord ? difficultyWords[normaliseWord(difficultyWord)] ?? "" : "";
  if (!difficulty) problems.push(`${where}: no difficulty was given. Choose easy, medium or hard.`);

  return {
    children,
    problems,
    stimulus: {
      accepted: [],
      body: body.slice(0, questionBodyMaxLength),
      correctOptions: [],
      difficulty,
      figures: scan.numbers,
      images: [],
      marks: "0",
      notes,
      options: [],
      parentPosition: null,
      sectionName,
      solution: "",
      source: readText(raw, "source", "original", "sourceText").slice(0, sourceMaxLength),
      tolerance: "",
      topic,
      type: "di_stimulus",
    },
  };
}

// ---------------------------------------------------------------------------
// The whole paste
// ---------------------------------------------------------------------------

export function parseImportedQuestions(pasted: string): QuestionImportOutcome {
  const refused = (problem: string): QuestionImportOutcome => ({ documentName: null, items: [], problems: [problem] });

  // The shared extractor finds an object. A model asked for an object sometimes
  // answers with just the list, which is unambiguous, so that is read first.
  const unfenced = (pasted.match(/```(?:json|JSON)?\s*([\s\S]*?)```/)?.[1] ?? pasted).trim();
  const json = unfenced.startsWith("[") ? unfenced : extractJsonBlock(pasted);
  if (!json) return refused("There is no JSON in what you pasted. Copy the model's whole answer, including the curly braces.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return refused(
      "That is not valid JSON. It may have been cut off part way — copy the model's whole answer, from the first { to the last }, without editing it.",
    );
  }

  // A bare list is an obvious enough answer to accept.
  const root = Array.isArray(parsed) ? { questions: parsed } : parsed;
  if (!isRecord(root)) return refused("The pasted JSON must be an object with a list of questions.");

  const entries = readList(root, "questions", "items", "data", "mcqs");
  if (entries.length === 0) return refused('No questions in the pasted JSON. The model should return a "questions" list.');

  const items: ImportedItem[] = [];
  const add = (item: Omit<ImportedItem, "position">) => items.push({ ...item, position: items.length });

  entries.forEach((entry, index) => {
    const where = `Question ${index + 1}`;
    if (!isRecord(entry)) {
      add({ parsed: null, problems: [`${where}: not a question object.`], raw: { value: entry } });
      return;
    }

    const typeWord = readText(entry, "type", "questionType", "question_type", "kind", "format");
    const isSet =
      (typeWord && typeWords[normaliseWord(typeWord)] === "set") ||
      (!typeWord && Array.isArray(entry.questions) && readText(entry, "passage", "stimulus") !== "");

    if (!isSet) {
      const { parsed: question, problems } = readQuestion(entry, where, null);
      add({ parsed: question, problems, raw: entry });
      return;
    }

    const set = readSet(entry, `${where} (DI set)`);
    const setPosition = items.length;
    // The set's own row carries the passage; its sub-questions are staged as
    // rows of their own, so each is reviewed and approved like any question.
    const setRaw = Object.fromEntries(
      Object.entries(entry).filter(([key]) => !["questions", "subQuestions", "sub_questions", "items", "children"].includes(key)),
    );
    add({ parsed: set.stimulus, problems: set.problems, raw: setRaw });

    set.children.forEach((child, childIndex) => {
      const { parsed: question, problems } = readQuestion(child, `${where}, part ${childIndex + 1}`, {
        difficulty: set.stimulus?.difficulty ?? "",
        sectionName: set.stimulus?.sectionName ?? "",
        topic: set.stimulus?.topic ?? "",
      });
      add({
        parsed: question ? { ...question, parentPosition: setPosition } : null,
        problems,
        raw: child,
      });
    });
  });

  if (items.length > maxQuestionsPerImport) {
    return refused(
      `That is ${items.length} questions, and one import takes at most ${maxQuestionsPerImport}. Split the document and import it in parts.`,
    );
  }

  return {
    documentName: readText(root, "document", "documentName", "source", "title", "name") || null,
    items,
    problems: [],
  };
}
