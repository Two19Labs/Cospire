// The mock document: a fixed plain-text template, parsed directly.
//
// **No model call.** A question ID has to match exactly and there is nothing in
// this template to interpret, so a model would add only the chance of a mistyped
// ID. Designed 2026-09-22; see *Question IDs and mock documents* in
// `docs/context/meetings.md`. The Client writes it in a Google Doc and pastes it:
//
//   Mock: CAT Full Length 3
//   Duration: 120
//   Negative marking: 1 on mcq, mcq_multi
//   Attempts: 1
//   Allow mobile: no
//   Proctoring: yes
//
//   Section: VARC | 40
//   Q00101, Q00102, Q00103
//   Section: DILR | 40
//   Q00210, Q00215
//
// Every refusal carries the line it is on, because "an ID does not exist" is
// useless against a 60-line document. The parser is pure: it never reads the
// database, so what it cannot know -- whether an ID exists, is archived, or is a
// DI child -- is settled in `queries/resolve-mock-document.ts`.
//
// Lenient about how a setting is written, strict about what it means: that is the
// same bargain `import-spec.ts` makes, and for the same reason. A lost zero in
// `Q0042` must not refuse a mock; a duration that does not add up must.

import { maxMockSections } from "./mock-form";
import { parseQuestionRef } from "./question-id";

// A plain document. 200k characters is far more than a mock paper's ID list and
// far less than something that should be reaching a parser at all.
export const maxMockDocumentLength = 200_000;

// A bound on how many questions one pasted document may name. A mock of 400
// questions does not exist; a paste of the whole bank does, by accident.
export const maxMockDocumentQuestions = 400;

export const negativeMarkingTypes = ["mcq", "mcq_multi", "numerical"] as const;
export type NegativeMarkingType = (typeof negativeMarkingTypes)[number];

// `tita` is what the question-import prompt and the Client both call a numerical
// answer, so the template accepts their word for it.
const negativeTypeAliases: Record<string, NegativeMarkingType> = {
  mcq: "mcq",
  mcq_multi: "mcq_multi",
  "mcq-multi": "mcq_multi",
  numerical: "numerical",
  tita: "numerical",
};

export interface MockDocumentRef {
  id: number;
  line: number;
  raw: string;
}

export interface MockDocumentSection {
  durationMinutes: number | null;
  line: number;
  refs: MockDocumentRef[];
  title: string;
}

export interface MockDocumentSpec {
  allowMobile: boolean;
  durationMinutes: number;
  maxAttempts: number;
  negativeMarking: number;
  negativeMarkingTypes: NegativeMarkingType[];
  proctoringEnabled: boolean;
  proctoringStated: boolean;
  sections: MockDocumentSection[];
  timingMode: "overall" | "sectional";
  title: string;
}

export interface MockDocumentParse {
  problems: string[];
  // Null whenever there is a problem: this importer is all or nothing, like
  // every other one here, so a half-read document never reaches a preview.
  spec: MockDocumentSpec | null;
}

const settingLabels = new Set(["mock", "duration", "negative marking", "attempts", "allow mobile", "proctoring"]);

function normaliseLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

function normaliseText(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

// "120", "120 minutes", "120 min". Anything else is null and becomes a refusal
// naming the line, never a silent default.
function readMinutes(raw: string): number | null {
  const match = normaliseText(raw).match(/^([0-9]{1,5})(?:\s*(?:minutes|minute|mins|min|m))?$/i);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return value >= 1 && value <= 1440 ? value : null;
}

function readYesNo(raw: string): boolean | null {
  const value = normaliseText(raw).toLowerCase();
  if (["yes", "y", "true", "on", "allowed", "enabled"].includes(value)) return true;
  if (["no", "n", "false", "off", "disallowed", "disabled"].includes(value)) return false;
  return null;
}

interface NegativeMarking {
  penalty: number;
  types: NegativeMarkingType[];
}

// "1 on mcq, mcq_multi", "0.25 on mcq", "1" (which takes the CAT default of the
// two MCQ types, per operating manual §13.1), and "none" / "0" for no penalty.
function readNegativeMarking(raw: string): NegativeMarking | string {
  const value = normaliseText(raw).toLowerCase();
  if (value === "" || value === "none" || value === "no" || value === "off") return { penalty: 0, types: [] };

  const match = value.match(/^([0-9]{1,3}(?:\.[0-9]{1,2})?)(?:\s*(?:on|for|applies to)\s*(.*))?$/);
  if (!match) return "read as a penalty, optionally followed by the question types it applies to, such as “1 on mcq, mcq_multi”";
  const penalty = Number(match[1]);
  if (!Number.isFinite(penalty) || penalty < 0 || penalty > 100) return "a penalty between 0 and 100";

  const listed = (match[2] ?? "").split(/[,;]|\band\b/).map((part) => part.trim().replace(/\s+/g, "_")).filter((part) => part !== "");
  if (listed.length === 0) {
    // The database refuses a penalty with no types at all, and silently
    // penalising nothing would be worse than defaulting to real CAT.
    return { penalty, types: penalty === 0 ? [] : ["mcq", "mcq_multi"] };
  }
  const types: NegativeMarkingType[] = [];
  for (const part of listed) {
    const type = negativeTypeAliases[part];
    if (!type) return `“${part}” is not a question type. Use mcq, mcq_multi or numerical`;
    if (!types.includes(type)) types.push(type);
  }
  if (penalty === 0) return { penalty: 0, types: [] };
  return { penalty, types };
}

export function parseMockDocument(text: string): MockDocumentParse {
  const problems: string[] = [];
  const at = (line: number, message: string) => problems.push(`Line ${line}: ${message}`);

  if (typeof text !== "string" || text.trim() === "") {
    return { problems: ["Paste the mock document first."], spec: null };
  }
  if (text.length > maxMockDocumentLength) {
    return { problems: [`That is longer than ${maxMockDocumentLength.toLocaleString()} characters, which no mock document is.`], spec: null };
  }

  let title: string | null = null;
  let durationMinutes: number | null = null;
  let maxAttempts: number | null = null;
  let allowMobile: boolean | null = null;
  let proctoringEnabled: boolean | null = null;
  let negative: NegativeMarking | null = null;
  const sections: MockDocumentSection[] = [];
  // Sections whose own line was refused. They are still pushed, so the IDs under
  // them have somewhere to go and the reader is not handed a second complaint
  // ("these IDs come before the first Section line", "the minutes do not add
  // up") caused by the first one. They are excluded from every later check, and
  // the document is refused regardless.
  const invalidSections = new Set<MockDocumentSection>();
  const seenRef = new Map<number, number>();
  let refCount = 0;

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = index + 1;
    const raw = lines[index];
    // Blank lines and a rule of dashes are layout, not content: a document
    // pasted out of a Google Doc carries both.
    if (raw.trim() === "" || /^[-=_\s]+$/.test(raw.trim())) continue;

    const labelled = raw.match(/^\s*([A-Za-z][A-Za-z ]{0,40}?)\s*:\s*(.*)$/);
    if (labelled) {
      const label = normaliseLabel(labelled[1]);
      const value = labelled[2];

      if (label === "section") {
        const [titlePart, ...rest] = value.split("|");
        const sectionTitle = normaliseText(titlePart);
        let invalid = false;
        if (sectionTitle === "" || sectionTitle.length > 100) {
          at(line, "give the section a name of at most 100 characters.");
          invalid = true;
        }
        const existing = sections.find((section) => section.title.toLowerCase() === sectionTitle.toLowerCase());
        if (existing) {
          at(line, `there is already a section called “${existing.title}”, on line ${existing.line}. Each section needs its own name.`);
          invalid = true;
        }
        let minutes: number | null = null;
        if (rest.length > 0) {
          minutes = readMinutes(rest.join("|"));
          if (minutes === null) {
            at(line, `“${normaliseText(rest.join("|"))}” is not a number of minutes. Write the section as “Section: VARC | 40”.`);
            invalid = true;
          }
        }
        const section: MockDocumentSection = { durationMinutes: minutes, line, refs: [], title: sectionTitle };
        sections.push(section);
        if (invalid) invalidSections.add(section);
        continue;
      }

      if (!settingLabels.has(label)) {
        at(line, `“${normaliseText(labelled[1])}” is not a setting this template understands. It reads Mock, Duration, Negative marking, Attempts, Allow mobile, Proctoring and Section.`);
        continue;
      }
      if (sections.length > 0) {
        at(line, `“${normaliseText(labelled[1])}” belongs above the first Section line.`);
        continue;
      }

      switch (label) {
        case "mock": {
          const value_ = normaliseText(value);
          if (title !== null) at(line, "the mock already has a title.");
          else if (value_ === "" || value_.length > 160) at(line, "give the mock a title of at most 160 characters.");
          else title = value_;
          break;
        }
        case "duration": {
          const minutes = readMinutes(value);
          if (durationMinutes !== null) at(line, "the duration is already set.");
          else if (minutes === null) at(line, `“${normaliseText(value)}” is not a duration. Write it in whole minutes, between 1 and 1440.`);
          else durationMinutes = minutes;
          break;
        }
        case "attempts": {
          const attempts = normaliseText(value).match(/^([0-9]{1,3})$/);
          const parsed = attempts ? Number.parseInt(attempts[1], 10) : NaN;
          if (maxAttempts !== null) at(line, "the attempt limit is already set.");
          else if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) at(line, `“${normaliseText(value)}” is not an attempt limit. Use a whole number between 1 and 100.`);
          else maxAttempts = parsed;
          break;
        }
        case "allow mobile": {
          const answer = readYesNo(value);
          if (allowMobile !== null) at(line, "whether phones are allowed is already set.");
          else if (answer === null) at(line, `“${normaliseText(value)}” is not yes or no.`);
          else allowMobile = answer;
          break;
        }
        case "proctoring": {
          const answer = readYesNo(value);
          if (proctoringEnabled !== null) at(line, "whether proctoring is on is already set.");
          else if (answer === null) at(line, `“${normaliseText(value)}” is not yes or no.`);
          else proctoringEnabled = answer;
          break;
        }
        default: {
          const read = readNegativeMarking(value);
          if (negative !== null) at(line, "negative marking is already set.");
          else if (typeof read === "string") at(line, `“${normaliseText(value)}” is not ${read}.`);
          else negative = read;
          break;
        }
      }
      continue;
    }

    // Not a labelled line, so it is a list of question IDs.
    if (sections.length === 0) {
      at(line, `“${normaliseText(raw).slice(0, 60)}” comes before the first Section line. Question IDs belong under a section.`);
      continue;
    }
    const section = sections[sections.length - 1];
    for (const token of normaliseText(raw).split(/[,;\s]+/)) {
      const cleaned = token.replace(/[.)\]]+$/, "");
      if (cleaned === "") continue;
      const id = parseQuestionRef(cleaned);
      if (id === null) {
        at(line, `“${cleaned.slice(0, 40)}” is not a question ID. They are written Q00042, as the question bank shows them.`);
        continue;
      }
      const firstSeen = seenRef.get(id);
      if (firstSeen !== undefined) {
        at(line, `Q${String(id).padStart(5, "0")} is already in this mock, on line ${firstSeen}. A question cannot appear twice.`);
        continue;
      }
      refCount += 1;
      if (refCount > maxMockDocumentQuestions) {
        at(line, `this document names more than ${maxMockDocumentQuestions} questions, which is more than one mock holds.`);
        continue;
      }
      seenRef.set(id, line);
      section.refs.push({ id, line, raw: cleaned });
    }
  }

  if (title === null) problems.push("Add a “Mock:” line naming the mock.");
  if (durationMinutes === null) problems.push("Add a “Duration:” line in whole minutes.");
  if (sections.length === 0) problems.push("Add at least one “Section:” line with the question IDs under it.");
  if (sections.length > maxMockSections) {
    problems.push(`A mock holds at most ${maxMockSections} sections; this document has ${sections.length}.`);
  }
  for (const section of sections) {
    if (invalidSections.has(section)) continue;
    if (section.refs.length === 0) at(section.line, `section “${section.title}” has no question IDs under it.`);
  }

  // Timing, decided exactly as the builder decides it: one section with no
  // minutes is the implicit untimed section and the mock is overall-timed;
  // otherwise every section is timed and the minutes add up to the duration.
  let timingMode: "overall" | "sectional" = "overall";
  const usable = sections.filter((section) => !invalidSections.has(section));
  const timed = usable.filter((section) => section.durationMinutes !== null);
  // Timing is only worth checking once every section line reads. A section that
  // was refused is a section the total cannot include, so "the minutes add up to
  // 30, not 60" would be an arithmetic complaint about a line already refused.
  if (usable.length > 0 && invalidSections.size === 0) {
    if (timed.length === 0) {
      if (usable.length > 1) {
        problems.push("With more than one section, every section needs its own minutes, written “Section: VARC | 40”.");
      }
    } else if (timed.length < usable.length) {
      for (const section of usable) {
        if (section.durationMinutes === null) at(section.line, `section “${section.title}” has no minutes, and the other sections do. Either every section is timed or none is.`);
      }
    } else {
      timingMode = "sectional";
      const total = timed.reduce((sum, section) => sum + (section.durationMinutes ?? 0), 0);
      if (durationMinutes !== null && total !== durationMinutes) {
        problems.push(`The section minutes add up to ${total}, not the ${durationMinutes} on the Duration line.`);
      }
    }
  }

  if (problems.length > 0 || title === null || durationMinutes === null) return { problems, spec: null };

  return {
    problems: [],
    spec: {
      allowMobile: allowMobile ?? true,
      durationMinutes,
      maxAttempts: maxAttempts ?? 1,
      negativeMarking: negative?.penalty ?? 0,
      negativeMarkingTypes: negative?.types ?? [],
      proctoringEnabled: proctoringEnabled ?? false,
      proctoringStated: proctoringEnabled !== null,
      sections,
      timingMode,
      title,
    },
  };
}

// The template itself, shown on the import screen so an admin never has to
// remember the shape. The parser's own limits are what it documents.
export const mockDocumentTemplate = `Mock: CAT Full Length 3
Duration: 120
Negative marking: 1 on mcq, mcq_multi
Attempts: 1
Allow mobile: no
Proctoring: yes

Section: VARC | 40
Q00101, Q00102, Q00103
Section: DILR | 40
Q00210, Q00215
Section: QA | 40
Q00301, Q00302`;
