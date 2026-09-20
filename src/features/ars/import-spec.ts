// Reading an LLM's description of an admission process back into rounds.
//
// The Client has admission processes written down as documents -- Masters'
// Union's runs to four steps, sections inside each step, eight field types and
// a word-limited essay. Building that by hand in the round builder is an
// afternoon per institution, and there are many institutions.
//
// The founder agreed the mechanism on 2026-09-16, for questions: a standard
// prompt run in whatever model the admin already has, with the output pasted
// into a parser here, rather than an API integration the Client pays per call
// for. This is the same mechanism pointed at ARS processes. It needs no Google
// account, no LLM account, no key in the application and no per-call bill --
// all four of which are still owed by the Client and still blocking Phase 3.
//
// Everything here is pure and dependency-free, for the same reason
// `form-schema.ts` is: `queries/` and `actions/` are `server-only`, which
// Next.js resolves through a bundler alias rather than a real package, so
// anything importing them cannot be reached from a unit test. This is the part
// that must be tested, because its input is a language model's best guess.
//
// The governing assumption: **pasted output is untrusted input.** It was
// produced by a model, from a document nobody here has read, and pasted by an
// admin who is trusting both. Nothing it says reaches the database without
// passing the same validation a hand-built form passes, and nothing is written
// at all until a human has seen a preview of it.

import { toKey } from "./form-builder";
import {
  fieldTypes,
  maxFieldsPerStep,
  maxStepsPerForm,
  maxOptionsPerField,
  validateFormSpec,
  type FieldType,
  type FormField,
  type FormSection,
  type FormSpec,
  type FormStep,
} from "./form-schema";
import {
  parseRoundDay,
  roundNameMaxLength,
  roundPromptMaxLength,
  type RoundSubmissionMode,
} from "./round-input";

// Three to five rounds is usual, per the founder. The ceiling is here to stop a
// runaway paste, not to express a product rule.
export const maxRoundsPerImport = 12;

export interface ImportedTestSpec {
  durationMinutes?: number;
  negativeMarking?: boolean;
  questionCount?: number;
  sections?: string[];
}

export interface ImportedRound {
  // Exactly the columns `ars_rounds` takes, so the action inserts this without
  // reshaping it and there is no second place for the two to disagree.
  config: Record<string, unknown>;
  dueAt: string | null;
  name: string;
  opensAt: string | null;
  requiresReview: boolean;
  submissionMode: RoundSubmissionMode;

  // Preview only. Never written.
  fieldCount: number;
  notes: string[];
  pending: boolean;
  spec: FormSpec | null;
}

export interface ImportOutcome {
  problems: string[];
  programmeName: string | null;
  rounds: ImportedRound[];
}

// ---------------------------------------------------------------------------
// Getting to the JSON
// ---------------------------------------------------------------------------

// Models wrap their answer in prose and fences more often than not: "Here's the
// JSON for that process:", a ```json block, then "Let me know if you'd like me
// to adjust anything." Refusing that paste would be technically correct and
// would make the feature feel broken, because the admin cannot see what is
// wrong -- to them they pasted exactly what the model gave them.
//
// So the fences come off, and if what remains still is not JSON, the first
// balanced `{...}` in the text is taken. Brace counting is string-aware, since
// a `{` inside a question's label is common and would otherwise end the scan in
// the wrong place.
export function extractJsonBlock(raw: string): string | null {
  const text = raw.trim();
  if (text === "") return null;

  const fenced = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();

  if (candidate.startsWith("{")) {
    const balanced = readBalancedObject(candidate);
    if (balanced) return balanced;
  }

  const start = candidate.indexOf("{");
  if (start === -1) return null;

  // An object that opens and never closes is returned as it stands, so the
  // parse fails and the admin is told their paste looks cut off. Returning null
  // here would tell them there is no JSON at all, which is both untrue and
  // unactionable -- a half-copied answer is one of the likeliest bad pastes,
  // and "you missed the end" is the sentence that fixes it.
  const fromBrace = candidate.slice(start);
  return readBalancedObject(fromBrace) ?? fromBrace;
}

function readBalancedObject(text: string): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(0, index + 1);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Forgiving readers
// ---------------------------------------------------------------------------
//
// A model told to emit `instructions` will sometimes emit `prompt`, or
// `description`. None of these are ambiguous and all of them mean the same
// thing, so each is accepted rather than rejected. This is deliberately
// asymmetric: we are lenient about the NAMES a model chose and strict about the
// VALUES, because a wrong name is a synonym and a wrong value is a broken round.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const value = source[name];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

function readArray(source: Record<string, unknown>, ...names: string[]): unknown[] {
  for (const name of names) {
    const value = source[name];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function readBoolean(
  source: Record<string, unknown>,
  fallback: boolean,
  ...names: string[]
): boolean {
  for (const name of names) {
    const value = source[name];
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}

function readNumber(source: Record<string, unknown>, ...names: string[]): number | undefined {
  for (const name of names) {
    const value = source[name];
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      const parsed = Number.parseInt(value.trim(), 10);
      if (parsed > 0) return parsed;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

// What a model calls a round type, against what this platform can deliver.
// `test` is not a submission mode -- it is the aptitude round, which has no
// engine behind it yet and is handled separately below.
const roundTypeWords: Record<string, RoundSubmissionMode | "test"> = {
  application: "form",
  aptitude: "test",
  "aptitude test": "test",
  assessment: "test",
  document: "file",
  email: "text",
  "email writing": "text",
  essay: "text",
  file: "file",
  form: "form",
  gd: "offline",
  "group discussion": "offline",
  guesstimate: "offline",
  interview: "offline",
  mock: "test",
  offline: "offline",
  "long answer": "text",
  quiz: "test",
  "short answer": "text",
  test: "test",
  text: "text",
  upload: "file",
  video: "file",
  "video essay": "file",
  written: "text",
};

// What a model calls a field type, against the eleven this platform renders.
// Anything not here is reported rather than guessed at: silently turning an
// unknown type into a text box produces a form that looks right and collects
// the wrong thing.
const fieldTypeWords: Record<string, FieldType> = {
  address: "long_text",
  boolean: "checkbox",
  checkbox: "checkbox",
  choice: "single_choice",
  date: "date",
  dropdown: "select",
  email: "short_text",
  essay: "long_text",
  file: "file",
  integer: "number",
  "long answer": "long_text",
  long_text: "long_text",
  longtext: "long_text",
  mcq: "radio",
  month: "month_year",
  month_year: "month_year",
  monthyear: "month_year",
  multiline: "long_text",
  number: "number",
  paragraph: "long_text",
  phone: "short_text",
  radio: "radio",
  score: "score_list",
  score_list: "score_list",
  select: "select",
  "short answer": "short_text",
  short_text: "short_text",
  shorttext: "short_text",
  single_choice: "single_choice",
  string: "short_text",
  text: "short_text",
  textarea: "long_text",
  upload: "file",
  url: "short_text",
  year: "number",
  yesno: "checkbox",
};

// Sorted once, at module load, rather than inside the matcher.
const longestFirst = Object.entries(roundTypeWords).sort(
  ([left], [right]) => right.length - left.length,
);

function normaliseWord(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

function readRoundType(raw: string): RoundSubmissionMode | "test" | null {
  const word = normaliseWord(raw);
  if (word === "") return null;
  const direct = roundTypeWords[word] ?? roundTypeWords[word.replace(/\s+/g, "_")];
  if (direct) return direct;
  // "video essay submission", "personal interview round" -- a model writing
  // prose where a word was asked for.
  //
  // Longest phrase first, and that ordering is the whole correctness of this
  // loop rather than a tidiness preference: "video essay" contains "essay", so
  // matching in declaration order turns a video upload into a written answer.
  for (const [key, mode] of longestFirst) {
    if (word.includes(key)) return mode;
  }
  return null;
}

function readFieldType(raw: string): FieldType | null {
  const word = normaliseWord(raw);
  if (word === "") return null;
  return (
    fieldTypeWords[word] ??
    fieldTypeWords[word.replace(/\s+/g, "_")] ??
    (fieldTypes.includes(word as FieldType) ? (word as FieldType) : null)
  );
}

// ---------------------------------------------------------------------------
// Fields, sections, pages
// ---------------------------------------------------------------------------

function readField(
  raw: unknown,
  where: string,
  taken: Set<string>,
  problems: string[],
): FormField | null {
  if (!isRecord(raw)) {
    problems.push(`${where}: a question must be an object.`);
    return null;
  }

  const label = readString(raw, "label", "question", "title", "text", "name");
  if (!label) {
    problems.push(`${where}: a question needs a label.`);
    return null;
  }

  const rawType = readString(raw, "type", "fieldType", "field_type", "inputType", "input_type");
  // A model that omits the type almost always meant a plain text answer, and
  // that is the one guess worth making: it is the least surprising default and
  // it is visible in the preview, where an admin can see the whole form before
  // a student ever does.
  const type = rawType ? readFieldType(rawType) : "short_text";
  if (!type) {
    problems.push(`${where}: "${rawType}" is not a question type this platform renders.`);
    return null;
  }

  // Keys are ours, never the model's. The key is what an answer is stored
  // under, so it has to be stable and unique across the whole form; asking a
  // language model for stable identifiers invites collisions that would show up
  // as one question silently overwriting another's answer.
  const key = toKey(label, taken);
  taken.add(key);

  const field: FormField = { key, label: label.slice(0, 200), type };

  // Absent means required. An application form is mostly compulsory, and a
  // model listing optional questions says so; the preview shows every one.
  if (readBoolean(raw, true, "required", "isRequired", "mandatory")) field.required = true;

  const help = readString(raw, "helpText", "help_text", "help", "hint", "description");
  if (help) field.helpText = help.slice(0, 500);

  const placeholder = readString(raw, "placeholder", "example");
  if (placeholder) field.placeholder = placeholder.slice(0, 200);

  if (["radio", "score_list", "select", "single_choice"].includes(type)) {
    const options = readArray(raw, "options", "choices", "values")
      .map((entry) =>
        typeof entry === "string"
          ? entry.trim()
          : isRecord(entry)
            ? readString(entry, "label", "value", "text")
            : "",
      )
      .filter((entry) => entry !== "");

    const distinct = [...new Set(options)].slice(0, maxOptionsPerField);
    if (distinct.length === 0) {
      problems.push(`${where}: a "${type}" question needs at least one option to choose from.`);
      return null;
    }
    field.options = distinct;
  }

  if (type === "long_text") {
    const wordLimit = readNumber(raw, "wordLimit", "word_limit", "maxWords", "max_words");
    if (wordLimit) field.wordLimit = wordLimit;
  }

  const prefill = normaliseWord(readString(raw, "prefill", "prefillFrom", "prefill_from"));
  if (prefill === "email" || prefill === "name" || prefill === "phone") field.prefill = prefill;

  if (type === "file") {
    const accept = readArray(raw, "accept", "acceptedTypes", "accepted_types", "formats")
      .map((entry) => (typeof entry === "string" ? entry.trim().replace(/^\./, "").toLowerCase() : ""))
      .filter((entry) => /^[a-z0-9]{1,8}$/.test(entry));
    if (accept.length > 0) field.accept = [...new Set(accept)];
  }

  return field;
}

function readSection(
  raw: unknown,
  where: string,
  taken: Set<string>,
  problems: string[],
): FormSection | null {
  if (!isRecord(raw)) {
    problems.push(`${where}: a section must be an object.`);
    return null;
  }

  const fields = readArray(raw, "fields", "questions", "items")
    .map((entry, index) => readField(entry, `${where}, question ${index + 1}`, taken, problems))
    .filter((entry): entry is FormField => entry !== null);

  if (fields.length === 0) return null;

  const section: FormSection = { fields };
  const title = readString(raw, "title", "name", "heading");
  if (title) section.title = title.slice(0, 200);
  const description = readString(raw, "description", "subtitle", "help");
  if (description) section.description = description.slice(0, 500);
  return section;
}

function readStep(
  raw: unknown,
  index: number,
  where: string,
  taken: Set<string>,
  problems: string[],
): FormStep | null {
  if (!isRecord(raw)) {
    problems.push(`${where}: a page must be an object.`);
    return null;
  }

  const title = readString(raw, "title", "name", "heading", "step") || `Page ${index + 1}`;

  // A model given "sections inside pages" sometimes flattens it and hangs the
  // questions straight off the page. Both readings are obvious, so both work.
  const rawSections = readArray(raw, "sections", "groups");
  const sections =
    rawSections.length > 0
      ? rawSections
          .map((entry, sectionIndex) =>
            readSection(entry, `${where}, section ${sectionIndex + 1}`, taken, problems),
          )
          .filter((entry): entry is FormSection => entry !== null)
      : [readSection(raw, where, taken, problems)].filter(
          (entry): entry is FormSection => entry !== null,
        );

  if (sections.length === 0) return null;

  const step: FormStep = { key: toKey(title, taken), sections, title: title.slice(0, 200) };
  taken.add(step.key);

  const subtitle = readString(raw, "subtitle", "description", "intro");
  if (subtitle) step.subtitle = subtitle.slice(0, 500);
  if (readBoolean(raw, false, "optional", "isOptional")) step.optional = true;

  return step;
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

function readTestSpec(raw: Record<string, unknown>): ImportedTestSpec {
  const source = isRecord(raw.test) ? raw.test : isRecord(raw.spec) ? raw.spec : raw;
  const spec: ImportedTestSpec = {};

  const sections = readArray(source, "sections", "areas", "subjects")
    .map((entry) =>
      typeof entry === "string" ? entry.trim() : isRecord(entry) ? readString(entry, "name", "title") : "",
    )
    .filter((entry) => entry !== "")
    .slice(0, 12);
  if (sections.length > 0) spec.sections = sections;

  const questionCount = readNumber(source, "questionCount", "question_count", "questions", "totalQuestions");
  if (questionCount) spec.questionCount = questionCount;

  const durationMinutes = readNumber(source, "durationMinutes", "duration_minutes", "duration", "minutes");
  if (durationMinutes) spec.durationMinutes = durationMinutes;

  const negative = source.negativeMarking ?? source.negative_marking;
  if (typeof negative === "boolean") spec.negativeMarking = negative;

  return spec;
}

function describeTest(spec: ImportedTestSpec): string {
  const parts: string[] = [];
  if (spec.sections?.length) parts.push(spec.sections.join(", "));
  if (spec.questionCount) parts.push(`${spec.questionCount} questions`);
  if (spec.durationMinutes) parts.push(`${spec.durationMinutes} minutes`);
  if (spec.negativeMarking !== undefined) {
    parts.push(spec.negativeMarking ? "negative marking" : "no negative marking");
  }
  return parts.join(" · ");
}

function readRound(raw: unknown, index: number, problems: string[]): ImportedRound | null {
  const where = `Round ${index + 1}`;

  if (!isRecord(raw)) {
    problems.push(`${where}: a round must be an object.`);
    return null;
  }

  const name = readString(raw, "name", "title", "round", "label");
  if (!name) {
    problems.push(`${where}: give the round a name.`);
    return null;
  }
  if (name.length > roundNameMaxLength) {
    problems.push(`${where}: the name is longer than ${roundNameMaxLength} characters.`);
    return null;
  }

  const typeWord = readString(raw, "type", "submissionMode", "submission_mode", "mode", "kind");
  const resolved = typeWord ? readRoundType(typeWord) : null;
  if (typeWord && !resolved) {
    problems.push(`${where}: "${typeWord}" is not a round type this platform has.`);
    return null;
  }

  const notes: string[] = [];

  // A model asked for pages containing sections containing questions will
  // sometimes skip both wrappers and hang the questions off the round. That is
  // an unambiguous single-page form, so it is read as one rather than refused.
  const declaredSteps = readArray(raw, "pages", "steps", "sections", "form");
  const flatFields = readArray(raw, "fields", "questions");
  const rawSteps =
    declaredSteps.length > 0
      ? declaredSteps
      : flatFields.length > 0
        ? [{ questions: flatFields, title: "Page 1" }]
        : [];

  // With no type given, the shape decides: a round carrying pages is a form,
  // and one carrying nothing is something that happens elsewhere.
  const kind: RoundSubmissionMode | "test" =
    resolved ?? (rawSteps.length > 0 ? "form" : "offline");

  const prompt = readString(raw, "instructions", "prompt", "description", "brief", "summary");

  const opensAt = parseRoundDay(readString(raw, "opens", "opensAt", "opens_at", "startDate", "start_date"), "start");
  const dueAt = parseRoundDay(readString(raw, "due", "dueAt", "due_at", "deadline", "endDate", "end_date"), "end");

  if (opensAt === undefined || dueAt === undefined) {
    problems.push(`${where}: dates must be written as 2026-10-15, or left out.`);
    return null;
  }
  if (opensAt && dueAt && dueAt < opensAt) {
    problems.push(`${where}: the deadline falls before the opening date.`);
    return null;
  }
  if (!opensAt && !dueAt) notes.push("No dates in the document — set them yourself.");

  const requiresReview = readBoolean(
    raw,
    kind !== "form",
    "mentorReviews",
    "mentor_reviews",
    "requiresReview",
    "requires_review",
    "reviewed",
  );

  // The aptitude round. There is no question bank and no test engine, so the
  // honest thing is a round that holds its whole specification and says plainly
  // that it is not live yet -- rather than a form pretending to be a test, or a
  // silent omission that looks like the parser missed a page.
  if (kind === "test") {
    const test = readTestSpec(raw);
    const description = describeTest(test);
    const config: Record<string, unknown> = {
      prompt:
        (prompt ||
          "A timed aptitude test. Your mentor will tell you where to sit it.") +
        (description ? `\n\n${description}` : ""),
      pendingFeature: "test-engine",
      test,
    };

    notes.push("The test engine is not built, so this is created as a placeholder carrying its specification.");

    return {
      config,
      dueAt: dueAt ?? null,
      fieldCount: 0,
      name,
      notes,
      opensAt: opensAt ?? null,
      pending: true,
      requiresReview,
      spec: null,
      submissionMode: "offline",
    };
  }

  if (!prompt) {
    problems.push(`${where}: no instructions for the student. Every round needs them.`);
    return null;
  }
  if (prompt.length > roundPromptMaxLength) {
    problems.push(`${where}: the instructions are longer than ${roundPromptMaxLength} characters.`);
    return null;
  }

  if (kind !== "form") {
    if (rawSteps.length > 0) {
      notes.push(`Questions were given but a "${kind}" round has none, so they were left out.`);
    }
    return {
      config: { prompt },
      dueAt: dueAt ?? null,
      fieldCount: 0,
      name,
      notes,
      opensAt: opensAt ?? null,
      pending: false,
      requiresReview,
      spec: null,
      submissionMode: kind,
    };
  }

  // A form round from here on.
  const taken = new Set<string>();
  const steps = rawSteps
    .slice(0, maxStepsPerForm)
    .map((entry, stepIndex) => readStep(entry, stepIndex, `${where}, page ${stepIndex + 1}`, taken, problems))
    .filter((entry): entry is FormStep => entry !== null);

  if (rawSteps.length > maxStepsPerForm) {
    notes.push(`Only the first ${maxStepsPerForm} pages were taken.`);
  }

  if (steps.length === 0) {
    problems.push(`${where}: a form round needs at least one question.`);
    return null;
  }

  for (const step of steps) {
    const count = step.sections.reduce((total, section) => total + section.fields.length, 0);
    if (count > maxFieldsPerStep) {
      problems.push(`${where}: the page "${step.title}" has more than ${maxFieldsPerStep} questions.`);
      return null;
    }
  }

  const spec: FormSpec = { steps };

  // The same validation a hand-built form passes, run against a form a model
  // wrote. If this ever fails it is a defect in the normalisation above rather
  // than in the paste, but it is checked anyway: the alternative is a round
  // that the student renderer cannot parse, which it shows as an empty page.
  const specProblems = validateFormSpec(spec);
  if (specProblems.length > 0) {
    problems.push(`${where}: ${specProblems[0].message} (${specProblems[0].where})`);
    return null;
  }

  const fieldCount = steps.reduce(
    (total, step) => total + step.sections.reduce((sum, section) => sum + section.fields.length, 0),
    0,
  );

  return {
    config: { prompt, steps },
    dueAt: dueAt ?? null,
    fieldCount,
    name,
    notes,
    opensAt: opensAt ?? null,
    pending: false,
    requiresReview,
    spec,
    submissionMode: "form",
  };
}

// ---------------------------------------------------------------------------
// The whole paste
// ---------------------------------------------------------------------------

// Returns every problem it found rather than the first, for the same reason
// `validateFormSpec` does: an admin fixing a paste one error at a time is an
// admin who goes back to building rounds by hand.
export function parseImportedProcess(raw: string): ImportOutcome {
  const problems: string[] = [];
  const empty: ImportOutcome = { problems, programmeName: null, rounds: [] };

  const json = extractJsonBlock(raw);
  if (!json) {
    problems.push(
      "There is no JSON in what you pasted. Copy the model's whole answer, including the curly braces.",
    );
    return empty;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    // Worth saying which half failed. "Invalid JSON" sends an admin back to the
    // model; "you pasted the prompt" sends them to the right place.
    problems.push(
      "That is not valid JSON. It may have been cut off part way — copy the model's whole answer, from the first { to the last }, without editing it.",
    );
    return empty;
  }

  if (!isRecord(parsed)) {
    problems.push("The pasted JSON must be an object with a list of rounds.");
    return empty;
  }

  const rawRounds = readArray(parsed, "rounds", "steps", "process", "stages");
  if (rawRounds.length === 0) {
    problems.push("No rounds in the pasted JSON. The model should return a \"rounds\" list.");
    return empty;
  }
  if (rawRounds.length > maxRoundsPerImport) {
    problems.push(
      `That describes ${rawRounds.length} rounds, and an import takes at most ${maxRoundsPerImport}.`,
    );
    return empty;
  }

  const rounds = rawRounds
    .map((entry, index) => readRound(entry, index, problems))
    .filter((entry): entry is ImportedRound => entry !== null);

  // `ars_rounds_name_unique_per_course` would refuse these at the database, one
  // at a time, after the existing process had already been deleted. Catching it
  // here means the admin is told before anything is destroyed.
  const seen = new Set<string>();
  for (const round of rounds) {
    const key = round.name.toLowerCase();
    if (seen.has(key)) problems.push(`Two rounds are both called "${round.name}". Names must differ.`);
    seen.add(key);
  }

  if (problems.length > 0) return { problems, programmeName: null, rounds: [] };

  return {
    problems,
    programmeName: readString(parsed, "programme", "program", "process", "institution", "name") || null,
    rounds,
  };
}
